import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Scissors, Star, WifiOff } from 'lucide-react';
import { STADIUM_URL } from '@/lib/coupe/stadiumImage';
import coupeLogoUrl from '@/assets/coupe/logo-coupe.webp';
import { COUPE_COLORS } from '../palette';
import { HERO_BUTTON } from '../hub/CoupeShell';
import { COUPE_VARS, alpha } from '../hub/theme';
import { ROLE_BARBER, ROLE_SALON } from '../hub/coupeFormat';
import { msOf, pawnText, playerName } from './tournoiFormat';

/*
 * Briques des écrans d'un tournoi de La Coupe du Gang (planche validée le 3 nov. 2026, écrans 2 à 9),
 * thème stade : noir, rouge pour les boutons et ta ligne, blanc pour les autres, or pour le trophée.
 *  - `TournamentShell` : plein écran sombre, colonne de 560 px, barre du haut (retour, titre, action) ;
 *    `hero` : le haut du stade et le logo de la Coupe (écran 2) ;
 *  - `TPawn` : pion à initiales (rouge pour toi, blanc pour les autres, « DHB » pour le salon) ;
 *  - `PlayerLabel` : nom (« Toi »), ciseaux d'un barber, étoile bleue du salon ;
 *  - `LivePill`, boutons (`BTN_RED`, `BTN_OUTLINE`, `LINK_QUIET`), `useServerClock` ;
 *  - `OfflineBanner` : connexion perdue avec un tableau déjà affiché (`offline` du cadre) ;
 *  - `FitTitle` : grand titre réduit à la taille de son plus long mot (jamais coupé ni débordant).
 */
export { coupeLogoUrl };

const NOIR = COUPE_COLORS.noir;

/** Bouton rouge plein (S'inscrire, Je suis là, Jouer mon match). */
export const BTN_RED = 'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[color:var(--coupe-rouge)] px-4 font-fut text-xl font-extrabold uppercase leading-none tracking-[0.06em] text-white shadow-[0_8px_24px_rgba(224,31,38,.35)] transition-transform motion-safe:active:scale-[.98] disabled:opacity-55 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
/** Bouton bordé de blanc (Voir le tableau, Me désinscrire). */
export const BTN_OUTLINE = 'flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border border-white/20 px-4 font-fut text-lg font-extrabold uppercase leading-none tracking-[0.06em] text-white hover:bg-white/6 disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
/** Lien discret en texte (« Me désinscrire ») : gris souligné, zone de toucher de 44 px. */
export const LINK_QUIET = 'inline-flex min-h-[44px] items-center justify-center gap-1.5 self-center px-3 text-sm font-semibold text-[color:var(--coupe-gris)] underline decoration-white/25 underline-offset-4 hover:text-white disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
/** Titre ou libellé d'en-tête sur deux lignes au plus, sans couper un mot (sauf un mot plus long que la ligne). */
export const TWO_LINES = 'line-clamp-2 [overflow-wrap:break-word]';
/** Libellé or en capitales (« Prochain tournoi »). */
export const LABEL = 'font-fut text-[13px] font-bold uppercase leading-none tracking-[0.14em] text-[color:var(--coupe-or)]';
/** Carte noire bordée. */
export const CARD = 'rounded-2xl border border-white/8 bg-[color:var(--coupe-noir2)]';

/**
 * Heure du serveur (ms), relue toutes les `tickMs` : `server_now` de la dernière réponse plus le
 * temps écoulé depuis son arrivée (`receivedAt`, `dataUpdatedAt` de React Query).
 */
export function useServerClock(serverNow, receivedAt, tickMs = 1000) {
  const offset = useMemo(() => {
    const s = msOf(serverNow);
    return s != null && receivedAt ? s - receivedAt : 0;
  }, [serverNow, receivedAt]);
  const [clock, setClock] = useState(() => ({ offset, now: Date.now() + offset }));
  useEffect(() => {
    setClock({ offset, now: Date.now() + offset });
    const id = setInterval(() => setClock({ offset, now: Date.now() + offset }), tickMs);
    return () => clearInterval(id);
  }, [offset, tickMs]);
  // Nouvelle réponse du serveur : l'heure corrigée dès ce rendu (jamais un rendu à l'heure du
  // téléphone seule, qui ferait passer un match « jouable » une fraction de seconde)
  return clock.offset === offset ? clock.now : Date.now() + offset;
}

