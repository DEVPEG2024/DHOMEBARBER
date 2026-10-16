import React, { useEffect, useId, useRef, useState } from 'react';
import { motion, animate, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import { hapticFeedback } from '@/lib/capacitor';
import { motionPermissionState, onMotionPermission } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  GANG_CARD_WIDTH as W,
  GANG_CARD_HEIGHT as H,
  GANG_SHIELD_PATH,
  GANG_INNER_SCALE,
  GANG_BUST_PATHS,
  GANG_PHOTO_BOX,
  GANG_PHOTO_MASK,
  gangPhotoVeil,
  gangPhotoVeilStart,
  GANG_STAT_COLUMNS,
  GANG_LOW_COLOR,
  GANG_PLACEHOLDER_PALETTE,
  gangPalette,
  gangTierLabel,
  gangDecorCss,
  gangStatAbbr,
  gangStatValue,
  isGangStatLow,
  gangScore,
  gangLastVisitLabel,
  gangSinceLabel,
  gangNextLabel,
  gangNextProgress,
  gangSerialLabel,
} from './gangTheme';

/**
 * Carte Gang d'un client : écusson style carte de foot, repris de la maquette
 * validée par le salon (construit à 300 × 440 puis mis à l'échelle par `size`).
 *
 * Recto : note, poste, pastille du niveau, logo, photo (ou silhouette), nom,
 * six stats (FRA en rouge sous 50), niveau. Verso : visites, barber, favori,
 * dernière visite, ancienneté, progression vers le niveau suivant, numéro.
 *
 * Animations (transform / opacity uniquement) : la carte s'incline et le reflet
 * suit le doigt ou la souris, retour au repos au relâchement ; tap / Entrée /
 * Espace la retourne. Réduction des animations : ni inclinaison, retournement
 * instantané.
 */

const SHAPE = { position: 'absolute', inset: 0, clipPath: `path('${GANG_SHIELD_PATH}')`, WebkitClipPath: `path('${GANG_SHIELD_PATH}')` };
const INNER = {
  ...SHAPE,
  overflow: 'hidden',
  transform: `scale(${GANG_INNER_SCALE.x}, ${GANG_INNER_SCALE.y})`,
  transformOrigin: `${GANG_INNER_SCALE.originX * 100}% ${GANG_INNER_SCALE.originY * 100}%`,
};
const SIDE = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
const SHADOW = 'drop-shadow(0 18px 22px rgba(20,24,28,.28)) drop-shadow(0 4px 6px rgba(20,24,28,.18))';
const FADE_MASK = `radial-gradient(ellipse ${GANG_PHOTO_MASK.rx * 100}% ${GANG_PHOTO_MASK.ry * 100}% at ${GANG_PHOTO_MASK.cx * 100}% ${GANG_PHOTO_MASK.cy * 100}%, ${GANG_PHOTO_MASK.stops.map(([at, a]) => `rgba(0,0,0,${a}) ${at * 100}%`).join(', ')})`;
const PHOTO_ZONE = { position: 'absolute', ...GANG_PHOTO_BOX, WebkitMaskImage: FADE_MASK, maskImage: FADE_MASK };
const LOGO_SRC = '/icons/icon-128.png';

const GLARE_R = 155;  // rayon du reflet blanc (≈ 42 % du rayon de la maquette)
const HOLO_SIZE = 1000;
const TILT_SPRING = { stiffness: 260, damping: 26, mass: 0.5 };
const FLIP_TRANSITION = { duration: 0.8, ease: [0.3, 1.25, 0.4, 1] };
const TAP_SLOP = 10;  // au-delà, le geste est un glissé, pas un tap

// Gyroscope : mêmes réglages que la carte des barbers (BarberCard.jsx)
const GYRO_MAX_ROTATE_Y = 22;    // gamma : gauche / droite (même amplitude que le doigt)
const GYRO_MAX_ROTATE_X = 16;    // beta : avant / arrière
const GYRO_RANGE_DEG = 35;
const GYRO_REST_BETA = 40;       // téléphone tenu naturellement, légèrement incliné
const POINTER_PRIORITY_MS = 300; // le doigt / la souris garde la main ce délai après son dernier événement
const clampUnit = (v) => Math.min(1, Math.max(-1, v));
// Arrivée : seulement pour une carte affichée en grand (pas les vignettes de la collection)
const ENTRANCE_MIN_SIZE = 0.5;

