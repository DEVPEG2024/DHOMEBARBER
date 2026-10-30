/**
 * Fil v2 : partage d'une publication (30 oct. 2026).
 *
 * Lien public `https://dhomebarber.fr/feed?post=<id>` (`postShareUrl`), jamais
 * `window.location.origin` (capacitor://localhost dans les apps). Le texte ne dit rien d'un
 * client (ni nom, ni texte de sa publication) : seules les publications du salon donnent un extrait.
 *
 * Même ordre que `shareLastMinute` (src/lib/lastMinute.js) : `@capacitor/share` dans les apps (pas
 * de `navigator.share` dans la WebView Android), `navigator.share` sur le web **sans attente avant
 * lui** (Safari refuse un partage qui n'est plus dans le geste), puis copie du lien.
 */
import { isNative } from '@/lib/capacitor';
import { postShareUrl, SALON_NAME } from '@/lib/feed/rules';

const excerpt = (text, max = 100) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Titre, texte et lien d'une publication à partager. */
export function postShareContent(item) {
  const url = postShareUrl(item.id);
  const title = `${SALON_NAME} · le Gang`;
  let text;
  switch (item.kind) {
    case 'look': text = `Un look tout frais chez ${SALON_NAME} 💈`; break;
    case 'before_after': text = `Avant / après chez ${SALON_NAME} 💈`; break;
    case 'poll': text = item.poll?.question
      ? `Sondage du salon : « ${excerpt(item.poll.question, 120)} » Viens voter 💈`
      : `Sondage du salon : viens voter 💈`; break;
    case 'moment': text = `Le Gang ${SALON_NAME} fête un nouveau niveau 💈`; break;
    default:
      // Publication du salon (admin) : un extrait ; publication d'un client : rien de lui
      text = item.author_role === 'admin' && item.content
        ? `${SALON_NAME} : « ${excerpt(item.content)} »`
        : `Ça se passe dans le Gang ${SALON_NAME} 💈`;
  }
  return { title, text, url };
}

/**
 * Partage la publication : `'shared'`, `'cancelled'`, `'copied'` (lien copié : l'appelant le dit
 * dans un toast) ou `'failed'`.
 */
export async function sharePost(item) {
  const { title, text, url } = postShareContent(item);
  if (isNative) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: 'Partager la publication' });
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
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
