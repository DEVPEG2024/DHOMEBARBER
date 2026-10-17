/**
 * Carte Gang : dessin et couleurs, repris de la maquette validée par le salon
 * (écusson 300 × 440, une palette par niveau et par édition limitée).
 *
 * Les dégradés sont décrits une seule fois sous forme d'objets
 * ({ type: 'linear', angle, stops } / { type: 'conic', from, stops }) : la carte
 * React en tire les chaînes CSS, l'image story (canvas, src/lib/gangStory.js)
 * les redessine à l'identique.
 */

/** Taille de construction de la carte (px). Tout est mis à l'échelle à partir de là. */
export const GANG_CARD_WIDTH = 300;
export const GANG_CARD_HEIGHT = 440;

/** Contour de l'écusson dans le repère 300 × 440 (clip-path CSS et Path2D du canvas). */
export const GANG_SHIELD_PATH =
  'M0 50 Q0 36 14 34 C34 31 40 18 46 9 Q51 0 62 0 L238 0 Q249 0 254 9 C260 18 266 31 286 34 Q300 36 300 50 L300 350 Q300 362 290 368 L162 434 Q150 440 138 434 L10 368 Q0 362 0 350 Z';

/** Le fond intérieur est l'écusson réduit autour de ce point (liseré visible tout autour). */
export const GANG_INNER_SCALE = { x: 0.958, y: 0.971, originX: 0.5, originY: 0.47 };

/** Silhouette en buste (repère 200 × 206), à la place d'une photo absente. */
export const GANG_BUST_PATHS = {
  body: 'M100 34c-23 0-38 16-38 39 0 15 6 27 14 34-25 7-46 26-52 58l-4 41h160l-4-41c-6-32-27-51-52-58 8-7 14-19 14-34 0-23-15-39-38-39z',
  hair: 'M63 62c4-19 18-30 37-30 20 0 34 11 38 30-11-8-24-11-38-11-14 0-26 3-37 11z',
  collar: 'M70 168c9 9 19 13 30 13s21-4 30-13l-4 38H74z',
};

/** Fraîcheur sous ce seuil : la stat FRA passe en rouge (il est temps de revenir). */
export const GANG_FRESHNESS_LOW = 50;
export const GANG_LOW_COLOR = '#ff5b4d';

// ── Dégradés ────────────────────────────────────────────────────────────────

/** Arrêts répartis régulièrement quand la maquette ne donne pas de position. */
const spread = (colors) => colors.map((c, i) => (Array.isArray(c) ? c : [c, colors.length === 1 ? 0 : i / (colors.length - 1)]));
const lin = (angle, colors) => ({ type: 'linear', angle, stops: spread(colors) });
const conic = (from, colors) => ({ type: 'conic', from, stops: spread(colors) });

/** Objet dégradé (ou couleur unie) → valeur CSS. */
export function gangGradientCss(g) {
  if (!g || typeof g === 'string') return g || 'transparent';
  const stops = g.stops.map(([c, p]) => `${c} ${+(p * 100).toFixed(2)}%`).join(', ');
  if (g.type === 'conic') return `conic-gradient(from ${g.from}deg, ${stops})`;
  return `linear-gradient(${g.angle}deg, ${stops})`;
}

/** Trame horizontale de l'édition Drop (posée par-dessus le fond). */
const SCANLINES_CSS = 'repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 4px)';

// ── Palettes (objet `C` de la maquette) ─────────────────────────────────────
// border : liseré · bg : fond · band / band2 : bandes diagonales · arc / arc2 : arcs
// ink : texte · accent : abréviations, filets · gem / gemInk : pastille du niveau
// holo : reflet irisé (0 = aucun) · glare : intensité du reflet blanc

