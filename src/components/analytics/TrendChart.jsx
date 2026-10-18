import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, formatDuration, formatNumber, shortDay } from './trafficFormat';

const METRICS = [
  { key: 'visitors', label: 'Visiteurs', format: formatNumber },
  { key: 'sessions', label: 'Sessions', format: formatNumber },
  { key: 'avg_session_s', label: 'Temps moyen', format: formatDuration },
  { key: 'page_views', label: 'Pages vues', format: formatNumber },
];

function ChartTooltip({ active, payload, metric }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{shortDay(row.day)}</p>
      <p className="font-semibold text-foreground tabular-nums">{metric.format(row[metric.key])} <span className="font-normal text-muted-foreground">{metric.label.toLowerCase()}</span></p>
    </div>
  );
}

/**
 * Évolution par jour : une seule mesure à la fois (jamais deux échelles sur un graphique), choisie
 * au-dessus ; jours sans visite à zéro ; courbe 2 px, aire en lavis, point final marqué ; le
 * tableau (« Voir les chiffres ») donne chaque valeur.
 */
export default function TrendChart({ daily, from, to }) {
  const [metricKey, setMetricKey] = useState('visitors');
  const [showTable, setShowTable] = useState(false);
  const metric = METRICS.find((m) => m.key === metricKey) || METRICS[0];
  const rows = useMemo(() => {
    const byDay = new Map((daily || []).map((d) => [d.day, d]));
    const out = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const d = byDay.get(day);
      out.push({ day, visitors: d?.visitors || 0, sessions: d?.sessions || 0, avg_session_s: d?.avg_session_s || 0, page_views: d?.page_views || 0 });
      if (out.length > 400) break;
    }
    return out;
  }, [daily, from, to]);
  const last = rows[rows.length - 1];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Mesure affichée">
        {METRICS.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={metricKey === m.key} onClick={() => setMetricKey(m.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${metricKey === m.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-52 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={44}
              allowDecimals={false} tickFormatter={(v) => (metric.key === 'avg_session_s' ? formatDuration(v) : formatNumber(v))} />
            <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }} />
            <Area type="monotone" dataKey={metric.key} stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--primary))" fillOpacity={0.1}
              dot={false} activeDot={{ r: 4, stroke: 'hsl(var(--card))', strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        {last && <span>Dernier jour ({shortDay(last.day)}) : <span className="text-foreground font-semibold tabular-nums">{metric.format(last[metric.key])}</span></span>}
        <button type="button" onClick={() => setShowTable((v) => !v)} className="font-semibold text-primary underline underline-offset-2">
          {showTable ? 'Masquer les chiffres' : 'Voir les chiffres'}
        </button>
      </div>
      {showTable && (
        <div className="mt-3 max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-muted-foreground text-left">
                <th className="font-medium py-1">Jour</th>
                <th className="font-medium py-1 text-right">Visiteurs</th>
                <th className="font-medium py-1 text-right">Sessions</th>
                <th className="font-medium py-1 text-right">Temps moyen</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.day} className="border-t border-border/50">
                  <td className="py-1.5">{shortDay(r.day)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatNumber(r.visitors)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatNumber(r.sessions)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatDuration(r.avg_session_s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
