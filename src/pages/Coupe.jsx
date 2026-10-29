import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, PauseCircle, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { hapticFeedback } from '@/lib/capacitor';
import {
  COUPE_ENABLED_KEY, invalidateCoupe, useCoupeBarbers, useCoupeLeaderboard, useCoupeMe, useCoupeMusic,
  useCoupePlayers, useCoupePlayersEnabled,
} from '@/lib/coupe/coupeApi';
import { RESUME_EVENT, readPendingResume } from '@/lib/coupe/onlineMatch';
import { preloadStadium } from '@/lib/coupe/stadiumImage';
import { useAudioUnlockOnGesture, useSecondsLeft } from '@/components/coupe/game/hooks';
import { COUPE_COLORS } from '@/components/coupe/palette';
import CoupeShell, { HERO_BUTTON } from '@/components/coupe/hub/CoupeShell';
import { COUPE_VARS } from '@/components/coupe/hub/theme';
import PointsCard from '@/components/coupe/hub/PointsCard';
import OpponentTabs from '@/components/coupe/hub/OpponentTabs';
import { BotPanel, LocalPanel, MODES, ModePicker, StepTitle } from '@/components/coupe/hub/PlayModes';
import LeaderboardPreview from '@/components/coupe/hub/LeaderboardPreview';
import SettingsCard from '@/components/coupe/hub/SettingsCard';
import { TrophyIcon } from '@/components/coupe/hub/icons';
import {
  BOT_LEVELS, ROLE_BARBER, ROLE_SALON, ROLE_USER, hasAppHistory, homeFor, isCoupeClosed, roleOfUser,
} from '@/components/coupe/hub/coupeFormat';

/*
 * Accueil de La Coupe du Gang (/coupe), repensé d'après la planche validée par le propriétaire le
 * 29 oct. 2026 au soir (https://claude.ai/artifact/7SCyeV4pPNSeHtUzmZvW2m : « on ne comprend rien »
 * avant) : une question à la fois. Tes Points de Coupe en une bande (vers le classement) ;
 * « 1. Comment tu joues ? » (En ligne, Contre le salon, À deux) ; « 2. Contre qui ? » en ligne
 * (onglets Barbers, Joueurs : la liste des volontaires, seulement avec `features.coupePlayers`, Un
 * ami), « Ton niveau » contre le salon, « Installez-vous » à deux ; le haut du classement ; « Tes
 * réglages » (classement, « Me proposer aux défis », joueurs bloqués). Le mode, l'onglet et le
 * niveau choisis sont gardés le temps de l'onglet du navigateur (`useHubChoice`) : on les retrouve
 * en revenant d'une partie. Contrat : docs/fonctions/coupe-du-gang-contrat.md, sections 2 et 5.
 *
 * Thème stade (planche du 29 oct. 2026, maquette « CoupeAccueilRouge », docs/fonctions/
 * coupe-du-gang-stade.md) : en-tête sur le haut du stade, rouge pour les boutons, or pour le
 * trophée et les Points de Coupe. L'image du stade est chargée et décodée dès l'ouverture de la
 * page (`preloadStadium`) : l'avant-match du jeu ne l'attend pas.
 *
 * Plein écran, hors des mises en page, tout compte connecté (garde `RequireCoupe` d'App.jsx, qui
 * renvoie vers l'accueil quand `features.coupe` est faux).
 *
 * Partie ouverte : l'écran de jeu (`CoupeGame`, plein écran) remplace l'accueil.
 *  - Par l'adresse (contrat 5.1) : `?defi=<lien>` (défi reçu), `?challenge=<employee_id>` (bouton
 *    « Défier » du profil d'un barber), `?player=<key_hash>` (« Défier » de la liste des joueurs),
 *    `?mode=bot&level=apprenti|barber|boss`, `?mode=local`.
 *  - Depuis l'accueil : une entrée d'historique est ajoutée (mêmes paramètres ; état `coupeAction`
 *    pour « Défier un ami » et « J'ai un code ») : le retour du navigateur (ou d'Android, quand le
 *    jeu ne l'a pas pris) ramène à l'accueil de la Coupe, pas à la page d'avant.
 *  - Sortie (`onExit`) : retour à cette entrée, ou adresse nettoyée après un lien direct ; la Coupe
 *    est relue après chaque match (`invalidateCoupe`).
 *  - Match quitté sans l'abandonner (retour du navigateur en plein match…) : le serveur le garde
 *    10 s en pause ; l'accueil propose « Reprendre » (état `coupeAction: { t: 'resume' }`), et
 *    rouvrir le jeu le reprend de toute façon (CoupeGame).
 */
