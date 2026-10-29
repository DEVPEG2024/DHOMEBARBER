import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { STADIUM_URL } from '@/lib/coupe/stadiumImage';
import { COUPE_COLORS } from '../palette';
import { COUPE_VARS, alpha } from './theme';

/**
 * Cadre des pages de La Coupe du Gang (/coupe, /coupe/classement), thème stade : plein écran, hors
 * des mises en page client et admin, sombre quel que soit le thème (comme l'écran de jeu).
 *
 * En-tête sur le haut du stade (tribune au logo D'Home Barber, `STADIUM_URL` cadré en haut) fondu
 * vers le noir (maquette « CoupeAccueilRouge ») : boutons ronds sur fond noir translucide, lisibles
 * sur l'image, et le titre en bas de l'image. La page défile avec le document : le bouton musique
 * (en position absolue, en haut à droite) part avec l'en-tête, qui lui garde sa place (`pr-12`).
 *
 *   <CoupeShell title={…} titleId="…" onBack={…} action={<bouton à droite>} compact>…</CoupeShell>
 *
 * `compact` : image moins haute et titre plus petit (classement), pour garder le podium en vue.
 */
export const COUPE_BG = COUPE_COLORS.noir;

/** Bouton rond de l'en-tête, posé sur l'image (retour, classement). */
export const HERO_BUTTON = 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-black/55 hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

const HEROES = {
  tall: { height: 236, title: 'text-[clamp(31px,10.2vw,40px)]' },
  compact: { height: 184, title: 'text-[clamp(28px,8.8vw,34px)]' },
};

const NOIR = COUPE_COLORS.noir;
// Maquette : voile léger en haut (boutons lisibles), presque rien au milieu (le logo), noir en bas (titre)
const FADE = `linear-gradient(${alpha(NOIR, 0.55)} 0%, ${alpha(NOIR, 0.1)} 40%, ${NOIR} 100%)`;

/**
 * Haut du stade derrière l'en-tête : l'image à toute la largeur de la colonne, 2,9 % de sa hauteur
 * coupés en haut (le toit), le reste fondu vers le noir. Décorative (le titre dit où l'on est).
 * Apparition en fondu une fois chargée (rien si mouvement réduit) ; image absente (hors ligne) :
 * l'en-tête reste noir, sans image cassée.
 */
function StadiumBackdrop() {
  const imgRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Image déjà dans le cache (retour du classement) : chargée avant que `onLoad` soit écouté
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {!failed && (
        <img
          ref={imgRef}
          src={STADIUM_URL}
          alt=""
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute left-0 top-0 block h-auto w-full max-w-none -translate-y-[2.9%] transition-opacity duration-500 motion-reduce:transition-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      <div className="absolute inset-0" style={{ background: FADE }} />
      {/* Ordinateur : la colonne (560 px) ne remplit plus l'écran, les bords de l'image se fondent
          dans le fond de la page au lieu de s'arrêter net */}
      <div className="absolute inset-y-0 left-0 hidden w-14 min-[561px]:block" style={{ background: `linear-gradient(90deg, ${NOIR}, ${alpha(NOIR, 0)})` }} />
      <div className="absolute inset-y-0 right-0 hidden w-14 min-[561px]:block" style={{ background: `linear-gradient(270deg, ${NOIR}, ${alpha(NOIR, 0)})` }} />
    </div>
  );
}

export default function CoupeShell({
  title, titleId, onBack, backLabel = 'Retour', action = null, compact = false, children,
}) {
  const hero = compact ? HEROES.compact : HEROES.tall;

  // Fond du document accordé à la page pendant qu'elle est ouverte : en thème clair, le rebond
  // du défilement (iPhone) laissait voir une bande blanche au-dessus et au-dessous
  useEffect(() => {
    const body = document.body;
    const previous = body.style.backgroundColor;
    body.style.backgroundColor = COUPE_BG;
    return () => { body.style.backgroundColor = previous; };
  }, []);

  return (
    <div
      className="min-h-[100dvh] overflow-x-clip font-inter text-white"
      style={{ ...COUPE_VARS, background: COUPE_BG }}
    >
      <div className="mx-auto w-full max-w-[560px]">
        {/* Hauteur minimale : un titre qui passe sur deux lignes (grand texte) agrandit l'en-tête
            au lieu de monter sur les boutons */}
        <header className="relative flex flex-col overflow-hidden" style={{ minHeight: hero.height }}>
          <StadiumBackdrop />
          <div className="relative flex h-[60px] shrink-0 items-center justify-between gap-2 pl-3 pr-12">
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className={`${HERO_BUTTON} text-white`}
            >
              <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
            </button>
            {action}
          </div>
          <h1
            id={titleId}
            className={`relative mt-auto break-words px-4 pb-[18px] pt-3 font-fut ${hero.title} font-extrabold uppercase leading-[.9] tracking-[0.02em] text-white`}
            style={{ textShadow: '0 3px 0 rgba(0, 0, 0, .5)' }}
          >
            {title}
          </h1>
        </header>
        <main className="flex flex-col px-4 pb-8 pt-2">{children}</main>
      </div>
    </div>
  );
}
