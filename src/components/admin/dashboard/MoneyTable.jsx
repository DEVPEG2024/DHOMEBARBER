/**
 * Tableau de bord, bloc « Encaissements » : un tableau « Aujourd'hui | Ce mois » (rendez-vous
 * encaissés, au jour du rendez-vous) à la place des 14 pavés de l'ancienne page, puis la « Caisse du
 * soir » : ce qui doit se retrouver ce soir (terminal CB, tiroir), encaissé aujourd'hui.
 * Tout vient de `d` (useDashboardData) : aucune lecture ici.
 */
import React from 'react';
import { Wallet } from 'lucide-react';
import { euro } from '@/lib/euro';
import { round2 } from '@/lib/revenue';
import { Section, Money, Note } from '@/components/admin/dashboard/ui';

/**
 * Lignes du tableau, par groupe (un `<tbody>` chacun). `optional` : masquée si nulle dans les deux
 * colonnes. `kind` : 'total' (gras), 'sub' (« dont »), 'muted' (gris), 'avg' (panier moyen).
 */
const GROUPS = [
  [
    { key: 'cb', label: 'CB' },
    { key: 'especes', label: 'Espèces' },
    { key: 'autre', label: 'Non renseigné', hint: 'moyen de paiement non noté', optional: true },
  ],
  [
    { key: 'revenue', label: 'Total rendez-vous', hint: 'hors pourboires', kind: 'total' },
    { key: 'products', label: 'dont produits vendus en RDV', hint: 'hors part carte cadeau', kind: 'sub' },
    { key: 'gift', label: 'Réglé par carte cadeau', hint: 'déjà compté à la vente de la carte', kind: 'muted', optional: true },
  ],
  [
    { key: 'tipsCB', label: 'Pourboires CB' },
    { key: 'tipsCash', label: 'Pourboires espèces' },
    { key: 'tipsOther', label: 'Pourboires non renseignés', optional: true },
  ],
  [
    { key: 'avg', label: 'Panier moyen', hint: 'CA hors carte cadeau ÷ RDV encaissés', kind: 'avg' },
  ],
];

const LABEL_TONE = { total: 'text-foreground font-semibold', sub: 'text-muted-foreground pl-3', muted: 'text-muted-foreground/80' };
const VALUE_TONE = { total: 'font-bold text-foreground', sub: 'text-muted-foreground', muted: 'text-muted-foreground' };

/** « 180 € · pourboires 10 € » : seulement les parts non nulles. */
function parts(list) {
  return list.filter(([, v]) => v > 0).map(([label, v]) => `${label} ${euro(v)}`).join(' · ');
}

