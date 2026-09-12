import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Shirt, Users, PartyPopper } from 'lucide-react';
import { formatEventDate, formatPrice } from '@/lib/salonEventsApi';
import { EASE, RESPONSE_STYLE, capacityInfo, eventImages, formatEventEnd, myResponse, phaseLabel, responseLabel } from './salonEventUtils';

function Badge({ tone = 'muted', children }) {
  const tones = {
    primary: 'bg-primary text-primary-foreground',
    red: 'bg-red-500/90 text-white',
    muted: 'bg-black/55 text-white/85 backdrop-blur-sm',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tones[tone] || tones.muted}`}>
      {children}
    </span>
  );
}

/** Jauge de places « 12 / 20 places » avec barre qui se remplit (transform seulement). */
export function CapacityGauge({ event, reduceMotion = false, compact = false }) {
  const cap = capacityInfo(event);
  if (cap.capacity == null) return null;
  const leftLabel = cap.left === 0 ? 'Complet' : `${cap.left} restante${cap.left > 1 ? 's' : ''}`;
  return (
    <div>
      <div className={`flex items-center justify-between gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span className="text-foreground font-semibold">{cap.accepted} / {cap.capacity}</span> places
        </span>
        <span className={cap.left === 0 ? 'text-red-400 font-semibold' : 'text-muted-foreground'}>{leftLabel}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          initial={{ scaleX: reduceMotion ? cap.pct / 100 : 0 }}
          animate={{ scaleX: cap.pct / 100 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
          style={{ transformOrigin: 'left' }}
          className={`h-full rounded-full ${cap.left === 0 ? 'bg-red-400' : 'bg-primary'}`}
        />
      </div>
    </div>
  );
}

/**
 * Carte d'un événement du salon dans « Vos invitations » : couverture (ou dégradé), badges
 * (aujourd'hui, complet, annulé, terminé), ma réponse, titre, prix, date / heure, lieu, tenue,
 * jauge de places. Tap → fiche (bottom sheet). Passés et annulés : grisés.
 */
export default function SalonEventCard({ event, onOpen, index = 0, reduceMotion = false }) {
  const phase = event.phase || 'upcoming';
  const cover = eventImages(event)[0] || null;
  const response = myResponse(event);
  const cap = capacityInfo(event);
  const isCancelled = phase === 'cancelled';
  const inactive = isCancelled || phase === 'past';
  const isToday = phase === 'today';
  const full = cap.full && response !== 'accepted';
  const style = RESPONSE_STYLE[response];
  const end = formatEventEnd(event);
  const needsAnswer = !inactive && !full && (response === 'invited' || response === 'open');

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.();
    }
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`${event.title} — ${formatEventDate(event.starts_at)}`}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.45, ease: EASE }}
      className={`w-full text-left rounded-3xl overflow-hidden border bg-card cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        inactive
          ? 'border-border opacity-60'
          : needsAnswer
            ? 'border-primary/30 shadow-lg shadow-primary/10'
            : 'border-border'
      }`}
    >
      <div className="relative aspect-[16/9] bg-secondary overflow-hidden">
        {cover ? (
          <img src={cover} alt="" className={`absolute inset-0 w-full h-full object-cover ${inactive ? 'grayscale' : ''}`} draggable={false} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a] flex items-center justify-center">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full" />
            <PartyPopper className="w-14 h-14 text-white/10" strokeWidth={1} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {isToday && <Badge tone="primary">Aujourd'hui</Badge>}
          {isCancelled && <Badge tone="red">Annulé</Badge>}
          {phase === 'past' && <Badge>Terminé</Badge>}
          {full && !inactive && <Badge tone="red">Complet</Badge>}
        </div>
        {!inactive && (
          <span className={`absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {responseLabel(event)}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between gap-3">
          <h3 className="font-fut text-2xl font-extrabold uppercase leading-none text-white line-clamp-2">{event.title}</h3>
          <span className="font-fut text-xl font-bold text-primary leading-none shrink-0">{formatPrice(event.price)}</span>
        </div>
      </div>

      <div className="p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary shrink-0" />
          <span>
            {formatEventDate(event.starts_at)}
            {end && <span className="text-muted-foreground font-normal"> → {end}</span>}
          </span>
        </p>
        {event.location && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="line-clamp-1">{event.location}</span>
          </p>
        )}
        {event.dress_code && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
            <Shirt className="w-3.5 h-3.5 shrink-0" />
            <span className="line-clamp-1">Tenue : {event.dress_code}</span>
          </p>
        )}
        {!inactive && cap.capacity != null && (
          <div className="pt-1">
            <CapacityGauge event={event} reduceMotion={reduceMotion} compact />
          </div>
        )}
        {inactive && (
          <p className={`text-[11px] font-semibold ${isCancelled ? 'text-red-400' : 'text-muted-foreground'}`}>
            {isCancelled ? 'Annulé par le salon' : phaseLabel(phase)}
            {response === 'accepted' && !isCancelled ? ' · tu y étais' : ''}
          </p>
        )}
      </div>
    </motion.div>
  );
}
