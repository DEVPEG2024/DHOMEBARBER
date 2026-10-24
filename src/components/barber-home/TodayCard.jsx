import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, Clock, Coffee, Phone } from 'lucide-react';
import SnapCarousel from '@/components/motion/SnapCarousel';
import { stripLastMinuteMarker } from '@/components/agenda/agendaUtils';
import { aptEnd, countdownLabel, dayLabel, serviceNames, telHref } from './barberHomeUtils';
import { agendaClientName } from '@/lib/guest';

/** Recalcul chaque minute et au retour au premier plan. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);
  return now;
}

const hhmm = (t) => String(t || '').slice(0, 5);

/**
 * « Ma journée » du barber : le prochain client (compte à rebours, prestations, appel), puis ses
 * rendez-vous du jour en carrousel (les passés cochés et atténués). Journée vide ou terminée :
 * le prochain rendez-vous de la semaine. `today` / `upcoming` : rendez-vous clients triés.
 */
export default function TodayCard({ today, upcoming, agendaLink, loading }) {
  const now = useNow();
  if (loading) return <div className="h-44 rounded-3xl bg-white/5 animate-pulse" aria-hidden="true" />;

  const next = today.find((a) => aptEnd(a) > now) || null;
  const remaining = today.filter((a) => aptEnd(a) > now).length;
  const later = upcoming[0] || null;

  return (
    <div className="space-y-3">
      {next ? (
        <div className="shine-sweep rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/20 via-primary/[0.07] to-transparent p-4">
          <div className="absolute -top-16 -right-10 w-44 h-44 rounded-full bg-primary/20 blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-semibold flex items-center gap-1.5">
              <span className="live-dot text-primary" aria-hidden="true" />
              Prochain client
            </p>
            <div className="flex items-end justify-between gap-3 mt-1">
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold text-foreground leading-tight truncate">{agendaClientName(next)}</p>
                <p className="text-xs text-muted-foreground">{countdownLabel(next, now)} · {hhmm(next.start_time)} – {hhmm(next.end_time)}</p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1">
                {remaining} restant{remaining > 1 ? 's' : ''}
              </span>
            </div>
            {serviceNames(next).length > 0 && (
              <p className="text-[12px] text-foreground/80 mt-2 line-clamp-2">{serviceNames(next).join(' + ')}</p>
            )}
            {stripLastMinuteMarker(next.internal_notes) && (
              <p className="text-[11px] text-amber-300/90 mt-1.5 line-clamp-2">Note : {stripLastMinuteMarker(next.internal_notes)}</p>
            )}
            <div className={`grid gap-2 mt-4 ${next.client_phone ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {agendaLink && (
                <Link to={agendaLink}
                  className="h-10 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform">
                  <CalendarDays className="w-3.5 h-3.5" /> Mon agenda
                </Link>
              )}
              {next.client_phone && (
                <a href={telHref(next.client_phone)}
                  className="h-10 rounded-xl bg-white/8 border border-white/10 text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform">
                  <Phone className="w-3.5 h-3.5" /> Appeler
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 flex items-center gap-4">
          <div className="w-14 h-14 shrink-0 rounded-2xl tile-chip flex items-center justify-center">
            <Coffee className="w-6 h-6 text-primary relative z-[1] float-soft" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-foreground leading-tight">
              {today.length ? 'Journée terminée, bien joué 🔥' : 'Pas de client aujourd\'hui'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {later
                ? `Prochain : ${dayLabel(later.date)} à ${hhmm(later.start_time)}${later.client_name ? ` avec ${agendaClientName(later)}` : ''}`
                : 'Aucun autre rendez-vous cette semaine.'}
            </p>
          </div>
        </div>
      )}

      {today.length > 0 && (
        <SnapCarousel itemWidth="40%" gap={8} label="Rendez-vous du jour" dots={false}>
          {today.map((a) => {
            const done = aptEnd(a) <= now;
            const current = next && a.id === next.id;
            return (
              <div key={a.id}
                className={`h-full rounded-2xl border p-3 ${current ? 'border-primary/40 bg-primary/10' : 'border-white/8 bg-white/[0.04]'} ${done ? 'opacity-55' : ''}`}>
                <p className="text-[11px] font-semibold text-primary flex items-center gap-1 tabular-nums">
                  {done ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}{hhmm(a.start_time)}
                </p>
                <p className="text-xs font-semibold text-foreground mt-1 truncate">{agendaClientName(a)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{serviceNames(a).join(' + ') || '—'}</p>
              </div>
            );
          })}
        </SnapCarousel>
      )}
    </div>
  );
}
