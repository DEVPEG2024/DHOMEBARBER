/**
 * Tableau de bord : « Remplissage des 7 prochains jours » (refonte du 1er nov. 2026).
 *
 * Grille barbers (lignes) × jours (aujourd'hui → J+6) : part des heures de travail déjà réservée,
 * pauses et privatisations déduites (`d.fill`, calculé par `computeFill`). Une seule teinte dont l'intensité suit le %,
 * case faible (moins de 40 %) bordée d'ambre. Chaque case mène à l'agenda du jour et du barber.
 * Journée entièrement privatisée (privatisation confirmée) : « Privé ». Heures libres = ce qui reste à
 * prendre (aujourd'hui : à partir de l'heure qu'il est, `cell.free`).
 * Toute la semaine tient dès 375 px ; plus étroit, ou avec un nom long (colonne élargie), la grille
 * défile dans le bloc (nom du barber fixé à gauche), jamais la page. Un nom ne se coupe jamais au
 * milieu d'un mot : retour à la ligne après une espace ou un trait d'union, sinon points de suspension
 * (nom complet en info-bulle et pour les lecteurs d'écran).
 * Liste des barbers illisible : « Impossible de charger la liste des barbers » + Réessayer.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Section, Note, InlineError } from '@/components/admin/dashboard/ui';
import { noonOf } from '@/lib/dashboardStats';
import { useMouseScroll } from '@/components/booking/useMouseScroll';

// En dessous : case bordée d'ambre (journée peu remplie)
const LOW_PCT = 40;
// Bordure et texte d'une case faible : ambre plein en mode clair (à 50 %, la bordure se perdait sur le
// fond vert pâle), atténué en sombre ; le fond reste celui du remplissage
const LOW_BOX = 'border-amber-600 dark:border-amber-500/60 text-amber-800 dark:text-amber-300';
// Intensité du fond : de 8 % (rien de réservé) à 68 % (complet) de la couleur primaire
const alphaOf = (pct) => 0.08 + (Math.max(0, Math.min(100, pct)) / 100) * 0.6;
const fillBg = (pct) => ({ backgroundColor: `hsl(var(--primary) / ${alphaOf(pct).toFixed(2)})` });

/** « 3 h 30 », « 45 min », « 4 h » à partir de minutes. */
function formatDuration(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`;
}

/** « 3 h 30 libres », « 1 h libre ». */
const freeText = (min) => `${formatDuration(min)} ${min === 60 || min === 1 ? 'libre' : 'libres'}`;

/** « mardi 10 novembre », « dimanche 1er novembre ». */
function longDate(key) {
  const date = noonOf(key);
  const day = Number(key.slice(8, 10));
  return `${format(date, 'EEEE', { locale: fr })} ${day === 1 ? '1er' : day} ${format(date, 'MMMM', { locale: fr })}`;
}

/** Ce que montre une case : `ok`, `off` (repos), `leave` (congé), `private` (privatisé), `loading`, `failed`. */
function kindOf(cell, src, timeOffsLoading) {
  if (cell.state === 'leave') return 'leave';
  if (cell.state === 'off') return 'off';
  if (cell.state === 'private') return 'private';
  if (src.failed) return 'failed';
  if (src.loading || timeOffsLoading) return 'loading';
  return 'ok';
}

function labelOf(kind, cell, name, key, isToday) {
  const when = `${isToday ? "aujourd'hui, " : ''}${longDate(key)}`;
  if (kind === 'leave') return `${name}, ${when} : en congé`;
  if (kind === 'off') return `${name}, ${when} : repos`;
  if (kind === 'private') return `${name}, ${when} : salon privatisé`;
  if (kind === 'failed') return `${name}, ${when} : rendez-vous non lus`;
  if (kind === 'loading') return `${name}, ${when} : chargement`;
  // Aujourd'hui : ce qui reste à prendre à partir de maintenant
  const free = Math.max(0, Number(cell.free) || 0);
  const rest = free > 0
    ? `${freeText(free)}${isToday ? ' à partir de maintenant' : ''}`
    : isToday ? 'plus rien de libre' : 'complet';
  return `${name}, ${when} : ${cell.pct} % réservé, ${rest}`;
}

const CELL_BASE = 'flex min-h-11 w-full items-center justify-center rounded-lg text-center tabular-nums';
// Congé, Privé : fond gris, mot court
const GREY_CELL = 'bg-secondary text-[11px] font-medium tracking-tight text-muted-foreground';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary';

function cellLook(kind, cell) {
  if (kind === 'ok') {
    const low = cell.pct < LOW_PCT;
    return {
      className: `${CELL_BASE} border text-xs font-semibold ${low ? LOW_BOX : 'border-transparent text-foreground'}`,
      style: fillBg(cell.pct),
      // Le nombre seul : « 100 % » ne tient pas dans une case de 35 px (légende et lecteur d'écran disent « % »)
      content: cell.pct,
    };
  }
  if (kind === 'leave' || kind === 'private') {
    // Sans bordure : « Congé » tient tout juste dans une case d'un écran de 375 px
    return { className: `${CELL_BASE} ${GREY_CELL}`, content: kind === 'leave' ? 'Congé' : 'Privé' };
  }
  if (kind === 'failed') {
    return { className: `${CELL_BASE} border border-dashed border-border text-xs text-muted-foreground`, content: '—' };
  }
  if (kind === 'loading') {
    return { className: `${CELL_BASE} bg-secondary/40 text-xs text-muted-foreground`, content: '…' };
  }
  // Repos : discret
  return { className: `${CELL_BASE} text-xs text-muted-foreground/60`, content: '—' };
}

function Cell({ cell, kind, label, to }) {
  const look = cellLook(kind, cell);
  if (to) {
    return (
      <Link to={to} aria-label={label} className={`${look.className} ${FOCUS} hover:ring-2 hover:ring-primary/40`} style={look.style}>
        <span aria-hidden="true">{look.content}</span>
      </Link>
    );
  }
  return (
    <div className={look.className} style={look.style}>
      <span aria-hidden="true">{look.content}</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default function FillGrid({ d }) {
  const { days, barbers } = d.fill;
  const monthKey = d.stats.clock.monthKey;
  const has = barbers.length > 0;

  // Indice de défilement : la grille dépasse du bloc (téléphone) et il reste des jours à droite
  const scrollRef = useRef(null);
  const [scroll, setScroll] = useState({ scrollable: false, more: false });
  useMouseScroll(scrollRef, has);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next = { scrollable: max > 2, more: max - el.scrollLeft > 2 };
      setScroll((prev) => (prev.scrollable === next.scrollable && prev.more === next.more ? prev : next));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, [has]);

  // Liste des barbers illisible ou pas encore lue : jamais un bloc qui disparaît sans rien dire
  const emp = d.state.employees || {};
  if (!has) {
    if (!emp.failed && !emp.loading) return null;
    return (
      <Section title="Remplissage des 7 prochains jours" icon={CalendarDays}>
        {/* RDV aussi illisibles (coupure) : le bandeau de la page suffit, son « Réessayer » relit tout */}
        {emp.failed && !d.state.appointments.failed && <InlineError what="la liste des barbers" onRetry={emp.retry} />}
        {emp.failed && d.state.appointments.failed && <p className="text-xs text-muted-foreground">—</p>}
        {!emp.failed && <p className="text-xs text-muted-foreground">…</p>}
      </Section>
    );
  }

  // Colonne des noms : 4,5 rem tiennent « Romain » ; un mot plus long l'élargit (la grille défile
  // alors dans le bloc dès 375 px) plutôt que de le couper au milieu
  const longestWord = Math.max(0, ...barbers.flatMap((b) => String(b.name || '').split(/[\s-]+/).map((w) => w.length)));
  const wideNames = longestWord > 6;

  // Jours du mois en cours : lecture du mois ; jours du mois suivant : lecture à part
  const sourceOf = (key) => (key.startsWith(monthKey) ? d.state.appointments : d.state.nextDays);
  const timeOffsLoading = d.state.timeOffs.loading;
  const canAgenda = d.access.canAgenda;

  // Heures libres de la semaine, aujourd'hui à partir de maintenant (cases lues seulement ; « … » / « — »
  // si une case manque)
  let freeMin = 0;
  let pending = false;
  let missing = false;
  for (const b of barbers) {
    for (const cell of b.cells) {
      if (cell.state !== 'ok') continue;
      const kind = kindOf(cell, sourceOf(cell.key), timeOffsLoading);
      if (kind === 'failed') missing = true;
      else if (kind === 'loading') pending = true;
      else freeMin += Math.max(0, Number(cell.free) || 0);
    }
  }
  const freeTotal = missing ? '—' : pending ? '…' : freeMin > 0 ? formatDuration(freeMin) : 'complet';
  const nextFailed = d.state.nextDays.failed && !d.state.appointments.failed && days.some((day) => !day.key.startsWith(monthKey));

  return (
    <Section title="Remplissage des 7 prochains jours" icon={CalendarDays} hint="Part des heures de travail déjà réservée, en % (pauses et privatisations déduites)">
      <div className="relative">
        {/* `relative` : les textes pour lecteur d'écran (`sr-only`, en position absolue) restent dans la
            zone qui défile, sinon ceux des derniers jours élargissaient la page à 320 px */}
        <div ref={scrollRef} className="relative overflow-x-auto overscroll-x-contain">
          <table className={`w-full table-fixed ${wideNames ? 'min-w-[21rem]' : 'min-w-[19.75rem]'}`}>
            <caption className="sr-only">Part des heures de travail réservée, par barber et par jour</caption>
            <thead>
              <tr>
                <th scope="col" className={`sticky left-0 z-10 bg-card p-0.5 pr-2 text-left ${wideNames ? 'w-[5.75rem] sm:w-28' : 'w-[4.5rem]'}`}>
                  <span className="sr-only">Barber</span>
                </th>
                {days.map((day) => (
                  <th key={day.key} scope="col" className="px-px pb-1 text-center font-normal">
                    <span aria-hidden="true" className={`block text-[11px] leading-tight ${day.isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                      {day.isToday ? 'Auj.' : format(noonOf(day.key), 'EEE', { locale: fr })}
                    </span>
                    <span aria-hidden="true" className={`block text-xs font-semibold leading-tight tabular-nums ${day.isToday ? 'text-primary' : 'text-foreground'}`}>
                      {Number(day.key.slice(8, 10))}
                    </span>
                    <span className="sr-only">{day.isToday ? `Aujourd'hui, ${longDate(day.key)}` : longDate(day.key)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {barbers.map((b) => (
                <tr key={b.id}>
                  <th scope="row" className="sticky left-0 z-10 bg-card p-0.5 pr-2 text-left font-normal">
                    <span className="flex min-w-0 items-center gap-1.5" title={b.name}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} aria-hidden="true" />
                      {/* Retour à la ligne après une espace ou un trait d'union seulement ; un mot trop long
                          finit en « … » (le texte reste entier pour les lecteurs d'écran) */}
                      <span className="block min-w-0 overflow-hidden text-ellipsis break-normal text-xs font-semibold leading-tight text-foreground">{b.name}</span>
                    </span>
                  </th>
                  {b.cells.map((cell, i) => {
                    const day = days[i] || { key: cell.key, isToday: false };
                    const kind = kindOf(cell, sourceOf(cell.key), timeOffsLoading);
                    const to = canAgenda ? `/admin/agenda?view=day&date=${cell.key}&barber=${encodeURIComponent(b.id)}` : null;
                    return (
                      <td key={cell.key} className="px-px py-0.5">
                        <Cell cell={cell} kind={kind} label={labelOf(kind, cell, b.name, cell.key, day.isToday)} to={to} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Fondu à droite : il reste des jours à voir en faisant glisser */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent transition-opacity motion-reduce:transition-none ${scroll.more ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>

      {scroll.scrollable && (
        <p className="mt-1 text-[11px] text-muted-foreground">Faites glisser la grille pour voir toute la semaine.</p>
      )}

      {/* Légende */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="tabular-nums">0</span>
          <span className="flex overflow-hidden rounded" aria-hidden="true">
            {[0, 25, 50, 75, 100].map((p) => <span key={p} className="h-3 w-3" style={fillBg(p)} />)}
          </span>
          <span className="tabular-nums">{'100\u00a0% réservé'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-4 rounded border ${LOW_BOX}`} style={fillBg(20)} aria-hidden="true" />
          moins de {LOW_PCT}{'\u00a0'}%
        </span>
        <span>— repos</span>
        <span className={`rounded px-1 py-px ${GREY_CELL}`}>Congé</span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`rounded px-1 py-px ${GREY_CELL}`}>Privé</span>
          salon privatisé
        </span>
      </div>

      {d.state.timeOffs.failed && (
        <Note className="mt-2">Congés non lus : un jour de congé peut apparaître libre.</Note>
      )}
      {nextFailed && (
        <Note className="mt-2">Rendez-vous du mois prochain non lus : ces jours affichent « — ».</Note>
      )}

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <span className="min-w-0 text-xs text-muted-foreground">
          Heures libres sur les 7 jours, tous barbers
          <span className="block text-[11px]">à partir de maintenant</span>
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{freeTotal}</span>
      </div>
    </Section>
  );
}
