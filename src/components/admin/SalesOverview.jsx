/**
 * Tableau de bord : tous les canaux de vente, pas seulement les rendez-vous.
 *
 * Canaux et règle de comptage (demande du client, 9 sept. 2026) :
 *  - Prestations : CA des rendez-vous encaissés (calculé par Dashboard.jsx, reçu en props) ;
 *  - Boutique : commandes `delivered` (payées au retrait) ; en cours = pending / confirmed / ready ;
 *  - Cartes cadeau : cartes `validated` / `used` (l'argent entre à la validation, date `validated_at`) ;
 *    en attente = `pending` ; solde en circulation = reste des cartes validées ;
 *  - Privatisations : événements `accepted` / `confirmed` avec un prix, à la date de l'événement ;
 *    en attente = `pending` / `quoted` ;
 *  - Textile (précommandes) : réservations `paid` / `ready` / `picked_up` (prix × quantité) ;
 *    à payer = `reserved`, prêtes à retirer = `ready`.
 * Les dates « aujourd'hui / ce mois » suivent la date de création quand aucun horodatage
 * d'encaissement n'existe (commandes, textile) : c'est une approximation assumée.
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

function ChannelPanel({ title, icon: Icon, color, to, children, badge }) {
  const navigate = useNavigate();
  return (
    <div className="bg-card border border-border rounded-xl p-4">
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
 * @param {{ today: number, month: number, unpaidToday: number, unpaidMonth: number }} props.appointments
 *   CA des rendez-vous encaissés (prestations + produits vendus en RDV) et montants non encaissés
 */
