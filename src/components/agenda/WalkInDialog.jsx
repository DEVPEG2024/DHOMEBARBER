import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCircle2, Clock, Loader2, Minus, Plus, Search, UserPlus, UserRound, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ClientAccountPicker, { foldText } from './ClientAccountPicker';
import { GUEST_NAME_MAX, guestNameError, normalizeGuestName, useGuestBooking } from '@/lib/guest';
import {
  timeToMinutes, minutesToTime, addMinutesToTime, parseDateParam, slotIssues, appointmentEndParis,
  invalidateAppointmentQueries, agendaErrorMessage, coveredLastMinuteNote, removeCoveredLastMinutes,
} from './agendaUtils';

const inputCls = 'w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50';
const labelCls = 'text-xs text-muted-foreground mb-1 block';

// Heure et jour au salon (Paris), quel que soit le fuseau de l'appareil
const PARIS_HM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
const parisTodayStr = () => PARIS_DAY.format(new Date());

/** Heure actuelle à Paris arrondie aux 5 minutes inférieures (« 14:37 » → « 14:35 »). */
function nowRounded(offsetMinutes = 0) {
  const [h, mi] = PARIS_HM.format(new Date()).split(':').map(Number);
  const m = Math.max(0, h * 60 + mi - offsetMinutes);
  return minutesToTime(Math.floor(m / 5) * 5);
}

const formatEuros = (n) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;

/**
 * Saisie d'un client venu sans rendez-vous (ou d'un rendez-vous pris par téléphone) depuis l'agenda.
 * Le compte du client (s'il en a un) est rattaché au rendez-vous : la visite compte alors sur sa
 * carte Gang une fois la prestation passée. `onCreated(rdv, { done })` après l'enregistrement.
 */
