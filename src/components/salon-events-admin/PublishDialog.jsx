/**
 * Confirmation de publication d'un brouillon : rappelle que publier rend l'événement visible
 * (des invités, ou de tous les clients s'il est ouvert) mais n'envoie aucune notification tant
 * qu'on n'a pas invité. « Publier et inviter » ouvre le panneau Invités dans la foulée.
 */
import React from 'react';
import { Rocket, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatEventDate } from '@/lib/salonEventsApi';

/**
 * @param {object} props
 * @param {object|null} props.event   Événement à publier ; null = fermé
 * @param {() => void} props.onClose
 * @param {(openInvites: boolean) => void} props.onConfirm
 * @param {boolean} props.pending
 */
export default function PublishDialog({ event, onClose, onConfirm, pending }) {
  if (!event) return null;
  const isPublic = event.visibility === 'public';
  return (
    <Dialog open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" /> Publier « {event.title} » ?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {event.starts_at ? <>{formatEventDate(event.starts_at, { withYear: true })} · </> : null}
            L'événement passe en <span className="text-green-400 font-semibold">Publié</span> :
            {isPublic
              ? " il apparaît chez tous les clients, qui peuvent s'inscrire librement."
              : ' seuls les clients invités le voient.'}
          </p>
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-300">
            Publier <span className="font-semibold">ne prévient personne</span> : aucun push, aucun email ne part tant que vous
            n'avez pas envoyé d'invitations depuis le panneau « Invités ».
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button variant="outline" className="sm:flex-1" onClick={onClose} disabled={pending}>Annuler</Button>
            <Button variant="outline" className="sm:flex-1 border-green-500/40 text-green-400 hover:bg-green-500/10"
              onClick={() => onConfirm(false)} disabled={pending}>
              <Rocket className="w-4 h-4 mr-1.5" /> {pending ? 'Publication…' : 'Publier'}
            </Button>
            <Button className="sm:flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => onConfirm(true)} disabled={pending}>
              <Users className="w-4 h-4 mr-1.5" /> Publier et inviter
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
