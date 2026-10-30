import React, { useId } from 'react';
import { Check } from 'lucide-react';
import { pollPercent, pollRemaining } from '@/lib/feed/rules';

/**
 * Corps d'un sondage du salon (fil v2, contrat section 5) : la question, une réponse par bouton,
 * puis « 128 votes · encore 2 jours · tu peux changer ton vote ».
 *
 * Pourcentages (barre + nombre) après mon vote, à la fin du sondage, ou pour l'admin
 * (`canSeeResults`) ; ✓ sur mon vote ; vote changeable tant que ce n'est pas fini (`onVote` n'est
 * pas appelé sur ma réponse actuelle ni après la fin). Le vote est affiché tout de suite par
 * l'appelant (`applyVote` dans useFeed).
 *
 * Mise en page : aucune marge latérale (PostCard la donne). La question est affichée ici : PostCard
 * ne répète pas `item.content` (= la question).
 *
 * @param {object} props
 * @param {object} props.item                     publication (`kind: 'poll'`, `item.poll` = pollView)
 * @param {(optionId: string) => void} [props.onVote]
 * @param {boolean} [props.canSeeResults]         admin : résultats visibles avant de voter
 */
export default function PollCard({ item, onVote, canSeeResults = false }) {
  const questionId = useId();
  const poll = item?.poll;
  const question = String(poll?.question || item?.content || '').trim();
  if (!poll || !Array.isArray(poll.options) || !poll.options.length) {
    return question ? <p className="text-[15px] font-semibold leading-snug text-foreground break-words">{question}</p> : null;
  }

  const remaining = pollRemaining(poll.ends_at);
  const closed = !!poll.closed || remaining === 'terminé';
  const myVote = poll.my_vote || null;
  const showResults = !!myVote || closed || canSeeResults;
  const total = Math.max(0, Number(poll.total) || 0);
  const status = [
    `${total} vote${total > 1 ? 's' : ''}`,
    remaining,
    myVote && !closed ? 'tu peux changer ton vote' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="min-w-0">
      <p id={questionId} className="pb-3 text-[15px] font-semibold leading-snug text-foreground break-words">{question}</p>
      <div role="group" aria-labelledby={questionId} className="flex flex-col gap-2">
        {poll.options.map((o) => {
          const pct = pollPercent(Number(o.votes) || 0, total);
          const mine = myVote === o.id;
          return (
            <button
              key={o.id}
              type="button"
              data-poll-option={o.id}
              aria-pressed={mine}
              disabled={closed}
              onClick={() => { if (!mine && !closed) onVote?.(o.id); }}
              className={`relative w-full min-h-[44px] overflow-hidden rounded-xl border bg-secondary/60 text-left transition-colors disabled:cursor-default ${
                mine ? 'border-primary' : 'border-border enabled:hover:border-primary/60'
              }`}
            >
              {showResults && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 w-full origin-left transition-transform duration-500 motion-reduce:transition-none ${mine ? 'bg-primary/30' : 'bg-white/8'}`}
                  style={{ transform: `scaleX(${pct / 100})` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className={`flex min-w-0 items-center gap-1.5 ${mine ? 'font-bold text-foreground' : 'font-semibold text-foreground/85'}`}>
                  <span className="min-w-0 break-words">{o.label}</span>
                  {mine && <Check className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />}
                </span>
                {showResults && <span className="shrink-0 font-bold tabular-nums text-foreground">{`${pct} %`}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="pt-2.5 text-xs text-muted-foreground">{status}</p>
    </div>
  );
}
