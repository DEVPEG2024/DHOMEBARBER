/**
 * Helpers de la page Prestations : icône par nature de prestation, formules, nouveautés,
 * prestations populaires, recherche, formats de durée et de prix.
 * Aucun appel réseau ici : la page fournit les données, ces fonctions sont pures.
 */
import { Scissors, Palette, Sparkles, Baby, Zap, Gift } from 'lucide-react';

/** Courbe « signature » de l'app (sortie très douce). */
export const EASE = [0.16, 1, 0.3, 1];

/** Une prestation est « Nouveau » pendant ce nombre de jours après sa création. */
export const NEW_DAYS = 30;

/** Nombre de badges « Populaire ». */
export const POPULAR_COUNT = 3;

/** En dessous de ce nombre de rendez-vous exploitables, on ne se fie pas au comptage (repli `sort_order`). */
export const POPULAR_MIN_SAMPLE = 5;

/** Identifiant du groupe des prestations sans catégorie (ou de catégorie inactive). */
export const OTHER_GROUP_ID = '__other__';

/** Minuscules sans accents, pour la recherche et les mots-clés. */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Nature d'une prestation, déduite de mots-clés dans son nom puis dans celui de sa catégorie.
 * Chaque nature porte une icône (lucide) ou un emoji, un libellé et une teinte.
 */
export const KINDS = {
  formula: { Icon: Gift, label: 'Formule', tone: 'text-amber-400 bg-amber-500/12' },
  kids: { Icon: Baby, label: 'Enfant', tone: 'text-sky-400 bg-sky-500/12' },
  color: { Icon: Palette, label: 'Coloration', tone: 'text-fuchsia-400 bg-fuchsia-500/12' },
  care: { Icon: Sparkles, label: 'Soin', tone: 'text-emerald-400 bg-emerald-500/12' },
  clipper: { Icon: Zap, label: 'Tondeuse', tone: 'text-orange-400 bg-orange-500/12' },
  beard: { emoji: '🧔', label: 'Barbe', tone: 'text-primary bg-primary/12' },
  cut: { Icon: Scissors, label: 'Coupe', tone: 'text-primary bg-primary/12' },
};

const KIND_PATTERNS = [
  ['formula', /\b(formule|pack|forfait|combo|duo|trio)\b/],
  // « moins de 6 ans », « - 18 ans », « à partir de 7 ans » (mais pas « Coupe Homme + 18 ans ») :
  // sans eux, « Ajoute la coupe » proposait la coupe des moins de 6 ans, la moins chère
  ['kids', /\b(enfant|enfants|kid|kids|junior|ado|ados|petit|petits|gamin)\b|moins de \d+ ans|(^|\s)-\s?\d+ ans|a partir de \d+ ans/],
  ['color', /(colo|coloration|meche|meches|decolo|blond|teint|balayage|patine|gris)/],
  ['care', /(soin|masque|gommage|hydrat|visage|spa|detente|massage|vapeur|serviette chaude)/],
  ['clipper', /(tondeuse|fade|degrade|taper|skin|contour)/],
  ['beard', /(barbe|beard|moustache|rasage|bouc)/],
  ['cut', /(coupe|ciseau|ciseaux|cheveux|coiff|shampo|brushing)/],
];

/** Mots d'une coupe et d'une barbe (texte déjà normalisé), pour reconnaître les formules « coupe + barbe ». */
const CUT_WORD = /\bcoupes?\b/;
const BEARD_WORD = /\b(barbe|moustache|bouc)\b/;
/** Carte de plusieurs coupes (« 4 coupes + barbe premium ») : un abonnement, pas une visite. */
const MULTI_CUT_PACK = /^\d+\s*coupes\b/;