const CoupeGame = React.lazy(() => import('@/components/coupe/CoupeGame'));

const LEVELS = BOT_LEVELS.map((l) => l.value);
// Lien d'un défi : 12 caractères [a-z0-9] (contrat 4.2), un peu de marge ; id d'une fiche barber
const LINK_RE = /^[A-Za-z0-9]{4,64}$/;
const EMPLOYEE_RE = /^[A-Za-z0-9-]{1,64}$/;
// Clé publique d'un joueur de la liste (GET /coupe/players)
const PLAYER_RE = /^[0-9a-f]{32}$/;

/** Partie demandée par l'adresse ou par l'entrée d'historique posée par l'accueil ; null sinon. */
function gameFromLocation(params, state) {
  const defi = params.get('defi');
  if (defi !== null) {
    return LINK_RE.test(defi) ? { mode: 'online', action: { t: 'defi', link: defi } } : { invalid: 'defi' };
  }
  const challenge = params.get('challenge');
  if (challenge !== null) {
    return EMPLOYEE_RE.test(challenge)
      ? { mode: 'online', action: { t: 'challenge', employeeId: challenge } }
      : { invalid: 'challenge' };
  }
  const player = params.get('player');
  if (player !== null) {
    return PLAYER_RE.test(player)
      ? { mode: 'online', action: { t: 'challenge', keyHash: player } }
      : { invalid: 'challenge' };
  }
  const mode = params.get('mode');
  if (mode === 'bot') {
    const level = params.get('level');
    return { mode: 'bot', level: LEVELS.includes(level) ? level : LEVELS[0] };
  }
  if (mode === 'local') return { mode: 'local' };
  const action = state?.coupeAction;
  if (action?.t === 'create') return { mode: 'online', action: { t: 'create' } };
  if (action?.t === 'resume') return { mode: 'online', action: { t: 'resume' } };
  if (action?.t === 'join' && /^\d{4}$/.test(String(action.code ?? ''))) {
    return { mode: 'online', action: { t: 'join', code: String(action.code) } };
  }
  return null;
}

// Choix de l'accueil (mode, onglet en ligne, niveau du salon) : onglet du navigateur seulement,
// illisible ou refusé (navigation privée) = les valeurs par défaut
const CHOICE_KEY = 'cdg-accueil';
const CHOICE_DEFAULT = { mode: 'online', tab: 'barbers', level: LEVELS[0] };

function readChoice() {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHOICE_KEY) || 'null');
    if (!v || typeof v !== 'object') return CHOICE_DEFAULT;
    return {
      mode: MODES.includes(v.mode) ? v.mode : CHOICE_DEFAULT.mode,
      tab: ['barbers', 'players', 'friend'].includes(v.tab) ? v.tab : CHOICE_DEFAULT.tab,
      level: LEVELS.includes(v.level) ? v.level : CHOICE_DEFAULT.level,
    };
  } catch {
    return CHOICE_DEFAULT;
  }
}

function useHubChoice() {
  const [choice, setChoice] = useState(readChoice);
  const update = useCallback((patch) => {
    setChoice((prev) => {
      const next = { ...prev, ...patch };
      try { sessionStorage.setItem(CHOICE_KEY, JSON.stringify(next)); } catch { /* sans stockage : choix non gardé */ }
      return next;
    });
  }, []);
  return [choice, update];
}

/** Match quitté il y a moins de 10 s, à reprendre (relu quand il change, et après chaque départ du jeu). */
function usePendingResume() {
  const [entry, setEntry] = useState(null);
  useEffect(() => {
    // Lu après le montage : le jeu qu'on vient de quitter l'écrit en se démontant
    const read = () => setEntry(readPendingResume());
    read();
    window.addEventListener(RESUME_EVENT, read);
    return () => window.removeEventListener(RESUME_EVENT, read);
  }, []);
  return entry;
}

/** « Ton match contre Kevin est en pause » : 10 s pour y revenir, sinon défaite par forfait. */
function ResumeBanner({ entry, onResume }) {
  const left = useSecondsLeft(entry.until);
  if (left <= 0) return null;
  const opponent = entry.names?.[1] || 'ton adversaire';
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-[color:var(--coupe-rouge-trait)] bg-[color:var(--coupe-rouge-fond)] p-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color:var(--coupe-rouge-voile)] text-[color:var(--coupe-rouge-vif)]">
        <PauseCircle className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-fut text-lg font-bold uppercase leading-none tracking-[0.03em]">Match en pause</span>
        <span className="text-[12.5px] leading-snug text-[color:var(--coupe-gris-clair)]">
          Contre {opponent} : reviens dans {left} s, sinon c’est une défaite par forfait.
        </span>
      </span>
      <button
        type="button"
        onClick={onResume}
        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-[color:var(--coupe-rouge)] px-3.5 font-fut text-[15px] font-extrabold uppercase leading-none tracking-[0.06em] text-white transition-transform motion-safe:active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        Reprendre
      </button>
    </div>
  );
}

