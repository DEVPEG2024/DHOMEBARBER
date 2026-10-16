/**
 * Admin « Cartes Gang » : « Ils perdent leur fraîcheur » — clients fidèles (≥ 3 visites) qui ne
 * sont pas revenus depuis 35 jours et n'ont aucun RDV à venir (liste `fading` du serveur).
 * Appeler (lien tel:) ou Relancer par push (`POST /gang-card/admin/nudge`), confirmé en deux taps,
 * une relance par client tous les 7 jours au plus.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Phone, BellRing, Loader2, Snowflake, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { nudgeGangClient, GANG_ADMIN_OVERVIEW_QUERY_KEY } from '@/lib/gangCardApi';
import { hapticFeedback } from '@/lib/capacitor';
import { Panel, PanelTitle, TierPill, clientLabel, daysSince, absenceLabel, plural } from './gangAdminUi';

const NUDGE_COOLDOWN_DAYS = 7;
const CONFIRM_MS = 4000;

function nudgedLabel(days) {
  if (days === 0) return 'Relancé aujourd’hui';
  return `Relancé il y a ${days} j`;
}

function FadingRow({ row, nudgedAt, onNudged }) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const nudgedDays = daysSince(nudgedAt || row.nudged_at);
  const recentlyNudged = nudgedDays != null && nudgedDays < NUDGE_COOLDOWN_DAYS;
  const phone = String(row.phone || '').replace(/[^\d+]/g, '');
  const name = clientLabel(row);
  const absence = absenceLabel(row.days_since_last);

  const nudge = async () => {
    if (sending || recentlyNudged) return;
    if (!confirming) {
      hapticFeedback();
      setConfirming(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirming(false), CONFIRM_MS);
      return;
    }
    clearTimeout(timer.current);
    setConfirming(false);
    setSending(true);
    try {
      const res = await nudgeGangClient(row.email);
      const devices = Number(res?.devices) || 0;
      if (devices === 0 || res?.sent === false) {
        // Rien n'est parti : le délai de 7 jours n'est pas déclenché, le bouton reste disponible
        toast.warning(devices === 0
          ? 'Ce client n’a pas activé les notifications : appelle-le'
          : 'La notification n’a pas pu être livrée sur son téléphone : appelle-le');
        onNudged(row.email, null, true);
      } else {
        toast.success(`Relance envoyée sur ${devices} appareil${devices > 1 ? 's' : ''}`);
        onNudged(row.email, res?.nudged_at || new Date().toISOString());
      }
    } catch (err) {
      const message = err?.data?.error || err?.data?.message;
      if (err?.status === 409) {
        // `cooldown` (relancé il y a moins de 7 jours), `no_card` (client sans carte) ou `not_fading`
        // (venu récemment, ou RDV à venir) : message du serveur
        toast.error(message || (err?.data?.code === 'no_card'
          ? 'Ce client n’a pas encore de carte Gang.'
          : 'Ce client a déjà été relancé il y a moins de 7 jours.'));
        onNudged(row.email, null, true);
      } else if (err?.status === 404) {
        toast.error(message || 'Compte client introuvable.');
      } else if (err?.status === 429) {
        toast.error(message || 'Trop de relances pour l’instant. Réessaie dans un moment.');
      } else if (!err?.status) {
        toast.error('Pas de connexion : la relance n’est pas partie.');
      } else {
        toast.error(message || 'La relance n’a pas pu être envoyée.');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <li className="flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-2.5 py-3 first:pt-0 last:pb-0 min-w-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate" title={name}>{name}</p>
          <TierPill tier={row.tier} label={row.tier_label} />
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {row.visits} {plural(row.visits, 'visite', 'visites')}
          {absence && ` · ${absence}`}
        </p>
        {row.barber && <p className="text-[11px] text-muted-foreground truncate">Avec {row.barber}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary text-xs font-semibold text-foreground hover:bg-secondary/70"
            aria-label={`Appeler ${name}`}
          >
            <Phone className="w-3.5 h-3.5" aria-hidden="true" /> Appeler
          </a>
        ) : (
          <span
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground opacity-50 cursor-not-allowed"
            aria-disabled="true"
            title="Aucun téléphone enregistré"
          >
            <Phone className="w-3.5 h-3.5" aria-hidden="true" /> Appeler
          </span>
        )}
        <button
          type="button"
          onClick={nudge}
          disabled={sending || recentlyNudged}
          aria-live="polite"
          className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed ${
            recentlyNudged
              ? 'border border-border text-muted-foreground'
              : confirming
                ? 'bg-amber-500 text-black'
                : 'bg-primary text-primary-foreground disabled:opacity-70'
          }`}
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            : recentlyNudged ? <Check className="w-3.5 h-3.5" aria-hidden="true" />
              : <BellRing className="w-3.5 h-3.5" aria-hidden="true" />}
          {sending ? 'Envoi…' : recentlyNudged ? nudgedLabel(nudgedDays) : confirming ? 'Confirmer ?' : 'Relancer'}
        </button>
      </div>
    </li>
  );
}

export default function GangFadingList({ fading }) {
  const queryClient = useQueryClient();
  // Relances faites depuis cette page : affichées tout de suite, avant le rechargement
  const [local, setLocal] = useState({});
  const rows = Array.isArray(fading) ? fading : [];

  const onNudged = (email, at, refetchOnly = false) => {
    if (!refetchOnly && at) setLocal((prev) => ({ ...prev, [email]: at }));
    queryClient.invalidateQueries({ queryKey: GANG_ADMIN_OVERVIEW_QUERY_KEY });
  };

  return (
    <Panel>
      <PanelTitle icon={Snowflake} aside={rows.length ? `${rows.length} client${rows.length > 1 ? 's' : ''}` : null}>
        Ils perdent leur fraîcheur
      </PanelTitle>
      <p className="-mt-2 mb-3 text-[11px] text-muted-foreground">
        Au moins 3 visites, plus de 5 semaines sans venir et aucun rendez-vous à venir.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Aucun habitué à relancer pour l’instant 👌</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <FadingRow key={row.user_id || row.email} row={row} nudgedAt={local[row.email]} onNudged={onNudged} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
