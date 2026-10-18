/**
 * Réservation ouverte depuis une photo de la galerie d'un barber (`/booking?barber=…&services=…
 * &from=gallery`) : la prestation de la photo est déjà choisie, le barber aussi. Au lieu du
 * catalogue complet, un écran court :
 *   1. la prestation choisie (et celles ajoutées), « Changer de prestation » pour le catalogue ;
 *   2. ses compléments (barbe, soin, formule) : suggestions du sélecteur de prestations ;
 *   3. les produits de la boutique suggérés (« Un produit pour votre coupe ? ») ;
 * puis « Choisir mon créneau » mène directement aux créneaux de ce barber.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Images, Scissors, X } from 'lucide-react';
import ServicePicker from '@/components/services/ServicePicker';
import ProductAddon from '@/components/booking/ProductAddon';
import { formatDuration, formatPrice } from '@/components/services/serviceUtils';
import { hapticFeedback } from '@/lib/capacitor';

export default function GalleryQuickStep({
  catalog, selected, photoServiceIds = [], loading, barber, onToggle, onSwap, onChangeServices,
  addonsEnabled, addonSelection, onAddonChange,
}) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-20 rounded-2xl bg-white/5 animate-pulse" />
        <div className="h-14 rounded-2xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Choisie depuis les réalisations{barber?.name ? ` de ${barber.name}` : ''}. Complétez si vous le souhaitez, puis choisissez votre créneau.
      </p>

      {/* Prestation(s) choisie(s) */}
      <div className="space-y-2" data-testid="gallery-quick-selected">
        {selected.map((s, i) => {
          // Icône photo pour la prestation de la réalisation, ciseaux pour un complément ajouté
          const Icon = photoServiceIds.map(String).includes(String(s.id)) ? Images : Scissors;
          return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/8 px-4 py-3"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground break-words">{s.name}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatDuration(s.duration)}
              </p>
            </div>
            <span className="text-sm font-bold text-primary whitespace-nowrap">{formatPrice(s.price)}</span>
            {/* Une prestation au moins : seules celles ajoutées en plus se retirent ici */}
            {selected.length > 1 && (
              <button
                type="button"
                onClick={() => { hapticFeedback(); onToggle(s); }}
                aria-label={`Retirer ${s.name}`}
                className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </motion.div>
          );
        })}
        <button type="button" onClick={onChangeServices}
          className="text-xs font-semibold text-primary underline underline-offset-2">
          Changer de prestation
        </button>
      </div>

      {/* Compléments : barbe, soin, formule moins chère */}
      <ServicePicker
        suggestionsOnly
        services={catalog}
        selectedIds={selected.map(s => String(s.id))}
        onToggle={onToggle}
        onSwap={onSwap}
      />

      {/* Produits de la boutique, remis par le barber pendant le rendez-vous */}
      {addonsEnabled && (
        <div className="empty:hidden">
          <ProductAddon services={selected} selection={addonSelection} onChange={onAddonChange} />
        </div>
      )}
    </div>
  );
}
