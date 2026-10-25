/**
 * Export CSV de la page Admin → Trafic (26 oct. 2026) : les chiffres affichés, pour la période et
 * le périmètre choisis (réponse de `/analytics/overview`, rien de plus), une rubrique par carte de
 * la page. Durées en secondes dans les tableaux (calculables), en clair dans les chiffres clés ;
 * décimales à la virgule (un « 2.4 » devient une date dans Excel en français). Aucun email : le
 * serveur n'en renvoie aucun à cette page.
 */
import { exportSectionsToCSV } from '@/utils/exportCSV';
import { errorSourceLabel, versionLabel } from './AppErrors';
import {
  WEEKDAYS_LONG, actionLabel, addDays, deltaOf, deviceLabel, formatDuration, pageLabel, platformLabel, sourceLabel,
} from './trafficFormat';

const EMPTY = [['Pas encore de données']];

/** « 2026-10-26 » → « 26/10/2026 ». */
const dayFr = (day) => {
  const [y, m, d] = String(day).split('-');
  return `${d}/${m}/${y}`;
};

const whenFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
/** Instant → « 26/10/2026 14:05 », heure de Paris ; vide si illisible. */
function whenFr(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const p = Object.fromEntries(whenFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const weekdayOf = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return WEEKDAYS_LONG[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
};
const decimal = (n) => String(Number(n) || 0).replace('.', ',');
const percent = (rate) => Math.round((Number(rate) || 0) * 100);
const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const orEmpty = (rows) => (rows.length ? rows : EMPTY);

const KPIS = [
  { key: 'visitors', label: 'Visiteurs uniques' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'accounts', label: 'Comptes connectés' },
  { key: 'new_visitors', label: 'Nouveaux visiteurs' },
  { key: 'returning_visitors', label: 'Visiteurs revenants' },
  { key: 'avg_session_s', label: 'Temps moyen par session', value: formatDuration },
  { key: 'median_session_s', label: 'Temps médian par session', value: formatDuration },
  { key: 'total_active_s', label: 'Temps total passé', value: formatDuration },
  { key: 'pages_per_session', label: 'Pages par session', value: decimal },
  { key: 'bounce_rate', label: 'Rebond : 1 page et moins de 10 s (%)', value: percent },
];

/** Rubriques du fichier (pures, testées par e2e/trafic-export.spec.js). */
export function trafficSections(data, now = new Date()) {
  const { from, to, days } = data.period;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  const k = data.kpis || {};
  const prev = data.previous || {};

  const byDay = new Map((data.daily || []).map((d) => [d.day, d]));
  const dailyRows = [];
  for (let day = from; day <= to && dailyRows.length < 400; day = addDays(day, 1)) {
    const d = byDay.get(day) || {};
    dailyRows.push([dayFr(day), weekdayOf(day), d.visitors || 0, d.sessions || 0, d.avg_session_s || 0, d.page_views || 0]);
  }

  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of data.hourly || []) {
    if (c.dow >= 1 && c.dow <= 7 && c.hour >= 0 && c.hour <= 23) grid[c.dow - 1][c.hour] += c.sessions;
  }
  const firstStep = data.funnel?.[0]?.visitors || 0;
  const errors = data.errors;

  const sections = [
    {
      title: 'Trafic D\'Home Barber',
      rows: [
        ['Période', `du ${dayFr(from)} au ${dayFr(to)} (${days} jour${days > 1 ? 's' : ''})`],
        ['Période précédente (comparaison)', `du ${dayFr(prevFrom)} au ${dayFr(prevTo)}`],
        ['Visiteurs comptés', data.scope === 'all'
          ? 'Tout le monde (équipe et comptes testeurs compris)'
          : 'Clients seulement (équipe et comptes testeurs exclus)'],
        ['Exporté le', whenFr(now)],
      ],
    },
    {
      title: 'Chiffres clés',
      headers: ['Indicateur', 'Période', 'Période précédente', 'Écart (%)'],
      rows: KPIS.map(({ key, label, value = (n) => Number(n) || 0 }) => [
        label, value(k[key]), value(prev[key]), deltaOf(k[key], prev[key]) ?? '',
      ]),
    },
    {
      title: 'Évolution par jour',
      headers: ['Jour', 'Jour de la semaine', 'Visiteurs', 'Sessions', 'Temps moyen par session (secondes)', 'Pages vues'],
      rows: dailyRows,
    },
    {
      title: 'Parcours de réservation',
      headers: ['Étape', 'Personnes', 'Part de celles qui ont ouvert la réservation (%)'],
      rows: orEmpty((data.funnel || []).map((f) => [
        f.label, f.visitors, firstStep ? Math.round((f.visitors / firstStep) * 100) : '',
      ])),
    },
    {
      title: 'Heures de pointe (débuts de session, heure de Paris)',
      headers: ['Jour', ...Array.from({ length: 24 }, (_, h) => `${h} h`), 'Total'],
      rows: grid.map((row, d) => [WEEKDAYS_LONG[d], ...row, row.reduce((a, b) => a + b, 0)]),
    },
    {
      title: 'Pages les plus vues',
      headers: ['Page', 'Adresse', 'Vues', 'Visiteurs', 'Temps moyen par vue (secondes)'],
      rows: orEmpty((data.pages || []).map((p) => [pageLabel(p.path), p.path, p.views, p.visitors, p.avg_time_s])),
    },
    {
      title: 'Actions clés',
      headers: ['Action', 'Nombre de fois', 'Personnes différentes'],
      rows: orEmpty((data.actions || []).map((a) => [actionLabel(a.name), a.count, a.visitors])),
    },
    {
      title: 'Provenance des visites',
      headers: ['Origine', 'Sessions'],
      rows: orEmpty((data.sources || []).map((s) => [sourceLabel(s.source), s.sessions])),
    },
    {
      title: 'Plateformes',
      headers: ['Plateforme', 'Sessions', 'Visiteurs'],
      rows: orEmpty((data.platforms || []).map((p) => [platformLabel(p.platform), p.sessions, p.visitors])),
    },
    {
      title: 'Appareils',
      headers: ['Appareil', 'Sessions'],
      rows: orEmpty((data.devices || []).map((d) => [deviceLabel(d.device), d.sessions])),
    },
    {
      title: 'Pages d\'entrée',
      headers: ['Page', 'Adresse', 'Sessions'],
      rows: orEmpty((data.entries || []).map((e) => [pageLabel(e.path), e.path, e.sessions])),
    },
    {
      title: 'Réalisations des barbers',
      headers: ['Barber', 'Photos ouvertes', '« Réserver » depuis une photo'],
      rows: orEmpty((data.gallery || []).map((g) => [g.barber_name || 'Barber supprimé', g.opens, g.book_clicks])),
    },
    {
      title: 'New Gang : publications les plus vues',
      headers: ['Publication', 'Auteur', 'Publiée le', 'Personnes', 'Vues'],
      rows: orEmpty((data.posts || []).map((p) => [
        oneLine(p.excerpt) || 'Photo sans texte', p.author_name || 'Membre du Gang', whenFr(p.created_at), p.viewers, p.views,
      ])),
    },
  ];

  if (errors?.totals) {
    const t = errors.totals;
    sections.push({
      title: 'Erreurs de l\'app (tout le monde, équipe comprise)',
      rows: [
        ['Erreurs', t.errors],
        ['Sessions touchées', t.sessions_with_error],
        ['Appareils touchés', t.devices],
        ['Sessions sans erreur (%)', t.error_free_rate == null ? '' : decimal(Math.floor(t.error_free_rate * 1000) / 10)],
      ],
    }, {
      headers: ['Type', 'Message', 'Fois', 'Appareils', 'Dont appareils de l\'équipe', 'Première fois', 'Dernière fois', 'Dernière page', 'Versions'],
      rows: orEmpty((errors.list || []).map((e) => [
        errorSourceLabel(e.source), oneLine(e.message), e.count, e.devices, e.team_devices || 0,
        whenFr(e.first_seen || e.first_at), whenFr(e.last_at), e.page ? pageLabel(e.page) : '',
        (e.versions || []).map(versionLabel).join(' · '),
      ])),
    });
  }

  sections.push({ rows: [['Mesure d\'audience interne de l\'app : données conservées 13 mois, sans parcours individuel.']] });
  return sections;
}

/** Nom du fichier : « trafic-2026-09-27-au-2026-10-26-clients ». */
export function trafficFilename(data) {
  return `trafic-${data.period.from}-au-${data.period.to}-${data.scope === 'all' ? 'tout-le-monde' : 'clients'}`;
}

/** Enregistre le CSV (téléchargement sur le web, feuille de partage dans les apps). */
export function exportTraffic(data) {
  return exportSectionsToCSV(trafficSections(data), trafficFilename(data));
}
