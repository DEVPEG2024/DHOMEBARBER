import React, { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Package, Clock, CheckCircle, XCircle, Truck, ShoppingBag, Trash2, RotateCcw, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatPrice } from '@/components/shop/productUtils';
import {
  CANCEL_REASON_MAX,
  ORDER_STATUSES,
  normalizeOrderStatus,
  useCancelFeatures,
  invalidateOrderQueries,
  cancelledByLabel,
  cleanReason,
} from '@/lib/cancellation';

const TZ = 'Europe/Paris';

const statusConfig = {
  pending:    { icon: Clock,       color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  confirmed:  { icon: CheckCircle, color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  ready:      { icon: Package,     color: 'text-primary',    bg: 'bg-primary/10 border-primary/20' },
  delivered:  { icon: Truck,       color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  cancelled:  { icon: XCircle,     color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
};

const statusFlow = ['pending', 'confirmed', 'ready', 'delivered'];

const nextStatusLabel = {
  confirmed: 'Confirmer',
  ready: 'Marquer prête',
  delivered: 'Marquer retirée',
};

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'pending', label: 'En attente' },
  { id: 'confirmed', label: 'Confirmées' },
  { id: 'ready', label: 'Prêtes' },
  { id: 'delivered', label: 'Retirées' },
  { id: 'cancelled', label: 'Annulées' },
];

/** Message lisible : celui du serveur, sinon celui de l'erreur sauf « HTTP 409 », sinon le repli. */
function errorMessage(err, fallback = 'Mise à jour impossible') {
  const server = typeof err?.data?.error === 'string' ? err.data.error.trim() : '';
  if (server && !/^HTTP \d+$/.test(server)) return server;
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  if (msg && !/^HTTP \d+$/.test(msg)) return msg;
  return fallback;
}

/** « 13 oct. 2026 » pour une date seule (YYYY-MM-DD), sans décalage de fuseau. */
function formatYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Date de création : sans heure si le serveur n'a stocké qu'une date, sinon date + heure de Paris. */
function formatCreated(value) {
  if (!value) return '';
  const raw = String(value);
  if (raw.length === 10) return formatYmd(raw);
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  return `${date} · ${time}`;
}

/** « le 13 oct. à 14:32 » (heure de Paris), ou chaîne vide. */
function formatCancelledAt(value) {
  const t = Date.parse(value || '');
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: TZ });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  return `le ${date} à ${time}`;
}

const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;

const orderItems = (order) => (Array.isArray(order?.items) ? order.items : []);

function OrderSummary({ order }) {
  const items = orderItems(order);
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-1">
      {items.map((item, j) => (
        <div key={j} className="flex justify-between gap-3 text-xs min-w-0">
          <span className="text-muted-foreground min-w-0 break-words">{item.quantity || 1}× {item.name}</span>
          <span className="font-semibold shrink-0">{formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 1))}</span>
        </div>
      ))}
      <div className="flex justify-between pt-1.5 mt-1 border-t border-border text-sm font-bold">
        <span>Total</span>
        <span className="text-primary">{formatPrice(order.total_price)}</span>
      </div>
    </div>
  );
}

