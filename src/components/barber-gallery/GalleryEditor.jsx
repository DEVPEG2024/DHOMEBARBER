import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { GALLERY_CAPTION_MAX, GALLERY_MAX, activeServicesQuery, galleryOf } from '@/lib/barberGallery';

// Photos envoyées par lot : le serveur limite les envois du staff à 60 par quart d'heure et par
// compte (routes/upload.js). Un lot de 10 laisse de la marge pour les autres écrans.
const BATCH_MAX = 10;

const errorText = (err, fallback) => {
  const msg = err?.message;
  return msg && !/^HTTP \d+$/.test(msg) && !(err instanceof TypeError) ? msg : fallback;
};

/**
 * Édition de la galerie de réalisations d'un barber (Mes paramètres, Équipe).
 * Chaque geste est enregistré tout de suite (`Employee.update({ gallery })`), sans passer
 * par le bouton « Sauvegarder » de la page : ajout de photos (plusieurs à la fois, envoyées
 * une par une), légende (à la sortie du champ), ordre (flèches), suppression en deux taps.
 *
 * Chaque geste est appliqué à la galerie relue sur le serveur juste avant l'écriture, pas à la
 * liste affichée : la même galerie s'édite depuis Mes paramètres (le barber) et depuis Équipe
 * (l'admin), et renvoyer une liste périmée effaçait les photos ajoutées ailleurs entre-temps.
 */
