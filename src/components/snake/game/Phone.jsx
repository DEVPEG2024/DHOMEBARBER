import React from 'react';
import { SNAKE_COLORS as C } from '../palette';

/**
 * Téléphone rétro du Snake du Gang (planche du 2 nov. 2026, `Main.dc.html`, `Partie.dc.html`,
 * `Perdu.dc.html`) : corps sombre arrondi, logo du salon en haut, puis l'écran vert et le pavé
 * de touches passés en enfants. Dessiné par nous : aucune marque de téléphone.
 *
 * Largeur : 362 px au plus (390 px d'écran moins 2 × 14 px), toute la place disponible en dessous.
 * Les autres propriétés vont au cadre (gestes du glisser pendant la partie).
 */
export default function Phone({ label = 'Téléphone du jeu', className = '', children, ...rest }) {
  return (
    <section
      {...rest}
      aria-label={label}
      className={`flex w-full max-w-[362px] flex-col items-center gap-3 rounded-[40px] border px-3 pb-5 pt-3.5 ${className}`}
      style={{
        background: C.corps,
        borderColor: C.corpsBord,
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 24px 48px rgba(0, 0, 0, 0.45)',
      }}
    >
      <div className="flex h-[30px] items-center gap-2.5">
        <img src="/logo.png" alt="" width="30" height="30" draggable={false} className="h-[30px] w-[30px] object-contain" />
        <span className="text-[11px] font-bold tracking-[0.24em]" style={{ color: C.logoTexte }}>D’HOME BARBER</span>
      </div>
      {children}
    </section>
  );
}
