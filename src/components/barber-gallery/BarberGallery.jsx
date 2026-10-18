import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import { GALLERY_PREVIEW, galleryOf } from '@/lib/barberGallery';
import { useAndroidBack } from '@/lib/useAndroidBack';

const SWIPE_OFFSET = 60;
const SWIPE_VELOCITY = 450;

/**
 * Visionneuse plein écran : croix, flèches, glissé gauche / droite, Échap et ← / → au clavier.
 * Rendue dans `body` ; les événements de pointeur sont arrêtés à sa racine, sinon (portail React)
 * ils remonteraient au bloc glissable du profil et feraient changer de barber. Les touches sont
 * écoutées en capture pour la même raison (BarberProfile écoute ← / → sur window).
 */
function Lightbox({ items, index, onIndex, onClose }) {
  const reduce = useReducedMotion();
  const [dir, setDir] = useState(0);
  const count = items.length;
  const item = items[index];

  const go = useCallback((step) => {
    if (count < 2) return;
    setDir(step);
    hapticFeedback();
    onIndex((index + step + count) % count);
  }, [count, index, onIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!item) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/95 flex flex-col"
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog" aria-modal="true" aria-label="Réalisations"
    >
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 text-white">
        <span className="text-xs tabular-nums text-white/60">{index + 1} / {count}</span>
        <button type="button" onClick={onClose} aria-label="Fermer"
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.img
            key={item.url}
            src={item.url}
            alt={item.caption || `Réalisation ${index + 1}`}
            custom={dir}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir >= 0 ? 80 : -80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir >= 0 ? -80 : 80 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag={count > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={(_e, { offset, velocity }) => {
              if (offset.x < -SWIPE_OFFSET || velocity.x < -SWIPE_VELOCITY) go(1);
              else if (offset.x > SWIPE_OFFSET || velocity.x > SWIPE_VELOCITY) go(-1);
            }}
            draggable={false}
            className="max-w-full max-h-full object-contain select-none touch-pan-y"
          />
        </AnimatePresence>
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Photo précédente"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Photo suivante"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center">
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] min-h-[64px] text-center">
        {item.caption && <p className="text-sm text-white/90">{item.caption}</p>}
      </div>
    </motion.div>,
    document.body,
  );
}

/**
 * Réalisations d'un barber sur son profil public : grille de vignettes carrées (les 9 premières,
 * puis « Voir les N photos »), tap = visionneuse. Rien n'est affiché sans photo.
 */
export default function BarberGallery({ employee, delay = 0 }) {
  const items = galleryOf(employee);
  const [open, setOpen] = useState(null); // index affiché, null = fermé
  const [expanded, setExpanded] = useState(false);
  // Bouton retour d'Android : ferme la visionneuse au lieu de quitter le profil
  useAndroidBack(open != null, () => setOpen(null));
  if (items.length === 0) return null;

  const shown = expanded ? items : items.slice(0, GALLERY_PREVIEW);
  const hidden = items.length - shown.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] p-5 mb-5"
    >
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-primary/60 font-semibold mb-3 flex items-center gap-2">
        <Images className="w-3.5 h-3.5" />
        Réalisations
        <span className="text-muted-foreground/50 normal-case tracking-normal font-normal">· {items.length}</span>
      </h3>
      <div className="grid grid-cols-3 gap-1.5">
        {shown.map((item, i) => (
          <button
            key={item.url}
            type="button"
            onClick={() => { hapticFeedback(); setOpen(i); }}
            className="relative aspect-square rounded-lg overflow-hidden bg-white/5 active:scale-[0.97] transition-transform"
            aria-label={item.caption || `Réalisation ${i + 1}`}
          >
            <img src={item.url} alt="" loading="lazy" decoding="async" draggable={false} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)}
          className="w-full mt-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-foreground/80">
          Voir les {items.length} photos
        </button>
      )}
      <AnimatePresence>
        {open !== null && (
          <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
