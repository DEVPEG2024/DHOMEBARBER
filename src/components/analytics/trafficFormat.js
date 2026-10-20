/**
 * Libellés et formats de la page Admin → Trafic (mesure d'audience, src/lib/analytics.js).
 */

const PAGE_LABELS = {
  '/': 'Accueil',
  '/booking': 'Réservation',
  '/services': 'Prestations',
  '/shop': 'Boutique',
  '/feed': 'New Gang (fil)',
  '/barber/:id': "Profil d'un barber",
  '/appointments': 'Mes rendez-vous',
  '/orders': 'Mes commandes',
  '/profile': 'Profil',
  '/settings': 'Paramètres',
  '/notifications': 'Notifications',
  '/reviews': 'Avis',
  '/events': 'Événements',
  '/gift-cards': 'Cartes cadeau',
  '/textile': 'Textile & drops',
  '/partners': 'Bons plans',
  '/favorites': 'Favoris',
  '/gang-card': 'Carte Gang',
  '/try-on': 'Nouvelle tête',
  '/snap': 'Filtres Snap',
  '/login': 'Connexion',
  '/admin': 'Admin · Dashboard',
  '/admin/me': 'Admin · Mon espace',
  '/admin/agenda': 'Admin · Agenda',
  '/admin/traffic': 'Admin · Trafic',
};

/** « /barber/:id » → « Profil d'un barber » ; chemin inconnu affiché tel quel. */
export function pageLabel(path) {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  if (String(path).startsWith('/admin/')) return `Admin · ${String(path).slice(7)}`;
  return path || '/';
}

const ACTION_LABELS = {
  booking_step: 'Étape de réservation atteinte',
  booking_done: 'Rendez-vous réservé',
  cart_add: 'Produit ajouté au panier',
  order_done: 'Commande passée',
  gallery_open: 'Photo de réalisation ouverte',
  gallery_book: '« Réserver » depuis une photo',
  push_open: 'Notification ouverte',
  privatisation_request: 'Demande de privatisation',
  last_minute_click: '« Réserver ce créneau » (Last Minute de l\'accueil)',
};
export const actionLabel = (name) => ACTION_LABELS[name] || name;

const PLATFORM_LABELS = { ios: 'iPhone (app)', android: 'Android (app)', web: 'Site web', pwa: 'App installée (site)', inconnue: 'Inconnue' };
export const platformLabel = (p) => PLATFORM_LABELS[p] || p;

const DEVICE_LABELS = { mobile: 'Téléphone', tablet: 'Tablette', desktop: 'Ordinateur', inconnu: 'Inconnu' };
export const deviceLabel = (d) => DEVICE_LABELS[d] || d;

/** Provenance : direct, notification, lien `?src=…`, site d'origine. */
export function sourceLabel(source) {
  const s = String(source || 'direct');
  if (s === 'direct') return 'Accès direct';
  if (s === 'push') return 'Notification';
  if (s.startsWith('lien:')) return `Lien « ${s.slice(5)} »`;
  if (s.startsWith('site:')) return `Site ${s.slice(5)}`;
  return s;
}

/** Durée lisible : « 45 s », « 3 min 05 s », « 2 h 10 min ». */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${String(r).padStart(2, '0')} s` : `${m} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const nf = new Intl.NumberFormat('fr-FR');
export const formatNumber = (n) => nf.format(Math.round(Number(n) || 0));
export const formatPercent = (r) => `${Math.round((Number(r) || 0) * 100)} %`;

/** Écart avec la période précédente, en %, ou null si rien à comparer. */
export function deltaOf(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return null;
  return Math.round(((c - p) / p) * 100);
}

const TZ = 'Europe/Paris';
/** Jour de Paris `AAAA-MM-JJ`. */
export function parisDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** « 18 oct. » */
export function shortDay(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
}

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
