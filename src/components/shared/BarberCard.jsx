import React from 'react';
import { motion } from 'framer-motion';

/**
 * Carte de barber façon FUT (FIFA Ultimate Team, style « Team of the Season ») :
 * note globale, titre, logo du salon, photo, bandeau nom et six stats.
 *
 * Les stats viennent des compétences saisies par le barber (niveau 0 à 5 par
 * catégorie, voir Mes paramètres) converties sur l'échelle FUT ; la note
 * globale est la moyenne des stats renseignées. Une compétence non évaluée
 * s'affiche « – ».
 */

export const CARD_WIDTH = 300;
export const CARD_HEIGHT = 470;

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

function StatRow({ stat }) {
  const filled = stat.value != null;
  return (
    <div className="flex items-baseline gap-1.5 h-[30px]" title={stat.label}>
      <span
        className="font-fut tabular-nums leading-none"
        style={{ fontSize: 25, fontWeight: 800, color: GOLD, opacity: filled ? 1 : 0.45, minWidth: 34, textAlign: 'right' }}
      >
        {filled ? stat.value : '–'}
      </span>
      <span className="font-fut leading-none" style={{ fontSize: 17, fontWeight: 600, color: GOLD, letterSpacing: 0.5 }}>
        {stat.abbr}
      </span>
    </div>
  );
}

export default function BarberCard({ employee, stats = [], overall = null, logoUrl = '/logo.png', className = '' }) {
  const left = stats.slice(0, Math.ceil(stats.length / 2));
  const right = stats.slice(Math.ceil(stats.length / 2));
  const title = (employee?.title || 'Barber').trim();
  const titleSize = title.length > 8 ? 11 : title.length > 5 ? 13 : 16;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, rotateY: -14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      whileHover={{ rotateY: 5, rotateX: -3 }}
      whileTap={{ scale: 0.98 }}
      className={`relative select-none ${className}`}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT, perspective: 900, transformStyle: 'preserve-3d' }}
    >
      {/* Halo néon : le drop-shadow suit la forme découpée */}
      <div
        className="absolute inset-0"
        style={{ filter: `drop-shadow(0 0 3px ${NEON}) drop-shadow(0 0 14px rgba(134,247,230,0.55)) drop-shadow(0 12px 28px rgba(0,0,0,0.6))` }}
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

            {/* Photo (fondu radial : le fond sombre de la photo se fond dans la carte) */}
            <div
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
            </div>

            {/* Note globale, titre, logo */}
            <div className="absolute flex flex-col items-center" style={{ left: 16, top: 24, width: 74 }}>
              <span
                className="font-fut leading-none tabular-nums"
                style={{ fontSize: 66, fontWeight: 800, color: GOLD, textShadow: '0 2px 10px rgba(0,0,0,0.35)', opacity: overall == null ? 0.5 : 1 }}
              >
                {overall ?? '–'}
              </span>
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

            {/* Stats */}
            <div className="absolute left-0 right-0 flex justify-center" style={{ top: 292 }}>
              <div className="flex flex-col items-start" style={{ width: 96 }}>
                {left.map(s => <StatRow key={s.key} stat={s} />)}
              </div>
              <span className="block self-stretch mx-3" style={{ width: 1, background: GOLD_LINE }} />
              <div className="flex flex-col items-start" style={{ width: 96 }}>
                {right.map(s => <StatRow key={s.key} stat={s} />)}
              </div>
            </div>
            {stats.length === 0 && (
              <p className="absolute left-0 right-0 text-center font-fut uppercase" style={{ top: 318, fontSize: 14, color: GOLD, opacity: 0.6, letterSpacing: 1 }}>
                Stats à venir
              </p>
            )}
            <span className="absolute block" style={{ left: '19%', width: '62%', height: 1, top: 392, background: GOLD_LINE }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
