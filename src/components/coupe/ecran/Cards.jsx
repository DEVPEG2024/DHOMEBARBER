import React from 'react';
import coupeLogoUrl from '@/assets/coupe/logo-coupe.webp';
import { CARD, DISPLAY, LABEL, LIST, PlayerName, QrBox, ROW, ScreenPawn } from './ScreenParts';
import {
  COUPE_URL, barberRows, bigNumber, count, countdownText, dateLine, leaderboardRows, matchWatchUrl, msOf,
  playedTodayText, recentRows, registerUrl, seasonLabel, watchersText,
} from './screenFormat';

/*
 * Cartes de l'écran du salon (planche, écran 15 « le reste du temps », et colonne de droite de
 * l'écran 14) : classement de la saison, prochain tournoi, « Dispo pour un match », derniers matchs,
 * record du Snake, QR « Regarde sur ton téléphone ». Noms et chiffres seulement, jamais de photo.
 * Textes d'information à 16 px de scène au moins (décision A4 du contrat, section 6).
 */

/** Classement de la saison : 8 premières lignes, volontaires seulement (dit en bas de la carte). */
export function LeaderboardCard({ data, className = '' }) {
  const rows = leaderboardRows(data);
  const month = seasonLabel(data?.season);
  return (
    <section aria-labelledby="ecran-classement" className={`${CARD} flex min-h-0 flex-col pb-2 ${className}`}>
      <div className="flex items-baseline justify-between gap-3 px-3.5 pb-2 pt-4">
        <h2 id="ecran-classement" className={LABEL}>Classement de la saison</h2>
        {month && <span className="text-base text-[color:var(--coupe-gris)]">{month}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="px-3.5 py-3 text-base text-[color:var(--coupe-gris)]">Personne au classement pour le moment. Joue un match pour y entrer.</p>
      ) : (
        <ol className={LIST}>
          {rows.map((r) => (
            <li key={`${r.rank}-${r.name}`} className={`${ROW} py-[7px]`}>
              <span className={`w-[22px] text-center font-fut text-xl font-extrabold ${r.rank === 1 ? 'text-[color:var(--coupe-or)]' : 'text-[color:var(--coupe-gris)]'}`}>
                {r.rank}
              </span>
              <ScreenPawn name={r.name} role={r.role} />
              <PlayerName name={r.name} role={r.role} className={r.rank === 1 ? 'font-bold' : ''} />
              <span className="ml-auto font-fut text-xl font-extrabold tabular-nums text-[color:var(--coupe-or)]">{bigNumber(r.points)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mx-3.5 mb-1.5 mt-auto pt-3 text-base leading-snug text-[color:var(--coupe-gris)]">Seuls les joueurs qui ont choisi d’apparaître au classement.</p>
    </section>
  );
}

/**
 * Prochain tournoi : logo, nom, date, J − n, QR d'inscription et inscrits. Sans tournoi annoncé :
 * le logo et un QR vers la Coupe. `layout` : 'column' (planche, paysage) ou 'row' (portrait).
 */
export function NextTournamentCard({ next, now, layout = 'column', className = '' }) {
  const starts = msOf(next?.starts_at);
  const row = layout === 'row';
  const qrUrl = next ? registerUrl(next) : COUPE_URL;
  const size = count(next?.size) || 8;
  return (
    <section
      aria-labelledby="ecran-prochain-tournoi"
      className={`${CARD} flex min-h-0 ${row ? 'flex-row items-center gap-6 px-6 py-5' : 'flex-col items-center gap-2.5 px-5 py-[22px] text-center'} ${className}`}
      style={{ borderColor: 'rgba(235,193,94,.5)', background: 'linear-gradient(170deg, rgba(235,193,94,.14), rgba(20,20,22,.94) 45%)' }}
    >
      <img src={coupeLogoUrl} alt="La Coupe du Gang" decoding="async" className={`${row ? 'h-[170px] w-[170px]' : 'h-[150px] w-[150px]'} shrink-0 object-contain`} />
      <div className={`flex min-w-0 flex-1 flex-col ${row ? 'items-start gap-2' : 'items-center gap-2.5 self-stretch'}`}>
        <span className={LABEL}>{next ? 'Prochain tournoi' : 'La Coupe du Gang'}</span>
        <h2 id="ecran-prochain-tournoi" className={`${DISPLAY} line-clamp-2 text-[42px] [overflow-wrap:anywhere]`}>
          {next ? String(next.name || 'Tournoi') : 'Joue au salon'}
        </h2>
        {next ? (
          <>
            {starts != null && <p className="text-lg font-semibold">{dateLine(starts)}</p>}
            {starts != null && countdownText(starts, now) && (
              <p className={`${DISPLAY} mt-1 text-[34px] tabular-nums text-[color:var(--coupe-or)]`}>{countdownText(starts, now)}</p>
            )}
          </>
        ) : (
          <p className="text-lg font-semibold text-[color:var(--coupe-gris-clair)]">Foot façon air hockey, en ligne. Pas encore de tournoi annoncé.</p>
        )}
        <div className={`flex items-center gap-3.5 text-left ${row ? 'mt-2' : 'mt-auto'}`}>
          <QrBox url={qrUrl} size={120} label={next ? 'QR code pour s’inscrire au tournoi' : 'QR code pour jouer à La Coupe du Gang'} />
          <div className="flex flex-col gap-1">
            {next ? (
              <>
                <p className="text-lg font-bold">{`${count(next.registered)} / ${size} inscrits`}</p>
                <p className="text-base text-[color:var(--coupe-gris)]">Scanne pour t’inscrire</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold">Joue sur ton téléphone</p>
                <p className="text-base text-[color:var(--coupe-gris)]">Scanne pour ouvrir la Coupe</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** « Dispo pour un match » : « Dispo » ou « Pas dispo », rien d'autre. */
export function BarbersCard({ data, className = '' }) {
  const rows = barberRows(data);
  return (
    <section aria-labelledby="ecran-dispo" className={`${CARD} pb-1.5 ${className}`}>
      <h2 id="ecran-dispo" className={`${LABEL} px-3.5 pb-2 pt-4`}>Dispo pour un match</h2>
      {rows.length === 0 ? (
        <p className="px-3.5 pb-2.5 pt-1 text-base text-[color:var(--coupe-gris)]">Aucun barber pour le moment.</p>
      ) : (
        <ul className={LIST}>
          {rows.map((r, i) => (
            <li key={`${i}-${r.name}`} className={`${ROW} py-[7px]`}>
              <ScreenPawn name={r.name} role="barber" />
              <span className="truncate">{r.name}</span>
              {r.available ? (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-base font-bold text-[color:var(--coupe-or)]">
                  <span className="h-2 w-2 rounded-full bg-[color:var(--coupe-or)]" aria-hidden="true" />
                  Dispo
                </span>
              ) : (
                <span className="ml-auto shrink-0 text-base text-[color:var(--coupe-gris)]">Pas dispo</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Derniers matchs du jour et « n matchs joués aujourd'hui ». */
export function RecentCard({ data, max = 5, className = '' }) {
  const rows = recentRows(data, max);
  return (
    <section aria-labelledby="ecran-derniers" className={`${CARD} pb-1.5 ${className}`}>
      <h2 id="ecran-derniers" className={`${LABEL} px-3.5 pb-2 pt-4`}>Derniers matchs</h2>
      <ul className={LIST}>
        {rows.map((r, i) => (
          <li key={`${i}-${r.names.join('-')}`} className={`${ROW} py-[7px]`}>
            <span className="min-w-0 truncate">{`${r.names[0]} – ${r.names[1]}`}</span>
            <span className="ml-auto shrink-0 font-fut text-xl font-extrabold tabular-nums">{r.score}</span>
          </li>
        ))}
        <li className={`${ROW} py-[7px]`}>
          <span className="text-base text-[color:var(--coupe-gris)]">{playedTodayText(data?.played_today)}</span>
        </li>
      </ul>
    </section>
  );
}

/** Record du mois du Snake du Gang (rien sans record ou Snake fermé). */
export function SnakeCard({ snake, className = '' }) {
  if (!snake || typeof snake !== 'object' || !snake.name) return null;
  return (
    <section aria-labelledby="ecran-snake" className={`${CARD} flex flex-col gap-1.5 p-3.5 ${className}`}>
      <h2 id="ecran-snake" className={LABEL}>Snake du Gang · record du mois</h2>
      <div className="flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-lg font-bold">{String(snake.name)}</p>
        <span className={`${DISPLAY} shrink-0 text-[34px] tabular-nums text-[color:var(--coupe-or)]`}>{bigNumber(snake.score)}</span>
      </div>
    </section>
  );
}

/**
 * QR « Regarde sur ton téléphone » du match montré en grand, ou du tournoi (sans match en grand).
 * Spectateurs de la ligne `live` du match, sans compter l'écran du salon lui-même (décision A12).
 */
export function WatchQrCard({ target, tournamentUrl = null, className = '' }) {
  const url = target ? matchWatchUrl(target) : (tournamentUrl || COUPE_URL);
  return (
    <section aria-label="Sur ton téléphone" className={`${CARD} flex items-center gap-3.5 p-3.5 ${className}`}>
      <QrBox url={url} label={target ? 'QR code pour regarder ce match sur ton téléphone' : 'QR code pour suivre le tournoi sur ton téléphone'} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-[17px] font-bold">{target ? 'Regarde sur ton téléphone' : 'Suis le tournoi sur ton téléphone'}</p>
        <p className="text-base leading-snug text-[color:var(--coupe-gris)]">{target ? watchersText(target.watchers, target.screen === true) : 'Tableau et matchs en direct'}</p>
      </div>
    </section>
  );
}
