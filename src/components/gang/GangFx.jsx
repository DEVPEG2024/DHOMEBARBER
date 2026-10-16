import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { hapticFeedback } from '@/lib/capacitor';
import { GANG_SHIELD_PATH as SHIELD } from './gangTheme';

/**
 * Effets de la carte Gang, repris de la maquette validée par le salon (16 oct. 2026) :
 * chaque niveau (Bronze → Icône) et chaque fête (Halloween, Noël, Nouvel An, anniversaire)
 * a ses ornements, son animation au repos, son arrivée et sa surprise au toucher.
 * Plus le niveau est rare, plus la carte en fait ; aucun bandeau écrit.
 *
 * Tout est dans le repère 300 × 440 de la carte. Couches (de l'arrière vers l'avant) :
 * - FxBehind : derrière la carte, sans inclinaison (aura, rayons, feux d'artifice, particules) ;
 * - FxBack : ornements qui dépassent derrière la carte et suivent l'inclinaison (lauriers, ailes) ;
 * - FxSurface / FxRing : fond et liseré des deux faces (texture, rayures, lumière qui fait le tour) ;
 * - FxInner : dans le recto (cire, neige, bulles, fanion, reflets…) ;
 * - FxFront : ornements posés sur la carte (rivets, couronne, guirlande, serpentins…) ;
 * - FxOver : au-dessus de tout (éclairs, compte à rebours, confettis, textes de surprise).
 *
 * Règles : n'animer que transform et opacity ; rien d'animé avec la réduction des animations ;
 * les ornements qui dépassent ne sont dessinés que sur une grande carte (pas les vignettes).
 */

// ── Réglages par effet ──────────────────────────────────────────────────────

const FX = {
  bronze: { arrival: 'slide', offset: 0, ms: 900 },
  argent: { arrival: 'slide', offset: 0, ms: 1200 },
  or: { arrival: 'slide', offset: 0, ms: 1400 },
  orrare: { arrival: 'holo', offset: 0.2, ms: 1500, side: 46 },
  tots: { arrival: 'drop', offset: 1, ms: 2000, top: 22, side: 46 },
  icone: { arrival: 'icone', offset: 0.3, ms: 2300, top: 56 },
  halloween: { arrival: 'storm', offset: 0.4, ms: 1700, emblem: '🎃', emblemLabel: 'Toucher la citrouille' },
  noel: { arrival: 'gift', offset: 1.6, ms: 2300, top: 12, emblem: '🎄', emblemLabel: 'Faire tourbillonner la neige' },
  anniv: { arrival: 'neon', offset: 0.5, ms: 1700, top: 58, emblem: '👑', emblemLabel: 'Lancer le son' },
  nouvel_an: { arrival: 'countdown', offset: 2.1, ms: 3000, emblem: '🍾', emblemLabel: 'Faire sauter le bouchon' },
};
FX.or.side = 40;

export const gangFx = (p) => (p?.fx && FX[p.fx] ? { key: p.fx, ...FX[p.fx] } : null);

/** Place prise au-dessus de la carte par ses ornements (repère 300 × 440). */
export const gangFxOverhangTop = (p) => gangFx(p)?.top || 0;

/** Phrase d'aide sous une grande carte retournable. */
export function gangFxHint(p) {
  const fx = gangFx(p);
  if (!fx) return 'Touche ta carte pour la retourner';
  if (fx.emblem) return `Touche ${fx.key === 'anniv' ? 'la couronne' : 'l’emblème'} pour la surprise, la carte pour la retourner`;
  return 'Touche les étoiles pour la surprise, la carte pour la retourner';
}

// Arrivée « grand spectacle » : une fois par effet et par ouverture de l'app (sinon l'arrivée simple)
const played = new Map();
export function claimShowArrival(key) {
  if (!key) return false;
  const now = Date.now();
  const at = played.get(key);
  if (at && now - at > 1500) return false; // la double exécution du mode strict reste vraie
  if (!at) played.set(key, now);
  return true;
}

// ── Aléatoire à graine : mêmes positions à chaque affichage ──────────────────

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const list = (seed, n, make) => { const r = seeded(seed); const rnd = (a, b) => a + r() * (b - a); return Array.from({ length: n }, (_, i) => make(rnd, i)); };
const f1 = (v) => Math.round(v * 10) / 10;

const SNOW = list(1225, 22, (rnd) => ({ x: f1(rnd(4, 296)), s: f1(rnd(3, 7)), dur: f1(rnd(4, 8)), delay: f1(rnd(0, 8)), dx: Math.round(rnd(-20, 30)) }));
const BUBBLES = list(2027, 18, (rnd) => ({ x: f1(rnd(10, 290)), s: f1(rnd(4, 10)), dur: f1(rnd(4, 9)), delay: f1(rnd(0, 9)), dx: Math.round(rnd(-12, 12)) }));
const TWINKLES = list(1818, 7, (rnd) => ({ x: Math.round(rnd(24, 270)), y: Math.round(rnd(40, 380)), delay: f1(rnd(0, 2)) }));
const RISE = list(3636, 10, (rnd) => ({ x: Math.round(rnd(10, 290)), delay: f1(rnd(0, 3)) }));
const DUST = list(1806, 12, (rnd) => ({ x: Math.round(rnd(-30, 330)), y: Math.round(rnd(-10, 450)), delay: f1(rnd(0, 4)) }));
const GOLDRAIN = list(9999, 26, (rnd) => ({ x: Math.round(rnd(0, 300)), delay: f1(rnd(0, 0.6)), dur: f1(rnd(1.1, 1.8)), dx: Math.round(rnd(-20, 20)) }));
const CONFETTI = list(1607, 54, (rnd, i) => {
  const a = (i / 54) * Math.PI * 2;
  const d = rnd(110, 240);
  return { c: ['#2ee6b0', '#e1262c', '#ffffff', '#9dffe0', '#111111'][i % 5], x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d + 200), r: Math.round(rnd(-600, 600)), delay: f1(rnd(0, 0.15)), round: i % 2 === 1 };
});
const SPARKS = list(333, 26, (rnd, i) => { const a = (i / 26) * Math.PI * 2; const d = rnd(80, 150); return { x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d) }; });
const FOAM = list(101, 26, (rnd) => ({ s: f1(rnd(4, 11)), x: Math.round(rnd(10, 220)), y: Math.round(rnd(-200, -40)), delay: f1(rnd(0, 0.25)) }));
const EQ = [0.7, 0.45, 0.9, 0.6, 1, 0.55, 0.8, 0.4];
const FIREWORKS = [[-14, 34, '#f2c94c', 0], [318, 18, '#ff6b8a', 0.9], [150, -36, '#8fd3ff', 1.7], [-6, 424, '#c6ff3d', 1.3], [306, 404, '#f2c94c', 2.1]];
const RIVETS = [[10, 70], [290, 70], [10, 300], [290, 300], [70, 380], [230, 380]];
const DRIPS = [18, 44, 71, 103, 132, 165, 196, 224, 252, 280].map((x, i) => ({ x, h: 14 + ((i * 37) % 34), delay: f1(i * 0.7) }));

