/**
 * Privatiser le salon : bloc d'accroche en tête de page (maquette validée « Après »). Titre, portraits
 * de l'équipe (barbers publics avec photo, format portrait), trois garanties et bouton « Demander un
 * devis » entouré de l'anneau lumineux orbital. `ctaRef` est posé sur le conteneur du bouton : la
 * page s'en sert pour afficher la barre fixée (`StickyRequestBar`) quand le bouton sort de l'écran.
 * Règles d'animation : transform et opacity seulement ; la classe CSS animée (`orbit-wrap`,
 * `float-soft`) va sur un conteneur, jamais sur l'élément animé par framer-motion.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Clock, FileText, PartyPopper, Wallet } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import { usePublicBarbers } from './usePrivatisation';

const PERKS = [
  { icon: Clock, title: 'Demi-journée', detail: 'ou journée entière' },
  { icon: FileText, title: 'Devis gratuit', detail: 'sans engagement' },
  { icon: Wallet, title: 'Rien en ligne', detail: 'paiement au salon' },
];

// Cascade d'arrivée du bloc (variants propagés aux enfants)
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
};
const portraitsVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.09 } },
};
const portraitVariants = {
  hidden: { opacity: 0, y: 22, scale: 0.92 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 220, damping: 22 } },
};

// Tailles des cadres : un peu plus petites sous 360 px pour tenir sans débordement à 320 px
const SIZE = {
  center: 'w-[104px] min-[360px]:w-[112px]',
  side: 'w-[88px] min-[360px]:w-[96px]',
};

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/**
 * Un portrait : arrivée (élément extérieur), flottement CSS (élément du milieu) et inclinaison qui
 * s'ouvre en éventail (élément intérieur) : trois éléments, aucun conflit sur `transform`.
 */
