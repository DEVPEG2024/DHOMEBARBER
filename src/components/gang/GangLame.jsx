import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useTransform } from 'framer-motion';
import { hapticFeedback } from '@/lib/capacitor';
import acierUrl from '@/assets/gang/acier-damas.webp';
import acierPoliUrl from '@/assets/gang/acier-damas-poli.webp';
import { GANG_RAZOR as RAZOR, GANG_RAZOR_CROSS as CROSS, GANG_SHIELD_PATH as SHIELD, GANG_INNER_SCALE, GANG_TRICOLOR_EDGE } from './gangTheme';

/**
 * Carte Icône « La Lame » (planche validée le 5 nov. 2026) : couches de GangFx.jsx pour ce niveau.
 * Acier de Damas, deux rasoirs croisés en cimier, liseré chromé et tricolore. À la première ouverture :
 * deux lames tranchent l'écran en X, le noir s'ouvre, les rasoirs se verrouillent derrière la carte.
 *
 * Le reflet de l'acier est une fenêtre qui glisse sur une copie polie de la même image, à contre-sens :
 * que des `transform`, jamais de `mix-blend-mode` (avec un `filter`, l'acier disparaissait dans WebKit).
 * Les @keyframes sont dans la feuille de GangFx.jsx (injectée une fois).
 */

const abs = { position: 'absolute', pointerEvents: 'none' };
const CARD_BOX = { ...abs, left: 0, top: 0, width: 300, height: 440, overflow: 'visible' };
const clipShield = { clipPath: `path('${SHIELD}')`, WebkitClipPath: `path('${SHIELD}')` };
const anim = (value) => ({ animation: value });

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

/** Gerbe d'étincelles : `delay` (s), `spread` (s), `power` (distance en px). */
function sparkBurst(seed, n, delay, spread, power) {
  const r = seeded(seed);
  return Array.from({ length: n }, () => {
    const a = r() * Math.PI * 2;
    const d = power * (0.35 + r() * 0.9);
    return {
      x: Math.round(Math.cos(a) * d),
      y: Math.round(Math.sin(a) * d * 0.8 + 70 + r() * 110),
      r: Math.round((a * 180) / Math.PI + 90),
      h: Math.round(5 + r() * 13),
      s: (0.45 + r() * 0.7).toFixed(2),
      d: (delay + r() * spread).toFixed(3),
    };
  });
}

const EMBERS = (() => {
  const r = seeded(4410);
  return Array.from({ length: 10 }, () => ({ x: Math.round(r() * 340 - 20), y: Math.round(r() * 430), dx: Math.round((r() - 0.5) * 34), s: (3.8 + r() * 4).toFixed(1), d: (-r() * 7).toFixed(1) }));
})();
const HIT_SPARKS = sparkBurst(7701, 34, 0.06, 0.06, 210);
const LOCK_SPARKS = sparkBurst(7702, 22, 2.2, 0.05, 150);
const CENTER_SPARKS = sparkBurst(7703, 28, 0.86, 0.04, 260);
const CUT_ANGLE = 65.2; // Inclinaison des deux coupures (degrés)

/** Étincelles le long d'une coupure : la gerbe suit la lame qui passe. */
function cutSparks(seed, angleDeg, delay, n) {
  const a = (angleDeg * Math.PI) / 180;
  return sparkBurst(seed, n, 0, 0.03, 130).map((p, i) => {
    const t = (i / (n - 1) - 0.5) * 900;
    return { ...p, d: (delay + ((t + 450) / 900) * 0.15 + Number(p.d)).toFixed(3), ox: Math.round(Math.cos(a) * t), oy: Math.round(Math.sin(a) * t) };
  });
}
const CUT_SPARKS = [...cutSparks(7704, -CUT_ANGLE, 0.34, 14), ...cutSparks(7705, CUT_ANGLE, 0.76, 14)];

function Spark({ p }) {
  return (
    <i
      className="gfx-anim"
      style={{
        ...abs, left: 0, top: 0, width: 2, height: p.h, borderRadius: 2, opacity: 0,
        background: 'linear-gradient(180deg, #fff, #ffd28a 60%, #ff8a3d)', boxShadow: '0 0 6px #ffb45c',
        '--ox': `${p.ox || 0}px`, '--oy': `${p.oy || 0}px`, '--x': `${p.x}px`, '--y': `${p.y}px`, '--r': `${p.r}deg`,
        ...anim(`gfx-spark ${p.s}s cubic-bezier(.1,.7,.4,1) ${p.d}s forwards`),
      }}
    />
  );
}