const TIER_RAW = {
  bronze: {
    label: 'Bronze', code: 'BRZ', fx: 'bronze', stars: 1,
    border: lin(160, ['#e7a46d', '#8c4f27']),
    bg: lin(165, [['#3a2418', 0], ['#1f130c', 0.55], ['#120a06', 1]]),
    band: 'rgba(214,138,84,.16)', band2: 'rgba(214,138,84,.1)', arc: 'rgba(224,154,98,.35)', arc2: 'rgba(224,154,98,.2)',
    ink: '#fbeee2', accent: '#e39b62', gem: '#b06a38', gemInk: '#fff1e4',
  },
  argent: {
    label: 'Argent', code: 'ARG', fx: 'argent', stars: 2,
    border: lin(160, ['#ffffff', '#9aa4ae']),
    bg: lin(165, [['#3a4148', 0], ['#20252a', 0.55], ['#121518', 1]]),
    band: 'rgba(220,228,236,.13)', band2: 'rgba(220,228,236,.08)', arc: 'rgba(220,228,236,.35)', arc2: 'rgba(220,228,236,.18)',
    ink: '#ffffff', accent: '#c7d2dc', gem: '#c7d2dc', gemInk: '#1b2025',
  },
  or: {
    label: 'Or', code: 'OR', fx: 'or', stars: 3,
    border: lin(160, ['#fff0b0', '#c7962c', '#8a6418']),
    bg: lin(165, [['#2e2614', 0], ['#18140a', 0.55], ['#0c0a05', 1]]),
    band: 'rgba(231,196,99,.16)', band2: 'rgba(231,196,99,.1)', arc: 'rgba(231,196,99,.45)', arc2: 'rgba(231,196,99,.22)',
    ink: '#ffffff', accent: '#e8c463', gem: '#e8c463', gemInk: '#2a1f05',
  },
  orrare: {
    label: 'Or holo', code: 'HOLO', fx: 'orrare', stars: 4,
    border: conic(210, ['#ffe9a6', '#ff9ad8', '#9af0ff', '#ffe9a6', '#c7962c', '#ffe9a6']),
    bg: lin(165, [['#3a2e10', 0], ['#1d170a', 0.55], ['#0d0a04', 1]]),
    band: 'rgba(255,216,107,.18)', band2: 'rgba(255,216,107,.1)', arc: 'rgba(255,216,107,.5)', arc2: 'rgba(255,154,216,.28)',
    ink: '#ffffff', accent: '#ffd86b', gem: lin(120, ['#ffd86b', '#ff9ad8', '#9af0ff']), gemInk: '#20170a', holo: 0.14, glare: 0.3,
  },
  tots: {
    label: 'Team of the Season', short: 'TOTS', code: 'TOTS', fx: 'tots', stars: 5,
    border: lin(160, ['#ff5a6a', '#c3182d']),
    bg: lin(165, [['#2448c4', 0], ['#16308f', 0.5], ['#0b1a55', 1]]),
    band: 'rgba(120,180,255,.16)', band2: 'rgba(120,180,255,.1)', arc: 'rgba(130,200,255,.45)', arc2: 'rgba(130,200,255,.25)',
    ink: '#ffffff', accent: '#7fd0ff', gem: '#e43a4f', gemInk: '#ffffff', glare: 0.28,
  },
  icone: {
    label: 'Icône', code: 'ICON', fx: 'icone', stars: 6,
    border: conic(0, ['#ffffff', '#d9c8ff', '#c9f3ff', '#fff1c9', '#ffffff']),
    bg: lin(165, [['#f6f3ee', 0], ['#e7e4f0', 0.55], ['#d6d3e3', 1]]),
    band: 'rgba(140,110,255,.1)', band2: 'rgba(120,200,220,.12)', arc: 'rgba(140,110,255,.35)', arc2: 'rgba(120,200,220,.3)',
    ink: '#14151f', accent: '#7a5cf0', gem: lin(120, ['#d9c8ff', '#c9f3ff', '#fff1c9']), gemInk: '#14151f', holo: 0.55, glare: 0.35,
  },
};

