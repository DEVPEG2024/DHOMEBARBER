/**
 * « Prévenir » : push manuel sur un drop, via POST /textile/drops/:id/notify (staff, quota
 * 6 / heure / compte). Trois audiences :
 *  - abonnés à l'alerte (push d'ouverture) ;
 *  - tous les clients (même push) ;
 *  - clients ayant payé leur précommande : « ta commande est prête, passe la récupérer » — leurs
 *    réservations payées passent à « prête » dans le même geste (le drop est une précommande :
 *    fabrication à la fin du drop, puis retrait au salon).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Bell, Users, PackageCheck, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notifyDrop } from '@/lib/textileApi';
import { invalidateTextile, INPUT_CLASS } from './shared';

const MESSAGE_MAX = 200;
const OPEN_BODY = "Réserve ta pièce avant qu'il ne soit trop tard";
const READY_BODY = 'Passe au salon récupérer ta pièce';
// Statuts qui valent « a payé sa précommande » (les pièces déjà prêtes reçoivent le rappel aussi)
const PAID_STATUSES = ['paid', 'ready'];

/**
 * @param {object} props
 * @param {object|null} props.drop  Drop ciblé ; null = fermé
 * @param {Array} props.reservations  Toutes les réservations (pour compter les clients ayant payé ce drop)
 * @param {() => void} props.onClose
 */
export default function NotifyDialog({ drop, reservations = [], onClose }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('subscribers');
  const [result, setResult] = useState(null);

  // Clients distincts ayant payé (ou dont la pièce est déjà prête) sur ce drop
  const paidClients = useMemo(() => {
    if (!drop) return 0;
    const emails = new Set();
    (reservations || []).forEach((r) => {
      if (String(r.drop_id) === String(drop.id) && PAID_STATUSES.includes(r.status) && r.client_email) {
        emails.add(String(r.client_email).toLowerCase());
      }
    });
    return emails.size;
  }, [drop, reservations]);

  useEffect(() => {
    if (drop) {
      setMessage('');
      setResult(null);
      // Drop terminé (ou déjà passé par l'ouverture) : l'usage naturel est d'annoncer les commandes prêtes
      setAudience(drop.status === 'ended' && paidClients > 0 ? 'paid' : 'subscribers');
    }
  }, [drop]);

  const sendMutation = useMutation({
    mutationFn: () => notifyDrop(drop.id, { audience, message: message.trim() }),
    onSuccess: (data) => {
      setResult(data || {});
      invalidateTextile(queryClient, 'textileDrops', 'textileReservations');
      const sent = Number(data?.sent) || 0;
      const marked = Number(data?.marked) || 0;
      toast.success(
        sent > 0
          ? `${sent} notification${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}${marked > 0 ? ` · ${marked} réservation${marked > 1 ? 's' : ''} passée${marked > 1 ? 's' : ''} à « Prête »` : ''}`
          : marked > 0
            ? `Aucun client joignable par push, ${marked} réservation${marked > 1 ? 's' : ''} passée${marked > 1 ? 's' : ''} à « Prête »`
            : 'Aucun destinataire joignable',
      );
    },
    onError: (err) => toast.error(err?.message || "Erreur lors de l'envoi"),
  });

  if (!drop) return null;
  const alertsCount = Number(drop.alerts_count) || 0;
  const isPaid = audience === 'paid';
  const title = isPaid
    ? `✨ Ta commande ${drop.name} est prête !`
    : drop.status === 'live' ? `🔥 Drop ${drop.name} ouvert !` : `📣 ${drop.name}`;
  const defaultBody = isPaid ? READY_BODY : OPEN_BODY;

  const AUDIENCES = [
    {
      key: 'paid', icon: PackageCheck, count: paidClients,
      label: 'Clients ayant payé leur précommande',
      hint: paidClients > 0
        ? `${paidClients} client${paidClients > 1 ? 's' : ''} : « ta commande est prête ». Leurs réservations payées passent à « Prête ».`
        : 'Aucune précommande payée sur ce drop pour l\'instant.',
    },
    {
      key: 'subscribers', icon: Bell, count: alertsCount,
      label: 'Abonnés à l\'alerte du drop',
      hint: alertsCount > 0
        ? `${alertsCount} abonné${alertsCount > 1 ? 's' : ''} : push d'ouverture / relance.`
        : 'Aucun abonné à l\'alerte de ce drop.',
    },
    {
      key: 'everyone', icon: Users, count: null,
      label: 'Tous les clients',
      hint: 'Tous les comptes clients, abonnés ou non (annonce large).',
    },
  ];
  const current = AUDIENCES.find((a) => a.key === audience) || AUDIENCES[1];
  const nothingToSend = current.count === 0;

  return (
    <Dialog open={!!drop} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Prévenir
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Audience */}
          <div>
            <Label className="text-xs">Destinataires</Label>
            <div className="mt-1.5 space-y-1.5">
              {AUDIENCES.map((a) => {
                const active = audience === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => { setAudience(a.key); setResult(null); }}
                    className={`w-full text-left rounded-xl border p-3 flex items-start gap-3 transition-colors ${
                      active ? 'border-primary/50 bg-primary/10' : 'border-border bg-secondary/40 hover:bg-secondary'
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                      <a.icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium flex items-center gap-2">
                        {a.label}
                        {a.count != null && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${a.count > 0 ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>{a.count}</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">{a.hint}</span>
                    </span>
                    {active && <Check className="w-4 h-4 text-primary shrink-0 mt-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Aperçu de la notification</p>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{message.trim() || defaultBody}</p>
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
              placeholder={defaultBody}
              rows={3}
              maxLength={MESSAGE_MAX}
              className={`${INPUT_CLASS} mt-1`}
            />
          </div>

          {result && (
            <div className="rounded-xl border border-green-500/25 bg-green-500/10 p-3 text-xs text-green-300">
              <span className="font-semibold">{Number(result.sent) || 0} envoyée{(Number(result.sent) || 0) > 1 ? 's' : ''}</span>
              {' '}sur {Number(result.recipients) || 0} destinataire{(Number(result.recipients) || 0) > 1 ? 's' : ''} joignable{(Number(result.recipients) || 0) > 1 ? 's' : ''}
              {result.audience === 'paid' && (
                <>
                  {' '}· {Number(result.clients) || 0} client{(Number(result.clients) || 0) > 1 ? 's' : ''} ayant payé
                  {' '}· {Number(result.marked) || 0} réservation{(Number(result.marked) || 0) > 1 ? 's' : ''} passée{(Number(result.marked) || 0) > 1 ? 's' : ''} à « Prête »
                </>
              )}
              {Number(result.failed) > 0 && <span className="text-amber-300"> · {result.failed} en échec</span>}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>{result ? 'Fermer' : 'Annuler'}</Button>
            <Button
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={sendMutation.isPending || nothingToSend}
              onClick={() => sendMutation.mutate()}
            >
              <Send className="w-4 h-4 mr-1.5" />
              {sendMutation.isPending ? 'Envoi…' : result ? 'Renvoyer' : 'Envoyer'}
            </Button>
          </div>
          {nothingToSend && (
            <p className="text-[11px] text-muted-foreground text-center">
              {isPaid
                ? 'Aucun client n\'a encore payé sa précommande sur ce drop (marquez les réservations « Payée » dans l\'onglet Réservations).'
                : 'Aucun abonné à l\'alerte : choisissez « Tous les clients » pour toucher tout le monde.'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
