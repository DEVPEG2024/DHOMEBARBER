/**
 * Tableau de bord, bloc « Fin de {mois} » : fin de mois prévue (`sales.totals.projection`) et objectif
 * du mois (barre, admin : le fixer ou le changer). Le CA du mois, sa comparaison au mois précédent et
 * la répartition par canal sont dans « Chiffres » (KeyFigures.jsx), en haut de la page.
 * Un canal de vente en échec : ni fin de mois prévue ni % d'objectif (tirés d'un total incomplet).
 * Tout vient de `d` (useDashboardData) : aucune lecture ici, seule l'écriture de l'objectif.
 */
import React, { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Pencil, Target } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/components/shared/LoadError';
import { euro, deMois } from '@/lib/euro';
import { noonOf } from '@/lib/dashboardStats';
import { useSaveRevenueGoal } from '@/lib/useDashboardData';
import { Section, Money, Note, TONE } from '@/components/admin/dashboard/ui';

const GOAL_MAX = 1000000;

const monthName = (dayKey) => format(noonOf(dayKey), 'LLLL', { locale: fr });
const clamp01 = (x) => (Number.isFinite(x) ? Math.min(Math.max(x, 0), 1) : 0);

/**
 * « 8000 », « 8 000 », « 8000,50 », « 8000.5 », « 8 000 € », « 8.000 », « 8.000,50 » → nombre ;
 * NaN si illisible. Un point suivi de trois chiffres sépare les milliers (« 8.000 » = 8 000 €).
 */
function parseGoalInput(text) {
  // `\s` couvre aussi les espaces insécables (copier-coller d'un montant affiché)
  let s = String(text ?? '').replace(/[\s€]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s);
}

/** Valeur du champ pour un objectif enregistré : « 8000 », « 8000,50 ». */
const goalToInput = (goal) => (goal ? String(Math.round(goal * 100) / 100).replace('.', ',') : '');

// Canaux en échec, dans la précision « Ventes non chargées : … »
const SHORT_LABELS = { boutique: 'boutique', cartes: 'cartes cadeau', privatisations: 'privatisations', textile: 'textile' };

export default function MonthBlock({ d }) {
  const { stats, sales, state, access, features, settings } = d;
  const appt = state.appointments;
  const channels = sales.channels || [];
  const salesLoading = channels.some((c) => c.key !== 'prestations' && state.sales.loading?.[c.key]);
  const missing = channels.filter((c) => c.key !== 'prestations' && state.sales.failed?.[c.key]);

  // Total du mois (dans « Chiffres ») : « — » sans les rendez-vous, « … » tant qu'une source arrive ;
  // un canal de vente en échec : ni fin de mois prévue ni % d'objectif, tirés d'un total incomplet
  const totalFailed = appt.failed;
  const totalLoading = !totalFailed && (appt.loading || salesLoading);
  const ready = !totalFailed && !totalLoading;
  const incomplete = ready && missing.length > 0;
  const total = sales.totals.month;

  // Fin de mois prévue (salesChannels) : encaissé + RDV terminés à clôturer + RDV confirmés à venir du
  // mois + privatisations confirmées à venir du mois (admin)
  const toClose = stats.month.toClose.amount;
  const upcoming = stats.month.upcoming.amount;
  const privUpcoming = access.canEvents ? Number(sales.privatisations?.monthUpcoming) || 0 : 0;
  const projection = sales.totals.projection;
  const hasPending = toClose + upcoming + privUpcoming > 0;
  const prevKnown = ready && !incomplete && !state.prevMonth.failed && !state.prevMonth.loading;
  const prevTotal = sales.totals.prevTotal;

  // Objectif du mois
  const goal = Number(settings?.monthly_revenue_goal) || 0;
  const showGoal = features.revenueGoal && !!settings && (goal > 0 || (access.isAdmin && !!settings.id));

  const title = `Fin ${deMois(monthName(`${stats.clock.monthKey}-01`))}`;
  // Un barber ne lit pas les privatisations : son total ne les contient pas
  const scope = access.canEvents ? 'tous les canaux' : 'tous les canaux, hors privatisations';

  return (
    <Section title={title} icon={CalendarDays} hint={`Fin de mois prévue et objectif · ${scope}, hors pourboires et hors part carte cadeau`}>
      <div className="rounded-xl bg-secondary/50 px-3 py-2.5 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground min-w-0">Fin de mois prévue</span>
          <span className="text-lg font-bold text-foreground shrink-0">
            {incomplete
              ? <span className="tabular-nums">—</span>
              : <Money value={projection} loading={totalLoading} failed={totalFailed} />}
          </span>
        </div>
        {ready && !incomplete && (
          <p className="mt-0.5 text-[11px] text-muted-foreground break-words">
            CA encaissé <span className="tabular-nums">{euro(total)}</span>
            {toClose > 0 && <> + <span className="tabular-nums">{euro(toClose)}</span> à clôturer</>}
            {upcoming > 0 && <> + <span className="tabular-nums">{euro(upcoming)}</span> de RDV à venir</>}
            {privUpcoming > 0 && <> + <span className="tabular-nums">{euro(privUpcoming)}</span> de privatisations à venir</>}
            {prevKnown && prevTotal > 0 && <> · mois dernier : <span className="tabular-nums">{euro(prevTotal)}</span></>}
          </p>
        )}
        {incomplete && (
          <Note className="mt-0.5">Ventes non chargées : {missing.map((c) => SHORT_LABELS[c.key] || c.label).join(', ')}.</Note>
        )}
      </div>

      {/* Objectif du mois */}
      {showGoal && (
        <GoalBar
          goal={goal}
          total={total}
          projection={projection}
          showMarker={hasPending}
          loading={totalLoading}
          failed={totalFailed}
          incomplete={incomplete}
          isAdmin={access.isAdmin}
          settings={settings}
        />
      )}
    </Section>
  );
}

