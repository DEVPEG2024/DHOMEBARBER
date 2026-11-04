import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  coupeTournamentKey, fetchTournament, serverNowOf, useSpectatorsEnabled, useSpectatorsFlagQuery,
} from '@/lib/coupe/coupeApi';
import { readSoundOn, unlockAudio, writeSoundOn } from '@/lib/coupe/audioUnlock';
import { preloadStadium } from '@/lib/coupe/stadiumImage';
import { SpectatorMatch, WATCH_IDLE_UI, watchTargetOf } from '@/lib/coupe/spectatorMatch';
import { CHEER_GAP_MS } from '@/lib/coupe/watch';
import { hapticFeedback } from '@/lib/capacitor';
import CoupeLoadError from '@/components/coupe/CoupeLoadError';
import { hasAppHistory } from '@/components/coupe/hub/coupeFormat';
import { useSalonMusicPaused } from '@/components/coupe/game/hooks';
import { TournamentShell } from '@/components/coupe/tournoi/ui';
import { allMatches, matchTitle, playerName, roundsCount } from '@/components/coupe/tournoi/tournoiFormat';
import WatchStage, { tourTitleOf } from '@/components/coupe/watch/WatchStage';
import {
  CheerBar, NextMatchLink, SoundButton, WatchEnd, WatchNotice, WatchersPill, boardEndText, lastScoreText, nextMatchOf,
} from '@/components/coupe/watch/WatchParts';

/*
 * Regarder un match de La Coupe du Gang (planche validée, écran 13 ; contrat
 * docs/fonctions/coupe-spectateurs-contrat.md, section 4.1, décisions A2, A5 à A8 de la section 6) :
 * `/coupe/regarder?m=<match de tournoi>[&tournoi=<tournoi>]` ou `?w=<match ordinaire>`.
 *
 * En-tête (retour, « Tu regardes · Quart 1 », nom du tournoi, œil + nombre de spectateurs, bouton
 * Son), bande des scores et terrain (WatchStage), 4 réactions toutes faites (une toutes les 3 s), pour
 * un tournoi « Ensuite : … » (prochain match du tableau, `GET /coupe/tournaments/:id`, lu dès que
 * `tournoi` est dans l'adresse : en-tête du tournoi pendant l'attente, match fini ou exempt au
 * tableau → « Ce match est fini »). États : connexion, pas encore commencé (nouvel essai toutes les
 * 5 s, 10 min), en direct, pause (« Un joueur s'est déconnecté »), fin (résultat, retour au tableau
 * ou à la Coupe), fini pendant l'absence (dernier score vu), plus en direct, complet, fermé,
 * connexion perdue (3 essais, puis « Réessayer » ; le dernier score reste à l'écran). La socket se
 * ferme après la fin ou un refus définitif (une place de spectateur rendue). Sans
 * `features.coupeSpectators` : « Regarder n'est pas encore ouvert » et retour, jamais une page
 * blanche ; lecture du drapeau ratée : « Réessayer ». Bruitages du but et du sifflet selon le réglage
 * du son de la Coupe (bouton Son) ; ni musique ni tribune (la musique de l'app est en pause sur cette
 * page). Aucune photo : pions aux initiales.
 */

const TOUR_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
// Hauteur de la bande et du terrain : l'écran moins l'en-tête, les réactions et « Ensuite »
const STAGE_HEIGHT = 'clamp(300px, calc(100dvh - 268px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)), 640px)';
// Le match est à l'écran (sinon une carte d'attente ou d'erreur)
const ON_STAGE = new Set(['live', 'paused', 'ended']);
// Tableau du tournoi relu toutes les 15 s (fin d'un match attendu, « Ensuite »)
const BOARD_EVERY_MS = 15 * 1000;

/** Texte d'un état sans match à l'écran (ou sous le dernier score, connexion perdue). */
function noticeOf(ui, who = null) {
  switch (ui.status) {
    case 'waiting':
      return ui.waitOver
        ? { title: 'Le match n’a toujours pas commencé', text: 'Les joueurs ne sont pas encore là. Réessaie dans un moment.', retry: true }
        : {
          title: 'Le match n’a pas encore commencé',
          text: who ? `${who} : le match s’affiche dès le coup d’envoi.` : 'Les joueurs arrivent : le match s’affiche dès le coup d’envoi.',
          busy: true,
        };
    case 'unavailable':
      return { title: 'Ce match n’est plus en direct', text: 'Il est fini, ou il n’est pas ouvert aux spectateurs.' };
    case 'full':
      return ui.error === 'server_full'
        ? { title: 'Trop de spectateurs en ce moment', text: 'Réessaie dans une minute.', retry: true }
        : { title: 'Trop de spectateurs pour ce match', text: 'Les places sont prises. Réessaie dans un moment.', retry: true };
    case 'disabled':
      return { title: 'Regarder les matchs fait une pause', text: 'Reviens un peu plus tard.' };
    case 'offline':
    case 'revoked':
      if (ui.error === 'session') return { title: 'Connexion perdue', text: 'Ta session n’est pas reconnue. Reconnecte-toi, puis réessaie.', retry: true, alert: true };
      if (ui.error === 'replaced') return { title: 'Tu regardes déjà sur un autre appareil', text: 'Un seul écran à la fois pour ton compte.', retry: true };
      if (ui.error === 'update_required') return { title: 'Mets l’app à jour pour regarder les matchs', text: null, alert: true };
      return { title: 'Connexion perdue', text: 'Vérifie ton réseau, puis réessaie.', retry: true, alert: true };
    default:
      return { title: 'Connexion au match…', text: null, busy: true };
  }
}

