/**
 * Tableau de bord : tous les canaux de vente, pas seulement les rendez-vous.
 *
 * Canaux et règle de comptage (demande du client, 9 sept. 2026) :
 *  - Prestations : CA des rendez-vous encaissés, hors pourboires (calculé par Dashboard.jsx, reçu en
 *    props). Dans le CA global, les rendez-vous réglés par carte cadeau sont retirés : cet argent est
 *    déjà compté à la validation de la carte (sinon il entrerait deux fois) ;
 *  - Boutique : commandes `delivered` (payées au retrait, date `delivered_at`, sinon `created_date`) ;
 *    en cours = pending / confirmed / ready ;
 *  - Cartes cadeau : cartes `validated` / `used` (l'argent entre à la validation, date `validated_at`) ;
 *    en attente = `pending` ; solde en circulation = reste des cartes validées ;
 *  - Privatisations : événements `accepted` / `confirmed` avec un prix, à la date de l'événement ;
 *    en attente = `pending` / `quoted` ;
 *  - Textile (précommandes) : réservations `paid` / `ready` / `picked_up` (prix × quantité) ;
 *    à payer = `reserved`, prêtes à retirer = `ready`.
 * Les dates « aujourd'hui / ce mois » suivent la date de création quand aucun horodatage
 * d'encaissement n'existe (anciennes commandes sans `delivered_at`, textile) : approximation assumée.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  Euro, Wallet, ShoppingBag, Gift, PartyPopper, Shirt, Clock, PackageCheck, Flame, ArrowRight, Scissors, Users, Timer,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { TEXTILE_QUERY_KEY, fetchTextileOverview, ACTIVE_RESERVATION_STATUSES } from '@/lib/textileApi';
import LoadError from '@/components/shared/LoadError';

const ORDER_OPEN = ['pending', 'confirmed', 'ready'];
const EVENT_OPEN = ['pending', 'quoted'];
const EVENT_WON = ['accepted', 'confirmed'];
const TEXTILE_PAID = ACTIVE_RESERVATION_STATUSES.filter((s) => s !== 'reserved'); // paid, ready, picked_up

const CHANNEL_COLORS = {
  prestations: '#3fcf8e',
  boutique: '#a78bfa',
  cartes: '#f59e0b',
  privatisations: '#f472b6',
  textile: '#60a5fa',
};

/** « 1 234,50€ » sans décimales inutiles. */
export function eur(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const str = Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
  return `${str}€`;
}

// 'YYYY-MM-DD' local d'une valeur ISO / Date / 'YYYY-MM-DD' ; '' si illisible
function dayOf(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd');
}

const sum = (rows, fn) => rows.reduce((s, r) => s + (Number(fn(r)) || 0), 0);

function Mini({ label, value, icon: Icon, color, hint }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 min-w-0">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-bold">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
      </div>
    </div>
  );
}

function ChannelPanel({ title, icon: Icon, color, to, children, badge, failed = false }) {
  const navigate = useNavigate();
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      {failed && <p className="text-[10px] text-amber-400 mb-2">Données indisponibles : chiffres masqués (—)</p>}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color }}>
          <Icon className="w-3.5 h-3.5" /> {title}
          {badge}
        </h3>
        <button type="button" onClick={() => navigate(to)}
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Gérer <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {{ today: number, month: number, giftToday?: number, giftMonth?: number, unpaidToday: number, unpaidMonth: number, unpaidCount: number, upcomingMonth: number, upcomingCount: number }} props.appointments
 *   CA des rendez-vous encaissés (prestations + produits vendus en RDV, hors pourboires), dont la part
 *   réglée par carte cadeau (`gift*`), et montants non encaissés
 */
