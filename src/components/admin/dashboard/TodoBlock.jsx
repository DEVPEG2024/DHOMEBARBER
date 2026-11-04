/**
 * Tableau de bord, bloc « À faire » (tout en haut de la page, refonte du 1er nov. 2026).
 *
 * Une ligne par chose que le salon doit régler, avec son nombre, son montant quand il y en a un et
 * un lien vers l'écran où on la règle. Seulement ce que ce compte peut traiter (l'écran qu'il peut
 * ouvrir) : jamais de ligne sans lien. Rendez-vous en chargement : un squelette de la hauteur du bloc
 * (la page ne saute plus) ; rien à faire une fois chargé : le bloc n'est pas rendu.
 *
 * Couleur du nombre : ambre = argent à encaisser ou à noter, bleu = à préparer ou à répondre,
 * vert = prêt, à remettre au client.
 * Une source en échec : ses lignes n'apparaissent pas (le bandeau d'erreur est en haut de la page).
 * Les devis qui attendent la réponse du client ne sont pas une tâche du salon : pas de ligne.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ListChecks } from 'lucide-react';
import { euro } from '@/lib/euro';
import { Section, Note, TONE_BOX } from '@/components/admin/dashboard/ui';

// 0 n'est jamais affiché : seul « plus d'un » prend le pluriel
const plural = (n, one, many) => (n > 1 ? many : one);

// « 28 oct. », « 1er nov. » (clé `yyyy-MM-dd`, lue en UTC : aucun décalage de fuseau)
const SHORT_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
function shortDay(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return '';
  const text = SHORT_DAY.format(new Date(Date.UTC(y, m - 1, d)));
  return d === 1 ? text.replace(/^1(?=\s)/, '1er') : text;
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Précision des RDV à clôturer des jours d'avant : « dont 2 des jours précédents (depuis le 28 oct.) ». */
function earlierNote(toClose, clock) {
  if (!toClose.earlier || !toClose.oldest) return '';
  const when = toClose.oldest === clock.yesterday
    ? "d'hier"
    : toClose.earlier === 1
      ? `du ${shortDay(toClose.oldest)}`
      : `des jours précédents (depuis le ${shortDay(toClose.oldest)})`;
  return toClose.today > 0 ? `dont ${toClose.earlier} ${when}` : capitalize(when);
}

/**
 * Lignes à afficher, dans l'ordre de la page (RDV, boutique, cartes, privatisations, textile, congés),
 * seulement celles dont ce compte peut ouvrir l'écran (`d.access`).
 */
