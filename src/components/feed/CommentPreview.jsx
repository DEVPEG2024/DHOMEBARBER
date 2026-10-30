import React from 'react';
import { AuthorName } from '@/components/feed/AuthorLine';

/**
 * Aperçu des commentaires sous une publication (fil v2) : les 2 derniers (« **Nom** texte », étoile
 * bleue du salon, badge Barber), puis « Voir les N commentaires » quand il y en a d'autres. Plus de
 * champ de commentaire sous la carte : on écrit dans la fenêtre des commentaires (CommentsSheet).
 *
 * @param {object} props
 * @param {object} props.item            publication (`comments_preview`, `comments_count`)
 * @param {() => void} props.onOpen      ouvre la fenêtre des commentaires
 * @param {boolean} [props.unavailable]  ancien fil : commentaires en échec (« Réessayer »)
 * @param {() => void} [props.onRetry]
 * @param {boolean} [props.retrying]
 */
export default function CommentPreview({ item, onOpen, unavailable = false, onRetry, retrying = false }) {
  if (unavailable) {
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 px-4 pt-2 text-xs text-muted-foreground">
        <span>Commentaires indisponibles</span>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={() => onRetry?.()} disabled={retrying} className="relative font-semibold text-primary disabled:opacity-60 after:absolute after:-inset-x-2 after:-inset-y-3">
          {retrying ? 'Chargement…' : 'Réessayer'}
        </button>
      </div>
    );
  }
  const preview = (item.comments_preview || []).slice(-2);
  const count = Math.max(Number(item.comments_count) || 0, preview.length);
  if (!count) return null;
  return (
    <div className="px-4 pt-2 flex flex-col gap-1.5">
      {preview.map((c) => (
        <p key={c.id} className="text-[13px] leading-snug text-foreground/85 break-words line-clamp-2">
          <AuthorName name={c.author_name} role={c.author_role} className="text-[13px] font-bold text-foreground" starClassName="w-3 h-3" />
          {' '}
          <span className="whitespace-pre-wrap">{c.content}</span>
        </p>
      ))}
      {count > preview.length && (
        // Zone de tap de 40 px (pseudo-élément) pour une ligne de 24 px
        <button type="button" onClick={onOpen} className="relative self-start text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors py-0.5 after:absolute after:inset-x-0 after:-inset-y-2">
          Voir les {count} commentaires
        </button>
      )}
    </div>
  );
}
