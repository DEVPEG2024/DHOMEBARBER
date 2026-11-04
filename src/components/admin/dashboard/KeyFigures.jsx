/**
 * Tableau de bord, bloc « Chiffres » tout en haut de la page (demande du propriétaire, 1er nov. 2026 :
 * « plus de chiffres en haut, tous les chiffres générés, par mois global et au jour »).
 *
 * Deux grands chiffres (CA global du jour et du mois, avec leur comparaison), puis tous les chiffres
 * en colonnes « Aujourd'hui | Ce mois » : ventes par canal, encaissements des rendez-vous, pourboires
 * (total, puis chaque barber en CB et en espèces, demande du 4 nov. 2026), rendez-vous (nombre, panier
 * moyen, à clôturer, à venir, absents, annulations). Chaque chiffre n'est
 * affiché qu'ici : les blocs du dessous ne les répètent pas.
 * Rendez-vous en échec : « — » (le bandeau d'erreur est en haut de la page) ; un canal de vente en
 * échec : « — » sur sa ligne, total partiel marqué « incomplet ». Tout vient de `d` (useDashboardData).
 */
import React from 'react';
import { BarChart3 } from 'lucide-react';
import { euro, percentChange, formatPercentChange } from '@/lib/euro';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { noonOf } from '@/lib/dashboardStats';
import { Section, Money, Pill, Note } from '@/components/admin/dashboard/ui';

export const CHANNEL_LABELS = {
  prestations: 'Rendez-vous',
  boutique: 'Boutique (commandes retirées)',
  cartes: 'Cartes cadeau vendues',
  privatisations: 'Privatisations',
  textile: 'Textile (précommandes payées)',
};
const SHORT_LABELS = { boutique: 'boutique', cartes: 'cartes cadeau', privatisations: 'privatisations', textile: 'textile' };

const monthName = (dayKey) => format(noonOf(dayKey), 'LLLL', { locale: fr });
const dayNumber = (dayKey) => {
  const n = Number(String(dayKey).slice(8, 10));
  return n === 1 ? '1er' : String(n);
};

/** Une cellule : montant, nombre, ou montant avec un nombre en précision. */
function Cell({ cell, state }) {
  const { failed, loading } = state;
  if (cell == null) return <span className="text-muted-foreground">·</span>;
  if (failed) return <span className="tabular-nums">—</span>;
  if (loading) return <span className="tabular-nums">…</span>;
  if (cell.kind === 'count') return <span className="tabular-nums">{cell.value}</span>;
  return (
    <>
      <Money value={cell.value} />
      {cell.count != null && (
        <span className="block text-[11px] font-normal text-muted-foreground tabular-nums">
          {cell.count} RDV
        </span>
      )}
    </>
  );
}

/** « dont abonnements 100 € », avec les deux chiffres s'ils diffèrent et que le jour en a déjà vendu. */
function subscriptionsHint(cartes) {
  const { todaySubscriptions: day = 0, monthSubscriptions: month = 0 } = cartes || {};
  if (!month && !day) return '';
  if (day > 0 && day !== month) return `dont abonnements ${euro(day)} aujourd'hui · ${euro(month)} ce mois`;
  return `dont abonnements ${euro(month || day)}`;
}

const TODAY_AND_MONTH = [{ key: 'today', label: "Aujourd'hui" }, { key: 'month', label: 'Ce mois' }];

