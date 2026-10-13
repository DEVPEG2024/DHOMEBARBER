/**
 * Ligne de la chronologie : pastille emoji colorée selon le ton du type, titre, détail, client,
 * montant, heure et point « non lu ». Un tap ouvre l'élément concerné dans l'admin.
 */
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ACTIVITY_TYPES, formatActivityTime } from '@/lib/adminActivity';
import { toneClasses, formatEuro } from './activityUi';

export default function ActivityRow({ event, unread, onOpen }) {
  const meta = ACTIVITY_TYPES[event.type] || { label: 'Action client', emoji: '•', tone: 'gray' };
  const tone = toneClasses(meta.tone);
  const client = [event.clientName, event.clientEmail && event.clientEmail !== event.clientName ? event.clientEmail : null]
    .filter(Boolean)
    .join(' · ');
  const hasAmount = event.amount != null && Number.isFinite(Number(event.amount)) && Number(event.amount) !== 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={`w-full text-left flex items-start gap-3 p-3 rounded-2xl border transition-colors min-w-0 ${unread ? 'border-primary/30 bg-primary/5 hover:bg-primary/10' : 'border-border bg-card hover:bg-muted/40'}`}
    >
      <span className={`w-10 h-10 shrink-0 rounded-xl ring-1 flex items-center justify-center text-lg ${tone.dot}`} aria-hidden="true">
        {meta.emoji}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-foreground truncate">{event.title || meta.label}</span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">{formatActivityTime(event.at)}</span>
        </span>
        {event.detail && <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">{event.detail}</span>}
        {(client || hasAmount) && (
          <span className="flex items-center justify-between gap-2 mt-1">
            <span className="text-[11px] text-muted-foreground truncate">{client}</span>
            {hasAmount && <span className={`text-xs font-semibold whitespace-nowrap shrink-0 ${tone.text}`}>{formatEuro(event.amount)}</span>}
          </span>
        )}
      </span>
      <span className="flex flex-col items-center gap-2 shrink-0 pt-1">
        <span className={`w-2 h-2 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`} aria-label={unread ? 'Non lu' : undefined} />
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </span>
    </button>
  );
}

export function ActivityRowSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-2xl border border-border bg-card">
      <div className="w-10 h-10 rounded-xl bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
        <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-1/3 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}
