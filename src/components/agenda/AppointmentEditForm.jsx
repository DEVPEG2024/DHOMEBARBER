import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, Clock, Minus, Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { getServiceColor } from '@/utils/serviceColors';
import {
  timeToMinutes, addMinutesToTime, parseDateParam, workingWindow, isOnLeave, minutesToTime,
} from './agendaUtils';

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50';
const labelCls = 'text-xs text-muted-foreground mb-1 block';

const normalizeService = (s) => ({
  service_id: s.service_id ?? s.id ?? null,
  name: s.name || 'Prestation',
  price: Number(s.price) || 0,
  duration: Number(s.duration) || 0,
});

const sameServices = (a, b) =>
  a.length === b.length && a.every((s, i) => String(s.service_id) === String(b[i].service_id) && s.name === b[i].name);

function isUpcoming(dateStr, time) {
  const d = parseDateParam(dateStr);
  if (!d || !/^\d{2}:\d{2}$/.test(time || '')) return false;
  const m = timeToMinutes(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60) > new Date();
}

/**
 * Modification d'un rendez-vous à tout moment (staff) : jour, heure, barber, prestations, durée,
 * client et note interne. Les chevauchements, congés et horaires sont signalés sans bloquer
 * (le salon peut vouloir caser un client) ; seul un départ à la même heure que le rendez-vous
 * d'un même barber est refusé, comme le fait la base.
 */