const EDITION_RAW = {
  first: {
    label: 'Première coupe', code: '1RE',
    border: lin(160, ['#7cf0b8', '#1f9d63']),
    bg: lin(165, [['#163a2b', 0], ['#0d2219', 0.55], ['#07130e', 1]]),
    band: 'rgba(63,207,142,.16)', band2: 'rgba(63,207,142,.1)', arc: 'rgba(63,207,142,.45)', arc2: 'rgba(63,207,142,.22)',
    ink: '#ffffff', accent: '#4fdc9b', gem: '#3fcf8e', gemInk: '#06261a',
  },
  anniv: {
    label: 'Anniversaire', code: 'B-DAY', fx: 'anniv',
    border: lin(170, [['#9dffe0', 0], ['#2ee6b0', 0.4], ['#0e6b52', 0.8], ['#2ee6b0', 1]]),
    bg: lin(170, ['#0d1512', '#050606']),
    band: 'rgba(46,230,176,.08)', band2: 'rgba(225,38,44,.1)', arc: 'rgba(46,230,176,.3)', arc2: 'rgba(225,38,44,.22)',
    ink: '#ffffff', accent: '#2ee6b0', gem: lin(120, ['#2ee6b0', '#0e6b52']), gemInk: '#04140f',
  },
  drop: {
    label: 'Édition Drop', code: 'DROP',
    border: lin(160, ['#ffffff', '#6b6b6b']),
    bg: lin(165, [['#222222', 0], ['#121212', 0.55], ['#070707', 1]]), scanlines: true,
    band: 'rgba(255,255,255,.08)', band2: 'rgba(255,255,255,.05)', arc: 'rgba(255,255,255,.3)', arc2: 'rgba(255,255,255,.14)',
    ink: '#ffffff', accent: '#bdbdbd', gem: '#ffffff', gemInk: '#111111',
  },

  // ── Éditions de saison (décidées par le serveur, date de Paris) ──
  // `decor` : décor propre à la saison (GANG_SEASON_DECOR), animé sur une grande carte.
  halloween: {
    label: 'Halloween', code: 'HWN', decor: 'bats', fx: 'halloween',
    border: lin(170, ['#ff8a1f', '#7b2fd6']),
    bg: lin(170, ['#1d1020', '#0a0508']),
    band: 'rgba(255,128,26,.15)', band2: 'rgba(139,92,246,.13)', arc: 'rgba(255,128,26,.42)', arc2: 'rgba(139,92,246,.3)',
    ink: '#fff3e6', accent: '#ff8a1f', gem: lin(120, ['#ffa340', '#e2560f']), gemInk: '#1c0a02',
  },
  noel: {
    label: 'Noël', code: 'XMAS', decor: 'snow', fx: 'noel',
    border: lin(170, ['#f2d27a', '#b8141e', '#f2d27a']),
    bg: lin(170, ['#6e0f17', '#2b0508']),
    band: 'rgba(38,140,88,.2)', band2: 'rgba(240,200,90,.12)', arc: 'rgba(240,200,90,.4)', arc2: 'rgba(255,255,255,.16)',
    ink: '#fff8ec', accent: '#f2d27a', gem: lin(120, ['#f7dd8a', '#c8962c']), gemInk: '#3a0c14',
  },
  nouvel_an: {
    label: 'Nouvel An', code: 'NY', decor: 'stars', fx: 'nouvel_an',
    border: lin(170, [['#fff3c4', 0], ['#c9a227', 0.35], ['#fff3c4', 0.6], ['#9c7a12', 1]]),
    bg: lin(170, ['#12152a', '#05060c']),
    band: 'rgba(242,201,76,.12)', band2: 'rgba(232,226,255,.08)', arc: 'rgba(242,201,76,.4)', arc2: 'rgba(242,201,76,.18)',
    ink: '#fffaf0', accent: '#f2c94c', gem: lin(120, ['#fff3c4', '#c9a227']), gemInk: '#1a1405', glare: 0.28,
  },
  fete_peres: {
    label: 'Fête des pères', code: 'PAPA', decor: 'stars',
    border: lin(160, ['#f2b98e', '#b8693a', '#6b3518']),
    bg: lin(165, [['#1e2d4f', 0], ['#121c34', 0.55], ['#080e1c', 1]]),
    band: 'rgba(200,124,74,.16)', band2: 'rgba(122,70,38,.22)', arc: 'rgba(214,140,92,.42)', arc2: 'rgba(214,140,92,.2)',
    ink: '#f8f2eb', accent: '#dd915f', gem: lin(120, ['#eaa676', '#9a5530']), gemInk: '#1b1208',
  },
  ete: {
    label: 'Été', code: 'SUN', decor: 'sun',
    border: lin(160, ['#ffd84a', '#ff7a3d', '#ff4f8b', '#8b5cf6']),
    bg: lin(165, [['#c4532a', 0], ['#a52f5c', 0.4], ['#4e2079', 0.78], ['#200f3a', 1]]),
    band: 'rgba(255,216,74,.16)', band2: 'rgba(255,255,255,.09)', arc: 'rgba(255,216,74,.5)', arc2: 'rgba(255,140,190,.32)',
    ink: '#ffffff', accent: '#ffd84a', gem: lin(120, ['#ffe36b', '#ffa51f']), gemInk: '#3a1405', glare: 0.26,
  },
};

/** Clés des éditions de saison (pour l'aperçu, l'admin…). */
export const GANG_SEASON_EDITIONS = ['halloween', 'noel', 'nouvel_an', 'fete_peres', 'ete'];

