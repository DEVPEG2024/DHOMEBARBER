import React from 'react';
import { Eye, Pause, Trophy, Volume2, VolumeX, X } from 'lucide-react';

export const REACTIONS = [
  { r: 0, emoji: '👏', label: 'Bravo' },
  { r: 1, emoji: '🔥', label: 'En feu' },
  { r: 2, emoji: '😂', label: 'Mort de rire' },
];

/** Qualité de la connexion d'après le ping : barres et couleur (maquette « Match en ligne »). */
function PingBadge({ ping }) {
  const quality = ping == null ? 0 : ping <= 120 ? 3 : ping <= 220 ? 2 : 1;
  const tone = quality === 1 ? ' cdg-bad' : quality === 2 ? ' cdg-mid' : '';
  const label = ping == null ? 'Connexion : mesure en cours' : `Connexion : ${ping} ms`;
  return (
    <span className={`cdg-ping${tone}`} role="img" aria-label={label}>
      <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
        {[[1, 9, 5], [6.5, 5, 9], [12, 1, 13]].map(([x, y, h], i) => (
          <rect key={x} x={x} y={y} width="3" height={h} rx="1" fill="currentColor" opacity={i < quality ? 1 : 0.25} />
        ))}
      </svg>
      <span aria-hidden="true">{ping == null ? '…' : `${ping} ms`}</span>
    </span>
  );
}

/**
 * Spectateurs du match (protocole 3, `ui.watchers` ; contrat docs/fonctions/coupe-spectateurs-contrat.md,
 * section 1.5) : un œil et leur nombre sous le mode, « Sur l'écran du salon » quand l'écran du salon
 * montre le match ; rien sans spectateur. Posée en absolu dans la barre du haut : la barre garde ses
 * 56 px et le terrain ne bouge pas. À 320 px, le mot « spectateurs » n'est lu que par les lecteurs
 * d'écran (le nombre et l'écran du salon restent écrits).
 */
export function WatchersPill({ n, screen }) {
  const count = Number(n) > 0 ? Math.floor(Number(n)) : 0;
  if (!count) return null;
  return (
    <p className="cdg-watch">
      <Eye className="h-[13px] w-[13px]" aria-hidden="true" />
      <span className="cdg-watch-n">{count}</span>
      {' '}
      <span className="cdg-watch-word">{count === 1 ? 'spectateur' : 'spectateurs'}</span>
      {screen && (
        <>
          {' '}
          <span className="cdg-watch-screen">· Sur l’écran du salon</span>
        </>
      )}
    </p>
  );
}

/**
 * Barre du haut pendant un match : quitter (en ligne) ou pause (hors ligne), le mode, la
 * connexion (en ligne), le son. `diag` : ligne de diagnostic de l'écran d'essai. `tour` : match
 * de tournoi, le tour (« Quart de finale ») à la place du mode, derrière une coupe d'or.
 * `watchers` (en ligne) : `{ n, screen }`, la pastille des spectateurs sous le mode quand `n > 0`.
 */
export function GameHud({ online, label, onLeft, ping, soundOn, onToggleSound, diag, tour = false, watchers = null }) {
  const watched = online && Number(watchers?.n) > 0;
  return (
    <header className="cdg-hud" data-watch={watched ? '' : undefined}>
      <button type="button" className="cdg-icon" onClick={onLeft} aria-label={online ? 'Quitter le match' : 'Pause'}>
        {online ? <X className="h-5 w-5" aria-hidden="true" /> : <Pause className="h-[18px] w-[18px]" aria-hidden="true" />}
      </button>
      {tour ? (
        <p className="cdg-hud-label cdg-hud-tour">
          <Trophy className="h-4 w-4" aria-hidden="true" />
          <span>{label}</span>
        </p>
      ) : (
        <p className="cdg-hud-label">{label}</p>
      )}
      {online && <PingBadge ping={ping} />}
      <button
        type="button"
        className="cdg-icon"
        onClick={onToggleSound}
        aria-pressed={soundOn}
        aria-label={soundOn ? 'Couper le son' : 'Activer le son'}
      >
        {soundOn ? <Volume2 className="h-5 w-5" aria-hidden="true" /> : <VolumeX className="h-5 w-5" aria-hidden="true" />}
      </button>
      {watched && <WatchersPill n={watchers.n} screen={watchers.screen === true} />}
      {diag && <p className="cdg-diag">{diag}</p>}
    </header>
  );
}

/** Réactions toutes faites (pas de discussion), une par seconde. */
export function Reactions({ onReact, disabled }) {
  return (
    <div className="cdg-reacts">
      <div className="cdg-reacts-row" role="group" aria-label="Réactions">
        {REACTIONS.map(({ r, emoji, label }) => (
          <button
            key={r}
            type="button"
            className="cdg-react"
            onClick={() => onReact(r)}
            disabled={disabled}
            aria-label={`Réagir : ${label}`}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        ))}
      </div>
      <small>Réactions seulement, pas de discussion</small>
    </div>
  );
}