// ── Fond et liseré ──────────────────────────────────────────────────────────

const SHADE_FRONT = 'radial-gradient(ellipse 40% 34% at 62% 27%, rgba(2,3,5,.74), rgba(2,3,5,.28) 70%, transparent 100%), linear-gradient(180deg, rgba(6,7,10,.56) 0, rgba(6,7,10,.6) 44%, rgba(6,7,10,.84) 56%, rgba(6,7,10,.9) 100%)';
const SHADE_BACK = 'linear-gradient(180deg, rgba(6,7,10,.76), rgba(6,7,10,.86))';
const BAND_MASK = 'linear-gradient(90deg, transparent, #000 42%, #000 58%, transparent)';
const BAND = { ...abs, left: -90, top: -420, width: 180, height: 1200, overflow: 'hidden', WebkitMaskImage: BAND_MASK, maskImage: BAND_MASK };
const POLISHED = { ...abs, left: 0, top: 0, width: 300, height: 440, background: `url(${acierPoliUrl}) center/300px 440px` };
const UNROTATE = { ...abs, left: 90, top: 420, width: 0, height: 0, transform: 'rotate(-22deg)' };

/** Reflet qui suit le doigt ou le gyroscope : la fenêtre avance, l'image recule d'autant. */
function SteelLight({ lightX, lightOffset }) {
  const x = useTransform(lightX, (v) => v + lightOffset);
  const backX = useTransform(x, (v) => -v);
  return (
    <motion.div style={{ ...abs, left: 0, top: 0, width: 0, height: 0, x, rotate: 22 }}>
      <div style={BAND}>
        <div style={UNROTATE}>
          <motion.div style={{ ...POLISHED, x: backX }} />
        </div>
      </div>
    </motion.div>
  );
}

/** Fond des deux faces : acier de Damas, reflet, puis voile qui garde le texte lisible. */
export function LameSurface({ back, animated, lightX, lightOffset }) {
  return (
    <div aria-hidden="true" style={{ ...abs, inset: 0 }} data-gang-acier="">
      <div style={{ ...abs, inset: 0, background: `url(${acierUrl}) center/300px 440px` }} />
      {animated && lightX && <SteelLight lightX={lightX} lightOffset={lightOffset} />}
      <div style={{ ...abs, inset: 0, background: back ? SHADE_BACK : SHADE_FRONT }} />
    </div>
  );
}

const TRICOLOR_CSS = `linear-gradient(90deg, ${GANG_TRICOLOR_EDGE.map(([c, at]) => `${c} ${at * 100}%`).join(', ')})`;

/** Fine ligne tricolore (couleurs du logo) entre le chrome et l'acier, et lumière qui fait le tour. */
export function LameRing({ animated }) {
  return (
    <>
      {animated && (
        <div aria-hidden="true" style={{ ...abs, inset: 0, ...clipShield, overflow: 'hidden' }}>
          <div
            className="gfx-anim"
            style={{ ...abs, left: -150, top: -80, width: 600, height: 600, background: 'conic-gradient(from 0deg, transparent 0 78%, #fff 88%, transparent 96%)', ...anim('gfx-spin 5.5s linear infinite') }}
          />
        </div>
      )}
      <div
        aria-hidden="true"
        style={{
          ...abs, inset: 0, ...clipShield, background: TRICOLOR_CSS,
          transform: `scale(${GANG_INNER_SCALE.x + 0.006}, ${GANG_INNER_SCALE.y + 0.004})`,
          transformOrigin: `${GANG_INNER_SCALE.originX * 100}% ${GANG_INNER_SCALE.originY * 100}%`,
        }}
      />
    </>
  );
}

