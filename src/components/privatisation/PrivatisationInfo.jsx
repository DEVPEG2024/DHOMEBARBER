/**
 * Privatiser le salon : sections d'information de la page (maquette validée « Après »).
 * - `HowItWorks` : les trois étapes, de la demande à la date confirmée ;
 * - `FormatsRow` : les trois formats (`TIME_SLOTS`), la journée en surbrillance ;
 * - `PrivatisationFaq` : questions fréquentes en accordéon, puis le téléphone du salon.
 */
import React, { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Phone } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { DEFAULT_SLOT, TIME_SLOTS } from './privatisationUtils';
import { useSalonPhone } from './usePrivatisation';

const SECTION_TITLE = 'font-display text-[22px] font-bold text-foreground';

// ---------------------------------------------------------------------------------------------
// Comment ça se passe
// ---------------------------------------------------------------------------------------------

const STEPS = [
  { title: 'Vous décrivez votre événement', text: 'Occasion, date, nombre de personnes et vos envies. Une minute.' },
  { title: 'Le salon vous envoie un devis', text: "Le prix et les détails arrivent dans l'app, avec une notification et un email." },
  // Seule une privatisation confirmée (payée) réserve le salon : pas de « la date est à vous » à l'acceptation
  { title: 'Vous acceptez, le salon confirme', text: 'Un tap pour accepter, vous réglez au salon, puis le salon confirme votre date.' },
];

// Pastille 1 pleine, 2 et 3 en contour (la 3e plus pâle) ; fond opaque pour masquer la ligne
const BADGE = [
  'bg-primary text-primary-foreground',
  'bg-background border-2 border-primary text-primary',
  'bg-background border-2 border-primary/45 text-primary',
];

