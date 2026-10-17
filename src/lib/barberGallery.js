/**
 * Galerie de réalisations d'un barber (`employees.gallery`, backend f1bd942) :
 * liste ordonnée de { url, caption }. Le serveur n'accepte que des images envoyées
 * par `UploadFile`, 30 au plus, légende ≤ 120 caractères (ac.galleryOrEmpty).
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
    .map((item) => ({ url: item.url, caption: String(item.caption || '') }));
}
