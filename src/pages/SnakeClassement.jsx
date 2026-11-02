/**
 * Snake du Gang : classement du mois (/snake/classement, planche du 2 nov. 2026, `Classement.dc.html`).
 * Contrat : docs/fonctions/snake-du-gang-contrat.md, sections 0, 2 et 5.
 *
 *  - bandeau vert du mois (NOVEMBRE, « Saison d'un mois · N joueurs », FIN DANS N J) ;
 *  - liste numérotée des 50 premiers (`GET /snake/leaderboard`) : place (1re en or), initiales, nom,
 *    « Toi », niveau, score ; ta place sous la liste si tu es plus loin ;
 *  - pas volontaire mais classable : carte « Apparaître au classement » avec l'interrupteur
 *    (`PATCH /snake/settings`, comme « Vitesse et options ») ; l'admin et un compte retiré le lisent ;
 *  - « Battre mon record » ouvre directement la partie (`/snake?jouer=1`, lien `replace`).
 * Chargement : squelette ; échec : `queryFailed` puis `SnakeLoadError` avec « Réessayer ».
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import SnakeShell from '@/components/snake/SnakeShell';
import Lcd from '@/components/snake/Lcd';
import SnakeLoadError from '@/components/snake/SnakeLoadError';
import { SNAKE_COLORS as C } from '@/components/snake/palette';
import { SNAKE_BANNED_TEXT } from '@/components/snake/snakeErrors';
import LeaderboardRow from '@/components/snake/pages/LeaderboardRow';
import SnakeSwitch from '@/components/snake/pages/SnakeSwitch';
import { rankBlockedText, useSnakeOptIn } from '@/components/snake/pages/useSnakeOptIn';
import { queryFailed } from '@/components/shared/LoadError';
import { useAuth } from '@/lib/AuthContext';
import { daysLeft, initialsOf, nextSeasonMonth, ofSeason, seasonMonth } from '@/lib/snake/format';
import { useSnakeLeaderboard, useSnakeMe } from '@/lib/snake/snakeApi';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3DBE7E]';
const NOTE = 'm-0 text-[13px] leading-[1.45]';

const plural = (n, one, many) => (n === 1 || n === 0 ? one : many);

/** Bandeau vert du mois. */
function SeasonBanner({ season, players, endsAt }) {
  const month = seasonMonth(season);
  const left = daysLeft(endsAt);
  return (
    <Lcd innerClassName="flex items-center justify-between gap-3 px-3.5 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="m-0 truncate font-pixel text-xl font-bold">{(month || 'Ce mois-ci').toUpperCase()}</h2>
        <span className="text-[11px]" style={{ color: C.encreDouce }}>
          Saison d’un mois · {players} {plural(players, 'joueur', 'joueurs')}
        </span>
      </div>
      {left != null && (
        <div className="shrink-0 text-right">
          <div aria-hidden="true" className="text-[11px]" style={{ color: C.encreDouce }}>FIN DANS</div>
          <div aria-hidden="true" className="text-xl font-bold">{left} J</div>
          <span className="sr-only">Fin dans {left} {plural(left, 'jour', 'jours')}</span>
        </div>
      )}
    </Lcd>
  );
}

/** Squelette pendant le chargement : bandeau et quelques lignes. */
function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement du classement" className="flex flex-col gap-3.5">
      <div className="h-[76px] rounded-2xl motion-safe:animate-pulse" style={{ background: C.carte }} />
      <div className="flex flex-col gap-1">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 rounded-[14px] border motion-safe:animate-pulse" style={{ background: C.carte, borderColor: C.carteBord }} />
        ))}
      </div>
    </div>
  );
}

/** Carte « Apparaître au classement » : pas volontaire mais classable. */
function JoinCard({ me, optIn }) {
  const best = me?.season_best?.score;
  return (
    <section
      aria-labelledby="snake-rejoindre"
      className="flex items-center gap-3.5 rounded-[18px] border px-4 py-3.5"
      style={{ background: C.carte, borderColor: 'rgba(255, 255, 255, 0.08)' }}
    >
      <span className="hidden h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] min-[360px]:grid" style={{ background: 'rgba(61, 190, 126, 0.14)' }}>
        <Trophy className="h-6 w-6" style={{ color: C.vertTexte }} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="snake-rejoindre" className="m-0 text-[15px] font-semibold text-white">Apparaître au classement</h2>
        <p id="snake-rejoindre-aide" className="m-0 text-[13px] leading-snug" style={{ color: C.gris }}>
          {Number.isFinite(best) && best > 0
            ? `Tes ${best} points du mois s’afficheront ici. Prénom et initiale seulement.`
            : 'Prénom et initiale seulement.'}
        </p>
      </div>
      <SnakeSwitch
        checked={false}
        onChange={(v) => optIn.mutate(v)}
        disabled={optIn.isPending}
        labelledBy="snake-rejoindre"
        describedBy="snake-rejoindre-aide"
      />
    </section>
  );
}

