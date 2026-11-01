/**
 * Tableau de bord, bloc « 7 derniers jours » : CA des rendez-vous encaissés (hors pourboires et hors
 * part carte cadeau), une barre par jour empilée CB / espèces / non renseigné, total au-dessus.
 * Barres en CSS (hauteur calculée, sans animation de hauteur), aucune info-bulle : tout est écrit.
 * Lecteur d'écran : les barres sont cachées, un tableau caché porte seul les chiffres (avant, tout
 * était lu deux fois).
 * Tout vient de `d` (useDashboardData) : aucune lecture ici.
 */
import React from 'react';
import { BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { euro } from '@/lib/euro';
import { noonOf } from '@/lib/dashboardStats';
import { Section } from '@/components/admin/dashboard/ui';

const SEGMENTS = [
  { key: 'cb', label: 'CB', className: 'bg-blue-500 dark:bg-blue-400' },
  { key: 'especes', label: 'Espèces', className: 'bg-emerald-500 dark:bg-emerald-400' },
  { key: 'autre', label: 'Non renseigné', className: 'bg-zinc-400 dark:bg-zinc-500' },
];

const compactFormat = (digits) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: digits,
});
const COMPACT_1 = compactFormat(1);
const COMPACT_0 = compactFormat(0);
/**
 * Total court au-dessus d'une barre : « 640 € », « 1,2 k€ », « 13 k€ ». À partir de 10 000 €, sans
 * décimale : à 320 px de large, « 13,4 k€ » dépassait de sa colonne. Espace fine avant « k » / « M ».
 */
function compactEuro(v) {
  const n = Math.round(Number(v) || 0);
  if (Math.abs(n) < 1000) return euro(n);
  return (Math.abs(n) < 10000 ? COMPACT_1 : COMPACT_0).format(n).replace(/\s(?=€)/, '').replace(/\s(?=[kM])/, '\u202f');
}

const dayNum = (key) => {
  const n = Number(String(key).slice(8, 10));
  return n === 1 ? '1er' : String(n);
};
/** « mardi 10 novembre » */
const longDay = (key) => {
  const date = noonOf(key);
  return `${format(date, 'EEEE', { locale: fr })} ${dayNum(key)} ${format(date, 'LLLL', { locale: fr })}`;
};

export default function WeekBars({ d }) {
  const { stats, state } = d;
  const appt = state.appointments;
  const prevKey = stats.clock.prevMonthKey;

  // Jours du mois précédent (début de mois) : lus à part, « — » / « … » s'ils manquent
  const days = stats.week.map((w) => {
    const prevDay = w.key.startsWith(prevKey);
    const failed = appt.failed || (prevDay && state.prevMonth.failed);
    const loading = !failed && (appt.loading || (prevDay && state.prevMonth.loading));
    return { ...w, failed, loading, known: !failed && !loading };
  });
  const anyFailed = days.some((w) => w.failed);
  const anyLoading = days.some((w) => w.loading);
  const known = days.filter((w) => w.known);
  const max = Math.max(0, ...known.map((w) => w.revenue));
  const weekTotal = Math.round(known.reduce((s, w) => s + w.revenue, 0) * 100) / 100;
  const weekGift = Math.round(known.reduce((s, w) => s + (w.gift || 0), 0) * 100) / 100;
  const hasOther = known.some((w) => w.autre > 0);
  // Rien du tout : ni CA, ni part payée par carte cadeau
  const empty = !anyFailed && !anyLoading && weekTotal === 0 && weekGift === 0;

  const totalText = anyFailed ? '—' : anyLoading ? '…' : euro(weekTotal);
  const hint = `${empty ? 'Rendez-vous' : `Total ${totalText} · rendez-vous`} encaissés, hors pourboires`
    + (!anyFailed && !anyLoading && weekGift > 0 ? ` · + ${euro(weekGift)} réglés par carte cadeau` : '');

  return (
    <Section title="7 derniers jours" icon={BarChart3} hint={hint}>
      {appt.failed ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : appt.loading ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : empty ? (
        <p className="text-xs text-muted-foreground">Aucun encaissement ces 7 derniers jours.</p>
      ) : (
        <>
          {/* Barres et jours : cachés au lecteur d'écran, le tableau caché plus bas porte les chiffres */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2" aria-hidden="true">
            {days.map((w) => {
              const ratio = w.known && max > 0 ? w.revenue / max : 0;
              return (
                <div key={w.key} className="flex h-40 flex-col items-center justify-end min-w-0">
                  {/* Lettres resserrées : « 1,2 k€ » (Inter, 11 px) tient dans une colonne de 34 px (320 px de large) */}
                  <span className={`mb-1 text-[11px] leading-none tracking-tight tabular-nums whitespace-nowrap ${w.revenue > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                    {w.failed ? '—' : w.loading ? '…' : compactEuro(w.revenue)}
                  </span>
                  {w.known && w.revenue > 0 && (
                    <div
                      className={`flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-md ${w.isToday ? 'opacity-60 outline-dashed outline-1 outline-offset-1 outline-foreground/50' : ''}`}
                      style={{ height: `max(3px, calc((100% - 1rem) * ${ratio.toFixed(4)}))` }}
                    >
                      {SEGMENTS.map((s) => (w[s.key] > 0 ? (
                        <div key={s.key} className={`w-full shrink-0 ${s.className}`} style={{ height: `${(w[s.key] / w.revenue) * 100}%` }} />
                      ) : null))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2 border-t border-border pt-1.5" aria-hidden="true">
            {days.map((w) => (
              <span key={w.key} className={`text-center text-[11px] leading-tight min-w-0 ${w.isToday ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                <span className="block sm:inline">{w.isToday ? 'Auj.' : format(noonOf(w.key), 'EEE', { locale: fr })}</span>
                <span className="sm:ml-1">{dayNum(w.key)}</span>
              </span>
            ))}
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
            {SEGMENTS.filter((s) => s.key !== 'autre' || hasOther).map((s) => (
              <li key={s.key} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm shrink-0 ${s.className}`} />
                {s.label}
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0 border border-dashed border-foreground/60" />
              Aujourd'hui, journée en cours
            </li>
          </ul>

          {/* Tableau caché dans un bloc : un `<table>` ignore la largeur de 1 px de `sr-only` (défilement horizontal) */}
          <div className="sr-only">
            <table>
              <caption>Encaissements des 7 derniers jours, hors pourboires et hors carte cadeau</caption>
              <thead>
                <tr>
                  <th scope="col">Jour</th>
                  <th scope="col">Total</th>
                  <th scope="col">CB</th>
                  <th scope="col">Espèces</th>
                  <th scope="col">Non renseigné</th>
                </tr>
              </thead>
              <tbody>
                {days.map((w) => (
                  <tr key={w.key}>
                    <th scope="row">{w.isToday ? `Aujourd'hui (journée en cours), ${longDay(w.key)}` : longDay(w.key)}</th>
                    {['revenue', 'cb', 'especes', 'autre'].map((k) => (
                      <td key={k}>{w.failed ? 'indisponible' : w.loading ? 'chargement' : euro(w[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}
