/**
 * Création / édition d'une pièce (entité TextileConcept) : images (multi-upload séquentiel,
 * réordonnables, max 8, la première = couverture), couleurs (nom + hex, max 12), tailles (chips
 * ALL_SIZES + libellé libre, max 12), stock par taille (vide = non suivi → clé absente), etc.
 * Exporte aussi `conceptToPayload` pour la duplication depuis l'onglet.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, X, ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TEXTILE_CATEGORIES, ALL_SIZES, DEFAULT_SIZES, categoryEmoji } from '@/lib/textileApi';
import { Field, INPUT_CLASS, invalidateTextile, clampInt, uploadImageFile, dropStatusLabel } from './shared';

const MAX_IMAGES = 8;
const MAX_COLORS = 12;
const MAX_SIZES = 12;
const SIZE_MAX_LENGTH = 10;
/** Radix Select refuse une valeur vide : sentinelle pour « aucun drop ». */
const NO_DROP = '__labo__';

const EMPTY_FORM = {
  name: '', category: 'tshirt', description: '', price: '', drop_id: '',
  images: [], colors: [], sizes: [...DEFAULT_SIZES], stock: {},
  max_per_client: 2, is_active: true, sort_order: 0,
};

/** `<input type="color">` exige `#rrggbb` en minuscules. */
function normalizeHex(value) {
  const v = String(value || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return '#111111';
}

/** Tailles standard dans l'ordre d'ALL_SIZES, puis les libellés personnalisés dans leur ordre d'ajout. */
function orderSizes(sizes) {
  const canonical = ALL_SIZES.filter((s) => sizes.includes(s));
  const custom = sizes.filter((s) => !ALL_SIZES.includes(s));
  return [...canonical, ...custom];
}

function formFromConcept(concept, defaultDropId) {
  if (!concept) return { ...EMPTY_FORM, sizes: [...DEFAULT_SIZES], stock: {}, drop_id: defaultDropId || '' };
  const stock = concept.stock && typeof concept.stock === 'object' ? concept.stock : {};
  return {
    name: concept.name || '',
    category: TEXTILE_CATEGORIES.some((c) => c.value === concept.category) ? concept.category : 'tshirt',
    description: concept.description || '',
    price: concept.price ?? '',
    drop_id: concept.drop_id || '',
    images: Array.isArray(concept.images) ? concept.images.filter(Boolean).slice(0, MAX_IMAGES) : [],
    colors: Array.isArray(concept.colors)
      ? concept.colors.slice(0, MAX_COLORS).map((c) => ({ name: c?.name || '', hex: normalizeHex(c?.hex) }))
      : [],
    sizes: Array.isArray(concept.sizes) ? concept.sizes.map(String).slice(0, MAX_SIZES) : [],
    stock: Object.fromEntries(Object.entries(stock).map(([k, v]) => [k, v == null ? '' : String(v)])),
    max_per_client: concept.max_per_client ?? 2,
    is_active: concept.is_active !== false,
    sort_order: concept.sort_order ?? 0,
  };
}

function payloadFromForm(form) {
  const sizes = orderSizes(form.sizes).slice(0, MAX_SIZES);
  const stock = {};
  sizes.forEach((s) => {
    const raw = form.stock?.[s];
    if (raw === '' || raw == null) return; // non suivi
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) stock[s] = Math.max(0, n);
  });
  const price = Number(String(form.price).replace(',', '.'));
  return {
    name: form.name.trim(),
    category: form.category,
    description: form.description.trim() || null,
    price: Number.isFinite(price) ? Math.max(0, Math.round(price * 100) / 100) : 0,
    drop_id: form.drop_id || null,
    images: form.images.slice(0, MAX_IMAGES),
    colors: form.colors
      .filter((c) => c.hex)
      .slice(0, MAX_COLORS)
      .map((c) => ({ name: (c.name || '').trim() || c.hex.toUpperCase(), hex: c.hex })),
    sizes,
    stock,
    max_per_client: clampInt(form.max_per_client, 1, 10, 2),
    is_active: !!form.is_active,
    sort_order: clampInt(form.sort_order, -100000, 100000, 0),
  };
}

