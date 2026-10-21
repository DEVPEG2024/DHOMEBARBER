/**
 * Vignette du look en tête de l'écran Créneau (réservation ouverte depuis une photo des
 * réalisations d'un barber, `/booking?…&from=gallery&look=<clé>`, 21 oct. 2026) : photo en portrait
 * (coins arrondis, jamais ronde), titre du look et ligne « 3 prestations · 1 h 50 · 85 € » calculée
 * sur la sélection réelle (catalogue à jour). « Modifier » ramène au look sur le profil du barber :
 * c'est l'appelant qui décide comment (retour arrière ou lien `lookLinkFor`).
 * `LookPhoto` sert aussi à la ligne du look dans le récapitulatif de la confirmation.
 */
import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Images } from 'lucide-react';
import { formatDuration, formatPrice } from '@/components/services/serviceUtils';

/**
 * « 3 prestations · 1 h 50 · 85 € », en deux morceaux insécables : à 320 px la ligne passe à la
 * ligne entre le nombre et « 1 h 50 · 85 € », jamais au milieu d'une durée ou d'un prix.
 */
function SummaryLine({ count = 0, duration = 0, price = 0 }) {
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      <span className="whitespace-nowrap">{count} prestation{count > 1 ? 's' : ''}</span>
      {' · '}
      <span className="whitespace-nowrap">{formatDuration(duration)} · {formatPrice(price)}</span>
    </p>
  );
}

/** Photo du look en portrait (4:5) ; image introuvable → pictogramme sur le même fond. */
export function LookPhoto({ url, className = 'w-12 rounded-[10px]' }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`shrink-0 overflow-hidden bg-secondary border border-border flex items-center justify-center ${className}`}
      style={{ aspectRatio: '4 / 5' }} aria-hidden="true">
      {url && !broken ? (
        <img src={url} alt="" decoding="async" onError={() => setBroken(true)} className="w-full h-full object-cover" />
      ) : (
        <Images className="w-5 h-5 text-muted-foreground" />
      )}
    </span>
  );
}

/**
 * `names` : prestations retenues (« Coupe + Soin »), données seulement quand le client a ajusté un
 * look qui a une légende : le titre seul laisserait croire au look d'origine.
 */
export default function LookHeader({ photoUrl, title, names = '', count, duration, price, onEdit, loading = false }) {
  const reduceMotion = useReducedMotion();

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Chargement du look"
        className="flex items-center gap-3 p-2 rounded-2xl border border-border bg-card">
        <span className="w-12 shrink-0 rounded-[10px] bg-secondary animate-pulse" style={{ aspectRatio: '4 / 5' }} />
        <span className="flex-1 space-y-2">
          <span className="block h-3.5 w-3/4 rounded bg-secondary animate-pulse" />
          <span className="block h-3 w-1/2 rounded bg-secondary animate-pulse" />
        </span>
      </div>
    );
  }

  return (
    <motion.section
      aria-label="Votre look"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex items-center gap-3 p-2 pr-1 rounded-2xl border border-border bg-card"
    >
      <LookPhoto url={photoUrl} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-snug text-foreground line-clamp-2 break-words">{title}</p>
        {names && names !== title && (
          <p className="mt-0.5 text-xs text-foreground/80 line-clamp-2 break-words">{names}</p>
        )}
        <SummaryLine count={count} duration={duration} price={price} />
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label="Modifier le look"
          className="shrink-0 min-h-[44px] px-2.5 text-[13px] font-semibold text-primary hover:text-primary/80">
          Modifier
        </button>
      )}
    </motion.section>
  );
}
