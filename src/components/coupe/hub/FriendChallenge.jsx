import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { LinkIcon } from './icons';

/**
 * « Défier un ami » (maquettes « Accueil de la Coupe » et « CoupeAccueilRouge ») : crée une salle en
 * ligne (code à 4 chiffres à montrer en personne + lien à partager, affichés par l'écran de jeu), et
 * « J'ai un code » pour rejoindre la salle d'un ami avec son code. « Rejoindre » passe en rouge
 * (bouton de jeu) dès que les 4 chiffres sont là.
 */
export default function FriendChallenge({ onCreate, onJoin }) {
  const [code, setCode] = useState('');
  const ready = /^\d{4}$/.test(code);

  const submit = (e) => {
    e.preventDefault();
    if (ready) onJoin(code);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] p-3.5 text-left text-white hover:bg-[color:var(--coupe-noir3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color:var(--coupe-rouge-voile)] text-[color:var(--coupe-rouge-vif)]">
          <LinkIcon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-fut text-lg font-bold uppercase leading-none tracking-[0.03em]">Défier un ami</span>
          <span className="text-[12.5px] leading-snug text-[color:var(--coupe-gris)]">Envoie un lien ou montre ton code au salon</span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[color:var(--coupe-gris)]" aria-hidden="true" />
      </button>

      <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] p-3.5">
        <label htmlFor="coupe-code" className="block font-fut text-[17px] font-bold uppercase leading-none tracking-[0.03em]">
          J&apos;ai un code
        </label>
        <p id="coupe-code-aide" className="mt-1 text-xs leading-snug text-[color:var(--coupe-gris)]">Les 4 chiffres affichés sur le téléphone de ton ami.</p>
        <div className="mt-3 flex gap-2.5">
          <input
            id="coupe-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="go"
            maxLength={4}
            placeholder="Code"
            aria-describedby="coupe-code-aide"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/4 px-3 text-center font-fut text-[26px] font-extrabold leading-none tracking-[0.3em] text-white tabular-nums placeholder:font-inter placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-[color:var(--coupe-gris)] focus:border-[color:var(--coupe-rouge-vif)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!ready}
            className="h-12 shrink-0 rounded-xl border border-white/20 px-4 font-fut text-base font-extrabold uppercase leading-none tracking-[0.06em] text-white enabled:border-transparent enabled:bg-[color:var(--coupe-rouge)] disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Rejoindre
          </button>
        </div>
      </form>
    </div>
  );
}
