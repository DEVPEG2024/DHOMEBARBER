import React from 'react';
import { Pause, Volume2, VolumeX, X } from 'lucide-react';

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
 * Barre du haut pendant un match : quitter (en ligne) ou pause (hors ligne), le mode, la
 * connexion (en ligne), le son. `diag` : ligne de diagnostic de l'écran d'essai.
 */
export function GameHud({ online, label, onLeft, ping, soundOn, onToggleSound, diag }) {
  return (
    <header className="cdg-hud">
      <button type="button" className="cdg-icon" onClick={onLeft} aria-label={online ? 'Quitter le match' : 'Pause'}>
        {online ? <X className="h-5 w-5" aria-hidden="true" /> : <Pause className="h-[18px] w-[18px]" aria-hidden="true" />}
      </button>
      <p className="cdg-hud-label">{label}</p>
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
