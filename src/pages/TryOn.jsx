import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft, Camera, Image as ImageIcon, RefreshCw, Share2, ShieldCheck, Palette, Loader2, Sparkles, SlidersHorizontal, Columns2, Wand2,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { hapticFeedback, isNative } from '@/lib/capacitor';
import {
  HAIR_COLORS, makeColor, loadModels, setModelsMode, hairMaskOf, maskProbabilities, maskToAlpha,
  computeBeardAlpha, computeRootsAlpha, subtractZone, meanLuminance, renderHairColor2D,
} from '@/lib/hairColor';
import { createHairRenderer } from '@/lib/hairGl';
import { hairUltraAvailable, requestHairUltra } from '@/lib/hairUltra';
import { snapConfig } from '@/lib/snapLenses';

/**
 * « Nouvelle tête » : essayage de couleur de cheveux et de barbe.
 * - FAST : temps réel sur l'appareil (caméra ou photo), rendu Oklab par shader (hairGl.js),
 *   réglages intensité / saturation / luminosité / racines / cheveux gris, avant / après.
 * - AI ULTRA : traitement haute qualité côté serveur (segmentation HD + édition générative
 *   limitée aux cheveux / barbe), voir lib/hairUltra.js. Visible seulement si activé côté serveur.
 */

const PROC_WIDTH = 360;
const PHOTO_MAX_WIDTH = 1080;
const ULTRA_MAX_SIDE = 1536;
const DEFAULT_COLOR_ID = 'bleu';
const TARGETS = [
  { id: 'hair', label: 'Cheveux' },
  { id: 'beard', label: 'Barbe' },
  { id: 'both', label: 'Les deux' },
];
const PROGRESS_LABELS = { wasm: 'Chargement du moteur…', hair: 'Modèle cheveux…', face: 'Modèle visage…' };
const DEFAULT_ADJ = { strength: 0.9, saturation: 1, brightness: 0, roots: 0, gray: 0 };
const SLIDERS = [
  { key: 'strength', label: 'Intensité', min: 0, max: 100, toValue: (v) => v / 100, fromValue: (v) => Math.round(v * 100), unit: '%' },
  { key: 'saturation', label: 'Saturation', min: 40, max: 160, toValue: (v) => v / 100, fromValue: (v) => Math.round(v * 100), unit: '%' },
  { key: 'brightness', label: 'Luminosité', min: -25, max: 25, toValue: (v) => v / 100, fromValue: (v) => Math.round(v * 100), unit: '', signed: true },
  { key: 'roots', label: 'Racines', min: 0, max: 100, toValue: (v) => v / 100, fromValue: (v) => Math.round(v * 100), unit: '%' },
  { key: 'gray', label: 'Cheveux gris', min: 0, max: 100, toValue: (v) => v / 100, fromValue: (v) => Math.round(v * 100), unit: '%' },
];
const ULTRA_STAGES = [
  [0, 'Envoi de la photo…'],
  [1500, 'Segmentation HD des cheveux et de la barbe…'],
  [6000, 'Coloration photoréaliste…'],
  [16000, 'Fusion : chaque poil de l\'original est conservé…'],
];

function useOffscreenCanvas() {
  const ref = useRef(null);
  if (!ref.current && typeof document !== 'undefined') ref.current = document.createElement('canvas');
  return ref;
}

async function loadImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* repli */ }
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

