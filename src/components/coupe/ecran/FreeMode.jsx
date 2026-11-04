import React from 'react';
import BigMatch from './BigMatch';
import { BarbersCard, LeaderboardCard, NextTournamentCard, RecentCard, SnakeCard, WatchQrCard } from './Cards';
import { barberRows } from './screenFormat';

/*
 * Mode libre de l'écran du salon (planche, écran 15) : classement de la saison, prochain tournoi,
 * « Dispo pour un match », derniers matchs et matchs joués aujourd'hui, record du Snake.
 * Un match ordinaire regardable (les deux joueurs ont allumé « Laisser regarder mes matchs ») passe
 * en grand à la place du prochain tournoi, avec son QR ; retour au mode libre 8 s après sa fin
 * (useBigMatch).
 *
 * Paysage : trois colonnes de la planche (380, 380, 376 px, marges de 36 px) ; portrait : le
 * prochain tournoi (ou le match, sur toute la largeur) en haut, puis deux colonnes.
 */

export default function FreeMode({ data, now, portrait, big, spectator }) {
  const { target, final } = big;
  // Beaucoup de barbers : un match de moins dans « Derniers matchs », pour tenir sans défiler
  const recentMax = barberRows(data).length > 3 ? 4 : 5;

  if (portrait) {
    return (
      <div className="flex h-full flex-col gap-7 p-7">
        {target ? (
          // Toute la largeur : la bande du score garde la place des noms
          <BigMatch target={target} final={final} spectator={spectator} className="h-[600px] shrink-0" />
        ) : (
          <NextTournamentCard next={data?.next_tournament} now={now} layout="row" className="shrink-0" />
        )}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-8">
          <LeaderboardCard data={data} />
          <div className="flex min-h-0 flex-col gap-[18px] overflow-hidden">
            {target && <WatchQrCard target={target} />}
            <BarbersCard data={data} />
            <RecentCard data={data} max={target ? 2 : recentMax} />
            {!target && <SnakeCard snake={data?.snake} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[380px_380px_376px] gap-x-9 p-9">
      <LeaderboardCard data={data} />
      {target ? (
        <BigMatch target={target} final={final} spectator={spectator} />
      ) : (
        <NextTournamentCard next={data?.next_tournament} now={now} />
      )}
      <div className="flex min-h-0 flex-col gap-[18px] overflow-hidden">
        {target && <WatchQrCard target={target} />}
        <BarbersCard data={data} />
        <RecentCard data={data} max={target ? 3 : recentMax} />
        {!target && <SnakeCard snake={data?.snake} />}
      </div>
    </div>
  );
}
