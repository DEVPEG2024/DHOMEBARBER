import React, { useState, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ShoppingBag, Package, Phone, XCircle, CalendarClock } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { formatPrice } from '@/components/shop/productUtils';
import {
  ORDER_STATUSES, OPEN_ORDER_STATUSES, normalizeOrderStatus, canClientCancelOrder,
  useCancelFeatures, cancelOrder, friendlyCancelError, invalidateOrderQueries,
  cancelledByLabel, cleanReason, CANCEL_REASON_MAX, CANCEL_FEATURES_QUERY_KEY,
  SALON_PHONE, SALON_PHONE_HREF,
} from '@/lib/cancellation';
import LoadError from '@/components/shared/LoadError';

const parisDateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Date de la commande : date seule (anciennes lignes) ou date + heure de Paris. */
function formatOrderDate(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length === 10) {
    const d = parseISO(s);
    return isValid(d) ? format(d, 'd MMMM yyyy', { locale: fr }) : '';
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : parisDateTime.format(d);
}

/** Motif posé par le serveur quand la commande est annulée avec son rendez-vous. */
const isCancelledWithAppointment = (order) => /^rendez-vous annul[ée]$/i.test(cleanReason(order?.cancellation_reason));

/** « Pour votre rendez-vous du mercredi 14 octobre à 09:30 avec Romain » (date du RDV, déjà en heure de Paris). */
function appointmentLine(apt) {
  if (!apt) return 'Pour votre rendez-vous';
  const d = apt.date ? parseISO(apt.date) : null;
  const day = d && isValid(d) ? format(d, 'EEEE d MMMM', { locale: fr }) : '';
  const time = apt.start_time ? String(apt.start_time).slice(0, 5) : '';
  let text = 'Pour votre rendez-vous';
  if (day) text += ` du ${day}`;
  if (time) text += ` à ${time}`;
  if (apt.employee_name) text += ` avec ${apt.employee_name}`;
  return text;
}

const itemCount = (order) => (order.items || [])
  .reduce((sum, item) => sum + (Math.max(0, Number(item?.quantity) || 0)), 0);

