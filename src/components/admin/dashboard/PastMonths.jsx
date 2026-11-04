/**
 * Tableau de bord, bloc « Mois passés » (demande du propriétaire, 4 nov. 2026 : « les chiffres de tous
 * les mois passés »).
 *
 * Une ligne par mois, du plus récent au plus ancien : CA de tous les canaux, barre à l'échelle du
 * meilleur mois affiché, RDV encaissés, panier moyen, écart avec le mois d'avant. Toucher un mois ouvre
 * tous ses chiffres : ventes par canal, rendez-vous, encaissements, pourboires, barbers, Last Minute.
 * Les 6 derniers mois sont lus d'emblée, les autres seulement avec « Voir les N mois plus anciens ».
 * Affichage seulement : tout est compté par `computeMonthReport` (src/lib/pastMonths.js).
 * Mois illisible : « — » et Réessayer, jamais « 0 € » ; une vente en échec : total marqué « incomplet ».
 */
import React, { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, History } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { euro, percentChange, formatPercentChange } from '@/lib/euro';
import { noonOf } from '@/lib/dashboardStats';
import { CHANNEL_LIMITS } from '@/lib/salesChannels';
import { usePastMonths } from '@/lib/useDashboardData';
import { FigureTable, CHANNEL_LABELS } from '@/components/admin/dashboard/KeyFigures';
import { Section, Money, Pill, InlineError, Note } from '@/components/admin/dashboard/ui';

const monthTitle = (key) => format(noonOf(`${key}-01`), 'LLLL yyyy', { locale: fr });
const monthName = (key) => format(noonOf(`${key}-01`), 'LLLL', { locale: fr });
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const pillTone = (pct) => (pct > 0 ? 'green' : pct < 0 ? 'red' : 'muted');
const LOADED = { failed: false, loading: false };

