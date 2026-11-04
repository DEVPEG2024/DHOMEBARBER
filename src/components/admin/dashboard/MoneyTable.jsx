/**
 * Tableau de bord, bloc « Caisse du soir » : ce qui doit se retrouver ce soir (terminal CB, tiroir),
 * encaissé aujourd'hui. Le tableau « Aujourd'hui | Ce mois » des encaissements est dans « Chiffres »
 * (KeyFigures.jsx, 1er nov. 2026). Tout vient de `d` (useDashboardData) : aucune lecture ici.
 */
import React from 'react';
import { Wallet } from 'lucide-react';
import { euro } from '@/lib/euro';
import { round2 } from '@/lib/revenue';
import { Section, Money, Note } from '@/components/admin/dashboard/ui';
import { TipsByBarber } from '@/components/admin/dashboard/KeyFigures';

/** « 180 € · pourboires 10 € » : seulement les parts non nulles. */
function parts(list) {
  return list.filter(([, v]) => v > 0).map(([label, v]) => `${label} ${euro(v)}`).join(' · ');
}

export default function MoneyTable({ d }) {
  return (
    <Section title="Caisse du soir" icon={Wallet} hint="Ce qui doit se retrouver ce soir dans le terminal CB et le tiroir">
      <CashBox d={d} />
    </Section>
  );
}

/**
 * Caisse du soir : CB attendue (à comparer au ticket du terminal) et espèces attendues, encaissées
 * aujourd'hui (RDV, pourboires, cartes cadeau vendues) ; boutique et textile à part (moyen de
 * paiement non noté) ; pourboires de chaque barber en CB et en espèces (jour d'encaissement).
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

  const anyTip = ready && stats.barbers.cash.some((b) => b.money.tips > 0);
  const nothing = ready && cbExpected === 0 && cashExpected === 0 && other === 0 && !shopFailed && !shopLoading && shop === 0;

  return (
    <div className="min-w-0">
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

      {anyTip && (
        <div className="mt-3 border-t border-border/70 pt-2">
          <TipsByBarber title="Pourboires par barber" hint="CB à reverser ce soir" barbers={stats.barbers.cash} state={{ failed: false, loading: false }} />
        </div>
      )}
    </div>
  );
}
