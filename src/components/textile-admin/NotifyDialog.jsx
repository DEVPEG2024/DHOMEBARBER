/**
 * « Prévenir les abonnés » : push manuel vers les abonnés de l'alerte d'un drop (ou tous les
 * clients), via POST /textile/drops/:id/notify (staff, quota 6 / heure / compte).
 */
import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Bell, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notifyDrop } from '@/lib/textileApi';
import { invalidateTextile, INPUT_CLASS } from './shared';

const MESSAGE_MAX = 200;
const DEFAULT_BODY = "Réserve ta pièce avant qu'il ne soit trop tard";

/**
 * @param {object} props
 * @param {object|null} props.drop  Drop ciblé ; null = fermé
 * @param {() => void} props.onClose
 */
export default function NotifyDialog({ drop, onClose }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [everyone, setEveryone] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (drop) { setMessage(''); setEveryone(false); setResult(null); }
  }, [drop]);

  const sendMutation = useMutation({
    mutationFn: () => notifyDrop(drop.id, { everyone, message: message.trim() }),
    onSuccess: (data) => {
      setResult(data || {});
      invalidateTextile(queryClient, 'textileDrops');
      const sent = Number(data?.sent) || 0;
      toast.success(sent > 0 ? `${sent} notification${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}` : 'Aucun destinataire joignable');
    },
    onError: (err) => toast.error(err?.message || "Erreur lors de l'envoi"),
  });

  if (!drop) return null;
  const title = drop.status === 'live' ? `🔥 Drop ${drop.name} ouvert !` : `📣 ${drop.name}`;
  const alertsCount = Number(drop.alerts_count) || 0;

  return (
    <Dialog open={!!drop} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Prévenir les abonnés
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Aperçu de la notification</p>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{message.trim() || DEFAULT_BODY}</p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Message (facultatif)</Label>
              <span className={`text-[11px] ${message.length > MESSAGE_MAX ? 'text-red-400' : 'text-muted-foreground'}`}>
                {message.length}/{MESSAGE_MAX}
              </span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              placeholder={DEFAULT_BODY}
              rows={3}
              maxLength={MESSAGE_MAX}
              className={`${INPUT_CLASS} mt-1`}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-muted-foreground" /> Envoyer à tous les clients</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {everyone
                  ? 'Tous les comptes clients recevront le push, abonnés ou non.'
                  : `Seulement les ${alertsCount} abonné${alertsCount > 1 ? 's' : ''} à l'alerte de ce drop.`}
              </p>
            </div>
            <Switch checked={everyone} onCheckedChange={setEveryone} />
          </div>

          {result && (
            <div className="rounded-xl border border-green-500/25 bg-green-500/10 p-3 text-xs text-green-300">
              <span className="font-semibold">{Number(result.sent) || 0} envoyée{(Number(result.sent) || 0) > 1 ? 's' : ''}</span>
              {' '}sur {Number(result.recipients) || 0} destinataire{(Number(result.recipients) || 0) > 1 ? 's' : ''}
              {Number(result.failed) > 0 && <span className="text-amber-300"> · {result.failed} en échec</span>}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>{result ? 'Fermer' : 'Annuler'}</Button>
            <Button
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={sendMutation.isPending || (!everyone && alertsCount === 0)}
              onClick={() => sendMutation.mutate()}
            >
              <Send className="w-4 h-4 mr-1.5" />
              {sendMutation.isPending ? 'Envoi…' : result ? 'Renvoyer' : 'Envoyer'}
            </Button>
          </div>
          {!everyone && alertsCount === 0 && (
            <p className="text-[11px] text-muted-foreground text-center">Aucun abonné à l'alerte : activez « Envoyer à tous les clients » pour toucher tout le monde.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
