import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { queryFailed } from '@/components/shared/LoadError';
import { useCoupeLeaderboard, useCoupeMe } from '@/lib/coupe/coupeApi';
import CoupeLoadError from '@/components/coupe/CoupeLoadError';
import { COUPE_COLORS } from '@/components/coupe/palette';
import CoupeShell from '@/components/coupe/hub/CoupeShell';
import PlayerAvatar, { RoleMark } from '@/components/coupe/hub/PlayerAvatar';
import LeaderboardRow, { RankNumber, displayName } from '@/components/coupe/hub/LeaderboardRow';
import OptInSwitch from '@/components/coupe/hub/OptInSwitch';
import PlayerSheet from '@/components/coupe/hub/PlayerSheet';
import {
  ROLE_BARBER, ROLE_SALON, currentSeason, hasAppHistory, isCoupeClosed, num, roleOfUser,
  seasonDaysLeft, seasonEndText, seasonMonth,
} from '@/components/coupe/hub/coupeFormat';
import { alpha, mix } from '@/components/coupe/hub/theme';

/*
 * Classement de La Coupe du Gang (/coupe/classement), d'après l'artboard « Classement » validé par
 * le propriétaire : Saison (le mois de Paris en cours) ou Général, podium, la liste (50 au plus,
 * `GET /coupe/leaderboard`), sa propre ligne, l'étoile bleue de « D'Home Barber » et les ciseaux
 * d'un barber, la fin de la saison et l'interrupteur « Apparaître dans le classement ».
 * Toucher un autre joueur ouvre sa fiche (Signaler, Bloquer).
 *
 * Thème stade (29 oct. 2026, docs/fonctions/coupe-du-gang-stade.md), dans l'esprit de l'accueil de
 * la Coupe : en-tête sur le haut du stade (plus bas que l'accueil, le podium reste en vue), 1re
 * place en or, 2e en blanc, 3e en gris clair, ta ligne en rouge.
 */
const SCOPES = [
  { value: 'season', id: 'coupe-onglet-saison' },
  { value: 'total', id: 'coupe-onglet-general' },
];

const { or: OR, blanc: BLANC, grisClair: GRIS_CLAIR } = COUPE_COLORS;
const step = (color, top, bottom) => `linear-gradient(180deg, ${alpha(color, top)}, ${alpha(color, bottom)})`;

// Marches du podium : 1re au centre, 2e à gauche, 3e à droite (textes des marches ≥ 5,4:1)
const PLACES = {
  1: { height: 104, size: 34, color: OR, background: step(OR, 0.3, 0.06) },
  2: { height: 74, size: 26, color: BLANC, background: step(BLANC, 0.18, 0.05) },
  3: { height: 56, size: 24, color: GRIS_CLAIR, background: step(GRIS_CLAIR, 0.12, 0.04) },
};
const PODIUM_ORDER = [2, 1, 3];
// Anneau doré de la 1re place : l'or éclairci vers l'or assombri
const FIRST_RING = `linear-gradient(135deg, ${mix(OR, BLANC, 0.3)}, ${mix(OR, COUPE_COLORS.noir, 0.35)})`;

function PodiumAvatar({ row, place }) {
  const first = place === 1;
  if (row.role !== ROLE_SALON && row.role !== ROLE_BARBER) {
    // Client : rond, la 1re place dans un anneau doré
    return first ? (
      <span className="block rounded-full p-1" style={{ background: FIRST_RING }}>
        <PlayerAvatar role={row.role} name={row.name} url={row.avatar_url} seed={row.key_hash} size="first" />
      </span>
    ) : (
      <PlayerAvatar role={row.role} name={row.name} url={row.avatar_url} seed={row.key_hash} size="podium" ring={PLACES[place].color} />
    );
  }
  return (
    <PlayerAvatar role={row.role} name={row.name} url={row.avatar_url} seed={row.key_hash} size={first ? 'first' : 'podium'} ring={PLACES[place].color} />
  );
}

