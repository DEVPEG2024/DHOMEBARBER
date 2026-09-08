/**
 * Admin « Textile & Drops » (/admin/textile) : trois onglets — Drops, Pièces, Réservations.
 *
 * Données : la vue d'ensemble `fetchTextileOverview()` (clé TEXTILE_QUERY_KEY) apporte les
 * agrégats (abonnés, réservations par drop, votes et tailles votées, stock pris) et, pour le
 * staff, tous les drops y compris les brouillons ; les listes d'entités (clés préfixées
 * ['textileDrops','all'], ['textileConcepts','all'], ['textileReservations','all']) servent
 * à l'édition. Les deux sont fusionnées par id (la ligne d'entité prime, les agrégats
 * complètent). Chaque mutation invalide sa liste et la vue d'ensemble (`invalidateTextile`).
 *
 * Droits : drops et pièces ne sont modifiables que par l'admin (le serveur répond 403 à un
 * barber) ; les réservations le sont par tout le staff.
 */
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Shirt, ClipboardList, AlertTriangle } from 'lucide-react';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { TEXTILE_QUERY_KEY, fetchTextileOverview } from '@/lib/textileApi';
import { DROPS_KEY, CONCEPTS_KEY, RESERVATIONS_KEY } from '@/components/textile-admin/shared';
import DropsTab from '@/components/textile-admin/DropsTab';
import ConceptsTab from '@/components/textile-admin/ConceptsTab';
import ReservationsTab from '@/components/textile-admin/ReservationsTab';

const TABS = [
  { key: 'drops', label: 'Drops', icon: Sparkles },
  { key: 'concepts', label: 'Pièces', icon: Shirt },
  { key: 'reservations', label: 'Réservations', icon: ClipboardList },
];

/** Ordre admin des drops : ouverts, annoncés, brouillons, terminés ; puis date d'ouverture, puis sort_order. */
const STATUS_RANK = { live: 0, teasing: 1, draft: 2, ended: 3 };
function sortDrops(a, b) {
  const rank = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
  if (rank !== 0) return rank;
  const ta = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
  const tb = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
  if (ta !== tb) return a.status === 'ended' ? tb - ta : ta - tb;
  return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
}

/**
 * Fusionne les lignes d'entité (`rows`) avec les agrégats de l'overview (`aggregated`) par id.
 * Sans liste d'entité (requête en erreur), on retombe sur l'overview seul.
 */
function mergeById(rows, aggregated) {
  const agg = new Map((Array.isArray(aggregated) ? aggregated : []).map((r) => [r.id, r]));
  const base = Array.isArray(rows) ? rows : Array.from(agg.values());
  return base.map((r) => ({ ...(agg.get(r.id) || {}), ...r }));
}

export default function AdminTextile() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((t) => t.key === requestedTab) ? requestedTab : 'drops';
  const setTab = (key) => setSearchParams(key === 'drops' ? {} : { tab: key }, { replace: true });

  const overviewQ = useQuery({ queryKey: TEXTILE_QUERY_KEY, queryFn: fetchTextileOverview });
  const dropsQ = useQuery({ queryKey: DROPS_KEY, queryFn: () => api.entities.TextileDrop.list('sort_order', 200) });
  const conceptsQ = useQuery({ queryKey: CONCEPTS_KEY, queryFn: () => api.entities.TextileConcept.list('sort_order', 500) });
  const reservationsQ = useQuery({ queryKey: RESERVATIONS_KEY, queryFn: () => api.entities.TextileReservation.list('-created_at', 500) });

  const drops = useMemo(
    () => mergeById(dropsQ.data, overviewQ.data?.drops).sort(sortDrops),
    [dropsQ.data, overviewQ.data],
  );
  const concepts = useMemo(
    () => mergeById(conceptsQ.data, overviewQ.data?.concepts),
    [conceptsQ.data, overviewQ.data],
  );
  const reservations = useMemo(() => {
    const rows = Array.isArray(reservationsQ.data) ? [...reservationsQ.data] : [];
    return rows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [reservationsQ.data]);

  const pendingReservations = useMemo(() => reservations.filter((r) => r.status === 'reserved').length, [reservations]);
  const counters = { drops: drops.length, concepts: concepts.length, reservations: pendingReservations };

  // Tant qu'une des deux sources d'un onglet charge et qu'on n'a encore rien à montrer, spinner
  // (sinon « Aucun drop » clignoterait avant l'arrivée de l'overview)
  const loadingByTab = {
    drops: drops.length === 0 && (dropsQ.isLoading || overviewQ.isLoading),
    concepts: concepts.length === 0 && (conceptsQ.isLoading || overviewQ.isLoading),
    reservations: reservationsQ.isLoading,
  };
  const errorForTab = {
    drops: dropsQ.error && overviewQ.error ? (dropsQ.error.message || overviewQ.error.message) : null,
    concepts: conceptsQ.error && overviewQ.error ? (conceptsQ.error.message || overviewQ.error.message) : null,
    reservations: reservationsQ.error?.message || null,
  }[tab];

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Textile</p>
          <h1 className="font-display text-2xl font-bold">Drops & pièces</h1>
        </div>
        {!isAdmin && (
          <p className="text-[11px] text-muted-foreground text-right max-w-[220px]">
            Lecture seule sur les drops et les pièces ; vous pouvez traiter les réservations.
          </p>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = counters[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
                active ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {count > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                  active ? 'bg-primary-foreground/20' : t.key === 'reservations' ? 'bg-amber-500/20 text-amber-400' : 'bg-secondary'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {errorForTab && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Impossible de charger les données : {errorForTab}</span>
        </div>
      )}

      {tab === 'drops' && (
        <DropsTab drops={drops} concepts={concepts} reservations={reservations} isAdmin={isAdmin} isLoading={loadingByTab.drops} />
      )}
      {tab === 'concepts' && (
        <ConceptsTab concepts={concepts} drops={drops} isAdmin={isAdmin} isLoading={loadingByTab.concepts} />
      )}
      {tab === 'reservations' && (
        <ReservationsTab reservations={reservations} isLoading={loadingByTab.reservations} />
      )}
    </div>
  );
}
