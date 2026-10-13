/**
 * Filtres du panneau : recherche nom / email, chips par type (avec compte) et « Non lus ».
 * Les chips défilent dans leur propre conteneur : la page ne s'élargit jamais.
 */
import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ACTIVITY_TYPES } from '@/lib/adminActivity';

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

export default function ActivityFilters({ typeFilter, onTypeChange, typeCounts, total, unreadOnly, onUnreadOnlyChange, unreadCount, search, onSearchChange }) {
  const types = Object.keys(ACTIVITY_TYPES).filter(t => (typeCounts[t] || 0) > 0 || t === typeFilter);

  return (
    <div className="space-y-2 mb-4 min-w-0">
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Rechercher un client (nom ou email)"
          className="pl-9 pr-9"
          aria-label="Rechercher un client"
        />
        {search && (
          <button type="button" onClick={() => onSearchChange('')} aria-label="Effacer la recherche" className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Chip active={unreadOnly} onClick={() => onUnreadOnlyChange(!unreadOnly)}>
          Non lus{unreadCount ? ` (${unreadCount})` : ''}
        </Chip>
        <Chip
          active={typeFilter === 'all' && !unreadOnly}
          onClick={() => { onTypeChange('all'); onUnreadOnlyChange(false); }}
        >
          Tout ({total})
        </Chip>
        {types.map(t => (
          <Chip key={t} active={typeFilter === t} onClick={() => onTypeChange(t)}>
            {ACTIVITY_TYPES[t].emoji} {ACTIVITY_TYPES[t].label} ({typeCounts[t] || 0})
          </Chip>
        ))}
      </div>
    </div>
  );
}
