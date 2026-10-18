import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PartyPopper, CheckCircle, XCircle, Clock, Users, Calendar, Trash2, MessageSquare, Euro } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import LoadError, { isNetworkError } from '@/components/shared/LoadError';
import { formatPrice } from '@/components/services/serviceUtils';
import { parisDay } from '@/lib/slots';

// Doit rester aligné sur EVENT_TYPES de src/pages/Events.jsx (pas d'EVJF : clientèle masculine).
const EVENT_TYPES = {
  evjg: { label: 'EVJG', emoji: '🤵' },
  anniversaire: { label: 'Anniversaire', emoji: '🎂' },
  team_building: { label: 'Team Building', emoji: '🤝' },
  autre: { label: 'Autre', emoji: '🎉' },
};

const TIME_SLOTS = {
  morning: 'Matinée (9h-14h)',
  afternoon: 'Après-midi (14h-20h)',
  full_day: 'Journée complète (9h-20h)',
};

/** Message d'erreur d'un enregistrement : celui du serveur s'il en donne un, sinon un texte clair. */
function saveErrorMessage(err) {
  if (isNetworkError(err)) return 'Pas de connexion internet';
  const msg = err?.message;
  if (msg && !/^HTTP \d+/.test(msg)) return msg;
  return 'Impossible d\'enregistrer, réessayez';
}

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock },
  quoted: { label: 'Devis envoyé', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Euro },
  accepted: { label: 'Devis accepté', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle },
  confirmed: { label: 'Confirmé', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle },
  declined: { label: 'Refusé', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle },
  // Posé par le serveur quand le client supprime son compte (demande en attente ou devis envoyé),
  // ou par le salon qui annule une privatisation acceptée / confirmée
  cancelled: { label: 'Annulée', color: 'bg-muted text-muted-foreground border-border', icon: XCircle },
};

