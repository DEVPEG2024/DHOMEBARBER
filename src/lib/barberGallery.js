/**
 * Galerie de réalisations d'un barber (`employees.gallery`, backend f1bd942) :
 * liste ordonnée de { url, caption, service_id? }. Le serveur n'accepte que des images envoyées
 * par `UploadFile`, 30 au plus, légende ≤ 120 caractères (ac.galleryOrEmpty). `service_id` : la
 * prestation que montre la photo (18 oct. 2026), proposée à la réservation depuis le profil.
 */
export const GALLERY_MAX = 30;
export const GALLERY_CAPTION_MAX = 120;
/** Photos affichées sur le profil avant « Voir tout ». */
export const GALLERY_PREVIEW = 9;

/** Galerie normalisée d'une fiche barber (ancienne fiche sans colonne → []). */
export function galleryOf(employee) {
  const raw = employee?.gallery;
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => (typeof item === 'string' ? { url: item, caption: '' } : item))
    .filter((item) => item && typeof item.url === 'string' && item.url)
    .map((item) => (item.service_id
      ? { url: item.url, caption: String(item.caption || ''), service_id: String(item.service_id) }
      : { url: item.url, caption: String(item.caption || '') }));
}

/** Prestations actives (même requête et même clé que la réservation et la page Prestations). */
export const activeServicesQuery = (api) => ({
  queryKey: ['services'],
  staleTime: 5 * 60 * 1000,
  queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
});

/** Lien de réservation depuis une photo : ce barber, et la prestation de la photo si elle existe encore. */
export function bookingLinkFor(employee, service) {
  const params = new URLSearchParams();
  if (employee?.id) params.set('barber', String(employee.id));
  if (service?.id) params.set('services', String(service.id));
  const q = params.toString();
  return q ? `/booking?${q}` : '/booking';
}
