import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Clock, Flame, Plus, Sparkles, X } from 'lucide-react';
import FavoriteButton from '@/components/shared/FavoriteButton';
import { hapticFeedback } from '@/lib/capacitor';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { KindIcon } from './KindIcon';
import AnimatedNumber from './AnimatedNumber';
import { formatDuration, formatPrice } from './serviceUtils';

/**
 * Fiche d'une prestation, en panneau du bas (portail dans `body`, au-dessus de la barre du bas) :
 * icône, cœur favori, croix, nom, durée, rang dans les plus demandées, prix, description complète,
 * « Souvent ajouté avec » (0 à 2 compléments à cocher), puis l'action principale
 * (« Réserver · 33 € ») et l'action secondaire (« Ajouter une autre prestation », « Ajouter à ma
 * sélection » ou « Retirer de ma sélection »).
 * Fermeture par la croix (ou Échap, ou le retour d'Android) uniquement : un tap sur le fond ne ferme
 * rien. Défilable sur un petit écran (320 × 568), pied de fiche toujours visible.
 *
 * @param {object} props
 * @param {object} props.service
 * @param {string} props.kind             icône (`KINDS`)
 * @param {number|null} [props.rank]      rang dans les plus demandées (1 à 4), sinon rien
 * @param {boolean} [props.isNew]
 * @param {object[]} [props.complements]  compléments proposés (`complementsFor`)
 * @param {string} props.pickLabel
 * @param {boolean} props.canPick         l'appelant fournit une action principale (`onPick`)
 * @param {boolean} props.hasSelection    le client compose déjà plusieurs prestations
 * @param {boolean} props.selected        cette prestation est déjà dans la sélection
 * @param {(list: object[]) => void} props.onPick     prendre exactement ces prestations
 * @param {(list: object[]) => void} props.onAdd      ajouter à la sélection
 * @param {(service: object) => void} props.onRemove  retirer de la sélection
 * @param {() => void} props.onClose
 */
export default function ServiceSheet({
  service, kind, rank = null, isNew = false, complements = [], pickLabel, canPick, hasSelection, selected,
  favorite = false, onFavorite, onPick, onAdd, onRemove, onClose, reduceMotion = false,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const [checked, setChecked] = useState(() => new Set());
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useAndroidBack(true, onClose);

  // Échap ferme (clavier) ; le focus va dans la fiche à l'ouverture et revient d'où il venait.
  // Une seule fois par fiche : la fermeture passe par une référence, pas par les dépendances.
  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  const extras = useMemo(() => complements.filter(c => checked.has(String(c.id))), [complements, checked]);
  const total = (Number(service?.price) || 0) + extras.reduce((sum, c) => sum + (Number(c.price) || 0), 0);
  const name = String(service?.name || '').trim();
  const description = typeof service?.description === 'string' ? service.description.trim() : '';

  const toggleExtra = (c) => {
    hapticFeedback();
    const id = String(c.id);
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const list = [service, ...extras];
  const primary = canPick
    ? { label: pickLabel, run: () => onPick?.(list) }
    : selected
      ? null
      : { label: 'Ajouter à ma sélection', run: () => onAdd?.(list) };
  let secondary = null;
  if (selected) secondary = { label: 'Retirer de ma sélection', run: () => onRemove?.(service) };
  else if (canPick) secondary = { label: hasSelection ? 'Ajouter à ma sélection' : 'Ajouter une autre prestation', run: () => onAdd?.(list) };

  return createPortal(
    <>
      {/* Fond : ne ferme rien au tap (fermeture par la croix) ; `touch-none` évite de faire défiler la page dessous */}
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60] bg-black/65 touch-none"
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
        animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
        transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', damping: 30, stiffness: 320 }}
        className="kb-sheet-92 fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-lg rounded-t-3xl border-t border-border bg-card shadow-2xl shadow-black/50 flex flex-col overflow-hidden outline-none"
      >
        {/* En-tête : poignée, icône, favori, croix */}
        <div className="shrink-0 px-5 pt-2.5">
          <div className="mx-auto w-10 h-1 rounded-full bg-muted" aria-hidden="true" />
          <div className="flex items-center gap-2 mt-3">
            <KindIcon kind={kind} size="lg" />
            <div className="flex-1" />
            {onFavorite && <FavoriteButton active={favorite} onToggle={() => onFavorite(service)} className="w-11 h-11" />}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="w-11 h-11 rounded-xl border border-border bg-secondary/70 text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0"
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {/* Contenu défilable */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">
          <div className="flex items-start justify-between gap-3 mt-3.5">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-2xl font-bold leading-tight text-foreground break-words">{name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" aria-hidden="true" /> {formatDuration(service?.duration)}
                </span>
                {rank && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                    <Flame className="w-3 h-3" aria-hidden="true" /> N°{rank} des réservations
                  </span>
                )}
                {isNew && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <Sparkles className="w-3 h-3" aria-hidden="true" /> Nouveau
                  </span>
                )}
              </div>
            </div>
            <span className="shrink-0 font-fut text-4xl font-bold leading-none text-primary tabular-nums whitespace-nowrap">{formatPrice(service?.price)}</span>
          </div>

          {description && (
            <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground whitespace-pre-line break-words">{description}</p>
          )}

          {complements.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-2">Souvent ajouté avec</p>
              <div className="space-y-2">
                {complements.map((c) => {
                  const on = checked.has(String(c.id));
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleExtra(c)}
                      className={`w-full min-h-[52px] px-3.5 py-2 rounded-2xl border flex items-center gap-3 text-left transition-colors duration-200 ${
                        on ? 'border-primary/60 bg-primary/10' : 'border-border bg-secondary/40 hover:border-primary/30'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 ${
                        on ? 'bg-primary text-primary-foreground' : 'border border-primary/50 text-primary'
                      }`}>
                        {on
                          ? <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
                          : <Plus className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-semibold text-foreground leading-snug break-words">{String(c.name || '').trim()}</span>
                      <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                        +{formatDuration(c.duration)} · <span className="font-semibold text-primary">+{formatPrice(c.price)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Pied : actions, toujours visibles */}
        <div className="shrink-0 border-t border-border/60 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] space-y-2.5">
          {primary && (
            <motion.button
              type="button"
              onClick={() => { hapticFeedback(); primary.run(); }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className="w-full h-[52px] rounded-2xl bg-primary text-primary-foreground text-[15px] font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 inline-flex items-center justify-center gap-2"
            >
              <span>{primary.label}</span>
              <span aria-hidden="true">·</span>
              <AnimatedNumber value={total} format={formatPrice} className="font-fut text-lg tabular-nums" />
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </motion.button>
          )}
          {/* « Retirer » passe par `onToggle` de l'appelant, qui vibre déjà */}
          {secondary && (
            <button
              type="button"
              onClick={() => { if (!selected) hapticFeedback(); secondary.run(); }}
              className={`w-full h-12 rounded-2xl border text-sm font-semibold transition-colors ${
                selected ? 'border-red-500/40 text-red-400 hover:bg-red-500/10' : 'border-border text-foreground hover:bg-secondary/60'
              }`}
            >
              {secondary.label}
            </button>
          )}
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