export default function GalleryEditor({ employee }) {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  // Prestations proposables sous chaque photo (« Réserver cette prestation » sur le profil)
  const servicesQuery = useQuery(activeServicesQuery(api));
  const services = Array.isArray(servicesQuery.data) ? servicesQuery.data : [];
  const [items, setItems] = useState(() => galleryOf(employee));
  const [uploading, setUploading] = useState(null); // { done, total }
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // url
  const busy = !!uploading || saving;
  // Les boutons de geste ne dépendent que de l'envoi des photos : l'enregistrement d'une légende
  // (au blur) ne doit pas les désactiver avant la fin du tap. Les enregistrements sont mis en file.
  const sending = !!uploading;
  const saveChainRef = useRef(Promise.resolve());
  const pendingSavesRef = useRef(0);
  // Liste à jour, lue par les enregistrements asynchrones (fin d'envoi, retour en arrière) :
  // une closure figée au début d'un envoi écraserait ce qui a changé entre-temps.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Légendes tapées mais pas encore enregistrées (urls) : une relecture du serveur ou la fin d'un
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
   */
  const save = async (apply, { success } = {}) => {
    const previous = itemsRef.current;
    const preview = apply(previous);
    if (preview) {
      itemsRef.current = preview;
      setItems(preview);
    }
    pendingSavesRef.current += 1;
    setSaving(true);
    const run = saveChainRef.current.then(() => persist(apply, previous, success));
    saveChainRef.current = run.catch(() => {});
    return run;
  };

  const persist = async (apply, previous, success) => {
    try {
      const base = await fetchServerGallery();
      const next = apply(base);
      if (!next) {
        const kept = keepTyped(base);
        itemsRef.current = kept;
        setItems(kept);
        toast.error('La photo a déjà été retirée ou modifiée ailleurs');
        queryClient.invalidateQueries({ queryKey: ['employees'] });
        return false;
      }
      await api.entities.Employee.update(employee.id, { gallery: next });
      // Liste du serveur fusionnée : les photos ajoutées ailleurs apparaissent tout de suite
      const kept = keepTyped(next);
      itemsRef.current = kept;
      setItems(kept);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      if (success) toast.success(success);
      return true;
    } catch (err) {
      const kept = keepTyped(previous);
      itemsRef.current = kept;
      setItems(kept);
      toast.error(errorText(err, 'Galerie non enregistrée, réessayez'));
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
        added.push({ url: file_url, caption: '' });
      } catch (err) {
        // Quota d'envoi atteint : les suivantes échoueraient toutes, on s'arrête (un seul message)
        if (err?.status === 429) { limited = true; break; }
        toast.error(errorText(err, `« ${file.name} » n'a pas pu être envoyée`));
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
      { success: 'Légende enregistrée' },
    );
  };

  // Prestation montrée par la photo : enregistrée tout de suite, comme les autres gestes
  const setService = (url, serviceId) => {
    const service = services.find((s) => String(s.id) === String(serviceId));
    save(
      (base) => (base.some((it) => it.url === url)
        ? base.map((it) => {
          if (it.url !== url) return it;
          const rest = { ...it };
          delete rest.service_id;
          return serviceId ? { ...rest, service_id: String(serviceId) } : rest;
        })
        : null),
      { success: service ? `Photo liée à « ${service.name} »` : 'Prestation retirée de la photo' },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] text-muted-foreground">
          {items.length}/{GALLERY_MAX} photos · visibles sur le profil public
        </p>
        <Button type="button" size="sm" variant="outline" className="text-xs shrink-0"
          onClick={() => inputRef.current?.click()} disabled={sending || items.length >= GALLERY_MAX}>
          {uploading ? (
            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />{uploading.done}/{uploading.total}</>
          ) : (
            <><ImagePlus className="w-3 h-3 mr-1.5" />Ajouter</>
          )}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      </div>

      {items.length === 0 ? (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={sending}
          className="w-full rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground hover:border-primary/40 transition-colors">
          <ImagePlus className="w-6 h-6 mx-auto mb-2 opacity-50" />
          Ajoutez vos plus belles coupes
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item, i) => (
            <div key={item.url} className="rounded-xl border border-border bg-secondary/40 overflow-hidden">
              <div className="relative aspect-square bg-black/40">
                <img src={item.url} alt={item.caption || `Réalisation ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 top-0 flex justify-between p-1.5">
                  <div className="flex gap-1">
                    <button type="button" aria-label="Plus tôt" disabled={sending || i === 0} onClick={() => move(i, -1)}
                      className="w-7 h-7 rounded-lg bg-black/60 text-white flex items-center justify-center disabled:opacity-30">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label="Plus tard" disabled={sending || i === items.length - 1} onClick={() => move(i, 1)}
                      className="w-7 h-7 rounded-lg bg-black/60 text-white flex items-center justify-center disabled:opacity-30">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {confirmDelete === item.url ? (
                    <button type="button" disabled={sending} onClick={() => remove(item.url)}
                      className="h-7 px-2 rounded-lg bg-destructive text-destructive-foreground text-[10px] font-semibold">
                      Retirer ?
                    </button>
                  ) : (
                    <button type="button" aria-label="Retirer la photo" disabled={sending} onClick={() => setConfirmDelete(item.url)}
                      className="w-7 h-7 rounded-lg bg-black/60 text-white flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {i === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 text-[9px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                    En premier
                  </span>
                )}
              </div>
              <input
                value={item.caption}
                onChange={(e) => setCaption(item.url, e.target.value.slice(0, GALLERY_CAPTION_MAX))}
                onBlur={() => commitCaption(item.url)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                placeholder="Légende…"
                maxLength={GALLERY_CAPTION_MAX}
                disabled={sending}
                className="w-full bg-transparent px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
              />
              {(() => {
                // Prestation retirée du catalogue depuis : signalée, le client ne la voit plus
                const linked = item.service_id ? services.find((s) => String(s.id) === String(item.service_id)) : null;
                const stale = !!item.service_id && servicesQuery.isSuccess && !linked;
                return (
                  <select
                    value={item.service_id && (linked || !servicesQuery.isSuccess) ? item.service_id : ''}
                    onChange={(e) => setService(item.url, e.target.value)}
                    disabled={sending || !servicesQuery.isSuccess}
                    aria-label="Prestation montrée par la photo"
                    className={`w-full border-t border-border bg-transparent px-2 py-2 text-[11px] focus:outline-none disabled:opacity-50 ${item.service_id && !stale ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    <option value="">{stale ? 'Prestation retirée : en choisir une' : 'Prestation (pour réserver)…'}</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-3">
        Liez chaque photo à sa prestation : sur votre profil, le client la réserve d'un tap depuis la photo.
      </p>
      <p className="text-[10px] text-muted-foreground mt-1">
        Demandez toujours l'accord du client avant de publier une photo où il est reconnaissable.
      </p>
    </div>
  );
}
