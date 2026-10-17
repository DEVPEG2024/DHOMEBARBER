/**
 * Fil d'activité des clients, réservé à l'admin (/admin, cloche et panneau « Activité clients »).
 *
 * v1 sans changement backend : on agrège les entités que l'admin sait déjà lire
 * (rendez-vous, commandes, avis, cartes cadeau, privatisations, précommandes textile,
 * réponses aux événements du salon, bugs / suggestions, inscriptions, signalements du fil)
 * en une chronologie d'événements. Chaque source est interrogée à part : une entité inconnue
 * du serveur (backend pas encore déployé) ou refusée est listée dans `failedSources` et
 * ignorée, sans jamais faire tomber le fil entier.
 *
 * Les notifications hors de l'app (push sur le téléphone de l'admin) demandent le backend :
 * voir docs/backend-admin-alerts.md.
 *
 * Distinguer l'action d'un client de celle du staff :
 *  - les pauses (`status: 'break'`), créneaux last minute (`last_minute`, sans email) et les
 *    « fiches client » créées par l'admin dans Clients (RDV `cancelled` de 09:00 à 09:00 sans
 *    prestation) ne sont jamais des actions client ;
 *  - toute ligne dont l'email client appartient à un compte staff (admin / barber) est ignorée ;
 *  - annulations de RDV : seules celles du client sont chargées (`cancelled_by = 'client'`, posé
 *    par le serveur avec `cancelled_at`) ; `cancellationActor` (src/lib/cancellation.js) écarte
 *    encore, par sécurité, une annulation du salon ou du système ;
 *  - commandes annulées : `order_cancelled` n'est émis que si le serveur fournit
 *    `cancelled_by === 'client'` et `cancelled_at` (docs/backend-orders-cancellation.md) ;
 *    une commande annulée garde son `order_new`, marqué `cancelled: true` (« annulée depuis »),
 *    et n'entre plus dans le chiffre du jour.
 *
 * Horodatages : les annulations de RDV sont datées par `cancelled_at`, les réponses aux devis par
 * `answered_at` (posé seulement par la réponse du client). Plus aucun repli sur `updated_*` :
 * une retouche de l'admin ne fait plus remonter un élément dans le fil.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { cancellationActor, cleanReason } from '@/lib/cancellation';
import { useAdminAlertPrefs } from '@/lib/adminAlerts';

export const ADMIN_ACTIVITY_QUERY_KEY = ['adminActivity'];

const DEFAULT_DAYS = 14;
const TZ = 'Europe/Paris';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Types d'événements : libellé, emoji, page admin où agir, teinte du panneau. */
export const ACTIVITY_TYPES = {
  appointment_new: { label: 'Nouveau rendez-vous', emoji: '📅', adminPath: '/admin/agenda', tone: 'green' },
  appointment_cancelled: { label: 'Rendez-vous annulé', emoji: '❌', adminPath: '/admin/agenda', tone: 'red' },
  order_new: { label: 'Nouvelle commande', emoji: '🛍️', adminPath: '/admin/orders', tone: 'blue' },
  order_cancelled: { label: 'Commande annulée', emoji: '❌', adminPath: '/admin/orders', tone: 'red' },
  review_new: { label: 'Nouvel avis', emoji: '⭐', adminPath: '/admin/reviews', tone: 'amber' },
  giftcard_new: { label: 'Carte cadeau achetée', emoji: '🎁', adminPath: '/admin/gift-cards', tone: 'violet' },
  event_request: { label: 'Demande de privatisation', emoji: '🎉', adminPath: '/admin/events', tone: 'violet' },
  event_answer: { label: 'Réponse à un devis', emoji: '📝', adminPath: '/admin/events', tone: 'blue' },
  textile_reservation: { label: 'Précommande textile', emoji: '👕', adminPath: '/admin/textile?tab=reservations', tone: 'blue' },
  salon_event_rsvp: { label: 'Réponse à un événement', emoji: '🥂', adminPath: '/admin/salon-events', tone: 'violet' },
  feedback_new: { label: 'Bug ou suggestion', emoji: '💬', adminPath: '/admin/feedback', tone: 'amber' },
  user_new: { label: 'Nouvelle inscription', emoji: '👋', adminPath: '/admin/clients', tone: 'green' },
  report_new: { label: 'Signalement dans le fil', emoji: '🚩', adminPath: '/admin/feed', tone: 'red' },
};