/** Passage de lumière sur l'acier (sous la photo et le texte) : à l'arrivée, puis de temps en temps. */
export function LameSweep({ arrival, active, hit }) {
  const name = active ? 'hit' : arrival ? 'arrival' : 'rest';
  const outer = {
    hit: 'gfx-sw .5s cubic-bezier(.4,0,.5,1) .12s both',
    arrival: 'gfx-sw 1s cubic-bezier(.4,0,.5,1) 2.42s both',
    rest: 'gfx-swr 6.5s cubic-bezier(.4,0,.5,1) 1s infinite',
  }[name];
  const inner = {
    hit: 'gfx-swb .5s cubic-bezier(.4,0,.5,1) .12s both',
    arrival: 'gfx-swb 1s cubic-bezier(.4,0,.5,1) 2.42s both',
    rest: 'gfx-swrb 6.5s cubic-bezier(.4,0,.5,1) 1s infinite',
  }[name];
  return (
    <div key={`${name}${active ? hit : ''}`} style={{ ...abs, inset: 0, overflow: 'hidden', zIndex: 1 }}>
      <div className="gfx-anim" style={{ ...abs, left: 0, top: 0, width: 0, height: 0, opacity: 0, transform: 'translateX(-200px) rotate(22deg)', ...anim(outer) }}>
        <div style={BAND}>
          <div style={UNROTATE}>
            <div className="gfx-anim" style={{ ...POLISHED, opacity: 0.5, transform: 'translateX(200px)', ...anim(inner) }} />
          </div>
        </div>
        <div style={{ ...abs, left: -90, top: -420, width: 180, height: 1200, background: 'linear-gradient(90deg, transparent 30%, rgba(255,255,255,.34) 50%, transparent 70%)' }} />
      </div>
    </div>
  );
}

// ── Rasoirs ─────────────────────────────────────────────────────────────────

const useLameId = (name) => `gfx-${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

function RazorDrawing({ ids, engraved, edgeDelay, animated }) {
  return (
    <>
      <path d={RAZOR.handle} fill={`url(#${ids.handle})`} stroke="#5a616a" strokeWidth="1" />
      <path d={RAZOR.handleLight} stroke="rgba(255,255,255,.28)" strokeWidth="1.2" fill="none" />
      <circle cx="34" cy="30" r="4.2" fill="#d9b35a" stroke="#6e4d0d" strokeWidth=".7" />
      <path d={RAZOR.blade} fill={`url(#${ids.blade})`} stroke="#2f353c" strokeWidth=".8" />
      <path d={RAZOR.spine} fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="1" />
      <path d={RAZOR.edge} stroke="#fff" strokeWidth="1.8" fill="none" />
      {engraved && (
        <text x="262" y="39" fontFamily="'Bodoni Moda', Georgia, serif" fontSize="13" fontWeight="600" letterSpacing="3" fill="rgba(16,20,26,.68)" transform="rotate(.9 262 39)">
          {RAZOR.name}
        </text>
      )}
      <circle cx="200" cy="31" r="5.2" fill={`url(#${ids.pin})`} stroke="#2f353c" strokeWidth=".8" />
      {animated && (
        <g transform="rotate(2.4 204 49)">
          <rect x="204" y="49" width="70" height="3.4" fill={`url(#${ids.run})`} opacity="0" className="gfx-anim" style={anim(`gfx-rz-edge 5.2s cubic-bezier(.5,0,.5,1) ${edgeDelay}s infinite`)} />
        </g>
      )}
    </>
  );
}

