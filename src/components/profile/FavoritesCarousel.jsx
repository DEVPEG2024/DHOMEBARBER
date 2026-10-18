import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Heart, Scissors } from 'lucide-react';
import { api } from '@/api/apiClient';
import { useFavorites } from '@/lib/favorites';
import { activeServicesQuery } from '@/lib/barberGallery';
import { formatPrice } from '@/components/services/serviceUtils';
import SnapCarousel from '@/components/motion/SnapCarousel';
import TiltCard from '@/components/motion/TiltCard';

/**
 * « Mes favoris » du tableau de bord : les prestations mises en favori, en carrousel, chacune
 * avec « Réserver ». Rien sans favori ni si le catalogue n'a pas pu être chargé.
 */
export default function FavoritesCarousel() {
  const { services: favIds } = useFavorites();
  const { data: services = [] } = useQuery(activeServicesQuery(api));
  const favorites = services.filter((s) => favIds.has(String(s.id)));
  if (favorites.length === 0) return null;

  return (
    <section>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-semibold">Tes favoris</p>
          <h2 className="font-display text-lg font-bold text-foreground">On remet ça ?</h2>
        </div>
        <Link to="/favorites" className="text-xs font-semibold text-primary">Tout voir</Link>
      </div>
      <SnapCarousel itemWidth="62%" label="Prestations favorites" dots={favorites.length > 2}>
        {favorites.map((s, i) => (
          <TiltCard key={s.id} max={6} className="rounded-2xl">
            <div className={`shine-sweep shine-delay-${i % 3} h-full rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-4 flex flex-col`}>
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Scissors className="w-4 h-4 text-primary" />
                </div>
                <Heart className="w-4 h-4 text-red-400 fill-red-400" />
              </div>
              <p className="text-sm font-semibold text-foreground mt-3 line-clamp-2">{s.name}</p>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {s.duration} min
              </p>
              <div className="flex items-center justify-between mt-auto pt-3">
                <span className="text-base font-bold text-primary">{formatPrice(s.price)}</span>
                <Link to={`/booking?services=${encodeURIComponent(s.id)}`}
                  className="px-3 h-8 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold flex items-center">
                  Réserver
                </Link>
              </div>
            </div>
          </TiltCard>
        ))}
      </SnapCarousel>
    </section>
  );
}
