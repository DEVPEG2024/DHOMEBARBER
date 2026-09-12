/**
 * Helpers de présentation de la Boutique, partagés entre la grille (`pages/Shop.jsx`) et la
 * fiche produit (`ProductSheet.jsx`) : libellés de catégorie, galerie d'images, état du stock, prix.
 */

/** Libellés des catégories de produits (valeur en base → texte affiché). */
export const PRODUCT_CATEGORY_LABELS = {
  hair_care: 'Cheveux',
  beard_care: 'Barbe',
  styling: 'Coiffant',
  accessories: 'Accessoires',
  skincare: 'Soin visage',
  other: 'Autre',
};

export const productCategoryLabel = (value) => PRODUCT_CATEGORY_LABELS[value] || value || '';

/** Quantité maximale ajoutable en une fois depuis la fiche. */
export const MAX_QUANTITY = 10;

/** En dessous de ce stock (inclus), la fiche affiche « Plus que N ». */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * Images d'un produit : la couverture (`image_url`) puis la galerie (`images`, ≤ 8 URLs),
 * sans doublon ni valeur vide. Une liste vide = aucune image.
 */
export function productImages(product) {
  if (!product) return [];
  const list = [product.image_url, ...(Array.isArray(product.images) ? product.images : [])];
  const seen = new Set();
  return list.filter((url) => {
    if (typeof url !== 'string' || !url.trim()) return false;
    const key = url.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * État du stock d'un produit. `stock` absent / null = non suivi (rien à afficher, quantité libre).
 * Renvoie `{ tracked, stock, soldOut, low }`.
 */
export function stockInfo(product) {
  const raw = product?.stock;
  if (raw === null || raw === undefined || raw === '') return { tracked: false, stock: null, soldOut: false, low: false };
  const stock = Number(raw);
  if (!Number.isFinite(stock)) return { tracked: false, stock: null, soldOut: false, low: false };
  return {
    tracked: true,
    stock,
    soldOut: stock <= 0,
    low: stock > 0 && stock <= LOW_STOCK_THRESHOLD,
  };
}

/** Prix en euros à la française : « 12 € », « 12,50 € ». */
export function formatPrice(value) {
  const n = Number(value) || 0;
  if (Number.isInteger(n)) return `${n} €`;
  return `${n.toFixed(2).replace('.', ',')} €`;
}
