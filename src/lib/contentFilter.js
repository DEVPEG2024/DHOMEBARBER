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
  'chinetoque', 'nigger', 'nigga', 'faggot', 'tranny',
  // Sexuel explicite
  'branlette', 'branleur', 'porno', 'porn', 'nudes', 'sodomie',
  'fuck', 'fucking', 'motherfucker', 'bitch', 'cunt', 'whore', 'slut', 'pussy', 'cock',
  // Menaces
  'kys',
];

// Expressions bloquées (comparées sur le texte normalisé, mots séparés par une espace)
const PHRASES = [
  'nique ta mere', 'niquer ta mere', 'ta mere la pute', 'fils de pute', 'fille de pute',
  'va te faire foutre', 'va te faire enculer', 'je vais te tuer', 'je vais te buter',
  'je vais te defoncer', 'je vais te niquer', 'va crever sale', 'va donc crever', 'allez crever',
  'je vais t egorger', 'je vais te casser la gueule',
  'nique ta race', 'nique tes morts', 'nique sa mere', 'nik ta mere',
  // Propos racistes : le mot seul est ordinaire (« un resto chinois », « le noir te va bien »), bloqué dans l'insulte
  'sale arabe', 'sale juif', 'sale juive', 'sale noir', 'sale feuj', 'sale rebeu', 'sale renoi', 'sale musulman',
  'sale gitan', 'sale chinois', 'sale singe',
  'kill yourself', 'go die', 'suck my cock', 'suck my dick', 'big cock', 'my cock',
  // Mots ordinaires ou noms de famille hors insulte, bloqués seulement dans ces tournures
  'sale pedale', 'grosse pedale', 'sale tapette', 'grosse tapette', 'sale batard', 'espece de batard',
  'espece de salaud', 'sale salaud', 'gros salaud', 'espece de conard', 'suce ma bite', 'grosse bite',
  'sale enfoire', 'sale enfoiree', 'espece d enfoire', 'espece d enfoiree', 'gros enfoire', 'pauvre enfoire',
  'bande d enfoires', 't es un enfoire', 'tu es un enfoire',
  'sale bamboula', 'gros bamboula', 'espece de bamboula',
  'sale negre', 'sale negro', 'sale negresse', 'gros negre', 'sale race de negre',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '€': 'e' };

// Caractères invisibles retirés avant tout (espace sans largeur U+200B, tiret conditionnel U+00AD,
// marques de direction, remplissages Hangul) : « sa​lope » s'affiche comme « salope ».
const stripInvisible = (s) => String(s || '').replace(/[\p{Cf}­͏ᅟᅠㅤﾠ]/gu, '');