function PodiumPlace({ row, place, onOpen }) {
  const style = PLACES[place];
  if (!row) return <li aria-hidden="true" />;
  const mine = !!row.me;
  const head = (
    <>
      <PodiumAvatar row={row} place={place} />
      {/* Deux lignes au plus : à 320 px, « D'Home Barber » ne tient pas sur une colonne. Ton nom
          en rouge vif (ta ligne est rouge partout) */}
      <span className={`line-clamp-2 max-w-full break-words text-center text-[13.5px] leading-tight ${place === 1 || mine ? 'font-bold' : 'font-semibold'} ${mine ? 'text-[color:var(--coupe-rouge-vif)]' : ''}`}>
        {displayName(row)}
        {row.role === ROLE_SALON || row.role === ROLE_BARBER ? (
          <span className="ml-1 inline-block align-[-1px]"><RoleMark role={row.role} size={12} /></span>
        ) : null}
      </span>
    </>
  );
  return (
    <li className="flex min-w-0 flex-col items-center gap-2">
      {mine || !onOpen ? (
        <div className="flex w-full flex-col items-center gap-2">{head}</div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(row)}
          aria-haspopup="dialog"
          className="flex w-full flex-col items-center gap-2 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {head}
        </button>
      )}
      <div
        className="flex w-full flex-col items-center justify-center gap-0.5 rounded-b rounded-t-xl"
        style={{ height: style.height, background: style.background, color: style.color }}
      >
        <RankNumber rank={place} className="font-fut font-extrabold leading-none" style={{ fontSize: style.size }} />
        <span className="text-xs tabular-nums">{num(row.points)} pts</span>
      </div>
    </li>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-3 items-end gap-2">
        {[74, 104, 56].map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <span className="h-14 w-14 rounded-full bg-white/6 motion-safe:animate-pulse" />
            <span className="h-3 w-16 rounded bg-white/6 motion-safe:animate-pulse" />
            <span className="w-full rounded-b rounded-t-xl bg-white/6 motion-safe:animate-pulse" style={{ height: h }} />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-white/8 px-3.5 py-3 last:border-0">
            <span className="h-9 w-9 rounded-full bg-white/6 motion-safe:animate-pulse" />
            <span className="h-3.5 flex-1 rounded bg-white/6 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoupeClassement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSalon = roleOfUser(user) === ROLE_SALON;
  const [scope, setScope] = useState('season');
  const [selected, setSelected] = useState(null);
  const tabsRef = useRef([]);

  const query = useCoupeLeaderboard(scope);
  // `/coupe/me` (souvent déjà en cache depuis l'accueil) : l'interrupteur et la saison restent
  // affichés pendant que l'autre période se charge
  const meQuery = useCoupeMe();
  const { data, error, refetch, isFetching, isPending } = query;
  const failed = queryFailed(query);
  const closed = isCoupeClosed(error);

  const rows = Array.isArray(data?.rows) ? data.rows.filter(Boolean) : [];
  // Places d'après le rang du serveur, jamais d'après la position : les joueurs bloqués par le
  // lecteur sont retirés sans renuméroter (un 1er bloqué laisse sa marche vide)
  const onPodium = (r) => num(r.rank) >= 1 && num(r.rank) <= 3;
  const podium = new Map(rows.filter(onPodium).map((r) => [num(r.rank), r]));
  const rest = rows.filter((r) => !onPodium(r));
  const mineListed = rows.some((r) => r.me);
  const meInfo = data?.me && typeof data.me === 'object' ? data.me : null;
  const myRank = num(meInfo?.rank) || null;
  const showMyExtraRow = !mineListed && myRank && meInfo?.opt_in !== false;

  // Saison du serveur (le classement général peut renvoyer « total ») ; sinon le mois de Paris
  const season = [data?.season, meQuery.data?.season, currentSeason()].find((s) => seasonMonth(s)) || '';
  const month = seasonMonth(season);
  const days = seasonDaysLeft({ season, seasonEndsAt: scope === 'season' ? data?.season_ends_at : meQuery.data?.season_ends_at });
  const subtitle = scope === 'season'
    ? [seasonEndText(days), 'Clients et barbers dans le même classement.'].filter(Boolean).join(' ')
    : 'Tous les matchs depuis le début. Clients et barbers dans le même classement.';
  const optIn = typeof meInfo?.opt_in === 'boolean' ? meInfo.opt_in : meQuery.data?.opt_in;

  const goBack = () => {
    if (hasAppHistory()) navigate(-1);
    else navigate('/coupe', { replace: true });
  };

  const selectTab = (index) => {
    const next = SCOPES[(index + SCOPES.length) % SCOPES.length];
    setScope(next.value);
    tabsRef.current[SCOPES.indexOf(next)]?.focus();
  };
  const onTabKey = (e, index) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); selectTab(index + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); selectTab(index - 1); }
  };
  const activeTab = SCOPES.find((s) => s.value === scope);

  return (
    <CoupeShell title="Classement" titleId="coupe-classement-titre" onBack={goBack} compact>
      <div className="flex flex-col gap-[18px]">
        <div role="tablist" aria-label="Période du classement" className="grid grid-cols-2 gap-1 rounded-[14px] border border-white/10 bg-white/5 p-1">
          {SCOPES.map((s, i) => {
            const active = s.value === scope;
            return (
              <button
                key={s.value}
                ref={(el) => { tabsRef.current[i] = el; }}
                id={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="coupe-classement-liste"
                tabIndex={active ? 0 : -1}
                onClick={() => setScope(s.value)}
                onKeyDown={(e) => onTabKey(e, i)}
                // Sous 360 px, « Saison · septembre » rétrécit puis passe sur deux lignes (jamais coupé)
                // Onglet choisi : blanc, texte noir ; l'autre en gris (8:1 sur le noir)
                className={`min-h-[44px] rounded-[10px] px-2 py-1 font-fut text-[15px] font-bold uppercase leading-tight tracking-[0.03em] min-[360px]:text-base min-[360px]:tracking-[0.06em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active ? 'bg-white text-[color:var(--coupe-noir)]' : 'text-[color:var(--coupe-gris)] hover:text-white'}`}
              >
                {s.value === 'season' ? `Saison${month ? ` · ${month}` : ''}` : 'Général'}
              </button>
            );
          })}
        </div>
        <p className="-mt-1.5 text-[12.5px] leading-snug text-[color:var(--coupe-gris)]">{subtitle}</p>

        <div role="tabpanel" id="coupe-classement-liste" aria-labelledby={activeTab.id} className="flex flex-col gap-[18px]">
          {closed ? (
            <p role="alert" className="rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] px-4 py-6 text-center text-[13px] text-[color:var(--coupe-gris)]">
              La Coupe du Gang fait une pause : le classement revient bientôt.
            </p>
          ) : failed ? (
            <CoupeLoadError compact what="le classement" error={error} onRetry={refetch} retrying={isFetching} />
          ) : isPending ? (
            <Skeleton />
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] px-4 py-6 text-center text-[13px] leading-snug text-[color:var(--coupe-gris)]">
              Personne n’est encore classé{scope === 'season' ? ' cette saison' : ''}. Joue un match en ligne pour ouvrir le bal.
            </p>
          ) : (
            <>
              {podium.size > 0 && (
                <ul aria-label="Podium" className="grid grid-cols-3 items-end gap-2">
                  {PODIUM_ORDER.map((place) => (
                    <PodiumPlace key={place} place={place} row={podium.get(place)} onOpen={setSelected} />
                  ))}
                </ul>
              )}

              {(rest.length > 0 || showMyExtraRow) && (
                <ul aria-label="Suite du classement" className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]">
                  {rest.map((row, i) => (
                    <LeaderboardRow
                      key={row.key_hash || `${row.rank}-${i}`}
                      row={row}
                      onOpen={setSelected}
                      last={!showMyExtraRow && i === rest.length - 1}
                    />
                  ))}
                  {showMyExtraRow && (
                    <>
                      {rest.length > 0 && (
                        <li aria-hidden="true" className="border-b border-white/8 py-1 text-center text-xs leading-none tracking-[0.3em] text-[color:var(--coupe-gris-sombre)]">•••</li>
                      )}
                      <LeaderboardRow
                        last
                        row={{
                          rank: myRank,
                          me: true,
                          role: roleOfUser(user),
                          name: isSalon ? "D'Home Barber" : String(user?.full_name || 'Toi'),
                          avatar_url: roleOfUser(user) === ROLE_SALON || roleOfUser(user) === ROLE_BARBER ? null : user?.photo_url || null,
                          key_hash: String(user?.public_key || user?.id || ''),
                          points: meInfo.points,
                          wins: meInfo.wins,
                          losses: meInfo.losses,
                        }}
                      />
                    </>
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        {(meInfo || meQuery.data) && !closed && <OptInSwitch value={optIn} isSalon={isSalon} banned={meQuery.data?.banned === true} />}
      </div>

      <PlayerSheet player={selected} onClose={() => setSelected(null)} />
    </CoupeShell>
  );
}
