import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Camera, Image as ImageIcon, RefreshCw, Share2, ShieldCheck, Palette, Loader2 } from 'lucide-react';
import { api } from '@/api/apiClient';
import { hapticFeedback, isNative } from '@/lib/capacitor';
import {
  HAIR_COLORS, loadHairSegmenter, setSegmenterMode, hairMaskOf, maskProbabilities, maskToAlpha, renderHairColor,
} from '@/lib/hairColor';

/**
 * « Nouvelle tête » : essayage de couleur de cheveux en direct (caméra frontale) ou sur une photo.
 * Détection des cheveux et rendu entièrement sur l'appareil, voir src/lib/hairColor.js.
 * Deux modes : caméra (flux vidéo analysé image par image) et photo (une analyse, puis
 * le changement de teinte / d'intensité redessine sans réanalyser).
 */

const PROC_WIDTH = 360;      // largeur d'analyse : le modèle travaille en basse résolution, inutile d'aller au-delà
const PHOTO_MAX_WIDTH = 1080; // largeur max du rendu photo (partage)
const DEFAULT_COLOR_ID = 'bleu';

function useOffscreenCanvas() {
  const ref = useRef(null);
  if (!ref.current && typeof document !== 'undefined') ref.current = document.createElement('canvas');
  return ref;
}

/** Charge un fichier image en tenant compte de l'orientation EXIF (photos de téléphone). */
async function loadImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* repli ci-dessous */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
const imageWidth = (img) => img.naturalWidth || img.width;
const imageHeight = (img) => img.naturalHeight || img.height;

