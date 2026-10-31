import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { LEVELS } from '@/lib/coupe/engine';
import { cleanChallengeLink } from '@/lib/coupe/onlineMatch';
import CoupeGame from '@/components/coupe/CoupeGame';
import GameStyles from '@/components/coupe/game/GameStyles';
import Panel from '@/components/coupe/game/Panel';
import { formatDelta } from '@/components/coupe/game/format';
import { useAudioUnlockOnGesture } from '@/components/coupe/game/hooks';
import { useCoupeMusic, useCoupeRulesV2 } from '@/lib/coupe/coupeApi';

/*
 * Écran d'essai de La Coupe du Gang (/coupe-test, docs/fonctions/coupe-du-gang.md) : réservé à
 * l'équipe et aux comptes testeurs (garde dans App.jsx ; le serveur de jeu vérifie aussi). Toutes
 * les façons de jouer, sur le vrai écran de jeu (`CoupeGame`), avec le diagnostic réseau en ligne
 * (ping, recalages, frappes refusées).
 *
 * Règlement v2 (`features.coupeRulesV2`, 31 oct. 2026) : premier à 5 buts et règles du nouveau
 * règlement dans le texte ; en ligne le serveur décide match par match.
 *
 * Aucun WebSocket n'est ouvert avant « Créer un match », « Rejoindre » ou un défi. Accueil sans
 * dessin (rien ne s'anime hors match). L'adresse peut ouvrir directement une partie, comme /coupe :
 * `?defi=<lien>`, `?challenge=<id de fiche>`, `?mode=bot&level=apprenti|barber|boss`, `?mode=local`.
 */

/** Partie demandée par l'adresse (ou null). */
function gameFromParams(params) {
  const defi = cleanChallengeLink(params.get('defi'));
  if (defi) return { mode: 'online', action: { t: 'defi', link: defi } };
  const challenge = String(params.get('challenge') || '').trim();
  if (challenge) return { mode: 'online', action: { t: 'challenge', employeeId: challenge } };
  const mode = params.get('mode');
  if (mode === 'bot') {
    const level = params.get('level');
    return { mode: 'bot', level: LEVELS[level] ? level : 'barber' };
  }
  if (mode === 'local') return { mode: 'local' };
  return null;
}

/** Page d'arrivée du rôle (croix de l'accueil quand on est arrivé ici directement). */
function homeFor(user) {
  if (user?.role === 'admin') return '/admin';
  if (user?.role === 'barber') return '/admin/me';
  return '/';
}

/** Dernier match, en une ligne (diagnostic). */
function lastLine(r) {
  if (!r) return null;
  if (r.abandoned) return r.cancelled ? 'Dernier match : abandon avant 20 s de jeu (annulé).' : 'Dernier match : abandon (défaite par forfait).';
  const score = Array.isArray(r.score) ? `${r.score[0]} – ${r.score[1]}` : '';
  if (r.cancelled) return `Dernier match : annulé (${score}).`;
  if (r.draw) return `Dernier match : nul, temps écoulé (${score}).`;
  const head = r.mode === 'local' ? `${r.winner === 1 ? 'Haut' : 'Bas'} gagne` : r.won ? 'Victoire' : 'Défaite';
  let pts = '';
  if (r.mode === 'online') {
    if (!r.points) pts = ' · points non comptés';
    else if (!r.points.ranked) pts = ` · amical (${r.points.reason || 'sans points'})`;
    else pts = ` · ${formatDelta(r.points.delta)} points (total ${r.points.total ?? '?'})`;
  }
  return `Dernier match : ${head} ${score}${pts}.`;
}

