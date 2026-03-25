import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Calendar, Users, TrendingUp, Clock, AlertTriangle, CheckCircle,
  CreditCard, Banknote, Euro, Percent, Star, UserCheck, ArrowUpRight, ArrowDownRight, Coffee, Heart, ShoppingBag, Gift
} from 'lucide-react';
import { format, subDays, startOfWeek, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function StatCard({ title, value, subtitle, icon: Icon, trend, color = 'primary', onClick }) {
  const isUp = trend > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={`bg-card border border-border rounded-xl p-4 ${onClick ? 'cursor-pointer hover:border-primary/30 active:scale-[0.98] transition-all' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          {trend !== undefined && trend !== null && (
            <div className={`flex items-center gap-0.5 mt-1 text-[10px] font-semibold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(trend)}% vs hier
            </div>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl bg-${color}/10 flex items-center justify-center shrink-0`}
          style={{ background: color === 'primary' ? undefined : `${color}20` }}>
          <Icon className="w-5 h-5 text-primary" style={color !== 'primary' ? { color } : {}} />
        </div>
      </div>
    </motion.div>
  );
}

function MiniCard({ label, value, icon: Icon, color }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const monthPrefix = format(new Date(), 'yyyy-MM');

  const { data: allAppointments = [] } = useQuery({
    queryKey: ['adminAppointments'],
    queryFn: () => base44.entities.Appointment.list('-date', 1000),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
  });

  // Filter out breaks for stats
  const realAppts = useMemo(() => allAppointments.filter(a => a.status !== 'break'), [allAppointments]);

  // Helper: consider an appointment as "paid/done" if payment_status is 'paid' OR status is 'completed'
  const isPaid = (a) => a.payment_status === 'paid' || a.status === 'completed';
  const getTotal = (a) => a.grand_total || a.total_price || 0;

  // TODAY
  const todayAppts = realAppts.filter(a => a.date === today);
  const confirmedToday = todayAppts.filter(a => a.status === 'confirmed');
  const completedToday = todayAppts.filter(a => a.status === 'completed');
  const pendingToday = todayAppts.filter(a => a.status === 'pending');
  const cancelledToday = todayAppts.filter(a => a.status === 'cancelled');
  const noShowToday = todayAppts.filter(a => a.status === 'no_show');

  // Paid = payment_status 'paid' OR status 'completed'
  const paidToday = todayAppts.filter(isPaid);
  const unpaidToday = confirmedToday.filter(a => !isPaid(a));
  const todayRevenue = paidToday.reduce((sum, a) => sum + getTotal(a), 0);
  const todayUnpaid = unpaidToday.reduce((sum, a) => sum + (a.total_price || 0), 0);

  // Tips & products today
  const todayTips = paidToday.reduce((sum, a) => sum + (a.tip || 0), 0);
  const todayProducts = paidToday.reduce((sum, a) => sum + (a.product_price || 0), 0);

  // YESTERDAY (for trend)
  const yesterdayAppts = realAppts.filter(a => a.date === yesterday);
  const yesterdayRevenue = yesterdayAppts.filter(isPaid).reduce((sum, a) => sum + getTotal(a), 0);
  const revenueTrend = yesterdayRevenue > 0 ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100) : null;

  // MONTH
  const thisMonth = realAppts.filter(a => a.date?.startsWith(monthPrefix));
  const monthPaid = thisMonth.filter(isPaid);
  const monthRevenue = monthPaid.reduce((sum, a) => sum + getTotal(a), 0);
  const monthTips = monthPaid.reduce((sum, a) => sum + (a.tip || 0), 0);
  const monthProducts = monthPaid.reduce((sum, a) => sum + (a.product_price || 0), 0);
  const monthUnpaid = thisMonth.filter(a => a.status === 'confirmed' && !isPaid(a))
    .reduce((sum, a) => sum + (a.total_price || 0), 0);
  const noShowsMonth = thisMonth.filter(a => a.status === 'no_show').length;
  const cancelledMonth = thisMonth.filter(a => a.status === 'cancelled').length;

  // Prestations CB vs Espèces vs Carte cadeau (sans pourboire)
  const getServiceOnly = (a) => a.total_price || 0;
  const getPayTotal = (a) => getServiceOnly(a) + (a.product_price || 0);
  const todayCB = paidToday.filter(a => a.payment_method === 'cb').reduce((s, a) => s + getPayTotal(a), 0);
  const todayCash = paidToday.filter(a => a.payment_method === 'especes').reduce((s, a) => s + getPayTotal(a), 0);
  const todayGift = paidToday.filter(a => a.payment_method === 'carte_cadeau').reduce((s, a) => s + getPayTotal(a), 0);
  const todayNoMethod = paidToday.filter(a => !a.payment_method).reduce((s, a) => s + getPayTotal(a), 0);

  // Month CB vs Espèces vs Carte cadeau (sans pourboire)
  const monthCB = monthPaid.filter(a => a.payment_method === 'cb').reduce((s, a) => s + getPayTotal(a), 0);
  const monthCash = monthPaid.filter(a => a.payment_method === 'especes').reduce((s, a) => s + getPayTotal(a), 0);
  const monthGift = monthPaid.filter(a => a.payment_method === 'carte_cadeau').reduce((s, a) => s + getPayTotal(a), 0);
  const monthNoMethod = monthPaid.filter(a => !a.payment_method).reduce((s, a) => s + getPayTotal(a), 0);

  // Pourboires CB vs Espèces
  const todayTipsCB = paidToday.filter(a => a.tip_method === 'cb').reduce((s, a) => s + (a.tip || 0), 0);
  const todayTipsCash = paidToday.filter(a => a.tip_method === 'especes').reduce((s, a) => s + (a.tip || 0), 0);
  const monthTipsCB = monthPaid.filter(a => a.tip_method === 'cb').reduce((s, a) => s + (a.tip || 0), 0);
  const monthTipsCash = monthPaid.filter(a => a.tip_method === 'especes').reduce((s, a) => s + (a.tip || 0), 0);

  // Average ticket
  const avgTicketToday = paidToday.length > 0 ? Math.round(todayRevenue / paidToday.length) : 0;
  const avgTicketMonth = monthPaid.length > 0 ? Math.round(monthRevenue / monthPaid.length) : 0;

  // Revenue by employee today (only paid appointments)
  const revenueByEmployee = useMemo(() => {
    const map = {};
    paidToday.forEach(a => {
      const emp = employees.find(e => e.id === a.employee_id);
      const name = emp?.name || a.employee_name || 'Inconnu';
      const color = emp?.color || '#3fcf8e';
      if (!map[name]) map[name] = { name, revenue: 0, tips: 0, products: 0, count: 0, color };
      map[name].revenue += a.grand_total || a.total_price || 0;
      map[name].tips += a.tip || 0;
      map[name].products += a.product_price || 0;
      map[name].count++;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [paidToday, employees]);

  // Weekly chart data
  const weekData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayPaid = realAppts.filter(a => a.date === dateStr && isPaid(a));
      const dayCB = dayPaid.filter(a => a.payment_method === 'cb').reduce((sum, a) => sum + getTotal(a), 0);
      const dayCash = dayPaid.filter(a => a.payment_method === 'especes').reduce((sum, a) => sum + getTotal(a), 0);
      const dayGift = dayPaid.filter(a => a.payment_method === 'carte_cadeau').reduce((sum, a) => sum + getTotal(a), 0);
      const dayOther = dayPaid.filter(a => !a.payment_method).reduce((sum, a) => sum + getTotal(a), 0);
      data.push({
        day: format(d, 'EEE', { locale: fr }),
        cb: dayCB,
        especes: dayCash,
        carte_cadeau: dayGift,
        autre: dayOther,
        revenue: dayCB + dayCash + dayGift + dayOther,
        count: dayPaid.length,
      });
    }
    return data;
  }, [realAppts]);

  // Status distribution for today pie chart
  const statusData = [
    { name: 'Terminés', value: completedToday.length, color: '#3fcf8e' },
    { name: 'Confirmés', value: confirmedToday.length, color: '#60a5fa' },
    { name: 'En attente', value: pendingToday.length, color: '#facc15' },
    { name: 'Annulés', value: cancelledToday.length, color: '#f87171' },
    { name: 'No-show', value: noShowToday.length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Next upcoming appointment
  const now = format(new Date(), 'HH:mm');
  const nextApt = confirmedToday
    .filter(a => a.start_time > now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];

  // Breaks today
  const breaksToday = allAppointments.filter(a => a.date === today && a.status === 'break');

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Tableau de bord</p>
        <h1 className="font-display text-2xl font-bold">Ciao le gang ! 🇮🇹🇵🇹</h1>
        <p className="text-sm text-muted-foreground mt-1">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          title="CA Aujourd'hui"
          value={`${todayRevenue}€`}
          subtitle={todayUnpaid > 0 ? `+ ${todayUnpaid}€ non encaissés ▸` : `${paidToday.length} RDV encaissés`}
          icon={Euro}
          trend={revenueTrend}
          onClick={todayUnpaid > 0 ? () => navigate('/admin/agenda') : undefined}
        />
        <StatCard
          title="RDV Aujourd'hui"
          value={todayAppts.length}
          subtitle={`${completedToday.length} terminés · ${confirmedToday.length} à venir`}
          icon={Calendar}
          onClick={confirmedToday.length > 0 ? () => navigate('/admin/agenda') : undefined}
        />
        <StatCard
          title="CA du Mois"
          value={`${monthRevenue}€`}
          subtitle={monthUnpaid > 0 ? `+ ${monthUnpaid}€ non encaissés` : `${monthPaid.length} RDV encaissés`}
          icon={TrendingUp}
        />
        <StatCard
          title="Panier Moyen"
          value={`${avgTicketToday}€`}
          subtitle={`${avgTicketMonth}€ / mois`}
          icon={Star}
        />
      </div>

      {/* Encaissements par mode de paiement */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Encaissements prestations + produits</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <MiniCard label="CB aujourd'hui" value={`${todayCB}€`} icon={CreditCard} color="#60a5fa" />
          <MiniCard label="Espèces aujourd'hui" value={`${todayCash}€`} icon={Banknote} color="#4ade80" />
          <MiniCard label="Carte cadeau aujourd'hui" value={`${todayGift}€`} icon={Gift} color="#f59e0b" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MiniCard label="CB ce mois" value={`${monthCB}€`} icon={CreditCard} color="#60a5fa" />
          <MiniCard label="Espèces ce mois" value={`${monthCash}€`} icon={Banknote} color="#4ade80" />
          <MiniCard label="Carte cadeau ce mois" value={`${monthGift}€`} icon={Gift} color="#f59e0b" />
        </div>
      </div>

      {/* Pourboires CB / Espèces */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pourboires</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniCard label="Pourboires CB aujourd'hui" value={`${todayTipsCB}€`} icon={CreditCard} color="#f472b6" />
          <MiniCard label="Pourboires Espèces aujourd'hui" value={`${todayTipsCash}€`} icon={Banknote} color="#f472b6" />
          <MiniCard label="Pourboires CB ce mois" value={`${monthTipsCB}€`} icon={CreditCard} color="#f472b6" />
          <MiniCard label="Pourboires Espèces ce mois" value={`${monthTipsCash}€`} icon={Banknote} color="#f472b6" />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <MiniCard label="Total pourboires aujourd'hui" value={`${todayTips}€`} icon={Heart} color="#f472b6" />
          <MiniCard label="Total pourboires ce mois" value={`${monthTips}€`} icon={Heart} color="#f472b6" />
        </div>
      </div>

      {/* Prestations à clôturer (confirmés non payés + completed sans méthode) */}
      {(() => {
        const toClose = todayAppts.filter(a =>
          (a.status === 'confirmed' && !isPaid(a)) ||
          (a.status === 'completed' && !a.payment_method)
        );
        if (toClose.length === 0) return null;
        const totalToClose = toClose.reduce((s, a) => s + (a.total_price || 0), 0);
        return (
          <div onClick={() => navigate('/admin/agenda')}
            className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 cursor-pointer hover:bg-yellow-500/15 active:scale-[0.99] transition-all animate-pulse">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
            <p className="text-xs text-yellow-300">
              <strong>{toClose.length} prestation{toClose.length > 1 ? 's' : ''}</strong> à clôturer ({totalToClose}€) — appuyez pour ouvrir l'agenda
            </p>
          </div>
        );
      })()}

      {/* Products + Alerts Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MiniCard label="Produits vendus aujourd'hui" value={`${todayProducts}€`} icon={ShoppingBag} color="#a78bfa" />
        <MiniCard label="Produits vendus ce mois" value={`${monthProducts}€`} icon={ShoppingBag} color="#a78bfa" />
        <MiniCard label="No-shows (mois)" value={noShowsMonth} icon={AlertTriangle} color="#f87171" />
        <MiniCard label="Annulations (mois)" value={cancelledMonth} icon={AlertTriangle} color="#facc15" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Weekly Revenue Chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-1">CA encaissé — 7 derniers jours</h3>
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#60a5fa' }} /> CB
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#4ade80' }} /> Espèces
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#f59e0b' }} /> Carte cadeau
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#facc15' }} /> Non renseigné
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekData}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: 'hsl(30 8% 10%)', border: '1px solid hsl(30 6% 18%)', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: 'hsl(40 20% 95%)' }}
                  formatter={(value, name) => [`${value}€`, name === 'cb' ? 'CB' : name === 'especes' ? 'Espèces' : name === 'carte_cadeau' ? 'Carte cadeau' : 'Non renseigné']}
                />
                <Bar dataKey="cb" stackId="revenue" fill="#60a5fa" />
                <Bar dataKey="especes" stackId="revenue" fill="#4ade80" />
                <Bar dataKey="carte_cadeau" stackId="revenue" fill="#f59e0b" />
                <Bar dataKey="autre" stackId="revenue" fill="#facc15" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Statuts du jour</h3>
          {statusData.length > 0 ? (
            <>
              <div className="h-32 mb-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value">
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                {statusData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Aucun RDV</p>
          )}
        </div>
      </div>

      {/* Revenue by Employee */}
      {revenueByEmployee.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold mb-4">CA par barber — aujourd'hui</h3>
          <div className="space-y-3">
            {revenueByEmployee.map(emp => {
              const pct = todayRevenue > 0 ? Math.round((emp.revenue / todayRevenue) * 100) : 0;
              return (
                <div key={emp.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: emp.color }} />
                      <span className="text-xs font-medium">{emp.name}</span>
                      <span className="text-[10px] text-muted-foreground">{emp.count} RDV</span>
                    </div>
                    <span className="text-xs font-bold">{emp.revenue}€</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: emp.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Next Appointment + Breaks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {nextApt && (
          <div className="bg-card border border-primary/20 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Prochain RDV
            </h3>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-lg font-bold text-primary">{nextApt.start_time}</p>
                <p className="text-[10px] text-muted-foreground">{nextApt.end_time}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{nextApt.client_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {nextApt.services?.map(s => s.name).join(', ')}
                </p>
                <p className="text-xs font-bold text-primary mt-0.5">{nextApt.total_price}€</p>
              </div>
              <div className="text-xs text-muted-foreground">
                <UserCheck className="w-4 h-4 mb-0.5" />
                <span className="text-[10px]">{nextApt.employee_name}</span>
              </div>
            </div>
          </div>
        )}

        {breaksToday.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Coffee className="w-4 h-4 text-slate-400" /> Pauses du jour
            </h3>
            <div className="space-y-2">
              {breaksToday.map(b => (
                <div key={b.id} className="flex items-center gap-3 text-xs p-2 rounded-lg bg-secondary/50">
                  <span className="font-bold text-slate-400">{b.start_time} - {b.end_time}</span>
                  <span className="text-muted-foreground">{b.employee_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Today's Full Appointments List */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">Rendez-vous du jour</h3>
        {todayAppts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Aucun rendez-vous aujourd'hui</p>
        ) : (
          <div className="space-y-2">
            {todayAppts
              .sort((a, b) => a.start_time?.localeCompare(b.start_time))
              .map(apt => {
                const emp = employees.find(e => e.id === apt.employee_id);
                return (
                  <div key={apt.id}
                    onClick={() => { if (apt.status === 'confirmed') navigate('/admin/agenda'); }}
                    className={`flex items-center gap-3 p-3 rounded-lg bg-secondary/50 ${apt.status === 'confirmed' ? 'cursor-pointer hover:bg-secondary/80 active:scale-[0.99] transition-all' : ''}`}>
                    <div className="text-center min-w-[50px]">
                      <p className="text-sm font-bold text-primary">{apt.start_time}</p>
                      <p className="text-[10px] text-muted-foreground">{apt.end_time}</p>
                    </div>
                    <div className="w-1 h-8 rounded-full" style={{ background: emp?.color || '#3fcf8e' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{apt.client_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {apt.services?.map(s => s.name).join(', ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-primary">{apt.total_price}€</p>
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        {apt.status === 'completed' ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        ) : apt.status === 'cancelled' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-yellow-400" />
                        )}
                        <span className="text-[9px] text-muted-foreground">{emp?.name}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
