import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Scissors, Search, X, SearchX } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import ServiceItemCard, { KindIcon } from '@/components/services/ServiceItemCard';
import CategoryChips from '@/components/services/CategoryChips';
import SelectionBar from '@/components/services/SelectionBar';
import FormulasBlock from '@/components/services/FormulasBlock';
import {
  EASE,
  OTHER_GROUP_ID,
  categoryKind,
  serviceKind,
  isFormula,
  isNewService,
  matchesSearch,
  computePopularIds,
  fallbackPopularIds,
} from '@/components/services/serviceUtils';

/** Marge sous la barre de chips collante pour qu'un en-tête de catégorie ciblé reste visible. */
const HEADING_SCROLL_MARGIN = 'calc(env(safe-area-inset-top, 0px) + 68px)';
/** Pendant un défilement programmé (tap sur une chip), le suivi du défilement se tait. */
const SCROLL_LOCK_MS = 900;

/**
 * Page Prestations : recherche, formules en vitrine, chips de catégories collantes qui font
 * défiler jusqu'à la catégorie, cartes avec badges, sélection multiple et barre de résumé
 * vers la réservation pré-remplie (`/booking?services=<ids>`).
 */
export default function Services() {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);   // ordre de sélection conservé
  const [activeCat, setActiveCat] = useState('all');
  const headingRefs = useRef({});
  const barRef = useRef(null);
  const lockUntilRef = useRef(0);
  const nowMs = useMemo(() => Date.now(), []);

  const { data: categories = [] } = useQuery({
    queryKey: ['serviceCategories'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: async () => {
      try {
        return await api.entities.ServiceCategory.filter({ is_active: true }, 'sort_order', 50);
      } catch {
        return [];
      }
    },
  });

  const { data: services = [], isPending: servicesPending } = useQuery({
    queryKey: ['services'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });

  // Prestations les plus réservées : rendez-vous terminés. Un client ne reçoit que les créneaux
  // des autres (sans `services`), l'échantillon est alors trop mince et le badge retombe sur
  // `sort_order`. Toute erreur (403, réseau) donne une liste vide : la page ne bloque jamais.
  const { data: completedApts, isPending: popularPending } = useQuery({
    queryKey: ['popularServices'],
    enabled: services.length > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await api.entities.Appointment.filter({ status: 'completed' }, '-date', 200);
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },
  });

  const popularIds = useMemo(() => {
    if (popularPending || services.length === 0) return new Set();
    const computed = computePopularIds(completedApts, services);
    return new Set(computed || fallbackPopularIds(services));
  }, [completedApts, popularPending, services]);

  const newIds = useMemo(
    () => new Set(services.filter(s => isNewService(s, nowMs)).map(s => String(s.id))),
    [services, nowMs],
  );

  const categoryById = useMemo(() => new Map(categories.map(c => [String(c.id), c])), [categories]);

  // Groupes par catégorie (ordre des catégories), filtrés par la recherche ; les prestations sans
  // catégorie active vont dans « Autres prestations ». Les groupes vides disparaissent.
  const groups = useMemo(() => {
    const byCat = new Map();
    const other = [];
    for (const s of services) {
      if (!matchesSearch(s, query)) continue;
      const cat = s.category_id != null ? categoryById.get(String(s.category_id)) : null;
      if (cat) {
        const key = String(cat.id);
        if (!byCat.has(key)) byCat.set(key, []);
        byCat.get(key).push(s);
      } else {
        other.push(s);
      }
    }
    const out = categories
      .filter(c => byCat.has(String(c.id)))
      .map(c => ({ id: String(c.id), name: c.name, kind: categoryKind(c.name), services: byCat.get(String(c.id)) }));
    if (other.length > 0) out.push({ id: OTHER_GROUP_ID, name: 'Autres prestations', kind: 'cut', services: other });
    return out;
  }, [services, categories, categoryById, query]);

  const visibleCount = groups.reduce((n, g) => n + g.services.length, 0);
  const chips = useMemo(
    () => [{ id: 'all', label: 'Tout', count: visibleCount }, ...groups.map(g => ({ id: g.id, label: g.name, count: g.services.length }))],
    [groups, visibleCount],
  );

  const formulas = useMemo(() => (query ? [] : services.filter(isFormula)), [services, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedServices = useMemo(
    () => selectedIds.map(id => services.find(s => String(s.id) === id)).filter(Boolean),
    [selectedIds, services],
  );
  const totalPrice = selectedServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);

  const toggleService = useCallback((service) => {
    hapticFeedback();
    const id = String(service.id);
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);

  const clearSelection = () => { hapticFeedback(); setSelectedIds([]); };

  // Tap sur une chip : défilement doux vers l'en-tête de la catégorie (« Tout » = haut de page)
  const selectChip = (id) => {
    hapticFeedback();
    setActiveCat(id);
    lockUntilRef.current = Date.now() + SCROLL_LOCK_MS;
    const behavior = reduceMotion ? 'auto' : 'smooth';
    if (id === 'all') { window.scrollTo({ top: 0, behavior }); return; }
    headingRefs.current[id]?.scrollIntoView({ behavior, block: 'start' });
  };

  // Suivi du défilement : la chip active suit la catégorie sous la barre (dernier en-tête passé
  // au-dessus du seuil) ; en bas de page, c'est la dernière catégorie ; tout en haut, « Tout ».
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      if (Date.now() < lockUntilRef.current) return;
      const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 60;
      const threshold = barBottom + 12;
      let current = 'all';
      for (const g of groups) {
        const el = headingRefs.current[g.id];
        if (!el) continue;
        if (el.getBoundingClientRect().top <= threshold) current = g.id;
        else break;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom && groups.length > 0) current = groups[groups.length - 1].id;
      setActiveCat(prev => (prev === current ? prev : current));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [groups]);

  return (
    <div className="min-h-screen relative">
      {/* Halos d'ambiance */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-32 -left-20 w-64 h-64 bg-accent/6 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-44">
        {/* En-tête */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="mb-5"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-lg bg-primary/15 flex items-center justify-center">
              <Scissors className="w-3 h-3 text-primary" aria-hidden="true" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold">Catalogue</p>
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">Nos Prestations</h1>
          <p className="text-sm text-muted-foreground mt-1">Choisis, combine, on calcule le total. Réserve ensuite en un tap.</p>
          <div className="h-0.5 w-12 mt-3 rounded-full bg-gradient-to-r from-primary to-primary/30" />
        </motion.div>

        {/* Recherche */}
        <div className="relative mb-5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une prestation…"
            aria-label="Rechercher une prestation"
            className="w-full h-12 rounded-2xl bg-card border border-border pl-11 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Effacer la recherche"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Formules en vitrine (hors recherche) */}
        <FormulasBlock
          formulas={formulas}
          selectedIds={selectedSet}
          popularIds={popularIds}
          newIds={newIds}
          onToggle={toggleService}
          reduceMotion={reduceMotion}
        />

        {/* Chips collantes */}
        <CategoryChips items={chips} activeId={activeCat} onSelect={selectChip} reduceMotion={reduceMotion} barRef={barRef} />

        {query && !servicesPending && (
          <p className="text-xs text-muted-foreground mt-4" aria-live="polite">
            {visibleCount} résultat{visibleCount > 1 ? 's' : ''} pour « {query.trim()} »
          </p>
        )}

        {/* Liste par catégorie */}
        {servicesPending ? (
          <div className="space-y-3 mt-6" aria-busy="true" aria-label="Chargement des prestations">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-[92px] rounded-2xl bg-secondary border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          groups.map(group => (
            <section key={group.id} aria-labelledby={`cat-${group.id}`} className="mt-6">
              <h2
                id={`cat-${group.id}`}
                ref={el => { headingRefs.current[group.id] = el; }}
                style={{ scrollMarginTop: HEADING_SCROLL_MARGIN }}
                className="flex items-center gap-2 mb-3"
              >
                <KindIcon kind={group.kind} size="sm" />
                <span className="font-display text-lg font-bold text-foreground leading-tight">{group.name}</span>
                <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{group.services.length}</span>
              </h2>
              <div className="space-y-3">
                {group.services.map((service, i) => {
                  const id = String(service.id);
                  return (
                    <ServiceItemCard
                      key={id}
                      service={service}
                      kind={serviceKind(service, group.id === OTHER_GROUP_ID ? '' : group.name)}
                      selected={selectedSet.has(id)}
                      popular={popularIds.has(id)}
                      isNew={newIds.has(id)}
                      onToggle={toggleService}
                      reduceMotion={reduceMotion}
                      index={i}
                    />
                  );
                })}
              </div>
            </section>
          ))
        )}

        {!servicesPending && groups.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mx-auto mb-4">
              {query ? <SearchX className="w-6 h-6 text-muted-foreground/40" aria-hidden="true" /> : <Scissors className="w-6 h-6 text-muted-foreground/30" aria-hidden="true" />}
            </div>
            {query ? (
              <>
                <p className="text-sm text-muted-foreground">Rien ne correspond à « {query.trim()} ».</p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-3 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10"
                >
                  Effacer la recherche
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune prestation pour le moment</p>
            )}
          </div>
        )}
      </div>

      {/* Barre de résumé de la sélection */}
      <AnimatePresence>
        {selectedServices.length > 0 && (
          <SelectionBar
            key="selection"
            count={selectedServices.length}
            totalDuration={totalDuration}
            totalPrice={totalPrice}
            ids={selectedServices.map(s => s.id)}
            onClear={clearSelection}
            reduceMotion={reduceMotion}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