/** Nombre qui monte de 0 à sa valeur (écrit dans le DOM, sans re-render), comme la carte des barbers. */
function CountUp({ value, delay = 0, duration = 1.1, run = true }) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (value == null) { el.textContent = '–'; return undefined; }
    if (!run || reduceMotion) { el.textContent = String(value); return undefined; }
    el.textContent = '0';
    const controls = animate(0, value, {
      delay,
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = String(Math.round(v)); },
    });
    return () => controls.stop();
  }, [value, delay, duration, run, reduceMotion]);
  return <span ref={ref}>{value ?? '–'}</span>;
}

/** Silhouette en buste, à la place de la photo. */
function Bust({ ink, accent }) {
  const id = `gang-bust-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 200 206" aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={ink} stopOpacity=".5" />
          <stop offset="1" stopColor={ink} stopOpacity=".18" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d={GANG_BUST_PATHS.body} />
      <path fill={ink} fillOpacity=".32" d={GANG_BUST_PATHS.hair} />
      <path fill={accent} fillOpacity=".55" d={GANG_BUST_PATHS.collar} />
    </svg>
  );
}

/** Liseré + fond intérieur (bandes, arcs, reflets) d'une face ; `children` = contenu. */
function Shell({ p, glareX, glareY, holoX, holoY, holoRotate, children }) {
  return (
    <>
      <div style={{ ...SHAPE, background: p.border }} />
      {/* Focus clavier : le liseré prend la couleur de l'encre (comme la maquette) */}
      <div className="opacity-0 group-focus-visible:opacity-100" style={{ ...SHAPE, background: p.ink }} />
      <div style={{ ...INNER, background: p.bg }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: gangDecorCss(p) }} />
        <motion.div
          aria-hidden="true"
          style={{
            position: 'absolute', left: 0, top: 0, width: GLARE_R * 2, height: GLARE_R * 2,
            x: glareX, y: glareY, pointerEvents: 'none', mixBlendMode: 'soft-light',
            background: `radial-gradient(circle closest-side, rgba(255,255,255,${p.glare}) 0%, transparent 100%)`,
          }}
        />
        {p.holo > 0 && (
          <motion.div
            aria-hidden="true"
            style={{
              position: 'absolute', left: 0, top: 0, width: HOLO_SIZE, height: HOLO_SIZE,
              x: holoX, y: holoY, rotate: holoRotate, opacity: p.holo, pointerEvents: 'none',
              mixBlendMode: 'color-dodge', filter: 'blur(8px) saturate(1.3)',
              background: 'conic-gradient(from 0deg, #ff7ad9, #7af0ff, #b9ff7a, #ffe27a, #ff7ad9)',
            }}
          />
        )}
        {children}
      </div>
    </>
  );
}

function Logo({ size, style }) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      draggable={false}
      style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(0,0,0,.35)', padding: 3, ...style }}
    />
  );
}

/** Taille du nom selon sa longueur (largeur utile 256 px). */
const nameFontSize = (name) => (name.length <= 12 ? 40 : name.length <= 15 ? 34 : 30);

function Front({ card, p, entrance }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const photo = card?.photo_url && failedSrc !== card.photo_url ? card.photo_url : null;
  const score = gangScore(card);
  const name = String(card?.name || 'Client').toUpperCase();

  const stat = (key, i) => {
    const v = gangStatValue(card, key);
    return (
      <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 25, lineHeight: 1.12 }}>
        <b style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: '1.35em', color: isGangStatLow(key, v) ? GANG_LOW_COLOR : undefined }}>
          <CountUp value={v} delay={0.45 + i * 0.08} run={entrance} />
        </b>
        <span style={{ fontSize: 20, fontWeight: 600, color: p.accent, letterSpacing: '.02em' }}>{gangStatAbbr(key)}</span>
      </div>
    );
  };

  return (
    <div className="font-fut" style={{ position: 'absolute', inset: 0, color: p.ink }}>
      {/* Note, poste, niveau, logo */}
      <div style={{ position: 'absolute', left: 30, top: 40, width: 62, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 3 }}>
        <b style={{ fontSize: 58, fontWeight: 800, lineHeight: 0.8, fontVariantNumeric: 'tabular-nums' }}><CountUp value={score} delay={0.35} duration={1.3} run={entrance} /></b>
        <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: '.03em', lineHeight: 1 }}>{card?.pos || ''}</span>
        <div
          style={{
            minWidth: 34, height: 22, padding: '0 4px', borderRadius: 3, marginTop: 6, background: p.gem, color: p.gemInk,
            boxShadow: '0 0 0 1px rgba(255,255,255,.25) inset', display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 800, letterSpacing: '.04em', whiteSpace: 'nowrap',
          }}
        >
          {p.code}
        </div>
        <Logo size={36} style={{ marginTop: 6, boxShadow: '0 0 0 1px rgba(255,255,255,.18)' }} />
      </div>

      {/* Photo de profil fondue dans la carte (ovale doux) et teintée aux couleurs du niveau, ou silhouette */}
      <div style={{ ...PHOTO_ZONE, zIndex: 2 }}>
        {photo ? (
          <>
            <img
              src={photo}
              alt=""
              draggable={false}
              onError={() => setFailedSrc(photo)}
              style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover', objectPosition: '50% 22%', filter: 'saturate(.88) contrast(1.06)' }}
            />
            {/* Teinte du niveau (or, bronze, bleu…) : la photo prend la lumière de la carte */}
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: p.accent, mixBlendMode: 'soft-light', opacity: 0.4 }} />
            {/* Voile du pourtour dans la couleur de la carte : le fond de la photo disparaît, le visage reste */}
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 46% 52% at 54% 40%, transparent ${gangPhotoVeilStart(p) * 100}%, ${gangPhotoVeil(p)} 100%)` }} />
          </>
        ) : (
          <div style={{ position: 'absolute', left: 17, top: 16, width: 200, height: 206 }}><Bust ink={p.ink} accent={p.accent} /></div>
        )}
      </div>

      {/* Nom */}
      <div style={{ position: 'absolute', left: 22, right: 22, top: 232, textAlign: 'center', zIndex: 3 }}>
        <b
          style={{
            display: 'block', fontSize: nameFontSize(name), height: 40, lineHeight: '40px', fontWeight: 800, letterSpacing: '.02em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {name}
        </b>
        <i style={{ display: 'block', width: '74%', height: 1.5, margin: '8px auto 0', background: p.accent, opacity: 0.85 }} />
      </div>

      {/* Stats en deux colonnes */}
      <div style={{ position: 'absolute', left: 44, right: 44, top: 288, display: 'grid', gridTemplateColumns: '1fr 1.5px 1fr', gap: '0 18px', zIndex: 3 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{GANG_STAT_COLUMNS[0].map((k, i) => stat(k, i))}</div>
        <span style={{ background: p.accent, opacity: 0.7 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{GANG_STAT_COLUMNS[1].map((k, i) => stat(k, i + 3))}</div>
      </div>

      <div
        style={{
          position: 'absolute', left: 0, right: 0, top: 392, textAlign: 'center', fontSize: 13, fontWeight: 700,
          letterSpacing: '.22em', textTransform: 'uppercase', color: p.accent, opacity: 0.85, zIndex: 3,
        }}
      >
        {gangTierLabel(p)}
      </div>

      {/* Reflet holographique qui balaie la carte à l'arrivée (comme la carte des barbers) */}
      {entrance && (
        <motion.div
          aria-hidden="true"
          initial={{ x: '-140%' }}
          animate={{ x: '340%' }}
          transition={{ delay: 0.55, duration: 1.15, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'absolute', top: '-20%', bottom: '-20%', left: 0, width: '34%', skewX: -18, zIndex: 4, pointerEvents: 'none',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0.18) 60%, transparent 100%)',
            mixBlendMode: 'screen',
          }}
        />
      )}
    </div>
  );
}

function Back({ card, p }) {
  const visits = Number(card?.visits) || 0;
  const serial = gangSerialLabel(card?.serial);
  const rows = [
    ['Barber', card?.barber || '–'],
    ['Favori', card?.favorite || '–'],
    ['Dernière', gangLastVisitLabel(card?.days_since_last)],
    ['Depuis', gangSinceLabel(card?.first_visit)],
  ];
  const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 };

  return (
    <div
      className="font-fut"
      style={{
        position: 'absolute', inset: 0, color: p.ink, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '30px 44px 0', gap: 7, zIndex: 3, textAlign: 'center',
      }}
    >
      <Logo size={40} />
      <div style={{ fontSize: 80, fontWeight: 800, lineHeight: 0.82, fontVariantNumeric: 'tabular-nums' }}>{visits}</div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: p.accent }}>
        {visits > 1 ? 'Visites au salon' : 'Visite au salon'}
      </div>
      <dl style={{ margin: '4px 0 0', width: '100%', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '2px 12px', fontSize: 19 }}>
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt style={{ color: p.accent, fontWeight: 600, textTransform: 'uppercase', textAlign: 'left' }}>{label}</dt>
            <dd style={{ margin: 0, fontWeight: 700, textAlign: 'right', ...ellipsis }}>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div style={{ width: '82%', marginTop: 6, fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        <div style={ellipsis}>{gangNextLabel(card?.next)}</div>
        <div style={{ marginTop: 6, height: 7, borderRadius: 4, background: 'rgba(255,255,255,.14)', overflow: 'hidden' }}>
          <i style={{ display: 'block', height: '100%', width: `${gangNextProgress(card?.next)}%`, background: p.accent }} />
        </div>
      </div>
      {serial && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 394, fontSize: 12, fontWeight: 600, letterSpacing: '.18em', color: p.accent, opacity: 0.6 }}>
          {serial}
        </div>
      )}
    </div>
  );
}

