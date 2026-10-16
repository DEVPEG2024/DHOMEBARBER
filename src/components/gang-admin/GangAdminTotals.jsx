/**
 * Admin « Cartes Gang » : chiffres d'en-tête et répartition des cartes par niveau.
 */
import React from 'react';
import { Layers } from 'lucide-react';
import { GANG_TIER_ORDER } from '@/lib/gangCardApi';
import { Panel, PanelTitle, tierPalette } from './gangAdminUi';

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 min-w-0">
      <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-tight mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
    </div>
  );
}

export function GangAdminTotalsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-[76px] rounded-2xl border border-border bg-card animate-pulse" />)}
      </div>
      <div className="h-[220px] rounded-2xl border border-border bg-card animate-pulse" />
    </div>
  );
}

export default function GangAdminTotals({ totals }) {
  const clients = Number(totals?.clients) || 0;
  const withCard = Number(totals?.with_card) || 0;
  const without = Math.max(0, clients - withCard);
  const byTier = totals?.by_tier || {};
  const max = Math.max(1, ...GANG_TIER_ORDER.map((t) => Number(byTier[t]) || 0));
  const pct = clients > 0 ? Math.round((withCard / clients) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Clients" value={clients} />
        <Stat label="Avec carte" value={withCard} hint={clients > 0 ? `${pct} %` : null} />
        <Stat label="Sans carte" value={without} hint="aucune visite" />
      </div>

      <Panel>
        <PanelTitle icon={Layers} aside={`${withCard} carte${withCard > 1 ? 's' : ''}`}>Répartition par niveau</PanelTitle>
        <ul className="space-y-2.5">
          {GANG_TIER_ORDER.map((tier) => {
            const p = tierPalette(tier);
            const n = Number(byTier[tier]) || 0;
            return (
              <li key={tier} className="flex items-center gap-3 min-w-0">
                <span className="w-[86px] sm:w-[140px] shrink-0 text-xs font-semibold text-foreground truncate" title={p.label}>
                  <span className="sm:hidden">{p.short || p.label}</span>
                  <span className="hidden sm:inline">{p.label}</span>
                </span>
                <div className="flex-1 min-w-0 h-3 rounded-full bg-secondary overflow-hidden" aria-hidden="true">
                  {/* Barre en échelle horizontale (transform) aux couleurs du niveau */}
                  <div
                    className="h-full w-full origin-left rounded-full transition-transform duration-700"
                    style={{ background: p.gem, transform: `scaleX(${n / max})` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold tabular-nums text-foreground shrink-0">
                  {n}
                  <span className="sr-only"> carte{n > 1 ? 's' : ''} {p.label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
