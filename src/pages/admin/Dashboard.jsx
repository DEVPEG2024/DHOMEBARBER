/**
 * Tableau de bord de l'admin et des barbers qui ont la permission « Dashboard ».
 *
 * Refonte du 1er nov. 2026 (audit à 5 agents, décisions du propriétaire) : le travail du jour en
 * haut (« À faire », « Aujourd'hui »), puis le mois, l'argent, la semaine à venir, les barbers et les
 * ventes hors rendez-vous ; un chiffre affiché une seule fois ; relu chaque minute. Les calculs sont
 * dans `src/lib/dashboardStats.js` et `src/lib/salesChannels.js`, les lectures dans
 * `src/lib/useDashboardData.js`, les blocs dans `src/components/admin/dashboard/`.
 * L'export comptable est resté tel quel (décision du propriétaire).
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { exportToCSV } from '@/utils/exportCSV';
import { datesBetween, fetchAppointmentsForDates } from '@/components/agenda/agendaUtils';
import { round2 } from '@/lib/revenue';
import { APPOINTMENTS_LIMIT, comptableRows, isPaid, isRealAppt, outsideGift, noonOf } from '@/lib/dashboardStats';
import { useDashboardData } from '@/lib/useDashboardData';
import { InlineError, Note } from '@/components/admin/dashboard/ui';
import { isNetworkError } from '@/components/shared/LoadError';
import KeyFigures from '@/components/admin/dashboard/KeyFigures';
import TodoBlock from '@/components/admin/dashboard/TodoBlock';
import TodayBlock from '@/components/admin/dashboard/TodayBlock';
import MonthBlock from '@/components/admin/dashboard/MonthBlock';
import MoneyTable from '@/components/admin/dashboard/MoneyTable';
import WeekBars from '@/components/admin/dashboard/WeekBars';
import FillGrid from '@/components/admin/dashboard/FillGrid';
import BarbersBlock from '@/components/admin/dashboard/BarbersBlock';
import UpcomingRevenue from '@/components/admin/dashboard/UpcomingRevenue';
import LastMinuteAbsences from '@/components/admin/dashboard/LastMinuteAbsences';
import SalesChannels from '@/components/admin/dashboard/SalesChannels';

/** Jours du mois `yyyy-MM` (vide si la saisie est illisible). */
function monthDates(month) {
  const d = parseISO(`${month}-01`);
  return isValid(d) ? datesBetween(startOfMonth(d), endOfMonth(d)) : [];
}

const SALES_LABELS = { boutique: 'Boutique', cartes: 'Cartes cadeau', privatisations: 'Privatisations', textile: 'Textile' };
const hourOf = (ms) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

