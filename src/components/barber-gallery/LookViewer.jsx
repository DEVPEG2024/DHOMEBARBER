import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarPlus, Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { LOOK_MAX, lookTotals } from '@/lib/barberGallery';
import { formatDuration, formatPrice } from '@/components/services/serviceUtils';
import LoadError from '@/components/shared/LoadError';
import { initialSelection, lookOptions, orderedSelection, prestationsLabel } from './lookSelection';

const SWIPE_OFFSET = 60;
const SWIPE_VELOCITY = 450;
const SPRING = { type: 'spring', stiffness: 320, damping: 32 };
const SOFT_SPRING = { type: 'spring', stiffness: 420, damping: 26 };

// Photo suivante / précédente : arrive du côté du geste (sens lu au moment de la sortie)
const slide = {
  enter: (dir) => ({ opacity: 0, x: dir >= 0 ? 80 : -80 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir >= 0 ? -80 : 80 }),
};

/** Pastille cochée / vide d'une prestation (la coche arrive en ressort). */
function CheckDot({ on, reduce }) {
  if (!on) return <span aria-hidden="true" className="w-5 h-5 m-px shrink-0 rounded-full border-2 border-muted-foreground/45" />;
  return (
    <motion.span
      aria-hidden="true"
      initial={reduce ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SOFT_SPRING}
      className="w-[22px] h-[22px] shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
    >
      <Check className="w-3.5 h-3.5" strokeWidth={3} />
    </motion.span>
  );
}

/**
 * Visionneuse « story » des looks d'un barber, plein écran (portail dans `body`, z-[70]) :
 * barres de progression (une par look de la liste), photo en grand, glissé gauche / droite,
 * flèches, ← / → et Échap au clavier, croix « Fermer ». Feuille du bas « Ce look » : prestations
 * à cocher / décocher (au moins une du look reste cochée), compléments « En plus », total en
 * direct, « Choisir mon créneau avec <prénom> ». Photo sans prestation : « Réserver avec <prénom> ».
 *
 * Protections reprises de l'ancienne Lightbox : les événements de pointeur sont arrêtés à la racine
 * (portail React : ils remonteraient au bloc glissable du profil et feraient changer de barber) ;
 * les touches sont écoutées en capture (BarberProfile écoute ← / → sur window) ; `overflow: hidden`
 * sur le body ; bouton retour d'Android = Fermer.
 *
 * `looks` : `{ item, services, totals, title }` ; `catalog` : prestations actives, null tant
 * qu'elles ne sont pas lues ; `servicesParam` : sélection de l'adresse (`services=a,b`), lue
 * seulement tant que le client n'a rien touché sur ce look.
 */
