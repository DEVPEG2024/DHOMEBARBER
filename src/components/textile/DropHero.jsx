import React from 'react';
import { motion } from 'framer-motion';
import { Bell, BellRing, Shirt, Sparkles, Clock, Lock, Users } from 'lucide-react';
import { formatDropDate, msUntilOpen } from '@/lib/textileApi';
import Countdown from './Countdown';
import { EASE } from './textileUtils';

const PHASE_PILL = {
  upcoming: { label: 'Annoncé', className: 'bg-white/10 text-white border-white/15' },
  opening: { label: 'Ouverture…', className: 'bg-primary/20 text-primary border-primary/30' },
  live: { label: 'Drop ouvert', className: 'bg-primary text-primary-foreground border-primary' },
  ended: { label: 'Terminé', className: 'bg-white/8 text-white/50 border-white/10' },
};

function LiveDot() {
  return (
    <span className="relative inline-flex w-2.5 h-2.5" aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-primary opacity-70 animate-ping" />
      <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-primary" />
    </span>
  );
}

/**
 * Grande carte du drop en vedette : visuel de couverture, nom, pastille d'état, puis selon la
 * phase : compte à rebours + alerte (annoncé), « Ouverture… » (compte à rebours à zéro, statut
 * serveur pas encore basculé), bandeau « Drop ouvert » (live) ou « Drop terminé ».
 */
export default function DropHero({
  drop,
  phase,
  opening = false,
  nowMs,
  pieceCount = 0,
  subscribed = false,
  alertPending = false,
  onToggleAlert,
  reduceMotion = false,
}) {
  if (!drop) return null;
  const effectivePhase = opening ? 'opening' : phase;
  const pill = PHASE_PILL[effectivePhase] || PHASE_PILL.upcoming;
  const remaining = msUntilOpen(drop, nowMs);
  const alertsCount = Number(drop.alerts_count) || 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-3xl bg-[#0a0a0a] text-white shadow-xl shadow-black/30"
    >
      {/* Couverture */}
      <div className="relative aspect-[16/10]">
        {drop.cover_image_url ? (
          <img src={drop.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1b1f1d] via-[#0f1210] to-[#080908]">
            <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-primary/25 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-primary/10 blur-2xl" />
            <Shirt className="absolute right-6 top-6 w-24 h-24 text-white/6" strokeWidth={1} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/55 to-transparent" />
        <div className="absolute inset-[1px] rounded-3xl border border-white/10 pointer-events-none" />

        <div className="absolute inset-x-0 top-0 p-4 flex items-start justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-[0.18em] ${pill.className}`}>
            {effectivePhase === 'live' && <LiveDot />}
            {pill.label}
          </span>
          {pieceCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-[10px] font-semibold text-white/80 backdrop-blur-sm">
              <Shirt className="w-3 h-3 text-primary" />
              {pieceCount} pièce{pieceCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-semibold mb-1">Drop</p>
          <h2 className="font-fut text-[2.6rem] leading-[0.92] font-extrabold uppercase tracking-tight text-white drop-shadow-lg">
            {drop.name}
          </h2>
          {drop.tagline && <p className="text-sm text-white/65 mt-2 leading-snug">{drop.tagline}</p>}
        </div>
      </div>

      {/* État */}
      <div className="px-5 pb-5 pt-1">
        {effectivePhase === 'upcoming' && (
          <>
            {remaining != null ? (
              <div className="mt-2">
                <Countdown ms={remaining} reduceMotion={reduceMotion} />
                <p className="mt-3 text-center text-xs text-white/55 inline-flex w-full items-center justify-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  Ouverture {formatDropDate(drop.starts_at)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-center text-sm text-white/60 inline-flex w-full items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                Date d'ouverture bientôt annoncée
              </p>
            )}

            <div className="mt-4 flex flex-col items-center gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                disabled={alertPending}
                onClick={onToggleAlert}
                aria-pressed={subscribed}
                className={`inline-flex items-center gap-2 px-5 h-12 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-70 ${
                  subscribed
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                    : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                {subscribed ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                {subscribed ? 'Alerte activée' : 'Me prévenir'}
              </motion.button>
              <p className="text-[11px] text-white/50 inline-flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                {alertsCount > 0
                  ? `${alertsCount} personne${alertsCount > 1 ? 's' : ''} attend${alertsCount > 1 ? 'ent' : ''} ce drop`
                  : 'Sois le premier prévenu'}
              </p>
            </div>
          </>
        )}

        {effectivePhase === 'opening' && (
          <div className="mt-3 flex flex-col items-center gap-2 py-2">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="font-fut text-2xl font-bold uppercase tracking-wide text-white">Ouverture…</p>
            <p className="text-xs text-white/55">Les réservations s'ouvrent dans quelques secondes.</p>
          </div>
        )}

        {effectivePhase === 'live' && (
          <div className="mt-2 rounded-2xl bg-primary/12 border border-primary/25 px-4 py-3 flex items-center gap-3">
            <LiveDot />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Précommande ta pièce, paiement au salon</p>
              <p className="text-[11px] text-white/60">
                {drop.ends_at ? `Ouvert jusqu'au ${formatDropDate(drop.ends_at)}` : 'Ouvert tant qu\'il y a du stock'}
              </p>
            </div>
          </div>
        )}

        {effectivePhase === 'ended' && (
          <div className="mt-2 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3 text-white/60">
            <Lock className="w-4 h-4" />
            <p className="text-sm font-semibold">Drop terminé</p>
          </div>
        )}
      </div>
    </motion.section>
  );
}
