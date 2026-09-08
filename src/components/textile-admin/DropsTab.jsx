/**
 * Onglet « Drops » : une carte par drop (couverture, statut, dates, abonnés, réservations,
 * pièces, CA réservé) et les actions admin : modifier, ouvrir maintenant, prévenir les
 * abonnés, terminer, supprimer.
 */
import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Plus, Pencil, Trash2, Bell, Rocket, Flag, Shirt, ClipboardList, CalendarClock, Sparkles, Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ACTIVE_RESERVATION_STATUSES } from '@/lib/textileApi';
import {
  DROP_STATUS_STYLES, dropStatusLabel, StatusPill, TwoTapButton, ActionButton, Spinner, EmptyState,
  formatParisDateTime, formatEuros, reservationTotal, invalidateTextile,
} from './shared';
import DropDialog from './DropDialog';
import NotifyDialog from './NotifyDialog';

/** Confirmation d'ouverture manuelle : explique le push automatique avant de basculer en « live ». */
function OpenNowDialog({ drop, onClose, onConfirm, pending }) {
  if (!drop) return null;
  const alreadySent = !!drop.alerts_sent_at;
  const alertsCount = Number(drop.alerts_count) || 0;
  return (
    <Dialog open={!!drop} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" /> Ouvrir « {drop.name} » maintenant ?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Le drop passe en <span className="text-green-400 font-semibold">Ouvert</span> : les clients peuvent réserver
            immédiatement, sans attendre la date d'ouverture programmée.
          </p>
          {alreadySent ? (
            <p className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
              Le push d'ouverture est déjà parti le {formatParisDateTime(drop.alerts_sent_at)} : il ne sera pas renvoyé.
              Utilisez « Prévenir » pour relancer, ou pour annoncer aux clients ayant payé que leur commande est prête.
            </p>
          ) : (
            <p className="rounded-lg border border-green-500/25 bg-green-500/10 p-3 text-xs text-green-300">
              Le push « 🔥 Drop {drop.name} ouvert ! » part automatiquement aux {alertsCount} abonné{alertsCount > 1 ? 's' : ''} de
              l'alerte dès la validation.
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={pending}>Annuler</Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={onConfirm} disabled={pending}>
              <Rocket className="w-4 h-4 mr-1.5" /> {pending ? 'Ouverture…' : 'Ouvrir le drop'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon: Icon, value, label, className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span><span className="font-semibold text-foreground">{value}</span> {label}</span>
    </div>
  );
}

/**
 * @param {object} props
 * @param {Array} props.drops           Drops fusionnés (entité + agrégats de l'overview)
 * @param {Array} props.concepts        Toutes les pièces (pour compter celles de chaque drop)
 * @param {Array} props.reservations    Toutes les réservations (CA réservé par drop)
 * @param {boolean} props.isAdmin
 * @param {boolean} props.isLoading
 */
export default function DropsTab({ drops, concepts, reservations, isAdmin, isLoading }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDrop, setEditingDrop] = useState(null);
  const [notifyTarget, setNotifyTarget] = useState(null);
  const [openTarget, setOpenTarget] = useState(null);

  const perDrop = useMemo(() => {
    const map = new Map();
    const get = (id) => {
      if (!map.has(id)) map.set(id, { pieces: 0, revenue: 0 });
      return map.get(id);
    };
    (concepts || []).forEach((c) => { if (c.drop_id) get(c.drop_id).pieces += 1; });
    (reservations || []).forEach((r) => {
      if (r.drop_id && ACTIVE_RESERVATION_STATUSES.includes(r.status)) get(r.drop_id).revenue += reservationTotal(r);
    });
    return map;
  }, [concepts, reservations]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.entities.TextileDrop.update(id, { status }),
    onSuccess: (_data, { status }) => {
      invalidateTextile(queryClient, 'textileDrops');
      setOpenTarget(null);
      toast.success(status === 'live' ? 'Drop ouvert : les réservations sont possibles' : 'Drop terminé');
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors du changement de statut'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.TextileDrop.delete(id),
    onSuccess: () => {
      invalidateTextile(queryClient);
      toast.success('Drop supprimé (ses pièces rejoignent le Labo)');
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la suppression'),
  });

  const openNew = () => { setEditingDrop(null); setDialogOpen(true); };
  const openEdit = (drop) => { setEditingDrop(drop); setDialogOpen(true); };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs text-muted-foreground">
          {drops.length} drop{drops.length > 1 ? 's' : ''} · les brouillons restent invisibles des clients
        </p>
        {isAdmin && (
          <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shrink-0">
            <Plus className="w-4 h-4 mr-1.5" /> Nouveau drop
          </Button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : drops.length === 0 ? (
        <EmptyState icon={Sparkles} title="Aucun drop pour le moment"
          hint={isAdmin ? 'Créez un drop, ajoutez-lui des pièces, puis annoncez-le.' : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {drops.map((drop, i) => {
            const extra = perDrop.get(drop.id) || { pieces: 0, revenue: 0 };
            const canOpen = drop.status === 'draft' || drop.status === 'teasing';
            const canEnd = drop.status === 'live';
            const busy = statusMutation.isPending || deleteMutation.isPending;
            return (
              <motion.div
                key={drop.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
                className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col"
              >
                <div className="relative aspect-[16/7] bg-secondary">
                  {drop.cover_image_url ? (
                    <img src={drop.cover_image_url} alt={drop.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <StatusPill className={`${DROP_STATUS_STYLES[drop.status] || DROP_STATUS_STYLES.draft} backdrop-blur-sm`}>
                      {dropStatusLabel(drop.status)}
                    </StatusPill>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div>
                    <h3 className="text-base font-semibold leading-tight">{drop.name}</h3>
                    {drop.tagline && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{drop.tagline}</p>}
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                      <span>Ouverture : <span className="text-foreground">{drop.starts_at ? formatParisDateTime(drop.starts_at) : 'non programmée'}</span></span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Flag className="w-3.5 h-3.5 shrink-0" />
                      <span>Fin : <span className="text-foreground">{drop.ends_at ? formatParisDateTime(drop.ends_at) : 'non programmée'}</span></span>
                    </p>
                    {drop.alerts_sent_at && (
                      <p className="flex items-center gap-1.5 text-green-400/80">
                        <Bell className="w-3.5 h-3.5 shrink-0" />
                        <span>Push d'ouverture envoyé le {formatParisDateTime(drop.alerts_sent_at)}</span>
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-secondary/50 p-3">
                    <Stat icon={Bell} value={Number(drop.alerts_count) || 0} label="abonnés" />
                    <Stat icon={Shirt} value={extra.pieces} label={extra.pieces > 1 ? 'pièces' : 'pièce'} />
                    <Stat icon={ClipboardList} value={Number(drop.reservations_count) || 0} label="réserv." />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-primary">{formatEuros(extra.revenue)}</span> réservé
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                      <ActionButton icon={Pencil} label="Modifier" onClick={() => openEdit(drop)} disabled={busy} />
                      {canOpen && (
                        <ActionButton icon={Rocket} label="Ouvrir maintenant" onClick={() => setOpenTarget(drop)} disabled={busy}
                          className="border-green-500/30 text-green-400 hover:bg-green-500/10" />
                      )}
                      <ActionButton icon={Bell} label="Prévenir" onClick={() => setNotifyTarget(drop)} disabled={busy}
                        className="border-primary/30 text-primary hover:bg-primary/10" />
                      {canEnd && (
                        <TwoTapButton icon={Flag} label="Terminer" confirmLabel="Terminer ce drop ?" disabled={busy}
                          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                          armedClassName="border-blue-500 bg-blue-500 text-white animate-pulse"
                          onConfirm={() => statusMutation.mutate({ id: drop.id, status: 'ended' })} />
                      )}
                      <TwoTapButton icon={Trash2} label="Supprimer" confirmLabel="Supprimer ?" disabled={busy}
                        onConfirm={() => deleteMutation.mutate(drop.id)} />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <>
          <DropDialog open={dialogOpen} onOpenChange={setDialogOpen} drop={editingDrop} />
          <NotifyDialog drop={notifyTarget} reservations={reservations} onClose={() => setNotifyTarget(null)} />
          <OpenNowDialog
            drop={openTarget}
            onClose={() => setOpenTarget(null)}
            pending={statusMutation.isPending}
            onConfirm={() => openTarget && statusMutation.mutate({ id: openTarget.id, status: 'live' })}
          />
        </>
      )}
    </div>
  );
}