/** Pendant le chargement du jeu (morceau chargé à la demande) : même fond noir que l'écran de jeu. */
function GameLoading() {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center"
      style={{ ...COUPE_VARS, background: COUPE_COLORS.noir }}
      role="status"
      aria-label="Chargement du jeu"
    >
      <Loader2 className="h-7 w-7 text-[color:var(--coupe-rouge-vif)] motion-safe:animate-spin" aria-hidden="true" />
    </div>
  );
}

/** `COUPE_WS=off` côté serveur pendant que la page est ouverte : les routes répondent `disabled`. */
function ClosedNotice({ onBack }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] px-5 py-8 text-center">
      <PauseCircle className="h-8 w-8 text-[color:var(--coupe-rouge-vif)]" aria-hidden="true" />
      <p className="font-fut text-2xl font-extrabold uppercase leading-none tracking-[0.03em]">La Coupe fait une pause</p>
      <p className="max-w-xs text-[13px] leading-snug text-[color:var(--coupe-gris)]">Le salon a mis le jeu en pause pour le moment. Reviens un peu plus tard.</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-1 min-h-[44px] rounded-xl border border-white/40 px-5 font-fut text-base font-extrabold uppercase tracking-[0.06em] text-white hover:bg-white/6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Retour
      </button>
    </div>
  );
}

function CoupeHub({ openGame }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const role = roleOfUser(user);
  const isSalon = role === ROLE_SALON;

  const meQuery = useCoupeMe();
  // Seul écran qui relit les barbers toutes les 30 s (« Dispo » change pendant qu'on regarde)
  const barbersQuery = useCoupeBarbers({ poll: true });
  const leaderboardQuery = useCoupeLeaderboard('season');
  // Liste « Défier un joueur » : seulement si le serveur la connaît, relue toutes les 30 s
  const playersOn = useCoupePlayersEnabled();
  const playersQuery = useCoupePlayers({ enabled: playersOn, poll: true });
  const pendingResume = usePendingResume();
  const closed = [meQuery, barbersQuery, leaderboardQuery, playersQuery].some((q) => isCoupeClosed(q.error));

  // Coupure par le serveur : le drapeau est relu (l'accueil de l'app et le fil cachent la Coupe)
  useEffect(() => {
    if (closed) queryClient.invalidateQueries({ queryKey: COUPE_ENABLED_KEY });
  }, [closed, queryClient]);

  // L'écran de jeu se charge en arrière-plan : la partie s'ouvre sans attente au premier tap
  useEffect(() => {
    const id = setTimeout(() => { import('@/components/coupe/CoupeGame').catch(() => {}); }, 1200);
    return () => clearTimeout(id);
  }, []);

  const goBack = () => {
    if (hasAppHistory()) navigate(-1);
    else navigate(homeFor(user), { replace: true });
  };

  const barbers = Array.isArray(barbersQuery.data) ? barbersQuery.data : [];
  const ownEmployeeId = role === ROLE_BARBER && user?.employee_id != null ? String(user.employee_id) : null;
  const ownBarber = ownEmployeeId ? barbers.find((b) => String(b?.employee_id) === ownEmployeeId) : null;
  const me = {
    role,
    name: isSalon ? "D'Home Barber" : String(user?.full_name || 'Toi'),
    avatarUrl: role === ROLE_BARBER ? ownBarber?.photo_url || null : user?.photo_url || null,
    seed: String(user?.public_key || user?.id || ''),
  };
  const meData = meQuery.data && typeof meQuery.data === 'object' ? meQuery.data : null;
  const eligible = meData ? meData.eligible !== false : true;
  const isClient = role === ROLE_USER;
  const [choice, setChoice] = useHubChoice();
  const step2 = { online: 'Contre qui ?', bot: 'Ton niveau', local: 'Installez-vous' }[choice.mode];

  return (
    <CoupeShell
      titleId="coupe-titre"
      title={<>La <span className="text-[color:var(--coupe-or)]">Coupe</span> du Gang</>}
      onBack={goBack}
      action={(
        // Trophée en or (palette : or pour le trophée), sur le bouton rond de l'en-tête
        <Link to="/coupe/classement" aria-label="Classement" className={`${HERO_BUTTON} text-[color:var(--coupe-or)]`}>
          <TrophyIcon />
        </Link>
      )}
    >
      {closed ? (
        <ClosedNotice onBack={goBack} />
      ) : (
        <div className="flex flex-col gap-7">
          {pendingResume && (
            <ResumeBanner key={pendingResume.link} entry={pendingResume} onResume={() => openGame('', { coupeAction: { t: 'resume' } })} />
          )}
          <PointsCard query={meQuery} isSalon={isSalon} />
          <section aria-labelledby="coupe-etape1">
            <StepTitle n={1} id="coupe-etape1">Comment tu joues ?</StepTitle>
            <ModePicker value={choice.mode} onChange={(mode) => setChoice({ mode })} eligible={eligible} labelledBy="coupe-etape1" />
          </section>
          <section aria-labelledby="coupe-etape2">
            <StepTitle n={2} id="coupe-etape2">{step2}</StepTitle>
            {choice.mode === 'online' && (
              <OpponentTabs
                tab={choice.tab}
                onTab={(tab) => setChoice({ tab })}
                barbersQuery={barbersQuery}
                playersQuery={playersQuery}
                playersOn={playersOn}
                excludeEmployeeId={ownEmployeeId}
                me={meData}
                isClient={isClient}
                onChallengeBarber={(b) => openGame(`?challenge=${encodeURIComponent(b.employee_id)}`)}
                onChallengePlayer={(p) => openGame(`?player=${encodeURIComponent(p.key_hash)}`)}
                onCreate={() => openGame('', { coupeAction: { t: 'create' } })}
                onJoin={(code) => openGame('', { coupeAction: { t: 'join', code } })}
              />
            )}
            {choice.mode === 'bot' && (
              <BotPanel
                level={choice.level}
                onLevel={(level) => setChoice({ level })}
                onPlay={(level) => openGame(`?mode=bot&level=${level}`)}
                labelledBy="coupe-etape2"
              />
            )}
            {choice.mode === 'local' && <LocalPanel onPlay={() => openGame('?mode=local')} />}
          </section>
          <LeaderboardPreview query={leaderboardQuery} me={me} />
          <SettingsCard me={meData} isSalon={isSalon} isClient={isClient} playersOn={playersOn} />
        </div>
      )}
    </CoupeShell>
  );
}

