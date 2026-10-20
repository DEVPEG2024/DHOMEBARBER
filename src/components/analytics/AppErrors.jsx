import React, { useState } from 'react';
import { Bug, CheckCircle2, ChevronDown } from 'lucide-react';
import { formatNumber, pageLabel } from '@/components/analytics/trafficFormat';

/**
 * Erreurs de l'app (Admin → Trafic, 20 oct. 2026) : plantages et erreurs JavaScript remontés par
 * les téléphones et le site (src/lib/analytics.js → `reportError`), équipe comprise. Pastille en
 * tête de page (`ErrorHealthBadge`) et rubrique détaillée (`AppErrorsCard`) : une ligne par erreur,
 * appareils touchés, versions, dernière page, pile d'appels dépliable.
 */

const SOURCE_LABELS = { react: 'Écran planté', window: 'Erreur', promise: 'Erreur non gérée' };
const PLATFORM_SHORT = { ios: 'iPhone', android: 'Android', web: 'Site', pwa: 'App installée' };
const NEW_MS = 7 * 86400000;

const whenFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const formatWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : whenFmt.format(d);
};

/** « 99,5 % » ; une décimale pour voir les petites baisses. */
export function formatRate(rate) {
  if (rate == null) return '—';
  return `${(Math.floor(rate * 1000) / 10).toFixed(1).replace('.', ',')} %`;
}

/** « ios 1.0.8 » → « iPhone 1.0.8 » ; « web web » / « web » → « Site ». */
function versionLabel(v) {
  const [platform, version] = String(v).split(' ');
  const name = PLATFORM_SHORT[platform] || platform;
  return version && version !== 'web' ? `${name} ${version}` : name;
}

/** Pastille en tête de page : verte sans erreur, ambre sinon ; un tap descend à la rubrique. */
export function ErrorHealthBadge({ errors }) {
  if (!errors?.totals) return null;
  const { totals } = errors;
  const clean = totals.errors === 0;
  return (
    <a href="#erreurs-app"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${clean ? 'border-border bg-card text-foreground' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200'}`}>
      {clean
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
        : <Bug className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />}
      {clean ? 'Aucune erreur' : `${formatNumber(totals.errors)} erreur${totals.errors > 1 ? 's' : ''} · ${formatRate(totals.error_free_rate)} sans erreur`}
    </a>
  );
}

function ErrorRow({ item }) {
  const [open, setOpen] = useState(false);
  const fresh = item.first_seen && Date.now() - Date.parse(item.first_seen) < NEW_MS;
  const clients = item.devices - item.team_devices;
  return (
    <li className="border-t border-border/50 first:border-t-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full text-left py-2.5 flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${item.source === 'react' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-secondary text-muted-foreground'}`}>
              {SOURCE_LABELS[item.source] || item.source}
            </span>
            {fresh && <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300" title="Apparue pour la première fois il y a moins de 7 jours">Nouvelle</span>}
          </span>
          <span className="block font-mono text-[11px] text-foreground break-words line-clamp-3">{item.message}</span>
          <span className="block text-[11px] text-muted-foreground mt-1">
            <span className="text-foreground font-semibold tabular-nums">{formatNumber(item.count)}</span> fois ·{' '}
            <span className="text-foreground font-semibold tabular-nums">{formatNumber(item.devices)}</span> appareil{item.devices > 1 ? 's' : ''}
            {item.team_devices > 0 && ` (${clients > 0 ? `${formatNumber(clients)} client${clients > 1 ? 's' : ''}, ` : ''}${formatNumber(item.team_devices)} équipe)`}
            {' · '}dernière : {formatWhen(item.last_at)}{item.page ? ` sur ${pageLabel(item.page)}` : ''}
          </span>
          {item.versions?.length > 0 && (
            <span className="block text-[11px] text-muted-foreground mt-0.5 break-words">{item.versions.map(versionLabel).join(' · ')}</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 mt-1 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="pb-3 space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            Première fois : {formatWhen(item.first_seen || item.first_at)}
          </p>
          {item.stack
            ? <pre className="text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-all rounded-lg bg-secondary/60 p-2.5 text-muted-foreground max-h-56 overflow-y-auto">{item.stack}</pre>
            : <p className="text-[11px] text-muted-foreground">Pas de pile d'appels pour cette erreur.</p>}
        </div>
      )}
    </li>
  );
}

/** Rubrique détaillée, en bas de la page Trafic (ancre #erreurs-app). */
export function AppErrorsCard({ errors, period }) {
  if (!errors?.totals) return null;
  const { totals, list } = errors;
  return (
    <section id="erreurs-app" className="bg-card border border-border rounded-2xl p-4 sm:p-5 scroll-mt-20">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Bug className="w-4 h-4 text-primary" aria-hidden="true" /> Erreurs de l'app
      </h2>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        Plantages et erreurs sur les téléphones et le site{period ? `, du ${period}` : ''}, équipe comprise. Une ligne par erreur, les plus répandues d'abord ; touchez-en une pour le détail technique.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ['Sessions sans erreur', formatRate(totals.error_free_rate)],
          ['Erreurs', formatNumber(totals.errors)],
          ['Appareils touchés', formatNumber(totals.devices)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-secondary/50 px-3 py-2.5 min-w-0">
            <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
            <p className="text-base font-bold text-foreground mt-0.5 tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-4">
          Aucune erreur enregistrée sur la période. La remontée a commencé le 20 octobre 2026 sur le site ; les apps iPhone et Android l'auront à leur prochaine version.
        </p>
      ) : (
        <ul className="mt-3">
          {list.map((item) => <ErrorRow key={`${item.source}|${item.message}`} item={item} />)}
        </ul>
      )}
    </section>
  );
}