/** Les deux rasoirs croisés au-dessus de l'écusson, derrière la carte, inclinés avec elle. */
export function LameRazors({ arrival, animated, hit }) {
  const ids = { blade: useLameId('blade'), handle: useLameId('handle'), pin: useLameId('pin'), run: useLameId('run') };
  const w = RAZOR.width * CROSS.scale;
  const h = RAZOR.height * CROSS.scale;
  const box = { ...abs, left: CROSS.x - w / 2, top: CROSS.y - h / 2, width: w, height: h, overflow: 'visible', filter: 'drop-shadow(0 12px 12px rgba(0,0,0,.65))' };
  const a = CROSS.angle;
  const razor = (rz, clac, lockDelay) => ({
    '--rz': rz,
    '--rz-clac': clac,
    transform: `translateZ(-2px) ${rz}`,
    ...(arrival ? anim(`gfx-rz-lock .36s cubic-bezier(.7,0,.25,1) ${lockDelay}s both`) : hit > 0 ? anim('gfx-rz-clac .78s cubic-bezier(.3,1.4,.5,1)') : {}),
  });
  return (
    <div aria-hidden="true" style={{ ...CARD_BOX, transformStyle: 'preserve-3d' }} data-gang-rasoirs="">
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id={ids.blade} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6d7680" /><stop offset=".12" stopColor="#3f464e" /><stop offset=".2" stopColor="#d7dee5" />
            <stop offset=".52" stopColor="#8e97a2" /><stop offset=".82" stopColor="#eef3f7" /><stop offset="1" stopColor="#fff" />
          </linearGradient>
          <linearGradient id={ids.handle} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3e4247" /><stop offset=".35" stopColor="#17191c" /><stop offset="1" stopColor="#050506" />
          </linearGradient>
          <linearGradient id={ids.pin} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#6d7680" /></linearGradient>
          <linearGradient id={ids.run} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      {/* L'ombre de la carte, dessinée une fois (jamais de `filter` autour du cimier : WebKit le couperait) */}
      <div style={{ ...abs, left: -30, top: -14, width: 360, height: 500, filter: 'blur(14px)', opacity: 0.55, transform: 'translateZ(-3px)' }}>
        <div style={{ ...abs, left: 30, top: 30, width: 300, height: 440, ...clipShield, background: '#000' }} />
      </div>
      {/* Le tricolore s'allume derrière le chrome au coup de lame */}
      {hit > 0 && (
        <div key={hit} className="gfx-anim" style={{ ...abs, left: -6, top: -6, width: 312, height: 452, opacity: 0, filter: 'blur(5px)', transform: 'translateZ(-1px)', ...anim('gfx-shine-tri 1.3s ease-out .12s') }}>
          <div style={{ ...abs, left: 6, top: 6, width: 300, height: 440, ...clipShield, background: 'linear-gradient(90deg, #1fe07e 0 32%, #fff 44%, #fff 56%, #ff3a4f 68%)' }} />
        </div>
      )}
      <svg key={`a${hit}`} viewBox={`0 0 ${RAZOR.width} ${RAZOR.height}`} className="gfx-anim" style={{ ...box, ...razor(`rotate(${-a}deg)`, `rotate(${-a - 21}deg)`, 1.86) }}>
        <RazorDrawing ids={ids} engraved edgeDelay={0} animated={animated} />
      </svg>
      <svg key={`b${hit}`} viewBox={`0 0 ${RAZOR.width} ${RAZOR.height}`} className="gfx-anim" style={{ ...box, ...razor(`rotate(${a - 180}deg) scaleY(-1)`, `rotate(${a - 159}deg) scaleY(-1)`, 1.98) }}>
        <RazorDrawing ids={ids} edgeDelay={2.6} animated={animated} />
      </svg>
    </div>
  );
}

/** Derrière la carte : quelques escarbilles froides qui montent. */
export function LameBehind() {
  return (
    <div className="gfx-a" style={CARD_BOX} aria-hidden="true">
      {EMBERS.map((m, i) => (
        <i key={i} className="gfx-anim" style={{ ...abs, left: m.x, top: m.y, width: 3, height: 3, borderRadius: '50%', background: '#dcebff', boxShadow: '0 0 6px #9cc8ff', opacity: 0, '--x': `${m.dx}px`, ...anim(`gfx-ember ${m.s}s ease-out ${m.d}s infinite`) }} />
      ))}
    </div>
  );
}

/** Coup de lame : étincelles au croisement des rasoirs. */
export function LameHit() {
  return (
    <div style={{ ...abs, left: CROSS.x, top: CROSS.y }}>
      {HIT_SPARKS.map((p, i) => <Spark key={i} p={p} />)}
    </div>
  );
}

// ── Arrivée plein écran ─────────────────────────────────────────────────────

const FLY = (
  <>
    <path d={RAZOR.handle} fill="#14161a" stroke="#6b737d" />
    <path d={RAZOR.blade} fill="#e7edf3" />
  </>
);

function Cut({ x, y, angle, delay }) {
  return (
    <div style={{ ...abs, left: x, top: y, width: 0, height: 0, transform: `rotate(${angle}deg)` }}>
      {/* Reste de la nuit tranchée : le trait disparaît quand le noir s'ouvre */}
      <div className="gfx-anim" style={{ ...abs, left: -1400, top: -1, width: 2800, height: 2, opacity: 1, ...anim('gfx-out .3s ease-out 1.3s forwards') }}>
        <div
          className="gfx-anim"
          style={{
            ...abs, inset: 0, background: '#fff', boxShadow: '0 0 10px #fff, 0 0 26px #a8d0ff, 0 0 60px #6aa8ff', transformOrigin: '0 50%', transform: 'scaleX(0)',
            ...anim(`gfx-cut .17s cubic-bezier(.3,0,.9,.6) ${delay}s forwards`),
          }}
        />
      </div>
      <svg viewBox={`0 0 ${RAZOR.width} ${RAZOR.height}`} className="gfx-anim" style={{ ...abs, left: -RAZOR.width / 2, top: -RAZOR.height / 2, width: RAZOR.width, height: RAZOR.height, overflow: 'visible', opacity: 0, ...anim(`gfx-fly .2s linear ${delay - 0.04}s both`) }}>
        {FLY}
      </svg>
    </div>
  );
}