export default function Coupe() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const game = useMemo(
    () => gameFromLocation(searchParams, location.state),
    [searchParams, location.state],
  );

  // Image du stade chargée et décodée dès l'ouverture (accueil, ou jeu ouvert par un lien) : le
  // premier coup d'envoi zoome dessus sans attendre le réseau (une seule fois par session)
  useEffect(() => { preloadStadium(); }, []);

  // Son débloqué pendant le clic qui ouvre une partie : musique et bruitages au coup d'envoi
  useAudioUnlockOnGesture(useCoupeMusic());

  // Lien de défi illisible (copié à moitié…) : on le dit et on nettoie l'adresse
  const invalid = game?.invalid || null;
  useEffect(() => {
    if (!invalid) return;
    toast.error(invalid === 'defi' ? 'Ce lien de défi n’est pas valable.' : 'Ce défi n’est pas valable.');
    navigate('/coupe', { replace: true });
  }, [invalid, navigate]);

  // Ouvre une partie depuis l'accueil : nouvelle entrée d'historique (le retour revient ici)
  const openGame = useCallback((search, state = {}) => {
    hapticFeedback();
    navigate({ pathname: '/coupe', search }, { state: { ...state, coupeFromHub: true } });
  }, [navigate]);

  // Sortie du jeu, une seule fois par partie (un double appel reculerait de deux pages)
  const exitedRef = useRef(null);
  const fromHub = !!location.state?.coupeFromHub;
  const closeGame = useCallback(() => {
    if (exitedRef.current === location.key) return;
    exitedRef.current = location.key;
    invalidateCoupe(queryClient);
    if (fromHub) navigate(-1);
    else navigate('/coupe', { replace: true });
  }, [fromHub, location.key, navigate, queryClient]);

  const onFinished = useCallback(() => { invalidateCoupe(queryClient); }, [queryClient]);

  if (game && !game.invalid) {
    // `data-coupe-*` : ce que l'accueil transmet au jeu, lu par e2e/coupe-accueil.spec.js (l'écran de
    // jeu lui-même est vérifié par e2e/coupe.spec.js)
    return (
      <div data-coupe-partie={game.mode} data-coupe-action={game.action?.t} data-coupe-niveau={game.level}>
        <Suspense fallback={<GameLoading />}>
          <CoupeGame
            key={location.key}
            mode={game.mode}
            level={game.level}
            action={game.action}
            onExit={closeGame}
            onFinished={onFinished}
          />
        </Suspense>
      </div>
    );
  }

  return <CoupeHub openGame={openGame} />;
}
