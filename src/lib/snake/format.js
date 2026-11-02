/**
 * Snake du Gang : petits formats partagés par les écrans (mois, jours restants, places, scores).
 */

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** 'YYYY-MM' → « novembre » (vide si la saison est illisible). */
export function seasonMonth(season) {
  const m = /^\d{4}-(\d{2})$/.exec(String(season || ''));
  const i = m ? Number(m[1]) - 1 : -1;
  return i >= 0 && i < 12 ? MONTHS[i] : '';
}

/** 'YYYY-MM' → « de novembre » / « d'août » / « d'octobre ». */
export function ofSeason(season) {
  const month = seasonMonth(season);
  if (!month) return '';
  return /^[aeiouyéè]/i.test(month) ? `d’${month}` : `de ${month}`;
}

/** Mois suivant en toutes lettres (« décembre » pour '2026-11'). */
export function nextSeasonMonth(season) {
  const m = /^\d{4}-(\d{2})$/.exec(String(season || ''));
  if (!m) return '';
  return MONTHS[Number(m[1]) % 12];
}

/** Jours entiers avant la fin de la saison (au moins 0 ; `null` si la date est illisible). */
export function daysLeft(endsAt, now = new Date()) {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86400000));
}

/** Place : 1 → « 1er », 6 → « 6e » (vide sans place). */
export function rankText(rank) {
  const n = Number(rank);
  if (!Number.isInteger(n) || n < 1) return '';
  return n === 1 ? '1er' : `${n}e`;
}

/** Score de l'écran vert sur 4 chiffres (0248), plus long s'il le faut. */
export function lcdScore(score) {
  const n = Math.max(0, Math.floor(Number(score) || 0));
  return String(n).padStart(4, '0');
}

/** Initiales d'un nom affiché (« Lucas M. » → « LM »). */
export function initialsOf(name) {
  const parts = String(name || '').replace(/\./g, ' ').trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => Array.from(p)[0] || '');
  return letters.join('').toUpperCase() || '?';
}
