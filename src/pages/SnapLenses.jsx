import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Loader2, Share2, RefreshCw, Sparkles, Palette, X } from 'lucide-react';
import { hapticFeedback, isNative } from '@/lib/capacitor';
import { snapConfig, snapSupported } from '@/lib/snapLenses';

/**
 * « Filtres Snap » : la technologie des lentilles Snapchat dans l'app, via Camera Kit (SDK web
 * officiel de Snap). Les lentilles (couleurs de cheveux, barbes, coupes 3D…) sont créées dans
 * Lens Studio et publiées dans le groupe de lentilles du salon ; l'app les liste et les applique
 * sur la caméra frontale. Rien à coder pour ajouter un filtre : publier une lentille suffit.
 *
 * Le SDK (~3 Mo + WASM) est chargé à la demande, uniquement sur cette page.
 * Prérequis : Safari 16+ / Chrome 95+, WebGL, caméra. Le jeton d'API et l'identifiant du groupe
 * viennent des paramètres publics du serveur (src/lib/snapLenses.js).
 */

/**
 * Acceptation des conditions Camera Kit, exigée par la revue de Snap avant la production : la vidéo
 * de démonstration doit montrer l'affichage **et** l'acceptation des CGU. Le SDK embarque bien son
 * propre dialogue, mais la configuration distante de Snap le désactive — vérifié le 4 sept. 2026, la
 * lentille s'applique sans que rien ne s'affiche. On pose donc notre propre écran, avant la caméra.
 * Les trois liens sont ceux du SDK (`legal/legalState.js`).
 */
const TOS_KEY = 'dhb-snap-tos-v1';
const SNAP_LEGAL = {
  terms: 'https://snap.com/terms',
  privacy: 'https://values.snap.com/privacy/privacy-policy',
  camera: 'https://support.snapchat.com/article/camera-information-use',
};
const tosAccepted = () => { try { return localStorage.getItem(TOS_KEY) === '1'; } catch { return false; } };

const RENDER_WIDTH = 720;
const RENDER_HEIGHT = 960;
// Lentilles mises en avant et appliquées d'office si présentes
const RELEVANT = /hair|cheveu|beard|barbe|colou?r|couleur|coupe|haircut/i;
// Groupe de démonstration de Snap (23 exemples, surtout des tests pour développeurs) :
// on n'y garde que ce qui a du sens pour un barbier. Un groupe du salon est affiché en entier.
// `SNAP_LENS_GROUP_ID` accepte plusieurs groupes séparés par des virgules : le salon peut donc
// afficher ses lentilles et celles de démonstration côte à côte. Chaque lentille porte son
// `groupId`, donc le tri ci-dessous reste juste quel que soit le mélange.
const SNAP_DEMO_GROUP = '39ed26d4-1931-4d21-98c2-eb2e29b76f6f';
const DEMO_KEEP = /hair color|face expressions|distort/i;

/**
 * Lentille « couleur de cheveux » du salon (créée dans Lens Studio) : une seule lentille qui lit la
 * couleur dans les paramètres de lancement Camera Kit (`launchParams.color`, hex). L'app la déploie
 * en une pastille par couleur.
 *
 * La reconnaissance passe **uniquement** par la donnée fournisseur `dhb` (Project Info → Vendor Data
 * dans Lens Studio) : `hair-color`, `beard`, ou `hair-color+beard` pour une lentille qui fait les deux.
 * C'est une déclaration du créateur de la lentille : « je lis ce paramètre ». Le nom ne suffit pas —
 * une lentille qui s'appelle « DHB Couleur » mais ignore `launchParams` afficherait 16 pastilles
 * strictement identiques, ce que le client ne peut pas comprendre (constaté le 4 sept. 2026).
 */