export function HowItWorks() {
  const reduce = useReducedMotion();
  const inView = reduce ? {} : { initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '0px 0px -40px 0px' } };
  return (
    <Reveal as="section" aria-labelledby="privat-how-title">
      <h2 id="privat-how-title" className={`${SECTION_TITLE} mb-4`}>Comment ça se passe</h2>
      <motion.div
        {...inView}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }}
        className="relative"
      >
        {/* Ligne qui relie les étapes : elle se remplit de haut en bas à l'arrivée */}
        <motion.span
          aria-hidden="true"
          variants={{ hidden: { scaleY: 0 }, show: { scaleY: 1, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } }}
          className="absolute left-[17px] top-9 bottom-9 w-0.5 origin-top bg-gradient-to-b from-primary to-primary/15"
        />
        <ol className="relative flex flex-col gap-[18px]">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.title}
              variants={{
                hidden: { opacity: 0, x: -10 },
                show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
              }}
              className="relative flex items-start gap-3.5"
            >
              <span
                aria-hidden="true"
                className={`relative z-10 shrink-0 w-9 h-9 rounded-full font-fut text-xl font-extrabold flex items-center justify-center ${BADGE[i]}`}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="mt-1.5 text-[15px] font-semibold leading-snug text-foreground">{step.title}</p>
                <p className="mt-[3px] text-[13px] leading-[1.45] text-muted-foreground">{step.text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </motion.div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------------------------
// Trois formats
// ---------------------------------------------------------------------------------------------

export function FormatsRow() {
  return (
    <Reveal as="section" aria-labelledby="privat-formats-title">
      <h2 id="privat-formats-title" className={`${SECTION_TITLE} mb-3`}>Trois formats</h2>
      <ul className="grid grid-cols-3 gap-2">
        {TIME_SLOTS.map(slot => {
          const highlight = slot.id === DEFAULT_SLOT;
          return (
            <li
              key={slot.id}
              className={`min-w-0 rounded-2xl border px-2 py-3 min-[360px]:px-2.5 ${
                highlight ? 'bg-primary/10 border-primary/35' : 'bg-card border-border'
              }`}
            >
              {/* Libellé plus serré sous 360 px : « Après-midi » sur une ligne */}
              <p className={`text-[10px] tracking-[0.04em] min-[360px]:text-[11px] min-[360px]:tracking-[0.08em] font-semibold uppercase leading-tight break-words ${
                highlight ? 'text-primary' : 'text-muted-foreground'
              }`}>
                {slot.label}
              </p>
              {/* Taille réduite sur petit écran : « 14h – 20h » sans débordement à 320 px */}
              <p className="mt-1.5 font-fut text-[clamp(17px,5.6vw,22px)] font-bold leading-none text-foreground">
                {slot.hours}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-primary">{slot.durationLabel}</p>
            </li>
          );
        })}
      </ul>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------------------------
// Questions fréquentes
// ---------------------------------------------------------------------------------------------

function faqItems(phone) {
  return [
    {
      q: 'Combien ça coûte ?',
      a: "Ça dépend du format, du nombre de personnes et de vos envies. Le salon vous envoie un devis gratuit : vous l'acceptez ou le refusez dans l'app, sans engagement.",
    },
    {
      q: 'Le salon est-il fermé aux autres clients ?',
      a: "Oui. Une fois votre privatisation confirmée, plus aucun rendez-vous n'est pris sur votre créneau : le salon est à votre groupe.",
    },
    {
      q: "Faut-il payer à l'avance ?",
      a: "Rien ne se paie dans l'app. Après avoir accepté le devis, vous réglez au salon, puis le salon confirme votre date.",
    },
    {
      q: 'Et si je dois annuler ?',
      a: (
        <>
          {/* Le client ne peut que refuser un devis reçu : une demande en attente ou un devis accepté passent par le salon */}
          Dès que le devis arrive, vous pouvez le refuser dans l'app. Avant, ou une fois le devis accepté, appelez le salon au{' '}
          <a href={phone.href} className="font-semibold text-primary underline-offset-2 hover:underline whitespace-nowrap">
            {phone.display}
          </a>.
        </>
      ),
    },
  ];
}

function FaqItem({ id, question, answer, open, onToggle }) {
  const reduce = useReducedMotion();
  const buttonId = `${id}-question`;
  const panelId = `${id}-answer`;
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary rounded-2xl"
        >
          <span className="min-w-0">{question}</span>
          <ChevronDown
            aria-hidden="true"
            className={`w-[18px] h-[18px] shrink-0 transition-transform duration-300 motion-reduce:transition-none ${
              open ? 'rotate-180 text-primary' : 'text-muted-foreground'
            }`}
            strokeWidth={2}
          />
        </button>
      </h3>
      {/* Conteneur toujours présent (cible d'aria-controls) ; la réponse s'ouvre en hauteur */}
      <div id={panelId}>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="answer"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
              role="region"
              aria-labelledby={buttonId}
            >
              <p className="px-4 pb-4 text-[13px] leading-relaxed text-muted-foreground">{answer}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function PrivatisationFaq() {
  const phone = useSalonPhone();
  const baseId = useId();
  // Plusieurs réponses peuvent rester ouvertes ; la première l'est au départ
  const [openSet, setOpenSet] = useState(() => new Set([0]));
  const toggle = (i) => setOpenSet(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  const items = faqItems(phone);

  return (
    <Reveal as="section" aria-labelledby="privat-faq-title">
      <h2 id="privat-faq-title" className={`${SECTION_TITLE} mb-3`}>Questions fréquentes</h2>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <FaqItem
            key={item.q}
            id={`${baseId}-faq-${i}`}
            question={item.q}
            answer={item.a}
            open={openSet.has(i)}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>
      <a
        href={phone.href}
        aria-label={`Une autre question ? Appeler le salon au ${phone.display}`}
        className="mt-3 min-h-[52px] px-4 py-2 rounded-2xl border border-dashed border-border flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-[13px] text-muted-foreground hover:border-primary/40 transition-colors"
      >
        <Phone aria-hidden="true" className="w-4 h-4 shrink-0 text-primary" strokeWidth={2} />
        Une autre question ?
        <span className="font-semibold text-foreground whitespace-nowrap">{phone.display}</span>
      </a>
    </Reveal>
  );
}
