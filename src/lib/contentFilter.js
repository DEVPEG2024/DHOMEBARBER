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
  'je vais t egorger', 'je vais te casser la gueule', 'je vais te crever', 'j vais te tuer',
  // Slogans haineux : jamais « mort aux » seul (« mort aux rats », le produit)
  'mort aux juifs', 'mort aux arabes', 'mort aux noirs', 'mort aux musulmans', 'mort aux pedes', 'mort aux homos',
  'mort aux gays', 'mort aux blancs',
  'nique ta race', 'nique tes morts', 'nique sa mere', 'nik ta mere',
  // Propos racistes : le mot seul est ordinaire (« un resto chinois », « le noir te va bien »), bloqué dans l'insulte
  'sale arabe', 'sale juif', 'sale juive', 'sale noir', 'sale feuj', 'sale rebeu', 'sale renoi', 'sale musulman',
  'sale gitan', 'sale chinois', 'sale singe', 'sale bicot',
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

// Lettres cyrilliques et grecques proches d'une lettre latine (« sаlope » avec un a cyrillique).
// NFKD (appliqué avant) ramène déjà la pleine chasse, les lettres mathématiques et cerclées.
const HOMOGLYPHS = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'і': 'i',
  'α': 'a', 'ε': 'e', 'ο': 'o', 'ρ': 'p', 'ι': 'i' };

/** Texte comparable : minuscules, sans accents, « leet » remplacé, triples lettres ramenées à deux. */
export function normalizeForFilter(text) {
  return stripInvisible(text)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[аеорсхіαεορι]/g, (c) => HOMOGLYPHS[c] || c)
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
// Pluriel et féminin des insultes « sale / gros / grosse / espèce de X » (« sales arabes », « sale
// noire ») : liste explicite générée au chargement, plutôt qu'un retrait automatique du s ou du e
// final dans la recherche, qui, combiné aux lettres doublées réduites, multiplierait les faux positifs
const IRREGULAR_FORMS = {
  juif: ['juive', 'juives'], musulman: ['musulmane', 'musulmanes'], gitan: ['gitane', 'gitanes'],
  chinois: ['chinoise', 'chinoises'],
};
// Pas de variantes pour « bamboula » (« grosse bamboula » = grosse fête)
const NO_VARIANTS = new Set(['bamboula']);
// Couleur : « Une tache sale noire » n'est pas une insulte. Les variantes de « sale noir » ne
// bloquent qu'en tête de texte ou derrière un déterminant / pronom (INSULT_LEADS), jamais derrière
// un nom (« la robe sale noire »). La forme d'origine « sale noir » bloque partout, comme avant.
const COLOR_WORDS = new Set(['noir']);
const INSULT_LEADS = new Set(['les', 'des', 'ces', 'une', 'un', 'la', 'le', 'l', 'cette', 'ce', 'cet', 't', 'es', 'tu', 'toi', 'vous',
  'de', 'd', 'que', 'qu', 'sont', 'aux', 'mes', 'tes', 'ses', 'nos', 'vos', 'leurs', 'tous', 'toutes', 'ma', 'ta', 'sa', 'mon', 'ton', 'son']);
/** Variantes { text, base } d'une insulte « sale / gros / grosse / espèce de X » (rien d'autre). */
function insultVariants(phrase) {
  const w = phrase.split(' ');
  const firsts = { sale: ['sale', 'sales'], gros: ['gros', 'grosse', 'grosses'], grosse: ['grosse', 'grosses'] }[w[0]]
    || (w[0] === 'espece' && ['de', 'd'].includes(w[1]) ? [w[0]] : null);
  const last = w[w.length - 1];
  if (!firsts || w.length < 2 || NO_VARIANTS.has(last)) return [];
  const lasts = [last, `${last}s`, `${last}e`, `${last}es`, ...(IRREGULAR_FORMS[last] || [])];
  const out = [];
  for (const f of firsts) for (const l of lasts) out.push({ text: [f, ...w.slice(1, -1), l].join(' '), base: last });
  return out;
}
const PHRASE_NORMS = PHRASES.map(normalizeForFilter);
const PHRASE_VARIANTS = PHRASE_NORMS.flatMap(insultVariants).filter((v) => !PHRASE_NORMS.includes(v.text));
const PHRASE_LIST = [...new Set([...PHRASE_NORMS,
  ...PHRASE_VARIANTS.filter((v) => !COLOR_WORDS.has(v.base)).map((v) => v.text)])];