// ── Petits utilitaires ───────────────────────────────────────────────

/** Horodatage → ISO, ou null si absent / illisible. */
function toIso(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const lower = (s) => String(s || '').trim().toLowerCase();

const toNumber = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || Number.isNaN(n) ? null : n;
};

const euros = (n) => (n == null ? '' : `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`);

/** « sam. 18 oct. » depuis une colonne `date` (YYYY-MM-DD), sans décalage de fuseau. */
function shortDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** « sam. 18 oct. 19:30 » depuis un TIMESTAMPTZ, à l'heure de Paris. */
function shortDateTime(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ,
  });
}

const join = (...parts) => parts.filter(Boolean).join(' · ');

/** Motif nettoyé de son préfixe, tronqué et entre guillemets (« … »), ou chaîne vide. */
function quotedReason(reason, max = 60) {
  const r = cleanReason(reason);
  if (!r) return '';
  return `« ${r.length > max ? `${r.slice(0, max)}…` : r} »`;
}

/** Exécute une source ; en cas d'échec, la note dans `failed` et renvoie une liste vide. */
async function safe(name, failed, fn) {
  try {
    const rows = await fn();
    return Array.isArray(rows) ? rows : [];
  } catch {
    failed.push(name);
    return [];
  }
}

// ── Règles client / staff pour les rendez-vous ───────────────────────

const STAFF_STATUSES = new Set(['break', 'last_minute']);

/** Fiche client créée par l'admin (Clients → ajouter / importer) : faux RDV annulé de 0 min. */
const isClientPlaceholder = (apt) =>
  apt.status === 'cancelled'
  && (!Array.isArray(apt.services) || apt.services.length === 0)
  && String(apt.start_time || '') === String(apt.end_time || '')
  && !toNumber(apt.total_price);

function isClientAppointment(apt, staffEmails) {
  if (!apt || STAFF_STATUSES.has(apt.status)) return false;
  const email = lower(apt.client_email);
  if (!email || staffEmails.has(email)) return false;
  if (lower(apt.client_name) === 'last minute') return false;
  return true;
}

const serviceNames = (apt) =>
  (Array.isArray(apt.services) ? apt.services : [])
    .map((s) => s?.name)
    .filter(Boolean)
    .join(' + ');

function appointmentLink(apt) {
  const params = new URLSearchParams({ view: 'day' });
  const date = String(apt.date || '').slice(0, 10);
  if (date) params.set('date', date);
  if (apt.employee_id != null && apt.employee_id !== '') params.set('barber', String(apt.employee_id));
  return `/admin/agenda?${params.toString()}`;
}

function appointmentWhen(apt) {
  const when = [shortDate(apt.date), apt.start_time ? String(apt.start_time).slice(0, 5) : ''].filter(Boolean).join(' ');
  return apt.employee_name ? `${when} avec ${apt.employee_name}` : when;
}

// ── Chargement ───────────────────────────────────────────────────────

/** Statuts d'une privatisation après la réponse du client au devis. */
const EVENT_ANSWER_STATUSES = ['accepted', 'confirmed', 'declined'];

/**
 * Chronologie des actions clients des `days` derniers jours, du plus récent au plus ancien.
 * @returns {Promise<{ events: object[], failedSources: string[] }>}
 */