/** Un groupe de lignes, en tableau : « Aujourd'hui | Ce mois » par défaut, une colonne par `columns`. */
export function FigureTable({ title, hint, rows, columns = TODAY_AND_MONTH }) {
  const visible = rows.filter((r) => !r.hidden);
  if (!visible.length) return null;
  return (
    <div className="min-w-0">
      <table className="w-full border-collapse text-xs">
        <caption className="text-left">
          <span className="block text-xs font-semibold text-foreground">{title}</span>
          {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-full pb-1 text-left font-normal"><span className="sr-only">Ligne</span></th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="pb-1 pl-2 sm:pl-3 text-right text-[11px] font-semibold text-muted-foreground whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.key} className={r.strong ? 'border-t border-border/70' : ''}>
              <th scope="row" className={`py-1.5 pr-2 text-left align-baseline font-normal break-words ${r.strong ? 'font-semibold text-foreground' : r.muted ? 'text-muted-foreground/80' : 'text-muted-foreground'}`}>
                {r.label}
                {r.hint && <span className="block text-[11px] font-normal text-muted-foreground">{r.hint}</span>}
              </th>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-1.5 pl-2 sm:pl-3 text-right align-baseline whitespace-nowrap tabular-nums text-xs sm:text-sm ${r.strong ? 'font-bold text-foreground' : r.muted ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}
                >
                  <Cell cell={r[c.key]} state={r.state} />
                  {r.strong && r.incomplete && <span className="block text-[11px] font-semibold text-amber-700 dark:text-amber-400">incomplet</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TIP_COLUMNS = [{ key: 'cb', label: 'CB' }, { key: 'especes', label: 'Espèces' }, { key: 'total', label: 'Total' }];

/**
 * Pourboires de chaque barber en CB et en espèces (`money` de `stats.barbers`, aucun calcul ici) :
 * seulement ceux qui en ont sur la période ; une part sans moyen noté est rappelée sous le nom.
 */
export function TipsByBarber({ title, hint, barbers, state }) {
  const rows = barbers.filter((b) => b.money.tips > 0).map((b) => ({
    key: b.id || 'sans-barber',
    label: b.name,
    hint: b.money.tipsOther > 0 ? `dont ${euro(b.money.tipsOther)} sans moyen noté` : '',
    cb: { value: b.money.tipsCB },
    especes: { value: b.money.tipsCash },
    total: { value: b.money.tips },
    state,
  }));
  return <FigureTable title={title} hint={hint} rows={rows} columns={TIP_COLUMNS} />;
}

/** Grand chiffre (CA global du jour ou du mois) avec sa comparaison. */
function BigFigure({ label, value, state, incomplete, compare }) {
  return (
    <div className="min-w-0 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-2xl sm:text-3xl font-bold leading-tight text-foreground break-words">
        <Money value={value} loading={state.loading} failed={state.failed} />
      </p>
      {incomplete && <Pill tone="amber" className="mt-1">incomplet</Pill>}
      {compare}
    </div>
  );
}

export default function KeyFigures({ d }) {
  const { stats, sales, state, access } = d;
  const appt = state.appointments;
  const apptState = { failed: appt.failed, loading: !appt.failed && appt.loading };
  const channels = sales.channels || [];
  const salesFailed = state.sales.failed || {};
  const salesLoading = state.sales.loading || {};
  const missing = channels.filter((c) => c.key !== 'prestations' && salesFailed[c.key]);
  const anySalesLoading = channels.some((c) => c.key !== 'prestations' && salesLoading[c.key]);
  const totalState = { failed: appt.failed, loading: !appt.failed && (appt.loading || anySalesLoading) };
  const ready = !totalState.failed && !totalState.loading;
  const incomplete = ready && missing.length > 0;
  const complete = ready && !incomplete;
  const t = stats.today;
  const m = stats.month;
  const scope = access.canEvents ? 'tous canaux' : 'tous canaux, hors privatisations';

  // Comparaisons : les RDV à hier à la même heure ; le mois (tous canaux) au mois précédent à la même
  // date, pas le 1er (trop tôt) ni sur un total incomplet
  const trend = !appt.failed && !appt.loading ? t.trend : null;
  const isFirstDay = stats.clock.today.endsWith('-01');
  const prevKnown = complete && !state.prevMonth.failed && !state.prevMonth.loading;
  const monthPct = prevKnown && !isFirstDay ? percentChange(sales.totals.month, sales.totals.prevSameDay) : null;
  const cutoff = stats.prevMonth.cutoffDay;

  const pill = (pct) => (pct > 0 ? 'green' : pct < 0 ? 'red' : 'muted');

  // ── Ventes par canal ──
  const salesRows = [
    ...channels.map((c) => {
      const isRdv = c.key === 'prestations';
      const failed = isRdv ? appt.failed : !!salesFailed[c.key];
      const loading = !failed && (isRdv ? appt.loading : !!salesLoading[c.key]);
      return {
        key: c.key,
        label: CHANNEL_LABELS[c.key] || c.label,
        hint: c.key === 'cartes' && d.features.subscriptions && !failed && !loading ? subscriptionsHint(sales.cartes) : '',
        today: { value: c.today },
        month: { value: c.month },
        state: { failed, loading },
      };
    }),
    {
      key: 'total', label: `Total ${scope}`, strong: true, incomplete,
      today: { value: sales.totals.today }, month: { value: sales.totals.month }, state: totalState,
    },
  ];

  // ── Encaissements des rendez-vous (hors carte cadeau) ──
  const money = (key) => ({ today: { value: t.money[key] }, month: { value: m.money[key] } });
  const zeroBoth = (key) => !(Number(t.money[key]) || 0) && !(Number(m.money[key]) || 0);
  const paymentRows = [
    { key: 'cb', label: 'CB', ...money('cb') },
    { key: 'especes', label: 'Espèces', ...money('especes') },
    { key: 'autre', label: 'Non renseigné', hint: 'moyen de paiement non noté', ...money('autre'), hidden: zeroBoth('autre') },
    { key: 'products', label: 'dont produits vendus en RDV', hint: 'hors part carte cadeau', ...money('products'), muted: true },
    { key: 'gift', label: 'Réglé par carte cadeau', hint: 'déjà compté à la vente de la carte', ...money('gift'), muted: true, hidden: zeroBoth('gift') },
  ].map((r) => ({ ...r, state: apptState }));

  // ── Pourboires ──
  const tipRows = [
    { key: 'tipsCB', label: 'CB', ...money('tipsCB') },
    { key: 'tipsCash', label: 'Espèces', ...money('tipsCash') },
    { key: 'tipsOther', label: 'Non renseignés', ...money('tipsOther'), hidden: zeroBoth('tipsOther') },
    { key: 'tips', label: 'Total pourboires', ...money('tips'), strong: true },
  ].map((r) => ({ ...r, state: apptState }));

  // ── Rendez-vous ──
  const count = (a, b) => ({ today: { kind: 'count', value: a }, month: { kind: 'count', value: b } });
  const rdvRows = [
    { key: 'paid', label: 'RDV encaissés', ...count(t.money.count, m.money.count) },
    { key: 'avg', label: 'Panier moyen', hint: d.features.subscriptions ? 'CA hors carte cadeau ÷ RDV encaissés, hors abonnements' : 'CA hors carte cadeau ÷ RDV encaissés', today: { value: t.money.avg }, month: { value: m.money.avg } },
    { key: 'toClose', label: 'À clôturer', hint: 'terminés, pas encore encaissés',
      today: { value: t.toClose.amount, count: t.toClose.count }, month: { value: m.toClose.amount, count: m.toClose.count } },
    { key: 'upcoming', label: 'À venir', hint: 'confirmés, pas encore passés',
      today: { value: t.upcoming.amount, count: t.upcoming.count }, month: { value: m.upcoming.amount, count: m.upcoming.count } },
    { key: 'noShow', label: 'Absents', ...count(t.noShow, m.noShows) },
    { key: 'cancels', label: 'Annulations par les clients', hint: 'déplacements non comptés', ...count(t.clientCancels, m.clientCancels) },
  ].map((r) => ({ ...r, state: apptState }));

  return (
    <Section title="Chiffres" icon={BarChart3} hint={`Aujourd'hui et ce mois · ${scope}, hors pourboires et hors part carte cadeau`}>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <BigFigure
          label="CA aujourd'hui"
          value={sales.totals.today}
          state={totalState}
          incomplete={incomplete}
          compare={trend !== null && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <Pill tone={pill(trend)}>{trend === 0 ? '=' : formatPercentChange(trend)}</Pill>
              <span className="min-w-0 break-words">RDV vs hier même heure ({euro(t.yesterdaySoFar)})</span>
            </p>
          )}
        />
        <BigFigure
          label={`CA ${monthName(`${stats.clock.monthKey}-01`)}`}
          value={sales.totals.month}
          state={totalState}
          incomplete={incomplete}
          compare={monthPct != null && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <Pill tone={pill(monthPct)}>{formatPercentChange(monthPct)}</Pill>
              <span className="min-w-0 break-words">{monthName(cutoff)} au {dayNumber(cutoff)} : {euro(sales.totals.prevSameDay)}</span>
            </p>
          )}
        />
      </div>
      {incomplete && (
        <Note className="mt-2">Ventes non chargées : {missing.map((c) => SHORT_LABELS[c.key] || c.label).join(', ')}.</Note>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5 min-w-0">
          <FigureTable title="Ventes" hint="par canal" rows={salesRows} />
          <FigureTable title="Rendez-vous" rows={rdvRows} />
        </div>
        <div className="flex flex-col gap-5 min-w-0">
          <FigureTable title="Encaissements des rendez-vous" hint="au jour du rendez-vous, hors carte cadeau" rows={paymentRows} />
          <FigureTable title="Pourboires" rows={tipRows} />
          <TipsByBarber title="Pourboires par barber · aujourd'hui" barbers={stats.barbers.today} state={apptState} />
          <TipsByBarber title="Pourboires par barber · ce mois" barbers={stats.barbers.month} state={apptState} />
          <p className="text-[11px] text-muted-foreground">
            Achats payés par carte cadeau hors rendez-vous ({access.canEvents ? 'boutique, textile, privatisations' : 'boutique, textile'}) : pas déduits.
          </p>
        </div>
      </div>
    </Section>
  );
}
