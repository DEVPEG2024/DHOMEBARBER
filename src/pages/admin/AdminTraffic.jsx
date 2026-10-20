import React, { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Info, Eye, Images } from 'lucide-react';
import { apiRequest, apiUrl } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import BarList from '@/components/analytics/BarList';
import HourHeatmap from '@/components/analytics/HourHeatmap';
import TrendChart from '@/components/analytics/TrendChart';
import { AppErrorsCard, ErrorHealthBadge } from '@/components/analytics/AppErrors';
import {
  actionLabel, addDays, deltaOf, deviceLabel, formatDuration, formatNumber, formatPercent, pageLabel, parisDay,
  platformLabel, shortDay, sourceLabel,
} from '@/components/analytics/trafficFormat';

const PERIODS = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
  { days: 365, label: '12 mois' },
];

function Card({ title, subtitle, children, className = '' }) {
  return (
    <section className={`bg-card border border-border rounded-2xl p-4 sm:p-5 ${className}`}>
      {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
      {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      <div className={title || subtitle ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

/** Tuile chiffrée : valeur, écart avec la période précédente (flèche + signe, couleur selon le sens souhaité). */
function StatTile({ label, value, delta, goodWhenUp = true, hint }) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const up = hasDelta && delta > 0;
  const good = hasDelta && (delta === 0 || up === goodWhenUp);
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="bg-card border border-border rounded-2xl p-3.5 min-w-0">
      <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      <p className="text-xl font-bold text-foreground mt-1 leading-tight break-words">{value}</p>
      {hasDelta ? (
        <p className="mt-1 text-[11px] leading-snug">
          <span className={`inline-flex items-center gap-0.5 font-semibold whitespace-nowrap ${good ? 'text-emerald-400' : 'text-red-400'}`}>
            {delta !== 0 && <Arrow className="w-3 h-3" aria-hidden="true" />}
            {delta > 0 ? '+' : ''}{delta} %
          </span>
          <span className="block text-muted-foreground">vs période précédente</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Admin → Trafic : mesure d'audience interne de l'app (lib/analytics.js côté serveur). Visiteurs,
 * temps de présence, pages, parcours de réservation, heures de pointe, plateformes, provenances,
 * actions clés, publications du New Gang et réalisations les plus vues. Clients seulement par
 * défaut (équipe et comptes testeurs exclus), « Tout le monde » pour les inclure.
 */
export default function AdminTraffic() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState('clients');
  const to = parisDay();
  const from = addDays(to, -(days - 1));

  const query = useQuery({
    queryKey: ['traffic', from, to, scope],
    enabled: user?.role === 'admin',
    placeholderData: keepPreviousData,
    refetchInterval: 60 * 1000,
    queryFn: () => apiRequest('GET', apiUrl(`/analytics/overview?from=${from}&to=${to}&scope=${scope}`)),
  });
  const data = query.data;
  const k = data?.kpis;
  const prev = data?.previous;
  const firstStep = data?.funnel?.[0]?.visitors || 0;

  const funnelRows = useMemo(() => (data?.funnel || []).map((f) => ({
    key: f.key, label: f.label, value: f.visitors,
    hint: firstStep ? `(${Math.round((f.visitors / firstStep) * 100)} %)` : undefined,
  })), [data, firstStep]);

  if (user && user.role !== 'admin') {
    return <p className="text-sm text-muted-foreground">Réservé à l'administrateur.</p>;
  }

  return (
    <div className={`space-y-4 ${query.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> Trafic
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Mesure d'audience interne de l'app, aucun service extérieur</p>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
              {formatNumber(data.live?.sessions)} en ce moment
            </span>
            <ErrorHealthBadge errors={data.errors} />
          </div>
        )}
      </div>

      {/* Filtres : une seule rangée, pour toute la page */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {PERIODS.map((p) => (
            <button key={p.days} type="button" onClick={() => setDays(p.days)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${days === p.days ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-full border border-border bg-card p-0.5 text-xs">
          {[['clients', 'Clients'], ['all', 'Tout le monde']].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setScope(key)}
              className={`px-3 py-1 rounded-full font-semibold transition-colors ${scope === key ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {queryFailed(query) ? (
        <LoadError what="les chiffres du trafic" error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
      ) : !data ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />)}
        </div>
      ) : (
        <>
          {k.sessions === 0 && (
            <div role="status" className="flex items-start gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-px text-primary" />
              <span>Aucune visite mesurée sur cette période. La mesure a commencé le 18 octobre 2026 : les chiffres se remplissent au fil des visites (les apps iPhone et Android seront mesurées à leur prochaine version).</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="Visiteurs uniques" value={formatNumber(k.visitors)} delta={deltaOf(k.visitors, prev?.visitors)} />
            <StatTile label="Sessions" value={formatNumber(k.sessions)} delta={deltaOf(k.sessions, prev?.sessions)} />
            <StatTile label="Temps moyen par session" value={formatDuration(k.avg_session_s)} delta={deltaOf(k.avg_session_s, prev?.avg_session_s)} hint={`médiane ${formatDuration(k.median_session_s)}`} />
            <StatTile label="Temps total passé" value={formatDuration(k.total_active_s)} delta={deltaOf(k.total_active_s, prev?.total_active_s)} />
            <StatTile label="Pages par session" value={String(k.pages_per_session).replace('.', ',')} delta={deltaOf(k.pages_per_session, prev?.pages_per_session)} />
            <StatTile label="Rebond (1 page, < 10 s)" value={formatPercent(k.bounce_rate)} delta={deltaOf(k.bounce_rate, prev?.bounce_rate)} goodWhenUp={false} />
            <StatTile label="Comptes connectés" value={formatNumber(k.accounts)} delta={deltaOf(k.accounts, prev?.accounts)} />
            <StatTile label="Nouveaux / revenants" value={`${formatNumber(k.new_visitors)} / ${formatNumber(k.returning_visitors)}`}
              hint={k.visitors ? `${Math.round((k.returning_visitors / k.visitors) * 100)} % reviennent` : undefined} />
          </div>

          <Card title="Évolution par jour" subtitle={`Du ${shortDay(data.period.from)} au ${shortDay(data.period.to)}`}>
            <TrendChart daily={data.daily} from={data.period.from} to={data.period.to} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Parcours de réservation" subtitle="Personnes ayant atteint chaque étape (part de celles qui ont ouvert la réservation)">
              <BarList rows={funnelRows} max={firstStep || undefined} />
            </Card>
            <Card title="Heures de pointe" subtitle="Débuts de session, heure de Paris">
              <HourHeatmap cells={data.hourly} />
            </Card>
          </div>

          <Card title="Pages les plus vues" subtitle="Vues, visiteurs et temps moyen passé par vue">
            {data.pages.length === 0 ? (
              <p className="text-xs text-muted-foreground">Pas encore de données</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs min-w-[320px]">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="font-medium py-1.5 px-1">Page</th>
                      <th className="font-medium py-1.5 px-1 text-right">Vues</th>
                      <th className="font-medium py-1.5 px-1 text-right">Visiteurs</th>
                      <th className="font-medium py-1.5 px-1 text-right">Temps moyen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pages.map((p) => (
                      <tr key={p.path} className="border-t border-border/50">
                        <td className="py-2 px-1 text-foreground" title={p.path}>{pageLabel(p.path)}</td>
                        <td className="py-2 px-1 text-right tabular-nums text-foreground font-semibold">{formatNumber(p.views)}</td>
                        <td className="py-2 px-1 text-right tabular-nums">{formatNumber(p.visitors)}</td>
                        <td className="py-2 px-1 text-right tabular-nums whitespace-nowrap">{formatDuration(p.avg_time_s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Actions clés" subtitle="Nombre de fois (personnes différentes)">
              <BarList rows={data.actions.map((a) => ({ key: a.name, label: actionLabel(a.name), value: a.count, hint: `(${formatNumber(a.visitors)})` }))} />
            </Card>
            <Card title="Provenance des visites" subtitle="Sessions par origine">
              <BarList rows={data.sources.map((s) => ({ key: s.source, label: sourceLabel(s.source), value: s.sessions }))} />
            </Card>
            <Card title="Plateformes" subtitle="Sessions (visiteurs)">
              <BarList rows={data.platforms.map((p) => ({ key: p.platform, label: platformLabel(p.platform), value: p.sessions, hint: `(${formatNumber(p.visitors)})` }))} />
            </Card>
            <Card title="Appareils" subtitle="Sessions">
              <BarList rows={data.devices.map((d) => ({ key: d.device, label: deviceLabel(d.device), value: d.sessions }))} />
            </Card>
            <Card title="Pages d'entrée" subtitle="Première page des sessions">
              <BarList rows={data.entries.map((e) => ({ key: e.path, label: pageLabel(e.path), value: e.sessions }))} />
            </Card>
            <Card title="Réalisations des barbers" subtitle="Photos ouvertes et « Réserver » depuis une photo">
              {data.gallery.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Pas encore de données</p>
              ) : (
                <ul className="space-y-2">
                  {data.gallery.map((g) => (
                    <li key={g.barber_id || 'x'} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <Images className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                        <span className="truncate text-foreground">{g.barber_name || 'Barber supprimé'}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        <span className="text-foreground font-semibold">{formatNumber(g.opens)}</span> photos ouvertes · <span className="text-foreground font-semibold">{formatNumber(g.book_clicks)}</span> « Réserver »
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="New Gang : publications les plus vues" subtitle="Personnes différentes qui ont vu chaque publication (premier passage sur la période)">
            {data.posts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Pas encore de données</p>
            ) : (
              <ul className="space-y-2.5">
                {data.posts.map((p) => (
                  <li key={p.post_id} className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-secondary shrink-0 flex items-center justify-center">
                      {p.image_url
                        ? <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : <span className="text-[10px] text-muted-foreground">Texte</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground line-clamp-2 break-words">{p.excerpt || 'Photo sans texte'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.author_name || 'Membre du Gang'}</p>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-foreground tabular-nums">
                      <Eye className="w-3.5 h-3.5 text-primary" aria-hidden="true" /> {formatNumber(p.viewers)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <AppErrorsCard errors={data.errors} period={`${shortDay(data.period.from)} au ${shortDay(data.period.to)}`} />

          <p className="text-[11px] text-muted-foreground px-1 pb-2">
            {scope === 'clients' ? 'Clients seulement : visites de l\'équipe et des comptes testeurs exclues. ' : 'Tout le monde : équipe et comptes testeurs compris. '}
            Données conservées 13 mois, sans parcours individuel. Les clients peuvent refuser la mesure dans Paramètres.
          </p>
        </>
      )}
    </div>
  );
}
