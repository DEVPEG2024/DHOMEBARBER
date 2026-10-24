import React, { useReducer } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Clock, User, Users, Phone, Mail, Scissors, CreditCard, FileText, Calendar, Banknote, CheckCircle, Heart, ShoppingBag, ChevronDown, Check, BadgeCheck, X, AlertTriangle, Trash2, UserX, Gift, Pencil, RotateCcw, Undo2, Coins } from 'lucide-react';
import { getServiceColor } from '@/utils/serviceColors';
import { api } from '@/api/apiClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import AppointmentEditForm from './AppointmentEditForm';
import { STATUS_META, invalidateAppointmentQueries, withLastMinuteMarker, stripLastMinuteMarker, isConvertedLastMinute, agendaErrorMessage, appointmentEndParis, slotIssues, aptDuration } from './agendaUtils';
import ClientAccountPicker from './ClientAccountPicker';
import { useAuth } from '@/lib/AuthContext';
import { parisInstant } from '@/lib/calendarLinks';
import { formatStaffReason, cancellationActor, cancelledByLabel, cleanReason, isRescheduledCancel, LAST_MINUTE_EXPIRED_REASON, ORDER_STATUSES, normalizeOrderStatus, invalidateOrderQueries } from '@/lib/cancellation';
import { orderItemsLabel } from '@/lib/appointmentProducts';
import { formatPrice, isShopProduct, stockInfo } from '@/components/shop/productUtils';
import { useGangSummaries } from '@/lib/gangCardApi';
import { gangPalette } from '@/components/gang/gangTheme';
import { paymentSplitOf, SPLIT_PAYMENT } from '@/lib/revenue';
import { usePaymentFeatures } from '@/lib/paymentFeatures';
import { guestOf } from '@/lib/guest';

/** Pastille « Or · 12 visites » du client (carte Gang) ; rien sans données ou en cas d'erreur. */
function GangClientBadge({ email }) {
  const { data } = useGangSummaries(email ? [email] : []);
  const summary = email && data && !data.error ? data[String(email).toLowerCase()] : null;
  if (!summary?.tier) return null;
  const palette = gangPalette({ tier: summary.tier });
  const visits = Number(summary.visits) || 0;
  return (
    <span
      className="shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ color: palette.accent, borderColor: `${palette.accent}55` }}
      title="Carte Gang du client"
    >
      {summary.tier_label || palette.label} · {visits} visite{visits > 1 ? 's' : ''}
    </span>
  );
}

/**
 * Message d'erreur lisible : « Pas de connexion internet » pour une coupure (jamais « Load failed »),
 * celui du serveur, sinon celui de l'erreur sauf « HTTP 403 », sinon le repli.
 */
function errorMessage(err, fallback) {
  const shown = agendaErrorMessage(err, '');
  if (shown) return shown;
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  if (msg && !/^HTTP/.test(msg)) return msg;
  return fallback;
}

/**
 * Montant saisi au clavier français : « 2,50 » → 2.5, vide → 0, au centime. NaN si la saisie n'est
 * pas un nombre (« 2,5abc », « 2,5,0 ») : refusé plutôt que tronqué en silence (parseFloat donnait 2).
 */
const parseAmount = (v) => {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

const STAFF_CANCEL_REASON_MAX = 200;

/** `tel:` d'un numéro saisi librement (« 06 12 34 56 78 » → tel:0612345678). */
const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

const initialState = (apt) => ({
  saving: false,
  tip: apt.tip ? String(apt.tip) : '',
  tipMethod: apt.tip_method || '',
  paymentMethod: apt.payment_method || '',
  // « CB + Espèces » : part payée en espèces (le reste en CB)
  cashAmount: apt.cash_amount ? String(apt.cash_amount) : '',
  // Produit vendu au fauteuil déjà enregistré (product_id) : gardé tel quel à la correction, sinon
  // la validation l'enlèverait et rendrait l'unité au stock
  selectedProductId: apt.product_id ? String(apt.product_id) : '',
  productPrice: apt.product_price ? String(apt.product_price) : '',
  productSold: apt.product_sold || '',
  clientName: apt.client_name || '',
  clientEmail: apt.client_email || '',
  clientPhone: apt.client_phone || '',
});

function reducer(state, action) {
  switch (action.type) {
    case 'SET': return { ...state, [action.field]: action.value };
    case 'SET_PRODUCT': return { ...state, selectedProductId: action.id, productSold: action.name, productPrice: action.price };
    case 'CLEAR_PRODUCT': return { ...state, selectedProductId: '', productSold: '', productPrice: '' };
    case 'SAVING': return { ...state, saving: action.value };
    default: return state;
  }
}

/** Créneau last minute que personne n'a repris : sans email, nom « Last Minute ». */
const wasLastMinuteRow = (apt) => !apt.client_email && apt.client_name === 'Last Minute';

/** Une commande liée au RDV a changé : agenda (pastilles), commandes, tableau de bord, stock, activité. */
function invalidateLinkedOrders(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['agendaOrders'] });
  invalidateOrderQueries(queryClient);
}

/** Passe une commande liée au RDV à « Retirée » : elle compte alors dans le CA de la boutique. */
const deliverOrder = (order) => api.entities.Order.update(order.id, { status: 'delivered' });

