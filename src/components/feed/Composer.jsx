import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Plus, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import FeedSheet from '@/components/feed/FeedSheet';
import { AuthorAvatar } from '@/components/feed/AuthorLine';
import VisitPicker, { BarberThumb, VisitRow } from '@/components/feed/VisitPicker';
import LegalLink from '@/components/shared/LegalLink';
import LoadError, { friendlyError, queryFailed } from '@/components/shared/LoadError';
import { Switch } from '@/components/ui/switch';
import { contentFilterError } from '@/lib/contentFilter';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { createFeedPost, FEED_KEYS, fetchLookVisits } from '@/lib/feed/feedApi';
import { invalidateFeed, prependFeedItem } from '@/lib/feed/feedCache';
import { legacyItem, MAX_IMAGES, SALON_LOGO, SALON_NAME } from '@/lib/feed/rules';

// Bornes du serveur (lib/feedRules.js)
const POST_MAX = 5000;
const POLL_QUESTION_MAX = 200;
const POLL_LABEL_MAX = 60;
const POLL_OPTIONS_MIN = 2;
const POLL_OPTIONS_MAX = 4;
const POLL_DAYS = [1, 3, 7];

const KIND_LABELS = { post: 'Publication', look: 'Mon look', poll: 'Sondage', before_after: 'Avant/Après' };

/** Formats que ce compte peut publier (ancien fil : la publication seule). */
function kindsFor(user, legacy) {
  if (legacy) return ['post'];
  if (user?.role === 'admin') return ['post', 'poll'];
  if (user?.role === 'user') return ['post', 'look', 'before_after'];
  return ['post'];
}

/** Filtres du fil où la publication apparaît tout de suite (en plus de « Tout »). */
function filtersFor(kind, isAdmin) {
  const out = ['all'];
  if (kind === 'look' || kind === 'before_after') out.push('looks');
  if (kind === 'poll') out.push('polls');
  if (isAdmin) out.push('salon');
  return out;
}

const errorText = (err, fallback) => friendlyError(err, fallback, { foreign: fallback });

let optionSeq = 0;
const newOption = (label = '') => ({ key: `o${++optionSeq}`, label });

// ─── Brouillons ───
// L'ancien fil gardait le texte et la photo à la fermeture du composeur : la croix, Échap ou un
// retour Android accidentel ne doivent rien effacer. Brouillon gardé en mémoire du module (jamais
// dans le stockage du navigateur), par compte et par onglet, rendu à la réouverture, effacé
// seulement après « Publier » réussi. Une photo encore en envoi à la fermeture y arrive quand même.
const BLANK = {
  post: () => ({ content: '', photos: [], pending: 0 }),
  look: () => ({ content: '', photos: [], pending: 0, visitId: null, bookable: true }),
  before_after: () => ({ content: '', before: '', after: '', busyBefore: false, busyAfter: false, visitId: null }),
  poll: () => ({ question: '', options: [newOption(), newOption()], days: 3 }),
};
const drafts = new Map();
const draftListeners = new Set();

/** Brouillon d'un compte : `{ draft: { post, look, before_after, poll }, gen, seq }`. */
function draftEntry(account) {
  let entry = drafts.get(account);
  if (!entry) {
    entry = {
      draft: Object.fromEntries(Object.entries(BLANK).map(([k, make]) => [k, make()])),
      // Génération par onglet : un envoi de photo parti avant « Publier » n'y revient jamais
      gen: { post: 0, look: 0, before_after: 0, poll: 0 },
      // Envoi en cours par emplacement de l'avant / après (un retrait ou un nouveau choix l'annule)
      seq: { before: 0, after: 0 },
    };
    drafts.set(account, entry);
  }
  return entry;
}
function updateTab(account, kind, fn) {
  const entry = draftEntry(account);
  const cur = entry.draft[kind];
  const next = fn(cur);
  if (next === cur) return;
  entry.draft = { ...entry.draft, [kind]: next };
  draftListeners.forEach((l) => l());
}
function clearTab(account, kind) {
  const entry = draftEntry(account);
  entry.gen[kind] += 1;
  if (kind === 'before_after') entry.seq = { before: entry.seq.before + 1, after: entry.seq.after + 1 };
  updateTab(account, kind, () => BLANK[kind]());
}
const subscribeDrafts = (listener) => {
  draftListeners.add(listener);
  return () => draftListeners.delete(listener);
};

