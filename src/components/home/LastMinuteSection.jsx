/**
 * Section « Last Minute » de l'accueil (`last-minute` de homepage_order, déplaçable par l'admin
 * dans « Organiser l'accueil ») : les créneaux libérés par le salon depuis l'agenda, en cartes
 * orange animées dans le carrousel de l'accueil (`SnapCarousel`) ; une seule carte, plus grande,
 * quand il n'y a qu'un créneau. Rien sans créneau libre : le conteneur `.auto-section` vide est
 * alors caché par l'accueil. Une carte disparaît d'elle-même quand un client prend le créneau ou
 * qu'il commence. Animations en CSS (`.lm-*` d'index.css, transform / opacity seulement, coupées
 * avec la réduction des mouvements).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';
import SnapCarousel from '@/components/motion/SnapCarousel';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import { hapticFeedback } from '@/lib/capacitor';
import { track } from '@/lib/analytics';
import { barberFirstName, lastMinuteBookingUrl, lastMinuteLabels, useOpenLastMinutes } from '@/lib/lastMinute';

const CARD_BACKGROUND = 'linear-gradient(135deg, #431407 0%, #7c2d12 45%, #c2410c 100%)';

function LiveDot() {
  return (
    <span className="relative inline-block w-[7px] h-[7px] shrink-0" aria-hidden="true">
      <span className="lm-live absolute inset-0 rounded-full bg-amber-200" />
      <span className="absolute inset-0 rounded-full bg-amber-200" />
    </span>
  );
}

function LastMinuteCard({ slot, now, big = false }) {
  const { day, chip, live } = lastMinuteLabels(slot, now);
  const name = barberFirstName(slot.barber);
  const photo = slot.barber?.photo_url;
  const when = `${day.toLowerCase()} à ${slot.start}`;

  const onBook = () => {
    hapticFeedback();
    track('last_minute_click', { from: 'home', day: day === "Aujourd'hui" ? 'today' : 'later' });
  };

  return (
    <div className="relative h-full">
      {big && (
        <div
          aria-hidden="true"
          className="lm-halo pointer-events-none absolute inset-x-3 top-4 -bottom-3 rounded-[28px] blur-xl"
          style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(249,115,22,0.55), rgba(249,115,22,0) 70%)' }}
        />
      )}
      <article
        aria-label={`Créneau Last Minute ${when} avec ${name}`}
        className="lm-ring relative h-full rounded-3xl p-[2px] bg-orange-500/35"
      >
        <div className="relative h-full overflow-hidden rounded-[22px] p-4 text-white flex flex-col" style={{ background: CARD_BACKGROUND }}>
          <span className="lm-shine" aria-hidden="true" />
          <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-12 w-48 h-48 rounded-full bg-orange-400/35 blur-3xl" />

          {/* Sous 360 px, lettres moins espacées et pastille plus serrée : tout tient sur une ligne
              (« dans 10 h 45 » compris) ; au pire le libellé de gauche se coupe, jamais la pastille */}
          <div className="relative flex items-center justify-between gap-2">
            {big ? (
              <p className="flex min-w-0 items-center gap-2 text-xs font-extrabold tracking-[0.1em] min-[360px]:tracking-[0.18em] uppercase">
                <span className="lm-bolt shrink-0 w-6 h-6 min-[360px]:w-[26px] min-[360px]:h-[26px] rounded-[9px] bg-amber-200 text-orange-800 flex items-center justify-center" aria-hidden="true">
                  <Zap className="w-[15px] h-[15px] fill-current" />
                </span>
                <span className="truncate">Last Minute</span>
              </p>
            ) : (
              <p className="min-w-0 truncate text-[11px] font-extrabold tracking-[0.08em] min-[360px]:tracking-[0.14em] uppercase text-orange-200">{day}</p>
            )}
            <span className="shrink-0 inline-flex items-center gap-1.5 min-[360px]:gap-[7px] px-2 min-[360px]:px-2.5 py-1 rounded-full bg-black/25 border border-white/20 text-xs font-semibold text-orange-100 whitespace-nowrap">
              {/* Point « en direct » devant le compte à rebours seulement, jamais devant une date */}
              {live && <LiveDot />}
              {chip}
            </span>
          </div>

          <div className="relative mt-3.5 flex items-center gap-3.5">
            <span
              className={`shrink-0 overflow-hidden rounded-[14px] border-2 border-orange-100/45 shadow-lg shadow-black/30 ${big ? 'w-[76px]' : 'w-[60px]'}`}
              style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG }}
            >
              {photo ? (
                <img src={photo} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span className="w-full h-full flex items-center justify-center font-fut text-2xl font-bold text-orange-100">{name.charAt(0)}</span>
              )}
            </span>
            <div className="min-w-0">
              {big && <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-orange-200">{day}</p>}
              {/* Une seule ligne de 320 à 430 px : tailles qui suivent la largeur, tiret insécable */}
              <p className="font-fut leading-none text-white mt-0.5 whitespace-nowrap">
                <span className={`${big ? 'text-[clamp(40px,13vw,50px)]' : 'text-[clamp(34px,11vw,42px)]'} font-extrabold`}>{slot.start}</span>
                {slot.end && (
                  <span className={`${big ? 'text-[clamp(17px,5.6vw,22px)]' : 'text-[clamp(15px,5vw,19px)]'} font-bold text-orange-200`}>
                    {' – '}{slot.end}
                  </span>
                )}
              </p>
              <p className={`mt-1 font-bold truncate ${big ? 'text-base' : 'text-[15px]'}`}>avec {name}</p>
              {big && <p className="mt-0.5 text-[13px] text-orange-100">Une place est libre à la dernière minute.</p>}
            </div>
          </div>

          <div className="relative mt-auto pt-4">
            {/* Respiration sur l'enveloppe (jamais sur un élément motion) */}
            <span className="lm-cta block">
              <Link
                to={lastMinuteBookingUrl(slot)}
                onClick={onBook}
                aria-label={`Réserver ce créneau, ${when} avec ${name}`}
                className={`flex items-center justify-center gap-2 rounded-2xl bg-white font-extrabold text-orange-800 shadow-lg shadow-black/25 active:scale-[0.97] transition-transform ${big ? 'h-[52px] text-[15px]' : 'h-12 text-sm'}`}
              >
                Réserver ce créneau
                <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.4} aria-hidden="true" />
              </Link>
            </span>
            {big && <p className="mt-2 text-center text-[11px] text-orange-200">Premier qui réserve, premier servi.</p>}
          </div>
        </div>
      </article>
    </div>
  );
}

