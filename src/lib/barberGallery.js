/**
 * Galerie de réalisations d'un barber (`employees.gallery`, backend f1bd942) : liste ordonnée de
 * photos { url, caption, service_ids?, service_id? }. Le serveur n'accepte que des images envoyées
 * par `UploadFile`, 30 au plus, légende ≤ 120 caractères (ac.galleryOrEmpty).
 *
 * « Look » (21 oct. 2026) : une photo porte de 1 à `LOOK_MAX` prestations (`service_ids`, dans
 * l'ordre choisi par le barber), par exemple couleur + dégradé + barbe. La légende sert de titre du
 * look. `service_id` = la première, lue par les apps publiées avant les looks (une prestation par
 * photo) ; le serveur garde le look entier quand une ancienne app enregistre la galerie.
 * Prix et durée ne sont jamais rangés dans la galerie : toujours recalculés depuis le catalogue.
 */
import { complementsFor, serviceRubric } from '@/components/services/serviceUtils';

export const GALLERY_MAX = 30;
export const GALLERY_CAPTION_MAX = 120;
/** Prestations d'un look au plus (même limite que le serveur, `GALLERY_LOOK_MAX`). */
export const LOOK_MAX = 5;
/** Photos affichées sur le profil avant « Voir tout ». */
export const GALLERY_PREVIEW = 9;

const SID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Prestations d'une photo, dans l'ordre, sans doublon (ancienne photo : `service_id` seul). */
function idsOf(item) {
  const raw = Array.isArray(item?.service_ids) ? item.service_ids : (item?.service_id ? [item.service_id] : []);
  const out = [];
  for (const v of raw) {
    const s = v == null ? '' : String(v).trim();
    if (s && SID_RE.test(s) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, LOOK_MAX);
}

/**
 * Identifiant stable d'une photo, pour les liens (`?look=`) : l'identifiant du média
 * (`…/api/media/<uuid>`), sinon une empreinte courte de l'URL.
 */
export function lookKeyOf(item) {
  const url = typeof item?.url === 'string' ? item.url : '';
  const m = /\/api\/media\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(url);
  if (m) return m[1].toLowerCase();
  let h = 5381;
  for (let i = 0; i < url.length; i += 1) h = ((h * 33) ^ url.charCodeAt(i)) >>> 0;
  return `u${h.toString(36)}`;
}

/**
 * Galerie normalisée d'une fiche barber (ancienne fiche sans colonne → []) :
 * `{ key, url, caption, service_ids }` (`service_ids` vide = photo sans prestation).
 */
export function galleryOf(employee) {
  const raw = employee?.gallery;
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => (typeof item === 'string' ? { url: item, caption: '' } : item))
    .filter((item) => item && typeof item.url === 'string' && item.url)
    .map((item) => ({
      key: lookKeyOf(item),
      url: item.url,
      caption: String(item.caption || ''),
      service_ids: idsOf(item),
    }));
}

/**
 * Galerie prête à enregistrer (`Employee.update({ gallery })`) : `service_ids` pour le serveur et
 * `service_id` = la première, que les apps publiées savent lire. Rien d'autre (ni `key`, ni prix).
 */
export function serializeGallery(items) {
  return (items || []).map((item) => {
    const ids = idsOf(item);
    const caption = String(item?.caption || '');
    return ids.length ? { url: item.url, caption, service_ids: ids, service_id: ids[0] } : { url: item.url, caption };
  });
}

/** Photo d'un barber retrouvée par son identifiant de lien, ou null. */
export function findLook(employee, key) {
  if (!key) return null;
  return galleryOf(employee).find((item) => item.key === String(key)) || null;
}

/**
 * Prestations d'un look encore au catalogue actif, dans l'ordre du barber. Une prestation retirée
 * du catalogue disparaît du look (le reste se réserve).
 */
export function lookServices(item, catalog) {
  const byId = new Map((catalog || []).map((s) => [String(s.id), s]));
  return idsOf(item).map((id) => byId.get(id)).filter(Boolean);
}

/** Total d'une liste de prestations : `{ count, price, duration }` (minutes). */
export function lookTotals(services) {
  const list = services || [];
  return {
    count: list.length,
    price: list.reduce((sum, s) => sum + (Number(s?.price) || 0), 0),
    duration: list.reduce((sum, s) => sum + (Number(s?.duration) || 0), 0),
  };
}