export default function TryOn() {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [progress, setProgress] = useState('Préparation…');
  const [mode, setMode] = useState('camera');       // camera | photo
  const [color, setColor] = useState(() => HAIR_COLORS.find((c) => c.id === DEFAULT_COLOR_ID) || HAIR_COLORS[0]);
  const [strength, setStrength] = useState(0.85);
  const [captured, setCaptured] = useState(null);   // photo prise avec la caméra (data URL, déjà remise à l'endroit)
  const [photo, setPhoto] = useState(null);         // image choisie en mode photo
  const [analysing, setAnalysing] = useState(false);
  const [notice, setNotice] = useState('');
  const [shareHint, setShareHint] = useState(false);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const procCanvasRef = useOffscreenCanvas();
  const overlayCanvasRef = useOffscreenCanvas();
  const segmenterRef = useRef(null);
  const alphaRef = useRef(null);
  const maskDimsRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const streamRef = useRef(null);
  const colorRef = useRef(color);
  const strengthRef = useRef(strength);
  colorRef.current = color;
  strengthRef.current = strength;

  // Prestations de coloration : pré-sélection dans la réservation
  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });
  const colorServiceIds = services.filter((s) => /colo|m[èe]che|d[ée]colo|blond/i.test(s.name || '')).map((s) => s.id);
  const bookingHref = colorServiceIds.length > 0 ? `/booking?services=${colorServiceIds.join(',')}` : '/booking';

  // 1. Moteur + modèle (une fois par session)
  useEffect(() => {
    let cancelled = false;
    loadHairSegmenter((step) => setProgress(step === 'wasm' ? 'Chargement du moteur…' : 'Chargement du modèle…'))
      .then((segmenter) => { if (!cancelled) { segmenterRef.current = segmenter; setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, []);

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Boucle vidéo : analyse en basse résolution, rendu à la taille du flux
  const loop = useCallback(() => {
    if (!runningRef.current) return;
    rafRef.current = requestAnimationFrame(loop);
    const video = videoRef.current;
    const segmenter = segmenterRef.current;
    const canvas = canvasRef.current;
    const proc = procCanvasRef.current;
    if (!video || !segmenter || !canvas || !proc || video.readyState < 2 || busyRef.current) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    if (canvas.width !== vw || canvas.height !== vh) { canvas.width = vw; canvas.height = vh; }
    const pw = PROC_WIDTH;
    const ph = Math.round((pw * vh) / vw);
    if (proc.width !== pw || proc.height !== ph) { proc.width = pw; proc.height = ph; }
    proc.getContext('2d').drawImage(video, 0, 0, pw, ph);
    busyRef.current = true;
    try {
      segmenter.segmentForVideo(proc, performance.now(), (result) => {
        const mask = hairMaskOf(result);
        if (mask) {
          alphaRef.current = maskToAlpha(maskProbabilities(mask), alphaRef.current);
          maskDimsRef.current = { w: mask.width, h: mask.height };
        }
        renderHairColor({
          ctx: canvas.getContext('2d'), width: vw, height: vh, source: video,
          alpha: alphaRef.current, maskWidth: maskDimsRef.current.w, maskHeight: maskDimsRef.current.h,
          color: colorRef.current, strength: strengthRef.current, overlayCanvas: overlayCanvasRef.current,
        });
      });
    } catch {
      // image ignorée (le modèle bascule de mode, ou frame invalide)
    } finally {
      busyRef.current = false;
    }
  }, [procCanvasRef, overlayCanvasRef]);

  // 2. Caméra frontale quand le modèle est prêt, en mode caméra, hors capture
  useEffect(() => {
    if (status !== 'ready' || mode !== 'camera' || captured) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocamera');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        await setSegmenterMode(segmenterRef.current, 'VIDEO');
        if (cancelled) return;
        alphaRef.current = null;
        setNotice('');
        runningRef.current = true;
        loop();
      } catch (err) {
        if (cancelled) return;
        setMode('photo');
        setNotice(err?.name === 'NotAllowedError'
          ? 'Accès à la caméra refusé : essayez sur une photo.'
          : 'Caméra indisponible ici : essayez sur une photo.');
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [status, mode, captured, loop, stopCamera]);

  // Mode photo : analyse une fois, puis rendu à chaque changement de teinte / intensité
  const renderPhoto = useCallback((img) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const scale = Math.min(1, PHOTO_MAX_WIDTH / imageWidth(img));
    const w = Math.round(imageWidth(img) * scale);
    const h = Math.round(imageHeight(img) * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    renderHairColor({
      ctx: canvas.getContext('2d'), width: w, height: h, source: img,
      alpha: alphaRef.current, maskWidth: maskDimsRef.current.w, maskHeight: maskDimsRef.current.h,
      color: colorRef.current, strength: strengthRef.current, overlayCanvas: overlayCanvasRef.current,
    });
  }, [overlayCanvasRef]);

  const analysePhoto = useCallback(async (img) => {
    const segmenter = segmenterRef.current;
    const proc = procCanvasRef.current;
    if (!segmenter || !proc) return;
    setAnalysing(true);
    try {
      await setSegmenterMode(segmenter, 'IMAGE');
      const pw = PROC_WIDTH;
      const ph = Math.round((pw * imageHeight(img)) / imageWidth(img));
      proc.width = pw;
      proc.height = ph;
      proc.getContext('2d').drawImage(img, 0, 0, pw, ph);
      const result = segmenter.segment(proc);
      const mask = hairMaskOf(result);
      alphaRef.current = mask ? maskToAlpha(maskProbabilities(mask), null) : null;
      maskDimsRef.current = mask ? { w: mask.width, h: mask.height } : { w: 0, h: 0 };
      result.close?.();
      renderPhoto(img);
    } catch {
      setNotice("Impossible d'analyser cette photo.");
    } finally {
      setAnalysing(false);
    }
  }, [procCanvasRef, renderPhoto]);

  useEffect(() => {
    if (mode === 'photo' && photo && status === 'ready') renderPhoto(photo);
  }, [color, strength, mode, photo, status, renderPhoto]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const img = await loadImageFile(file);
      setCaptured(null);
      setPhoto(img);
      setNotice('');
      await analysePhoto(img);
    } catch {
      setNotice('Photo illisible.');
    }
  };

  const switchMode = (next) => {
    if (next === mode) return;
    hapticFeedback();
    setCaptured(null);
    setNotice('');
    setMode(next);
    if (next === 'photo' && !photo) setTimeout(() => fileInputRef.current?.click(), 50);
  };

  // Photo prise avec la caméra : le flux est en miroir à l'écran, on remet l'image à l'endroit
  const capture = () => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width) return;
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const c = tmp.getContext('2d');
    c.translate(tmp.width, 0);
    c.scale(-1, 1);
    c.drawImage(canvas, 0, 0);
    stopCamera();
    setCaptured(tmp.toDataURL('image/jpeg', 0.92));
    hapticFeedback();
  };

  const shareImage = async () => {
    const dataUrl = captured || canvasRef.current?.toDataURL('image/jpeg', 0.92);
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'nouvelle-tete-dhomebarber.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Ma nouvelle tête · D'Home Barber" });
        return;
      }
    } catch {
      return; // partage annulé
    }
    if (!isNative) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'nouvelle-tete-dhomebarber.jpg';
      a.click();
    } else {
      setShareHint(true);
    }
  };

  const showCanvas = !captured;
  const cameraLive = status === 'ready' && mode === 'camera' && !captured;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full blur-[110px] opacity-40"
          style={{ background: `radial-gradient(circle, ${color.hex}55 0%, transparent 70%)`, transition: 'background 0.6s' }} />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-6 pb-28">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> Retour
          </Link>
          {/* Caméra / Photo */}
          <div className="flex items-center rounded-full glass p-0.5 text-xs font-semibold">
            {[['camera', Camera, 'Caméra'], ['photo', ImageIcon, 'Photo']].map(([id, Icon, label]) => (
              <button key={id} type="button" onClick={() => switchMode(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${mode === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] uppercase tracking-[0.3em] text-primary/70 font-medium mb-1 flex items-center gap-2">
          <Palette className="w-3 h-3" /> Nouvelle tête
        </p>
        <h1 className="font-display text-2xl font-bold text-foreground">Essayez une couleur</h1>
        <p className="text-xs text-muted-foreground mt-1 mb-4">En direct sur vous. Tout se passe sur votre téléphone, rien n'est envoyé.</p>

        {/* Scène */}
        <div className="relative rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl" style={{ aspectRatio: '3 / 4' }}>
          <video ref={videoRef} playsInline muted autoPlay className="hidden" />
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full object-cover ${showCanvas ? '' : 'invisible'}`}
            style={{ transform: mode === 'camera' ? 'scaleX(-1)' : 'none' }}
          />
          {captured && <img src={captured} alt="Votre nouvelle tête" className="absolute inset-0 w-full h-full object-cover" />}

          {/* Chargement du modèle */}
          {status === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8 bg-black/60">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-white/90 font-medium">{progress}</p>
              <p className="text-[11px] text-white/50">Une seule fois, ensuite c'est instantané</p>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8 bg-black/70">
              <p className="text-sm text-white/90">Impossible de charger l'essayage.</p>
              <p className="text-[11px] text-white/50">Vérifiez votre connexion puis réessayez.</p>
              <button type="button" onClick={() => window.location.reload()} className="mt-1 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Réessayer</button>
            </div>
          )}

          {/* Mode photo sans photo : invitation */}
          {status === 'ready' && mode === 'photo' && !photo && (
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8 bg-gradient-to-b from-white/5 to-black/40">
              <span className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                <ImageIcon className="w-7 h-7 text-primary" />
              </span>
              <span className="text-sm font-semibold text-white">Choisir une photo</span>
              <span className="text-[11px] text-white/50">De face, cheveux bien visibles</span>
            </button>
          )}
          {analysing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            </div>
          )}

          {notice && (
            <p className="absolute top-3 left-3 right-3 text-center text-[11px] text-white bg-black/60 backdrop-blur rounded-xl px-3 py-2">{notice}</p>
          )}
          {shareHint && (
            <p className="absolute top-3 left-3 right-3 text-center text-[11px] text-white bg-black/60 backdrop-blur rounded-xl px-3 py-2">
              Maintenez l'image appuyée pour l'enregistrer
            </p>
          )}

          {/* Déclencheur */}
          {cameraLive && (
            <motion.button
              type="button"
              onClick={capture}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              aria-label="Prendre la photo"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white/95 border-4 border-white/40 shadow-xl"
            />
          )}
          {/* Actions après capture ou sur photo */}
          {status === 'ready' && (captured || (mode === 'photo' && photo)) && !analysing && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center gap-2">
              <button type="button"
                onClick={() => { setShareHint(false); if (captured) setCaptured(null); else fileInputRef.current?.click(); }}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-black/60 backdrop-blur text-white text-xs font-semibold border border-white/15">
                <RefreshCw className="w-3.5 h-3.5" /> {captured ? 'Reprendre' : 'Autre photo'}
              </button>
              <button type="button" onClick={shareImage}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/30">
                <Share2 className="w-3.5 h-3.5" /> Partager
              </button>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        {/* Teintes */}
        <div className="mt-4 -mx-4 px-4 flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {HAIR_COLORS.map((c) => {
            const active = c.id === color.id;
            return (
              <button key={c.id} type="button" onClick={() => { setColor(c); hapticFeedback(); }} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
                <motion.span
                  animate={{ scale: active ? 1.12 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className={`w-11 h-11 rounded-full border-2 ${active ? 'border-primary shadow-lg shadow-primary/40' : 'border-white/15'}`}
                  style={{ background: `radial-gradient(circle at 35% 30%, #ffffff55, transparent 45%), ${c.hex}` }}
                />
                <span className={`text-[10px] leading-tight text-center ${active ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{c.name}</span>
              </button>
            );
          })}
        </div>

        {/* Intensité */}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-16">Intensité</span>
          <input type="range" min="0" max="100" value={Math.round(strength * 100)}
            onChange={(e) => setStrength(Number(e.target.value) / 100)}
            className="flex-1 accent-primary" aria-label="Intensité de la couleur" />
          <span className="text-xs tabular-nums w-10 text-right text-foreground/80">{Math.round(strength * 100)} %</span>
        </div>

        {/* Réservation */}
        <Link to={bookingHref} className="orbit-wrap rounded-2xl block mt-5 shadow-lg shadow-primary/25">
          <motion.span whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            className="flex items-center justify-center gap-2 h-12 rounded-[14px] bg-primary text-primary-foreground font-semibold text-sm">
            <Palette className="w-4 h-4" /> Réserver une coloration
          </motion.span>
        </Link>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-3 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3 h-3" /> Analyse sur l'appareil, aucune image envoyée
        </p>
      </div>
    </div>
  );
}
