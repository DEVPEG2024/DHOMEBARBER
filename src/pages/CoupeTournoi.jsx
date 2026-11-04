import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryFailed } from '@/components/shared/LoadError';
import { hapticFeedback } from '@/lib/capacitor';
import {
  COUPE_TOURNAMENTS_FLAG_KEY, checkinTournament, invalidateTournaments, lastLeftTournamentMatch, registerTournament,
  unregisterTournament, useCoupeMusic, useCoupeTournamentsFlagQuery, useSpectatorsEnabled, useTournament,
} from '@/lib/coupe/coupeApi';
import { preloadStadium } from '@/lib/coupe/stadiumImage';
import { useAudioUnlockOnGesture } from '@/components/coupe/game/hooks';
import CoupeLoadError from '@/components/coupe/CoupeLoadError';
import { coupeErrorText, isCoupeClosed } from '@/components/coupe/coupeErrors';
import PlayerSheet from '@/components/coupe/hub/PlayerSheet';
import { hasAppHistory } from '@/components/coupe/hub/coupeFormat';
import { BTN_OUTLINE, TournamentShell, useServerClock } from '@/components/coupe/tournoi/ui';
import RegistrationView from '@/components/coupe/tournoi/RegistrationView';
import PresenceView from '@/components/coupe/tournoi/PresenceView';
import DrawView from '@/components/coupe/tournoi/DrawView';
import BoardView from '@/components/coupe/tournoi/BoardView';
import ResultView from '@/components/coupe/tournoi/ResultView';
import { CancelledView, FinishedView, NoticeView } from '@/components/coupe/tournoi/EndViews';
import MatchStartDialog, { markMatchPrompted, wasMatchPrompted } from '@/components/coupe/tournoi/MatchStartDialog';
import { shareTournament } from '@/components/coupe/tournoi/share';
import {
  canJoin, forfeitPassed, iWon, isPlayable, myLastPlayed, phaseOf, roundsCount,
} from '@/components/coupe/tournoi/tournoiFormat';

/*
 * Page d'un tournoi de La Coupe du Gang (/coupe/tournoi/:id), d'après la planche validée par le
 * propriétaire le 3 nov. 2026 (https://claude.ai/artifact/S7Kk4Bv1c35Yz3acHuZk9r, écrans 2 à 9).
 * Contrat : docs/fonctions/coupe-tournois-contrat.md, section 6.
 *
 * L'écran suit l'état du tournoi et **l'heure du serveur** (`server_now` de la dernière réponse
 * plus le temps écoulé, jamais l'horloge du téléphone seule) :
 *  - inscriptions (écran 2) : s'inscrire, liste d'attente au-delà des places, se désinscrire ;
 *  - 15 min avant (écran 3) : « Je suis là », compte à rebours, présents ; s'inscrire vaut présence ;
 *  - tirage (écran 4) : animé les 30 s qui suivent `drawn_at` (liste tout de suite si le téléphone
 *    demande moins d'animations) ;
 *  - tableau en direct (écran 5) : scores en direct, « Jouer mon match » quand il est jouable →
 *    `/coupe?tmatch=<match>&tournoi=<tournoi>` (Coupe.jsx ouvre le jeu, sa sortie revient ici) ;
 *  - après ton match : « Qualifié ! » ou « Éliminé » (écran 8), puis le tableau ;
 *  - fini : « Champion » (écran 9) ou le podium ; annulé ; tournois en pause.
 * Relu toutes les 3 s pendant la présence et le tournoi (30 s avant), jamais onglet caché.
 * Sans `features.coupeTournaments` : aucune lecture des tournois, « Les tournois font une pause ».
 *
 * Retour du jeu (Coupe.jsx retient le match quitté) : tant que le tournoi n'a pas été relu depuis
 * la sortie du jeu, la page attend (« Mise à jour du tableau… ») au lieu de montrer le tableau
 * d'avant le match, avec « Jouer mon match » sur le match qu'on vient de jouer ; match fini que le
 * serveur dit encore à jouer : quelques secondes de plus.
 * Connexion perdue avec un tournoi déjà affiché : bandeau « Connexion perdue, on réessaie… », plus
 * de « En direct », l'heure figée (comptes à rebours signalés « figé »), « Jouer mon match » grisé.
 * Ton match devient jouable pendant que la page est ouverte et visible : fenêtre « Ton match
 * commence » (5 s, puis le jeu s'ouvre seul), une seule fois par match.
 * Spectateurs (`features.coupeSpectators`, docs/fonctions/coupe-spectateurs-contrat.md, section
 * 4.3) : « Regarder » sur les matchs en cours du tableau (sauf le sien), et la mention « ouverts aux
 * spectateurs » à l'inscription ; rien sans le drapeau.
 */
