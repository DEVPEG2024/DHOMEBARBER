import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Camera, Scissors, BarChart3 } from 'lucide-react';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { useFeedUnread } from '@/lib/feed/useUnread';
import { FEED_FILTERS, SALON_LOGO } from '@/lib/feed/rules';
import { PersonAvatar } from '@/components/feed/PostCard';

/**
 * En-tête du fil : « Communauté / Ca dit quoi le Gang ? » et la cloche de l'activité (pastille
 * rouge = activité non lue, « 9+ » au-delà de 9), vers `/feed/activite` (`/admin/feed/activite`
 * dans l'admin). Cloche seulement avec le fil v2 (l'ancien serveur n'a pas d'activité).
 *
 * @param {object} props
 * @param {boolean} props.inAdmin
 * @param {boolean} props.v2
 */
export default function FeedHeader({ inAdmin, v2 }) {
  const { activity } = useFeedUnread();
  const label = activity ? `Activité, ${activity} nouvelle${activity > 1 ? 's' : ''}` : 'Activité';
  return (
    // Côté client, le bouton musique (32 px) est posé en haut à droite : en-tête en `pr-10`
    <div className={`flex items-end justify-between gap-3 ${inAdmin ? '' : 'pr-10'}`}>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Communauté</p>
        <h1 className="font-sans text-2xl font-bold">Ca dit quoi le Gang ?</h1>
      </div>
      {v2 && (
        <Link
          to={inAdmin ? '/admin/feed/activite' : '/feed/activite'}
          aria-label={label}
          className="relative w-11 h-11 rounded-[14px] bg-card border border-border text-foreground flex items-center justify-center shrink-0 hover:bg-secondary transition-colors"
        >
          <Bell className="w-5 h-5" aria-hidden="true" />
          {activity > 0 && (
            <span
              aria-hidden="true"
              data-testid="feed-activity-badge"
              className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center border-2 border-background"
            >
              {activity > 9 ? '9+' : activity}
            </span>
          )}
        </Link>
      )}
    </div>
  );
}

/** Ma photo pour le fil : le logo pour l'admin (il écrit au nom du salon), la fiche pour un barber. */
function useMyPhoto(user) {
  const isBarber = user?.role === 'barber';
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    staleTime: 5 * 60 * 1000,
    queryFn: fetchPublicBarbers,
    enabled: isBarber,
  });
  if (user?.role === 'admin') return SALON_LOGO;
  if (isBarber) {
    const emp = employees.find((e) => String(e.id) === String(user?.employee_id));
    return emp?.photo_url || user?.photo_url || '';
  }
  return user?.photo_url || '';
}

/**
 * Carte « Quoi de neuf, <prénom> ? » en tête du fil : ouvre le composeur (`onCompose(kind)`).
 * Raccourcis : Photo pour tous, « Mon look » pour un client, « Sondage » pour l'admin ; l'ancien fil
 * (serveur sans v2) n'a que la publication simple.
 *
 * @param {object} props
 * @param {object} props.user
 * @param {boolean} props.legacy
 * @param {(kind: 'post'|'look'|'poll'|'before_after') => void} props.onCompose
 */
export function WhatsNewCard({ user, legacy, onCompose }) {
  const photo = useMyPhoto(user);
  const role = user?.role || 'user';
  const firstName = String(user?.full_name || '').trim().split(/\s+/)[0];
  const prompt = role === 'admin' ? 'Quoi de neuf au salon ?' : firstName ? `Quoi de neuf, ${firstName} ?` : 'Quoi de neuf ?';
  const actions = [{ kind: 'post', label: 'Photo', Icon: Camera, color: 'text-blue-400' }];
  if (!legacy && role === 'user') actions.push({ kind: 'look', label: 'Mon look', Icon: Scissors, color: 'text-primary' });
  if (!legacy && role === 'admin') actions.push({ kind: 'poll', label: 'Sondage', Icon: BarChart3, color: 'text-amber-300' });

  return (
    <div className="rounded-2xl bg-card border border-border p-3">
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={role === 'admin' ? "D'Home Barber" : user?.full_name} photoUrl={photo} role={role} size={36} />
        <button
          type="button"
          onClick={() => onCompose('post')}
          className="flex-1 min-w-0 h-10 rounded-xl bg-secondary/60 border border-border px-3 text-left text-sm text-muted-foreground hover:text-foreground transition-colors truncate"
        >
          {prompt}
        </button>
      </div>
      <div className="grid gap-2 mt-2.5" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
        {actions.map(({ kind, label, Icon, color }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onCompose(kind)}
            className="h-10 rounded-xl text-xs font-semibold text-foreground/85 hover:bg-secondary/70 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Icon className={`w-4 h-4 ${color}`} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Puces de filtre du fil v2 : Tout, Le salon, Les looks, Sondages (`FEED_FILTERS`). Elles passent à
 * la ligne sur un petit écran (jamais de défilement horizontal de la page).
 */
export function FeedFilters({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer le fil">
      {FEED_FILTERS.map((f) => {
        const on = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(f.id)}
            className={`h-[34px] px-3.5 rounded-full border text-[13px] transition-colors ${
              on ? 'border-primary bg-primary/20 text-foreground font-semibold' : 'border-border bg-card text-muted-foreground font-medium hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
