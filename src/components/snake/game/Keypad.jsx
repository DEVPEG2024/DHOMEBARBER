import React from 'react';
import { Link } from 'react-router-dom';
import { SNAKE_COLORS as C } from '../palette';

/**
 * Pavé de touches du téléphone (planche : touches de 72 × 52 px, 2 / 4 / 5 / 6 / 8, une touche
 * d'action en haut à gauche, 5 en vert).
 *
 * `fast` : la touche agit dès que le doigt se pose (`pointerdown`), sans attendre qu'il se lève ;
 * réservé aux touches qui ne changent pas l'écran (virages, pause), sinon le clic qui suit tomberait
 * sur la touche du nouvel écran au même endroit. Clavier (Entrée ou Espace sur la touche) : le clic,
 * dont `detail` vaut 0.
 *
 * Un clic de souris ne laisse pas le focus sur la touche (Espace et Entrée restent « lancer /
 * pause ») ; au clavier (Tab), le focus reste visible. Survol plus clair sur ordinateur seulement.
 */
// Enfoncée : la touche descend de 2 px et son ombre se réduit (planche `.key:active`). Fond par
// variable CSS : le survol (`(hover: hover)`) peut le remplacer
const KEY_CLASS = 'flex h-[52px] w-[72px] select-none flex-col items-center justify-center gap-px rounded-2xl border p-0 text-white bg-[color:var(--snake-key)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_0_#0E1114] [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] [@media(hover:hover)]:enabled:hover:bg-[color:var(--snake-key-survol)] active:translate-y-[2px] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_0_#0E1114] disabled:cursor-default disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3DBE7E]';
const LINK_HOVER = '[@media(hover:hover)]:hover:bg-[color:var(--snake-key-survol)]';

const keyStyle = (green) => ({
  '--snake-key': green ? C.vert : C.touche,
  '--snake-key-survol': green ? C.vertBord : C.toucheSurvol,
  borderColor: green ? C.vertBord : C.toucheBord,
});

/** Clic de souris : pas de focus sur la touche (le clavier, lui, garde le sien). */
export const noMouseFocus = (e) => { e.preventDefault(); };

export function Key({ label, onPress, to, fast = false, green = false, disabled = false, children, ...rest }) {
  const style = keyStyle(green);
  if (to) {
    return (
      <Link to={to} aria-label={label} onMouseDown={noMouseFocus} className={`${KEY_CLASS} ${LINK_HOVER}`} style={style} {...rest}>
        {children}
      </Link>
    );
  }
  const onPointerDown = fast && !disabled
    ? (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      onPress?.();
    }
    : undefined;
  const onClick = disabled
    ? undefined
    : (e) => {
      // Touche « rapide » : le doigt a déjà agi au `pointerdown` ; seul le clic du clavier compte
      if (fast && e.detail !== 0) return;
      onPress?.();
    };
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onMouseDown={noMouseFocus}
      onClick={onClick}
      className={KEY_CLASS}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
}

const ARROWS = {
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
};

/** Chiffre et flèche verte d'une touche de direction. */
export function DigitArrow({ digit, arrow }) {
  return (
    <>
      <span className="text-base font-semibold leading-none">{digit}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.vertTexte} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ARROWS[arrow]} />
      </svg>
    </>
  );
}

/** Libellé gris d'une touche d'action (« Jeux », « Menu », « Rejouer »). */
export function KeyWord({ children }) {
  return <span className="text-xs font-semibold" style={{ color: C.grisClair }}>{children}</span>;
}

/** Touche 5 : chiffre et petit mot (OK, GO, PAUSE). */
export function DigitWord({ digit = '5', word }) {
  return (
    <>
      <span className="text-base font-bold leading-none">{digit}</span>
      <span className="text-[10px] font-bold tracking-[0.08em]">{word}</span>
    </>
  );
}

/**
 * Grille de 3 colonnes : `slots` = 3, 6 ou 9 éléments (null = case vide), dans l'ordre de lecture.
 * 3 × 72 px + 2 × 10 px = 236 px de large : tient à 320 px d'écran.
 */
export default function Keypad({ slots, label = 'Touches' }) {
  const rows = Math.ceil(slots.length / 3);
  return (
    <div role="group" aria-label={label} className="mt-1 grid grid-cols-[repeat(3,72px)] gap-x-2.5 gap-y-2" style={{ gridTemplateRows: `repeat(${rows}, 52px)` }}>
      {/* Cases fixes du pavé : leur place ne change jamais (clé = position) */}
      {slots.map((slot, i) => (
        <div key={i} className="contents">{slot || <div />}</div>
      ))}
    </div>
  );
}
