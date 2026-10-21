import React from 'react';
import { ArrowRight } from 'lucide-react';
import { formatDuration, formatPrice } from '@/components/services/serviceUtils';
import { prestationsLabel } from './lookSelection';

/**
 * Cartes des looks sur le profil d'un barber. `look` = `{ item, services, totals, title }` :
 * `services` / `totals` valent null tant que le catalogue n'est pas lu (ou s'il est en échec) ;
 * aucun prix n'est alors affiché (jamais « 0 € »).
 *
 * Dégradés sombres seulement par-dessus les photos : le texte y est blanc quel que soit le thème.
 */

/** Libellé lu par un lecteur d'écran : « Dégradé à blanc, 25 €, 30 min, 1 prestation ». */
function lookLabel(look, firstName) {
  const parts = [look.title || `Réalisation de ${firstName}`];
  if (look.totals?.count) {
    parts.push(formatPrice(look.totals.price), formatDuration(look.totals.duration), prestationsLabel(look.totals.count));
  }
  return parts.join(', ');
}

/** Barre grise en attendant le catalogue. */
function Placeholder({ className = '' }) {
  return <span aria-hidden="true" className={`block rounded-full bg-white/20 motion-safe:animate-pulse ${className}`} />;
}

/**
 * Look vedette : grande carte, badge « Look complet » (deux prestations ou plus), titre, puces des
 * prestations, total et « Réserver ce look » (droit aux créneaux). Un tap ailleurs ouvre la
 * visionneuse. `pending` : catalogue en cours de lecture.
 */
export function FeaturedLook({ look, firstName, pending = false, onOpen, onBook }) {
  const { item, services, totals, title } = look;
  const count = totals?.count || 0;
  return (
    <article className="relative w-full aspect-[16/15] min-h-[300px] overflow-hidden rounded-[22px] bg-muted" aria-label={`Look vedette : ${lookLabel(look, firstName)}`}>
      <img src={item.url} alt="" loading="lazy" decoding="async" draggable={false}
        className="absolute inset-0 w-full h-full object-cover select-none" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />
      {/* Toute la carte ouvre la visionneuse ; le bouton « Réserver ce look » passe au-dessus */}
      <button type="button" onClick={onOpen} aria-label={`Voir le look : ${title || `réalisation de ${firstName}`}`}
        className="absolute inset-0 z-[1] rounded-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
      {count >= 2 && (
        <span className="absolute top-3 left-3 z-[2] pointer-events-none rounded-full bg-black/70 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200">
          Look complet · {prestationsLabel(count)}
        </span>
      )}
      <div className="absolute inset-x-3.5 bottom-3.5 z-[2] flex flex-col gap-2.5 text-white pointer-events-none">
        {title && <h3 className="text-lg font-extrabold leading-tight [text-wrap:balance]">{title}</h3>}
        {services && services.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Prestations du look">
            {services.map((s) => (
              <li key={s.id} className="rounded-full bg-white/[0.16] px-2.5 py-1 text-xs font-semibold backdrop-blur-sm">{s.name}</li>
            ))}
          </ul>
        )}
        {pending && (
          <div className="flex flex-col gap-2 pb-1">
            <Placeholder className="h-6 w-40" />
            <Placeholder className="h-9 w-24" />
          </div>
        )}
        {totals && count > 0 && (
          <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-2">
            <p className="flex items-baseline gap-2">
              <span className="font-fut text-[40px] font-extrabold leading-none tabular-nums">{formatPrice(totals.price)}</span>
              <span className="text-[13px] text-white/80">{formatDuration(totals.duration)}</span>
            </p>
            <button type="button" onClick={onBook}
              className="pointer-events-auto h-11 px-4 rounded-full bg-white text-neutral-900 text-sm font-bold inline-flex items-center gap-1.5 shadow-lg shadow-black/30 active:scale-[0.97] transition-transform">
              Réserver ce look
              <ArrowRight className="w-4 h-4" strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Vignette 4:5 de la grille : titre du look et « 25 € · 30 min · 1 prestation » ; photo sans
 * prestation : sa légende seulement.
 */
export function LookTile({ look, firstName, pending = false, onOpen }) {
  const { item, totals, title } = look;
  const priced = !!totals?.count;
  const hasText = !!title || priced || pending;
  return (
    <button type="button" onClick={onOpen} aria-label={lookLabel(look, firstName)}
      className="relative block w-full aspect-[4/5] overflow-hidden rounded-[18px] bg-muted text-left active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <img src={item.url} alt="" loading="lazy" decoding="async" draggable={false}
        className="absolute inset-0 w-full h-full object-cover select-none" />
      {hasText && (
        <>
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none" />
          <div className="absolute inset-x-2.5 bottom-2.5 flex flex-col gap-1 text-white">
            {title && <span className="text-[13px] font-bold leading-tight line-clamp-2">{title}</span>}
            {priced && (
              <span className="leading-none">
                <span className="font-fut text-[22px] font-extrabold tabular-nums">{formatPrice(totals.price)}</span>
                <span className="text-[11px] font-medium text-white/80"> · {formatDuration(totals.duration)} · {prestationsLabel(totals.count)}</span>
              </span>
            )}
            {pending && !priced && <Placeholder className="h-4 w-20 mt-0.5" />}
          </div>
        </>
      )}
    </button>
  );
}