/** Écusson gris du client sans visite (GangCardPlaceholder). */
const PLACEHOLDER_RAW = {
  label: 'Carte Gang', code: '',
  border: lin(160, ['#c3c8cd', '#6f757c']),
  bg: lin(165, [['#3a3e43', 0], ['#24272b', 0.55], ['#16181b', 1]]),
  band: 'rgba(220,224,228,.08)', band2: 'rgba(220,224,228,.05)', arc: 'rgba(220,224,228,.2)', arc2: 'rgba(220,224,228,.1)',
  ink: '#e9ebed', accent: '#9aa1a8', gem: '#6f757c', gemInk: '#ffffff',
};

/** Palette brute → palette prête à l'emploi (chaînes CSS + dégradés d'origine dans `grad`). */
function build(key, kind, raw) {
  return {
    ...raw,
    key,
    kind,
    short: raw.short || null,
    border: gangGradientCss(raw.border),
    bg: raw.scanlines ? `${SCANLINES_CSS}, ${gangGradientCss(raw.bg)}` : gangGradientCss(raw.bg),
    gem: gangGradientCss(raw.gem),
    holo: raw.holo || 0,
    glare: raw.glare ?? 0.22,
    scanlines: !!raw.scanlines,
    decor: raw.decor || null,
    fx: raw.fx || null,
    stars: raw.stars || 0,
    grad: { border: raw.border, bg: raw.bg, gem: raw.gem },
  };
}

export const GANG_TIER_PALETTES = Object.fromEntries(Object.entries(TIER_RAW).map(([k, v]) => [k, build(k, 'tier', v)]));
export const GANG_EDITION_PALETTES = Object.fromEntries(Object.entries(EDITION_RAW).map(([k, v]) => [k, build(k, 'edition', v)]));
export const GANG_PLACEHOLDER_PALETTE = build('placeholder', 'placeholder', PLACEHOLDER_RAW);

/**
 * Palette d'une carte : l'édition limitée (anniversaire, saison, première coupe,
 * drop) prime sur le niveau ; niveau inconnu → bronze.
 * Champs : key, kind ('tier' | 'edition'), label, short, code (texte de la
 * pastille : BRZ, ARG, OR, HOLO, TOTS, ICON, 1RE, B-DAY, DROP, HWN, XMAS, PAPA, SUN),
 * border, bg, band, band2, arc, arc2, ink, accent, gem, gemInk, holo, glare,
 * scanlines, decor ('snow' | 'bats' | 'stars' | 'sun' | null : décor immobile de la story, et de la carte
 * quand la palette n'a pas d'effets), fx (effets animés de GangFx.jsx : un par niveau, plus Halloween,
 * Noël, Nouvel An, anniversaire), stars (1 à 6 étoiles sous la note, niveaux seulement), grad.
 */
export function gangPalette(card) {
  const edition = card?.edition && GANG_EDITION_PALETTES[card.edition];
  if (edition) return edition;
  return GANG_TIER_PALETTES[card?.tier] || GANG_TIER_PALETTES.bronze;
}

/** Libellé du bas de la carte (« TOTS » plutôt que « Team of the Season »). */
export const gangTierLabel = (palette) => palette.short || palette.label;

/**
 * Libellé du bas de la carte d'un client : le niveau, suivi de « ÉDITION LIMITÉE » pendant une
 * édition à effets (le niveau reste lisible pendant Halloween, Noël…).
 */
export function gangCardFootLabel(card, palette) {
  if (palette.kind !== 'edition' || !palette.fx) return gangTierLabel(palette);
  const tier = GANG_TIER_PALETTES[card?.tier] || GANG_TIER_PALETTES.bronze;
  return `${gangTierLabel(tier)} · Édition limitée`;
}

/** Décor du fond intérieur : bandes diagonales puis arcs (CSS de `.inner::before` de la maquette). */
export function gangDecorCss(p) {
  return [
    `linear-gradient(118deg, transparent 0 46%, ${p.band} 46% 52%, transparent 52% 60%, ${p.band2} 60% 63%, transparent 63%)`,
    `radial-gradient(circle at 104% 30%, transparent 0 118px, ${p.arc} 119px 122px, transparent 124px 160px, ${p.arc2} 161px 162px, transparent 163px)`,
  ].join(', ');
}

// ── Décors de saison ────────────────────────────────────────────────────────
// Positions fixes (tirées d'un générateur à graine) dans le repère 300 × 440 : la carte
// les anime (GangCard.jsx, transform / opacity), l'image de story les dessine immobiles
// à la position `y` (lib/gangStory.js). 10 à 16 éléments par saison.