const FALLBACKS = {
  register: 'Inscription impossible. Réessaie dans un instant.',
  unregister: 'Désinscription impossible. Réessaie dans un instant.',
  checkin: 'Présence non enregistrée. Réessaie dans un instant.',
};
const TOURNAMENTS_PAUSED = 'Les tournois font une pause : reviens un peu plus tard.';

// Match fini que le serveur dit encore « à jouer » au retour du jeu : la page attend jusqu'à 8 s
const RESULT_LAG_MS = 8 * 1000;

function Loading({ onBack, text = null }) {
  return (
    <TournamentShell onBack={onBack}>
      {text && <p role="status" className="pb-3 pt-1 text-sm text-[color:var(--coupe-gris-clair)]">{text}</p>}
      <div aria-busy="true" aria-label="Chargement du tournoi" className="flex flex-col gap-3.5 pt-2">
        <span className="h-4 w-40 rounded bg-white/6 motion-safe:animate-pulse" />
        <span className="h-10 w-64 rounded bg-white/6 motion-safe:animate-pulse" />
        <span className="h-24 w-full rounded-2xl bg-white/6 motion-safe:animate-pulse" />
        <span className="h-40 w-full rounded-2xl bg-white/6 motion-safe:animate-pulse" />
      </div>
    </TournamentShell>
  );
}

/**
 * Note du tableau pour qui n'y joue pas : retiré par le salon (d'abord : il n'est plus inscrit pour
 * le serveur), spectateur, absent, présent sans place au tirage (`out` sans tête de série).
 */
function boardNote(t) {
  const me = t.me || {};
  if (me.status === 'removed') return 'Le salon t’a retiré de ce tournoi : tu le suis en spectateur.';
  if (!me.registered) return 'Tu n’es pas inscrit à ce tournoi : tu le suis en spectateur, scores en direct.';
  if (me.status === 'absent') return 'Tu n’as pas confirmé ta présence à temps : tu suis le tournoi d’ici.';
  const inBracket = (t.players || []).some((p) => p?.me && p.seed != null);
  if (!inBracket) return 'Le tableau était complet : tu suis le tournoi en spectateur.';
  return null;
}

/** Valeur figée tant que `active` est vrai (prise au moment où il le devient). */
function useFrozen(active, value) {
  const ref = useRef(null);
  if (!active) ref.current = null;
  else if (ref.current == null) ref.current = value;
  return active ? ref.current : value;
}

