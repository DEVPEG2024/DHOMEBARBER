import { isNative } from '@/lib/capacitor';
import { coupeTournamentUrl } from '@/lib/coupe/coupeApi';
import { dateLine, msOf } from './tournoiFormat';

/**
 * Partage d'un tournoi (bouton du haut de sa page) : lien public `https://dhomebarber.fr/coupe/
 * tournoi/<id>` (jamais `window.location.origin`, capacitor://localhost dans les apps).
 * Apps : feuille de partage du système (`@capacitor/share`) ; web : `navigator.share` appelé sans
 * attente avant lui, puis le presse-papier. Rend `'shared'`, `'cancelled'`, `'copied'` ou `'failed'`
 * (même contrat que `shareLastMinute`).
 */
export async function shareTournament(t) {
  const url = coupeTournamentUrl(t?.id);
  const title = String(t?.name || 'Tournoi de la Coupe du Gang');
  const text = `Viens jouer « ${title} », le tournoi de La Coupe du Gang (${dateLine(msOf(t?.starts_at))}).`;
  if (isNative) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: 'Partager le tournoi' });
      return 'shared';
    } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return 'cancelled';
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