export default function AdminDashboard() {
  const d = useDashboardData();
  const { state, stats, liveCount } = d;
  const today = stats.clock.today;

  const [showExport, setShowExport] = React.useState(false);
  const [exportAmount, setExportAmount] = React.useState('');
  const [exportMonth, setExportMonth] = React.useState(format(new Date(), 'yyyy-MM'));

  // Export comptable : le mois choisi peut sortir des mois déjà lus, il est alors lu à part
  const exportDates = useMemo(() => monthDates(exportMonth), [exportMonth]);
  const exportInPeriod = exportDates.length > 0 && d.loadedMonths.includes(exportMonth);
  const exportQuery = useQuery({
    queryKey: ['adminAppointments', 'export', exportMonth],
    queryFn: () => fetchAppointmentsForDates(exportDates),
    enabled: showExport && exportDates.length > 0 && !exportInPeriod,
  });
  const exportSource = exportInPeriod ? d.rows : (exportQuery.data || []);
  const exportLoading = !exportInPeriod && exportDates.length > 0 && exportQuery.isFetching && !exportQuery.data;
  // Mois hors période pas encore lu (ou en échec) : pas d'export vide sans explication
  const exportReady = exportInPeriod || !!exportQuery.data;

  const handleExportComptable = async () => {
    const targetAmount = parseFloat(exportAmount);
    if (!targetAmount || targetAmount <= 0) return;

    // Get paid appointments for the selected month
    // Ordre chronologique (date puis heure) : la cible est atteinte avec les premiers jours du mois
    const monthAppts = exportSource
      .filter(a => a.date?.startsWith(exportMonth) && isRealAppt(a) && isPaid(a))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.start_time || '').localeCompare(b.start_time || ''));

    // Montant au format d'Excel en français (« 25,00 ») : avec un point, la colonne était lue comme du
    // texte (SOMME à 0) et « 10.10 » pouvait devenir une date
    const euro = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

    // Prestations puis produits jusqu'au montant cible, hors part payée par carte cadeau
    // (comptableLines) ; total calculé sur les nombres (parseFloat('12,50') renverrait 12)
    const { rows: lines, total: totalExported } = comptableRows(monthAppts, targetAmount);
    const rows = lines.map(({ apt, type, designation, paiement, amount }) => ({
      date: apt.date,
      type,
      designation,
      client: apt.client_name || '',
      barber: apt.employee_name || '',
      paiement,
      montant: euro(amount),
    }));

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

  const salesFailedLabels = Object.entries(state.sales.failed).filter(([, v]) => v).map(([k]) => SALES_LABELS[k]);
  // Rendez-vous illisibles faute de réseau (ou appareil hors ligne) : les ventes le sont aussi
  const offline = state.appointments.failed && (state.appointments.error
    ? isNetworkError(state.appointments.error)
    : typeof navigator !== 'undefined' && navigator.onLine === false);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-w-0">
        <header className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium">Tableau de bord</p>
            {liveCount !== null && (
              <Link
                to="/admin/traffic"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                {liveCount} client{liveCount > 1 ? 's' : ''} sur l'app
              </Link>
            )}
          </div>
          <h1 className="font-display text-2xl font-bold mt-1">Ciao le gang ! 🇮🇹🇵🇹</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="first-letter:uppercase">{format(noonOf(today), 'EEEE d MMMM yyyy', { locale: fr })}</span>
            {state.updatedAt > 0 && (
              <button
                type="button"
                onClick={() => d.refreshAll()}
                disabled={state.refreshing}
                aria-label={`Actualiser (mis à jour à ${hourOf(state.updatedAt)})`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-xs hover:text-foreground disabled:opacity-70"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${state.refreshing ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
                Mis à jour à {hourOf(state.updatedAt)}
              </button>
            )}
          </div>
          <button
            onClick={() => setShowExport(true)}
            className="mt-2 px-4 py-2 text-xs rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all font-semibold"
          >
            Export comptable
          </button>
        </header>

        {/* Erreurs : un seul bandeau par source, les blocs affichent « — » */}
        <div className="flex flex-col gap-2 empty:hidden mb-4">
          {offline ? (
            // Coupure réseau : un seul bandeau, qui relit tout
            <InlineError what="le tableau de bord" error={state.appointments.error}
              onRetry={() => d.refreshAll()} retrying={state.refreshing} />
          ) : state.appointments.failed && (
            <InlineError what="les rendez-vous du tableau de bord" error={state.appointments.error}
              onRetry={state.appointments.retry} retrying={state.appointments.retrying} />
          )}
          {!offline && !state.appointments.failed && state.prevMonth.failed && (
            <InlineError what="le mois précédent (comparaison, caisse du soir, prestations à clôturer d'avant le 1er)"
              onRetry={state.prevMonth.retry} />
          )}
          {!offline && salesFailedLabels.length > 0 && (
            <InlineError what={`les ventes de : ${salesFailedLabels.join(', ')}`} onRetry={state.sales.retry} retrying={state.sales.retrying} />
          )}
          {state.stale && !state.appointments.failed && (
            <Note>La dernière mise à jour a échoué : chiffres de {hourOf(state.updatedAt)}.</Note>
          )}
          {state.truncated.appointments && (
            <Note>Plus de {APPOINTMENTS_LIMIT} rendez-vous sur un mois : seuls les {APPOINTMENTS_LIMIT} premiers sont comptés, les chiffres peuvent être incomplets.</Note>
          )}
        </div>

        {/* Tous les chiffres du jour et du mois, en premier (demande du propriétaire, 1er nov. 2026) */}
        <div className="mb-4">
          <KeyFigures d={d} />
        </div>

        {/* Téléphone : une colonne, le travail du jour d'abord. Grand écran : le jour à droite */}
        <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
          <div className="flex flex-col gap-4 min-w-0 xl:order-2">
            <TodoBlock d={d} />
            <TodayBlock d={d} />
          </div>
          <div className="flex flex-col gap-4 min-w-0 xl:order-1 xl:col-span-2">
            <MonthBlock d={d} />
            <MoneyTable d={d} />
            <WeekBars d={d} />
            <FillGrid d={d} />
            <BarbersBlock d={d} />
            <UpcomingRevenue d={d} />
            <LastMinuteAbsences d={d} />
            <SalesChannels d={d} />
          </div>
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
                    : `CA du mois sélectionné hors cartes cadeau : ${round2(exportSource.filter(a => a.date?.startsWith(exportMonth) && isRealAppt(a) && isPaid(a)).reduce((s, a) => s + outsideGift(a), 0)).toFixed(2)}€`}
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
    </MotionConfig>
  );
}
