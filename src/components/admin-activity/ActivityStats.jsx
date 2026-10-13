/**
 * Compteurs du jour (heure de Paris) calculés depuis les événements : RDV réservés, commandes,
 * chiffre des commandes + cartes cadeau, nouveaux clients.
 */
import React, { useMemo } from 'react';
import { CalendarCheck, ShoppingBag, Euro, UserPlus } from 'lucide-react';
import { parisDayKey, parisDayKeyOffset, formatEuro } from './activityUi';

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 min-w-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-[11px] font-medium truncate">{label}</span>
      </div>
      <p className="font-display text-xl font-bold text-foreground mt-1 truncate">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
    </div>
  );
}

export default function ActivityStats({ events }) {
  const stats = useMemo(() => {
    const today = parisDayKeyOffset(0);
    const s = { appointments: 0, orders: 0, revenue: 0, giftcards: 0, users: 0 };
    for (const ev of events) {
      if (parisDayKey(ev.at) !== today) continue;
      const amount = Number(ev.amount);
      const hasAmount = ev.amount != null && Number.isFinite(amount);
      if (ev.type === 'appointment_new') s.appointments += 1;
      else if (ev.type === 'order_new') {
        s.orders += 1;
        if (hasAmount) s.revenue += amount;
      } else if (ev.type === 'giftcard_new') {
        s.giftcards += 1;
        if (hasAmount) s.revenue += amount;
      } else if (ev.type === 'user_new') s.users += 1;
    }
    return s;
  }, [events]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
      <Stat icon={CalendarCheck} label="RDV réservés aujourd'hui" value={stats.appointments} />
      <Stat icon={ShoppingBag} label="Commandes aujourd'hui" value={stats.orders} />
      <Stat
        icon={Euro}
        label="Commandes + cartes cadeau"
        value={formatEuro(stats.revenue)}
        hint={stats.giftcards ? `dont ${stats.giftcards} carte${stats.giftcards > 1 ? 's' : ''} cadeau` : "aujourd'hui"}
      />
      <Stat icon={UserPlus} label="Nouveaux clients" value={stats.users} hint="aujourd'hui" />
    </div>
  );
}
