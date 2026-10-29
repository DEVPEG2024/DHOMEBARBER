/*
 * Textes de l'écran de jeu de La Coupe du Gang (tutoiement, chiffres à la française).
 */
import { LEVELS } from '@/lib/coupe/engine';
import { isSalonRole, playerBadge } from '@/lib/coupe/renderer';

/** « 1:42 » à partir d'un nombre de secondes. */
export function mmss(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Place au classement : « 1re », « 6e ». */
export const ordinal = (n) => (Number(n) === 1 ? '1re' : `${n}e`);

/** « +3 », « −1 » (vrai signe moins), « 0 ». */
export function formatDelta(d) {
  const n = Number(d) || 0;
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

/** « 1 point », « 3 points », « −1 point ». */
export const pointsWord = (d) => (Math.abs(Number(d) || 0) > 1 ? 'points' : 'point');

/** Sous le gain du match : « Points de Coupe » (+3), « Point de Coupe » (−1, 0). */
export const coupePointsLabel = (d) => (Math.abs(Number(d) || 0) > 1 ? 'Points de Coupe' : 'Point de Coupe');

/** Mois de la saison en cours (heure de Paris) : « novembre ». */
export function seasonMonth(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'Europe/Paris' }).format(date);
  } catch {
    return '';
  }
}

/** « Saison de novembre », « Saison d’octobre » (saison en cours, heure de Paris) ; « Saison » sinon. */
export function seasonLabel(date = new Date()) {
  const month = seasonMonth(date);
  if (!month) return 'Saison';
  return /^[aeiouyàâéèêîôû]/i.test(month) ? `Saison d’${month}` : `Saison de ${month}`;
}

/**
 * Nom affiché d'un compte connecté, comme le serveur (contrat, section 0) : « D'Home Barber » pour
 * l'admin, prénom pour un barber, prénom + initiale pour un client. Jamais l'email.
 */
export function shownName(user) {
  if (user?.role === 'admin') return "D'Home Barber";
  const parts = String(user?.full_name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Toi';
  if (user?.role === 'barber' || parts.length === 1) return parts[0].slice(0, 30);
  return `${parts[0].slice(0, 30)} ${parts[1].charAt(0).toUpperCase()}.`;
}

/** Libellé d'un rôle sur l'écran « Défi reçu ». */
export function roleLabel(role) {
  if (isSalonRole(role)) return 'Le salon';
  if (role === 'barber') return 'Barber';
  return 'Membre du Gang';
}

/**
 * Joueurs d'un match hors ligne, en repère local : [bas, haut], pour le dessin et les textes.
 * `myPhoto` : photo du compte connecté (client), sur ton pion contre le salon ; jamais à deux sur
 * un téléphone (deux joueurs, un seul compte).
 */
export function offlinePlayers(mode, level, myPhoto = null) {
  if (mode === 'local') {
    return [
      { name: 'Joueur du bas', role: 'user', tag: 'J1' },
      { name: 'Joueur du haut', role: 'user', tag: 'J2' },
    ];
  }
  const L = LEVELS[level] || LEVELS.barber;
  return [
    { name: 'Toi', role: 'user', tag: 'TOI', photo: myPhoto || null },
    { name: L.name, role: 'bot', tag: L.tag },
  ];
}

/**
 * Joueurs d'un match en ligne pour le dessin : « Toi » en bas (avec tes initiales sur ton pion,
 * comme sur la maquette « Match en ligne »), l'adversaire en haut. `photos` (`start.photos`, [toi,
 * l'adversaire]) : photo d'un client sur son pion, à la place des initiales.
 */
export function onlinePlayers(names, roles, photos) {
  const myTag = playerBadge(names?.[0], roles?.[0]).tag;
  return [
    { name: 'Toi', role: roles?.[0], tag: myTag, photo: photos?.[0] || null },
    { name: names?.[1] || 'Adversaire', role: roles?.[1], photo: photos?.[1] || null },
  ];
}

export { coupeErrorText as sendErrorText } from '../coupeErrors';
