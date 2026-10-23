/**
 * Chiffre d'affaires d'un rendez-vous encaissé : même calcul pour le tableau de bord et les
 * statistiques (sinon les deux écrans donnent deux CA différents pour le même mois).
 */

/** Somme en euros arrondie au centime (12.9 + 0.1 ne s'affiche pas « 13.000000000000002 € »). */
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * CA d'un rendez-vous encaissé, **hors pourboire** : prestations + produit vendu. `grand_total`
 * contient le pourboire, il ne sert plus que de repli (ancienne ligne sans `total_price`).
 */
export function revenueOf(a) {
  const product = Number(a.product_price) || 0;
  const services = Number(a.total_price) || 0;
  if (services > 0) return services + product;
  const grand = Number(a.grand_total) || 0;
  return grand > 0 ? Math.max(0, Math.round((grand - (Number(a.tip) || 0)) * 100) / 100) : product;
}

/**
 * Part du RDV payée par carte cadeau, déjà comptée dans le CA à la vente de la carte : jamais
 * recomptée. `gift_card_amount` est posé par le débit au comptoir (débit partiel compris) ; une
 * ancienne ligne payée « Carte cadeau » sans ce montant compte en entier.
 */
export function giftPartOf(a) {
  const revenue = revenueOf(a);
  const debited = Number(a.gift_card_amount) || 0;
  if (debited > 0) return Math.min(revenue, debited);
  return a.payment_method === 'carte_cadeau' ? revenue : 0;
}

/** Encaissement « CB + Espèces » : `payment_method` du RDV, part en espèces dans `cash_amount`. */
export const SPLIT_PAYMENT = 'mixte';

/**
 * Ce qui a été encaissé hors carte cadeau (prestations + produit, hors pourboire), réparti en
 * `{ cb, especes, autre }`. « CB + Espèces » : `cash_amount` en espèces, le reste en CB ; une part
 * espèces plus grande que l'encaissé (prix baissé ou carte cadeau rattachée après coup) est
 * ramenée à l'encaissé, la CB baisse donc la première. Sans moyen connu, ou reste d'un RDV
 * « Carte cadeau » que la carte n'a pas couvert : `autre` (« non renseigné »).
 */
export function paymentSplitOf(a) {
  const outside = round2(revenueOf(a) - giftPartOf(a));
  const split = { cb: 0, especes: 0, autre: 0 };
  if (outside <= 0) return split;
  if (a.payment_method === 'cb') split.cb = outside;
  else if (a.payment_method === 'especes') split.especes = outside;
  else if (a.payment_method === SPLIT_PAYMENT) {
    split.especes = round2(Math.min(Math.max(Number(a.cash_amount) || 0, 0), outside));
    split.cb = round2(outside - split.especes);
  } else split.autre = outside;
  return split;
}
