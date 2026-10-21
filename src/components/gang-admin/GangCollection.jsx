/**
 * Admin « Cartes Gang » : la collection, toutes les cartes des clients sur une page
 * (`GET /gang-card/admin/cards`). Recherche (nom, email, téléphone), filtre par niveau ou
 * « à relancer », tri ; un tap sur une carte ouvre la fiche du client (GangClientSheet).
 * Cartes en vignette (ni animation ni ornements qui dépassent), 48 affichées puis « Afficher plus ».
 */
import React, { useMemo, useState, useDeferredValue } from 'react';
import { Search, X, IdCard } from 'lucide-react';
import GangCard from '@/components/gang/GangCard';
import { GANG_TIER_ORDER, GANG_BADGE_INFO } from '@/lib/gangCardApi';
import { tierPalette, plural } from './gangAdminUi';

const PAGE = 48;
const MINI = 0.46; // sous 0,5 : vignette (pas d'arrivée, pas de gyroscope, pas d'ornements qui dépassent)
const FADING_MIN_VISITS = 3;
const FADING_DAYS = 35;

const SORTS = [
  { key: 'tier', label: 'Niveau' },
  { key: 'visits', label: 'Visites' },
  { key: 'recent', label: 'Venus récemment' },
  { key: 'fading', label: 'Fraîcheur la plus basse' },
  { key: 'score', label: 'Note' },
  { key: 'name', label: 'Nom' },
  { key: 'serial', label: 'Numéro de carte' },
];

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tierRank = (t) => GANG_TIER_ORDER.indexOf(t);
const isFading = (e) => (e.card?.visits || 0) >= FADING_MIN_VISITS && (e.card?.days_since_last || 0) >= FADING_DAYS && !e.upcoming;
const nameOf = (e) => e.full_name || e.card?.name || e.email || '';
// Carte montée par le salon au-dessus de ses visites (niveau choisi dans la fiche du client)
const isChosen = (e) => !!e.min_tier && !!e.tier_auto && !!e.card?.tier && e.card.tier !== e.tier_auto;

function lastVisitLabel(days) {
  const d = Number(days);
  if (!Number.isFinite(d)) return null;
  if (d === 0) return 'venu aujourd’hui';
  if (d < 14) return `il y a ${d} j`;
  const w = Math.floor(d / 7);
  return `il y a ${w} sem.`;
}

function compare(sort) {
  return (a, b) => {
    const ca = a.card || {};
    const cb = b.card || {};
    switch (sort) {
      case 'visits': return (cb.visits || 0) - (ca.visits || 0) || tierRank(cb.tier) - tierRank(ca.tier);
      case 'recent': return (ca.days_since_last ?? 1e9) - (cb.days_since_last ?? 1e9);
      case 'fading': return (ca.stats?.FRA ?? 99) - (cb.stats?.FRA ?? 99) || (cb.visits || 0) - (ca.visits || 0);
      case 'score': return (cb.score || 0) - (ca.score || 0);
      case 'name': return fold(nameOf(a)).localeCompare(fold(nameOf(b)), 'fr');
      case 'serial': return (ca.serial ?? 1e9) - (cb.serial ?? 1e9);
      default: return tierRank(cb.tier) - tierRank(ca.tier) || (cb.visits || 0) - (ca.visits || 0) || (cb.score || 0) - (ca.score || 0);
    }
  };
}

