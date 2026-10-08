import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, AlertTriangle, Bell, Loader2, MoveVertical } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  addMinutesToTime, aptDuration, invalidateAppointmentQueries, isBreak, isUpcomingSlot, shortDayLabel, slotIssues,
} from './agendaUtils';

/** Champs écrits par un déplacement : jour, heure, fin recalculée (même durée), barber. */
export function buildMoveFields(apt, { date, start_time, employee_id }, employees) {
  const emp = employees.find((e) => String(e.id) === String(employee_id));
  return {
    date,
    start_time,
    end_time: addMinutesToTime(start_time, aptDuration(apt)),
    employee_id,
    employee_name: emp?.name || apt.employee_name || '',
  };
}

/**
 * Enregistre un déplacement. La carte est posée tout de suite à sa nouvelle place (mise à jour
 * optimiste du cache de l'agenda), puis toutes les listes de rendez-vous sont rechargées,
 * y compris en cas d'échec (la carte revient alors où elle était).
 */
export async function saveMove(queryClient, apt, fields, notifyClient) {
  await queryClient.cancelQueries({ queryKey: ['agendaAppointments'] });
  queryClient.setQueriesData({ queryKey: ['agendaAppointments'] }, (old) =>
    (Array.isArray(old) ? old.map((a) => (a.id === apt.id ? { ...a, ...fields } : a)) : old));
  try {
    return await api.entities.Appointment.update(apt.id, { ...fields, notify_client: !!notifyClient });
  } finally {
    invalidateAppointmentQueries(queryClient);
  }
}

function Row({ label, date, start, end, barber, highlight = {} }) {
  const hl = (on) => (on ? 'text-primary font-bold' : '');
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-12 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0">
        <span className={`capitalize ${hl(highlight.date)}`}>{shortDayLabel(date)}</span>
        {' · '}
        <span className={`tabular-nums ${hl(highlight.time)}`}>{start} – {end}</span>
        {barber && <>{' · '}<span className={hl(highlight.barber)}>{barber}</span></>}
      </span>
    </div>
  );
}

/**
 * Confirmation d'un rendez-vous client posé ailleurs dans la grille : avant / après, alertes
 * (chevauchement, congé, horaires), case « Prévenir le client » pour un rendez-vous à venir.
 * `move` = { apt, date, start_time, employee_id } ; `appointments` = rendez-vous déjà chargés
 * de la période (tous barbers), qui contiennent forcément le jour d'arrivée.
 */
export default function MoveDialog({ move, employees, appointments, timeOffs, onClose }) {
  const queryClient = useQueryClient();
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const apt = move?.apt;
  const fields = useMemo(() => (move ? buildMoveFields(apt, move, employees) : null), [move, apt, employees]);
  const employee = move ? employees.find((e) => String(e.id) === String(move.employee_id)) : null;
  const { clash, warnings } = useMemo(() => (move
    ? slotIssues({
      selfId: apt.id, date: fields.date, startTime: fields.start_time, duration: aptDuration(apt),
      employee, employeeId: move.employee_id, dayApts: appointments, timeOffs,
    })
    : { clash: null, warnings: [] }), [move, apt, fields, employee, appointments, timeOffs]);

  if (!move) return null;

  const canNotify = !!apt.client_email && ['confirmed', 'pending'].includes(apt.status) && isUpcomingSlot(fields.date, fields.start_time);
  const changed = {
    date: String(apt.date).slice(0, 10) !== fields.date,
    time: String(apt.start_time).slice(0, 5) !== fields.start_time,
    barber: String(apt.employee_id) !== String(fields.employee_id),
  };

  const confirm = async () => {
    setSaving(true);
    try {
      await saveMove(queryClient, apt, fields, canNotify && notify);
      toast.success(canNotify && notify ? 'Rendez-vous déplacé · client prévenu' : 'Rendez-vous déplacé');
      onClose();
    } catch (e) {
      toast.error(e?.message || 'Déplacement impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="bg-card border-border sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-base">
            <MoveVertical className="w-4 h-4 text-primary" />
            Déplacer {isBreak(apt) ? 'la pause' : 'le rendez-vous'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!isBreak(apt) && (
            <p className="text-sm font-semibold">
              {apt.client_name || 'Client'}
              {apt.services?.length > 0 && (
                <span className="font-normal text-muted-foreground"> · {apt.services.map((s) => s.name).join(' + ')}</span>
              )}
            </p>
          )}

          <div className="bg-secondary rounded-xl px-3 py-2.5 space-y-1.5">
            <Row label="Avant" date={apt.date} start={apt.start_time} end={apt.end_time} barber={apt.employee_name} />
            <ArrowDown className="w-3.5 h-3.5 text-muted-foreground ml-14" />
            <Row label="Après" date={fields.date} start={fields.start_time} end={fields.end_time} barber={fields.employee_name} highlight={changed} />
          </div>

          {(clash || warnings.length > 0) && (
            <div className={`rounded-xl px-3 py-2.5 space-y-1 border ${clash ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
              {clash && <p className="text-xs text-red-400 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />{clash}</p>}
              {warnings.map((w) => (
                <p key={w} className="text-xs text-amber-300 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />{w}</p>
              ))}
            </div>
          )}

          {canNotify && (
            <label className="flex items-start gap-2.5 bg-primary/10 border border-primary/20 rounded-xl px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[hsl(var(--primary))]" />
              <span className="text-xs">
                <span className="font-semibold flex items-center gap-1"><Bell className="w-3 h-3" /> Prévenir le client</span>
                <span className="text-muted-foreground">Notification et email avec le nouvel horaire.</span>
              </span>
            </label>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-60">
              Annuler
            </button>
            <button type="button" onClick={confirm} disabled={saving || !!clash}
              className="flex-[2] py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Déplacement…' : warnings.length ? 'Déplacer quand même' : 'Déplacer'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
