/**
 * Demande de devis de privatisation, en plein écran (portail dans `body`, au-dessus de la barre du
 * bas) : Occasion → Date et créneau → Groupe (nombre, envies, message, téléphone, récapitulatif)
 * → écran de succès (`RequestSuccess`).
 *
 * Contrat avec la page (`pages/Events.jsx`) :
 * - reste monté en permanence ; le portail n'existe que pendant l'ouverture (et sa sortie animée) ;
 * - le brouillon survit à la fermeture par la croix ; il n'est remis à zéro qu'après un envoi
 *   réussi, une fois l'écran de succès quitté (ou à la prochaine ouverture si l'envoi a abouti
 *   fenêtre fermée) ;
 * - chaque ouverture (`open` qui passe à vrai, ou `openKey` qui change fenêtre ouverte) part de
 *   l'étape Date avec l'occasion `presetType` si elle est valide, sinon de l'étape Occasion ;
 * - `onViewRequest(id)` est appelé après la fermeture (« Voir ma demande »).
 *
 * Fermeture par la croix, Échap ou le retour d'Android (qui remonte d'abord les étapes) ; jamais au
 * tap à côté. Pendant l'ouverture, le reste de l'app est `inert` (ni clavier ni lecteur d'écran),
 * Tab tourne dans la fenêtre, le focus va au titre de chaque étape puis revient à la page à la
 * fermeture. Erreurs et avertissements dans un bandeau de la fenêtre, jamais en toast : les toasts
 * s'affichent en haut et recouvraient la croix (ils ne servent plus qu'une fois la fenêtre fermée).
 * Barre d'action dans la fenêtre (`booking-bar` : masquée clavier ouvert). Envoi protégé contre le
 * double tap ; une fermeture pendant l'envoi ne l'arrête pas (toast à la réponse).
 */
import React, {
  forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import {
  AlertCircle, ArrowRight, CalendarX, Check, ChevronLeft, Loader2, Minus, Plus, Send, Wallet, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { hapticFeedback } from '@/lib/capacitor';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { isNetworkError } from '@/components/shared/LoadError';
import {
  DEFAULT_SLOT, EVENT_TYPES, GUEST_CHIPS, GUEST_MAX, GUEST_MIN, MESSAGE_MAX, TIME_SLOTS,
  buildRequestPayload, clampGuests, dayState, emptyDraft, eventTypeLabel, eventTypeOf, firstFreeSlot,
  formatEventDate, guestChipLabel, hasIdea, ideasFor, isDateProblem, needsPhone, phoneValid,
  serverMessage, slotLabel, slotOf, slotState, toggleIdea, validateDraft,
} from '@/components/privatisation/privatisationUtils';
import {
  useConfirmedEvents, useCreateRequest, useParisClock, usePublicBarbers,
} from '@/components/privatisation/usePrivatisation';
import MonthCalendar from '@/components/privatisation/MonthCalendar';
import RequestSuccess, {
  REQUEST_SUCCESS_TITLE_ID, RequestSuccessActions,
} from '@/components/privatisation/RequestSuccess';

/** Étapes de la frise (l'écran de succès `done` n'en fait pas partie). */
const STEPS = [
  { id: 'occasion', label: 'Occasion' },
  { id: 'date', label: 'Date' },
  { id: 'group', label: 'Groupe' },
];
/** Délai entre le tap sur une occasion et le passage à la date (le choix se voit). */
const OCCASION_ADVANCE_MS = 150;
/** Vérification des disponibilités signalée au-delà de ce délai (pas de clignotement si rapide). */
const CHECK_SHOW_MS = 400;
/** Vérification des disponibilités plus longue (réseau inutilisable) : « Continuer » se débloque. */
const CHECK_TIMEOUT_MS = 8000;
/** Repli d'une erreur d'envoi sans message lisible (500, réponse vide, erreur imprévue). */
const SEND_FALLBACK = "La demande n'a pas pu être envoyée, réessayez dans un instant.";
/** Titre de l'accroche de la page : reçoit le focus à la fermeture faute de mieux. */
const HERO_TITLE_ID = 'privat-hero-title';
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');
const ease = [0.16, 1, 0.3, 1];

// Étapes qui glissent dans le sens de la navigation (suivant → entre par la droite). L'étape qui
// sort ne reçoit plus aucun tap : invisible mais encore posée au-dessus, elle les capterait.
const stepVariants = {
  enter: ({ dir, reduce }) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? 40 : dir < 0 ? -40 : 0 }),
  center: { opacity: 1, x: 0, pointerEvents: 'auto' },
  exit: ({ dir, reduce }) => (reduce
    ? { opacity: 0, pointerEvents: 'none' }
    : { opacity: 0, x: dir > 0 ? -40 : dir < 0 ? 40 : 0, pointerEvents: 'none' }),
};

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
/** Phrase terminée par un point (les raisons de `validateDraft` n'en ont pas). */
const sentence = (s) => (/[.!?…]$/.test(String(s || '').trim()) ? s : `${s}.`);

/** Créneau libre (un id inconnu ou vide n'en est jamais un : `slotState` le dirait libre). */
const isSlotFree = (slotId, key, index, clock) => !!slotOf(slotId) && slotState(slotId, key, index, clock) === 'free';

/** Occasion changée : l'idée « à l'honneur » de l'ancienne occasion quitte le message. */
function withOccasion(draft, id) {
  if (draft.event_type === id) return draft;
  const honor = eventTypeOf(draft.event_type)?.honorIdea;
  const message = honor && hasIdea(draft.message, honor) ? toggleIdea(draft.message, honor) : draft.message;
  return { ...draft, event_type: id, message };
}

