/**
 * Helpers du catalogue (page Prestations et choix des prestations de la réservation) : icône par
 * nature de prestation, rubriques automatiques, formules, compléments, nouveautés, recherche,
 * formats de durée et de prix.
 * Aucun appel réseau ici : la page fournit les données, ces fonctions sont pures.
 */
import { Scissors, Palette, Sparkles, Baby, Zap, Gift, Repeat, Heart } from 'lucide-react';

/** Courbe « signature » de l'app (sortie très douce). */
export const EASE = [0.16, 1, 0.3, 1];

/** Une prestation est « Nouveau » pendant ce nombre de jours après sa création. */
export const NEW_DAYS = 30;

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
  // Rubriques seulement (en-têtes, fiche) : jamais déduites d'un nom par `serviceKind`
  pack: { Icon: Repeat, label: 'Abonnement', tone: 'text-violet-400 bg-violet-500/12' },
  favorite: { Icon: Heart, label: 'Favori', tone: 'text-rose-500 bg-rose-500/12', iconClass: 'fill-current' },
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

// ─── Rubriques automatiques ───────────────────────────────────────────────

/**
 * Rubriques du catalogue, dans l'ordre d'affichage. Le salon n'a aucune catégorie en base : sans
 * elles, les 32 prestations tombaient dans une seule liste. `kind` = icône de l'en-tête (`KINDS`),
 * `note` = sous-titre facultatif sous l'en-tête.
 */
export const RUBRICS = [
  { key: 'cut', label: 'Coupes', kind: 'cut' },
  { key: 'kids', label: 'Enfants', kind: 'kids' },
  { key: 'combo', label: 'Coupe + barbe', kind: 'formula' },
  { key: 'beard', label: 'Barbe et rasage', kind: 'beard' },
  { key: 'head', label: 'Tête rasée', kind: 'clipper' },
  { key: 'color', label: 'Couleur et mèches', kind: 'color' },
  { key: 'care', label: 'Soins et épilation', kind: 'care' },
  { key: 'pack', label: 'Abonnements', kind: 'pack', note: 'Formules mensuelles : demandez les détails au salon.' },
  { key: 'other', label: 'Autres prestations', kind: 'cut' },
];

export const RUBRIC_BY_KEY = Object.fromEntries(RUBRICS.map(r => [r.key, r]));

// Mots-clés des rubriques (texte déjà normalisé). Plus stricts que `KIND_PATTERNS` (icônes) :
// « petit » n'y fait pas un enfant (« Petit contour de barbe » reste une barbe).
const RUBRIC_PACK = /\babonnements?\b/;
const RUBRIC_KIDS = /\b(enfants?|kids?|junior|ados?|bebes?)\b|moins de \d+ ans|(^|\s)-\s?\d+ ans|a partir de \d+ ans/;
const RUBRIC_HEAD = /\b(tete|crane)\b|boule a zero/;
const RUBRIC_SHAVE = /\b(rasage|rase|rasee|tondeuse)\b|boule a zero/;
const RUBRIC_BEARD = /\b(barbes?|moustaches?|boucs?|rasage)\b/;
const RUBRIC_COLOR = /(couleur|coloration|\bcolo\b|meche|decolo|balayage|blond|patine|teint)/;
const RUBRIC_CARE = /(soin|epil|\bcire\b|masque|gommage|visage|\bspa\b|massage|vapeur|hydrat)/;
const RUBRIC_CUT = /\b(coupes?|ciseaux?|coiffure|coiffage|shampo\w*|brushing|degrade|fade|permanente|defris\w*|lissage|tondeuse)\b/;

/**
 * Rubrique automatique d'une prestation, déduite de son nom (`RUBRICS`). L'ordre des tests compte :
 * les abonnements (« 4 coupes + barbe premium ») avant tout, les enfants avant les coupes, les
 * formules coupe + barbe avant la barbe, la tête rasée avant la barbe (« Rasage Tête + Sculpture
 * barbe »), la barbe avant la couleur (« Teinture Barbe ») et avant les soins (« Rituel barbe…
 * serviette chaude »), un soin qui nomme une coupe reste une coupe.
 * @returns {'cut'|'kids'|'combo'|'beard'|'head'|'color'|'care'|'pack'|'other'}
 */
export function serviceRubric(service) {
  const t = normalizeText(service?.name);
  if (!t) return 'other';
  if (MULTI_CUT_PACK.test(t) || RUBRIC_PACK.test(t)) return 'pack';
  if (RUBRIC_KIDS.test(t)) return 'kids';
  if (isCutBeardCombo(t) || (KIND_PATTERNS[0][1].test(t) && CUT_WORD.test(t) && BEARD_WORD.test(t))) return 'combo';
  if (RUBRIC_HEAD.test(t) && RUBRIC_SHAVE.test(t)) return 'head';
  if (RUBRIC_BEARD.test(t) && !CUT_WORD.test(t)) return 'beard';
  if (RUBRIC_COLOR.test(t)) return 'color';
  if (RUBRIC_CARE.test(t) && !CUT_WORD.test(t)) return 'care';
  if (RUBRIC_CUT.test(t)) return 'cut';
  return 'other';
}