/** JPEG (data URL) d'une source image / canvas, côté max borné, optionnellement en miroir. */
function toJpegDataUrl(source, maxSide, mirror = false) {
  const sw = source.videoWidth || imageWidth(source);
  const sh = source.videoHeight || imageHeight(source);
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  const ctx = c.getContext('2d');
  if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

export default function TryOn() {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState('loading');
  const [progress, setProgress] = useState('Préparation…');
  const [mode, setMode] = useState('camera');
  const [target, setTarget] = useState('hair');
  const [color, setColor] = useState(() => HAIR_COLORS.find((c) => c.id === DEFAULT_COLOR_ID) || HAIR_COLORS[0]);
  const [customHex, setCustomHex] = useState('#8e44ad');
  const [adj, setAdj] = useState(DEFAULT_ADJ);
  const [showSettings, setShowSettings] = useState(false);
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [holding, setHolding] = useState(false);
  const [captured, setCaptured] = useState(null);          // rendu FAST capturé (data URL)
  const [capturedOriginal, setCapturedOriginal] = useState(null); // image brute correspondante
  const [photo, setPhoto] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [notice, setNotice] = useState('');
  const [faceMissing, setFaceMissing] = useState(false);
  const [shareHint, setShareHint] = useState(false);
  const [ultraAvailable, setUltraAvailable] = useState(false);
  const [snapAvailable, setSnapAvailable] = useState(false);
  const [ultra, setUltra] = useState({ status: 'idle', stage: '', result: null, original: null, error: '' });

  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const colorInputRef = useRef(null);
  const procCanvasRef = useOffscreenCanvas();
  const scratchCanvasRef = useOffscreenCanvas();
  const rootsCanvasRef = useOffscreenCanvas();
  const overlayCanvasRef = useOffscreenCanvas();
  const modelsRef = useRef(null);
  const rendererRef = useRef(null);
  const hairAlphaRef = useRef(null);
  const beardAlphaRef = useRef(null);
  const rootsAlphaRef = useRef(null);
  const maskDimsRef = useRef({ w: 0, h: 0 });
  const meansRef = useRef({ hair: null, beard: null });
  const faceSeenAtRef = useRef(0);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const streamRef = useRef(null);
  const colorRef = useRef(color);
  const targetRef = useRef(target);
  const adjRef = useRef(adj);
  const splitRef = useRef(0);
  const ultraTimersRef = useRef([]);
  colorRef.current = color;
  targetRef.current = target;
  adjRef.current = adj;
  splitRef.current = holding ? 1 : compare ? split : 0;

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });
  const colorServiceIds = services.filter((s) => /colo|m[èe]che|d[ée]colo|blond/i.test(s.name || '')).map((s) => s.id);
  const bookingHref = colorServiceIds.length > 0 ? `/booking?services=${colorServiceIds.join(',')}` : '/booking';

  useEffect(() => { hairUltraAvailable().then(setUltraAvailable); snapConfig().then((c) => setSnapAvailable(!!c)); }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    rendererRef.current = createHairRenderer(canvas);
    return () => { rendererRef.current?.destroy(); rendererRef.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadModels((step) => setProgress(PROGRESS_LABELS[step] || 'Chargement…'))
      .then((models) => { if (!cancelled) { modelsRef.current = models; setStatus('ready'); } })
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

  /** Analyse basse résolution : masques cheveux, barbe, racines et clartés moyennes. */
  const analyse = useCallback((source, sw, sh, timestamp, isVideo) => {
    const models = modelsRef.current;
    const proc = procCanvasRef.current;
    if (!models || !proc) return;
    const pw = PROC_WIDTH;
    const ph = Math.round((pw * sh) / sw);
    if (proc.width !== pw || proc.height !== ph) { proc.width = pw; proc.height = ph; }
    const pctx = proc.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(source, 0, 0, pw, ph);
    const pixels = pctx.getImageData(0, 0, pw, ph).data;

    const onHair = (result) => {
      const mask = hairMaskOf(result);
      if (mask) hairAlphaRef.current = maskToAlpha(maskProbabilities(mask), isVideo ? hairAlphaRef.current : null);
    };
    if (isVideo) {
      models.segmenter.segmentForVideo(proc, timestamp, onHair);
    } else {
      const result = models.segmenter.segment(proc);
      onHair(result);
      result.close?.();
    }

    let landmarks = null;
    if (models.landmarker) {
      try {
        const faces = isVideo ? models.landmarker.detectForVideo(proc, timestamp) : models.landmarker.detect(proc);
        landmarks = faces?.faceLandmarks?.[0] || null;
      } catch { landmarks = null; }
    }
    const beard = computeBeardAlpha({ landmarks, pixels, w: pw, h: ph, scratch: scratchCanvasRef.current, prev: isVideo ? beardAlphaRef.current : null });
    beardAlphaRef.current = beard.alpha;
    const hairOk = hairAlphaRef.current && hairAlphaRef.current.length === pw * ph;
    if (beard.zone && hairOk) subtractZone(hairAlphaRef.current, beard.zone);
    rootsAlphaRef.current = hairOk ? computeRootsAlpha({ landmarks, hairAlpha: hairAlphaRef.current, w: pw, h: ph, scratch: rootsCanvasRef.current }) : null;
    if (landmarks) faceSeenAtRef.current = Date.now();

    maskDimsRef.current = { w: pw, h: ph };
    meansRef.current = {
      hair: meanLuminance(pixels, hairOk ? hairAlphaRef.current : null),
      beard: meanLuminance(pixels, beardAlphaRef.current),
    };
  }, [procCanvasRef, scratchCanvasRef, rootsCanvasRef]);

  const draw = useCallback((source, w, h, mirror) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const t = targetRef.current;
    const hairOn = t !== 'beard';
    const beardOn = t !== 'hair';
    const { w: mw, h: mh } = maskDimsRef.current;
    const ok = (a) => (a && a.length === mw * mh ? a : null);
    const a = adjRef.current;
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.render({
        source, width: w, height: h, hairAlpha: ok(hairAlphaRef.current), beardAlpha: ok(beardAlphaRef.current), rootsAlpha: ok(rootsAlphaRef.current),
        maskWidth: mw, maskHeight: mh, color: colorRef.current, hairOn, beardOn,
        hairMeanL: meansRef.current.hair, beardMeanL: meansRef.current.beard,
        strength: a.strength, saturation: a.saturation, brightness: a.brightness, roots: a.roots, gray: a.gray,
        split: splitRef.current, mirror,
      });
    } else {
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      renderHairColor2D({
        ctx: canvas.getContext('2d'), width: w, height: h, source,
        alphas: [hairOn ? ok(hairAlphaRef.current) : null, beardOn ? ok(beardAlphaRef.current) : null], maskWidth: mw, maskHeight: mh,
        color: colorRef.current, strength: splitRef.current >= 1 ? 0 : a.strength, overlayCanvas: overlayCanvasRef.current,
      });
    }
  }, [overlayCanvasRef]);

  const loop = useCallback(() => {
    if (!runningRef.current) return;
    rafRef.current = requestAnimationFrame(loop);
    const video = videoRef.current;
    if (!video || video.readyState < 2 || busyRef.current) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    busyRef.current = true;
    try {
      analyse(video, vw, vh, performance.now(), true);
      draw(video, vw, vh, true);
      const missing = targetRef.current !== 'hair' && Date.now() - faceSeenAtRef.current > 1500;
      setFaceMissing((prev) => (prev === missing ? prev : missing));
    } catch { /* image ignorée */ } finally { busyRef.current = false; }
  }, [analyse, draw]);

  useEffect(() => {
    if (status !== 'ready' || mode !== 'camera' || captured || ultra.status === 'done') return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocamera');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        await setModelsMode(modelsRef.current, 'VIDEO');
        if (cancelled) return;
        hairAlphaRef.current = null;
        beardAlphaRef.current = null;
        rootsAlphaRef.current = null;
        faceSeenAtRef.current = Date.now();
        setNotice('');
        runningRef.current = true;
        loop();
      } catch (err) {
        if (cancelled) return;
        setMode('photo');
        setNotice(err?.name === 'NotAllowedError' ? 'Accès à la caméra refusé : essayez sur une photo.' : 'Caméra indisponible ici : essayez sur une photo.');
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [status, mode, captured, ultra.status, loop, stopCamera]);

  const renderPhoto = useCallback((img) => {
    if (!img) return;
    const scale = Math.min(1, PHOTO_MAX_WIDTH / imageWidth(img));
    draw(img, Math.round(imageWidth(img) * scale), Math.round(imageHeight(img) * scale), false);
  }, [draw]);

  const analysePhoto = useCallback(async (img) => {
    if (!modelsRef.current) return;
    setAnalysing(true);
    try {
      await setModelsMode(modelsRef.current, 'IMAGE');
      hairAlphaRef.current = null;
      beardAlphaRef.current = null;
      rootsAlphaRef.current = null;
      analyse(img, imageWidth(img), imageHeight(img), 0, false);
      setFaceMissing(Date.now() - faceSeenAtRef.current > 1500);
      renderPhoto(img);
    } catch {
      setNotice("Impossible d'analyser cette photo.");
    } finally {
      setAnalysing(false);
    }
  }, [analyse, renderPhoto]);

  // Photo : rendu à chaque réglage ; capture caméra : le rendu figé suit aussi les réglages
  useEffect(() => {
    if (status !== 'ready') return;
    if (mode === 'photo' && photo) renderPhoto(photo);
  }, [color, adj, target, split, compare, holding, mode, photo, status, renderPhoto]);

  useEffect(() => () => { stopCamera(); ultraTimersRef.current.forEach(clearTimeout); }, [stopCamera]);

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const img = await loadImageFile(file);
      setCaptured(null);
      setCapturedOriginal(null);
      setUltra({ status: 'idle', stage: '', result: null, original: null, error: '' });
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
    setCapturedOriginal(null);
    setUltra({ status: 'idle', stage: '', result: null, original: null, error: '' });
    setNotice('');
    setMode(next);
    if (next === 'photo' && !photo) setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const capture = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !canvas.width || !video) return;
    const original = toJpegDataUrl(video, ULTRA_MAX_SIDE, true);
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const c = tmp.getContext('2d');
    c.translate(tmp.width, 0);
    c.scale(-1, 1);
    c.drawImage(canvas, 0, 0);
    stopCamera();
    setCapturedOriginal(original);
    setCaptured(tmp.toDataURL('image/jpeg', 0.92));
    hapticFeedback();
  };

  const currentImageDataUrl = () => {
    if (ultra.status === 'done' && ultra.result) return ultra.result;
    if (captured) return captured;
    return canvasRef.current?.toDataURL('image/jpeg', 0.92) || null;
  };

  const shareImage = async () => {
    const dataUrl = currentImageDataUrl();
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'nouvelle-tete-dhomebarber.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Ma nouvelle tête · D'Home Barber" });
        return;
      }
    } catch { return; }
    if (!isNative) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'nouvelle-tete-dhomebarber.jpg';
      a.click();
    } else {
      setShareHint(true);
    }
  };

  // ---- AI ULTRA
  const runUltra = async () => {
    const original = captured ? capturedOriginal : photo ? toJpegDataUrl(photo, ULTRA_MAX_SIDE) : null;
    if (!original) { setNotice('Prenez une photo ou choisissez-en une pour AI ULTRA.'); return; }
    hapticFeedback();
    ultraTimersRef.current.forEach(clearTimeout);
    setUltra({ status: 'running', stage: ULTRA_STAGES[0][1], result: null, original, error: '' });
    ultraTimersRef.current = ULTRA_STAGES.slice(1).map(([delay, label]) => setTimeout(() => {
      setUltra((u) => (u.status === 'running' ? { ...u, stage: label } : u));
    }, delay));
    try {
      const data = await requestHairUltra({ imageDataUrl: original, target, color, params: { intensity: adj.strength, roots: adj.roots, gray: adj.gray } });
      ultraTimersRef.current.forEach(clearTimeout);
      setUltra({ status: 'done', stage: '', result: data.image, original, error: '' });
      setCompare(true);
      setSplit(0.5);
      hapticFeedback();
    } catch (err) {
      ultraTimersRef.current.forEach(clearTimeout);
      const msg = err?.code === 'not_configured' ? "AI ULTRA n'est pas encore activé sur ce salon."
        : err?.code === 'rate_limited' ? "Trop d'essais AI ULTRA, réessayez dans une heure."
          : err?.code === 'no_zone' ? 'Aucune zone cheveux ou barbe détectée sur cette photo.'
            : 'Le traitement AI ULTRA a échoué, réessayez.';
      setUltra({ status: 'error', stage: '', result: null, original: null, error: msg });
    }
  };
  const leaveUltra = () => {
    setUltra({ status: 'idle', stage: '', result: null, original: null, error: '' });
    setCompare(false);
  };

  // ---- Avant / après : curseur ou maintien
  const splitFromEvent = (e) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSplit(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };
  const onScenePointerDown = (e) => {
    if (e.target.closest('button, input')) return;
    if (compare) { splitFromEvent(e); e.currentTarget.setPointerCapture?.(e.pointerId); return; }
    if (status === 'ready' && ultra.status !== 'running') setHolding(true);
  };
  const onScenePointerMove = (e) => { if (compare && e.buttons > 0) splitFromEvent(e); };
  const onScenePointerUp = () => setHolding(false);

  const selectCustom = (hex) => {
    setCustomHex(hex);
    setColor(makeColor({ id: 'custom', name: 'Personnalisée', hex }));
  };

  const cameraLive = status === 'ready' && mode === 'camera' && !captured && ultra.status !== 'done';
  const beardTargeted = target !== 'hair';
  const hasImage = !!captured || (mode === 'photo' && !!photo);
  const showUltraResult = ultra.status === 'done' && ultra.result;
  const displaySplit = holding ? 1 : compare ? split : 0;

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
        <p className="text-xs text-muted-foreground mt-1 mb-4">Cheveux ou barbe, en direct. Maintenez l'image pour voir l'original.</p>

        {/* Scène */}
        <div
          ref={sceneRef}
          className="relative rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl select-none"
          style={{ aspectRatio: '3 / 4', touchAction: compare ? 'none' : 'manipulation' }}
          onPointerDown={onScenePointerDown}
          onPointerMove={onScenePointerMove}
          onPointerUp={onScenePointerUp}
          onPointerCancel={onScenePointerUp}
          onPointerLeave={onScenePointerUp}
        >
          <video ref={videoRef} playsInline muted autoPlay className="hidden" />
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full object-cover ${captured || showUltraResult ? 'invisible' : ''}`}
            style={{ transform: mode === 'camera' ? 'scaleX(-1)' : 'none' }}
          />
          {captured && !showUltraResult && (
            <>
              <img src={captured} alt="Votre nouvelle tête" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
              {(holding || compare) && capturedOriginal && (
                <img src={capturedOriginal} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover"
                  style={{ clipPath: `inset(0 ${(1 - displaySplit) * 100}% 0 0)` }} />
              )}
            </>
          )}
          {showUltraResult && (
            <>
              <img src={ultra.result} alt="Résultat AI ULTRA" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
              <img src={ultra.original} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover"
                style={{ clipPath: `inset(0 ${(1 - displaySplit) * 100}% 0 0)` }} />
              <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tracking-wider">
                <Sparkles className="w-3 h-3" /> AI ULTRA
              </span>
            </>
          )}

          {/* Curseur avant / après */}
          {compare && (showUltraResult || captured || (mode === 'photo' && photo) || cameraLive) && (
            <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${displaySplit * 100}%` }}>
              <div className="absolute inset-y-0 -left-px w-0.5 bg-white/90 shadow" />
              <div className="absolute top-1/2 -translate-y-1/2 -left-4 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                <Columns2 className="w-4 h-4 text-black" />
              </div>
              <span className="absolute top-3 -left-12 text-[10px] uppercase tracking-widest text-white/80 bg-black/50 px-1.5 py-0.5 rounded">Avant</span>
              <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest text-white/80 bg-black/50 px-1.5 py-0.5 rounded">Après</span>
            </div>
          )}
          {holding && !compare && (
            <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest text-white bg-black/60 px-2 py-1 rounded-lg">Original</span>
          )}

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
          {status === 'ready' && mode === 'photo' && !photo && (
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8 bg-gradient-to-b from-white/5 to-black/40">
              <span className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                <ImageIcon className="w-7 h-7 text-primary" />
              </span>
              <span className="text-sm font-semibold text-white">Choisir une photo</span>
              <span className="text-[11px] text-white/50">De face, cheveux et barbe bien visibles</span>
            </button>
          )}
          {(analysing || ultra.status === 'running') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8 bg-black/55 backdrop-blur-sm">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              {ultra.status === 'running' && (
                <>
                  <p className="text-sm text-white font-semibold flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" /> AI ULTRA</p>
                  <p className="text-xs text-white/70">{ultra.stage}</p>
                  <p className="text-[10px] text-white/40">Environ 20 secondes</p>
                </>
              )}
            </div>
          )}

          {(notice || shareHint || ultra.error || (beardTargeted && faceMissing && status === 'ready' && (cameraLive || photo))) && (
            <p className="absolute top-3 left-3 right-3 text-center text-[11px] text-white bg-black/60 backdrop-blur rounded-xl px-3 py-2">
              {notice || ultra.error || (shareHint ? "Maintenez l'image appuyée pour l'enregistrer" : 'Visage non détecté : placez-vous bien de face pour la barbe')}
            </p>
          )}

          {cameraLive && !compare && (
            <motion.button type="button" onClick={capture} whileTap={reduceMotion ? undefined : { scale: 0.9 }} aria-label="Prendre la photo"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white/95 border-4 border-white/40 shadow-xl" />
          )}
          {status === 'ready' && hasImage && !analysing && ultra.status !== 'running' && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center gap-2">
              <button type="button"
                onClick={() => { setShareHint(false); if (showUltraResult) { leaveUltra(); return; } if (captured) { setCaptured(null); setCapturedOriginal(null); } else fileInputRef.current?.click(); }}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-black/60 backdrop-blur text-white text-xs font-semibold border border-white/15">
                <RefreshCw className="w-3.5 h-3.5" /> {showUltraResult ? 'Retour au direct' : captured ? 'Reprendre' : 'Autre photo'}
              </button>
              <button type="button" onClick={shareImage}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/30">
                <Share2 className="w-3.5 h-3.5" /> Partager
              </button>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        {/* Cible */}
        <div className="mt-4 flex items-center rounded-2xl glass p-1 text-xs font-semibold">
          {TARGETS.map((t) => (
            <button key={t.id} type="button" onClick={() => { setTarget(t.id); hapticFeedback(); }}
              className={`flex-1 h-9 rounded-xl transition-colors ${target === t.id ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' : 'text-muted-foreground'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Teintes + couleur personnalisée */}
        <div className="mt-4 -mx-4 px-4 flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          <button type="button" onClick={() => colorInputRef.current?.click()} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
            <motion.span animate={{ scale: color.id === 'custom' ? 1.12 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className={`w-11 h-11 rounded-full border-2 flex items-center justify-center ${color.id === 'custom' ? 'border-primary shadow-lg shadow-primary/40' : 'border-white/15'}`}
              style={{ background: color.id === 'custom' ? customHex : 'conic-gradient(from 0deg, #e0529b, #d8ae5a, #1f8a5b, #1e88e5, #7b3fbf, #e0529b)' }}>
              {color.id !== 'custom' && <Palette className="w-4 h-4 text-white drop-shadow" />}
            </motion.span>
            <span className={`text-[10px] leading-tight text-center ${color.id === 'custom' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>Personnalisée</span>
            <input ref={colorInputRef} type="color" value={customHex} onChange={(e) => selectCustom(e.target.value)} className="sr-only" aria-label="Couleur personnalisée" />
          </button>
          {HAIR_COLORS.map((c) => {
            const active = c.id === color.id;
            return (
              <button key={c.id} type="button" onClick={() => { setColor(c); hapticFeedback(); }} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
                <motion.span animate={{ scale: active ? 1.12 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className={`w-11 h-11 rounded-full border-2 ${active ? 'border-primary shadow-lg shadow-primary/40' : 'border-white/15'}`}
                  style={{ background: `radial-gradient(circle at 35% 30%, #ffffff55, transparent 45%), ${c.hex}` }} />
                <span className={`text-[10px] leading-tight text-center ${active ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{c.name}</span>
              </button>
            );
          })}
        </div>

        {/* Réglages et comparaison */}
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => setShowSettings((v) => !v)}
            className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-xs font-semibold transition-colors ${showSettings ? 'bg-primary/15 text-primary border border-primary/30' : 'glass text-muted-foreground'}`}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Réglages
          </button>
          <button type="button" onClick={() => { setCompare((v) => !v); hapticFeedback(); }}
            className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-xs font-semibold transition-colors ${compare ? 'bg-primary/15 text-primary border border-primary/30' : 'glass text-muted-foreground'}`}>
            <Columns2 className="w-3.5 h-3.5" /> Avant / après
          </button>
        </div>
        <AnimatePresence initial={false}>
          {showSettings && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 glass rounded-2xl p-3 space-y-2.5">
                {SLIDERS.map((s) => {
                  const v = s.fromValue(adj[s.key]);
                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-24">{s.label}</span>
                      <input type="range" min={s.min} max={s.max} value={v} aria-label={s.label}
                        onChange={(e) => setAdj((a) => ({ ...a, [s.key]: s.toValue(Number(e.target.value)) }))}
                        className="flex-1 accent-primary" />
                      <span className="text-xs tabular-nums w-12 text-right text-foreground/80">{s.signed && v > 0 ? '+' : ''}{v}{s.unit}</span>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setAdj(DEFAULT_ADJ)} className="text-[11px] text-muted-foreground underline underline-offset-2">Réinitialiser</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI ULTRA */}
        {ultraAvailable && (
          <button type="button" onClick={runUltra} disabled={!hasImage || ultra.status === 'running' || showUltraResult}
            className="mt-3 w-full flex items-center justify-center gap-2 h-12 rounded-2xl glass border border-primary/30 text-sm font-semibold text-foreground disabled:opacity-50">
            <Wand2 className="w-4 h-4 text-primary" /> AI ULTRA
            <span className="text-[10px] uppercase tracking-widest text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">Premium</span>
            <span className="text-[11px] text-muted-foreground font-normal">{hasImage ? 'rendu haute qualité' : 'prenez une photo'}</span>
          </button>
        )}

        {snapAvailable && (
          <Link to="/snap" className="mt-3 w-full flex items-center justify-center gap-2 h-12 rounded-2xl glass border border-yellow-400/30 text-sm font-semibold text-foreground">
            <Sparkles className="w-4 h-4 text-yellow-300" /> Filtres Snap
            <span className="text-[11px] text-muted-foreground font-normal">lentilles Snapchat du salon</span>
          </Link>
        )}

        <Link to={bookingHref} className="orbit-wrap rounded-2xl block mt-4 shadow-lg shadow-primary/25">
          <motion.span whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            className="flex items-center justify-center gap-2 h-12 rounded-[14px] bg-primary text-primary-foreground font-semibold text-sm">
            <Palette className="w-4 h-4" /> Réserver une coloration
          </motion.span>
        </Link>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-3 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3 h-3" /> Aperçu calculé sur l'appareil{ultraAvailable ? ' · AI ULTRA : photo traitée puis effacée' : ''}
        </p>
      </div>
    </div>
  );
}
