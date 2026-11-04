import React from 'react';
import coupeLogoUrl from '@/assets/coupe/logo-coupe.webp';
import { CARD, DISPLAY } from './ScreenParts';

/*
 * Écran du salon sans données à montrer : sans clé, clé coupée par le salon, chargement, réseau
 * absent, écran fermé (COUPE_SPECTATEURS=off). Le logo de la Coupe et un message, au centre de la
 * scène (ScreenFrame), sans bouton : l'écran se remet à jour seul.
 */
export const MESSAGES = {
  nokey: {
    title: 'Écran du salon',
    text: 'Ouvre le lien de l’écran donné dans Admin → La Coupe du Gang.',
  },
  revoked: {
    title: 'Écran coupé par le salon',
    text: 'Ce lien ne marche plus. Pour rallumer l’écran, ouvre un nouveau lien créé dans Admin → La Coupe du Gang.',
  },
  loading: { title: 'La Coupe du Gang', text: 'Chargement de l’écran…' },
  offline: {
    title: 'Connexion perdue',
    text: 'On réessaie : l’écran se remet à jour dès que le réseau revient.',
  },
  closed: {
    title: 'Écran fermé pour le moment',
    text: 'Il se rallume tout seul dès que le salon le rouvre.',
  },
};

export default function ScreenMessage({ kind }) {
  const m = MESSAGES[kind] || MESSAGES.loading;
  const busy = kind === 'loading';
  return (
    <div className="flex h-full items-center justify-center p-12" aria-busy={busy || undefined}>
      <div role={busy ? undefined : 'status'} className={`${CARD} flex max-w-[620px] flex-col items-center gap-4 px-10 py-9 text-center`}>
        <img src={coupeLogoUrl} alt="" aria-hidden="true" decoding="async" className="h-[150px] w-[150px] object-contain" />
        <h1 className={`${DISPLAY} text-[44px]`}>{m.title}</h1>
        <p className="text-xl text-[color:var(--coupe-gris-clair)]">{m.text}</p>
      </div>
    </div>
  );
}