export default function GangCard({
  card,
  size = 0.78,
  flippable = true,
  interactive = true,
  flipped,
  onFlip,
  gyro,
  entrance: entranceProp,
  className,
  style,
}) {
  const reduceMotion = useReducedMotion();
  const tilt = interactive && !reduceMotion;
  // Grande carte : arrivée animée et gyroscope par défaut ; vignettes : ni l'un ni l'autre
  const big = size >= ENTRANCE_MIN_SIZE;
  const entrance = !reduceMotion && (entranceProp ?? big);
  const useGyro = tilt && (gyro ?? big);
  const lastPointer = useRef(0);
  // Gyroscope : autorisation gérée au niveau de l'app (src/lib/motion.js, fenêtre MotionPrompt sur iOS)
  const [gyroGranted, setGyroGranted] = useState(() => motionPermissionState() === 'granted');
  useEffect(() => onMotionPermission((state) => setGyroGranted(state === 'granted')), []);
  const p = gangPalette(card);
  const [ownFlipped, setOwnFlipped] = useState(false);
  const isFlipped = flipped ?? ownFlipped;
  const downAt = useRef(null);

  // Position du reflet (0 → 1, repos en haut : 50 % / 25 %) et inclinaison (°, repos à plat), lissées par un ressort
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.25);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const sx = useSpring(mx, TILT_SPRING);
  const sy = useSpring(my, TILT_SPRING);
  const rotateX = useSpring(tiltX, TILT_SPRING);
  const rotateY = useSpring(tiltY, TILT_SPRING);
  const glareY = useTransform(sy, (v) => v * H - GLARE_R);
  const glareXFront = useTransform(sx, (v) => v * W - GLARE_R);
  const glareXBack = useTransform(sx, (v) => (1 - v) * W - GLARE_R); // verso vu en miroir
  const holoY = useTransform(sy, (v) => v * H - HOLO_SIZE / 2);
  const holoXFront = useTransform(sx, (v) => v * W - HOLO_SIZE / 2);
  const holoXBack = useTransform(sx, (v) => (1 - v) * W - HOLO_SIZE / 2);
  const holoRotate = useTransform(rotateY, (v) => v * 8);

  // Inclinaison au gyroscope : gamma → rotateY, beta (autour de la tenue naturelle) → rotateX, reflet
  // dans le même sens que pour le doigt. Ignoré tant que le doigt ou la souris est actif.
  useEffect(() => {
    if (!useGyro || !gyroGranted) return undefined;
    const onOrientation = (e) => {
      if (e.gamma == null || e.beta == null) return;
      if (Date.now() - lastPointer.current < POINTER_PRIORITY_MS) return;
      const nx = clampUnit(e.gamma / GYRO_RANGE_DEG);
      const ny = clampUnit((e.beta - GYRO_REST_BETA) / GYRO_RANGE_DEG);
      tiltY.set(nx * GYRO_MAX_ROTATE_Y);
      tiltX.set(-ny * GYRO_MAX_ROTATE_X);
      mx.set(0.5 + nx * 0.45);
      my.set(0.25 + ny * 0.45);
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, [useGyro, gyroGranted, tiltX, tiltY, mx, my]);

  const track = (e) => {
    lastPointer.current = Date.now();
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    mx.set(x);
    my.set(y);
    tiltY.set((x - 0.5) * 22);
    tiltX.set((0.5 - y) * 16);
  };
  const rest = () => { lastPointer.current = Date.now(); mx.set(0.5); my.set(0.25); tiltX.set(0); tiltY.set(0); };

  const toggle = () => {
    const next = !isFlipped;
    if (flipped === undefined) setOwnFlipped(next);
    onFlip?.(next);
    hapticFeedback();
  };

  const handlers = {};
  if (tilt) {
    handlers.onPointerMove = track;
    handlers.onPointerLeave = rest;
    handlers.onPointerCancel = rest;
  }
  handlers.onPointerDown = (e) => {
    downAt.current = { x: e.clientX, y: e.clientY };
    if (tilt) track(e);
  };
  handlers.onPointerUp = (e) => {
    if (tilt && e.pointerType !== 'mouse') rest();
  };
  if (flippable) {
    handlers.onClick = (e) => {
      const d = downAt.current;
      downAt.current = null;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
      toggle();
    };
    handlers.onKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };
  }

  const levelLabel = p.kind === 'edition' ? p.label : card?.tier_label || p.label;
  const a11y = flippable
    ? { role: 'button', tabIndex: 0, 'aria-label': `Carte ${levelLabel} de ${card?.name || 'client'} : retourner`, 'aria-pressed': isFlipped }
    : { role: 'img', 'aria-label': `Carte ${levelLabel} de ${card?.name || 'client'}` };

  return (
    <div
      {...a11y}
      {...handlers}
      className={cn('group relative flex-none select-none outline-none', className)}
      style={{
        width: W * size,
        height: H * size,
        filter: SHADOW,
        cursor: flippable ? 'pointer' : undefined,
        touchAction: tilt ? 'pan-y' : 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `scale(${size})`, transformOrigin: '0 0', perspective: 1100 }}>
        <motion.div
          initial={entrance ? { opacity: 0, y: 28, rotateY: -14, scale: 0.96 } : false}
          animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 16 }}
          style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}
        >
        <motion.div style={{ position: 'absolute', inset: 0, rotateX, rotateY, transformStyle: 'preserve-3d' }}>
          <motion.div
            initial={false}
            animate={{ rotateY: isFlipped ? 180 : 0 }}
            transition={reduceMotion ? { duration: 0 } : FLIP_TRANSITION}
            style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}
          >
            <div style={{ ...SIDE, transform: 'rotateY(0deg)' }} aria-hidden={isFlipped || undefined}>
              <Shell p={p} glareX={glareXFront} glareY={glareY} holoX={holoXFront} holoY={holoY} holoRotate={holoRotate}>
                <Front card={card} p={p} entrance={entrance} />
              </Shell>
            </div>
            <div style={{ ...SIDE, transform: 'rotateY(180deg)' }} aria-hidden={!isFlipped || undefined}>
              <Shell p={p} glareX={glareXBack} glareY={glareY} holoX={holoXBack} holoY={holoY} holoRotate={holoRotate}>
                <Back card={card} p={p} />
              </Shell>
            </div>
          </motion.div>
        </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/** Écusson gris du client qui n'a pas encore de visite. */