export default function MoneyTable({ d }) {
  const { stats, state } = d;
  const appt = state.appointments;
  const failed = appt.failed;
  const loading = !failed && appt.loading;
  const ready = !failed && !loading;
  const today = stats.today.money;
  const month = stats.month.money;
  const cols = [today, month];

  const isVisible = (row) => !row.optional || !ready || cols.some((m) => (Number(m[row.key]) || 0) !== 0);
  const monthEmpty = ready && month.count === 0;

  return (
    <Section title="Encaissements" icon={Wallet} hint="Rendez-vous encaissés, au jour du rendez-vous">
      {/* Grand écran : la caisse du soir à droite du tableau */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:items-start lg:gap-5">
        <div className="min-w-0">
          {monthEmpty ? (
            <p className="text-xs text-muted-foreground">Aucun rendez-vous encaissé ce mois-ci.</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">Encaissements des rendez-vous, aujourd'hui et ce mois</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="w-full pb-1.5 text-left font-normal">
                    <span className="sr-only">Ligne</span>
                  </th>
                  <th scope="col" className="pb-1.5 pl-2 sm:pl-3 text-right text-[11px] font-semibold text-muted-foreground whitespace-nowrap">Aujourd'hui</th>
                  <th scope="col" className="pb-1.5 pl-2 sm:pl-3 text-right text-[11px] font-semibold text-muted-foreground whitespace-nowrap">Ce mois</th>
                </tr>
              </thead>
              {GROUPS.map((group, gi) => {
                const rows = group.filter(isVisible);
                if (!rows.length) return null;
                return (
                  <tbody key={gi} className={gi > 0 ? 'border-t border-border/70' : ''}>
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <th scope="row" className={`py-1.5 pr-2 text-left align-baseline font-normal break-words ${LABEL_TONE[row.kind] || 'text-muted-foreground'}`}>
                          {row.label}
                          {row.hint && <span className="block text-[11px] font-normal text-muted-foreground">{row.hint}</span>}
                        </th>
                        {cols.map((m, ci) => (
                          <td key={ci} className={`py-1.5 pl-2 sm:pl-3 text-right align-baseline whitespace-nowrap tabular-nums text-xs sm:text-sm ${VALUE_TONE[row.kind] || 'font-semibold text-foreground'}`}>
                            {row.kind === 'avg' && ready && !m.count ? (
                              <span className="text-[11px] font-normal text-muted-foreground">aucun RDV</span>
                            ) : (
                              <Money value={m[row.key]} loading={loading} failed={failed} />
                            )}
                            {row.kind === 'avg' && ready && m.count > 0 && (
                              <span className="block text-[11px] font-normal text-muted-foreground">
                                {m.count} RDV
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          )}
        </div>
        <CashBox d={d} />
      </div>
    </Section>
  );
}

/**
 * Caisse du soir : CB attendue (à comparer au ticket du terminal) et espèces attendues, encaissées
 * aujourd'hui (RDV, pourboires, cartes cadeau vendues) ; boutique et textile à part (moyen de
 * paiement non noté) ; pourboires CB à reverser à chaque barber (jour d'encaissement).
 */
function CashBox({ d }) {
  const { stats, sales, state, features } = d;
  const cash = stats.cash.money;
  const earlier = stats.cash.earlier;
  const ct = sales.cashToday;
  const appt = state.appointments;
  // Encaissements datés par le serveur : un RDV du mois précédent encaissé aujourd'hui (celui d'hier,
  // le 1er du mois) compte ce soir. Sans le mois précédent, il manquerait sans le dire : « … » / « — »
  const dated = !!(features.paidAt || stats.cash.paidAt);
  const prevFailed = dated && !!state.prevMonth?.failed;
  const prevLoading = dated && !!state.prevMonth?.loading;
  const cardsFailed = !!state.sales.failed?.cartes;
  const cardsLoading = !!state.sales.loading?.cartes;
  const failed = appt.failed || prevFailed || cardsFailed;
  const loading = !failed && (appt.loading || prevLoading || cardsLoading);
  const ready = !failed && !loading;

  const cbExpected = round2(cash.cb + cash.tipsCB + ct.cardsCB);
  const cashExpected = round2(cash.especes + cash.tipsCash + ct.cardsCash);
  const other = round2(cash.autre + cash.tipsOther + ct.cardsOther);

  const shopFailed = !!state.sales.failed?.boutique || !!state.sales.failed?.textile;
  const shopLoading = !shopFailed && (!!state.sales.loading?.boutique || !!state.sales.loading?.textile);
  const shop = round2(ct.boutique + ct.textile);

  const tipsToGive = ready ? stats.barbers.cash.filter((b) => b.money.tipsCB > 0) : [];
  const nothing = ready && cbExpected === 0 && cashExpected === 0 && other === 0 && !shopFailed && !shopLoading && shop === 0;

  return (
    <div className="mt-4 lg:mt-0 rounded-xl border border-border bg-secondary/40 p-3 min-w-0">
      <h3 className="text-xs font-semibold text-foreground">Caisse du soir</h3>
      <p className="text-[11px] text-muted-foreground">
        {dated
          ? 'Encaissements faits aujourd\'hui, quel que soit le jour du rendez-vous'
          : 'Rendez-vous du jour encaissés'}
      </p>

      {nothing ? (
        <p className="mt-2 text-xs text-muted-foreground">Rien encaissé aujourd'hui pour l'instant.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-foreground min-w-0">
                CB attendue
                <span className="block text-[11px] text-muted-foreground">à comparer au ticket du terminal</span>
              </span>
              <span className="text-base font-bold text-foreground shrink-0">
                <Money value={cbExpected} loading={loading} failed={failed} />
              </span>
            </div>
            {ready && cbExpected > 0 && (
              <p className="text-[11px] text-muted-foreground break-words">
                {parts([['RDV', cash.cb], ['pourboires', cash.tipsCB], ['cartes cadeau vendues', ct.cardsCB]])}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-foreground min-w-0">Espèces attendues</span>
              <span className="text-base font-bold text-foreground shrink-0">
                <Money value={cashExpected} loading={loading} failed={failed} />
              </span>
            </div>
            {ready && cashExpected > 0 && (
              <p className="text-[11px] text-muted-foreground break-words">
                {parts([['RDV', cash.especes], ['pourboires', cash.tipsCash], ['cartes cadeau vendues', ct.cardsCash]])}
              </p>
            )}
          </div>
          {/* RDV d'un jour d'avant encaissés aujourd'hui : CB et espèces attendues les comptent déjà */}
          {ready && earlier.count > 0 && earlier.amount > 0 && (
            <p className="text-[11px] text-muted-foreground break-words">
              dont <span className="tabular-nums">{euro(earlier.amount)}</span> de rendez-vous des jours précédents encaissés aujourd'hui
            </p>
          )}
        </div>
      )}

      {!nothing && (shopFailed || shopLoading || shop > 0) && (
        <p className="mt-2 text-[11px] text-muted-foreground break-words">
          Boutique retirée et précommandes textile (au jour de la commande) : <Money value={shop} loading={shopLoading} failed={shopFailed} className="font-semibold text-foreground" /> (moyen de paiement non noté)
        </p>
      )}
      {ready && other > 0 && (
        <Note className="mt-1">
          Non renseigné : <span className="tabular-nums">{euro(other)}</span>
          {' '}({parts([['RDV', cash.autre], ['pourboires', cash.tipsOther], ['cartes cadeau', ct.cardsOther]])})
        </Note>
      )}

      {tipsToGive.length > 0 && (
        <div className="mt-3 border-t border-border/70 pt-2">
          <h4 className="text-xs font-semibold text-foreground">Pourboires CB à reverser</h4>
          <ul className="mt-1 flex flex-col">
            {tipsToGive.map((b) => (
              <li key={b.id} className="flex items-baseline justify-between gap-3 py-1 min-w-0">
                <span className="flex items-center gap-2 min-w-0 text-xs text-foreground">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: b.color }} aria-hidden="true" />
                  <span className="min-w-0 break-words">{b.name}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums shrink-0">{euro(b.money.tipsCB)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