const vendorKind = (lens) => String(lens?.vendorData?.dhb || '');
const isColorLens = (lens) => /hair-color/.test(vendorKind(lens));
export const SNAP_HAIR_COLORS = [
  { id: 'platine', name: 'Blond platine', hex: '#EDE3C8' },
  { id: 'dore', name: 'Blond doré', hex: '#D9B36A' },
  { id: 'miel', name: 'Miel', hex: '#C68E3F' },
  { id: 'chatain-clair', name: 'Châtain clair', hex: '#8B5A2B' },
  { id: 'chatain', name: 'Châtain', hex: '#5B3A21' },
  { id: 'brun', name: 'Brun', hex: '#3B2418' },
  { id: 'noir', name: 'Noir', hex: '#141010' },
  { id: 'cuivre', name: 'Roux cuivré', hex: '#B4471F' },
  { id: 'auburn', name: 'Auburn', hex: '#7A2E1A' },
  { id: 'argent', name: 'Gris argent', hex: '#B9BCC2' },
  { id: 'blanc', name: 'Blanc polaire', hex: '#F1F1F1' },
  { id: 'bleu', name: 'Bleu nuit', hex: '#1D3F8A' },
  { id: 'violet', name: 'Violet', hex: '#6A2C9A' },
  { id: 'rose', name: 'Rose', hex: '#E2559A' },
  { id: 'cerise', name: 'Rouge cerise', hex: '#B4132E' },
  { id: 'emeraude', name: 'Vert émeraude', hex: '#1F8A5B' },
];
/**
 * Lentille « barbe » du salon : une lentille, plusieurs styles choisis par le paramètre de
 * lancement `style`. Déclarée par la donnée fournisseur `dhb` contenant `beard`.
 */
const isBeardLens = (lens) => /beard/.test(vendorKind(lens));
export const SNAP_BEARD_STYLES = [
  { id: 'full', name: 'Barbe fournie', emoji: '🧔' },
  { id: 'light', name: 'Barbe de 3 jours', emoji: '🪒' },
  { id: 'mustache', name: 'Moustache', emoji: '👨' },
  { id: 'shaved', name: 'Rasé de près', emoji: '✨' },
];

const colorEntries = (lens) => SNAP_HAIR_COLORS.map((c) => ({ key: `${lens.id}:${c.id}`, lens, name: c.name, swatch: c.hex, launchParams: { color: c.hex, mode: 'full' } }));
const beardEntries = (lens) => SNAP_BEARD_STYLES.map((b) => ({ key: `${lens.id}:${b.id}`, lens, name: b.name, emoji: b.emoji, launchParams: { style: b.id } }));

/**
 * Déploie la liste du groupe : les lentilles paramétrables deviennent une entrée par réglage.
 * La lentille du salon porte les deux effets (couleur et barbe) : les styles de barbe passent
 * en tête, les teintes suivent. Chaque entrée relance la même lentille avec ses paramètres.
 */
export function expandLenses(list) {
  const out = [];
  for (const lens of list) {
    const color = isColorLens(lens);
    const beard = isBeardLens(lens);
    if (color || beard) {
      if (beard) out.push(...beardEntries(lens));
      if (color) out.push(...colorEntries(lens));
      continue;
    }
    out.push({ key: lens.id, lens, name: lens.name, iconUrl: lens.iconUrl });
  }
  return out;
}