export default function SalesOverview({ appointments }) {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const monthPrefix = today.slice(0, 7);

  const { data: orders = [] } = useQuery({
    queryKey: ['dashboard', 'orders'],
    queryFn: () => api.entities.Order.list('-created_date', 500),
  });
  const { data: giftCards = [] } = useQuery({
    queryKey: ['dashboard', 'giftCards'],
    queryFn: () => api.entities.GiftCard.list('-created_at', 500),
  });
  const { data: events = [] } = useQuery({
    queryKey: ['dashboard', 'events'],
    queryFn: () => api.entities.Event.list('-created_at', 300),
  });
  const { data: textile } = useQuery({ queryKey: TEXTILE_QUERY_KEY, queryFn: fetchTextileOverview });
  const { data: reservations = [] } = useQuery({
    queryKey: ['textileReservations', 'all'],
    queryFn: () => api.entities.TextileReservation.list('-created_at', 500),
  });

  const stats = useMemo(() => {
    const isToday = (v) => dayOf(v) === today;
    const isMonth = (v) => dayOf(v).startsWith(monthPrefix);

    // ─── Boutique ───
    const delivered = orders.filter((o) => o.status === 'delivered');
    const openOrders = orders.filter((o) => ORDER_OPEN.includes(o.status));
    const boutique = {
      today: sum(delivered.filter((o) => isToday(o.created_date)), (o) => o.total_price),
      month: sum(delivered.filter((o) => isMonth(o.created_date)), (o) => o.total_price),
      openCount: openOrders.length,
      openAmount: sum(openOrders, (o) => o.total_price),
      readyCount: orders.filter((o) => o.status === 'ready').length,
      monthCount: delivered.filter((o) => isMonth(o.created_date)).length,
    };

    // ─── Cartes cadeau ───
    const sold = giftCards.filter((c) => c.status === 'validated' || c.status === 'used');
    const soldDate = (c) => c.validated_at || c.created_at;
    const pendingCards = giftCards.filter((c) => c.status === 'pending');
    const cartes = {
      today: sum(sold.filter((c) => isToday(soldDate(c))), (c) => c.amount),
      month: sum(sold.filter((c) => isMonth(soldDate(c))), (c) => c.amount),
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

    const channels = [
      { key: 'prestations', label: 'Prestations & produits en RDV', today: appointments.today, month: appointments.month, color: CHANNEL_COLORS.prestations, icon: Scissors },
      { key: 'boutique', label: 'Boutique (commandes retirées)', today: boutique.today, month: boutique.month, color: CHANNEL_COLORS.boutique, icon: ShoppingBag },
      { key: 'cartes', label: 'Cartes cadeau validées', today: cartes.today, month: cartes.month, color: CHANNEL_COLORS.cartes, icon: Gift },
      { key: 'privatisations', label: 'Privatisations', today: privatisations.today, month: privatisations.month, color: CHANNEL_COLORS.privatisations, icon: PartyPopper },
      { key: 'textile', label: 'Textile (précommandes payées)', today: textileStats.today, month: textileStats.month, color: CHANNEL_COLORS.textile, icon: Shirt },
    ];
    const totalToday = sum(channels, (c) => c.today);
    const totalMonth = sum(channels, (c) => c.month);
    const pendingAmount = (appointments.unpaidMonth || 0) + boutique.openAmount + cartes.pendingAmount + textileStats.toPayAmount;
    const pendingCount = boutique.openCount + cartes.pendingCount + textileStats.toPayCount;

    return { boutique, cartes, privatisations, textile: textileStats, channels, totalToday, totalMonth, pendingAmount, pendingCount };
  }, [orders, giftCards, events, textile, reservations, appointments, today, monthPrefix]);

  const { boutique, cartes, privatisations, textile: tx, channels, totalToday, totalMonth, pendingAmount, pendingCount } = stats;
  const otherToday = totalToday - (appointments.today || 0);
  const otherMonth = totalMonth - (appointments.month || 0);
  const drop = tx.currentDrop;

  return (
    <>
      {/* CA global : tous les canaux */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-primary/30 rounded-xl p-4">
          <p className="text-[10px] text-primary font-medium uppercase tracking-wider">CA global aujourd'hui</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{eur(totalToday)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">tous canaux · dont {eur(otherToday)} hors RDV</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-primary/30 rounded-xl p-4">
          <p className="text-[10px] text-primary font-medium uppercase tracking-wider">CA global du mois</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{eur(totalMonth)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">tous canaux · dont {eur(otherMonth)} hors RDV</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">À encaisser</p>
          <p className="text-2xl font-bold mt-1 text-amber-400">{eur(pendingAmount)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            RDV non encaissés + {pendingCount} commande{pendingCount > 1 ? 's' : ''} / carte{pendingCount > 1 ? 's' : ''} / précommande{pendingCount > 1 ? 's' : ''} en attente
          </p>
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
            const pct = totalMonth > 0 ? Math.round((c.month / totalMonth) * 100) : 0;
            return (
              <div key={c.key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <c.icon className="w-3.5 h-3.5 shrink-0" style={{ color: c.color }} />
                    <span className="text-xs font-medium truncate">{c.label}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{pct}%</span>
                  </div>
                  <span className="text-xs font-bold shrink-0 ml-2">{eur(c.month)}<span className="text-[10px] text-muted-foreground font-normal"> · auj. {eur(c.today)}</span></span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full" style={{ background: c.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Un panneau par canal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChannelPanel title="Boutique" icon={ShoppingBag} color={CHANNEL_COLORS.boutique} to="/admin/orders"
          badge={boutique.openCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px]">{boutique.openCount} en cours</span>}>
          <Mini label="Commandes retirées auj." value={eur(boutique.today)} icon={Euro} color={CHANNEL_COLORS.boutique} />
          <Mini label="Commandes retirées ce mois" value={eur(boutique.month)} icon={Euro} color={CHANNEL_COLORS.boutique} hint={`${boutique.monthCount} commande${boutique.monthCount > 1 ? 's' : ''}`} />
          <Mini label="En cours (à encaisser)" value={eur(boutique.openAmount)} icon={Clock} color="#f59e0b" hint={`${boutique.openCount} commande${boutique.openCount > 1 ? 's' : ''}`} />
          <Mini label="Prêtes à retirer" value={boutique.readyCount} icon={PackageCheck} color="#4ade80" />
        </ChannelPanel>

        <ChannelPanel title="Cartes cadeau" icon={Gift} color={CHANNEL_COLORS.cartes} to="/admin/gift-cards"
          badge={cartes.pendingCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px]">{cartes.pendingCount} à valider</span>}>
          <Mini label="Validées aujourd'hui" value={eur(cartes.today)} icon={Euro} color={CHANNEL_COLORS.cartes} />
          <Mini label="Validées ce mois" value={eur(cartes.month)} icon={Euro} color={CHANNEL_COLORS.cartes} hint={`${cartes.monthCount} carte${cartes.monthCount > 1 ? 's' : ''}`} />
          <Mini label="En attente de paiement" value={eur(cartes.pendingAmount)} icon={Clock} color="#f59e0b" hint={`${cartes.pendingCount} carte${cartes.pendingCount > 1 ? 's' : ''}`} />
          <Mini label="Solde en circulation" value={eur(cartes.balance)} icon={Wallet} color="#60a5fa" hint="reste à consommer" />
        </ChannelPanel>

        <ChannelPanel title="Privatisations" icon={PartyPopper} color={CHANNEL_COLORS.privatisations} to="/admin/events"
          badge={privatisations.openCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px]">{privatisations.openCount} demande{privatisations.openCount > 1 ? 's' : ''}</span>}>
          <Mini label="Événements du mois" value={eur(privatisations.month)} icon={Euro} color={CHANNEL_COLORS.privatisations} hint={`${privatisations.monthCount} accepté${privatisations.monthCount > 1 ? 's' : ''} / confirmé${privatisations.monthCount > 1 ? 's' : ''}`} />
          <Mini label="À venir" value={eur(privatisations.upcomingAmount)} icon={Timer} color="#60a5fa" hint={`${privatisations.upcomingCount} événement${privatisations.upcomingCount > 1 ? 's' : ''}`} />
          <Mini label="Devis en attente" value={eur(privatisations.quotedAmount)} icon={Clock} color="#f59e0b" hint="réponse du client attendue" />
          <Mini label="Demandes à traiter" value={privatisations.openCount} icon={Users} color="#f59e0b" />
        </ChannelPanel>

        <ChannelPanel title="Textile · drops" icon={Shirt} color={CHANNEL_COLORS.textile} to="/admin/textile?tab=reservations"
          badge={tx.toPayCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px]">{tx.toPayCount} à payer</span>}>
          <Mini label="Précommandes payées auj." value={eur(tx.today)} icon={Euro} color={CHANNEL_COLORS.textile} />
          <Mini label="Précommandes payées ce mois" value={eur(tx.month)} icon={Euro} color={CHANNEL_COLORS.textile} hint={`total ${eur(tx.total)} · ${tx.paidCount} pièce${tx.paidCount > 1 ? 's' : ''}`} />
          <Mini label="À payer au salon" value={eur(tx.toPayAmount)} icon={Clock} color="#f59e0b" hint={`${tx.toPayCount} réservation${tx.toPayCount > 1 ? 's' : ''}`} />
          <Mini label="Prêtes à retirer" value={tx.readyCount} icon={PackageCheck} color="#a78bfa" hint={drop ? `${drop.name} · ${tx.currentDropPieces} pièce${tx.currentDropPieces > 1 ? 's' : ''}` : `${tx.labVotes} vote${tx.labVotes > 1 ? 's' : ''} au Labo`} />
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
