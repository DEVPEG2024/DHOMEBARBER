import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Flame, Crown, Check } from 'lucide-react';
import { categoryLabel, categoryEmoji, conceptAvailability, formatPrice } from '@/lib/textileApi';
import EmojiBurst from './EmojiBurst';
import { EASE, conceptCover } from './textileUtils';

/** Pourcentage qui compte jusqu'à sa valeur (écrit dans le DOM par une motion value, sans re-render). */
function AnimatedPercent({ value, reduceMotion }) {
  const mv = useMotionValue(reduceMotion ? value : 0);
  const text = useTransform(mv, v => `${Math.round(v)} %`);
  useEffect(() => {
    if (reduceMotion) { mv.set(value); return undefined; }
    const controls = animate(mv, value, { duration: 0.9, ease: EASE });
    return () => controls.stop();
  }, [value, reduceMotion, mv]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/** Barre de « hype » du Labo : part des votes du concept sur le total du Labo. */
function HypeBar({ pct, reduceMotion }) {
  const ratio = Math.max(0.02, Math.min(1, pct / 100));
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="uppercase tracking-[0.18em] text-muted-foreground font-medium">Hype</span>
        <span className="font-bold text-primary"><AnimatedPercent value={pct} reduceMotion={reduceMotion} /></span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
          style={{ transformOrigin: 'left center' }}
          initial={{ scaleX: reduceMotion ? ratio : 0 }}
          animate={{ scaleX: ratio }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      </div>
    </div>
  );
}

export function ColorSwatches({ colors, max = 6, size = 'sm' }) {
  const list = Array.isArray(colors) ? colors.filter(c => c && c.hex) : [];
  if (list.length === 0) return null;
  const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-6 h-6';
  return (
    <div className="flex items-center gap-1" aria-label="Couleurs">
      {list.slice(0, max).map((c, i) => (
        <span
          key={`${c.hex}-${i}`}
          title={c.name || c.hex}
          className={`${dim} rounded-full border border-white/25 ring-1 ring-black/20 shrink-0`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
      {list.length > max && <span className="text-[10px] text-muted-foreground">+{list.length - max}</span>}
    </div>
  );
}

/**
 * Carte d'une pièce dans la grille : image carrée, catégorie, nom, prix, couleurs, tailles,
 * barre de hype (Labo), compteur de votes et bouton « Je le veux » (vote optimiste + éclatement).
 * Tap sur la carte → fiche détail (bottom sheet).
 */
function ConceptCard({
  concept,
  index = 0,
  voted = false,
  canVote = true,
  live = false,
  dim = false,
  hype = null,
  onVote,
  onOpen,
  reduceMotion = false,
}) {
  const [burst, setBurst] = useState(null);
  const cover = conceptCover(concept);
  const sizes = Array.isArray(concept.sizes) ? concept.sizes : [];
  const votes = Number(concept.votes_count) || 0;
  const availability = conceptAvailability(concept);
  const soldOut = Boolean(concept.sold_out) || (live && availability.tracked && availability.soldOut);
  const lowStock = live && !soldOut && availability.tracked && availability.remaining <= 5;

  const handleVote = (e) => {
    e.stopPropagation();
    if (!canVote) return;
    if (!voted && !reduceMotion) setBurst(Date.now());
    onVote?.(concept, voted);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 8) * 0.05, ease: EASE }}
      className={`relative flex flex-col rounded-2xl overflow-hidden bg-card border border-border ${dim ? 'opacity-60 grayscale' : ''}`}
    >
      <button
        type="button"
        onClick={() => onOpen?.(concept)}
        className="relative aspect-square bg-secondary text-left w-full overflow-hidden"
        aria-label={`Voir ${concept.name}`}
      >
        {cover ? (
          <img src={cover} alt={concept.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#171a19] to-[#0b0d0c]">
            <span className="text-5xl opacity-70" aria-hidden="true">{categoryEmoji(concept.category)}</span>
          </div>
        )}

        {hype?.rank && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-black text-[10px] font-extrabold uppercase tracking-wider shadow">
            <Crown className="w-3 h-3" />
            Top {hype.rank}
          </span>
        )}
        {lowStock && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-semibold backdrop-blur-sm">
            Plus que {availability.remaining}
          </span>
        )}
        {soldOut && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="font-fut text-3xl font-extrabold uppercase tracking-[0.2em] text-white/80 -rotate-12 border-2 border-white/60 px-3 py-0.5">
              Épuisé
            </span>
          </div>
        )}
      </button>

      <div className="p-3 flex-1 flex flex-col">
        <button type="button" onClick={() => onOpen?.(concept)} className="text-left">
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">{categoryLabel(concept.category)}</p>
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-1 mt-0.5">{concept.name}</h3>
          <p className="font-fut text-xl font-bold text-foreground leading-none mt-1">{formatPrice(concept.price)}</p>
        </button>

        <div className="flex items-center justify-between gap-2 mt-2 min-h-[16px]">
          <ColorSwatches colors={concept.colors} />
          {sizes.length > 0 && (
            <p className="text-[10px] text-muted-foreground truncate">{sizes.join(' · ')}</p>
          )}
        </div>

        {hype && <HypeBar pct={hype.pct} reduceMotion={reduceMotion} />}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/80">
            <Flame className={`w-3.5 h-3.5 ${votes > 0 ? 'text-orange-400' : 'text-muted-foreground'}`} />
            {votes}
          </span>
          <span className="relative">
            <motion.button
              type="button"
              whileTap={canVote ? { scale: 0.92 } : undefined}
              onClick={handleVote}
              disabled={!canVote}
              aria-pressed={voted}
              className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                voted
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30'
                  : 'bg-secondary text-foreground hover:bg-primary/15'
              }`}
            >
              {voted ? <Check className="w-3.5 h-3.5" /> : <Flame className="w-3.5 h-3.5" />}
              {voted ? 'Je le veux' : 'Je le veux'}
            </motion.button>
            {burst && <EmojiBurst key={burst} emoji="🔥" onDone={() => setBurst(null)} />}
          </span>
        </div>
      </div>
    </motion.article>
  );
}

// La page se re-rend chaque seconde (compte à rebours) : les cartes ne suivent que leurs props
export default React.memo(ConceptCard);
