/**
 * Carte d'un événement du salon dans la liste admin : couverture (ou dégradé), statut, visibilité,
 * titre, date en heure de Paris, lieu, prix ou « Offert », tenue, jauge « places prises / capacité »
 * (ou nombre d'acceptés), invités, et les actions (admin : Modifier, Publier, Invités, Annuler,
 * Terminer, Supprimer ; barber : Invités seulement).
 */
import React from 'react';
import { motion } from 'framer-motion';
import {
  Pencil, Trash2, Rocket, Users, Ban, Flag, CalendarClock, MapPin, Shirt, Lock, Globe, Armchair, UserCheck, Bell, Clock,
} from 'lucide-react';
import { formatEventDate, formatPrice, eventPhase } from '@/lib/salonEventsApi';
import {
  EVENT_STATUS_STYLES, eventStatusLabel, StatusPill, TwoTapButton, ActionButton, formatParisDateTime, EMPTY_STATS, countLabel,
} from './shared';

function Stat({ icon: Icon, value, label, valueClassName = 'text-foreground' }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span><span className={`font-semibold ${valueClassName}`}>{value}</span> {label}</span>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.event
 * @param {object} [props.stats]   Agrégats d'invitations { total, pending, accepted, declined, seats }
 * @param {boolean} props.isAdmin
 * @param {boolean} props.busy
 * @param {number} [props.index]   Pour la cascade d'apparition
 * @param {(event) => void} props.onEdit
 * @param {(event) => void} props.onPublish
 * @param {(event) => void} props.onGuests
 * @param {(event) => void} props.onCancel
 * @param {(event) => void} props.onDone
 * @param {(event) => void} props.onDelete
 */
export default function EventCard({ event, stats = EMPTY_STATS, isAdmin, busy, index = 0, onEdit, onPublish, onGuests, onCancel, onDone, onDelete }) {
  const phase = eventPhase(event);
  const capacity = Number(event.capacity) || 0;
  const fill = capacity ? Math.min(100, Math.round((stats.seats / capacity) * 100)) : 0;
  const full = capacity > 0 && stats.seats >= capacity;
  const isPublic = event.visibility === 'public';
  const canPublish = event.status === 'draft';
  const canCancel = event.status === 'published' && phase !== 'past';
  const canFinish = event.status === 'published';
  const sameDayEnd = event.ends_at
    && new Date(event.ends_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
      === new Date(event.starts_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const endLabel = event.ends_at
    ? (sameDayEnd
      ? new Date(event.ends_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
      : formatEventDate(event.ends_at))
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.03 }}
      className={`bg-card border border-border rounded-2xl overflow-hidden flex flex-col ${event.status === 'cancelled' ? 'opacity-80' : ''}`}
    >
      <div className="relative aspect-[16/7] bg-secondary">
        {event.cover_image_url ? (
          <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 via-secondary to-blue-500/20 flex items-center justify-center">
            <CalendarClock className="w-8 h-8 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <StatusPill className={`${EVENT_STATUS_STYLES[event.status] || EVENT_STATUS_STYLES.draft} backdrop-blur-sm`}>
            {eventStatusLabel(event.status)}
          </StatusPill>
          {phase === 'today' && event.status === 'published' && (
            <StatusPill className="bg-primary/20 text-primary border-primary/30 backdrop-blur-sm" icon={Clock}>Aujourd'hui</StatusPill>
          )}
        </div>
        <div className="absolute top-2 right-2">
          <StatusPill className="bg-black/50 text-white border-white/15 backdrop-blur-sm" icon={isPublic ? Globe : Lock}>
            {isPublic ? 'Ouvert à tous' : 'Sur invitation'}
          </StatusPill>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold leading-tight">{event.title}</h3>
          {event.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">{event.description}</p>}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
            <span className="text-foreground">{formatEventDate(event.starts_at, { withYear: true })}{endLabel ? ` → ${endLabel}` : ''}</span>
          </p>
          {event.location && (
            <p className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="line-clamp-1">{event.location}</span>
            </p>
          )}
          {event.dress_code && (
            <p className="flex items-center gap-1.5">
              <Shirt className="w-3.5 h-3.5 shrink-0" />
              <span>Tenue : <span className="text-foreground">{event.dress_code}</span></span>
            </p>
          )}
          {event.reminder_sent_at && (
            <p className="flex items-center gap-1.5 text-green-400/80">
              <Bell className="w-3.5 h-3.5 shrink-0" />
              <span>Rappel envoyé le {formatParisDateTime(event.reminder_sent_at)}</span>
            </p>
          )}
        </div>

        <div className="rounded-xl bg-secondary/50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm font-bold ${Number(event.price) > 0 ? 'text-primary' : 'text-green-400'}`}>{formatPrice(event.price)}</span>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Armchair className="w-3.5 h-3.5" />
              {capacity
                ? <><span className={`font-semibold ${full ? 'text-red-400' : 'text-foreground'}`}>{stats.seats}</span> / {capacity} places</>
                : <><span className="font-semibold text-foreground">{stats.seats}</span> {stats.seats > 1 ? 'places prises' : 'place prise'} · illimité</>}
            </span>
          </div>
          {capacity > 0 && (
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className={`h-full rounded-full ${full ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${fill}%` }} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <Stat icon={Users} value={stats.total} label={stats.total > 1 ? 'invités' : 'invité'} />
            <Stat icon={UserCheck} value={stats.accepted} label={stats.accepted > 1 ? 'viennent' : 'vient'} valueClassName={stats.accepted > 0 ? 'text-green-400' : 'text-foreground'} />
            {stats.pending > 0 && <Stat icon={Clock} value={stats.pending} label="sans réponse" />}
            {stats.declined > 0 && <Stat icon={Ban} value={stats.declined} label={stats.declined > 1 ? 'ne viennent pas' : 'ne vient pas'} />}
          </div>
        </div>

        {event.notes && isAdmin && (
          <p className="text-[11px] text-muted-foreground border-l-2 border-border pl-2 line-clamp-2 whitespace-pre-line" title={event.notes}>
            {event.notes}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
          <ActionButton icon={Users} label={`Invités${stats.total > 0 ? ` (${stats.total})` : ''}`} onClick={() => onGuests(event)} disabled={busy}
            className="border-primary/30 text-primary hover:bg-primary/10" />
          {isAdmin && (
            <>
              <ActionButton icon={Pencil} label="Modifier" onClick={() => onEdit(event)} disabled={busy} />
              {canPublish && (
                <ActionButton icon={Rocket} label="Publier" onClick={() => onPublish(event)} disabled={busy}
                  className="border-green-500/30 text-green-400 hover:bg-green-500/10" />
              )}
              {canCancel && (
                <TwoTapButton icon={Ban} label="Annuler" confirmLabel="Prévenir les invités et annuler ?" disabled={busy}
                  title={`Les ${countLabel(stats.total - stats.declined, 'invité', 'invités')} qui n'ont pas refusé reçoivent un push d'annulation`}
                  onConfirm={() => onCancel(event)} />
              )}
              {canFinish && (
                <TwoTapButton icon={Flag} label="Terminer" confirmLabel="Marquer terminé ?" disabled={busy}
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  armedClassName="border-blue-500 bg-blue-500 text-white animate-pulse"
                  onConfirm={() => onDone(event)} />
              )}
              <TwoTapButton icon={Trash2} label="Supprimer" confirmLabel="Supprimer définitivement ?" disabled={busy}
                title={stats.total > 0 ? `Supprime aussi ${countLabel(stats.total, 'invitation', 'invitations')} (sans prévenir)` : undefined}
                onConfirm={() => onDelete(event)} />
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
