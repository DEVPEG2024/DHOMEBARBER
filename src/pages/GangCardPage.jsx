import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Share2, Loader2, Lock, CalendarPlus, Droplets, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import LoadError from '@/components/shared/LoadError';
import GangCard, { GangCardPlaceholder } from '@/components/gang/GangCard';
import { gangPalette } from '@/components/gang/gangTheme';
import { gangFxHint } from '@/components/gang/GangFx';
import GangLeaderboard from '@/components/gang/GangLeaderboard';
import { useGangStoryShare } from '@/components/gang/GangLevelUp';
import { GangBadgeGrid } from '@/components/gang/GangBadges';
import {
  useGangCard, setGangLeaderboardOptIn, useInvalidateGang, GANG_TIER_ORDER, GANG_SEASONS, gangSeasonUntil,
} from '@/lib/gangCardApi';
import { hapticFeedback } from '@/lib/capacitor';

/**
 * « Ta carte Gang » (/gang-card) : la carte de collection du client, qui monte de niveau avec
 * ses visites. Aucun avantage n'est lié aux niveaux (choix du salon) : c'est une carte à
 * collectionner et à partager.
 */

// Les six stats de la carte, dans l'ordre du recto
const STATS = [
  { key: 'FID', abbr: 'FID', name: 'Fidélité', text: 'Ton nombre de visites et ton ancienneté au salon.' },
  { key: 'REG', abbr: 'RÉG', name: 'Régularité', text: 'Tu reviens à un rythme régulier ?' },
  { key: 'PON', abbr: 'PON', name: 'Ponctualité', text: 'Ni absence ni annulation de dernière minute.' },
  { key: 'STY', abbr: 'STY', name: 'Style', text: 'Variété et prestations soignées : barbe, rasoir, serviette chaude.' },
  { key: 'GNG', abbr: 'GNG', name: 'Gang', text: 'Avis, publications dans le fil, événements du salon.' },
  { key: 'FRA', abbr: 'FRA', name: 'Fraîcheur', text: 'Baisse chaque jour depuis ta dernière coupe : elle passe en rouge quand il est temps de revenir.' },
];

// Seuils de visites des niveaux, copie de lib/gangCard.js côté serveur (l'Icône demande en plus
// 3 ans au salon : elle n'est atteinte que si la carte l'est)
const TIER_MIN = { bronze: 1, argent: 4, or: 9, orrare: 18, tots: 36 };
const DEFAULT_TIERS = [
  { key: 'bronze', label: 'Bronze', rule: '1 à 3 visites' },
  { key: 'argent', label: 'Argent', rule: '4 à 8 visites' },
  { key: 'or', label: 'Or', rule: '9 à 17 visites' },
  { key: 'orrare', label: 'Or holo', rule: '18 à 35 visites' },
  { key: 'tots', label: 'Team of the Season', rule: '36 visites et plus' },
  { key: 'icone', label: 'Icône', rule: '3 ans au salon et 18 visites' },
];

const FRESHNESS_LOW = 50;
const MINI = 0.36; // petites cartes de la collection : 108 × 158 px

const plural = (n, one, many) => (n === 1 ? one : many);

function tierReached(key, card) {
  if (!card) return false;
  if (key === card.tier) return true;
  if (key === 'icone') return false;
  return Number(card.visits) >= (TIER_MIN[key] ?? Infinity);
}

/** Mois restants avant les 3 ans au salon (Icône), ou null si inconnu / déjà passé */
function monthsToIcon(card) {
  if (!card?.first_visit || card.tier === 'icone') return null;
  const [y, m, d] = String(card.first_visit).split('-').map(Number);
  if (!y || !m) return null;
  const target = new Date(y + 3, m - 1, d || 1);
  const now = new Date();
  const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
    + (target.getDate() > now.getDate() ? 1 : 0);
  return months > 0 ? months : null;
}