export async function fetchAdminActivity({ days = DEFAULT_DAYS } = {}) {
  const failed = [];
  const since = Date.now() - days * DAY_MS;
  const inWindow = (iso) => iso && Date.parse(iso) >= since;
  const E = api.entities;

  // Comptes staff : leurs propres réservations / commandes de test ne sont pas des actions client.
  const staffPromise = safe('Comptes staff', failed, () =>
    E.User.filter({ role: ['admin', 'barber'] }, null, 200));

  // Annulations du client, triées par `cancelled_at` (posé par le serveur en même temps que
  // `cancelled_by = 'client'`). Le filtre sur `cancelled_by` écarte les lignes à `cancelled_at`
  // NULL (anciennes annulations, fiches client), que PostgreSQL classerait en tête en DESC et
  // qui rempliraient la limite.
  const cancelledPromise = safe('Rendez-vous annulés', failed, () =>
    E.Appointment.filter({ status: 'cancelled', cancelled_by: 'client' }, '-cancelled_at', 200));

  const [
    staffUsers, newAppointments, cancelledAppointments, orders, reviews, giftCards,
    events, eventAnswers, reservations, invites, salonEvents, feedbacks, users, reports,
  ] = await Promise.all([
    staffPromise,
    safe('Rendez-vous', failed, () => E.Appointment.list('-created_date', 300)),
    cancelledPromise,
    safe('Commandes', failed, () => E.Order.list('-created_date', 200)),
    safe('Avis', failed, () => E.Review.list('-created_date', 200)),
    safe('Cartes cadeau', failed, () => E.GiftCard.list('-created_at', 200)),
    safe('Privatisations', failed, () => E.Event.list('-created_at', 200)),
    // `confirmed` = devis accepté puis marqué payé par l'admin : l'acceptation du client reste
    // une action à montrer, sinon elle sortirait du fil dès la confirmation.
    safe('Réponses aux devis', failed, () =>
      E.Event.filter({ status: EVENT_ANSWER_STATUSES }, '-answered_at', 100)),
    safe('Précommandes textile', failed, () => E.TextileReservation.list('-created_at', 200)),
    safe('Réponses aux événements', failed, () =>
      E.SalonEventInvite.filter({ status: ['accepted', 'declined'] }, '-responded_at', 300)),
    safe('Événements du salon', failed, () => E.SalonEvent.list('-starts_at', 200)),
    safe('Bugs et suggestions', failed, () => E.Feedback.list('-created_at', 200)),
    safe('Inscriptions', failed, () => E.User.filter({ role: 'user' }, '-created_at', 200)),
    safe('Signalements', failed, () => E.PostReport.list('-created_at', 100)),
  ]);

  const staffEmails = new Set(staffUsers.map((u) => lower(u.email)).filter(Boolean));
  const isStaffEmail = (email) => staffEmails.has(lower(email));
  const out = [];
  const push = (type, row, at, fields) => {
    if (!inWindow(at) || row?.id == null) return;
    out.push({
      id: `${type}:${row.id}`,
      type,
      at,
      title: ACTIVITY_TYPES[type].label,
      detail: '',
      clientName: null,
      clientEmail: null,
      amount: null,
      link: ACTIVITY_TYPES[type].adminPath,
      entityId: String(row.id),
      ...fields,
    });
  };
  const who = (row, nameKey = 'client_name', emailKey = 'client_email') => ({
    clientName: row[nameKey] || null,
    clientEmail: row[emailKey] || null,
  });

  // Rendez-vous réservés (y compris ceux déjà annulés depuis : la réservation a bien eu lieu)
  for (const apt of newAppointments) {
    if (!isClientAppointment(apt, staffEmails) || isClientPlaceholder(apt)) continue;
    push('appointment_new', apt, toIso(apt.created_date || apt.created_at), {
      ...who(apt),
      detail: join(serviceNames(apt), appointmentWhen(apt)),
      amount: toNumber(apt.grand_total) ?? toNumber(apt.total_price),
      link: appointmentLink(apt),
    });
  }

  // Rendez-vous annulés par le client (requête filtrée sur `cancelled_by`), datés par `cancelled_at`
  for (const apt of cancelledAppointments) {
    if (!isClientAppointment(apt, staffEmails) || isClientPlaceholder(apt)) continue;
    const actor = cancellationActor(apt);
    if (actor === 'staff' || actor === 'system') continue; // sécurité : agenda du salon, last minute expiré
    const at = toIso(apt.cancelled_at);
    if (!at) continue;
    push('appointment_cancelled', apt, at, {
      ...who(apt),
      detail: join(
        serviceNames(apt),
        appointmentWhen(apt),
        actor === 'client' ? 'Annulé par le client' : 'Annulé (client ou salon)',
        actor === 'client' ? quotedReason(apt.cancellation_reason) : '',
      ),
      amount: toNumber(apt.grand_total) ?? toNumber(apt.total_price),
      link: appointmentLink(apt),
    });
  }

  for (const o of orders) {
    if (isStaffEmail(o.client_email)) continue;
    const items = Array.isArray(o.items) ? o.items : [];
    const count = items.reduce((n, it) => n + (Number(it?.quantity) || 1), 0);
    const names = items.map((it) => it?.name).filter(Boolean).slice(0, 3).join(', ');
    const articles = count ? `${count} article${count > 1 ? 's' : ''}` : '';
    const cancelled = o.status === 'cancelled';
    push('order_new', o, toIso(o.created_date || o.created_at), {
      ...who(o),
      detail: join(names, articles, cancelled ? 'annulée depuis' : ''),
      amount: toNumber(o.total_price),
      cancelled,
    });
    // Annulation par le client : seulement quand le serveur dit qui et quand (cancelled_by / cancelled_at)
    if (cancelled && cancellationActor(o) === 'client' && o.cancelled_at) {
      push('order_cancelled', o, toIso(o.cancelled_at), {
        ...who(o),
        detail: join(names, articles, quotedReason(o.cancellation_reason)),
        amount: toNumber(o.total_price),
        link: '/admin/orders',
      });
    }
  }

  for (const r of reviews) {
    if (isStaffEmail(r.client_email)) continue;
    const stars = toNumber(r.rating);
    const comment = String(r.comment || '').trim();
    push('review_new', r, toIso(r.created_date || r.created_at), {
      ...who(r),
      detail: join(
        stars ? `${'★'.repeat(Math.min(5, Math.round(stars)))} ${stars}/5` : '',
        r.employee_name ? `pour ${r.employee_name}` : '',
        comment ? `« ${comment.length > 80 ? `${comment.slice(0, 80)}…` : comment} »` : '',
      ),
    });
  }

  for (const g of giftCards) {
    if (isStaffEmail(g.sender_email)) continue;
    push('giftcard_new', g, toIso(g.created_at || g.created_date), {
      ...who(g, 'sender_name', 'sender_email'),
      detail: join(g.recipient_name ? `Pour ${g.recipient_name}` : '', g.code || '', g.status === 'pending' ? 'à valider' : ''),
      amount: toNumber(g.amount),
    });
  }

  const eventDetail = (ev) => join(
    ev.event_type || '',
    shortDate(ev.date),
    toNumber(ev.guest_count) ? `${ev.guest_count} pers.` : '',
  );

  for (const ev of events) {
    if (isStaffEmail(ev.client_email)) continue;
    push('event_request', ev, toIso(ev.created_at || ev.created_date), {
      ...who(ev),
      detail: eventDetail(ev),
      amount: toNumber(ev.price),
    });
  }

  for (const ev of eventAnswers) {
    if (isStaffEmail(ev.client_email)) continue;
    // Un refus sans prix est un refus du salon sur une demande en attente, pas une réponse au devis.
    if (ev.status === 'declined' && toNumber(ev.price) == null) continue;
    // `answered_at` n'est posé que par la réponse du client au devis (serveur) : les refus et
    // retouches du salon ne le touchent pas, et les lignes sans réponse datée sont écartées.
    const at = toIso(ev.answered_at);
    if (!at) continue;
    push('event_answer', ev, at, {
      ...who(ev),
      title: ev.status === 'declined' ? 'Devis refusé' : 'Devis accepté',
      detail: eventDetail(ev),
      amount: toNumber(ev.price),
    });
  }

  for (const r of reservations) {
    if (isStaffEmail(r.client_email)) continue;
    const qty = toNumber(r.quantity) || 1;
    const unit = toNumber(r.unit_price);
    push('textile_reservation', r, toIso(r.created_at || r.created_date), {
      ...who(r),
      detail: join(r.concept_name || 'Pièce', r.size ? `taille ${r.size}` : '', qty > 1 ? `×${qty}` : '', r.status === 'cancelled' ? 'annulée depuis' : ''),
      amount: unit == null ? null : unit * qty,
    });
  }

  const salonEventById = new Map(salonEvents.map((e) => [String(e.id), e]));
  for (const inv of invites) {
    if (isStaffEmail(inv.user_email)) continue;
    const ev = salonEventById.get(String(inv.event_id));
    const guests = toNumber(inv.guests);
    push('salon_event_rsvp', inv, toIso(inv.responded_at), {
      ...who(inv, 'user_name', 'user_email'),
      title: inv.status === 'accepted' ? 'Inscription à un événement' : 'Événement décliné',
      detail: join(
        ev?.title || 'Événement du salon',
        ev?.starts_at ? shortDateTime(ev.starts_at) : '',
        inv.status === 'accepted' && guests ? `${guests} place${guests > 1 ? 's' : ''}` : '',
      ),
    });
  }

  for (const f of feedbacks) {
    if (isStaffEmail(f.client_email)) continue;
    const msg = String(f.message || '').trim();
    push('feedback_new', f, toIso(f.created_at || f.created_date), {
      ...who(f),
      title: f.type === 'bug' ? 'Bug signalé' : 'Suggestion reçue',
      detail: msg.length > 100 ? `${msg.slice(0, 100)}…` : msg,
    });
  }

  for (const u of users) {
    if (u.role && u.role !== 'user') continue;
    push('user_new', u, toIso(u.created_at || u.created_date), {
      clientName: u.full_name || null,
      clientEmail: u.email || null,
      detail: join(u.email || '', u.phone || ''),
    });
  }

  for (const r of reports) {
    if (isStaffEmail(r.reporter_email)) continue;
    push('report_new', r, toIso(r.created_at || r.created_date), {
      ...who(r, 'reporter_name', 'reporter_email'),
      detail: join(r.reason || '', r.reported_name ? `contre ${r.reported_name}` : '', r.comment_id ? 'commentaire' : 'publication'),
    });
  }

  // Dédoublonnage par id (sécurité) puis tri du plus récent au plus ancien
  const unique = [...new Map(out.map((e) => [e.id, e])).values()];
  unique.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { events: unique, failedSources: failed };
}