/** Texte comparable : minuscules, sans accents, « leet » remplacé, triples lettres ramenées à deux. */
export function normalizeForFilter(text) {
  return stripInvisible(text)
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
// Pussy Riot, le nom de famille De Cock) : « ntm » seul, « Suprême NTM fdp » ou « De Cock cock »
// restent refusés.
const ALLOWED_PHRASES = ['supreme ntm', 'pussy riot', 'de cock'];
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

// Menaces à l'impératif (« tue toi », « suicide toi », « va crever ») : bloquées avec un trait d'union,
// et partout ailleurs dans le texte, sauf tournures sûres contrôlées autour de chaque occurrence :
// sujet devant (« on va crever », « il va crever », « ça tue toi aussi »), pronom complément devant
// « tue » (« ça me tue toi », indicatif), groupe nominal devant (« mon pneu va crever », « l'app va
// crever »), « va crever de chaud / de froid / de rire », « crever l'abcès ». « Crève, sale … » n'est
// bloqué que si « crève » ouvre le segment (« Pneu crevé, sale journée » passe).
// Le texte brut est découpé sur la ponctuation, virgule comprise (« elle tue, toi tu dors » reste
// permis), puis les amorces de tête (« mais », « franchement », « ta gueule »…) sont retirées en boucle.
// Limites connues (refusés à tort) : un nom propre ou un groupe de plus de deux mots devant
// « va crever » (« Kevin va crever de jalousie », « Mon grand-père va crever », « Mon vieux téléphone
// va crever ») ; « Crevé, sale journée » en tête de segment (accents retirés : crevé = crève).
const THREAT_LEADS = ['mais', 'et', 'allez', 'aller', 'alors', 'bon', 'ben', 'bah', 'oh', 'eh', 'hey', 'ouais', 'toi', 'mec', 'frere',
  'franchement', 'serieux', 'serieusement', 'stp', 'ta gueule', 'je te le dis', 'je te dis', 'vas y', 'va y'];
const THREAT_SUBJECTS = new Set(['il', 'elle', 'on', 'ca', 'ce', 'cela', 'qui', 'ils', 'elles']);
const THREAT_DETERMINERS = new Set(['mon', 'ma', 'ton', 'ta', 'son', 'sa', 'le', 'la', 'un', 'une', 'ce', 'cette', 'notre', 'votre', 'leur',
  'l', 'cet', 'du', 'au', 'des', 'les', 'mes', 'tes', 'ses', 'nos', 'vos', 'leurs', 'aux']);
// Pronom complément devant « tue » : indicatif (« ça me tue toi »), jamais l'impératif (« tue-toi »).
// Sauf « ferme-la tue toi », « ferme le tue toi » : « la » / « le » y suivent un impératif.
const THREAT_OBJECTS = new Set(['me', 'm', 'te', 't', 'nous', 'vous', 'le', 'la', 'les', 'l', 'lui']);
// Seules tournures tolérées derrière « va crever de » (« va crever de faim », « de ta belle mort » : bloqués)
const CREVER_OK = new Set(['chaud', 'froid', 'rire']);
function matchesImperativeThreat(text) {
  const raw = stripInvisible(text);
  if (/(^|[^\p{L}])(tue|suicide)[-‐–]toi(?![\p{L}])/iu.test(raw.normalize('NFD').replace(/\p{M}/gu, ''))) return true;
  const segments = raw.split(/[.!?…\n,;:«»"“”()]+/).map(normalizeForFilter);
  return segments.some((s, k) => {
    let n = s;
    for (let again = true; again;) {
      again = false;
      for (const l of THREAT_LEADS) if (n.startsWith(`${l} `)) { n = n.slice(l.length + 1); again = true; }
    }
    // « Crève sale chien », « Crève, sale chien » : « crève » ouvre le segment, « sale » suit
    if (n === 'creve' || n.startsWith('creve ')) {
      if (`${n} `.startsWith('creve sale ')) return true;
      const next = segments.slice(k + 1).find(Boolean);
      if (n === 'creve' && next && `${next} `.startsWith('sale ')) return true;
    }
    const t = n.split(' ').filter(Boolean);
    for (let i = 0; i < t.length - 1; i++) {
      const prev = t[i - 1];
      if ((t[i] === 'tue' || t[i] === 'suicide') && t[i + 1] === 'toi') {
        if (t[i] === 'tue' && THREAT_SUBJECTS.has(prev)) continue; // « elle tue toi… », « ça tue toi aussi »
        if (t[i] === 'tue' && THREAT_OBJECTS.has(prev) && !(/^ferm/.test(t[i - 2] || '') && /^l/.test(prev))) continue; // « ça me tue toi »
        return true;
      }
      if (t[i] === 'va' && t[i + 1] === 'crever') {
        if (THREAT_SUBJECTS.has(prev)) continue; // « on va crever », « il va crever »
        if (prev && prev !== 'gueule' && THREAT_DETERMINERS.has(t[i - 2])) continue; // « mon pneu va crever »
        if (t[i + 2] === 'de' && CREVER_OK.has(t[i + 3])) continue; // « va crever de chaud »
        if (t[i + 2] === 'l' && t[i + 3] === 'abces') continue; // « qui va crever l'abcès »
        return true;
      }
    }
    return false;
  });
}

/** Vrai si le texte contient un terme bloqué. */
export function hasObjectionableContent(text) {
  const raw = stripInvisible(text);
  if (matchesBlockedTerm(raw) || matchesImperativeThreat(raw)) return true;
  const joined = raw.replace(JOINED_WORD, '$1');
  return joined !== raw && (matchesBlockedTerm(joined) || matchesImperativeThreat(joined));
}

export const OBJECTIONABLE_MESSAGE =
  'Ce texte contient des mots interdits par les règles de la communauté (insultes, propos haineux ou choquants). Modifiez-le pour pouvoir le publier.';

/** Message d'erreur à afficher si `text` doit être refusé, sinon `null`. */
export function contentFilterError(text) {
  return hasObjectionableContent(text) ? OBJECTIONABLE_MESSAGE : null;
}
