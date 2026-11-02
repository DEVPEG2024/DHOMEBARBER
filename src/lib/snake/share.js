/**
 * Snake du Gang : partage d'un score (écran de fin). Même logique que `shareLastMinute`
 * (src/lib/lastMinute.js) : `@capacitor/share` dans les apps (pas de `navigator.share` dans la
 * WebView Android), `navigator.share` sur le web, appelé sans attente avant lui (sinon le
 * navigateur refuse : geste trop ancien), sinon copie du texte avec un toast.
 * Toujours l'adresse publique (`SNAKE_PUBLIC_URL`), jamais `window.location.origin`.
 */
import { toast } from 'sonner';
import { isNative } from '@/lib/capacitor';
import { SNAKE_PUBLIC_URL } from './snakeApi';

/** Texte du partage : « J'ai fait 248 points au Snake du Gang. Viens me battre : https://dhomebarber.fr/snake ». */
export function snakeShareText(score) {
  const n = Math.max(0, Math.floor(Number(score) || 0));
  return `J'ai fait ${n} point${n > 1 ? 's' : ''} au Snake du Gang. Viens me battre : ${SNAKE_PUBLIC_URL}`;
}

/**
 * Partage un score. Rend 'shared' | 'cancelled' | 'copied' | 'failed' (toast déjà affiché pour
 * 'copied' et 'failed'). Le lien est dans le texte : il n'est pas donné une seconde fois à part
 * (certaines apps l'auraient collé deux fois).
 */
export async function shareSnakeScore(score) {
  const title = 'Snake du Gang';
  const text = snakeShareText(score);
  if (isNative) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: 'Défier un ami' });
      return 'shared';
    } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return 'cancelled';
      // Module absent ou refus du système : les voies du web prennent le relais
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Partage refusé (geste trop ancien, appli cible en échec) : copie du texte
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Lien copié : colle-le dans un message à un ami.');
    return 'copied';
  } catch {
    toast.error('Partage impossible sur cet appareil.');
    return 'failed';
  }
}