const CONTEXT_VARIANTS = [...new Set(PHRASE_VARIANTS.filter((v) => COLOR_WORDS.has(v.base)).map((v) => v.text))]
  .map((text) => text.split(' '));
// Mots ordinaires que la réduction des lettres doublées ne doit pas ramener sur une insulte :
// « salle noire » n'est pas « sale noire »
const SQUEEZE_KEEP = new Set(['salle', 'salles']);
// Vrais noms de famille homonymes d'un mot bloqué (Bicot, Cock, Cockx…) : acceptés dans un nom de
// compte (hasObjectionableName), toujours refusés dans une publication ou un avis
const NAME_HOMONYMS = new Set(['bicot', 'cock']);
const isNameHomonym = (t) => NAME_HOMONYMS.has(t) || NAME_HOMONYMS.has(squeeze(t))
  || ((t.endsWith('s') || t.endsWith('x')) && NAME_HOMONYMS.has(t.slice(0, -1)));
// Mots assez longs pour être cherchés aussi lettres collées (« c.o.n.n.a.r.d », « s a l o p e »)
const SPELLED = [...WORD_SET].filter((w) => w.length >= 6);

/**
 * Vrai si le texte, tel quel, contient un terme bloqué. `opts.name` : nom de compte (homonymes de
 * NAME_HOMONYMS ignorés comme mots seuls, les expressions restent actives) ; `opts.phrasesOnly` :
 * expressions seulement (mot court à lettre masquée, « fils de p*te » oui, « p*te » seul non).
 */
function matchesBlockedTerm(text, opts = {}) {
  let norm = ` ${normalizeForFilter(text)} `;
  for (const a of ALLOWED_PHRASES) {
    while (norm.includes(` ${a} `)) norm = norm.replace(` ${a} `, ' ');
  }
  norm = norm.trim();
  if (!norm) return false;
  const tokens = norm.split(' ');
  const blocked = (t) => WORD_SET.has(t) || SQUEEZED_SET.has(squeeze(t));
  if (!opts.phrasesOnly) {
    for (const t of tokens) {
      if (opts.name && isNameHomonym(t)) continue;
      if (blocked(t)) return true;
      // Pluriels simples : connards, salopes, enculés
      if (t.length > 3 && (t.endsWith('s') || t.endsWith('x')) && blocked(t.slice(0, -1))) return true;
    }
  }
  const spaced = ` ${norm} `;
  const squeezed = ` ${tokens.map((t) => (SQUEEZE_KEEP.has(t) ? t : squeeze(t))).join(' ')} `;
  if (PHRASE_LIST.some((p) => spaced.includes(` ${p} `) || squeezed.includes(` ${p.split(' ').map(squeeze).join(' ')} `))) return true;
  // Variantes de couleur (« sales noirs », « sale noire ») : en tête ou derrière INSULT_LEADS
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0 && !INSULT_LEADS.has(tokens[i - 1])) continue;
    if (CONTEXT_VARIANTS.some((v) => v.every((w, j) => tokens[i + j] === w))) return true;
  }
  if (opts.phrasesOnly) return false;
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
// bloqué que si « crève » ouvre le segment (« Pneu crevé, sale journée » passe), et jamais « crevé »
// accentué tel qu'écrit (« Crevé, sale journée » : fatigué).
// Le texte brut est découpé sur la ponctuation, virgule comprise (« elle tue, toi tu dors » reste
// permis), puis les amorces de tête (« mais », « franchement », « ta gueule »…) sont retirées en boucle.
// Limites connues (refusés à tort) : un nom propre ou un groupe de plus de deux mots devant
// « va crever » (« Kevin va crever de jalousie », « Mon grand-père va crever », « Mon vieux téléphone
// va crever ») ; un être désigné par l'/cet/les/du… devant « va crever », sauf un objet de
// CREVER_THINGS (« L'écran va crever » passe, « L'arabe va crever » non) ; « Crevé sale chien » sans
// virgule (« crevé » accentué est lu comme « fatigué »).
const THREAT_LEADS = ['mais', 'et', 'allez', 'aller', 'alors', 'bon', 'ben', 'bah', 'oh', 'eh', 'hey', 'ouais', 'toi', 'mec', 'frere',
  'franchement', 'serieux', 'serieusement', 'stp', 'ta gueule', 'je te le dis', 'je te dis', 'vas y', 'va y'];
