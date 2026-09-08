/**
 * Création / édition d'un drop (entité TextileDrop). Les dates sont saisies en heure locale
 * (`datetime-local`) et envoyées en ISO ; le serveur les stocke en TIMESTAMPTZ.
 */
import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, X, Image as ImageIcon, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DROP_STATUSES } from '@/lib/textileApi';
import {
  Field, INPUT_CLASS, invalidateTextile, toLocalInputValue, fromLocalInputValue, clampInt, uploadImageFile,
} from './shared';

const EMPTY_FORM = {
  name: '', tagline: '', description: '', cover_image_url: '', status: 'draft',
  starts_at: '', ends_at: '', reservation_hours: 72, sort_order: 0,
};

function formFromDrop(drop) {
  if (!drop) return { ...EMPTY_FORM };
  return {
    name: drop.name || '',
    tagline: drop.tagline || '',
    description: drop.description || '',
    cover_image_url: drop.cover_image_url || '',
    status: DROP_STATUSES.some((s) => s.value === drop.status) ? drop.status : 'draft',
    starts_at: toLocalInputValue(drop.starts_at),
    ends_at: toLocalInputValue(drop.ends_at),
    reservation_hours: drop.reservation_hours ?? 72,
    sort_order: drop.sort_order ?? 0,
  };
}

function payloadFromForm(form) {
  return {
    name: form.name.trim(),
    tagline: form.tagline.trim() || null,
    description: form.description.trim() || null,
    cover_image_url: form.cover_image_url || null,
    status: form.status,
    starts_at: fromLocalInputValue(form.starts_at),
    ends_at: fromLocalInputValue(form.ends_at),
    reservation_hours: clampInt(form.reservation_hours, 1, 720, 72),
    sort_order: clampInt(form.sort_order, -100000, 100000, 0),
  };
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {object|null} props.drop  Drop à modifier (null = création)
 */
export default function DropDialog({ open, onOpenChange, drop }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formFromDrop(drop));
  const [uploading, setUploading] = useState(false);

  // Réinitialise le formulaire à chaque ouverture (création ou drop différent)
  useEffect(() => {
    if (open) setForm(formFromDrop(drop));
  }, [open, drop]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const saveMutation = useMutation({
    mutationFn: (payload) => (drop?.id
      ? api.entities.TextileDrop.update(drop.id, payload)
      : api.entities.TextileDrop.create(payload)),
    onSuccess: () => {
      invalidateTextile(queryClient, 'textileDrops');
      toast.success(drop?.id ? 'Drop mis à jour' : 'Drop créé');
      onOpenChange(false);
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la sauvegarde'),
  });

  const handleSave = () => {
    const payload = payloadFromForm(form);
    if (!payload.name) { toast.error('Le nom du drop est obligatoire'); return; }
    if (payload.starts_at && payload.ends_at && new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      toast.error("La fin du drop doit être après son ouverture");
      return;
    }
    saveMutation.mutate(payload);
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      set({ cover_image_url: url });
      toast.success('Couverture ajoutée');
    } catch (err) {
      toast.error(err?.message || "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const goesLiveNow = form.status === 'live' && drop?.status !== 'live' && !drop?.alerts_sent_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{drop?.id ? 'Modifier le drop' : 'Nouveau drop'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Couverture */}
          <Field label="Couverture">
            <div className="flex items-center gap-4">
              <div className="w-28 aspect-[4/3] rounded-xl bg-secondary border border-border overflow-hidden flex items-center justify-center shrink-0">
                {form.cover_image_url ? (
                  <img src={form.cover_image_url} alt="Couverture du drop" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-7 h-7 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploading} />
                  <span className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-all cursor-pointer">
                    <Upload className="w-3 h-3" />
                    {uploading ? 'Envoi…' : form.cover_image_url ? 'Changer la photo' : 'Choisir une photo'}
                  </span>
                </label>
                {form.cover_image_url && (
                  <button type="button" onClick={() => set({ cover_image_url: '' })}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors">
                    <X className="w-3 h-3" /> Retirer
                  </button>
                )}
              </div>
            </div>
          </Field>

          <Field label="Nom">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} className={INPUT_CLASS} placeholder="Ex : Drop Automne 2026" maxLength={255} />
          </Field>
          <Field label="Accroche" hint="Une phrase courte affichée sous le nom.">
            <Input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} className={INPUT_CLASS} placeholder="Ex : 50 pièces, pas une de plus" maxLength={255} />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => set({ description: e.target.value })} className={INPUT_CLASS} rows={3} />
          </Field>

          <Field label="Statut" hint={DROP_STATUSES.find((s) => s.value === form.status)?.hint}>
            <Select value={form.status} onValueChange={(v) => set({ status: v })}>
              <SelectTrigger className={INPUT_CLASS}><SelectValue /></SelectTrigger>
              <SelectContent>
                {DROP_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {goesLiveNow && (
            <div className="flex items-start gap-2 rounded-lg border border-green-500/25 bg-green-500/10 p-3 text-xs text-green-300">
              <Rocket className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Enregistrer avec le statut « Ouvert » envoie immédiatement le push d'ouverture aux abonnés de l'alerte.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Ouverture" hint="Passage automatique en « Ouvert » à cette heure.">
              <Input type="datetime-local" value={form.starts_at} onChange={(e) => set({ starts_at: e.target.value })} className={INPUT_CLASS} />
            </Field>
            <Field label="Fin" hint="Passage automatique en « Terminé ».">
              <Input type="datetime-local" value={form.ends_at} onChange={(e) => set({ ends_at: e.target.value })} className={INPUT_CLASS} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Délai de paiement (heures)" hint="Précommande : une réservation non payée au salon dans ce délai expire et la pièce est remise en vente.">
              <Input type="number" min={1} max={720} value={form.reservation_hours}
                onChange={(e) => set({ reservation_hours: e.target.value })} className={INPUT_CLASS} />
            </Field>
            <Field label="Ordre d'affichage">
              <Input type="number" value={form.sort_order} onChange={(e) => set({ sort_order: e.target.value })} className={INPUT_CLASS} />
            </Field>
          </div>

          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={saveMutation.isPending || uploading} onClick={handleSave}>
            {saveMutation.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