/** Tous les chiffres d'un mois : mêmes lignes que « Chiffres », plus les barbers et les Last Minute. */
function MonthDetail({ entry, id, salesState, scope, incomplete }) {
  const { stats, sales } = entry.report;
  const m = stats.month;
  const money = m.money;
  const columns = [{ key: 'month', label: monthName(entry.key) }];
  const line = (key, label, value, extra = {}) => ({ key, label, month: { value }, state: LOADED, ...extra });
  const count = (key, label, value, extra = {}) => ({ key, label, month: { kind: 'count', value }, state: LOADED, ...extra });

  const salesRows = [
    ...sales.channels.map((c) => {
      const failed = c.key !== 'prestations' && !!salesState.failed[c.key];
      const loading = c.key !== 'prestations' && !failed && !!salesState.loading[c.key];
      const by = c.key === 'cartes' ? sales.cartes.monthBy : null;
      const hint = by && c.month > 0
        ? [`CB ${euro(by.cb)}`, `espèces ${euro(by.especes)}`, by.other > 0 ? `non renseigné ${euro(by.other)}` : ''].filter(Boolean).join(' · ')
        : '';
      return line(c.key, CHANNEL_LABELS[c.key] || c.label, c.month, { hint, state: { failed, loading } });
    }),
    {
      ...line('total', `Total ${scope}`, sales.totals.month),
      strong: true,
      incomplete,
      state: { failed: false, loading: Object.values(salesState.loading).some(Boolean) },
    },
  ];
  const rdvRows = [
    count('paid', 'RDV encaissés', money.count),
    line('avg', 'Panier moyen', money.avg, { hint: 'CA hors carte cadeau ÷ RDV encaissés' }),
    { ...line('toClose', 'Restés à clôturer', m.toClose.amount, { hint: 'terminés, jamais encaissés' }), month: { value: m.toClose.amount, count: m.toClose.count }, hidden: m.toClose.count === 0 },
    count('noShow', 'Absents', m.noShows),
    count('cancels', 'Annulations par les clients', m.clientCancels, { hint: 'déplacements non comptés' }),
  ];
  const paymentRows = [
    line('cb', 'CB', money.cb),
    line('especes', 'Espèces', money.especes),
    line('autre', 'Non renseigné', money.autre, { hint: 'moyen de paiement non noté', hidden: !money.autre }),
    line('products', 'dont produits vendus en RDV', money.products, { hint: 'hors part carte cadeau', muted: true }),
    line('gift', 'Réglé par carte cadeau', money.gift, { hint: 'déjà compté à la vente de la carte', muted: true, hidden: !money.gift }),
  ];
  const tipRows = [
    line('tipsCB', 'CB', money.tipsCB),
    line('tipsCash', 'Espèces', money.tipsCash),
    line('tipsOther', 'Non renseignés', money.tipsOther, { hidden: !money.tipsOther }),
    { ...line('tips', 'Total pourboires', money.tips), strong: true },
  ];
  const barberRows = stats.barbers.month
    .filter((b) => b.money.count > 0 || b.noShows > 0)
    .map((b) => ({
      ...line(b.id || b.name, b.name, b.money.revenue),
      month: { value: b.money.revenue, count: b.money.count },
      hint: [
        b.money.tips > 0 ? `${euro(b.money.tips)} de pourboires` : '',
        b.noShows > 0 ? plural(b.noShows, 'absence') : '',
      ].filter(Boolean).join(' · '),
    }));
  const { team, auto } = stats.lastMinute;
  const lastMinuteRows = [
    line('lmTeam', "Last Minute de l'équipe", team.revenue, { hint: `${team.taken} pris sur ${team.published}`, hidden: team.published === 0 }),
    line('lmAuto', 'Last Minute automatiques', auto.revenue, { hint: `${auto.taken} comblés sur ${auto.published}`, hidden: auto.published === 0 }),
  ];

  return (
    <div id={id} className="grid gap-5 border-t border-border px-3 py-3 lg:grid-cols-2">
      <div className="flex flex-col gap-5 min-w-0">
        <FigureTable title="Ventes" hint="par canal" rows={salesRows} columns={columns} />
        <FigureTable title="Rendez-vous" rows={rdvRows} columns={columns} />
        <FigureTable title="Barbers" hint="CA encaissé, hors pourboires et hors part carte cadeau" rows={barberRows} columns={columns} />
      </div>
      <div className="flex flex-col gap-5 min-w-0">
        <FigureTable title="Encaissements des rendez-vous" hint="au jour du rendez-vous, hors carte cadeau" rows={paymentRows} columns={columns} />
        <FigureTable title="Pourboires" rows={tipRows} columns={columns} />
        <FigureTable title="Last Minute" rows={lastMinuteRows} columns={columns} />
      </div>
    </div>
  );
}

