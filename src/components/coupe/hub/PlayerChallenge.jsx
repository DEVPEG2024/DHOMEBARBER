import React, { useState } from 'react';
import { queryFailed } from '@/components/shared/LoadError';
import CoupeLoadError from '../CoupeLoadError';
import PlayerAvatar from './PlayerAvatar';
import PlayerSheet from './PlayerSheet';
import { useCoupeOptIn } from './OptInSwitch';
import { ChallengeButton, StatusLine } from './BarberChallenge';
import { ROLE_USER } from './coupeFormat';

/**
 * Onglet « Joueurs » de « Contre qui ? » (demande du propriétaire du 29 oct. 2026 : jouer entre
 * clients, avec une liste des personnes à défier qui ont accepté d'y figurer, comme au classement ;
 * accueil repensé, planche validée le soir même) : les clients de `GET /coupe/players`, relus
 * toutes les 30 s. `reachable` faux = le défi ne le préviendrait pas (jeu fermé, notifications du
 * site pas activées, la nuit) : « Pas dispo ». Toucher l'avatar ou le nom ouvre sa fiche
 * (Signaler, Bloquer : App Store 1.2) ; un joueur bloqué disparaît de la liste. On ne cherche
 * jamais un client par son nom : seulement ces volontaires. Liste longue : 5 lignes, puis « Voir
 * les N joueurs ».
 *
 * Client absent de la liste : un bandeau le dit, avec « Activer » (même envoi que l'interrupteur
 * « Me proposer aux défis » de « Tes réglages »). L'équipe défie depuis la liste sans y figurer.
 */
const FIRST_ROWS = 5;

/** Joueurs de la liste (lignes lisibles) : la même liste sert au compteur de l'onglet. */
export function playersOf(query) {
  return Array.isArray(query.data) ? query.data.filter((p) => p && typeof p.key_hash === 'string') : [];
}

function PlayerRow({ player, onChallenge, onOpen }) {
  const name = String(player.name || 'Joueur');
  const on = player.reachable === true;
  return (
    <li className="flex items-center gap-3 border-b border-white/8 px-3.5 py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(player)}
        aria-haspopup="dialog"
        aria-label={`Fiche de ${name}`}
        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <PlayerAvatar role={ROLE_USER} name={name} url={player.photo_url} seed={player.key_hash} size="row" />
        <span className="flex min-w-0 flex-col">
          <span className={`truncate font-fut text-xl font-bold uppercase leading-none ${on ? 'text-white' : 'text-[color:var(--coupe-gris-clair)]'}`}>{name}</span>
          <StatusLine on={on} label={on ? 'Dispo' : 'Pas dispo pour l’instant'} />
        </span>
      </button>
      <ChallengeButton name={name} on={on} onClick={() => onChallenge(player)} />
    </li>
  );
}

/** « Tu n'es pas dans cette liste » + « Activer » (client, pas exclu par le salon). */
function JoinBanner() {
  const { pending, save } = useCoupeOptIn('challenge');
  return (
    <div className="mt-2.5 flex items-center gap-3 rounded-2xl border border-[color:var(--coupe-rouge-trait)] bg-[color:var(--coupe-rouge-fond)] px-3.5 py-3">
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-[color:var(--coupe-gris-clair)]">
        <span className="font-semibold text-white">Tu n’es pas dans cette liste.</span>{' '}
        Active « Me proposer aux défis » pour qu’on te défie.
      </p>
      <button
        type="button"
        onClick={() => save(true)}
        disabled={pending !== null}
        className="min-h-[44px] shrink-0 rounded-xl px-3 text-[13px] font-bold text-[color:var(--coupe-rouge-vif)] hover:bg-white/4 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        Activer
      </button>
    </div>
  );
}

export default function PlayerChallenge({ query, me = null, isClient = false, onChallenge }) {
  const [selected, setSelected] = useState(null);
  const [all, setAll] = useState(false);
  const failed = queryFailed(query);
  const list = playersOf(query);
  const shown = all ? list : list.slice(0, FIRST_ROWS);
  const showJoin = isClient && !!me && me.challenge_opt_in !== true && me.banned !== true;

  let body;
  if (failed) {
    body = <CoupeLoadError compact what="les joueurs" error={query.error} onRetry={query.refetch} retrying={query.isFetching} />;
  } else if (query.isPending) {
    body = (
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 ${i < 2 ? 'border-b border-white/8' : ''}`}>
            <span className="h-9 w-9 rounded-full bg-white/6 motion-safe:animate-pulse" />
            <span className="h-4 flex-1 rounded bg-white/6 motion-safe:animate-pulse" />
            <span className="h-11 w-20 rounded-xl bg-white/6 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    );
  } else if (list.length === 0) {
    body = (
      <p className="rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] px-4 py-4 text-center text-[13px] leading-snug text-[color:var(--coupe-gris)]">
        Personne n’est dans la liste pour l’instant.
      </p>
    );
  } else {
    body = (
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]">
        <ul>
          {shown.map((p) => <PlayerRow key={p.key_hash} player={p} onChallenge={onChallenge} onOpen={setSelected} />)}
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
    );
  }

  return (
    <>
      {body}
      {showJoin && <JoinBanner />}
      <PlayerSheet
        player={selected ? { key_hash: selected.key_hash, name: selected.name, role: ROLE_USER, avatar_url: selected.photo_url } : null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
