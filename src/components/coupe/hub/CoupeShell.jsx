import React, { useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * Cadre des pages de La Coupe du Gang (/coupe, /coupe/classement) : plein écran, hors des mises en
 * page client et admin, sombre quel que soit le thème (comme l'écran de jeu). La page défile avec
 * le document : le bouton musique (en position absolue, en haut à droite) part avec l'en-tête, qui
 * lui garde sa place (`pr-12`).
 *
 *   <CoupeShell title={…} onBack={…} action={<bouton à droite>} centerTitle titleSize="…">…</CoupeShell>
 *
 * `titleSize` : classes de taille du titre (un titre long rétrécit sous 360 px au lieu d'être coupé).
 */
export const COUPE_BG = '#0b0e10';

export default function CoupeShell({
  title, titleId, onBack, backLabel = 'Retour', action = null, centerTitle = false,
  titleSize = 'text-[clamp(20px,6.2vw,24px)]', children,
}) {
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
      className="min-h-[100dvh] overflow-x-clip font-inter text-[#eef3ef]"
      style={{ background: COUPE_BG, colorScheme: 'dark' }}
    >
      <div className="mx-auto w-full max-w-[560px]">
        <header className="flex h-[60px] items-center gap-1 pl-3 pr-12">
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#eef3ef] transition-colors hover:bg-white/6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ebc15e]"
          >
            <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
          </button>
          <h1
            id={titleId}
            className={`min-w-0 flex-1 truncate font-fut ${titleSize} font-extrabold uppercase leading-none tracking-[0.03em] ${centerTitle ? 'text-center' : ''}`}
          >
            {title}
          </h1>
          {action}
        </header>
        <main className="flex flex-col px-4 pb-8 pt-1">{children}</main>
      </div>
    </div>
  );
}
