import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { adminErrorMessage } from '@/lib/adminErrors';
import {
  GALLERY_CAPTION_MAX, GALLERY_MAX, LOOK_MAX, activeServicesQuery, galleryOf, serializeGallery,
} from '@/lib/barberGallery';
import LookServicesField from './LookServicesField';
import LookServicePicker from './LookServicePicker';

// Photos envoyées par lot : le serveur limite les envois du staff à 60 par quart d'heure et par
// compte (routes/upload.js). Un lot de 10 laisse de la marge pour les autres écrans.
const BATCH_MAX = 10;

/**
 * Édition de la galerie de réalisations d'un barber (Mes paramètres, Équipe). Chaque photo est un
 * « look » : un titre (la légende) et de 1 à `LOOK_MAX` prestations, que le client réserve d'un tap
 * depuis le profil.
 * Chaque geste est enregistré tout de suite (`Employee.update({ gallery })`), sans passer par le
 * bouton « Sauvegarder » de la page : ajout de photos (plusieurs à la fois, envoyées une par une),
 * titre (à la sortie du champ), ordre (flèches), suppression en deux taps, ajout ou retrait d'une
 * prestation du look (puces, fenêtre de recherche). Toute écriture passe par `serializeGallery`
 * (`service_ids` + `service_id` = la première, lue par les apps publiées).
 *
 * Chaque geste est appliqué à la galerie relue sur le serveur juste avant l'écriture, pas à la
 * liste affichée : la même galerie s'édite depuis Mes paramètres (le barber) et depuis Équipe
 * (l'admin), et renvoyer une liste périmée effaçait les photos ajoutées ailleurs entre-temps.
 */
