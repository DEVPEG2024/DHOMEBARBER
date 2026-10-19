import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, X, SearchX, Scissors, Sparkles, Plus, Gift } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import { useFavorites } from '@/lib/favorites';
import { usePopularServiceIds } from '@/lib/popularServices';
import LoadError from '@/components/shared/LoadError';
import { KindIcon } from './KindIcon';
import CategoryChips from './CategoryChips';
import ServiceRow from './ServiceRow';
import PopularServicesBlock from './PopularServicesBlock';
import ServiceSheet from './ServiceSheet';
import {
  EASE,
  RUBRICS,
  RUBRIC_BY_KEY,
  categoryKind,
  serviceKind,
  serviceRubric,
  normalizeText,
  isPlainBeard,
  isAdultCut,
  pickBeardAddon,
  cheapestService,
  findFormulaSwap,
  complementsFor,
  isNewService,
  matchesSearch,
  formatDuration,
  formatPrice,
} from './serviceUtils';

/** Marge sous la barre de chips collante pour qu'un en-tête de rubrique ciblé reste visible. */
const HEADING_SCROLL_MARGIN = 'calc(env(safe-area-inset-top, 0px) + 68px)';
/** Pendant un défilement programmé (tap sur une chip), le suivi du défilement se tait. */
const SCROLL_LOCK_MS = 900;
const MAX_SUGGESTIONS = 3;
/** Cartes du bloc « Les plus demandées » (grille 2 × 2) ; masqué en dessous de 2. */
const POPULAR_SHOWN = 4;
const FAVORITES_GROUP_ID = 'favoris';

/**
 * Catalogue des prestations, partagé par la page Prestations et l'étape 1 de la réservation :
 * recherche, « Les plus demandées » (classement du serveur, `usePopularServiceIds`), chips de
 * rubriques collantes avec suivi du défilement, « Mes favoris », puis une liste groupée par rubrique
 * (catégories du salon si elles existent, sinon rubriques automatiques `serviceRubric`) en lignes
 * compactes. Un tap sur une ligne ouvre la fiche de la prestation (`ServiceSheet`).
 *
 * Boutons : sélection vide → `pickLabel` (« Réserver », « Choisir ») → `onPick([prestation])` ;
 * dès que le client compose plusieurs prestations → bascule « Ajouter » / « Ajouté ✓ » (`onToggle`).
 * La fiche garde toujours son action principale (`onPick` avec les compléments cochés) et ajoute à
 * la sélection en un seul rendu (`onSwap([], […])`). Aucune barre fixe ici : l'appelant la gère.
 *
 * Rangée de suggestions, seulement quand la sélection n'est pas vide :
 * - une coupe sans barbe → « Ajoutez la barbe », et inversement ;
 * - coupe ou barbe sans soin → « Un soin en plus ? » ;
 * - coupe + barbe choisies séparément alors qu'une formule les réunit moins cher → « Passez à la
 *   formule », qui remplace les deux par la formule (économie affichée).
 *
 * @param {object} props
 * @param {Array} props.services            Prestations actives (déjà chargées par l'appelant)
 * @param {string[]|Set<string>} props.selectedIds
 * @param {(service: object) => void} props.onToggle
 * @param {(remove: object[], add: object[]) => void} [props.onSwap]  Retire et ajoute en un seul rendu ; sans lui, une à une
 * @param {(services: object[]) => void} [props.onPick]  Prendre exactement ces prestations et continuer ;
 *   sans lui, les boutons basculent la sélection (`onToggle`)
 * @param {string} [props.pickLabel]        Libellé de l'action principale (défaut « Réserver »)
 * @param {boolean} [props.loading]
 * @param {Error|null} [props.error]  Échec du chargement des prestations (sans données) : écran d'erreur
 * @param {() => void} [props.onRetry]  « Réessayer » de l'écran d'erreur
 * @param {boolean} [props.retrying]
 * @param {boolean} [props.suggestionsOnly]  Seulement la rangée de suggestions (réservation depuis
 *   une photo de la galerie : la prestation est déjà choisie, on propose ses compléments)
 */
