import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { api } from '@/api/apiClient';
import { hapticFeedback } from '@/lib/capacitor';
import { track } from '@/lib/analytics';
import { barberFirstName } from '@/lib/lastMinute';
import {
  GALLERY_PREVIEW, LOOK_FILTERS, activeServicesQuery, bookingLinkFor, galleryOf, lookFilterKeys,
  lookLinkFor, lookServices, lookTitle, lookTotals,
} from '@/lib/barberGallery';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { FeaturedLook, LookTile } from './LookCard';
import LookViewer from './LookViewer';
import { idsOf, sameIds } from './lookSelection';

/** Puce de filtre (« Tous 4 », « Coupes 2 »…). */
function FilterChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors ${active
        ? 'bg-primary border-primary text-primary-foreground'
        : 'bg-card border-border text-foreground/80 hover:text-foreground'}`}
    >
      {label} <span className={`tabular-nums ${active ? 'opacity-85' : 'text-muted-foreground'}`}>{count}</span>
    </button>
  );
}

/**
 * « Les looks de <prénom> » sur le profil public d'un barber (21 oct. 2026). Chaque photo des
 * réalisations porte un look de 1 à 5 prestations (`employees.gallery`, src/lib/barberGallery.js) :
 * filtres (Coupes, Barbe…) dès que deux sont présents, look vedette en grande carte (« Réserver ce
 * look » va droit aux créneaux), puis grille de vignettes 4:5. Un tap ouvre la visionneuse
 * (LookViewer) où le client ajuste le look avant de choisir son créneau. Rien sans photo.
 *
 * Adresse (contrat partagé avec la réservation) : la visionneuse ouverte = `/barber/<id>?look=<clé>`
 * (remplacée, pas empilée) ; `&services=a,b` y rouvre la sélection du client. Avant de partir
 * réserver, l'adresse du profil est remplacée par celle du look et de la sélection : le retour
 * depuis la réservation rouvre la visionneuse telle que le client l'a laissée. Une clé inconnue de
 * ce barber est retirée de l'adresse ; pendant un changement de barber (glissé), la section qui
 * s'en va ne réagit plus à l'adresse du suivant.
 *
 * Catalogue en échec ou hors connexion : photos et légendes restent, sans aucun prix, avec un
 * LoadError compact.
 */
export default function BarberGallery({ employee, delay = 0 }) {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const [params] = useSearchParams();
  const reduce = useReducedMotion();
  const headingId = useId();
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => galleryOf(employee), [employee]);
  const anyService = items.some((it) => it.service_ids.length > 0);
  // Catalogue actif (même clé que la réservation) : prix et durées toujours recalculés
  const servicesQuery = useQuery({ ...activeServicesQuery(api), enabled: anyService });
  const catalog = Array.isArray(servicesQuery.data) ? servicesQuery.data : null;
  const catalogFailed = anyService && !catalog && queryFailed(servicesQuery);
  const catalogPending = anyService && !catalog && !catalogFailed;

  const employeeId = employee?.id != null ? String(employee.id) : '';
  const firstName = barberFirstName(employee);

  const looks = useMemo(() => items.map((item) => {
    const services = catalog ? lookServices(item, catalog) : null;
    return {
      item,
      services,
      totals: services ? lookTotals(services) : null,
      filters: services ? lookFilterKeys(services) : [],
      title: lookTitle(item, services || []),
      // Look réservable (au moins une prestation) ; catalogue pas encore lu : d'après la photo
      hasLook: services ? services.length > 0 : item.service_ids.length > 0,
    };
  }), [items, catalog]);

  // Filtres présents (au moins deux différents pour afficher les puces)
  const filters = useMemo(() => LOOK_FILTERS
    .map((f) => ({ ...f, count: looks.filter((l) => l.filters.includes(f.key)).length }))
    .filter((f) => f.count > 0), [looks]);
  const showFilters = filters.length >= 2;
  const activeFilter = showFilters && filters.some((f) => f.key === filter) ? filter : 'all';
  const filtered = activeFilter === 'all' ? looks : looks.filter((l) => l.filters.includes(activeFilter));

  // Visionneuse : ouverte par l'adresse, seulement sur le profil de CE barber
  const mine = !!employeeId && String(routeId) === employeeId;
  const lookKey = mine ? params.get('look') : null;
  const servicesParam = mine ? params.get('services') : null;
  const current = lookKey ? looks.find((l) => l.item.key === lookKey) || null : null;
  // Barres de progression et suivant / précédent : les looks du filtre affiché (sinon tous)
  const viewerLooks = current && filtered.includes(current) ? filtered : looks;
  const viewerIndex = current ? viewerLooks.indexOf(current) : -1;

  const profilePath = lookLinkFor(employeeId);

  // Clé inconnue de ce barber (photo retirée, lien d'un autre barber) : rien ne s'ouvre
  useEffect(() => {
    if (mine && lookKey && !current) navigate(profilePath, { replace: true });
  }, [mine, lookKey, current, navigate, profilePath]);

  const openLook = (look) => {
    hapticFeedback();
    track('gallery_open', { barber_id: employeeId });
    navigate(lookLinkFor(employeeId, look.item.key), { replace: true });
  };

  const closeViewer = useCallback(() => {
    navigate(profilePath, { replace: true });
  }, [navigate, profilePath]);

  const showIndex = useCallback((i) => {
    const target = viewerLooks[i];
    if (target) navigate(lookLinkFor(employeeId, target.item.key), { replace: true });
  }, [viewerLooks, navigate, employeeId]);

  /**
   * Départ vers la réservation : l'adresse du profil devient celle du look et de la sélection
   * (le retour y rouvre la visionneuse), puis les créneaux de ce barber avec ces prestations.
   */
  const book = useCallback((look, selection, from) => {
    hapticFeedback();
    const ids = idsOf(selection);
    track('gallery_book', {
      barber_id: employeeId,
      with_service: ids.length > 0,
      services: ids.length,
      adjusted: !sameIds(ids, idsOf(look.services)),
      from,
    });
    navigate(lookLinkFor(employeeId, look.item.key, ids), { replace: true });
    navigate(bookingLinkFor(employee, ids, look.item), { state: { fromLook: true } });
  }, [employee, employeeId, navigate]);

  const bookFromViewer = useCallback((look, selection) => book(look, selection, 'viewer'), [book]);

  if (items.length === 0) return null;

  const featured = filtered.find((l) => l.hasLook) || null;
  const rest = filtered.filter((l) => l !== featured);
  const previewRest = Math.max(0, GALLERY_PREVIEW - (featured ? 1 : 0));
  const shownRest = expanded ? rest : rest.slice(0, previewRest);
  const hiddenCount = rest.length - shownRest.length;
  const pendingFor = (look) => catalogPending && look.item.service_ids.length > 0;

  const chooseFilter = (key) => {
    if (key === activeFilter) return;
    hapticFeedback();
    setFilter(key);
    setExpanded(false);
  };

  return (
    <motion.section
      aria-labelledby={headingId}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="mb-6"
    >
      <div className="mb-3.5">
        <h2 id={headingId} aria-label={`Les looks de ${firstName}`} className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Les looks de</span>
          <span className="font-fut text-4xl font-extrabold leading-none text-foreground">{firstName}</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {items.length} look{items.length > 1 ? 's' : ''} · touchez une photo pour l&apos;ajuster
        </p>
      </div>

      {showFilters && (
        <div role="group" aria-label="Filtrer les looks" className="flex flex-wrap gap-2 mb-3.5">
          <FilterChip label="Tous" count={looks.length} active={activeFilter === 'all'} onClick={() => chooseFilter('all')} />
          {filters.map((f) => (
            <FilterChip key={f.key} label={f.label} count={f.count} active={activeFilter === f.key} onClick={() => chooseFilter(f.key)} />
          ))}
        </div>
      )}

      {catalogFailed && (
        <LoadError compact className="mb-3.5" what="les prix des looks" error={servicesQuery.error}
          onRetry={servicesQuery.refetch} retrying={servicesQuery.isFetching} />
      )}

      <motion.div
        key={activeFilter}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="flex flex-col gap-2.5"
      >
        {featured && (
          <FeaturedLook
            look={featured}
            firstName={firstName}
            pending={pendingFor(featured)}
            onOpen={() => openLook(featured)}
            onBook={() => book(featured, featured.services || [], 'featured')}
          />
        )}
        {shownRest.length > 0 && (
          <ul aria-label={featured ? 'Autres looks' : 'Looks'} className="grid grid-cols-2 gap-2.5">
            {shownRest.map((look) => (
              <li key={look.item.key}>
                <LookTile look={look} firstName={firstName} pending={pendingFor(look)} onOpen={() => openLook(look)} />
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {hiddenCount > 0 && (
        <button type="button" onClick={() => { hapticFeedback(); setExpanded(true); }}
          className="w-full mt-3 h-11 rounded-2xl border border-border bg-card text-sm font-semibold text-foreground/85">
          Voir les {filtered.length} looks
        </button>
      )}

      <AnimatePresence>
        {current && viewerIndex >= 0 && (
          <LookViewer
            looks={viewerLooks}
            index={viewerIndex}
            firstName={firstName}
            photoUrl={employee?.photo_url || null}
            catalog={catalog}
            catalogQuery={{
              failed: catalogFailed,
              error: servicesQuery.error,
              refetch: servicesQuery.refetch,
              isFetching: servicesQuery.isFetching,
            }}
            servicesParam={servicesParam}
            onIndex={showIndex}
            onClose={closeViewer}
            onBook={bookFromViewer}
          />
        )}
      </AnimatePresence>
    </motion.section>
  );
}