/** Corps de création à partir d'une pièce existante (duplication). */
export function conceptToPayload(concept) {
  return payloadFromForm(formFromConcept(concept));
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {object|null} props.concept        Pièce à modifier (null = création)
 * @param {Array} props.drops                Drops proposés dans le sélecteur
 * @param {string|null} [props.defaultDropId] Drop présélectionné à la création
 */
export default function ConceptDialog({ open, onOpenChange, concept, drops, defaultDropId }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formFromConcept(concept, defaultDropId));
  const [upload, setUpload] = useState(null); // { done, total } pendant un envoi
  const [customSize, setCustomSize] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) { setForm(formFromConcept(concept, defaultDropId)); setCustomSize(''); setUpload(null); }
  }, [open, concept, defaultDropId]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const saveMutation = useMutation({
    mutationFn: (payload) => (concept?.id
      ? api.entities.TextileConcept.update(concept.id, payload)
      : api.entities.TextileConcept.create(payload)),
    onSuccess: () => {
      invalidateTextile(queryClient, 'textileConcepts');
      toast.success(concept?.id ? 'Pièce mise à jour' : 'Pièce créée');
      onOpenChange(false);
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la sauvegarde'),
  });

  const handleSave = () => {
    const payload = payloadFromForm(form);
    if (!payload.name) { toast.error('Le nom de la pièce est obligatoire'); return; }
    if (form.price !== '' && !Number.isFinite(Number(String(form.price).replace(',', '.')))) {
      toast.error('Prix invalide'); return;
    }
    saveMutation.mutate(payload);
  };

  // ─── Images ───
  const handleImagesUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_IMAGES - form.images.length;
    if (room <= 0) { toast.error(`${MAX_IMAGES} images maximum`); return; }
    const batch = files.slice(0, room);
    if (files.length > room) toast.warning(`Seules ${room} image${room > 1 ? 's' : ''} ajoutée${room > 1 ? 's' : ''} : ${MAX_IMAGES} maximum`);
    setUpload({ done: 0, total: batch.length });
    for (const file of batch) {
      try {
        const url = await uploadImageFile(file);
        setForm((prev) => (prev.images.length >= MAX_IMAGES ? prev : { ...prev, images: [...prev.images, url] }));
      } catch (err) {
        toast.error(err?.message || `Échec de l'envoi de ${file.name}`);
      }
      setUpload((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setUpload(null);
  };
  const moveImage = (index, delta) => {
    setForm((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.images.length) return prev;
      const images = [...prev.images];
      [images[index], images[target]] = [images[target], images[index]];
      return { ...prev, images };
    });
  };
  const removeImage = (index) => set({ images: form.images.filter((_, i) => i !== index) });

  // ─── Couleurs ───
  const addColor = () => {
    if (form.colors.length >= MAX_COLORS) { toast.error(`${MAX_COLORS} couleurs maximum`); return; }
    set({ colors: [...form.colors, { name: '', hex: '#111111' }] });
  };
  const updateColor = (index, patch) => set({ colors: form.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const removeColor = (index) => set({ colors: form.colors.filter((_, i) => i !== index) });

  // ─── Tailles ───
  const toggleSize = (size) => {
    if (form.sizes.includes(size)) {
      const { [size]: _removed, ...stock } = form.stock;
      set({ sizes: form.sizes.filter((s) => s !== size), stock });
    } else {
      if (form.sizes.length >= MAX_SIZES) { toast.error(`${MAX_SIZES} tailles maximum`); return; }
      set({ sizes: [...form.sizes, size] });
    }
  };
  const addCustomSize = () => {
    const label = customSize.trim().slice(0, SIZE_MAX_LENGTH);
    if (!label) return;
    if (form.sizes.some((s) => s.toLowerCase() === label.toLowerCase())) { toast.error('Cette taille existe déjà'); return; }
    if (form.sizes.length >= MAX_SIZES) { toast.error(`${MAX_SIZES} tailles maximum`); return; }
    set({ sizes: [...form.sizes, label] });
    setCustomSize('');
  };
  const customSizes = form.sizes.filter((s) => !ALL_SIZES.includes(s));
  const orderedSizes = orderSizes(form.sizes);
  const reservedBySize = concept?.reserved && typeof concept.reserved === 'object' ? concept.reserved : {};

  const busy = saveMutation.isPending || !!upload;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{concept?.id ? 'Modifier la pièce' : 'Nouvelle pièce'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Images */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Images <span className="text-muted-foreground">({form.images.length}/{MAX_IMAGES}, la première sert de couverture)</span></Label>
              <label className={`cursor-pointer ${form.images.length >= MAX_IMAGES || upload ? 'pointer-events-none opacity-50' : ''}`}>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagesUpload} disabled={!!upload || form.images.length >= MAX_IMAGES} />
                <span className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-all">
                  <Upload className="w-3 h-3" />
                  {upload ? `Envoi ${Math.min(upload.done + 1, upload.total)}/${upload.total}…` : 'Ajouter'}
                </span>
              </label>
            </div>
            {form.images.length === 0 ? (
              <div className="mt-2 rounded-xl border border-dashed border-border bg-secondary/40 p-5 text-center text-xs text-muted-foreground">
                Aucune image : la pièce s'affichera avec l'emoji {categoryEmoji(form.category)} de sa catégorie.
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {form.images.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary group">
                    <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                    {i === 0 && (
                      <span className="absolute top-1 left-1 rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">Couverture</span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 p-1">
                      <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Reculer"
                        className="w-6 h-6 rounded flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30">
                        <ArrowLeft className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={() => removeImage(i)} aria-label="Retirer"
                        className="w-6 h-6 rounded flex items-center justify-center text-red-300 hover:bg-red-500/30">
                        <X className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={() => moveImage(i, 1)} disabled={i === form.images.length - 1} aria-label="Avancer"
                        className="w-6 h-6 rounded flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30">
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nom" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} className={INPUT_CLASS} placeholder="Ex : Tee DHB Gang" maxLength={255} />
            </Field>
            <Field label="Catégorie">
              <Select value={form.category} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger className={INPUT_CLASS}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEXTILE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prix (€)">
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={form.price}
                onChange={(e) => set({ price: e.target.value })} className={INPUT_CLASS} placeholder="35" />
            </Field>
            <Field label="Drop" hint="« Labo » : idée à faire voter, pas encore programmée." className="sm:col-span-2">
              <Select value={form.drop_id || NO_DROP} onValueChange={(v) => set({ drop_id: v === NO_DROP ? '' : v })}>
                <SelectTrigger className={INPUT_CLASS}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DROP}>Labo (aucun drop)</SelectItem>
                  {(drops || []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} · {dropStatusLabel(d.status)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea value={form.description} onChange={(e) => set({ description: e.target.value })} className={INPUT_CLASS} rows={3} />
            </Field>
          </div>

          {/* Couleurs */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Couleurs <span className="text-muted-foreground">({form.colors.length}/{MAX_COLORS})</span></Label>
              <button type="button" onClick={addColor} disabled={form.colors.length >= MAX_COLORS}
                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
            {form.colors.length > 0 && (
              <div className="mt-2 space-y-2">
                {form.colors.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="color" value={c.hex} onChange={(e) => updateColor(i, { hex: e.target.value })}
                      aria-label="Couleur"
                      className="w-9 h-9 rounded-lg border border-border bg-secondary p-0.5 cursor-pointer shrink-0" />
                    <Input value={c.name} onChange={(e) => updateColor(i, { name: e.target.value })}
                      placeholder="Nom (ex : Noir)" maxLength={40} className={`${INPUT_CLASS} flex-1`} />
                    <span className="text-[11px] font-mono text-muted-foreground w-16 shrink-0">{c.hex.toUpperCase()}</span>
                    <button type="button" onClick={() => removeColor(i)} aria-label="Retirer la couleur"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tailles */}
          <div>
            <Label className="text-xs">Tailles <span className="text-muted-foreground">({form.sizes.length}/{MAX_SIZES})</span></Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ALL_SIZES.map((s) => {
                const on = form.sizes.includes(s);
                return (
                  <button key={s} type="button" onClick={() => toggleSize(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}>
                    {s}
                  </button>
                );
              })}
              {customSizes.map((s) => (
                <button key={s} type="button" onClick={() => toggleSize(s)} title="Retirer"
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-primary text-primary-foreground border-primary inline-flex items-center gap-1">
                  {s} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input value={customSize} onChange={(e) => setCustomSize(e.target.value.slice(0, SIZE_MAX_LENGTH))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize(); } }}
                placeholder="Autre taille (ex : 3XL, 56 cm)" maxLength={SIZE_MAX_LENGTH} className={`${INPUT_CLASS} flex-1`} />
              <Button type="button" variant="outline" onClick={addCustomSize} disabled={!customSize.trim()}>
                <Plus className="w-4 h-4 mr-1" /> Ajouter
              </Button>
            </div>
          </div>

          {/* Stock par taille */}
          {orderedSizes.length > 0 && (
            <div>
              <Label className="text-xs">Stock par taille <span className="text-muted-foreground">(vide = non suivi, réservations illimitées)</span></Label>
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
                {orderedSizes.map((s) => {
                  const taken = Number(reservedBySize[s]) || 0;
                  return (
                    <div key={s}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold w-10 truncate" title={s}>{s}</span>
                        <Input type="number" min={0} inputMode="numeric" placeholder="∞"
                          value={form.stock[s] ?? ''}
                          onChange={(e) => set({ stock: { ...form.stock, [s]: e.target.value } })}
                          className={`${INPUT_CLASS} h-8 text-sm`} />
                      </div>
                      {taken > 0 && <p className="text-[10px] text-muted-foreground mt-0.5 pl-[46px]">{taken} prise{taken > 1 ? 's' : ''}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Max par client" hint="1 à 10 pièces par personne sur ce modèle.">
              <Input type="number" min={1} max={10} value={form.max_per_client}
                onChange={(e) => set({ max_per_client: e.target.value })} className={INPUT_CLASS} />
            </Field>
            <Field label="Ordre d'affichage">
              <Input type="number" value={form.sort_order} onChange={(e) => set({ sort_order: e.target.value })} className={INPUT_CLASS} />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Visible des clients</p>
              <p className="text-[11px] text-muted-foreground">Inactive, la pièce disparaît de la page Textile.</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => set({ is_active: v })} />
          </div>

          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={handleSave}>
            {saveMutation.isPending ? 'Sauvegarde…' : upload ? 'Envoi des images…' : 'Sauvegarder'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
