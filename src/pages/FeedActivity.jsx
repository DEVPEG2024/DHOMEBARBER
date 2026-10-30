/**
 * Écran Activité du fil « New Gang » v2 (30 oct. 2026) : `/feed/activite`, et
 * `/admin/feed/activite` dans l'admin. Contrat : docs/fonctions/fil-new-gang-contrat.md (sections 4 et 5).
 *
 * - « Nouveau » (non lus, sondages du salon à voter en tête) et « Plus tôt » ;
 * - un élément = un groupe du serveur (« Kevin et 3 autres ont réagi 🔥 à ta photo ») ; un tap le
 *   marque lu tout de suite (le serveur confirme derrière) et ouvre la publication
 *   (`/feed?post=<id>`, `&comments=1` pour un commentaire, une réponse ou un ❤️ de commentaire ;
 *   l'invitation après la visite ouvre le composeur « Mon look ») ;
 * - « Tout marquer lu » ; réglages « Me prévenir pour » (4 interrupteurs, enregistrés tout de suite,
 *   retour en arrière et message si le serveur refuse).
 *
 * Sans `features.feedV2` (serveur plus ancien) : retour au fil. Panne de la lecture du drapeau ou de
 * l'activité : « Pas de connexion » et Réessayer, jamais un état vide trompeur. Tutoiement (textes
 * du fil), vouvoiement des messages d'erreur génériques.
 */
import React, { useCallback, useRef } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, BarChart3, Scissors, Trophy, BellRing } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { Switch } from '@/components/ui/switch';
import LoadError, { queryFailed, friendlyError } from '@/components/shared/LoadError';
import { AuthorAvatar } from '@/components/feed/AuthorLine';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import { activityLine, timeAgo, pollRemaining } from '@/lib/feed/rules';
import {
  FEED_KEYS, useFeedV2Query, fetchActivity, markActivityRead, fetchFeedPrefs, saveFeedPrefs,
} from '@/lib/feed/feedApi';

/** Réglages des notifications du fil (`users.feed_prefs`), dans l'ordre de la carte. */
const PREFS = [
  { key: 'reactions', label: 'Réactions à mes publications' },
  { key: 'comments', label: 'Commentaires et réponses' },
  { key: 'salon', label: 'Sondages et nouveautés du salon' },
  { key: 'visit', label: 'Après ma visite : montrer ma coupe' },
];

/** Types qui ouvrent les commentaires de la publication. */
const COMMENT_TYPES = new Set(['comment', 'reply', 'comment_like']);

const enc = encodeURIComponent;

/** Lien d'un élément de l'activité (`base` : `/feed` ou `/admin/feed`). */
function targetOf(group, base) {
  if (group.type === 'visit_invite') {
    return group.appointment_id ? `${base}?compose=look&visit=${enc(group.appointment_id)}` : `${base}?compose=look`;
  }
  if (!group.post_id) return base;
  return `${base}?post=${enc(group.post_id)}${COMMENT_TYPES.has(group.type) ? '&comments=1' : ''}`;
}

/** « Il y a 12 min », « À l'instant », « 3 nov. ». */
function whenLabel(iso) {
  const t = timeAgo(iso);
  return /^\d/.test(t) ? `Il y a ${t}` : t;
}

/**
 * Retire `ids` (null : tout) des non-lus dans le cache de l'activité et de la pastille. Le serveur
 * compte les non-lus en éléments de l'écran (groupes), pas en lignes. Rend le retour en arrière.
 */
function markGroupsReadInCache(queryClient, ids) {
  const before = queryClient.getQueryData(FEED_KEYS.activity);
  const unreadBefore = queryClient.getQueryData(FEED_KEYS.unread());
  if (before && Array.isArray(before.items)) {
    const set = ids ? new Set(ids.map(String)) : null;
    let marked = 0;
    const items = before.items.map((g) => {
      if (!g.unread || (set && !g.ids.some((id) => set.has(String(id))))) return g;
      marked += 1;
      return { ...g, unread: false };
    });
    const unreadCount = ids ? Math.max(0, (before.unread_count || 0) - marked) : 0;
    queryClient.setQueryData(FEED_KEYS.activity, { ...before, items, unread_count: unreadCount });
    if (unreadBefore) {
      queryClient.setQueryData(FEED_KEYS.unread(), { ...unreadBefore, activity: ids ? Math.max(0, (unreadBefore.activity || 0) - marked) : 0 });
    }
  }
  return () => {
    if (before) queryClient.setQueryData(FEED_KEYS.activity, before);
    if (unreadBefore) queryClient.setQueryData(FEED_KEYS.unread(), unreadBefore);
  };
}

