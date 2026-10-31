import React, { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { BookOpen, X } from 'lucide-react';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { useCoupeRulesV2 } from '@/lib/coupe/coupeApi';
import { COUPE_COLORS } from '../palette';
import { COUPE_VARS } from './theme';

/**
 * « Règles du match » sur l'accueil de la Coupe (règlement v2 du 31 oct. 2026, planche validée :
 * règlement écrit, docs/fonctions/coupe-du-gang-regles-v2.md) : un lien sous « Comment tu joues ? »
 * qui ouvre un volet du bas, fermé par sa croix (et Échap, et le retour d'Android), jamais par un
 * tap à côté. Seulement quand le serveur annonce le règlement v2 (`features.coupeRulesV2`) : sans
 * lui, rien ne change. Chiffres écrits ici (l'accueil ne charge pas le moteur pour un texte).
 * Thème stade : ouvert dans un portail, le volet pose lui-même la palette (`COUPE_VARS`).
 */

const SECTIONS = [
  {
    title: 'Le match',
    tone: COUPE_COLORS.rougeVif,
    lead: 'Premier à 5 buts',
    items: [
      '5 minutes de jeu au plus.',
      'Égalité au bout des 5 minutes : but en or.',
      'Dans tous les matchs : en ligne, contre le salon, à deux.',
    ],
  },
  {
    title: 'Balle en feu',
    badge: '+1',
    tone: COUPE_COLORS.feu,
    items: [
      'Une reprise de volée très forte met le ballon en feu.',
      'But en feu : 1 but, mais quel but.',
      'Il brûle la mousse et le gel, il s’éteint dans l’arrosage.',
    ],
  },
  {
    title: 'Balle électrique',
    badge: '+2',
    tone: COUPE_COLORS.elec,
    items: [
      'Pendant l’orage, le ballon qui passe là où la foudre est tombée se charge.',
      'Traînée bleue, plus rapide : un but électrique vaut 2 buts.',
      'Dans l’arrosage : court-circuit, le ballon fait un bond.',
    ],
  },
  {
    title: 'Fautes et penalty',
    tone: COUPE_COLORS.or,
    items: [
      'Rester plus de 3 s dans ta grande surface : penalty pour l’adversaire.',
      'Bloquer le ballon contre ton mur : penalty.',
      'Ballon gardé 5 s dans ton camp : avertissement, il change de camp. 3e avertissement du match : penalty.',
      'Penalty : 3 s pour tirer, le gardien reste sur sa ligne de but, entre les poteaux.',
    ],
  },
  {
    title: 'Événements au hasard',
    tone: COUPE_COLORS.blanc,
    items: [
      'Un toutes les 20 à 40 s, annoncé 1 s avant.',
      'Mousse à raser : le ballon ralentit. Gel : il glisse et accélère, jusqu’à prendre feu.',
      'Orage : 1 à 3 éclairs. Buts qui bougent : les cages glissent sur leur ligne.',
      'Arrosage : les jets poussent le ballon. Fumigène : la fumée le cache.',
      'Parfois l’arrosage arrive avec l’orage ou le gel : attention au court-circuit.',
    ],
  },
  {
    title: 'But en or',
    tone: COUPE_COLORS.or,
    items: [
      'Le prochain but gagne, quelle que soit sa valeur.',
      'Plus aucune règle : ni faute, ni penalty, ni événement.',
      'La ligne du milieu disparaît : tu peux monter chez l’adversaire (pas dans sa petite surface).',
      '2 minutes sans but : match nul.',
    ],
  },
];

function RulesSection({ section }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[color:var(--coupe-noir3)] p-4">
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: section.tone }} aria-hidden="true" />
        <h3 className="font-fut text-xl font-extrabold uppercase leading-none tracking-[0.03em]">{section.title}</h3>
        {section.badge && (
          <span className="ml-auto font-fut text-xl font-extrabold leading-none" style={{ color: section.tone }}>{section.badge}</span>
        )}
      </div>
      {section.lead && (
        <p className="mt-2.5 font-fut text-[28px] font-extrabold uppercase leading-none" style={{ color: section.tone }}>{section.lead}</p>
      )}
      <ul className="mt-2.5 flex flex-col gap-1.5 text-[13.5px] leading-snug text-[color:var(--coupe-gris-clair)]">
        {section.items.map((t) => (
          <li key={t} className="relative pl-3.5 before:absolute before:left-0 before:top-[7px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[color:var(--coupe-gris-sombre)]">{t}</li>
        ))}
      </ul>
    </section>
  );
}

/** Le volet lui-même (ouvert par `RulesLink`). */
export function RulesSheet({ open, onClose }) {
  useAndroidBack(open, onClose);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="kb-sheet-92 fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[560px] flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-[24px] border border-white/10 px-4 pt-5 font-inter text-white shadow-2xl outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-bottom-6 motion-safe:data-[state=open]:fade-in-0"
          style={{ ...COUPE_VARS, background: COUPE_COLORS.noir2, paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
        >
          <DialogPrimitive.Close
            className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-xl border border-white/12 bg-white/4 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
          <div className="pr-12">
            <DialogPrimitive.Title className="font-fut text-[28px] font-extrabold uppercase leading-none tracking-[0.03em]">
              Règles du match
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1.5 text-[13px] leading-snug text-[color:var(--coupe-gris)]">
              La Coupe du Gang, nouveau règlement.
            </DialogPrimitive.Description>
          </div>
          {SECTIONS.map((s) => <RulesSection key={s.title} section={s} />)}
          <p className="px-0.5 text-[12.5px] leading-snug text-[color:var(--coupe-gris)]">
            Le serveur arbitre tout : les deux téléphones voient la même chose. En ligne, contre une app
            pas encore à jour, le match se joue avec les règles d’avant (premier à 3 buts).
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Lien « Règles du match » (rien sans le règlement v2). */
export default function RulesLink({ className = '' }) {
  const rulesV2 = useCoupeRulesV2();
  const [open, setOpen] = useState(false);
  if (!rulesV2) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-1 text-[13.5px] font-semibold text-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${className}`}
      >
        <BookOpen className="h-4 w-4 text-[color:var(--coupe-or)]" aria-hidden="true" />
        Règles du match
      </button>
      <RulesSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