// ── Feuille de style (injectée une fois) ─────────────────────────────────────

const CSS = `
.gfx-a{position:absolute;pointer-events:none}
.gfx-still .gfx-anim,.gfx-still.gfx-anim{animation:none!important}
@media (prefers-reduced-motion:reduce){.gfx-anim{animation:none!important}}
@keyframes gfx-slide{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}
@keyframes gfx-holo-in{0%{opacity:0;transform:scale(.94)}60%{opacity:1}100%{opacity:1;transform:none}}
@keyframes gfx-drop{0%,55%{opacity:0;transform:translateY(-120px)}80%{opacity:1;transform:translateY(6px)}100%{opacity:1;transform:none}}
@keyframes gfx-icone-in{0%,15%{opacity:0;transform:scale(.9)}100%{opacity:1;transform:none}}
@keyframes gfx-storm{0%,7%{opacity:0;transform:scale(.94)}9%{opacity:1}12%{opacity:.15}25%{opacity:1;transform:none}100%{opacity:1;transform:none}}
@keyframes gfx-fade-in{from{opacity:0}to{opacity:1}}
@keyframes gfx-neon-in{0%,30%{opacity:0;transform:translateY(18px) scale(.95)}100%{opacity:1;transform:none}}
@keyframes gfx-ny-in{0%,76%{opacity:0;transform:scale(.85)}82%{opacity:1;transform:scale(1.04)}100%{opacity:1;transform:none}}
@keyframes gfx-glint{0%,70%{transform:skewX(-18deg) translateX(-150%)}100%{transform:skewX(-18deg) translateX(560%)}}
@keyframes gfx-glint-once{from{transform:skewX(-18deg) translateX(-150%)}to{transform:skewX(-18deg) translateX(560%)}}
@keyframes gfx-rivet{50%{transform:translateY(-6px) scale(1.4)}}
@keyframes gfx-grow{from{transform:scale(0);opacity:0}to{transform:none;opacity:1}}
@keyframes gfx-burst{0%{opacity:1;transform:translate(0,0) rotate(0)}60%{opacity:1}100%{opacity:0;transform:translate(var(--x),var(--y)) rotate(var(--r,0deg))}}
@keyframes gfx-holo{from{transform:translateX(-480px)}to{transform:translateX(300px)}}
@keyframes gfx-tw{0%,100%{opacity:0;transform:scale(.4)}50%{opacity:1;transform:scale(1.4)}}
@keyframes gfx-sweep{from{transform:translateX(-120%) skewX(-12deg)}to{transform:translateX(320%) skewX(-12deg)}}
@keyframes gfx-prism{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(40)}}
@keyframes gfx-spin{to{transform:rotate(360deg)}}
@keyframes gfx-walk{0%{opacity:0;transform:scale(2)}25%{opacity:1;transform:scale(1)}70%{opacity:1}100%{opacity:0;transform:scale(.9)}}
@keyframes gfx-up{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-220px)}}
@keyframes gfx-zap{0%,100%{opacity:0}20%,60%{opacity:.6}40%,80%{opacity:0}}
@keyframes gfx-breathe{50%{transform:scale(1.12);opacity:.7}}
@keyframes gfx-float{50%{transform:translateY(-14px);opacity:.3}}
@keyframes gfx-rays{0%{opacity:0;transform:rotate(0)}30%{opacity:1}100%{opacity:0;transform:rotate(40deg)}}
@keyframes gfx-descend{from{transform:translateY(-80px);opacity:0}to{transform:none;opacity:1}}
@keyframes gfx-shine{0%,100%{opacity:0}25%,75%{opacity:1}50%{opacity:.3}}
@keyframes gfx-fall{to{transform:translate(var(--dx,10px),470px)}}
@keyframes gfx-drip{0%,100%{transform:scaleY(.75)}50%{transform:scaleY(1.15)}}
@keyframes gfx-flicker{0%,100%{opacity:.9}12%{opacity:.55}20%{opacity:1}47%{opacity:.7}53%{opacity:.95}78%{opacity:.6}}
@keyframes gfx-fog{from{transform:translateX(-40px)}to{transform:translateX(60px)}}
@keyframes gfx-ghost{0%{transform:translate(0,0);opacity:0}8%{opacity:.55}50%{transform:translate(220px,-18px);opacity:.55}60%{opacity:0}100%{transform:translate(420px,0);opacity:0}}
@keyframes gfx-lightning{0%{opacity:0}8%{opacity:.95}12%{opacity:0}24%{opacity:.75}28%{opacity:0}100%{opacity:0}}
@keyframes gfx-blink{50%{opacity:.25}}
@keyframes gfx-bow{to{transform:translate(-50%,-260%) rotate(-25deg) scale(1.3);opacity:0}}
@keyframes gfx-out{to{opacity:0}}
@keyframes gfx-open-l{to{transform:translateX(-110%) rotate(-8deg)}}
@keyframes gfx-open-r{to{transform:translateX(110%) rotate(8deg)}}
@keyframes gfx-neon{0%{opacity:0}15%{opacity:1}25%{opacity:.1}40%{opacity:1}50%{opacity:.2}65%,100%{opacity:1}}
@keyframes gfx-glow{50%{opacity:.75}}
@keyframes gfx-swing{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
@keyframes gfx-eq{from{transform:scaleY(.18)}to{transform:scaleY(var(--h,.6))}}
@keyframes gfx-bub{to{transform:translate(var(--dx,6px),-470px)}}
@keyframes gfx-fw{0%{opacity:0;transform:translate(0,0) scale(.4)}6%{opacity:1}60%{opacity:.9}100%{opacity:0;transform:translate(var(--x),calc(var(--y) + 30px)) scale(.8)}}
@keyframes gfx-cnt{0%{opacity:0;transform:scale(1.6)}20%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(.8)}}
@keyframes gfx-flash{0%{opacity:0}15%{opacity:1}100%{opacity:0}}
@keyframes gfx-cork{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(60px,-160px) rotate(540deg)}}
@keyframes gfx-foam{0%{opacity:1;transform:translate(0,0) scale(.5)}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(1.4)}}
@keyframes gfx-pop-text{0%{opacity:0;transform:translateY(8px) rotate(var(--rot,0deg)) scale(.6)}15%{opacity:1;transform:rotate(var(--rot,0deg)) scale(1.05)}25%{transform:rotate(var(--rot,0deg)) scale(1)}85%{opacity:1}100%{opacity:0;transform:rotate(var(--rot,0deg))}}
.gfx-in-slide{animation:gfx-slide .9s cubic-bezier(.2,1,.3,1) both}
.gfx-in-holo{animation:gfx-holo-in 1.1s ease-out both}
.gfx-in-drop{animation:gfx-drop 1.9s cubic-bezier(.3,1.4,.5,1) both}
.gfx-in-icone{animation:gfx-icone-in 1.6s ease-out both}
.gfx-in-storm{animation:gfx-storm 1.6s ease-out both}
.gfx-in-gift{animation:gfx-fade-in .3s ease-out both}
.gfx-in-neon{animation:gfx-neon-in 1.4s ease-out both}
.gfx-in-countdown{animation:gfx-ny-in 2.8s ease-out both}
`;

