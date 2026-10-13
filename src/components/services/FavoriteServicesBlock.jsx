import React from 'react';
import { Heart } from 'lucide-react';
import ServiceItemCard from './ServiceItemCard';
import { serviceKind } from './serviceUtils';

/**
 * « Mes favoris » en tête des prestations (page Prestations et choix des prestations de la
 * réservation) : les prestations marquées d'un cœur, dans l'ordre où elles ont été ajoutées,
 * sélectionnables comme dans la liste. Rien sans favori ni pendant une recherche.
 */
export default function FavoriteServicesBlock({ services, favoriteIds, selectedIds, popularIds, newIds, onToggle, onFavorite, reduceMotion = false }) {
  const byId = new Map(services.map(s => [String(s.id), s]));
  const favorites = [...favoriteIds].map(id => byId.get(id)).filter(Boolean);
  if (favorites.length === 0) return null;
  return (
    <section aria-labelledby="fav-services" className="mb-6">
      <h2 id="fav-services" className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
          <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" aria-hidden="true" />
        </span>
        <span className="font-display text-lg font-bold text-foreground leading-tight">Mes favoris</span>
        <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{favorites.length}</span>
      </h2>
      <div className="space-y-3">
        {favorites.map((service, i) => {
          const id = String(service.id);
          return (
            <ServiceItemCard
              key={`fav-${id}`}
              service={service}
              kind={serviceKind(service, '')}
              selected={selectedIds.has(id)}
              popular={popularIds.has(id)}
              isNew={newIds.has(id)}
              onToggle={onToggle}
              favorite
              onFavorite={onFavorite}
              reduceMotion={reduceMotion}
              index={i}
            />
          );
        })}
      </div>
    </section>
  );
}