/**
 * Avatar d'un auteur : photo d'un barber en portrait 1748 × 2480 (jamais ronde ni carrée), clients
 * et salon en rond. `size` = hauteur, en pixels.
 */
function ActorAvatar({ actor, size }) {
  if (actor?.role === 'barber' && actor.photo_url) {
    return (
      <span
        className="flex overflow-hidden rounded-md border border-border"
        style={{ height: size, aspectRatio: BARBER_PHOTO_ASPECT, backgroundColor: BARBER_PHOTO_BG }}
      >
        <img src={actor.photo_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </span>
    );
  }
  return <AuthorAvatar name={actor?.name} photoUrl={actor?.photo_url} size={size} />;
}

/** Avatars d'un groupe : deux superposés s'il y a plusieurs auteurs, une icône sans auteur. */
function GroupAvatars({ group }) {
  if (group.type === 'visit_invite') {
    return (
      <span className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0" aria-hidden="true">
        <Scissors className="w-5 h-5" />
      </span>
    );
  }
  if (group.type === 'moment') {
    return (
      <span className="w-11 h-11 rounded-full bg-amber-400/15 text-amber-300 flex items-center justify-center shrink-0" aria-hidden="true">
        <Trophy className="w-5 h-5" />
      </span>
    );
  }
  const actors = group.actors || [];
  if (actors.length >= 2) {
    return (
      <span className="relative w-11 h-11 shrink-0" aria-hidden="true">
        <span className={`absolute left-0 top-0 ring-2 ring-background ${actors[0].role === 'barber' && actors[0].photo_url ? 'rounded-md' : 'rounded-full'}`}>
          <ActorAvatar actor={actors[0]} size={30} />
        </span>
        <span className={`absolute right-0 bottom-0 ring-2 ring-background ${actors[1].role === 'barber' && actors[1].photo_url ? 'rounded-md' : 'rounded-full'}`}>
          <ActorAvatar actor={actors[1]} size={30} />
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="shrink-0 w-11 flex justify-center">
      <ActorAvatar actor={actors[0]} size={44} />
    </span>
  );
}

function ActivityRow({ group, base, onOpen }) {
  const { who, text } = activityLine(group);
  return (
    <li>
      <Link
        to={targetOf(group, base)}
        onClick={() => onOpen(group)}
        className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors ${
          group.unread ? 'bg-primary/8 hover:bg-primary/12' : 'hover:bg-white/4'
        }`}
      >
        <GroupAvatars group={group} />
        <span className="flex-1 min-w-0 text-sm leading-snug text-foreground/90 [overflow-wrap:anywhere]">
          <span className="font-bold text-foreground">{who}</span> {text}
          <span className="block text-xs text-muted-foreground mt-0.5">{whenLabel(group.created_at)}</span>
        </span>
        {group.post_image_url && (
          <img
            src={group.post_image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-10 h-[50px] rounded-lg object-cover shrink-0 bg-secondary"
          />
        )}
        {group.unread && (
          <span className="w-2 h-2 rounded-full bg-primary shrink-0">
            <span className="sr-only">Non lu</span>
          </span>
        )}
      </Link>
    </li>
  );
}

function PollRow({ poll, base }) {
  return (
    <li>
      <Link
        to={`${base}?post=${enc(poll.post_id)}`}
        aria-label={`Voter au sondage du salon : ${poll.question}`}
        className="flex items-center gap-3 rounded-2xl px-3 py-3 bg-primary/8 hover:bg-primary/12 transition-colors"
      >
        <span className="w-11 h-11 rounded-full bg-amber-400/15 text-amber-300 flex items-center justify-center shrink-0" aria-hidden="true">
          <BarChart3 className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0 text-sm leading-snug text-foreground/90 [overflow-wrap:anywhere]">
          <span className="font-bold text-foreground">Nouveau sondage du salon</span> : {poll.question}
          <span className="block text-xs text-muted-foreground mt-0.5">{pollRemaining(poll.ends_at)}</span>
        </span>
        <span aria-hidden="true" className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center shrink-0">
          Voter
        </span>
      </Link>
    </li>
  );
}

function Section({ id, title, children }) {
  return (
    <section aria-labelledby={id} className="mb-5">
      <h2 id={id} className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2 px-1">{title}</h2>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

function SkeletonRows() {
  return (
    <div aria-hidden="true" className="space-y-2 mb-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 motion-safe:animate-pulse">
          <span className="w-11 h-11 rounded-full bg-white/6" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 rounded bg-white/6 w-4/5" />
            <span className="block h-2.5 rounded bg-white/4 w-1/3" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Carte « Me prévenir pour » : 4 interrupteurs enregistrés tout de suite. */
function PrefsCard({ enabled, settingsPath }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: FEED_KEYS.prefs, queryFn: fetchFeedPrefs, enabled, staleTime: 60 * 1000 });
  // Dernier envoi de chaque réglage : seul le plus récent applique sa réponse ou son retour en arrière
  const seq = useRef({});

  const toggle = useCallback(async (key, value) => {
    const n = (seq.current[key] || 0) + 1;
    seq.current[key] = n;
    const previous = queryClient.getQueryData(FEED_KEYS.prefs)?.[key];
    queryClient.setQueryData(FEED_KEYS.prefs, (old) => ({ ...(old || {}), [key]: value }));
    try {
      const saved = await saveFeedPrefs({ [key]: value });
      if (seq.current[key] !== n) return;
      if (saved && typeof saved === 'object') {
        queryClient.setQueryData(FEED_KEYS.prefs, (old) => ({ ...(old || {}), [key]: typeof saved[key] === 'boolean' ? saved[key] : value }));
      }
    } catch (err) {
      if (seq.current[key] !== n) return;
      queryClient.setQueryData(FEED_KEYS.prefs, (old) => ({ ...(old || {}), [key]: previous }));
      toast.error(friendlyError(err, 'Réglage non enregistré. Réessayez dans un instant.'));
    }
  }, [queryClient]);

  return (
    <section aria-labelledby="feed-prefs-title" className="mt-2">
      <div className="rounded-2xl border border-border bg-card/60 px-4 py-3.5">
        <div className="flex items-center gap-2 mb-1">
          <BellRing className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 id="feed-prefs-title" className="text-sm font-bold text-foreground">Me prévenir pour</h2>
        </div>
        {queryFailed(q) ? (
          <LoadError compact what="tes réglages" error={q.error} onRetry={q.refetch} retrying={q.isFetching} className="mt-2" />
        ) : (
          <div className="divide-y divide-border/60">
            {PREFS.map(({ key, label }) => {
              const id = `feed-pref-${key}`;
              const checked = q.data?.[key] === true;
              return (
                <div key={key} className="flex items-center justify-between gap-3 min-h-[48px]">
                  <label htmlFor={id} className="flex-1 min-w-0 text-[13px] text-foreground/85 py-2 cursor-pointer">{label}</label>
                  <Switch
                    id={id}
                    checked={checked}
                    disabled={!q.data}
                    onCheckedChange={(v) => toggle(key, v)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed mt-2 px-1">
        Les notifications de ton téléphone se règlent aussi dans{' '}
        {/* Zone de tap de 40 px au moins autour du mot, sans changer le dessin */}
        <Link
          to={settingsPath}
          className="relative inline-block text-primary font-semibold underline-offset-2 hover:underline after:absolute after:-inset-x-1 after:-inset-y-[14px] after:content-['']"
        >
          Paramètres
        </Link>.
      </p>
    </section>
  );
}

export default function FeedActivity() {
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const inAdmin = location.pathname.startsWith('/admin');
  const base = inAdmin ? '/admin/feed' : '/feed';
  // Un barber reste dans l'espace admin (RequireAuth le renvoie hors des pages client)
  const settingsPath = user?.role === 'barber' ? '/admin/my-settings' : '/settings';

  const flag = useFeedV2Query();
  const enabled = flag.data === true && !!user;
  const q = useQuery({
    queryKey: FEED_KEYS.activity,
    queryFn: fetchActivity,
    enabled,
    staleTime: 15 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: 'always',
  });

  /** Tap sur un élément : lu tout de suite, le serveur confirme derrière (la navigation n'attend pas). */
  const openGroup = useCallback((group) => {
    if (!group.unread) return;
    const undo = markGroupsReadInCache(queryClient, group.ids);
    markActivityRead(group.ids)
      .then((res) => {
        const n = Number(res?.unread_count);
        if (Number.isFinite(n)) {
          queryClient.setQueryData(FEED_KEYS.unread(), (old) => (old ? { ...old, activity: n } : old));
        }
      })
      .catch(() => {
        // Rien à l'écran : l'élément redevient simplement « non lu » à la prochaine lecture
        undo();
        queryClient.invalidateQueries({ queryKey: FEED_KEYS.activity });
      });
  }, [queryClient]);

  const markAll = useCallback(async () => {
    const undo = markGroupsReadInCache(queryClient, null);
    try {
      const res = await markActivityRead();
      const n = Number(res?.unread_count);
      if (Number.isFinite(n)) {
        queryClient.setQueryData(FEED_KEYS.unread(), (old) => (old ? { ...old, activity: n } : old));
      }
    } catch (err) {
      undo();
      toast.error(friendlyError(err, 'Impossible de tout marquer comme lu. Réessayez dans un instant.'));
    }
  }, [queryClient]);

  // Serveur sans le fil v2 : l'activité n'existe pas, retour au fil
  if (flag.data === false) return <Navigate to={base} replace />;

  const data = q.data;
  const items = Array.isArray(data?.items) ? data.items : [];
  const polls = Array.isArray(data?.polls) ? data.polls : [];
  const fresh = items.filter((g) => g.unread);
  const older = items.filter((g) => !g.unread);
  const hasUnread = fresh.length > 0;
  const failed = queryFailed(flag) || queryFailed(q);
  const loading = !failed && (!flag.data || (q.isPending && !data));

  return (
    <div className={`max-w-lg mx-auto ${inAdmin ? '' : 'px-4 pt-4 pb-6'}`}>
      <header className="flex items-center gap-3 h-14 mb-2">
        <Link
          to={base}
          aria-label="Retour au fil"
          className="w-11 h-11 rounded-2xl border border-border bg-card/60 flex items-center justify-center shrink-0 text-foreground"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <h1 className="flex-1 min-w-0 text-xl font-bold text-foreground truncate">Activité</h1>
        {hasUnread && (
          <button
            type="button"
            onClick={markAll}
            className="h-10 px-3 rounded-xl text-[13px] font-semibold text-primary hover:bg-primary/10 shrink-0"
          >
            Tout marquer lu
          </button>
        )}
      </header>

      {failed ? (
        <LoadError
          what="ton activité"
          error={flag.error || q.error}
          onRetry={() => (queryFailed(flag) ? flag.refetch() : q.refetch())}
          retrying={flag.isFetching || q.isFetching}
          className="mb-5"
        />
      ) : loading ? (
        <SkeletonRows />
      ) : items.length === 0 && polls.length === 0 ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12 px-4 mb-5"
        >
          <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl" aria-hidden="true">💈</span>
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">Rien de neuf pour l'instant…</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Les réactions, commentaires et réponses du Gang à tes publications arrivent ici.
            Lance-toi : montre ta dernière coupe !
          </p>
          <Link to={base} className="inline-flex items-center gap-1 mt-4 text-xs font-semibold text-primary">
            Aller au fil <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      ) : (
        <>
          {(polls.length > 0 || fresh.length > 0) && (
            <Section id="feed-activity-new" title="Nouveau">
              {polls.map((p) => <PollRow key={`poll-${p.post_id}`} poll={p} base={base} />)}
              {fresh.map((g) => <ActivityRow key={g.id} group={g} base={base} onOpen={openGroup} />)}
            </Section>
          )}
          {older.length > 0 && (
            <Section id="feed-activity-older" title="Plus tôt">
              {older.map((g) => <ActivityRow key={g.id} group={g} base={base} onOpen={openGroup} />)}
            </Section>
          )}
        </>
      )}

      {flag.data === true && <PrefsCard enabled={enabled} settingsPath={settingsPath} />}
    </div>
  );
}