function todoItems(d) {
  const { access, stats, sales, state } = d;
  const clock = stats.clock;
  const failed = state.sales.failed || {};
  const todo = sales.todo || {};
  const agendaDay = (date) => `/admin/agenda?view=day&date=${date}`;
  const items = [];

  // Rendez-vous : sans les RDV du mois, les comptes seraient faux (seulement ceux du mois précédent)
  if (access.canAgenda && !state.appointments.failed) {
    const tc = stats.toClose;
    if (tc.count > 0) {
      items.push({
        key: 'to-close', tone: 'amber', count: tc.count,
        label: plural(tc.count, 'prestation à clôturer', 'prestations à clôturer'),
        amount: tc.amount,
        detail: earlierNote(tc, clock),
        // Jours d'avant : l'agenda du plus ancien, pour les reprendre dans l'ordre
        to: agendaDay(tc.earlier > 0 && tc.oldest ? tc.oldest : clock.today),
      });
    }
    const mm = tc.missingMethod;
    if (mm.count > 0) {
      items.push({
        key: 'missing-method', tone: 'amber', count: mm.count,
        label: plural(mm.count, 'moyen de paiement à noter', 'moyens de paiement à noter'),
        amount: mm.amount,
        detail: plural(mm.count, 'Prestation validée sans moyen de paiement', 'Prestations validées sans moyen de paiement'),
        to: agendaDay(mm.oldest || clock.today),
      });
    }
  }

  if (access.canOrders && !failed.boutique) {
    const orders = '/admin/orders';
    if (todo.ordersToPrepare > 0) {
      items.push({
        key: 'orders-prepare', tone: 'blue', count: todo.ordersToPrepare,
        label: plural(todo.ordersToPrepare, 'commande à préparer', 'commandes à préparer'),
        to: orders,
      });
    }
    if (todo.ordersReady > 0) {
      items.push({
        key: 'orders-ready', tone: 'green', count: todo.ordersReady,
        label: plural(todo.ordersReady, 'commande prête à retirer', 'commandes prêtes à retirer'),
        to: orders,
      });
    }
  }

  if (access.canGift && !failed.cartes && todo.cardsToValidate > 0) {
    items.push({
      key: 'cards', tone: 'amber', count: todo.cardsToValidate,
      label: plural(todo.cardsToValidate, 'carte cadeau à valider', 'cartes cadeau à valider'),
      amount: sales.cartes?.pendingAmount,
      to: '/admin/gift-cards',
    });
  }

  // Abonnements à valider : admin seulement, lus seulement avec `features.subscriptions`
  if (d.pendingSubscriptions?.count > 0) {
    const n = d.pendingSubscriptions.count;
    items.push({
      key: 'subscriptions', tone: 'amber', count: n,
      label: plural(n, 'abonnement à valider', 'abonnements à valider'),
      amount: d.pendingSubscriptions.amount,
      to: '/admin/subscriptions',
    });
  }

  if (access.canEvents && !failed.privatisations) {
    const events = '/admin/events';
    if (todo.quotesToSend > 0) {
      items.push({
        key: 'quotes', tone: 'blue', count: todo.quotesToSend,
        label: 'devis à envoyer',
        detail: plural(todo.quotesToSend, 'Demande de privatisation', 'Demandes de privatisation'),
        to: events,
      });
    }
    if (todo.acceptedToCash > 0) {
      items.push({
        key: 'accepted', tone: 'amber', count: todo.acceptedToCash,
        label: plural(todo.acceptedToCash, 'devis accepté à encaisser', 'devis acceptés à encaisser'),
        amount: sales.privatisations?.acceptedAmount,
        detail: plural(todo.acceptedToCash, 'Privatisation', 'Privatisations'),
        to: events,
      });
    }
  }

  if (access.canTextile && !failed.textile) {
    const textile = '/admin/textile?tab=reservations';
    if (todo.textileToPay > 0) {
      items.push({
        key: 'textile-pay', tone: 'amber', count: todo.textileToPay,
        label: plural(todo.textileToPay, 'précommande textile à payer', 'précommandes textile à payer'),
        amount: sales.textile?.toPayAmount,
        detail: 'À régler au salon',
        to: textile,
      });
    }
    if (todo.textileReady > 0) {
      items.push({
        key: 'textile-ready', tone: 'green', count: todo.textileReady,
        label: plural(todo.textileReady, 'précommande textile prête à retirer', 'précommandes textile prêtes à retirer'),
        to: textile,
      });
    }
  }

  if (access.canLeave && d.pendingLeaves > 0) {
    items.push({
      key: 'leaves', tone: 'blue', count: d.pendingLeaves,
      label: plural(d.pendingLeaves, 'demande de congé à valider', 'demandes de congé à valider'),
      to: '/admin/leave',
    });
  }

  return items;
}

/** Une ligne : nombre, libellé (· montant), précision ; ligne entière cliquable. */
function TodoRow({ item }) {
  return (
    <Link
      to={item.to}
      className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span
        aria-hidden="true"
        className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg border px-1.5 text-xs font-bold tabular-nums ${TONE_BOX[item.tone] || TONE_BOX.muted}`}
      >
        {item.count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-foreground break-words">
          <span className="sr-only">{item.count} </span>
          <span className="font-semibold">{item.label}</span>
          {item.amount > 0 && (
            <span className="whitespace-nowrap font-semibold tabular-nums"> · {euro(item.amount)}</span>
          )}
        </span>
        {item.detail && <span className="block text-[11px] text-muted-foreground break-words">{item.detail}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** Rendez-vous en chargement : titre et deux lignes grises, à peu près la hauteur du bloc rempli. */
function TodoSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-hidden="true">
      <div className="mb-3 h-5 w-24 rounded-md bg-secondary/60 motion-safe:animate-pulse" />
      <div className="space-y-0.5">
        {[0, 1].map((i) => <div key={i} className="h-11 rounded-xl bg-secondary/60 motion-safe:animate-pulse" />)}
      </div>
    </div>
  );
}

export default function TodoBlock({ d }) {
  const { access } = d;
  // Compte qui ne peut ouvrir aucun de ces écrans : jamais de tâche, pas de squelette non plus
  const canAny = access.canAgenda || access.canOrders || access.canGift || access.canEvents || access.canTextile || access.canLeave;
  if (!canAny) return null;
  if (d.state.appointments.loading) return <TodoSkeleton />;
  const items = todoItems(d);
  if (items.length === 0 && !d.pendingSubscriptionsFailed) return null;

  return (
    <Section title="À faire" icon={ListChecks}>
      <ul className="-mx-2 space-y-0.5">
        {items.map((item) => (
          <li key={item.key}>
            <TodoRow item={item} />
          </li>
        ))}
      </ul>
      {/* Sans le mois précédent, des RDV terminés d'avant le 1er peuvent manquer à la liste */}
      {access.canAgenda && d.state.prevMonth?.failed && !d.state.appointments.failed && (
        <Note tone="muted" className="mt-2">RDV d&apos;avant le 1er non vérifiés</Note>
      )}
      {d.pendingSubscriptionsFailed && <Note tone="muted" className="mt-2">Abonnements à valider non vérifiés</Note>}
    </Section>
  );
}
