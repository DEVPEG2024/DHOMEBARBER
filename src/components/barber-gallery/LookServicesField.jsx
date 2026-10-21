import React from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { LOOK_MAX, lookTotals } from '@/lib/barberGallery';
import { formatDuration, formatPrice } from '@/components/services/serviceUtils';

/**
 * Total d'un look en une ligne : « 3 prestations · 1 h 50 · 85 € » (`lookTotals`). Le prix est mis
 * en avant, mais le texte reste d'un seul tenant (lu tel quel par les lecteurs d'écran et les tests).
 */
export function LookTotalsText({ totals, className = '' }) {
  const { count, price, duration } = totals;
  return (
    <span className={`tabular-nums ${className}`}>
      {count} {count > 1 ? 'prestations' : 'prestation'} · {formatDuration(duration)} · <span className="font-bold text-primary">{formatPrice(price)}</span>
    </span>
  );
}

/**
 * « Prestations du look » sous une photo de l'éditeur : puces dans l'ordre du barber (nom, prix,
 * croix pour retirer), « Ajouter » qui ouvre la fenêtre de recherche, total calculé depuis le
 * catalogue (`lookTotals`), ou un texte d'aide quand la photo n'en porte aucune.
 *
 * Une prestation retirée du catalogue reste dans le look tant que le barber ne l'enlève pas : puce
 * « Prestation retirée » atténuée, avec sa croix (le client ne la voit plus). Catalogue en
 * chargement : puces vides qui pulsent ; en échec : puces sans nom ni prix (« Prestation 1 »…),
 * « Ajouter » désactivé (l'éditeur affiche le message d'échec une seule fois, au-dessus des photos).
 *
 * @param {object} props
 * @param {string[]} props.ids           prestations de la photo, dans l'ordre (`service_ids`)
 * @param {Map<string, object>} props.byId  catalogue actif par identifiant
 * @param {'ready'|'loading'|'failed'} props.catalog  état du catalogue
 * @param {boolean} props.disabled       envoi de photos en cours
 * @param {(id: string, label: string) => void} props.onRemove
 * @param {() => void} props.onOpenPicker
 */
export default function LookServicesField({ ids, byId, catalog, disabled = false, onRemove, onOpenPicker }) {
  const ready = catalog === 'ready';
  const known = ready ? ids.map((id) => byId.get(id)).filter(Boolean) : [];
  const hasRetired = ready && known.length < ids.length;
  const full = ids.length >= LOOK_MAX;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Prestations du look</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{ids.length}/{LOOK_MAX}</span>
      </div>

      <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Prestations du look">
        {ids.map((id, n) => {
          if (catalog === 'loading') {
            return (
              <li key={id} aria-hidden="true">
                <span className="block h-[34px] w-24 rounded-full bg-secondary animate-pulse" />
              </li>
            );
          }
          const service = ready ? byId.get(id) : null;
          const retired = ready && !service;
          const label = service ? String(service.name || '').trim() || 'Prestation' : retired ? 'Prestation retirée' : `Prestation ${n + 1}`;
          const removeLabel = service ? `Retirer ${label} du look` : retired ? 'Retirer la prestation retirée du catalogue' : `Retirer la prestation ${n + 1} du look`;
          return (
            <li key={id} className="min-w-0 max-w-full">
              <span
                className={`inline-flex max-w-full items-center gap-1.5 h-[34px] pl-3 pr-0.5 rounded-full border text-[13px] font-semibold ${
                  service
                    ? 'border-primary/40 bg-primary/12 text-foreground'
                    : 'border-dashed border-border bg-secondary/50 text-muted-foreground'
                } ${retired ? 'opacity-70' : ''}`}
                title={retired ? "Cette prestation n'est plus au catalogue : le client ne la voit plus" : undefined}
              >
                <span className={`min-w-0 truncate ${retired ? 'line-through decoration-muted-foreground/50' : ''}`}>{label}</span>
                {service && (
                  <span className="shrink-0 text-[12px] font-medium text-primary tabular-nums">{formatPrice(service.price)}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(id, service ? label : '')}
                  disabled={disabled}
                  aria-label={removeLabel}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 disabled:opacity-40 transition-colors"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2.4} aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onOpenPicker}
            disabled={disabled || !ready}
            aria-label={full ? 'Modifier les prestations du look' : 'Ajouter une prestation au look'}
            className="inline-flex items-center gap-1 h-[34px] px-3 rounded-full border border-dashed border-muted-foreground/50 text-[13px] font-semibold text-foreground hover:border-primary/60 hover:text-primary disabled:opacity-40 disabled:hover:border-muted-foreground/50 disabled:hover:text-foreground transition-colors"
          >
            {full
              ? <><Pencil className="w-3.5 h-3.5" aria-hidden="true" />Modifier</>
              : <><Plus className="w-3.5 h-3.5" strokeWidth={2.4} aria-hidden="true" />Ajouter</>}
          </button>
        </li>
      </ul>

      {ids.length === 0 ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Ajoutez les prestations visibles sur la photo : le client pourra réserver ce look en un geste.
        </p>
      ) : known.length > 0 ? (
        <p className="mt-2.5 pt-2 border-t border-border flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-[11px] text-muted-foreground">Total du look</span>
          <LookTotalsText totals={lookTotals(known)} className="text-[13px] font-semibold text-foreground" />
        </p>
      ) : null}
      {hasRetired && (
        <p className="mt-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
          Une prestation n&apos;est plus au catalogue : le client ne la voit plus, retirez-la du look.
        </p>
      )}
    </div>
  );
}
