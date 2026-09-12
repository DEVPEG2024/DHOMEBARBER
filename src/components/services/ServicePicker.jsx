import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, X, SearchX, Scissors, Sparkles, Flame, Plus, Gift } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import ServiceItemCard, { KindIcon } from './ServiceItemCard';
import CategoryChips from './CategoryChips';
import FormulasBlock from './FormulasBlock';
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
  formatDuration,
  formatPrice,
  normalizeText,
} from './serviceUtils';

/** Marge sous la barre de chips collante pour qu'un en-tête de catégorie ciblé reste visible. */
const HEADING_SCROLL_MARGIN = 'calc(env(safe-area-inset-top, 0px) + 68px)';
/** Pendant un défilement programmé (tap sur une chip), le suivi du défilement se tait. */
const SCROLL_LOCK_MS = 900;
const MAX_SUGGESTIONS = 3;

const cheapest = (list) => [...list].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))[0] || null;

/**
 * Sélecteur de prestations partagé (étape 1 de la réservation) : mêmes cartes, chips et formules
 * que la page Prestations, plus une rangée de **suggestions** qui suit la sélection :
 * - rien de sélectionné → les prestations les plus demandées, en un tap ;
 * - une coupe sans barbe → « Ajoute la barbe » (la moins chère), et inversement ;
 * - coupe ou barbe sans soin → « Un soin en plus ? » ;
 * - coupe + barbe choisies séparément alors qu'une formule les réunit moins cher → « Passe à la
 *   formule », qui remplace les deux par la formule (économie affichée).
 * Tout est calculé côté client depuis le catalogue : rien à configurer.
 *
 * @param {object} props
 * @param {Array} props.services            Prestations actives (déjà chargées par l'appelant)
 * @param {string[]|Set<string>} props.selectedIds
 * @param {(service: object) => void} props.onToggle
 * @param {(remove: object[], add: object[]) => void} [props.onSwap]  Remplacement (formule) ; sans lui, on bascule une à une
 * @param {boolean} [props.loading]
 */
