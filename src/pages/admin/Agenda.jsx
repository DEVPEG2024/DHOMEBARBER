import React, { useState, useMemo, useEffect } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, endOfMonth, addDays } from 'date-fns';
import { exportToCSV } from '@/utils/exportCSV';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

const BARBER_COLORS = ['#3fcf8e','#60a5fa','#f59e0b','#a78bfa','#f472b6','#34d399','#fb923c','#38bdf8','#e879f9','#4ade80'];

import { apiRequest, apiUrl } from '@/api/apiClient';
import AgendaToolbar from '@/components/agenda/AgendaToolbar';
import DayView from '@/components/agenda/DayView';
import WeekView from '@/components/agenda/WeekView';
import MonthView from '@/components/agenda/MonthView';
import BreakModal from '@/components/agenda/BreakModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export default function Agenda() {
  const { user } = useAuth();
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [selectedBreak, setSelectedBreak] = useState(null);
  const [pendingBreak, setPendingBreak] = useState(null); // { start_time, end_time, date } waiting for barber selection
  const [lastMinuteDialog, setLastMinuteDialog] = useState(false);
  const [lastMinuteForm, setLastMinuteForm] = useState({ date: '', start_time: '', end_time: '', employee_id: '' });
  const [sendingLastMinute, setSendingLastMinute] = useState(false);
  const queryClient = useQueryClient();

  // Auto-filter barber's agenda to their own employee
  useEffect(() => {
    if (user?.role === 'barber' && user?.employee_id) {
      setEmployeeFilter(user.employee_id);
    }
  }, [user]);

  const { queryStart, queryEnd } = useMemo(() => {
    if (view === 'day') return { queryStart: format(currentDate, 'yyyy-MM-dd'), queryEnd: format(currentDate, 'yyyy-MM-dd') };
    if (view === 'week') {
      const s = startOfWeek(currentDate, { weekStartsOn: 1 });
      return { queryStart: format(s, 'yyyy-MM-dd'), queryEnd: format(addDays(s, 6), 'yyyy-MM-dd') };
    }
    const s = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const e = endOfMonth(currentDate);
    return { queryStart: format(s, 'yyyy-MM-dd'), queryEnd: format(e, 'yyyy-MM-dd') };
  }, [view, currentDate]);

  const { data: appointments = [] } = useQuery({
    queryKey: ['agendaAppointments', queryStart, queryEnd],
    queryFn: () => api.entities.Appointment.list('start_time', 500),
  });

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

  // Only approved time offs block the agenda
  const approvedTimeOffs = useMemo(() => {
    const result = timeOffs.filter(t => t.status === 'approved' || (!t.status));
    return result;
  }, [timeOffs]);

  const employees = useMemo(() =>
    rawEmployees.map((emp, idx) => ({
      ...emp,
      color: emp.color || BARBER_COLORS[idx % BARBER_COLORS.length],
    })),
    [rawEmployees]
  );

  const filteredAppointments = useMemo(() => {
    let apts = appointments.filter(a => a.date >= queryStart && a.date <= queryEnd);
    if (employeeFilter !== 'all') apts = apts.filter(a => a.employee_id === employeeFilter);
    return apts;
  }, [appointments, queryStart, queryEnd, employeeFilter]);

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.entities.Appointment.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendaAppointments'] });
      toast.success('Statut mis à jour');
    },
  });

  const createBreak = useMutation({
    mutationFn: (breakData) => api.entities.Appointment.create(breakData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendaAppointments'] });
    },
    onError: () => {
      toast.error('Erreur lors de la création de la pause');
    },
  });

  const deleteBreak = useMutation({
    mutationFn: (id) => api.entities.Appointment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendaAppointments'] });
      toast.success('Pause supprimée');
    },
  });

  const handleStatusChange = (id, status) => updateStatus.mutate({ id, status });

  const buildBreakPayload = (start_time, end_time, employee_id, breakDate) => ({
    date: breakDate,
    start_time,
    end_time,
    status: 'break',
    client_name: 'Pause',
    client_email: '',
    employee_id: employee_id || '',
    employee_name: employees.find(e => e.id === employee_id)?.name || 'Salon',
    services: [],
    total_duration: timeToMinutes(end_time) - timeToMinutes(start_time),
    total_price: 0,
    notes: 'Pause',
  });

  const handleCreateBreak = ({ start_time, end_time, employee_id, date }) => {
    const breakDate = date || format(currentDate, 'yyyy-MM-dd');

    // Si un barber est déjà sélectionné dans le filtre, créer directement pour lui
    if (employeeFilter !== 'all') {
      createBreak.mutate(
        buildBreakPayload(start_time, end_time, employeeFilter, breakDate),
        { onSuccess: () => toast.success('Pause ajoutée') }
      );
      return;
    }

    // Sinon, ouvrir le sélecteur de barber
    setPendingBreak({ start_time, end_time, date: breakDate });
  };

  const handlePendingBreakSelectEmployee = (empId) => {
    if (!pendingBreak) return;
    createBreak.mutate(
      buildBreakPayload(pendingBreak.start_time, pendingBreak.end_time, empId, pendingBreak.date),
      { onSuccess: () => toast.success('Pause ajoutée') }
    );
    setPendingBreak(null);
  };

  const handlePendingBreakSelectAll = () => {
    if (!pendingBreak || employees.length === 0) return;
    Promise.all(
      employees.map(emp =>
        api.entities.Appointment.create(
          buildBreakPayload(pendingBreak.start_time, pendingBreak.end_time, emp.id, pendingBreak.date)
        )
      )
    ).then(() => {
      queryClient.invalidateQueries({ queryKey: ['agendaAppointments'] });
      toast.success(`Pause ajoutée pour ${employees.length} barbers`);
    }).catch(() => {
      queryClient.invalidateQueries({ queryKey: ['agendaAppointments'] });
      toast.error('Erreur lors de la création des pauses');
    });
    setPendingBreak(null);
  };

  const handleDeleteBreak = (id) => deleteBreak.mutate(id);

  const handleBreakClick = (breakItem) => {
    setSelectedBreak(breakItem);
  };

  const handleApplyRecurrence = async ({ start_time, end_time, employee_id, dates }) => {
    let created = 0;
    let errors = 0;

    for (const date of dates) {
      try {
        await api.entities.Appointment.create(
          buildBreakPayload(start_time, end_time, employee_id, date)
        );
        created++;
      } catch (err) {
        errors++;
      }
    }

    queryClient.invalidateQueries({ queryKey: ['agendaAppointments'] });

    if (errors === 0) {
      toast.success(`${created} pauses créées`);
    } else {
      toast.warning(`${created} pauses créées, ${errors} erreurs`);
    }
  };

  const handleExport = () => {
    exportToCSV(
      filteredAppointments.filter(a => a.status !== 'break').map(a => ({
        date: a.date, heure_debut: a.start_time, heure_fin: a.end_time,
        client: a.client_name, email: a.client_email, telephone: a.client_phone || '',
        barber: a.employee_name, services: a.services?.map(s => s.name).join(' + ') || '',
        duree_min: a.total_duration, prix_eur: a.total_price, statut: a.status, notes: a.notes || '',
      })),
      `agenda_${queryStart}`
    );
  };

  const handleMonthDayClick = (day) => {
    setCurrentDate(day);
    setView('day');
  };

  const handleSendLastMinute = async () => {
    const { date, start_time, end_time, employee_id } = lastMinuteForm;
    if (!date || !start_time) {
      toast.error('Date et heure de début requises');
      return;
    }
    setSendingLastMinute(true);
    try {
      const emp = employees.find(e => e.id === employee_id);
      const result = await apiRequest('POST', apiUrl('/last-minute'), {
        date,
        start_time,
        end_time,
        employee_name: emp?.name,
      });
      toast.success(`Notification envoyée à ${result.sent} client(s)`);
      setLastMinuteDialog(false);
      setLastMinuteForm({ date: '', start_time: '', end_time: '', employee_id: '' });
    } catch {
      toast.error('Erreur lors de l\'envoi');
    } finally {
      setSendingLastMinute(false);
    }
  };

  const realAppointmentCount = filteredAppointments.filter(a => a.status !== 'break').length;

  return (
    <div className="flex flex-col h-full">
      <AgendaToolbar
        view={view} setView={setView}
        currentDate={currentDate} setCurrentDate={setCurrentDate}
        onExport={handleExport}
      />

      {/* Employee filter */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-muted-foreground">Barber :</span>
        <button
          onClick={() => setEmployeeFilter('all')}
          className={`px-3 py-1 text-xs rounded-full border transition-all ${employeeFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
        >
          Tous
        </button>
        {employees.map(emp => (
          <button
            key={emp.id}
            onClick={() => setEmployeeFilter(emp.id)}
            className={`px-3 py-1 text-xs rounded-full border transition-all flex items-center gap-1.5 ${employeeFilter === emp.id ? 'text-primary-foreground border-transparent' : 'border-border text-muted-foreground hover:border-primary/50'}`}
            style={employeeFilter === emp.id ? { background: emp.color || '#3fcf8e', borderColor: emp.color || '#3fcf8e' } : {}}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: emp.color || '#3fcf8e' }} />
            {emp.name}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{realAppointmentCount} rdv</span>
        {user?.role === 'admin' && (
          <button
            onClick={() => {
              setLastMinuteForm({ date: format(currentDate, 'yyyy-MM-dd'), start_time: '', end_time: '', employee_id: employeeFilter !== 'all' ? employeeFilter : '' });
              setLastMinuteDialog(true);
            }}
            className="px-3 py-1 text-xs rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition-all font-semibold"
          >
            Last Minute
          </button>
        )}
      </div>

      {view === 'day' && (
        <DayView
          appointments={filteredAppointments}
          employees={employees}
          employeeFilter={employeeFilter}
          onStatusChange={handleStatusChange}
          date={format(currentDate, 'yyyy-MM-dd')}
          onCreateBreak={handleCreateBreak}
          onDeleteBreak={handleDeleteBreak}
          onBreakClick={handleBreakClick}
          timeOffs={approvedTimeOffs}
        />
      )}
      {view === 'week' && (
        <WeekView
          currentDate={currentDate}
          appointments={filteredAppointments}
          employees={employees}
          employeeFilter={employeeFilter}
          onStatusChange={handleStatusChange}
          onCreateBreak={handleCreateBreak}
          onDeleteBreak={handleDeleteBreak}
          onBreakClick={handleBreakClick}
          timeOffs={approvedTimeOffs}
        />
      )}
      {view === 'month' && (
        <MonthView
          currentDate={currentDate}
          appointments={filteredAppointments}
          employees={employees}
          onDayClick={handleMonthDayClick}
        />
      )}

      {/* Break recurrence modal */}
      <BreakModal
        breakItem={selectedBreak}
        employees={employees}
        onClose={() => setSelectedBreak(null)}
        onDelete={handleDeleteBreak}
        onApplyRecurrence={handleApplyRecurrence}
      />

      {/* Barber picker for break creation */}
      <Dialog open={!!pendingBreak} onOpenChange={(open) => !open && setPendingBreak(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Pause {pendingBreak?.start_time} – {pendingBreak?.end_time}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">Pour quel barber ?</p>
          <div className="space-y-2">
            {employees.map(emp => (
              <button
                key={emp.id}
                onClick={() => handlePendingBreakSelectEmployee(emp.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: emp.color || '#3fcf8e' }} />
                <span className="text-sm font-medium">{emp.name}</span>
              </button>
            ))}
            <button
              onClick={handlePendingBreakSelectAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground"
            >
              Tous les barbers
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Last Minute notification dialog */}
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
                onChange={e => setLastMinuteForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Début *</label>
                <select value={lastMinuteForm.start_time}
                  onChange={e => setLastMinuteForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm appearance-none">
                  <option value="">--:--</option>
                  {Array.from({ length: 24 }, (_, h) => [0, 15, 30, 45].map(m => {
                    const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    return <option key={t} value={t}>{t}</option>;
                  })).flat().filter(o => o.key >= '08:00' && o.key <= '20:00')}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fin</label>
                <select value={lastMinuteForm.end_time}
                  onChange={e => setLastMinuteForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm appearance-none">
                  <option value="">--:--</option>
                  {Array.from({ length: 24 }, (_, h) => [0, 15, 30, 45].map(m => {
                    const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    return <option key={t} value={t}>{t}</option>;
                  })).flat().filter(o => o.key >= '08:00' && o.key <= '20:00')}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Barber (optionnel)</label>
              <select value={lastMinuteForm.employee_id}
                onChange={e => setLastMinuteForm(f => ({ ...f, employee_id: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                <option value="">Tous les barbers</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <button
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