/**
 * Formule « coupe + barbe » : le nom enchaîne plusieurs prestations par « + », dont une coupe et
 * une barbe (« Coupe + Barbe premium », « Coupe Homme + taille de barbe à la tondeuse »).
 * Pas de faux positif sur « Coupe Homme + 18 ans » (pas de barbe), « Rasage de tête + barbe »
 * (pas de coupe), « Rituel barbe (taille + rasage…) » ni sur les cartes de plusieurs coupes.
 */
export function isCutBeardCombo(name) {
  const t = normalizeText(name);
  if (!t.includes('+') || MULTI_CUT_PACK.test(t)) return false;
  const parts = t.split('+');
  return parts.some(p => CUT_WORD.test(p)) && parts.some(p => BEARD_WORD.test(p));
}

function detectKind(text) {
  const t = normalizeText(text);
  if (!t) return null;
  // « Coupe + barbe » : une formule (icône cadeau), même sans le mot « formule »
  if (isCutBeardCombo(t)) return 'formula';
  let found = null;
  for (const [kind, re] of KIND_PATTERNS) {
    if (re.test(t)) { found = kind; break; }
  }
  // « Coupe + barbe » : la coupe prime (ciseaux), la barbe seule garde son emoji
  if (found === 'beard' && KIND_PATTERNS.find(([k]) => k === 'cut')[1].test(t)) return 'cut';
  return found;
}

/** Nature d'une prestation : mots-clés du nom, sinon de la catégorie, sinon « coupe ». */
export function serviceKind(service, categoryName) {
  return detectKind(service?.name) || detectKind(categoryName) || 'cut';
}

/** Icône d'une catégorie (par son nom) pour les en-têtes et les chips. */
export function categoryKind(categoryName) {
  return detectKind(categoryName) || 'cut';
}

/**
 * Formule : nom qui contient « formule », « pack » (ou équivalent), ou qui réunit une coupe et une
 * barbe (`isCutBeardCombo`). Le catalogue du salon n'emploie aucun de ces mots : sans la seconde
 * règle, aucune formule n'était reconnue et « Passe à la formule » ne se déclenchait jamais.
 */
export function isFormula(service) {
  return KIND_PATTERNS[0][1].test(normalizeText(service?.name)) || isCutBeardCombo(service?.name);
}

/** Coupe seule : une coupe sans barbe dans le nom, ni formule, ni carte de plusieurs coupes. */
export function isPlainCut(service) {
  const t = normalizeText(service?.name);
  return CUT_WORD.test(t) && !BEARD_WORD.test(t) && !MULTI_CUT_PACK.test(t) && !isFormula(service);
}

/** Barbe seule : barbe, moustache ou rasage, sans coupe ni tête rasée, et pas une teinture. */
export function isPlainBeard(service) {
  const t = normalizeText(service?.name);
  return (BEARD_WORD.test(t) || /\brasage\b/.test(t))
    && !CUT_WORD.test(t) && !/\b(tete|crane)\b/.test(t) && !/(teint|colo)/.test(t) && !isFormula(service);
}

/** Mots trop courants pour distinguer deux prestations (« Coupe Homme » / « Coupe premium »). */
const GENERIC_WORDS = new Set(['coupe', 'coupes', 'barbe', 'avec', 'sans', 'pour', 'les', 'des', 'aux', 'ans', 'moins', 'partir', 'plus', 'inclus']);

function distinctiveWords(name) {
  return new Set(
    normalizeText(name).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !GENERIC_WORDS.has(w)),
  );
}

/**
 * « Passe à la formule » : une coupe et une barbe choisies séparément qu'une formule « coupe +
 * barbe » réunit pour moins cher. La formule doit **nommer** la coupe et la barbe choisies (au moins
 * un mot distinctif commun avec chacune : « premium », « homme », « tondeuse »…) : sinon on
 * proposerait de troquer une « Barbe premium » contre une taille à la tondeuse, moins chère mais
 * différente. À égalité, la formule la plus proche en contenu, puis la plus complète (la plus chère).
 * @param {Array} selected    prestations choisies
 * @param {Array} candidates  prestations non choisies
 * @returns {{ formula: object, remove: object[], saving: number } | null}
 */