const orderTotal = (order) => {
  const t = Number(order.total_price);
  if (Number.isFinite(t)) return t;
  return (order.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
};

export default function Orders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const features = useCancelFeatures();
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [reason, setReason] = useState('');

  const ordersKey = ['myOrders', user?.email];
  const ordersQuery = useQuery({
    queryKey: ordersKey,
    queryFn: () => api.entities.Order.filter({ client_email: user?.email }, '-created_date', 100),
    enabled: !!user?.email,
    refetchInterval: 30000, // Auto-refresh toutes les 30s
  });
  const { data: orders = [], isLoading } = ordersQuery;

  // Commandes ajoutées à un rendez-vous : on retrouve le RDV avec les mêmes clé et requête que
  // Mes rendez-vous (cache partagé). Échec sans conséquence : « Pour votre rendez-vous » seul.
  const hasLinked = orders.some((o) => !!o?.appointment_id);
  const { data: myAppointments } = useQuery({
    queryKey: ['myAppointments', user?.email],
    queryFn: () => api.entities.Appointment.filter({ client_email: user.email }, '-date', 100),
    enabled: !!user?.email && hasLinked,
    retry: false,
  });
  const appointmentsById = useMemo(
    () => new Map((Array.isArray(myAppointments) ? myAppointments : []).map((a) => [String(a.id), a])),
    [myAppointments],
  );

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason: r }) => cancelOrder(id, r),
    onSuccess: ({ order, already }, { id, reason: r }) => {
      const trimmed = String(r || '').trim().slice(0, CANCEL_REASON_MAX);
      queryClient.setQueryData(ordersKey, (prev) => (Array.isArray(prev)
        ? prev.map((o) => (String(o.id) === String(id)
          ? {
            ...o,
            status: 'cancelled',
            cancelled_by: o.cancelled_by || 'client',
            cancellation_reason: o.cancellation_reason || trimmed || null,
            ...(order && typeof order === 'object' ? order : {}),
          }
          : o))
        : prev));
      invalidateOrderQueries(queryClient);
      toast.success(already ? 'Cette commande était déjà annulée' : 'Commande annulée');
      setOrderToCancel(null);
      setReason('');
    },
    onError: (err) => {
      const e = friendlyCancelError(err, 'order');
      toast.error(e.message, e.callSalon
        ? { action: { label: 'Appeler', onClick: () => { window.location.href = SALON_PHONE_HREF; } } }
        : undefined);
      if (e.refetch) {
        // La commande a changé côté serveur (prête, déjà close…) ou ne s'annule plus en ligne :
        // réessayer ne servirait à rien, on referme et la liste rechargée montre son état réel.
        queryClient.invalidateQueries({ queryKey: ['myOrders'] });
        queryClient.invalidateQueries({ queryKey: CANCEL_FEATURES_QUERY_KEY });
        setOrderToCancel(null);
        setReason('');
      }
      // Sinon (réseau, serveur indisponible, trop d'essais) : la fenêtre reste ouverte avec le
      // motif saisi, pour réessayer d'un tap.
    },
  });

  const openCancel = (order) => {
    setReason('');
    setOrderToCancel(order);
  };

  const closeCancel = (open) => {
    if (open) return;
    if (cancelMutation.isPending) return; // pas de fermeture pendant l'envoi
    setOrderToCancel(null);
    setReason('');
  };

  const confirmCancel = () => {
    if (!orderToCancel || cancelMutation.isPending) return;
    cancelMutation.mutate({ id: orderToCancel.id, reason });
  };

  const pending = cancelMutation.isPending;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold mb-1">Mes achats</p>
          <h1 className="font-display text-3xl font-bold text-foreground">Commandes</h1>
          <div className="h-0.5 w-12 mt-2 rounded-full bg-gradient-to-r from-primary to-primary/30" />
        </motion.div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : ordersQuery.isError && !ordersQuery.data ? (
          <LoadError what="vos commandes" error={ordersQuery.error} onRetry={ordersQuery.refetch} retrying={ordersQuery.isFetching} />
        ) : orders.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-5">
              <ShoppingBag className="w-8 h-8 text-muted-foreground/25" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Aucune commande</p>
            <p className="text-xs text-muted-foreground">Vos achats en boutique apparaîtront ici</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {orders.map((order, i) => {
              const statusKey = normalizeOrderStatus(order.status);
              const status = ORDER_STATUSES[statusKey];
              const count = itemCount(order);
              const canCancel = canClientCancelOrder(order, features);
              const isOpen = OPEN_ORDER_STATUSES.includes(statusKey);
              const linked = !!order.appointment_id;
              const linkedApt = linked ? appointmentsById.get(String(order.appointment_id)) : null;
              const withAppointment = statusKey === 'cancelled' && isCancelledWithAppointment(order);
              const byLabel = statusKey === 'cancelled'
                ? (withAppointment ? 'Annulée avec votre rendez-vous' : cancelledByLabel(order, 'client'))
                : null;
              const motive = statusKey === 'cancelled' && !withAppointment ? cleanReason(order.cancellation_reason) : '';
              // Remise par le barber pendant le RDV, tant qu'elle n'est pas prête au salon
              const handedAtAppointment = linked && (statusKey === 'pending' || statusKey === 'confirmed');
              return (
                <motion.div key={order.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground break-words">
                        {formatOrderDate(order.created_date)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{count} article{count > 1 ? 's' : ''}</p>
                      {linked && (
                        <p className="flex items-start gap-1.5 text-[11px] text-primary mt-1 leading-relaxed break-words">
                          <CalendarClock className="w-3 h-3 mt-0.5 shrink-0" />
                          <span className="min-w-0">{appointmentLine(linkedApt)}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${status.bg}`}>
                        {status.label}
                      </span>
                      {byLabel && <span className="text-[10px] text-muted-foreground text-right max-w-[8.5rem] leading-snug">{byLabel}</span>}
                    </div>
                  </div>
                  {motive && (
                    <p className="text-[11px] text-muted-foreground mb-2 break-words">Motif : {motive}</p>
                  )}
                  {order.items?.map((item, j) => (
                    <div key={j} className="flex justify-between items-start gap-3 py-1">
                      <div className="flex items-start gap-2 min-w-0">
                        <Package className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-xs text-muted-foreground break-words min-w-0">{item.name} ×{item.quantity}</span>
                      </div>
                      <span className="text-xs font-bold text-primary shrink-0">
                        {formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 0))}
                      </span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-white/6 flex justify-between">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-sm font-bold text-foreground">{formatPrice(orderTotal(order))}</span>
                  </div>

                  {handedAtAppointment && (
                    <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                      Votre barber vous la remet pendant le rendez-vous.
                    </p>
                  )}

                  {canCancel ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => openCancel(order)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 px-2 py-1.5 -mr-2 rounded-lg active:scale-95 transition-transform"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Annuler la commande
                      </button>
                    </div>
                  ) : isOpen && (
                    <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                      {statusKey === 'ready'
                        ? 'Votre commande est prête au salon : pour l\'annuler, appelez le '
                        : 'Besoin de modifier ou d\'annuler ? Appelez le salon au '}
                      <a href={SALON_PHONE_HREF} className="inline-flex items-center gap-1 text-primary font-semibold whitespace-nowrap">
                        <Phone className="w-3 h-3" />{SALON_PHONE}
                      </a>
                    </p>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!orderToCancel} onOpenChange={closeCancel}>
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-sm rounded-2xl p-5"
          onEscapeKeyDown={(e) => { if (pending) e.preventDefault(); }}
        >
          <DialogHeader className="text-left pr-6">
            <DialogTitle>Annuler cette commande ?</DialogTitle>
            <DialogDescription>
              Rien n'a été payé en ligne : il n'y a rien à rembourser.
            </DialogDescription>
          </DialogHeader>

          {orderToCancel && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              {(orderToCancel.items || []).map((item, j) => (
                <div key={j} className="flex justify-between items-start gap-3 text-xs">
                  <span className="text-muted-foreground break-words min-w-0">{item.name} ×{item.quantity}</span>
                  <span className="font-semibold shrink-0">
                    {formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 0))}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-1.5 mt-1.5 border-t border-border text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold">{formatPrice(orderTotal(orderToCancel))}</span>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="order-cancel-reason" className="text-xs text-muted-foreground mb-1 block">
              Motif (facultatif)
            </label>
            <Textarea
              id="order-cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, CANCEL_REASON_MAX))}
              maxLength={CANCEL_REASON_MAX}
              disabled={pending}
              placeholder="Ex. : je me suis trompé de produit"
              className="bg-card border-border text-sm resize-none h-20"
            />
            <p className="text-[10px] text-muted-foreground text-right mt-1">{reason.length}/{CANCEL_REASON_MAX}</p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="flex-1" disabled={pending} onClick={() => closeCancel(false)}>
              Non, garder
            </Button>
            <Button
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
              disabled={pending}
              onClick={confirmCancel}
            >
              {pending ? 'Annulation…' : 'Oui, annuler'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
