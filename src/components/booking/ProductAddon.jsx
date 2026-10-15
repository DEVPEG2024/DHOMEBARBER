/**
 * Réservation, étape de confirmation : « Un produit pour votre coupe ? ».
 * Le client ajoute des produits de la boutique à son rendez-vous ; son barber les lui remet
 * pendant le RDV et il les règle au salon avec la prestation. La commande n'est créée qu'après
 * la confirmation du rendez-vous (`Booking.jsx`), rattachée par `appointment_id`.
 *
 * Catalogue : même requête et même clé que la Boutique (`['products']`, cache partagé).
 * Rien n'est rendu tant que le catalogue n'est pas là, s'il n'a pas pu être chargé ou si aucun
 * produit n'est proposable : ce bloc ne doit jamais gêner la réservation.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { api } from '@/api/apiClient';
import { hapticFeedback } from '@/lib/capacitor';
import { MAX_ADDON_QUANTITY, suggestAddonProducts } from '@/lib/appointmentProducts';
import { formatPrice, productImages, stockInfo } from '@/components/shop/productUtils';

/** Requête du catalogue, identique à celle de la Boutique. */
export const addonProductsQuery = {
  queryKey: ['products'],
  staleTime: 5 * 60 * 1000, // catalogue : change rarement
  queryFn: () => api.entities.Product.filter({ is_active: true }, 'name', 100),
};

/** Quantité maximale ajoutable : `MAX_ADDON_QUANTITY`, bornée par le stock quand il est suivi. */
export function addonMaxQuantity(product) {
  const info = stockInfo(product);
  return info.tracked ? Math.max(0, Math.min(MAX_ADDON_QUANTITY, info.stock)) : MAX_ADDON_QUANTITY;
}

function AddonCard({ product, quantity, onSet, index, reduceMotion }) {
  const image = productImages(product)[0];
  const info = stockInfo(product);
  const max = addonMaxQuantity(product);
  const selected = quantity > 0;

  const add = () => {
    if (quantity >= max) return;
    hapticFeedback();
    onSet(quantity + 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.04, duration: 0.28, ease: 'easeOut' }}
      className={`w-[132px] flex-shrink-0 rounded-2xl border p-2 flex flex-col transition-colors duration-300 ${
        selected ? 'border-primary/40 bg-primary/8' : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white/5 flex items-center justify-center">
        {image ? (
          <img src={image} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <ShoppingBag className="w-7 h-7 text-muted-foreground/50" aria-hidden="true" />
        )}
        {info.low && (
          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-medium text-amber-300">
            Plus que {info.stock}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs font-medium leading-snug text-foreground line-clamp-2 min-h-[2.1rem] break-words">
        {product.name}
      </p>
      <p className="text-xs font-bold text-primary mt-0.5 tabular-nums">{formatPrice(product.price)}</p>

      <div className="mt-2 h-8">
        {selected ? (
          <div className="h-full flex items-center justify-between rounded-lg bg-primary/15 border border-primary/30">
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => { hapticFeedback(); onSet(quantity - 1); }}
              aria-label={`Retirer un ${product.name}`}
              className="w-8 h-full flex items-center justify-center text-primary"
            >
              <Minus className="w-3.5 h-3.5" />
            </motion.button>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={quantity}
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.6 }}
                transition={{ duration: 0.16 }}
                className="text-sm font-bold text-foreground tabular-nums"
                aria-live="polite"
              >
                {quantity}
              </motion.span>
            </AnimatePresence>
            <motion.button
              type="button"
              whileTap={quantity < max ? { scale: 0.88 } : undefined}
              onClick={add}
              disabled={quantity >= max}
              aria-label={`Ajouter un ${product.name}`}
              className="w-8 h-full flex items-center justify-center text-primary disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        ) : (
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={add}
            disabled={max <= 0}
            aria-label={`Ajouter ${product.name} au rendez-vous`}
            className="w-full h-full flex items-center justify-center gap-1 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-foreground hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5 text-primary" /> Ajouter
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

/**
 * @param {object[]} services   prestations choisies (pour ordonner les suggestions)
 * @param {object} selection    `{ [productId]: quantité }`
 * @param {(next: object) => void} onChange
 */
export default function ProductAddon({ services, selection, onChange }) {
  const reduceMotion = useReducedMotion();
  const { data } = useQuery(addonProductsQuery);
  const products = useMemo(() => suggestAddonProducts(data || [], services || []), [data, services]);

  if (!data || products.length === 0) return null;

  const setQuantity = (product, quantity) => {
    const next = { ...(selection || {}) };
    const key = String(product.id);
    if (quantity > 0) next[key] = quantity;
    else delete next[key];
    onChange(next);
  };

  return (
    <section aria-labelledby="addon-title" className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl pt-4 pb-3 overflow-hidden">
      <div className="px-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <ShoppingBag className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 id="addon-title" className="text-sm font-semibold text-foreground">Un produit pour votre coupe ?</h2>
          <p className="text-[11px] leading-snug text-muted-foreground mt-0.5">
            Votre barber vous le remet pendant le rendez-vous, vous le réglez au salon
          </p>
        </div>
      </div>
      {/* La rangée défile seule : la page ne s'élargit jamais */}
      <div className="mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-hide overscroll-x-contain">
        {products.map((product, i) => (
          <AddonCard
            key={product.id}
            product={product}
            index={i}
            reduceMotion={reduceMotion}
            quantity={Number(selection?.[String(product.id)]) || 0}
            onSet={(q) => setQuantity(product, q)}
          />
        ))}
      </div>
    </section>
  );
}