export default function AdminOrders() {
  const [filter, setFilter] = useState('all');
  // Fenêtre de confirmation : { kind: 'cancel' | 'delete', order }
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const features = useCancelFeatures();

  const { data: orders = [] } = useQuery({
    queryKey: ['adminOrders'],
    queryFn: () => api.entities.Order.list('-created_date', 200),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Order.update(id, data),
    onSuccess: (_res, vars) => {
      invalidateOrderQueries(queryClient);
      toast.success(vars.successMessage || 'Statut mis à jour');
      if (vars.closeDialog) setConfirm(null);
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      // Le serveur a peut-être refusé à cause d'un état périmé (stock, statut) : on recharge
      invalidateOrderQueries(queryClient);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Order.delete(id),
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      toast.success('Commande supprimée');
      setConfirm(null);
    },
    onError: (err) => toast.error(errorMessage(err, 'Suppression impossible')),
  });

  const busy = updateMutation.isPending || deleteMutation.isPending;

  const withStatus = orders.map((o) => ({ order: o, status: normalizeOrderStatus(o.status) }));
  const filtered = filter === 'all' ? withStatus : withStatus.filter((x) => x.status === filter);

  const counts = { all: orders.length };
  for (const f of FILTERS) {
    if (f.id !== 'all') counts[f.id] = withStatus.filter((x) => x.status === f.id).length;
  }

  const getNextStatus = (current) => {
    const idx = statusFlow.indexOf(current);
    if (idx === -1 || idx >= statusFlow.length - 1) return null;
    return statusFlow[idx + 1];
  };

  const openConfirm = (kind, order) => {
    setReason('');
    setConfirm({ kind, order });
  };

  const closeConfirm = () => {
    if (busy) return;
    setConfirm(null);
  };

  const submitCancel = () => {
    const order = confirm?.order;
    if (!order) return;
    const motif = reason.trim().slice(0, CANCEL_REASON_MAX);
    updateMutation.mutate({
      id: order.id,
      data: {
        status: 'cancelled',
        // La colonne n'existe qu'après la migration serveur (features.orderCancel)
        ...(features.orderCancel && motif ? { cancellation_reason: motif } : {}),
      },
      successMessage: 'Commande annulée',
      closeDialog: true,
    });
  };

  const confirmOrder = confirm?.order;
  const confirmName = confirmOrder ? (confirmOrder.client_name || confirmOrder.client_email || 'ce client') : '';

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Boutique</p>
          <h1 className="font-display text-2xl font-bold">Commandes</h1>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-primary">{counts.pending}</p>
          <p className="text-[11px] text-muted-foreground">en attente</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
        {FILTERS.map(f => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)}
            className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-full border transition-all ${
              filter === f.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/50'
            }`}>
            {f.label} {counts[f.id] > 0 && `(${counts[f.id]})`}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        {filtered.map(({ order, status: st }, i) => {
          const config = statusConfig[st] || statusConfig.pending;
          const StatusIcon = config.icon;
          const label = ORDER_STATUSES[st]?.label || 'En attente';
          const next = getNextStatus(st);
          const isCancelled = st === 'cancelled';
          const byLabel = isCancelled ? cancelledByLabel(order, 'admin', 'commande') : null;
          const motif = isCancelled ? cleanReason(order.cancellation_reason) : '';
          const cancelledWhen = isCancelled ? formatCancelledAt(order.cancelled_at) : '';
          const created = formatCreated(order.created_date || order.created_at);

          return (
            <motion.div key={order.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 20) * 0.03 }}
              className="bg-card border border-border rounded-xl p-4 min-w-0">

              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{order.client_name || order.client_email}</p>
                  {order.client_email && (
                    <p className="text-[11px] text-muted-foreground truncate">{order.client_email}</p>
                  )}
                  {order.client_phone && (
                    <a href={telHref(order.client_phone)}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5">
                      <Phone className="w-3 h-3" />
                      {order.client_phone}
                    </a>
                  )}
                </div>
                <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 ${config.bg} ${config.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {label}
                </span>
              </div>

              {/* Items */}
              <div className="space-y-1 mb-3">
                {orderItems(order).map((item, j) => (
                  <div key={j} className="flex justify-between gap-3 text-xs min-w-0">
                    <span className="text-muted-foreground min-w-0 break-words">
                      {item.quantity || 1}× {item.name}
                    </span>
                    <span className="font-semibold text-foreground shrink-0">
                      {formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 1))}
                    </span>
                  </div>
                ))}
              </div>

              {/* Total + date */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                <div className="text-[11px] text-muted-foreground min-w-0 truncate">{created}</div>
                <p className={`text-sm font-bold shrink-0 ${isCancelled ? 'text-muted-foreground line-through' : 'text-primary'}`}>
                  {formatPrice(order.total_price)}
                </p>
              </div>

              {/* Notes */}
              {order.notes && (
                <p className="text-[11px] text-muted-foreground mt-2 italic break-words">"{order.notes}"</p>
              )}

              {/* Cancellation details */}
              {isCancelled && (byLabel || motif || cancelledWhen) && (
                <div className="mt-2 rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2 text-[11px] min-w-0">
                  <p className="text-red-400 font-semibold">
                    {[byLabel || 'Annulée', cancelledWhen].filter(Boolean).join(' ')}
                  </p>
                  {motif && <p className="text-foreground/80 break-words mt-0.5">« {motif} »</p>}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mt-3">
                {next && (
                  <Button size="sm" className="flex-1 min-w-[120px] gap-1.5" disabled={busy}
                    onClick={() => updateMutation.mutate({ id: order.id, data: { status: next } })}>
                    {nextStatusLabel[next]}
                  </Button>
                )}
                {!isCancelled && st !== 'delivered' && (
                  <Button size="sm" variant="outline" disabled={busy}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5"
                    onClick={() => openConfirm('cancel', order)}>
                    <XCircle className="w-3.5 h-3.5" />
                    Annuler
                  </Button>
                )}
                {isCancelled && (
                  <Button size="sm" variant="outline" disabled={busy}
                    className="flex-1 min-w-[120px] border-green-500/30 text-green-400 hover:bg-green-500/10 gap-1.5"
                    onClick={() => updateMutation.mutate({
                      id: order.id,
                      data: { status: 'pending' },
                      successMessage: 'Commande rétablie',
                    })}>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Rétablir
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={busy}
                  aria-label="Supprimer la commande"
                  className="text-muted-foreground hover:text-red-400 px-2 ml-auto"
                  onClick={() => openConfirm('delete', order)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucune commande {filter !== 'all' ? 'dans cette catégorie' : ''}</p>
        </div>
      )}

      {/* Confirmation : annuler / supprimer (fermeture par la croix ou les boutons) */}
      <Dialog open={!!confirm} onOpenChange={(open) => { if (!open) closeConfirm(); }}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90dvh] overflow-y-auto">
          {confirmOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display pr-6 break-words">
                  {confirm.kind === 'cancel'
                    ? `Annuler la commande de ${confirmName} ?`
                    : 'Supprimer cette commande ?'}
                </DialogTitle>
                <DialogDescription>
                  {confirm.kind === 'cancel'
                    ? 'La commande passe en « Annulée ». Vous pourrez la rétablir ensuite.'
                    : `Commande de ${confirmName}. Elle disparaîtra définitivement de la liste et des statistiques.`}
                </DialogDescription>
              </DialogHeader>

              <OrderSummary order={confirmOrder} />

              {confirm.kind === 'cancel' && features.orderCancel && (
                <div className="space-y-1">
                  <label htmlFor="order-cancel-reason" className="text-xs text-muted-foreground">
                    Motif (facultatif, visible par le client)
                  </label>
                  <textarea
                    id="order-cancel-reason"
                    value={reason}
                    maxLength={CANCEL_REASON_MAX}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Ex. : produit en rupture chez le fournisseur"
                    className="w-full min-w-0 resize-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
                  />
                  <p className="text-[10px] text-muted-foreground text-right">{reason.length}/{CANCEL_REASON_MAX}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={closeConfirm}>
                  Garder
                </Button>
                {confirm.kind === 'cancel' ? (
                  <Button type="button" className="flex-1 bg-red-500 hover:bg-red-600 text-white" disabled={busy}
                    onClick={submitCancel}>
                    {updateMutation.isPending ? 'Annulation…' : 'Annuler la commande'}
                  </Button>
                ) : (
                  <Button type="button" className="flex-1 bg-red-500 hover:bg-red-600 text-white" disabled={busy}
                    onClick={() => deleteMutation.mutate(confirmOrder.id)}>
                    {deleteMutation.isPending ? 'Suppression…' : 'Supprimer'}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
