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
// mot français courant ici : « retard », « con », « baiser » ou « Niger » ne doivent jamais bloquer,
// ni un vrai nom de famille (Conard, Batard, Salaud, Bitte, Nègre, Fagot, De Cock) ni « pédale », « chatte »
// (l'animal), « tapette » (à mouches), « enfoiré » (« les Enfoirés », le concert des Restos du cœur),
// « negro » (le Rio Negro) : ces mots ne sont bloqués que dans une insulte (PHRASES).
const WORDS = [
  // Insultes
  'connard', 'connasse', 'conasse', 'salope', 'salopard', 'encule', 'enculer', 'enculee',
  'fdp', 'ntm', 'niquer', 'pute', 'pouffiasse', 'petasse',
  'trouduc', 'pd',
  // Propos haineux
  'pede', 'gouine', 'bougnoule', 'bicot', 'youpin',
  'chinetoque', 'bamboula', 'nigger', 'nigga', 'faggot', 'tranny',
  // Sexuel explicite
  'branlette', 'branleur', 'porno', 'porn', 'nudes', 'sodomie',
  'fuck', 'fucking', 'motherfucker', 'bitch', 'cunt', 'whore', 'slut', 'pussy',
  // Menaces
  'kys',
];

// Expressions bloquées (comparées sur le texte normalisé, mots séparés par une espace)
const PHRASES = [
  'nique ta mere', 'niquer ta mere', 'ta mere la pute', 'fils de pute', 'fille de pute',
  'va te faire foutre', 'va te faire enculer', 'je vais te tuer', 'je vais te buter',
  'je vais te defoncer', 'je vais te niquer', 'tue toi', 'suicide toi', 'va crever', 'creve sale',
  'kill yourself', 'go die', 'suck my cock', 'suck my dick', 'big cock', 'my cock',
  // Mots ordinaires ou noms de famille hors insulte, bloqués seulement dans ces tournures
  'sale pedale', 'grosse pedale', 'sale tapette', 'grosse tapette', 'sale batard', 'espece de batard',
  'espece de salaud', 'sale salaud', 'gros salaud', 'espece de conard', 'suce ma bite', 'grosse bite',
  'sale enfoire', 'sale enfoiree', 'espece d enfoire', 'espece d enfoiree', 'gros enfoire', 'pauvre enfoire',
  'bande d enfoires', 't es un enfoire', 'tu es un enfoire',
  'sale negre', 'sale negro', 'sale negresse', 'gros negre', 'sale race de negre',
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
// Formes réduites, sauf celles qui tombent sur un mot ordinaire ou un nom (nigger → niger,
// connard → conard et faggot → fagot, des noms de famille, petasse → petase, le chapeau grec,
// pute → « Putte », un nom de famille : « pute », « putes » et « fils de putte » restent bloqués ;
// « connnard » ou « fagggot » restent bloqués : la normalisation les ramène à « connard », « faggot »)
const SQUEEZED_SET = new Set([...WORD_SET].map(squeeze).filter((w) => !['niger', 'conard', 'fagot', 'petase', 'pute'].includes(w)));
// Expressions autorisées, retirées du texte avant la recherche (le groupe Suprême NTM, le groupe
// Pussy Riot) : « ntm » seul ou « Suprême NTM fdp » restent refusés.
const ALLOWED_PHRASES = ['supreme ntm', 'pussy riot'];
const PHRASE_LIST = PHRASES.map(normalizeForFilter);
// Mots assez longs pour être cherchés aussi lettres collées (« c.o.n.n.a.r.d », « s a l o p e »)
const SPELLED = [...WORD_SET].filter((w) => w.length >= 6);

/** Vrai si le texte, tel quel, contient un terme bloqué. */
function matchesBlockedTerm(text) {
  let norm = ` ${normalizeForFilter(text)} `;
  for (const a of ALLOWED_PHRASES) {
    while (norm.includes(` ${a} `)) norm = norm.replace(` ${a} `, ' ');
  }
  norm = norm.trim();
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

// Mot coupé par un tiret, un tiret bas, un astérisque ou un point suivi d'une minuscule
// (« con-nard », « sal_ope », « con.nard ») : recollé, puis vérifié une seconde fois. Jamais les
// espaces ni les apostrophes (« le chat te voit » ne doit pas devenir « chatte »), ni un point suivi
// d'une majuscule (fin de phrase sans espace).
const JOINED_WORD = /([\p{L}\d@$€])(?:[-_*]+|\.(?=\p{Ll}))(?=[\p{L}\d@$€])/gu;

/** Vrai si le texte contient un terme bloqué. */
export function hasObjectionableContent(text) {
  if (matchesBlockedTerm(text)) return true;
  const raw = String(text || '');
  const joined = raw.replace(JOINED_WORD, '$1');
  return joined !== raw && matchesBlockedTerm(joined);
}

export const OBJECTIONABLE_MESSAGE =
  'Ce texte contient des mots interdits par les règles de la communauté (insultes, propos haineux ou choquants). Modifiez-le pour pouvoir le publier.';

/** Message d'erreur à afficher si `text` doit être refusé, sinon `null`. */
export function contentFilterError(text) {
  return hasObjectionableContent(text) ? OBJECTIONABLE_MESSAGE : null;
}