/** Titre d'un look : la légende du barber, sinon les prestations (« Coupe + Barbe »). */
export function lookTitle(item, services) {
  const caption = String(item?.caption || '').trim();
  if (caption) return caption;
  const names = (services || []).map((s) => s.name).filter(Boolean);
  return names.length ? names.join(' + ') : '';
}

/** Filtres du profil (« Coupes », « Barbe »…), dans l'ordre d'affichage. */
export const LOOK_FILTERS = [
  { key: 'cut', label: 'Coupes' },
  { key: 'beard', label: 'Barbe' },
  { key: 'color', label: 'Couleur' },
  { key: 'kids', label: 'Enfants' },
  { key: 'care', label: 'Soins' },
];
const FILTERS_OF_RUBRIC = {
  cut: ['cut'], combo: ['cut', 'beard'], head: ['cut'], beard: ['beard'],
  color: ['color'], kids: ['kids'], care: ['care'],
};

/** Filtres auxquels appartient un look (toutes les rubriques de ses prestations). */
export function lookFilterKeys(services) {
  const keys = new Set();
  for (const s of services || []) for (const k of FILTERS_OF_RUBRIC[serviceRubric(s)] || []) keys.add(k);
  return LOOK_FILTERS.map((f) => f.key).filter((k) => keys.has(k));
}

/**
 * Compléments proposés sous un look (« En plus : + Soin… ») : ceux de chaque prestation du look
 * (`complementsFor` : barbe, soin), sans doublon ni prestation déjà dans le look, `max` au plus.
 * Un look plein (`LOOK_MAX`) n'en propose aucun.
 */
export function lookExtras(services, catalog, { max = 2 } = {}) {
  const list = services || [];
  if (list.length >= LOOK_MAX) return [];
  const chosen = new Set(list.map((s) => String(s.id)));
  const out = [];
  for (const s of list) {
    for (const extra of complementsFor(s, catalog, { selected: list, max: 3 })) {
      const id = String(extra.id);
      if (chosen.has(id) || out.some((o) => String(o.id) === id)) continue;
      out.push(extra);
    }
  }
  return out.slice(0, Math.min(max, LOOK_MAX - list.length));
}

/** Prestations actives (même requête et même clé que la réservation et la page Prestations). */
export const activeServicesQuery = (api) => ({
  queryKey: ['services'],
  staleTime: 5 * 60 * 1000,
  queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
});

const idList = (services) => (Array.isArray(services) ? services : services ? [services] : [])
  .map((s) => (typeof s === 'object' ? s?.id : s))
  .filter((id) => id != null && String(id))
  .map(String);

/**
 * Lien de réservation depuis une photo : ce barber et les prestations retenues (le look, ajusté par
 * le client). `/booking?barber=…&services=a,b&from=gallery&look=<clé>` ouvre directement l'écran
 * Créneau de ce barber, le look en vignette. Sans prestation : réservation avec ce barber seul.
 * `services` : une liste (ou une prestation seule) d'objets ou d'identifiants.
 */
export function bookingLinkFor(employee, services, item = null) {
  const params = new URLSearchParams();
  if (employee?.id) params.set('barber', String(employee.id));
  const ids = idList(services);
  if (ids.length) {
    params.set('services', ids.join(','));
    params.set('from', 'gallery');
    if (item) params.set('look', item.key || lookKeyOf(item));
  }
  const q = params.toString();
  return q ? `/booking?${q}` : '/booking';
}

/**
 * Retour au look depuis la réservation (« Modifier », bouton retour) : le profil du barber avec la
 * visionneuse ouverte sur ce look et la sélection du client (`/barber/<id>?look=<clé>&services=…`).
 */
export function lookLinkFor(employeeId, key, services = []) {
  const params = new URLSearchParams();
  if (key) params.set('look', String(key));
  const ids = idList(services);
  if (ids.length) params.set('services', ids.join(','));
  const q = params.toString();
  return `/barber/${encodeURIComponent(String(employeeId))}${q ? `?${q}` : ''}`;
}
