/**
 * Création / édition d'un événement du salon (entité SalonEvent, admin).
 *
 * Photos : une seule galerie (multi-upload séquentiel via UploadFile, réordonnable, max 8) dont la
 * première image sert de couverture → `cover_image_url = images[0]`, la liste complète part dans
 * `images` (même convention que les produits de la boutique). Les dates sont saisies en heure
 * locale (`datetime-local`) et envoyées en ISO ; le serveur les stocke en TIMESTAMPTZ.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, X, ArrowLeft, ArrowRight, Image as ImageIcon, Bell, CalendarClock, Info } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SALON_EVENT_STATUSES, SALON_EVENT_VISIBILITIES } from '@/lib/salonEventsApi';
import {
  Field, INPUT_CLASS, invalidateSalonEvents, toLocalInputValue, fromLocalInputValue, clampInt, uploadImageFile,
  SALON_ADDRESS, MAX_IMAGES, mergeImages, eventStatusHint,
} from './shared';

const TITLE_MAX = 255;
const DESCRIPTION_MAX = 5000;
const LOCATION_MAX = 255;
const DRESS_CODE_MAX = 255;
const NOTES_MAX = 2000;
const CAPACITY_MAX = 1000;

const EMPTY_FORM = {
  title: '', description: '', images: [], starts_at: '', ends_at: '', location: SALON_ADDRESS,
  price: '', capacity: '', dress_code: '', visibility: 'invite', notes: '', status: 'draft',
};

function formFromEvent(event) {
  if (!event) return { ...EMPTY_FORM, images: [] };
  return {
    title: event.title || '',
    description: event.description || '',
    images: mergeImages(event.cover_image_url, event.images),
    starts_at: toLocalInputValue(event.starts_at),
    ends_at: toLocalInputValue(event.ends_at),
    location: event.location ?? SALON_ADDRESS,
    price: event.price == null || Number(event.price) <= 0 ? '' : String(event.price),
    capacity: event.capacity == null ? '' : String(event.capacity),
    dress_code: event.dress_code || '',
    visibility: SALON_EVENT_VISIBILITIES.some((v) => v.value === event.visibility) ? event.visibility : 'invite',
    notes: event.notes || '',
    status: SALON_EVENT_STATUSES.some((s) => s.value === event.status) ? event.status : 'draft',
  };
}

function parsePrice(raw) {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!text) return null; // offert
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return NaN;
  const rounded = Math.round(n * 100) / 100;
  return rounded > 0 ? rounded : null;
}

function payloadFromForm(form) {
  const images = form.images.slice(0, MAX_IMAGES);
  const capacityRaw = String(form.capacity ?? '').trim();
  return {
    title: form.title.trim().slice(0, TITLE_MAX),
    description: form.description.trim().slice(0, DESCRIPTION_MAX) || null,
    cover_image_url: images[0] || null,
    images,
    starts_at: fromLocalInputValue(form.starts_at),
    ends_at: fromLocalInputValue(form.ends_at),
    location: form.location.trim().slice(0, LOCATION_MAX) || null,
    price: parsePrice(form.price),
    capacity: capacityRaw ? clampInt(capacityRaw, 1, CAPACITY_MAX, null) : null,
    status: form.status,
    visibility: form.visibility,
    dress_code: form.dress_code.trim().slice(0, DRESS_CODE_MAX) || null,
    notes: form.notes.trim().slice(0, NOTES_MAX) || null,
  };
}

function Notice({ icon: Icon, tone = 'info', children }) {
  const cls = tone === 'danger'
    ? 'border-red-500/25 bg-red-500/10 text-red-300'
    : tone === 'success'
      ? 'border-green-500/25 bg-green-500/10 text-green-300'
      : 'border-border bg-secondary/50 text-muted-foreground';
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${cls}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {object|null} props.event  Événement à modifier (null = création)
 */
