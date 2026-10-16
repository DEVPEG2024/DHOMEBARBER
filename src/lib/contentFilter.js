/**
 * Filtre des contenus choquants avant publication (directive App Store 1.2 : « a method for
 * filtering objectionable material from being posted »). Vérifié côté client sur tout ce qui est
 * visible par les autres : publications et commentaires du fil, avis, nom affiché. Le serveur doit
 * appliquer la même liste (docs/backend-content-filter.md) : ce filtre-ci ne fait qu'éviter
 * l'aller-retour et donner un message clair.
 *
 * Volontairement limité aux insultes, propos haineux, contenus sexuels explicites et menaces :
 * les jurons courants (« putain », « merde ») ne sont pas bloqués. Signalement, blocage et
 * modération admin restent le filet pour le reste.
 */

// Mots bloqués, comparés mot à mot après normalisation (minuscules, sans accents, chiffres « leet »
// remplacés), puis une seconde fois lettres doublées réduites (« fuuuck », « connnard »). Pas de
// mot français courant ici : « retard », « con », « baiser » ou « Niger » ne doivent jamais bloquer.
const WORDS = [
  // Insultes
  'connard', 'connasse', 'conasse', 'salope', 'salopard', 'salaud', 'encule', 'enculer', 'enculee',
  'enfoire', 'enfoiree', 'batard', 'fdp', 'ntm', 'niquer', 'pute', 'pouffiasse', 'petasse',
  'trouduc', 'pd', 'conard',
  // Propos haineux
  'tapette', 'pede', 'pedale', 'gouine', 'negre', 'negro', 'bougnoule', 'bicot', 'youpin',
  'chinetoque', 'bamboula', 'nigger', 'nigga', 'faggot', 'tranny',
  // Sexuel explicite
  'bite', 'chatte', 'branlette', 'branleur', 'porno', 'porn', 'nudes', 'sodomie',
  'fuck', 'fucking', 'motherfucker', 'bitch', 'cunt', 'whore', 'slut', 'dick', 'pussy', 'cock',
  // Menaces
  'kys',
];

// Expressions bloquées (comparées sur le texte normalisé, mots séparés par une espace)
const PHRASES = [
  'nique ta mere', 'niquer ta mere', 'ta mere la pute', 'fils de pute', 'fille de pute',
  'va te faire foutre', 'va te faire enculer', 'je vais te tuer', 'je vais te buter',
  'je vais te defoncer', 'je vais te niquer', 'tue toi', 'suicide toi', 'va crever', 'creve sale',
  'kill yourself', 'go die',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '€': 'e' };

/** Texte comparable : minuscules, sans accents, « leet » remplacé, triples lettres ramenées à deux. */
export function normalizeForFilter(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[013457@$€]/g, (c) => LEET[c] || c)
    .replace(/([a-z])\1{2,}/g, '$1$1')
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/** Lettres doublées réduites à une seule (« connard » → « conard »). */
const squeeze = (word) => word.replace(/([a-z])\1+/g, '$1');

const WORD_SET = new Set(WORDS.map(normalizeForFilter));
// Formes réduites, sauf celles qui tombent sur un mot ordinaire (nigger → niger)
const SQUEEZED_SET = new Set([...WORD_SET].map(squeeze).filter((w) => !['niger'].includes(w)));
const PHRASE_LIST = PHRASES.map(normalizeForFilter);
// Mots assez longs pour être cherchés aussi lettres collées (« c.o.n.n.a.r.d », « s a l o p e »)
const SPELLED = [...WORD_SET].filter((w) => w.length >= 6);

/** Vrai si le texte contient un terme bloqué. */
export function hasObjectionableContent(text) {
  const norm = normalizeForFilter(text);
  if (!norm) return false;
  const tokens = norm.split(' ');
  const blocked = (t) => WORD_SET.has(t) || SQUEEZED_SET.has(squeeze(t));
  for (const t of tokens) {
    if (blocked(t)) return true;
    // Pluriels simples : connards, salopes, enculés
    if (t.length > 3 && (t.endsWith('s') || t.endsWith('x')) && blocked(t.slice(0, -1))) return true;
  }
  const spaced = ` ${norm} `;
  const squeezed = ` ${tokens.map(squeeze).join(' ')} `;
  if (PHRASE_LIST.some((p) => spaced.includes(` ${p} `) || squeezed.includes(` ${p.split(' ').map(squeeze).join(' ')} `))) return true;
  // Lettres isolées enchaînées (au moins 4 d'affilée) : on recolle et on cherche les mots longs
  const singles = norm.match(/(?:\b[a-z]\b ?){4,}/g);
  if (singles?.some((s) => SPELLED.some((w) => squeeze(s.replace(/ /g, '')).includes(squeeze(w))))) return true;
  return false;
}

export const OBJECTIONABLE_MESSAGE =
  'Ce texte contient des mots interdits par les règles de la communauté (insultes, propos haineux ou choquants). Modifiez-le pour pouvoir le publier.';

/** Message d'erreur à afficher si `text` doit être refusé, sinon `null`. */
export function contentFilterError(text) {
  return hasObjectionableContent(text) ? OBJECTIONABLE_MESSAGE : null;
}