function WalkInForm({ employees, defaultEmployeeId, defaultDate, defaultTime, onCancel, onCreated }) {
  const queryClient = useQueryClient();
  const isToday = defaultDate === parisTodayStr();

  const [account, setAccount] = useState(null); // { email, full_name, phone }
  const [clientMode, setClientMode] = useState('search'); // search | account | free
  const [freeName, setFreeName] = useState('');
  // Proche venu avec le compte choisi (fils, frère…) : prénom seulement, vide = le client lui-même.
  // Proposé quand le serveur accepte la colonne (`features.guestBooking`), comme dans « Modifier »
  const guestFeature = useGuestBooking();
  const [guestInput, setGuestInput] = useState('');
  const [freePhone, setFreePhone] = useState('');
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId || (employees.length === 1 ? String(employees[0].id) : ''));
  const [date, setDate] = useState(defaultDate);
  // Heure de la case cliquée dans la grille, sinon maintenant (aujourd'hui) ou 09:00
  const [startTime, setStartTime] = useState(/^\d{2}:\d{2}$/.test(defaultTime || '') ? defaultTime : (isToday ? nowRounded() : '09:00'));
  const [selectedIds, setSelectedIds] = useState([]);
  const [duration, setDuration] = useState(0);
  const [durationTouched, setDurationTouched] = useState(false);
  const [doneChoice, setDoneChoice] = useState(null); // null = suit l'heure de fin
  const [notes, setNotes] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: catalog = [], isLoading: catalogLoading, isError: catalogError, refetch: refetchCatalog } = useQuery({
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

  const employee = employees.find((e) => String(e.id) === String(employeeId));
  const selected = useMemo(
    () => selectedIds.map((id) => catalog.find((c) => String(c.id) === id)).filter(Boolean),
    [selectedIds, catalog],
  );
  const servicesDuration = selected.reduce((s, x) => s + (Number(x.duration) || 0), 0);
  const effectiveDuration = durationTouched ? duration : (servicesDuration || 30);
  const totalPrice = selected.reduce((s, x) => s + (Number(x.price) || 0), 0);
  const endTime = validTime ? addMinutesToTime(startTime, effectiveDuration) : '';

  // Fin déjà passée → « Prestation déjà terminée » cochée d'office (tant que le barber n'y a pas touché).
  // L'heure saisie est celle du salon (`nowRounded` part de l'heure de Paris) : la fin est donc
  // calculée en instant réel à Paris, sinon la case se cochait à tort sur un appareil hors fuseau.
  const endPassed = useMemo(() => {
    if (!validDate || !validTime) return false;
    const end = appointmentEndParis({ date, start_time: startTime, end_time: endTime });
    return end != null && end <= Date.now();
  }, [validDate, validTime, date, startTime, endTime]);
  const done = doneChoice ?? endPassed;

  // Last Minute libres recouverts : ils ne bloquent pas, ils sont retirés après l'enregistrement
  const { clash, warnings, lastMinutes } = useMemo(() => (
    validDate && validTime && employeeId
      ? slotIssues({ selfId: null, date, startTime, duration: effectiveDuration, employee, employeeId, dayApts, timeOffs })
      : { clash: null, warnings: [], lastMinutes: [] }
  ), [validDate, validTime, employeeId, startTime, effectiveDuration, dayApts, timeOffs, employee, date]);

  const shownServices = useMemo(() => {
    const q = foldText(serviceQuery);
    return q ? catalog.filter((c) => foldText(c.name).includes(q)) : catalog;
  }, [catalog, serviceQuery]);

  const toggleService = (id) => {
    const key = String(id);
    setSelectedIds((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const clientName = clientMode === 'account' ? (account?.full_name || account?.email || '') : freeName.trim();
  const guestName = guestFeature && clientMode === 'account' ? normalizeGuestName(guestInput) : '';
  const guestError = guestName ? guestNameError(guestInput, { filter: false }) : null;
  const clientReady = clientMode === 'account' ? !!account : (clientMode === 'free' && freeName.trim().length > 0);
  const durationOk = effectiveDuration >= 5 && effectiveDuration <= 600;
  const tooLate = validTime && timeToMinutes(startTime) + effectiveDuration > 24 * 60;
  const missing = [
    !clientReady && (clientMode === 'free' ? 'le nom du client' : 'le client'),
    !employeeId && 'le barber',
    selected.length === 0 && 'au moins une prestation',
  ].filter(Boolean);
  const canSave = !saving && missing.length === 0 && validDate && validTime && durationOk && !tooLate && !clash && !guestError;

  const handleSave = async () => {
    if (!canSave) return;
    const payload = {
      client_name: clientName.slice(0, 120),
      client_email: clientMode === 'account' ? account.email : '',
      client_phone: (clientMode === 'account' ? account.phone : freePhone.trim()).slice(0, 30),
      employee_id: employeeId,
      employee_name: employee?.name || '',
      services: selected.map((s) => ({
        service_id: s.id,
        name: s.name || 'Prestation',
        duration: Number(s.duration) || 0,
        price: Number(s.price) || 0,
      })),
      date,
      start_time: startTime,
      end_time: endTime,
      total_duration: effectiveDuration,
      total_price: totalPrice,
      status: 'confirmed',
    };
    if (notes.trim()) payload.internal_notes = notes.trim().slice(0, 1000);
    if (guestName) payload.guest_name = guestName;

    setSaving(true);
    try {
      const created = await api.entities.Appointment.create(payload);
      invalidateAppointmentQueries(queryClient);
      // Créneau pris : le Last Minute qu'il recouvre n'est plus proposé aux clients
      removeCoveredLastMinutes(queryClient, lastMinutes);
      onCreated({ ...payload, ...(created || {}) }, { done });
    } catch (e) {
      if (e?.status === 409) {
        toast.error(`${employee?.name || 'Ce barber'} a déjà un rendez-vous qui commence à ${startTime}. Choisissez une autre heure de début (par exemple ${addMinutesToTime(startTime, 5)}).`);
        queryClient.invalidateQueries({ queryKey: ['agendaAppointments', 'edit-check', date, employeeId] });
      } else {
        toast.error(agendaErrorMessage(e, 'Enregistrement impossible. Vérifiez la connexion et réessayez.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const changeDuration = (delta) => {
    setDurationTouched(true);
    setDuration(Math.min(600, Math.max(5, effectiveDuration + delta)));
  };

  return (
    <div className="space-y-4 min-w-0">
      {/* Client */}
      <section className="space-y-2">
        <p className={labelCls}>Client</p>
        {clientMode === 'search' && (
          <ClientAccountPicker
            autoFocus={false}
            onSelect={(acc) => { setAccount(acc); setClientMode('account'); }}
            onNoAccount={() => setClientMode('free')}
          />
        )}
        {clientMode === 'account' && account && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 flex items-center gap-3 min-w-0">
            <UserRound className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{account.full_name || account.email}</p>
              <p className="text-[11px] text-muted-foreground truncate">{account.email}{account.phone ? ` · ${account.phone}` : ''}</p>
            </div>
            <button type="button" onClick={() => { setClientMode('search'); setGuestInput(''); }}
              className="shrink-0 text-xs font-semibold text-primary px-2 py-1 rounded-lg hover:bg-primary/15">
              Changer
            </button>
          </div>
        )}
        {clientMode === 'account' && account && guestFeature && (
          <div className="min-w-0">
            <label className={labelCls} htmlFor="walkin-guest">Pour un proche (prénom, facultatif)</label>
            <input id="walkin-guest" type="text" value={guestInput} maxLength={GUEST_NAME_MAX} autoComplete="off" autoCapitalize="words"
              placeholder="Vide : le client lui-même" onChange={(e) => setGuestInput(e.target.value)}
              aria-invalid={!!guestError} className={inputCls} />
            {guestError && <p role="alert" className="mt-1 text-[11px] text-red-400">{guestError}</p>}
          </div>
        )}
        {clientMode === 'free' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
              <input type="text" value={freeName} maxLength={120} onChange={(e) => setFreeName(e.target.value)}
                placeholder="Nom du client *" className={inputCls} aria-label="Nom du client" />
              <input type="tel" value={freePhone} maxLength={30} onChange={(e) => setFreePhone(e.target.value)}
                placeholder="Téléphone (facultatif)" className={inputCls} aria-label="Téléphone du client" />
            </div>
            <button type="button" onClick={() => setClientMode('search')}
              className="text-xs font-semibold text-primary flex items-center gap-1">
              <Search className="w-3 h-3" /> Rechercher plutôt un compte client
            </button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {clientMode === 'account'
            ? 'La visite comptera sur sa carte Gang.'
            : 'Avec un compte rattaché, la visite compte sur la carte Gang du client.'}
        </p>
      </section>

      {/* Barber + quand */}
      <div>
        <label className={labelCls} htmlFor="walkin-barber">Barber</label>
        <select id="walkin-barber" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={`${inputCls} appearance-none`}>
          {!employeeId && <option value="" className="bg-card">Choisir…</option>}
          {employees.map((emp) => (
            <option key={emp.id} value={String(emp.id)} className="bg-card">{emp.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <label className={labelCls} htmlFor="walkin-date">Date</label>
          <input id="walkin-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div className="min-w-0">
          <label className={labelCls} htmlFor="walkin-time">Début</label>
          <input id="walkin-time" type="time" step="300" value={startTime} onChange={(e) => setStartTime(e.target.value.slice(0, 5))} className={inputCls} />
        </div>
      </div>

      {/* Prestations */}
      <section>
        <p className={labelCls}>Prestations {selected.length > 0 && <span className="text-primary font-semibold">· {selected.length} choisie{selected.length > 1 ? 's' : ''}</span>}</p>
        {catalog.length > 8 && (
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="search" value={serviceQuery} onChange={(e) => setServiceQuery(e.target.value)}
              placeholder="Chercher une prestation" className={`${inputCls} pl-8 py-1.5`} aria-label="Chercher une prestation" />
          </div>
        )}
        {catalogLoading && <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Chargement des prestations…</p>}
        {catalogError && !catalog.length && (
          <button type="button" onClick={() => refetchCatalog()} className="text-[11px] text-red-400 font-semibold">
            Impossible de charger les prestations · Réessayer
          </button>
        )}
        {catalog.length > 0 && (
          <div className="max-h-56 overflow-y-auto overscroll-contain space-y-1 pr-0.5">
            {shownServices.map((s) => {
              const on = selectedIds.includes(String(s.id));
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  aria-pressed={on}
                  className={`w-full flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all min-w-0 ${on ? 'border-primary/60 bg-primary/15' : 'border-white/10 bg-white/[0.03] hover:border-primary/30'}`}
                >
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-white/20'}`}>
                    {on && <Check className="w-3.5 h-3.5" />}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{s.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{Number(s.duration) || 0} min</span>
                  <span className="shrink-0 text-xs font-bold text-primary tabular-nums">{formatEuros(Number(s.price) || 0)}</span>
                </button>
              );
            })}
            {shownServices.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-2">Aucune prestation ne correspond</p>}
          </div>
        )}
      </section>

      {/* Durée → fin, prix */}
      <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2.5 min-w-0">
        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => changeDuration(-5)}
            className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center" aria-label="5 minutes de moins">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-12 text-center text-sm font-semibold tabular-nums">{effectiveDuration} min</span>
          <button type="button" onClick={() => changeDuration(5)}
            className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center" aria-label="5 minutes de plus">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="ml-auto text-right min-w-0">
          <p className="text-sm font-semibold tabular-nums">{validTime ? `${startTime} – ${endTime}` : '--:--'}</p>
          <p className="text-[11px] text-primary font-bold">{formatEuros(totalPrice)}</p>
        </div>
      </div>

      {/* Déjà terminée */}
      <label className="flex items-start gap-2.5 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 cursor-pointer">
        <input type="checkbox" checked={done} onChange={(e) => setDoneChoice(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-[hsl(var(--primary))]" />
        <span className="text-xs min-w-0">
          <span className="font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Prestation déjà terminée</span>
          <span className="text-muted-foreground">La fiche s'ouvre ensuite pour « Valider la prestation » (encaissement).</span>
        </span>
      </label>
      {done && !endPassed && validTime && validDate && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-200 space-y-1.5">
          <p>La fin prévue ({endTime}) n'est pas encore passée.</p>
          {date === parisTodayStr() && (
            <button type="button" onClick={() => setStartTime(nowRounded(effectiveDuration))}
              className="font-semibold text-amber-100 underline underline-offset-2">
              Terminée à l'instant : commencer à {nowRounded(effectiveDuration)}
            </button>
          )}
        </div>
      )}

      <div>
        <label className={labelCls} htmlFor="walkin-notes">Note interne (facultatif, invisible pour le client)</label>
        <textarea id="walkin-notes" rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
      </div>

      {(clash || warnings.length > 0) && (
        <div className={`rounded-xl px-3 py-2.5 space-y-1 border ${clash ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
          {clash && <p className="text-xs text-red-400 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />{clash}. Choisissez une autre heure de début.</p>}
          {warnings.map((w) => (
            <p key={w} className="text-xs text-amber-300 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />{w}</p>
          ))}
        </div>
      )}
      {!clash && lastMinutes.length > 0 && (
        <div role="status" className="rounded-xl px-3 py-2 space-y-1 border border-orange-500/30 bg-orange-500/10">
          {lastMinutes.map((lm) => (
            <p key={lm.id} className="text-xs text-orange-300 flex items-start gap-1.5 break-words"><Zap className="w-3.5 h-3.5 mt-px shrink-0" />{coveredLastMinuteNote(lm)}</p>
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Il manque {missing.join(', ')}.</p>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={saving}
          className="flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-60">
          Annuler
        </button>
        <button type="button" onClick={handleSave} disabled={!canSave}
          className="flex-[2] py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {(saving || checking) && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Enregistrement…' : (warnings.length ? 'Ajouter quand même' : 'Ajouter le client')}
        </button>
      </div>
    </div>
  );
}

/**
 * Fenêtre « Ajouter un client » de l'agenda (fermeture par la croix ou « Annuler »).
 * Le formulaire est démonté à la fermeture : il repart à chaque ouverture des valeurs du jour affiché.
 */
export default function WalkInDialog({ open, onClose, employees, defaultEmployeeId, defaultDate, defaultTime, onCreated }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-md w-[calc(100vw-1rem)] sm:w-full max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 rounded-2xl">
        <DialogHeader className="text-left pr-6">
          <DialogTitle className="font-display flex items-center gap-2 text-base">
            <UserPlus className="w-4 h-4 text-primary" /> Ajouter un client
          </DialogTitle>
          <DialogDescription className="text-xs">
            Client venu sans rendez-vous ou rendez-vous pris par téléphone.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <WalkInForm
            employees={employees}
            defaultEmployeeId={defaultEmployeeId}
            defaultDate={defaultDate}
            defaultTime={defaultTime}
            onCancel={onClose}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
