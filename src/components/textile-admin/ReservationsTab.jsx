/**
 * Onglet « Réservations » (précommandes) : bandeau de stats, filtres par statut (avec compteurs),
 * recherche, liste triée par date décroissante. Parcours : à payer au salon avant l'échéance →
 * payée (fabrication à la fin du drop) → prête (le serveur prévient le client par push) → retirée.
 * Actions staff : Payée, Prête, Retirée, Annuler (deux taps), note interne éditable en place.
 */
import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Search, Phone, Mail, ClipboardList, CheckCircle2, PackageCheck, Ban, StickyNote, Clock, Pencil, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { RESERVATION_STATUSES } from '@/lib/textileApi';
import {
  RESERVATION_STATUS_STYLES, reservationStatusLabel, StatusPill, TwoTapButton, ActionButton, Spinner, EmptyState,
  formatParisDateTime, formatEuros, reservationTotal, invalidateTextile,
} from './shared';

const STATUS_ICONS = {
  reserved: Clock, paid: CheckCircle2, ready: Package, picked_up: PackageCheck, cancelled: Ban, expired: Clock,
};

function NotesEditor({ reservation, onSave, saving }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reservation.notes || '');
  const start = () => { setDraft(reservation.notes || ''); setEditing(true); };
  const save = () => { onSave(draft.trim()); setEditing(false); };

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
          rows={2}
          autoFocus
          placeholder="Note interne (acompte, taille échangée, à rappeler…)"
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="flex gap-2">
          <Button size="sm" className="h-8" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(false)} disabled={saving}>Annuler</Button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={start}
      className="mt-2 w-full text-left rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors flex items-start gap-1.5">
      <StickyNote className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      {reservation.notes ? <span className="whitespace-pre-wrap text-foreground">{reservation.notes}</span> : <span>Ajouter une note</span>}
      <Pencil className="w-3 h-3 shrink-0 ml-auto mt-0.5 opacity-60" />
    </button>
  );
}

/**
 * @param {object} props
 * @param {Array} props.reservations   Réservations triées par date décroissante
 * @param {boolean} props.isLoading
 */
