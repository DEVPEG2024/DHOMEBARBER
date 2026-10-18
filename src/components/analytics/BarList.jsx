import React from 'react';
import { formatNumber } from './trafficFormat';

/**
 * Liste de barres horizontales (une seule série, une seule teinte) : libellé et valeur en texte,
 * barre fine à fond arrondi au bout. Le texte porte toutes les valeurs : rien n'est lisible
 * seulement par la couleur ou au survol.
 * `rows` : [{ key, label, value, hint? }] ; `max` facultatif (par défaut la plus grande valeur).
 */
export default function BarList({ rows, max, format = formatNumber, empty = 'Pas encore de données' }) {
  const top = max ?? Math.max(0, ...rows.map((r) => Number(r.value) || 0));
  if (!rows.length || top <= 0) return <p className="text-xs text-muted-foreground py-2">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const ratio = Math.max(0, Math.min(1, (Number(r.value) || 0) / top));
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-foreground" title={r.label}>{r.label}</span>
              <span className="shrink-0 tabular-nums text-foreground font-semibold">
                {format(r.value)}
                {r.hint && <span className="ml-1.5 font-normal text-muted-foreground">{r.hint}</span>}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted/40 overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full bg-primary origin-left" style={{ width: `${Math.max(ratio * 100, 2)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
