/**
 * Montants en euros, écriture française : « 4 950 € », « 37,50 € » (espace des milliers, virgule,
 * centimes seulement quand il y en a). Un seul format pour tout le tableau de bord : avant, la même
 * page écrivait « 37.5€ », « 37,50€ » et « 4521.00€ ».
 */
import { round2 } from '@/lib/revenue';

const WHOLE = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** « 4 950 € » / « 37,50 € » ; une valeur illisible vaut 0. */
export function euro(value) {
  const n = round2(value);
  return Number.isInteger(n) ? WHOLE.format(n) : CENTS.format(n);
}

/** Écart en % entre deux montants (`null` si la base est nulle) : « +8 % », « −12 % ». */
export function percentChange(current, base) {
  const b = Number(base) || 0;
  if (b <= 0) return null;
  return Math.round(((Number(current) || 0) - b) / b * 100);
}

/** « +8 % » / « −12 % » / « = » (signe moins typographique). */
export function formatPercentChange(pct) {
  if (pct == null) return '';
  if (pct === 0) return '=';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
}
