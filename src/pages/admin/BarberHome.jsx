import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3, Bell, CalendarDays, CalendarRange, ClipboardList, Eye, LayoutDashboard, Newspaper,
  Settings, Shirt, Sparkles, Star, UserCircle, CalendarCheck, CalendarClock, Users,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { parisDay } from '@/lib/slots';
import { NOTIFICATIONS_EVENT, readNotifications } from '@/lib/pushNotifications';
import BarberCard, { CARD_WIDTH, CARD_HEIGHT, buildCardStats, overallRating } from '@/components/shared/BarberCard';
import StarRating from '@/components/shared/StarRating';
import Reveal, { RevealGroup, RevealItem } from '@/components/motion/Reveal';
import AnimatedCounter from '@/components/motion/AnimatedCounter';
import SnapCarousel from '@/components/motion/SnapCarousel';
import ShortcutGrid from '@/components/profile/ShortcutGrid';
import TodayCard from '@/components/barber-home/TodayCard';
import {
  aptStart, cleaningWeekStart, firstName, isClientAppointment, parisMonthDays, parisWeekDays,
} from '@/components/barber-home/barberHomeUtils';

const VIDEO_MARKER = '\n%%VIDEO%%';

/** Carte FUT à l'échelle de l'écran (300 px de large au plus, marges de l'espace admin comprises). */
function useCardScale() {
  const compute = () => (typeof window === 'undefined' ? 1 : Math.min(1, (Math.min(window.innerWidth, 512) - 40) / CARD_WIDTH));
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    const onResize = () => setScale(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

/** Notifications non lues rangées sur l'appareil. */
function useUnread(userId) {
  const count = () => (userId ? readNotifications(userId).filter((n) => !n.read).length : 0);
  const [unread, setUnread] = useState(count);
  useEffect(() => {
    const refresh = () => setUnread(count());
    refresh();
    window.addEventListener(NOTIFICATIONS_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [userId]);
  return unread;
}

const todayLong = () => {
  const s = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * « Mon espace » d'un barber (/admin/me, page d'arrivée des barbers, 18 oct. 2026) : même
 * tableau de bord que le profil client — carte FUT du barber, prochain client et journée,
 * chiffres qui montent, raccourcis (style B animé) selon ses permissions, derniers avis.
 */
export default function BarberHome() {
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const can = (p) => perms.includes(p);
  const cardScale = useCardScale();
  const unread = useUnread(user?.id);
  const todayKey = parisDay().key;
  const weekDays = useMemo(() => parisWeekDays(), [todayKey]);
  const monthDays = useMemo(() => parisMonthDays(), [todayKey]);
  const dates = useMemo(() => Array.from(new Set([...monthDays, ...weekDays])), [monthDays, weekDays]);
  const weekStart = cleaningWeekStart();

  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ['employees'], staleTime: 5 * 60 * 1000, queryFn: fetchPublicBarbers,
  });
  const me = employees.find((e) => String(e.id) === String(user?.employee_id)) || null;

  const { data: skillCategories = [] } = useQuery({
    queryKey: ['skillCategories'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => { try { return await api.entities.SkillCategory.list('sort_order', 100); } catch { return []; } },
    retry: false,
  });

  const { data: appointments = [], isLoading: aptsLoading } = useQuery({
    queryKey: ['barberHome', 'appointments', user?.employee_id, dates[0], dates[dates.length - 1]],
    queryFn: () => api.entities.Appointment.filter({ employee_id: user.employee_id, date: dates }, 'start_time', 1000),
    enabled: !!user?.employee_id,
    refetchInterval: 60000,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['barberHome', 'reviews', me?.name],
    queryFn: () => api.entities.Review.filter({ employee_name: me.name }, '-created_date', 20),
    enabled: !!me?.name,
  });

  // Mêmes clés que Mes congés et Entretien (cache partagé)
  const { data: timeOffs = [] } = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
  });
  const { data: cleaning = [] } = useQuery({
    queryKey: ['cleaningSchedule', weekStart],
    queryFn: () => api.entities.CleaningSchedule.filter({ week_start: weekStart }, 'date', 500),
  });

  const client = (Array.isArray(appointments) ? appointments : []).filter(isClientAppointment);
  const byStart = (a, b) => aptStart(a) - aptStart(b);
  const today = client.filter((a) => a.date === todayKey).sort(byStart);
  const upcoming = client.filter((a) => a.date > todayKey && weekDays.includes(a.date)).sort(byStart);
  const weekCount = client.filter((a) => weekDays.includes(a.date)).length;
  const monthCount = client.filter((a) => monthDays.includes(a.date) && aptStart(a) <= Date.now()).length;

  const myLeaves = (Array.isArray(timeOffs) ? timeOffs : []).filter((t) => String(t.employee_id) === String(user?.employee_id));
  const pendingLeaves = myLeaves.filter((t) => t.status === 'pending').length;
  const myTasksToday = (Array.isArray(cleaning) ? cleaning : [])
    .filter((t) => String(t.employee_id) === String(user?.employee_id) && t.date === todayKey);
  const tasksLeft = myTasksToday.filter((t) => t.status !== 'done').length;

  const visibleReviews = (Array.isArray(reviews) ? reviews : []).filter((r) => r.is_visible !== false && Number(r.rating) > 0);
  const avg = visibleReviews.length
    ? visibleReviews.reduce((s, r) => s + Number(r.rating), 0) / visibleReviews.length : null;

  const rawBio = me?.bio || '';
  const markerIdx = rawBio.indexOf(VIDEO_MARKER);
  const bio = markerIdx >= 0 ? rawBio.slice(0, markerIdx) : rawBio;
  const cardStats = buildCardStats(skillCategories, me?.skills || []);
  const agendaLink = can('agenda') && user?.employee_id
    ? `/admin/agenda?view=day&date=${todayKey}&barber=${user.employee_id}` : null;

  const required = [
    can('agenda') && { to: agendaLink, label: 'Mon agenda', icon: CalendarDays, badge: today.filter((a) => aptStart(a) > Date.now()).length },
    can('dashboard') && { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, badge: 0 },
    can('clients') && { to: '/admin/clients', label: 'Clients', icon: UserCircle, badge: 0 },
    can('orders') && { to: '/admin/orders', label: 'Commandes', icon: ClipboardList, badge: 0 },
    can('products') && { to: '/admin/textile', label: 'Textile', icon: Shirt, badge: 0 },
    can('reviews') && { to: '/admin/reviews', label: 'Avis', icon: Star, badge: 0 },
    can('stats') && { to: '/admin/stats', label: 'Statistiques', icon: BarChart3, badge: 0 },
    { to: '/admin/my-leave', label: 'Mes congés', icon: CalendarRange, badge: pendingLeaves },
    { to: '/admin/my-cleaning', label: 'Entretien', icon: Sparkles, badge: tasksLeft },
    { to: '/admin/my-notifications', label: 'Notifications', icon: Bell, badge: unread },
    { to: '/admin/my-settings', label: 'Mon profil', icon: Settings, badge: 0 },
  ].filter(Boolean);
  // Facultatifs (aussi dans le menu) : on en garde juste assez pour des lignes de 3 complètes,
  // jamais une tuile seule sur la dernière ligne
  const optional = [
    { to: '/admin/feed', label: "New's Gang", icon: Newspaper, badge: 0 },
    me && { to: `/barber/${me.id}`, label: 'Vue client', icon: Eye, badge: 0 },
  ].filter(Boolean);
  let extra = optional.length;
  while (extra > 0 && (required.length + extra) % 3 !== 0) extra -= 1;
  const shortcuts = [...required, ...optional.slice(0, extra)];

  const stats = [
    { icon: CalendarCheck, label: "Aujourd'hui", value: today.length },
    { icon: CalendarClock, label: 'Semaine', value: weekCount },
    { icon: Users, label: 'Ce mois', value: monthCount },
  ];

  return (
    <div className="relative max-w-lg mx-auto pb-24 space-y-6">
      {/* Salut */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-semibold">Mon espace</p>
          <h1 className="font-display text-2xl max-[360px]:text-xl font-bold text-foreground leading-tight break-words">
            Salut {firstName(me?.name || user?.full_name)} 👋
          </h1>
          <p className="text-xs text-muted-foreground">{todayLong()}{me?.title ? ` · ${me.title}` : ''}</p>
        </div>
        <Link to="/admin/my-settings" aria-label="Mon profil"
          className="w-11 h-11 shrink-0 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform">
          <Settings className="w-5 h-5 text-foreground/80" />
        </Link>
      </motion.div>

      {/* Carte FUT du barber */}
      {me ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="flex flex-col items-center">
          <div className="glow-breathe" style={{ width: CARD_WIDTH * cardScale, height: CARD_HEIGHT * cardScale }}>
            <div style={{ width: CARD_WIDTH, transform: `scale(${cardScale})`, transformOrigin: 'top left', perspective: 1000 }}>
              <BarberCard employee={me} stats={cardStats} overall={overallRating(cardStats)} bio={bio} />
            </div>
          </div>
          <p className="text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground/45 mt-3 select-none">
            Double tap pour voir le dos de ta carte
          </p>
        </motion.div>
      ) : !employeesLoading && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-xs text-amber-200/90">
          Ton compte n'est pas encore relié à une fiche barber : demande à l'admin de le faire dans Comptes barbers.
        </div>
      )}

      {/* Ma journée */}
      <Reveal>
        <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-semibold mb-2">Ma journée</p>
        <TodayCard today={today} upcoming={upcoming} agendaLink={agendaLink} loading={aptsLoading && !!user?.employee_id} />
      </Reveal>

      {/* Chiffres */}
      <RevealGroup className="grid grid-cols-3 gap-2.5">
        {stats.map(({ icon: Icon, label, value }, i) => (
          <RevealItem key={label} className="rounded-2xl bg-white/[0.04] border border-white/8 backdrop-blur-xl px-2 py-3.5 text-center">
            <Icon className="w-4 h-4 text-primary/70 mx-auto mb-1.5" />
            <p className="text-2xl font-bold text-primary font-display whitespace-nowrap">
              {aptsLoading ? '–' : <AnimatedCounter value={value} delay={0.1 + i * 0.08} />}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
          </RevealItem>
        ))}
      </RevealGroup>

      {/* Raccourcis */}
      <section>
        <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-semibold mb-2">Mes raccourcis</p>
        <ShortcutGrid items={shortcuts} />
      </section>

      {/* Avis */}
      {visibleReviews.length > 0 && (
        <Reveal>
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-semibold">Ce qu'ils disent de toi</p>
              <h2 className="font-display text-lg font-bold text-foreground">
                {avg != null && <>{avg.toFixed(1).replace('.', ',')} ★ </>}
                <span className="text-sm font-normal text-muted-foreground">· {visibleReviews.length} avis</span>
              </h2>
            </div>
          </div>
          <SnapCarousel itemWidth="84%" autoplay={5200} label="Mes avis">
            {visibleReviews.slice(0, 8).map((r) => (
              <div key={r.id} className="h-full rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-foreground truncate">{r.client_name || 'Client'}</p>
                  <StarRating rating={r.rating} />
                </div>
                {r.comment
                  ? <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 break-words">{r.comment}</p>
                  : <p className="text-xs text-muted-foreground/60 italic">Sans commentaire</p>}
              </div>
            ))}
          </SnapCarousel>
        </Reveal>
      )}
    </div>
  );
}
