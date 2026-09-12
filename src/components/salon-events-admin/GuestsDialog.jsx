/**
 * Panneau « Invités » d'un événement (Dialog large) : onglet « Inviter » (sélection de clients ou tous,
 * message, envoi) et onglet « Liste » (invités, statuts, rappels, retrait, export CSV). La liste vient
 * de GET /salon-events/:id/guests (clé `guestsKey(id)`), partagée entre les deux onglets pour griser
 * les clients déjà invités.
 */
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, ListChecks, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchSalonEventGuests, formatEventDate } from '@/lib/salonEventsApi';
import { guestsKey, EVENT_STATUS_STYLES, eventStatusLabel, StatusPill, Spinner } from './shared';
import InviteTab from './InviteTab';
import GuestListTab from './GuestListTab';

const TABS = [
  { key: 'invite', label: 'Inviter', icon: UserPlus },
  { key: 'list', label: 'Liste', icon: ListChecks },
];

/**
 * @param {object} props
 * @param {object|null} props.event      Événement ciblé ; null = fermé
 * @param {'invite'|'list'} [props.initialTab]  Onglet à l'ouverture (défaut : « Liste » s'il y a des invités, sinon « Inviter »)
 * @param {boolean} props.isAdmin
 * @param {() => void} props.onClose
 */
export default function GuestsDialog({ event, initialTab, isAdmin, onClose }) {
  // null = onglet pas encore choisi (on attend la liste pour savoir s'il y a déjà des invités)
  const [tab, setTab] = useState(null);
  const eventId = event?.id;

  const guestsQ = useQuery({
    queryKey: guestsKey(eventId),
    queryFn: () => fetchSalonEventGuests(eventId),
    enabled: !!eventId,
  });
  const invites = Array.isArray(guestsQ.data?.invites) ? guestsQ.data.invites : [];
  const inviteCount = invites.length;
  const loaded = guestsQ.data !== undefined || !!guestsQ.error;
  const eventData = guestsQ.data?.event ? { ...event, ...guestsQ.data.event } : event;

  // Onglet d'ouverture, décidé une seule fois par ouverture : celui demandé, sinon « Liste » s'il y a
  // déjà des invités, « Inviter » sinon. Un refetch ultérieur (retour au premier plan, invalidation)
  // ne doit pas ramener l'utilisateur sur un autre onglet pendant qu'il compose ses invitations.
  useEffect(() => {
    if (!eventId) { setTab(null); return; }
    setTab((current) => {
      if (current) return current;
      if (initialTab) return initialTab;
      if (!loaded) return null;
      return inviteCount > 0 ? 'list' : 'invite';
    });
  }, [eventId, initialTab, loaded, inviteCount]);

  if (!event) return null;

  return (
    <Dialog open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display pr-6">
            <span className="block">Invités · {eventData.title}</span>
            <span className="mt-1 flex items-center gap-2 flex-wrap text-xs font-normal text-muted-foreground">
              {eventData.starts_at && (
                <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatEventDate(eventData.starts_at, { withYear: true })}</span>
              )}
              <StatusPill className={EVENT_STATUS_STYLES[eventData.status] || EVENT_STATUS_STYLES.draft}>{eventStatusLabel(eventData.status)}</StatusPill>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1.5 mb-1">
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = t.key === 'list' ? invites.length : null;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {count != null && count > 0 && (
                  <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${active ? 'bg-primary-foreground/20' : 'bg-card'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {tab === null ? (
          <Spinner />
        ) : tab === 'invite' ? (
          <InviteTab event={eventData} invites={invites} onSent={() => setTab('list')} />
        ) : (
          <GuestListTab event={eventData} invites={invites} isLoading={guestsQ.isLoading} error={guestsQ.error} isAdmin={isAdmin} />
        )}
      </DialogContent>
    </Dialog>
  );
}