/** Générateur pseudo-aléatoire à graine (mulberry32) : même décor à chaque affichage. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round1 = (v) => Math.round(v * 10) / 10;

/** Chauve-souris (repère 24 × 10, symétrique autour de x = 12). */
export const GANG_BAT_PATH =
  'M12 4.2 L11.1 2.6 L11.4 4.4 C9 3.4 4.8 2.4 0 3.4 C2 4.2 3 5.6 3.2 7.2 C4.2 6.2 5.8 6.2 6.6 7.4 C7.4 6.4 9 6.4 9.8 7.6 C10.6 7.2 11.4 7.6 12 9 C12.6 7.6 13.4 7.2 14.2 7.6 C15 6.4 16.6 6.4 17.4 7.4 C18.2 6.2 19.8 6.2 20.8 7.2 C21 5.6 22 4.2 24 3.4 C19.2 2.4 15 3.4 12.6 4.4 L12.9 2.6 Z';
/** Chauve-souris violette cerclée d'orange (visible sur le fond noir d'Halloween). */
export const GANG_BAT_FILL = '#3a1a5c';
export const GANG_BAT_STROKE = 'rgba(255,138,31,.85)';
/** Étoile à quatre branches (repère 10 × 10). */
export const GANG_STAR_PATH = 'M5 0 L6.1 3.9 L10 5 L6.1 6.1 L5 10 L3.9 6.1 L0 5 L3.9 3.9 Z';

function makeSeasonDecor() {
  // Noël : 14 flocons qui tombent (x, hauteur de départ, rayon, opacité, durée de chute)
  const r1 = seeded(1225);
  const snow = Array.from({ length: 14 }, (_, i) => ({
    x: round1(12 + ((i + r1() * 0.8) / 14) * 276),
    y: round1(20 + r1() * 400),
    r: round1(1.3 + r1() * 2),
    o: round1(0.5 + r1() * 0.45),
    dur: round1(7 + r1() * 5),
  }));
  // Halloween : 5 chauves-souris, 6 lucioles orange
  const r2 = seeded(3110);
  const bats = [
    { x: 196, y: 30, s: 1.45 }, { x: 254, y: 78, s: 1.1 }, { x: 110, y: 24, s: 1 },
    { x: 34, y: 200, s: 1.15 }, { x: 266, y: 196, s: 0.95 },
  ].map((b) => ({ ...b, dur: round1(5 + r2() * 3), flap: round1(0.32 + r2() * 0.16) }));
  const fireflies = Array.from({ length: 6 }, (_, i) => ({
    x: round1(22 + ((i + r2()) / 6) * 256),
    y: round1(150 + r2() * 250),
    r: round1(1.6 + r2() * 1.2),
    dur: round1(3 + r2() * 2.4),
  }));
  // Fête des pères : 12 étoiles cuivre discrètes, sur les bords et le haut
  const r3 = seeded(1906);
  const stars = Array.from({ length: 12 }, (_, i) => {
    const side = i % 3; // 0 : haut, 1 : bord gauche, 2 : bord droit
    return {
      x: round1(side === 0 ? 100 + r3() * 170 : side === 1 ? 14 + r3() * 26 : 258 + r3() * 26),
      y: round1(side === 0 ? 16 + r3() * 60 : 120 + r3() * 230),
      s: round1(6 + r3() * 7),
      dur: round1(2.6 + r3() * 2.2),
    };
  });
  // Été : soleil en haut à droite, rayons qui tournent lentement, 6 reflets qui montent
  const r4 = seeded(2106);
  const sparkles = Array.from({ length: 6 }, (_, i) => ({
    x: round1(30 + ((i + r4()) / 6) * 240),
    y: round1(250 + r4() * 140),
    r: round1(1.4 + r4() * 1.2),
    dur: round1(4.5 + r4() * 3),
  }));
  return {
    snow,
    bats,
    fireflies,
    stars,
    sun: { cx: 250, cy: 58, rays: 24, rayAlpha: 0.13, rayRadius: 190, dur: 70 },
    sparkles,
  };
}

/** Géométrie des décors de saison (repère 300 × 440). */
export const GANG_SEASON_DECOR = makeSeasonDecor();

// ── Stats ───────────────────────────────────────────────────────────────────

