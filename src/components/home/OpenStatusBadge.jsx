import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Index 0 = dimanche … 6 = samedi (même convention que Date#getDay)
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS = {
  monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi', thursday: 'jeudi',
  friday: 'vendredi', saturday: 'samedi', sunday: 'dimanche',
};
// Nom anglais du jour (Intl en-US) → clé de salon_settings.opening_hours
const EN_TO_KEY = {
  Sunday: 'sunday', Monday: 'monday', Tuesday: 'tuesday', Wednesday: 'wednesday',
  Thursday: 'thursday', Friday: 'friday', Saturday: 'saturday',
};

// Styles par état : point + halo respirant
const STATE_STYLES = {
  open: { dot: 'bg-green-500', halo: 'bg-green-500' },
  soon: { dot: 'bg-orange-400', halo: 'bg-orange-400' },
  closed: { dot: 'bg-red-500', halo: 'bg-red-500' },
};

/** « 09:00 » → « 9h », « 19:30 » → « 19h30 » (même format que le modal horaires). */
function fmt(t) {
  const [h, m] = String(t).split(':');
  return m === '00' || !m ? `${parseInt(h, 10)}h` : `${parseInt(h, 10)}h${m}`;
}

/** « 19:30 » → minutes depuis minuit. */
function toMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Jour (index 0-6) et minutes écoulées depuis minuit, à l'heure de Paris. */
function nowInParis() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', weekday: 'long', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value;
  const dayIndex = DAY_KEYS.indexOf(EN_TO_KEY[get('weekday')] || 'sunday');
  // `% 24` : certains navigateurs renvoient « 24 » à minuit
  const minutes = ((parseInt(get('hour'), 10) || 0) % 24) * 60 + (parseInt(get('minute'), 10) || 0);
  return { dayIndex, minutes };
}

const isOpenDay = (info) => !!info && !info.closed && !!info.open && !!info.close;

/**
 * Calcule l'état du salon depuis salon_settings.opening_hours :
 * - open   : ouvert en ce moment (« Ouvert · ferme à 19h »)
 * - soon   : fermé mais ouvre plus tard aujourd'hui (« Ouvre à 9h »)
 * - closed : fermé, prochain jour ouvert (« Fermé · ouvre demain à 9h »)
 */
export function computeOpenStatus(openingHours) {
  if (!openingHours || typeof openingHours !== 'object') return null;
  const { dayIndex, minutes } = nowInParis();
  const today = openingHours[DAY_KEYS[dayIndex]];

  if (isOpenDay(today)) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (minutes >= open && minutes < close) return { state: 'open', label: `Ouvert · ferme à ${fmt(today.close)}` };
    if (minutes < open) return { state: 'soon', label: `Ouvre à ${fmt(today.open)}` };
  }

  // Fermé : on cherche le prochain jour ouvert (au plus une semaine)
  for (let i = 1; i <= 7; i++) {
    const key = DAY_KEYS[(dayIndex + i) % 7];
    const info = openingHours[key];
    if (isOpenDay(info)) {
      const when = i === 1 ? 'demain' : DAY_LABELS[key];
      return { state: 'closed', label: `Fermé · ouvre ${when} à ${fmt(info.open)}` };
    }
  }
  return { state: 'closed', label: 'Fermé' };
}

/**
 * Pastille « Ouvert / Fermé » du hero : point coloré qui respire + libellé.
 * Recalculée toutes les minutes et au retour au premier plan (heure de Paris).
 * Ne rend rien tant que les horaires ne sont pas chargés.
 */
export default function OpenStatusBadge({ openingHours }) {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState(() => computeOpenStatus(openingHours));

  useEffect(() => {
    const refresh = () => setStatus(computeOpenStatus(openingHours));
    refresh();
    const id = setInterval(refresh, 60 * 1000);
    // Sur mobile l'app peut être suspendue : on resynchronise au réveil
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [openingHours]);

  if (!status) return null;
  const styles = STATE_STYLES[status.state] || STATE_STYLES.closed;

  return (
    <div
      className="flex items-center gap-2 backdrop-blur-xl bg-white/10 border border-white/15 rounded-full px-3 py-1.5"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex w-2 h-2 shrink-0">
        {/* Halo qui respire (transform / opacity uniquement) */}
        {!reduceMotion && (
          <motion.span
            aria-hidden="true"
            className={`absolute inset-0 rounded-full ${styles.halo}`}
            animate={{ scale: [1, 2.2, 1], opacity: [0.55, 0, 0.55] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span className={`relative w-2 h-2 rounded-full ${styles.dot}`} />
      </span>
      <span className="text-white/70 text-xs whitespace-nowrap">{status.label}</span>
    </div>
  );
}
