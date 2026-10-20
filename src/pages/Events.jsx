/**
 * Onglet Événements : invitations du salon (`SalonEventsSection`) et « Privatiser le salon »
 * (refonte du 19 oct. 2026, maquettes validées par le propriétaire) :
 * - en tête, les devis à accepter et les privatisations confirmées à venir ;
 * - accroche avec l'équipe, occasions (un tap ouvre la demande avec l'occasion choisie),
 *   étapes, formats, demandes en cours / passées, questions fréquentes ;
 * - barre « Demander un devis » fixée dès que le bouton de l'accroche est sorti par le haut ;
 * - demande de devis en plein écran (`RequestSheet`), qui garde son brouillon si on la ferme.
 * Lien `/events?demande=<occasion>` (evjg, anniversaire, team_building, autre) ou `?demande=1` :
 * ouvre directement la demande.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import SalonEventsSection from '@/components/salon-events/SalonEventsSection';
import PrivatisationHero from '@/components/privatisation/PrivatisationHero';
import OccasionGrid from '@/components/privatisation/OccasionGrid';
import { HowItWorks, FormatsRow, PrivatisationFaq } from '@/components/privatisation/PrivatisationInfo';
import StickyRequestBar from '@/components/privatisation/StickyRequestBar';
import RequestSheet from '@/components/privatisation/RequestSheet';
import QuoteCard from '@/components/privatisation/QuoteCard';
import ConfirmedTicket from '@/components/privatisation/ConfirmedTicket';
import MyRequests from '@/components/privatisation/MyRequests';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { useMyEvents, useParisClock } from '@/components/privatisation/usePrivatisation';
import { eventTypeOf, groupRequests, requestAnchorId } from '@/components/privatisation/privatisationUtils';

export default function Events() {
  const reduceMotion = useReducedMotion();
  const clock = useParisClock();
  const myEventsQuery = useMyEvents();
  const groups = useMemo(() => groupRequests(myEventsQuery.data, clock), [myEventsQuery.data, clock]);

  // Demande de devis : `openKey` change à chaque ouverture pour appliquer l'occasion choisie
  const [sheet, setSheet] = useState({ open: false, presetType: null, openKey: 0 });
  const openRequest = useCallback((presetType = null) => {
    setSheet(s => ({ open: true, presetType: eventTypeOf(presetType) ? presetType : null, openKey: s.openKey + 1 }));
  }, []);
  const closeRequest = useCallback(() => setSheet(s => ({ ...s, open: false })), []);

  // Lien profond `?demande=…` : ouvre la demande puis retire le paramètre (un retour arrière ne la rouvre pas)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const wanted = searchParams.get('demande');
    if (wanted == null) return;
    openRequest(wanted);
    const next = new URLSearchParams(searchParams);
    next.delete('demande');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, openRequest]);

  // Barre fixée : seulement quand le bouton de l'accroche est sorti de l'écran par le haut
  const ctaRef = useRef(null);
  const [ctaPassed, setCtaPassed] = useState(false);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setCtaPassed(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // « Voir ma demande » après l'envoi : la liste se recharge, on attend que la carte existe (3 s au
  // plus), puis défilement et focus sur elle ; sinon (pas d'identifiant, rechargement en échec) on
  // va au titre « Mes demandes » ou, à défaut, en haut de la page
  const scrollTimer = useRef(null);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  const viewRequest = useCallback((id) => {
    closeRequest();
    clearTimeout(scrollTimer.current);
    const behavior = reduceMotion ? 'auto' : 'smooth';
    const reveal = (el) => {
      el.scrollIntoView({ behavior, block: 'start' });
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    };
    let tries = 0;
    const tick = () => {
      const el = id != null ? document.getElementById(requestAnchorId(id)) : null;
      if (el) return reveal(el);
      tries += 1;
      if (id != null && tries < 20) {
        scrollTimer.current = setTimeout(tick, 150);
        return undefined;
      }
      const title = document.getElementById('my-requests-title');
      if (title) return reveal(title);
      window.scrollTo({ top: 0, behavior });
      return undefined;
    };
    scrollTimer.current = setTimeout(tick, 250);
  }, [closeRequest, reduceMotion]);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-28">
      {/* Demandes impossibles à charger : dit en haut de page (un client qui arrive par la
          notification « devis prêt » ne doit pas croire qu'il n'a rien) */}
      {queryFailed(myEventsQuery) && (
        <LoadError
          what="vos demandes de privatisation"
          error={myEventsQuery.error}
          onRetry={myEventsQuery.refetch}
          retrying={myEventsQuery.isFetching}
          compact
          className="mb-8"
        />
      )}

      {groups.spotlight.length > 0 && (
        <div className="space-y-8 mb-8">
          {groups.spotlight.map(({ event, view }) => (view.kind === 'confirmed'
            ? <ConfirmedTicket key={event.id} event={event} view={view} clock={clock} />
            : <QuoteCard key={event.id} event={event} view={view} />))}
        </div>
      )}

      {/* Événements organisés par le salon (invitations / ouverts à tous) : absent sans événement */}
      <SalonEventsSection />

      <div className="space-y-10">
        <PrivatisationHero onRequest={() => openRequest()} ctaRef={ctaRef} />
        <OccasionGrid onPick={openRequest} />
        <HowItWorks />
        <FormatsRow />
        <MyRequests query={myEventsQuery} groups={groups} showError={false} />
        <PrivatisationFaq />
      </div>

      <StickyRequestBar visible={ctaPassed && !sheet.open} onRequest={() => openRequest()} />
      <RequestSheet
        open={sheet.open}
        presetType={sheet.presetType}
        openKey={sheet.openKey}
        onClose={closeRequest}
        onViewRequest={viewRequest}
      />
    </div>
  );
}