/** Clés de données dans l'ordre d'affichage : colonne gauche FID, REG, PON ; droite STY, GNG, FRA. */
export const GANG_STAT_KEYS = ['FID', 'REG', 'PON', 'STY', 'GNG', 'FRA'];
export const GANG_STAT_COLUMNS = [GANG_STAT_KEYS.slice(0, 3), GANG_STAT_KEYS.slice(3)];

/** Abréviation affichée, nom et explication de chaque stat. */
export const GANG_STAT_LABELS = {
  FID: { abbr: 'FID', name: 'Fidélité', description: 'Nombre de visites et ancienneté au salon.' },
  REG: { abbr: 'RÉG', name: 'Régularité', description: 'Revient-il à un rythme régulier ?' },
  PON: { abbr: 'PON', name: 'Ponctualité', description: 'Ni absence ni annulation de ta part (un rendez-vous déplacé ne compte pas).' },
  STY: { abbr: 'STY', name: 'Style', description: 'Variété et prestations soignées : barbe, rasoir, serviette chaude.' },
  GNG: { abbr: 'GNG', name: 'Gang', description: 'Avis, publications dans le fil, événements du salon.' },
  FRA: { abbr: 'FRA', name: 'Fraîcheur', description: 'Baisse chaque jour depuis la dernière coupe, passe en rouge quand il est temps de revenir.' },
};

export const gangStatAbbr = (key) => GANG_STAT_LABELS[key]?.abbr || key;

/** Valeur affichable d'une stat (« – » si absente). */
export function gangStatValue(card, key) {
  const v = card?.stats?.[key];
  return Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null;
}

export const isGangStatLow = (key, value) => key === 'FRA' && value != null && value < GANG_FRESHNESS_LOW;

/** Note globale : celle du serveur, sinon la moyenne des stats renseignées. */
export function gangScore(card) {
  const s = Number(card?.score);
  if (card?.score != null && Number.isFinite(s)) return Math.round(s);
  const values = GANG_STAT_KEYS.map((k) => gangStatValue(card, k)).filter((v) => v != null);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

// ── Textes du verso ─────────────────────────────────────────────────────────

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « il y a 9 j », « aujourd'hui », « – ». */
export function gangLastVisitLabel(days) {
  if (days == null || days === '' || !Number.isFinite(Number(days))) return '–';
  const n = Math.max(0, Math.round(Number(days)));
  return n === 0 ? "aujourd'hui" : `il y a ${n} j`;
}

/** « oct. 2026 » depuis AAAA-MM-JJ (lu sans fuseau). */
export function gangSinceLabel(date) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date || ''));
  if (!m) return '–';
  const month = MONTHS_SHORT[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : '–';
}

/** Texte de progression : « Or dans 3 visites », « Niveau maximum ». */
export function gangNextLabel(next) {
  if (!next) return 'Niveau maximum';
  const label = next.label || next.tier || 'Niveau suivant';
  const n = Number(next.visits_needed);
  if (Number.isFinite(n) && n > 0) return `${label} dans ${n} visite${n > 1 ? 's' : ''}`;
  return `Prochain niveau : ${label}`;
}

export const gangNextProgress = (next) =>
  (next ? Math.max(0, Math.min(100, Number(next.progress) || 0)) : 100);

/** « N° 0142 », ou null sans numéro de collection. */
export function gangSerialLabel(serial) {
  if (serial == null || serial === '') return null;
  const s = String(serial);
  return `N° ${/^\d+$/.test(s) ? s.padStart(4, '0') : s}`;
}

/**
 * Photo fondue dans la carte : ovale doux sur tous les bords (comme les cartes des barbers),
 * jamais de bord net. Zone dans le repère 300 × 440 ; le masque s'éteint avant les bords de la zone.
 * Partagé par la carte (GangCard.jsx) et l'image de story (lib/gangStory.js).
 */
export const GANG_PHOTO_BOX = { left: 58, top: 10, width: 234, height: 238 };
/** Voile du pourtour de la photo : efface le fond de la photo (mur, pièce) dans la couleur de la carte. */
export const gangPhotoVeil = (p) => (p && p.key === 'icone' ? 'rgba(240,237,246,1)' : 'rgba(8,8,10,.45)');
/** Début du voile (part du rayon restée nette autour du visage) : plus tôt sur la carte claire. */
export const gangPhotoVeilStart = (p) => (p && p.key === 'icone' ? 0.28 : 0.38);
export const GANG_PHOTO_MASK = { cx: 0.54, cy: 0.42, rx: 0.46, ry: 0.52, stops: [[0, 1], [0.42, 1], [0.66, 0.5], [0.86, 0.12], [1, 0]] };