/**
 * Grand titre en capitales (nom du tournoi) : à sa taille de classe, réduit juste ce qu'il faut pour
 * que son plus long mot tienne sur une ligne (jamais un mot coupé, rien ne déborde, même à 320 px
 * ou avant le chargement de la police) ; remesuré quand la fenêtre change ou que la police arrive.
 */
export function FitTitle({ as: Tag = 'h1', className = '', min = 18, children, ...rest }) {
  const ref = useRef(null);
  const text = typeof children === 'string' ? children : '';
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.fontSize = '';
      for (let i = 0; i < 4 && el.scrollWidth > el.clientWidth + 0.5; i += 1) {
        const size = parseFloat(getComputedStyle(el).fontSize) || 0;
        const next = Math.max(min, Math.floor(size * (el.clientWidth / el.scrollWidth)));
        if (next >= size) break;
        el.style.fontSize = `${next}px`;
      }
    };
    fit();
    window.addEventListener('resize', fit);
    let alive = true;
    document.fonts?.ready?.then(() => { if (alive) fit(); }).catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener('resize', fit);
    };
  }, [text, min]);
  return <Tag ref={ref} className={`w-full [overflow-wrap:normal] ${className}`} {...rest}>{children}</Tag>;
}

/** Connexion perdue avec des données déjà affichées : elles sont figées, la page réessaie seule. */
export function OfflineBanner() {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-2xl border border-[color:var(--coupe-rouge-trait)] bg-[color:var(--coupe-rouge-fond)] px-3.5 py-3">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--coupe-rouge-vif)]" aria-hidden="true" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-bold">Connexion perdue, on réessaie…</span>
        <span className="text-xs leading-snug text-[color:var(--coupe-gris-clair)]">Scores et comptes à rebours figés en attendant le réseau.</span>
      </span>
    </div>
  );
}

/** Fond du document accordé à la page pendant qu'elle est ouverte (rebond du défilement sur iPhone). */
function useDarkBody() {
  useEffect(() => {
    const body = document.body;
    const previous = body.style.backgroundColor;
    body.style.backgroundColor = NOIR;
    return () => { body.style.backgroundColor = previous; };
  }, []);
}

/** Haut du stade et logo de la Coupe (écran 2) ; décoratif. */
function StadiumHero() {
  const imgRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {!failed && (
        <img
          ref={imgRef}
          src={STADIUM_URL}
          alt=""
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute left-0 top-0 block h-auto w-full max-w-none -translate-y-[2%] transition-opacity duration-500 motion-reduce:transition-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${alpha(NOIR, 0.05)} 0%, ${alpha(NOIR, 0.5)} 60%, ${NOIR} 100%)` }} />
      {/* Écran plus large que la colonne : bords fondus dans le noir, jamais de bord net */}
      <div data-fondu-bords className="absolute inset-0 hidden min-[561px]:block" style={{ background: `linear-gradient(90deg, ${NOIR} 0%, ${alpha(NOIR, 0)} 14%, ${alpha(NOIR, 0)} 86%, ${NOIR} 100%)` }} />
    </div>
  );
}

/**
 * Cadre d'un écran de tournoi. `title` (h1, facultatif : l'écran peut poser le sien), `label`
 * (au-dessus du titre), `action` (bouton rond à droite), `hero` (stade et logo, écran 2),
 * `offline` (connexion perdue : bandeau en tête), `musicButton` (faux : page sans le bouton musique
 * global, comme « Regarder » : l'en-tête reprend la place qu'il lui gardait à droite).
 */
export function TournamentShell({ onBack, label = null, title = null, titleId, action = null, hero = false, offline = false, musicButton = true, children, footer = null }) {
  useDarkBody();
  const right = musicButton ? 'pr-12' : 'pr-3';
  return (
    <div className="min-h-[100dvh] overflow-x-clip font-inter text-white" style={{ ...COUPE_VARS, background: NOIR }}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col">
        {hero ? (
          <header className={`relative flex h-[210px] shrink-0 items-start justify-between overflow-hidden pl-3 ${right} pt-3`}>
            <StadiumHero />
            <button type="button" onClick={onBack} aria-label="Retour" className={`${HERO_BUTTON} relative text-white`}>
              <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
            </button>
            <img
              src={coupeLogoUrl}
              alt=""
              aria-hidden="true"
              decoding="async"
              className="relative mt-6 h-[150px] w-[150px] object-contain"
              style={{ filter: 'drop-shadow(0 10px 24px rgba(0,0,0,.7))' }}
            />
            <span className="relative">{action || <span className="block h-11 w-11" />}</span>
          </header>
        ) : (
          // Écran étroit (320 px) : l'action (« En direct ») passe sous le titre plutôt que de le couper
          <header className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 pl-3 ${right} pt-3`}>
            <button type="button" onClick={onBack} aria-label="Retour" className={`${HERO_BUTTON} border border-white/[.18] text-white`}>
              <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
            </button>
            {(label || title) && (
              <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                {label && <span className={`${LABEL} ${TWO_LINES}`}>{label}</span>}
                {title && <h1 id={titleId} className={`${TWO_LINES} text-[17px] font-bold leading-tight`}>{title}</h1>}
              </div>
            )}
            {action && <span className="ml-auto flex shrink-0">{action}</span>}
          </header>
        )}
        <main className="flex flex-1 flex-col px-4 pb-6 pt-3">
          {offline && <div className="mb-3"><OfflineBanner /></div>}
          {children}
        </main>
        {footer}
      </div>
    </div>
  );
}

