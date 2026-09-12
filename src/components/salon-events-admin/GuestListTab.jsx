/**
 * Onglet « Liste » du panneau Invités : compteurs (invités, viennent, ne viennent pas, sans réponse,
 * places prises), filtres par statut, lignes (nom, email, téléphone `tel:`, statut coloré, places,
 * dates), rappels push (« Relancer les sans réponse » = audience `pending`, « Rappel aux participants »
 * = audience `accepted`, message facultatif ≤ 200), retrait d'une invitation (admin, deux taps) et
 * export CSV (utils/exportCSV.js).
 */
import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone, Mail, Users, UserCheck, UserX, Clock, Armchair, BellRing, Download, Trash2, AlertTriangle, Bell,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { remindSalonEvent } from '@/lib/salonEventsApi';
import { exportToCSV } from '@/utils/exportCSV';
import {
  INVITE_STATUS_STYLES, inviteLabel, StatusPill, TwoTapButton, ActionButton, Spinner, EmptyState,
  formatParisDateTime, invalidateSalonEvents, summarizeInvites, countLabel, telHref, slugify, INPUT_CLASS, REMIND_MESSAGE_MAX,
} from './shared';

const STATUS_ICONS = { invited: Clock, accepted: UserCheck, declined: UserX };

function Counter({ icon: Icon, value, label, className = '' }) {
  return (
    <div className="bg-secondary/50 rounded-xl border border-border px-3 py-2">
      <p className={`text-[10px] uppercase tracking-wider inline-flex items-center gap-1 ${className || 'text-muted-foreground'}`}>
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.event
 * @param {Array} props.invites
 * @param {boolean} props.isLoading
 * @param {Error|null} props.error
 * @param {boolean} props.isAdmin   Retrait d'une invitation réservé à l'admin (DELETE entité)
 */
export default function GuestListTab({ event, invites, isLoading, error, isAdmin }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [remindMessage, setRemindMessage] = useState('');

  const rows = useMemo(() => {
    const list = Array.isArray(invites) ? [...invites] : [];
    const rank = { accepted: 0, invited: 1, declined: 2 };
    return list.sort((a, b) => {
      const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (r !== 0) return r;
      return String(a.user_name || a.user_email || '').localeCompare(String(b.user_name || b.user_email || ''), 'fr');
    });
  }, [invites]);
  const stats = useMemo(() => summarizeInvites(rows), [rows]);
  const filtered = useMemo(() => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);

  const isPublished = event.status === 'published';
  const capacity = Number(event.capacity) || 0;

  const remindMutation = useMutation({
    mutationFn: (audience) => remindSalonEvent(event.id, { audience, message: remindMessage.trim() }),
    onSuccess: (data, audience) => {
      invalidateSalonEvents(queryClient, event.id);
      const sent = Number(data?.sent) || 0;
      const recipients = Number(data?.recipients) || 0;
      const who = audience === 'pending' ? 'sans réponse' : 'participants';
      toast.success(sent > 0
        ? `${countLabel(sent, 'rappel envoyé', 'rappels envoyés')} aux ${who} (${recipients} joignable${recipients > 1 ? 's' : ''} par push)`
        : `Aucun ${who} joignable par push (notifications non activées)`);
      if (Number(data?.failed) > 0) toast.warning(`${data.failed} envoi${data.failed > 1 ? 's' : ''} en échec`);
    },
    onError: (err) => toast.error(err?.message || "Erreur lors de l'envoi du rappel"),
  });

  const removeMutation = useMutation({
    mutationFn: (inviteId) => api.entities.SalonEventInvite.delete(inviteId),
    onSuccess: () => {
      invalidateSalonEvents(queryClient, event.id);
      toast.success('Invitation retirée');
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors du retrait'),
  });

  const handleExport = () => {
    if (rows.length === 0) { toast.error('Aucun invité à exporter'); return; }
    exportToCSV(rows.map((r) => ({
      Nom: r.user_name || '',
      Email: r.user_email || '',
      Téléphone: r.phone || '',
      Statut: inviteLabel(r.status),
      Places: r.status === 'accepted' ? Math.max(1, Number(r.guests) || 1) : '',
      'Invité le': r.invited_at ? formatParisDateTime(r.invited_at) : '',
      'Répondu le': r.responded_at ? formatParisDateTime(r.responded_at) : '',
      'Notifié le': r.notified_at ? formatParisDateTime(r.notified_at) : '',
    })), `invites-${slugify(event.title)}`);
    toast.success('Export CSV téléchargé');
  };

  const filters = [
    { key: 'all', label: `Tous (${stats.total})` },
    { key: 'invited', label: `Sans réponse (${stats.pending})` },
    { key: 'accepted', label: `Viennent (${stats.accepted})` },
    { key: 'declined', label: `Ne viennent pas (${stats.declined})` },
  ];
  const busy = remindMutation.isPending || removeMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Compteurs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Counter icon={Users} value={stats.total} label="Invités" />
        <Counter icon={UserCheck} value={stats.accepted} label="Viennent" className="text-green-400" />
        <Counter icon={UserX} value={stats.declined} label="Ne viennent pas" className="text-red-400" />
        <Counter icon={Clock} value={stats.pending} label="Sans réponse" className="text-amber-400" />
        <Counter icon={Armchair} value={capacity ? `${stats.seats} / ${capacity}` : stats.seats} label="Places prises" className="text-primary" />
      </div>
      {capacity > 0 && (
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden -mt-2">
          <div className={`h-full rounded-full ${stats.seats >= capacity ? 'bg-red-500' : 'bg-primary'}`}
            style={{ width: `${Math.min(100, Math.round((stats.seats / capacity) * 100))}%` }} />
        </div>
      )}

      {/* Rappels */}
      <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs inline-flex items-center gap-1.5"><Bell className="w-3.5 h-3.5 text-primary" /> Rappels push</Label>
          <span className={`text-[11px] ${remindMessage.length >= REMIND_MESSAGE_MAX ? 'text-amber-400' : 'text-muted-foreground'}`}>
            {remindMessage.length}/{REMIND_MESSAGE_MAX}
          </span>
        </div>
        <Textarea
          value={remindMessage}
          onChange={(e) => setRemindMessage(e.target.value.slice(0, REMIND_MESSAGE_MAX))}
          placeholder={`Message facultatif, sinon « ⏰ Rappel : ${event.title} »`}
          rows={2}
          maxLength={REMIND_MESSAGE_MAX}
          className={INPUT_CLASS}
        />
        <div className="flex flex-wrap gap-1.5">
          <TwoTapButton icon={BellRing} label={`Relancer les sans réponse (${stats.pending})`} confirmLabel="Envoyer la relance ?"
            disabled={busy || !isPublished || stats.pending === 0}
            title={!isPublished ? "L'événement n'est pas publié" : undefined}
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            armedClassName="border-amber-500 bg-amber-500 text-black animate-pulse"
            onConfirm={() => remindMutation.mutate('pending')} />
          <TwoTapButton icon={BellRing} label={`Rappel aux participants (${stats.accepted})`} confirmLabel="Envoyer le rappel ?"
            disabled={busy || !isPublished || stats.accepted === 0}
            title={!isPublished ? "L'événement n'est pas publié" : undefined}
            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
            armedClassName="border-green-500 bg-green-500 text-white animate-pulse"
            onConfirm={() => remindMutation.mutate('accepted')} />
          <ActionButton icon={Download} label="Export CSV" onClick={handleExport} disabled={rows.length === 0} />
        </div>
        {event.reminder_sent_at && (
          <p className="text-[11px] text-muted-foreground">Dernier rappel envoyé le {formatParisDateTime(event.reminder_sent_at)}.</p>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Impossible de charger les invités : {error.message}</span>
        </div>
      ) : isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title={rows.length === 0 ? 'Aucun invité pour le moment' : 'Personne dans ce filtre'}
          hint={rows.length === 0 ? "Passez par l'onglet « Inviter » pour envoyer les premières invitations." : undefined} />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((inv) => {
            const Icon = STATUS_ICONS[inv.status] || Clock;
            const seats = inv.status === 'accepted' ? Math.max(1, Number(inv.guests) || 1) : 0;
            const removing = removeMutation.isPending && removeMutation.variables === inv.id;
            return (
              <div key={inv.id} className="bg-card border border-border rounded-xl px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{inv.user_name || inv.user_email || 'Client'}</p>
                      <StatusPill icon={Icon} className={INVITE_STATUS_STYLES[inv.status] || INVITE_STATUS_STYLES.invited}>
                        {inviteLabel(inv.status)}{seats > 1 ? ` · ${seats} places` : ''}
                      </StatusPill>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                      {inv.user_email && (
                        <a href={`mailto:${inv.user_email}`} className="inline-flex items-center gap-1 hover:text-foreground truncate max-w-full">
                          <Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{inv.user_email}</span>
                        </a>
                      )}
                      {inv.phone && (
                        <a href={telHref(inv.phone)} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Phone className="w-3 h-3 shrink-0" /> {inv.phone}
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {inv.invited_at && <>Invité le {formatParisDateTime(inv.invited_at)}</>}
                      {inv.responded_at && <> · a répondu le {formatParisDateTime(inv.responded_at)}</>}
                      {!inv.notified_at && inv.invited_at && <span className="text-amber-400/80"> · push / email non envoyés</span>}
                    </p>
                  </div>
                  {isAdmin && (
                    <TwoTapButton icon={Trash2} label="Retirer" confirmLabel="Retirer ?" disabled={busy}
                      title="Retire l'invitation (le client ne verra plus l'événement s'il est sur invitation)"
                      onConfirm={() => removeMutation.mutate(inv.id)} />
                  )}
                </div>
                {removing && <p className="text-[10px] text-muted-foreground mt-1">Retrait…</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
