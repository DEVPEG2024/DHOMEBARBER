/**
 * « Ajouter au calendrier » pour un rendez-vous D'Home Barber.
 *
 * - Google Agenda : URL `https://calendar.google.com/calendar/render?action=TEMPLATE…`,
 *   dates en heure locale de Paris (sans « Z ») et paramètre `ctz=Europe/Paris`.
 * - Apple Calendar / Outlook : fichier iCalendar (.ics) généré côté client,
 *   `DTSTART;TZID=Europe/Paris` + bloc VTIMEZONE, fins de ligne CRLF, texte échappé.
 *
 * Convention : `start` / `end` sont des `Date` dont les composantes *locales*
 * (`getHours`…) sont l'heure murale du salon (Paris). On ne convertit jamais de
 * fuseau : on recopie ces composantes telles quelles, ce qui reste juste même si
 * l'appareil du client n'est pas réglé sur Paris (`toLocalDate` construit la Date
 * à partir des chaînes `YYYY-MM-DD` / `HH:mm` renvoyées par l'API).
 */
import { isNative, openExternalUrl } from '@/lib/capacitor';

export const SALON_LOCATION = "D'Home Barber, 3 Rue du Bois Arquet, 74140 Douvaine";
export const ICS_FILENAME = 'rendez-vous-dhomebarber.ics';
export const TIMEZONE = 'Europe/Paris';

const pad2 = (n) => String(n).padStart(2, '0');

/** Bloc VTIMEZONE Europe/Paris (CET / CEST) : la RFC 5545 l'exige pour tout TZID référencé. */
const VTIMEZONE_PARIS = [
  'BEGIN:VTIMEZONE',
  `TZID:${TIMEZONE}`,
  'X-LIC-LOCATION:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/**
 * `'YYYY-MM-DD'` + `'HH:mm'` (ou `'HH:mm:ss'`) → Date dont les composantes locales
 * reproduisent exactement la date et l'heure fournies (heure du salon).
 */
export function toLocalDate(dateStr, timeStr = '00:00') {
  const [y, m, d] = String(dateStr ?? '').slice(0, 10).split('-').map(Number);
  const [h = 0, min = 0] = String(timeStr ?? '00:00').split(':').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, h || 0, min || 0, 0, 0);
}

/** Date (ou valeur parsable) → Date valide, sinon `null`. */
function asDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → `YYYYMMDDTHHmmSS` d'après ses composantes locales (heure murale, sans fuseau ni « Z »). */
function formatLocal(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
    + `T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

/** Date → `YYYYMMDDTHHmmSSZ` en UTC (pour DTSTAMP). */
function formatUtc(date) {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`
    + `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

/** Bornes `{ start, end }` sûres : `end` retombe sur `start` + 30 min si absente ou incohérente. */
function eventBounds({ start, end }) {
  const s = asDate(start) || new Date();
  let e = asDate(end);
  if (!e || e <= s) e = new Date(s.getTime() + 30 * 60 * 1000);
  return { start: s, end: e };
}

/**
 * Construit l'événement d'un rendez-vous à partir des données de réservation.
 *
 * @param {object} p
 * @param {string} [p.barberName]        Nom du barber
 * @param {Array|string} [p.services]    Prestations (`{ name }` ou chaînes ; JSON toléré)
 * @param {string|Date} p.date           `'YYYY-MM-DD'` ou Date locale
 * @param {string} p.startTime           `'HH:mm'`
 * @param {string} [p.endTime]           `'HH:mm'` ; sinon `startTime` + `totalDuration` min
 * @param {number} [p.totalDuration]     Durée totale en minutes (défaut 30)
 * @param {number} [p.totalPrice]        Prix total en euros
 * @param {string} [p.uid]               UID iCalendar stable (évite les doublons à la réimportation)
 * @returns {{ title: string, description: string, location: string, start: Date, end: Date, uid?: string }}
 */
export function buildAppointmentEvent({ barberName, services = [], date, startTime, endTime, totalDuration, totalPrice, uid }) {
  let list = services;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  const names = (Array.isArray(list) ? list : [])
    .map((s) => (typeof s === 'string' ? s : s?.name))
    .filter(Boolean);
  const label = names.length > 0 ? names.join(', ') : 'Rendez-vous';

  const dateStr = date instanceof Date
    ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    : String(date ?? '').slice(0, 10);
  const start = toLocalDate(dateStr, startTime);
  let end;
  if (endTime) {
    end = toLocalDate(dateStr, endTime);
  } else {
    // Calcul en minutes murales (et non en millisecondes) pour rester stable les jours de changement d'heure
    const [sh = 0, sm = 0] = String(startTime ?? '00:00').split(':').map(Number);
    const endMin = sh * 60 + sm + (Number(totalDuration) > 0 ? Number(totalDuration) : 30);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), Math.floor(endMin / 60), endMin % 60, 0, 0);
  }

  const price = totalPrice != null && totalPrice !== '' && !Number.isNaN(Number(totalPrice)) ? ` · ${Number(totalPrice)} €` : '';
  const withBarber = barberName ? `Avec ${barberName} · ` : '';

  return {
    title: `D'Home Barber · ${label}`,
    description: `${withBarber}${label}${price}`,
    location: SALON_LOCATION,
    start,
    end,
    uid,
  };
}