function ModalInner({ appointment, employees = [], linkedOrders = [], onUpdate, onDelete, onEdit }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, dispatch] = useReducer(reducer, appointment, initialState);
  // « CB + Espèces » proposé quand le serveur l'accepte (ou pour corriger un RDV déjà encaissé ainsi)
  const { splitPayment } = usePaymentFeatures();
  const canSplit = splitPayment || appointment.payment_method === SPLIT_PAYMENT;
  // Produits réservés avec le RDV (commandes ouvertes). Jamais recopiés dans product_sold / product_price :
  // ils sont encaissés via leur commande, sinon le tableau de bord les compterait deux fois.
  const [deliveredIds, setDeliveredIds] = React.useState(() => new Set());
  const [deliveringId, setDeliveringId] = React.useState(null);
  const [deliverOnValidate, setDeliverOnValidate] = React.useState(true);
  const openOrders = linkedOrders.filter((o) => !deliveredIds.has(String(o.id)));
  const openOrdersTotal = openOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
  const openOrdersLabel = openOrders.map(orderItemsLabel).filter(Boolean).join(', ');
  const markDelivered = (ids) => setDeliveredIds((prev) => new Set([...prev, ...ids.map(String)]));

  const handleDeliver = async (order) => {
    setDeliveringId(String(order.id));
    // Statut d'avant la remise (en attente, confirmée, prête) : rendu tel quel par « Annuler »
    const previousStatus = normalizeOrderStatus(order.status);
    const undoStatus = ['pending', 'confirmed', 'ready'].includes(previousStatus) ? previousStatus : 'ready';
    try {
      await deliverOrder(order);
      markDelivered([order.id]);
      // Tap par erreur : retour au statut d'avant possible pendant 24 h (le serveur le refuse au-delà)
      toast.success('Produit remis et payé : compté dans la boutique', {
        duration: 8000,
        action: {
          label: 'Annuler',
          onClick: async () => {
            try {
              await api.entities.Order.update(order.id, { status: undoStatus });
              setDeliveredIds((prev) => { const next = new Set(prev); next.delete(String(order.id)); return next; });
              toast.success('Retrait annulé');
            } catch (e) {
              toast.error(errorMessage(e, 'Impossible d’annuler : corrigez depuis Commandes.'));
            } finally {
              invalidateLinkedOrders(queryClient);
            }
          },
        },
      });
      invalidateLinkedOrders(queryClient);
    } catch (e) {
      toast.error(errorMessage(e, 'Mise à jour de la commande impossible'));
      invalidateLinkedOrders(queryClient);
    } finally {
      setDeliveringId(null);
    }
  };
  // Prestation déjà validée : l'encaissement reste corrigeable (moyen de paiement, pourboire, produit)
  const [correcting, setCorrecting] = React.useState(false);
  const [assignedClient, setAssignedClient] = React.useState(null);
  // Annulation en deux temps : le premier tap ouvre le panneau de confirmation dans la fiche
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  // Case « Prévenir le client » de l'annulation (cochée par défaut)
  const [notifyOnCancel, setNotifyOnCancel] = React.useState(true);
  // « Prévenir le client » du rétablissement (cochée par défaut) : il a reçu l'annulation, ou avait annulé lui-même
  const [notifyOnRestore, setNotifyOnRestore] = React.useState(true);
  // Suppression en deux temps, sur le même modèle (plus de window.confirm)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  // Parcours last minute : créneau encore libre, ou pris par un client mais pas encore encaissé (la fiche
  // reste ouverte après l'assignation et se met à jour : le choix des prestations doit rester possible)
  const isLastMinute = appointment.status === 'last_minute' || !!assignedClient
    || (isConvertedLastMinute(appointment) && appointment.status === 'confirmed' && !appointment.services?.length);
  const isCompleted = appointment.status === 'completed';
  const locked = isCompleted && !correcting; // récapitulatif en lecture seule
  const isClosedOut = appointment.status === 'cancelled' || appointment.status === 'no_show';

  // Le catalogue produits ne sert qu'à la validation : inutile sur une prestation déjà terminée
  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.filter({ is_active: true }, 'name', 100),
    enabled: !locked,
  });
  // Vendables au fauteuil : produits de la boutique en stock (ni consommables du salon, ni ruptures) ;
  // le produit déjà enregistré sur le RDV reste proposé, même épuisé, pour corriger l'encaissement
  const products = allProducts.filter((p) => (isShopProduct(p) && !stockInfo(p).soldOut)
    || (appointment.product_id && String(p.id) === String(appointment.product_id)));

  const { data: allServices = [] } = useQuery({
    queryKey: ['servicesForModal'],
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
    enabled: isLastMinute && (!appointment.services || appointment.services.length === 0),
  });

  const [selectedServices, setSelectedServices] = React.useState([]);

  // Compte choisi dans la recherche serveur (`/clients/search`, 10 résultats, comptes clients
  // seulement, sans date de naissance) : plus aucun téléchargement de la liste des comptes
  const assignAccount = async (u) => {
    dispatch({ type: 'SAVING', value: true });
    try {
      const updateData = {
        client_name: u.full_name || u.email,
        client_email: u.email,
        client_phone: u.phone || '',
      };
      // Last minute pris : confirmé (plus d'expiration automatique) et repéré pour
      // « Convertis » du tableau de bord, note interne existante conservée
      if (appointment.status === 'last_minute') {
        updateData.status = 'confirmed';
        updateData.internal_notes = withLastMinuteMarker(appointment.internal_notes);
        // Fiche restée sur un Last Minute libre alors qu'un client de l'app l'a repris (même id) :
        // le serveur refuse (409) au lieu d'écraser son rendez-vous (tour 7)
        updateData.if_free_last_minute = true;
      }
      await api.entities.Appointment.update(appointment.id, updateData);
      setAssignedClient({ name: u.full_name || u.email, email: u.email, phone: u.phone || '' });
      toast.success(`Client ${u.full_name || u.email} assigné`);
      // La fiche reste ouverte (encaissement juste après) : l'agenda et le tableau de bord suivent
      invalidateAppointmentQueries(queryClient);
    } catch (e) {
      toast.error(errorMessage(e, 'Assignation impossible'));
      // 409 : créneau repris entre-temps ; le rechargement montre son client
      if (e?.status === 409) invalidateAppointmentQueries(queryClient);
    } finally {
      dispatch({ type: 'SAVING', value: false });
    }
  };

  const status = STATUS_META[appointment.status] || STATUS_META.confirmed;
  const tipParsed = locked ? (appointment.tip || 0) : parseAmount(state.tip);
  const tipInvalid = Number.isNaN(tipParsed);
  const tipValue = tipInvalid ? 0 : tipParsed;
  const prodValue = locked ? (appointment.product_price || 0) : (parseAmount(state.productPrice) || 0);
  const manualServiceTotal = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
  const serviceTotal = appointment.total_price || manualServiceTotal || 0;
  const grandTotal = locked ? (appointment.grand_total || serviceTotal + tipValue + prodValue) : (serviceTotal + tipValue + prodValue);
  // Part déjà payée par carte cadeau (débit au comptoir, gift_card_amount) : à déduire de ce qui
  // reste à encaisser, sinon le client paie deux fois. grand_total enregistré reste le prix complet.
  const giftPaid = Math.min(Number(appointment.gift_card_amount) || 0, serviceTotal + prodValue);
  const showGiftPaid = giftPaid > 0 && (locked ? appointment.payment_method : state.paymentMethod) !== 'carte_cadeau';
  const leftToCash = Math.round((grandTotal - giftPaid) * 100) / 100;
  // « Carte cadeau » ne débite pas la carte : le débit se fait depuis Cartes cadeau (qui clôture
  // le RDV), jamais par ce bouton (le solde restait entier et la carte resservait). Un RDV déjà
  // clôturé par le débit reste corrigeable sans nouveau débit.
  // Débit déjà fait qui couvre tout le prix (clôture décochée ou échouée) : « Carte cadeau » clôture.
  // Un débit partiel laisse le reste à encaisser en CB / espèces (le serveur refuse sinon).
  const giftCovered = giftPaid > 0 && Math.round((Number(appointment.gift_card_amount) || 0) * 100) >= Math.round((serviceTotal + prodValue) * 100);
  const giftCardNeedsDebit = state.paymentMethod === 'carte_cadeau' && appointment.payment_method !== 'carte_cadeau' && !giftCovered;
  // « Corriger l'encaissement » d'un RDV déjà réglé par carte : un produit ajouté (ou un prix
  // relevé) dépasse le débit, le reste doit passer en CB / espèces (le serveur refuse sinon)
  const giftShortOnCorrection = correcting && state.paymentMethod === 'carte_cadeau'
    && appointment.payment_method === 'carte_cadeau' && giftPaid > 0 && !giftCovered;
  // Produit saisi à l'encaissement : il n'est enregistré sur le RDV qu'à la clôture, donc Cartes
  // cadeau ne voit que le prix des prestations (moins le débit déjà fait) et ne peut pas le débiter
  const savedProd = Number(appointment.product_price) || 0;
  const productUnsaved = !locked && Math.round(prodValue * 100) !== Math.round(savedProd * 100);
  const giftCapacity = Math.max(0, Math.round((serviceTotal + savedProd - (Number(appointment.gift_card_amount) || 0)) * 100) / 100);
  // 18 : last minute repris sans aucune prestation : pas d'encaissement à 0 €
  const needsService = isLastMinute && !isCompleted && !appointment.services?.length && selectedServices.length === 0;
  // Carte cadeau débitée de plus que le prix (prix baissé, produit retiré) : l'excédent est à rendre
  // sur la carte (Cartes cadeau, historique de la carte). Bloquant seulement sur une vraie baisse
  // saisie ici, comme le serveur (409) ; une ligne ancienne déjà sous le débit reste encaissable (tour 7)
  const giftCents = Math.round((Number(appointment.gift_card_amount) || 0) * 100);
  const priceNowCents = Math.round((serviceTotal + prodValue) * 100);
  const savedPriceCents = Math.round(((Number(appointment.total_price) || 0) + savedProd) * 100);
  const giftExcess = giftCents > priceNowCents ? (giftCents - priceNowCents) / 100 : 0;
  const giftExcessBlocks = !locked && giftExcess > 0 && priceNowCents < savedPriceCents;
  // Last minute non pris (« Absent » posé par l'agenda ou « Personne n'a pris le créneau ») : pas
  // d'encaissement à 0 € sans client ni prestation ; « Un client l'a pris » d'abord (tour 7)
  const unclaimedLastMinute = isClosedOut && wasLastMinuteRow(appointment);
  // « CB + Espèces » : part en espèces saisie, le reste en CB. À répartir : prestations + produit,
  // hors part déjà payée par carte cadeau et hors pourboire (il a son propre moyen de paiement).
  // Le serveur refait le contrôle : une part > 0 et plus petite que le montant à répartir.
  const isSplit = state.paymentMethod === SPLIT_PAYMENT;
  const splitBase = Math.max(0, Math.round((serviceTotal + prodValue - giftPaid) * 100) / 100);
  const cashParsed = parseAmount(state.cashAmount);
  const cashInvalid = isSplit && Number.isNaN(cashParsed);
  const cashValue = Number.isNaN(cashParsed) ? 0 : cashParsed;
  const cardPart = Math.round((splitBase - cashValue) * 100) / 100;
  const cashTooHigh = isSplit && cashValue > 0 && cardPart <= 0;
  const splitValid = !isSplit || (cashValue > 0 && cardPart > 0);
  // Récapitulatif d'un RDV encaissé « CB + Espèces » (part espèces ramenée à l'encaissé)
  const lockedSplit = locked && appointment.payment_method === SPLIT_PAYMENT ? paymentSplitOf(appointment) : null;
  // Last minute pris par un client de passage, pas encore enregistré : il n'apparaît dans Cartes
  // cadeau qu'une fois confirmé avec un nom et une prestation (tour 7)
  const lmNeedsSave = isLastMinute && !isCompleted && !appointment.client_email && !assignedClient
    && (appointment.status === 'last_minute' || !appointment.services?.length);
  const canValidate = !locked && !tipInvalid && state.paymentMethod && (tipValue === 0 || state.tipMethod) && !giftCardNeedsDebit && !giftShortOnCorrection && !needsService && !giftExcessBlocks && !unclaimedLastMinute && splitValid;
  // 14 : RDV d'un client encore à venir : on l'annule (le client peut être prévenu), on ne le supprime pas
  const upcomingClient = !!appointment.client_email && ['confirmed', 'pending'].includes(appointment.status)
    && parisInstant(String(appointment.date || '').slice(0, 10), String(appointment.start_time || '00:00').slice(0, 5)) > Date.now();
  // 17 : contrôle du créneau avant de rétablir un RDV annulé (null, ou { clash, warnings })
  const [restoreCheck, setRestoreCheck] = React.useState(null);
  // « Prévenir le client » : RDV d'un client, encore à venir (heure de Paris) ; sur un RDV passé,
  // aucun email ne part de toute façon
  const canNotifyCancel = !!appointment.client_email && ['confirmed', 'pending'].includes(appointment.status)
    && parisInstant(String(appointment.date || '').slice(0, 10), String(appointment.start_time || '00:00').slice(0, 5)) > Date.now();

  // « Absent » n'a de sens qu'une fois le rendez-vous commencé (heure de Paris) : avant, un tap à
  // côté d'« Annuler » marquait absent un client qui venait le lendemain
  const hasStarted = parisInstant(String(appointment.date || '').slice(0, 10), String(appointment.start_time || '00:00').slice(0, 5)) <= Date.now();
  // Last minute passé « non pris » par l'agenda alors qu'un client de passage l'a pris : on le
  // reprend (confirmé + repère) pour saisir le client et encaisser, au lieu de le rétablir en last
  // minute que l'agenda repasserait aussitôt en « non pris »
  const wasLastMinute = !appointment.client_email && appointment.client_name === 'Last Minute';
  const lmEnd = appointmentEndParis(appointment);
  const lastMinuteOver = isClosedOut && wasLastMinute && lmEnd != null && lmEnd + 15 * 60000 <= Date.now();
  // Rétablir un RDV client annulé et encore à venir : le client est prévenu (push + email), sinon il
  // croit le RDV annulé, ne vient pas et finit « Absent ». Pas pour un absent ni un last minute.
  // RDV que le client a déplacé lui-même (« Client : déplacé au … ») : il a déjà son nouveau RDV.
  // Le rétablir garderait les deux : avertissement, et jamais « votre RDV est maintenu ».
  const movedByClient = isRescheduledCancel(appointment);
  const movedLabel = movedByClient ? String(appointment.cancellation_reason || '').replace(/^client\s*:\s*/i, '').trim() : '';
  const canNotifyRestore = !movedByClient && !wasLastMinute && !!appointment.client_email && appointment.status === 'cancelled'
    && parisInstant(String(appointment.date || '').slice(0, 10), String(appointment.start_time || '00:00').slice(0, 5)) > Date.now();

  // Motif d'annulation affiché sur un RDV annulé / absent
  const cancelActor = isClosedOut ? cancellationActor(appointment) : null;
  const cancelByLabel = isClosedOut ? cancelledByLabel(appointment, 'admin', 'rdv') : null;
  const cancelMotif = isClosedOut && cancelActor !== 'system' ? cleanReason(appointment.cancellation_reason) : '';
  // Note interne sans le repère technique du last minute
  const internalNote = stripLastMinuteMarker(appointment.internal_notes);

  const handleConfirmCancel = async () => {
    dispatch({ type: 'SAVING', value: true });
    try {
      // Last Minute : 409 avant toute écriture si un client l'a repris entre-temps
      if (appointment.status === 'last_minute') await api.entities.Appointment.update(appointment.id, { if_free_last_minute: true });
      await api.entities.Appointment.update(appointment.id, {
        status: 'cancelled',
        cancellation_reason: formatStaffReason(cancelReason),
        ...(canNotifyCancel && !notifyOnCancel ? { notify_client: false } : {}),
      });
      toast.success('Rendez-vous annulé');
      setConfirmingCancel(false);
      setCancelReason('');
      setNotifyOnCancel(true);
      // Le serveur annule aussi les produits réservés avec ce RDV (sauf ceux déjà prêts)
      invalidateLinkedOrders(queryClient);
      onUpdate?.();
    } catch (e) {
      if (e?.status === 409) invalidateAppointmentQueries(queryClient);
      toast.error(errorMessage(e, 'Annulation impossible'));
    } finally {
      dispatch({ type: 'SAVING', value: false });
    }
  };

  const handleConfirmDelete = async () => {
    dispatch({ type: 'SAVING', value: true });
    try {
      if (appointment.status === 'last_minute') await api.entities.Appointment.update(appointment.id, { if_free_last_minute: true });
      await api.entities.Appointment.delete(appointment.id);
      toast.success('Rendez-vous supprimé');
      setConfirmingDelete(false);
      invalidateLinkedOrders(queryClient);
      onDelete?.();
    } catch (e) {
      if (e?.status === 409) invalidateAppointmentQueries(queryClient);
      toast.error(errorMessage(e, 'Suppression impossible'));
    } finally {
      dispatch({ type: 'SAVING', value: false });
    }
  };

  /** Rétablit le RDV (confirmé, ou last minute s'il en était un) et rend compte des produits rouverts. */
  const doRestore = async () => {
    dispatch({ type: 'SAVING', value: true });
    try {
      const notified = canNotifyRestore && notifyOnRestore;
      const saved = await api.entities.Appointment.update(appointment.id, {
        status: wasLastMinute ? 'last_minute' : 'confirmed',
        cancellation_reason: null,
        ...((movedByClient || (canNotifyRestore && !notifyOnRestore)) ? { notify_client: false } : {}),
      });
      const restored = Number(saved?.linked_orders_restored) || 0;
      const failed = Number(saved?.linked_orders_failed) || 0;
      const base = notified ? 'Rendez-vous rétabli, client prévenu' : 'Rendez-vous rétabli';
      toast.success(restored > 0
        ? `${base}, et ${restored} produit${restored > 1 ? 's' : ''} remis en commande`
        : base);
      setNotifyOnRestore(true);
      if (failed > 0) {
        toast.warning(`${failed} produit${failed > 1 ? 's' : ''} annulé${failed > 1 ? 's' : ''} avec ce RDV n'${failed > 1 ? 'ont' : 'a'} pas pu être rétabli${failed > 1 ? 's' : ''} (stock) : à reprendre dans Commandes.`, { duration: 10000 });
      }
      setRestoreCheck(null);
      invalidateLinkedOrders(queryClient);
      invalidateAppointmentQueries(queryClient);
      onUpdate?.();
    } catch (e) {
      toast.error(errorMessage(e, 'Rétablissement impossible'));
    } finally {
      dispatch({ type: 'SAVING', value: false });
    }
  };

  /** Avant de rétablir : le créneau a pu être repris par un autre client entre-temps. */
  const checkRestore = async () => {
    dispatch({ type: 'SAVING', value: true });
    let issues;
    try {
      const date = String(appointment.date || '').slice(0, 10);
      const [dayApts, timeOffs] = await Promise.all([
        api.entities.Appointment.filter({ date, employee_id: appointment.employee_id }, 'start_time', 200),
        queryClient.fetchQuery({ queryKey: ['timeOffs'], queryFn: () => api.entities.TimeOff.list('-start_date', 200) }),
      ]);
      const employee = employees.find((e) => String(e.id) === String(appointment.employee_id)) || { name: appointment.employee_name };
      issues = slotIssues({
        selfId: appointment.id,
        date,
        startTime: String(appointment.start_time || '').slice(0, 5),
        duration: aptDuration(appointment),
        employee,
        employeeId: appointment.employee_id,
        dayApts: dayApts || [],
        timeOffs: timeOffs || [],
      });
    } catch (e) {
      // Jamais de rétablissement à l'aveugle
      toast.error(errorMessage(e, 'Impossible de vérifier le créneau : réessayez.'));
      dispatch({ type: 'SAVING', value: false });
      return;
    }
    dispatch({ type: 'SAVING', value: false });
    // RDV client à venir : toujours une confirmation, avec la case « Prévenir le client »
    if (issues.clash || issues.warnings.length > 0 || canNotifyRestore || movedByClient) {
      setRestoreCheck(issues);
      return;
    }
    await doRestore();
  };

  /** Last minute pris par un client de passage : client et prestation enregistrés, pour le débit de la carte. */
  const saveLastMinuteClient = async () => {
    const name = String(state.clientName || '').trim();
    if (!name || name === 'Last Minute') return;
    dispatch({ type: 'SAVING', value: true });
    try {
      const updateData = {
        client_name: name,
        client_phone: state.clientPhone || '',
        status: 'confirmed',
        internal_notes: withLastMinuteMarker(appointment.internal_notes),
      };
      if (selectedServices.length > 0 && !appointment.services?.length) {
        updateData.services = selectedServices.map(s => ({ service_id: s.id, name: s.name, price: s.price, duration: s.duration }));
        updateData.total_price = manualServiceTotal;
        updateData.total_duration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0);
      }
      if (appointment.status === 'last_minute') updateData.if_free_last_minute = true;
      await api.entities.Appointment.update(appointment.id, updateData);
      toast.success('Client enregistré : débitez la carte dans Cartes cadeau');
      invalidateAppointmentQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['giftCardTodayAppointments'] });
      onUpdate?.();
    } catch (e) {
      toast.error(errorMessage(e, 'Enregistrement impossible'));
      if (e?.status === 409) invalidateAppointmentQueries(queryClient);
    } finally {
      dispatch({ type: 'SAVING', value: false });
    }
  };

  const handleValidate = async () => {
    if (giftCardNeedsDebit || giftShortOnCorrection || tipInvalid || needsService || giftExcessBlocks || unclaimedLastMinute || !splitValid) return;
    dispatch({ type: 'SAVING', value: true });
    try {
      const updateData = {
        payment_method: state.paymentMethod,
        // Autre moyen de paiement : le serveur efface lui-même la part en espèces
        ...(isSplit ? { cash_amount: cashValue } : {}),
        payment_status: 'paid',
        status: 'completed',
        tip: tipValue,
        tip_method: state.tipMethod,
        product_sold: state.productSold,
        product_price: prodValue,
        // Le serveur décompte le stock, relit nom et prix du produit et refuse une rupture (409)
        product_id: state.selectedProductId || null,
        grand_total: grandTotal,
      };
      // For last_minute: include selected services if none existed
      if (selectedServices.length > 0 && (!appointment.services || appointment.services.length === 0)) {
        updateData.services = selectedServices.map(s => ({ service_id: s.id, name: s.name, price: s.price, duration: s.duration }));
        updateData.total_price = manualServiceTotal;
        updateData.total_duration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0);
      }
      // Last minute validé sur place (walk-in) : compté comme converti par le tableau de bord
      if (isLastMinute || wasLastMinute) updateData.internal_notes = withLastMinuteMarker(appointment.internal_notes);
      // RDV fermé (annulé / absent) puis validé : plus de motif d'annulation (ni le motif système
      // qui le ferait passer pour « non pris »)
      if (isClosedOut) updateData.cancellation_reason = null;
      // Last Minute encore libre d'après la fiche : refus (409) si un client de l'app l'a repris
      if (appointment.status === 'last_minute' && !assignedClient) updateData.if_free_last_minute = true;
      // For last_minute walk-ins: include manually entered client info
      // (pas après l'assignation d'un compte : une saisie walk-in abandonnée écraserait son nom)
      if (!assignedClient && (isLastMinute || !appointment.client_email)) {
        if (state.clientName && state.clientName !== 'Last Minute') {
          updateData.client_name = state.clientName;
        }
        if (state.clientPhone) {
          updateData.client_phone = state.clientPhone;
        }
      }
      await api.entities.Appointment.update(appointment.id, updateData);
      toast.success(correcting ? 'Encaissement corrigé' : 'Prestation validée !');
      // Produits réservés remis pendant le RDV : leurs commandes passent à « Retirée », après la
      // prestation. Un échec n'annule pas la validation : on prévient pour finir depuis Commandes.
      if (deliverOnValidate && openOrders.length > 0) {
        const results = await Promise.allSettled(openOrders.map(deliverOrder));
        const failed = results.filter((r) => r.status === 'rejected');
        markDelivered(openOrders.filter((_, i) => results[i].status === 'fulfilled').map((o) => o.id));
        if (failed.length > 0) {
          toast.warning(
            `Prestation validée, mais ${failed.length > 1 ? `${failed.length} commandes n'ont pas pu être passées` : "la commande n'a pas pu être passée"} à « Retirée » : ${errorMessage(failed[0].reason, 'erreur inconnue')}. À faire depuis Commandes.`,
          );
        }
        invalidateLinkedOrders(queryClient);
      }
      onUpdate?.();
    } catch (e) {
      toast.error(errorMessage(e, 'Erreur lors de la validation'));
      if (e?.status === 409) invalidateAppointmentQueries(queryClient);
    } finally {
      dispatch({ type: 'SAVING', value: false });
    }
  };

  return (
    <div className="space-y-4">
      {/* Status + date */}
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${status.chip}`}>
          {status.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {appointment.date} · {appointment.start_time} – {appointment.end_time}
        </span>
      </div>

      {/* Modifier à tout moment : horaire, barber, prestations, client ; corriger un encaissement ; rétablir */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-all"
        >
          <Pencil className="w-3.5 h-3.5" />
          Modifier / déplacer
        </button>
        {isCompleted && !correcting && (
          <button
            type="button"
            onClick={() => setCorrecting(true)}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Corriger l'encaissement
          </button>
        )}
        {isClosedOut && (
          <button
            type="button"
            disabled={state.saving}
            onClick={async () => {
              // Un créneau last minute que personne n'a pris (encore à venir) redevient un last
              // minute ; un RDV client : créneau vérifié d'abord (checkRestore)
              if (!lastMinuteOver) { await checkRestore(); return; }
              dispatch({ type: 'SAVING', value: true });
              try {
                if (lastMinuteOver) {
                  // Créneau passé : un client de passage l'a pris. Confirmé avec le repère du last
                  // minute, la fiche (qui reste ouverte) propose alors le client et les prestations
                  await api.entities.Appointment.update(appointment.id, {
                    status: 'confirmed',
                    cancellation_reason: null,
                    internal_notes: withLastMinuteMarker(appointment.internal_notes),
                  });
                  toast.success('Créneau repris : saisissez le client puis encaissez');
                  invalidateAppointmentQueries(queryClient);
                  return;
                }
              } catch (e) {
                toast.error(errorMessage(e, 'Rétablissement impossible'));
              } finally {
                dispatch({ type: 'SAVING', value: false });
              }
            }}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium bg-green-500/10 border border-green-500/25 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-60"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {lastMinuteOver ? 'Un client l\'a pris' : 'Rétablir le rendez-vous'}
          </button>
        )}
      </div>

      {/* Rétablir : créneau repris entre-temps (même heure : impossible) ou chevauchement / congé / hors horaires */}
      {isClosedOut && restoreCheck && (
        <div role="status" className={`rounded-xl border p-3 space-y-2 text-xs ${restoreCheck.clash ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
          {restoreCheck.clash ? (
            <p className="break-words">{restoreCheck.clash} : déplacez ce rendez-vous (« Modifier / déplacer ») pour le rétablir.</p>
          ) : (
            restoreCheck.warnings.length > 0 ? (
              <>
                <p className="font-semibold">Avant de rétablir ce rendez-vous :</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {restoreCheck.warnings.map((w) => <li key={w} className="break-words">{w}</li>)}
                </ul>
              </>
            ) : (
              <p className="font-semibold">Rétablir ce rendez-vous ?</p>
            )
          )}
          {!restoreCheck.clash && movedByClient && (
            <p className="break-words">
              Le client a déplacé ce rendez-vous{movedLabel ? ` (« ${movedLabel} »)` : ''} : il a déjà un nouveau RDV. Le rétablir garderait les deux et bloquerait ce créneau.
            </p>
          )}
          {!restoreCheck.clash && canNotifyRestore && (
            <>
              {cancelActor === 'client' && (
                <p className="break-words">Annulé par le client : il ne s'attend plus à venir.</p>
              )}
              <label className="flex items-start gap-2 text-foreground cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={notifyOnRestore}
                  onChange={(e) => setNotifyOnRestore(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-green-500"
                />
                <span className="min-w-0 break-words">
                  Prévenir le client (notification + email) : {cancelActor === 'client' ? 'son rendez-vous est maintenu' : 'il a été prévenu de l\'annulation, il saura que le rendez-vous est maintenu'}
                </span>
              </label>
            </>
          )}
          {linkedOrders.length === 0 && (
            <p className="text-[11px] opacity-80">Les produits annulés avec ce rendez-vous sont remis en commande s'il reste du stock.</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setRestoreCheck(null); setNotifyOnRestore(true); }} disabled={state.saving}
              className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-foreground disabled:opacity-60">
              {restoreCheck.clash ? 'Fermer' : 'Annuler'}
            </button>
            {!restoreCheck.clash && (
              <button type="button" onClick={doRestore} disabled={state.saving}
                className="flex-1 py-2 rounded-lg bg-amber-500 text-black font-semibold disabled:opacity-60">
                {state.saving ? 'Rétablissement…' : (restoreCheck.warnings.length > 0 || movedByClient) ? 'Rétablir quand même' : 'Rétablir le rendez-vous'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Client : recherche / walk-in seulement sur un créneau last minute libre. Un rendez-vous saisi
          sans email (téléphone, sans rendez-vous) affiche simplement son client. */}
      {isLastMinute && !isCompleted && !appointment.client_email && !assignedClient
        && ['', 'Last Minute'].includes(String(appointment.client_name || '').trim()) ? (
        <div className="bg-secondary rounded-xl p-3 space-y-2 relative">
          <ClientAccountPicker autoFocus={false} onSelect={assignAccount} />
          {/* Walk-in: manual name/phone for last minute */}
          {isLastMinute && (
            <div className="space-y-2 pt-1 border-t border-border/50">
              <p className="text-[11px] text-muted-foreground font-medium">Ou saisir manuellement (walk-in) :</p>
              <input
                type="text"
                placeholder="Nom du client"
                value={state.clientName === 'Last Minute' ? '' : state.clientName}
                onChange={e => dispatch({ type: 'SET', field: 'clientName', value: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
              />
              <input
                type="tel"
                placeholder="Téléphone (optionnel)"
                value={state.clientPhone}
                onChange={e => dispatch({ type: 'SET', field: 'clientPhone', value: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
              />
            </div>
          )}

          {/* No one took the last minute slot */}
          <button
            onClick={async () => {
              dispatch({ type: 'SAVING', value: true });
              try {
                // Last minute encore libre : expiration système (le serveur la refuse s'il a été repris).
                // Repris par « Un client l'a pris » mais le client n'est pas venu : absent, repère du
                // last minute retiré (il ne compte plus en converti), nom « Last Minute » gardé (non pris)
                await api.entities.Appointment.update(appointment.id, appointment.status === 'last_minute'
                  ? { status: 'no_show', cancellation_reason: LAST_MINUTE_EXPIRED_REASON }
                  : { status: 'no_show', cancellation_reason: null, internal_notes: stripLastMinuteMarker(appointment.internal_notes) || null });
                toast.success('Créneau marqué comme non pris');
                onUpdate?.();
              } catch (e) {
                toast.error(errorMessage(e, 'Modification impossible'));
                // 409 : un client a repris le Last Minute (cache périmé) ; le rechargement l'affiche
                if (e?.status === 409) invalidateAppointmentQueries(queryClient);
              } finally {
                dispatch({ type: 'SAVING', value: false });
              }
            }}
            disabled={state.saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-all disabled:opacity-60"
          >
            <UserX className="w-3.5 h-3.5" />
            Personne n'a pris le créneau
          </button>
        </div>
      ) : (
        <div className="bg-secondary rounded-xl p-3 space-y-2">
          {/* Proche venu avec le compte de ce client (réservé « Pour qui ? ») : c'est lui qui s'assoit */}
          {guestOf(appointment) && (
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-sm font-bold text-primary truncate">Pour {guestOf(appointment)}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">(compte du client ci-dessous)</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold">{assignedClient?.name || appointment.client_name}</span>
            <GangClientBadge email={assignedClient?.email || appointment.client_email} />
          </div>
          {(assignedClient?.email || appointment.client_email) && (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{assignedClient?.email || appointment.client_email}</span>
            </div>
          )}
          {(assignedClient?.phone || appointment.client_phone) && (
            <a href={telHref(assignedClient?.phone || appointment.client_phone)} className="flex items-center gap-2 w-fit">
              <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-primary underline-offset-2 hover:underline">{assignedClient?.phone || appointment.client_phone}</span>
            </a>
          )}
        </div>
      )}

      {/* Barber */}
      {appointment.employee_name && (
        <div className="flex items-center gap-2">
          <Scissors className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm">{appointment.employee_name}</span>
        </div>
      )}

      {/* Services */}
      {appointment.services?.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Prestations</p>
          <div className="space-y-1.5">
            {appointment.services.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{ background: getServiceColor(s.service_id || idx) + '22', borderLeft: `3px solid ${getServiceColor(s.service_id || idx)}` }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: getServiceColor(s.service_id || idx) }} />
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration} min</span>
                  <span className="font-bold text-primary">{s.price}€</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Produits réservés par le client avec ce RDV : remis par le barber, payés sur place */}
      {openOrders.length > 0 && (
        <div className="rounded-xl border border-sky-400/25 bg-sky-400/5 p-3 space-y-2 min-w-0">
          <p className="text-xs font-semibold text-sky-300">🛍️ À remettre au client</p>
          {openOrders.map((order) => {
            const st = normalizeOrderStatus(order.status);
            const busy = deliveringId === String(order.id);
            return (
              <div key={order.id} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <p className="text-sm font-medium text-foreground min-w-0 break-words">{orderItemsLabel(order) || 'Produit'}</p>
                  <span className="text-sm font-bold text-sky-300 shrink-0">{formatPrice(order.total_price)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ORDER_STATUSES[st]?.bg || ''}`}>
                    {ORDER_STATUSES[st]?.label || 'En attente'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeliver(order)}
                    disabled={busy || state.saving}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-400 text-black hover:bg-sky-300 transition-colors disabled:opacity-60"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {busy ? 'Enregistrement…' : 'Remis et payé'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sélection prestation pour last minute sans services */}
      {isLastMinute && !isCompleted && (!appointment.services || appointment.services.length === 0) && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Prestation effectuée</p>
          {selectedServices.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {selectedServices.map((s, idx) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: getServiceColor(s.id || idx) + '22', borderLeft: `3px solid ${getServiceColor(s.id || idx)}` }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: getServiceColor(s.id || idx) }} />
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{s.duration} min</span>
                    <span className="font-bold text-primary">{s.price}€</span>
                    <button
                      onClick={() => setSelectedServices(prev => prev.filter(x => x.id !== s.id))}
                      className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center hover:bg-red-500/30 transition-colors"
                    >
                      <X className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <select
            value=""
            onChange={(e) => {
              const svc = allServices.find(s => String(s.id) === e.target.value);
              if (svc && !selectedServices.find(s => s.id === svc.id)) {
                setSelectedServices(prev => [...prev, svc]);
              }
            }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:border-primary/40"
          >
            <option value="" className="bg-card">Ajouter une prestation...</option>
            {allServices.filter(s => !selectedServices.find(x => x.id === s.id)).map(s => (
              <option key={s.id} value={s.id} className="bg-card">
                {s.name} — {s.price}€ ({s.duration} min)
              </option>
            ))}
          </select>
        </div>
      )}

      {locked ? (
        <>
          {/* Completed banner */}
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
            <BadgeCheck className="w-5 h-5 text-green-400" />
            <span className="text-sm font-semibold text-green-400">Prestation effectuée</span>
          </div>

          {/* Read-only summary */}
          <div className="bg-primary/10 rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Prestations</span>
              <span>{serviceTotal}€</span>
            </div>
            {tipValue > 0 && (
              <div className="flex items-center justify-between text-xs text-pink-400">
                <span>Pourboire {appointment.tip_method === 'cb' ? '(CB)' : appointment.tip_method === 'especes' ? '(Espèces)' : ''}</span>
                <span>+{tipValue}€</span>
              </div>
            )}
            {prodValue > 0 && (
              <div className="flex items-center justify-between text-xs text-blue-400">
                <span>Produit{appointment.product_sold ? ` (${appointment.product_sold})` : ''}</span>
                <span>+{prodValue}€</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-sm font-semibold text-foreground">Commande totale</span>
              <span className="text-lg font-bold text-primary">{grandTotal}€</span>
            </div>
            {showGiftPaid && (
              <>
                <div className="flex items-center justify-between gap-2 text-xs text-amber-300">
                  <span>Déjà payé par carte cadeau{giftExcess > 0 ? ` (${formatPrice(giftCents / 100)} débités, dont ${formatPrice(giftExcess)} de trop)` : ''}</span>
                  <span className="shrink-0">−{formatPrice(giftPaid)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
                  <span>Reste encaissé</span>
                  <span className="shrink-0">{formatPrice(leftToCash)}</span>
                </div>
              </>
            )}
            {lockedSplit && (
              <div className="flex items-center justify-between gap-2 text-xs text-foreground">
                <span>Payé en espèces {formatPrice(lockedSplit.especes)}</span>
                <span className="shrink-0">CB {formatPrice(lockedSplit.cb)}</span>
              </div>
            )}
            {isAdmin && ['cb', 'especes', SPLIT_PAYMENT].includes(appointment.payment_method) && (
              <p className="text-[11px] text-muted-foreground break-words">
                Le client paie finalement par carte cadeau ?{' '}
                <Link to="/admin/gift-cards" className="font-semibold text-primary underline underline-offset-2">Cartes cadeau</Link>
                {' '}→ scannez la carte → « Déjà encaissés en CB / espèces » : la part carte sera retirée du CB / espèces.
              </p>
            )}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{appointment.total_duration} min</span>
              <span className="flex items-center gap-1">
                {appointment.payment_method === 'cb' ? <CreditCard className="w-3 h-3" /> : appointment.payment_method === 'carte_cadeau' ? <Gift className="w-3 h-3" /> : appointment.payment_method === SPLIT_PAYMENT ? <Coins className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                {appointment.payment_method === 'cb' ? 'CB' : appointment.payment_method === 'carte_cadeau' ? 'Carte cadeau' : appointment.payment_method === SPLIT_PAYMENT ? 'CB + Espèces' : 'Espèces'}
              </span>
            </div>
          </div>
        </>
      ) : unclaimedLastMinute ? (
        <p role="status" className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2.5 text-xs leading-relaxed text-orange-200 break-words">
          {lastMinuteOver
            ? 'Créneau last minute non pris. Si un client l\'a pris, touchez « Un client l\'a pris » pour saisir le client, la prestation et encaisser.'
            : 'Touchez « Rétablir le rendez-vous » pour le remettre en last minute.'}
        </p>
      ) : (
        <>
          {/* Tip */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Heart className="w-3 h-3 text-pink-400" />
              Pourboire
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={state.tip}
                  onChange={(e) => dispatch({ type: 'SET', field: 'tip', value: e.target.value.replace(/[^0-9.,]/g, '') })}
                  aria-invalid={tipInvalid}
                  className={`w-full bg-white/5 border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 ${tipInvalid ? 'border-red-500/60' : 'border-white/10'}`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
              <button
                onClick={() => dispatch({ type: 'SET', field: 'tipMethod', value: 'cb' })}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  state.tipMethod === 'cb'
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10'
                }`}
              >
                <CreditCard className="w-3 h-3" />
                CB
              </button>
              <button
                onClick={() => dispatch({ type: 'SET', field: 'tipMethod', value: 'especes' })}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  state.tipMethod === 'especes'
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10'
                }`}
              >
                <Banknote className="w-3 h-3" />
                Espèces
              </button>
            </div>
            {tipInvalid && <p className="text-[11px] text-red-400">Montant invalide (ex. 2,50)</p>}
          </div>

          {/* Product */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <ShoppingBag className="w-3 h-3 text-blue-400" />
              Produit vendu
            </label>
            <div className="relative">
              <select
                value={state.selectedProductId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) {
                    const product = products.find(p => String(p.id) === String(id));
                    if (product) {
                      dispatch({ type: 'SET_PRODUCT', id, name: product.name, price: String(product.price) });
                    }
                  } else {
                    dispatch({ type: 'CLEAR_PRODUCT' });
                  }
                }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:border-primary/40"
              >
                <option value="" className="bg-card">{state.productSold || 'Sélectionner un produit...'}</option>
                {products.map(p => (
                  <option key={p.id} value={p.id} className="bg-card">
                    {p.name} — {p.price}€
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            {prodValue > 0 && (
              <div className="flex items-center justify-between text-xs text-blue-400 px-1">
                <span>{state.productSold}</span>
                <span>{prodValue}€</span>
              </div>
            )}
            {linkedOrders.length > 0 && (
              <p className="text-[11px] text-muted-foreground px-1">
                Le produit réservé par le client est encaissé via sa commande : ne le saisissez pas ici.
              </p>
            )}
          </div>

          {/* Total + payment */}
          <div className="bg-primary/10 rounded-xl px-4 py-3 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Prestations</span>
                <span>{serviceTotal}€</span>
              </div>
              {tipValue > 0 && (
                <div className="flex items-center justify-between text-xs text-pink-400">
                  <span>Pourboire {state.tipMethod === 'cb' ? '(CB)' : state.tipMethod === 'especes' ? '(Espèces)' : ''}</span>
                  <span>+{tipValue}€</span>
                </div>
              )}
              {prodValue > 0 && (
                <div className="flex items-center justify-between text-xs text-blue-400">
                  <span>Produit{state.productSold ? ` (${state.productSold})` : ''}</span>
                  <span>+{prodValue}€</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="text-sm font-semibold text-foreground">Commande totale</span>
                <span className="text-lg font-bold text-primary">{grandTotal}€</span>
              </div>
              {showGiftPaid && (
                <>
                  <div className="flex items-center justify-between gap-2 text-xs text-amber-300">
                    <span>Déjà payé par carte cadeau{giftExcess > 0 ? ` (${formatPrice(giftCents / 100)} débités, dont ${formatPrice(giftExcess)} de trop)` : ''}</span>
                    <span className="shrink-0">−{formatPrice(giftPaid)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                    <span>Reste à encaisser</span>
                    <span className="shrink-0">{formatPrice(leftToCash)}</span>
                  </div>
                </>
              )}
              {/* À encaisser en plus, hors grand_total : compté dans la boutique via la commande */}
              {openOrders.length > 0 && (
                <div className="flex items-center justify-between gap-2 text-xs text-sky-300">
                  <span>+ produits réservés</span>
                  <span className="font-semibold shrink-0">{formatPrice(openOrdersTotal)}</span>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground text-right">{appointment.total_duration} min</p>
            </div>

            {openOrders.length > 0 && (
              <label className="flex items-start gap-2.5 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={deliverOnValidate}
                  onChange={(e) => setDeliverOnValidate(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-sky-400"
                />
                <span className="text-xs text-foreground min-w-0 break-words">
                  Produits remis et payés ({openOrdersLabel || 'produits'} · {formatPrice(openOrdersTotal)})
                </span>
              </label>
            )}

            {/* Payment method selector */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Mode de paiement</p>
              <div className={`grid ${canSplit ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
                {[
                  { value: 'cb', label: 'CB', icon: CreditCard },
                  { value: 'especes', label: 'Espèces', icon: Banknote },
                  ...(canSplit ? [{ value: SPLIT_PAYMENT, label: 'CB + Espèces', icon: Coins }] : []),
                  { value: 'carte_cadeau', label: 'Carte cadeau', icon: Gift },
                ].map(pm => (
                  <button
                    key={pm.value}
                    onClick={() => dispatch({ type: 'SET', field: 'paymentMethod', value: pm.value })}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                      state.paymentMethod === pm.value
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                        : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                    }`}
                  >
                    <pm.icon className="w-3.5 h-3.5" />
                    {pm.label}
                    {state.paymentMethod === pm.value && <CheckCircle className="w-3 h-3" />}
                  </button>
                ))}
              </div>
              {isSplit && (
                <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <label htmlFor="cash-part" className="flex items-center gap-1.5 text-xs text-foreground shrink-0">
                      <Banknote className="w-3.5 h-3.5" />
                      Espèces
                    </label>
                    <div className="relative flex-1 min-w-0">
                      <input
                        id="cash-part"
                        aria-label="Part payée en espèces"
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={state.cashAmount}
                        onChange={(e) => dispatch({ type: 'SET', field: 'cashAmount', value: e.target.value.replace(/[^0-9.,]/g, '') })}
                        aria-invalid={cashInvalid || cashTooHigh}
                        className={`w-full bg-white/5 border rounded-xl px-3 py-2 pr-7 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 ${cashInvalid || cashTooHigh ? 'border-red-500/60' : 'border-white/10'}`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                    </div>
                    {splitBase > 0 && (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'SET', field: 'cashAmount', value: String(Math.round(splitBase * 50) / 100).replace('.', ',') })}
                        className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                      >
                        Moitié
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CreditCard className="w-3.5 h-3.5" />
                      CB
                    </span>
                    <span className="font-semibold text-foreground">{cashValue > 0 && cardPart > 0 ? formatPrice(cardPart) : '–'}</span>
                  </div>
                  {cashInvalid ? (
                    <p className="text-[11px] text-red-400">Montant invalide (ex. 15 ou 12,50)</p>
                  ) : splitBase <= 0 ? (
                    <p className="text-[11px] text-red-400">Rien à encaisser hors carte cadeau.</p>
                  ) : cashTooHigh ? (
                    <p className="text-[11px] text-red-400 break-words">La part en espèces doit rester sous {formatPrice(splitBase)} : sinon choisissez « Espèces ».</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground break-words">
                      À répartir : {formatPrice(splitBase)} (prestations{prodValue > 0 ? ' et produit' : ''}{giftPaid > 0 ? ', hors carte cadeau' : ''}). Le pourboire garde son propre moyen de paiement.
                    </p>
                  )}
                </div>
              )}
              {giftCardNeedsDebit && (
                <div role="status" className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200 break-words min-w-0">
                  {productUnsaved ? (
                    <>
                      Le produit saisi ({formatPrice(prodValue)}) n'est enregistré sur ce rendez-vous qu'à la clôture : la carte cadeau ne peut débiter que les prestations ({giftCapacity > 0 ? `${formatPrice(giftCapacity)} restants` : 'déjà réglées par la carte'}). Réglez le produit en CB ou en espèces, ou retirez-le pour débiter la carte.
                      {isAdmin && giftCapacity > 0 && (
                        <>{' '}
                          <Link to="/admin/gift-cards" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">
                            Débiter la carte
                          </Link>
                        </>
                      )}
                    </>
                  ) : isAdmin && lmNeedsSave ? (
                    <>
                      Pour payer ce Last Minute par carte cadeau, enregistrez d'abord le client et la prestation : le rendez-vous apparaîtra ensuite dans Cartes cadeau.
                      <button
                        type="button"
                        onClick={saveLastMinuteClient}
                        disabled={state.saving || !String(state.clientName || '').trim() || String(state.clientName || '').trim() === 'Last Minute'
                          || (selectedServices.length === 0 && !appointment.services?.length)}
                        className="mt-2 w-full py-2 rounded-lg bg-amber-500 text-black font-semibold disabled:opacity-50"
                      >
                        {state.saving ? 'Enregistrement…' : 'Enregistrer le client et la prestation'}
                      </button>
                    </>
                  ) : isAdmin ? (
                    <>
                      La carte cadeau se débite depuis Cartes cadeau : scannez le QR ou saisissez le code, puis choisissez ce rendez-vous (ou rattachez-y un débit déjà fait : historique de la carte → « Rattacher à un RDV »). Il sera clôturé automatiquement.{' '}
                      <Link to="/admin/gift-cards" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">
                        Débiter la carte
                      </Link>
                    </>
                  ) : (
                    <>Le débit de la carte cadeau se fait au comptoir par l'admin (Cartes cadeau). Laissez ce rendez-vous « À encaisser ».</>
                  )}
                </div>
              )}
              {giftShortOnCorrection && (
                <p role="status" className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
                  La carte cadeau n'a réglé que {formatPrice(giftPaid)} : choisissez CB ou Espèces pour encaisser le reste.
                </p>
              )}
              {state.paymentMethod === 'carte_cadeau' && giftCovered && appointment.payment_method !== 'carte_cadeau' && (
                <p role="status" className="mt-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                  Déjà réglé par carte cadeau ({formatPrice(giftPaid)}) : vous pouvez clôturer.
                </p>
              )}
            </div>
          </div>

          {giftExcess > 0 && (
            <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200 break-words min-w-0">
              La carte cadeau a réglé {formatPrice(giftCents / 100)} : {formatPrice(giftExcess)} de plus que le prix. Rendez-les d'abord sur la carte (Cartes cadeau, historique de la carte : « Annuler » sous 24 h, sinon « Rendre sur la carte »){giftExcessBlocks ? ', puis enregistrez' : ''}.
              {isAdmin && (
                <>{' '}
                  <Link to="/admin/gift-cards" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">Cartes cadeau</Link>
                </>
              )}
            </div>
          )}

          {needsService && state.paymentMethod && (
            <p role="status" className="text-xs text-amber-300 text-center">Choisissez la prestation effectuée pour valider</p>
          )}

          {/* Validate button */}
          {canValidate && (
            <button
              onClick={handleValidate}
              disabled={state.saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25 hover:bg-green-600 transition-all disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {state.saving ? 'Enregistrement...' : correcting ? 'Enregistrer la correction' : 'Valider la prestation'}
            </button>
          )}

          {correcting && (
            <button
              type="button"
              onClick={() => setCorrecting(false)}
              className="w-full py-2.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              Annuler la correction
            </button>
          )}

          {/* Cancel confirmation (second tap) */}
          {!correcting && !isClosedOut && confirmingCancel && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 space-y-2.5">
              <p className="text-sm font-semibold text-red-400 flex items-center gap-1.5">
                <X className="w-4 h-4 shrink-0" />
                Annuler ce rendez-vous ?
              </p>
              <input
                type="text"
                value={cancelReason}
                maxLength={STAFF_CANCEL_REASON_MAX}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Motif (facultatif)"
                aria-label="Motif de l'annulation (facultatif)"
                className="w-full min-w-0 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-red-500/40"
              />
              {openOrders.length > 0 && (
                <p className="text-[11px] text-muted-foreground break-words">
                  Les produits commandés avec ce rendez-vous seront annulés (sauf ceux déjà prêts).
                </p>
              )}
              {giftCents > 0 && (
                <p className="text-[11px] text-amber-300 break-words">
                  {formatPrice(giftCents / 100)} ont été débités sur une carte cadeau pour ce rendez-vous : pensez à les rendre (Cartes cadeau, historique de la carte).{' '}
                  {isAdmin && <Link to="/admin/gift-cards" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">Cartes cadeau</Link>}
                </p>
              )}
              {canNotifyCancel && (
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    checked={notifyOnCancel}
                    onChange={(e) => setNotifyOnCancel(e.target.checked)}
                    className="mt-0.5 w-4 h-4 shrink-0 accent-red-500"
                  />
                  <span className="min-w-0 break-words">Prévenir le client (notification + email)</span>
                </label>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setConfirmingCancel(false); setCancelReason(''); setNotifyOnCancel(true); }}
                  disabled={state.saving}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-60"
                >
                  Garder
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={state.saving}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-60"
                >
                  {state.saving ? 'Annulation…' : "Confirmer l'annulation"}
                </button>
              </div>
            </div>
          )}

          {/* Cancel / No-show buttons */}
          {!correcting && !confirmingCancel && appointment.status !== 'cancelled' && appointment.status !== 'no_show' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingCancel(true)}
                disabled={state.saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-60"
              >
                <X className="w-3.5 h-3.5" />
                Annuler
              </button>
              {hasStarted && (
              <button
                onClick={async () => {
                  dispatch({ type: 'SAVING', value: true });
                  try {
                    await api.entities.Appointment.update(appointment.id, { status: 'no_show' });
                    // Part déjà débitée d'une carte cadeau : à rendre, rien ne le fait tout seul (tour 7)
                    if (giftCents > 0) {
                      toast.warning(`${formatPrice(giftCents / 100)} ont été débités sur une carte cadeau pour ce rendez-vous : pensez à les rendre (Cartes cadeau, historique de la carte).`, { duration: 10000 });
                    }
                    // Comme « Client venu ? » : un tap par erreur se rattrape tout de suite
                    toast('Marqué absent', {
                      duration: 8000,
                      action: {
                        label: 'Annuler',
                        onClick: async () => {
                          try {
                            await api.entities.Appointment.update(appointment.id, { status: 'confirmed' });
                            onUpdate?.();
                          } catch (e) {
                            toast.error(errorMessage(e, 'Impossible d’annuler : rétablissez le rendez-vous depuis sa fiche.'));
                          }
                        },
                      },
                    });
                    onUpdate?.();
                  } catch (e) {
                    toast.error(errorMessage(e, 'Modification impossible'));
                  } finally {
                    dispatch({ type: 'SAVING', value: false });
                  }
                }}
                disabled={state.saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-all disabled:opacity-60"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Absent
              </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Motif d'annulation (RDV annulé ou absent) */}
      {isClosedOut && (cancelActor === 'system' || cancelByLabel || cancelMotif) && (
        <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2 min-w-0">
          <X className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-red-400">Motif d'annulation</p>
            {cancelActor === 'system' ? (
              <p className="text-xs text-muted-foreground">Last minute non pris</p>
            ) : (
              <>
                {cancelByLabel && <p className="text-xs text-muted-foreground">{cancelByLabel}</p>}
                {cancelMotif && <p className="text-xs text-foreground/80 break-words">« {cancelMotif} »</p>}
              </>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {appointment.notes && (
        <div className="flex items-start gap-2">
          <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">{appointment.notes}</p>
        </div>
      )}
      {internalNote && (
        <div className="flex items-start gap-2 bg-secondary rounded-lg px-3 py-2">
          <FileText className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-xs text-yellow-300/80">{internalNote}</p>
        </div>
      )}

      {/* Delete (deux taps : le premier ouvre la confirmation dans la fiche). RDV client à venir :
          pas de suppression, on l'annule (le client peut être prévenu) */}
      {upcomingClient ? (
        <p className="mt-2 text-[11px] text-muted-foreground text-center break-words">
          Pour retirer un rendez-vous client à venir, utilisez « Annuler » : le client pourra être prévenu.
        </p>
      ) : confirmingDelete ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 space-y-2.5 mt-2">
          <p className="text-sm font-semibold text-red-400 flex items-center gap-1.5">
            <Trash2 className="w-4 h-4 shrink-0" />
            Supprimer définitivement ce rendez-vous ?
          </p>
          <p className="text-xs text-muted-foreground">
            Il disparaîtra de l'agenda et des statistiques, et le client n'est pas prévenu. Pour libérer le créneau en gardant une trace, préférez « Annuler ».
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={state.saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-60"
            >
              Garder
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={state.saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-60"
            >
              {state.saving ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={state.saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-60 mt-2"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Supprimer le rendez-vous
        </button>
      )}
    </div>
  );
}

/**
 * Fiche d'un rendez-vous de l'agenda. `onChanged(rdv?)` après toute modification (avec le rendez-vous
 * à jour quand il a été modifié / déplacé), `onDeleted()` après suppression. `linkedOrders` : commandes
 * ouvertes rattachées au RDV (produits réservés par le client, à remettre pendant la prestation).
 */
export default function AppointmentDetailModal({ appointment, employees = [], linkedOrders, onClose, onChanged, onDeleted }) {
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => { setEditing(false); }, [appointment?.id]);

  return (
    <Dialog open={!!appointment} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90dvh] overflow-y-auto">
        {appointment && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                {editing ? <Pencil className="w-4 h-4 text-primary" /> : <Calendar className="w-4 h-4 text-primary" />}
                {editing ? 'Modifier le rendez-vous' : 'Détails du rendez-vous'}
              </DialogTitle>
            </DialogHeader>
            {editing ? (
              <AppointmentEditForm
                key={`edit-${appointment.id}`}
                appointment={appointment}
                employees={employees}
                onCancel={() => setEditing(false)}
                onSaved={(updated) => onChanged?.(updated)}
              />
            ) : (
              <ModalInner
                key={appointment.id}
                appointment={appointment}
                employees={employees}
                linkedOrders={Array.isArray(linkedOrders) ? linkedOrders : undefined}
                onEdit={() => setEditing(true)}
                onUpdate={() => onChanged?.()}
                onDelete={() => onDeleted?.()}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
