/**
 * Admin « Cartes Gang » : top de la saison (90 derniers jours, tous les clients, pas seulement
 * les volontaires du classement public) et nombre de clients par écusson.
 */
import React from 'react';
import { Trophy, Award } from 'lucide-react';
import { GANG_BADGE_ORDER, GANG_BADGE_INFO } from '@/lib/gangCardApi';
import { Panel, PanelTitle, TierPill, clientLabel, plural } from './gangAdminUi';

const MEDALS = ['🥇', '🥈', '🥉'];

export function GangTopSeason({ rows, days = 90 }) {
  const list = (Array.isArray(rows) ? rows : []).slice(0, 10);
  return (
    <Panel>
      <PanelTitle icon={Trophy} aside={`${days} derniers jours`}>Top de la saison</PanelTitle>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Aucune visite sur la période.</p>
      ) : (
        <ol className="space-y-1.5">
          {list.map((row, i) => {
            const name = clientLabel(row);
            return (
              <li key={row.email || i} className="flex items-center gap-2.5 min-w-0 rounded-xl px-2 py-1.5 even:bg-secondary/40">
                <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-muted-foreground">
                  {MEDALS[i] || i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate" title={name}>{name}</p>
                  <div className="flex items-center gap-2 mt-0.5 min-w-0">
                    <TierPill tier={row.tier} label={row.tier_label} />
                    <span className="text-[11px] text-muted-foreground tabular-nums truncate">
                      <span className="font-bold text-foreground">{Number(row.season_visits) || 0}</span>{' '}
                      {plural(row.season_visits, 'visite', 'visites')} sur la saison
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function GangBadgeStats({ badges, withCard }) {
  const counts = badges || {};
  const keys = [...GANG_BADGE_ORDER, ...Object.keys(counts).filter((k) => !GANG_BADGE_ORDER.includes(k))];
  const total = Math.max(1, Number(withCard) || 0);
  return (
    <Panel>
      <PanelTitle icon={Award}>Écussons</PanelTitle>
      <ul className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
        {keys.map((key) => {
          const info = GANG_BADGE_INFO[key] || { emoji: '🏅', label: key };
          const n = Number(counts[key]) || 0;
          return (
            <li key={key} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2 min-w-0">
              <span className="text-xl leading-none shrink-0" aria-hidden="true">{info.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{info.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {Math.round((n / total) * 100)} % des cartes
                </p>
              </div>
              <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
                {n}
                <span className="sr-only"> client{n > 1 ? 's' : ''}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