/**
 * URL Google Agenda (modèle d'événement pré-rempli).
 * Dates au format `YYYYMMDDTHHmmSS/YYYYMMDDTHHmmSS` en heure de Paris, sans « Z », avec `ctz=Europe/Paris`.
 */
export function buildGoogleCalendarUrl({ title, description, location, start, end }) {
  const b = eventBounds({ start, end });
  const params = [
    'action=TEMPLATE',
    `text=${encodeURIComponent(title ?? '')}`,
    `dates=${formatLocal(b.start)}/${formatLocal(b.end)}`,
    `details=${encodeURIComponent(description ?? '')}`,
    `location=${encodeURIComponent(location ?? '')}`,
    `ctz=${TIMEZONE}`,
  ];
  return `https://calendar.google.com/calendar/render?${params.join('&')}`;
}

/** Échappement d'une valeur TEXT iCalendar (RFC 5545 §3.3.11) : `\`, `;`, `,` et retours à la ligne. */
function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Pliage d'une ligne à 75 octets max (RFC 5545 §3.1), sans couper un caractère multi-octets. */
function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const len = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // les lignes de continuation commencent par une espace
    if (bytes + len > limit) {
      parts.push(current);
      current = ch;
      bytes = len;
    } else {
      current += ch;
      bytes += len;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function generateUid() {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${random}@dhomebarber.fr`;
}

/**
 * Contenu d'un fichier iCalendar (.ics) : VCALENDAR + VTIMEZONE Europe/Paris + VEVENT,
 * fins de ligne CRLF, lignes pliées à 75 octets, texte échappé.
 */
export function buildIcs({ title, description, location, start, end, uid }) {
  const b = eventBounds({ start, end });
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//D'Home Barber//Rendez-vous//FR",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE_PARIS,
    'BEGIN:VEVENT',
    `UID:${uid || generateUid()}`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART;TZID=${TIMEZONE}:${formatLocal(b.start)}`,
    `DTEND;TZID=${TIMEZONE}:${formatLocal(b.end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** Téléchargement d'un texte via un Blob et un lien `download` déclenché programmatiquement (web). */
function downloadTextFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Laisse au navigateur le temps de démarrer le téléchargement avant de libérer l'URL
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Ouvre l'ajout au calendrier.
 * @param {'google'|'ics'} kind  `google` → Google Agenda ; `ics` → fichier Apple Calendar / Outlook
 * @param {object} event         Événement (`buildAppointmentEvent`)
 */
export async function openCalendar(kind, event) {
  if (!event) return;

  if (kind === 'google') {
    const url = buildGoogleCalendarUrl(event);
    if (isNative) await openExternalUrl(url);
    else window.open(url, '_blank', 'noopener');
    return;
  }

  const ics = buildIcs(event);
  if (isNative) {
    // Limite connue : dans la WebView Capacitor (surtout iOS), un téléchargement de Blob
    // via un lien `download` ne produit rien. On ouvre donc une URL `data:` par le
    // navigateur natif (`openExternalUrl`) : iOS propose « Ajouter au calendrier »
    // quand l'URL est acceptée, mais SFSafariViewController / Custom Tabs peuvent
    // refuser un schéma non http(s) — dans ce cas rien ne se passe et aucune erreur
    // ne remonte (`openExternalUrl` les avale). Une solution robuste demanderait
    // @capacitor/filesystem + @capacitor/share (écrire le .ics puis le partager),
    // plugins non installés à ce jour. Google Agenda reste la voie fiable en natif.
    await openExternalUrl(`data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`);
    return;
  }
  downloadTextFile(ics, ICS_FILENAME, 'text/calendar;charset=utf-8');
}
