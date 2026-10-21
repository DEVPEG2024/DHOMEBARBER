import React, { useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, Plus, Search, X } from 'lucide-react';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { LOOK_MAX, lookTotals } from '@/lib/barberGallery';
import { RUBRIC_BY_KEY, RUBRICS, formatDuration, formatPrice, matchesSearch, serviceRubric } from '@/components/services/serviceUtils';
import LoadError from '@/components/shared/LoadError';
import { LookTotalsText } from './LookServicesField';

// Un tap à côté ne ferme jamais la fenêtre (règle du 9 sept. 2026) : la croix, « Terminé », Échap
// ou le retour d'Android seulement
const keepOpen = (event) => event.preventDefault();

/**
 * Choix des prestations d'un look, en panneau du bas : recherche (`matchesSearch`), catalogue actif
 * groupé par rubrique (`serviceRubric`), prix et durée ; une prestation du look est marquée
 * « Ajoutée » (un tap la retire), les autres s'ajoutent d'un tap. `LOOK_MAX` atteint : les autres
 * sont désactivées. La fenêtre reste ouverte entre deux ajouts ; chaque tap est enregistré tout de
 * suite par l'éditeur (`onToggle`).
 *
 * Fenêtre Radix (portail dans `body`) et non un portail maison : dans Équipe, l'éditeur est déjà
 * dans une fenêtre Radix, qui garde le focus, bloque le défilement et ferme sur Échap tout ce qui
 * n'est pas une de ses fenêtres filles (la recherche n'aurait pas pu recevoir la saisie).
 *
 * @param {object} props
 * @param {string} props.title              titre du look (ou « Photo 2 »)
 * @param {string[]} props.selectedIds      prestations du look, dans l'ordre
 * @param {object[]} props.catalog          prestations actives (ordre du catalogue)
 * @param {import('@tanstack/react-query').UseQueryResult} props.catalogQuery  pour l'état d'échec
 * @param {boolean} props.catalogFailed     catalogue impossible à charger (`queryFailed`)
 * @param {(service: object) => void} props.onToggle
 * @param {() => void} props.onClose
 */
export default function LookServicePicker({ title, selectedIds, catalog, catalogQuery, catalogFailed, onToggle, onClose }) {
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const contentRef = useRef(null);

  useAndroidBack(true, onClose);

  const chosen = useMemo(() => new Set(selectedIds), [selectedIds]);
  const full = selectedIds.length >= LOOK_MAX;
  const byId = useMemo(() => new Map(catalog.map((s) => [String(s.id), s])), [catalog]);
  const known = selectedIds.map((id) => byId.get(id)).filter(Boolean);

  // Résultats groupés par rubrique, dans l'ordre des rubriques puis du catalogue
  const groups = useMemo(() => {
    const byRubric = new Map();
    for (const s of catalog) {
      if (!matchesSearch(s, query)) continue;
      const key = serviceRubric(s);
      if (!byRubric.has(key)) byRubric.set(key, []);
      byRubric.get(key).push(s);
    }
    return RUBRICS.filter((r) => byRubric.has(r.key)).map((r) => ({ key: r.key, label: RUBRIC_BY_KEY[r.key].label, items: byRubric.get(r.key) }));
  }, [catalog, query]);

  // À l'ouverture : la recherche prend le focus avec une souris ; sur un écran tactile, le clavier
  // cacherait la moitié de la liste, le focus va à la fenêtre
  const focusOnOpen = (event) => {
    event.preventDefault();
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    (coarse ? contentRef.current : searchRef.current)?.focus({ preventScroll: true });
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        {/* Animations seulement sans « réduire les animations » (`motion-safe`) : `motion-reduce:animate-none`
            perdait contre `data-[state=open]:animate-in`, plus spécifique */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70 touch-none data-[state=open]:motion-safe:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={contentRef}
          tabIndex={-1}
          onPointerDownOutside={keepOpen}
          onInteractOutside={keepOpen}
          onOpenAutoFocus={focusOnOpen}
          className="kb-sheet-92 fixed inset-x-0 bottom-0 z-[60] mx-auto flex h-[min(80dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t border-border bg-card text-foreground shadow-2xl shadow-black/50 outline-none data-[state=open]:motion-safe:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-8"
        >
          {/* En-tête : poignée, titre, compteur, croix */}
          <div className="shrink-0 px-4 pt-2.5">
            <div className="mx-auto h-1 w-10 rounded-full bg-muted" aria-hidden="true" />
            <div className="mt-2.5 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="font-display text-lg font-bold leading-tight">Prestations du look</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground break-words">
                  {title} · {selectedIds.length}/{LOOK_MAX}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                aria-label="Fermer"
                className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/70 text-muted-foreground hover:text-foreground"
              >
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary/60">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value.slice(0, 60))}
                placeholder="Rechercher une prestation"
                aria-label="Rechercher une prestation"
                enterKeyHint="search"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />
            </label>
            {full && (
              <p role="status" className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/12 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                {LOOK_MAX} prestations au plus par look : touchez une prestation ajoutée pour la retirer.
              </p>
            )}
          </div>

          {/* Liste défilable */}
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
            {catalogFailed ? (
              <LoadError
                compact
                what="les prestations"
                error={catalogQuery?.error}
                onRetry={catalogQuery?.refetch}
                retrying={catalogQuery?.isFetching}
                className="mt-2"
              />
            ) : groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground break-words">
                {query.trim() ? `Aucune prestation ne correspond à « ${query.trim()} ».` : 'Aucune prestation au catalogue.'}
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.key} aria-label={group.label} className="mt-2 first:mt-0">
                  <h3 className="sticky top-0 z-10 bg-card py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {group.label}
                  </h3>
                  <ul className="space-y-1.5">
                    {group.items.map((s) => {
                      const on = chosen.has(String(s.id));
                      const locked = !on && full;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            aria-pressed={on}
                            disabled={locked}
                            onClick={() => onToggle(s)}
                            className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                              on ? 'border-primary/50 bg-primary/10' : 'border-border bg-secondary/40 hover:border-primary/30'
                            }`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold leading-snug text-foreground break-words">{String(s.name || '').trim()}</span>
                              <span className="block text-xs text-muted-foreground tabular-nums">{formatPrice(s.price)} · {formatDuration(s.duration)}</span>
                            </span>
                            {on ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                                Ajoutée
                              </span>
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                                <Plus className="h-4 w-4" strokeWidth={2.5} />
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>

          {/* Pied : total du look et « Terminé », toujours visibles */}
          <div className="shrink-0 border-t border-border/60 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.875rem)]">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {known.length > 0
                  ? <LookTotalsText totals={lookTotals(known)} className="text-[13px] font-semibold text-foreground" />
                  : 'Aucune prestation dans ce look'}
              </p>
              <DialogPrimitive.Close className="h-11 shrink-0 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                Terminé
              </DialogPrimitive.Close>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
