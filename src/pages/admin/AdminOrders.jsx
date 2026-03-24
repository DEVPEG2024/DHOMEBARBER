import React, { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Package, Clock, CheckCircle, XCircle, Truck, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const statusConfig = {
  pending:    { label: 'En attente',  icon: Clock,       color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  confirmed:  { label: 'Confirmée',   icon: CheckCircle, color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  ready:      { label: 'Prête',       icon: Package,     color: 'text-primary',    bg: 'bg-primary/10 border-primary/20' },
  delivered:  { label: 'Retirée',     icon: Truck,       color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  cancelled:  { label: 'Annulée',     icon: XCircle,     color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
};

const statusFlow = ['pending', 'confirmed', 'ready', 'delivered'];

export default function AdminOrders() {
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: orders = [] } = useQuery({
    queryKey: ['adminOrders'],
    queryFn: () => api.entities.Order.list('-created_date', 200),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }) => api.entities.Order.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminOrders'] });
      toast.success('Statut mis à jour');
    },
    onError: () => toast.error('Erreur'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Order.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminOrders'] });
      toast.success('Commande supprimée');
    },
    onError: () => toast.error('Erreur'),
  });

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    ready: orders.filter(o => o.status === 'ready').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  const getNextStatus = (current) => {
    const idx = statusFlow.indexOf(current);
    if (idx === -1 || idx >= statusFlow.length - 1) return null;
    return statusFlow[idx + 1];
  };

  const nextStatusLabel = {
    confirmed: 'Confirmer',
    ready: 'Marquer prête',
    delivered: 'Marquer retirée',
  };

  return (
    <div>
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
        {[
          { id: 'all', label: 'Toutes' },
          { id: 'pending', label: 'En attente' },
          { id: 'confirmed', label: 'Confirmées' },
          { id: 'ready', label: 'Prêtes' },
          { id: 'delivered', label: 'Retirées' },
          { id: 'cancelled', label: 'Annulées' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
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
        {filtered.map((order, i) => {
          const status = statusConfig[order.status] || statusConfig.pending;
          const StatusIcon = status.icon;
          const next = getNextStatus(order.status);

          return (
            <motion.div key={order.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-xl p-4">

              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold">{order.client_name || order.client_email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {order.client_email}
                    {order.client_phone && ` · ${order.client_phone}`}
                  </p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 ${status.bg} ${status.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {status.label}
                </span>
              </div>

              {/* Items */}
              <div className="space-y-1 mb-3">
                {order.items?.map((item, j) => (
                  <div key={j} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-semibold text-foreground">{((item.price || 0) * (item.quantity || 1)).toFixed(2)}€</span>
                  </div>
                ))}
              </div>

              {/* Total + date */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-[11px] text-muted-foreground">
                  {order.created_date && format(new Date(order.created_date), 'd MMM yyyy · HH:mm', { locale: fr })}
                </div>
                <p className="text-sm font-bold text-primary">{order.total_price}€</p>
              </div>

              {/* Notes */}
              {order.notes && (
                <p className="text-[11px] text-muted-foreground mt-2 italic">"{order.notes}"</p>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                {next && (
                  <Button size="sm" className="flex-1 gap-1.5"
                    onClick={() => updateMutation.mutate({ id: order.id, status: next })}>
                    {nextStatusLabel[next]}
                  </Button>
                )}
                {order.status !== 'cancelled' && order.status !== 'delivered' && (
                  <Button size="sm" variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5"
                    onClick={() => updateMutation.mutate({ id: order.id, status: 'cancelled' })}>
                    <XCircle className="w-3.5 h-3.5" />
                    Annuler
                  </Button>
                )}
                <Button size="sm" variant="ghost"
                  className="text-muted-foreground hover:text-red-400 px-2"
                  onClick={() => {
                    if (window.confirm('Supprimer cette commande ?')) deleteMutation.mutate(order.id);
                  }}>
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
    </div>
  );
}