export default function GalleryEditor({ employee }) {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  // Catalogue actif : prestations proposables dans un look, prix et durées des puces
  const servicesQuery = useQuery(activeServicesQuery(api));
  const services = useMemo(() => (Array.isArray(servicesQuery.data) ? servicesQuery.data : []), [servicesQuery.data]);
  const serviceById = useMemo(() => new Map(services.map((s) => [String(s.id), s])), [services]);
  const catalogFailed = queryFailed(servicesQuery);
  const catalogState = Array.isArray(servicesQuery.data) ? 'ready' : catalogFailed ? 'failed' : 'loading';
  const [items, setItems] = useState(() => galleryOf(employee));
  const [uploading, setUploading] = useState(null); // { done, total }
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // url
  const [pickerUrl, setPickerUrl] = useState(null); // photo dont la fenêtre des prestations est ouverte
  const busy = !!uploading || saving;
  // Les boutons de geste ne dépendent que de l'envoi des photos : l'enregistrement d'un titre
  // (au blur) ne doit pas les désactiver avant la fin du tap. Les enregistrements sont mis en file.
  const sending = !!uploading;
  const saveChainRef = useRef(Promise.resolve());
  const pendingSavesRef = useRef(0);
  // Liste à jour, lue par les enregistrements asynchrones (fin d'envoi, retour en arrière) :
  // une closure figée au début d'un envoi écraserait ce qui a changé entre-temps.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Titres tapés mais pas encore enregistrés (urls) : une relecture du serveur ou la fin d'un
  // enregistrement précédent ne doit pas les écraser (le champ reste actif pendant une sauvegarde).
  const dirtyRef = useRef(new Set());
  const keepTyped = (list) => (dirtyRef.current.size === 0 ? list : list.map((it) => {
    if (!dirtyRef.current.has(it.url)) return it;
    const local = itemsRef.current.find((l) => l.url === it.url);
    return local ? { ...it, caption: local.caption } : it;
  }));

  // Fiche rechargée ailleurs : on reprend la galerie du serveur, sauf pendant un envoi
  const serverKey = JSON.stringify(galleryOf(employee));
  useEffect(() => {
    if (!busy) setItems(keepTyped(JSON.parse(serverKey)));
  }, [serverKey]);

  // Galerie telle qu'elle est en base (lecture publique des barbers, `gallery` comprise)
  const fetchServerGallery = async () => {
    const rows = await api.entities.Employee.filter({ id: employee.id }, undefined, 1);
    if (!rows?.[0]) throw new Error('Fiche introuvable, rechargez la page');
    return galleryOf(rows[0]);
  };

  /**
   * Enregistre un geste. `apply(galerie)` renvoie la nouvelle galerie, ou null si le geste ne
   * s'applique plus (photo retirée ailleurs). Il sert deux fois : sur la liste affichée pour
   * l'aperçu immédiat, puis sur la galerie relue sur le serveur pour l'écriture.
   * `toastId` : les messages de succès d'une même photo se remplacent (plusieurs ajouts d'affilée).
   */
  const save = async (apply, { success, toastId } = {}) => {
    const previous = itemsRef.current;
    const preview = apply(previous);
    if (preview) {
      itemsRef.current = preview;
      setItems(preview);
    }
    pendingSavesRef.current += 1;
    setSaving(true);
    const run = saveChainRef.current.then(() => persist(apply, previous, success, toastId));
    saveChainRef.current = run.catch(() => {});
    return run;
  };

  const persist = async (apply, previous, success, toastId) => {
    let base = null;
    try {
      base = await fetchServerGallery();
      const next = apply(base);
      if (!next) {
        const kept = keepTyped(base);
        itemsRef.current = kept;
        setItems(kept);
        toast.error('La photo a déjà été retirée ou modifiée ailleurs');
        queryClient.invalidateQueries({ queryKey: ['employees'] });
        return false;
      }
      await api.entities.Employee.update(employee.id, { gallery: serializeGallery(next) });
      // Liste du serveur fusionnée : les photos ajoutées ailleurs apparaissent tout de suite. Sauf si
      // d'autres gestes attendent leur tour : l'aperçu (qui les contient déjà) reste affiché, sinon
      // le geste suivant disparaissait un instant et le plafond de 5 prestations lisait une liste en retard
      if (pendingSavesRef.current <= 1) {
        const kept = keepTyped(next);
        itemsRef.current = kept;
        setItems(kept);
      }
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      if (success) toast.success(success, toastId ? { id: toastId } : undefined);
      return true;
    } catch (err) {
      // Refus du serveur (« 5 prestations au plus par photo »…) : son message, et la galerie telle
      // qu'il l'a gardée ; sans réponse (réseau), la liste d'avant le geste
      const kept = keepTyped(base || previous);
      itemsRef.current = kept;
      setItems(kept);
      toast.error(adminErrorMessage(err, 'Galerie non enregistrée, réessayez'));
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      return false;
    } finally {
      pendingSavesRef.current -= 1;
      if (pendingSavesRef.current <= 0) setSaving(false);
    }
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !employee?.id) return;
    const room = GALLERY_MAX - items.length;
    if (room <= 0) return toast.error(`La galerie est limitée à ${GALLERY_MAX} photos`);
    const batch = files.slice(0, Math.min(room, BATCH_MAX));
    if (files.length > batch.length) {
      toast.message(batch.length === room
        ? `Seules ${room} photo(s) ajoutée(s) : ${GALLERY_MAX} au maximum`
        : `${BATCH_MAX} photos au plus par envoi : ajoutez la suite ensuite`);
    }

    setUploading({ done: 0, total: batch.length });
    const added = [];
    let limited = false;
    for (const file of batch) {
      try {
        const { file_url } = await api.integrations.Core.UploadFile({ file });
        added.push({ url: file_url, caption: '', service_ids: [] });
      } catch (err) {
        // Quota d'envoi atteint : les suivantes échoueraient toutes, on s'arrête (un seul message)
        if (err?.status === 429) { limited = true; break; }
        toast.error(adminErrorMessage(err, `« ${file.name} » n'a pas pu être envoyée`));
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    if (limited) {
      toast.error(`Limite d'envoi atteinte : réessayez dans 15 min (${added.length} photo(s) ajoutée(s))`);
    }
    if (added.length) {
      // Les plus récentes en tête : c'est ce que les clients voient d'abord
      await save(
        (base) => [...added, ...base.filter((it) => !added.some((a) => a.url === it.url))].slice(0, GALLERY_MAX),
        { success: added.length > 1 ? `${added.length} photos ajoutées` : 'Photo ajoutée' },
      );
    }
  };

  const move = (index, dir) => {
    const list = itemsRef.current;
    const target = index + dir;
    if (target < 0 || target >= list.length || !list[index]) return;
    // Gestes exprimés par URL : la galerie du serveur peut compter d'autres photos
    const a = list[index].url;
    const b = list[target].url;
    save((base) => {
      const i = base.findIndex((it) => it.url === a);
      const j = base.findIndex((it) => it.url === b);
      if (i < 0 || j < 0) return null;
      const next = [...base];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const remove = (url) => {
    setConfirmDelete(null);
    if (pickerUrl === url) setPickerUrl(null);
    save((base) => base.filter((it) => it.url !== url), { success: 'Photo retirée' });
  };

  const setCaption = (url, caption) => {
    dirtyRef.current.add(url);
    setItems((list) => list.map((it) => (it.url === url ? { ...it, caption } : it)));
  };
  const commitCaption = (url) => {
    dirtyRef.current.delete(url);
    const server = galleryOf(employee).find((it) => it.url === url);
    const local = items.find((it) => it.url === url);
    if (!local || (server && server.caption === local.caption.trim())) return;
    const caption = local.caption.trim();
    save(
      (base) => (base.some((it) => it.url === url)
        ? base.map((it) => (it.url === url ? { ...it, caption } : it))
        : null),
      { success: 'Titre du look enregistré' },
    );
  };

  // Prestations du look : chaque ajout ou retrait est enregistré tout de suite, comme les autres gestes
  const removeService = (url, id, label) => {
    save(
      (base) => (base.some((it) => it.url === url)
        ? base.map((it) => (it.url === url ? { ...it, service_ids: it.service_ids.filter((s) => s !== id) } : it))
        : null),
      { success: label ? `« ${label} » retirée du look` : 'Prestation retirée du look', toastId: `look-${url}` },
    );
  };

  const toggleService = (url, service) => {
    const id = String(service.id);
    const label = String(service.name || '').trim();
    const current = itemsRef.current.find((it) => it.url === url);
    if (!current) return;
    if (current.service_ids.includes(id)) {
      removeService(url, id, label);
      return;
    }
    if (current.service_ids.length >= LOOK_MAX) {
      toast.error(`${LOOK_MAX} prestations au plus par look`);
      return;
    }
    save(
      (base) => {
        const it = base.find((x) => x.url === url);
        // Photo retirée, ou look complété ailleurs entre-temps : le geste ne s'applique plus
        if (!it || (!it.service_ids.includes(id) && it.service_ids.length >= LOOK_MAX)) return null;
        if (it.service_ids.includes(id)) return base;
        return base.map((x) => (x.url === url ? { ...x, service_ids: [...x.service_ids, id] } : x));
      },
      { success: `« ${label} » ajoutée au look`, toastId: `look-${url}` },
    );
  };

  const pickerIndex = pickerUrl ? items.findIndex((it) => it.url === pickerUrl) : -1;
  const pickerItem = pickerIndex >= 0 ? items[pickerIndex] : null;

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] text-muted-foreground min-w-0">
          {items.length}/{GALLERY_MAX} photos · chaque photo est un look à réserver
        </p>
        <Button type="button" size="sm" variant="outline" className="text-xs shrink-0"
          aria-label="Ajouter des photos"
          onClick={() => inputRef.current?.click()} disabled={sending || items.length >= GALLERY_MAX}>
          {uploading ? (
            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />{uploading.done}/{uploading.total}</>
          ) : (
            <><ImagePlus className="w-3 h-3 mr-1.5" />Photos</>
          )}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      </div>

      {/* Catalogue introuvable : un seul message pour toute la galerie, « Ajouter » désactivé sous chaque photo */}
      {catalogFailed && items.length > 0 && (
        <LoadError
          compact
          what="les prestations"
          error={servicesQuery.error}
          onRetry={servicesQuery.refetch}
          retrying={servicesQuery.isFetching}
          className="mb-3"
        />
      )}

      {items.length === 0 ? (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={sending}
          className="w-full rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground hover:border-primary/40 transition-colors">
          <ImagePlus className="w-6 h-6 mx-auto mb-2 opacity-50" />
          Ajoutez vos plus belles coupes
        </button>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={item.url} role="group" aria-label={`Photo ${i + 1}`}
              className="rounded-2xl border border-border bg-secondary/40 overflow-hidden">
              <div className="relative aspect-[16/9] bg-black/40">
                <img src={item.url} alt={item.caption || `Réalisation ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 top-0 flex justify-between p-1.5">
                  <div className="flex gap-1">
                    <button type="button" aria-label="Plus tôt" disabled={sending || i === 0} onClick={() => move(i, -1)}
                      className="w-8 h-8 rounded-lg bg-black/60 text-white flex items-center justify-center disabled:opacity-30">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label="Plus tard" disabled={sending || i === items.length - 1} onClick={() => move(i, 1)}
                      className="w-8 h-8 rounded-lg bg-black/60 text-white flex items-center justify-center disabled:opacity-30">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  {confirmDelete === item.url ? (
                    <button type="button" disabled={sending} onClick={() => remove(item.url)}
                      className="h-8 px-2.5 rounded-lg bg-destructive text-destructive-foreground text-[11px] font-semibold">
                      Retirer ?
                    </button>
                  ) : (
                    <button type="button" aria-label="Retirer la photo" disabled={sending} onClick={() => setConfirmDelete(item.url)}
                      className="w-8 h-8 rounded-lg bg-black/60 text-white flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                  <span className="text-[10px] font-semibold bg-black/65 text-white px-1.5 py-0.5 rounded">Photo {i + 1}</span>
                  {i === 0 && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                      En premier
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 space-y-3">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Titre du look</span>
                  <input
                    value={item.caption}
                    onChange={(e) => setCaption(item.url, e.target.value.slice(0, GALLERY_CAPTION_MAX))}
                    onBlur={() => commitCaption(item.url)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    placeholder="Ex. Dégradé américain, barbe sculptée"
                    maxLength={GALLERY_CAPTION_MAX}
                    disabled={sending}
                    enterKeyHint="done"
                    className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 disabled:opacity-50"
                  />
                </label>
                <LookServicesField
                  ids={item.service_ids}
                  byId={serviceById}
                  catalog={catalogState}
                  disabled={sending}
                  onRemove={(id, label) => removeService(item.url, id, label)}
                  onOpenPicker={() => setPickerUrl(item.url)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-3">
        Sur le profil, le client réserve un look d&apos;un tap, avec toutes ses prestations.
      </p>
      <p className="text-[10px] text-muted-foreground mt-1">
        Demandez toujours l&apos;accord du client avant de publier une photo où il est reconnaissable.
      </p>

      {pickerItem && (
        <LookServicePicker
          title={pickerItem.caption.trim() || `Photo ${pickerIndex + 1}`}
          selectedIds={pickerItem.service_ids}
          catalog={services}
          catalogQuery={servicesQuery}
          catalogFailed={catalogFailed}
          onToggle={(service) => toggleService(pickerItem.url, service)}
          onClose={() => setPickerUrl(null)}
        />
      )}
    </div>
  );
}