export default function AdminEvents() {
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  // Confirmation refusée : rendez-vous clients sur la fenêtre de la privatisation ({ id, message })
  const [conflict, setConflict] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editPrice, setEditPrice] = useState('');
  // Refus en deux taps : le refus envoie tout de suite un email définitif au client
  const [confirmDeclineId, setConfirmDeclineId] = useState(null);
  // Suppression en deux taps (plus de boîte native, en anglais sur iPhone)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Annulation d'une privatisation acceptée / confirmée : panneau avec motif facultatif
  const [cancelId, setCancelId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  // Nouveau prix sur un devis déjà envoyé : confirmation (le client reçoit un nouvel email)
  const [confirmRequoteId, setConfirmRequoteId] = useState(null);
  const queryClient = useQueryClient();

  const { data, isError, error, refetch, isFetching, isPending, fetchStatus } = useQuery({
    queryKey: ['adminEvents'],
    queryFn: () => api.entities.Event.list('-created_at', 200),
  });
  const events = data || [];

  // La confirmation du refus se désarme seule au bout de 4 s
  useEffect(() => {
    if (!confirmDeclineId) return undefined;
    const t = setTimeout(() => setConfirmDeclineId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmDeclineId]);

  // Le toast de succès n'apparaît qu'après la réponse du serveur ; en cas d'échec la saisie reste
  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }) => api.entities.Event.update(id, patch),
    onSuccess: (_, vars) => {
      toast.success(vars?.successMsg || 'Statut mis à jour');
      queryClient.invalidateQueries({ queryKey: ['adminEvents'] });
      setEditingId(null);
      setConflict(null);
    },
    onError: (err, vars) => {
      // RDV clients sur le créneau : bandeau avec « Confirmer quand même » (second tap), pas un toast
      if (err?.status === 409 && err?.data?.code === 'appointment_conflicts' && vars?.data?.status === 'confirmed') {
        setConflict({ id: vars.id, message: saveErrorMessage(err) });
        return;
      }
      toast.error(saveErrorMessage(err));
      // Devis accepté entre-temps (liste restée ouverte) : la liste est relue, l'éditeur fermé
      if (err?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['adminEvents'] });
        setEditingId(null);
        setConfirmRequoteId(null);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Event.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminEvents'] });
      setConfirmDeleteId(null);
      toast.success('Demande supprimée');
    },
    onError: (err) => toast.error(saveErrorMessage(err)),
  });

  const busy = updateMutation.isPending;

  const handleStatus = (event, status, force = false) => {
    if (busy) return;
    const messages = { confirmed: 'Événement confirmé', declined: 'Événement refusé', quoted: 'Devis envoyé au client' };
    setConfirmDeclineId(null);
    updateMutation.mutate({
      id: event.id,
      data: {
        status,
        admin_notes: editingId === event.id ? editNotes : event.admin_notes,
        price: editingId === event.id ? (parseFloat(editPrice) || null) : event.price,
        ...(force ? { force_conflicts: true } : {}),
      },
      successMsg: messages[status] || 'Statut mis à jour',
    });
  };

  const handleSendQuote = (event) => {
    const price = editingId === event.id ? parseFloat(editPrice) : event.price;
    if (!price || price <= 0) {
      toast.error('Ajoutez un prix avant d\'envoyer le devis');
      return;
    }
    handleStatus(event, 'quoted');
  };

  const handleSaveNotes = (event) => {
    if (busy) return;
    const price = parseFloat(String(editPrice).replace(',', '.')) || null;
    // Un devis envoyé garde un prix ; le changer renvoie le devis au client (après confirmation)
    if (event.status === 'quoted') {
      if (!price || price <= 0) {
        toast.error('Un devis envoyé doit garder un prix');
        return;
      }
      const changed = Number(price) !== Number(event.price);
      if (changed && confirmRequoteId !== event.id) {
        setConfirmRequoteId(event.id);
        return;
      }
      setConfirmRequoteId(null);
      updateMutation.mutate({
        id: event.id,
        data: { admin_notes: editNotes, price },
        successMsg: changed ? 'Nouveau devis envoyé au client' : 'Notes sauvegardées',
      });
      return;
    }
    // Prix modifiable seulement sur une demande en attente : un devis accepté garde son prix (une
    // liste rechargée sous un panneau ouvert ne le change plus en silence). Prix retapé dans
    // l'éditeur resté ouvert après l'acceptation : refusé, jamais ignoré sans le dire.
    if (event.status !== 'pending') {
      const before = event.price == null || event.price === '' ? null : Number(event.price);
      if (price !== before) {
        toast.error(`Le client a déjà accepté ce devis : son prix (${before == null ? '—' : formatPrice(before)}) ne peut plus changer.`);
        setEditPrice(event.price ?? '');
        return;
      }
    }
    updateMutation.mutate({
      id: event.id,
      data: event.status === 'pending' ? { admin_notes: editNotes, price } : { admin_notes: editNotes },
      successMsg: 'Notes sauvegardées',
    });
  };

  const handleCancelPrivatisation = (event) => {
    if (busy) return;
    updateMutation.mutate({
      id: event.id,
      data: { status: 'cancelled', cancellation_reason: cancelReason.trim().slice(0, 300) || null },
      successMsg: 'Privatisation annulée : le client est prévenu par email',
    }, { onSuccess: () => { setCancelId(null); setCancelReason(''); } });
  };

  const filtered = filter === 'all' ? events : events.filter(e => e.status === filter);
  const pendingCount = events.filter(e => e.status === 'pending').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Gestion</p>
          <h1 className="font-display text-2xl font-bold">Événements</h1>
        </div>
        {pendingCount > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1.5">
            <span className="text-xs font-bold text-yellow-400">{pendingCount} en attente</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
        {[
          { id: 'all', label: 'Toutes' },
          { id: 'pending', label: 'En attente' },
          { id: 'quoted', label: 'Devis envoyé' },
          { id: 'accepted', label: 'Acceptés' },
          { id: 'confirmed', label: 'Confirmées' },
          { id: 'declined', label: 'Refusées' },
          { id: 'cancelled', label: 'Annulées' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-full border transition-all ${
              filter === f.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/50'
            }`}>
            {f.label} {f.id === 'pending' && pendingCount > 0 ? `(${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {/* Liste en échec sans données : erreur à la place de la liste et de l'état vide */}
      {(isError && !data) || (isPending && fetchStatus === 'paused') ? (
        <LoadError what="les demandes de privatisation" error={error} onRetry={refetch} retrying={isFetching} />
      ) : (
      <>
      {/* Events list */}
      <div className="space-y-3">
        {filtered.map((event, i) => {
          const type = EVENT_TYPES[event.event_type] || EVENT_TYPES.autre;
          // Statut inconnu : affiché tel quel, jamais comme « En attente » (aucune action possible)
          const status = STATUS_CONFIG[event.status]
            || { label: event.status || 'Inconnu', color: 'bg-muted text-muted-foreground border-border', icon: Clock };
          const StatusIcon = status.icon;
          const isEditing = editingId === event.id;
          // Prix figé dès que le client a répondu (l'éditeur a pu rester ouvert pendant la relecture)
          const priceLocked = !(event.status === 'pending' || event.status === 'quoted');
          // Date passée (jour de Paris) : une privatisation confirmée a eu lieu, elle ne s'annule plus
          const isPast = !!event.date && String(event.date).slice(0, 10) < parisDay().key;

          return (
            <motion.div key={event.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-xl p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl">{type.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{type.label}</p>
                    <p className="text-[11px] text-muted-foreground break-all">
                      {event.client_name}{event.client_email ? ` · ${event.client_email}` : ''}
                    </p>
                    {event.client_phone && (
                      <p className="text-[11px] text-muted-foreground">{event.client_phone}</p>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 whitespace-nowrap text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 ${status.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {status.label}
                </span>
              </div>

              {/* Details */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {event.date && format(new Date(event.date + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {TIME_SLOTS[event.time_slot] || event.time_slot}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {event.guest_count || '?'} pers.
                </div>
              </div>

              {/* Client message */}
              {event.message && (
                <div className="p-2.5 rounded-lg bg-secondary/50 mb-3">
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" />
                    {event.message}
                  </p>
                </div>
              )}

              {/* Admin notes + price */}
              {isEditing ? (
                <div className="space-y-2 mb-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Devis (€)</label>
                    <input type="number" step="0.01" placeholder="Ex: 350"
                      value={editPrice}
                      disabled={priceLocked}
                      onChange={e => setEditPrice(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-60" />
                    {priceLocked && <p className="text-[10px] text-muted-foreground mt-1">Devis accepté : prix figé</p>}
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Message joint au devis (visible par le client)</label>
                    <textarea rows={2} placeholder="Ex. : boissons comprises, installation à 19h…"
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 whitespace-normal h-auto py-1.5" disabled={busy} onClick={() => handleSaveNotes(event)}>
                      {confirmRequoteId === event.id ? 'Enregistrer et renvoyer le devis (le client reçoit un email)' : 'Sauvegarder'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {(event.price || event.admin_notes) && (
                    <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10 mb-3 flex items-start justify-between">
                      <div>
                        {event.price && (
                          <p className="text-sm font-bold text-primary flex items-center gap-1">
                            <Euro className="w-3.5 h-3.5" /> {formatPrice(event.price)}
                          </p>
                        )}
                        {event.admin_notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 break-words">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Visible par le client : </span>
                            {event.admin_notes}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {/* Pending: envoyer devis ou refuser */}
                {event.status === 'pending' && (
                  <>
                    <Button size="sm" className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700"
                      disabled={busy}
                      onClick={() => handleSendQuote(event)}>
                      <Euro className="w-3.5 h-3.5" /> Envoyer le devis
                    </Button>
                    {confirmDeclineId === event.id ? (
                      <>
                        <Button size="sm"
                          className="flex-1 gap-1.5 bg-red-600 hover:bg-red-700 text-white whitespace-normal h-auto py-1.5"
                          disabled={busy}
                          onClick={() => handleStatus(event, 'declined')}>
                          <XCircle className="w-3.5 h-3.5 shrink-0" /> Confirmer le refus (le client reçoit un email)
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmDeclineId(null)}>
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5"
                        disabled={busy}
                        onClick={() => setConfirmDeclineId(event.id)}>
                        <XCircle className="w-3.5 h-3.5" /> Refuser
                      </Button>
                    )}
                  </>
                )}
                {/* Quoted: en attente de réponse client */}
                {event.status === 'quoted' && (
                  <div className="flex-1 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
                    <p className="text-xs text-blue-400 font-medium">En attente de réponse du client</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Devis : {formatPrice(event.price)}</p>
                  </div>
                )}
                {/* Accepted: client a accepté, confirmer après paiement */}
                {event.status === 'accepted' && (
                  <Button size="sm" className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700"
                    disabled={busy}
                    onClick={() => handleStatus(event, 'confirmed')}>
                    <CheckCircle className="w-3.5 h-3.5" /> Confirmer (payé au salon)
                  </Button>
                )}
                {/* Rendez-vous clients sur la fenêtre : confirmer quand même (second tap) ou annuler */}
                {event.status === 'accepted' && conflict?.id === event.id && (
                  <div role="alert" className="basis-full rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2 text-xs text-amber-200 min-w-0">
                    <p className="break-words">{conflict.message}</p>
                    {event.date && (
                      <Link to={`/admin/agenda?view=day&date=${String(event.date).slice(0, 10)}`} className="inline-block font-semibold text-primary underline underline-offset-2">
                        Voir l'agenda de ce jour
                      </Link>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => setConflict(null)}>
                        Annuler
                      </Button>
                      <Button size="sm" className="flex-1 bg-amber-500 text-black hover:bg-amber-400" disabled={busy}
                        onClick={() => handleStatus(event, 'confirmed', true)}>
                        Confirmer quand même
                      </Button>
                    </div>
                  </div>
                )}
                {/* Cancelled : annulée par le salon, ou par la suppression du compte du client */}
                {event.status === 'cancelled' && (
                  <div className="flex-1 py-2 px-2 rounded-lg bg-muted/50 border border-border text-center min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">
                      {!event.client_email ? 'Annulée : le client a supprimé son compte'
                        : event.cancelled_at ? `Annulée par le salon le ${format(new Date(event.cancelled_at), 'd MMM yyyy', { locale: fr })}` : 'Demande annulée'}
                    </p>
                    {event.cancellation_reason && <p className="text-[11px] text-muted-foreground mt-0.5 break-words">« {event.cancellation_reason} »</p>}
                  </div>
                )}
                {/* Acceptée ou confirmée : annulation (email + push au client), jamais de suppression */}
                {event.status === 'confirmed' && isPast && (
                  <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-[11px] font-medium text-muted-foreground">
                    Événement passé
                  </span>
                )}
                {(event.status === 'accepted' || (event.status === 'confirmed' && !isPast)) && (cancelId === event.id ? (
                  <div className="w-full rounded-lg border border-red-500/25 bg-red-500/5 p-2.5 space-y-2">
                    <p className="text-xs font-semibold text-red-400">Annuler cette privatisation ? Le client reçoit un email.</p>
                    <input type="text" value={cancelReason} maxLength={300} onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Motif (facultatif)" aria-label="Motif de l'annulation (facultatif)"
                      className="w-full min-w-0 bg-secondary border border-border rounded-lg px-2.5 py-2 text-sm" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => { setCancelId(null); setCancelReason(''); }}>
                        Garder
                      </Button>
                      <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700 text-white" disabled={busy} onClick={() => handleCancelPrivatisation(event)}>
                        {busy ? 'Annulation…' : 'Confirmer l\'annulation'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5"
                    disabled={busy} onClick={() => { setCancelId(event.id); setCancelReason(''); }}>
                    <XCircle className="w-3.5 h-3.5" /> Annuler la privatisation
                  </Button>
                ))}
                {/* Modifier le devis (pending ou quoted) */}
                {!isEditing && (event.status === 'pending' || event.status === 'quoted') && (
                  <Button size="sm" variant="outline"
                    onClick={() => { setEditingId(event.id); setEditNotes(event.admin_notes || ''); setEditPrice(event.price || ''); }}>
                    <Euro className="w-3.5 h-3.5 mr-1" /> {event.price ? 'Modifier' : 'Devis'}
                  </Button>
                )}
                {/* Suppression : seulement ce qui n'est pas une vente (en attente, devis, refusée, annulée) */}
                {!['accepted', 'confirmed'].includes(event.status) && (confirmDeleteId === event.id ? (
                  <>
                    <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700 text-white whitespace-normal h-auto py-1.5"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(event.id)}>
                      <Trash2 className="w-3.5 h-3.5 shrink-0" /> {deleteMutation.isPending ? 'Suppression…' : 'Supprimer définitivement'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={deleteMutation.isPending} onClick={() => setConfirmDeleteId(null)}>
                      Annuler
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline"
                    className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5 px-3"
                    disabled={deleteMutation.isPending}
                    onClick={() => setConfirmDeleteId(event.id)}>
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                  </Button>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {data && filtered.length === 0 && (
        <div className="text-center py-16">
          <PartyPopper className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucune demande d'événement</p>
        </div>
      )}
      </>
      )}
    </div>
  );
}
