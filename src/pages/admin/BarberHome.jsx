import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  BarChart3, Bell, BellOff, CalendarDays, CalendarRange, ClipboardList, Eye, LayoutDashboard, Loader2, Newspaper,
  Settings, Shirt, Sparkles, Star, UserCircle, CalendarCheck, CalendarClock, Users,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { parisDay } from '@/lib/slots';
import { hapticFeedback, isNative, platform } from '@/lib/capacitor';
import {
  NOTIFICATIONS_EVENT, readNotifications, getPushPermission, isPushSupported, subscribeToPush, syncPushSubscription,
} from '@/lib/pushNotifications';
import {
  useCoupeEnabled, useCoupeMe, useCoupeBarbers, setCoupeAvailability, invalidateCoupe, COUPE_BARBERS_KEY,
} from '@/lib/coupe/coupeApi';
import { Switch } from '@/components/ui/switch';
import { coupeErrorText } from '@/components/coupe/coupeErrors';
import { CoupeBallIcon, coupeCardLine, coupeSeasonLabel } from '@/components/home/GamesSection';
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

/** Erreur d'activation des notifications (API du navigateur, ou envoi au serveur), au tutoiement. */
function pushErrorText(err) {
  if (err?.status || err?.timeout || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return coupeErrorText(err, 'Impossible d’activer les notifications sur ce téléphone. Réessaie.');
  }
  return 'Impossible d’activer les notifications sur ce téléphone. Réessaie.';
}

/**
 * « Dispo » allumé mais le barber ne recevrait pas les défis (`reachable` faux dans
 * `GET /coupe/barbers` : aucun abonnement aux notifications sur un appareil) : on le dit, avec un
 * bouton qui les active sur ce téléphone (même parcours que Mes paramètres → Notifications).
 */