export default function SalesOverview({ appointments }) {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const monthPrefix = today.slice(0, 7);

  const ordersQ = useQuery({
    queryKey: ['dashboard', 'orders'],
    queryFn: () => api.entities.Order.list('-created_date', 500),
  });
  const giftCardsQ = useQuery({
    queryKey: ['dashboard', 'giftCards'],
    queryFn: () => api.entities.GiftCard.list('-created_at', 500),
  });
  const eventsQ = useQuery({
    queryKey: ['dashboard', 'events'],
    queryFn: () => api.entities.Event.list('-created_at', 300),
  });
  const textileQ = useQuery({ queryKey: TEXTILE_QUERY_KEY, queryFn: fetchTextileOverview });
  const resQ = useQuery({
    queryKey: ['textileReservations', 'all'],
    queryFn: () => api.entities.TextileReservation.list('-created_at', 500),
  });
  const orders = ordersQ.data ?? [];
  const giftCards = giftCardsQ.data ?? [];
  const events = eventsQ.data ?? [];
  const textile = textileQ.data;
  const reservations = resQ.data ?? [];
  // Canal dont la source n'a pas pu se charger : jamais « 0 € », mais « — » et une alerte
  const failed = {
    boutique: ordersQ.isError && !ordersQ.data,
    cartes: giftCardsQ.isError && !giftCardsQ.data,
    privatisations: eventsQ.isError && !eventsQ.data,
    textile: (textileQ.isError && !textileQ.data) || (resQ.isError && !resQ.data),
  };
  const failedLabels = [
    failed.boutique && 'Boutique', failed.cartes && 'Cartes cadeau',
    failed.privatisations && 'Privatisations', failed.textile && 'Textile',
  ].filter(Boolean);
  const incomplete = failedLabels.length > 0;
  const retryFailed = () => Promise.all([ordersQ, giftCardsQ, eventsQ, textileQ, resQ]
    .filter((q) => q.isError).map((q) => q.refetch()));
  const money = (key, value) => (failed[key] ? '—' : eur(value));

  const stats = useMemo(() => {
    const isToday = (v) => dayOf(v) === today;
    const isMonth = (v) => dayOf(v).startsWith(monthPrefix);

    // ─── Boutique ───
    // Encaissée au retrait : datée par `delivered_at` (serveur v102), la création pour les anciennes
    const delivered = orders.filter((o) => o.status === 'delivered');
    const deliveredDate = (o) => o.delivered_at || o.created_date;
    const openOrders = orders.filter((o) => ORDER_OPEN.includes(o.status));
    const boutique = {
      today: sum(delivered.filter((o) => isToday(deliveredDate(o))), (o) => o.total_price),
      month: sum(delivered.filter((o) => isMonth(deliveredDate(o))), (o) => o.total_price),
      openCount: openOrders.length,
      openAmount: sum(openOrders, (o) => o.total_price),
      readyCount: orders.filter((o) => o.status === 'ready').length,
      monthCount: delivered.filter((o) => isMonth(deliveredDate(o))).length,
    };

    // ─── Cartes cadeau ───
    const sold = giftCards.filter((c) => c.status === 'validated' || c.status === 'used');
    const soldDate = (c) => c.validated_at || c.created_at;
    const pendingCards = giftCards.filter((c) => c.status === 'pending');
    // Moyen de paiement noté à la validation (cb / especes) ; les cartes d'avant : « non renseigné »
    const byPayment = (rows) => ({
      cb: sum(rows.filter((c) => c.payment_method === 'cb'), (c) => c.amount),
      especes: sum(rows.filter((c) => c.payment_method === 'especes'), (c) => c.amount),
      other: sum(rows.filter((c) => c.payment_method !== 'cb' && c.payment_method !== 'especes'), (c) => c.amount),
    });
    const cartes = {
      today: sum(sold.filter((c) => isToday(soldDate(c))), (c) => c.amount),
      month: sum(sold.filter((c) => isMonth(soldDate(c))), (c) => c.amount),
      todayBy: byPayment(sold.filter((c) => isToday(soldDate(c)))),
      monthBy: byPayment(sold.filter((c) => isMonth(soldDate(c)))),
      monthCount: sold.filter((c) => isMonth(soldDate(c))).length,
      pendingCount: pendingCards.length,
      pendingAmount: sum(pendingCards, (c) => c.amount),
      balance: sum(giftCards.filter((c) => c.status === 'validated'), (c) => (c.remaining_balance != null ? c.remaining_balance : c.amount)),
    };

    // ─── Privatisations ───
    const won = events.filter((e) => EVENT_WON.includes(e.status) && Number(e.price) > 0);
    const openEvents = events.filter((e) => EVENT_OPEN.includes(e.status));
    const upcoming = events.filter((e) => EVENT_WON.includes(e.status) && dayOf(e.date) >= today);
    const privatisations = {
      today: sum(won.filter((e) => isToday(e.date)), (e) => e.price),
      month: sum(won.filter((e) => isMonth(e.date)), (e) => e.price),
      monthCount: won.filter((e) => isMonth(e.date)).length,
      openCount: openEvents.length,
      quotedAmount: sum(events.filter((e) => e.status === 'quoted'), (e) => e.price),
      upcomingCount: upcoming.length,
      upcomingAmount: sum(upcoming, (e) => e.price),
    };

    // ─── Textile (précommandes) ───
    const amount = (r) => (Number(r.unit_price) || 0) * (Number(r.quantity) || 1);
    const paid = reservations.filter((r) => TEXTILE_PAID.includes(r.status));
    const toPay = reservations.filter((r) => r.status === 'reserved');
    const drops = Array.isArray(textile?.drops) ? textile.drops : [];
    const concepts = Array.isArray(textile?.concepts) ? textile.concepts : [];
    const currentDrop = drops.find((d) => d.status === 'live') || drops.find((d) => d.status === 'teasing') || null;
    const labVotes = concepts.filter((c) => !c.drop_id).reduce((s, c) => s + (Number(c.votes_count) || 0), 0);
    const textileStats = {
      today: sum(paid.filter((r) => isToday(r.created_at)), amount),
      month: sum(paid.filter((r) => isMonth(r.created_at)), amount),
      total: sum(paid, amount),
      paidCount: paid.length,
      toPayCount: toPay.length,
      toPayAmount: sum(toPay, amount),
      readyCount: reservations.filter((r) => r.status === 'ready').length,
      currentDrop,
      currentDropPieces: currentDrop ? concepts.filter((c) => String(c.drop_id) === String(currentDrop.id)).length : 0,
      labVotes,
    };

    // RDV réglés par carte cadeau : déjà comptés à la vente de la carte, retirés du CA global
    const giftToday = Number(appointments.giftToday) || 0;
    const giftMonth = Number(appointments.giftMonth) || 0;
    const rdvToday = Math.max(0, (Number(appointments.today) || 0) - giftToday);
    const rdvMonth = Math.max(0, (Number(appointments.month) || 0) - giftMonth);
    const channels = [
      { key: 'prestations', label: 'Prestations & produits en RDV', today: rdvToday, month: rdvMonth, color: CHANNEL_COLORS.prestations, icon: Scissors,
        note: giftMonth > 0 ? `hors ${eur(giftMonth)} réglés par carte cadeau ce mois (comptés à la vente de la carte)` : '' },
      { key: 'boutique', label: 'Boutique (commandes retirées)', today: boutique.today, month: boutique.month, color: CHANNEL_COLORS.boutique, icon: ShoppingBag },
      { key: 'cartes', label: 'Cartes cadeau validées', today: cartes.today, month: cartes.month, color: CHANNEL_COLORS.cartes, icon: Gift },
      { key: 'privatisations', label: 'Privatisations', today: privatisations.today, month: privatisations.month, color: CHANNEL_COLORS.privatisations, icon: PartyPopper },
      { key: 'textile', label: 'Textile (précommandes payées)', today: textileStats.today, month: textileStats.month, color: CHANNEL_COLORS.textile, icon: Shirt },
    ];
    const totalToday = sum(channels, (c) => c.today);
    const totalMonth = sum(channels, (c) => c.month);
    // À encaisser : rendez-vous du mois seulement (demande du salon, 13 oct. 2026) = terminés non
    // clôturés + à venir, chaque part détaillée sous le total. Commandes, cartes et précommandes en
    // attente restent dans leurs panneaux respectifs.
    const unclosedAmount = appointments.unpaidMonth || 0;
    const unclosedCount = appointments.unpaidCount || 0;
    const upcomingAmount = appointments.upcomingMonth || 0;
    const upcomingCount = appointments.upcomingCount || 0;
    const pending = { total: unclosedAmount + upcomingAmount, unclosedAmount, unclosedCount, upcomingAmount, upcomingCount };

    return {
      boutique, cartes, privatisations, textile: textileStats, channels, totalToday, totalMonth, pending,
      rdvToday, rdvMonth, giftToday, giftMonth,
    };
  }, [ordersQ.data, giftCardsQ.data, eventsQ.data, textileQ.data, resQ.data, appointments, today, monthPrefix]);

  const { boutique, cartes, privatisations, textile: tx, channels, totalToday, totalMonth, pending, giftToday, giftMonth } = stats;
  const otherToday = totalToday - stats.rdvToday;
  const otherMonth = totalMonth - stats.rdvMonth;
  const drop = tx.currentDrop;

  const payHint = (by) => `CB ${eur(by.cb)} · Espèces ${eur(by.especes)}${by.other > 0 ? ` · non renseigné ${eur(by.other)}` : ''}`;

  return (
    <>
      {incomplete && (
        <LoadError compact className="mb-4" what={`les ventes de : ${failedLabels.join(', ')}`} onRetry={retryFailed}
          retrying={[ordersQ, giftCardsQ, eventsQ, textileQ, resQ].some((q) => q.isFetching)} />
      )}
      {/* CA global : tous les canaux */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-primary/30 rounded-xl p-4">
          <p className="text-[10px] text-primary font-medium uppercase tracking-wider">CA global aujourd'hui</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{eur(totalToday)}{incomplete && <span className="text-xs font-medium text-amber-400"> (incomplet)</span>}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">tous canaux · dont {eur(otherToday)} hors RDV</p>
          {giftToday > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">RDV réglés par carte cadeau : {eur(giftToday)}, non recomptés</p>
          )}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-primary/30 rounded-xl p-4">
          <p className="text-[10px] text-primary font-medium uppercase tracking-wider">CA global du mois</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{eur(totalMonth)}{incomplete && <span className="text-xs font-medium text-amber-400"> (incomplet)</span>}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">tous canaux · dont {eur(otherMonth)} hors RDV</p>
          {giftMonth > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">RDV réglés par carte cadeau : {eur(giftMonth)}, non recomptés</p>
          )}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/admin/agenda?view=week')}
          className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/30 active:scale-[0.98] transition-all">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">À encaisser</p>
          <p className="text-2xl font-bold mt-1 text-amber-400">{eur(pending.total)}</p>
          <div className="mt-1 space-y-0.5 text-[10px] leading-tight">
            <p className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                {pending.unclosedCount} terminé{pending.unclosedCount > 1 ? 's' : ''} non clôturé{pending.unclosedCount > 1 ? 's' : ''}
              </span>
              <span className={`font-semibold tabular-nums shrink-0 ${pending.unclosedAmount > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>{eur(pending.unclosedAmount)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-muted-foreground">{pending.upcomingCount} à venir ce mois</span>
              <span className="font-semibold tabular-nums shrink-0 text-foreground">{eur(pending.upcomingAmount)}</span>
            </p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/admin/textile')}
          className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/30 active:scale-[0.98] transition-all">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Drop textile</p>
          {drop ? (
            <>
              <p className="text-base font-bold mt-1 text-foreground truncate">{drop.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {drop.status === 'live' ? '🔥 Ouvert' : '⏳ Annoncé'} · {Number(drop.reservations_count) || 0} réserv. · {Number(drop.alerts_count) || 0} abonné{(Number(drop.alerts_count) || 0) > 1 ? 's' : ''}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-bold mt-1 text-foreground">Aucun drop en cours</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{tx.labVotes} vote{tx.labVotes > 1 ? 's' : ''} au Labo ▸</p>
            </>
          )}
        </motion.div>
      </div>

      {/* Répartition du CA du mois par canal */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5" /> Répartition du CA du mois
        </h3>
        <div className="space-y-2.5">
          {channels.map((c) => {
            const missing = !!failed[c.key];
            const pct = totalMonth > 0 && !missing ? Math.round((c.month / totalMonth) * 100) : 0;
            return (
              <div key={c.key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <c.icon className="w-3.5 h-3.5 shrink-0" style={{ color: c.color }} />
                    <span className="text-xs font-medium truncate">{c.label}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{missing ? '—' : `${pct}%`}</span>
                  </div>
                  <span className="text-xs font-bold shrink-0 ml-2">{missing ? '—' : eur(c.month)}<span className="text-[10px] text-muted-foreground font-normal"> · auj. {missing ? '—' : eur(c.today)}</span></span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full" style={{ background: c.color }} />
                </div>
                {c.note && <p className="text-[10px] text-muted-foreground mt-1">{c.note}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Un panneau par canal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChannelPanel title="Boutique" icon={ShoppingBag} color={CHANNEL_COLORS.boutique} to="/admin/orders" failed={failed.boutique}
          badge={!failed.boutique && boutique.openCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px]">{boutique.openCount} en cours</span>}>
          <Mini label="Commandes retirées auj." value={money('boutique', boutique.today)} icon={Euro} color={CHANNEL_COLORS.boutique} />
          <Mini label="Commandes retirées ce mois" value={money('boutique', boutique.month)} icon={Euro} color={CHANNEL_COLORS.boutique} hint={failed.boutique ? '' : `${boutique.monthCount} commande${boutique.monthCount > 1 ? 's' : ''}`} />
          <Mini label="En cours (à encaisser)" value={money('boutique', boutique.openAmount)} icon={Clock} color="#f59e0b" hint={failed.boutique ? '' : `${boutique.openCount} commande${boutique.openCount > 1 ? 's' : ''}`} />
          <Mini label="Prêtes à retirer" value={failed.boutique ? '—' : boutique.readyCount} icon={PackageCheck} color="#4ade80" />
        </ChannelPanel>

        <ChannelPanel title="Cartes cadeau" icon={Gift} color={CHANNEL_COLORS.cartes} to="/admin/gift-cards" failed={failed.cartes}
          badge={!failed.cartes && cartes.pendingCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px]">{cartes.pendingCount} à valider</span>}>
          <Mini label="Validées aujourd'hui" value={money('cartes', cartes.today)} icon={Euro} color={CHANNEL_COLORS.cartes} hint={failed.cartes || !cartes.today ? '' : payHint(cartes.todayBy)} />
          <Mini label="Validées ce mois" value={money('cartes', cartes.month)} icon={Euro} color={CHANNEL_COLORS.cartes} hint={failed.cartes ? '' : `${cartes.monthCount} carte${cartes.monthCount > 1 ? 's' : ''}`} />
          <Mini label="En attente de paiement" value={money('cartes', cartes.pendingAmount)} icon={Clock} color="#f59e0b" hint={failed.cartes ? '' : `${cartes.pendingCount} carte${cartes.pendingCount > 1 ? 's' : ''}`} />
          <Mini label="Solde en circulation" value={money('cartes', cartes.balance)} icon={Wallet} color="#60a5fa" hint="reste à consommer" />
          {!failed.cartes && cartes.month > 0 && (
            <p className="col-span-2 text-[10px] text-muted-foreground px-1 break-words">Ventes du mois : {payHint(cartes.monthBy)}</p>
          )}
        </ChannelPanel>

        <ChannelPanel title="Privatisations" icon={PartyPopper} color={CHANNEL_COLORS.privatisations} to="/admin/events" failed={failed.privatisations}
          badge={!failed.privatisations && privatisations.openCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px]">{privatisations.openCount} demande{privatisations.openCount > 1 ? 's' : ''}</span>}>
          <Mini label="Événements du mois" value={money('privatisations', privatisations.month)} icon={Euro} color={CHANNEL_COLORS.privatisations} hint={failed.privatisations ? '' : `${privatisations.monthCount} accepté${privatisations.monthCount > 1 ? 's' : ''} / confirmé${privatisations.monthCount > 1 ? 's' : ''}`} />
          <Mini label="À venir" value={money('privatisations', privatisations.upcomingAmount)} icon={Timer} color="#60a5fa" hint={failed.privatisations ? '' : `${privatisations.upcomingCount} événement${privatisations.upcomingCount > 1 ? 's' : ''}`} />
          <Mini label="Devis en attente" value={money('privatisations', privatisations.quotedAmount)} icon={Clock} color="#f59e0b" hint="réponse du client attendue" />
          <Mini label="Demandes à traiter" value={failed.privatisations ? '—' : privatisations.openCount} icon={Users} color="#f59e0b" />
        </ChannelPanel>

        <ChannelPanel title="Textile · drops" icon={Shirt} color={CHANNEL_COLORS.textile} to="/admin/textile?tab=reservations" failed={failed.textile}
          badge={!failed.textile && tx.toPayCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px]">{tx.toPayCount} à payer</span>}>
          <Mini label="Précommandes payées auj." value={money('textile', tx.today)} icon={Euro} color={CHANNEL_COLORS.textile} />
          <Mini label="Précommandes payées ce mois" value={money('textile', tx.month)} icon={Euro} color={CHANNEL_COLORS.textile} hint={failed.textile ? '' : `total ${eur(tx.total)} · ${tx.paidCount} pièce${tx.paidCount > 1 ? 's' : ''}`} />
          <Mini label="À payer au salon" value={money('textile', tx.toPayAmount)} icon={Clock} color="#f59e0b" hint={failed.textile ? '' : `${tx.toPayCount} réservation${tx.toPayCount > 1 ? 's' : ''}`} />
          <Mini label="Prêtes à retirer" value={failed.textile ? '—' : tx.readyCount} icon={PackageCheck} color="#a78bfa" hint={drop ? `${drop.name} · ${tx.currentDropPieces} pièce${tx.currentDropPieces > 1 ? 's' : ''}` : `${tx.labVotes} vote${tx.labVotes > 1 ? 's' : ''} au Labo`} />
          {drop && drop.status === 'teasing' && (
            <div className="col-span-2 flex items-center gap-2 text-[11px] text-muted-foreground px-1">
              <Flame className="w-3.5 h-3.5 text-orange-400" /> Drop « {drop.name} » annoncé · {Number(drop.alerts_count) || 0} abonné{(Number(drop.alerts_count) || 0) > 1 ? 's' : ''} à l'alerte
            </div>
          )}
        </ChannelPanel>
      </div>
    </>
  );
}
