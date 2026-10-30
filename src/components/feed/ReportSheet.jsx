import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import FeedSheet from '@/components/feed/FeedSheet';
import { feedErrorText } from '@/lib/feed/useFeed';

const REPORT_REASONS = ['Contenu inapproprié', 'Harcèlement ou propos haineux', 'Spam ou publicité', 'Autre'];

/**
 * Formulaire de signalement d'une publication ou d'un commentaire (motif obligatoire, précisions
 * facultatives) : `PostReport.create`, l'auteur du signalement est lu sur le jeton par le serveur.
 * L'admin le traite dans le panneau des signalements (ModerationPanel).
 *
 * @param {object} props
 * @param {object} props.target   `{ type: 'post'|'comment', id, content, … }` (comme PostMenu)
 * @param {object} props.user
 * @param {'base'|'top'} [props.layer]
 * @param {() => void} props.onClose
 */
export default function ReportSheet({ target, user, layer = 'base', onClose }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const isComment = target.type === 'comment';

  const submit = async () => {
    if (!reason || sending) return;
    setSending(true);
    try {
      await api.entities.PostReport.create({
        post_id: isComment ? null : target.id,
        comment_id: isComment ? target.id : null,
        reporter_name: user?.full_name || user?.email,
        reason,
        details: details.trim() || null,
      });
      toast.success('Signalement envoyé. Notre équipe le traite sous 24 h.');
      setSending(false);
      onClose();
    } catch (err) {
      toast.error(feedErrorText(err, "Erreur lors de l'envoi du signalement"));
      setSending(false);
    }
  };

  return (
    <FeedSheet
      title="Signaler"
      onClose={onClose}
      layer={layer}
      closeDisabled={sending}
      footer={(
        <Button onClick={submit} disabled={!reason || sending} className="w-full bg-primary text-primary-foreground rounded-full">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Envoi en cours" /> : 'Envoyer le signalement'}
        </Button>
      )}
    >
      <p className="text-xs text-muted-foreground mb-3">
        Pourquoi signales-tu {isComment ? 'ce commentaire' : 'cette publication'} ? Notre équipe examine chaque signalement sous 24 h.
      </p>
      {target.content && (
        <p className="text-xs text-foreground/70 bg-secondary/50 rounded-lg px-3 py-2 mb-3 line-clamp-3 whitespace-pre-wrap break-words">{target.content}</p>
      )}
      <div className="space-y-2" role="radiogroup" aria-label="Motif du signalement">
        {REPORT_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border text-sm transition-colors ${
              reason === r ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-secondary/40 text-muted-foreground'
            }`}
          >
            {r}
            {reason === r && <Check className="w-4 h-4 text-primary" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <Textarea
        value={details}
        maxLength={1000}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Précisions (optionnel)"
        aria-label="Précisions (optionnel)"
        className="bg-secondary/50 border-border text-sm resize-none mt-3"
        rows={2}
      />
    </FeedSheet>
  );
}