/**
 * Message d'une erreur d'envoi : panne réseau → « Pas de connexion » ; 5xx ou erreur sans réponse
 * du serveur → repli ; 4xx (400, 409 créneau privatisé, 429 quota) → message du serveur.
 */
function sendErrorMessage(err) {
  if (isNetworkError(err)) return 'Pas de connexion internet, réessayez.';
  const status = err?.status ?? err?.response?.status;
  if (typeof status !== 'number' || status >= 500) return SEND_FALLBACK;
  return serverMessage(err, SEND_FALLBACK);
}

/**
 * Focus rendu à la page : à l'élément qui l'avait avant l'ouverture s'il y est toujours, sinon au
 * titre de l'accroche (rendu focalisable), sinon nulle part (page quittée).
 */
function restorePageFocus(previous) {
  const usable = previous && previous !== document.body && previous !== document.documentElement
    && typeof previous.focus === 'function' && document.contains(previous)
    && !previous.closest?.('[data-app-overlay]');
  if (usable) {
    previous.focus({ preventScroll: true });
    if (document.activeElement === previous) return;
  }
  const title = document.getElementById(HERO_TITLE_ID);
  if (!title) return;
  if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
  title.focus({ preventScroll: true });
}

/** Tab / Maj+Tab tournent dans la fenêtre (complète `inert`, absent avant iOS 15.5). */
function keepTabInside(e, box) {
  if (!box) return;
  const items = [...box.querySelectorAll(FOCUSABLE)]
    .filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'));
  const active = document.activeElement;
  if (!items.length) {
    e.preventDefault();
    box.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (!box.contains(active) || active === box) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

// ---------------------------------------------------------------------------------------------
// Éléments communs
// ---------------------------------------------------------------------------------------------

/**
 * `motion.div` rendu `inert` pendant son animation de sortie (étape qui s'en va, fenêtre qui se
 * ferme) : ni focus clavier ni lecture par un lecteur d'écran dans ce qui disparaît. Transmet sa
 * ref (exigé par `AnimatePresence mode="popLayout"`).
 */
const PresenceDiv = forwardRef(function PresenceDiv(props, forwardedRef) {
  const isPresent = useIsPresent();
  const nodeRef = useRef(null);
  const setRef = useCallback((node) => {
    nodeRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  useLayoutEffect(() => {
    nodeRef.current?.toggleAttribute('inert', !isPresent);
  }, [isPresent]);
  return <motion.div ref={setRef} {...props} />;
});

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-card text-foreground transition-colors hover:bg-secondary"
    >
      {children}
    </button>
  );
}

/** Frise « Occasion / Date / Groupe » : faites ✓, en cours à moitié remplie, à venir grises. */
function Progress({ step, reduceMotion }) {
  const current = STEPS.findIndex(s => s.id === step);
  return (
    <ol className="mt-2.5 grid grid-cols-3 gap-1.5" aria-label="Étapes de la demande">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} aria-current={active ? 'step' : undefined}>
            <span className="block h-1 overflow-hidden rounded bg-border" aria-hidden="true">
              <motion.span
                className="block h-full w-full origin-left rounded bg-primary"
                initial={false}
                animate={{ scaleX: done ? 1 : active ? 0.55 : 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease }}
              />
            </span>
            <span className={`mt-1.5 block text-[11px] ${
              done ? 'font-semibold text-primary' : active ? 'font-semibold text-foreground' : 'text-muted-foreground'
            }`}
            >
              {s.label}
              {done && <><span aria-hidden="true"> ✓</span><span className="sr-only"> (faite)</span></>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Barre d'action en bas de la fenêtre (allure de `BookingBar`, dans le flux de la fenêtre). Sous
 * 360 px le bouton perd sa flèche et un peu de marge : titre et sous-titre tiennent sur une ligne.
 */
function ActionBar({ title, subtitle, titleMuted = false, label, onAction, disabled = false, busy = false, icon: Icon = ArrowRight, reduceMotion }) {
  const full = !title;
  return (
    <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
      {title && (
        <div className="min-w-0 flex-1 leading-tight" aria-live="polite">
          <p className={`truncate text-sm font-bold ${titleMuted ? 'text-muted-foreground' : 'text-foreground'}`}>{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <motion.button
        type="button"
        onClick={onAction}
        disabled={disabled}
        aria-busy={busy || undefined}
        whileTap={disabled || reduceMotion ? undefined : { scale: 0.97 }}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold transition-colors duration-300 ${
          full ? 'h-[54px] w-full px-5' : 'h-[50px] px-[22px] max-[359px]:px-4'
        } ${
          disabled
            ? 'cursor-not-allowed bg-secondary text-muted-foreground'
            : 'bg-primary text-primary-foreground shadow-[0_10px_24px_hsl(var(--primary)/0.3)] hover:bg-primary/90'
        }`}
      >
        {busy
          ? <Loader2 className="h-[17px] w-[17px] animate-spin" aria-hidden="true" />
          : (Icon && full && <Icon className="h-[17px] w-[17px]" aria-hidden="true" />)}
        <span className="truncate">{label}</span>
        {!busy && Icon && !full && <Icon className="h-[17px] w-[17px] max-[359px]:hidden" aria-hidden="true" />}
      </motion.button>
    </div>
  );
}

/**
 * Bandeau d'erreur (ou d'avertissement, `tone: 'info'`) au-dessus de la barre d'action : toujours
 * visible quelle que soit la position dans l'étape. Remonté à chaque nouveau message (`key`) :
 * relu par les lecteurs d'écran même quand le texte est le même.
 */
function NoticeBanner({ notice, onDismiss, reduceMotion }) {
  const info = notice.tone === 'info';
  return (
    <motion.div
      role="alert"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease }}
      className={`flex items-start gap-2.5 rounded-2xl border py-2.5 pl-3.5 pr-2.5 ${
        info ? 'border-amber-500/30 bg-amber-500/10' : 'border-destructive/35 bg-destructive/10'
      }`}
    >
      <AlertCircle
        className={`mt-px h-4 w-4 shrink-0 ${info ? 'text-amber-500 dark:text-amber-400' : 'text-destructive'}`}
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground [overflow-wrap:anywhere]">
        {notice.text}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Masquer le message"
        className="-my-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
// Étape Occasion
// ---------------------------------------------------------------------------------------------

function OccasionStep({ headingId, selected, onPick, reduceMotion }) {
  return (
    <div className="pt-4">
      <h1 id={headingId} tabIndex={-1} className="font-display text-2xl font-bold leading-tight text-foreground focus:outline-none">
        Pour quelle occasion ?
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">{"Touchez une carte : le salon adapte son devis à l'occasion."}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {EVENT_TYPES.map((type, i) => {
          const Icon = type.icon;
          const active = selected === type.id;
          return (
            <motion.button
              key={type.id}
              type="button"
              onClick={() => onPick(type.id)}
              aria-pressed={active}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.4, ease }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className={`relative flex min-h-[184px] flex-col overflow-hidden rounded-[20px] border p-3.5 text-left transition-colors ${
                active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/15 text-primary" aria-hidden="true">
                <Icon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              {/* Taille liée à la largeur : « ANNIVERSAIRE » tient sur une ligne dès 320 px */}
              <span className="mt-3.5 font-fut text-[clamp(18px,5.8vw,26px)] font-extrabold uppercase leading-none text-foreground [overflow-wrap:anywhere]">
                {type.label}
              </span>
              <span className="mt-1.5 text-xs leading-snug text-muted-foreground">{type.pitch}</span>
              <span
                className={`absolute right-3 top-3.5 flex h-7 w-7 items-center justify-center rounded-full ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-foreground/6 text-foreground/70'
                }`}
                aria-hidden="true"
              >
                {active ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <ArrowRight className="h-3.5 w-3.5" />}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Étape Date et créneau
// ---------------------------------------------------------------------------------------------

function DateStep({
  headingId, draft, index, clock, checking, unverified, slotsRef, onPickDate, onPickSlot, onEditOccasion,
}) {
  const type = eventTypeOf(draft.event_type);
  const TypeIcon = type?.icon;
  const dayFull = !!draft.date && dayState(draft.date, index, clock) === 'full';

  return (
    <div className="pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-[150px]">
          <h1 id={headingId} tabIndex={-1} className="font-display text-2xl font-bold leading-tight text-foreground focus:outline-none">
            Quelle date ?
          </h1>
          {/* Toujours monté (changements annoncés) et à la place du sous-titre : la vérification qui
              apparaît à chaque ouverture ne décale pas le calendrier sous le doigt */}
          <p
            role="status"
            aria-live="polite"
            className={`mt-0.5 text-xs ${unverified ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
          >
            {checking ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Vérification des disponibilités…
              </span>
            ) : unverified ? (
              <span className="flex items-start gap-1.5">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Disponibilités non vérifiées : le salon confirmera votre date.
              </span>
            ) : 'Les dates déjà privatisées sont barrées.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onEditOccasion}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-primary/15"
        >
          {TypeIcon && <TypeIcon className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} aria-hidden="true" />}
          {type ? type.label : "Choisir l'occasion"}
          {type && <span className="font-medium text-muted-foreground">· Modifier</span>}
        </button>
      </div>

      <div className="mt-3.5">
        <MonthCalendar value={draft.date} onChange={onPickDate} index={index} clock={clock} />
      </div>

      {/* Créneaux du jour choisi (ramenés à l'écran après le choix du jour, voir `revealTick`) */}
      <div ref={slotsRef}>
        {!draft.date ? (
          <p className="mt-5 text-center text-sm text-muted-foreground">Touchez une date pour voir les créneaux.</p>
        ) : dayFull ? (
          <div role="status" className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
            <CalendarX className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="min-w-0 text-sm font-semibold leading-snug text-foreground">
              Ce jour est complet : choisissez une autre date.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Créneau du {lowerFirst(formatEventDate(draft.date, 'day'))}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TIME_SLOTS.map((slot) => {
                const state = slotState(slot.id, draft.date, index, clock);
                const free = state === 'free';
                const active = free && draft.time_slot === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!free}
                    aria-pressed={active}
                    onClick={() => onPickSlot(slot.id)}
                    className={`relative flex min-h-[76px] flex-col items-start gap-1 rounded-2xl text-left transition-colors ${
                      active ? 'border-2 border-primary bg-primary/15 p-[9px]' : 'border border-border bg-card p-2.5'
                    } ${free ? (active ? '' : 'hover:border-primary/40') : 'cursor-not-allowed opacity-60'}`}
                  >
                    <span className={`text-xs ${active ? 'font-bold text-primary' : 'font-semibold text-foreground'}`}>{slot.label}</span>
                    <span className={`font-fut text-[19px] font-bold leading-none ${free ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                      {slot.hours}
                    </span>
                    <span className={`text-[11px] ${active ? 'text-foreground/80' : 'text-muted-foreground'}`}>
                      {state === 'taken' ? 'Déjà privatisé' : state === 'past' ? 'Passé' : slot.shortDuration}
                    </span>
                    {active && (
                      <span
                        className="absolute right-2 top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground max-[349px]:-right-1.5 max-[349px]:-top-1.5"
                        aria-hidden="true"
                      >
                        <Check className="h-[11px] w-[11px]" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Étape Groupe
// ---------------------------------------------------------------------------------------------

function RecapRow({ label, value, muted = false }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 text-right font-semibold [overflow-wrap:anywhere] ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</dd>
    </div>
  );
}

function GroupStep({
  headingId, draft, user, phoneNeeded, phoneError, phoneRef, onGuests, onIdea, onMessage, onPhone, reduceMotion,
}) {
  const baseId = useId();
  const messageId = `${baseId}-message`;
  const counterId = `${baseId}-counter`;
  const phoneId = `${baseId}-phone`;
  const count = clampGuests(draft.guest_count);
  const ideas = ideasFor(draft.event_type);
  const accountPhone = String(user?.phone || '').trim();
  const callbackPhone = accountPhone || String(draft.phone || '').trim();

  return (
    <div className="pt-4">
      <h1 id={headingId} tabIndex={-1} className="font-display text-2xl font-bold leading-tight text-foreground focus:outline-none">
        Votre groupe
      </h1>

      {/* Nombre de personnes */}
      <div className="mt-3 rounded-[20px] border border-border bg-card p-4">
        <p className="text-[13px] font-semibold text-foreground/80">Combien serez-vous ?</p>
        <div className="mt-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onGuests(count - 1)}
            disabled={count <= GUEST_MIN}
            aria-label="Une personne de moins"
            className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-border bg-secondary text-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="h-[22px] w-[22px]" strokeWidth={2.2} aria-hidden="true" />
          </button>
          <div className="text-center" aria-live="polite" aria-atomic="true">
            <motion.p
              key={count}
              initial={reduceMotion ? false : { scale: 0.85, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              className="font-fut text-[52px] font-extrabold leading-none text-foreground"
            >
              {count}
            </motion.p>
            <p className="mt-0.5 text-xs text-muted-foreground">{count > 1 ? 'personnes' : 'personne'}</p>
          </div>
          <button
            type="button"
            onClick={() => onGuests(count + 1)}
            disabled={count >= GUEST_MAX}
            aria-label="Une personne de plus"
            className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-[22px] w-[22px]" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3.5 grid grid-cols-3 gap-1.5 min-[360px]:grid-cols-6" role="group" aria-label="Raccourcis du nombre de personnes">
          {GUEST_CHIPS.map((n) => {
            const pressed = n === GUEST_CHIPS[GUEST_CHIPS.length - 1] ? count >= n : count === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onGuests(n)}
                aria-pressed={pressed}
                aria-label={n === 20 ? '20 personnes ou plus' : `${n} personnes`}
                className={`h-11 rounded-xl border text-[13px] transition-colors ${
                  pressed
                    ? 'border-primary bg-primary/15 font-bold text-foreground'
                    : 'border-border bg-transparent font-semibold text-foreground/80 hover:border-primary/40'
                }`}
              >
                {guestChipLabel(n)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Envies et message */}
      <div className="mt-4">
        <p className="text-[13px] font-semibold text-foreground/80">
          Vos envies <span className="font-normal text-muted-foreground">(facultatif)</span>
        </p>
        <p className="mb-2.5 mt-0.5 text-xs text-muted-foreground">
          {"Un tap ajoute l'idée au message. Le salon y répond dans son devis."}
        </p>
        <div className="flex flex-wrap gap-2">
          {ideas.map((idea) => {
            const on = hasIdea(draft.message, idea);
            return (
              <button
                key={idea}
                type="button"
                onClick={() => onIdea(idea)}
                aria-pressed={on}
                className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${
                  on
                    ? 'border-primary bg-primary/15 font-semibold text-foreground'
                    : 'border-border bg-card font-medium text-foreground/80 hover:border-primary/40'
                }`}
              >
                {on
                  ? <Check className="h-[13px] w-[13px] text-primary" strokeWidth={3} aria-hidden="true" />
                  : <Plus className="h-[13px] w-[13px] text-muted-foreground" strokeWidth={2.4} aria-hidden="true" />}
                {idea}
              </button>
            );
          })}
        </div>
        <label htmlFor={messageId} className="sr-only">Message pour le salon</label>
        <textarea
          id={messageId}
          rows={4}
          value={draft.message}
          maxLength={MESSAGE_MAX}
          onChange={(e) => onMessage(e.target.value)}
          placeholder="Décrivez votre événement, vos envies…"
          aria-describedby={counterId}
          className="mt-3 block w-full resize-none rounded-2xl border border-border bg-card px-3.5 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:border-primary/60 focus:outline-none"
        />
        <p id={counterId} className="mt-1 text-right text-[11px] text-muted-foreground">
          {draft.message.length} / {MESSAGE_MAX}
        </p>
      </div>

      {/* Téléphone, seulement quand le compte n'en a pas. L'erreur est lue avec le champ (qui
          reçoit le focus) ; le bandeau de la fenêtre l'annonce déjà : pas de second `role="alert"` */}
      {phoneNeeded && (
        <div className="mt-3">
          <label htmlFor={phoneId} className="block text-[13px] font-semibold text-foreground/80">Votre téléphone</label>
          <input
            ref={phoneRef}
            id={phoneId}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
            value={draft.phone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="06 12 34 56 78"
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={`${phoneId}-help${phoneError ? ` ${phoneId}-error` : ''}`}
            className={`mt-1.5 block h-12 w-full rounded-2xl border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none ${
              phoneError ? 'border-destructive focus:border-destructive' : 'border-border focus:border-primary/60'
            }`}
          />
          <p id={`${phoneId}-help`} className="mt-1 text-xs text-muted-foreground">Pour que le salon puisse vous rappeler.</p>
          {phoneError && (
            <p id={`${phoneId}-error`} className="mt-1 text-xs font-medium text-destructive">{phoneError}</p>
          )}
        </div>
      )}

      {/* Récapitulatif */}
      <div className="mt-4 rounded-[20px] border border-primary/25 bg-card p-4">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Récapitulatif</p>
        <dl className="flex flex-col gap-2.5 text-[13px]">
          <RecapRow label="Occasion" value={eventTypeLabel(draft.event_type)} />
          <RecapRow label="Date" value={draft.date ? formatEventDate(draft.date, 'long') : 'À choisir'} muted={!draft.date} />
          <RecapRow label="Format" value={slotLabel(draft.time_slot) || 'À choisir'} muted={!slotOf(draft.time_slot)} />
          <RecapRow label="Groupe" value={count > 1 ? `${count} personnes` : '1 personne'} />
          <RecapRow label="On vous rappelle au" value={callbackPhone || 'À indiquer'} muted={!callbackPhone} />
        </dl>
        <p className="mt-3 flex gap-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          <Wallet className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          {"Rien à payer maintenant. Le salon vous envoie un devis dans l'app, vous décidez ensuite."}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Fenêtre
// ---------------------------------------------------------------------------------------------

export default function RequestSheet({ open, presetType, openKey, onClose, onViewRequest }) {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { user } = useAuth();
  const clock = useParisClock();
  const availability = useConfirmedEvents();
  const { index } = availability;
  const { barbers } = usePublicBarbers();
  const { mutateAsync } = useCreateRequest();
  const baseId = useId();

  const [draft, setDraft] = useState(emptyDraft);
  const [step, setStep] = useState('occasion');
  const [direction, setDirection] = useState(0);
  const [sending, setSending] = useState(false);
  const [triedSend, setTriedSend] = useState(false);
  // Créneau touché par le client : repris en changeant de jour. Un créneau imposé parce que le jour
  // n'a plus que celui-là (demi-journée déjà privatisée) ne le remplace pas
  const [preferredSlot, setPreferredSlot] = useState(DEFAULT_SLOT);
  // Message du bandeau : `{ text, tone: 'error' | 'info', key }` (effacé à la prochaine action)
  const [notice, setNotice] = useState(null);
  // Jour touché dans le calendrier : les créneaux sont ramenés à l'écran
  const [revealTick, setRevealTick] = useState(0);
  // Vérification des disponibilités : assez longue pour être signalée (`slowCheck`), ou qui n'en
  // finit pas (réseau inutilisable : on laisse continuer)
  const [slowCheck, setSlowCheck] = useState(false);
  const [checkTimedOut, setCheckTimedOut] = useState(false);
  // Demande créée : `{ event, draft }` (ligne du serveur et brouillon envoyé, pour l'écran de succès)
  const [created, setCreated] = useState(null);
  // Brouillon à remettre à zéro à la prochaine ouverture (envoi réussi, écran de succès quitté)
  const [stale, setStale] = useState(false);
  // Portail présent : pendant l'ouverture et jusqu'à la fin de l'animation de sortie
  const [present, setPresent] = useState(false);
  const [session, setSession] = useState({ open: false, key: undefined });

  const dialogRef = useRef(null);
  const scrollRef = useRef(null);
  const slotsRef = useRef(null);
  const phoneRef = useRef(null);
  const submittingRef = useRef(false);
  const advanceTimer = useRef(0);
  const noticeSeq = useRef(0);
  const mountedRef = useRef(true);
  const openRef = useRef(open);
  openRef.current = open;
  const stepRef = useRef(step);
  stepRef.current = step;
  const availabilityRef = useRef(availability);
  availabilityRef.current = availability;

  // Ouverture suivie pendant le rendu, pas dans un effet : la fenêtre s'affiche directement sur la
  // bonne étape, sans image intermédiaire ni glissement parasite entre deux étapes.
  if (open && (!session.open || !Object.is(session.key, openKey))) {
    const fresh = stale || step === 'done';
    const base = fresh ? emptyDraft() : draft;
    const preset = eventTypeOf(presetType) ? presetType : '';
    setSession({ open: true, key: openKey });
    setPresent(true);
    setDraft(preset ? withOccasion(base, preset) : base);
    setStep(preset ? 'date' : 'occasion');
    setDirection(0);
    // Chaque ouverture repart sans message ni erreur de champ (le brouillon, lui, est gardé)
    setNotice(null);
    setTriedSend(false);
    if (fresh) {
      setStale(false);
      setCreated(null);
      setPreferredSlot(DEFAULT_SLOT);
    }
  } else if (!open && session.open) {
    setSession(prev => ({ ...prev, open: false }));
    // Fermée depuis l'écran de succès (croix, retour, « Voir ma demande », page) : brouillon à refaire
    if (step === 'done') setStale(true);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(advanceTimer.current);
    };
  }, []);

  const say = useCallback((text, tone = 'error') => {
    noticeSeq.current += 1;
    setNotice({ text: sentence(text), tone, key: noticeSeq.current });
  }, []);
  const clearNotice = () => setNotice(null);

  const headingIdOf = (s) => (s === 'done' ? REQUEST_SUCCESS_TITLE_ID : `${baseId}-${s}`);
  const patch = (fields) => setDraft(d => ({ ...d, ...fields }));
  // Navigation entre étapes : le message en cours concerne l'étape quittée, il s'efface
  const goTo = (next, dir) => {
    clearTimeout(advanceTimer.current);
    setNotice(null);
    setDirection(dir);
    setStep(next);
  };
  const close = () => onClose?.();
  const back = () => {
    if (step === 'group') goTo('date', -1);
    else if (step === 'date') goTo('occasion', -1);
    else close();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Retour d'Android : étape précédente, ou fermeture sur l'étape Occasion et l'écran de succès
  useAndroidBack(open, back);

  // Ouverture : le reste de l'app sort du clavier et du lecteur d'écran (`inert` sur #root, la
  // fenêtre est un portail dans body ; le Toaster de sonner est dans #root : un toast affiché
  // pendant l'ouverture ne capterait ni tap ni lecture, d'où le bandeau de la fenêtre) ; Échap =
  // la croix ; Tab tourne dans la fenêtre ; la page derrière ne défile plus ; focus sur le titre de
  // l'étape. À la fermeture (ou si la page disparaît), tout est rendu et le focus revient à la page.
  useEffect(() => {
    if (!open) {
      clearTimeout(advanceTimer.current);
      return undefined;
    }
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    const rootWasInert = !!root?.hasAttribute('inert');
    if (root && !rootWasInert) root.setAttribute('inert', '');
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById(stepRef.current === 'done' ? REQUEST_SUCCESS_TITLE_ID : `${baseId}-${stepRef.current}`);
      (heading || dialogRef.current)?.focus({ preventScroll: true });
    });
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (e.key === 'Escape') closeRef.current?.();
      else if (e.key === 'Tab') keepTabInside(e, dialogRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      // `inert` retiré avant de rendre le focus : un élément inerte ne peut pas le recevoir
      if (root && !rootWasInert) root.removeAttribute('inert');
      restorePageFocus(previousFocus);
    };
  }, [open, baseId]);

  // Chaque ouverture relit les privatisations confirmées si elles sont périmées (la fenêtre reste
  // montée avec la page : React Query ne relance rien de lui-même à l'ouverture)
  useEffect(() => {
    if (!open) return;
    const a = availabilityRef.current;
    if (a.isStale && a.fetchStatus !== 'fetching') a.refetch();
  }, [open, openKey]);

  // Un toast affiché juste avant l'ouverture (ex. « Devis refusé ») resterait dessiné par-dessus
  // l'en-tête de la fenêtre (le Toaster est dans `#root`, rendu inerte) : on le ferme
  useEffect(() => {
    if (open) toast.dismiss();
  }, [open, openKey]);

  // Vérification en cours : « Continuer » bloqué ; signalée passé `CHECK_SHOW_MS` (une relecture
  // rapide ne fait rien clignoter) ; au-delà de `CHECK_TIMEOUT_MS`, « Continuer » se débloque (le
  // serveur refuse de toute façon un créneau déjà privatisé, la demande revient alors à la date)
  const fetchingAvailability = availability.fetchStatus === 'fetching';
  useEffect(() => {
    if (!fetchingAvailability) {
      setSlowCheck(false);
      setCheckTimedOut(false);
      return undefined;
    }
    const shown = setTimeout(() => setSlowCheck(true), CHECK_SHOW_MS);
    const giveUp = setTimeout(() => setCheckTimedOut(true), CHECK_TIMEOUT_MS);
    return () => {
      clearTimeout(shown);
      clearTimeout(giveUp);
    };
  }, [fetchingAvailability]);

  // Nouvelle étape : remise en haut de la zone qui défile, avant l'affichage
  useLayoutEffect(() => {
    if (open) scrollRef.current?.scrollTo(0, 0);
  }, [open, step]);

  // Nouvelle étape (pas l'ouverture, déjà traitée) : le focus passe sur son titre, annoncé par les
  // lecteurs d'écran
  const focusedStep = useRef(null);
  useEffect(() => {
    if (!open) {
      focusedStep.current = null;
      return undefined;
    }
    if (focusedStep.current === null || focusedStep.current === step) {
      focusedStep.current = step;
      return undefined;
    }
    focusedStep.current = step;
    const id = step === 'done' ? REQUEST_SUCCESS_TITLE_ID : `${baseId}-${step}`;
    // Aussi quand le focus était dans un champ : il appartient à l'étape qui sort
    const frame = requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, step, baseId]);

  // Jour touché : si ses créneaux tombent sous la barre d'action, la zone défile juste assez pour
  // les montrer (sans faire passer leur haut sous le bord supérieur)
  useEffect(() => {
    if (!revealTick) return undefined;
    const frame = requestAnimationFrame(() => {
      const box = scrollRef.current;
      const target = slotsRef.current;
      if (!box || !target) return;
      const view = box.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const hidden = rect.bottom + 16 - view.bottom;
      if (hidden <= 0) return;
      const by = Math.min(hidden, Math.max(0, rect.top - view.top - 12));
      if (by > 0) box.scrollBy({ top: by, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealTick, reduceMotion]);

  // Disponibilités rechargées ou nouveau jour : date passée retirée, créneau devenu indisponible
  // remplacé par le créneau préféré s'il est libre, sinon le premier libre (jour complet : aucun).
  // Sur l'étape Groupe, retour à la date avec un message (jamais de changement silencieux de ce que
  // le client va envoyer). Rien pendant un envoi : sa réponse décide.
  const { date: draftDate, time_slot: draftSlot } = draft;
  useEffect(() => {
    if (!open || sending || step === 'done' || !draftDate) return;
    if (dayState(draftDate, index, clock) === 'past') {
      setDraft(d => (d.date === draftDate ? { ...d, date: '' } : d));
      if (step === 'group') {
        setDirection(-1);
        setStep('date');
        say('Cette date est passée : choisissez-en une autre.', 'info');
      }
      return;
    }
    if (isSlotFree(draftSlot, draftDate, index, clock)) return;
    const next = firstFreeSlot(draftDate, index, clock, preferredSlot);
    if (next !== draftSlot) {
      setDraft(d => (d.date === draftDate && d.time_slot === draftSlot ? { ...d, time_slot: next } : d));
    }
    if (step === 'group') {
      setDirection(-1);
      setStep('date');
      say(slotState(draftSlot, draftDate, index, clock) === 'past'
        ? 'Ce créneau est déjà passé : choisissez-en un autre.'
        : "Ce créneau vient d'être privatisé : choisissez-en un autre.", 'info');
    }
  }, [open, sending, step, draftDate, draftSlot, index, clock, preferredSlot, say]);

  // --- Actions (chacune efface le message en cours : il concernait l'action précédente) ---

  const pickOccasion = (id) => {
    hapticFeedback();
    clearNotice();
    setDraft(d => withOccasion(d, id));
    clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setDirection(1);
      setStep(prev => (prev === 'occasion' ? 'date' : prev));
    }, OCCASION_ADVANCE_MS);
  };

  const pickDate = (key) => {
    clearNotice();
    setDraft(d => ({ ...d, date: key, time_slot: firstFreeSlot(key, index, clock, preferredSlot) }));
    setRevealTick(t => t + 1);
  };

  const pickSlot = (slotId) => {
    hapticFeedback();
    clearNotice();
    setPreferredSlot(slotId);
    patch({ time_slot: slotId });
  };

  const setGuests = (n) => {
    const next = clampGuests(n);
    if (next === clampGuests(draft.guest_count)) return;
    hapticFeedback();
    clearNotice();
    patch({ guest_count: next });
  };

  const tapIdea = (idea) => {
    hapticFeedback();
    if (!hasIdea(draft.message, idea) && toggleIdea(draft.message, idea) === draft.message) {
      say('Message trop long pour ajouter cette idée.');
      return;
    }
    clearNotice();
    setDraft(d => ({ ...d, message: toggleIdea(d.message, idea) }));
  };

  const checking = fetchingAvailability && !checkTimedOut;
  // Sans aucune donnée (calendrier encore tout libre), la vérification est dite tout de suite
  const showChecking = checking && (slowCheck || !availability.data);
  const unverified = !availability.data && !checking
    && (availability.isError || availability.fetchStatus === 'paused' || checkTimedOut);

  const continueFromDate = () => {
    if (!eventTypeOf(draft.event_type)) { goTo('occasion', -1); return; }
    if (checking) return;
    if (draft.date && isSlotFree(draft.time_slot, draft.date, index, clock)) {
      hapticFeedback();
      goTo('group', 1);
    }
  };

  const submit = async () => {
    if (submittingRef.current) return;
    clearNotice();
    setTriedSend(true);
    const check = validateDraft(draft, { user, index, clock });
    if (!check.ok) {
      if (check.step && check.step !== step) {
        goTo(check.step, -1);
      } else if (check.step === 'group' && needsPhone(user)) {
        phoneRef.current?.focus();
        phoneRef.current?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      say(check.reason);
      return;
    }
    submittingRef.current = true;
    setSending(true);
    hapticFeedback();
    const sent = { ...draft };
    try {
      const event = await mutateAsync(buildRequestPayload({ draft: sent, user, barbers: barbers || [] }));
      // Fenêtre fermée (ou page quittée) pendant l'envoi : on ne la rouvre pas
      if (!mountedRef.current || !openRef.current) {
        toast.success('Demande envoyée ! Le salon vous enverra un devis.');
        if (mountedRef.current) setStale(true);
        return;
      }
      setCreated({ event: event || null, draft: sent });
      goTo('done', 1);
    } catch (err) {
      const message = sendErrorMessage(err);
      // Fenêtre fermée pendant l'envoi : plus de bandeau possible, le toast prévient (brouillon gardé)
      if (!mountedRef.current || !openRef.current) {
        toast.error(message);
        return;
      }
      // Date ou créneau refusé (pris entre-temps, passé) : retour à la date, créneaux rechargés
      if (isDateProblem(err)) goTo('date', -1);
      say(message);
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  };

  const viewRequest = (id) => {
    close();
    onViewRequest?.(id);
  };
  const goHome = () => {
    close();
    navigate('/');
  };

  if (typeof document === 'undefined' || (!open && !present)) return null;

  // --- Rendu ---

  const phoneNeeded = needsPhone(user);
  const phoneError = phoneNeeded && triedSend && !phoneValid(draft.phone)
    ? (String(draft.phone || '').trim()
      ? 'Ce numéro semble incomplet : vérifiez-le.'
      : 'Indiquez un numéro pour que le salon puisse vous rappeler.')
    : '';
  const headingId = headingIdOf(step);
  const occasion = eventTypeOf(draft.event_type);
  const dateReady = !!draft.date && isSlotFree(draft.time_slot, draft.date, index, clock);
  const dayFull = !!draft.date && dayState(draft.date, index, clock) === 'full';

  let bar = null;
  if (step === 'occasion' && occasion) {
    bar = (
      <ActionBar
        title={occasion.label}
        // Court : « Enterrement de vie de jeune garçon » était tronqué jusqu'à 375 px
        subtitle="Occasion choisie"
        label="Continuer"
        onAction={() => goTo('date', 1)}
        reduceMotion={reduceMotion}
      />
    );
  } else if (step === 'date') {
    let subtitle = null;
    if (draft.date) subtitle = dateReady ? slotLabel(draft.time_slot) : (dayFull ? 'Jour complet' : 'Choisissez un créneau');
    bar = (
      <ActionBar
        title={draft.date ? formatEventDate(draft.date, 'medium') : 'Choisissez une date'}
        titleMuted={!draft.date}
        subtitle={subtitle}
        label="Continuer"
        onAction={continueFromDate}
        disabled={!dateReady || checking}
        busy={showChecking && dateReady}
        reduceMotion={reduceMotion}
      />
    );
  } else if (step === 'group') {
    bar = (
      <ActionBar
        label={sending ? 'Envoi…' : 'Envoyer ma demande'}
        icon={Send}
        busy={sending}
        disabled={sending}
        onAction={submit}
        reduceMotion={reduceMotion}
      />
    );
  }

  let content;
  if (step === 'occasion') {
    content = (
      <OccasionStep headingId={headingId} selected={draft.event_type} onPick={pickOccasion} reduceMotion={reduceMotion} />
    );
  } else if (step === 'date') {
    content = (
      <DateStep
        headingId={headingId}
        draft={draft}
        index={index}
        clock={clock}
        checking={showChecking}
        unverified={unverified}
        slotsRef={slotsRef}
        onPickDate={pickDate}
        onPickSlot={pickSlot}
        onEditOccasion={() => goTo('occasion', -1)}
      />
    );
  } else if (step === 'group') {
    content = (
      <GroupStep
        headingId={headingId}
        draft={draft}
        user={user}
        phoneNeeded={phoneNeeded}
        phoneError={phoneError}
        phoneRef={phoneRef}
        onGuests={setGuests}
        onIdea={tapIdea}
        onMessage={(value) => { clearNotice(); patch({ message: String(value).slice(0, MESSAGE_MAX) }); }}
        onPhone={(value) => { clearNotice(); patch({ phone: String(value).slice(0, 30) }); }}
        reduceMotion={reduceMotion}
      />
    );
  } else {
    content = <RequestSuccess event={created?.event} draft={created?.draft} />;
  }

  const showNotice = !!notice && step !== 'done';
  const hasFooter = !!bar || showNotice || step === 'done';

  return createPortal(
    <AnimatePresence onExitComplete={() => { if (!openRef.current) setPresent(false); }}>
      {open && (
        <PresenceDiv
          key="privatisation-request"
          ref={dialogRef}
          data-app-overlay=""
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          tabIndex={-1}
          initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
          exit={reduceMotion ? { opacity: 0, pointerEvents: 'none' } : { y: '100%', pointerEvents: 'none' }}
          transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', damping: 32, stiffness: 320 }}
          className="fixed inset-x-0 top-0 z-[60] flex flex-col bg-background pt-[env(safe-area-inset-top)] focus:outline-none"
          style={{ bottom: 'var(--keyboard-overlap, 0px)' }}
        >
          {/* En-tête : retour, titre, croix ; frise des étapes */}
          <div className="mx-auto w-full max-w-lg shrink-0 px-4 pt-2">
            {step === 'done' ? (
              <div className="flex h-12 items-center justify-end">
                <IconButton label="Fermer" onClick={close}><X className="h-[18px] w-[18px]" aria-hidden="true" /></IconButton>
              </div>
            ) : (
              <>
                <div className="flex h-12 items-center justify-between gap-2">
                  {step === 'date' || step === 'group' ? (
                    <IconButton label="Retour" onClick={back}><ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" /></IconButton>
                  ) : (
                    <span className="h-11 w-11 shrink-0" aria-hidden="true" />
                  )}
                  <p className="truncate text-[15px] font-semibold text-foreground">Demande de devis</p>
                  <IconButton label="Fermer" onClick={close}><X className="h-[18px] w-[18px]" aria-hidden="true" /></IconButton>
                </div>
                <Progress step={step} reduceMotion={reduceMotion} />
              </>
            )}
          </div>

          {/* Contenu qui défile */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
            <div className={`mx-auto flex min-h-full w-full max-w-lg flex-col px-4 ${
              hasFooter ? 'pb-6' : 'pb-[calc(env(safe-area-inset-bottom,0px)+24px)]'
            }`}
            >
              <div className="relative flex flex-1 flex-col">
                <AnimatePresence mode="popLayout" initial={false} custom={{ dir: direction, reduce: reduceMotion }}>
                  <PresenceDiv
                    key={step}
                    custom={{ dir: direction, reduce: reduceMotion }}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={reduceMotion
                      ? { duration: 0.12 }
                      : { x: { type: 'spring', stiffness: 380, damping: 34 }, opacity: { duration: 0.18 } }}
                    className="flex flex-1 flex-col"
                  >
                    {content}
                  </PresenceDiv>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Bandeau des erreurs et barre d'action, dans la fenêtre (pas au-dessus de la navigation de
              l'app) : visibles quelle que soit la position dans l'étape */}
          {step !== 'done' && (bar || showNotice) && (
            <div className="booking-bar shrink-0 border-t border-border bg-card/95 backdrop-blur-xl" role="region" aria-label="Votre demande">
              {showNotice && (
                <div className={`mx-auto w-full max-w-lg px-4 pt-3 ${bar ? '' : 'pb-[calc(env(safe-area-inset-bottom,0px)+12px)]'}`}>
                  <NoticeBanner key={notice.key} notice={notice} onDismiss={clearNotice} reduceMotion={reduceMotion} />
                </div>
              )}
              {bar}
            </div>
          )}

          {/* Écran de succès : ses deux boutons restent visibles sans défiler, même à 320 × 568 */}
          {step === 'done' && (
            <div className="relative shrink-0 bg-background">
              <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background to-transparent" aria-hidden="true" />
              <RequestSuccessActions onView={() => viewRequest(created?.event?.id)} onHome={goHome} />
            </div>
          )}
        </PresenceDiv>
      )}
    </AnimatePresence>,
    document.body,
  );
}