function Tile({ entry, onOpen }) {
  const c = entry.card || {};
  const fresh = Number(c.stats?.FRA);
  const fading = isFading(entry);
  const badges = (entry.badges_unlocked || []).map((k) => GANG_BADGE_INFO[k]?.emoji).filter(Boolean);
  const chosen = isChosen(entry);
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className="group w-full h-full flex flex-col items-center gap-2 rounded-2xl border border-transparent p-2 pt-3 text-center transition-colors hover:border-border hover:bg-card focus-visible:border-primary focus-visible:outline-none"
        aria-label={`${nameOf(entry)} : ${c.tier_label || ''}${chosen ? ' (niveau choisi par le salon)' : ''}, ${c.visits || 0} visites. Ouvrir la fiche`}
      >
        <span className="pointer-events-none transition-transform group-hover:-translate-y-0.5">
          <GangCard card={c} size={MINI} flippable={false} interactive={false} />
        </span>
        <span className="w-full min-w-0">
          <span className="block text-[13px] font-semibold text-foreground truncate">{nameOf(entry)}</span>
          <span className="block text-[11px] text-muted-foreground truncate">
            {c.visits || 0} {plural(c.visits, 'visite', 'visites')}
            {lastVisitLabel(c.days_since_last) ? ` · ${lastVisitLabel(c.days_since_last)}` : ''}
          </span>
          <span className="mt-1 flex items-center justify-center gap-1 min-h-[18px]">
            {chosen && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300" title="Niveau choisi par le salon">
                Choisi
              </span>
            )}
            {fading && (
              <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-300">
                {Number.isFinite(fresh) ? `FRA ${fresh}` : 'À relancer'}
              </span>
            )}
            {entry.upcoming && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">RDV prévu</span>
            )}
            {badges.length > 0 && (
              <span className="text-[11px] leading-none tracking-tight" aria-hidden="true" style={{ fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif' }}>
                {badges.slice(0, 4).join('')}{badges.length > 4 ? '+' : ''}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function GangCollection({ cards, onOpen }) {
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState('all');
  const [sort, setSort] = useState('tier');
  const [limit, setLimit] = useState(PAGE);
  const deferred = useDeferredValue(query);

  const all = Array.isArray(cards) ? cards : [];
  const counts = useMemo(() => {
    const out = Object.fromEntries(GANG_TIER_ORDER.map((t) => [t, 0]));
    let fading = 0;
    for (const e of all) {
      if (e.card?.tier in out) out[e.card.tier]++;
      if (isFading(e)) fading++;
    }
    return { ...out, fading };
  }, [all]);

  const list = useMemo(() => {
    const q = fold(deferred.trim());
    const digits = deferred.replace(/\D/g, '');
    return all
      .filter((e) => (tier === 'all' ? true : tier === 'fading' ? isFading(e) : e.card?.tier === tier))
      .filter((e) => {
        if (!q) return true;
        if (fold(`${e.full_name || ''} ${e.card?.name || ''} ${e.email || ''}`).includes(q)) return true;
        return digits.length >= 3 && String(e.phone || '').replace(/\D/g, '').includes(digits);
      })
      .sort(compare(sort));
  }, [all, deferred, tier, sort]);

  const chips = [
    { key: 'all', label: 'Toutes', n: all.length },
    ...GANG_TIER_ORDER.filter((t) => counts[t] > 0).map((t) => ({ key: t, label: tierPalette(t).short || tierPalette(t).label, n: counts[t], tier: t })),
    ...(counts.fading > 0 ? [{ key: 'fading', label: 'À relancer', n: counts.fading }] : []),
  ];
  const shown = list.slice(0, limit);

  return (
    <section className="min-w-0">
      {/* Barre d'outils, collée en haut pendant le défilement */}
      <div className="sticky top-14 lg:top-0 z-10 -mx-1 px-1 pb-3 pt-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 space-y-2.5">
        <div className="flex flex-col min-[520px]:flex-row gap-2">
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Rechercher un client</span>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              id="gang-collection-search"
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
              placeholder="Nom, email ou téléphone"
              className="w-full h-10 rounded-xl border border-border bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <span className="shrink-0">Trier par</span>
            <select
              id="gang-collection-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-10 min-w-0 flex-1 min-[520px]:flex-none rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:border-primary/60"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer par niveau">
          {chips.map((c) => {
            const active = tier === c.key;
            const p = c.tier ? tierPalette(c.tier) : null;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => { setTier(c.key); setLimit(PAGE); }}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {p && <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.gem }} aria-hidden="true" />}
                {c.label}
                <span className={`tabular-nums ${active ? 'opacity-80' : 'opacity-60'}`}>{c.n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <IdCard className="w-7 h-7 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">{all.length === 0 ? 'Aucune carte pour l’instant' : 'Aucun client ne correspond'}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {all.length === 0 ? 'Un client reçoit sa carte après sa première visite terminée.' : 'Changez la recherche ou le filtre.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground mb-2">
            {list.length} {plural(list.length, 'carte', 'cartes')}{tier !== 'all' || query ? ` sur ${all.length}` : ''} · touchez une carte pour ouvrir la fiche du client
          </p>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-2 gap-y-3">
            {shown.map((e) => <Tile key={e.user_id || e.email} entry={e} onOpen={onOpen} />)}
          </ul>
          {list.length > limit && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="h-10 px-5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-secondary">
                Afficher plus ({list.length - limit})
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
