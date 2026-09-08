/**
 * Onglet « Pièces » : liste groupée par drop (+ groupe « Labo » pour les pièces sans drop).
 * Chaque ligne : miniature, nom, catégorie, prix, tailles avec restant / stock, votes et
 * répartition des tailles votées (pour dimensionner la production), badge Inactif.
 * Actions admin : modifier, dupliquer, supprimer (deux taps).
 */
import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Copy, Trash2, Shirt, FlaskConical, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { categoryLabel, categoryEmoji, conceptAvailability, formatPrice } from '@/lib/textileApi';
import {
  DROP_STATUS_STYLES, dropStatusLabel, StatusPill, TwoTapButton, ActionButton, Spinner, EmptyState, invalidateTextile,
} from './shared';
import ConceptDialog, { conceptToPayload } from './ConceptDialog';

const LABO = '__labo__';
const ORPHANS = '__orphans__';

/** Répartition des tailles votées : mini-barres proportionnelles au maximum. */
function SizeVoteBars({ sizeVotes, sizes }) {
  const entries = useMemo(() => {
    const votes = sizeVotes && typeof sizeVotes === 'object' ? sizeVotes : {};
    const keys = [...(sizes || []).filter((s) => s in votes), ...Object.keys(votes).filter((k) => !(sizes || []).includes(k))];
    return keys
      .map((k) => ({ key: k, label: k && k !== 'null' ? k : '—', value: Number(votes[k]) || 0 }))
      .filter((e) => e.value > 0);
  }, [sizeVotes, sizes]);
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map((e) => e.value));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
      {entries.map((e) => (
        <div key={e.key} className="flex items-center gap-1.5 text-[10px]">
          <span className="w-8 truncate text-muted-foreground" title={e.label}>{e.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((e.value / max) * 100)}%` }} />
          </div>
          <span className="w-5 text-right font-semibold text-foreground">{e.value}</span>
        </div>
      ))}
    </div>
  );
}

function ConceptRow({ concept, isAdmin, busy, onEdit, onDuplicate, onDelete }) {
  const cover = Array.isArray(concept.images) ? concept.images.find(Boolean) : null;
  const sizes = Array.isArray(concept.sizes) ? concept.sizes : [];
  const stock = concept.stock && typeof concept.stock === 'object' ? concept.stock : {};
  const reserved = concept.reserved && typeof concept.reserved === 'object' ? concept.reserved : {};
  const votes = Number(concept.votes_count) || 0;
  const colors = Array.isArray(concept.colors) ? concept.colors : [];
  const inactive = concept.is_active === false;

  return (
    <div className={`bg-card border border-border rounded-xl p-3 flex gap-3 ${inactive ? 'opacity-70' : ''}`}>
      <div className="w-16 h-16 rounded-lg bg-secondary overflow-hidden shrink-0 flex items-center justify-center">
        {cover ? (
          <img src={cover} alt={concept.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-2xl" aria-hidden>{categoryEmoji(concept.category)}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold truncate">{concept.name}</h4>
          {inactive && (
            <Badge variant="outline" className="text-[9px] border-zinc-500/40 text-zinc-400 gap-1"><EyeOff className="w-2.5 h-2.5" /> Inactif</Badge>
          )}
          {concept.sold_out && (
            <Badge variant="outline" className="text-[9px] border-red-500/40 text-red-400">Épuisé</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {categoryLabel(concept.category)} · <span className="font-bold text-primary text-sm">{formatPrice(concept.price) || '—'}</span>
          {concept.max_per_client ? <> · max {concept.max_per_client}/client</> : null}
        </p>

        {colors.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            {colors.slice(0, 12).map((c, i) => (
              <span key={`${c?.hex}-${i}`} title={c?.name || c?.hex} className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ background: c?.hex || '#000' }} />
            ))}
          </div>
        )}

        {sizes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {sizes.map((s) => {
              const a = conceptAvailability(concept, s);
              const taken = Number(reserved[s]) || 0;
              const cls = a.tracked
                ? (a.soldOut ? 'border-red-500/40 text-red-400 bg-red-500/10' : 'border-border text-foreground')
                : 'border-border text-muted-foreground';
              return (
                <span key={s} className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
                  {s}
                  {a.tracked && <span className="ml-1 font-normal">{a.remaining}/{Number(stock[s]) || 0}</span>}
                  {!a.tracked && taken > 0 && <span className="ml-1 font-normal">· {taken} prise{taken > 1 ? 's' : ''}</span>}
                </span>
              );
            })}
          </div>
        )}

        <div className="mt-2 flex items-start gap-3 flex-wrap">
          <span className="text-xs shrink-0">🔥 <span className="font-semibold">{votes}</span> <span className="text-muted-foreground">vote{votes > 1 ? 's' : ''}</span></span>
          {votes > 0 && (
            <div className="flex-1 min-w-[180px]">
              <SizeVoteBars sizeVotes={concept.size_votes} sizes={sizes} />
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <ActionButton icon={Pencil} label="Modifier" onClick={onEdit} disabled={busy} />
            <ActionButton icon={Copy} label="Dupliquer" onClick={onDuplicate} disabled={busy} />
            <TwoTapButton icon={Trash2} label="Supprimer" confirmLabel="Supprimer ?" onConfirm={onDelete} disabled={busy} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {Array} props.concepts   Pièces fusionnées (entité + agrégats : votes_count, size_votes, reserved…)
 * @param {Array} props.drops      Drops (ordre d'affichage des groupes)
 * @param {boolean} props.isAdmin
 * @param {boolean} props.isLoading
 */
export default function ConceptsTab({ concepts, drops, isAdmin, isLoading }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultDropId, setDefaultDropId] = useState(null);

  const groups = useMemo(() => {
    const sorted = [...concepts].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'fr'));
    const known = new Set(drops.map((d) => d.id));
    const byKey = new Map();
    sorted.forEach((c) => {
      const key = !c.drop_id ? LABO : known.has(c.drop_id) ? c.drop_id : ORPHANS;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(c);
    });
    const list = drops.map((d) => ({ key: d.id, drop: d, title: d.name, items: byKey.get(d.id) || [] }));
    if (byKey.has(ORPHANS)) list.push({ key: ORPHANS, drop: null, title: 'Drop introuvable', items: byKey.get(ORPHANS) });
    list.push({ key: LABO, drop: null, title: 'Labo', labo: true, items: byKey.get(LABO) || [] });
    // Un groupe vide n'est montré qu'à l'admin (pour y ajouter une pièce) ; le Labo est toujours là pour lui
    return list.filter((g) => g.items.length > 0 || (isAdmin && (g.drop || g.labo)));
  }, [concepts, drops, isAdmin]);

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.TextileConcept.delete(id),
    onSuccess: () => { invalidateTextile(queryClient, 'textileConcepts', 'textileReservations'); toast.success('Pièce supprimée'); },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la suppression'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (concept) => api.entities.TextileConcept.create({
      ...conceptToPayload(concept),
      name: `${concept.name} (copie)`.slice(0, 255),
      is_active: false,
    }),
    onSuccess: () => { invalidateTextile(queryClient, 'textileConcepts'); toast.success('Pièce dupliquée (inactive, à renommer)'); },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la duplication'),
  });

  const openNew = (dropId = null) => { setEditing(null); setDefaultDropId(dropId); setDialogOpen(true); };
  const openEdit = (concept) => { setEditing(concept); setDefaultDropId(null); setDialogOpen(true); };
  const busy = deleteMutation.isPending || duplicateMutation.isPending;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs text-muted-foreground">
          {concepts.length} pièce{concepts.length > 1 ? 's' : ''} · les votes par taille aident à dimensionner la production
        </p>
        {isAdmin && (
          <Button onClick={() => openNew(null)} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shrink-0">
            <Plus className="w-4 h-4 mr-1.5" /> Nouvelle pièce
          </Button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <EmptyState icon={Shirt} title="Aucune pièce" hint={isAdmin ? 'Ajoutez une pièce au Labo ou à un drop.' : undefined} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {g.labo ? <FlaskConical className="w-4 h-4 text-primary shrink-0" /> : <Shirt className="w-4 h-4 text-primary shrink-0" />}
                  <h3 className="text-sm font-semibold truncate">{g.title}</h3>
                  {g.drop && (
                    <StatusPill className={DROP_STATUS_STYLES[g.drop.status] || DROP_STATUS_STYLES.draft}>{dropStatusLabel(g.drop.status)}</StatusPill>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">{g.items.length} pièce{g.items.length > 1 ? 's' : ''}</span>
                </div>
                {isAdmin && (g.drop || g.labo) && (
                  <button type="button" onClick={() => openNew(g.drop?.id || null)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0">
                    <Plus className="w-3 h-3" /> Pièce
                  </button>
                )}
              </div>
              {g.items.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-xl border border-dashed border-border p-4 text-center">
                  {g.labo ? 'Aucune idée au Labo pour le moment.' : 'Aucune pièce dans ce drop.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {g.items.map((c) => (
                    <ConceptRow
                      key={c.id}
                      concept={c}
                      isAdmin={isAdmin}
                      busy={busy}
                      onEdit={() => openEdit(c)}
                      onDuplicate={() => duplicateMutation.mutate(c)}
                      onDelete={() => deleteMutation.mutate(c.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {isAdmin && (
        <ConceptDialog open={dialogOpen} onOpenChange={setDialogOpen} concept={editing} drops={drops} defaultDropId={defaultDropId} />
      )}
    </div>
  );
}