/**
 * Le noir, les deux coupures, les étincelles : par-dessus toute la page, dans `body` (la carte est dans
 * des parents transformés), sans jamais bloquer un toucher. Les coupures se croisent au centre de la
 * carte ; une carte hors de l'écran n'a pas de rideau. La carte se mesure par un repère à soi : au
 * montage, la référence d'un parent n'est pas encore posée. Sous la révélation de niveau (z-index 80).
 */
export function LameCurtain() {
  const anchor = useRef(null);
  const [geo, setGeo] = useState(null);
  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!r || !r.width || r.bottom < 0 || r.top > vh) return;
    const cx = r.left + r.width / 2;
    const cy = Math.min(vh * 0.62, r.top + r.height / 2);
    const size = r.width / 300;
    setGeo({ vw, vh, cx, cy, crossX: r.left + CROSS.x * size, crossY: r.top + CROSS.y * size });
  }, []);

  // Un petit coup sous le doigt à chaque lame, puis au verrouillage (téléphone seulement)
  useEffect(() => {
    if (!geo) return undefined;
    const timers = [340, 760, 2200].map((ms) => setTimeout(() => hapticFeedback(), ms));
    return () => timers.forEach(clearTimeout);
  }, [geo]);

  const marker = <span ref={anchor} aria-hidden="true" style={{ ...CARD_BOX, visibility: 'hidden' }} />;
  if (!geo) return marker;
  const { vw, vh, cx, cy, crossX, crossY } = geo;
  const a = (CUT_ANGLE * Math.PI) / 180;
  const R = 2 * Math.max(vw, vh);
  const dx = Math.cos(a) * R;
  const dy = Math.sin(a) * R;
  const A = [cx - dx, cy - dy]; const B = [cx + dx, cy - dy]; const C = [cx + dx, cy + dy]; const D = [cx - dx, cy + dy];
  const wedge = (p, q) => `polygon(${cx}px ${cy}px, ${p[0]}px ${p[1]}px, ${q[0]}px ${q[1]}px)`;
  const sheets = [
    { clip: wedge(A, B), tx: 0, ty: -(cy + 40) },
    { clip: wedge(B, C), tx: vw - cx + 40, ty: 0 },
    { clip: wedge(C, D), tx: 0, ty: vh - cy + 40 },
    { clip: wedge(D, A), tx: -(cx + 40), ty: 0 },
  ];
  return (
    <>
      {marker}
      {createPortal(
    <div aria-hidden="true" data-app-overlay="" data-gang-rideau="" style={{ position: 'fixed', inset: 0, zIndex: 75, overflow: 'hidden', pointerEvents: 'none' }}>
      <div className="gfx-anim" style={{ ...abs, inset: 0, opacity: 0, background: `radial-gradient(circle at ${cx}px ${cy}px, #fff 0, #d9eaff 24%, rgba(120,175,255,.5) 60%, rgba(70,110,180,0) 100%)`, ...anim('gfx-flash .85s ease-out 1.26s forwards') }} />
      {sheets.map((s) => (
        <div key={s.clip} className="gfx-anim" style={{ ...abs, inset: 0, background: '#040506', clipPath: s.clip, WebkitClipPath: s.clip, '--tx': `${s.tx}px`, '--ty': `${s.ty}px`, ...anim('gfx-sheet .78s cubic-bezier(.72,0,.16,1) 1.28s both') }} />
      ))}
      <Cut x={cx} y={cy} angle={-CUT_ANGLE} delay={0.34} />
      <Cut x={cx} y={cy} angle={CUT_ANGLE} delay={0.76} />
      <div style={{ ...abs, left: cx, top: cy }}>
        {CUT_SPARKS.map((p, i) => <Spark key={i} p={p} />)}
        {CENTER_SPARKS.map((p, i) => <Spark key={i} p={p} />)}
      </div>
      <div style={{ ...abs, left: crossX, top: crossY }}>
        {LOCK_SPARKS.map((p, i) => <Spark key={i} p={p} />)}
      </div>
    </div>,
    document.body,
      )}
    </>
  );
}