// ── Hook React Query ─────────────────────────────────────────────────

/** Fil d'activité, rafraîchi chaque minute (même onglet en arrière-plan, pour les alertes). */
export function useAdminActivity(options = {}) {
  const { user } = useAuth();
  const { days = DEFAULT_DAYS, enabled = true, ...rest } = options;
  const isAdmin = user?.role === 'admin';
  return useQuery({
    queryKey: days === DEFAULT_DAYS ? ADMIN_ACTIVITY_QUERY_KEY : [...ADMIN_ACTIVITY_QUERY_KEY, days],
    queryFn: () => fetchAdminActivity({ days }),
    enabled: isAdmin && enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    ...rest,
  });
}

// ── Lu / non lu (par admin, dans ce navigateur) ──────────────────────

const SEEN_EVENT = 'dhb:activity-seen';
const seenKey = (userId) => `dhb-admin-activity-seen:${userId}`;

export function getLastSeen(userId) {
  if (userId == null) return null;
  try {
    return toIso(localStorage.getItem(seenKey(userId)));
  } catch {
    return null;
  }
}

export function markActivitySeen(userId, iso = new Date().toISOString()) {
  if (userId == null) return;
  try {
    localStorage.setItem(seenKey(userId), iso);
  } catch { /* stockage indisponible */ }
  try {
    window.dispatchEvent(new Event(SEEN_EVENT));
  } catch { /* hors navigateur */ }
}

