import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarClock, MapPin, Scissors, Sparkles } from 'lucide-react';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import { isGangStatLow } from '@/components/gang/gangTheme';
import { formatPrice } from '@/components/services/serviceUtils';
import { countdownFor, nextAppointment, serviceNames } from './profileUtils';

const MAPS_URL = 'https://maps.google.com/?q=3+Rue+du+Bois+Arquet+74140+Douvaine';

/** Recalcul chaque minute (compte à rebours) et au retour au premier plan. */
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

/**
 * Carte « Prochaine visite » du tableau de bord : le prochain rendez-vous avec son compte à
 * rebours, le barber et les prestations ; sans rendez-vous à venir, la jauge de fraîcheur de la
 * carte Gang (stat FRA, jours depuis la dernière coupe) et l'appel à réserver.
 */
export default function NextVisitCard({ appointments, employees, gangCard, loading }) {
  const now = useNow();
  const next = nextAppointment(appointments, now);

  if (loading) return <div className="h-40 rounded-3xl bg-white/5 animate-pulse" aria-hidden="true" />;
  if (next) return <UpcomingCard apt={next} employees={employees} now={now} />;
  return <FreshnessCard card={gangCard} />;
}

function UpcomingCard({ apt, employees, now }) {
  const cd = countdownFor(apt, now);
  const barber = (employees || []).find((e) => String(e.id) === String(apt.employee_id));
  const names = serviceNames(apt);
  const price = Number(apt.total_price) || 0;

  return (
    <div className="shine-sweep rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/20 via-primary/[0.07] to-transparent p-4">
      <div className="absolute -top-16 -right-10 w-44 h-44 rounded-full bg-primary/20 blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="relative flex gap-4">
        <div className="w-[72px] shrink-0 rounded-2xl overflow-hidden border border-white/10"
          style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG }}>
          {barber?.photo_url ? (
            <img src={barber.photo_url} alt={barber.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Scissors className="w-6 h-6 text-primary/60" /></div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-semibold flex items-center gap-1.5">
            {cd.live && <span className="live-dot text-primary" aria-hidden="true" />}
            Prochaine visite
          </p>
          <p className="font-display text-2xl font-bold text-foreground leading-tight mt-1">{cd.main}</p>
          <p className="text-xs text-muted-foreground">{cd.sub}{apt.employee_name ? ` · avec ${apt.employee_name}` : ''}</p>
          {names.length > 0 && (
            <p className="text-[11px] text-foreground/75 mt-1.5 line-clamp-2">
              {names.join(' + ')}{price > 0 ? ` · ${formatPrice(price)}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-2 mt-4">
        <Link to="/appointments"
          className="h-10 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform">
          <CalendarClock className="w-3.5 h-3.5" /> Gérer
        </Link>
        <a href={MAPS_URL} target="_blank" rel="noopener noreferrer"
          className="h-10 rounded-xl bg-white/8 border border-white/10 text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform">
          <MapPin className="w-3.5 h-3.5" /> Itinéraire
        </a>
      </div>
    </div>
  );
}

function FreshnessCard({ card }) {
  const reduce = useReducedMotion();
  const fra = card?.stats?.FRA;
  const hasFra = Number.isFinite(Number(fra)) && card?.days_since_last != null;
  const value = hasFra ? Math.max(0, Math.min(99, Number(fra))) : 0;
  const low = hasFra && isGangStatLow('FRA', value);
  const days = Number(card?.days_since_last);
  const R = 34;
  const C = 2 * Math.PI * R;

  const title = !card
    ? 'Ta première coupe t\'attend'
    : low ? 'Il est temps de revenir' : 'Ta coupe tient la route';
  const subtitle = !card
    ? 'Réserve ta visite : ta carte Gang démarre dès la première.'
    : days === 0 ? 'Coupe faite aujourd\'hui, propre 🔥'
      : `Ta dernière coupe date de ${days} jour${days > 1 ? 's' : ''}.`;

  return (
    <div className={`rounded-3xl border p-4 ${low ? 'border-red-500/25 bg-red-500/[0.06]' : 'border-white/10 bg-white/[0.04]'}`}>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
            {hasFra && (
              <motion.circle
                cx="40" cy="40" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
                stroke={low ? '#ef4444' : 'hsl(var(--primary))'}
                strokeDasharray={C}
                initial={{ strokeDashoffset: C }}
                whileInView={{ strokeDashoffset: C * (1 - value / 100) }}
                viewport={{ once: true }}
                transition={{ duration: reduce ? 0 : 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {hasFra ? (
              <>
                <span className={`font-display text-xl font-bold leading-none ${low ? 'text-red-400' : 'text-foreground'}`}>{value}</span>
                <span className="text-[8px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">Fraîch.</span>
              </>
            ) : (
              <Sparkles className="w-6 h-6 text-primary float-soft" />
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg font-bold text-foreground leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>
      <Link to="/booking" className={`mt-4 block rounded-2xl ${low ? 'pulse-cta w-full' : 'orbit-wrap w-full'}`}>
        <motion.span whileTap={{ scale: 0.97 }}
          className="h-11 w-full rounded-[14px] bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2">
          Réserver ma coupe <ArrowRight className="w-4 h-4" />
        </motion.span>
      </Link>
    </div>
  );
}