export default function ReservationsTab({ reservations, isLoading }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const now = Date.now();

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.TextileReservation.update(id, data),
    onSuccess: (_data, { data, successMessage }) => {
      invalidateTextile(queryClient, 'textileReservations');
      toast.success(successMessage || (data.status ? 'Statut mis à jour' : 'Note enregistrée'));
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la mise à jour'),
  });

  const counts = useMemo(() => {
    const c = { all: reservations.length };
    RESERVATION_STATUSES.forEach((s) => { c[s.value] = 0; });
    reservations.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [reservations]);

  const stats = useMemo(() => ({
    reserved: counts.reserved || 0,
    paid: counts.paid || 0,
    ready: counts.ready || 0,
    picked_up: counts.picked_up || 0,
    revenue: reservations.reduce((sum, r) => (['paid', 'ready', 'picked_up'].includes(r.status) ? sum + reservationTotal(r) : sum), 0),
  }), [reservations, counts]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return reservations.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!s) return true;
      return [r.client_name, r.client_email, r.client_phone, r.concept_name]
        .some((v) => String(v || '').toLowerCase().includes(s));
    });
  }, [reservations, filter, search]);

  const filters = [
    { key: 'all', label: `Toutes (${counts.all})` },
    ...RESERVATION_STATUSES.map((s) => ({ key: s.value, label: `${s.label}s (${counts[s.value] || 0})` })),
  ];

  const setStatus = (r, status, successMessage) => updateMutation.mutate({ id: r.id, data: { status }, successMessage });
  const saveNotes = (r, notes) => updateMutation.mutate({ id: r.id, data: { notes: notes || null }, successMessage: 'Note enregistrée' });

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-amber-400 font-medium">À payer</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.reserved}</p>
          <p className="text-[10px] text-muted-foreground">paiement au salon avant l'échéance</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-blue-400 font-medium">Payées</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.paid}</p>
          <p className="text-[10px] text-muted-foreground">à fabriquer à la fin du drop</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-violet-400 font-medium">Prêtes</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.ready}</p>
          <p className="text-[10px] text-muted-foreground">client prévenu, à retirer</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-green-400 font-medium">Retirées</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.picked_up}</p>
          <p className="text-[10px] text-muted-foreground">terminées</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-primary font-medium">CA encaissé</p>
          <p className="text-2xl font-bold text-primary mt-1">{formatEuros(stats.revenue)}</p>
          <p className="text-[10px] text-muted-foreground">payées + prêtes + retirées</p>
        </div>
      </div>

      {/* Recherche + filtres */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, email, téléphone, pièce…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {filters.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Aucune réservation"
          hint={reservations.length > 0 ? 'Aucune ne correspond à ce filtre.' : 'Les réservations des clients apparaîtront ici dès l\'ouverture d\'un drop.'} />
      ) : (
        <div className="space-y-2">
          {filtered.map((r, i) => {
            const Icon = STATUS_ICONS[r.status] || Clock;
            const expiresMs = r.expires_at ? new Date(r.expires_at).getTime() : NaN;
            const overdue = r.status === 'reserved' && Number.isFinite(expiresMs) && expiresMs < now;
            const showDeadline = r.expires_at && (r.status === 'reserved' || r.status === 'expired');
            const qty = Number(r.quantity) || 1;
            const busy = updateMutation.isPending && updateMutation.variables?.id === r.id;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{r.client_name || 'Client'}</p>
                      <StatusPill icon={Icon} className={RESERVATION_STATUS_STYLES[r.status] || RESERVATION_STATUS_STYLES.expired}>
                        {reservationStatusLabel(r.status)}
                      </StatusPill>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                      {r.client_email && (
                        <a href={`mailto:${r.client_email}`} className="inline-flex items-center gap-1 hover:text-foreground truncate max-w-full">
                          <Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{r.client_email}</span>
                        </a>
                      )}
                      {r.client_phone && (
                        <a href={`tel:${String(r.client_phone).replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Phone className="w-3 h-3 shrink-0" /> {r.client_phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{formatEuros(reservationTotal(r))}</p>
                    <p className="text-[10px] text-muted-foreground">{r.created_at ? formatParisDateTime(r.created_at) : ''}</p>
                  </div>
                </div>

                <div className="mt-2.5 rounded-lg bg-secondary/50 px-3 py-2 text-sm flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">{r.concept_name || 'Pièce supprimée'}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.size ? <>Taille <span className="font-semibold text-foreground">{r.size}</span> · </> : null}
                    <span className="font-semibold text-foreground">×{qty}</span>
                    {r.unit_price != null && <> · {formatEuros(r.unit_price)} l'unité</>}
                  </span>
                </div>

                {showDeadline && (
                  <p className={`mt-2 text-xs inline-flex items-center gap-1.5 ${overdue ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                    <Clock className="w-3.5 h-3.5" />
                    {r.status === 'expired' ? 'Non payée, délai dépassé le' : overdue ? 'Délai de paiement dépassé depuis le' : 'À payer au salon avant le'} {formatParisDateTime(r.expires_at)}
                  </p>
                )}

                <NotesEditor key={`${r.id}-${r.notes || ''}`} reservation={r} onSave={(notes) => saveNotes(r, notes)} saving={busy} />

                {(r.status === 'reserved' || r.status === 'paid' || r.status === 'ready') && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {r.status === 'reserved' && (
                      <ActionButton icon={CheckCircle2} label="Payée" disabled={busy}
                        className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                        onClick={() => setStatus(r, 'paid', 'Précommande payée, à fabriquer à la fin du drop')} />
                    )}
                    {r.status === 'paid' && (
                      <ActionButton icon={Package} label="Prête" disabled={busy}
                        className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                        onClick={() => setStatus(r, 'ready', 'Pièce prête : le client reçoit une notification pour venir la retirer')} />
                    )}
                    <ActionButton icon={PackageCheck} label="Retirée" disabled={busy}
                      className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                      onClick={() => setStatus(r, 'picked_up', 'Pièce retirée, précommande terminée')} />
                    <TwoTapButton icon={Ban} label="Annuler" confirmLabel="Confirmer l'annulation ?" disabled={busy}
                      onConfirm={() => setStatus(r, 'cancelled', 'Réservation annulée, le stock est libéré')} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
