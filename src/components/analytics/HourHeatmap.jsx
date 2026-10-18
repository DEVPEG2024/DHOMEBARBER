import React, { useMemo, useState } from 'react';
import { WEEKDAYS, WEEKDAYS_LONG, formatNumber } from './trafficFormat';

/**
 * Heures de pointe : grille jour × heure (heure de Paris), une teinte (le vert de l'app), plus
 * foncé = plus de sessions. Le pic est écrit en clair, la valeur d'une case au survol / au tap, et
 * « Voir en tableau » liste les créneaux les plus fréquentés (rien n'est lisible qu'en couleur).
 */
export default function HourHeatmap({ cells }) {
  const [showTable, setShowTable] = useState(false);
  const [picked, setPicked] = useState(null);
  const { grid, max, top } = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const c of cells || []) {
      if (c.dow >= 1 && c.dow <= 7 && c.hour >= 0 && c.hour <= 23) g[c.dow - 1][c.hour] += c.sessions;
    }
    const flat = [];
    g.forEach((row, d) => row.forEach((v, h) => { if (v > 0) flat.push({ d, h, v }); }));
    flat.sort((a, b) => b.v - a.v);
    return { grid: g, max: flat[0]?.v || 0, top: flat.slice(0, 10) };
  }, [cells]);

  if (!max) return <p className="text-xs text-muted-foreground py-2">Pas encore de données</p>;
  const label = (d, h, v) => `${WEEKDAYS_LONG[d]} ${h} h – ${h + 1} h : ${formatNumber(v)} session${v > 1 ? 's' : ''}`;
  const peak = top[0];

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Pic : <span className="text-foreground font-semibold">{WEEKDAYS_LONG[peak.d]} {peak.h} h – {peak.h + 1} h</span> ({formatNumber(peak.v)} session{peak.v > 1 ? 's' : ''})
      </p>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: '2rem repeat(24, minmax(0, 1fr))' }} role="img" aria-label="Sessions par jour de la semaine et par heure">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-[9px] text-muted-foreground text-center tabular-nums">{h % 3 === 0 ? h : ''}</span>
        ))}
        {grid.map((row, d) => (
          <React.Fragment key={d}>
            <span className="text-[10px] text-muted-foreground self-center">{WEEKDAYS[d]}</span>
            {row.map((v, h) => {
              const strength = v ? 0.15 + 0.85 * (v / max) : 0;
              return (
                <button
                  key={h}
                  type="button"
                  title={label(d, h, v)}
                  aria-label={label(d, h, v)}
                  onClick={() => setPicked({ d, h, v })}
                  className="aspect-square rounded-[3px] bg-muted/30 relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  tabIndex={-1}
                >
                  {v > 0 && <span className="absolute inset-0 bg-primary" style={{ opacity: strength }} />}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          Moins
          {[0.15, 0.4, 0.65, 1].map((o) => <span key={o} className="w-3 h-3 rounded-[3px] bg-primary" style={{ opacity: o }} />)}
          Plus
        </span>
        <button type="button" onClick={() => setShowTable((v) => !v)} className="font-semibold text-primary underline underline-offset-2">
          {showTable ? 'Masquer le tableau' : 'Voir en tableau'}
        </button>
      </div>
      {picked && !showTable && (
        <p className="mt-2 text-xs text-foreground" role="status">{label(picked.d, picked.h, picked.v)}</p>
      )}
      {showTable && (
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="font-medium py-1">Créneau</th>
              <th className="font-medium py-1 text-right">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {top.map((t) => (
              <tr key={`${t.d}-${t.h}`} className="border-t border-border/50">
                <td className="py-1.5">{WEEKDAYS_LONG[t.d]} {t.h} h – {t.h + 1} h</td>
                <td className="py-1.5 text-right tabular-nums">{formatNumber(t.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
