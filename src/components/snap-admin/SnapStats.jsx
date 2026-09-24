import React, { useMemo, useState } from 'react';
import { Loader2, Eye, ShieldCheck, Sparkles, Camera, Share2, CalendarCheck, AlertTriangle } from 'lucide-react';

/**
 * Statistiques d'usage des filtres Snap (GET /snap/admin/stats) : tuiles de chiffres, visites
 * par jour (barres, une série) et filtres les plus essayés. Les comptes staff ne sont pas comptés.
 */
export const STATS_PERIODS = [7, 30, 90];

const TILES = [
  { type: 'open', label: 'Visites', icon: Eye, hint: 'Ouvertures de la page Filtres Snap' },
  { type: 'consent', label: 'Conditions acceptées', icon: ShieldCheck, hint: 'Clients ayant accepté les conditions de Snap' },
  { type: 'lens', label: 'Filtres essayés', icon: Sparkles, hint: 'Filtres appliqués sur la caméra' },
  { type: 'capture', label: 'Photos prises', icon: Camera },
  { type: 'share', label: 'Partages', icon: Share2 },
  { type: 'book', label: '« Réserver ce look »', icon: CalendarCheck, hint: 'Clics vers la réservation depuis les filtres' },
];

const DAY_FMT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** Les `days` derniers jours (heure de Paris), complétés à zéro. */
function fillDays(daily, days) {
  const byDay = new Map((daily || []).map((d) => [d.day, d]));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    const key = dt.toISOString().slice(0, 10);
    const row = byDay.get(key);
    out.push({ day: key, label: DAY_FMT.format(dt), opens: row?.opens || 0, users: row?.users || 0 });
  }
  return out;
}

function DailyBars({ daily, days }) {
  const series = useMemo(() => fillDays(daily, days), [daily, days]);
  const peak = Math.max(0, ...series.map((s) => s.opens));
  const max = Math.max(1, peak);
  const [hover, setHover] = useState(null);
  const shown = hover != null ? series[hover] : null;
  const total = series.reduce((sum, s) => sum + s.opens, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 min-h-[18px]">
        <p className="text-xs font-semibold">Visites par jour</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {shown
            ? <><span className="text-foreground font-semibold">{shown.label}</span> · {shown.opens} visite{shown.opens > 1 ? 's' : ''} · {shown.users} client{shown.users > 1 ? 's' : ''}</>
            : `${total} sur ${days} jours`}
        </p>
      </div>
      <div className="relative h-28 border-b border-border" onMouseLeave={() => setHover(null)}>
        {/* repère de mi-hauteur, discret */}
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50" aria-hidden="true" />
        <div className="absolute inset-0 flex items-end" style={{ gap: days > 45 ? 1 : 2 }}>
          {series.map((s, i) => (
            <button
              key={s.day}
              type="button"
              aria-label={`${s.label} : ${s.opens} visite(s)`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              className="flex-1 h-full flex items-end group focus:outline-none"
            >
              <span
                className={`block w-full rounded-t-[4px] transition-opacity ${s.opens ? 'bg-primary' : 'bg-border/60'} ${hover != null && hover !== i ? 'opacity-40' : ''}`}
                style={{ height: s.opens ? `${Math.max(4, (s.opens / max) * 100)}%` : 2 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums">
        <span>{series[0]?.label}</span>
        {peak > 0 && <span>max {peak} / jour</span>}
        <span>{series[series.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function TopLenses({ top }) {
  if (!top?.length) {
    return <p className="text-xs text-muted-foreground">Aucun filtre essayé sur la période.</p>;
  }
  const max = Math.max(1, ...top.map((t) => t.n));
  return (
    <ol className="space-y-2">
      {top.map((t, i) => (
        <li key={t.key} className="text-xs">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="truncate"><span className="text-muted-foreground tabular-nums mr-1.5">{i + 1}.</span>{t.name || t.key}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              <span className="text-foreground font-semibold">{t.n}</span> · {t.users} client{t.users > 1 ? 's' : ''}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden" title={`${t.n} essai(s)`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${(t.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function SnapStats({ stats, days, onDaysChange, isLoading, error }) {
  const counts = stats?.counts || {};
  const visitors = counts.open?.users || 0;
  const errors = counts.error?.n || 0;

  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Utilisation</h3>
          <p className="text-[11px] text-muted-foreground">Clients uniquement : les essais de l'équipe ne sont pas comptés.</p>
        </div>
        <div className="flex gap-1">
          {STATS_PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                d === days ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {d} j
            </button>
          ))}
        </div>
      </div>

      {isLoading && !stats && (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      )}
      {error && !stats && (
        <p className="text-xs text-red-300">Statistiques indisponibles : {error.message}</p>
      )}

      {stats && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TILES.map((tile) => {
              const c = counts[tile.type] || { n: 0, users: 0 };
              const share = tile.type !== 'open' && visitors > 0 && c.users > 0 ? Math.round((c.users / visitors) * 100) : null;
              return (
                <div key={tile.type} className="rounded-xl bg-secondary/50 border border-border p-3" title={tile.hint}>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <tile.icon className="w-3.5 h-3.5" /> {tile.label}
                  </p>
                  <p className="text-2xl font-bold mt-1 tabular-nums">{c.n}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {c.users} client{c.users > 1 ? 's' : ''}{share != null ? ` · ${share} % des visiteurs` : ''}
                  </p>
                </div>
              );
            })}
          </div>

          {errors > 0 && (
            <p className="flex items-start gap-2 text-[11px] text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {errors} démarrage{errors > 1 ? 's' : ''} en échec sur la période (caméra refusée, appareil non compatible ou réseau).
            </p>
          )}

          <DailyBars daily={stats.daily} days={days} />

          <div>
            <p className="text-xs font-semibold mb-2">Filtres les plus essayés</p>
            <TopLenses top={stats.top_lenses} />
          </div>

          <p className="text-[10px] text-muted-foreground">
            Depuis le début : {stats.all_time?.opens || 0} visite{(stats.all_time?.opens || 0) > 1 ? 's' : ''},{' '}
            {stats.all_time?.users || 0} client{(stats.all_time?.users || 0) > 1 ? 's' : ''}
            {stats.all_time?.last_at ? `, dernière visite le ${DATE_FMT.format(new Date(stats.all_time.last_at))}` : ''}.
          </p>
        </div>
      )}
    </section>
  );
}

