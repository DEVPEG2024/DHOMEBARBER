/**
 * Sélection d'un look dans la visionneuse (prestations cochées par le client) : outils sans état,
 * partagés par la section du profil et la visionneuse.
 *
 * Ordre canonique d'une sélection : les prestations du look (ordre du barber), puis les compléments
 * (« En plus »). C'est cet ordre qui part dans les liens (`services=a,b`), à l'aller vers la
 * réservation comme au retour sur le profil.
 */
import { LOOK_MAX, lookExtras, lookServices } from '@/lib/barberGallery';

/** Compléments proposés sous un look (deux au plus). */
export const EXTRAS_MAX = 2;

/**
 * Prestations d'un look encore au catalogue (`base`) et compléments proposés (`extras`).
 * `base` + `extras` ne dépassent jamais `LOOK_MAX` (`lookExtras` s'arrête avant).
 */
export function lookOptions(item, catalog) {
  const base = lookServices(item, catalog);
  const extras = base.length ? lookExtras(base, catalog, { max: EXTRAS_MAX }) : [];
  return { base, extras };
}

/** Prestations retenues, dans l'ordre canonique, `LOOK_MAX` au plus. */
export function orderedSelection({ base, extras }, ids) {
  const wanted = new Set((ids || []).map(String));
  return [...base, ...extras].filter((s) => wanted.has(String(s.id))).slice(0, LOOK_MAX);
}

/** Identifiants d'une liste de prestations. */
export const idsOf = (services) => (services || []).map((s) => String(s.id));

/**
 * Sélection de départ d'un look : les `services` de l'adresse (retour depuis la réservation) quand
 * ils appartiennent au look ou à ses compléments et gardent au moins une prestation du look ;
 * sinon le look entier.
 */
export function initialSelection(options, servicesParam) {
  const wanted = String(servicesParam || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (wanted.length) {
    const picked = orderedSelection(options, wanted);
    const baseIds = new Set(idsOf(options.base));
    if (picked.some((s) => baseIds.has(String(s.id)))) return idsOf(picked);
  }
  return idsOf(options.base);
}

/** Même liste d'identifiants, dans le même ordre. */
export function sameIds(a, b) {
  return a.length === b.length && a.every((id, i) => String(id) === String(b[i]));
}

/** « 1 prestation », « 3 prestations ». */
export const prestationsLabel = (n) => `${n} prestation${n > 1 ? 's' : ''}`;
