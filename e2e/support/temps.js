/**
 * Heure de Paris côté tests (Node), pour que les vérifications marchent n'importe quel jour.
 *
 * L'horloge du navigateur est figée au lancement de chaque test sur `MAINTENANT` : le prochain
 * mardi (aujourd'hui compris) à 10 h, heure de Paris. L'écran Créneau calcule les heures libres à
 * partir de l'heure actuelle de Paris : un passage le dimanche soir ou à 23 h ne doit rien changer.
 * Toutes les dates des données simulées sont calculées à partir de ce jour (`jour(n)`).
 */

export const FUSEAU = 'Europe/Paris';

const FORMAT_PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Morceaux de l'heure de Paris d'un instant. */
function partiesParis(instant) {
  const out = {};
  for (const { type, value } of FORMAT_PARIS.formatToParts(instant)) {
    if (type !== 'literal') out[type] = Number(value);
  }
  return out;
}

/** Décalage de Paris (ms) à cet instant : +1 h l'hiver, +2 h l'été. */
function decalageParis(ms) {
  const p = partiesParis(new Date(ms));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}

/** Jour de Paris d'un instant, `AAAA-MM-JJ`. */
export function cleDuJourParis(instant = new Date()) {
  const p = partiesParis(instant);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Instant réel de `cle` (AAAA-MM-JJ) à `heure` (HH:MM), heure de Paris (deux passes : bascule d'heure d'été). */
export function instantParis(cle, heure = '00:00') {
  const [a, m, j] = cle.split('-').map(Number);
  const [h, mi] = heure.split(':').map(Number);
  const mur = Date.UTC(a, m - 1, j, h, mi);
  let t = mur - decalageParis(mur);
  t = mur - decalageParis(t);
  return new Date(t);
}

/** `cle` décalée de `n` jours (calendrier, sans fuseau). */
export function ajouterJours(cle, n) {
  const [a, m, j] = cle.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

/** Jour de la semaine d'une clé : 0 = dimanche … 6 = samedi. */
export function jourDeSemaine(cle) {
  const [a, m, j] = cle.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay();
}

/** Lundi de la semaine d'une clé (l'agenda et la réservation commencent la semaine le lundi). */
export function lundiDe(cle) {
  const js = jourDeSemaine(cle);
  return ajouterJours(cle, -((js + 6) % 7));
}

const MARDI = 2;
const AUJOURDHUI_REEL = cleDuJourParis(new Date());

/** Jour de référence des tests : le prochain mardi, aujourd'hui compris. */
export const JOUR_REF = ajouterJours(AUJOURDHUI_REEL, (MARDI - jourDeSemaine(AUJOURDHUI_REEL) + 7) % 7);

/** Instant auquel l'horloge du navigateur est figée : mardi 10 h, heure de Paris. */
export const MAINTENANT = instantParis(JOUR_REF, '10:00');

/** Jour de référence décalé de `n` jours (`jour(0)` = le mardi de référence). */
export const jour = (n = 0) => ajouterJours(JOUR_REF, n);

/** Les sept jours (lundi → dimanche) de la semaine de `cle`. */
export function joursDeLaSemaine(cle) {
  const lundi = lundiDe(cle);
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
}
