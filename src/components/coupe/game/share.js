/*
 * Partage du lien d'un match de La Coupe du Gang (salle d'attente) : `@capacitor/share` dans les
 * apps (pas de `navigator.share` dans la WebView Android), `navigator.share` sur le web (sans
 * attente avant lui, sinon le navigateur refuse : geste trop ancien), sinon copie du lien.
 * Toujours l'adresse publique https://dhomebarber.fr (jamais `window.location.origin`).
 * Même logique que `shareLastMinute` (src/lib/lastMinute.js).
 */
import { isNative } from '@/lib/capacitor';
import { coupeChallengeUrl } from '@/lib/coupe/coupeApi';
import { shareChallengeImage } from './challengeImage';

/** Contenu du partage : titre, texte (avec le code à 4 chiffres) et lien du défi. */
export function challengeShareContent({ link, code }) {
  return {
    title: 'La Coupe du Gang',
    text: code
      ? `Je te défie à la Coupe du Gang ! Code du match : ${code}`
      : 'Je te défie à la Coupe du Gang !',
    url: coupeChallengeUrl(link),
  };
}

/**
 * Rend 'shared' | 'cancelled' | 'copied' | 'failed'. `image` : image du défi déjà prête
 * (challengeImage.js), partagée avec le lien dans le texte ; sans elle, ou sur un appareil qui ne
 * partage pas de fichier, le lien part seul.
 */
export async function shareChallenge({ link, code, image = null }) {
  const { title, text, url } = challengeShareContent({ link, code });
  if (image) {
    const r = await shareChallengeImage({ blob: image, title, message: `${text}\n${url}` });
    if (r) return r;
  }
  if (isNative) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: 'Défier un ami' });
      return 'shared';
    } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return 'cancelled';
      // Module absent ou refus du système : les voies du web prennent le relais
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Partage refusé (geste trop ancien, appli cible en échec) : copie du lien
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