export default function AppointmentEditForm({ appointment, employees, onCancel, onSaved }) {
  const original = useMemo(() => (appointment.services || []).map(normalizeService), [appointment]);
  const originalDuration = appointment.total_duration
    || (timeToMinutes(appointment.end_time) - timeToMinutes(appointment.start_time))
    || original.reduce((s, x) => s + x.duration, 0)
    || 30;

  const [date, setDate] = useState(String(appointment.date || '').slice(0, 10));
  const [startTime, setStartTime] = useState(String(appointment.start_time || '').slice(0, 5));
  const [employeeId, setEmployeeId] = useState(appointment.employee_id ? String(appointment.employee_id) : '');
  const [services, setServices] = useState(original);
  const [duration, setDuration] = useState(originalDuration);
  const [durationTouched, setDurationTouched] = useState(false);
  const [clientName, setClientName] = useState(appointment.client_name || '');
  const [clientPhone, setClientPhone] = useState(appointment.client_phone || '');
  const [internalNotes, setInternalNotes] = useState(appointment.internal_notes || '');
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: catalog = [] } = useQuery({
    queryKey: ['servicesForModal'],
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });

  const { data: timeOffs = [] } = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
  });

  const validDate = !!parseDateParam(date);
  const validTime = /^\d{2}:\d{2}$/.test(startTime);
  const { data: dayApts = [], isFetching: checking } = useQuery({
    queryKey: ['agendaAppointments', 'edit-check', date, employeeId],
    queryFn: () => api.entities.Appointment.filter({ date, employee_id: employeeId }, 'start_time', 200),
    enabled: validDate && !!employeeId,
  });

  const employee = employees.find((e) => String(e.id) === employeeId);
  const servicesChanged = !sameServices(services, original);
  const totalPrice = servicesChanged ? services.reduce((s, x) => s + x.price, 0) : (Number(appointment.total_price) || 0);
  const endTime = validTime ? addMinutesToTime(startTime, duration) : '';

  const updateServices = (next) => {
    setServices(next);
    const sum = next.reduce((s, x) => s + x.duration, 0);
    if (!durationTouched && sum > 0) setDuration(sum);
  };

  // ─── Contrôles (avertissements, sauf le même horaire de départ) ───
  const { clash, warnings } = useMemo(() => {
    const out = [];
    if (!validDate || !validTime || !employeeId) return { clash: null, warnings: out };
    const s = timeToMinutes(startTime);
    const e = s + duration;
    const others = dayApts.filter((a) => a.id !== appointment.id && a.status !== 'cancelled' && a.status !== 'no_show');
    const sameStart = others.find((a) => String(a.start_time).slice(0, 5) === startTime);
    for (const a of others) {
      if (a === sameStart) continue;
      const as = timeToMinutes(a.start_time);
      const ae = timeToMinutes(a.end_time || a.start_time);
      if (as < e && ae > s) {
        out.push(a.status === 'break'
          ? `Chevauche une pause (${a.start_time} – ${a.end_time})`
          : `Chevauche ${a.client_name || 'un rendez-vous'} (${a.start_time} – ${a.end_time})`);
      }
    }
    const approved = timeOffs.filter((t) => t.status === 'approved' || !t.status);
    if (isOnLeave(approved, employeeId, date)) out.push(`${employee?.name || 'Ce barber'} est en congé ce jour-là`);
    const win = workingWindow(employee, date);
    if (win === null) out.push(`${employee?.name || 'Ce barber'} ne travaille pas ce jour-là`);
    else if (win && (s < win.start || e > win.end)) {
      out.push(`En dehors des horaires de ${employee?.name || 'ce barber'} (${minutesToTime(win.start)} – ${minutesToTime(win.end)})`);
    }
    return {
      clash: sameStart
        ? `${sameStart.status === 'break' ? 'Une pause' : (sameStart.client_name || 'Un rendez-vous')} commence déjà à ${startTime} pour ${employee?.name || 'ce barber'}`
        : null,
      warnings: out,
    };
  }, [validDate, validTime, employeeId, startTime, duration, dayApts, appointment.id, timeOffs, employee, date]);

  const moved = date !== String(appointment.date || '').slice(0, 10)
    || startTime !== String(appointment.start_time || '').slice(0, 5)
    || employeeId !== String(appointment.employee_id || '');
  const canNotify = moved && !!appointment.client_email
    && ['confirmed', 'pending'].includes(appointment.status) && isUpcoming(date, startTime);

  const handleSave = async () => {
    if (!validDate) return toast.error('Date invalide');
    if (!validTime) return toast.error('Heure de début invalide');
    if (!employeeId) return toast.error('Choisissez un barber');
    if (!(duration >= 5 && duration <= 600)) return toast.error('Durée entre 5 min et 10 h');
    if (timeToMinutes(startTime) + duration > 24 * 60) return toast.error('Le rendez-vous dépasserait minuit');
    if (clash) return toast.error(clash);

    const payload = {
      date,
      start_time: startTime,
      end_time: endTime,
      total_duration: duration,
      employee_id: employeeId,
      employee_name: employee?.name || appointment.employee_name || '',
      client_name: clientName.trim() || appointment.client_name,
      client_phone: clientPhone.trim(),
      internal_notes: internalNotes.trim(),
      notify_client: canNotify ? notify : false,
    };
    if (servicesChanged) {
      payload.services = services;
      payload.total_price = totalPrice;
      if (appointment.status === 'completed') {
        payload.grand_total = totalPrice + (Number(appointment.tip) || 0) + (Number(appointment.product_price) || 0);
      }
    }

    setSaving(true);
    try {
      const updated = await api.entities.Appointment.update(appointment.id, payload);
      toast.success(moved
        ? (canNotify && notify ? 'Rendez-vous déplacé · client prévenu' : 'Rendez-vous déplacé')
        : 'Rendez-vous modifié');
      onSaved({ ...appointment, ...payload, ...(updated || {}) });
    } catch (e) {
      toast.error(e?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const available = catalog.filter((c) => !services.some((s) => String(s.service_id) === String(c.id)));
  const barberMissing = employeeId && !employee;

  return (
    <div className="space-y-4">
      {/* Quand */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} htmlFor="apt-date">Date</label>
          <input id="apt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="apt-time">Début</label>
          <input id="apt-time" type="time" step="300" value={startTime} onChange={(e) => setStartTime(e.target.value.slice(0, 5))} className={inputCls} />
        </div>
      </div>

      {/* Barber */}
      <div>
        <label className={labelCls} htmlFor="apt-barber">Barber</label>
        <select id="apt-barber" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={`${inputCls} appearance-none`}>
          {!employeeId && <option value="" className="bg-card">Choisir…</option>}
          {barberMissing && <option value={employeeId} className="bg-card">{appointment.employee_name || 'Barber inactif'}</option>}
          {employees.map((emp) => (
            <option key={emp.id} value={String(emp.id)} className="bg-card">{emp.name}</option>
          ))}
        </select>
      </div>

      {/* Prestations */}
      <div>
        <p className={labelCls}>Prestations</p>
        {services.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {services.map((s, idx) => (
              <div key={`${s.service_id}-${idx}`} className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{ background: getServiceColor(s.service_id || idx) + '22', borderLeft: `3px solid ${getServiceColor(s.service_id || idx)}` }}>
                <span className="text-sm font-medium truncate">{s.name}</span>
                <span className="flex items-center gap-2 text-xs shrink-0">
                  <span className="text-muted-foreground">{s.duration} min</span>
                  <span className="font-bold text-primary">{s.price}€</span>
                  <button type="button" onClick={() => updateServices(services.filter((_, i) => i !== idx))}
                    className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center hover:bg-red-500/30" aria-label={`Retirer ${s.name}`}>
                    <X className="w-3 h-3 text-red-400" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <select
          value=""
          onChange={(e) => {
            const svc = catalog.find((c) => String(c.id) === e.target.value);
            if (svc) updateServices([...services, normalizeService(svc)]);
          }}
          className={`${inputCls} appearance-none`}
        >
          <option value="" className="bg-card">Ajouter une prestation…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id} className="bg-card">{c.name} — {c.price}€ ({c.duration} min)</option>
          ))}
        </select>
      </div>

      {/* Durée → fin */}
      <div className="flex items-center gap-3 bg-secondary rounded-xl px-3 py-2.5">
        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setDurationTouched(true); setDuration((d) => Math.max(5, d - 5)); }}
            className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center" aria-label="5 minutes de moins">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            step={5}
            value={duration}
            onChange={(e) => { setDurationTouched(true); setDuration(Math.max(0, parseInt(e.target.value, 10) || 0)); }}
            className="w-14 bg-transparent text-center text-sm font-semibold focus:outline-none"
            aria-label="Durée en minutes"
          />
          <button type="button" onClick={() => { setDurationTouched(true); setDuration((d) => Math.min(600, d + 5)); }}
            className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center" aria-label="5 minutes de plus">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-muted-foreground ml-1">min</span>
        </div>
        <div className="ml-auto text-right">
          <p className="text-sm font-semibold tabular-nums">{validTime ? `${startTime} – ${endTime}` : '--:--'}</p>
          <p className="text-[11px] text-primary font-bold">{totalPrice}€</p>
        </div>
      </div>

      {/* Client */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} htmlFor="apt-client">Client</label>
          <input id="apt-client" type="text" value={clientName} maxLength={120} onChange={(e) => setClientName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="apt-phone">Téléphone</label>
          <input id="apt-phone" type="tel" value={clientPhone} maxLength={30} onChange={(e) => setClientPhone(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="apt-notes">Note interne (invisible pour le client)</label>
        <textarea id="apt-notes" rows={2} value={internalNotes} maxLength={1000} onChange={(e) => setInternalNotes(e.target.value)} className={`${inputCls} resize-none`} />
      </div>

      {/* Contrôles */}
      {(clash || warnings.length > 0) && (
        <div className={`rounded-xl px-3 py-2.5 space-y-1 border ${clash ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
          {clash && (
            <p className="text-xs text-red-400 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />{clash}</p>
          )}
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
        <button type="button" onClick={onCancel} disabled={saving}
          className="flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-60">
          Annuler
        </button>
        <button type="button" onClick={handleSave} disabled={saving || !!clash}
          className="flex-[2] py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
          {(saving || checking) && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Enregistrement…' : warnings.length ? 'Enregistrer quand même' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