export function findFormulaSwap(selected, candidates) {
  const price = (s) => Number(s?.price) || 0;
  const formulas = (candidates || []).filter(f => isCutBeardCombo(f?.name));
  if (formulas.length === 0) return null;
  let best = null;
  for (const cut of (selected || []).filter(isPlainCut)) {
    const cutWords = distinctiveWords(cut.name);
    for (const beard of (selected || []).filter(isPlainBeard)) {
      const beardWords = distinctiveWords(beard.name);
      for (const formula of formulas) {
        const saving = price(cut) + price(beard) - price(formula);
        if (saving <= 0) continue;
        const words = distinctiveWords(formula.name);
        const cutShared = [...cutWords].filter(w => words.has(w)).length;
        const beardShared = [...beardWords].filter(w => words.has(w)).length;
        if ((cutWords.size > 0 && cutShared === 0) || (beardWords.size > 0 && beardShared === 0)) continue;
        const score = cutShared + beardShared;
        if (!best || score > best.score || (score === best.score && price(formula) > price(best.formula))) {
          best = { formula, remove: [cut, beard], saving, score };
        }
      }
    }
  }
  return best && { formula: best.formula, remove: best.remove, saving: best.saving };
}

/** « Nouveau » si `created_at` date de moins de `NEW_DAYS` jours. */
export function isNewService(service, nowMs = Date.now()) {
  if (!service?.created_at) return false;
  const t = Date.parse(service.created_at);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < NEW_DAYS * 24 * 60 * 60 * 1000 && t <= nowMs + 60 * 1000;
}

/** Durée en français : « 45 min », « 1 h », « 1 h 30 ». */
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')}`;
}

/** Prix en euros à la française : « 30 € », « 27,50 € ». */
export function formatPrice(value) {
  const n = Number(value) || 0;
  if (Number.isInteger(n)) return `${n} €`;
  return `${n.toFixed(2).replace('.', ',')} €`;
}

/** Vrai si la prestation correspond à la recherche (nom ou description, sans accents). */
export function matchesSearch(service, query) {
  const q = normalizeText(query);
  if (!q) return true;
  const words = q.split(/\s+/).filter(Boolean);
  const haystack = `${normalizeText(service?.name)} ${normalizeText(service?.description)}`;
  return words.every(w => haystack.includes(w));
}

/**
 * Ids des prestations les plus réservées, d'après les rendez-vous terminés (`services[].service_id`).
 * Renvoie `null` si l'échantillon est trop mince (moins de `POPULAR_MIN_SAMPLE` rendez-vous portant
 * des prestations) : c'est le cas d'un client, à qui le serveur ne renvoie que les créneaux des autres.
 */
export function computePopularIds(appointments, services, count = POPULAR_COUNT) {
  if (!Array.isArray(appointments) || !Array.isArray(services)) return null;
  const known = new Set(services.map(s => String(s.id)));
  const counts = new Map();
  let sample = 0;
  for (const apt of appointments) {
    const list = Array.isArray(apt?.services) ? apt.services : null;
    if (!list || list.length === 0) continue;
    sample += 1;
    for (const item of list) {
      const id = item?.service_id != null ? String(item.service_id) : null;
      if (!id || !known.has(id)) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  if (sample < POPULAR_MIN_SAMPLE || counts.size === 0) return null;
  const order = new Map(services.map((s, i) => [String(s.id), Number(s.sort_order ?? i)]));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
    .slice(0, count)
    .map(([id]) => id);
}

/** Repli : les premières prestations par `sort_order`. */
export function fallbackPopularIds(services, count = POPULAR_COUNT) {
  if (!Array.isArray(services)) return [];
  return [...services]
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .slice(0, count)
    .map(s => String(s.id));
}