export default function LookViewer({
  looks, index, firstName, photoUrl, catalog, catalogQuery, servicesParam, onIndex, onClose, onBook,
}) {
  const reduce = useReducedMotion();
  // Fenêtre en train de se fermer (animation de sortie) : plus aucune touche ni aucun geste
  const present = useIsPresent();
  const rootRef = useRef(null);
  const hintId = useId();
  const titleId = useId();
  const [dir, setDir] = useState(0);
  // Sélection modifiée par le client, pour le look `key` seulement (changer de look la remet à zéro)
  const [sel, setSel] = useState({ key: null, ids: null });
  const count = looks.length;
  const look = looks[index] || null;
  const item = look?.item || null;

  const options = useMemo(
    () => (catalog && item ? lookOptions(item, catalog) : { base: [], extras: [] }),
    [catalog, item],
  );
  const ids = sel.key != null && sel.key === item?.key ? sel.ids : initialSelection(options, servicesParam);
  const selected = orderedSelection(options, ids);
  const totals = lookTotals(selected);
  const baseOn = options.base.filter((s) => ids.includes(String(s.id)));

  // Photo sans prestation (ou dont toutes ont quitté le catalogue) : réservation avec le barber seul
  const noService = !!item && (item.service_ids.length === 0 || (!!catalog && options.base.length === 0));
  const catalogFailed = !catalog && !noService && !!catalogQuery?.failed;
  const catalogPending = !catalog && !noService && !catalogFailed;

  const go = useCallback((step) => {
    if (count < 2 || !present) return;
    setDir(step);
    setSel({ key: null, ids: null });
    hapticFeedback();
    onIndex((index + step + count) % count);
  }, [count, index, onIndex, present]);

  const close = useCallback(() => {
    if (!present) return;
    hapticFeedback();
    onClose();
  }, [onClose, present]);

  useEffect(() => {
    if (!present) return undefined;
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
  }, [go, onClose, present]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Focus dans la fenêtre à l'ouverture (clavier, lecteur d'écran), rendu à l'élément d'origine.
  // Le profil derrière sort du clavier et du lecteur d'écran (`inert` sur #root, comme la demande
  // de privatisation) : sans lui, Tab quittait cette fenêtre pourtant déclarée modale.
  useEffect(() => {
    const previous = document.activeElement;
    const appRoot = document.getElementById('root');
    const rootWasInert = !!appRoot?.hasAttribute('inert');
    if (appRoot && !rootWasInert) appRoot.setAttribute('inert', '');
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      if (appRoot && !rootWasInert) appRoot.removeAttribute('inert');
      if (previous && previous !== document.body && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  useAndroidBack(present, onClose);

  if (!look) return null;

  const toggle = (service) => {
    const id = String(service.id);
    const on = ids.includes(id);
    const isBase = options.base.some((s) => String(s.id) === id);
    if (on && isBase && baseOn.length <= 1) return; // la dernière prestation du look reste
    if (!on && ids.length >= LOOK_MAX) return;
    hapticFeedback();
    setSel({ key: item.key, ids: on ? ids.filter((x) => x !== id) : [...ids, id] });
  };

  const multiple = options.base.length > 1;
  const locked = multiple && baseOn.length === 1;
  const title = look.title || `Réalisation de ${firstName}`;

  return createPortal(
    <motion.div
      ref={rootRef}
      tabIndex={-1}
      data-app-overlay=""
      role="dialog"
      aria-modal="true"
      aria-label={`Les looks de ${firstName}`}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.2 }}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[70] flex flex-col bg-black outline-none"
    >
      {/* Photo en grand, glissable */}
      <div className="relative flex-1 min-h-[180px] overflow-hidden">
        <AnimatePresence initial={false} custom={dir}>
          <motion.img
            key={item.key}
            src={item.url}
            alt={look.title ? `Look de ${firstName} : ${look.title}` : `Réalisation de ${firstName}`}
            custom={dir}
            variants={slide}
            initial={reduce ? false : 'enter'}
            animate="center"
            exit={reduce ? undefined : 'exit'}
            transition={SPRING}
            drag={count > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={(_e, { offset, velocity }) => {
              if (offset.x < -SWIPE_OFFSET || velocity.x < -SWIPE_VELOCITY) go(1);
              else if (offset.x > SWIPE_OFFSET || velocity.x > SWIPE_VELOCITY) go(-1);
            }}
            draggable={false}
            // Écran large (ordinateur) : photo entière, pas une bande rognée d'un portrait
            className="absolute inset-0 w-full h-full object-cover md:object-contain select-none touch-pan-y"
          />
        </AnimatePresence>
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/75 to-transparent pointer-events-none" />

        {/* Barres de progression (une par look) et en-tête */}
        <div className="absolute inset-x-0 top-0 z-10 px-3 pt-[max(env(safe-area-inset-top),12px)] text-white">
          {count > 1 && (
            <div className="flex gap-1" aria-hidden="true">
              {looks.map((l, i) => (
                <span key={l.item.key} className="relative flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
                  {i === index && (
                    <motion.span
                      initial={reduce ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 origin-left rounded-full bg-white"
                    />
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-2.5">
            {photoUrl && (
              <img src={photoUrl} alt="" className="w-[26px] h-[37px] shrink-0 rounded-md object-cover border border-white/30" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight truncate">{firstName}</p>
              <p className="text-[11px] text-white/80 truncate">
                Look {index + 1} / {count}{count > 1 ? ' · glissez pour le suivant' : ''}
              </p>
            </div>
            <button type="button" onClick={close} aria-label="Fermer"
              className="w-10 h-10 shrink-0 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center">
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {count > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Look précédent"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center">
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Look suivant"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center">
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {/* Feuille « Ce look » */}
      <motion.section
        aria-labelledby={titleId}
        initial={reduce ? false : { y: 56, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={SPRING}
        className="relative z-20 -mt-7 shrink-0 max-h-[66%] overflow-y-auto overscroll-contain rounded-t-[26px] bg-card text-foreground px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),18px)] shadow-[0_-12px_40px_rgba(0,0,0,0.35)]"
      >
        <span aria-hidden="true" className="mx-auto mb-2.5 block w-9 h-1 rounded-full bg-border" />
        <motion.div
          key={item.key}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="flex flex-col gap-2.5"
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">Ce look</span>
              {multiple && <span className="text-xs text-muted-foreground text-right">Touchez pour retirer ou remettre</span>}
            </div>
            <h2 id={titleId} className="text-[17px] font-extrabold leading-snug">{title}</h2>
          </div>

          {noService && (
            <>
              <p className="text-sm text-muted-foreground">
                Vous choisirez vos prestations à l&apos;étape suivante.
              </p>
              <button type="button" onClick={() => onBook(look, [])}
                className="h-[52px] w-full rounded-2xl bg-primary text-primary-foreground text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                <CalendarPlus className="w-[18px] h-[18px]" aria-hidden="true" />
                Réserver avec {firstName}
              </button>
            </>
          )}

          {catalogFailed && (
            <LoadError compact what="les prestations de ce look" error={catalogQuery.error}
              onRetry={catalogQuery.refetch} retrying={catalogQuery.isFetching} />
          )}

          {catalogPending && (
            <div className="flex flex-col gap-1.5" aria-busy="true" aria-label="Chargement des prestations">
              {[0, 1, 2].slice(0, Math.max(1, item.service_ids.length)).map((n) => (
                <span key={n} className="block h-[46px] rounded-2xl bg-muted motion-safe:animate-pulse" />
              ))}
            </div>
          )}

          {catalog && !noService && (
            <>
              <div role="group" aria-label="Prestations du look" className="flex flex-col gap-1.5">
                {options.base.map((s) => {
                  const on = ids.includes(String(s.id));
                  const meta = `${formatPrice(s.price)} · ${formatDuration(s.duration)}`;
                  if (!multiple) {
                    // Look d'une prestation : rien à décocher
                    return (
                      <div key={s.id} className="min-h-[46px] flex items-center gap-3 px-3 py-2 rounded-2xl border border-primary/45 bg-primary/10">
                        <CheckDot on reduce={reduce} />
                        <span className="flex-1 min-w-0 text-sm font-semibold">{s.name}</span>
                        <span className="shrink-0 text-[13px] tabular-nums text-foreground/70">{meta}</span>
                      </div>
                    );
                  }
                  const isLast = on && locked;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s)}
                      aria-pressed={on}
                      // aria-disabled et non disabled : la dernière prestation reste atteignable au
                      // clavier et l'aide « Gardez au moins une prestation » est lue (toggle l'ignore)
                      aria-disabled={isLast || undefined}
                      aria-describedby={isLast ? hintId : undefined}
                      className={`min-h-[46px] flex items-center gap-3 px-3 py-2 rounded-2xl border text-left transition-colors ${isLast ? 'cursor-not-allowed' : ''} ${on ? 'border-primary/45 bg-primary/10' : 'border-border bg-transparent'}`}
                    >
                      <CheckDot on={on} reduce={reduce} />
                      <span className={`flex-1 min-w-0 text-sm ${on ? 'font-semibold' : 'font-medium text-muted-foreground line-through'}`}>{s.name}</span>
                      <span className={`shrink-0 text-[13px] tabular-nums ${on ? 'text-foreground/70' : 'text-muted-foreground'}`}>{meta}</span>
                    </button>
                  );
                })}
              </div>
              {locked && (
                <p id={hintId} className="-mt-1 text-xs text-muted-foreground">Gardez au moins une prestation</p>
              )}

              {options.extras.length > 0 && (
                <div role="group" aria-label="En plus" className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground mr-0.5" aria-hidden="true">En plus :</span>
                  {options.extras.map((s) => {
                    const on = ids.includes(String(s.id));
                    return (
                      <motion.button
                        key={s.id}
                        type="button"
                        onClick={() => toggle(s)}
                        aria-pressed={on}
                        disabled={!on && ids.length >= LOOK_MAX}
                        whileTap={reduce ? undefined : { scale: 0.95 }}
                        className={`min-h-[34px] max-w-full px-3 py-1 rounded-full border text-xs font-semibold text-left inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${on ? 'border-solid border-primary/60 bg-primary/15 text-foreground' : 'border-dashed border-muted-foreground/45 text-foreground/85'}`}
                      >
                        {on
                          ? <Check className="w-3.5 h-3.5 text-primary" strokeWidth={3} aria-hidden="true" />
                          : <Plus className="w-3.5 h-3.5" strokeWidth={2.6} aria-hidden="true" />}
                        {s.name} · {formatPrice(s.price)}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              <p role="status" className="flex flex-wrap items-baseline gap-x-2">
                <motion.span
                  key={totals.price}
                  initial={reduce ? false : { opacity: 0.4, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SOFT_SPRING}
                  className="font-fut text-[34px] font-extrabold leading-none tabular-nums"
                >
                  {formatPrice(totals.price)}
                </motion.span>
                {' '}
                <span className="text-[13px] text-muted-foreground">
                  · {formatDuration(totals.duration)} · {prestationsLabel(totals.count)}
                </span>
              </p>

              <button type="button" onClick={() => onBook(look, selected)}
                className="h-[52px] w-full rounded-2xl bg-primary text-primary-foreground text-[15px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform">
                Choisir mon créneau avec {firstName}
                <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </>
          )}
        </motion.div>
      </motion.section>
    </motion.div>,
    document.body,
  );
}
