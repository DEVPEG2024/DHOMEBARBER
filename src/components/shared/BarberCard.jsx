import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, animate, useReducedMotion } from 'framer-motion';
import { hapticFeedback } from '@/lib/capacitor';

/**
 * Carte de barber façon FUT (FIFA Ultimate Team, style « Team of the Season ») :
 * note globale, titre, logo du salon, photo, bandeau nom et six stats.
 *
 * Les stats viennent des compétences saisies par le barber (niveau 0 à 5 par
 * catégorie, voir Mes paramètres) converties sur l'échelle FUT ; la note
 * globale est la moyenne des stats renseignées. Une compétence non évaluée
 * s'affiche « – ».
 *
 * Animations : les chiffres montent de 0 à leur valeur à l'arrivée, un reflet
 * holographique balaie la carte, puis la carte s'incline et le reflet suit le
 * doigt / la souris. Tout est en transform / opacity (fluide sur mobile).
 *
 * Double tap : la carte se retourne (rotation 3D à ressort) et montre au dos la
 * description du barber (`bio`). Détection maison sur pointerup (deux taps en
 * moins de 320 ms sans déplacement), fiable sur iOS / Android et à la souris.
 */

export const CARD_WIDTH = 300;
export const CARD_HEIGHT = 470;

/** Identifiant de transition partagée : la photo « vole » du carrousel de l'accueil vers la carte. */
export const barberPhotoLayoutId = (employeeId) => `barber-photo-${employeeId}`;

/** Niveau 0-5 → note style FUT (5 = 99). */
const LEVEL_TO_RATING = [null, 68, 76, 84, 92, 99];

/** Abréviations à trois lettres des catégories connues (nom normalisé → code). */
const ABBR_OVERRIDES = {
  'ciseaux': 'CIS',
  'barbe et contours': 'BAR',
  'cheveux afro': 'AFR',
  'design': 'DES',
  'coloration': 'COL',
  'taper': 'TAP',
};

const GOLD = '#f6e7ad';
const GOLD_LINE = 'rgba(246, 231, 173, 0.55)';
const NEON = '#86f7e6';

/** Polygone de la carte (chanfreins en haut, pointe en bas). */
const CARD_SHAPE = 'polygon(0% 4.5%, 7% 0%, 93% 0%, 100% 4.5%, 100% 89%, 50% 100%, 0% 89%)';

const tiltSpring = { stiffness: 180, damping: 18, mass: 0.6 };

function normalizeSkillName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')          // accents
    .replace(/[^a-zA-Z ]/g, ' ')                // emoji, ponctuation, chiffres
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function skillAbbr(name) {
  const n = normalizeSkillName(name);
  if (ABBR_OVERRIDES[n]) return ABBR_OVERRIDES[n];
  const first = n.split(' ').find(Boolean) || '';
  return (first.slice(0, 3) || 'SKL').toUpperCase();
}

/**
 * Construit les stats de la carte à partir des catégories et des niveaux du barber.
 * Au plus six stats : au-delà, on garde les mieux notées (puis l'ordre de tri).
 */
export function buildCardStats(skillCategories = [], employeeSkills = []) {
  const stats = skillCategories
    .filter(cat => cat && cat.is_active !== false)
    .map((cat, index) => {
      const s = employeeSkills.find(x => String(x.category_id) === String(cat.id));
      const level = Math.max(0, Math.min(5, Number(s?.level) || 0));
      return {
        key: cat.id,
        label: String(cat.name || '').trim(),
        abbr: skillAbbr(cat.name),
        level,
        value: LEVEL_TO_RATING[level],
        index,
      };
    });
  if (stats.length <= 6) return stats;
  return [...stats]
    .sort((a, b) => b.level - a.level || a.index - b.index)
    .slice(0, 6)
    .sort((a, b) => a.index - b.index);
}

/** Note globale : moyenne des stats renseignées, ou null si aucune. */
export function overallRating(stats = []) {
  const filled = stats.filter(s => s.value != null);
  if (filled.length === 0) return null;
  return Math.round(filled.reduce((sum, s) => sum + s.value, 0) / filled.length);
}

/** Nombre qui monte de 0 à sa valeur (écrit directement dans le DOM, sans re-render). */
function CountUp({ value, delay = 0, duration = 1.1, className, style }) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (value == null) { el.textContent = '–'; return undefined; }
    if (reduceMotion) { el.textContent = String(value); return undefined; }
    el.textContent = '0';
    const controls = animate(0, value, {
      delay,
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = String(Math.round(v)); },
    });
    return () => controls.stop();
  }, [value, delay, duration, reduceMotion]);

  return <span ref={ref} className={className} style={style}>{value ?? '–'}</span>;
}

