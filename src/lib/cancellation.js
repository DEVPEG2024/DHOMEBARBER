/**
 * Annulations : commandes de la Boutique et rendez-vous (client, admin, activité clients).
 *
 * Le serveur (Heroku, hors de ce dépôt) annonce ce qu'il sait faire dans ses paramètres
 * publics (`GET /api/apps/public/prod/public-settings/by-id/prod`), comme `features.aiWriter`
 * ou `features.hairUltra` :
 *  - `features.orderCancel` : la route `POST /orders/:id/cancel` existe (annulation d'une
 *    commande par son client, remise en stock côté serveur) ;
 *  - `features.appointmentCancelReason` : un client peut joindre `cancellation_reason` à
 *    l'annulation de son rendez-vous (`PUT appointments { status: 'cancelled', cancellation_reason }`) ;
 *  - `features.orderCancelStatuses` : statuts de commande annulables par le client
 *    (défaut `pending`, `confirmed` ; une commande `ready` ou `delivered` passe par le salon).
 *
 * Dégradation : tant que ces drapeaux sont absents (backend pas encore déployé), l'app ne
 * propose aucun bouton qui échouerait. Elle affiche le téléphone du salon pour annuler une
 * commande et envoie l'annulation d'un rendez-vous exactement comme avant (sans motif).
 * Si un appel est tout de même refusé, `friendlyCancelError` traduit l'erreur en message utile
 * (jamais « HTTP 403 »). Détails côté serveur : docs/backend-orders-cancellation.md.
 */
import { useQuery } from '@tanstack/react-query';
import { API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';

export const SALON_PHONE = '06 66 08 36 05';
export const SALON_PHONE_HREF = 'tel:+33666083605';
export const CANCEL_REASON_MAX = 300;
/** Motif posé par le serveur sur un last minute que personne n'a pris (annulation « système »). */
export const LAST_MINUTE_EXPIRED_REASON = "Personne n'a pris le créneau last minute";
export const APPOINTMENT_CANCEL_REASONS = ['Empêchement', 'Je suis malade', 'Je me suis trompé de créneau', 'Autre'];
export const DEFAULT_CANCEL_FEATURES = {
  orderCancel: false,
  appointmentCancelReason: false,
  orderCancelStatuses: ['pending', 'confirmed'],
};
export const CANCEL_FEATURES_QUERY_KEY = ['cancelFeatures'];

const defaultFeatures = () => ({
  ...DEFAULT_CANCEL_FEATURES,
  orderCancelStatuses: [...DEFAULT_CANCEL_FEATURES.orderCancelStatuses],
});

/** Drapeaux du serveur. Ne rejette jamais : en cas d'échec, valeurs par défaut (tout éteint). */
export async function fetchCancelFeatures() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
    if (!res.ok) return defaultFeatures();
    const data = await res.json().catch(() => null);
    const f = data?.features || {};
    const statuses = Array.isArray(f.orderCancelStatuses)
      ? f.orderCancelStatuses.filter((s) => typeof s === 'string' && s)
      : [];
    return {
      orderCancel: f.orderCancel === true,
      appointmentCancelReason: f.appointmentCancelReason === true,
      orderCancelStatuses: statuses.length ? statuses : [...DEFAULT_CANCEL_FEATURES.orderCancelStatuses],
    };
  } catch {
    return defaultFeatures();
  }
}

