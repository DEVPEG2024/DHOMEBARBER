import React, { useEffect, useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PartyPopper, CheckCircle, XCircle, Clock, Users, Calendar, Trash2, MessageSquare, Euro } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import LoadError, { isNetworkError } from '@/components/shared/LoadError';

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
  // Posé par le serveur quand le client supprime son compte (demande en attente ou devis envoyé)
  cancelled: { label: 'Annulée', color: 'bg-muted text-muted-foreground border-border', icon: XCircle },
};

export default function AdminEvents() {
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editPrice, setEditPrice] = useState('');
  // Refus en deux taps : le refus envoie tout de suite un email définitif au client
  const [confirmDeclineId, setConfirmDeclineId] = useState(null);
  const queryClient = useQueryClient();

  const { data, isError, error, refetch, isFetching } = useQuery({
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
    },
    onError: (err) => toast.error(saveErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Event.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminEvents'] });
      toast.success('Demande supprimée');
    },
    onError: (err) => toast.error(saveErrorMessage(err)),
  });

  const busy = updateMutation.isPending;

  const handleStatus = (event, status) => {
    if (busy) return;
    const messages = { confirmed: 'Événement confirmé', declined: 'Événement refusé', quoted: 'Devis envoyé au client' };
    setConfirmDeclineId(null);
    updateMutation.mutate({
      id: event.id,
      data: {
        status,
        admin_notes: editingId === event.id ? editNotes : event.admin_notes,
        price: editingId === event.id ? (parseFloat(editPrice) || null) : event.price,
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
    updateMutation.mutate({
      id: event.id,
      data: {
        admin_notes: editNotes,
        price: parseFloat(editPrice) || null,
      },
      successMsg: 'Notes sauvegardées',
    });
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
      {isError && !data ? (
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

          return (
            <motion.div key={event.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-xl p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{type.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold">{type.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {event.client_name}{event.client_email ? ` · ${event.client_email}` : ''}
                    </p>
                    {event.client_phone && (
                      <p className="text-[11px] text-muted-foreground">{event.client_phone}</p>
                    )}
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 ${status.color}`}>
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
                      onChange={e => setEditPrice(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Notes admin</label>
                    <textarea rows={2} placeholder="Notes internes..."
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" disabled={busy} onClick={() => handleSaveNotes(event)}>
                      Sauvegarder
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
                            <Euro className="w-3.5 h-3.5" /> {event.price}€
                          </p>
                        )}
                        {event.admin_notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{event.admin_notes}</p>
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
                    <p className="text-[10px] text-muted-foreground mt-0.5">Devis : {event.price}€</p>
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
                {/* Cancelled: annulée par la suppression du compte du client, rien à traiter */}
                {event.status === 'cancelled' && (
                  <div className="flex-1 py-2 rounded-lg bg-muted/50 border border-border text-center">
                    <p className="text-xs text-muted-foreground font-medium">
                      {event.client_email ? 'Demande annulée' : 'Annulée : le client a supprimé son compte'}
                    </p>
                  </div>
                )}
                {/* Modifier le devis (pending ou quoted) */}
                {!isEditing && (event.status === 'pending' || event.status === 'quoted') && (
                  <Button size="sm" variant="outline"
                    onClick={() => { setEditingId(event.id); setEditNotes(event.admin_notes || ''); setEditPrice(event.price || ''); }}>
                    <Euro className="w-3.5 h-3.5 mr-1" /> {event.price ? 'Modifier' : 'Devis'}
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5 px-3"
                  disabled={deleteMutation.isPending}
                  onClick={() => { if (window.confirm('Supprimer définitivement cette demande ?')) deleteMutation.mutate(event.id); }}>
                  <Trash2 className="w-3.5 h-3.5" /> Supprimer
                </Button>
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
