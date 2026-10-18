import { isNative } from '@/lib/capacitor';

// Début de cellule qu'Excel / Numbers évalue comme une formule (« injection CSV », OWASP) : un nom
// de client `=HYPERLINK(…)` ou une note `@SUM(…)` s'exécutait à l'ouverture du fichier. Les
// guillemets autour du champ ne protègent pas : le tableur les retire avant d'évaluer.
const FORMULA_START = /^[=+\-@\t\r]/;
// Numéro international (+33 6 12 34 56 78) : chiffres, espaces et + ( ) . - ne forment jamais une formule
const PHONE_LIKE = /^\+[\d\s().-]{6,}$/;

/** Cellule CSV : texte neutralisé (préfixe `'`), guillemets doublés. Les nombres restent des nombres. */
function csvCell(val) {
  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  // Un montant négatif (prix, CA) n'est pas une formule : seuls les textes sont préfixés
  if (typeof val !== 'number' && FORMULA_START.test(str) && !PHONE_LIKE.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Enregistre un fichier texte. Web : téléchargement. Apps iOS / Android (la WebView ignore
 * `a.download` : rien ne se passait) : fichier écrit dans le cache de l'app puis feuille de
 * partage du système (« Enregistrer dans Fichiers », Drive, mail…). Plugins chargés à la demande.
 * @returns {Promise<true|'cancelled'>} lève l'erreur si l'enregistrement est impossible
 */
export async function saveTextFile(content, filename, mime = 'text/plain;charset=utf-8') {
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: filename, files: [uri], dialogTitle: 'Enregistrer ou partager' });
    } catch (err) {
      // Feuille de partage refermée : pas une erreur
      if (/cancel/i.test(String(err?.message || err))) return 'cancelled';
      throw err;
    }
    return true;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révoquée plus tard : certains navigateurs lisent l'URL après le clic
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

/**
 * Exporte des lignes en CSV (séparateur `;`, BOM pour Excel) et l'enregistre.
 * @param {Array} rows - Array of objects
 * @param {string} filename - File name without extension
 * @returns {Promise<boolean>} false s'il n'y avait rien à exporter ; lève en cas d'échec
 */
export async function exportToCSV(rows, filename = 'export') {
  if (!rows || rows.length === 0) return false;

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(';'),
    ...rows.map(row => headers.map(h => csvCell(row[h] ?? '')).join(';')),
  ].join('\n');

  await saveTextFile('\uFEFF' + csvContent, `${filename}.csv`, 'text/csv;charset=utf-8');
  return true;
}
