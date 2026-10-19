import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Scissors } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import ServicePicker from '@/components/services/ServicePicker';
import SelectionBar from '@/components/services/SelectionBar';
import { queryFailed } from '@/components/shared/LoadError';
import { EASE } from '@/components/services/serviceUtils';

/** Catalogue en pause hors connexion (React Query ne lève pas d'erreur) : écran « Pas de connexion ». */
const OFFLINE_ERROR = new Error('Network offline');

/**
 * Page Prestations : le même catalogue que l'étape 1 de la réservation (`ServicePicker` : recherche,
 * plus demandées, rubriques, fiche d'une prestation). « Réserver » sur une ligne ou dans la fiche
 * ouvre la réservation avec ces prestations (`/booking?services=<ids>`, qui saute au choix du
 * créneau). « Ajouter une autre prestation » compose une sélection, résumée par la barre du bas.
 */
export default function Services() {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState([]);   // ordre de sélection conservé

  const servicesQuery = useQuery({
    queryKey: ['services'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });
  const services = useMemo(() => servicesQuery.data || [], [servicesQuery.data]);
  const paused = servicesQuery.fetchStatus === 'paused';
  const failed = queryFailed(servicesQuery);

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

  // Retire et ajoute en un seul rendu (suggestion « Passez à la formule », fiche + compléments)
  const swapServices = useCallback((remove, add) => {
    const removeIds = new Set(remove.map(s => String(s.id)));
    setSelectedIds(prev => {
      const kept = prev.filter(id => !removeIds.has(id));
      const known = new Set(kept);
      return [...kept, ...add.map(s => String(s.id)).filter(id => !known.has(id))];
    });
  }, []);

  // Action principale : ces prestations exactement, la réservation s'ouvre sur le choix du créneau
  const pickServices = useCallback((list) => {
    const ids = list.map(s => s.id).filter(id => id != null);
    if (ids.length === 0) return;
    navigate(`/booking?services=${ids.join(',')}`);
  }, [navigate]);

  const clearSelection = () => { hapticFeedback(); setSelectedIds([]); };

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
          className="mb-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-lg bg-primary/15 flex items-center justify-center">
              <Scissors className="w-3 h-3 text-primary" aria-hidden="true" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold">Catalogue</p>
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">Nos prestations</h1>
          <p className="text-sm text-muted-foreground mt-1">Touchez « Réserver » : vous choisirez ensuite le barber et l&apos;heure.</p>
        </motion.div>

        <ServicePicker
          services={services}
          selectedIds={selectedIds}
          onToggle={toggleService}
          onSwap={swapServices}
          onPick={pickServices}
          pickLabel="Réserver"
          loading={servicesQuery.isPending && !paused}
          error={failed ? (servicesQuery.error || OFFLINE_ERROR) : null}
          onRetry={servicesQuery.refetch}
          retrying={servicesQuery.isFetching && !paused}
        />
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