/** Ligne d'un mois : bouton de résumé (`aria-expanded`), détail en dessous. */
function MonthRow({ entry, older, best, open, onToggle, salesState, scope, incomplete }) {
  const detailId = useId();
  const { report, failed, loading } = entry;
  const total = report?.total ?? 0;
  const money = report?.stats.month.money;
  const toClose = report?.stats.month.toClose.count || 0;
  const pct = report && older?.report && !incomplete ? percentChange(total, older.report.total) : null;
  const salesLoading = Object.values(salesState.loading).some(Boolean);
  const canOpen = !!report;

  return (
    <li className="rounded-xl border border-border bg-secondary/30 min-w-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={!canOpen}
        aria-expanded={canOpen ? open : undefined}
        aria-controls={canOpen && open ? detailId : undefined}
        className="block w-full min-h-11 rounded-xl px-3 py-2.5 text-left hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:hover:bg-transparent"
      >
        <span className="flex items-baseline justify-between gap-3 min-w-0">
          <span className="min-w-0 text-sm font-semibold text-foreground break-words first-letter:uppercase">{monthTitle(entry.key)}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Money value={total} failed={failed} loading={loading || salesLoading} className="text-sm font-bold text-foreground" />
            {canOpen && <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
          </span>
        </span>
        {/* Barre à l'échelle du meilleur mois affiché ; le montant est écrit juste au-dessus */}
        <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          {report && !salesLoading && (
            <motion.span
              className="block h-full w-full rounded-full bg-primary"
              style={{ originX: 0 }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: best > 0 ? Math.max(total / best, 0) : 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          )}
        </span>
        {report && (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="min-w-0 break-words">
              {money.count > 0
                ? `${plural(money.count, 'RDV encaissé', 'RDV encaissés')} · panier ${euro(money.avg)}`
                : 'Aucun RDV encaissé'}
            </span>
            {incomplete && <Pill tone="amber">incomplet</Pill>}
            {toClose > 0 && <Pill tone="amber">{toClose} à clôturer</Pill>}
            {pct != null && <Pill tone={pillTone(pct)}>{formatPercentChange(pct)} vs {monthName(older.key)}</Pill>}
          </span>
        )}
      </button>
      {canOpen && open && <MonthDetail entry={entry} id={detailId} salesState={salesState} scope={scope} incomplete={incomplete} />}
    </li>
  );
}

export default function PastMonths({ d }) {
  const [showAll, setShowAll] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const past = usePastMonths(d, { showAll });
  const { access, state } = d;
  const { entries, total } = past;
  const salesState = state.sales;
  const scope = access.canEvents ? 'tous canaux' : 'tous canaux, hors privatisations';
  const incomplete = Object.values(salesState.failed).some(Boolean);
  const best = entries.reduce((max, e) => Math.max(max, e.report?.total || 0), 0);
  // Le mois précédent en échec a déjà son bandeau en haut de la page (une seule alerte par source)
  const failedCount = entries.filter((e) => e.failed && e.key !== d.stats.clock.prevMonthKey).length;
  const hidden = total - entries.length;
  const truncated = state.truncated;
  const cut = [
    truncated.orders && `${CHANNEL_LIMITS.orders} commandes`,
    truncated.giftCards && `${CHANNEL_LIMITS.giftCards} cartes cadeau`,
    truncated.events && `${CHANNEL_LIMITS.events} privatisations`,
    truncated.reservations && `${CHANNEL_LIMITS.reservations} précommandes`,
  ].filter(Boolean);
  const noData = !past.listFailed && !past.listLoading && total === 0;

  return (
    <Section title="Mois passés" icon={History} hint={`CA de chaque mois · ${scope}, hors pourboires et hors part carte cadeau`}>
      {/* Les RDV du mois en cours illisibles : le bandeau du haut de la page le dit déjà */}
      {!state.appointments.failed && (failedCount > 0 || (past.listFailed && total === 0)) && (
        <InlineError
          what={failedCount > 1 ? 'certains mois passés' : 'les mois passés'}
          error={past.listError}
          onRetry={past.retry}
          retrying={past.retrying}
          className="mb-2"
        />
      )}
      {past.listLoading && total === 0 && <p className="text-xs text-muted-foreground">Chargement des mois passés…</p>}
      {noData && <p className="text-xs text-muted-foreground">Pas encore de mois passé : les chiffres de ce mois y arriveront le mois prochain.</p>}

      {entries.length > 0 && (
        <ul className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <MonthRow
              key={entry.key}
              entry={entry}
              older={entries[i + 1] || null}
              best={best}
              open={openKey === entry.key}
              onToggle={() => setOpenKey((k) => (k === entry.key ? null : entry.key))}
              salesState={salesState}
              scope={scope}
              incomplete={incomplete}
            />
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 min-h-11 w-full rounded-xl border border-border text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          Voir {hidden > 1 ? `les ${hidden} mois plus anciens` : 'le mois plus ancien'}
        </button>
      )}

      {entries.some((e) => e.truncated) && (
        <Note className="mt-2">Un mois dépasse le plafond de lecture des rendez-vous : ses chiffres peuvent être incomplets.</Note>
      )}
      {cut.length > 0 && (
        <Note className="mt-2">Seules les dernières ventes sont lues ({cut.join(', ')}) : les mois les plus anciens peuvent être incomplets.</Note>
      )}
    </Section>
  );
}
