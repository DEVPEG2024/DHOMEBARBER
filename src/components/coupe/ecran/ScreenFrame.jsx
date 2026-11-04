import React, { createContext, useContext, useEffect, useState } from 'react';
import { STADIUM_URL } from '@/lib/coupe/stadiumImage';
import { COUPE_COLORS } from '../palette';
import { COUPE_VARS } from '../hub/theme';

/*
 * Cadre de l'écran du salon : scène fixe mise à l'échelle de l'écran, sans aucun défilement.
 *  - paysage (télé, tablette couchée) : scène de 1280 × 720 (planche) ;
 *  - portrait (tablette debout) : scène de 720 × 1280, blocs empilés (`portrait` passé aux enfants).
 * La scène garde ses proportions et se centre ; le stade assombri remplit tout l'écran derrière
 * (bandes comprises : jamais de bord net). Fond sombre quel que soit le thème de l'app.
 */
export const LANDSCAPE = { w: 1280, h: 720 };
/**
 * Échelle de la scène (px de l'écran par px de la scène). Un bloc qui mesure son cadre à l'écran
 * (`getBoundingClientRect`) et dans la mise en page (`offsetWidth`) à la fois, comme le match en
 * grand (stade de StadiumStage et canvas du dessin), ne doit pas être sous la mise à l'échelle :
 * `UnscaledBox` l'annule pour lui.
 */
const ScaleContext = createContext(1);
export const useScreenScale = () => useContext(ScaleContext);

/**
 * Cadre rempli à l'échelle 1 de l'écran : l'enfant est dessiné aux vraies dimensions du cadre
 * (`scale(1 / échelle)` d'un bloc agrandi d'autant), sans aucune transformation cumulée. Sans cela,
 * l'image du stade (placée d'après la taille à l'écran) et le terrain dessiné (d'après la mise en
 * page) se décalaient dès que l'écran n'était pas en 1280 × 720 : deux terrains.
 */
export function UnscaledBox({ children, className = '' }) {
  const scale = useScreenScale();
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className="absolute left-0 top-0"
        style={{
          width: `${100 * scale}%`,
          height: `${100 * scale}%`,
          transform: scale === 1 ? undefined : `scale(${1 / scale})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
}
export const PORTRAIT = { w: 720, h: 1280 };

const NOIR = COUPE_COLORS.noir;
// Planche : voile noir sur le stade, plus léger au milieu
const BACKDROP = `linear-gradient(90deg, rgba(11,11,12,.95), rgba(11,11,12,.82) 50%, rgba(11,11,12,.95)), url(${STADIUM_URL}) center/cover no-repeat, ${NOIR}`;

function readViewport() {
  if (typeof window === 'undefined') return { w: LANDSCAPE.w, h: LANDSCAPE.h };
  return { w: window.innerWidth || LANDSCAPE.w, h: window.innerHeight || LANDSCAPE.h };
}

/** Taille de la fenêtre, relue quand elle change (rotation de la tablette, plein écran de la télé). */
export function useViewport() {
  const [vp, setVp] = useState(readViewport);
  useEffect(() => {
    const onResize = () => setVp(readViewport());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return vp;
}

/** Fond du document accordé à l'écran pendant qu'il est ouvert, sans barre de défilement. */
function useDarkDocument() {
  useEffect(() => {
    const { body, documentElement: html } = document;
    const prev = { bg: body.style.backgroundColor, overflow: html.style.overflow };
    body.style.backgroundColor = NOIR;
    html.style.overflow = 'hidden';
    return () => {
      body.style.backgroundColor = prev.bg;
      html.style.overflow = prev.overflow;
    };
  }, []);
}

/**
 * `children(portrait)` : contenu de la scène. Muet : les clics et touchers ne remontent jamais au
 * document (l'ambiance musicale de l'app démarre au premier toucher, MusicContext), et l'écran passe
 * au-dessus du bouton musique des pages client (MusicToggle, `z-40`), qui n'a rien à faire ici.
 */
export default function ScreenFrame({ children, label }) {
  useDarkDocument();
  const vp = useViewport();
  const portrait = vp.h > vp.w;
  const stage = portrait ? PORTRAIT : LANDSCAPE;
  const scale = Math.min(vp.w / stage.w, vp.h / stage.h) || 1;
  const left = Math.round((vp.w - stage.w * scale) / 2);
  const top = Math.round((vp.h - stage.h * scale) / 2);
  const stop = (e) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-[60] overflow-hidden font-inter text-white"
      style={{ ...COUPE_VARS, background: BACKDROP }}
      onClick={stop}
      onTouchStart={stop}
    >
      <main
        aria-label={label}
        data-ecran-scene={portrait ? 'portrait' : 'paysage'}
        className="absolute overflow-hidden text-base leading-[1.4]"
        style={{ left, top, width: stage.w, height: stage.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}
      >
        <ScaleContext.Provider value={scale}>{children(portrait)}</ScaleContext.Provider>
      </main>
    </div>
  );
}