export default function EventDialog({ open, onOpenChange, event }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formFromEvent(event));
  const [upload, setUpload] = useState(null); // { done, total } pendant un envoi
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) { setForm(formFromEvent(event)); setUpload(null); }
  }, [open, event]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const saveMutation = useMutation({
    mutationFn: (payload) => (event?.id
      ? api.entities.SalonEvent.update(event.id, payload)
      : api.entities.SalonEvent.create(payload)),
    onSuccess: () => {
      invalidateSalonEvents(queryClient, event?.id);
      toast.success(event?.id ? 'Événement mis à jour' : 'Événement créé');
      onOpenChange(false);
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la sauvegarde'),
  });

  const handleSave = () => {
    const payload = payloadFromForm(form);
    if (!payload.title) { toast.error("Le titre de l'événement est obligatoire"); return; }
    if (!payload.starts_at) { toast.error('La date de début est obligatoire'); return; }
    if (payload.ends_at && new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      toast.error('La fin doit être après le début'); return;
    }
    if (Number.isNaN(payload.price)) { toast.error('Prix invalide (laissez vide pour un événement offert)'); return; }
    if (String(form.capacity).trim() && payload.capacity == null) {
      toast.error(`Capacité invalide : un nombre entre 1 et ${CAPACITY_MAX}, ou vide pour illimité`); return;
    }
    saveMutation.mutate(payload);
  };

  // ─── Images ───
  const handleImagesUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_IMAGES - form.images.length;
    if (room <= 0) { toast.error(`${MAX_IMAGES} photos maximum`); return; }
    const batch = files.slice(0, room);
    if (files.length > room) toast.warning(`Seules ${room} photo${room > 1 ? 's' : ''} ajoutée${room > 1 ? 's' : ''} : ${MAX_IMAGES} maximum`);
    setUpload({ done: 0, total: batch.length });
    for (const file of batch) {
      try {
        const url = await uploadImageFile(file);
        setForm((prev) => (prev.images.length >= MAX_IMAGES || prev.images.includes(url) ? prev : { ...prev, images: [...prev.images, url] }));
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

  // ─── Avertissements (hooks serveur) ───
  const wasPublished = event?.status === 'published';
  const cancelsNow = form.status === 'cancelled' && event?.status !== 'cancelled' && wasPublished;
  const publishesNow = form.status === 'published' && event?.status !== 'published';
  const rescheduled = wasPublished && form.status === 'published' && !!event?.starts_at && !!form.starts_at
    && toLocalInputValue(event.starts_at) !== form.starts_at;
  const statusOptions = event?.id ? SALON_EVENT_STATUSES : SALON_EVENT_STATUSES.filter((s) => s.value === 'draft' || s.value === 'published');

  const busy = saveMutation.isPending || !!upload;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{event?.id ? "Modifier l'événement" : 'Nouvel événement'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Photos */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Photos <span className="text-muted-foreground">({form.images.length}/{MAX_IMAGES}, la première sert de couverture)</span></Label>
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
                <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-40" />
                Aucune photo : la carte s'affichera avec un fond dégradé.
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {form.images.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
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

          <Field label="Titre">
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} className={INPUT_CLASS}
              placeholder="Ex : Soirée du Gang, dégustation whisky & cigares" maxLength={TITLE_MAX} />
          </Field>
          <Field label="Description" hint="Programme, ambiance, ce qui est compris… affichée en entier aux invités.">
            <Textarea value={form.description} onChange={(e) => set({ description: e.target.value.slice(0, DESCRIPTION_MAX) })}
              className={INPUT_CLASS} rows={5} maxLength={DESCRIPTION_MAX} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Début">
              <Input type="datetime-local" value={form.starts_at} onChange={(e) => set({ starts_at: e.target.value })} className={INPUT_CLASS} />
            </Field>
            <Field label="Fin" hint="Facultative.">
              <Input type="datetime-local" value={form.ends_at} onChange={(e) => set({ ends_at: e.target.value })} className={INPUT_CLASS} />
            </Field>
          </div>
          {rescheduled && (
            <Notice icon={CalendarClock}>
              L'horaire d'un événement publié change : les invités reçoivent un push « 📅 {form.title.trim() || 'Événement'} : nouvel horaire ».
            </Notice>
          )}

          <Field label="Lieu">
            <Input value={form.location} onChange={(e) => set({ location: e.target.value })} className={INPUT_CLASS}
              placeholder={SALON_ADDRESS} maxLength={LOCATION_MAX} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix (€)" hint="Vide = offert.">
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={form.price}
                onChange={(e) => set({ price: e.target.value })} className={INPUT_CLASS} placeholder="Offert" />
            </Field>
            <Field label="Capacité (places)" hint="Vide = illimité.">
              <Input type="number" min={1} max={CAPACITY_MAX} inputMode="numeric" value={form.capacity}
                onChange={(e) => set({ capacity: e.target.value })} className={INPUT_CLASS} placeholder="Illimité" />
            </Field>
          </div>

          <Field label="Tenue" hint="Facultative (ex : « Chic décontracté », « Tenue blanche »).">
            <Input value={form.dress_code} onChange={(e) => set({ dress_code: e.target.value })} className={INPUT_CLASS} maxLength={DRESS_CODE_MAX} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Visibilité" hint={SALON_EVENT_VISIBILITIES.find((v) => v.value === form.visibility)?.hint}>
              <Select value={form.visibility} onValueChange={(v) => set({ visibility: v })}>
                <SelectTrigger className={INPUT_CLASS}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SALON_EVENT_VISIBILITIES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Statut" hint={eventStatusHint(form.status)}>
              <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger className={INPUT_CLASS}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {publishesNow && (
            <Notice icon={Info} tone="success">
              Publier rend l'événement visible {form.visibility === 'public' ? 'de tous les clients' : 'des clients invités'}, mais
              <span className="font-semibold"> ne prévient personne</span> : envoyez ensuite les invitations depuis le panneau « Invités ».
            </Notice>
          )}
          {cancelsNow && (
            <Notice icon={Bell} tone="danger">
              Annuler envoie immédiatement un push « ❌ {form.title.trim() || 'Événement'} est annulé » à tous les invités qui n'ont pas refusé.
            </Notice>
          )}

          <Field label="Notes internes" hint="Visibles du staff seulement (traiteur, budget, à prévoir…).">
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value.slice(0, NOTES_MAX) })}
              className={INPUT_CLASS} rows={3} maxLength={NOTES_MAX} />
          </Field>

          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={handleSave}>
            {saveMutation.isPending ? 'Sauvegarde…' : upload ? 'Envoi des photos…' : 'Sauvegarder'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
