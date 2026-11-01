/**
 * Tableau de bord : ventes hors rendez-vous (refonte du 1er nov. 2026), un panneau repliable par canal.
 *
 * Aucun chiffre déjà affiché ailleurs : le CA du mois de chaque canal est dans le bloc du mois (« Par
 * canal »), les ventes du jour dans « Aujourd'hui » et la caisse du soir, les tâches (à préparer, à
 * valider, devis à envoyer, à payer, prêtes à retirer) dans « À faire ».
 * Résumé toujours visible : un seul chiffre propre au canal (Boutique : commandes en cours ; Cartes
 * cadeau : reste à utiliser ; Privatisations : à venir ; Textile : le drop en cours). Détail à
 * l'ouverture : ce qui n'est nulle part ailleurs, et le lien vers la page du canal si ce compte peut
 * l'ouvrir. Fermés par défaut sur téléphone, ouverts sur ordinateur. La note « liste coupée » reste
 * visible panneau fermé (le résumé peut être incomplet).
 *
 * Affichage seulement : les règles de comptage sont dans `computeChannels` (src/lib/salesChannels.js).
 * Canal en échec : « — » partout (le bandeau d'erreur des ventes est en haut de la page) ; « … » au
 * premier chargement ; jamais « 0 € » à la place d'une donnée manquante.
 */
import React, { useId, useState } from 'react';
import { ChevronDown, Gift, PartyPopper, Shirt, ShoppingBag, Store } from 'lucide-react';
import { euro } from '@/lib/euro';
import { CHANNEL_COLORS, CHANNEL_LIMITS } from '@/lib/salesChannels';
import { Section, Money, Pill, GoLink, Row, Note } from '@/components/admin/dashboard/ui';

// Ouverts d'emblée à partir de la mise en page en deux colonnes (`lg`)
const WIDE_QUERY = '(min-width: 1024px)';
const isWide = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia(WIDE_QUERY).matches;

/** « 1 commande », « 2 commandes » (0 au singulier). */
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** « CB 120 € · espèces 40 € » (+ « · non renseigné 20 € » s'il y en a). */
const payHint = (by) => [
  `CB ${euro(by.cb)}`,
  `espèces ${euro(by.especes)}`,
  by.other > 0 ? `non renseigné ${euro(by.other)}` : '',
].filter(Boolean).join(' · ');

/** Liste lue au plafond : chiffres peut-être incomplets. */
function CutNote({ show, limit, what }) {
  if (!show) return null;
  return <Note>Seules les {limit} dernières {what} sont lues : chiffres peut-être incomplets.</Note>;
}

/** Chiffre du résumé : « En cours : 75 € » (« … » en chargement, « — » en échec). */
function SummaryAmount({ label, value, state }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-xs text-muted-foreground">{label} : </span>
      <Money value={value} loading={state === 'loading'} failed={state === 'failed'} className="text-base font-bold text-foreground" />
    </span>
  );
}

/** Résumé en toutes lettres (« Aucune commande en cours »). */
function SummaryText({ children }) {
  return <span className="min-w-0 break-words text-xs text-muted-foreground">{children}</span>;
}

/**
 * Panneau d'un canal : bouton de résumé (`aria-expanded`), détail en dessous.
 * `summary` : le chiffre du canal, déjà mis en forme ; `note` : toujours visible, sous le résumé.
 */
