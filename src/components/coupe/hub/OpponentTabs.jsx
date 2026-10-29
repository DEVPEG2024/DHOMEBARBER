import React, { useRef } from 'react';
import BarberChallenge, { barbersOf } from './BarberChallenge';
import PlayerChallenge, { playersOf } from './PlayerChallenge';
import FriendChallenge from './FriendChallenge';

/**
 * « 2. Contre qui ? » en ligne (accueil repensé, planche validée le 29 oct. 2026 au soir) : trois
 * onglets, une seule liste à l'écran : Barbers, Joueurs (seulement avec `features.coupePlayers`),
 * Un ami. Le nombre de barbers ou de joueurs dispo s'affiche sur l'onglet. Onglets accessibles
 * (flèches gauche / droite, Début, Fin), choix gardé par l'accueil.
 */
const TAB_IDS = { barbers: 'coupe-onglet-barbers', players: 'coupe-onglet-joueurs', friend: 'coupe-onglet-ami' };
const PANEL_ID = 'coupe-adversaire';

export default function OpponentTabs({
  tab, onTab, barbersQuery, playersQuery, playersOn, excludeEmployeeId, me, isClient,
  onChallengeBarber, onChallengePlayer, onCreate, onJoin,
}) {
  const tabs = [
    { value: 'barbers', label: 'Barbers', count: barbersOf(barbersQuery, excludeEmployeeId).filter((b) => b.available).length },
    ...(playersOn ? [{ value: 'players', label: 'Joueurs', count: playersOf(playersQuery).filter((p) => p.reachable === true).length }] : []),
    { value: 'friend', label: 'Un ami', count: 0 },
  ];
  const current = tabs.some((t) => t.value === tab) ? tab : 'barbers';
  const refs = useRef({});

  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.value === current);
    let next = null;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    onTab(tabs[next].value);
    refs.current[tabs[next].value]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Adversaire"
        onKeyDown={onKeyDown}
        className="grid gap-1 rounded-[14px] border border-white/10 bg-[color:var(--coupe-noir2)] p-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => {
          const on = t.value === current;
          return (
            <button
              key={t.value}
              ref={(el) => { refs.current[t.value] = el; }}
              id={TAB_IDS[t.value]}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={PANEL_ID}
              tabIndex={on ? 0 : -1}
              onClick={() => onTab(t.value)}
              className={`flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${on ? 'bg-white text-[color:var(--coupe-noir)]' : 'text-[color:var(--coupe-gris-clair)] hover:bg-white/6'}`}
            >
              <span className="truncate">{t.label}</span>
              {/* Espace lu par un lecteur d'écran : « Barbers 2 dispo » */}
              {t.count > 0 && ' '}
              {t.count > 0 && (
                <span className="inline-grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-[color:var(--coupe-rouge)] px-1.5 text-[11px] font-bold text-white">
                  {t.count}<span className="sr-only"> dispo</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={TAB_IDS[current]} className="mt-2.5">
        {current === 'barbers' && (
          <BarberChallenge query={barbersQuery} excludeEmployeeId={excludeEmployeeId} onChallenge={onChallengeBarber} />
        )}
        {current === 'players' && (
          <PlayerChallenge query={playersQuery} me={me} isClient={isClient} onChallenge={onChallengePlayer} />
        )}
        {current === 'friend' && <FriendChallenge onCreate={onCreate} onJoin={onJoin} />}
      </div>
    </div>
  );
}
