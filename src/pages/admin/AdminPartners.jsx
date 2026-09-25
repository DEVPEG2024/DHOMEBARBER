/**
 * Admin « Bons plans du Gang » (/admin/partners) : partenaires du salon et leurs offres réservées
 * aux clients (pourcentage facultatif sur certaines de leurs prestations, code promo, conditions,
 * date de fin). Entité `Partner`, écriture admin seulement. L'ordre se règle avec les flèches
 * (`sort_order`), « Coup de cœur » met le partenaire en grande carte en tête de la page client.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Upload, X, ArrowUp, ArrowDown, Handshake, Star, EyeOff, AlertTriangle, Ticket,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  PARTNERS_QUERY_KEY, PARTNERS_ADMIN_QUERY_KEY, PARTNER_CATEGORIES, MAX_OFFERS,
  fetchAllPartners, partnerCategory, partnerOffers, bestPercent, isExpired, formatValidUntil,
} from '@/lib/partnersApi';
import PartnerLogo from '@/components/partners/PartnerLogo';
import PercentBadge from '@/components/partners/PercentBadge';

const newOffer = () => ({ id: `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: '', percent: '', details: '' });

const EMPTY_PARTNER = {
  name: '', category: 'food', tagline: '', description: '', logo_url: '', cover_image_url: '',
  address: '', city: '', phone: '', website: '', instagram: '',
  offers: [], promo_code: '', conditions: '', valid_until: '', is_featured: false, is_active: true,
};

/** Formulaire → charge utile : offres vides retirées, pourcentage entier 1..100 ou null, dates vides → null. */
function toPayload(form) {
  const offers = (form.offers || [])
    .map(o => {
      const n = Math.round(Number(o.percent));
      return {
        id: o.id || newOffer().id,
        title: String(o.title || '').trim().slice(0, 120),
        percent: Number.isFinite(n) && n > 0 ? Math.min(n, 100) : null,
        details: String(o.details || '').trim().slice(0, 300),
      };
    })
    .filter(o => o.title)
    .slice(0, MAX_OFFERS);
  const trim = (v, max) => String(v || '').trim().slice(0, max);
  return {
    name: trim(form.name, 120),
    category: form.category || 'other',
    tagline: trim(form.tagline, 160),
    description: trim(form.description, 2000),
    logo_url: form.logo_url || '',
    cover_image_url: form.cover_image_url || '',
    address: trim(form.address, 200),
    city: trim(form.city, 80),
    phone: trim(form.phone, 30),
    website: trim(form.website, 300),
    instagram: trim(form.instagram, 120),
    offers,
    promo_code: trim(form.promo_code, 40),
    conditions: trim(form.conditions, 600),
    valid_until: form.valid_until || null,
    is_featured: !!form.is_featured,
    is_active: form.is_active !== false,
  };
}