export default function SnakeClassement() {
  const { user } = useAuth();
  const lb = useSnakeLeaderboard();
  const meQuery = useSnakeMe({ enabled: !!user });
  const optIn = useSnakeOptIn();

  const data = lb.data || null;
  const me = meQuery.data || null;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const season = data?.season || me?.season || '';
  const players = Number.isInteger(data?.players) ? data.players : rows.length;
  const myPlace = data?.me && !rows.some((r) => r.me) ? data.me : null;
  const blocked = rankBlockedText(me, user?.role, SNAKE_BANNED_TEXT);
  const showJoin = !!me && !blocked && me.opt_in === false;
  // Volontaire sans score ce mois-ci : il lui faut une partie (avec un score, sa ligne arrive à la relecture)
  const waitingForScore = !!me && !blocked && me.opt_in === true && !me.season_best && !data?.me;
  // « Battre mon record » ; « Jouer » tant que tu n'as fait aucune partie
  const cta = me && !me.record ? 'Jouer' : 'Battre mon record';

  let body;
  if (queryFailed(lb)) {
    body = <SnakeLoadError what="le classement" error={lb.error} onRetry={() => lb.refetch()} retrying={lb.isFetching} />;
  } else if (!data) {
    body = <Skeleton />;
  } else {
    body = (
      <>
        <SeasonBanner season={season} players={players} endsAt={data.season_ends_at} />
        {showJoin && <JoinCard me={me} optIn={optIn} />}

        {rows.length > 0 ? (
          <ol aria-label={`Meilleurs scores ${ofSeason(season) || 'du mois'}`} className="m-0 flex list-none flex-col gap-1 p-0">
            {rows.map((r) => (
              <LeaderboardRow key={`${r.rank}-${r.name}`} rank={r.rank} name={r.name} role={r.role} score={r.score} level={r.level} me={r.me === true} />
            ))}
          </ol>
        ) : (
          <p className="m-0 rounded-[14px] border px-4 py-5 text-center text-sm leading-snug" style={{ background: C.carte, borderColor: C.carteBord, color: C.grisClair }}>
            Personne n’a encore joué ce mois-ci. Lance une partie et prends la première place.
          </p>
        )}

        {myPlace && (
          <section aria-label="Ta place" className="flex flex-col gap-1">
            <span aria-hidden="true" className="text-center font-pixel text-sm leading-none" style={{ color: C.gris }}>···</span>
            <LeaderboardRow as="div" rank={myPlace.rank} name="Ta place" score={myPlace.score} level={myPlace.level} me initials={initialsOf(user?.full_name)} />
          </section>
        )}
        {waitingForScore && (
          <p className={NOTE} style={{ color: C.grisClair }}>Joue une partie ce mois-ci pour entrer au classement.</p>
        )}
        {blocked && <p className={NOTE} style={{ color: C.grisClair }}>{blocked}</p>}

        <p className={`${NOTE} mt-0.5`} style={{ color: C.gris }}>
          Ton meilleur score du mois compte.{nextSeasonMonth(season) ? ` Nouvelle saison le 1er ${nextSeasonMonth(season)}.` : ''} Aucun lot, juste la gloire.
        </p>
      </>
    );
  }

  return (
    <SnakeShell title="Classement" backTo="/snake" backLabel="Retour au menu du jeu" mainClassName="flex flex-1 flex-col gap-3.5 px-4 pb-5 pt-1">
      {body}
      <Link
        to="/snake?jouer=1"
        replace
        className={`mt-auto flex h-[52px] shrink-0 items-center justify-center rounded-[14px] font-fut text-[21px] font-extrabold uppercase tracking-[0.06em] text-white hover:brightness-110 ${FOCUS}`}
        style={{ background: C.vert }}
      >
        {cta}
      </Link>
    </SnakeShell>
  );
}