const RED_PAWN = `radial-gradient(circle at 35% 30%, #ff5a60, ${COUPE_COLORS.rouge} 55%, ${COUPE_COLORS.rougeSombre})`;
const WHITE_PAWN = `radial-gradient(circle at 35% 30%, #fff, #eceef0 55%, #b9bbc0)`;

/** Pion à initiales : rouge pour toi, blanc pour les autres, pointillés pour une place vide. */
export function TPawn({ player, size = 30, empty = false, ring = null, dim = false, className = '' }) {
  if (empty) {
    return <span className={`block shrink-0 rounded-full border-[1.5px] border-dashed border-white/[.22] ${className}`} style={{ width: size, height: size }} aria-hidden="true" />;
  }
  const mine = !!player?.me;
  const text = pawnText(player);
  const fontSize = Math.round(size * (text.length > 2 ? 0.3 : 0.42));
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-fut font-extrabold leading-none ${dim ? 'opacity-50' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize,
        background: mine ? RED_PAWN : WHITE_PAWN,
        color: mine ? COUPE_COLORS.blanc : NOIR,
        boxShadow: ring ? `0 0 0 3px ${ring}` : undefined,
      }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

/** Ciseaux d'un barber, étoile bleue du salon (marques lues par les lecteurs d'écran). */
export function RoleBadge({ role, size = 13 }) {
  if (role === ROLE_BARBER) {
    return <Scissors role="img" aria-label="Barber" className="inline-block shrink-0 align-[-1px] text-[color:var(--coupe-gris)]" style={{ width: size, height: size }} />;
  }
  if (role === ROLE_SALON) {
    return <Star role="img" aria-label="Le salon" className="inline-block shrink-0 align-[-1px]" style={{ width: size, height: size, color: COUPE_COLORS.etoile, fill: COUPE_COLORS.etoile }} />;
  }
  return null;
}

/** Nom d'un joueur et sa marque (« Toi », « Kevin ✂ », « D'Home Barber ★ »). */
export function PlayerLabel({ player, exempt = 'Exempt', className = '' }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span className="truncate">{playerName(player, { exempt })}</span>
      {player && <RoleBadge role={player.role} />}
    </span>
  );
}

/** Pastille rouge « En direct » (point qui pulse, coupé par « réduire les animations »). */
export function LivePill({ children = 'En direct', className = '' }) {
  return (
    <span className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border border-[rgba(255,61,68,.4)] bg-[rgba(224,31,38,.16)] px-2.5 text-xs font-bold text-[color:var(--coupe-rouge-vif)] ${className}`}>
      <span className="h-[7px] w-[7px] rounded-full bg-[color:var(--coupe-rouge-vif)] motion-safe:animate-pulse" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Point rouge et texte en ligne (« En direct · 3 – 2 »). */
export function LiveDot({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[color:var(--coupe-rouge-vif)]">
      <span className="h-[7px] w-[7px] rounded-full bg-[color:var(--coupe-rouge-vif)] motion-safe:animate-pulse" aria-hidden="true" />
      {children}
    </span>
  );
}