/** Échelle de la grande carte : la largeur de l'écran moins les marges, jamais plus de 1 */
function useCardSize() {
  const compute = () => {
    if (typeof window === 'undefined') return 0.9;
    return Math.max(0.6, Math.min(1, (Math.min(window.innerWidth, 512) - 80) / 300));
  };
  const [size, setSize] = useState(compute);
  useEffect(() => {
    const onResize = () => setSize(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function SectionTitle({ children, id }) {
  return <h2 id={id} className="font-fut text-xl font-extrabold uppercase tracking-wide text-foreground leading-none mb-3">{children}</h2>;
}

export default function GangCardPage() {
  const reduceMotion = useReducedMotion();
  const size = useCardSize();
  const query = useGangCard();
  const invalidateGang = useInvalidateGang();
  const { data, isPending, isError, error, refetch, isFetching } = query;
  const card = data?.card || null;
  const { share, busy: sharing, dialog: shareDialog } = useGangStoryShare(card);
  const palette = card ? gangPalette(card) || {} : {};
  // Édition de saison (Halloween, Noël…) : libellé connu ici même si la palette n'existe pas encore
  const season = card?.edition ? GANG_SEASONS[card.edition] || null : null;
  const seasonUntil = season ? gangSeasonUntil(card.edition) : null;
  const editionLabel = season?.label || palette.label;
  const badges = Array.isArray(card?.badges) ? card.badges : [];
  const unlockedBadges = badges.filter((b) => b?.unlocked).length;

  // Interrupteur du classement : affiché tout de suite, rétabli si le serveur refuse
  const [optIn, setOptIn] = useState(null);
  const [savingOptIn, setSavingOptIn] = useState(false);
  const optInValue = optIn ?? !!data?.leaderboard_opt_in;
  const toggleOptIn = async (next) => {
    setOptIn(next);
    setSavingOptIn(true);
    hapticFeedback();
    try {
      await setGangLeaderboardOptIn(next);
      toast.success(next ? 'Tu peux apparaître dans la Team of the Season 🏆' : 'Tu n’apparais plus dans le classement');
      invalidateGang();
    } catch (err) {
      setOptIn(!next);
      toast.error(err?.data?.error || 'Impossible d’enregistrer ton choix. Réessaie.');
    } finally {
      setSavingOptIn(false);
    }
  };
  // Après rechargement, la valeur du serveur reprend la main
  useEffect(() => { if (!isFetching) setOptIn(null); }, [isFetching, data?.leaderboard_opt_in]);

  const tiers = (Array.isArray(data?.tiers) && data.tiers.length ? data.tiers : DEFAULT_TIERS)
    .filter((t) => GANG_TIER_ORDER.includes(t.key));

  const fade = (delay = 0) => (reduceMotion
    ? { initial: false, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay } });

  const freshness = Number(card?.stats?.FRA);
  const lowFreshness = card && Number.isFinite(freshness) && freshness < FRESHNESS_LOW;
  const iconMonths = card && Number(card.visits) >= 18 ? monthsToIcon(card) : null;

  return (
    <div className="min-h-screen relative">
      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        <motion.div {...fade()} className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold mb-1">Le Gang</p>
          <h1 className="font-display text-3xl font-bold text-foreground">Ta carte Gang</h1>
          <div className="h-0.5 w-12 mt-2 rounded-full bg-gradient-to-r from-primary to-primary/30" />
        </motion.div>

        {isPending && (
          <div className="flex flex-col items-center" aria-busy="true">
            <div className="rounded-3xl bg-secondary animate-pulse" style={{ width: 300 * size, height: 440 * size }} />
          </div>
        )}

        {!isPending && isError && !data && (
          <LoadError what="ta carte Gang" error={error} onRetry={refetch} retrying={isFetching} />
        )}

        {/* Pas encore de visite : carte en attente */}
        {!isPending && data && !card && (
          <motion.div {...fade(0.05)} className="flex flex-col items-center text-center">
            <GangCardPlaceholder size={size} text="Ta carte Gang arrive bientôt" />
            <p className="mt-6 text-sm font-semibold text-foreground">Ta carte arrive après ta première visite au salon</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              Elle change de couleur avec tes visites : Bronze, Argent, Or… jusqu’à Icône.
            </p>
            <Link
              to="/booking"
              className="mt-5 h-12 px-6 inline-flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground text-sm font-bold"
            >
              <CalendarPlus className="w-4 h-4" aria-hidden="true" /> Réserver
            </Link>
          </motion.div>
        )}

        {card && (
          <>
            {/* La carte */}
            <motion.div {...fade(0.05)} className="flex flex-col items-center">
              <span
                className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{
                  color: palette.accent,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${/^#[0-9a-f]{6}$/i.test(palette.accent || '') ? `${palette.accent}55` : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                {card.edition ? `Édition limitée · ${editionLabel}` : (palette.label || card.tier_label)}
              </span>
              {season && seasonUntil && (
                <p className="-mt-1 mb-3 text-[11px] font-semibold text-muted-foreground text-center">
                  Édition {season.label} : jusqu’au {seasonUntil}
                </p>
              )}
              <GangCard card={card} size={size} flippable interactive />
              <p className="mt-3 text-xs text-muted-foreground text-center max-w-xs">{gangFxHint(palette)}</p>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => share(card)}
                disabled={sharing}
                className="mt-4 w-full max-w-xs h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                {sharing ? 'Préparation…' : 'Partager en story'}
              </motion.button>
            </motion.div>

            {/* Fraîcheur basse : il est temps de revenir */}
            {lowFreshness && (
              <motion.div
                {...fade(0.1)}
                role="status"
                className="mt-6 flex items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/8 p-3"
              >
                <span className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                  <Droplets className="w-5 h-5 text-red-400" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Ta carte perd de la fraîcheur</p>
                  <p className="text-[11px] text-muted-foreground">
                    FRA {Math.round(freshness)}
                    {Number.isFinite(Number(card.days_since_last)) && ` · dernière coupe il y a ${card.days_since_last} ${plural(Number(card.days_since_last), 'jour', 'jours')}`}
                  </p>
                </div>
                <Link to="/booking" className="h-10 px-3 inline-flex items-center rounded-xl bg-primary text-primary-foreground text-xs font-bold shrink-0">
                  Réserver
                </Link>
              </motion.div>
            )}

            {/* Progression */}
            <motion.section {...fade(0.12)} aria-labelledby="gang-next" className="mt-8">
              <SectionTitle id="gang-next">Prochain niveau</SectionTitle>
              <div className="rounded-2xl border border-border bg-card/60 p-4">
                {card.next ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {card.next.label} dans {card.next.visits_needed} {plural(card.next.visits_needed, 'visite', 'visites')}
                      </p>
                      <p className="text-[11px] text-muted-foreground shrink-0">
                        {card.visits} {plural(Number(card.visits), 'visite', 'visites')}
                      </p>
                    </div>
                    <div
                      className="mt-3 h-2 rounded-full bg-white/8 overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(Number(card.next.progress) || 0)}
                      aria-label={`Progression vers ${card.next.label}`}
                    >
                      {/* Remplissage en échelle horizontale (transform), pas en largeur */}
                      <motion.div
                        className="h-full w-full origin-left rounded-full"
                        style={{ background: palette.accent || 'hsl(var(--primary))' }}
                        initial={reduceMotion ? false : { scaleX: 0 }}
                        animate={{ scaleX: Math.max(0, Math.min(100, Number(card.next.progress) || 0)) / 100 }}
                        transition={{ duration: 0.9, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-foreground">
                    {card.tier === 'icone' ? 'Niveau maximum : tu es une Icône du salon 👑' : 'Tu as atteint le plus haut niveau de visites 🏆'}
                  </p>
                )}
                {iconMonths && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Icône dans {iconMonths} mois (3 ans au salon et 18 visites)
                  </p>
                )}
              </div>
            </motion.section>

            {/* Les stats */}
            <motion.section {...fade(0.14)} aria-labelledby="gang-stats" className="mt-8">
              <SectionTitle id="gang-stats">Tes stats</SectionTitle>
              <ul className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                {STATS.map((s) => {
                  const value = Number(card.stats?.[s.key]);
                  const low = s.key === 'FRA' && Number.isFinite(value) && value < FRESHNESS_LOW;
                  return (
                    <li key={s.key} className="flex gap-3 rounded-2xl border border-border bg-card/60 p-3 min-w-0">
                      <div className="w-11 shrink-0 text-center">
                        <p className={`font-fut text-2xl font-extrabold leading-none tabular-nums ${low ? 'text-red-400' : 'text-foreground'}`}>
                          {Number.isFinite(value) ? Math.round(value) : '–'}
                        </p>
                        <p className="font-fut text-sm font-bold mt-0.5" style={{ color: palette.accent }}>{s.abbr}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{s.name}</p>
                        <p className="text-[11px] leading-snug text-muted-foreground">{s.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.section>

            {/* Les écussons : liste complète du serveur, verrouillés compris */}
            {badges.length > 0 && (
              <motion.section {...fade(0.15)} aria-labelledby="gang-badges" className="mt-8">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h2 id="gang-badges" className="font-fut text-xl font-extrabold uppercase tracking-wide text-foreground leading-none">
                    Tes écussons
                  </h2>
                  <p className="font-fut text-base font-bold tabular-nums shrink-0" style={{ color: palette.accent }}>
                    {unlockedBadges} / {badges.length}
                    <span className="sr-only"> écussons débloqués</span>
                  </p>
                </div>
                <GangBadgeGrid badges={badges} accent={palette.accent} />
              </motion.section>
            )}
          </>
        )}

        {/* Collection des six niveaux */}
        {data && (
          <motion.section {...fade(0.16)} aria-labelledby="gang-collection" className="mt-8">
            <SectionTitle id="gang-collection">La collection</SectionTitle>
            <p className="-mt-1 mb-3 text-[11px] text-muted-foreground">
              Six cartes, une par étape. Aucun avantage, juste la fierté du Gang.
            </p>
            <ul className="-mx-4 px-4 pt-3 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tiers.map((t) => {
                const reached = tierReached(t.key, card);
                const current = card?.tier === t.key;
                // La carte du client recolorée à chaque niveau (sans édition limitée)
                const sample = card
                  ? { ...card, tier: t.key, tier_label: t.label, edition: null }
                  : { tier: t.key, tier_label: t.label, edition: null, name: 'Gang', stats: {}, visits: 0 };
                return (
                  <li key={t.key} className="snap-start shrink-0 flex flex-col items-center" style={{ width: 300 * MINI }}>
                    <div className={`relative ${current ? 'rounded-2xl ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
                      <div className={reached ? '' : 'grayscale opacity-40'} aria-hidden="true">
                        <GangCard card={sample} size={MINI} flippable={false} interactive={false} />
                      </div>
                      {!reached && (
                        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                          <span className="w-9 h-9 rounded-full bg-black/70 border border-white/15 flex items-center justify-center">
                            <Lock className="w-4 h-4 text-white/80" />
                          </span>
                        </span>
                      )}
                      {current && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground whitespace-nowrap">
                          Ta carte
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-foreground text-center leading-tight flex items-center gap-1">
                      {reached && !current && <Check className="w-3 h-3 text-primary" aria-hidden="true" />}
                      {t.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground text-center leading-tight mt-0.5">
                      <span className="sr-only">{reached ? 'Atteint. ' : 'Pas encore atteint. '}</span>
                      {t.rule}
                    </p>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        )}

        {/* Classement Team of the Season */}
        {data && (
          <motion.section {...fade(0.18)} className="mt-8 space-y-4" aria-label="Classement Team of the Season">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4">
              <div className="flex-1 min-w-0">
                <label htmlFor="gang-optin" className="text-sm font-semibold text-foreground">
                  Apparaître dans la Team of the Season
                </label>
                <p className="text-[11px] leading-snug text-muted-foreground mt-1">
                  Les 5 clients les plus réguliers des 90 derniers jours sont affichés dans le fil. Seuls ceux qui l’acceptent y figurent.
                </p>
              </div>
              <Switch
                id="gang-optin"
                checked={optInValue}
                onCheckedChange={toggleOptIn}
                disabled={savingOptIn}
                className="mt-0.5"
              />
            </div>
            <GangLeaderboard variant="page" />
          </motion.section>
        )}
      </div>
      {shareDialog}
    </div>
  );
}