function Portrait({ barber, size, tilt = 0, featured = false, align = 'left', floatClass = '', className = '' }) {
  const reduce = useReducedMotion();
  const name = firstName(barber?.name);
  const frame = featured
    ? 'rounded-2xl border-2 border-primary/55 ring-[6px] ring-primary/10'
    : 'rounded-[14px] border-2 border-border';
  return (
    <motion.div variants={portraitVariants} className={`relative shrink-0 ${size} ${className}`}>
      <div className={reduce ? '' : floatClass}>
        <motion.div
          variants={{
            hidden: { rotate: 0 },
            show: { rotate: tilt, transition: { type: 'spring', stiffness: 140, damping: 15, delay: 0.25 } },
          }}
          className={`relative overflow-hidden shadow-xl shadow-black/40 ${frame}`}
          style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG }}
        >
          {barber ? (
            <>
              <img
                src={barber.photo_url}
                alt={name}
                draggable={false}
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 px-2 pb-1.5 bg-gradient-to-t from-black/80 to-transparent font-fut font-bold uppercase tracking-[0.06em] text-white truncate ${
                  featured ? 'pt-5 text-base' : 'pt-[18px] text-[15px]'
                } ${align === 'right' ? 'text-right' : ''}`}
              >
                {name}
              </span>
            </>
          ) : (
            // Emplacement de chargement : même cadre, aucune photo
            <span aria-hidden="true" className="absolute inset-0 bg-secondary motion-safe:animate-pulse" />
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Portraits de l'équipe : 3 (le premier au centre), 2 côte à côte, 1 centré ; rien sans photo. */
function TeamPortraits({ photos, loading }) {
  const slots = loading ? [null, null, null] : photos;
  if (!slots.length) return null;

  let row;
  if (slots.length >= 3) {
    // Ordre visuel : 2e à gauche, 1er au centre (devant), 3e à droite
    row = (
      <>
        <Portrait barber={slots[1]} size={SIZE.side} tilt={-8} floatClass="float-soft float-delay-1" className="mt-[22px]" />
        <Portrait barber={slots[0]} size={SIZE.center} featured floatClass="float-soft" className="z-10 -mx-6" />
        {/* Prénom à droite : le portrait central recouvre le bord gauche de celui-ci */}
        <Portrait barber={slots[2]} size={SIZE.side} tilt={8} align="right" floatClass="float-soft float-delay-2" className="mt-[22px]" />
      </>
    );
  } else if (slots.length === 2) {
    row = (
      <>
        <Portrait barber={slots[0]} size={SIZE.side} tilt={-8} floatClass="float-soft" className="mt-3" />
        <Portrait barber={slots[1]} size={SIZE.side} tilt={8} floatClass="float-soft float-delay-1" className="mt-3 -ml-2" />
      </>
    );
  } else {
    row = <Portrait barber={slots[0]} size={SIZE.center} featured floatClass="float-soft" />;
  }

  return (
    <motion.div variants={portraitsVariants} className="relative mt-[18px] h-[182px] min-[360px]:h-[188px]">
      <div className="absolute inset-x-0 top-1 flex justify-center items-start">{row}</div>
      {/* Pastille posée sur le bas des portraits (centrée par flex : pas de translate qui gênerait l'animation) */}
      <motion.div variants={itemVariants} className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-2">
        <span className="max-w-full inline-flex items-center gap-2 px-3 min-[360px]:px-3.5 py-[7px] rounded-full bg-background/90 border border-primary/35 text-[11px] min-[360px]:text-xs font-semibold leading-tight whitespace-nowrap text-foreground">
          <span aria-hidden="true" className="live-dot shrink-0 text-primary" />
          Toute l'équipe pour votre groupe
        </span>
      </motion.div>
    </motion.div>
  );
}

export default function PrivatisationHero({ onRequest, ctaRef }) {
  const reduce = useReducedMotion();
  const { barbers, isLoading } = usePublicBarbers();
  const photos = barbers.filter(b => b?.photo_url).slice(0, 3);

  const handleRequest = () => {
    hapticFeedback();
    onRequest?.();
  };

  return (
    <section
      aria-labelledby="privat-hero-title"
      className="relative overflow-hidden rounded-[28px] bg-card border border-border p-5"
    >
      {/* Halos décoratifs */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-[90px] -right-[70px] w-[260px] h-[260px] rounded-full bg-primary/20 blur-[60px]" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-[120px] -left-[90px] w-[200px] h-[200px] rounded-full bg-primary/10 blur-[50px]" />

      <motion.div
        variants={containerVariants}
        initial={reduce ? false : 'hidden'}
        animate="show"
        className="relative flex flex-col"
      >
        <motion.p
          variants={itemVariants}
          className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary"
        >
          <span aria-hidden="true" className="w-[22px] h-[22px] rounded-lg bg-primary/15 flex items-center justify-center">
            <PartyPopper className="w-[13px] h-[13px]" />
          </span>
          Privatisation
        </motion.p>

        <motion.h1
          variants={itemVariants}
          id="privat-hero-title"
          className="font-display text-[clamp(27px,8.6vw,34px)] font-bold leading-[1.1] text-foreground"
        >
          Le salon,<br />rien que pour vous
        </motion.h1>

        <motion.p variants={itemVariants} className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          EVJG, anniversaire, team building : on ferme les portes au public et toute l'équipe s'occupe de votre groupe.
        </motion.p>

        <TeamPortraits photos={photos} loading={isLoading && !photos.length} />

        <motion.ul variants={itemVariants} className="mt-[18px] grid grid-cols-3 gap-2">
          {PERKS.map(({ icon: Icon, title, detail }) => (
            <li
              key={title}
              className="min-w-0 rounded-[14px] bg-secondary/50 border border-border px-1 min-[360px]:px-2 py-2.5 flex flex-col items-center text-center gap-1"
            >
              <Icon aria-hidden="true" className="w-[18px] h-[18px] text-primary" strokeWidth={1.8} />
              <span className="max-w-full text-xs font-bold leading-tight text-foreground break-words">{title}</span>
              <span className="max-w-full text-[11px] leading-tight text-muted-foreground break-words">{detail}</span>
            </li>
          ))}
        </motion.ul>

        <motion.div variants={itemVariants} className="mt-[18px]">
          <span ref={ctaRef} className="orbit-wrap rounded-2xl w-full block shadow-lg shadow-primary/30">
            <motion.button
              type="button"
              whileTap={reduce ? undefined : { scale: 0.97 }}
              onClick={handleRequest}
              className="w-full h-[54px] rounded-[14px] bg-primary text-primary-foreground text-[15px] font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
            >
              Demander un devis
              <ArrowRight aria-hidden="true" className="w-[18px] h-[18px]" strokeWidth={2.2} />
            </motion.button>
          </span>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            1 minute pour décrire votre événement. Le salon vous répond dans l'app.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