/** Drapeaux mis en cache 5 min ; valeurs par défaut tant que rien n'est chargé. */
export function useCancelFeatures() {
  const { data } = useQuery({
    queryKey: CANCEL_FEATURES_QUERY_KEY,
    queryFn: fetchCancelFeatures,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULT_CANCEL_FEATURES;
}

// ── Commandes ────────────────────────────────────────────────────────

export const ORDER_STATUSES = {
  pending:   { label: 'En attente',      bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  confirmed: { label: 'Confirmée',       bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  ready:     { label: 'Prête à retirer', bg: 'bg-primary/10 text-primary border-primary/20' },
  delivered: { label: 'Retirée',         bg: 'bg-green-500/10 text-green-400 border-green-500/20' },
  cancelled: { label: 'Annulée',         bg: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

/** Commandes encore en cours (ni retirées ni annulées). */
export const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'ready'];

/** `completed` (ancien statut) = retirée ; inconnu ou vide = en attente. */
export function normalizeOrderStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'completed') return 'delivered';
  return Object.prototype.hasOwnProperty.call(ORDER_STATUSES, s) ? s : 'pending';
}

export function canClientCancelOrder(order, features) {
  return !!features?.orderCancel
    && (features.orderCancelStatuses || []).includes(normalizeOrderStatus(order?.status));
}

/**
 * `POST /orders/:id/cancel` (motif facultatif, borné). Résout `{ order, already }` ;
 * les erreurs remontent telles quelles (`err.status`, `err.data`) pour `friendlyCancelError`.
 */
export async function cancelOrder(id, reason) {
  const r = String(reason || '').trim();
  const data = await apiRequest(
    'POST',
    apiUrl(`/orders/${encodeURIComponent(id)}/cancel`),
    r ? { reason: r.slice(0, CANCEL_REASON_MAX) } : {},
  );
  return { order: data?.order ?? null, already: !!data?.already };
}

const SALON_PHONE_RE = /0?6 ?66 ?08 ?36 ?05/;

/**
 * Erreur d'annulation → `{ message, callSalon, refetch }` : message à afficher, proposer
 * d'appeler le salon, recharger les données (l'état a probablement changé côté serveur).
 */
/**
 * Annulation posée par un déplacement fait par le client (« Client : déplacé au … ») : ce n'est
 * pas une annulation (même règle que la carte Gang, MOVED_REASON_RE côté serveur).
 */
export const isRescheduledCancel = (a) => a?.status === 'cancelled' && /^client\s*:\s*d[ée]plac/i.test(String(a?.cancellation_reason || ''));

export function friendlyCancelError(err, kind) {
  const status = err?.status;
  if (!status) {
    return { message: 'Pas de connexion : réessayez dans un instant.', callSalon: false, refetch: false };
  }
  const raw = err?.data?.error;
  const serverMsg = typeof raw === 'string' && raw.trim() && !/^HTTP \d+$/.test(raw.trim()) ? raw.trim() : '';
  // Ancien serveur : « Not found » en anglais pour une ligne supprimée entre-temps
  if (status === 404 && /^not found$/i.test(serverMsg)) {
    return { message: kind === 'order' ? 'Cette commande n\'existe plus.' : 'Ce rendez-vous n\'existe plus.', callSalon: false, refetch: true };
  }

  if (status === 401) {
    return { message: 'Votre session a expiré : reconnectez-vous.', callSalon: false, refetch: false };
  }
  if ([400, 404, 409, 429].includes(status) && serverMsg) {
    return {
      message: serverMsg,
      refetch: status !== 429,
      callSalon: err?.data?.code === 'order_ready' || SALON_PHONE_RE.test(serverMsg),
    };
  }
  if (status === 403 || status === 405 || status === 404 || status === 400) {
    const message = kind === 'order'
      ? `Pour annuler cette commande, appelez le salon au ${SALON_PHONE}.`
      : (serverMsg || `Ce rendez-vous ne peut plus être annulé en ligne : appelez le salon au ${SALON_PHONE}.`);
    return { message, callSalon: true, refetch: true };
  }
  return {
    message: `Annulation impossible pour le moment : appelez le salon au ${SALON_PHONE}.`,
    callSalon: true,
    refetch: false,
  };
}

/** Une commande a changé (création, annulation…) : toutes les vues qui la montrent. */
export function invalidateOrderQueries(queryClient) {
  [['myOrders'], ['products'], ['adminOrders'], ['dashboard', 'orders'], ['adminActivity']]
    .forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}

// ── Qui a annulé ─────────────────────────────────────────────────────

/** Motif enregistré par le staff : « Salon » ou « Salon : <motif> ». */
export function formatStaffReason(reason) {
  const trimmed = String(reason || '').trim();
  return trimmed ? `Salon : ${trimmed.slice(0, 200)}` : 'Salon';
}

/** `client` / `staff` / `system`, ou `null` quand on ne peut pas savoir. */
export function cancellationActor(row) {
  const by = row?.cancelled_by;
  if (by === 'client' || by === 'staff' || by === 'system') return by;
  const reason = String(row?.cancellation_reason || '').trim();
  if (!reason) return null;
  if (reason === LAST_MINUTE_EXPIRED_REASON) return 'system';
  if (/^salon\b/i.test(reason)) return 'staff';
  if (/^client\b/i.test(reason)) return 'client';
  return null;
}

export function cancelledByLabel(row, viewer, noun = 'commande') {
  const actor = cancellationActor(row);
  const e = noun === 'rdv' ? '' : 'e';
  if (actor === 'client') return viewer === 'client' ? `Annulé${e} par vous` : `Annulé${e} par le client`;
  if (actor === 'staff') return `Annulé${e} par le salon`;
  return null;
}

/** Motif sans son préfixe « Client : » / « Salon : » ; « Salon » seul → ''. */
export function cleanReason(reason) {
  return String(reason || '').replace(/^(client|salon)\b\s*:?\s*/i, '').trim();
}
