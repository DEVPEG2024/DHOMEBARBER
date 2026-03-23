import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ShoppingBag, Package } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const statusConfig = {
  pending:   { label: 'En attente',       bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  confirmed: { label: 'Confirmée',        bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  ready:     { label: 'Prête à retirer',  bg: 'bg-primary/10 text-primary border-primary/20' },
  delivered: { label: 'Retirée',          bg: 'bg-green-500/10 text-green-400 border-green-500/20' },
  completed: { label: 'Livrée',           bg: 'bg-green-500/10 text-green-400 border-green-500/20' },
  cancelled: { label: 'Annulée',          bg: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function Orders() {
  const { user } = useAuth();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['myOrders', user?.email],
    queryFn: () => base44.entities.Order.filter({ client_email: user?.email }, '-created_date', 100),
    enabled: !!user?.email,
  });

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
              const status = statusConfig[order.status] || statusConfig.pending;
              return (
                <motion.div key={order.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-sm text-foreground">
                        {order.created_date && format(parseISO(order.created_date), 'd MMMM yyyy', { locale: fr })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{order.items?.length || 0} article(s)</p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${status.bg}`}>
                      {status.label}
                    </span>
                  </div>
                  {order.items?.map((item, j) => (
                    <div key={j} className="flex justify-between items-center py-1">
                      <div className="flex items-center gap-2">
                        <Package className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{item.name} x{item.quantity}</span>
                      </div>
                      <span className="text-xs font-bold text-primary">{(item.price * item.quantity).toFixed(0)}€</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-white/6 flex justify-between">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-sm font-bold text-foreground">{order.total_price}€</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