let cssInjected = false;
function useFxCss() {
  useEffect(() => {
    if (cssInjected || typeof document === 'undefined') return;
    cssInjected = true;
    const el = document.createElement('style');
    el.id = 'gang-fx-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

const abs = { position: 'absolute', pointerEvents: 'none' };
const CARD_BOX = { position: 'absolute', left: 0, top: 0, width: 300, height: 440, pointerEvents: 'none', overflow: 'visible' };
const clipShield = { clipPath: `path('${SHIELD}')`, WebkitClipPath: `path('${SHIELD}')` };
const anim = (value) => ({ animation: value });

/** Classe d'arrivée du conteneur de la carte. */
export const gangFxArrivalClass = (fx) => (fx ? `gfx-anim gfx-in-${fx.arrival}` : '');

// ── Surprise au toucher ─────────────────────────────────────────────────────

const CARD_MOVES = {
  argent: [[{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }], { duration: 900, easing: 'cubic-bezier(.3,.9,.3,1)' }],
  tots: [[{ transform: 'none' }, { transform: 'translateX(3px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 600 }],
  icone: [[{ transform: 'none' }, { transform: 'translateY(-14px)' }, { transform: 'none' }], { duration: 1400, easing: 'ease-in-out' }],
  halloween: [[{ transform: 'none' }, { transform: 'translateX(-5px) rotate(-1deg)' }, { transform: 'translateX(5px) rotate(1deg)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], { duration: 500 }],
  anniv: [[{ transform: 'scale(1.05)' }, { transform: 'none' }], { duration: 480, iterations: 4, easing: 'ease-out' }],
  nouvel_an: [[{ transform: 'none' }, { transform: 'translateY(-6px)' }, { transform: 'none' }], { duration: 400, easing: 'ease-out' }],
  noel: [[{ transform: 'none' }, { transform: 'rotate(-1.5deg)' }, { transform: 'rotate(1.5deg)' }, { transform: 'none' }], { duration: 600 }],
};
const STATE_MS = { halloween: 1500, noel: 2600, anniv: 2600, nouvel_an: 2600 };
const HIT_MS = 1900;

/**
 * Surprise d'une carte : `fire()` la déclenche (haptique, mouvement de la carte, éléments
 * remontés par `hit`), `active` reste vrai le temps de l'effet. Noël : secouer le téléphone
 * fait aussi tourbillonner la neige (si l'accès aux mouvements est accordé).
 */
export function useGangFxSurprise(fx, cardRef, { reduceMotion, shake }) {
  const [hit, setHit] = useState(0);
  const [active, setActive] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const fire = useCallback(() => {
    if (!fx) return;
    hapticFeedback();
    try {
      if (navigator.vibrate) {
        if (fx.key === 'anniv') navigator.vibrate([60, 420, 60, 420, 60]);
        else if (fx.key === 'halloween') navigator.vibrate([40, 30, 40]);
      }
    } catch { /* vibration indisponible */ }
    setHit((n) => n + 1);
    setActive(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), STATE_MS[fx.key] || HIT_MS);
    const move = CARD_MOVES[fx.key];
    const el = cardRef.current;
    if (move && el && !reduceMotion && typeof el.animate === 'function') el.animate(move[0], move[1]);
  }, [fx, cardRef, reduceMotion]);

  // Boule à neige : une vraie secousse du téléphone
  useEffect(() => {
    if (!shake || fx?.key !== 'noel' || typeof window === 'undefined') return undefined;
    let last = 0;
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const force = Math.abs(a.x || 0) + Math.abs(a.y || 0) + Math.abs(a.z || 0);
      if (force > 32 && Date.now() - last > 800) { last = Date.now(); fire(); }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [shake, fx, fire]);

  return { hit, active, fire };
}

// ── Pièces de décor ─────────────────────────────────────────────────────────

/** Branche de laurier le long du bord gauche, à l'extérieur ; `flip` = bord droit. */
function Laurel({ flip, gold, grow }) {
  const P = (t) => [(1 - t) ** 2 * 6 + 2 * (1 - t) * t * -38 + t * t * -6, (1 - t) ** 2 * 250 + 2 * (1 - t) * t * 150 + t * t * 46];
  const leaves = [];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8.6;
    const [x, y] = P(t);
    const [x2, y2] = P(t + 0.01);
    const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + (i % 2 ? -38 : 38);
    leaves.push(<ellipse key={i} cx={f1(x)} cy={f1(y)} rx="10" ry="4.2" transform={`rotate(${Math.round(ang)} ${f1(x)} ${f1(y)}) translate(7 0)`} />);
  }
  return (
    <g transform={flip ? 'translate(300 0) scale(-1 1)' : undefined} fill={`url(#${gold})`} stroke="#8a6418" strokeWidth=".8">
      <g className={grow ? 'gfx-anim' : undefined} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', animation: grow ? 'gfx-grow 1s cubic-bezier(.2,1.4,.4,1) .3s both' : undefined }}>
        <path d="M6 250 Q-38 150 -6 46" fill="none" stroke="#c7962c" strokeWidth="2.5" />
        {leaves}
      </g>
    </g>
  );
}

function Wing({ flip, color }) {
  return (
    <g transform={flip ? 'translate(300 0) scale(-1 1)' : undefined}>
      <path d="M4 200 C-30 186 -48 150 -44 108 C-30 132 -18 142 -2 148 C-28 128 -34 102 -28 80 C-14 104 -6 114 4 120 C-14 98 -16 78 -10 62 C0 84 6 94 12 98 Z" fill={color} opacity=".92" />
    </g>
  );
}

/** SVG du repère de la carte, élargi pour les ornements qui dépassent. */
function OrnamentSvg({ children, style }) {
  return (
    <svg viewBox="-50 -70 400 580" style={{ ...abs, left: -50, top: -70, width: 400, height: 580, overflow: 'visible', ...style }} aria-hidden="true">
      {children}
    </svg>
  );
}

function GoldDefs({ id }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff3b0" />
        <stop offset="1" stopColor="#b8860b" />
      </linearGradient>
    </defs>
  );
}

const useSvgId = (name) => `gfx-${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

// ── Couches ─────────────────────────────────────────────────────────────────

/** Derrière la carte, sans inclinaison. */
export function FxBehind({ fx, animated, arrival }) {
  useFxCss();
  if (!fx || !animated) return null;
  if (fx.key === 'tots') {
    return (
      <div className="gfx-a" style={{ ...CARD_BOX }} aria-hidden="true">
        {RISE.map((r, i) => (
          <i key={i} className="gfx-anim" style={{ ...abs, left: r.x, top: 400, width: 3, height: 3, borderRadius: '50%', background: '#9fe0ff', boxShadow: '0 0 6px #7fd0ff', opacity: 0, ...anim(`gfx-up 3s linear -${r.delay}s infinite`) }} />
        ))}
      </div>
    );
  }
  if (fx.key === 'icone') {
    return (
      <div className="gfx-a" style={{ ...CARD_BOX }} aria-hidden="true">
        {arrival && (
          <div className="gfx-anim" style={{ ...abs, left: -150, top: -100, width: 600, height: 640, opacity: 0, background: 'repeating-conic-gradient(from 0deg, transparent 0 10deg, rgba(255,236,170,.2) 10deg 14deg)', WebkitMaskImage: 'radial-gradient(closest-side, #000 40%, transparent)', maskImage: 'radial-gradient(closest-side, #000 40%, transparent)', ...anim('gfx-rays 2.2s ease-out') }} />
        )}
        <div style={{ ...abs, left: 0, top: 40, width: 300, height: 360 }}>
          <div className="gfx-anim" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,236,170,.55), rgba(217,200,255,.25) 55%, transparent)', filter: 'blur(10px)', ...anim('gfx-breathe 3.2s ease-in-out infinite') }} />
        </div>
        {DUST.map((d, i) => (
          <i key={i} className="gfx-anim" style={{ ...abs, left: d.x, top: d.y, width: 4, height: 4, borderRadius: '50%', background: '#ffe08a', boxShadow: '0 0 6px #ffd34d', opacity: 0.8, ...anim(`gfx-float 4s ease-in-out -${d.delay}s infinite`) }} />
        ))}
      </div>
    );
  }
  if (fx.key === 'anniv') {
    // Halo menthe du néon autour de l'écusson
    return (
      <svg viewBox="0 0 300 440" className={arrival ? 'gfx-a gfx-anim' : 'gfx-a'} style={{ ...CARD_BOX, filter: 'blur(9px)', opacity: 0.75, animation: arrival ? 'gfx-neon 1.1s steps(1) .3s both' : undefined }} aria-hidden="true">
        <path d={SHIELD} fill="none" stroke="#2ee6b0" strokeWidth="10" />
      </svg>
    );
  }
  if (fx.key === 'nouvel_an') {
    return (
      <div className="gfx-a" style={{ ...CARD_BOX }} aria-hidden="true">
        {FIREWORKS.map(([x, y, color, delay], b) => (
          <span key={b} style={{ ...abs, left: x, top: y, width: 4, height: 4 }}>
            {Array.from({ length: 16 }, (_, i) => {
              const a = (i / 16) * Math.PI * 2;
              return (
                <i key={i} className="gfx-anim" style={{ ...abs, left: 0, top: 0, width: 4, height: 4, borderRadius: '50%', background: color, boxShadow: `0 0 6px 1px ${color}`, opacity: 0, '--x': `${Math.round(Math.cos(a) * 54)}px`, '--y': `${Math.round(Math.sin(a) * 54)}px`, ...anim(`gfx-fw 2.6s ease-out ${delay}s infinite`) }} />
              );
            })}
          </span>
        ))}
      </div>
    );
  }
  return null;
}

/** Ornements qui dépassent derrière la carte (lauriers, ailes), inclinés avec elle. */
export function FxBack({ fx, arrival }) {
  const gold = useSvgId('gold');
  if (!fx || !['or', 'orrare', 'tots'].includes(fx.key)) return null;
  const laurels = fx.key !== 'tots';
  const wings = fx.key !== 'or';
  const wingColor = fx.key === 'tots' ? '#c3182d' : '#ffe9a6';
  return (
    <OrnamentSvg style={{ transform: 'translateZ(-2px)' }}>
      <GoldDefs id={gold} />
      {laurels && <Laurel gold={gold} grow={arrival} />}
      {laurels && <Laurel flip gold={gold} grow={arrival} />}
      {wings && <Wing color={wingColor} />}
      {wings && <Wing flip color={wingColor} />}
    </OrnamentSvg>
  );
}

/** Fond des deux faces : textures et lueurs propres au niveau ou à la fête. */
export function FxSurface({ fx }) {
  if (!fx) return null;
  const layers = {
    argent: 'repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px)',
    or: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(231,196,99,.25), transparent 70%)',
    tots: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(127,208,255,.3), transparent 70%)',
    icone: 'radial-gradient(ellipse 70% 50% at 50% 10%, #fff, transparent 70%)',
    halloween: 'radial-gradient(ellipse 80% 55% at 60% 30%, rgba(58,26,16,.9) 0%, transparent 70%)',
    noel: 'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(179,32,42,.9) 0%, transparent 70%)',
    anniv: 'repeating-linear-gradient(90deg, rgba(225,38,44,.2) 0 24px, transparent 24px 48px), radial-gradient(ellipse 80% 50% at 50% 0%, rgba(46,230,176,.22), transparent 70%)',
    nouvel_an: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(242,201,76,.25) 0%, transparent 70%)',
  }[fx.key];
  return layers ? <div aria-hidden="true" style={{ ...abs, inset: 0, background: layers }} /> : null;
}

/** Liseré : la lumière qui fait le tour de la carte TOTS (cachée au centre par le fond). */
export function FxRing({ fx, animated }) {
  if (!fx || fx.key !== 'tots' || !animated) return null;
  return (
    <div aria-hidden="true" style={{ ...abs, inset: 0, ...clipShield, overflow: 'hidden' }}>
      <div
        className="gfx-anim"
        style={{
          ...abs, left: -150, top: -80, width: 600, height: 600, borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent 0 300deg, rgba(191,234,255,.25) 320deg, rgba(220,245,255,1) 352deg, transparent 360deg)',
          ...anim('gfx-spin 2.4s linear infinite'),
        }}
      />
    </div>
  );
}

/** Pastille de surprise à la place de la pastille du niveau : étoiles (niveaux) ou emblème (fêtes). */
export function FxBadge({ fx, p, interactive, onSurprise, active }) {
  if (!fx) return null;
  const stop = (e) => e.stopPropagation();
  const props = interactive
    ? {
      type: 'button',
      onClick: (e) => { e.stopPropagation(); onSurprise(); },
      onKeyDown: (e) => { e.stopPropagation(); },
      onPointerDown: stop,
      onPointerUp: stop,
      'aria-label': fx.emblemLabel || `Carte ${p.label} : surprise`,
    }
    : { 'aria-hidden': true };
  const Tag = interactive ? 'button' : 'span';
  if (fx.emblem) {
    return (
      <Tag
        {...props}
        style={{
          marginTop: 8, width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 28, lineHeight: 1,
          background: 'rgba(0,0,0,.35)', boxShadow: `0 0 0 1.5px ${p.accent}${active && fx.key === 'halloween' ? ', 0 0 26px 8px rgba(255,120,20,.8)' : ''}`,
          border: 0, padding: 0, cursor: interactive ? 'pointer' : undefined, color: 'inherit',
          transform: active && fx.key === 'halloween' ? 'scale(1.35)' : undefined, transition: 'transform .2s',
          fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
        }}
      >
        {fx.emblem}
      </Tag>
    );
  }
  const n = p.stars || 1;
  return (
    <Tag
      {...props}
      style={{
        marginTop: 6, padding: '3px 0', border: 0, background: 'none', cursor: interactive ? 'pointer' : undefined,
        display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, n)}, 15px)`, justifyContent: 'center', rowGap: 1,
        color: p.accent, fontSize: 15, lineHeight: 1, textShadow: '0 0 6px rgba(0,0,0,.55)',
      }}
    >
      {Array.from({ length: n }, (_, i) => <span key={i}>★</span>)}
    </Tag>
  );
}

const glintStyle = (gold) => ({
  ...abs, top: '-20%', bottom: '-20%', left: '-40%', width: '30%', zIndex: 7, transform: 'skewX(-18deg) translateX(-150%)', mixBlendMode: 'screen',
  background: gold ? 'linear-gradient(90deg, transparent, rgba(255,236,170,.75), transparent)' : 'linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)',
});

/** Dans le recto. `active` : surprise en cours ; `hit` : numéro de la surprise (remonte les éléments). */
export function FxInner({ fx, animated, arrival, hit, active }) {
  if (!fx) return null;
  const k = fx.key;
  const year = (() => {
    try { return Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric' }).format(new Date())); } catch { return new Date().getFullYear(); }
  })();

  return (
    <div aria-hidden="true" className={animated ? undefined : 'gfx-still'} style={{ ...abs, inset: 0 }}>
      {/* Reflets : argent de temps en temps, or régulier, bronze au toucher */}
      {k === 'argent' && animated && <div className="gfx-anim" style={{ ...glintStyle(false), ...anim(arrival ? 'gfx-glint-once .9s ease-out .3s 1, gfx-glint 6s ease-in-out 2s infinite' : 'gfx-glint 6s ease-in-out 1.5s infinite') }} />}
      {k === 'or' && animated && <div className="gfx-anim" style={{ ...glintStyle(true), ...anim('gfx-glint 4s ease-in-out 1s infinite') }} />}
      {k === 'bronze' && hit > 0 && <div key={hit} className="gfx-anim" style={{ ...glintStyle(false), ...anim('gfx-glint-once .9s ease-out both') }} />}

      {k === 'orrare' && (
        <>
          <div style={{ ...abs, inset: 0, overflow: 'hidden', zIndex: 4, mixBlendMode: 'overlay', opacity: 0.5 }}>
            <div
              className="gfx-anim"
              style={{
                ...abs, left: 0, top: 0, bottom: 0, width: 780,
                background: 'linear-gradient(115deg, transparent 20%, #ff7ad9 32%, #7af0ff 42%, #ffe27a 52%, transparent 64%)',
                transform: animated ? undefined : 'translateX(-240px)',
                ...(animated ? anim('gfx-holo 5s linear infinite') : {}),
              }}
            />
          </div>
          {animated && TWINKLES.map((t, i) => (
            <i
              key={i}
              className="gfx-anim"
              style={{
                ...abs, left: t.x, top: t.y, width: 6, height: 6, zIndex: 6, background: '#fff', opacity: 0,
                clipPath: 'polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)',
                ...anim(`gfx-tw 2s ease-in-out -${t.delay}s infinite`),
              }}
            />
          ))}
        </>
      )}

      {k === 'halloween' && (
        <>
          <svg viewBox="0 0 300 70" style={{ ...abs, left: 0, top: 0, width: 300, height: 70, zIndex: 5 }}>
            <defs>
              <linearGradient id="gfx-wax" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff9a2e" /><stop offset="1" stopColor="#d4520a" /></linearGradient>
            </defs>
            <rect x="0" y="0" width="300" height="10" fill="url(#gfx-wax)" />
            {DRIPS.map((d) => (
              <g key={d.x} className="gfx-anim" style={{ transformBox: 'fill-box', transformOrigin: 'top', ...(animated ? anim(`gfx-drip 4s ease-in-out -${d.delay}s infinite`) : {}) }}>
                <rect x={d.x - 4} y="0" width="8" height={d.h} rx="4" fill="url(#gfx-wax)" />
                <circle cx={d.x} cy={d.h} r="5.5" fill="url(#gfx-wax)" />
              </g>
            ))}
          </svg>
          <svg viewBox="0 0 70 70" fill="none" stroke="#fff" strokeWidth=".8" style={{ ...abs, left: 228, top: 300, width: 70, height: 70, zIndex: 5, opacity: 0.5 }}>
            <path d="M70 0 L0 70 M70 0 L30 70 M70 0 L0 30 M70 0 L60 70 M70 0 L0 55" />
            <path d="M58 4 Q55 14 64 12 M46 10 Q40 28 60 24 M34 16 Q24 42 56 36 M22 22 Q8 56 52 48" />
          </svg>
          <div className="gfx-anim" style={{ ...abs, inset: 0, zIndex: 4, mixBlendMode: 'screen', opacity: 0.9, background: 'radial-gradient(circle at 50% 30%, rgba(255,140,40,.35), transparent 55%)', ...(animated ? anim('gfx-flicker 2.2s infinite') : {}) }} />
          {animated && (
            <div style={{ ...abs, left: -60, right: -60, bottom: 30, height: 120, zIndex: 5 }}>
              {[0, 120, 250].map((left, i) => (
                <i key={left} className="gfx-anim" style={{ ...abs, left, bottom: 0, width: 220, height: 70, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(150,255,170,.28), transparent)', filter: 'blur(6px)', ...anim(`gfx-fog 9s ease-in-out -${i * 3}s infinite alternate`) }} />
              ))}
            </div>
          )}
          {animated && (
            <svg viewBox="0 0 60 70" className="gfx-anim" style={{ ...abs, top: 70, left: -70, width: 56, height: 65, zIndex: 2, opacity: 0, ...anim('gfx-ghost 11s linear 2s infinite') }}>
              <path fill="#f4f0ff" d="M30 2C14 2 6 14 6 30v36l8-7 8 7 8-7 8 7 8-7 8 7V30C54 14 46 2 30 2z" />
              <circle cx="22" cy="28" r="4" fill="#1a0f20" /><circle cx="38" cy="28" r="4" fill="#1a0f20" />
            </svg>
          )}
          <div
            className="font-fut"
            style={{
              ...abs, left: 96, top: 176, zIndex: 9, color: '#ff8a1f', fontFamily: "'Creepster', 'Barlow Condensed', sans-serif", fontSize: 28,
              textShadow: '0 0 12px #ff6a00', whiteSpace: 'nowrap', opacity: active ? 1 : 0, transform: active ? 'none' : 'translateY(6px)', transition: 'opacity .2s, transform .2s',
            }}
          >
            Mouahaha !
          </div>
        </>
      )}

      {k === 'noel' && animated && (
        <div style={{ ...abs, inset: 0, zIndex: 5 }}>
          {SNOW.map((f, i) => (
            <i
              key={i}
              className="gfx-anim"
              style={{
                ...abs, left: f.x, top: -10, width: f.s, height: f.s, borderRadius: '50%', background: '#fff', opacity: 0.9,
                '--dx': `${active ? 60 : f.dx}px`, ...anim(`gfx-fall ${active ? 0.9 : f.dur}s linear -${f.delay}s infinite`),
              }}
            />
          ))}
        </div>
      )}

      {k === 'anniv' && (
        <>
          <svg viewBox="0 0 56 92" className="gfx-anim" style={{ ...abs, left: 214, top: 150, width: 56, height: 92, zIndex: 7, transformOrigin: '28px 0', ...(animated ? anim('gfx-swing 3.2s ease-in-out infinite') : {}) }}>
            <rect x="2" y="0" width="52" height="3" rx="1.5" fill="#c9a227" />
            <path d="M4 3 H52 L28 70 Z" fill="#111" /><path d="M4 3 H20 L28 70 Z" fill="#e1262c" /><path d="M36 3 H52 L28 70 Z" fill="#e1262c" />
            <path d="M4 3 H52" stroke="#c9a227" strokeWidth="2" />
            {Array.from({ length: 5 }, (_, i) => <line key={i} x1={6 + i * 5.2} y1={3 + i * 7.4} x2={6 + i * 5.2} y2={10 + i * 7.4} stroke="#c9a227" strokeWidth="1.2" />)}
            <text x="28" y="30" textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontWeight="800" fontSize="13" fill="#fff">HBD</text>
            <path d="M28 70 l-3 8 h6 z" fill="#c9a227" />
          </svg>
          <div style={{ ...abs, left: 110, top: 410, width: 80, height: 16, zIndex: 6, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            {EQ.map((h, i) => (
              <i
                key={i}
                className="gfx-anim"
                style={{
                  flex: 1, height: '100%', borderRadius: '2px 2px 0 0', background: 'linear-gradient(#e1262c, #2ee6b0 55%)', transformOrigin: 'bottom',
                  transform: animated ? undefined : `scaleY(${h})`, '--h': active ? 1 : h,
                  ...(animated ? anim(`gfx-eq ${active ? 0.18 : 0.9}s ease-in-out -${(i * 0.13).toFixed(2)}s infinite alternate`) : {}),
                }}
              />
            ))}
          </div>
        </>
      )}

      {k === 'nouvel_an' && (
        <>
          <div className="font-fut" style={{ ...abs, left: 0, right: 0, top: 150, textAlign: 'center', fontWeight: 800, fontSize: 120, lineHeight: 1, color: 'rgba(242,201,76,.08)', zIndex: 2 }}>{year}</div>
          {animated && (
            <div style={{ ...abs, inset: 0, zIndex: 5 }}>
              {BUBBLES.map((b, i) => (
                <i key={i} className="gfx-anim" style={{ ...abs, left: b.x, bottom: -12, width: b.s, height: b.s, borderRadius: '50%', border: '1px solid rgba(255,243,196,.7)', background: 'rgba(255,243,196,.12)', '--dx': `${b.dx}px`, ...anim(`gfx-bub ${b.dur}s linear -${b.delay}s infinite`) }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Ornements posés sur la carte, inclinés avec elle. */
export function FxFront({ fx, big, animated, arrival, hit, interactive, onSurprise }) {
  useFxCss();
  const gold = useSvgId('gold');
  const rivet = useSvgId('rivet');
  const snow = useSvgId('snow');
  if (!fx) return null;
  const k = fx.key;
  const z = { transform: 'translateZ(2px)' };

  if (k === 'bronze') {
    return (
      <svg viewBox="0 0 300 440" style={{ ...CARD_BOX, ...z }} aria-hidden="true">
        <defs><radialGradient id={rivet}><stop offset="0" stopColor="#ffd2a8" /><stop offset="1" stopColor="#7a4422" /></radialGradient></defs>
        {RIVETS.map(([x, y]) => (
          <circle key={`${x}-${y}-${hit}`} cx={x} cy={y} r="5" fill={`url(#${rivet})`} className={hit ? 'gfx-anim' : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: hit ? 'gfx-rivet .5s cubic-bezier(.3,1.8,.5,1)' : undefined }} />
        ))}
      </svg>
    );
  }
  if (k === 'argent') {
    return (
      <svg viewBox="0 0 300 440" style={{ ...CARD_BOX, ...z }} aria-hidden="true">
        {[120, 230].map((y) => <path key={y} d={`M-6 ${y} l10 8 l-10 8 z M306 ${y} l-10 8 l10 8 z`} fill="#dfe6ee" />)}
      </svg>
    );
  }
  if (k === 'tots') {
    return big ? (
      <OrnamentSvg style={z}>
        <path d="M147 0 L153 -22 L159 0 Z M115 0 L119 -14 L125 0 Z M169 0 L175 -14 L179 0 Z" fill="#ff5a6a" />
      </OrnamentSvg>
    ) : null;
  }
  if (k === 'icone') {
    if (!big) return null;
    return (
      <OrnamentSvg style={z}>
        <GoldDefs id={gold} />
        <g transform="translate(-40 -58)">
          <g className={arrival ? 'gfx-anim' : undefined} style={{ animation: arrival ? 'gfx-descend 1.2s cubic-bezier(.3,1.3,.5,1) .5s both' : undefined }}>
            {hit > 0 && <ellipse key={hit} cx="190" cy="30" rx="56" ry="34" fill="#ffd34d" opacity="0" className="gfx-anim" style={{ filter: 'blur(10px)', animation: 'gfx-shine 1.6s ease-in-out' }} />}
            <path d="M154 52 L148 18 L168 34 L190 4 L212 34 L232 18 L226 52 Z" fill={`url(#${gold})`} stroke="#8a6418" strokeWidth="1.5" />
            <circle cx="190" cy="6" r="4" fill="#fff6c8" /><circle cx="148" cy="17" r="3" fill="#fff6c8" /><circle cx="232" cy="17" r="3" fill="#fff6c8" />
          </g>
        </g>
      </OrnamentSvg>
    );
  }
  if (k === 'noel') {
    const lights = (color, offset, delay) => (
      <path
        d={SHIELD} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray="0 26" strokeDashoffset={offset} transform="translate(9 9) scale(.94)"
        className="gfx-anim" style={animated ? anim(`gfx-blink 1.2s steps(1) ${delay}s infinite`) : undefined}
      />
    );
    return (
      <div style={{ ...CARD_BOX, ...z }} aria-hidden="true">
        <svg viewBox="0 0 300 440" style={{ ...abs, inset: 0, width: 300, height: 440 }}>
          <path d={SHIELD} fill="none" stroke="#123b22" strokeWidth="2" transform="translate(9 9) scale(.94)" />
          {lights('#ff3b3b', 0, 0)}
          {lights('#ffd34d', 13, 0.6)}
        </svg>
        <svg viewBox="-6 -12 312 80" style={{ ...abs, left: -6, top: -12, width: 312, height: 80, filter: 'drop-shadow(0 3px 3px rgba(0,0,0,.35))' }}>
          <defs><linearGradient id={snow} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dfeaf5" /></linearGradient></defs>
          <path fill={`url(#${snow})`} d="M-2 52 Q-4 30 14 28 C30 25 36 14 42 4 Q48 -8 62 -8 C80 -12 92 -4 110 -9 C128 -13 140 -5 156 -10 C176 -14 190 -4 206 -9 C222 -13 232 -6 240 -8 Q254 -8 258 4 C264 14 270 25 286 28 Q304 30 302 52 C296 44 290 42 284 44 C272 40 266 34 258 22 C252 12 248 12 238 14 C220 10 206 18 190 13 C172 9 160 18 142 13 C124 9 112 17 96 13 C80 10 70 16 62 14 C52 12 48 14 42 22 C34 34 28 40 16 44 C10 42 4 44 -2 52 Z" />
          {[30, 66, 98, 132, 168, 204, 236, 272].map((x, i) => <path key={x} fill="#e8f4ff" fillOpacity=".9" d={`M${x} ${i % 2 ? 14 : 16} l4 ${10 + ((i * 5) % 9)} l4 -${10 + ((i * 5) % 9)} z`} />)}
        </svg>
        {/* Arrivée : la carte est emballée comme un cadeau, le nœud s'envole, le papier s'ouvre */}
        {arrival && (
          <div style={{ ...abs, inset: 0, ...clipShield }}>
            {[['left', 'gfx-open-l'], ['right', 'gfx-open-r']].map(([side, kf]) => (
              <div key={side} className="gfx-anim" style={{ ...abs, top: 0, bottom: 0, [side]: 0, width: '50%', background: 'repeating-linear-gradient(45deg, #c4161f 0 14px, #a8121a 14px 28px)', ...anim(`${kf} .8s cubic-bezier(.6,0,.2,1) 1.3s forwards`) }} />
            ))}
            <div className="gfx-anim" style={{ ...abs, top: 0, bottom: 0, left: '50%', width: 26, marginLeft: -13, background: 'linear-gradient(90deg, #e8c25a, #fff1b8, #e8c25a)', ...anim('gfx-out .4s ease-in 1.1s forwards') }} />
            <div className="gfx-anim" style={{ ...abs, left: 0, right: 0, top: '46%', height: 26, background: 'linear-gradient(#e8c25a, #fff1b8, #e8c25a)', ...anim('gfx-out .4s ease-in 1.1s forwards') }} />
            <div className="gfx-anim" style={{ ...abs, left: '50%', top: '46%', fontSize: 64, lineHeight: 1, transform: 'translate(-50%, -58%)', fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif', ...anim('gfx-bow .7s ease-in .5s forwards') }}>🎀</div>
          </div>
        )}
      </div>
    );
  }
  if (k === 'anniv') {
    if (!big) return null;
    const stop = (e) => e.stopPropagation();
    const Tag = interactive ? 'button' : 'span';
    const btn = interactive
      ? { type: 'button', 'aria-label': 'Lancer le son', onClick: (e) => { e.stopPropagation(); onSurprise(); }, onKeyDown: stop, onPointerDown: stop, onPointerUp: stop }
      : { 'aria-hidden': true };
    return (
      <div style={{ ...CARD_BOX, ...z }}>
        <Tag
          {...btn}
          className={arrival ? 'gfx-anim' : undefined}
          style={{
            position: 'absolute', left: 112, top: -58, width: 76, height: 58, border: 0, padding: 0, background: 'none',
            pointerEvents: interactive ? 'auto' : 'none', cursor: interactive ? 'pointer' : undefined,
            filter: 'drop-shadow(0 0 6px rgba(46,230,176,.9)) drop-shadow(0 0 16px rgba(46,230,176,.5))',
            animation: arrival ? 'gfx-neon 1.1s steps(1) .5s both' : undefined,
          }}
        >
          <svg viewBox="0 0 76 58" fill="none" stroke="#9dffe0" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" className="gfx-anim" style={{ width: '100%', height: '100%', display: 'block', ...(animated ? anim('gfx-glow 2.4s ease-in-out infinite') : {}) }}>
            <path d="M8 50 L4 14 L22 30 L38 6 L54 30 L72 14 L68 50 Z" /><path d="M10 50 H66" />
            <circle cx="4" cy="12" r="3" fill="#9dffe0" /><circle cx="38" cy="5" r="3" fill="#9dffe0" /><circle cx="72" cy="12" r="3" fill="#9dffe0" />
          </svg>
        </Tag>
      </div>
    );
  }
  if (k === 'nouvel_an') {
    return (
      <div style={{ ...CARD_BOX, ...z }} aria-hidden="true">
        <svg viewBox="0 0 300 440" fill="none" strokeWidth="4" strokeLinecap="round" style={{ ...abs, inset: 0, width: 300, height: 440 }}>
          <path d="M6 200 C20 218 4 236 18 252 C32 268 10 282 20 300" stroke="#f2c94c" />
          <path d="M14 214 C28 232 16 246 30 262 C42 276 26 290 34 306" stroke="#e8e2ff" />
          <path d="M294 200 C280 220 296 236 282 252 C268 268 290 282 280 300" stroke="#f2c94c" />
          <path d="M286 214 C272 234 284 248 270 264 C258 278 274 292 266 306" stroke="#ff6b8a" />
        </svg>
        {hit > 0 && <span key={hit} className="gfx-anim" style={{ ...abs, left: 54, top: 120, width: 14, height: 12, borderRadius: '3px 3px 2px 2px', background: '#c49a5a', opacity: 0, ...anim('gfx-cork .9s cubic-bezier(.2,.8,.3,1) forwards') }} />}
      </div>
    );
  }
  return null;
}

const bigText = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontWeight: 800, textAlign: 'center', whiteSpace: 'nowrap' };

/** Au-dessus de tout : arrivées spectaculaires et surprises. */
export function FxOver({ fx, arrival, hit }) {
  if (!fx) return null;
  const k = fx.key;
  const centered = { ...abs, inset: 0, display: 'grid', placeItems: 'center' };
  const popText = (text, style) => (
    <div key={`t${hit}`} className="gfx-anim" style={{ ...abs, left: -40, right: -40, top: 336, ...bigText, opacity: 0, ...style, ...anim('gfx-pop-text 2.4s ease-out both') }}>{text}</div>
  );
  return (
    <div aria-hidden="true" style={{ ...CARD_BOX, zIndex: 5 }}>
      {/* ── Arrivées ── */}
      {arrival && k === 'halloween' && (
        <div className="gfx-anim" style={{ ...abs, left: -90, right: -90, top: -90, bottom: -90, opacity: 0, background: 'radial-gradient(closest-side, rgba(233,221,255,.95), rgba(233,221,255,.5) 60%, transparent)', ...anim('gfx-lightning 1.6s ease-out') }} />
      )}
      {arrival && k === 'orrare' && (
        <div style={{ ...abs, inset: 0, ...clipShield, overflow: 'hidden' }}>
          <div className="gfx-anim" style={{ ...abs, top: -20, bottom: -20, left: 0, width: '45%', mixBlendMode: 'screen', background: 'linear-gradient(90deg, transparent, rgba(255,122,217,.7), rgba(122,240,255,.7), rgba(255,226,122,.7), transparent)', transform: 'translateX(-120%)', ...anim('gfx-sweep 1.2s ease-out .15s both') }} />
        </div>
      )}
      {arrival && k === 'tots' && (
        <div className="gfx-anim" style={{ ...centered, ...bigText, fontSize: 96, color: '#fff', textShadow: '0 0 24px #7fd0ff, 0 0 60px #2448c4', opacity: 0, ...anim('gfx-walk 1.2s ease-out') }}>TOTS</div>
      )}
      {arrival && k === 'nouvel_an' && (
        <>
          {[3, 2, 1].map((n, i) => (
            <div key={n} className="gfx-anim" style={{ ...centered, ...bigText, fontSize: 150, color: '#fff3c4', textShadow: '0 0 30px rgba(242,201,76,.8)', opacity: 0, ...anim(`gfx-cnt .7s ease-out ${i * 0.7}s`) }}>{n}</div>
          ))}
          <div className="gfx-anim" style={{ ...abs, left: -60, right: -60, top: -60, bottom: -60, opacity: 0, background: 'radial-gradient(closest-side, rgba(255,243,196,.95), transparent)', ...anim('gfx-flash 1s ease-out 2.1s') }} />
        </>
      )}

      {/* ── Surprises ── */}
      {hit > 0 && k === 'or' && (
        <div key={hit} style={{ ...abs, left: 150, top: 97 }}>
          {SPARKS.map((s, i) => <i key={i} className="gfx-anim" style={{ ...abs, left: 0, top: 0, width: 5, height: 5, borderRadius: '50%', background: '#ffe08a', boxShadow: '0 0 8px 2px #ffd34d', opacity: 0, '--x': `${s.x}px`, '--y': `${s.y}px`, ...anim('gfx-burst 1.2s cubic-bezier(.2,.7,.3,1) forwards') }} />)}
        </div>
      )}
      {hit > 0 && k === 'orrare' && (
        <div key={hit} style={{ ...abs, inset: 0, ...clipShield, overflow: 'hidden' }}>
          <i className="gfx-anim" style={{ ...abs, left: 145, top: 171, width: 10, height: 10, borderRadius: '50%', opacity: 0, filter: 'blur(2px)', background: 'conic-gradient(#ff7ad9, #7af0ff, #b9ff7a, #ffe27a, #ff7ad9)', ...anim('gfx-prism 1s ease-out') }} />
        </div>
      )}
      {hit > 0 && k === 'tots' && (
        <div key={hit} className="gfx-anim" style={{ ...abs, inset: 0, ...clipShield, background: 'radial-gradient(circle at 50% 40%, rgba(220,245,255,.9), rgba(127,208,255,.6))', mixBlendMode: 'screen', opacity: 0, ...anim('gfx-zap .6s steps(1) 2') }} />
      )}
      {hit > 0 && k === 'icone' && (
        <div key={hit} style={{ ...abs, left: -10, right: -10, top: -10, height: 480, overflow: 'hidden' }}>
          {GOLDRAIN.map((g, i) => <i key={i} className="gfx-anim" style={{ ...abs, left: g.x, top: -10, width: 4, height: 8, borderRadius: 2, background: '#ffd34d', '--dx': `${g.dx}px`, ...anim(`gfx-fall ${g.dur}s linear ${g.delay}s both`) }} />)}
        </div>
      )}
      {hit > 0 && k === 'anniv' && (
        <>
          <div key={hit} style={{ ...abs, left: 150, top: 62 }}>
            {CONFETTI.map((c, i) => (
              <i key={i} className="gfx-anim" style={{ ...abs, left: 0, top: 0, width: 9, height: 9, borderRadius: c.round ? '50%' : 1, background: c.c, opacity: 0, '--x': `${c.x}px`, '--y': `${c.y}px`, '--r': `${c.r}deg`, ...anim(`gfx-burst 1.8s cubic-bezier(.2,.7,.3,1) ${c.delay}s forwards`) }} />
            ))}
          </div>
          {popText('LEVEL UP 🎂', { fontFamily: "'Kaushan Script', 'Barlow Condensed', cursive", fontWeight: 400, fontSize: 38, color: '#2ee6b0', textShadow: '0 0 14px rgba(46,230,176,.8), 2px 2px 0 #050606', '--rot': '-5deg' })}
        </>
      )}
      {hit > 0 && k === 'nouvel_an' && (
        <>
          <div key={hit} style={{ ...abs, left: 60, top: 118 }}>
            {FOAM.map((f, i) => <i key={i} className="gfx-anim" style={{ ...abs, left: 0, top: 0, width: f.s, height: f.s, borderRadius: '50%', background: 'rgba(255,250,235,.9)', opacity: 0, '--x': `${f.x}px`, '--y': `${f.y}px`, ...anim(`gfx-foam 1.3s ease-out ${f.delay}s forwards`) }} />)}
          </div>
          {popText(`Bonne année ${(() => { try { return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric' }).format(new Date()); } catch { return new Date().getFullYear(); } })()} !`, { fontSize: 34, textTransform: 'uppercase', color: '#fff3c4', textShadow: '0 0 16px rgba(242,201,76,.9), 0 2px 0 rgba(0,0,0,.6)' })}
        </>
      )}
    </div>
  );
}

/** Durée de l'arrivée spectaculaire (ms) : les éléments d'arrivée sont retirés ensuite. */
export const gangFxArrivalMs = (fx) => (fx ? fx.ms + 300 : 0);