function GoldShards() {
  // Éclats dorés et bleu pâle façon TOTS, derrière la photo
  return (
    <svg
      viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bc-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="45%" stopColor="#e8c04a" />
          <stop offset="100%" stopColor="#9a6f14" />
        </linearGradient>
        <linearGradient id="bc-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c7e0ff" />
          <stop offset="100%" stopColor="#4d7dff" />
        </linearGradient>
      </defs>
      {/* éclats dorés (haut droit) */}
      <polygon points="212,0 246,0 232,44" fill="url(#bc-gold)" opacity="0.95" />
      <polygon points="262,18 300,4 300,60 276,54" fill="url(#bc-gold)" opacity="0.9" />
      <polygon points="248,62 284,48 292,92 258,96" fill="url(#bc-gold)" opacity="0.85" />
      <polygon points="228,104 262,110 246,140" fill="url(#bc-gold)" opacity="0.8" />
      <polygon points="286,120 300,110 300,160" fill="url(#bc-gold)" opacity="0.75" />
      <polygon points="196,52 214,60 204,84" fill="url(#bc-gold)" opacity="0.7" />
      <polygon points="270,178 300,168 300,210 282,206" fill="url(#bc-gold)" opacity="0.55" />
      {/* éclats bleu pâle */}
      <polygon points="176,10 196,4 188,40" fill="url(#bc-blue)" opacity="0.35" />
      <polygon points="150,30 168,42 146,58" fill="url(#bc-blue)" opacity="0.28" />
      <polygon points="236,150 268,144 254,176" fill="url(#bc-blue)" opacity="0.3" />
      <polygon points="0,150 22,138 14,178" fill="url(#bc-blue)" opacity="0.22" />
      <polygon points="0,210 30,200 18,240" fill="url(#bc-gold)" opacity="0.28" />
      {/* traits fins */}
      <line x1="120" y1="0" x2="300" y2="150" stroke="#9fc5ff" strokeOpacity="0.18" strokeWidth="1" />
      <line x1="60" y1="0" x2="300" y2="210" stroke="#ffe9a8" strokeOpacity="0.14" strokeWidth="1" />
    </svg>
  );
}

function StatRow({ stat, delay }) {
  const filled = stat.value != null;
  return (
    <div className="flex items-baseline gap-1.5 h-[30px]" title={stat.label}>
      <CountUp
        value={filled ? stat.value : null}
        delay={delay}
        className="font-fut tabular-nums leading-none"
        style={{ fontSize: 25, fontWeight: 800, color: GOLD, opacity: filled ? 1 : 0.45, minWidth: 34, textAlign: 'right' }}
      />
      <span className="font-fut leading-none" style={{ fontSize: 17, fontWeight: 600, color: GOLD, letterSpacing: 0.5 }}>
        {stat.abbr}
      </span>
    </div>
  );
}

const NEON_SHADOW = `drop-shadow(0 0 3px ${NEON}) drop-shadow(0 0 14px rgba(134,247,230,0.55)) drop-shadow(0 12px 28px rgba(0,0,0,0.6))`;
const DOUBLE_TAP_MS = 320;

