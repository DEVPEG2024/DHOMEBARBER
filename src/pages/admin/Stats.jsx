import React, { useMemo } from 'react';
import { api } from '@/api/apiClient';
import { isUnclaimedLastMinute, isClientPlaceholder } from '@/components/agenda/agendaUtils';
import { isRescheduledCancel, cancellationActor } from '@/lib/cancellation';
import { useQuery } from '@tanstack/react-query';
import LoadError from '@/components/shared/LoadError';
// Même CA par RDV que le tableau de bord (prestations + produit vendu, hors pourboire, hors part
// réglée par carte cadeau : elle est comptée à la vente de la carte)
import { revenueOf, giftPartOf, round2 } from '@/lib/revenue';
import { TrendingUp, Calendar, Users, AlertTriangle, Target } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Statistiques sur tout l'historique : les N rendez-vous les plus récents. Clé propre (plus de partage
// de ['allAppointments'] avec Clients, qui en chargeait moins) ; le préfixe reste couvert par
// invalidateAppointmentQueries.
const APPOINTMENTS_LIMIT = 2000;

const COLORS = ['hsl(38 65% 50%)', 'hsl(30 40% 35%)', 'hsl(25 30% 25%)', 'hsl(35 50% 60%)', 'hsl(20 45% 45%)'];