export function GangCardPlaceholder({ size = 0.78, className, style, text = 'Ta carte arrive après ta première visite' }) {
  const p = GANG_PLACEHOLDER_PALETTE;
  return (
    <div
      role="img"
      aria-label={text}
      className={cn('relative flex-none select-none', className)}
      style={{ width: W * size, height: H * size, filter: SHADOW, ...style }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `scale(${size})`, transformOrigin: '0 0' }}>
        <Shell p={p} glareX={W / 2 - GLARE_R} glareY={H * 0.25 - GLARE_R}>
          <div className="font-fut" style={{ position: 'absolute', inset: 0, color: p.ink }}>
            <div style={{ position: 'absolute', left: 30, top: 40, width: 62, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: 0.6 }}>
              <b style={{ fontSize: 58, fontWeight: 800, lineHeight: 0.8 }}>?</b>
              <Logo size={36} style={{ marginTop: 14, filter: 'grayscale(1)' }} />
            </div>
            <div style={{ ...PHOTO_ZONE, opacity: 0.55 }}>
              <div style={{ position: 'absolute', left: 17, top: 16, width: 200, height: 206 }}><Bust ink={p.ink} accent={p.accent} /></div>
            </div>
            <div
              style={{
                position: 'absolute', left: 36, right: 36, top: 248, textAlign: 'center', fontSize: 27, fontWeight: 800,
                lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: '.02em', textWrap: 'balance',
              }}
            >
              {text}
            </div>
            <div
              style={{
                position: 'absolute', left: 0, right: 0, top: 392, textAlign: 'center', fontSize: 13, fontWeight: 700,
                letterSpacing: '.22em', textTransform: 'uppercase', color: p.accent, opacity: 0.85,
              }}
            >
              {p.label}
            </div>
          </div>
        </Shell>
      </div>
    </div>
  );
}