const THREAT_SUBJECTS = new Set(['il', 'elle', 'on', 'ca', 'ce', 'cela', 'qui', 'ils', 'elles']);
const THREAT_DETERMINERS = new Set(['mon', 'ma', 'ton', 'ta', 'son', 'sa', 'le', 'la', 'un', 'une', 'ce', 'cette', 'notre', 'votre', 'leur']);
// Déterminants qui désignent aussi bien une personne (« L'arabe va crever », « Cet abruti va crever ») :
// tolérés seulement devant un objet de CREVER_THINGS (« L'app va crever », « La batterie du téléphone »)
const THREAT_DETERMINERS_THINGS = new Set(['l', 'cet', 'du', 'au', 'des', 'les', 'mes', 'tes', 'ses', 'nos', 'vos', 'leurs', 'aux']);
const CREVER_THINGS = new Set(['app', 'appli', 'application', 'ecran', 'telephone', 'tel', 'portable', 'batterie', 'pneu', 'pneus',
  'ordi', 'ordinateur', 'moteur', 'voiture', 'velo', 'ballon', 'plante', 'plantes']);
// Pronom complément devant « tue » : indicatif (« ça me tue toi »), jamais l'impératif (« tue-toi »).
// « la », « le », « les », « l' » sont ambigus (« Toi là tue toi », « Ferme-la tue toi ») : acceptés
// seulement derrière un sujet (« Je la tue toi », « Ça le tue toi ») ; me, te, nous, vous, lui partout.
const THREAT_OBJECTS = new Set(['me', 'm', 'te', 't', 'nous', 'vous', 'le', 'la', 'les', 'l', 'lui']);
// Seules tournures tolérées derrière « va crever de » (« va crever de faim », « de ta belle mort » : bloqués)
const CREVER_OK = new Set(['chaud', 'froid', 'rire']);
function matchesImperativeThreat(text) {
  const raw = stripInvisible(text);
  if (/(^|[^\p{L}])(tue|suicide|pends?)[-‐–]toi(?![\p{L}])/iu.test(raw.normalize('NFD').replace(/\p{M}/gu, ''))) return true;
  // Segments bruts gardés (accent de « crevé ») ; même découpage, donc mêmes indices
  const rawSegs = raw.split(/[.!?…\n,;:«»"“”()]+/);
  const segments = rawSegs.map(normalizeForFilter);
  return segments.some((s, k) => {
    let n = s;
    for (let again = true; again;) {
      again = false;
      for (const l of THREAT_LEADS) if (n.startsWith(`${l} `)) { n = n.slice(l.length + 1); again = true; }
    }
    // « Crève sale chien », « Crève, sale chien » : « crève » ouvre le segment, « sale » suit.
    // Jamais « Crevé » accentué tel qu'écrit (« Crevé, sale journée » : fatigué)
    const w = (rawSegs[k].normalize('NFC').match(/crev\p{L}*/iu) || [''])[0].toLowerCase();
    if ((n === 'creve' || n.startsWith('creve ')) && w !== 'crevé' && w !== 'crevés') {
      if (`${n} `.startsWith('creve sale ')) return true;
      const next = segments.slice(k + 1).find(Boolean);
      if (n === 'creve' && next && `${next} `.startsWith('sale ')) return true;
    }
    const t = n.split(' ').filter(Boolean);
    for (let i = 0; i < t.length - 1; i++) {
      const prev = t[i - 1];
      // « pends toi » / « pend toi » : mêmes exclusions que « tue toi » ; « pends toi-même le cadre » passe
      const kill = t[i] === 'tue' || t[i] === 'pends' || t[i] === 'pend';
      if ((kill || t[i] === 'suicide') && t[i + 1] === 'toi') {
        if (kill && t[i] !== 'tue' && t[i + 2] === 'meme') continue;
        if (kill && THREAT_SUBJECTS.has(prev)) continue; // « elle tue toi… », « ça tue toi aussi »
        if (kill && THREAT_OBJECTS.has(prev)
          && (!/^l/.test(prev) || ['je', 'j', 'tu', ...THREAT_SUBJECTS].includes(t[i - 2]))) continue; // « ça me tue toi »
        return true;
      }
      if (t[i] === 'va' && t[i + 1] === 'crever') {
        if (THREAT_SUBJECTS.has(prev)) continue; // « on va crever », « il va crever »
        if (prev && prev !== 'gueule' && (THREAT_DETERMINERS.has(t[i - 2])
          || (THREAT_DETERMINERS_THINGS.has(t[i - 2]) && CREVER_THINGS.has(prev)))) continue; // « mon pneu va crever »
        if (t[i + 2] === 'de' && CREVER_OK.has(t[i + 3])) continue; // « va crever de chaud »
        if (t[i + 2] === 'l' && t[i + 3] === 'abces') continue; // « qui va crever l'abcès »
        return true;
      }
      // « Tu vas crever » (sujet « tu » ou en tête) ; « tu vas crever de froid / de rire » passe
      if (t[i] === 'vas' && t[i + 1] === 'crever' && (prev === 'tu' || prev === undefined)) {
        if (t[i + 2] === 'de' && CREVER_OK.has(t[i + 3])) continue;
        return true;
      }
      // « Va te pendre » ; « ça va te pendre au nez » (expression) passe
      if (t[i] === 'va' && t[i + 1] === 'te' && t[i + 2] === 'pendre') {
        if (t[i + 3] === 'au' && t[i + 4] === 'nez') continue;
        return true;
      }
      // « Va mourir sale … » seulement : « on va mourir de rire », « va mourir » seul passent
      if (t[i] === 'va' && t[i + 1] === 'mourir' && t[i + 2] === 'sale' && !THREAT_SUBJECTS.has(prev)) return true;
    }
    return false;
  });
}

// Une seule lettre masquée par « * » au milieu d'un mot (« c*nnard », « enc*lé », « fils de p*te ») :
// remplacée tour à tour par chaque voyelle. Mot de moins de 5 caractères : expressions seulement
// (« la p*te est cuite » passe, « fils de p*te » non). Jamais deux « * » dans le même mot.
const MASKED_WORD = /(?<![\p{L}*])(\p{L}+)\*(\p{L}+)(?![\p{L}*])/gu;
function matchesMaskedLetter(raw, opts = {}) {
  for (const m of raw.matchAll(MASKED_WORD)) {
    const before = raw.slice(0, m.index);
    const after = raw.slice(m.index + m[0].length);
    const phrasesOnly = m[0].length < 5;
    for (const v of 'aeiouy') {
      if (matchesBlockedTerm(`${before}${m[1]}${v}${m[2]}${after}`, { ...opts, phrasesOnly })) return true;
    }
  }
  return false;
}

function objectionable(text, opts) {
  const raw = stripInvisible(text);
  if (matchesBlockedTerm(raw, opts) || matchesImperativeThreat(raw)) return true;
  if (raw.includes('*') && matchesMaskedLetter(raw, opts)) return true;
  const joined = raw.replace(JOINED_WORD, '$1');
  return joined !== raw && (matchesBlockedTerm(joined, opts) || matchesImperativeThreat(joined));
}

/** Vrai si le texte contient un terme bloqué. */
export function hasObjectionableContent(text) {
  return objectionable(text, {});
}

/**
 * Nom de compte (inscription, Paramètres) : comme hasObjectionableContent, mais les vrais noms de
 * famille homonymes d'un mot bloqué (NAME_HOMONYMS : « Lucas Bicot », « Sarah Cock », « Cockx »)
 * passent ; « Big Cock », « Sale Bicot » et les autres mots restent refusés.
 */
export function hasObjectionableName(text) {
  return objectionable(text, { name: true });
}

export const OBJECTIONABLE_MESSAGE =
  'Ce texte contient des mots interdits par les règles de la communauté (insultes, propos haineux ou choquants). Modifiez-le pour pouvoir le publier.';

/** Message d'erreur à afficher si `text` doit être refusé, sinon `null`. */
export function contentFilterError(text) {
  return hasObjectionableContent(text) ? OBJECTIONABLE_MESSAGE : null;
}