// ─── Doublons dans une sélection ──────────────────────────────────────────

/**
 * La prestation comprend-elle une coupe ? Coupe, coupe enfant, tête rasée, formule coupe + barbe.
 * D'après le mot « coupe » (pas d'après la rubrique : « Shampoing » ou « Brushing » s'ajoutent à une
 * coupe, ils ne la remplacent pas). Jamais un abonnement.
 */
export function hasCutPart(service) {
  const rubric = serviceRubric(service);
  if (rubric === 'pack') return false;
  return rubric === 'kids' || rubric === 'head' || rubric === 'combo' || CUT_WORD.test(normalizeText(service?.name));
}

/**
 * Prestations de la sélection que `service` ferait doublon, et qu'il doit donc remplacer plutôt que
 * s'y ajouter : deux coupes (« Coupe » puis « Coupe + Barbe », coupe adulte puis coupe enfant), ou
 * une formule coupe + barbe touchée alors qu'une barbe seule est choisie (la formule la comprend).
 * Rien pour une barbe, un soin, une couleur… ajoutés à une coupe : c'est un vrai complément.
 * Relevé le 24 oct. 2026 : revenu à l'étape Prestation par « Modifier » avec « Coupe », le client
 * qui touchait « Coupe + Barbe » pour en changer réservait les deux (durée et prix doublés).
 * @param {object} service   prestation touchée (pas encore choisie)
 * @param {Array} selected   prestations déjà choisies
 * @returns {object[]}       prestations à retirer (vide : simple ajout)
 */
export function replacedBy(service, selected) {
  if (!service) return [];
  const id = String(service.id);
  const cut = hasCutPart(service);
  const combo = serviceRubric(service) === 'combo';
  return (selected || []).filter(s => s && String(s.id) !== id
    && ((cut && hasCutPart(s)) || (combo && isPlainBeard(s))));
}

// ─── Compléments ──────────────────────────────────────────────────────────

const defaultKindOf = (s) => serviceKind(s, '');

/** La moins chère d'une liste (à prix égal, la première : ordre du catalogue). */
export function cheapestService(list) {
  let best = null;
  for (const s of list || []) {
    if (!best || (Number(s?.price) || 0) < (Number(best.price) || 0)) best = s;
  }
  return best;
}

/** Coupe adulte seule (pas « moins de 6 ans ») : celle qu'on propose avec une barbe, et inversement. */
export function isAdultCut(service, kindOf = defaultKindOf) {
  return isPlainCut(service) && kindOf(service) !== 'kids';
}

/**
 * Barbe proposée en complément d'une coupe : la moins chère des barbes seules, de préférence parmi
 * celles dont le nom dit « barbe » (« Contour de barbe » plutôt que « Taille Moustache / Bouc »).
 */
export function pickBeardAddon(candidates) {
  const beards = (candidates || []).filter(isPlainBeard);
  const named = beards.filter(s => /\bbarbe\b/.test(normalizeText(s.name)));
  return cheapestService(named.length > 0 ? named : beards);
}

/**
 * « Souvent ajouté avec » (fiche d'une prestation) : 0 à `max` compléments, même logique que les
 * suggestions de la réservation. Coupe → la barbe la moins chère + le soin le moins cher ; barbe ou
 * formule coupe + barbe → le soin ; rien pour un abonnement, une couleur, un enfant ou un soin.
 * Jamais une prestation déjà choisie, ni une barbe (un soin) quand la sélection en a déjà une.
 * @param {object} service                 prestation de la fiche
 * @param {Array} catalog                  prestations actives
 * @param {{ selected?: Array, kindOf?: Function, max?: number }} [options]
 */
export function complementsFor(service, catalog, { selected = [], kindOf = defaultKindOf, max = 2 } = {}) {
  if (!service) return [];
  const rubric = serviceRubric(service);
  if (rubric === 'pack' || rubric === 'color') return [];
  const chosen = new Set([service, ...selected].map(s => String(s.id)));
  const pool = (catalog || []).filter(s => !chosen.has(String(s.id)));
  const others = selected.filter(s => String(s.id) !== String(service.id));
  const hasBeard = others.some(s => isPlainBeard(s) || isCutBeardCombo(s?.name));
  const hasCare = others.some(s => kindOf(s) === 'care');

  const cut = isAdultCut(service, kindOf);
  const out = [];
  if (cut && !hasBeard) {
    const beard = pickBeardAddon(pool);
    if (beard) out.push(beard);
  }
  if ((cut || isPlainBeard(service) || isCutBeardCombo(service.name)) && kindOf(service) !== 'care' && !hasCare) {
    const care = cheapestService(pool.filter(s => kindOf(s) === 'care'));
    if (care) out.push(care);
  }
  return out.slice(0, max);
}

/** Première ligne de la description, pour la ligne compacte (« 30 min · Soin et massage… »). */
export function descriptionLead(service) {
  const text = typeof service?.description === 'string' ? service.description.trim() : '';
  return text ? text.split(/\n+/)[0].trim() : '';
}
