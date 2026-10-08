import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiRequest, apiUrl } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { exportToCSV } from '@/utils/exportCSV';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { RefreshCw } from 'lucide-react';

import AgendaToolbar from '@/components/agenda/AgendaToolbar';
import DayView from '@/components/agenda/DayView';
import WeekView from '@/components/agenda/WeekView';
import MonthView from '@/components/agenda/MonthView';
import BreakModal from '@/components/agenda/BreakModal';
import AppointmentDetailModal from '@/components/agenda/AppointmentDetailModal';
import MoveDialog, { buildMoveFields, saveMove } from '@/components/agenda/MoveDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  BARBER_COLORS, timeToMinutes, toDateStr, parseDateParam, visibleRange, datesBetween,
  fetchAppointmentsForDates, agendaQueryKey, invalidateAppointmentQueries,
  isBreak, isLastMinuteSlot, slotIssues, aptDuration,
} from '@/components/agenda/agendaUtils';

const VIEWS = ['day', 'week', 'month'];
const VIEW_STORAGE_KEY = 'dhb-agenda-view';

function readStoredView() {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    return VIEWS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function stepDate(view, date, dir) {
  if (view === 'day') return addDays(date, dir);
  if (view === 'week') return addWeeks(date, dir);
  return addMonths(date, dir);
}

const SWIPE_MIN_PX = 70;
const SWIPE_MAX_MS = 600;

export default function Agenda() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // ─── Position dans l'agenda : dans l'adresse (rechargement, retour arrière, lien depuis le planning) ───
  const view = VIEWS.includes(searchParams.get('view')) ? searchParams.get('view') : (readStoredView() || 'week');
  const dateParam = searchParams.get('date');
  const currentDate = useMemo(() => parseDateParam(dateParam) || new Date(), [dateParam]);
  const dateKey = toDateStr(currentDate);
  const ownEmployeeId = user?.role === 'barber' && user?.employee_id ? String(user.employee_id) : null;
  const employeeFilter = searchParams.get('barber') || ownEmployeeId || 'all';

  const updateParams = useCallback((patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) next.delete(k); else next.set(k, v);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setView = useCallback((v) => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* navigation privée */ }
    updateParams({ view: v });
  }, [updateParams]);
  const setDate = useCallback((d) => updateParams({ date: toDateStr(d) }), [updateParams]);
  const step = useCallback((dir) => setDate(stepDate(view, currentDate, dir)), [view, currentDate, setDate]);
  const setEmployeeFilter = (id) => updateParams({ barber: String(id) });

  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pendingMove, setPendingMove] = useState(null); // carte client posée ailleurs : { apt, date, start_time, employee_id }
  const [selectedBreak, setSelectedBreak] = useState(null);
  const [pendingBreak, setPendingBreak] = useState(null); // { start_time, end_time, date } en attente du choix du barber
  const [lastMinuteDialog, setLastMinuteDialog] = useState(false);
  const [lastMinuteForm, setLastMinuteForm] = useState({ date: '', start_time: '', end_time: '', employee_id: '' });
  const [sendingLastMinute, setSendingLastMinute] = useState(false);

  // ─── Données : uniquement les jours affichés ───
  const dates = useMemo(() => {
    const r = visibleRange(view, currentDate);
    return datesBetween(r.start, r.end);
  }, [view, dateKey]);
  const dateSet = useMemo(() => new Set(dates), [dates]);

  const { data: appointments = [], isFetching, isError, refetch } = useQuery({
    queryKey: agendaQueryKey(dates),
    queryFn: () => fetchAppointmentsForDates(dates),
    placeholderData: keepPreviousData, // la grille ne clignote pas à vide pendant le chargement
    refetchInterval: 60000, // une réservation client apparaît sans recharger la page
  });

  // Période précédente et suivante préchargées : les flèches et le glissé répondent tout de suite
  useEffect(() => {
    for (const dir of [-1, 1]) {
      const r = visibleRange(view, stepDate(view, currentDate, dir));
      const ds = datesBetween(r.start, r.end);
      queryClient.prefetchQuery({ queryKey: agendaQueryKey(ds), queryFn: () => fetchAppointmentsForDates(ds), staleTime: 60000 });
    }
  }, [view, dateKey, queryClient]);

  const { data: rawEmployees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.filter({ is_active: true }),
  });

  const { data: timeOffs = [] } = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
    refetchOnMount: 'always',
    refetchInterval: 30000,
  });

  // Seuls les congés approuvés bloquent l'agenda
  const approvedTimeOffs = useMemo(() => timeOffs.filter((t) => t.status === 'approved' || !t.status), [timeOffs]);

  const employees = useMemo(() =>
    [...rawEmployees]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((emp, idx) => ({ ...emp, color: emp.color || BARBER_COLORS[idx % BARBER_COLORS.length] })),
  [rawEmployees]);

  // Rendez-vous de la période (la donnée précédente reste affichée pendant le chargement :
  // on ne garde que les jours visibles pour ne jamais montrer l'ancienne période au mauvais endroit)
  const inRange = useMemo(
    () => appointments.filter((a) => dateSet.has(String(a.date).slice(0, 10))),
    [appointments, dateSet],
  );
  const forBarber = useMemo(
    () => (employeeFilter === 'all' ? inRange : inRange.filter((a) => String(a.employee_id) === String(employeeFilter))),
    [inRange, employeeFilter],
  );
  const cancelledCount = forBarber.filter((a) => a.status === 'cancelled').length;
  const visible = useMemo(
    () => (showCancelled ? forBarber : forBarber.filter((a) => a.status !== 'cancelled')),
    [forBarber, showCancelled],
  );

  const refreshAll = () => invalidateAppointmentQueries(queryClient);

  // ─── Pauses ───
  const createBreak = useMutation({
    mutationFn: (breakData) => api.entities.Appointment.create(breakData),
    onSuccess: refreshAll,
    onError: (e) => toast.error(e?.message || 'Erreur lors de la création de la pause'),
  });

  const deleteBreak = useMutation({
    mutationFn: (id) => api.entities.Appointment.delete(id),
    onSuccess: () => { refreshAll(); toast.success('Pause supprimée'); },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const buildBreakPayload = (start_time, end_time, employee_id, breakDate) => ({
    date: breakDate,
    start_time,
    end_time,
    status: 'break',
    client_name: 'Pause',
    client_email: '',
    employee_id: employee_id || '',
    employee_name: employees.find((e) => String(e.id) === String(employee_id))?.name || 'Salon',
    services: [],
    total_duration: timeToMinutes(end_time) - timeToMinutes(start_time),
    total_price: 0,
    notes: 'Pause',
  });

  const handleCreateBreak = ({ start_time, end_time, employee_id, date }) => {
    const breakDate = date || dateKey;
    const target = employee_id || (employeeFilter !== 'all' ? employeeFilter : null);
    if (target) {
      createBreak.mutate(buildBreakPayload(start_time, end_time, target, breakDate), { onSuccess: () => toast.success('Pause ajoutée') });
      return;
    }
    setPendingBreak({ start_time, end_time, date: breakDate });
  };

  const handlePendingBreakSelectEmployee = (empId) => {
    if (!pendingBreak) return;
    createBreak.mutate(
      buildBreakPayload(pendingBreak.start_time, pendingBreak.end_time, empId, pendingBreak.date),
      { onSuccess: () => toast.success('Pause ajoutée') },
    );
    setPendingBreak(null);
  };

  const handlePendingBreakSelectAll = () => {
    if (!pendingBreak || employees.length === 0) return;
    Promise.all(employees.map((emp) =>
      api.entities.Appointment.create(buildBreakPayload(pendingBreak.start_time, pendingBreak.end_time, emp.id, pendingBreak.date)),
    )).then(() => {
      refreshAll();
      toast.success(`Pause ajoutée pour ${employees.length} barbers`);
    }).catch(() => {
      refreshAll();
      toast.error('Erreur lors de la création des pauses');
    });
    setPendingBreak(null);
  };

  const handleApplyRecurrence = async ({ start_time, end_time, employee_id, dates: recurrenceDates }) => {
    let created = 0;
    let errors = 0;
    for (const date of recurrenceDates) {
      try {
        await api.entities.Appointment.create(buildBreakPayload(start_time, end_time, employee_id, date));
        created++;
      } catch {
        errors++;
      }
    }
    refreshAll();
    if (errors === 0) toast.success(`${created} pauses créées`);
    else toast.warning(`${created} pauses créées, ${errors} erreurs`);
  };

  const handleExport = () => {
    exportToCSV(
      visible.filter((a) => a.status !== 'break').map((a) => ({
        date: a.date, heure_debut: a.start_time, heure_fin: a.end_time,
        client: a.client_name, email: a.client_email, telephone: a.client_phone || '',
        barber: a.employee_name, services: a.services?.map((s) => s.name).join(' + ') || '',
        duree_min: a.total_duration, prix_eur: a.total_price, statut: a.status, notes: a.notes || '',
      })),
      `agenda_${dates[0]}`,
    );
  };

  const openDay = (day) => updateParams({ view: 'day', date: toDateStr(day) });

  // ─── Fiche RDV : modifié / déplacé / supprimé ───
  const handleChanged = (updated) => {
    refreshAll();
    setSelected(null);
    // Déplacé hors de la période affichée : l'agenda suit le rendez-vous
    const newDate = updated?.date ? String(updated.date).slice(0, 10) : null;
    if (newDate && !dateSet.has(newDate)) updateParams({ date: newDate });
  };

  const handleDeleted = () => {
    refreshAll();
    setSelected(null);
  };

  // ─── Carte glissée dans la grille ───
  // Pause ou créneau last minute sans client : déplacé tout de suite, avec « Annuler » dans la notification.
  // Rendez-vous d'un client : confirmation (avant / après, alertes, « Prévenir le client »).
  const handleMoveRequest = (apt, target) => {
    const freeSlot = isBreak(apt) || (isLastMinuteSlot(apt) && !apt.client_email);
    if (!freeSlot) {
      setPendingMove({ apt, ...target });
      return;
    }
    const fields = buildMoveFields(apt, target, employees);
    const employee = employees.find((e) => String(e.id) === String(target.employee_id));
    const { clash } = slotIssues({
      selfId: apt.id, date: fields.date, startTime: fields.start_time, duration: aptDuration(apt),
      employee, employeeId: target.employee_id, dayApts: inRange, timeOffs: [],
    });
    if (clash) {
      toast.error(clash);
      return;
    }
    const before = {
      date: apt.date, start_time: apt.start_time, end_time: apt.end_time,
      employee_id: apt.employee_id, employee_name: apt.employee_name,
    };
    const what = isBreak(apt) ? 'Pause déplacée' : 'Créneau déplacé';
    saveMove(queryClient, apt, fields, false)
      .then(() => toast.success(`${what} à ${fields.start_time}`, {
        action: {
          label: 'Annuler',
          onClick: () => saveMove(queryClient, { ...apt, ...fields }, before, false)
            .catch((e) => toast.error(e?.message || 'Retour impossible')),
        },
      }))
      .catch((e) => toast.error(e?.message || 'Déplacement impossible'));
  };

  // ─── Last Minute ───
  const handleSendLastMinute = async () => {
    const { date, start_time, end_time, employee_id } = lastMinuteForm;
    if (!date || !start_time) {
      toast.error('Date et heure de début requises');
      return;
    }
    setSendingLastMinute(true);
    try {
      const emp = employees.find((e) => String(e.id) === String(employee_id));

      // Créneau bloqué « last_minute » sur l'agenda
      await api.entities.Appointment.create({
        client_name: 'Last Minute',
        client_email: '',
        client_phone: '',
        employee_id: employee_id || employees[0]?.id || null,
        employee_name: emp?.name || employees[0]?.name || '',
        date,
        start_time,
        end_time: end_time || start_time,
        status: 'last_minute',
        services: [],
        total_price: 0,
      });

      const result = await apiRequest('POST', apiUrl('/last-minute'), {
        date,
        start_time,
        end_time,
        employee_name: emp?.name,
      });

      refreshAll();
      toast.success(`Notification envoyée à ${result.sent} client(s) · Créneau bloqué`);
      setLastMinuteDialog(false);
      setLastMinuteForm({ date: '', start_time: '', end_time: '', employee_id: '' });
    } catch (e) {
      toast.error(e?.message || 'Erreur lors de l\'envoi');
    } finally {
      setSendingLastMinute(false);
    }
  };

  // Créneaux last minute expirés (fin + 15 min passée) que personne n'a pris
  useEffect(() => {
    if (!appointments.length) return;
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const expired = appointments.filter((a) =>
      a.status === 'last_minute'
      && !a.client_email
      && a.client_name === 'Last Minute'
      && (a.date < todayStr || (a.date === todayStr && timeToMinutes(a.end_time || a.start_time) + 15 <= nowMinutes)));

    if (expired.length === 0) return;

    Promise.all(expired.map((a) => api.entities.Appointment.update(a.id, {
      status: 'no_show',
      cancellation_reason: 'Personne n\'a pris le créneau last minute',
    }))).then(() => queryClient.invalidateQueries({ queryKey: ['agendaAppointments'] }));
  }, [appointments, queryClient]);

  // ─── Navigation au clavier (← / →) et au doigt (glisser à gauche / à droite) ───
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target;
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const swipe = useRef(null);
  const onTouchStart = (e) => {
    if (e.touches.length !== 1) { swipe.current = null; return; }
    // Sur une carte, le doigt la déplace (appui long) ou l'ouvre : jamais de changement de période
    if (e.target.closest?.('[data-block]')) { swipe.current = null; return; }
    // Grille qui défile déjà horizontalement (journée à cinq barbers sur téléphone) : pas de changement de jour
    const scroller = e.target.closest?.('[data-scroll-container]');
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 2) { swipe.current = null; return; }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || selected || selectedBreak || pendingBreak || pendingMove) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Glissé franc et rapide : un appui long (tracé d'une pause) ou un défilement vertical ne comptent pas
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.8 && Date.now() - s.t < SWIPE_MAX_MS) {
      step(dx < 0 ? 1 : -1);
    }
  };

  const realAppointmentCount = visible.filter((a) => a.status !== 'break' && a.status !== 'last_minute' && a.status !== 'cancelled').length;

  return (
    <div className="flex flex-col h-full">
      <AgendaToolbar
        view={view}
        onViewChange={setView}
        currentDate={currentDate}
        onDateChange={setDate}
        onStep={step}
        onExport={handleExport}
        loading={isFetching}
      />

      {/* Barbers, annulés, Last Minute */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
        <button
          type="button"
          onClick={() => setEmployeeFilter('all')}
          className={`shrink-0 px-3 py-1.5 text-xs rounded-full border transition-all ${employeeFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
        >
          Tous
        </button>
        {employees.map((emp) => {
          const active = String(employeeFilter) === String(emp.id);
          return (
            <button
              key={emp.id}
              type="button"
              onClick={() => setEmployeeFilter(emp.id)}
              className={`shrink-0 px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-1.5 ${active ? 'text-primary-foreground border-transparent' : 'border-border text-muted-foreground hover:border-primary/50'}`}
              style={active ? { background: emp.color, borderColor: emp.color } : {}}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#fff' : emp.color }} />
              {emp.name}
            </button>
          );
        })}
        <span className="shrink-0 w-px h-5 bg-border mx-0.5" />
        <button
          type="button"
          onClick={() => setShowCancelled((v) => !v)}
          className={`shrink-0 px-3 py-1.5 text-xs rounded-full border transition-all ${showCancelled ? 'bg-red-500/15 text-red-400 border-red-500/40' : 'border-border text-muted-foreground hover:border-red-400/40'}`}
          title={showCancelled ? 'Masquer les rendez-vous annulés' : 'Afficher les rendez-vous annulés'}
        >
          Annulés{cancelledCount ? ` (${cancelledCount})` : ''}
        </button>
        <span className="shrink-0 text-xs text-muted-foreground ml-auto pl-2">{realAppointmentCount} rdv</span>
        <button
          type="button"
          onClick={() => {
            setLastMinuteForm({
              date: dateKey,
              start_time: '',
              end_time: '',
              employee_id: ownEmployeeId || (employeeFilter !== 'all' ? employeeFilter : ''),
            });
            setLastMinuteDialog(true);
          }}
          className="shrink-0 px-3 py-1.5 text-xs rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition-all font-semibold"
        >
          Last Minute
        </button>
      </div>

      {isError && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs text-red-400">Impossible de charger l'agenda (connexion ?).</p>
          <button type="button" onClick={() => refetch()} className="text-xs font-semibold text-red-300 flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Réessayer
          </button>
        </div>
      )}

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {view === 'day' && (
          <DayView
            date={dateKey}
            appointments={visible}
            employees={employees}
            employeeFilter={employeeFilter}
            timeOffs={approvedTimeOffs}
            onSelect={setSelected}
            onBreakClick={setSelectedBreak}
            onCreateBreak={handleCreateBreak}
            onFocusBarber={setEmployeeFilter}
            onMoveRequest={handleMoveRequest}
          />
        )}
        {view === 'week' && (
          <WeekView
            currentDate={currentDate}
            appointments={visible}
            employees={employees}
            employeeFilter={employeeFilter}
            timeOffs={approvedTimeOffs}
            onSelect={setSelected}
            onBreakClick={setSelectedBreak}
            onCreateBreak={handleCreateBreak}
            onDayClick={openDay}
            onMoveRequest={handleMoveRequest}
          />
        )}
        {view === 'month' && (
          <MonthView
            currentDate={currentDate}
            appointments={visible}
            employees={employees}
            onDayClick={openDay}
            onSelect={setSelected}
          />
        )}
      </div>

      <AppointmentDetailModal
        appointment={selected}
        employees={employees}
        onClose={() => setSelected(null)}
        onChanged={handleChanged}
        onDeleted={handleDeleted}
      />

      <MoveDialog
        key={pendingMove ? `${pendingMove.apt.id}-${pendingMove.date}-${pendingMove.start_time}-${pendingMove.employee_id}` : 'none'}
        move={pendingMove}
        employees={employees}
        appointments={inRange}
        timeOffs={approvedTimeOffs}
        onClose={() => setPendingMove(null)}
      />

      {/* Pause : récurrence / suppression */}
      <BreakModal
        breakItem={selectedBreak}
        employees={employees}
        onClose={() => setSelectedBreak(null)}
        onDelete={(id) => deleteBreak.mutate(id)}
        onApplyRecurrence={handleApplyRecurrence}
      />

      {/* Choix du barber pour une pause tracée en vue « Tous » */}
      <Dialog open={!!pendingBreak} onOpenChange={(open) => !open && setPendingBreak(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Pause {pendingBreak?.start_time} – {pendingBreak?.end_time}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">Pour quel barber ?</p>
          <div className="space-y-2">
            {employees.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => handlePendingBreakSelectEmployee(emp.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: emp.color }} />
                <span className="text-sm font-medium">{emp.name}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={handlePendingBreakSelectAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground"
            >
              Tous les barbers
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notification Last Minute */}
      <Dialog open={lastMinuteDialog} onOpenChange={setLastMinuteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              Notification Last Minute
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">
            Envoyez une notification push à tous les clients pour les informer d'un créneau disponible.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Date</label>
              <input type="date" value={lastMinuteForm.date}
                onChange={(e) => setLastMinuteForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[['start_time', 'Début *'], ['end_time', 'Fin']].map(([field, label]) => (
                <div key={field}>
                  <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                  <select value={lastMinuteForm[field]}
                    onChange={(e) => setLastMinuteForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm appearance-none">
                    <option value="">--:--</option>
                    {Array.from({ length: 24 }, (_, h) => [0, 15, 30, 45].map((m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`))
                      .flat()
                      .filter((t) => t >= '08:00' && t <= '20:00')
                      .map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Barber (optionnel)</label>
              <select value={lastMinuteForm.employee_id}
                onChange={(e) => setLastMinuteForm((f) => ({ ...f, employee_id: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                <option value="">Tous les barbers</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleSendLastMinute}
              disabled={sendingLastMinute || !lastMinuteForm.start_time}
              className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {sendingLastMinute ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Envoyer la notification'
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