export default function CoupeTest() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // Son débloqué pendant le clic qui ouvre une partie : musique et bruitages au coup d'envoi
  useAudioUnlockOnGesture(useCoupeMusic());
  // Règlement v2 annoncé par le serveur (lu ici aussi : une partie ouverte d'ici l'a déjà en cache)
  const rulesV2 = useCoupeRulesV2();
  const [game, setGame] = useState(() => {
    const g = gameFromParams(params);
    return g ? { ...g, key: 1 } : null;
  });
  const [code, setCode] = useState('');
  const [level, setLevel] = useState('barber');
  const [last, setLast] = useState(null);

  const start = (g) => setGame({ ...g, key: Date.now() });

  const endGame = () => {
    setGame(null);
    if ([...params.keys()].length) setParams({}, { replace: true });
  };

  const exitPage = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(homeFor(user), { replace: true });
  };

  const join = (e) => {
    e.preventDefault();
    if (code.length === 4) start({ mode: 'online', action: { t: 'join', code } });
  };

  if (game) {
    return (
      <CoupeGame
        key={game.key}
        mode={game.mode}
        level={game.level}
        action={game.action}
        diagnostic
        onExit={endGame}
        onFinished={setLast}
      />
    );
  }

  return (
    <div
      className="cdg-root fixed inset-0 z-50 overflow-hidden"
      style={{
        touchAction: 'none',
        overscrollBehavior: 'none',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'max(8px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(8px, env(safe-area-inset-right, 0px))',
      }}
    >
      <GameStyles />
      <div className="relative mx-auto h-full w-full max-w-[540px]">
        <Panel labelledBy="cdg-title" onClose={exitPage} closeLabel="Fermer La Coupe du Gang">
          <p className="cdg-eyebrow">D&apos;Home Barber · écran d&apos;essai</p>
          <h1 className="cdg-title" id="cdg-title">La <span>Coupe</span> <br />du Gang</h1>
          <p className="cdg-lead">
            Ton joueur suit ton doigt, le premier à {rulesV2 ? 5 : 3} buts gagne. En ligne, le diagnostic réseau s&apos;affiche sous la barre du match.
          </p>
          <button type="button" className="cdg-btn cdg-primary" onClick={() => start({ mode: 'online', action: { t: 'create' } })}>
            Créer un match
            <small>Tu reçois un code et un lien à donner à l&apos;autre joueur</small>
          </button>
          <form className="flex flex-col gap-2.5" onSubmit={join}>
            <label className="cdg-label" htmlFor="cdg-code">Rejoindre un match</label>
            <div className="flex gap-2.5">
              <input
                id="cdg-code"
                className="cdg-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                enterKeyHint="go"
                maxLength={4}
                placeholder="Code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              <button type="submit" className="cdg-btn cdg-ghost" disabled={code.length !== 4}>Rejoindre</button>
            </div>
          </form>
          <div className="flex flex-col gap-2.5">
            <p className="cdg-label" id="cdg-level">Contre le salon</p>
            <div className="cdg-seg" role="radiogroup" aria-labelledby="cdg-level">
              {Object.entries(LEVELS).map(([key, L]) => (
                <button key={key} type="button" role="radio" aria-checked={level === key} onClick={() => setLevel(key)}>
                  {L.name}
                </button>
              ))}
            </div>
            <button type="button" className="cdg-btn cdg-ghost" onClick={() => start({ mode: 'bot', level })}>
              Jouer contre le salon
            </button>
          </div>
          <button type="button" className="cdg-btn cdg-ghost" onClick={() => start({ mode: 'local' })}>
            À deux sur ce téléphone
            <small>Pose-le à plat, chacun son bout</small>
          </button>
          {last && <p className="cdg-small" role="status">{lastLine(last)}</p>}
          <ul className="cdg-rules">
            <li>Ton joueur reste dans ta moitié de terrain.</li>
            <li>Interdit d&apos;entrer dans ta petite surface.</li>
            {rulesV2 ? (
              <>
                <li>Ballon gardé 5 s : avertissement, il change de camp ; au 3e, penalty.</li>
                <li>Plus de 3 s dans ta grande surface, ou ballon bloqué contre ton mur : penalty.</li>
                <li>Reprise de volée très forte : balle en feu. Foudre de l&apos;orage : balle électrique, but à 2.</li>
                <li>Un événement au hasard toutes les 20 à 40 s ; égalité à 5 min : but en or.</li>
              </>
            ) : (
              <li>Ballon gardé 5 s dans une moitié : il change de camp.</li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
