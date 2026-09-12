import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ShoppingBag, ShoppingCart, Minus, Plus, Store, PackageX, AlertTriangle } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import { MAX_QUANTITY, formatPrice, productCategoryLabel, productImages, stockInfo } from './productUtils';

const SWIPE_OFFSET = 50;
const SWIPE_VELOCITY = 400;

/**
 * Galerie d'un produit : glissement au doigt (drag x), flèches et points. Même mécanique que la
 * fiche textile, mais l'image est posée entière (`object-contain`) sur fond blanc, comme sur les
 * cartes de la grille. Une seule image = ni flèches ni points.
 */
function ProductGallery({ images, name, reduceMotion, galleryRef }) {
  const [[index, direction], setPage] = useState([0, 0]);
  const count = images.length;
  const go = (next) => {
    if (count <= 1) return;
    const clamped = ((next % count) + count) % count;
    setPage([clamped, next > index ? 1 : -1]);
  };
  const variants = {
    enter: (dir) => ({ x: reduceMotion ? 0 : dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: reduceMotion ? 0 : dir < 0 ? '100%' : '-100%', opacity: 0 }),
  };

  if (count === 0) {
    return (
      <div ref={galleryRef} className="relative aspect-square bg-white flex items-center justify-center">
        <ShoppingBag className="w-14 h-14 text-muted-foreground/30" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div ref={galleryRef} className="relative aspect-square bg-white overflow-hidden select-none">
      <AnimatePresence initial={false} custom={direction}>
        <motion.img
          key={`${index}-${images[index]}`}
          src={images[index]}
          alt={count > 1 ? `${name} — image ${index + 1} sur ${count}` : name}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ x: { type: 'spring', stiffness: 320, damping: 32 }, opacity: { duration: 0.2 } }}
          drag={count > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragEnd={(_e, info) => {
            if (info.offset.x < -SWIPE_OFFSET || info.velocity.x < -SWIPE_VELOCITY) go(index + 1);
            else if (info.offset.x > SWIPE_OFFSET || info.velocity.x > SWIPE_VELOCITY) go(index - 1);
          }}
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain p-6 touch-pan-y"
        />
      </AnimatePresence>

      {count > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Image précédente"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Image suivante"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm">
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
            {images.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                aria-label={`Image ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
                className="relative h-6 px-0.5 flex items-center"
              >
                <span className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : 'w-1.5 bg-black/30'}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Fiche produit en bottom sheet : galerie, nom, marque, catégorie, prix, description complète,
 * état du stock, sélecteur de quantité et « Ajouter au panier · total ». Fermeture par la croix
 * (ou Échap) uniquement : un tap à côté ne ferme rien.
 *
 * `onAdd(product, quantity, sourceEl)` ajoute la quantité au panier de la Boutique ; `sourceEl`
 * est l'élément d'où part la vignette qui vole vers le panier (la galerie, sinon le bouton).
 */
export default function ProductSheet({ product, cartQty = 0, onClose, onAdd, reduceMotion = false }) {
  const images = useMemo(() => productImages(product), [product]);
  const stock = useMemo(() => stockInfo(product), [product]);
  const [quantity, setQuantity] = useState(1);
  const galleryRef = useRef(null);
  const buttonRef = useRef(null);

  // Quantité ajoutable : plafond de la fiche, moins ce qui est déjà dans le panier si le stock est suivi
  const maxQty = stock.tracked ? Math.max(0, Math.min(MAX_QUANTITY, stock.stock - cartQty)) : MAX_QUANTITY;
  useEffect(() => { setQuantity(q => Math.min(Math.max(1, q), Math.max(1, maxQty))); }, [maxQty]);

  const stockExhausted = stock.tracked && !stock.soldOut && maxQty === 0;
  const canAdd = !stock.soldOut && !stockExhausted && maxQty >= 1;
  const price = Number(product?.price) || 0;
  const total = price * quantity;
  const category = productCategoryLabel(product?.category);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changeQty = (delta) => {
    hapticFeedback();
    setQuantity(q => Math.min(Math.max(1, maxQty), Math.max(1, q + delta)));
  };

  const handleAdd = () => {
    if (!canAdd) return;
    hapticFeedback();
    onAdd?.(product, quantity, galleryRef.current || buttonRef.current);
    onClose?.();
  };

  if (!product) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/65"
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[60] max-h-[92vh] rounded-t-3xl border-t border-border bg-background flex flex-col overflow-hidden"
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-sm"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <ProductGallery images={images} name={product.name} reduceMotion={reduceMotion} galleryRef={galleryRef} />

          <div className="px-5 pt-4 pb-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {(product.brand || category) && (
                  <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
                    {[product.brand, category].filter(Boolean).join(' · ')}
                  </p>
                )}
                <h2 className="font-display text-xl font-bold leading-tight text-foreground mt-1">{product.name}</h2>
              </div>
              <p className="font-fut text-3xl font-bold text-primary leading-none shrink-0">{formatPrice(price)}</p>
            </div>

            {/* Stock : rien si non suivi ; « Plus que N » sous le seuil ; « Rupture » à zéro */}
            {stock.soldOut && (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 rounded-full px-3 py-1.5">
                <PackageX className="w-3.5 h-3.5" /> Rupture de stock
              </p>
            )}
            {stock.low && (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 rounded-full px-3 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Plus que {stock.stock} en stock
              </p>
            )}

            {product.description ? (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground/70 italic">Pas de description pour ce produit.</p>
            )}

            {cartQty > 0 && (
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                <ShoppingCart className="w-3.5 h-3.5 text-primary" />
                Déjà {cartQty} dans ton panier
              </p>
            )}
          </div>
        </div>

        {/* Pied : quantité + ajout */}
        <div className="border-t border-border px-5 pt-3 pb-6 shrink-0 bg-background space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground flex items-start gap-1.5 min-w-0">
              <Store className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Retrait au salon · paiement sur place</span>
            </p>
            {canAdd && (
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Moins" onClick={() => changeQty(-1)} disabled={quantity <= 1}
                  className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center active:scale-95 disabled:opacity-40">
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-fut text-2xl font-bold w-7 text-center tabular-nums" aria-live="polite">{quantity}</span>
                <button type="button" aria-label="Plus" onClick={() => changeQty(1)} disabled={quantity >= maxQty}
                  className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 disabled:opacity-40">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <motion.button
            ref={buttonRef}
            type="button"
            whileTap={canAdd ? { scale: 0.97 } : undefined}
            onClick={handleAdd}
            disabled={!canAdd}
            className="w-full h-[3.25rem] rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/25 disabled:opacity-50 disabled:shadow-none inline-flex items-center justify-center gap-2"
          >
            {stock.soldOut
              ? 'Rupture de stock'
              : stockExhausted
                ? 'Tout le stock est dans ton panier'
                : <><ShoppingCart className="w-4 h-4" /> Ajouter au panier · <span className="font-fut text-lg">{formatPrice(total)}</span></>}
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}