function ChannelPanel({ title, icon: Icon, color, summary, to, linkLabel, note = null, children }) {
  const [open, setOpen] = useState(isWide);
  const bodyId = useId();
  return (
    <div className="rounded-xl border border-border bg-secondary/30 min-w-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full min-h-11 items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} aria-hidden="true" />
          {/* Téléphone : nom puis chiffre, sur deux lignes dans tous les panneaux ; plus large : sur une ligne */}
          <span className="flex flex-1 min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
            <span className="min-w-0 break-words text-sm font-semibold text-foreground">{title}</span>
            {summary}
          </span>
          <ChevronDown
            className={`w-4 h-4 mt-0.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      {note && <div className="px-3 pb-2 -mt-1">{note}</div>}
      <div id={bodyId} hidden={!open} className="px-3 pb-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        <div className="border-t border-border/60 pt-1 divide-y divide-border/40">{children}</div>
        {to && (
          <div className="flex justify-end">
            <GoLink to={to}>{linkLabel}</GoLink>
          </div>
        )}
      </div>
    </div>
  );
}

/** Résumé du textile : le drop en cours (nom + Ouvert / Annoncé), ou « Aucun drop en cours ». */
function DropSummary({ drop, state }) {
  if (state !== 'ok') {
    return (
      <span className="whitespace-nowrap">
        <span className="text-xs text-muted-foreground">Drop en cours : </span>
        <span className="text-base font-bold text-foreground">{state === 'failed' ? '—' : '…'}</span>
      </span>
    );
  }
  if (!drop) return <SummaryText>Aucun drop en cours</SummaryText>;
  const live = drop.status === 'live';
  // Nom long : il passe à la ligne, la pastille suit le dernier mot
  return (
    <span className="min-w-0 break-words">
      <span className="text-xs text-muted-foreground">Drop en cours : </span>
      <span className="text-sm font-semibold text-foreground">{drop.name || 'sans nom'}</span>{' '}
      <Pill tone={live ? 'green' : 'blue'} className="align-text-bottom">{live ? 'Ouvert' : 'Annoncé'}</Pill>
    </span>
  );
}

export default function SalesChannels({ d }) {
  const { sales, access } = d;
  const failed = d.state.sales?.failed || {};
  const loading = d.state.sales?.loading || {};
  const truncated = d.state.truncated || {};

  const stateOf = (key) => (failed[key] ? 'failed' : loading[key] ? 'loading' : 'ok');
  // Valeur d'une ligne : « — » en échec, « … » en chargement
  const show = (key) => (fn) => (failed[key] ? '—' : loading[key] ? '…' : fn());

  const b = sales.boutique;
  const c = sales.cartes;
  const p = sales.privatisations;
  const t = sales.textile;
  const sb = stateOf('boutique');
  const sc = stateOf('cartes');
  const sp = stateOf('privatisations');
  const st = stateOf('textile');
  const vb = show('boutique');
  const vc = show('cartes');
  const vp = show('privatisations');
  const vt = show('textile');
  const drop = st === 'ok' ? t.currentDrop : null;

  return (
    <Section title="Ventes hors rendez-vous" icon={Store} hint="CA par canal : voir le bloc du mois · ouvrez un canal pour le détail">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        <ChannelPanel
          title="Boutique"
          icon={ShoppingBag}
          color={CHANNEL_COLORS.boutique}
          summary={sb === 'ok' && b.openCount === 0
            ? <SummaryText>Aucune commande en cours</SummaryText>
            : <SummaryAmount label="En cours" value={b.openAmount} state={sb} />}
          to={access.canOrders ? '/admin/orders' : null}
          linkLabel="Gérer les commandes"
          note={<CutNote show={truncated.orders} limit={CHANNEL_LIMITS.orders} what="commandes" />}
        >
          {(sb !== 'ok' || b.openCount > 0) && (
            <Row label="Commandes en cours" hint="pas encore retirées" value={vb(() => b.openCount)} />
          )}
          <Row label="Commandes retirées ce mois" value={vb(() => b.monthCount)} />
        </ChannelPanel>

        <ChannelPanel
          title="Cartes cadeau"
          icon={Gift}
          color={CHANNEL_COLORS.cartes}
          summary={<SummaryAmount label="Reste à utiliser" value={c.balance} state={sc} />}
          to={access.canGift ? '/admin/gift-cards' : null}
          linkLabel="Gérer les cartes cadeau"
          note={<CutNote show={truncated.giftCards} limit={CHANNEL_LIMITS.giftCards} what="cartes" />}
        >
          <Row
            label="Cartes vendues ce mois"
            hint={sc === 'ok' && c.month > 0 ? payHint(c.monthBy) : ''}
            value={vc(() => c.monthCount)}
          />
          {sc === 'ok' && c.outdatedBalance > 0 && (
            <Row label="Reste sur des cartes expirées" hint="hors reste à utiliser · à prolonger" value={euro(c.outdatedBalance)} tone="amber" />
          )}
        </ChannelPanel>

        {access.canEvents && (
          <ChannelPanel
            title="Privatisations"
            icon={PartyPopper}
            color={CHANNEL_COLORS.privatisations}
            summary={sp === 'ok' && p.upcomingCount === 0
              ? <SummaryText>Aucune privatisation à venir</SummaryText>
              : <SummaryAmount label="À venir" value={p.upcomingAmount} state={sp} />}
            to="/admin/events"
            linkLabel="Gérer les privatisations"
            note={<CutNote show={truncated.events} limit={CHANNEL_LIMITS.events} what="privatisations" />}
          >
            {(sp !== 'ok' || p.upcomingCount > 0) && (
              <Row label="Privatisations à venir" hint="devis acceptés ou payées" value={vp(() => p.upcomingCount)} />
            )}
            <Row label="Privatisations passées ce mois" hint="payées, celle du jour comprise" value={vp(() => p.monthCount)} />
            <Row
              label="Devis envoyés, réponse du client attendue"
              hint={sp === 'ok' ? `${p.quotedCount} devis` : ''}
              value={vp(() => euro(p.quotedAmount))}
            />
          </ChannelPanel>
        )}

        <ChannelPanel
          title="Textile"
          icon={Shirt}
          color={CHANNEL_COLORS.textile}
          summary={<DropSummary drop={drop} state={st} />}
          to={access.canTextile ? '/admin/textile?tab=reservations' : null}
          linkLabel="Gérer le textile"
          note={<CutNote show={truncated.reservations} limit={CHANNEL_LIMITS.reservations} what="précommandes" />}
        >
          {(st !== 'ok' || drop) && (
            <>
              <Row label="Réservations du drop" value={vt(() => Number(drop.reservations_count) || 0)} />
              <Row label="Abonnés à l'alerte du drop" value={vt(() => Number(drop.alerts_count) || 0)} />
            </>
          )}
          <Row label="Votes au Labo" value={vt(() => Number(t.labVotes) || 0)} />
        </ChannelPanel>
      </div>
    </Section>
  );
}