export default function CoupeRegarder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const target = useMemo(() => watchTargetOf({ m: params.get('m'), w: params.get('w') }), [params]);
  const targetKey = target ? (target.m ? `m:${target.m}` : `w:${target.w}`) : '';
  const tidParam = TOUR_ID_RE.test(params.get('tournoi') || '') ? params.get('tournoi') : null;
  // Drapeau commun (ne rejette jamais) : `true`, `false`, ou `null` si la lecture a échoué
  const flag = useSpectatorsFlagQuery();
  const on = useSpectatorsEnabled();

  // Ni musique ni tribune : la musique de l'app (chant de la Coupe) se tait sur cette page
  useSalonMusicPaused(true);
  useEffect(() => { preloadStadium(); }, []);

  const [ui, setUi] = useState(() => ({ ...WATCH_IDLE_UI }));
  const [match, setMatch] = useState(null);
  const smRef = useRef(null);
  useEffect(() => {
    if (!on || !target) return undefined;
    // Socket fermée après la fin ou un refus définitif (`closeWhenDone`, défaut d'un compte)
    const sm = new SpectatorMatch({ onChange: (next) => setUi(next) });
    smRef.current = sm;
    setMatch(sm);
    sm.watch(target);
    setUi(sm.ui);
    return () => {
      sm.destroy();
      smRef.current = null;
      setMatch(null);
    };
    // `target` ne change qu'avec `targetKey`
  }, [on, targetKey]);

  // Son : le réglage du son de la Coupe (`cdg-sound`), relancé pendant le geste quand on l'allume
  const [soundOn, setSoundOn] = useState(() => readSoundOn());
  const toggleSound = useCallback(() => {
    const next = !readSoundOn();
    writeSoundOn(next);
    if (next) {
      try { unlockAudio({ music: false }); } catch { /* son indisponible */ }
    }
    setSoundOn(next);
  }, []);

  // Réactions : une toutes les 3 s (les boutons attendent, la réaction partie est marquée)
  const [cheerLock, setCheerLock] = useState(null);
  useEffect(() => {
    if (cheerLock == null) return undefined;
    const id = setTimeout(() => setCheerLock(null), Math.max(50, smRef.current?.cheerWaitMs?.() ?? CHEER_GAP_MS));
    return () => clearTimeout(id);
  }, [cheerLock]);
  const cheer = useCallback((r) => {
    const sm = smRef.current;
    if (!sm || !sm.cheer(r)) return;
    hapticFeedback();
    setCheerLock(r);
  }, []);

  // Tournoi : tableau lu dès que `tournoi` est dans l'adresse (décision A6) : en-tête pendant
  // l'attente, match fini ou exempt, « Ensuite : … » ; nom et tour aussi par `wstart`
  const tid = ui.tour?.tid || (target?.m ? tidParam : null);
  const tourQuery = useQuery({
    queryKey: coupeTournamentKey(tid),
    queryFn: () => fetchTournament(tid),
    enabled: on && !!tid,
    staleTime: 10 * 1000,
    refetchInterval: BOARD_EVERY_MS,
    retry: 1,
  });
  const t = tourQuery.data && typeof tourQuery.data === 'object' && tourQuery.data.id ? tourQuery.data : null;
  const next = t ? nextMatchOf(t, target?.m || null, serverNowOf(t, tourQuery.dataUpdatedAt)) : null;
  const tourTo = tid ? `/coupe/tournoi/${encodeURIComponent(tid)}` : null;
  const boardMatch = t && target?.m ? allMatches(t).find((m) => m && m.id === target.m) || null : null;
  const boardTitle = boardMatch ? matchTitle(boardMatch.round, boardMatch.slot, roundsCount(t.size)) : '';
  const boardWho = boardMatch?.p?.[0] && boardMatch?.p?.[1]
    ? `${playerName(boardMatch.p[0])} contre ${playerName(boardMatch.p[1])}`
    : null;

  // Match fini ou exempt au tableau pendant l'attente : on ne regarde plus (socket fermée)
  const status = ui.status;
  const boardEnded = !!boardMatch && (boardMatch.status === 'done' || boardMatch.status === 'bye')
    && !ON_STAGE.has(status) && !ui.missed;
  useEffect(() => {
    if (boardEnded) smRef.current?.unwatch();
  }, [boardEnded]);

  const goBack = useCallback(() => {
    if (hasAppHistory()) navigate(-1);
    else navigate(tourTo || '/coupe', { replace: true });
  }, [navigate, tourTo]);
  const goHome = useCallback(() => navigate('/coupe'), [navigate]);
  const retry = useCallback(() => smRef.current?.retry(), []);

  const tourTitle = tourTitleOf(ui.tour) || boardTitle;
  const label = tourTitle ? `Tu regardes · ${tourTitle}` : 'Tu regardes';
  const title = ui.tour?.name || (tid && t?.name) || 'La Coupe du Gang';
  const shell = (children, { action = null, header = true } = {}) => (
    <TournamentShell onBack={goBack} label={header ? label : null} title={header ? title : null} titleId="regarder-titre" action={action} musicButton={false}>
      {children}
    </TournamentShell>
  );

  // ─── Drapeau et adresse ──────────────────────────────────────────
  if (flag.data === false) {
    return shell(
      <WatchNotice
        title="Regarder n’est pas encore ouvert"
        text="Bientôt, tu pourras suivre les matchs de la Coupe en direct."
        onBack={goBack}
      />,
      { header: false },
    );
  }
  if (flag.data === null || (flag.isError && !on)) {
    return shell(<CoupeLoadError what="le match" onRetry={() => flag.refetch()} retrying={flag.isFetching} className="mt-6" />, { header: false });
  }
  if (!on) return shell(<WatchNotice title="Connexion au match…" busy />, { header: false });
  if (!target) {
    return shell(
      <WatchNotice title="Ce match n’est plus en direct" text="Le lien est incomplet ou trop ancien." onBack={goBack} backLabel="Retour" />,
      { header: false },
    );
  }

  const sound = <SoundButton on={soundOn} onToggle={toggleSound} />;

  // ─── Match fini au tableau pendant l'attente ─────────────────────
  if (boardEnded) {
    return shell(
      <div className="mt-3">
        <WatchEnd title="Ce match est fini" text={boardEndText(boardMatch)} tourTo={tourTo} onHome={goHome} />
      </div>,
    );
  }

  // ─── Match ───────────────────────────────────────────────────────
  // Déjà vu en direct (`kind` posé par `wstart`) : le dernier score reste pendant une reconnexion,
  // une coupure ou après une fin manquée
  const seen = !!ui.kind;
  const missed = status === 'unavailable' && !!ui.missed;
  const lost = seen && (status === 'connecting' || status === 'offline');
  const shown = ON_STAGE.has(status) || lost || missed;
  if (!shown) {
    const n = noticeOf(ui, boardWho);
    return shell(
      <WatchNotice
        title={n.title}
        text={n.text}
        busy={!!n.busy}
        alert={!!n.alert}
        onRetry={n.retry ? retry : null}
        onBack={status === 'connecting' ? null : goBack}
        backLabel={tourTo ? 'Retour au tableau' : 'Retour'}
      />,
      { action: sound },
    );
  }

  const live = status === 'live' || status === 'paused';
  // Nombre de spectateurs seulement quand il est à jour (pas pendant une coupure ni après une fin manquée)
  const pill = (
    <span className="flex items-center gap-2">
      {ON_STAGE.has(status) && <WatchersPill n={ui.watchers} screen={ui.screen} />}
      {sound}
    </span>
  );
  let below;
  if (status === 'ended') below = <WatchEnd result={ui.result} names={ui.names} tourTo={tourTo} onHome={goHome} />;
  else if (missed) {
    below = (
      <WatchEnd
        title="Le match s’est fini pendant ton absence"
        text={lastScoreText(ui.names, ui.sc)}
        tourTo={tourTo}
        onHome={goHome}
      />
    );
  } else if (status === 'offline') {
    const n = noticeOf(ui);
    below = (
      <WatchNotice
        title={n.title}
        text={n.text}
        alert={!!n.alert}
        onRetry={n.retry ? retry : null}
        onBack={goBack}
        backLabel={tourTo ? 'Retour au tableau' : 'Retour'}
      />
    );
  } else {
    below = <CheerBar onCheer={cheer} disabled={cheerLock != null || !!ui.reconnecting || !live} sent={cheerLock} />;
  }

  return shell(
    <div className="flex flex-col gap-3.5">
      <div className="-mx-4 -mt-1" style={{ height: STAGE_HEIGHT }}>
        <WatchStage match={match} ui={ui} variant="phone" soundOn={soundOn} className="h-full w-full" />
      </div>
      {below}
      {tourTo && <NextMatchLink next={next} to={tourTo} />}
    </div>,
    { action: pill },
  );
}
