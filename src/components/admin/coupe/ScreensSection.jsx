/**
 * Section « Écran du salon » d'Admin → La Coupe du Gang (contrat :
 * docs/fonctions/coupe-spectateurs-contrat.md, sections 2 et 4.2). Montée seulement avec
 * `features.coupeSpectators` (`useSpectatorsEnabled` de src/lib/coupe/coupeApi.js : le même drapeau
 * que les pages de la Coupe, ne rejette jamais ; sans réponse lisible, rien n'apparaît).
 *  - créer un lien (nom de l'écran) : lien et QR montrés **une seule fois**, « Copier » (presse-papiers,
 *    avec repli) ; 5 écrans actifs au plus (409 `too_many_screens`) ;
 *  - liste des écrans (nom et date de création, vu pour la dernière fois), « Couper » avec
 *    confirmation (l'écran s'éteint tout de suite, son lien ne marche plus) ;
 *  - ce qui passe à l'écran : matchs de tournoi, et matchs dont les deux joueurs ont allumé
 *    « Laisser regarder mes matchs » ; noms seulement, jamais de photo, aucun son.
 * Données : `GET` / `POST /coupe/admin/screens`, `DELETE /coupe/admin/screens/:id` (apiClient, admin).
 */
import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, Monitor, Plus, Power } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { apiRequest, apiUrl } from '@/api/apiClient';
import { useSpectatorsEnabled } from '@/lib/coupe/coupeApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { adminErrorMessage, isUncertainSend } from '@/lib/adminErrors';

// Liste sous le préfixe admin de la Coupe
export const COUPE_SCREENS_KEY = ['coupe', 'admin', 'screens'];
export const SCREEN_LABEL_MAX = 40;
export const SCREEN_DEFAULT_LABEL = 'Écran du salon';
const SCREEN_URL_PREFIX = 'https://dhomebarber.fr/ecran#cle=';
// Lu il y a moins de 3 min (l'écran relit toutes les 5 à 15 s, le serveur note au plus une fois par minute)
const ONLINE_MS = 3 * 60 * 1000;

/** `[{ id, label, created_at, last_seen_at }]` : écrans non coupés. */
const fetchScreens = () => apiRequest('GET', apiUrl('/coupe/admin/screens'));
/** `{ id, label, key, url }` : la clé n'est rendue qu'ici, une seule fois. */
const createScreen = (label) => apiRequest('POST', apiUrl('/coupe/admin/screens'), label ? { label } : {});
const revokeScreen = (id) => apiRequest('DELETE', apiUrl(`/coupe/admin/screens/${encodeURIComponent(String(id))}`));

/** Lien de l'écran : celui du serveur s'il est bien sur https://dhomebarber.fr/ecran, sinon refait avec la clé. */
function screenLink(created) {
  const url = String(created?.url || '');
  if (url.startsWith(SCREEN_URL_PREFIX)) return url;
  return created?.key ? `${SCREEN_URL_PREFIX}${encodeURIComponent(String(created.key))}` : '';
}

const DAY = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' });
const DAY_YEAR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', year: 'numeric' });
const YEAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/** « Vu pour la dernière fois aujourd'hui à 14:05 », « … le 4 nov. à 14:05 », « Jamais ouvert ». */
export function lastSeenText(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'Jamais ouvert';
  const d = new Date(t);
  const same = DAY_KEY.format(d) === DAY_KEY.format(new Date(now));
  return same ? `Vu pour la dernière fois aujourd’hui à ${TIME.format(d)}` : `Vu pour la dernière fois le ${DAY.format(d)} à ${TIME.format(d)}`;
}

/**
 * « Créé aujourd'hui », « Créé le 29 oct. », « Créé le 29 oct. 2025 » (autre année), heure de
 * Paris ; '' sans date lisible. Distingue deux écrans du même nom (« Écran du salon »).
 */
export function createdText(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const today = new Date(now);
  if (DAY_KEY.format(d) === DAY_KEY.format(today)) return 'Créé aujourd’hui';
  return `Créé le ${(YEAR.format(d) === YEAR.format(today) ? DAY : DAY_YEAR).format(d)}`;
}

