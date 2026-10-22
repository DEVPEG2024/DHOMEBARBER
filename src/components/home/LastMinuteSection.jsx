/**
 * Section « Last Minute » de l'accueil (`last-minute` de homepage_order, déplaçable par l'admin
 * dans « Organiser l'accueil ») : les créneaux libérés par le salon depuis l'agenda, **du jour
 * seulement**, en cartes orange animées ; carrousel de l'accueil (`SnapCarousel`) à partir de deux.
 * Rien sans créneau libre : le conteneur `.auto-section` vide est alors caché par l'accueil. Une
 * carte disparaît d'elle-même quand un client prend le créneau ou qu'il commence.
 *
 * Cartes compactes (demande du propriétaire, 20 oct. 2026 : « plus petites en hauteur ») : une
 * rangée photo + heure + barber + compte à rebours, puis « Réserver » et « Envoyer à un ami »
 * (partage, lib/lastMinute.js `shareLastMinute`) ; ~125 px de haut au lieu de ~215 à 275 px.
 * Animations en CSS (`.lm-*` d'index.css, transform / opacity seulement, coupées avec la réduction
 * des mouvements).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';
import SnapCarousel from '@/components/motion/SnapCarousel';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import { hapticFeedback } from '@/lib/capacitor';
import { track } from '@/lib/analytics';
import { barberFirstName, lastMinuteBookingUrl, lastMinuteLabels, shareLastMinute, useOpenLastMinutes } from '@/lib/lastMinute';

const CARD_BACKGROUND = 'linear-gradient(135deg, #431407 0%, #7c2d12 45%, #c2410c 100%)';

function LiveDot() {
  return (
    <span className="relative inline-block w-[7px] h-[7px] shrink-0" aria-hidden="true">
      <span className="lm-live absolute inset-0 rounded-full bg-amber-200" />
      <span className="absolute inset-0 rounded-full bg-amber-200" />
    </span>
  );
}

/**
 * Carte d'un créneau Last Minute. `from` : écran qui la montre, pour la mesure d'audience
 * (`home`, ou `feed` pour une publication du fil, 22 oct. 2026).
 */
