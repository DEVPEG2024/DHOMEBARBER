import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { SNAKE_COLORS as C } from './palette';

/**
 * Cadre des pages du Snake du Gang (/snake, /snake/classement, /snake/reglages, /snake/regles) :
 * plein écran, hors des mises en page client et admin, sombre quel que soit le thème (planche du
 * 2 nov. 2026). En-tête de 56 px : retour (lien) à gauche, titre ; la droite reste libre pour le
 * bouton musique de l'app (32 px en haut à droite, `pr-12`).
 *
 *   <SnakeShell title="Classement" backTo="/snake" backLabel="Retour au menu du jeu">…</SnakeShell>
 *
 * `onBack` (facultatif) remplace le lien par un bouton (partie en cours : on la termine d'abord).
 * `mainClassName` : classes du contenu (par défaut une colonne avec 16 px de marge).
 */
export default function SnakeShell({
  title,
  titleId,
  backTo = '/snake',
  backLabel = 'Retour',
  onBack = null,
  mainClassName = 'flex flex-1 flex-col gap-4 px-4 pb-6 pt-1',
  children,
}) {
  // Fond du document accordé à la page : pas de bande claire au rebond du défilement (iPhone)
  useEffect(() => {
    const body = document.body;
    const previous = body.style.backgroundColor;
    body.style.backgroundColor = C.fond;
    return () => { body.style.backgroundColor = previous; };
  }, []);

  const backClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3DBE7E]';
  const icon = <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.2} aria-hidden="true" />;

  return (
    <div
      className="flex min-h-[100dvh] flex-col overflow-x-clip font-inter text-white"
      style={{ background: C.fond, colorScheme: 'dark', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <header className="flex h-14 shrink-0 items-center gap-1.5 pl-2 pr-12">
          {onBack ? (
            <button type="button" onClick={onBack} aria-label={backLabel} className={backClass}>{icon}</button>
          ) : (
            <Link to={backTo} aria-label={backLabel} className={backClass}>{icon}</Link>
          )}
          <h1 id={titleId} className="min-w-0 flex-1 truncate font-fut text-2xl font-extrabold uppercase tracking-[0.04em] text-white">
            {title}
          </h1>
        </header>
        <main className={mainClassName}>{children}</main>
      </div>
    </div>
  );
}
