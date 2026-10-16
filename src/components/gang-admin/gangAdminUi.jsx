/**
 * Admin « Cartes Gang » : petits éléments partagés (pastille de niveau, titres, libellés).
 */
import React from 'react';
import { gangPalette } from '@/components/gang/gangTheme';
import { GANG_TIER_ORDER } from '@/lib/gangCardApi';

export const plural = (n, one, many) => (Number(n) === 1 ? one : many);

/** Nom affiché d'un client : nom complet, sinon nom court de la carte, sinon email. */
export const clientLabel = (row) => row?.full_name || row?.name || row?.email || 'Client';

/** Niveaux connus, dans l'ordre, avec leur palette (bronze par défaut). */
export const tierPalette = (tier) => gangPalette({ tier: GANG_TIER_ORDER.includes(tier) ? tier : 'bronze' }) || {};

/** Pastille « Or », « TOTS »… aux couleurs du niveau. */
export function TierPill({ tier, label, className = '' }) {
  const p = tierPalette(tier);
  const text = p.short || label || p.label || tier;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap shrink-0 ${className}`}
      style={{ background: p.gem, color: p.gemInk }}
      title={label || p.label}
    >
      {text}
    </span>
  );
}

export function PanelTitle({ icon: Icon, children, aside }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground min-w-0">
        {Icon && <Icon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
        <span className="truncate">{children}</span>
      </h2>
      {aside && <div className="text-[11px] text-muted-foreground shrink-0">{aside}</div>}
    </div>
  );
}

export function Panel({ children, className = '' }) {
  return <section className={`rounded-2xl border border-border bg-card p-4 min-w-0 ${className}`}>{children}</section>;
}

/** Jours écoulés depuis une date ISO (null si inconnue). */
export function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/** « pas venu depuis 6 semaines » / « depuis 12 jours » */
export function absenceLabel(days) {
  const d = Number(days);
  if (!Number.isFinite(d)) return null;
  if (d >= 14) {
    const w = Math.floor(d / 7);
    return `pas venu depuis ${w} ${plural(w, 'semaine', 'semaines')}`;
  }
  return `pas venu depuis ${d} ${plural(d, 'jour', 'jours')}`;
}