/**
 * Barre de l'objectif : CA du mois (bornée à 100 %), trait = fin de mois prévue. Admin : bouton
 * « Fixer un objectif » / « Modifier ». Barber : lecture seule (rien sans objectif).
 * Total incomplet (un canal de vente en échec) : ni barre ni %, « — de 3 000 € ».
 */
function GoalBar({ goal, total, projection, showMarker, loading, failed, incomplete = false, isAdmin, settings }) {
  const [open, setOpen] = useState(false);
  // Écriture tenue ici (toujours monté) : le message de fin arrive même si la fenêtre a été fermée
  const save = useSaveRevenueGoal(settings);
  const hasGoal = goal > 0;
  const ready = !loading && !failed;
  const ratio = hasGoal ? total / goal : 0;
  const pct = Math.round(ratio * 100);
  const projPct = hasGoal ? Math.round((projection / goal) * 100) : 0;
  // Trait de la fin de mois prévue : seulement si elle dépasse le CA et que l'objectif n'est pas atteint
  const marker = ready && hasGoal && showMarker && projection > total && ratio < 1;

  if (!hasGoal && !isAdmin) return null;

  return (
    <div className="mt-4 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 min-w-0">
          <Target className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">Objectif du mois</span>
        </h3>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary shrink-0"
          >
            {hasGoal && <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            {hasGoal ? 'Modifier' : 'Fixer un objectif'}
          </button>
        )}
      </div>

      {hasGoal && incomplete ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">—</span> de <span className="tabular-nums">{euro(goal)}</span>
          {' '}(total incomplet)
        </p>
      ) : hasGoal ? (
        <>
          <div className="relative mt-1.5">
            <div
              role="progressbar"
              aria-label="Objectif du mois"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={ready ? Math.min(pct, 100) : undefined}
              aria-valuetext={ready ? `${pct} % de ${euro(goal)}` : undefined}
              className="h-3 rounded-full bg-secondary overflow-hidden"
            >
              {ready && (
                <motion.div
                  className={`h-full w-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                  style={{ originX: 0 }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: clamp01(ratio) }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              )}
            </div>
            {marker && (
              <span
                className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                style={{ left: `${clamp01(projection / goal) * 100}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span className="text-foreground">
              <span className="font-semibold tabular-nums">{failed ? '—' : loading ? '…' : `${pct} %`}</span>
              <span className="text-muted-foreground"> de <span className="tabular-nums">{euro(goal)}</span></span>
              {ready && pct >= 100 && <span className={`ml-1.5 font-semibold ${TONE.green}`}>Objectif atteint</span>}
            </span>
            {ready && hasGoal && showMarker && projection > total && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {marker && <span className="inline-block h-3 w-0.5 rounded-full bg-foreground" aria-hidden="true" />}
                fin de mois prévue : <span className="tabular-nums">{projPct} %</span>
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground">Aucun objectif fixé.</p>
      )}

      {/* Montée à l'ouverture seulement : champ repris du montant enregistré, sans ancien message */}
      {isAdmin && open && <GoalDialog onClose={() => setOpen(false)} goal={goal} save={save} />}
    </div>
  );
}

/** Fenêtre de l'objectif (admin) : montant, « Enregistrer », « Retirer l'objectif ». */
function GoalDialog({ onClose, goal, save }) {
  const [value, setValue] = useState(() => goalToInput(goal));
  const [error, setError] = useState('');
  const inputId = useId();
  const errorId = useId();
  const hasGoal = goal > 0;

  const send = (next) => {
    setError('');
    save.mutate(next, {
      onSuccess: () => {
        toast.success(next == null ? 'Objectif retiré' : `Objectif enregistré : ${euro(next)} par mois`);
        onClose();
      },
      onError: (err) => setError(friendlyError(err, 'Enregistrement impossible. Réessayez.')),
    });
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (save.isPending) return;
    if (!String(value).trim()) {
      setError(hasGoal ? 'Entrez un montant, ou retirez l\'objectif.' : 'Entrez un montant.');
      return;
    }
    const n = parseGoalInput(value);
    if (!(n > 0 && n <= GOAL_MAX)) {
      setError('Montant invalide : de 0,01 € à 1 000 000 €, par exemple 8000.');
      return;
    }
    send(Math.round(n * 100) / 100);
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base pr-6">Objectif du mois</DialogTitle>
          <DialogDescription className="text-xs">
            CA de tous les canaux, hors pourboires et hors part carte cadeau. Il vaut pour chaque mois, jusqu'à ce que vous le changiez.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <div>
            <label htmlFor={inputId} className="text-xs text-muted-foreground mb-1 block">Montant (€)</label>
            <Input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="Ex. : 8000"
              value={value}
              onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="h-11"
            />
            {error && (
              <p id={errorId} role="alert" className={`mt-1.5 text-xs ${TONE.red}`}>{error}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={save.isPending}
            className="min-h-11 w-full rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {hasGoal && (
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => send(null)}
              className={`min-h-11 w-full rounded-xl border border-border text-sm font-semibold hover:bg-secondary disabled:opacity-60 ${TONE.red}`}
            >
              Retirer l'objectif
            </button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
