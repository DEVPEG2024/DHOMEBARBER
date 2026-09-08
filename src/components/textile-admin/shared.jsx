/**
 * Utilitaires communs à la page admin « Textile & Drops » (pages/admin/AdminTextile.jsx) :
 * clés React Query, styles des statuts, formats de date (heure de Paris ↔ input datetime-local),
 * bouton de confirmation en deux taps, petits composants d'affichage.
 */
import React, { useEffect, useState } from 'react';
import { api } from '@/api/apiClient';
import { Label } from '@/components/ui/label';
import { TEXTILE_QUERY_KEY, DROP_STATUSES, RESERVATION_STATUSES } from '@/lib/textileApi';

// ─── Clés React Query des listes admin (préfixes distincts, invalidés ensemble) ───
export const DROPS_KEY = ['textileDrops', 'all'];
export const CONCEPTS_KEY = ['textileConcepts', 'all'];
export const RESERVATIONS_KEY = ['textileReservations', 'all'];

/**
 * Invalide les listes admin demandées (par préfixe : 'textileDrops', 'textileConcepts',
 * 'textileReservations' ; toutes si aucun n'est passé) et toujours la vue d'ensemble
 * `TEXTILE_QUERY_KEY`, qui porte les agrégats (votes, stock pris, abonnés…).
 */
export function invalidateTextile(queryClient, ...prefixes) {
  const keys = prefixes.length ? prefixes : ['textileDrops', 'textileConcepts', 'textileReservations'];
  keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  queryClient.invalidateQueries({ queryKey: TEXTILE_QUERY_KEY });
}

// ─── Statuts ───
export const DROP_STATUS_STYLES = {
  draft: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
  teasing: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  live: 'bg-green-500/15 text-green-400 border-green-500/25',
  ended: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
};
export const dropStatusLabel = (value) => DROP_STATUSES.find((s) => s.value === value)?.label || value || '—';

export const RESERVATION_STATUS_STYLES = {
  reserved: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  paid: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  ready: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  picked_up: 'bg-green-500/15 text-green-400 border-green-500/25',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/25',
  expired: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
};
export const reservationStatusLabel = (value) => RESERVATION_STATUSES.find((s) => s.value === value)?.label || value || '—';

// ─── Dates ───
const pad = (n) => String(n).padStart(2, '0');

/** « sam. 12 sept. · 18:00 » en heure de Paris (année ajoutée si différente de l'année courante). */
export function formatParisDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const showYear = d.getFullYear() !== new Date().getFullYear();
  const date = d.toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', ...(showYear ? { year: 'numeric' } : {}), timeZone: 'Europe/Paris',
  });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return `${date} · ${time}`;
}

/** « 12/09/2026 » en heure de Paris. */
export function formatParisDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
}

/** ISO → valeur d'un `<input type="datetime-local">` dans le fuseau local de l'appareil. */
export function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur d'un `<input type="datetime-local">` (heure locale) → ISO UTC, ou null si vide. */
export function fromLocalInputValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ─── Montants ───
export const reservationTotal = (r) => (Number(r?.quantity) || 0) * (Number(r?.unit_price) || 0);

/** « 1 234,50 € » (fr-FR ; « 35 € » quand le montant est rond). */
export function formatEuros(value) {
  const n = Number(value) || 0;
  const whole = Number.isInteger(Math.round(n * 100) / 100);
  return n.toLocaleString('fr-FR', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2,
  });
}

export const clampInt = (value, min, max, fallback) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

// ─── Upload ───
/** Envoie une image via UploadFile (compression côté client incluse) et renvoie son URL. */
export async function uploadImageFile(file) {
  const { file_url } = await api.integrations.Core.UploadFile({ file });
  if (!file_url) throw new Error("Le serveur n'a pas renvoyé d'URL pour l'image");
  return file_url;
}

// ─── Composants ───
/**
 * Bouton d'action sensible en deux taps : le premier arme (« Confirmer ? »), le second exécute.
 * Se désarme seul après 3,5 s sans second tap.
 */
export function TwoTapButton({
  onConfirm, label, confirmLabel = 'Confirmer ?', icon: Icon, disabled, title,
  className = 'border-red-500/25 text-red-400 hover:bg-red-500/10',
  armedClassName = 'border-red-500 bg-red-500 text-white animate-pulse',
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={() => {
        if (armed) { setArmed(false); onConfirm(); } else { setArmed(true); }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${armed ? armedClassName : className}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {armed ? confirmLabel : label}
    </button>
  );
}

/** Bouton d'action secondaire (contour), même gabarit que TwoTapButton. */
export function ActionButton({ onClick, label, icon: Icon, disabled, title, className = 'border-border text-foreground hover:bg-secondary' }) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${className}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

export function StatusPill({ className = '', icon: Icon, children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="text-center py-14 text-muted-foreground">
      {Icon && <Icon className="w-10 h-10 mx-auto mb-2 opacity-30" />}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs mt-1 opacity-80">{hint}</p>}
    </div>
  );
}

/** Champ de formulaire : libellé + contrôle, gabarit des dialogs admin. */
export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export const INPUT_CLASS = 'bg-secondary border-border';
