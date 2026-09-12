import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, PartyPopper, Check } from 'lucide-react';
import { SALON_EVENTS_QUERY_KEY, fetchMySalonEvents, formatEventDate, formatPrice } from '@/lib/salonEventsApi';
import { eventImages, myResponse, splitSalonEvents } from './salonEventUtils';

/**
 * Carte autonome pour l'accueil (insérée par Home.jsx) : prochain événement du salon à venir
 * où je suis invité, ou ouvert à tous → carte sombre style « Carte Cadeau » (couverture ou
 * dégradé, titre, date, « Répondre » / « Tu viens ✓ » / « Ouvert à tous »). Rend `null` sans
 * événement à venir, et reste silencieuse si la route échoue (aucune nouvelle tentative).
 */
export default function SalonEventHomeCard() {
  const { data } = useQuery({ queryKey: SALON_EVENTS_QUERY_KEY, queryFn: fetchMySalonEvents, staleTime: 60_000, retry: false });
  const next = useMemo(() => splitSalonEvents(data).next, [data]);

  if (!next) return null;

  const response = myResponse(next);
  const cover = eventImages(next)[0] || null;
  const isToday = next.phase === 'today';
  const needsAnswer = response === 'invited' || response === 'open';

  let eyebrow;
  let cta;
  if (response === 'accepted') {
    eyebrow = isToday ? "C'est aujourd'hui" : 'Tu es inscrit';
    cta = <><Check className="w-3 h-3" /> Tu viens ✓</>;
  } else if (response === 'open') {
    eyebrow = isToday ? "C'est aujourd'hui" : 'Événement du salon';
    cta = 'Ouvert à tous';
  } else if (response === 'declined') {
    eyebrow = 'Événement du salon';
    cta = "Voir l'événement";
  } else {
    eyebrow = isToday ? "C'est aujourd'hui" : 'Tu es invité';
    cta = 'Répondre';
  }

  return (
    <Link to="/events" className={`block rounded-3xl ${needsAnswer ? 'pulse-card' : ''}`}>
      <motion.div whileTap={{ scale: 0.98 }} className="relative overflow-hidden rounded-3xl cursor-pointer group" style={{ minHeight: 132 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a]" />
        {cover ? (
          <>
            <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-80 transition-opacity duration-500" draggable={false} />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/85 to-[#0a0a0a]/25" />
          </>
        ) : (
          <>
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full group-hover:from-primary/30 transition-all duration-500" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-primary/10 to-transparent rounded-tr-full" />
          </>
        )}
        <div className="absolute inset-[1px] rounded-3xl border border-white/10" />
        <div className="relative h-full flex items-center justify-between gap-4 p-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <PartyPopper className="w-4 h-4 text-primary shrink-0" />
              <p className="text-[10px] tracking-[0.25em] uppercase text-white/50 font-medium whitespace-nowrap truncate">{eyebrow}</p>
            </div>
            <h3 className="font-fut text-2xl font-extrabold uppercase leading-none text-white mb-1 truncate">{next.title}</h3>
            <p className="text-xs text-white/55 truncate">
              {formatEventDate(next.starts_at)} · {formatPrice(next.price)}
            </p>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold mt-3 group-hover:gap-2 transition-all ${response === 'accepted' ? 'text-green-400' : 'text-primary'}`}>
              {cta} <ArrowRight className="w-3 h-3" />
            </span>
          </div>
          {!cover && <PartyPopper className="w-16 h-16 text-white/10 shrink-0" strokeWidth={1} />}
        </div>
      </motion.div>
    </Link>
  );
}
