/**
 * Onglet « Inviter » du panneau Invités : recherche dans les clients (`User.filter({ role: 'user' })`),
 * cases à cocher, « Tout sélectionner », interrupteur « Inviter tous les clients », message
 * d'accompagnement (≤ 300), envoi via POST /salon-events/:id/invite (staff, quota 20 / h / compte).
 *
 * Les clients déjà invités sont affichés mais non sélectionnables (le serveur les compterait en
 * « déjà invités »). Si la liste des clients n'est pas lisible avec le compte connecté (barber aux
 * colonnes limitées, ou 403), l'envoi à tous les clients reste possible : il ne dépend pas de la liste.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Send, Users, CheckSquare, Square, AlertTriangle, Mail, Bell, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { inviteToSalonEvent, formatEventDate } from '@/lib/salonEventsApi';
import { CLIENTS_KEY, INPUT_CLASS, INVITE_MESSAGE_MAX, invalidateSalonEvents, countLabel, Spinner } from './shared';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * @param {object} props
 * @param {object} props.event
 * @param {Array} props.invites        Invitations existantes (pour griser les clients déjà invités)
 * @param {() => void} [props.onSent]  Appelé après un envoi réussi (le panneau passe sur la liste)
 */
export default function InviteTab({ event, invites, onSent }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [inviteAll, setInviteAll] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);

  const clientsQ = useQuery({
    queryKey: CLIENTS_KEY,
    queryFn: () => api.entities.User.filter({ role: 'user' }, 'full_name', 500),
    staleTime: 60 * 1000,
  });

  const invitedSet = useMemo(
    () => new Set((Array.isArray(invites) ? invites : []).map((inv) => normalizeEmail(inv.user_email))),
    [invites],
  );

  const clients = useMemo(() => {
    const rows = Array.isArray(clientsQ.data) ? clientsQ.data : [];
    return rows
      .filter((u) => normalizeEmail(u.email))
      .map((u) => ({
        id: u.id || u.email,
        email: normalizeEmail(u.email),
        name: (u.full_name || '').trim(),
        invited: invitedSet.has(normalizeEmail(u.email)),
      }))
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'fr'));
  }, [clientsQ.data, invitedSet]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(s) || c.email.includes(s));
  }, [clients, search]);

  // Une invitation envoyée entre-temps retire le client de la sélection
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((email) => !invitedSet.has(email)));
      return next.size === prev.size ? prev : next;
    });
  }, [invitedSet]);

  const selectableVisible = filtered.filter((c) => !c.invited);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((c) => selected.has(c.email));
  const toggleOne = (email) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(email)) next.delete(email); else next.add(email);
    return next;
  });
  const toggleAllVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allVisibleSelected) selectableVisible.forEach((c) => next.delete(c.email));
    else selectableVisible.forEach((c) => next.add(c.email));
    return next;
  });

  const notInvitedTotal = clients.filter((c) => !c.invited).length;
  const isPublished = event.status === 'published';
  const count = inviteAll ? (clientsQ.data ? notInvitedTotal : null) : selected.size;

  const sendMutation = useMutation({
    mutationFn: () => inviteToSalonEvent(event.id, {
      emails: inviteAll ? [] : [...selected],
      all: inviteAll,
      message: message.trim(),
    }),
    onSuccess: (data) => {
      const r = data || {};
      setResult(r);
      invalidateSalonEvents(queryClient, event.id);
      setSelected(new Set());
      const invited = Number(r.invited) || 0;
      toast.success(invited > 0
        ? `${countLabel(invited, 'invitation envoyée', 'invitations envoyées')}`
        : 'Aucune nouvelle invitation : ces clients étaient déjà invités');
      if (invited > 0 && onSent) onSent();
    },
    onError: (err) => toast.error(err?.message || "Erreur lors de l'envoi des invitations"),
  });

  const canSend = isPublished && !sendMutation.isPending && (inviteAll || selected.size > 0);
  const sendLabel = sendMutation.isPending
    ? 'Envoi…'
    : inviteAll
      ? (count != null ? `Inviter tous les clients (${count})` : 'Inviter tous les clients')
      : `Envoyer ${selected.size > 0 ? countLabel(selected.size, 'invitation', 'invitations') : 'les invitations'}`;

  return (
    <div className="space-y-4">
      {!isPublished && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {event.status === 'draft'
              ? "L'événement est encore un brouillon : publiez-le avant d'envoyer des invitations."
              : `L'événement est ${event.status === 'cancelled' ? 'annulé' : 'terminé'} : plus d'invitations possibles.`}
          </span>
        </div>
      )}

      {/* Tous les clients */}
      <label className={`flex items-center justify-between gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${inviteAll ? 'border-primary/50 bg-primary/10' : 'border-border bg-secondary/40'}`}>
        <span className="flex items-start gap-3 min-w-0">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${inviteAll ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            <Users className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">Inviter tous les clients</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              Tous les comptes clients{clientsQ.data ? ` (${countLabel(notInvitedTotal, 'pas encore invité', 'pas encore invités')})` : ''}.
              Ceux déjà invités ne reçoivent rien de nouveau.
            </span>
          </span>
        </span>
        <Switch checked={inviteAll} onCheckedChange={(v) => { setInviteAll(v); setResult(null); }} />
      </label>

      {/* Sélection nominative */}
      <div className={inviteAll ? 'opacity-50 pointer-events-none' : ''} aria-disabled={inviteAll}>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">
            Choisir des clients{' '}
            {selected.size > 0 && <span className="text-primary font-semibold">· {selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>}
          </Label>
          {selectableVisible.length > 0 && (
            <button type="button" onClick={toggleAllVisible} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {allVisibleSelected ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
              {allVisibleSelected ? 'Tout désélectionner' : `Tout sélectionner${search.trim() ? ' (résultats)' : ''}`}
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {clientsQ.isLoading ? (
          <Spinner />
        ) : clientsQ.error ? (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              La liste des clients n'est pas accessible avec votre compte ({clientsQ.error.message}).
              Vous pouvez tout de même inviter tous les clients avec l'interrupteur ci-dessus.
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-center text-xs text-muted-foreground py-6">
            {clients.length === 0 ? 'Aucun compte client pour le moment.' : 'Aucun client ne correspond à cette recherche.'}
          </p>
        ) : (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {filtered.map((c) => {
              const checked = selected.has(c.email);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${c.invited ? 'opacity-60 cursor-default' : checked ? 'bg-primary/10' : 'hover:bg-secondary/60'}`}
                >
                  <Checkbox
                    checked={c.invited ? true : checked}
                    disabled={c.invited}
                    onCheckedChange={() => { if (!c.invited) toggleOne(c.email); }}
                    aria-label={c.name || c.email}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name || c.email}</span>
                    {c.name && <span className="block truncate text-[11px] text-muted-foreground">{c.email}</span>}
                  </span>
                  {c.invited && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-green-400 shrink-0">
                      <UserCheck className="w-3 h-3" /> Déjà invité
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
        {clients.length > 0 && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {countLabel(clients.length, 'client', 'clients')} · {countLabel(clients.length - notInvitedTotal, 'déjà invité', 'déjà invités')}
          </p>
        )}
      </div>

      {/* Message */}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Message d'accompagnement (facultatif)</Label>
          <span className={`text-[11px] ${message.length >= INVITE_MESSAGE_MAX ? 'text-amber-400' : 'text-muted-foreground'}`}>
            {message.length}/{INVITE_MESSAGE_MAX}
          </span>
        </div>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, INVITE_MESSAGE_MAX))}
          placeholder="Ex : On compte sur toi, viens accompagné si tu veux !"
          rows={3}
          maxLength={INVITE_MESSAGE_MAX}
          className={`${INPUT_CLASS} mt-1`}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Chaque invité reçoit un push « 🎉 Tu es invité : {event.title}{event.starts_at ? ` — ${formatEventDate(event.starts_at)}` : ''} » et un email avec le visuel, le lieu et un bouton « Répondre ».
        </p>
      </div>

      {result && (
        <div className="rounded-xl border border-green-500/25 bg-green-500/10 p-3 text-xs text-green-300 space-y-0.5">
          <p><span className="font-semibold">{countLabel(result.invited, 'invitation créée', 'invitations créées')}</span>
            {Number(result.already) > 0 && <span className="text-muted-foreground"> · {countLabel(result.already, 'déjà invité', 'déjà invités')}</span>}
          </p>
          <p className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Bell className="w-3 h-3" /> {countLabel(result.notified?.push, 'push', 'push')}</span>
            <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {countLabel(result.notified?.email, 'email', 'emails')}</span>
          </p>
        </div>
      )}

      <Button
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={!canSend}
        onClick={() => sendMutation.mutate()}
      >
        <Send className="w-4 h-4 mr-1.5" /> {sendLabel}
      </Button>
    </div>
  );
}
