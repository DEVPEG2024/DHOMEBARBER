import React from 'react';
import OptInSwitch from './OptInSwitch';
import BlockedPlayers from './BlockedPlayers';

/**
 * « Tes réglages » en bas de l'accueil de la Coupe (accueil repensé, planche validée le 29 oct. 2026
 * au soir) : une seule carte pour « Apparaître dans le classement » (le salon : sa ligne est
 * toujours au classement), « Me proposer aux défis » (un client, avec la liste des joueurs),
 * « Laisser regarder mes matchs » (tout compte, avec `features.coupeSpectators` : contrat
 * docs/fonctions/coupe-spectateurs-contrat.md, section 2) et « Joueurs bloqués ». `me` :
 * `GET /coupe/me` (rien tant qu'il n'est pas lu).
 */
export default function SettingsCard({ me, isSalon = false, isClient = false, playersOn = false, spectatorsOn = false }) {
  if (!me) return null;
  const banned = me.banned === true;
  return (
    <section aria-labelledby="coupe-reglages" className="flex flex-col gap-3">
      <h2 id="coupe-reglages" className="font-fut text-[22px] font-extrabold uppercase leading-none tracking-[0.03em]">Tes réglages</h2>
      <div className="divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]">
        <OptInSwitch row value={me.opt_in} isSalon={isSalon} banned={banned} />
        {isClient && playersOn && (
          <OptInSwitch row kind="challenge" id="coupe-challenge-optin" value={me.challenge_opt_in === true} banned={banned} />
        )}
        {/* Exclu des classements ou non : ce choix ne touche pas aux classements */}
        {spectatorsOn && <OptInSwitch row kind="watch" id="coupe-watch-optin" value={me.watch_opt_in === true} />}
        <BlockedPlayers />
      </div>
    </section>
  );
}