/** Événements non lus depuis la dernière consultation (24 dernières heures au tout premier usage). */
export function useUnreadActivity() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data } = useAdminActivity();
  const [lastSeen, setLastSeen] = useState(() => getLastSeen(userId));

  useEffect(() => {
    const refresh = () => setLastSeen(getLastSeen(userId));
    refresh();
    window.addEventListener(SEEN_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SEEN_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [userId]);

  const unread = useMemo(() => {
    const events = data?.events || [];
    const threshold = lastSeen ? Date.parse(lastSeen) : Date.now() - DAY_MS;
    return events.filter((e) => Date.parse(e.at) > threshold);
  }, [data, lastSeen]);

  const markAllSeen = useCallback(() => markActivitySeen(userId), [userId]);

  return { unread, count: unread.length, lastSeen, markAllSeen };
}

// ── Alertes en direct (toasts + notification système) ────────────────

const MAX_TOASTS = 3;
/** Marge avant l'ouverture : une action faite juste avant le premier chargement reste annoncée. */
const TOAST_GRACE_MS = 5 * 60_000;

function showSystemNotification(event) {
  try {
    if (typeof document === 'undefined' || !document.hidden) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const meta = ACTIVITY_TYPES[event.type] || {};
    const title = `${meta.emoji || '🔔'} ${event.title}`;
    const body = join(event.clientName || '', event.detail || '');
    const options = { body, tag: event.id, icon: '/icons/icon-192.png', badge: '/icons/icon-96.png', data: { url: event.link } };
    const fallback = () => {
      try { new Notification(title, options); } catch { /* refusé par le navigateur */ }
    };
    if (navigator.serviceWorker?.getRegistration) {
      navigator.serviceWorker.getRegistration()
        .then((reg) => (reg ? reg.showNotification(title, options) : fallback()))
        .catch(fallback);
    } else {
      fallback();
    }
  } catch { /* jamais bloquant */ }
}

/**
 * À monter une seule fois dans AdminLayout : un toast par nouvelle action client apparue
 * depuis l'ouverture (jamais pour celles déjà présentes au premier chargement).
 */
export function useActivityToasts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const { data } = useAdminActivity({ enabled: isAdmin });
  const known = useRef(null);
  const knownFor = useRef(user?.id);
  // Instant du premier chargement : seules les actions postérieures (marge comprise) sont annoncées.
  const mountedAt = useRef(Date.now());
  const { prefs: alertPrefs } = useAdminAlertPrefs();
  const alertPrefsRef = useRef(alertPrefs);
  alertPrefsRef.current = alertPrefs;

  useEffect(() => {
    if (!isAdmin || !data?.events) return;
    // Changement de compte : on repart d'un état vierge
    if (knownFor.current !== user?.id) {
      knownFor.current = user?.id;
      known.current = null;
    }
    if (known.current === null) {
      known.current = new Set(data.events.map((e) => e.id));
      mountedAt.current = Date.now();
      return;
    }
    const unseen = data.events.filter((e) => !known.current.has(e.id));
    unseen.forEach((e) => known.current.add(e.id));
    // Un événement inconnu mais antérieur à l'ouverture (source en échec au premier chargement
    // puis rétablie, RDV ancien qui entre dans la limite de 300…) est simplement mémorisé.
    const threshold = mountedAt.current - TOAST_GRACE_MS;
    // Types réglés « sans notification » (Réglages des alertes) : notés dans le fil, sans toast
    const fresh = unseen.filter((e) => Date.parse(e.at) >= threshold && alertPrefsRef.current[e.type] !== false);
    if (!fresh.length) return;

    // Du plus ancien au plus récent, pour que le dernier toast soit la dernière action
    const shown = fresh.slice(0, MAX_TOASTS).reverse();
    for (const e of shown) {
      const meta = ACTIVITY_TYPES[e.type] || {};
      toast(`${meta.emoji || '🔔'} ${e.title}`, {
        description: join(e.clientName || '', e.detail || '', e.amount != null ? euros(e.amount) : ''),
        action: { label: 'Voir', onClick: () => navigate(e.link) },
        duration: 8000,
      });
      showSystemNotification(e);
    }
    const rest = fresh.length - shown.length;
    if (rest > 0) {
      toast(`+ ${rest} autre${rest > 1 ? 's' : ''} action${rest > 1 ? 's' : ''} client${rest > 1 ? 's' : ''}`, {
        duration: 8000,
      });
    }
  }, [data, isAdmin, navigate, user?.id]);
}

// ── Affichage de l'heure ─────────────────────────────────────────────

const parisDayKey = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
const parisTime = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

/** « à l'instant », « il y a 5 min », « 14:32 », « hier 18:05 », « lun. 13 oct. » (heure de Paris). */
export function formatActivityTime(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const now = Date.now();
  const diff = now - t;
  if (diff < 60_000) return "à l'instant";
  if (diff < 60 * 60_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (parisDayKey(t) === parisDayKey(now)) return parisTime(t);
  if (parisDayKey(t) === parisDayKey(now - DAY_MS)) return `hier ${parisTime(t)}`;
  const sameYear = parisDayKey(t).slice(0, 4) === parisDayKey(now).slice(0, 4);
  return new Date(t).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: TZ,
  });
}

/** Montant en euros pour l'affichage (« 35 € »), chaîne vide si absent. */
export const formatActivityAmount = euros;
