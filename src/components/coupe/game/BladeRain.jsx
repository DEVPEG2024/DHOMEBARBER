import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { COUPE_COLORS } from '@/components/coupe/palette';

/*
 * Pluie de lames de rasoir de la victoire (thème stade, docs/fonctions/coupe-du-gang-stade.md),
 * montée par l'écran de fin : une seule averse de lames or, blanches et rouges qui tombent en
 * culbutant, puis plus rien (le composant se retire seul). En DOM, animée par `transform` et
 * `opacity` seulement, jamais cliquable ; rien du tout si le téléphone demande moins d'animations.
 * Elle remplit son parent (`position: absolute; inset: 0`), qui la coupe.
 */

const COUNT = 30;
const TINTS = [COUPE_COLORS.or, COUPE_COLORS.blancCasse, COUPE_COLORS.rouge];
// Trajectoires : dérive de côté, rotation dans le plan et culbute (rotateX / rotateY, sans perspective
// la lame s'aplatit puis se retourne). Les départs, durées, tailles et places sont tirés au hasard.
const PATHS = [
  ['translate3d(0, -14vh, 0) rotate(-20deg) rotateY(0deg)', 'translate3d(40px, 112vh, 0) rotate(340deg) rotateY(540deg)'],
  ['translate3d(0, -14vh, 0) rotate(30deg) rotateX(0deg)', 'translate3d(-50px, 112vh, 0) rotate(-300deg) rotateX(720deg)'],
  ['translate3d(0, -14vh, 0) rotate(70deg) rotateY(0deg)', 'translate3d(24px, 112vh, 0) rotate(520deg) rotateY(360deg)'],
  ['translate3d(0, -14vh, 0) rotate(-60deg) rotateX(0deg)', 'translate3d(-28px, 112vh, 0) rotate(240deg) rotateX(540deg)'],
];

const BLADE_CSS = `
.cdg-blades { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.cdg-blade { position: absolute; top: 0; display: block; opacity: 0;
  animation: cdg-blade-0 3s cubic-bezier(.35, 0, .65, 1) 0s 1 both; }
.cdg-blade svg { display: block; width: 100%; height: auto; }
${PATHS.map(([from, to], i) => `.cdg-blade.cdg-blade-${i} { animation-name: cdg-blade-${i}; }
@keyframes cdg-blade-${i} { 0% { opacity: 0; transform: ${from}; } 7% { opacity: 1; } 80% { opacity: 1; }
  100% { opacity: 0; transform: ${to}; } }`).join('\n')}
@media (prefers-reduced-motion: reduce) { .cdg-blades { display: none; } }
`;

function makeBlades(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: 1 + Math.random() * 94, // % de la largeur
    width: Math.round(20 + Math.random() * 20), // px
    tint: TINTS[i % TINTS.length],
    path: Math.floor(Math.random() * PATHS.length),
    delay: Math.random() * 1.5, // s
    duration: 2.4 + Math.random() * 1.2, // s
  }));
}

/** Lame à double tranchant (même dessin que celle du terrain) : fente, trous et encoches en noir. */
function Blade({ tint }) {
  const hole = COUPE_COLORS.noir;
  return (
    <svg viewBox="0 0 30 13" aria-hidden="true" focusable="false">
      <rect width="30" height="13" rx="2.5" fill={tint} />
      <path d="M3.5 1.4H26.5" stroke="#ffffff" strokeOpacity=".45" strokeWidth=".9" strokeLinecap="round" />
      <rect x="6" y="4.9" width="18" height="3.2" rx="1.6" fill={hole} />
      <circle cx="6" cy="6.5" r="2.2" fill={hole} />
      <circle cx="24" cy="6.5" r="2.2" fill={hole} />
      <circle cx="15" cy="6.5" r="2.8" fill={hole} />
      <path d="M12.5 0L15 2.5L17.5 0ZM12.5 13L15 10.5L17.5 13Z" fill={hole} />
    </svg>
  );
}

export default function BladeRain({ count = COUNT }) {
  const reduce = useReducedMotion();
  // Tirées une fois : un nouveau rendu de l'écran de fin (points arrivés après) ne relance rien
  const [blades] = useState(() => makeBlades(count));
  const [done, setDone] = useState(false);
  const endMs = Math.ceil(Math.max(0, ...blades.map((b) => b.delay + b.duration)) * 1000);

  useEffect(() => {
    if (reduce) return undefined;
    const timer = setTimeout(() => setDone(true), endMs + 200);
    return () => clearTimeout(timer);
  }, [reduce, endMs]);

  if (reduce || done) return null;
  return (
    <div className="cdg-blades" aria-hidden="true">
      <style>{BLADE_CSS}</style>
      {blades.map((b) => (
        <span
          key={b.id}
          className={`cdg-blade cdg-blade-${b.path}`}
          style={{
            left: `${b.left.toFixed(1)}%`,
            width: b.width,
            animationDelay: `${b.delay.toFixed(2)}s`,
            animationDuration: `${b.duration.toFixed(2)}s`,
          }}
        >
          <Blade tint={b.tint} />
        </span>
      ))}
    </div>
  );
}