/** Vignettes 4:5 des photos (retirer, ajouter), envois en cours compris. */
function PhotoGrid({ photos, pending, max, onAdd, onRemove }) {
  const full = photos.length + pending >= max;
  return (
    <div className={`grid gap-2 ${max === 1 ? 'grid-cols-3' : 'grid-cols-4'}`}>
      {photos.map((url, i) => (
        <div key={url} className="relative aspect-[4/5] rounded-xl bg-secondary">
          <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Retirer la photo ${i + 1}`}
            className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white after:absolute after:-inset-2"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ))}
      {Array.from({ length: pending }, (_, i) => (
        <div key={`envoi-${i}`} role="status" className="flex aspect-[4/5] items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="sr-only">Envoi de la photo…</span>
        </div>
      ))}
      {!full && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Ajouter une photo"
          className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-muted-foreground/40 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          Ajouter
        </button>
      )}
    </div>
  );
}

/** Emplacement d'une photo de l'avant / après. */
function SlotTile({ label, url, busy, onPick, onRemove }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[13px] font-semibold text-foreground/85">{label}</p>
      {url ? (
        <div className="relative aspect-[4/5] rounded-xl bg-secondary">
          <img src={url} alt={`Photo ${label.toLowerCase()}`} className="h-full w-full rounded-xl object-cover" />
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Retirer la photo ${label.toLowerCase()}`}
            className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white after:absolute after:-inset-2"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ) : busy ? (
        <div role="status" className="flex aspect-[4/5] items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="sr-only">Envoi de la photo {label.toLowerCase()}…</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          aria-label={`Ajouter la photo ${label.toLowerCase()}`}
          className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/40 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
        >
          <ImagePlus className="h-6 w-6" aria-hidden="true" />
          Photo {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

/** Visite choisie (photo du barber, prestations, date) + « Changer » qui déplie la liste. */
function VisitChooser({ title, visits, value, onChange, allowNone = false }) {
  const [open, setOpen] = useState(false);
  const current = visits.find((v) => String(v.id) === String(value)) || null;
  const canChange = visits.length > 1 || allowNone;
  // Look sans visite choisie (visite demandée indisponible) : la liste s'affiche, le client choisit
  const showList = open || (!current && !allowNone);
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-foreground/85">{title}</p>
      {showList ? (
        // Un clic (ou Entrée) choisit puis replie (à la remontée du clic : en capture, la liste
        // disparaissait avant que le bouton reçoive le clic) ; les flèches changent sans replier
        <div onClick={() => setOpen(false)}>
          <VisitPicker visits={visits} value={value} onChange={onChange} allowNone={allowNone} />
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-primary/35 bg-primary/5 p-3">
          {current
            ? <VisitRow visit={current} />
            : <span className="min-w-0 flex-1 text-sm text-muted-foreground">Aucune visite liée</span>}
          {canChange && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={false}
              className="h-9 shrink-0 rounded-[10px] border border-border bg-secondary px-3 text-xs font-semibold text-foreground/85 hover:text-foreground"
            >
              {current || !allowNone ? 'Changer' : 'Choisir'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Composeur du fil (fil v2, contrat section 5) : onglets Publication (tous), Mon look et
 * Avant/Après (clients), Sondage (admin) ; ancien fil (`legacy`) : la publication seule, une photo,
 * envoyée par `Post.create` comme avant.
 *
 * Brouillon gardé à la fermeture (par compte et par onglet, voir « Brouillons » plus haut). Photos
 * envoyées une par une (`UploadFile`) ; une photo arrivée après « Publier » ou un retrait n'est
 * jamais rajoutée (génération par onglet). Envoi `createFeedPost`, puis la publication en tête du
 * fil (`prependFeedItem`), toast « Publication envoyée 🎉 » et `onPublished(item)` (l'appelant
 * ferme et remonte en haut). Le composeur ne se ferme pas seul.
 *
 * @param {object} props
 * @param {object} props.user
 * @param {'post'|'look'|'poll'|'before_after'} [props.initialKind]
 * @param {string} [props.initialVisitId]   visite à montrer (`?compose=look&visit=<id>`, push après la visite)
 * @param {() => void} props.onClose
 * @param {(item: object|null) => void} [props.onPublished]
 * @param {boolean} [props.legacy]
 */
export default function Composer({ user, initialKind = 'post', initialVisitId = null, onClose, onPublished, legacy = false }) {
  const qc = useQueryClient();
  const uid = useId();
  const role = user?.role;
  const isAdmin = role === 'admin';
  const isClient = role === 'user';
  const isStaff = isAdmin || role === 'barber';
  const kinds = kindsFor(user, legacy);
  const [kindState, setKind] = useState(() => (kindsFor(user, legacy).includes(initialKind) ? initialKind : 'post'));
  const kind = kinds.includes(kindState) ? kindState : 'post';
  const maxPhotos = legacy ? 1 : MAX_IMAGES;

  const [posting, setPosting] = useState(false);

  // Brouillon du compte (mémoire du module), un par onglet
  const account = String(user?.id || user?.email || 'invite');
  const draft = useSyncExternalStore(subscribeDrafts, () => draftEntry(account).draft);
  const tab = (k, fn) => updateTab(account, k, fn);
  const photoTab = kind === 'look' ? 'look' : 'post';
  const photos = legacy ? draft.post.photos.slice(0, 1) : draft[photoTab].photos;
  const pending = draft[photoTab].pending;
  const content = kind === 'poll' ? '' : draft[kind].content;
  const setContent = (v) => { if (kind !== 'poll') tab(kind, (d) => ({ ...d, content: v })); };
  const setPhotos = (fn) => tab(photoTab, (d) => ({ ...d, photos: fn(d.photos) }));
  const ba = draft.before_after;
  const slots = { before: ba.before, after: ba.after };
  const slotBusy = { before: ba.busyBefore, after: ba.busyAfter };
  const { bookable } = draft.look;
  const setBookable = (v) => tab('look', (d) => ({ ...d, bookable: !!v }));
  const { question, options, days } = draft.poll;
  const setQuestion = (v) => tab('poll', (d) => ({ ...d, question: v }));
  const setOptions = (fn) => tab('poll', (d) => ({ ...d, options: fn(d.options) }));
  const setDays = (v) => tab('poll', (d) => ({ ...d, days: v }));
  const lookVisitId = draft.look.visitId;
  const setLookVisitId = (v) => { setVisitGone(false); tab('look', (d) => ({ ...d, visitId: v })); };
  const baVisitId = ba.visitId;
  const setBaVisitId = (v) => { setVisitGone(false); tab('before_after', (d) => ({ ...d, visitId: v })); };

  // Visite demandée par l'adresse : vérifiée une fois contre la liste des visites
  const requestedVisitRef = useRef(initialVisitId ? { id: String(initialVisitId), kind: initialKind === 'before_after' ? 'before_after' : 'look' } : null);
  // Visite demandée indisponible (inconnue ou plus de 60 jours) : on ne choisit rien d'office
  const goneRef = useRef(false);
  const [visitGone, setVisitGone] = useState(false);

  const mountedRef = useRef(true);
  const fileRef = useRef(null);
  const beforeRef = useRef(null);
  const afterRef = useRef(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Visite demandée à l'ouverture (`?compose=look&visit=<id>`, push après la visite) : elle prime
  // sur celle du brouillon. Déclaré avant le rapprochement avec la liste des visites, qui la vérifie.
  useEffect(() => {
    if (!initialVisitId) return;
    const k = initialKind === 'before_after' ? 'before_after' : 'look';
    updateTab(account, k, (d) => (d.visitId === String(initialVisitId) ? d : { ...d, visitId: String(initialVisitId) }));
  }, [account, initialKind, initialVisitId]);

  // Avatar de l'auteur : logo du salon (admin), photo de la fiche (barber), sinon la sienne
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: fetchPublicBarbers,
    staleTime: 5 * 60 * 1000,
    enabled: role === 'barber',
  });
  const barberPhoto = role === 'barber'
    ? ((employeesQuery.data || []).find((e) => String(e.id) === String(user?.employee_id))?.photo_url || user?.photo_url || '')
    : '';

  // Visites montrables en look (clients) : chargées à l'ouverture d'un onglet qui en a besoin
  const wantsVisits = !legacy && isClient && (kind === 'look' || kind === 'before_after');
  const [visitsWanted, setVisitsWanted] = useState(wantsVisits);
  useEffect(() => { if (wantsVisits) setVisitsWanted(true); }, [wantsVisits]);
  const visitsQuery = useQuery({
    queryKey: FEED_KEYS.visits,
    queryFn: fetchLookVisits,
    enabled: !legacy && isClient && visitsWanted,
    staleTime: 60 * 1000,
  });
  const visits = Array.isArray(visitsQuery.data?.visits) ? visitsQuery.data.visits : [];
  useEffect(() => {
    if (!visitsQuery.data) return;
    const list = Array.isArray(visitsQuery.data.visits) ? visitsQuery.data.visits : [];
    const known = (id) => id && list.some((v) => String(v.id) === String(id));
    const requested = requestedVisitRef.current;
    requestedVisitRef.current = null;
    if (requested && !known(requested.id) && list.length) {
      // Lien d'un push périmé : ni la dernière visite en douce, ni une autre ; le client choisit
      goneRef.current = true;
      setVisitGone(true);
      updateTab(account, requested.kind, (d) => (d.visitId == null ? d : { ...d, visitId: null }));
    }
    // Look : la visite demandée (ou du brouillon) si elle est dans la liste, sinon la plus récente
    // (sauf après une visite demandée indisponible : le client choisit lui-même)
    updateTab(account, 'look', (d) => {
      const fallback = goneRef.current || !list[0] ? null : String(list[0].id);
      const v = known(d.visitId) ? String(d.visitId) : fallback;
      return v === d.visitId ? d : { ...d, visitId: v };
    });
    updateTab(account, 'before_after', (d) => {
      const v = known(d.visitId) ? String(d.visitId) : null;
      return v === d.visitId ? d : { ...d, visitId: v };
    });
  }, [visitsQuery.data, account]);

  const upload = async (file) => {
    const res = await api.integrations.Core.UploadFile({ file });
    return res?.file_url || '';
  };

  const pickPhotos = async (ev) => {
    const input = ev.target;
    const files = Array.from(input.files || []);
    // Sinon reprendre la même photo après un échec ne déclencherait plus `change`
    input.value = '';
    if (!files.length) return;
    const k = photoTab;
    const entry = draftEntry(account);
    const cur = entry.draft[k];
    const room = maxPhotos - cur.photos.length - cur.pending;
    if (room <= 0) { toast.error(maxPhotos === 1 ? 'Une photo au plus' : `${maxPhotos} photos au plus`); return; }
    const batch = files.slice(0, room);
    if (files.length > room) toast(`${maxPhotos} photos au plus : les autres n'ont pas été ajoutées`);
    const gen = entry.gen[k];
    const stillDraft = () => draftEntry(account).gen[k] === gen;
    tab(k, (d) => ({ ...d, pending: d.pending + batch.length }));
    // Une par une : sur un réseau lent, quatre envois ensemble échouaient tous. Composeur fermé
    // entre-temps : la photo arrive quand même dans le brouillon.
    for (const file of batch) {
      let url = '';
      try {
        url = await upload(file);
      } catch (err) {
        // Garde le message d'apiClient (photo HEIC : réglage iPhone à changer)
        if (stillDraft() && mountedRef.current) toast.error(errorText(err, "Erreur lors de l'envoi de la photo"));
      }
      // Publié entre-temps : l'onglet est déjà vide, la photo n'y revient pas
      if (!stillDraft()) continue;
      updateTab(account, k, (d) => ({
        ...d,
        pending: Math.max(0, d.pending - 1),
        photos: url && d.photos.length < maxPhotos && !d.photos.includes(url) ? [...d.photos, url] : d.photos,
      }));
    }
  };

  const pickSlot = async (which, ev) => {
    const input = ev.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const entry = draftEntry(account);
    const seq = ++entry.seq[which];
    const gen = entry.gen.before_after;
    const busyKey = which === 'before' ? 'busyBefore' : 'busyAfter';
    const current = () => {
      const e = draftEntry(account);
      return e.seq[which] === seq && e.gen.before_after === gen;
    };
    tab('before_after', (d) => ({ ...d, [busyKey]: true }));
    try {
      const url = await upload(file);
      if (current() && url) updateTab(account, 'before_after', (d) => ({ ...d, [which]: url }));
    } catch (err) {
      if (current() && mountedRef.current) toast.error(errorText(err, "Erreur lors de l'envoi de la photo"));
    } finally {
      if (current()) updateTab(account, 'before_after', (d) => ({ ...d, [busyKey]: false }));
    }
  };
  const removeSlot = (which) => {
    draftEntry(account).seq[which] += 1;
    const busyKey = which === 'before' ? 'busyBefore' : 'busyAfter';
    tab('before_after', (d) => ({ ...d, [which]: '', [busyKey]: false }));
  };

  // ─── Validité ───
  const text = content.trim();
  const pollLabels = options.map((o) => o.label.trim()).filter(Boolean);
  const pollDupe = new Set(pollLabels.map((l) => l.toLowerCase())).size !== pollLabels.length;
  const photosBusy = pending > 0;
  const slotsBusy = slotBusy.before || slotBusy.after;
  let valid = false;
  let hint = '';
  if (kind === 'post') {
    valid = !!text || photos.length > 0;
  } else if (kind === 'look') {
    valid = photos.length > 0 && !!lookVisitId;
    if (visits.length && !lookVisitId) hint = 'Choisis la visite de ce look';
    else if (visits.length && !photos.length && !photosBusy) hint = 'Ajoute au moins une photo de ton look';
  } else if (kind === 'before_after') {
    valid = !!slots.before && !!slots.after && slots.before !== slots.after;
    if (!valid && !slotsBusy) hint = 'Ajoute la photo avant et la photo après';
  } else if (kind === 'poll') {
    valid = !!question.trim() && pollLabels.length >= POLL_OPTIONS_MIN && !pollDupe;
    if (pollDupe) hint = 'Deux réponses identiques';
    else if (!valid) hint = 'Écris la question et au moins deux réponses';
  }
  const busy = (kind === 'post' || kind === 'look') ? photosBusy : kind === 'before_after' ? slotsBusy : false;
  const canPublish = valid && !busy && !posting;

  const payload = () => {
    if (kind === 'look') return { kind: 'look', content: text, images: photos, visit_id: lookVisitId, bookable };
    if (kind === 'before_after') {
      return { kind: 'before_after', content: text, before: slots.before, after: slots.after, ...(baVisitId ? { visit_id: baVisitId } : {}) };
    }
    if (kind === 'poll') return { kind: 'poll', content: '', poll: { question: question.trim(), options: pollLabels, days } };
    return { kind: 'post', content: text, images: photos };
  };

  const publish = async () => {
    if (!canPublish) return;
    // Filtre des contenus : jamais pour l'équipe (le serveur ne filtre pas non plus)
    if (!isStaff && text) {
      const filtered = contentFilterError(text);
      if (filtered) { toast.error(filtered); return; }
    }
    setPosting(true);
    try {
      let item = null;
      if (legacy) {
        const row = await api.entities.Post.create({ content: text, image_url: photos[0] || null });
        item = row ? legacyItem(row, [], [], user) : null;
        qc.invalidateQueries({ queryKey: ['posts'] });
        invalidateFeed(qc);
      } else {
        const res = await createFeedPost(payload());
        item = res?.item || null;
        if (item) prependFeedItem(qc, item, filtersFor(kind, isAdmin));
        else invalidateFeed(qc);
        // Dernière publication de l'accueil (src/pages/Home.jsx)
        qc.invalidateQueries({ queryKey: ['posts', 'latest'] });
      }
      // Seul l'onglet publié est vidé : les brouillons des autres onglets restent
      clearTab(account, kind);
      toast.success('Publication envoyée 🎉');
      onPublished?.(item);
    } catch (err) {
      // Le brouillon reste : rien n'est perdu
      if (err?.data?.code === 'visit_not_found') qc.invalidateQueries({ queryKey: FEED_KEYS.visits });
      toast.error(errorText(err, 'Erreur lors de la publication'));
    } finally {
      if (mountedRef.current) setPosting(false);
    }
  };

  // ─── Onglets ───
  const tabId = (k) => `${uid}-onglet-${k}`;
  const onTabsKey = (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = kinds[(kinds.indexOf(kind) + step + kinds.length) % kinds.length];
    setKind(next);
    document.getElementById(tabId(next))?.focus();
  };

  const textarea = (placeholder, label, rows = 3) => (
    <label className="block">
      <span className={label.visible ? 'mb-2 block text-[13px] font-semibold text-foreground/85' : 'sr-only'}>
        {label.text}
        {label.optional && <span className="font-normal text-muted-foreground"> (facultatif)</span>}
      </span>
      <textarea
        value={content}
        maxLength={POST_MAX}
        rows={rows}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        className="block min-h-[84px] w-full resize-none rounded-[14px] border border-border bg-secondary/50 px-3.5 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      {content.length >= POST_MAX - 500 && (
        <span className="mt-1 block text-right text-[10px] text-muted-foreground">{content.length} / {POST_MAX}</span>
      )}
    </label>
  );

  const photosBlock = (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-foreground/85">
        {maxPhotos === 1 ? 'Photo' : 'Photos'}
        <span className="font-normal text-muted-foreground">{maxPhotos === 1 ? ' · une au plus' : ` · jusqu'à ${maxPhotos}`}</span>
      </p>
      <PhotoGrid
        photos={photos}
        pending={pending}
        max={maxPhotos}
        onAdd={() => fileRef.current?.click()}
        onRemove={(i) => setPhotos((list) => list.filter((_, j) => j !== i))}
      />
    </div>
  );

  const visitsState = () => {
    if (queryFailed(visitsQuery)) {
      return <LoadError compact what="tes visites" error={visitsQuery.error} onRetry={() => visitsQuery.refetch()} retrying={visitsQuery.isFetching} />;
    }
    if (visitsQuery.isPending) {
      return (
        <div role="status" className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Chargement de tes visites…
        </div>
      );
    }
    return null;
  };

  const goneNotice = (
    <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-200">
      Cette visite n&apos;est plus disponible, choisis-en une autre
    </p>
  );

  let panel;
  if (kind === 'look') {
    const waiting = visitsState();
    const barberName = String((visits.find((v) => String(v.id) === String(lookVisitId)) || {}).employee_name || '').trim();
    panel = waiting || (!visits.length ? (
      <div className="rounded-2xl border border-border bg-secondary/40 p-5 text-center">
        <p className="text-sm font-semibold text-foreground">Ton look se publie après une visite au salon</p>
        <p className="mt-1 text-xs text-muted-foreground">Prends rendez-vous, puis reviens montrer ta coupe au Gang.</p>
        <Link
          to="/booking"
          onClick={() => onClose?.()}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
        >
          Réserver
        </Link>
      </div>
    ) : (
      <div className="flex flex-col gap-5">
        {visitGone && goneNotice}
        <VisitChooser
          title={!lookVisitId ? 'Choisis ta visite' : visits[0] && String(visits[0].id) === String(lookVisitId) ? 'Ta dernière visite' : 'Ta visite'}
          visits={visits}
          value={lookVisitId}
          onChange={setLookVisitId}
        />
        {photosBlock}
        {textarea('Un mot sur ton look…', { text: 'Un mot', visible: true, optional: true })}
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/40 p-3.5">
          <label htmlFor={`${uid}-reservable`} className="min-w-0 flex-1 cursor-pointer">
            <span className="block text-sm font-bold text-foreground">Bouton « Réserver ce look »</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {`Les membres du Gang pourront réserver les mêmes prestations${barberName ? ` avec ${barberName}` : ''}, en un tap depuis ta photo.`}
            </span>
          </label>
          <Switch id={`${uid}-reservable`} checked={bookable} onCheckedChange={setBookable} className="mt-0.5" />
        </div>
      </div>
    ));
  } else if (kind === 'before_after') {
    panel = (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <SlotTile label="Avant" url={slots.before} busy={slotBusy.before} onPick={() => beforeRef.current?.click()} onRemove={() => removeSlot('before')} />
          <SlotTile label="Après" url={slots.after} busy={slotBusy.after} onPick={() => afterRef.current?.click()} onRemove={() => removeSlot('after')} />
        </div>
        {visitGone && !visitsState() && visits.length > 0 && goneNotice}
        {visitsState() || (visits.length > 0 && (
          <VisitChooser title="Visite (facultatif)" visits={visits} value={baVisitId} onChange={setBaVisitId} allowNone />
        ))}
        {textarea('Un mot sur ta transformation…', { text: 'Un mot', visible: true, optional: true })}
      </div>
    );
  } else if (kind === 'poll') {
    panel = (
      <div className="flex flex-col gap-5">
        <label className="block">
          <span className="mb-2 block text-[13px] font-semibold text-foreground/85">Question</span>
          <input
            type="text"
            value={question}
            maxLength={POLL_QUESTION_MAX}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex. : quelle couleur pour le prochain hoodie ?"
            className="h-11 w-full min-w-0 rounded-xl border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </label>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-[13px] font-semibold text-foreground/85">
            Réponses <span className="font-normal text-muted-foreground">· {POLL_OPTIONS_MIN} à {POLL_OPTIONS_MAX}</span>
          </legend>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={o.key} className="flex min-w-0 items-center gap-2">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Réponse {i + 1}</span>
                  <input
                    type="text"
                    value={o.label}
                    maxLength={POLL_LABEL_MAX}
                    onChange={(e) => setOptions((list) => list.map((x) => (x.key === o.key ? { ...x, label: e.target.value } : x)))}
                    placeholder={`Réponse ${i + 1}`}
                    className="h-11 w-full min-w-0 rounded-xl border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </label>
                {options.length > POLL_OPTIONS_MIN && (
                  <button
                    type="button"
                    onClick={() => setOptions((list) => list.filter((x) => x.key !== o.key))}
                    aria-label={`Retirer la réponse ${i + 1}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/50 text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < POLL_OPTIONS_MAX && (
            <button
              type="button"
              onClick={() => setOptions((list) => [...list, newOption()])}
              className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ajouter une réponse
            </button>
          )}
        </fieldset>
        <div>
          <p id={`${uid}-duree`} className="mb-2 text-[13px] font-semibold text-foreground/85">Durée</p>
          <div role="radiogroup" aria-labelledby={`${uid}-duree`} className="grid grid-cols-3 gap-2">
            {POLL_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={days === d}
                onClick={() => setDays(d)}
                className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${
                  days === d ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                }`}
              >
                {d} jour{d > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  } else {
    const avatar = role === 'barber'
      ? <BarberThumb url={barberPhoto} name={user?.full_name} width={30} />
      : <AuthorAvatar name={isAdmin ? SALON_NAME : user?.full_name} photoUrl={isAdmin ? SALON_LOGO : user?.photo_url} size={40} />;
    panel = (
      <div className="flex flex-col gap-5">
        <div className="flex min-w-0 gap-3">
          {avatar}
          <div className="min-w-0 flex-1">
            {textarea(
              isAdmin ? `Publier au nom de ${SALON_NAME} : une nouvelle, une photo…` : 'Quoi de neuf ? Partage un moment, une photo…',
              { text: 'Texte de la publication', visible: false },
            )}
          </div>
        </div>
        {photosBlock}
      </div>
    );
  }

  const footer = (
    <div>
      {hint && <p className="mb-2 text-center text-xs text-muted-foreground">{hint}</p>}
      <button
        type="button"
        onClick={publish}
        disabled={!canPublish}
        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-opacity disabled:opacity-40 disabled:shadow-none"
      >
        {posting ? <Loader2 className="h-[17px] w-[17px] animate-spin" aria-hidden="true" /> : <Send className="h-[17px] w-[17px]" aria-hidden="true" />}
        {kind === 'look' ? 'Publier mon look' : 'Publier'}
      </button>
    </div>
  );

  return (
    <FeedSheet title="Nouvelle publication" onClose={onClose} size="tall" footer={footer} closeDisabled={posting}>
      <div className="flex flex-col gap-5 pt-1">
        {kinds.length > 1 && (
          <div
            role="tablist"
            aria-label="Type de publication"
            onKeyDown={onTabsKey}
            className="grid gap-1 rounded-[14px] border border-border bg-secondary/40 p-1"
            style={{ gridTemplateColumns: `repeat(${kinds.length}, minmax(0, 1fr))` }}
          >
            {kinds.map((k) => (
              <button
                key={k}
                id={tabId(k)}
                type="button"
                role="tab"
                aria-selected={kind === k}
                aria-controls={`${uid}-panneau`}
                tabIndex={kind === k ? 0 : -1}
                onClick={() => setKind(k)}
                className={`h-[38px] min-w-0 truncate rounded-[10px] px-1 text-xs transition-colors ${
                  kind === k ? 'bg-primary font-bold text-primary-foreground' : 'font-semibold text-muted-foreground hover:text-foreground'
                }`}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        )}

        <div
          id={`${uid}-panneau`}
          {...(kinds.length > 1 ? { role: 'tabpanel', 'aria-labelledby': tabId(kind) } : {})}
        >
          {panel}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Respect et bienveillance : pas de propos offensants ni de contenu inapproprié. En publiant, tu acceptes les{' '}
          <LegalLink path="/cgu.html" className="text-primary underline">règles de la communauté</LegalLink>.
        </p>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple={maxPhotos > 1} className="hidden" onChange={pickPhotos} />
      <input ref={beforeRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickSlot('before', e)} />
      <input ref={afterRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickSlot('after', e)} />
    </FeedSheet>
  );
}
