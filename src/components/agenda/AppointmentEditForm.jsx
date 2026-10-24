import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, Clock, Minus, Plus, X, Loader2, UserRound, Link2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { getServiceColor } from '@/utils/serviceColors';
import { useAppointmentOrders, orderItemsLabel } from '@/lib/appointmentProducts';
import ClientAccountPicker from './ClientAccountPicker';
import { GUEST_NAME_MAX, guestNameError, guestOf, normalizeGuestName, useGuestBooking } from '@/lib/guest';
import {
  timeToMinutes, addMinutesToTime, parseDateParam, slotIssues, isUpcomingSlot,
  LAST_MINUTE_MARKER, withLastMinuteMarker, stripLastMinuteMarker, agendaErrorMessage, invalidateAppointmentQueries,
  isFreeLastMinute, coveredLastMinuteNote, removeCoveredLastMinutes,
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

/**
 * Modification d'un rendez-vous à tout moment (staff) : jour, heure, barber, prestations, durée,
 * client et note interne. Les chevauchements, congés et horaires sont signalés sans bloquer
 * (le salon peut vouloir caser un client) ; seul un départ à la même heure que le rendez-vous
 * d'un même barber est refusé, comme le fait la base.
 */
export default function AppointmentEditForm({ appointment, employees, onCancel, onSaved }) {
  const queryClient = useQueryClient();
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
  // Proche venu à la place du client (fils, frère…), prénom seulement ; vide = le client lui-même.
  // Proposé seulement quand le serveur accepte la colonne (`features.guestBooking`)
  const guestFeature = useGuestBooking();
  const [guestInput, setGuestInput] = useState(guestOf(appointment));
  const guestChanged = normalizeGuestName(guestInput) !== guestOf(appointment);
  const guestError = guestChanged && normalizeGuestName(guestInput) ? guestNameError(guestInput, { filter: false }) : null;
  // Autre compte rattaché : le proche de l'ancien compte ne le suit pas (champ vidé s'il n'a pas
  // été retouché ; l'équipe peut en saisir un autre)
  const dropGuestOfOtherAccount = (email) => {
    const same = String(email || '').toLowerCase() === String(appointment.client_email || '').toLowerCase();
    if (!same && normalizeGuestName(guestInput) === guestOf(appointment)) setGuestInput('');
  };
  // Compte client rattaché (email) : la visite compte sur sa carte Gang
  const [clientEmail, setClientEmail] = useState(appointment.client_email || '');
  const [pickingAccount, setPickingAccount] = useState(false);
  const accountChanged = clientEmail !== (appointment.client_email || '');
  // Produits commandés avec ce RDV (commandes `appointment_id`, encore à remettre) : ils restent
  // sur le compte qui les a commandés, changer le compte du RDV ne les transfère pas
  const { data: linkedOrdersMap } = useAppointmentOrders([appointment.id], { enabled: !!appointment.client_email });
  const linkedOrders = linkedOrdersMap?.get(String(appointment.id)) || [];
  const linkedProductsLabel = linkedOrders.map(orderItemsLabel).filter(Boolean).join(', ');
  // Le repère d'un last minute pris reste hors du champ (invisible, conservé à l'enregistrement)
  const hadLastMinuteMarker = String(appointment.internal_notes || '').includes(LAST_MINUTE_MARKER);
  const [internalNotes, setInternalNotes] = useState(stripLastMinuteMarker(appointment.internal_notes));
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
  // Prestation réglée par carte cadeau : un prix relevé au-delà du débit doit être encaissé en
  // CB / espèces d'abord (« Corriger l'encaissement ») ; le serveur refuse sinon (409)
  const giftDebited = Number(appointment.gift_card_amount) || 0;
  const giftOverrun = appointment.status === 'completed' && appointment.payment_method === 'carte_cadeau'
    && giftDebited > 0
    && Math.round((totalPrice + (Number(appointment.product_price) || 0)) * 100) > Math.round(giftDebited * 100);
  // Prix ramené sous ce que la carte a réglé (prestation retirée) : l'excédent resterait débité de la
  // carte sans trace ; il faut d'abord le rendre (Cartes cadeau). Même refus que le serveur (409), tour 7
  const newPriceCents = Math.round((totalPrice + (Number(appointment.product_price) || 0)) * 100);
  const oldPriceCents = Math.round(((Number(appointment.total_price) || 0) + (Number(appointment.product_price) || 0)) * 100);
  const giftExcessCents = giftDebited > 0 && servicesChanged && newPriceCents < oldPriceCents
    ? Math.round(giftDebited * 100) - newPriceCents : 0;
  const giftExcess = giftExcessCents > 0;

  const updateServices = (next) => {
    setServices(next);
    const sum = next.reduce((s, x) => s + x.duration, 0);
    if (!durationTouched && sum > 0) setDuration(sum);
  };

  // ─── Contrôles (avertissements, sauf le même horaire de départ) ───
  // Last Minute libres recouverts : retirés après l'enregistrement (sauf si l'on modifie un Last
  // Minute libre lui-même : les autres comptent alors comme avant)
  const editingFreeLastMinute = isFreeLastMinute(appointment);
  const { clash, warnings, lastMinutes } = useMemo(() => (
    validDate && validTime && employeeId
      ? slotIssues({ selfId: appointment.id, date, startTime, duration, employee, employeeId, dayApts, timeOffs, keepLastMinutes: editingFreeLastMinute })
      : { clash: null, warnings: [], lastMinutes: [] }
  ), [validDate, validTime, employeeId, startTime, duration, dayApts, appointment.id, timeOffs, employee, date, editingFreeLastMinute]);

  const moved = date !== String(appointment.date || '').slice(0, 10)
    || startTime !== String(appointment.start_time || '').slice(0, 5)
    || employeeId !== String(appointment.employee_id || '');
  // Prévenir le client d'un déplacement : seulement le compte déjà rattaché (pas celui qu'on rattache)
  const canNotify = moved && !!appointment.client_email && !accountChanged
    && ['confirmed', 'pending'].includes(appointment.status) && isUpcomingSlot(date, startTime);

  const handleSave = async () => {
    if (!validDate) return toast.error('Date invalide');
    if (!validTime) return toast.error('Heure de début invalide');
    if (!employeeId) return toast.error('Choisissez un barber');
    if (!(duration >= 5 && duration <= 600)) return toast.error('Durée entre 5 min et 10 h');
    if (timeToMinutes(startTime) + duration > 24 * 60) return toast.error('Le rendez-vous dépasserait minuit');
    if (clash) return toast.error(clash);
    if (guestFeature && guestError) return toast.error(`Prénom du proche : ${guestError}`);

    const payload = {
      date,
      start_time: startTime,
      end_time: endTime,
      total_duration: duration,
      employee_id: employeeId,
      employee_name: employee?.name || appointment.employee_name || '',
      client_name: clientName.trim() || appointment.client_name,
      client_phone: clientPhone.trim(),
      ...(accountChanged ? { client_email: clientEmail } : {}),
      ...(guestFeature && guestChanged ? { guest_name: normalizeGuestName(guestInput) || null } : {}),
      internal_notes: hadLastMinuteMarker ? withLastMinuteMarker(internalNotes) : internalNotes.trim(),
      notify_client: canNotify ? notify : false,
    };
    // Compte rattaché à un créneau last minute libre, ou vrai nom saisi pour un client venu sans
    // compte (mêmes noms libres que LAST_MINUTE_NAMES côté serveur) : le créneau est pris, il
    // devient un rendez-vous confirmé (bloquant pour les clients, sans expiration automatique)
    const typedName = clientName.trim();
    const walkInNamed = !clientEmail && typedName !== '' && typedName !== 'Last Minute';
    if (appointment.status === 'last_minute' && ((accountChanged && clientEmail) || walkInNamed)) {
      payload.status = 'confirmed';
      payload.internal_notes = withLastMinuteMarker(internalNotes);
    }
    if (servicesChanged) {
      payload.services = services;
      payload.total_price = totalPrice;
      if (appointment.status === 'completed') {
        payload.grand_total = totalPrice + (Number(appointment.tip) || 0) + (Number(appointment.product_price) || 0);
      }
    }

    // Fiche ouverte sur un Last Minute libre : si un client l'a repris entre-temps, le serveur
    // répond 409 au lieu d'écraser son rendez-vous (le drapeau n'est jamais écrit en base)
    const guarded = appointment.status === 'last_minute';
    if (guarded) payload.if_free_last_minute = true;

    setSaving(true);
    try {
      const updated = await api.entities.Appointment.update(appointment.id, payload);
      delete payload.if_free_last_minute;
      // Rendez-vous annulé ou absent : il ne prend pas le créneau, le Last Minute reste
      if (!['cancelled', 'no_show'].includes(appointment.status)) removeCoveredLastMinutes(queryClient, lastMinutes);
      toast.success(moved
        ? (canNotify && notify ? 'Rendez-vous déplacé · client prévenu' : 'Rendez-vous déplacé')
        : (accountChanged && clientEmail ? 'Compte client rattaché au rendez-vous' : 'Rendez-vous modifié'));
      onSaved({ ...appointment, ...payload, ...(updated || {}) });
    } catch (e) {
      if (e?.status === 409) invalidateAppointmentQueries(queryClient);
      toast.error(agendaErrorMessage(e, 'Erreur lors de l\'enregistrement'));
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
        <div className="min-w-0">
          <label className={labelCls} htmlFor="apt-client">Client</label>
          <input id="apt-client" type="text" value={clientName} maxLength={120} onChange={(e) => setClientName(e.target.value)} className={inputCls} />
        </div>
        <div className="min-w-0">
          <label className={labelCls} htmlFor="apt-phone">Téléphone</label>
          <input id="apt-phone" type="tel" value={clientPhone} maxLength={30} onChange={(e) => setClientPhone(e.target.value)} className={inputCls} />
        </div>
        {guestFeature && (
          <div className="col-span-2 min-w-0">
            <label className={labelCls} htmlFor="apt-guest">Pour un proche (prénom, facultatif)</label>
            <input id="apt-guest" type="text" value={guestInput} maxLength={GUEST_NAME_MAX} autoComplete="off" autoCapitalize="words"
              placeholder="Vide : le client lui-même" onChange={(e) => setGuestInput(e.target.value)}
              aria-invalid={!!guestError} className={inputCls} />
            {guestError && <p role="alert" className="mt-1 text-[11px] text-red-400">{guestError}</p>}
          </div>
        )}
      </div>

      {/* Compte client rattaché */}
      {pickingAccount ? (
        <ClientAccountPicker
          initialQuery={clientEmail ? '' : clientName.trim()}
          onClose={() => setPickingAccount(false)}
          onSelect={(acc) => {
            setClientEmail(acc.email);
            setClientName(acc.full_name || acc.email);
            if (acc.phone) setClientPhone(acc.phone);
            dropGuestOfOtherAccount(acc.email);
            setPickingAccount(false);
          }}
          onNoAccount={clientEmail ? () => { setClientEmail(''); dropGuestOfOtherAccount(''); setPickingAccount(false); } : undefined}
          noAccountLabel="Détacher le compte (nom libre)"
        />
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <UserRound className={`w-4 h-4 shrink-0 ${clientEmail ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-xs min-w-0 flex-1 truncate">
              {clientEmail
                ? <><span className="text-muted-foreground">Compte : </span><span className="font-medium">{clientEmail}</span></>
                : <span className="text-muted-foreground">Aucun compte client rattaché</span>}
            </p>
            {accountChanged && <span className="shrink-0 text-[10px] font-semibold text-primary">modifié</span>}
          </div>
          <button type="button" onClick={() => setPickingAccount(true)}
            className="text-xs font-semibold text-primary flex items-center gap-1">
            <Link2 className="w-3.5 h-3.5" /> {clientEmail ? 'Changer de compte' : 'Rattacher un compte client'}
          </button>
          <p className="text-[11px] text-muted-foreground">Avec un compte rattaché, la visite compte sur sa carte Gang.</p>
          {accountChanged && appointment.client_email && (
            <p className="text-[11px] text-amber-400">
              Ce rendez-vous quittera « Mes rendez-vous » de {appointment.client_email}{clientEmail ? `, et ses rappels iront à ${clientEmail}` : ''}.
            </p>
          )}
          {accountChanged && appointment.client_email && linkedOrders.length > 0 && (
            <p className="text-[11px] text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              <span>
                {linkedOrders.length > 1 ? `${linkedOrders.length} commandes de produits sont liées` : 'Une commande de produits est liée'} à ce rendez-vous
                {linkedProductsLabel ? ` (${linkedProductsLabel})` : ''} : elle{linkedOrders.length > 1 ? 's restent' : ' reste'} sur
                le compte de {appointment.client_email}{clientEmail ? `, rien n'est transféré à ${clientEmail}` : ''}.
              </span>
            </p>
          )}
        </div>
      )}

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
      {!clash && lastMinutes.length > 0 && !['cancelled', 'no_show'].includes(appointment.status) && (
        <div role="status" className="rounded-xl px-3 py-2 space-y-1 border border-orange-500/30 bg-orange-500/10">
          {lastMinutes.map((lm) => (
            <p key={lm.id} className="text-xs text-orange-300 flex items-start gap-1.5 break-words"><Zap className="w-3.5 h-3.5 mt-px shrink-0" />{coveredLastMinuteNote(lm)}</p>
          ))}
        </div>
      )}

      {giftOverrun && (
        <p role="status" className="rounded-xl px-3 py-2.5 border bg-amber-500/10 border-amber-500/30 text-xs text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          Le prix dépasse ce que la carte a réglé ({giftDebited}€) : corrigez d'abord l'encaissement en CB / espèces
        </p>
      )}

      {giftExcess && (
        <p role="status" className="rounded-xl px-3 py-2.5 border bg-amber-500/10 border-amber-500/30 text-xs text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span className="min-w-0 break-words">
            La carte cadeau a réglé {giftDebited}€ : le nouveau prix est plus bas de {(giftExcessCents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}€. Rendez d'abord cette somme sur la carte (Cartes cadeau, historique de la carte : « Annuler » sous 24 h, sinon « Rendre sur la carte »), puis modifiez les prestations.
          </span>
        </p>
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
        <button type="button" onClick={handleSave} disabled={saving || !!clash || giftExcess}
          className="flex-[2] py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
          {(saving || checking) && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Enregistrement…' : warnings.length ? 'Enregistrer quand même' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