export default function CoupeTournoi() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const flag = useCoupeTournamentsFlagQuery();
  const on = flag.data === true;
  const spectatorsOn = useSpectatorsEnabled();
  const query = useTournament(id, { enabled: on });
  const t = query.data && typeof query.data === 'object' && query.data.id ? query.data : null;
  // Connexion perdue avec un tournoi déjà affiché (relecture en échec, en cours d'essai ou en pause)
  const offline = !!t && (query.isRefetchError || query.failureCount > 0 || query.fetchStatus === 'paused');
  const liveNow = useServerClock(t?.server_now, query.dataUpdatedAt, t?.status === 'running' ? 500 : 1000);
  // Hors connexion, l'heure s'arrête : rien ne passe « jouable » ni « forfait » sans le serveur
  const now = useFrozen(offline, liveNow);
  const phase = phaseOf(t, now);

  // Retour du jeu : le match quitté, et la page ouverte à cet instant (relectures plus récentes)
  const [left] = useState(() => lastLeftTournamentMatch(id));
  const [mountedAt] = useState(() => Date.now());
  const myMatch = t?.me?.match && typeof t.me.match === 'object' ? t.me.match : null;
  let holding = false;
  if (left && !offline && query.errorUpdatedAt <= left.at) {
    if (query.dataUpdatedAt <= left.at) holding = true;
    else if (left.finished && myMatch?.id === left.mid && myMatch.status === 'ready' && !myMatch.live?.playing
      && Date.now() - left.at < RESULT_LAG_MS) holding = true;
  }

  const [busy, setBusy] = useState(null);
  const [skipDraw, setSkipDraw] = useState(false);
  // Écran de résultat quitté pour le tableau (clé du match) ; tournoi fini : tableau demandé
  const [boardFor, setBoardFor] = useState(null);
  const [finishedBoard, setFinishedBoard] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [startPrompt, setStartPrompt] = useState(null);
  const playedRef = useRef(null);

  // Son débloqué par le clic de « Jouer mon match » (le coup d'envoi arrive sans geste)
  useAudioUnlockOnGesture(useCoupeMusic());

  // Tournoi en cours : l'image du stade et l'écran de jeu se chargent d'avance
  const live = phase === 'draw' || phase === 'board' || phase === 'presence' || phase === 'drawing';
  useEffect(() => {
    if (!live) return undefined;
    preloadStadium();
    const timer = setTimeout(() => { import('@/components/coupe/CoupeGame').catch(() => {}); }, 1200);
    return () => clearTimeout(timer);
  }, [live]);

  // Tournois coupés par le serveur pendant que la page est ouverte : le drapeau est relu
  const closed = isCoupeClosed(query.error);
  useEffect(() => {
    if (closed) queryClient.invalidateQueries({ queryKey: COUPE_TOURNAMENTS_FLAG_KEY });
  }, [closed, queryClient]);

  const goBack = useCallback(() => {
    if (hasAppHistory()) navigate(-1);
    else navigate('/coupe', { replace: true });
  }, [navigate]);
  const goHome = useCallback(() => navigate('/coupe'), [navigate]);

  const act = async (kind) => {
    if (busy || !t) return;
    hapticFeedback();
    setBusy(kind);
    try {
      if (kind === 'register') {
        const r = await registerTournament(t.id);
        if (r?.waiting) toast.success('Tu es sur la liste d’attente');
        else toast.success(phase === 'presence' ? 'Tu es inscrit, ta présence est notée' : 'Tu es inscrit au tournoi');
      } else if (kind === 'unregister') {
        await unregisterTournament(t.id);
        toast.success('Tu n’es plus inscrit');
      } else {
        await checkinTournament(t.id);
        toast.success('Présence confirmée');
      }
    } catch (err) {
      if (isCoupeClosed(err)) queryClient.invalidateQueries({ queryKey: COUPE_TOURNAMENTS_FLAG_KEY });
      toast.error(isCoupeClosed(err) ? TOURNAMENTS_PAUSED : coupeErrorText(err, FALLBACKS[kind]));
    }
    // Le bouton reste occupé jusqu'au nouvel état (jamais deux inscriptions d'un double tap)
    try { await invalidateTournaments(queryClient); } catch { /* relu au prochain passage */ }
    setBusy(null);
  };

  const share = async () => {
    if (!t) return;
    const r = await shareTournament(t);
    if (r === 'copied') toast.success('Lien du tournoi copié');
    else if (r === 'failed') toast.error('Partage impossible sur cet appareil.');
  };

  const play = useCallback((m) => {
    if (!t || !m?.id || playedRef.current === m.id) return;
    playedRef.current = m.id;
    markMatchPrompted(m.id);
    setStartPrompt(null);
    hapticFeedback();
    navigate(
      { pathname: '/coupe', search: `?tmatch=${encodeURIComponent(m.id)}&tournoi=${encodeURIComponent(t.id)}` },
      { state: { coupeFromTournament: true } },
    );
  }, [t, navigate]);

  // « Ton match commence » : seulement quand ton match DEVIENT jouable, page ouverte et visible.
  // Ce qui est déjà jouable à la première relecture depuis l'ouverture (dont le retour du jeu) ne
  // l'ouvre pas ; une seule fois par match (mémoire de la session)
  const joinable = !!myMatch && canJoin(myMatch, now) && !offline && !holding;
  const baselineRef = useRef(false);
  useEffect(() => {
    if (left) markMatchPrompted(left.mid);
  }, [left]);
  useEffect(() => {
    if (!t || holding || offline || query.dataUpdatedAt < mountedAt) return;
    if (!baselineRef.current) {
      baselineRef.current = true;
      if (joinable) markMatchPrompted(myMatch.id);
      return;
    }
    if (!joinable || wasMatchPrompted(myMatch.id)) return;
    markMatchPrompted(myMatch.id);
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    setStartPrompt(myMatch.id);
  }, [t, joinable, myMatch, holding, offline, query.dataUpdatedAt, mountedAt]);
  // Ouverte, elle reste tant que le match est à jouer (pas sur un écart de l'heure à la milliseconde)
  const promptMatch = startPrompt && myMatch?.id === startPrompt && myMatch.status === 'ready'
    && !forfeitPassed(myMatch, now) && !offline && !holding ? myMatch : null;
  useEffect(() => {
    if (startPrompt && !promptMatch) setStartPrompt(null);
  }, [startPrompt, promptMatch]);

  const sheetNode = <PlayerSheet player={sheet} onClose={() => setSheet(null)} />;

  // ─── Drapeau et chargement ───────────────────────────────────────
  if (flag.data === false || closed) return <NoticeView onBack={goBack} onHome={goHome} />;
  if (flag.data === null) {
    return (
      <TournamentShell onBack={goBack}>
        <CoupeLoadError what="le tournoi" onRetry={() => flag.refetch()} retrying={flag.isFetching} className="mt-6" />
      </TournamentShell>
    );
  }
  if (!on) return <Loading onBack={goBack} />;
  if (query.error?.status === 404 && !t) return <NoticeView kind="missing" onBack={goBack} onHome={goHome} />;
  if (queryFailed(query) || (query.data && !t)) {
    return (
      <TournamentShell onBack={goBack}>
        <CoupeLoadError what="le tournoi" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} className="mt-6" />
      </TournamentShell>
    );
  }
  if (!t) return <Loading onBack={goBack} />;
  // Retour du jeu : jamais le tableau d'avant le match (« Jouer mon match » sur le match joué)
  if (holding) return <Loading onBack={goBack} text="Mise à jour du tableau…" />;

  // ─── Écrans ──────────────────────────────────────────────────────
  const common = { t, now, busy, offline, spectatorsOn, onBack: goBack, onShare: share };
  const startDialog = (
    <MatchStartDialog
      match={promptMatch}
      total={roundsCount(t.size)}
      onGo={() => play(promptMatch)}
      onLater={() => setStartPrompt(null)}
    />
  );
  if (phase === 'cancelled') return <CancelledView t={t} onBack={goBack} onHome={goHome} />;
  if (phase === 'registration') {
    return <RegistrationView {...common} onRegister={() => act('register')} onUnregister={() => act('unregister')} />;
  }
  if (phase === 'presence' || phase === 'drawing') {
    return (
      <PresenceView
        {...common}
        drawing={phase === 'drawing'}
        onRegister={() => act('register')}
        onUnregister={() => act('unregister')}
        onCheckin={() => act('checkin')}
      />
    );
  }
  if (phase === 'draw' && !skipDraw) {
    return (
      <>
        <DrawView t={t} now={now} offline={offline} onBack={goBack} onSkip={() => setSkipDraw(true)} />
        {startDialog}
      </>
    );
  }

  if (phase === 'finished' && !finishedBoard) {
    return (
      <>
        <FinishedView
          t={t}
          onBack={goBack}
          onShowBoard={() => setFinishedBoard(true)}
          onOpenPalmares={t.champion?.me ? () => setSheet(t.champion) : null}
        />
        {sheetNode}
      </>
    );
  }

  // Tableau, ou d'abord ton résultat (qualifié avec le match suivant pas encore jouable, éliminé) ;
  // retiré par le salon : le tableau et sa note, jamais « Éliminé »
  const last = t.me?.status === 'removed' ? null : myLastPlayed(t);
  const resultKey = last ? `${last.id}:${last.status}` : null;
  const running = phase === 'board' || phase === 'draw';
  if (running && last && boardFor !== resultKey && !(myMatch && isPlayable(myMatch, now))) {
    const qualified = iWon(last) && !!myMatch;
    const eliminated = !iWon(last) && last.status === 'done';
    if (qualified || eliminated) {
      return (
        <>
          <ResultView t={t} match={last} now={now} offline={offline} onBack={goBack} onShowBoard={() => setBoardFor(resultKey)} />
          {startDialog}
        </>
      );
    }
  }

  let header = null;
  if (phase === 'finished') {
    header = <button type="button" className={BTN_OUTLINE} onClick={() => setFinishedBoard(false)}>Voir le podium</button>;
  } else if (last && boardFor === resultKey && !(myMatch && isPlayable(myMatch, now))) {
    header = <button type="button" className={BTN_OUTLINE} onClick={() => setBoardFor(null)}>Revoir ton résultat</button>;
  }
  return (
    <>
      <BoardView
        t={t}
        now={now}
        offline={offline}
        onBack={goBack}
        onPlay={play}
        note={phase === 'finished' ? null : boardNote(t)}
        header={header}
        canWatch={spectatorsOn}
      />
      {startDialog}
      {sheetNode}
    </>
  );
}