export function LastMinuteCard({ slot, now, inCarousel = false, from = 'home' }) {
  const { day, chip, live } = lastMinuteLabels(slot, now);
  const name = barberFirstName(slot.barber);
  const photo = slot.barber?.photo_url;
  const when = `${day.toLowerCase()} à ${slot.start}`;

  const onBook = () => {
    hapticFeedback();
    track('last_minute_click', { from, day: day === "Aujourd'hui" ? 'today' : 'later' });
  };

  // Partage : aucune attente avant shareLastMinute (navigator.share exige le geste du client)
  const onShare = async () => {
    hapticFeedback();
    const how = await shareLastMinute(slot, now); // 'shared' | 'cancelled' | 'copied' | 'failed'
    if (how === 'copied') toast.success('Lien copié : collez-le dans un message à votre ami.');
    else if (how === 'failed') toast.error('Partage impossible sur cet appareil.');
    if (how === 'shared' || how === 'copied') track('last_minute_share', { from, method: how });
  };

  return (
    <article
      aria-label={`Créneau Last Minute ${when} avec ${name}`}
      className="lm-ring relative h-full rounded-[20px] p-[2px] bg-orange-500/35"
    >
      <div className="relative h-full overflow-hidden rounded-[18px] px-3 py-2.5 text-white" style={{ background: CARD_BACKGROUND }}>
        <span className="lm-shine" aria-hidden="true" />
        <div aria-hidden="true" className="pointer-events-none absolute -top-12 -right-10 w-32 h-32 rounded-full bg-orange-400/30 blur-3xl" />

        {/* Rangée principale : photo, « Last Minute », heure, barber ; compte à rebours à droite */}
        <div className="relative flex items-center gap-2.5">
          <span
            className="shrink-0 w-9 overflow-hidden rounded-[10px] border-2 border-orange-100/45 shadow-md shadow-black/30"
            style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG }}
          >
            {photo ? (
              <img src={photo} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span className="w-full h-full flex items-center justify-center font-fut text-lg font-bold text-orange-100">{name.charAt(0)}</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            {/* La pastille garde toujours « dans 1 h 25 » (sans « dans », « 1 h 25 » à côté de « 15:30 »
                se lisait comme une durée). Dans le carrousel sous 360 px, il ne reste pas la place pour
                « Last Minute » : l'éclair seul, l'en-tête au-dessus dit « 2 créneaux Last Minute ».
                La carte seule, en pleine largeur, garde le libellé entier (vérifié par e2e/last-minute.spec.js) */}
            <p className="flex items-center gap-1 text-[10px] font-extrabold tracking-[0.03em] min-[360px]:tracking-[0.16em] uppercase text-orange-200">
              <Zap className="lm-bolt w-3 h-3 shrink-0 fill-current" aria-hidden="true" />
              <span className={inCarousel ? 'hidden min-[360px]:inline truncate' : 'truncate'}>Last Minute</span>
            </p>
            {/* Une seule ligne : la fin du créneau se cache sous 360 px, jamais l'heure de début */}
            <p className="mt-0.5 font-fut leading-none text-white whitespace-nowrap">
              <span className="text-[26px] font-extrabold">{slot.start}</span>
              {slot.end && (
                <span className="hidden min-[360px]:inline text-[15px] font-bold text-orange-200">{' – '}{slot.end}</span>
              )}
            </p>
            <p className="mt-0.5 text-[13px] font-bold leading-tight truncate">avec {name}</p>
          </div>
          <span className="shrink-0 self-start inline-flex items-center gap-1 min-[360px]:gap-1.5 px-1.5 min-[360px]:px-2 py-1 rounded-full bg-black/25 border border-white/20 text-[11px] font-semibold text-orange-100 whitespace-nowrap">
            {/* Point « en direct » devant le compte à rebours seulement, jamais devant une date */}
            {live && <LiveDot />}
            {chip}
          </span>
        </div>

        {/* Actions : réserver (respiration sur l'enveloppe, jamais sur un élément motion), partager */}
        <div className="relative mt-2 flex items-stretch gap-2">
          <span className="lm-cta block flex-1 min-w-0">
            <Link
              to={lastMinuteBookingUrl(slot)}
              onClick={onBook}
              aria-label={`Réserver ce créneau, ${when} avec ${name}`}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white px-2 text-[13px] font-extrabold text-orange-800 shadow-md shadow-black/25 active:scale-[0.97] transition-transform"
            >
              Réserver
              <ArrowRight className="hidden min-[360px]:block w-4 h-4 shrink-0" strokeWidth={2.4} aria-hidden="true" />
            </Link>
          </span>
          <button
            type="button"
            onClick={onShare}
            aria-label={`Envoyer à un ami : ${when} avec ${name}`}
            className="shrink-0 flex h-10 items-center gap-1.5 rounded-xl border border-white/25 bg-black/25 px-2.5 text-[12px] font-bold text-orange-50 active:scale-[0.97] transition-transform"
          >
            <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Envoyer à un ami
          </button>
        </div>
      </div>
    </article>
  );
}

export default function LastMinuteSection() {
  const { slots, total, now } = useOpenLastMinutes();
  if (slots.length === 0) return null;

  if (slots.length === 1) {
    return (
      <section aria-label="Créneau Last Minute">
        <LastMinuteCard slot={slots[0]} now={now} />
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
      {/* 90 % : la carte suivante dépasse juste assez pour inviter à glisser, les deux boutons tiennent à 320 px */}
      <SnapCarousel itemWidth="90%" gap={10} autoplay={5200} label="Créneaux Last Minute" activeDotClass="bg-orange-500">
        {slots.map((slot) => (
          <LastMinuteCard key={slot.id ?? `${slot.employeeId}-${slot.date}-${slot.start}`} slot={slot} now={now} inCarousel />
        ))}
      </SnapCarousel>
    </section>
  );
}
