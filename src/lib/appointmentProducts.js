/**
 * Produits ajoutés à un rendez-vous : le client choisit un produit de la boutique à l'étape de
 * confirmation de la réservation, son barber le lui remet pendant le RDV et il le paie sur place.
 *
 * Côté serveur c'est une commande ordinaire rattachée au RDV (`orders.appointment_id`, backend
 * v107) : stock décompté, alertes admin, annulation. Elle suit le RDV quand il est déplacé
 * (création du nouveau RDV avec `reschedule_of: <ancien id>`) et elle est annulée avec lui quand
 * le client l'annule (sauf si elle est déjà prête). Au salon, le barber la marque « Retirée »
 * (`delivered`) : elle compte dans le CA de la boutique, jamais dans `product_price` du RDV
 * (sinon le produit serait compté deux fois).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { stockInfo } from '@/components/shop/productUtils';

/** Commandes encore à remettre (ni retirées ni annulées). */
export const OPEN_LINKED_ORDER_STATUSES = ['pending', 'confirmed', 'ready'];
/** Produits proposés au plus dans le bloc de la réservation. */
export const MAX_ADDON_PRODUCTS = 12;
/** Quantité maximale d'un produit ajouté à un RDV. */
export const MAX_ADDON_QUANTITY = 5;

/** Produit proposable à l'ajout : actif, vendu en boutique (pas un consommable du salon), en stock. */
export function isAddonEligible(product) {
  if (!product || product.is_active === false) return false;
  if ((product.stock_type || 'boutique') === 'salon') return false;
  return !stockInfo(product).soldOut;
}

const BEARD_RE = /barbe|beard|rasoir|rasage|moustache/i;
const CUT_RE = /coupe|d[ée]grad|fade|cheveu|taper|contour/i;

/**
 * Produits à proposer, les plus pertinents d'abord : soin barbe si une prestation barbe est
 * choisie, coiffant / soin cheveux pour une coupe, puis le reste par nom.
 * @param {object[]} products  catalogue (Product)
 * @param {object[]} services  prestations choisies ({ name, category… })
 */
export function suggestAddonProducts(products, services = []) {
  const names = services.map((s) => String(s?.name || '')).join(' ');
  const wantsBeard = BEARD_RE.test(names);
  const wantsCut = CUT_RE.test(names) || !wantsBeard;
  const score = (p) => {
    const cat = p.category || '';
    const text = `${p.name || ''} ${p.description || ''}`;
    let s = 0;
    if (wantsBeard && (cat === 'beard_care' || BEARD_RE.test(text))) s += 3;
    if (wantsCut && (cat === 'styling' || cat === 'hair_care')) s += 2;
    if (p.image_url) s += 0.5;
    return s;
  };
  return (Array.isArray(products) ? products : [])
    .filter(isAddonEligible)
    .map((p) => ({ p, s: score(p) }))
    .sort((a, b) => b.s - a.s || String(a.p.name || '').localeCompare(String(b.p.name || ''), 'fr'))
    .slice(0, MAX_ADDON_PRODUCTS)
    .map(({ p }) => p);
}

/** Lignes de commande depuis la sélection `{ [productId]: quantité }` (prix relus par le serveur). */
export function addonItems(selection, products) {
  const byId = new Map((products || []).map((p) => [String(p.id), p]));
  return Object.entries(selection || {})
    .filter(([, q]) => q > 0)
    .map(([id, quantity]) => {
      const p = byId.get(String(id));
      return p ? { product_id: p.id, name: p.name, price: Number(p.price) || 0, quantity, image_url: p.image_url || undefined } : null;
    })
    .filter(Boolean);
}

/** Total en euros de la sélection. */
export function addonTotal(selection, products) {
  return addonItems(selection, products).reduce((sum, it) => sum + it.price * it.quantity, 0);
}

/** « Cire mate ×1, Huile à barbe ×2 » */
export function orderItemsLabel(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.map((it) => `${it.name || 'Produit'} ×${parseInt(it.quantity, 10) || 1}`).join(', ');
}

/** Commandes encore à remettre, rangées par RDV : `Map(appointmentId → orders[])`. */
export function openOrdersByAppointment(orders) {
  const map = new Map();
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o?.appointment_id || !OPEN_LINKED_ORDER_STATUSES.includes(o.status)) continue;
    const key = String(o.appointment_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(o);
  }
  return map;
}

/**
 * Admin : commandes rattachées aux RDV affichés (agenda), une requête pour toute la période.
 * Clé `['agendaOrders', …ids]`, à invalider après une remise ou une modification de commande.
 */
export function useAppointmentOrders(appointmentIds, { enabled = true } = {}) {
  const ids = [...new Set((appointmentIds || []).filter(Boolean).map(String))].sort();
  return useQuery({
    queryKey: ['agendaOrders', ...ids],
    queryFn: () => api.entities.Order.filter({ appointment_id: ids }, '-created_date', 500),
    enabled: enabled && ids.length > 0,
    staleTime: 60 * 1000,
    select: (orders) => openOrdersByAppointment(orders),
  });
}
