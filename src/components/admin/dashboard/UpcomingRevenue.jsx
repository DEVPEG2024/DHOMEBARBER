/**
 * Tableau de bord : « CA à venir · tous les mois » (31 oct. 2026, refait le 1er nov. 2026).
 *
 * RDV confirmés pas encore encaissés, d'aujourd'hui au dernier RDV confirmé de la base (24 mois au
 * plus), puis un pavé par mois, vers la vue Mois de l'agenda quand ce compte peut l'ouvrir. Le pavé
 * du mois en cours vaut la part « à venir » du mois (même règle : `buildUpcoming`). Lecture à part
 * (`d.state.upcoming`) : son échec s'affiche ici, jamais « 0 € » ; sauf quand les RDV du mois sont
 * illisibles aussi (coupure réseau) : le bandeau de la page, qui relit aussi celle-ci, suffit.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { euro } from '@/lib/euro';
import { APPOINTMENTS_LIMIT } from '@/lib/dashboardStats';
import { DATES_PER_REQUEST } from '@/lib/useDashboardData';
import { Money, InlineError, Note } from '@/components/admin/dashboard/ui';

// Clés `yyyy-MM` / `yyyy-MM-dd` lues à midi UTC : le même mois et le même jour quel que soit le fuseau
const MONTH_FMT = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** « novembre 2026 » (la majuscule est posée à l'affichage). */
function monthLabel(key) {
  const t = Date.parse(`${key}-01T12:00:00Z`);
  return Number.isFinite(t) ? MONTH_FMT.format(t) : key;
}

/** « 1 novembre 2028 ». */
function dayLabel(key) {
  const t = Date.parse(`${String(key).slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(t) ? DAY_FMT.format(t) : key;
}

// 2 pavés par ligne sur téléphone ; ensuite autant que la largeur du bloc le permet (9rem au moins),
// 6 au plus (5 espaces de 0,5 rem) : lisible que le bloc prenne toute la largeur ou une colonne
const GRID = 'grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(max(9rem,calc((100%_-_2.5rem)/6)),1fr))]';

export default function UpcomingRevenue({ d }) {
  const navigate = useNavigate();
  const up = d.upcoming;
  const st = d.state.upcoming;
  const { failed, loading } = st;
  const ready = !failed && !loading;
  const pageBanner = !!d.state.appointments?.failed;
  const currentMonth = d.stats.clock.monthKey;
  const canOpen = !!d.access.canAgenda;

  return (
    <section aria-label="CA à venir, tous les mois" className="bg-card border border-border rounded-2xl p-4 sm:p-5 min-w-0">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
        <span className="min-w-0">CA à venir · tous les mois</span>
      </h2>
      <p className="mt-2 text-2xl sm:text-3xl font-bold text-foreground">
        <Money value={up.amount} loading={loading} failed={failed} />
      </p>
      {ready && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {up.count > 0
            ? `${up.count} RDV confirmé${up.count > 1 ? 's' : ''}, pas encore encaissé${up.count > 1 ? 's' : ''}`
            : 'Aucun RDV confirmé à venir'}
        </p>
      )}

      {failed && !pageBanner && (
        <InlineError className="mt-3" what="les rendez-vous à venir" error={st.error} onRetry={st.retry} retrying={st.retrying} />
      )}

      {ready && up.months.length > 0 && (
        <ul className={`${GRID} mt-4`}>
          {up.months.map((m) => {
            const isCurrent = m.key === currentMonth;
            const body = (
              <>
                <span className="block pr-4 text-xs text-muted-foreground break-words first-letter:uppercase">
                  {monthLabel(m.key)}{isCurrent ? ' · ce mois' : ''}
                </span>
                <span className="mt-1 block text-sm sm:text-base font-bold text-foreground tabular-nums whitespace-nowrap">{euro(m.amount)}</span>
                <span className="block text-xs text-muted-foreground">{m.count} RDV</span>
              </>
            );
            const box = `relative block h-full w-full min-h-11 rounded-xl border px-3 py-2 text-left ${
              isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border bg-secondary/40'}`;
            return (
              <li key={m.key} className="min-w-0">
                {canOpen ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/agenda?view=month&date=${m.key}-01`)}
                    className={`${box} transition hover:border-primary/40 hover:bg-secondary motion-safe:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}
                  >
                    {body}
                    <ChevronRight className="absolute right-2 top-2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                  </button>
                ) : (
                  <div className={box}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {ready && up.beyond && (
        <Note className="mt-3">Des RDV confirmés vont au-delà du {dayLabel(up.beyond)} : non comptés ici.</Note>
      )}
      {ready && up.incomplete && (
        <Note className="mt-3">
          Plus de {APPOINTMENTS_LIMIT} rendez-vous sur une période de {DATES_PER_REQUEST} jours : le total peut être incomplet.
        </Note>
      )}
    </section>
  );
}
