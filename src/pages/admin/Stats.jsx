import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Calendar, Users, AlertTriangle, Target } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['hsl(38 65% 50%)', 'hsl(30 40% 35%)', 'hsl(25 30% 25%)', 'hsl(35 50% 60%)', 'hsl(20 45% 45%)'];

function StatBox({ title, value, sub, icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">{title}</p>
          <p className="text-lg font-bold">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Stats() {
  const { data: appointments = [] } = useQuery({
    queryKey: ['allAppointments'],
    queryFn: () => base44.entities.Appointment.list('-date', 2000),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
  });

  const stats = useMemo(() => {
    const completed = appointments.filter(a => a.status === 'completed');
    const cancelled = appointments.filter(a => a.status === 'cancelled');
    const noShows = appointments.filter(a => a.status === 'no_show');
    const totalRevenue = completed.reduce((sum, a) => sum + (a.total_price || 0), 0);
    const avgTicket = completed.length > 0 ? totalRevenue / completed.length : 0;

    // Monthly trend
    const monthlyData = {};
    completed.forEach(a => {
      const month = a.date?.substring(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { month, revenue: 0, count: 0 };
      monthlyData[month].revenue += a.total_price || 0;
      monthlyData[month].count++;
    });
    const monthly = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

    // Top services
    const serviceCount = {};
    completed.forEach(a => {
      a.services?.forEach(s => {
        if (!serviceCount[s.name]) serviceCount[s.name] = { name: s.name, count: 0, revenue: 0 };
        serviceCount[s.name].count++;
        serviceCount[s.name].revenue += s.price || 0;
      });
    });
    const topServices = Object.values(serviceCount).sort((a, b) => b.count - a.count).slice(0, 5);

    // Per employee
    const empStats = {};
    completed.forEach(a => {
      const name = a.employee_name || 'N/A';
      if (!empStats[name]) empStats[name] = { name, count: 0, revenue: 0 };
      empStats[name].count++;
      empStats[name].revenue += a.total_price || 0;
    });
    const perEmployee = Object.values(empStats).sort((a, b) => b.revenue - a.revenue);

    return {
      totalRevenue, avgTicket, completed: completed.length,
      cancelRate: appointments.length > 0 ? ((cancelled.length / appointments.length) * 100).toFixed(1) : 0,
      noShowRate: appointments.length > 0 ? ((noShows.length / appointments.length) * 100).toFixed(1) : 0,
      monthly, topServices, perEmployee,
    };
  }, [appointments]);

  return (
    <div>
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Analytics</p>
        <h1 className="font-display text-2xl font-bold">Statistiques</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        <StatBox title="CA Total" value={`${stats.totalRevenue.toFixed(0)}€`} icon={TrendingUp} />
        <StatBox title="RDV Complétés" value={stats.completed} icon={Calendar} />
        <StatBox title="Panier Moyen" value={`${stats.avgTicket.toFixed(0)}€`} icon={Target} />
        <StatBox title="Taux Annulation" value={`${stats.cancelRate}%`} icon={AlertTriangle} />
        <StatBox title="Taux No-show" value={`${stats.noShowRate}%`} icon={AlertTriangle} />
        <StatBox title="Barbers Actifs" value={employees.length} icon={Users} />
      </div>

      {/* Monthly Revenue */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold mb-4">Évolution du CA</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.monthly}>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={{ background: 'hsl(30 8% 10%)', border: '1px solid hsl(30 6% 18%)', borderRadius: '8px', fontSize: '12px' }} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(38 65% 50%)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Services */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Top Prestations</h3>
          <div className="space-y-3">
            {stats.topServices.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-[10px] font-bold text-primary flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm">{s.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold">{s.count}x</p>
                  <p className="text-[10px] text-muted-foreground">{s.revenue}€</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per Employee */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Performance par Barber</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.perEmployee} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'hsl(30 8% 55%)' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ background: 'hsl(30 8% 10%)', border: '1px solid hsl(30 6% 18%)', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="revenue" fill="hsl(38 65% 50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}