import React, { useState } from 'react';
import { LinkIcon } from './icons';
import { Hint } from './PlayModes';

/**
 * Onglet « Un ami » de « Contre qui ? » (accueil repensé, planche validée le 29 oct. 2026 au soir) :
 * les deux gestes l'un sous l'autre. « Créer un match » : salle en ligne (code à 4 chiffres à
 * montrer en personne, défi à envoyer : image et lien, affichés par l'écran de jeu). « Ton ami t'a
 * donné un code » : chiffres seulement, « Rejoindre » passe en rouge dès que les 4 sont là.
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
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] p-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color:var(--coupe-rouge-voile)] text-[color:var(--coupe-rouge-vif)]">
            <LinkIcon />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-fut text-xl font-extrabold uppercase leading-none tracking-[0.03em]">Ton ami est loin</span>
            <span className="text-[12.5px] leading-snug text-[color:var(--coupe-gris)]">Crée le match et envoie-lui le défi (image et lien).</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="min-h-[48px] rounded-xl bg-[color:var(--coupe-rouge)] px-4 font-fut text-[17px] font-extrabold uppercase leading-none tracking-[0.06em] text-white transition-transform motion-safe:active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Créer un match
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] p-3.5">
        <div>
          <label htmlFor="coupe-code" className="block font-fut text-xl font-extrabold uppercase leading-none tracking-[0.03em]">
            Ton ami t&apos;a donné un code
          </label>
          <p id="coupe-code-aide" className="mt-1 text-[12.5px] leading-snug text-[color:var(--coupe-gris)]">Les 4 chiffres affichés sur son téléphone.</p>
        </div>
        <div className="flex gap-2">
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
            className="h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-[color:var(--coupe-noir3)] px-3 text-center font-fut text-[26px] font-extrabold leading-none tracking-[0.3em] text-white tabular-nums placeholder:font-inter placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-[color:var(--coupe-gris)] focus:border-[color:var(--coupe-rouge-vif)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!ready}
            className="h-12 shrink-0 rounded-xl border border-white/40 px-4 font-fut text-[17px] font-extrabold uppercase leading-none tracking-[0.06em] text-white enabled:border-transparent enabled:bg-[color:var(--coupe-rouge)] disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Rejoindre
          </button>
        </div>
      </form>

      <Hint>Au salon tous les deux ? Crée le match et montre le code : rien à envoyer.</Hint>
    </div>
  );
}