function StatBox({ title, value, sub, icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">{title}</p>
          <p className="text-lg font-bold">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Stats() {
  const appointmentsQuery = useQuery({
    queryKey: ['allAppointments', 'stats', APPOINTMENTS_LIMIT],
    queryFn: () => api.entities.Appointment.list('-date', APPOINTMENTS_LIMIT),
  });
  const appointments = useMemo(() => appointmentsQuery.data || [], [appointmentsQuery.data]);
  const capped = appointments.length >= APPOINTMENTS_LIMIT;

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    // Même requête que l'accueil (clé partagée ['employees'] : ordre sort_order)
    queryFn: () => api.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
  });

  const stats = useMemo(() => {
    // Taux calculés sur les vrais rendez-vous : ni pauses, ni créneaux last minute (libres ou non pris)
    // ni fiches de contact « Ajouter / Importer » des Clients (RDV annulé sans prestation ni prix)
    // ni ancien RDV d'un déplacement fait par le client (ce n'est pas une annulation : il ne gonfle
    // ni le taux d'annulation ni son dénominateur), ni annulation faite par le salon ou le système
    // (fermeture, last minute non pris…) : le taux mesure les annulations des clients
    const salonCancelled = (a) => a.status === 'cancelled' && ['staff', 'system'].includes(cancellationActor(a));
    const real = appointments.filter(a => a.status !== 'break' && a.status !== 'last_minute' && !isUnclaimedLastMinute(a)
      && !isClientPlaceholder(a) && !isRescheduledCancel(a) && !salonCancelled(a));
    const completed = real.filter(a => a.status === 'completed');
    const cancelled = real.filter(a => a.status === 'cancelled');
    const noShows = real.filter(a => a.status === 'no_show');
    const netOf = (a) => revenueOf(a) - giftPartOf(a);
    const totalRevenue = round2(completed.reduce((sum, a) => sum + netOf(a), 0));
    const giftTotal = round2(completed.reduce((sum, a) => sum + giftPartOf(a), 0));
    const avgTicket = completed.length > 0 ? totalRevenue / completed.length : 0;

    // Monthly trend
    const monthlyData = {};
    completed.forEach(a => {
      const month = a.date?.substring(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { month, revenue: 0, count: 0 };
      monthlyData[month].revenue += netOf(a);
      monthlyData[month].count++;
    });
    const monthly = Object.values(monthlyData)
      .map(m => ({ ...m, revenue: round2(m.revenue) }))
      .sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

    // Top services
    const serviceCount = {};
    completed.forEach(a => {
      a.services?.forEach(s => {
        if (!serviceCount[s.name]) serviceCount[s.name] = { name: s.name, count: 0, revenue: 0 };
        serviceCount[s.name].count++;
        serviceCount[s.name].revenue += s.price || 0;
      });
    });
    const topServices = Object.values(serviceCount)
      .map(sv => ({ ...sv, revenue: round2(sv.revenue) }))
      .sort((a, b) => b.count - a.count).slice(0, 5);

    // Per employee
    const empStats = {};
    completed.forEach(a => {
      const name = a.employee_name || 'Inconnu';
      if (!empStats[name]) empStats[name] = { name, count: 0, revenue: 0 };
      empStats[name].count++;
      empStats[name].revenue += netOf(a);
    });
    const perEmployee = Object.values(empStats)
      .map(e => ({ ...e, revenue: round2(e.revenue) }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalRevenue, giftTotal, avgTicket, completed: completed.length,
      cancelRate: real.length > 0 ? ((cancelled.length / real.length) * 100).toFixed(1) : 0,
      noShowRate: real.length > 0 ? ((noShows.length / real.length) * 100).toFixed(1) : 0,
      monthly, topServices, perEmployee,
    };
  }, [appointments]);

  const header = (
    <div className="mb-6">
      <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Analyse</p>
      <h1 className="font-display text-2xl font-bold">Statistiques</h1>
      {capped && (
        <p className="text-[11px] text-amber-400 mt-1">
          Seuls les {APPOINTMENTS_LIMIT} derniers rendez-vous sont pris en compte.
        </p>
      )}
    </div>
  );

  // Échec sans donnée, ou requête en pause faute de réseau (en attente, pas en erreur) : jamais de
  // « CA Total 0€ » trompeur, l'écran d'échec à la place (comme le tableau de bord et Clients).
  const q = appointmentsQuery;
  const failed = (q.isError && !q.data) || (q.isPending && q.fetchStatus === 'paused');
  if (failed) {
    return (
      <div>
        {header}
        <LoadError what="les statistiques" error={q.error} onRetry={q.refetch} retrying={q.isFetching} />
      </div>
    );
  }

  // Premier chargement : squelette plutôt que des zéros
  if (q.isPending) {
    return (
      <div aria-busy="true">
        {header}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-[68px] rounded-xl border border-border bg-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}

      <p className="text-[11px] text-muted-foreground -mt-2 mb-3">
        CA hors pourboires et hors part réglée par carte cadeau (comptée à la vente de la carte)
        {stats.giftTotal > 0 ? ` : ${stats.giftTotal.toFixed(0)}€ réglés par carte cadeau sur la période.` : '.'}
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        <StatBox title="CA Total" value={`${stats.totalRevenue.toFixed(0)}€`} icon={TrendingUp} />
        <StatBox title="RDV Complétés" value={stats.completed} icon={Calendar} />
        <StatBox title="Panier Moyen" value={`${stats.avgTicket.toFixed(0)}€`} icon={Target} />
        <StatBox title="Taux annulation clients" value={`${stats.cancelRate}%`} icon={AlertTriangle} />
        <StatBox title="Taux No-show" value={`${stats.noShowRate}%`} icon={AlertTriangle} />
        <StatBox title="Barbers Actifs" value={employees.length} icon={Users} />
      </div>

      {/* Monthly Revenue */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold mb-4">Évolution du CA</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.monthly}>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={{ background: 'hsl(30 8% 10%)', border: '1px solid hsl(30 6% 18%)', borderRadius: '8px', fontSize: '12px' }} formatter={(v) => [`${Math.round(Number(v) || 0)} €`, 'CA']} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(38 65% 50%)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Services */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Top Prestations</h3>
          <div className="space-y-3">
            {stats.topServices.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-[10px] font-bold text-primary flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm">{s.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold">{s.count}x</p>
                  <p className="text-[10px] text-muted-foreground">{s.revenue}€</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per Employee */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Performance par Barber</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.perEmployee} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ background: 'hsl(30 8% 10%)', border: '1px solid hsl(30 6% 18%)', borderRadius: '8px', fontSize: '12px' }} formatter={(v) => [`${Math.round(Number(v) || 0)} €`, 'CA']} />
                <Bar dataKey="revenue" fill="hsl(38 65% 50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}