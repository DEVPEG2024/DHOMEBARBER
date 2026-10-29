import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { queryFailed } from '@/components/shared/LoadError';
import { useCoupeLeaderboard, useCoupeMe } from '@/lib/coupe/coupeApi';
import CoupeLoadError from '@/components/coupe/CoupeLoadError';
import CoupeShell from '@/components/coupe/hub/CoupeShell';
import PlayerAvatar, { RoleMark } from '@/components/coupe/hub/PlayerAvatar';
import LeaderboardRow, { RankNumber, displayName } from '@/components/coupe/hub/LeaderboardRow';
import OptInSwitch from '@/components/coupe/hub/OptInSwitch';
import PlayerSheet from '@/components/coupe/hub/PlayerSheet';
import {
  ROLE_BARBER, ROLE_SALON, currentSeason, hasAppHistory, isCoupeClosed, num, roleOfUser,
  seasonDaysLeft, seasonEndText, seasonMonth,
} from '@/components/coupe/hub/coupeFormat';

/*
 * Classement de La Coupe du Gang (/coupe/classement), d'après l'artboard « Classement » validé par
 * le propriétaire : Saison (le mois de Paris en cours) ou Général, podium, la liste (50 au plus,
 * `GET /coupe/leaderboard`), sa propre ligne, l'étoile bleue de « D'Home Barber » et les ciseaux
 * d'un barber, la fin de la saison et l'interrupteur « Apparaître dans le classement ».
 * Toucher un autre joueur ouvre sa fiche (Signaler, Bloquer).
 */
const SCOPES = [
  { value: 'season', id: 'coupe-onglet-saison' },
  { value: 'total', id: 'coupe-onglet-general' },
];

// Marches du podium : 1re au centre, 2e à gauche, 3e à droite
const PLACES = {
  1: { height: 104, size: 34, color: '#ebc15e', background: 'linear-gradient(180deg, rgba(235, 193, 94, .3), rgba(235, 193, 94, .06))' },
  2: { height: 74, size: 26, color: '#c9ced3', background: 'linear-gradient(180deg, rgba(201, 206, 211, .22), rgba(201, 206, 211, .06))' },
  3: { height: 56, size: 24, color: '#d7a275', background: 'linear-gradient(180deg, rgba(192, 138, 90, .26), rgba(192, 138, 90, .06))' },
};
const PODIUM_ORDER = [2, 1, 3];

function PodiumAvatar({ row, place }) {
  const first = place === 1;
  if (row.role !== ROLE_SALON && row.role !== ROLE_BARBER) {
    // Client : rond, la 1re place dans un anneau doré
    return first ? (
      <span className="block rounded-full p-1" style={{ background: 'linear-gradient(135deg, #f3d27a, #a8781f)' }}>
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
      {/* Deux lignes au plus : à 320 px, « D'Home Barber » ne tient pas sur une colonne */}
      <span className={`line-clamp-2 max-w-full break-words text-center text-[13.5px] leading-tight ${place === 1 || mine ? 'font-bold' : 'font-semibold'} ${mine ? 'text-[#ebc15e]' : ''}`}>
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
          className="flex w-full flex-col items-center gap-2 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ebc15e]"
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
            <span className="h-14 w-14 animate-pulse rounded-full bg-white/6" />
            <span className="h-3 w-16 animate-pulse rounded bg-white/6" />
            <span className="w-full animate-pulse rounded-b rounded-t-xl bg-white/6" style={{ height: h }} />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#12171a]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-white/6 px-3.5 py-3 last:border-0">
            <span className="h-9 w-9 animate-pulse rounded-full bg-white/6" />
            <span className="h-3.5 flex-1 animate-pulse rounded bg-white/6" />
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
    <CoupeShell title="Classement" titleId="coupe-classement-titre" onBack={goBack}>
      <div className="flex flex-col gap-[18px]">
        <div role="tablist" aria-label="Période du classement" className="grid grid-cols-2 gap-1 rounded-[14px] border border-white/8 bg-white/5 p-1">
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
                className={`min-h-[42px] rounded-[10px] px-2 py-1 font-fut text-[15px] font-bold uppercase leading-tight tracking-[0.03em] transition-colors min-[360px]:text-base min-[360px]:tracking-[0.06em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ebc15e] ${active ? 'bg-[#eef3ef] text-[#0b0e10]' : 'text-[#9db0a6] hover:text-[#eef3ef]'}`}
              >
                {s.value === 'season' ? `Saison${month ? ` · ${month}` : ''}` : 'Général'}
              </button>
            );
          })}
        </div>
        <p className="-mt-1.5 text-[12.5px] leading-snug text-[#9db0a6]">{subtitle}</p>

        <div role="tabpanel" id="coupe-classement-liste" aria-labelledby={activeTab.id} className="flex flex-col gap-[18px]">
          {closed ? (
            <p role="alert" className="rounded-2xl border border-white/8 bg-[#12171a] px-4 py-6 text-center text-[13px] text-[#9db0a6]">
              La Coupe du Gang fait une pause : le classement revient bientôt.
            </p>
          ) : failed ? (
            <CoupeLoadError compact what="le classement" error={error} onRetry={refetch} retrying={isFetching} />
          ) : isPending ? (
            <Skeleton />
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-white/8 bg-[#12171a] px-4 py-6 text-center text-[13px] leading-snug text-[#9db0a6]">
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
                <ul aria-label="Suite du classement" className="overflow-hidden rounded-2xl border border-white/8 bg-[#12171a]">
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
                        <li aria-hidden="true" className="border-b border-white/6 py-1 text-center text-xs leading-none tracking-[0.3em] text-[#5d6b64]">•••</li>
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