/** Dos de la carte : même découpe et liseré néon, description du barber. */
function CardBack({ employee, bio, logoUrl }) {
  const title = (employee?.title || 'Barber').trim();
  return (
    <div className="absolute inset-0" style={{ filter: NEON_SHADOW }}>
      <div className="absolute inset-0" style={{ clipPath: CARD_SHAPE, background: NEON }}>
        <div
          className="absolute overflow-hidden"
          style={{
            inset: 3,
            clipPath: CARD_SHAPE,
            background: [
              'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(42,79,214,0.55) 0%, transparent 70%)',
              'linear-gradient(165deg, #142a8f 0%, #0d1f6b 40%, #08143f 100%)',
            ].join(', '),
          }}
        >
          <img
            src={logoUrl}
            alt=""
            draggable={false}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 object-contain pointer-events-none"
            style={{ opacity: 0.07 }}
          />
          <div className="absolute inset-0 flex flex-col" style={{ padding: '46px 26px 62px' }}>
            <span className="font-fut uppercase leading-none" style={{ fontSize: 13, letterSpacing: 2, color: GOLD, opacity: 0.8 }}>
              {title}
            </span>
            <span
              className="font-fut uppercase leading-none whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ fontSize: 30, fontWeight: 800, color: GOLD, letterSpacing: 1.6, marginTop: 6, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            >
              {employee?.name}
            </span>
            <span className="block" style={{ width: 60, height: 1, background: GOLD_LINE, margin: '12px 0 14px' }} />
            <span className="font-fut uppercase leading-none" style={{ fontSize: 12, letterSpacing: 2.5, color: NEON, opacity: 0.85 }}>
              À propos
            </span>
            <div className="mt-2 flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1" style={{ WebkitOverflowScrolling: 'touch' }}>
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.88)', whiteSpace: 'pre-wrap' }}>
                {bio?.trim() || 'Pas encore de description.'}
              </p>
            </div>
            <span className="font-fut uppercase text-center leading-none" style={{ fontSize: 10, letterSpacing: 2, color: GOLD, opacity: 0.5, marginTop: 12 }}>
              Double tap pour retourner
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BarberCard({ employee, stats = [], overall = null, logoUrl = '/logo.png', className = '', bio = '' }) {
  const left = stats.slice(0, Math.ceil(stats.length / 2));
  const right = stats.slice(Math.ceil(stats.length / 2));
  const title = (employee?.title || 'Barber').trim();
  const titleSize = title.length > 8 ? 11 : title.length > 5 ? 13 : 16;
  const reduceMotion = useReducedMotion();

  // Retournement au double tap
  const [flipped, setFlipped] = useState(false);
  const lastTapRef = useRef(0);
  const downPosRef = useRef(null);

  // Inclinaison 3D et reflet qui suivent le pointeur (souris ou doigt)
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const glareX = useMotionValue(0);
  const glareY = useMotionValue(0);
  const sRotateX = useSpring(rotateX, tiltSpring);
  const sRotateY = useSpring(rotateY, tiltSpring);
  const sGlareX = useSpring(glareX, tiltSpring);
  const sGlareY = useSpring(glareY, tiltSpring);

  const handlePointerMove = (e) => {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 18);
    rotateX.set(-py * 14);
    glareX.set(px * rect.width * 0.9);
    glareY.set(py * rect.height * 0.9);
  };
  const resetTilt = () => {
    rotateX.set(0);
    rotateY.set(0);
    glareX.set(0);
    glareY.set(0);
  };

  const handlePointerDown = (e) => {
    downPosRef.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerUp = (e) => {
    resetTilt();
    const down = downPosRef.current;
    const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 0;
    if (moved > 12) { lastTapRef.current = 0; return; }
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      setFlipped(f => !f);
      hapticFeedback();
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, rotateY: -14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      whileTap={{ scale: 0.98 }}
      className={`relative select-none ${className}`}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT, perspective: 900, transformStyle: 'preserve-3d', touchAction: 'manipulation' }}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerLeave={resetTilt}
      onPointerUp={handlePointerUp}
      onPointerCancel={resetTilt}
      onDoubleClick={(e) => e.preventDefault()}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: sRotateX, rotateY: sRotateY, transformStyle: 'preserve-3d' }}>
      {/* Retournement : les deux faces tournent ensemble, chacune cache son dos */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 20 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
      {/* Face avant */}
      <div
        className="absolute inset-0"
        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', pointerEvents: flipped ? 'none' : 'auto' }}
      >
        {/* Halo néon : le drop-shadow suit la forme découpée */}
        <div
          className="absolute inset-0"
          style={{ filter: NEON_SHADOW }}
        >
          {/* Liseré néon */}
          <div className="absolute inset-0" style={{ clipPath: CARD_SHAPE, background: NEON }}>
            {/* Corps de la carte */}
            <div
              className="absolute overflow-hidden"
              style={{
                inset: 3,
                clipPath: CARD_SHAPE,
                background: [
                  'radial-gradient(ellipse 58% 40% at 62% 26%, rgba(3,7,28,0.92) 0%, rgba(3,7,28,0.55) 45%, transparent 72%)',
                  'linear-gradient(165deg, #2a4fd6 0%, #1a35a8 30%, #0f2278 60%, #0a184f 100%)',
                ].join(', '),
              }}
            >
              <GoldShards />

              {/* Photo (fondu radial : le fond sombre de la photo se fond dans la carte).
                  layoutId : transition partagée depuis la vignette du carrousel de l'accueil */}
              <motion.div
                layoutId={employee?.id != null ? barberPhotoLayoutId(employee.id) : undefined}
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                className="absolute"
                style={{
                  left: 56, top: 4, width: 244, height: 246,
                  WebkitMaskImage: 'radial-gradient(ellipse 60% 64% at 52% 44%, #000 46%, transparent 98%)',
                  maskImage: 'radial-gradient(ellipse 60% 64% at 52% 44%, #000 46%, transparent 98%)',
                }}
              >
                {employee?.photo_url ? (
                  <img
                    src={employee.photo_url}
                    alt={employee.name}
                    draggable={false}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: '50% 12%' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="font-fut" style={{ fontSize: 120, fontWeight: 800, color: GOLD, opacity: 0.35 }}>
                      {employee?.name?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                )}
              </motion.div>

              {/* Note globale, titre, logo */}
              <div className="absolute flex flex-col items-center" style={{ left: 16, top: 24, width: 74 }}>
                <CountUp
                  value={overall}
                  delay={0.35}
                  duration={1.3}
                  className="font-fut leading-none tabular-nums"
                  style={{ fontSize: 66, fontWeight: 800, color: GOLD, textShadow: '0 2px 10px rgba(0,0,0,0.35)', opacity: overall == null ? 0.5 : 1 }}
                />
                <span
                  className="font-fut leading-none uppercase whitespace-nowrap"
                  style={{ fontSize: titleSize, fontWeight: 700, color: GOLD, letterSpacing: 1, marginTop: 4, maxWidth: 82, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {title}
                </span>
                <span className="block" style={{ width: 34, height: 1, background: GOLD_LINE, marginTop: 10 }} />
                <div
                  className="flex items-center justify-center rounded-full overflow-hidden"
                  style={{ width: 42, height: 42, marginTop: 10, background: 'rgba(255,255,255,0.10)', boxShadow: '0 0 0 1px rgba(246,231,173,0.35)' }}
                >
                  <img src={logoUrl} alt="D'Home Barber" draggable={false} className="w-[34px] h-[34px] object-contain" />
                </div>
              </div>

              {/* Bandeau nom */}
              <div className="absolute left-0 right-0 flex flex-col items-center" style={{ top: 238 }}>
                <span className="block" style={{ width: '62%', height: 1, background: GOLD_LINE }} />
                <span
                  className="font-fut uppercase leading-none px-3 text-center"
                  style={{ fontSize: 27, fontWeight: 800, color: GOLD, letterSpacing: 1.8, marginTop: 7, marginBottom: 7, maxWidth: '92%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                >
                  {employee?.name}
                </span>
                <span className="block" style={{ width: '62%', height: 1, background: GOLD_LINE }} />
              </div>

              {/* Stats : chaque chiffre monte de 0 à sa valeur, en cascade */}
              <div className="absolute left-0 right-0 flex justify-center" style={{ top: 292 }}>
                <div className="flex flex-col items-start" style={{ width: 96 }}>
                  {left.map((s, i) => <StatRow key={s.key} stat={s} delay={0.45 + i * 0.08} />)}
                </div>
                <span className="block self-stretch mx-3" style={{ width: 1, background: GOLD_LINE }} />
                <div className="flex flex-col items-start" style={{ width: 96 }}>
                  {right.map((s, i) => <StatRow key={s.key} stat={s} delay={0.5 + i * 0.08} />)}
                </div>
              </div>
              {stats.length === 0 && (
                <p className="absolute left-0 right-0 text-center font-fut uppercase" style={{ top: 318, fontSize: 14, color: GOLD, opacity: 0.6, letterSpacing: 1 }}>
                  Stats à venir
                </p>
              )}
              <span className="absolute block" style={{ left: '19%', width: '62%', height: 1, top: 392, background: GOLD_LINE }} />

              {/* Reflet holographique : balayage à l'arrivée */}
              {!reduceMotion && (
                <motion.div
                  aria-hidden="true"
                  initial={{ x: '-140%' }}
                  animate={{ x: '340%' }}
                  transition={{ delay: 0.55, duration: 1.15, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute pointer-events-none"
                  style={{
                    top: '-20%', bottom: '-20%', left: 0, width: '34%', skewX: -18,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.42) 50%, rgba(134,247,230,0.28) 60%, transparent 100%)',
                    mixBlendMode: 'screen',
                  }}
                />
              )}
              {/* Reflet qui suit le pointeur */}
              <motion.div
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{
                  inset: '-40%', x: sGlareX, y: sGlareY,
                  background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.08) 22%, transparent 48%)',
                  mixBlendMode: 'screen',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Face arrière : description du barber */}
      <div
        className="absolute inset-0"
        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', pointerEvents: flipped ? 'auto' : 'none' }}
      >
        <CardBack employee={employee} bio={bio} logoUrl={logoUrl} />
      </div>
      </motion.div>
      </motion.div>
    </motion.div>
  );
}