function ImageField({ label, hint, value, onChange, square = false }) {
  const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error("Le serveur n'a pas renvoyé d'URL pour l'image");
      onChange(file_url);
    } catch (err) {
      toast.error(err?.message || "Échec de l'envoi de l'image");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Label className="text-xs">{label} {hint && <span className="text-muted-foreground">({hint})</span>}</Label>
      <div className="mt-1 flex items-center gap-3">
        <div className={`${square ? 'w-16 h-16' : 'w-28 h-16'} rounded-xl border border-border bg-secondary overflow-hidden flex items-center justify-center shrink-0`}>
          {value ? <img src={value} alt="" className={`w-full h-full ${square ? 'object-contain bg-white' : 'object-cover'}`} /> : <Handshake className="w-5 h-5 text-muted-foreground/40" />}
        </div>
        <label className={`cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
          <span className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg">
            <Upload className="w-3 h-3" /> {busy ? 'Envoi…' : value ? 'Changer' : 'Ajouter'}
          </span>
        </label>
        {value && (
          <button type="button" onClick={() => onChange('')} className="text-xs text-muted-foreground hover:text-destructive">Retirer</button>
        )}
      </div>
    </div>
  );
}

function OffersEditor({ offers, onChange }) {
  const update = (i, patch) => onChange(offers.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const remove = (i) => onChange(offers.filter((_, j) => j !== i));
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Offres <span className="text-muted-foreground">({offers.length}/{MAX_OFFERS})</span></Label>
        <button
          type="button"
          disabled={offers.length >= MAX_OFFERS}
          onClick={() => onChange([...offers, newOffer()])}
          className="flex items-center gap-1 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          <Plus className="w-3 h-3" /> Ajouter une offre
        </button>
      </div>
      {offers.length === 0 && (
        <p className="mt-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          Ex. « Vidange + filtre » à -15 %, « Menu midi » à -10 %, ou « Café offert » sans pourcentage.
        </p>
      )}
      <div className="mt-2 space-y-2">
        {offers.map((offer, i) => (
          <div key={offer.id || i} className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
            <div className="flex gap-2">
              <Input
                value={offer.title}
                onChange={e => update(i, { title: e.target.value })}
                placeholder="Prestation ou produit concerné"
                className="bg-background border-border h-9 text-sm"
              />
              <div className="relative w-24 shrink-0">
                <Input
                  type="number" min="0" max="100" inputMode="numeric"
                  value={offer.percent ?? ''}
                  onChange={e => update(i, { percent: e.target.value })}
                  placeholder="—"
                  className="bg-background border-border h-9 text-sm pr-7"
                  aria-label="Pourcentage de réduction"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <button type="button" onClick={() => remove(i)} aria-label="Retirer l'offre"
                className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10">
                <X className="w-4 h-4" />
              </button>
            </div>
            <Input
              value={offer.details || ''}
              onChange={e => update(i, { details: e.target.value })}
              placeholder="Précision facultative (ex. du lundi au jeudi, hors promotions)"
              className="bg-background border-border h-9 text-xs"
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">Pourcentage vide = avantage sans remise chiffrée (cadeau, accès prioritaire…).</p>
    </div>
  );
}

export default function AdminPartners() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const partnersQ = useQuery({ queryKey: PARTNERS_ADMIN_QUERY_KEY, queryFn: fetchAllPartners, retry: false });
  const partners = useMemo(
    () => (Array.isArray(partnersQ.data) ? [...partnersQ.data] : []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [partnersQ.data],
  );
  const backendMissing = partnersQ.isError && (partnersQ.error?.status === 400 || partnersQ.error?.status === 404);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: PARTNERS_QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: (form) => {
      const payload = toPayload(form);
      if (form.id) return api.entities.Partner.update(form.id, payload);
      const maxOrder = partners.reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), 0);
      return api.entities.Partner.create({ ...payload, sort_order: maxOrder + 1 });
    },
    onSuccess: () => { invalidate(); setEditing(null); toast.success('Partenaire enregistré'); },
    onError: (err) => toast.error(err?.message || "Erreur lors de l'enregistrement"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Partner.delete(id),
    onSuccess: () => { invalidate(); setConfirmDelete(null); toast.success('Partenaire supprimé'); },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la suppression'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, patch }) => api.entities.Partner.update(id, patch),
    onSuccess: invalidate,
    onError: (err) => toast.error(err?.message || 'Erreur lors de la mise à jour'),
  });

  /** Échange de place avec le voisin : on renumérote toute la liste pour réparer d'éventuels ex æquo. */
  const moveMutation = useMutation({
    mutationFn: async ({ index, delta }) => {
      const list = [...partners];
      const target = index + delta;
      if (target < 0 || target >= list.length) return;
      [list[index], list[target]] = [list[target], list[index]];
      const updates = list
        .map((p, i) => ({ p, order: i + 1 }))
        .filter(({ p, order }) => Number(p.sort_order) !== order);
      for (const { p, order } of updates) {
        await api.entities.Partner.update(p.id, { sort_order: order });
      }
    },
    onSuccess: invalidate,
    onError: (err) => { invalidate(); toast.error(err?.message || "Erreur lors du changement d'ordre"); },
  });

  const openNew = () => setEditing({ ...EMPTY_PARTNER, offers: [newOffer()] });
  const openEdit = (p) => setEditing({
    ...EMPTY_PARTNER,
    ...p,
    offers: partnerOffers(p).map(o => ({ ...o, id: o.id || newOffer().id, percent: o.percent ?? '' })),
    valid_until: p.valid_until ? String(p.valid_until).slice(0, 10) : '',
  });

  const set = (patch) => setEditing(prev => ({ ...prev, ...patch }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Partenaires</p>
          <h1 className="font-display text-2xl font-bold">Bons plans du Gang</h1>
        </div>
        <Button onClick={openNew} disabled={backendMissing} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg">
          <Plus className="w-4 h-4 mr-1.5" /> Ajouter
        </Button>
      </div>

      {backendMissing && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold">Le serveur ne connaît pas encore les partenaires.</p>
            <p className="text-xs mt-1 text-amber-200/80">
              Le correctif du backend (table <code>partners</code>, entité <code>Partner</code>) doit être déployé sur Heroku :
              voir <code>docs/backend-partners.md</code>. En attendant, la section reste masquée côté clients.
            </p>
          </div>
        </div>
      )}

      {partnersQ.isLoading && <div className="h-24 rounded-xl bg-card border border-border animate-pulse" />}

      <div className="space-y-2">
        {partners.map((p, i) => {
          const offers = partnerOffers(p);
          const best = bestPercent(p);
          const expired = isExpired(p);
          return (
            <div key={p.id} className={`bg-card border border-border rounded-xl p-3 flex items-center gap-3 ${p.is_active === false || expired ? 'opacity-60' : ''}`}>
              <div className="flex flex-col">
                <button type="button" aria-label="Monter" disabled={i === 0 || moveMutation.isPending}
                  onClick={() => moveMutation.mutate({ index: i, delta: -1 })}
                  className="w-7 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" aria-label="Descendre" disabled={i === partners.length - 1 || moveMutation.isPending}
                  onClick={() => moveMutation.mutate({ index: i, delta: 1 })}
                  className="w-7 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <PartnerLogo partner={p} className="w-12 h-12" rounded="rounded-xl" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold truncate">{p.name}</h3>
                  {p.is_featured && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-400"><Star className="w-3 h-3 fill-amber-400" /> Coup de cœur</span>}
                  {p.is_active === false && <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><EyeOff className="w-3 h-3" /> Masqué</span>}
                  {expired && <span className="text-[10px] font-semibold text-red-400">Expiré</span>}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>{partnerCategory(p.category).emoji} {partnerCategory(p.category).label}</span>
                  <span className="inline-flex items-center gap-0.5"><Ticket className="w-3 h-3" /> {offers.length} offre{offers.length > 1 ? 's' : ''}</span>
                  {p.promo_code && <span className="font-mono">{p.promo_code}</span>}
                  {p.valid_until && <span>jusqu'au {formatValidUntil(p.valid_until)}</span>}
                </div>
              </div>
              {best && <PercentBadge percent={best} size="sm" className="hidden sm:inline-flex" />}
              <div className="flex items-center gap-1 shrink-0">
                <Switch
                  checked={p.is_active !== false}
                  onCheckedChange={v => toggleMutation.mutate({ id: p.id, patch: { is_active: v } })}
                  aria-label="Visible des clients"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label="Modifier">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(p)} aria-label="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {!partnersQ.isLoading && !backendMissing && partners.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Handshake className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Aucun partenaire. Cliquez sur « Ajouter » pour présenter le premier.
        </div>
      )}

      {/* Création / modification */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing?.id ? 'Modifier le partenaire' : 'Nouveau partenaire'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Nom *</Label>
                  <Input value={editing.name} onChange={e => set({ name: e.target.value })} className="bg-secondary border-border mt-1" placeholder="Ex. Garage du Lac" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Catégorie</Label>
                  <Select value={editing.category || 'other'} onValueChange={v => set({ category: v })}>
                    <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PARTNER_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Accroche</Label>
                <Input value={editing.tagline || ''} onChange={e => set({ tagline: e.target.value })} className="bg-secondary border-border mt-1"
                  placeholder="Ex. -15 % sur l'entretien pour le Gang" maxLength={160} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ImageField label="Logo" hint="carré" square value={editing.logo_url} onChange={v => set({ logo_url: v })} />
                <ImageField label="Couverture" hint="paysage" value={editing.cover_image_url} onChange={v => set({ cover_image_url: v })} />
              </div>

              <OffersEditor offers={editing.offers || []} onChange={offers => set({ offers })} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Code promo <span className="text-muted-foreground">(facultatif)</span></Label>
                  <Input value={editing.promo_code || ''} onChange={e => set({ promo_code: e.target.value.toUpperCase() })} className="bg-secondary border-border mt-1 font-mono" placeholder="GANG15" maxLength={40} />
                </div>
                <div>
                  <Label className="text-xs">Valable jusqu'au <span className="text-muted-foreground">(facultatif)</span></Label>
                  <Input type="date" value={editing.valid_until || ''} onChange={e => set({ valid_until: e.target.value })} className="bg-secondary border-border mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Conditions</Label>
                <Textarea value={editing.conditions || ''} onChange={e => set({ conditions: e.target.value })} className="bg-secondary border-border mt-1" rows={2}
                  placeholder="Ex. Sur présentation de la Carte Gang, non cumulable." />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea value={editing.description || ''} onChange={e => set({ description: e.target.value })} className="bg-secondary border-border mt-1" rows={4}
                  placeholder="Présentation du partenaire" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Adresse</Label>
                  <Input value={editing.address || ''} onChange={e => set({ address: e.target.value })} className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Ville</Label>
                  <Input value={editing.city || ''} onChange={e => set({ city: e.target.value })} className="bg-secondary border-border mt-1" placeholder="Douvaine" />
                </div>
                <div>
                  <Label className="text-xs">Téléphone</Label>
                  <Input value={editing.phone || ''} onChange={e => set({ phone: e.target.value })} className="bg-secondary border-border mt-1" inputMode="tel" />
                </div>
                <div>
                  <Label className="text-xs">Site web</Label>
                  <Input value={editing.website || ''} onChange={e => set({ website: e.target.value })} className="bg-secondary border-border mt-1" placeholder="exemple.fr" />
                </div>
                <div>
                  <Label className="text-xs">Instagram</Label>
                  <Input value={editing.instagram || ''} onChange={e => set({ instagram: e.target.value })} className="bg-secondary border-border mt-1" placeholder="@compte" />
                </div>
              </div>

              <div className="rounded-xl border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-xs">Coup de cœur</Label>
                    <p className="text-[11px] text-muted-foreground">Grande carte en tête de la page des bons plans</p>
                  </div>
                  <Switch checked={!!editing.is_featured} onCheckedChange={v => set({ is_featured: v })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-xs">Visible des clients</Label>
                    <p className="text-[11px] text-muted-foreground">Masquez sans supprimer (partenariat en pause)</p>
                  </div>
                  <Switch checked={editing.is_active !== false} onCheckedChange={v => set({ is_active: v })} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Annuler</Button>
                <Button
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    if (!editing.name?.trim()) { toast.error('Le nom du partenaire est obligatoire'); return; }
                    const bad = (editing.offers || []).find(o => o.percent !== '' && o.percent != null && !(Number(o.percent) > 0 && Number(o.percent) <= 100));
                    if (bad) { toast.error('Un pourcentage doit être compris entre 1 et 100'); return; }
                    saveMutation.mutate(editing);
                  }}
                >
                  {saveMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Suppression */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Supprimer {confirmDelete?.name} ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Le partenaire et ses offres disparaissent de l'app. Pour une pause, masquez-le plutôt avec l'interrupteur.
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Annuler</Button>
            <Button className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(confirmDelete.id)}>
              {deleteMutation.isPending ? 'Suppression…' : 'Supprimer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