export default function ServicePicker({
  services = [], selectedIds, onToggle, onSwap, onPick, pickLabel = 'Réserver',
  loading = false, error = null, onRetry, retrying = false, suggestionsOnly = false,
}) {
  const favorites = useFavorites();
  const toggleFavorite = useCallback((service) => favorites.toggle('services', service.id, service.name), [favorites]);
  const reduceMotion = useReducedMotion();
  const popularIds = usePopularServiceIds();
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState(null);
  const [sheetService, setSheetService] = useState(null);
  const headingRefs = useRef({});
  const barRef = useRef(null);
  const lockUntilRef = useRef(0);
  const nowMs = useMemo(() => Date.now(), []);

  // Catégories du salon : aucune en base aujourd'hui. Si le salon en crée, elles priment ; les
  // prestations sans catégorie gardent leur rubrique automatique.
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

  const byId = useMemo(() => new Map(services.map(s => [String(s.id), s])), [services]);
  const newIds = useMemo(
    () => new Set(services.filter(s => isNewService(s, nowMs)).map(s => String(s.id))),
    [services, nowMs],
  );
  const selectedSet = useMemo(
    () => new Set((selectedIds instanceof Set ? [...selectedIds] : (selectedIds || [])).map(String)),
    [selectedIds],
  );
  const selectedServices = useMemo(() => services.filter(s => selectedSet.has(String(s.id))), [services, selectedSet]);
  const hasSelection = selectedSet.size > 0;
  const mode = hasSelection || !onPick ? 'toggle' : 'pick';

  const categoryById = useMemo(() => new Map(categories.map(c => [String(c.id), c])), [categories]);
  const categoryOf = useCallback(
    (s) => (s?.category_id != null ? categoryById.get(String(s.category_id)) || null : null),
    [categoryById],
  );
  const kindOf = useCallback((s) => serviceKind(s, categoryOf(s)?.name || ''), [categoryOf]);
  // Icône d'une prestation (fiche) : celle de sa catégorie, sinon celle de sa rubrique automatique
  const iconKindOf = useCallback(
    (s) => (categoryOf(s) ? kindOf(s) : RUBRIC_BY_KEY[serviceRubric(s)]?.kind || 'cut'),
    [categoryOf, kindOf],
  );

  // « Les plus demandées » : les premières prestations actives du classement du serveur
  const popularServices = useMemo(
    () => popularIds.map(id => byId.get(id)).filter(Boolean).slice(0, POPULAR_SHOWN),
    [popularIds, byId],
  );
  const rankOf = useMemo(() => new Map(popularServices.map((s, i) => [String(s.id), i + 1])), [popularServices]);

  const favoriteServices = useMemo(
    () => [...favorites.services].map(id => byId.get(String(id))).filter(Boolean),
    [favorites.services, byId],
  );

  // Groupes : favoris (hors recherche), catégories du salon (dans leur ordre), puis rubriques
  // automatiques ; une rubrique qui porte le nom d'une catégorie la rejoint. Groupes vides retirés.
  const groups = useMemo(() => {
    const byCat = new Map();
    const byRubric = new Map();
    for (const s of services) {
      if (!matchesSearch(s, query)) continue;
      const cat = categoryOf(s);
      const key = cat ? String(cat.id) : serviceRubric(s);
      const target = cat ? byCat : byRubric;
      if (!target.has(key)) target.set(key, []);
      target.get(key).push(s);
    }
    const out = [];
    if (!query && favoriteServices.length > 0) {
      out.push({ id: FAVORITES_GROUP_ID, name: 'Mes favoris', kind: 'favorite', services: favoriteServices });
    }
    const byLabel = new Map();
    for (const c of categories) {
      const list = byCat.get(String(c.id));
      if (!list) continue;
      const group = { id: `cat-${c.id}`, name: c.name, kind: categoryKind(c.name), services: [...list] };
      byLabel.set(normalizeText(c.name), group);
      out.push(group);
    }
    for (const r of RUBRICS) {
      const list = byRubric.get(r.key);
      if (!list) continue;
      const same = byLabel.get(normalizeText(r.label));
      if (same) { same.services.push(...list); continue; }
      out.push({ id: `rub-${r.key}`, name: r.label, kind: r.kind, note: r.note, services: list });
    }
    return out;
  }, [services, categories, categoryOf, query, favoriteServices]);

  const resultCount = groups.reduce((n, g) => n + (g.id === FAVORITES_GROUP_ID ? 0 : g.services.length), 0);
  const chips = useMemo(() => groups.map(g => ({ id: g.id, label: g.name, count: g.services.length })), [groups]);
  const showChips = groups.length > 1 && !suggestionsOnly;
  const activeId = groups.some(g => g.id === activeCat) ? activeCat : groups[0]?.id;

  // ─── Suggestions (sélection non vide seulement) ───
  const suggestions = useMemo(() => {
    if (query || selectedServices.length === 0) return [];
    const out = [];
    const notSelected = services.filter(s => !selectedSet.has(String(s.id)));
    const kinds = new Set(selectedServices.map(kindOf));

    // Formule « coupe + barbe » qui réunit une coupe et une barbe choisies séparément, moins cher
    const swap = findFormulaSwap(selectedServices, notSelected);
    if (swap) {
      const { formula, remove, saving } = swap;
      out.push({ key: `formula-${formula.id}`, label: `Passez à « ${String(formula.name).trim()} »`, sub: `${formatPrice(formula.price)} · vous économisez ${formatPrice(saving)}`, icon: 'gift', add: [formula], remove, accent: true });
    }
    // Coupe / barbe d'après le nom, pas d'après l'icône : « Barbe à la tondeuse » a l'icône tondeuse
    // mais reste une barbe, et une prestation sans mot-clé (« Epilation nez ») retombe sur l'icône
    // coupe sans en être une. La coupe proposée est une coupe adulte (pas « moins de 6 ans »).
    const adultCut = (s) => isAdultCut(s, kindOf);
    const hasCut = selectedServices.some(adultCut);
    const hasBeard = selectedServices.some(isPlainBeard);
    if (hasCut && !hasBeard && !kinds.has('formula')) {
      const s = pickBeardAddon(notSelected);
      if (s) out.push({ key: `beard-${s.id}`, label: 'Ajoutez la barbe', sub: `${String(s.name).trim()} · +${formatPrice(s.price)} · +${formatDuration(s.duration)}`, icon: 'plus', add: [s], remove: [] });
    }
    if (hasBeard && !hasCut && !kinds.has('formula')) {
      const s = cheapestService(notSelected.filter(adultCut));
      if (s) out.push({ key: `cut-${s.id}`, label: 'Ajoutez la coupe', sub: `${String(s.name).trim()} · +${formatPrice(s.price)} · +${formatDuration(s.duration)}`, icon: 'plus', add: [s], remove: [] });
    }
    if ((hasCut || hasBeard || kinds.has('formula')) && !kinds.has('care')) {
      const s = cheapestService(notSelected.filter(x => kindOf(x) === 'care'));
      if (s) out.push({ key: `care-${s.id}`, label: 'Un soin en plus ?', sub: `${String(s.name).trim()} · +${formatPrice(s.price)} · +${formatDuration(s.duration)}`, icon: 'sparkles', add: [s], remove: [] });
    }
    return out.slice(0, MAX_SUGGESTIONS);
  }, [query, services, selectedServices, selectedSet, kindOf]);

  // ─── Actions ───
  const applySuggestion = (sug) => {
    hapticFeedback();
    if (onSwap) {
      onSwap(sug.remove, sug.add);
      return;
    }
    sug.remove.forEach(s => onToggle?.(s));
    sug.add.forEach(s => onToggle?.(s));
  };

  /** Ajoute plusieurs prestations en un seul rendu (fiche : prestation + compléments cochés). */
  const addMany = useCallback((list) => {
    const fresh = list.filter(s => s && !selectedSet.has(String(s.id)));
    if (fresh.length === 0) return;
    if (onSwap) onSwap([], fresh);
    else fresh.forEach(s => onToggle?.(s));
  }, [onSwap, onToggle, selectedSet]);

  const rowAction = useCallback((service) => {
    if (mode === 'pick') {
      hapticFeedback();
      onPick?.([service]);
      return;
    }
    onToggle?.(service);
  }, [mode, onPick, onToggle]);

  const openSheet = useCallback((service) => { hapticFeedback(); setSheetService(service); }, []);
  const closeSheet = useCallback(() => setSheetService(null), []);

  const sheetComplements = useMemo(
    () => (sheetService ? complementsFor(sheetService, services, { selected: selectedServices, kindOf }) : []),
    [sheetService, services, selectedServices, kindOf],
  );

  const selectChip = (id) => {
    hapticFeedback();
    setActiveCat(id);
    lockUntilRef.current = Date.now() + SCROLL_LOCK_MS;
    headingRefs.current[id]?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  // Suivi du défilement : la chip active suit la rubrique sous la barre (dernier en-tête passé
  // au-dessus du seuil) ; en bas de page, c'est la dernière rubrique ; tout en haut, la première.
  useEffect(() => {
    if (!showChips) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (Date.now() < lockUntilRef.current) return;
      const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 60;
      const threshold = barBottom + 12;
      let current = groups[0]?.id ?? null;
      for (const g of groups) {
        const el = headingRefs.current[g.id];
        if (!el) continue;
        if (el.getBoundingClientRect().top <= threshold) current = g.id;
        else break;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const lastHeading = groups.length > 0 ? headingRefs.current[groups[groups.length - 1].id] : null;
      if (atBottom && lastHeading && lastHeading.getBoundingClientRect().top < window.innerHeight) current = groups[groups.length - 1].id;
      setActiveCat(prev => (prev === current ? prev : current));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [groups, showChips]);

  // Prestations impossibles à charger : pas d'état vide (« Aucune prestation »), un écran d'erreur
  const loadFailed = !!error && !loading && services.length === 0;

  const SugIcon = ({ icon }) => {
    if (icon === 'gift') return <Gift className="w-3.5 h-3.5" aria-hidden="true" />;
    if (icon === 'sparkles') return <Sparkles className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />;
    return <Plus className="w-3.5 h-3.5 text-primary" aria-hidden="true" />;
  };

  const suggestionsBlock = (
    <AnimatePresence initial={false}>
      {suggestions.length > 0 && (
        <motion.div
          key="suggestions"
          initial={reduceMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="mb-4"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            {suggestionsOnly ? 'Pour compléter' : 'Suggestions pour vous'}
          </p>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
            <AnimatePresence initial={false}>
              {suggestions.map((sug) => (
                <motion.button
                  key={sug.key}
                  type="button"
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
  );

  if (suggestionsOnly) return suggestionsBlock;

  const showPopular = !query && !loading && !loadFailed && popularServices.length >= 2;

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
          placeholder="Coupe, barbe, couleur…"
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
      {suggestionsBlock}

      {/* Les plus demandées (classement du serveur, hors recherche) */}
      {showPopular && (
        <PopularServicesBlock
          services={popularServices}
          selectedIds={selectedSet}
          mode={mode}
          pickLabel={pickLabel}
          onOpen={openSheet}
          onAction={rowAction}
          reduceMotion={reduceMotion}
        />
      )}

      {showChips && !loading && !loadFailed && (
        <CategoryChips items={chips} activeId={activeId} onSelect={selectChip} reduceMotion={reduceMotion} barRef={barRef} />
      )}

      {query && !loading && (
        <p className="text-xs text-muted-foreground mt-4" aria-live="polite">
          {resultCount} résultat{resultCount > 1 ? 's' : ''} pour « {query.trim()} »
        </p>
      )}

      {loadFailed ? (
        <LoadError what="les prestations" error={error} onRetry={onRetry} retrying={retrying} className="mt-4" />
      ) : loading ? (
        <div className="mt-5 rounded-2xl border border-border bg-card/70 overflow-hidden divide-y divide-border" aria-busy="true" aria-label="Chargement des prestations">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-[60px] px-3.5 flex items-center gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 rounded bg-secondary animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-secondary/70 animate-pulse" />
              </div>
              <div className="h-9 w-20 rounded-full bg-secondary animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        groups.map(group => (
          <motion.section
            key={group.id}
            aria-labelledby={`pick-${group.id}`}
            className="mt-5"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <h2
              id={`pick-${group.id}`}
              ref={el => { headingRefs.current[group.id] = el; }}
              style={{ scrollMarginTop: HEADING_SCROLL_MARGIN }}
              className="flex items-center gap-2 mb-2.5"
            >
              <KindIcon kind={group.kind} size="sm" />
              <span className="font-display text-lg font-bold text-foreground leading-tight">{group.name}</span>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">{group.services.length}</span>
            </h2>
            {group.note && <p className="text-xs text-muted-foreground -mt-1 mb-2.5">{group.note}</p>}
            <ul className="rounded-2xl border border-border bg-card/70 overflow-hidden divide-y divide-border">
              {group.services.map(service => {
                const id = String(service.id);
                return (
                  <ServiceRow
                    key={`${group.id}-${id}`}
                    service={service}
                    selected={selectedSet.has(id)}
                    isNew={newIds.has(id)}
                    mode={mode}
                    pickLabel={pickLabel}
                    onOpen={openSheet}
                    onAction={rowAction}
                    reduceMotion={reduceMotion}
                  />
                );
              })}
            </ul>
          </motion.section>
        ))
      )}

      {!loading && !loadFailed && resultCount === 0 && (
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

      {/* Fiche d'une prestation (portail dans body) */}
      <AnimatePresence>
        {sheetService && (
          <ServiceSheet
            key={String(sheetService.id)}
            service={sheetService}
            kind={iconKindOf(sheetService)}
            rank={rankOf.get(String(sheetService.id)) || null}
            isNew={newIds.has(String(sheetService.id))}
            complements={sheetComplements}
            pickLabel={pickLabel}
            canPick={!!onPick}
            hasSelection={hasSelection}
            selected={selectedSet.has(String(sheetService.id))}
            favorite={favorites.services.has(String(sheetService.id))}
            onFavorite={toggleFavorite}
            onPick={(list) => { setSheetService(null); onPick?.(list); }}
            onAdd={(list) => { addMany(list); setSheetService(null); }}
            onRemove={(s) => { onToggle?.(s); setSheetService(null); }}
            onClose={closeSheet}
            reduceMotion={reduceMotion}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
