import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart, Scissors, ShoppingBag, ChevronRight, Clock } from 'lucide-react';
import { api } from '@/api/apiClient';
import { useFavorites } from '@/lib/favorites';
import FavoriteButton from '@/components/shared/FavoriteButton';
import { formatDuration, formatPrice } from '@/components/services/serviceUtils';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { isShopProduct, stockInfo } from '@/components/shop/productUtils';

/**
 * « Mes favoris » (/favorites) : les prestations et produits marqués d'un cœur. Une prestation
 * se réserve directement (réservation pré-remplie), un produit ouvre sa fiche dans la boutique
 * (`/shop?product=<id>`). Mêmes requêtes et mêmes caches que les pages Prestations et Boutique.
 */
export default function Favorites() {
  const reduceMotion = useReducedMotion();
  const favorites = useFavorites();

  const servicesQuery = useQuery({
    queryKey: ['services'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });
  const productsQuery = useQuery({
    queryKey: ['products'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.entities.Product.filter({ is_active: true }, 'name', 100),
  });
  const { data: services = [] } = servicesQuery;
  // Consommables du salon (onglet « Prestations » du stock) : jamais en vente, donc jamais en favori
  const products = (productsQuery.data || []).filter(isShopProduct);

  const byService = new Map(services.map(s => [String(s.id), s]));
  const byProduct = new Map(products.map(p => [String(p.id), p]));
  // Ordre d'ajout ; une prestation ou un produit retiré du catalogue n'apparaît plus
  const favServices = [...favorites.services].map(id => byService.get(id)).filter(Boolean);
  const favProducts = [...favorites.products].map(id => byProduct.get(id)).filter(Boolean);
  // Seuls comptent les catalogues dont on a des favoris : sans aucun favori, rien à attendre du
  // réseau et l'état vide s'affiche tout de suite
  const neededQueries = [
    favorites.services.size > 0 && servicesQuery,
    favorites.products.size > 0 && productsQuery,
  ].filter(Boolean);
  // Un catalogue n'a pas pu se charger (et rien en cache), ou sa requête est en pause hors
  // connexion : erreur plutôt qu'un faux « Aucun favori » ou un squelette sans fin
  const failedQuery = neededQueries.find(queryFailed);
  const failed = !!failedQuery;
  const loading = !failed && neededQueries.some(q => q.isPending);
  const retry = () => {
    if (queryFailed(servicesQuery) || servicesQuery.isError) servicesQuery.refetch();
    if (queryFailed(productsQuery) || productsQuery.isError) productsQuery.refetch();
  };
  const empty = !loading && !failed && favServices.length === 0 && favProducts.length === 0;
  const allServicesHref = `/booking?services=${favServices.map(s => encodeURIComponent(String(s.id))).join(',')}`;

  return (
    <div className="min-h-screen relative">
      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold mb-1">Mon compte</p>
          <h1 className="font-display text-3xl font-bold text-foreground">Mes favoris</h1>
          <div className="h-0.5 w-12 mt-2 rounded-full bg-gradient-to-r from-primary to-primary/30" />
        </motion.div>

        {loading && (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
          </div>
        )}

        {failed && (
          <LoadError
            what="vos favoris"
            error={failedQuery.error}
            onRetry={retry}
            retrying={servicesQuery.isFetching || productsQuery.isFetching}
          />
        )}

        {empty && (
          <div className="text-center py-14">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
              <Heart className="w-7 h-7 text-rose-500" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-foreground">Aucun favori pour l’instant</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Touchez le cœur d’une prestation ou d’un produit pour le retrouver ici.
            </p>
            <div className="flex justify-center gap-2 mt-5">
              <Link to="/services" className="px-4 h-11 inline-flex items-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Prestations</Link>
              <Link to="/shop" className="px-4 h-11 inline-flex items-center rounded-xl bg-secondary text-foreground text-sm font-semibold">Boutique</Link>
            </div>
          </div>
        )}

        {!loading && !failed && favServices.length > 0 && (
          <section className="mb-8" aria-labelledby="fav-s">
            <div className="flex items-center justify-between mb-3">
              <h2 id="fav-s" className="flex items-center gap-2 font-display text-lg font-bold">
                <Scissors className="w-4 h-4 text-primary" aria-hidden="true" /> Prestations
              </h2>
              {favServices.length > 1 && (
                <Link to={allServicesHref} className="text-xs font-semibold text-primary">Tout réserver</Link>
              )}
            </div>
            <div className="space-y-2">
              {favServices.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-3 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                      <Clock className="w-3 h-3" aria-hidden="true" /> {formatDuration(s.duration)} · <span className="font-semibold text-primary">{formatPrice(s.price)}</span>
                    </p>
                  </div>
                  <FavoriteButton active onToggle={() => favorites.toggle('services', s.id)} />
                  <Link
                    to={`/booking?services=${encodeURIComponent(String(s.id))}`}
                    className="h-10 px-3 inline-flex items-center rounded-xl bg-primary text-primary-foreground text-xs font-bold shrink-0"
                  >
                    Réserver
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && !failed && favProducts.length > 0 && (
          <section aria-labelledby="fav-p">
            <div className="flex items-center justify-between mb-3">
              <h2 id="fav-p" className="flex items-center gap-2 font-display text-lg font-bold">
                <ShoppingBag className="w-4 h-4 text-primary" aria-hidden="true" /> Produits
              </h2>
              <Link to="/shop?filter=favorites" className="text-xs font-semibold text-primary">Voir dans la boutique</Link>
            </div>
            <div className="space-y-2">
              {favProducts.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-2.5 min-w-0">
                  <div className="w-14 h-14 rounded-xl bg-white overflow-hidden shrink-0 flex items-center justify-center">
                    {p.image_url
                      ? <img src={p.image_url} alt="" className="w-full h-full object-contain" />
                      : <ShoppingBag className="w-5 h-5 text-muted-foreground/40" aria-hidden="true" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                    <p className="text-[11px] mt-0.5">
                      <span className="font-semibold text-primary">{formatPrice(p.price)}</span>
                      {stockInfo(p).soldOut && <span className="text-red-400"> · Rupture</span>}
                    </p>
                  </div>
                  <FavoriteButton active onToggle={() => favorites.toggle('products', p.id)} />
                  <Link to={`/shop?product=${encodeURIComponent(String(p.id))}`} aria-label={`Voir ${p.name} dans la boutique`} className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-secondary shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