export default function SnapLenses() {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState('init'); // init | consent | unconfigured | unsupported | loading | ready | error
  const [accepted, setAccepted] = useState(tosAccepted);
  const [message, setMessage] = useState('');
  const [lenses, setLenses] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [applying, setApplying] = useState(false);
  const [captured, setCaptured] = useState(null);
  const [shareHint, setShareHint] = useState(false);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const sessionRef = useRef(null);
  const streamRef = useRef(null);
  const lensesRef = useRef([]);

  const cleanup = useCallback(() => {
    try { sessionRef.current?.pause(); } catch { /* déjà arrêtée */ }
    try { sessionRef.current?.destroy?.(); } catch { /* ignoré */ }
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Rien ne démarre — ni caméra, ni SDK — avant l'acceptation des conditions de Snap.
      if (!accepted) { setStatus('consent'); return; }
      const config = await snapConfig();
      if (cancelled) return;
      if (!config) { setStatus('unconfigured'); return; }
      if (!snapSupported()) { setStatus('unsupported'); return; }
      setStatus('loading');
      setMessage('Chargement de Camera Kit…');
      try {
        const { bootstrapCameraKit, createMediaStreamSource, Transform2D } = await import('@snap/camera-kit');
        if (cancelled) return;
        const cameraKit = await bootstrapCameraKit({ apiToken: config.apiToken });
        if (cancelled) return;
        const session = await cameraKit.createSession({ liveRenderTarget: canvasRef.current });
        sessionRef.current = session;
        session.events.addEventListener('error', (event) => {
          const name = event?.detail?.error?.name;
          if (name === 'LensExecutionError') setMessage('Cette lentille a rencontré une erreur, essayez-en une autre.');
        });

        setMessage('Ouverture de la caméra…');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: RENDER_WIDTH }, height: { ideal: RENDER_HEIGHT } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const source = createMediaStreamSource(stream, { transform: Transform2D.MirrorX, cameraType: 'front' });
        await session.setSource(source);
        await source.setRenderSize(RENDER_WIDTH, RENDER_HEIGHT);
        await session.play();

        setMessage('Chargement des filtres…');
        const groupIds = String(config.lensGroupId).split(',').map((g) => g.trim()).filter(Boolean);
        const { lenses: loaded } = await cameraKit.lensRepository.loadLensGroups(groupIds);
        if (cancelled) return;
        // Les lentilles cheveux / barbe / couleur d'abord ; aucune lentille appliquée d'office
        // (une lentille quelconque, comme les démos de Snap, peut recouvrir la caméra de sa propre interface)
        const relevant = (lens) => isColorLens(lens) || isBeardLens(lens) || RELEVANT.test(lens?.name || '');
        const visible = (loaded || []).filter((lens) => lens?.groupId !== SNAP_DEMO_GROUP || DEMO_KEEP.test(lens?.name || ''));
        const sorted = [...visible].sort((a, b) => Number(relevant(b)) - Number(relevant(a)));
        const entries = expandLenses(sorted);
        lensesRef.current = entries;
        setLenses(entries);
        setStatus('ready');
        setMessage('');
        // à l'ouverture : une teinte, plus parlante qu'une barbe posée d'office
        const first = entries.find((e) => e.swatch) || entries.find((e) => relevant(e.lens));
        if (first) {
          try {
            await session.applyLens(first.lens, first.launchParams ? { launchParams: first.launchParams } : undefined);
            setActiveId(first.key);
          } catch { /* on reste sans filtre */ }
        }
      } catch (err) {
        if (cancelled) return;
        const denied = err?.name === 'NotAllowedError';
        setStatus('error');
        setMessage(denied ? 'Accès à la caméra refusé.' : 'Impossible de démarrer les filtres Snap. Vérifiez votre connexion puis réessayez.');
      }
    })();
    return () => { cancelled = true; cleanup(); };
  }, [cleanup, accepted]);

  const acceptTos = () => {
    hapticFeedback();
    try { localStorage.setItem(TOS_KEY, '1'); } catch { /* navigation privée : on redemandera */ }
    setAccepted(true);
  };

  const selectLens = async (entry) => {
    const session = sessionRef.current;
    if (!session || applying) return;
    hapticFeedback();
    setApplying(true);
    try {
      if (activeId === entry.key) {
        await session.removeLens();
        setActiveId(null);
      } else {
        await session.applyLens(entry.lens, entry.launchParams ? { launchParams: entry.launchParams } : undefined);
        setActiveId(entry.key);
      }
    } catch {
      setMessage('Impossible d\'appliquer ce filtre.');
    } finally {
      setApplying(false);
    }
  };

  const capture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      setCaptured(canvas.toDataURL('image/jpeg', 0.92));
      hapticFeedback();
    } catch {
      setMessage('Capture impossible sur cet appareil.');
    }
  };

  const shareImage = async () => {
    if (!captured) return;
    try {
      const blob = await (await fetch(captured)).blob();
      const file = new File([blob], 'filtre-dhomebarber.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Mon filtre · D'Home Barber" });
        return;
      }
    } catch { return; }
    if (!isNative) {
      const a = document.createElement('a');
      a.href = captured;
      a.download = 'filtre-dhomebarber.jpg';
      a.click();
    } else {
      setShareHint(true);
    }
  };

  const overlay = (
    status === 'unconfigured' ? { title: 'Filtres Snap bientôt disponibles', text: 'Le salon n\'a pas encore activé ses lentilles Snapchat.' }
      : status === 'unsupported' ? { title: 'Navigateur non compatible', text: 'Les filtres Snap demandent Safari 16, Chrome 95 ou plus récent, et une caméra.' }
        : status === 'error' ? { title: 'Oups', text: message }
          : null
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="relative max-w-lg mx-auto px-4 pt-6 pb-28">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> Retour
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-yellow-300/90 bg-yellow-400/10 border border-yellow-400/30 px-2.5 py-1 rounded-full">
            <Sparkles className="w-3 h-3" /> Camera Kit by Snap
          </span>
        </div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary/70 font-medium mb-1 flex items-center gap-2">
          <Palette className="w-3 h-3" /> Nouvelle tête
        </p>
        <h1 className="font-display text-2xl font-bold text-foreground">Filtres Snap</h1>
        <p className="text-xs text-muted-foreground mt-1 mb-4">Les vraies lentilles Snapchat du salon, coupes et couleurs, en direct sur vous.</p>

        <div ref={containerRef} className="relative rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl" style={{ aspectRatio: '3 / 4' }}>
          <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full object-cover ${captured ? 'invisible' : ''}`} />
          {captured && <img src={captured} alt="Votre filtre" className="absolute inset-0 w-full h-full object-cover" draggable={false} />}

          {(status === 'init' || status === 'loading') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8 bg-black/60">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-white/90 font-medium">{message || 'Préparation…'}</p>
            </div>
          )}
          {status === 'consent' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-7 bg-black/85">
              <Sparkles className="w-7 h-7 text-yellow-300" />
              <p className="text-sm text-white font-semibold">Filtres propulsés par Snap</p>
              <p className="text-[11px] leading-relaxed text-white/70">
                Ces filtres utilisent Camera Kit, la technologie des lentilles de Snapchat. L'image de
                votre caméra est traitée par le logiciel de Snap pour appliquer le filtre. En continuant,
                vous acceptez les{' '}
                <a href={SNAP_LEGAL.terms} target="_blank" rel="noreferrer" className="underline text-white">conditions d'utilisation de Snap</a>{' '}
                et sa{' '}
                <a href={SNAP_LEGAL.privacy} target="_blank" rel="noreferrer" className="underline text-white">politique de confidentialité</a>.{' '}
                <a href={SNAP_LEGAL.camera} target="_blank" rel="noreferrer" className="underline text-white">Comment Snap utilise les données de la caméra</a>.
              </p>
              <button type="button" onClick={acceptTos} className="mt-1 px-5 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                J'accepte et j'active la caméra
              </button>
              <Link to="/try-on" className="text-[11px] text-white/50 underline">Essayer plutôt la couleur par IA, sans Snap</Link>
            </div>
          )}
          {overlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-8 bg-black/70">
              <p className="text-sm text-white font-semibold">{overlay.title}</p>
              <p className="text-[11px] text-white/60">{overlay.text}</p>
              {status === 'error' && (
                <button type="button" onClick={() => window.location.reload()} className="mt-2 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Réessayer</button>
              )}
              {status === 'unconfigured' && (
                <Link to="/try-on" className="mt-2 px-4 h-10 inline-flex items-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Essayer une couleur</Link>
              )}
            </div>
          )}
          {status === 'ready' && message && (
            <p className="absolute top-3 left-3 right-3 text-center text-[11px] text-white bg-black/60 backdrop-blur rounded-xl px-3 py-2 flex items-center justify-between gap-2">
              <span>{message}</span>
              <button type="button" onClick={() => setMessage('')} aria-label="Fermer"><X className="w-3.5 h-3.5" /></button>
            </p>
          )}
          {shareHint && (
            <p className="absolute top-3 left-3 right-3 text-center text-[11px] text-white bg-black/60 backdrop-blur rounded-xl px-3 py-2">Maintenez l'image appuyée pour l'enregistrer</p>
          )}

          {status === 'ready' && !captured && (
            <motion.button type="button" onClick={capture} whileTap={reduceMotion ? undefined : { scale: 0.9 }} aria-label="Prendre la photo"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white/95 border-4 border-white/40 shadow-xl" />
          )}
          {captured && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center gap-2">
              <button type="button" onClick={() => { setCaptured(null); setShareHint(false); }}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-black/60 backdrop-blur text-white text-xs font-semibold border border-white/15">
                <RefreshCw className="w-3.5 h-3.5" /> Reprendre
              </button>
              <button type="button" onClick={shareImage}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/30">
                <Share2 className="w-3.5 h-3.5" /> Partager
              </button>
            </div>
          )}
        </div>

        {/* Lentilles du groupe */}
        {status === 'ready' && (
          <div className="mt-4 -mx-4 px-4 flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            {lenses.length === 0 && <p className="text-xs text-muted-foreground">Aucune lentille publiée dans le groupe du salon.</p>}
            {lenses.length > 0 && (
              <button type="button" disabled={applying}
                onClick={async () => { if (!activeId || !sessionRef.current) return; hapticFeedback(); setApplying(true); try { await sessionRef.current.removeLens(); setActiveId(null); } catch { /* ignoré */ } finally { setApplying(false); } }}
                className="flex flex-col items-center gap-1.5 shrink-0 w-[72px]">
                <motion.span animate={{ scale: activeId ? 1 : 1.1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className={`w-14 h-14 rounded-full border-2 flex items-center justify-center bg-white/5 ${activeId ? 'border-white/15' : 'border-primary shadow-lg shadow-primary/40'}`}>
                  <X className="w-5 h-5 text-muted-foreground" />
                </motion.span>
                <span className={`text-[10px] leading-tight text-center ${activeId ? 'text-muted-foreground' : 'text-foreground font-semibold'}`}>Sans filtre</span>
              </button>
            )}
            {lenses.map((entry) => {
              const active = entry.key === activeId;
              return (
                <button key={entry.key} type="button" onClick={() => selectLens(entry)} disabled={applying} className="flex flex-col items-center gap-1.5 shrink-0 w-[72px]">
                  <motion.span animate={{ scale: active ? 1.1 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className={`w-14 h-14 rounded-full overflow-hidden border-2 bg-white/5 flex items-center justify-center ${active ? 'border-primary shadow-lg shadow-primary/40' : 'border-white/15'}`}
                    style={entry.swatch ? { background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45), transparent 45%), ${entry.swatch}` } : undefined}>
                    {!entry.swatch && (entry.emoji
                      ? <span className="text-2xl leading-none" aria-hidden="true">{entry.emoji}</span>
                      : entry.iconUrl
                        ? <img src={entry.iconUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                        : <Sparkles className="w-5 h-5 text-primary" />)}
                  </motion.span>
                  <span className={`text-[10px] leading-tight text-center line-clamp-2 ${active ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{entry.name || 'Lentille'}</span>
                </button>
              );
            })}
          </div>
        )}

        <Link to="/booking" className="orbit-wrap rounded-2xl block mt-5 shadow-lg shadow-primary/25">
          <motion.span whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            className="flex items-center justify-center gap-2 h-12 rounded-[14px] bg-primary text-primary-foreground font-semibold text-sm">
            Réserver ce look
          </motion.span>
        </Link>
        <Link to="/try-on" className="mt-3 w-full flex items-center justify-center gap-2 h-11 rounded-2xl glass text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <Palette className="w-4 h-4 text-primary" /> Essayer une couleur précise avec l'IA
        </Link>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-3">
          Propulsé par Camera Kit, la technologie des lentilles Snapchat. Les lentilles tournent sur votre appareil.{' '}
          <a href={SNAP_LEGAL.terms} target="_blank" rel="noreferrer" className="underline">Conditions Snap</a>
          {' · '}
          <a href={SNAP_LEGAL.privacy} target="_blank" rel="noreferrer" className="underline">Confidentialité Snap</a>
        </p>
      </div>
    </div>
  );
}