export default function ServicePicker({ services = [], selectedIds, onToggle, onSwap, loading = false }) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const headingRefs = useRef({});
  const barRef = useRef(null);
  const lockUntilRef = useRef(0);
  const nowMs = useMemo(() => Date.now(), []);

  const { data: categories = [] } = useQuery({
    queryKey: ['serviceCategories'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        return await api.entities.ServiceCategory.filter({ is_active: true }, 'sort_order', 50);
      } catch {
        return [];
      }
    },
  });

  // Prestations les plus réservées (voir Services.jsx : repli silencieux sur sort_order)
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

  const selectedSet = useMemo(
    () => new Set((selectedIds instanceof Set ? [...selectedIds] : (selectedIds || [])).map(String)),
    [selectedIds],
  );

  const categoryById = useMemo(() => new Map(categories.map(c => [String(c.id), c])), [categories]);
  const kindOf = useCallback(
    (s) => serviceKind(s, s?.category_id != null ? categoryById.get(String(s.category_id))?.name || '' : ''),
    [categoryById],
  );

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
    if (other.length > 0) out.push({ id: OTHER_GROUP_ID, name: categories.length > 0 ? 'Autres prestations' : 'Prestations', kind: 'cut', services: other });
    return out;
  }, [services, categories, categoryById, query]);

  const visibleCount = groups.reduce((n, g) => n + g.services.length, 0);
  const chips = useMemo(
    () => [{ id: 'all', label: 'Tout', count: visibleCount }, ...groups.map(g => ({ id: g.id, label: g.name, count: g.services.length }))],
    [groups, visibleCount],
  );
  const showChips = groups.length > 1;

  const formulas = useMemo(() => (query ? [] : services.filter(isFormula)), [services, query]);

  // ─── Suggestions ───
  const selectedServices = useMemo(() => services.filter(s => selectedSet.has(String(s.id))), [services, selectedSet]);
  const suggestions = useMemo(() => {
    if (query) return [];
    const out = [];
    const notSelected = services.filter(s => !selectedSet.has(String(s.id)));
    const kinds = new Set(selectedServices.map(kindOf));

    if (selectedServices.length === 0) {
      for (const s of services) {
        if (popularIds.has(String(s.id)) && out.length < MAX_SUGGESTIONS) {
          out.push({ key: `pop-${s.id}`, label: s.name, sub: `${formatPrice(s.price)} · ${formatDuration(s.duration)}`, icon: 'flame', add: [s], remove: [] });
        }
      }
      return out;
    }

    // Formule qui réunit une coupe et une barbe choisies séparément, moins cher
    const cut = selectedServices.find(s => kindOf(s) === 'cut');
    const beard = selectedServices.find(s => kindOf(s) === 'beard');
    if (cut && beard) {
      const both = notSelected.filter(f => isFormula(f) && /coupe|cheveux/.test(normalizeText(f.name)) && /barbe/.test(normalizeText(f.name)));
      const formula = cheapest(both);
      if (formula) {
        const separate = (Number(cut.price) || 0) + (Number(beard.price) || 0);
        const saving = separate - (Number(formula.price) || 0);
        if (saving > 0) {
          out.push({ key: `formula-${formula.id}`, label: `Passe à « ${formula.name} »`, sub: `${formatPrice(formula.price)} · tu économises ${formatPrice(saving)}`, icon: 'gift', add: [formula], remove: [cut, beard], accent: true });
        }
      }
    }
    if (kinds.has('cut') && !kinds.has('beard') && !kinds.has('formula')) {
      const s = cheapest(notSelected.filter(x => kindOf(x) === 'beard'));
      if (s) out.push({ key: `beard-${s.id}`, label: 'Ajoute la barbe', sub: `${s.name} · +${formatPrice(s.price)} · +${formatDuration(s.duration)}`, icon: 'plus', add: [s], remove: [] });
    }
    if (kinds.has('beard') && !kinds.has('cut') && !kinds.has('formula')) {
      const s = cheapest(notSelected.filter(x => kindOf(x) === 'cut'));
      if (s) out.push({ key: `cut-${s.id}`, label: 'Ajoute la coupe', sub: `${s.name} · +${formatPrice(s.price)} · +${formatDuration(s.duration)}`, icon: 'plus', add: [s], remove: [] });
    }
    if ((kinds.has('cut') || kinds.has('beard') || kinds.has('formula')) && !kinds.has('care')) {
      const s = cheapest(notSelected.filter(x => kindOf(x) === 'care'));
      if (s) out.push({ key: `care-${s.id}`, label: 'Un soin en plus ?', sub: `${s.name} · +${formatPrice(s.price)} · +${formatDuration(s.duration)}`, icon: 'sparkles', add: [s], remove: [] });
    }
    return out.slice(0, MAX_SUGGESTIONS);
  }, [query, services, selectedServices, selectedSet, kindOf, popularIds]);

  const applySuggestion = (sug) => {
    hapticFeedback();
    if (onSwap) {
      onSwap(sug.remove, sug.add);
      return;
    }
    sug.remove.forEach(s => onToggle(s));
    sug.add.forEach(s => onToggle(s));
  };

  const selectChip = (id) => {
    hapticFeedback();
    setActiveCat(id);
    lockUntilRef.current = Date.now() + SCROLL_LOCK_MS;
    const behavior = reduceMotion ? 'auto' : 'smooth';
    if (id === 'all') {
      const first = groups[0] && headingRefs.current[groups[0].id];
      if (first) first.scrollIntoView({ behavior, block: 'start' });
      return;
    }
    headingRefs.current[id]?.scrollIntoView({ behavior, block: 'start' });
  };

  // Suivi du défilement (voir Services.jsx)
  useEffect(() => {
    if (!showChips) return undefined;
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
      setActiveCat(prev => (prev === current ? prev : current));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [groups, showChips]);

  const SugIcon = ({ icon }) => {
    if (icon === 'flame') return <Flame className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />;
    if (icon === 'gift') return <Gift className="w-3.5 h-3.5" aria-hidden="true" />;
    if (icon === 'sparkles') return <Sparkles className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />;
    return <Plus className="w-3.5 h-3.5 text-primary" aria-hidden="true" />;
  };

  return (
    <div>
      {/* Recherche */}
      <div className="relative mb-4">
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
          <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Suggestions : suivent la sélection */}
      <AnimatePresence initial={false}>
        {suggestions.length > 0 && (
          <motion.div
            key="suggestions"
            layout
            initial={reduceMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="mb-4"
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              {selectedServices.length === 0 ? 'Les plus demandées' : 'Suggestions pour toi'}
            </p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
              <AnimatePresence initial={false}>
                {suggestions.map((sug) => (
                  <motion.button
                    key={sug.key}
                    type="button"
                    layout
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    onClick={() => applySuggestion(sug)}
                    className={`shrink-0 max-w-[260px] text-left rounded-2xl border px-3.5 py-2.5 min-h-[56px] flex items-center gap-2.5 ${
                      sug.accent ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${sug.accent ? 'bg-amber-500/20 text-amber-300' : 'bg-primary/10'}`}>
                      <SugIcon icon={sug.icon} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-foreground truncate">{sug.label}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">{sug.sub}</span>
                    </span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Formules en vitrine (hors recherche) */}
      <FormulasBlock
        formulas={formulas}
        selectedIds={selectedSet}
        popularIds={popularIds}
        newIds={newIds}
        onToggle={onToggle}
        reduceMotion={reduceMotion}
      />

      {showChips && (
        <CategoryChips items={chips} activeId={activeCat} onSelect={selectChip} reduceMotion={reduceMotion} barRef={barRef} />
      )}

      {query && !loading && (
        <p className="text-xs text-muted-foreground mt-4" aria-live="polite">
          {visibleCount} résultat{visibleCount > 1 ? 's' : ''} pour « {query.trim()} »
        </p>
      )}

      {loading ? (
        <div className="space-y-3 mt-4" aria-busy="true" aria-label="Chargement des prestations">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-[92px] rounded-2xl bg-secondary border border-border animate-pulse" />
          ))}
        </div>
      ) : (
        groups.map(group => (
          <section key={group.id} aria-labelledby={`pick-${group.id}`} className="mt-5">
            {showChips && (
              <h2
                id={`pick-${group.id}`}
                ref={el => { headingRefs.current[group.id] = el; }}
                style={{ scrollMarginTop: HEADING_SCROLL_MARGIN }}
                className="flex items-center gap-2 mb-3"
              >
                <KindIcon kind={group.kind} size="sm" />
                <span className="font-display text-lg font-bold text-foreground leading-tight">{group.name}</span>
                <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{group.services.length}</span>
              </h2>
            )}
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
                    onToggle={onToggle}
                    reduceMotion={reduceMotion}
                    index={i}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}

      {!loading && groups.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mx-auto mb-4">
            {query ? <SearchX className="w-6 h-6 text-muted-foreground/40" aria-hidden="true" /> : <Scissors className="w-6 h-6 text-muted-foreground/30" aria-hidden="true" />}
          </div>
          {query ? (
            <>
              <p className="text-sm text-muted-foreground">Rien ne correspond à « {query.trim()} ».</p>
              <button type="button" onClick={() => setQuery('')}
                className="mt-3 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10">
                Effacer la recherche
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune prestation pour le moment</p>
          )}
        </div>
      )}
    </div>
  );
}
