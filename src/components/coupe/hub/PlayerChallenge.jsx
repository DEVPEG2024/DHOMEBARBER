import React, { useState } from 'react';
import { queryFailed } from '@/components/shared/LoadError';
import CoupeLoadError from '../CoupeLoadError';
import PlayerAvatar from './PlayerAvatar';
import PlayerSheet from './PlayerSheet';
import OptInSwitch from './OptInSwitch';
import { ROLE_USER } from './coupeFormat';

/**
 * « Défier un joueur » (demande du propriétaire du 29 oct. 2026 : jouer entre clients, avec une
 * liste des personnes à défier qui ont accepté d'y figurer, comme au classement) : les clients de
 * `GET /coupe/players`, relus toutes les 30 s sur l'accueil de la Coupe. `reachable` faux = le défi
 * ne le préviendrait pas (jeu fermé, notifications du site pas activées, la nuit) : « Pas dispo ».
 * Toucher l'avatar ou le nom ouvre sa fiche (Signaler, Bloquer : App Store 1.2) ; un joueur bloqué
 * disparaît de la liste. On ne cherche jamais un client par son nom : seulement ces volontaires.
 *
 * L'interrupteur « Me proposer aux défis » (`challenge_opt_in`) est en bas de la section pour un
 * client ; l'équipe défie depuis la liste mais n'y figure pas (un barber a « Dispo pour un match »,
 * l'admin joue au nom du salon). Liste longue : les 5 premiers, puis « Voir les N joueurs ».
 * Thème stade : « Défier » rouge, comme pour les barbers.
 */
const FIRST_ROWS = 5;

function PlayerRow({ player, onChallenge, onOpen, last }) {
  const name = String(player.name || 'Joueur');
  const on = player.reachable === true;
  return (
    <li className={`flex items-center gap-3 px-3.5 py-2.5 ${last ? '' : 'border-b border-white/8'}`}>
      <button
        type="button"
        onClick={() => onOpen(player)}
        aria-haspopup="dialog"
        aria-label={`Fiche de ${name}`}
        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <PlayerAvatar role={ROLE_USER} name={name} url={player.photo_url} seed={player.key_hash} size="row" />
        <span className="flex min-w-0 flex-col gap-[5px]">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span className={`flex items-center gap-[5px] text-[11px] leading-none ${on ? 'text-white' : 'text-[color:var(--coupe-gris)]'}`}>
            <span
              className={`h-[7px] w-[7px] rounded-full ${on ? 'bg-white shadow-[0_0_0_3px_rgba(255,255,255,.2)]' : 'bg-[color:var(--coupe-gris-sombre)]'}`}
              aria-hidden="true"
            />
            {on ? 'Dispo' : 'Pas dispo'}
          </span>
        </span>
      </button>
      {on ? (
        <button
          type="button"
          onClick={() => onChallenge(player)}
          aria-label={`Défier ${name}`}
          className="min-h-[44px] shrink-0 rounded-xl bg-[color:var(--coupe-rouge)] px-4 font-fut text-[15px] font-extrabold uppercase leading-none tracking-[0.06em] text-white transition-transform motion-safe:active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Défier
        </button>
      ) : (
        <button
          type="button"
          disabled
          aria-label={`Défier ${name} : pas dispo`}
          className="min-h-[44px] shrink-0 rounded-xl border border-white/15 bg-transparent px-3 font-fut text-sm font-bold uppercase leading-none tracking-[0.06em] text-[color:var(--coupe-gris)]"
        >
          Pas dispo
        </button>
      )}
    </li>
  );
}

export default function PlayerChallenge({ query, me = null, isClient = false, eligible = true, onChallenge }) {
  const [selected, setSelected] = useState(null);
  const [all, setAll] = useState(false);
  const failed = queryFailed(query);
  const list = Array.isArray(query.data) ? query.data.filter((p) => p && typeof p.key_hash === 'string') : [];
  const shown = all ? list : list.slice(0, FIRST_ROWS);
  const optedIn = me?.challenge_opt_in === true;

  return (
    <section aria-labelledby="coupe-players-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="coupe-players-title" className="font-fut text-xl font-extrabold uppercase leading-none tracking-[0.04em]">
          Défier un joueur
        </h2>
        <span className="text-xs text-[color:var(--coupe-gris)]">{eligible ? 'En ligne · points en jeu' : 'En ligne · amical'}</span>
      </div>

      {failed ? (
        <CoupeLoadError compact what="les joueurs" error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
      ) : query.isPending ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 ${i < 2 ? 'border-b border-white/8' : ''}`}>
              <span className="h-9 w-9 rounded-full bg-white/6 motion-safe:animate-pulse" />
              <span className="h-4 flex-1 rounded bg-white/6 motion-safe:animate-pulse" />
              <span className="h-11 w-20 rounded-xl bg-white/6 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] px-4 py-4 text-center text-[13px] leading-snug text-[color:var(--coupe-gris)]">
          Personne n’est dans la liste pour l’instant.
          {isClient && !optedIn && <><br />Active « Me proposer aux défis » pour y figurer.</>}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]">
          <ul>
            {shown.map((p, i) => (
              <PlayerRow key={p.key_hash} player={p} onChallenge={onChallenge} onOpen={setSelected} last={i === shown.length - 1} />
            ))}
          </ul>
          {list.length > FIRST_ROWS && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              aria-expanded={all}
              className="min-h-[44px] w-full border-t border-white/8 font-fut text-sm font-bold uppercase tracking-[0.06em] text-[color:var(--coupe-gris-clair)] hover:bg-white/4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
            >
              {all ? 'Voir moins' : `Voir les ${list.length} joueurs`}
            </button>
          )}
        </div>
      )}

      {isClient && me && (
        <OptInSwitch kind="challenge" id="coupe-challenge-optin" value={optedIn} banned={me.banned === true} />
      )}

      <PlayerSheet
        player={selected ? { key_hash: selected.key_hash, name: selected.name, role: ROLE_USER, avatar_url: selected.photo_url } : null}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