function CoupeReachNote({ onEnabled }) {
  const supported = isPushSupported();
  const [permission, setPermission] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    getPushPermission().then((p) => { if (!cancelled) setPermission(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [supported]);
  const denied = permission === 'denied';

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    hapticFeedback();
    try {
      await subscribeToPush();
      setPermission('granted');
      syncPushSubscription();
      toast.success('Notifications activées : les défis arrivent sur ce téléphone');
      onEnabled?.();
    } catch (err) {
      const perm = await getPushPermission().catch(() => null);
      if (perm) setPermission(perm);
      toast.error(perm === 'denied' ? 'Notifications refusées sur ce téléphone' : pushErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  let help = null;
  if (!supported) {
    help = 'Ce navigateur ne reçoit pas les notifications : ajoute le site à l’écran d’accueil, puis active-les.';
  } else if (denied) {
    help = isNative
      ? (platform === 'android'
        ? 'Elles sont refusées : Paramètres du téléphone → Applications → D’Home Barber → Notifications.'
        : 'Elles sont refusées : Réglages → D’Home Barber → Notifications.')
      : 'Elles sont refusées : autorise-les pour dhomebarber.fr dans les réglages du navigateur.';
  }

  return (
    <div role="note" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="flex items-start gap-2 text-xs font-semibold leading-snug text-foreground">
        <BellOff className="mt-px h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        Active les notifications sur ce téléphone pour recevoir les défis
      </p>
      {help ? (
        <p className="mt-1.5 pl-6 text-[11px] leading-snug text-muted-foreground">{help}</p>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="mt-2.5 ml-6 inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-3.5 text-xs font-semibold text-[#1a1205] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <Bell className="h-3.5 w-3.5" aria-hidden="true" />}
          Activer les notifications
        </button>
      )}
    </div>
  );
}

/**
 * La Coupe du Gang dans « Mon espace » (maquette « Mon espace, barber », 29 oct. 2026) :
 * interrupteur « Dispo pour un match » (les clients peuvent défier le barber depuis sa page ; le
 * serveur le coupe tout seul pendant ses rendez-vous, `busy` de `GET /coupe/barbers`), chiffres de
 * la saison et accès au jeu. `stats` : `season_stats` de `GET /coupe/me` (null tant que non lu).
 * `GET /coupe/barbers` est lu une fois ici (pas de relecture périodique hors de l'accueil de la
 * Coupe) ; `reachable` faux : le barber ne recevrait pas les défis, on propose les notifications.
 */
function CoupeDispoCard({ employee, stats, season }) {
  const queryClient = useQueryClient();
  const barbersQuery = useCoupeBarbers();
  const entry = (Array.isArray(barbersQuery.data) ? barbersQuery.data : [])
    .find((b) => String(b?.employee_id) === String(employee.id)) || null;
  const busy = entry?.busy === true;
  const unreachable = entry?.reachable === false;
  // Valeur de l'interrupteur : la colonne de la fiche quand le serveur la renvoie, sinon `available`
  // de /coupe/barbers hors rendez-vous (pendant un rendez-vous, `available` est faux d'office)
  const serverValue = typeof employee.coupe_available === 'boolean'
    ? employee.coupe_available
    : (entry && !busy ? entry.available === true : null);
  // Choix affiché tout de suite, gardé jusqu'à ce que le serveur dise la même chose
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const checked = pending ?? serverValue ?? false;
  useEffect(() => {
    if (pending !== null && !saving && serverValue === pending) setPending(null);
  }, [pending, saving, serverValue]);

  const toggle = async (next) => {
    setPending(next);
    setSaving(true);
    hapticFeedback();
    try {
      const res = await setCoupeAvailability(next);
      const value = typeof res?.available === 'boolean' ? res.available : next;
      setPending(value);
      // La fiche en cache (`['employees']`, partagée) suit le choix enregistré
      queryClient.setQueryData(['employees'], (rows) => (Array.isArray(rows)
        ? rows.map((r) => (String(r?.id) === String(employee.id) ? { ...r, coupe_available: value } : r))
        : rows));
      invalidateCoupe(queryClient);
      toast.success(value ? 'Tu es dispo : les clients peuvent te défier' : 'Tu n’es plus dispo pour un match');
    } catch (err) {
      setPending(null);
      toast.error(coupeErrorText(err, 'Impossible d’enregistrer ton choix. Réessaie.'));
    } finally {
      setSaving(false);
    }
  };

  // Notifications activées : `reachable` relu tout de suite
  const onPushEnabled = () => queryClient.invalidateQueries({ queryKey: COUPE_BARBERS_KEY });

  const matches = stats ? Math.max(0, Math.round(Number(stats.matches) || 0)) : null;
  const wins = stats ? Math.max(0, Math.round(Number(stats.wins) || 0)) : null;
  const losses = stats ? Math.max(0, Math.round(Number(stats.losses) || 0)) : null;
  const loadingValue = serverValue === null && pending === null && barbersQuery.isPending;

  return (
    <section aria-label="La Coupe du Gang" className="space-y-2.5">
      <div className="flex items-center gap-3.5 rounded-[18px] border border-emerald-500/40 bg-emerald-500/[0.08] p-4">
        <span className="w-11 h-11 shrink-0 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
          <CoupeBallIcon className="w-[22px] h-[22px]" />
        </span>
        <div className="flex-1 min-w-0">
          <label htmlFor="coupe-dispo" className="block font-fut text-lg font-extrabold uppercase tracking-wide leading-none text-foreground">
            Dispo pour un match
          </label>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            Les clients peuvent te défier depuis ta page. Coupé tout seul pendant tes rendez-vous.
          </p>
          {checked && busy && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-500" role="status">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              En rendez-vous : les défis reprennent après.
            </p>
          )}
        </div>
        <Switch
          id="coupe-dispo"
          checked={checked}
          onCheckedChange={toggle}
          disabled={saving || loadingValue}
          className="shrink-0 data-[state=checked]:bg-emerald-500"
        />
      </div>

      {checked && unreachable && !saving && <CoupeReachNote onEnabled={onPushEnabled} />}

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-3.5">
          <p className="font-fut text-[28px] font-extrabold leading-none tabular-nums text-foreground">{matches ?? '–'}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {matches === 1 ? 'match' : 'matchs'} · {coupeSeasonLabel(season).toLowerCase()}
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-3.5">
          <p className="font-fut text-[28px] font-extrabold leading-none tabular-nums text-foreground">
            {wins == null ? '–' : `${wins} – ${losses}`}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">victoires, défaites</p>
        </div>
      </div>

      <Link
        to="/coupe"
        className="h-11 rounded-xl flex items-center justify-center font-fut text-base font-extrabold uppercase tracking-[0.06em] active:opacity-90 transition-opacity"
        style={{ background: '#e01f26', color: '#ffffff' }}
      >
        Jouer à la Coupe
      </Link>
    </section>
  );
}

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

  // La Coupe du Gang (29 oct. 2026) : rien tant que le jeu est coupé (`features.coupe`) ; points lus
  // seulement pour un compte relié à une fiche (la carte FUT et l'interrupteur n'existent pas sinon)
  const coupeOn = useCoupeEnabled();
  const coupeMeQuery = useCoupeMe({ enabled: coupeOn && !!user?.employee_id });
  const reduceMotion = useReducedMotion();
  const coupeStats = coupeOn ? coupeMeQuery.data?.season_stats || null : null;
  const coupeLine = coupeOn && coupeMeQuery.data ? coupeCardLine(coupeMeQuery.data.season_stats || {}) : null;

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
              <BarberCard employee={me} stats={cardStats} overall={overallRating(cardStats)} bio={bio} coupe={coupeLine} />
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

      {/* La Coupe du Gang : « Dispo pour un match » (barber avec fiche, `PATCH /coupe/availability`) */}
      {coupeOn && me && user?.role === 'barber' && (
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <CoupeDispoCard employee={me} stats={coupeStats} season={coupeMeQuery.data?.season} />
        </motion.div>
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