/** Copie dans le presse-papiers, avec repli (champ caché + « copier ») ; vrai si c'est fait. */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* repli ci-dessous */ }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function ScreenItem({ screen, now, onRevoke, busy }) {
  const seen = Date.parse(screen.last_seen_at || '');
  const online = Number.isFinite(seen) && now - seen < ONLINE_MS;
  const created = createdText(screen.created_at, now);
  return (
    <li className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 flex items-center gap-3 min-w-0">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className="max-w-full font-semibold text-sm text-foreground truncate">{String(screen.label || SCREEN_DEFAULT_LABEL)}</span>
          {created && <span className="shrink-0 text-[11px] text-muted-foreground">{created}</span>}
          {online && (
            <span className="inline-flex shrink-0 items-center gap-1 h-5 px-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Allumé
            </span>
          )}
        </span>
        <span className="block text-[11px] text-muted-foreground">{lastSeenText(screen.last_seen_at, now)}</span>
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onRevoke(screen)}
        disabled={busy}
        aria-label={`Couper ${String(screen.label || SCREEN_DEFAULT_LABEL)}`}
        className="shrink-0 border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-500"
      >
        <Power className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Couper
      </Button>
    </li>
  );
}

/** Fenêtre « Nouveau lien » : nom, puis le lien et son QR, montrés une seule fois. */
function CreateDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const linkRef = useRef(null);

  const reset = () => {
    setLabel('');
    setError('');
    setCreated(null);
  };

  const mutation = useMutation({
    mutationFn: () => createScreen(label.trim()),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: COUPE_SCREENS_KEY });
      const url = screenLink(res);
      if (!url) {
        setError('Le serveur n’a pas rendu de lien. Coupez cet écran dans la liste puis recommencez.');
        return;
      }
      setCreated({ url, label: String(res?.label || label.trim() || SCREEN_DEFAULT_LABEL) });
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: COUPE_SCREENS_KEY });
      if (isUncertainSend(err)) {
        setError('Pas de connexion internet : le lien a peut-être été créé sans pouvoir s’afficher. S’il apparaît dans la liste, coupez-le puis créez-en un autre.');
        return;
      }
      if (err?.data?.code === 'too_many_screens') {
        setError('5 écrans au plus : coupez-en un dans la liste avant d’en créer un autre.');
        return;
      }
      setError(adminErrorMessage(err, 'Création impossible. Réessayez.'));
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (mutation.isPending) return;
    if ([...label.trim()].length > SCREEN_LABEL_MAX) {
      setError(`Le nom fait ${SCREEN_LABEL_MAX} caractères au plus.`);
      return;
    }
    setError('');
    mutation.mutate();
  };

  const copy = async () => {
    if (!created) return;
    if (await copyText(created.url)) {
      toast.success('Lien copié');
      return;
    }
    linkRef.current?.select();
    toast.error('Copie impossible : sélectionnez le lien et copiez-le à la main.');
  };

  const close = () => {
    if (mutation.isPending) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="bg-card border-border max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#ebc15e] font-semibold">Admin · La Coupe du Gang</p>
          <DialogTitle className="font-display text-xl">{created ? 'Lien de l’écran créé' : 'Nouveau lien d’écran'}</DialogTitle>
          <DialogDescription className="text-xs">
            {created
              ? 'Ce lien n’est montré qu’une fois. Ouvrez-le sur la télé ou la tablette du salon, ou copiez-le maintenant.'
              : 'Un lien par télé ou tablette. Il s’ouvre sans compte : gardez-le pour le salon.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col gap-3">
            <div className="self-center rounded-xl bg-white p-3" data-qr-url={created.url} role="img" aria-label={`QR code du lien de ${created.label}`}>
              <QRCodeSVG value={created.url} size={176} level="M" marginSize={0} />
            </div>
            <label htmlFor="ecran-lien" className="text-xs font-semibold text-foreground/85">{`Lien de « ${created.label} »`}</label>
            <Input
              id="ecran-lien"
              ref={linkRef}
              readOnly
              value={created.url}
              onFocus={(e) => e.target.select()}
              className="h-11 rounded-xl bg-secondary/60 border-border text-[13px] font-mono"
            />
            <Button type="button" onClick={copy} className="h-11 rounded-xl">
              <Copy className="w-4 h-4 mr-1.5" aria-hidden="true" /> Copier le lien
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Lien perdu : coupez cet écran dans la liste et créez-en un nouveau.
            </p>
            <Button type="button" variant="ghost" onClick={close} className="h-10 rounded-xl text-muted-foreground">Terminé</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ecran-nom" className="text-xs font-semibold text-foreground/85">Nom de l’écran</label>
              <Input
                id="ecran-nom"
                value={label}
                onChange={(e) => { setLabel(e.target.value); if (error) setError(''); }}
                maxLength={SCREEN_LABEL_MAX}
                placeholder={SCREEN_DEFAULT_LABEL}
                autoComplete="off"
                className="h-11 rounded-xl bg-secondary/60 border-border text-[15px]"
              />
              <p className="text-[11px] text-muted-foreground">{`Par exemple « Télé de l’entrée ». ${SCREEN_LABEL_MAX} caractères au plus.`}</p>
            </div>
            {error && (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500 break-words">{error}</p>
            )}
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="h-12 rounded-xl bg-[#e01f26] text-white hover:bg-[#c81a20] font-display text-lg font-bold uppercase tracking-wide"
            >
              {mutation.isPending ? 'Création…' : 'Créer le lien'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ScreensSection() {
  const enabled = useSpectatorsEnabled();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: COUPE_SCREENS_KEY, queryFn: fetchScreens, enabled, staleTime: 30 * 1000 });
  const { data, error, refetch, isFetching, isPending } = query;
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const revoke = useMutation({
    mutationFn: (screen) => revokeScreen(screen.id),
    onSuccess: (_res, screen) => {
      toast.success(`« ${String(screen.label || SCREEN_DEFAULT_LABEL)} » est coupé`);
      queryClient.invalidateQueries({ queryKey: COUPE_SCREENS_KEY });
      setConfirm(null);
    },
    onError: (err) => {
      if (err?.status === 404 && err?.data?.code !== 'disabled') {
        toast.success('Cet écran était déjà coupé');
        queryClient.invalidateQueries({ queryKey: COUPE_SCREENS_KEY });
        setConfirm(null);
        return;
      }
      toast.error(adminErrorMessage(err, 'Impossible de couper l’écran. Réessayez.'));
    },
  });

  if (!enabled) return null;

  const screens = Array.isArray(data) ? data.filter((s) => s && typeof s === 'object' && s.id) : [];
  // 404 { code: 'disabled' } : spectateurs coupés entre la lecture du drapeau et celle de la liste
  const switchedOff = error?.status === 404 && !data;
  const failed = !switchedOff && queryFailed(query);
  const now = Date.now();
  const confirmName = confirm ? String(confirm.label || SCREEN_DEFAULT_LABEL) : '';

  return (
    <section aria-labelledby="coupe-ecrans-titre" className="rounded-2xl border border-border bg-card p-4 min-w-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 id="coupe-ecrans-titre" className="flex items-start gap-2 text-sm font-bold leading-snug text-foreground min-w-0">
          <Monitor className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">Écran du salon</span>
        </h2>
        <Button size="sm" onClick={() => setCreating(true)} className="shrink-0 bg-[#e01f26] text-white hover:bg-[#c81a20]">
          <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Nouveau lien
        </Button>
      </div>
      <p className="mb-1.5 text-xs leading-relaxed text-muted-foreground">
        Ouvrez le lien sur la télé ou la tablette du salon : classement, tournois et matchs en direct, sans compte.
        Muet, noms seulement, jamais de photo.
      </p>
      <p className="mb-3 text-xs leading-relaxed text-foreground/85">
        Seuls les matchs de tournoi et les matchs dont les deux joueurs ont allumé « Laisser regarder mes matchs » passent à l’écran.
      </p>

      {switchedOff && (
        <p role="status" className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
          {error?.data?.code === 'disabled'
            ? 'Regarder les matchs est coupé (variable Heroku COUPE_SPECTATEURS=off) : les écrans sont éteints.'
            : 'Le serveur ne connaît pas encore l’écran du salon.'}
        </p>
      )}

      {failed && <LoadError compact what="les écrans" error={error} onRetry={refetch} retrying={isFetching} />}

      {isPending && !failed && !switchedOff && (
        <div className="h-[56px] rounded-xl border border-border bg-secondary/30 animate-pulse" aria-busy="true" />
      )}

      {data && screens.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
          Aucun écran pour le moment. « Nouveau lien » en crée un (5 au plus).
        </p>
      )}

      {data && screens.length > 0 && (
        <ul aria-label="Écrans" className="flex flex-col gap-1.5">
          {screens.map((s) => (
            <ScreenItem key={s.id} screen={s} now={now} onRevoke={setConfirm} busy={revoke.isPending} />
          ))}
        </ul>
      )}

      <CreateDialog open={creating} onClose={() => setCreating(false)} />

      {/* Couper un écran : confirmation (fermée par « Annuler ») */}
      <AlertDialog open={!!confirm} onOpenChange={(open) => { if (!open && !revoke.isPending) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Couper « ${confirmName} » ?`}</AlertDialogTitle>
            <AlertDialogDescription>
              L’écran s’éteint tout de suite et son lien ne marchera plus. Pour le rallumer, créez un nouveau lien.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirm) revoke.mutate(confirm); }}
              disabled={revoke.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {revoke.isPending ? 'Coupure…' : 'Couper l’écran'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
