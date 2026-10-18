import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Calendar, TrendingUp, Clock, AlertTriangle, CheckCircle,
  CreditCard, Banknote, Euro, Star, UserCheck, ArrowUpRight, ArrowDownRight, Coffee, Heart, ShoppingBag, Zap, Gift, Wifi
} from 'lucide-react';
import { useLiveCount } from '@/lib/useLiveCount';
import { useAuth } from '@/lib/AuthContext';
import { format, subDays, startOfDay, startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { exportToCSV } from '@/utils/exportCSV';
import SalesOverview from '@/components/admin/SalesOverview';
import {
  needsClosing, appointmentEndParis, datesBetween, fetchAppointmentsForDates, isCancelledLike, isConvertedLastMinute, isUnclaimedLastMinute,
  isClientPlaceholder,
} from '@/components/agenda/agendaUtils';
import LoadError from '@/components/shared/LoadError';
import { toast } from 'sonner';
import { isRescheduledCancel } from '@/lib/cancellation';

// Plafond de `fetchAppointmentsForDates` : au-delà, les chiffres de la période seraient incomplets
const APPOINTMENTS_LIMIT = 2000;

// CA d'un RDV (hors pourboire), part payée par carte cadeau, arrondi : partagés avec Statistiques
import { revenueOf, round2, giftPartOf } from '@/lib/revenue';

const PAYMENT_LABELS = { cb: 'CB', especes: 'Espèces', carte_cadeau: 'Carte cadeau' };

/** Jours du mois `yyyy-MM` (vide si la saisie est illisible). */
function monthDates(month) {
  const d = parseISO(`${month}-01`);
  return isValid(d) ? datesBetween(startOfMonth(d), endOfMonth(d)) : [];
}

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
  // Liens vers l'agenda seulement si ce compte peut l'ouvrir (même règle que SalesOverview et le
  // menu d'AdminLayout) : un barber avec Dashboard sans Agenda était renvoyé ici sans explication
  const { user } = useAuth();
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const canAgenda = !user || user.role === 'admin' || perms.includes('agenda');
  const liveCount = useLiveCount();
  const [showExport, setShowExport] = React.useState(false);
  const [exportAmount, setExportAmount] = React.useState('');
  const [exportMonth, setExportMonth] = React.useState(format(new Date(), 'yyyy-MM'));
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const monthPrefix = format(new Date(), 'yyyy-MM');

  // Uniquement la période affichée : le mois en cours et les 7 derniers jours (graphique, « vs hier »).
  // Avant : les 1 000 derniers RDV de toute la base, dont les RDV futurs des mois suivants, donc un
  // mois en cours tronqué dès que la base grossissait. Préfixe `adminAppointments` : couvert par
  // invalidateAppointmentQueries.
  const periodDates = useMemo(() => {
    const now = new Date();
    const weekStart = startOfDay(subDays(now, 6));
    const monthStart = startOfMonth(now);
    return datesBetween(weekStart < monthStart ? weekStart : monthStart, endOfMonth(now));
  }, [today]); // recalculé au changement de jour
  const periodSet = useMemo(() => new Set(periodDates), [periodDates]);

  const appointmentsQuery = useQuery({
    queryKey: ['adminAppointments', 'dashboard', periodDates[0], periodDates[periodDates.length - 1]],
    queryFn: () => fetchAppointmentsForDates(periodDates),
  });
  const allAppointments = useMemo(() => appointmentsQuery.data || [], [appointmentsQuery.data]);
  const limitReached = allAppointments.length >= APPOINTMENTS_LIMIT;

  // Export comptable : le mois choisi peut sortir de la période chargée, il est alors lu à part
  const exportDates = useMemo(() => monthDates(exportMonth), [exportMonth]);
  const exportInPeriod = exportDates.length > 0 && exportDates.every((d) => periodSet.has(d));
  const exportQuery = useQuery({
    queryKey: ['adminAppointments', 'export', exportMonth],
    queryFn: () => fetchAppointmentsForDates(exportDates),
    enabled: showExport && exportDates.length > 0 && !exportInPeriod,
  });
  const exportSource = exportInPeriod ? allAppointments : (exportQuery.data || []);
  const exportLoading = !exportInPeriod && exportDates.length > 0 && exportQuery.isFetching && !exportQuery.data;
  // Mois hors période pas encore lu (ou en échec) : pas d'export vide sans explication
  const exportReady = exportInPeriod || !!exportQuery.data;

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.filter({ is_active: true }),
  });

  // Hors pauses, créneaux last minute encore libres et last minute que personne n'a pris
  // (passés « absent » automatiquement : ni no-show ni annulation d'un client)
  // ni les fiches créées par Clients → Ajouter / Importer (faux RDV annulé à 0 €, 09:00 → 09:00)
  const isRealAppt = (a) => a.status !== 'break' && a.status !== 'last_minute' && !isUnclaimedLastMinute(a) && !isClientPlaceholder(a);
  const realAppts = useMemo(() => allAppointments.filter(isRealAppt), [allAppointments]);

  // Last Minute : créneaux publiés = encore libres + pris par un client (repère dans la note interne)
  // + non pris ; « Convertis » = pris et pas annulés depuis
  const lastMinuteAppts = useMemo(() => allAppointments.filter(a =>
    a.status === 'last_minute' || isConvertedLastMinute(a) || isUnclaimedLastMinute(a)
  ), [allAppointments]);
  const lastMinuteToday = lastMinuteAppts.filter(a => a.date === today);
  const lastMinuteMonth = lastMinuteAppts.filter(a => a.date?.startsWith(monthPrefix));
  const lastMinuteCompleted = useMemo(() => allAppointments.filter(a =>
    isConvertedLastMinute(a) && !isCancelledLike(a)
  ), [allAppointments]);
  const lastMinuteCompletedMonth = lastMinuteCompleted.filter(a => a.date?.startsWith(monthPrefix));

  // Helper: consider an appointment as "paid/done" if payment_status is 'paid' OR status is 'completed'
  const isPaid = (a) => a.payment_status === 'paid' || a.status === 'completed';
  // CA hors pourboire (les pourboires ont leur propre section)
  const getTotal = revenueOf;
  // Hors part déjà payée par carte cadeau (débit au comptoir) : c'est ce qui reste à encaisser
  const outsideGift = (a) => revenueOf(a) - giftPartOf(a);
  const lastMinuteRevenueMonth = round2(lastMinuteCompletedMonth.filter(isPaid).reduce((sum, a) => sum + getTotal(a), 0));

  // TODAY
  const todayAppts = realAppts.filter(a => a.date === today);
  const confirmedToday = todayAppts.filter(a => a.status === 'confirmed');
  const completedToday = todayAppts.filter(a => a.status === 'completed');
  const pendingToday = todayAppts.filter(a => a.status === 'pending');
  // Un déplacement fait par le client n'est pas une annulation (même règle que la carte Gang)
  const cancelledToday = todayAppts.filter(a => a.status === 'cancelled' && !isRescheduledCancel(a));
  const noShowToday = todayAppts.filter(a => a.status === 'no_show');

  // Paid = payment_status 'paid' OR status 'completed'
  const paidToday = todayAppts.filter(isPaid);
  // Non encaissés : seulement les RDV du jour terminés (heure de fin passée, heure de Paris), même
  // règle que la pastille € de l'agenda et « À encaisser » ; les RDV à venir n'y entrent pas
  const unpaidToday = confirmedToday.filter(a => !isPaid(a) && needsClosing(a));
  // À venir : heure de fin pas encore passée (heure de Paris) ; un RDV terminé non clôturé n'y est plus
  const upcomingToday = confirmedToday.filter(a => {
    const end = appointmentEndParis(a);
    return end == null || end > Date.now();
  });
  const todayRevenue = round2(paidToday.reduce((sum, a) => sum + getTotal(a), 0));
  const todayUnpaid = round2(unpaidToday.reduce((sum, a) => sum + outsideGift(a), 0));

  // Tips & products today
  const todayTips = round2(paidToday.reduce((sum, a) => sum + (a.tip || 0), 0));
  const todayProducts = round2(paidToday.reduce((sum, a) => sum + (a.product_price || 0), 0));

  // YESTERDAY (for trend)
  const yesterdayAppts = realAppts.filter(a => a.date === yesterday);
  const yesterdayRevenue = round2(yesterdayAppts.filter(isPaid).reduce((sum, a) => sum + getTotal(a), 0));
  const revenueTrend = yesterdayRevenue > 0 ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100) : null;

  // MONTH
  const thisMonth = realAppts.filter(a => a.date?.startsWith(monthPrefix));
  const monthPaid = thisMonth.filter(isPaid);
  const monthRevenue = round2(monthPaid.reduce((sum, a) => sum + getTotal(a), 0));
  const monthTips = round2(monthPaid.reduce((sum, a) => sum + (a.tip || 0), 0));
  const monthProducts = round2(monthPaid.reduce((sum, a) => sum + (a.product_price || 0), 0));
  // À encaisser (tableau de bord) = deux parts affichées séparément puis additionnées :
  //  - RDV du mois **terminés** (heure de fin passée, heure de Paris) et pas encore clôturés
  //    (« Valider la prestation »), même règle que la pastille € de l'agenda (`needsClosing`) ;
  //  - RDV confirmés **à venir** du mois (pas encore dus).
  const unclosedMonth = thisMonth.filter(a => a.status === 'confirmed' && !isPaid(a) && needsClosing(a));
  const monthUnpaid = round2(unclosedMonth.reduce((sum, a) => sum + outsideGift(a), 0));
  const upcomingMonth = thisMonth.filter(a => a.status === 'confirmed' && !isPaid(a) && !needsClosing(a));
  const monthUpcoming = round2(upcomingMonth.reduce((sum, a) => sum + outsideGift(a), 0));
  const noShowsMonth = thisMonth.filter(a => a.status === 'no_show').length;
  const cancelledMonth = thisMonth.filter(a => a.status === 'cancelled' && !isRescheduledCancel(a)).length;

  // Prestations CB vs Espèces vs Carte cadeau (sans pourboire). La part payée par carte cadeau
  // (débit au comptoir, même partiel) n'est jamais comptée en CB / espèces : seul le reste l'est.
  // Un RDV « Carte cadeau » dont la carte n'a couvert qu'une partie : le reste en « non renseigné ».
  const sumBy = (list, method) => round2(list
    .filter(a => (method === null ? (!a.payment_method || a.payment_method === 'carte_cadeau') : a.payment_method === method))
    .reduce((s, a) => s + outsideGift(a), 0));
  const todayCB = sumBy(paidToday, 'cb');
  const todayCash = sumBy(paidToday, 'especes');
  const todayGift = round2(paidToday.reduce((s, a) => s + giftPartOf(a), 0));
  const todayNoMethod = sumBy(paidToday, null);

  // Month CB vs Espèces vs Carte cadeau (sans pourboire)
  const monthCB = sumBy(monthPaid, 'cb');
  const monthCash = sumBy(monthPaid, 'especes');
  const monthGift = round2(monthPaid.reduce((s, a) => s + giftPartOf(a), 0));
  const monthNoMethod = sumBy(monthPaid, null);

  // Pourboires CB vs Espèces
  const todayTipsCB = round2(paidToday.filter(a => a.tip_method === 'cb').reduce((s, a) => s + (a.tip || 0), 0));
  const todayTipsCash = round2(paidToday.filter(a => a.tip_method === 'especes').reduce((s, a) => s + (a.tip || 0), 0));
  const monthTipsCB = round2(monthPaid.filter(a => a.tip_method === 'cb').reduce((s, a) => s + (a.tip || 0), 0));
  const monthTipsCash = round2(monthPaid.filter(a => a.tip_method === 'especes').reduce((s, a) => s + (a.tip || 0), 0));

  // Average ticket
  const avgTicketToday = paidToday.length > 0 ? Math.round(todayRevenue / paidToday.length) : 0;
  const avgTicketMonth = monthPaid.length > 0 ? Math.round(monthRevenue / monthPaid.length) : 0;

  // Revenue by employee today (only paid appointments)
  const revenueByEmployee = useMemo(() => {
    const map = {};
    paidToday.forEach(a => {
      const emp = employees.find(e => String(e.id) === String(a.employee_id));
      const name = emp?.name || a.employee_name || 'Inconnu';
      const color = emp?.color || '#3fcf8e';
      if (!map[name]) map[name] = { name, revenue: 0, tips: 0, products: 0, count: 0, color };
      map[name].revenue += revenueOf(a);
      map[name].tips += a.tip || 0;
      map[name].products += a.product_price || 0;
      map[name].count++;
    });
    // Arrondi à la fin (pas à chaque ajout) : « 83.10000000000001 € » ne s'affiche plus
    return Object.values(map)
      .map(e => ({ ...e, revenue: round2(e.revenue), tips: round2(e.tips), products: round2(e.products) }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidToday, employees]);

  // Weekly chart data
  const weekData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayPaid = realAppts.filter(a => a.date === dateStr && isPaid(a));
      const outside = (a) => getTotal(a) - giftPartOf(a);
      const dayCB = round2(dayPaid.filter(a => a.payment_method === 'cb').reduce((sum, a) => sum + outside(a), 0));
      const dayCash = round2(dayPaid.filter(a => a.payment_method === 'especes').reduce((sum, a) => sum + outside(a), 0));
      const dayGift = round2(dayPaid.reduce((sum, a) => sum + giftPartOf(a), 0));
      const dayOther = round2(dayPaid.filter(a => !a.payment_method || a.payment_method === 'carte_cadeau').reduce((sum, a) => sum + outside(a), 0));
      data.push({
        day: format(d, 'EEE', { locale: fr }),
        cb: dayCB,
        especes: dayCash,
        carte_cadeau: dayGift,
        autre: dayOther,
        revenue: round2(dayCB + dayCash + dayGift + dayOther),
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

  const handleExportComptable = async () => {
    const targetAmount = parseFloat(exportAmount);
    if (!targetAmount || targetAmount <= 0) return;

    // Get paid appointments for the selected month
    const monthAppts = exportSource.filter(a => a.date?.startsWith(exportMonth) && isRealAppt(a) && isPaid(a));

    // Montant au format d'Excel en français (« 25,00 ») : avec un point, la colonne était lue comme du
    // texte (SOMME à 0) et « 10.10 » pouvait devenir une date
    const euro = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

    // Build rows: prestations + products until we reach targetAmount
    const rows = [];
    let remaining = targetAmount;
    // Total calculé sur les nombres (parseFloat('12,50') renverrait 12)
    let totalExported = 0;

    for (const apt of monthAppts) {
      if (remaining <= 0) break;

      // Add services
      if (apt.services?.length > 0) {
        for (const svc of apt.services) {
          if (remaining <= 0) break;
          const price = Math.min(svc.price || 0, remaining);
          if (price > 0) {
            rows.push({
              date: apt.date,
              type: 'Prestation',
              designation: svc.name || 'Prestation',
              client: apt.client_name || '',
              barber: apt.employee_name || '',
              paiement: PAYMENT_LABELS[apt.payment_method] || '',
              montant: euro(price),
            });
            remaining -= price;
            totalExported += price;
          }
        }
      } else {
        // No service detail, use total_price
        const price = Math.min(apt.total_price || 0, remaining);
        if (price > 0) {
          rows.push({
            date: apt.date,
            type: 'Prestation',
            designation: 'Prestation',
            client: apt.client_name || '',
            barber: apt.employee_name || '',
            paiement: PAYMENT_LABELS[apt.payment_method] || '',
            montant: euro(price),
          });
          remaining -= price;
          totalExported += price;
        }
      }

      // Add product if any
      if (apt.product_sold && apt.product_price > 0 && remaining > 0) {
        const price = Math.min(apt.product_price, remaining);
        rows.push({
          date: apt.date,
          type: 'Produit',
          designation: apt.product_sold,
          client: apt.client_name || '',
          barber: apt.employee_name || '',
          paiement: PAYMENT_LABELS[apt.payment_method] || '',
          montant: euro(price),
        });
        remaining -= price;
        totalExported += price;
      }
    }

    if (rows.length === 0) {
      toast.info('Aucune donnée à exporter pour ce mois');
      return;
    }

    // Add total row
    rows.push({ date: '', type: '', designation: 'TOTAL', client: '', barber: '', paiement: '', montant: euro(totalExported) });

    // Apps natives : enregistrement par la feuille de partage (la fenêtre ne se ferme qu'une fois
    // le fichier produit, sinon l'export semblait réussi sans rien produire)
    try {
      await exportToCSV(rows, `export-comptable-${exportMonth}-${targetAmount}EUR`);
      setShowExport(false);
    } catch {
      toast.error('Export impossible, réessayez');
    }
  };

  // Rendez-vous illisibles : pas de tableau de bord à zéro, qui laisserait croire à un CA nul. Une
  // requête en pause faute de réseau (React Query : pending + paused, sans erreur) compte comme un échec.
  if ((appointmentsQuery.isError && !appointmentsQuery.data)
      || (appointmentsQuery.isPending && appointmentsQuery.fetchStatus === 'paused')) {
    return (
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Tableau de bord</p>
        <h1 className="font-display text-2xl font-bold mb-4">Ciao le gang ! 🇮🇹🇵🇹</h1>
        <LoadError
          what="les rendez-vous du tableau de bord"
          error={appointmentsQuery.error}
          onRetry={appointmentsQuery.refetch}
          retrying={appointmentsQuery.isFetching}
        />
      </div>
    );
  }

  // Premier chargement : des cartes squelette, jamais des montants à 0 €
  if (appointmentsQuery.isPending) {
    return (
      <div className="min-w-0" aria-busy="true">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Tableau de bord</p>
        <h1 className="font-display text-2xl font-bold mb-4">Ciao le gang ! 🇮🇹🇵🇹</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Tableau de bord</p>
          {liveCount !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <Wifi className="w-3 h-3 text-green-400" />
              <span className="text-xs font-semibold text-green-400">{liveCount} en ligne</span>
            </div>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold">Ciao le gang ! 🇮🇹🇵🇹</h1>
        <p className="text-sm text-muted-foreground mt-1">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>
        <button
          onClick={() => setShowExport(true)}
          className="mt-2 px-4 py-2 text-xs rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all font-semibold"
        >
          Export comptable
        </button>
      </div>

      {limitReached && (
        <p className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Plus de {APPOINTMENTS_LIMIT} rendez-vous sur la période : seuls les {APPOINTMENTS_LIMIT} premiers sont pris en compte, les chiffres peuvent être incomplets.
        </p>
      )}

      {/* Tous les canaux de vente : CA global, répartition, boutique, cartes cadeau, privatisations, textile */}
      <SalesOverview appointments={{ today: todayRevenue, month: monthRevenue, giftToday: todayGift, giftMonth: monthGift, unpaidToday: todayUnpaid, unpaidMonth: monthUnpaid, unpaidCount: unclosedMonth.length, upcomingMonth: monthUpcoming, upcomingCount: upcomingMonth.length }} />

      {/* Rendez-vous : prestations + produits vendus en RDV */}
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5" /> Rendez-vous
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          title="CA RDV Aujourd'hui"
          value={`${todayRevenue}€`}
          subtitle={todayUnpaid > 0 ? `+ ${todayUnpaid}€ non encaissés${canAgenda ? ' ▸' : ''}` : `${paidToday.length} RDV encaissés`}
          icon={Euro}
          trend={revenueTrend}
          onClick={canAgenda && todayUnpaid > 0 ? () => navigate('/admin/agenda') : undefined}
        />
        <StatCard
          title="RDV Aujourd'hui"
          value={todayAppts.length}
          subtitle={`${completedToday.length} terminés${unpaidToday.length ? ` · ${unpaidToday.length} à clôturer` : ''} · ${upcomingToday.length} à venir`}
          icon={Calendar}
          onClick={canAgenda && confirmedToday.length > 0 ? () => navigate('/admin/agenda') : undefined}
        />
        <StatCard
          title="CA RDV du Mois"
          value={`${monthRevenue}€`}
          subtitle={`${monthUnpaid > 0 ? `+ ${monthUnpaid}€ non encaissés` : `${monthPaid.length} RDV encaissés`}${monthGift > 0 ? ` · dont ${monthGift}€ réglés par carte cadeau` : ''}`}
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

      {/* Last Minute */}
      <div className="bg-card border border-orange-500/20 rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" /> Last Minute
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniCard label="Créneaux aujourd'hui" value={lastMinuteToday.length} icon={Zap} color="#f97316" />
          <MiniCard label="Créneaux ce mois" value={lastMinuteMonth.length} icon={Zap} color="#f97316" />
          <MiniCard label="Convertis ce mois" value={lastMinuteCompletedMonth.length} icon={CheckCircle} color="#f97316" />
          <MiniCard label="CA Last Minute" value={`${lastMinuteRevenueMonth}€`} icon={Euro} color="#f97316" />
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

      {/* Prestations à clôturer (confirmés terminés non payés + completed sans méthode) : seulement
          une fois l'heure de fin passée (même règle que la pastille € de l'agenda), sans clignoter */}
      {(() => {
        const toClose = todayAppts.filter(a =>
          (a.status === 'confirmed' && !isPaid(a) && needsClosing(a)) ||
          (a.status === 'completed' && !a.payment_method)
        );
        if (toClose.length === 0) return null;
        // Hors part déjà payée par carte cadeau, produit compris : même montant que « non encaissés »
        const totalToClose = round2(toClose.reduce((s, a) => s + outsideGift(a), 0));
        return (
          <div onClick={canAgenda ? () => navigate('/admin/agenda') : undefined}
            className={`bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 ${canAgenda ? 'cursor-pointer hover:bg-yellow-500/15 active:scale-[0.99] transition-all' : ''}`}>
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
            <p className="text-xs text-yellow-300">
              <strong>{toClose.length} prestation{toClose.length > 1 ? 's' : ''}</strong> à clôturer ({totalToClose}€){canAgenda ? ' — appuyez pour ouvrir l\'agenda' : ''}
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
                const emp = employees.find(e => String(e.id) === String(apt.employee_id));
                return (
                  <div key={apt.id}
                    onClick={() => { if (canAgenda && apt.status === 'confirmed') navigate('/admin/agenda'); }}
                    className={`flex items-center gap-3 p-3 rounded-lg bg-secondary/50 ${canAgenda && apt.status === 'confirmed' ? 'cursor-pointer hover:bg-secondary/80 active:scale-[0.99] transition-all' : ''}`}>
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

      {/* Export comptable dialog */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Export comptable</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">
            Exportez un relevé de prestations et produits pour un montant donné.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Mois</label>
              <input type="month" value={exportMonth}
                onChange={e => setExportMonth(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Montant cible (€) *</label>
              <input type="number" step="0.01" min="0" placeholder="Ex: 2500"
                value={exportAmount}
                onChange={e => setExportAmount(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p>L'export contiendra des prestations et produits du mois sélectionné jusqu'à atteindre le montant demandé.</p>
              <p className="mt-1 font-medium text-foreground">
                {exportLoading
                  ? 'Chargement du mois sélectionné…'
                  : `CA du mois sélectionné : ${exportSource.filter(a => a.date?.startsWith(exportMonth) && isRealAppt(a) && isPaid(a)).reduce((s, a) => s + getTotal(a), 0).toFixed(2)}€`}
              </p>
              {!exportInPeriod && exportQuery.isError && !exportQuery.data && (
                <p className="mt-1 text-red-400">Impossible de charger ce mois (connexion ?). Réessayez.</p>
              )}
            </div>
            <button
              onClick={handleExportComptable}
              disabled={!exportAmount || parseFloat(exportAmount) <= 0 || exportLoading || !exportReady}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              Exporter en CSV
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
