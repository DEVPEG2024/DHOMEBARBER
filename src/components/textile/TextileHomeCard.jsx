import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Shirt, Flame, Users, Bell } from 'lucide-react';
import { TEXTILE_QUERY_KEY, fetchTextileOverview, msUntilOpen } from '@/lib/textileApi';
import { CompactCountdown } from './Countdown';
import { splitOverview, useNow, conceptCover } from './textileUtils';

function LiveDot() {
  return (
    <span className="relative inline-flex w-2 h-2" aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-primary opacity-70 animate-ping" />
      <span className="relative inline-flex w-2 h-2 rounded-full bg-primary" />
    </span>
  );
}

/**
 * Carte autonome pour l'accueil (insérée sous un SectionHeader par Home.jsx) : drop ouvert →
 * « Drop ouvert · N pièces », drop annoncé → compte à rebours vivant + abonnés, sinon le Labo.
 * Rend `null` tant qu'il n'y a rien à montrer (ni drop annoncé / ouvert, ni concept du Labo).
 */
export default function TextileHomeCard() {
  const { data } = useQuery({ queryKey: TEXTILE_QUERY_KEY, queryFn: fetchTextileOverview, staleTime: 60_000 });
  const view = useMemo(() => splitOverview(data), [data]);
  const featured = view.featured;
  const isLive = featured?.status === 'live';
  const isTeasing = featured?.status === 'teasing';
  // Une seule minuterie, uniquement quand un compte à rebours est affiché
  const nowMs = useNow(1000, isTeasing);

  if (!data) return null;
  if (!featured && view.labConcepts.length === 0) return null;

  const pieceCount = view.featuredConcepts.length;
  const alertsCount = Number(featured?.alerts_count) || 0;
  const remaining = isTeasing ? msUntilOpen(featured, nowMs) : null;
  const thumb = featured?.cover_image_url || conceptCover(view.featuredConcepts[0]) || conceptCover(view.labConcepts[0]);

  let eyebrow;
  let title;
  let subtitle;
  let cta;
  if (isLive) {
    eyebrow = <><LiveDot /> Drop ouvert</>;
    title = featured.name;
    subtitle = `Drop ouvert · ${pieceCount} pièce${pieceCount > 1 ? 's' : ''} à réserver`;
    cta = 'Réserver ta pièce';
  } else if (isTeasing) {
    eyebrow = <><Bell className="w-3 h-3 text-primary" /> Drop annoncé</>;
    title = featured.name;
    subtitle = (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {remaining != null ? <CompactCountdown ms={remaining} className="text-white text-sm" /> : <span>Ouverture bientôt</span>}
        {alertsCount > 0 && (
          <span className="inline-flex items-center gap-1 text-white/50"><Users className="w-3 h-3" />{alertsCount} abonné{alertsCount > 1 ? 's' : ''}</span>
        )}
      </span>
    );
    cta = 'Me prévenir';
  } else {
    eyebrow = <><Flame className="w-3 h-3 text-orange-400" /> Le Labo</>;
    title = 'Vote pour les prochaines pièces';
    subtitle = `${view.labConcepts.length} concept${view.labConcepts.length > 1 ? 's' : ''} en lice`;
    cta = 'Voir le Labo';
  }

  return (
    <Link to="/textile" className={`block rounded-3xl ${isLive ? 'pulse-card' : ''}`}>
      <motion.div whileTap={{ scale: 0.98 }} className="relative overflow-hidden rounded-3xl cursor-pointer group" style={{ minHeight: 132 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a]" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full group-hover:from-primary/30 transition-all duration-500" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-primary/10 to-transparent rounded-tr-full" />
        <div className="absolute inset-[1px] rounded-3xl border border-white/10" />
        <div className="relative h-full flex items-center justify-between gap-4 p-6">
          <div className="flex-1 min-w-0">
            {/* Le SectionHeader de l'accueil porte déjà « DHB Textile » : le sur-titre ne dit que l'état */}
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <Shirt className="w-4 h-4 text-primary shrink-0" />
              <p className="text-[10px] tracking-[0.25em] uppercase text-white/50 font-medium flex items-center gap-1.5 whitespace-nowrap truncate">
                {eyebrow}
              </p>
            </div>
            <h3 className="font-fut text-2xl font-extrabold uppercase leading-none text-white mb-1 truncate">{title}</h3>
            <p className="text-xs text-white/55">{subtitle}</p>
            <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-3 group-hover:gap-2 transition-all">
              {cta} <ArrowRight className="w-3 h-3" />
            </span>
          </div>
          {thumb ? (
            <img src={thumb} alt="" className="w-20 h-20 rounded-2xl object-cover border border-white/10 opacity-90 shrink-0" />
          ) : (
            <Shirt className="w-16 h-16 text-white/10 shrink-0" strokeWidth={1} />
          )}
        </div>
      </motion.div>
    </Link>
  );
}