export default function LastMinuteSection() {
  const { slots, total, now } = useOpenLastMinutes();
  if (slots.length === 0) return null;

  if (slots.length === 1) {
    return (
      <section aria-label="Créneau Last Minute">
        <LastMinuteCard slot={slots[0]} now={now} big />
      </section>
    );
  }

  // Pas de nom sur la section : le carrousel est déjà une région nommée « Créneaux Last Minute »
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="inline-flex items-center gap-2 text-xs font-extrabold tracking-[0.16em] uppercase whitespace-nowrap text-orange-700 dark:text-orange-400">
          <Zap className="lm-bolt w-4 h-4 fill-current" aria-hidden="true" />
          {/* Plus de créneaux que de cartes : les plus proches seulement, et l'en-tête le dit */}
          {total > slots.length ? `${slots.length} prochains Last Minute` : `${slots.length} créneaux Last Minute`}
        </p>
        {/* Sous 360 px, le titre seul tient sur une ligne */}
        <span className="hidden min-[360px]:inline shrink-0 whitespace-nowrap text-xs text-muted-foreground">Faites glisser</span>
      </div>
      <SnapCarousel itemWidth="86%" gap={12} autoplay={5200} label="Créneaux Last Minute" activeDotClass="bg-orange-500">
        {slots.map((slot) => (
          <LastMinuteCard key={slot.id ?? `${slot.employeeId}-${slot.date}-${slot.start}`} slot={slot} now={now} />
        ))}
      </SnapCarousel>
    </section>
  );
}
