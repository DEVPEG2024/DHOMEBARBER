/**
 * Données simulées du faux serveur : salon, trois barbers, prestations, comptes, rendez-vous,
 * avis, produits. Une copie neuve est fabriquée pour chaque test (les écritures d'un test ne
 * débordent jamais sur le suivant). Toutes les dates partent du jour de référence (`jour(n)`).
 */
import { jour, MAINTENANT } from './temps.js';

export const MOT_DE_PASSE = 'MotDePasse123';

export const CLIENT = {
  id: 'user-client',
  email: 'client.test@dhomebarber.fr',
  full_name: 'Camille Test',
  phone: '0611223344',
  role: 'user',
};

export const ADMIN = {
  id: 'user-admin',
  email: 'admin.test@dhomebarber.fr',
  full_name: 'Admin Test',
  phone: '0600000000',
  role: 'admin',
};

export const SALON_TELEPHONE = '06 66 08 36 05';

/** Horaires identiques sept jours sur sept : aucun test ne dépend du jour où il est lancé. */
const SEPT_SUR_SEPT = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map((j) => [j, { start: '09:00', end: '19:00', closed: false }]),
);
const OUVERTURE_SALON = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map((j) => [j, { open: '09:00', close: '19:00', closed: false }]),
);

const ANCIEN = '2026-01-15T10:00:00.000Z';

export const BARBERS = {
  dom: { id: 'emp-dom', name: 'Dom', title: 'DOM', sort_order: 1, color: '#2d9f63' },
  kevin: { id: 'emp-kevin', name: 'Kevin', title: 'KVB', sort_order: 2, color: '#3b82f6' },
  romain: { id: 'emp-romain', name: 'Romain', title: 'ROM', sort_order: 3, color: '#f59e0b' },
};

export const PRESTATIONS = {
  coupe: { id: 'srv-coupe', name: 'Coupe', price: 25, duration: 30, sort_order: 1 },
  coupeBarbe: { id: 'srv-coupe-barbe', name: 'Coupe + Barbe', price: 35, duration: 45, sort_order: 2 },
  barbe: { id: 'srv-barbe', name: 'Barbe', price: 15, duration: 20, sort_order: 3 },
  enfant: { id: 'srv-enfant', name: 'Coupe enfant', price: 18, duration: 30, sort_order: 4 },
  rasage: { id: 'srv-rasage', name: "Rasage à l'ancienne", price: 20, duration: 30, sort_order: 5 },
  contours: { id: 'srv-contours', name: 'Contours', price: 10, duration: 15, sort_order: 6 },
  soin: { id: 'srv-soin', name: 'Soin du visage', price: 25, duration: 30, sort_order: 7 },
  couleur: { id: 'srv-couleur', name: 'Coloration', price: 45, duration: 60, sort_order: 8 },
};

/** Photo des réalisations (`/api/media/<uuid>`, servie par le faux serveur : image de couleur). */
export const media = (n) => `https://dhomebarber-api-3aabb8313cb6.herokuapp.com/api/media/aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Réalisations des barbers (looks, 21 oct. 2026). Kevin : un look de trois prestations, un look
 * d'une prestation rangé à l'ancienne (`service_id` seul, comme l'enregistraient les apps d'avant
 * les looks), un look enfant et une photo sans prestation. Romain : un look barbe. Dom : aucune.
 */
export const LOOKS = {
  kevinComplet: { url: media(1), caption: 'Dégradé, barbe et couleur', service_ids: ['srv-couleur', 'srv-coupe', 'srv-barbe'], service_id: 'srv-couleur' },
  kevinDegrade: { url: media(2), caption: 'Dégradé à blanc', service_id: 'srv-coupe' },
  kevinEnfant: { url: media(3), caption: 'Étoile pour les petits', service_ids: ['srv-enfant'], service_id: 'srv-enfant' },
  kevinSansPrestation: { url: media(4), caption: '' },
  romainBarbe: { url: media(5), caption: 'Barbe sculptée', service_ids: ['srv-barbe', 'srv-contours'], service_id: 'srv-barbe' },
};
/** Clé de lien d'une photo (`lookKeyOf` de src/lib/barberGallery.js : l'uuid du média). */
export const cleLook = (look) => look.url.split('/').pop();
const GALERIES = {
  'emp-kevin': [LOOKS.kevinComplet, LOOKS.kevinDegrade, LOOKS.kevinEnfant, LOOKS.kevinSansPrestation],
  'emp-romain': [LOOKS.romainBarbe],
};

/** Ligne de prestation telle que le serveur la range dans un rendez-vous. */
const ligne = (p) => ({ service_id: p.id, name: p.name, duration: p.duration, price: p.price });

/** Heure de fin d'un créneau. */
function fin(debut, minutes) {
  const [h, m] = debut.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Rendez-vous complet (mêmes colonnes que la table `appointments`). */
export function rendezVous({ id, client = null, barber, prestations, date, debut, statut = 'confirmed', ...reste }) {
  const duree = prestations.reduce((s, p) => s + p.duration, 0);
  return {
    id,
    client_name: client?.full_name ?? '',
    client_email: client?.email ?? null,
    client_phone: client?.phone ?? '',
    employee_id: barber.id,
    employee_name: barber.name,
    services: prestations.map(ligne),
    date,
    start_time: debut,
    end_time: fin(debut, duree),
    total_duration: duree,
    total_price: prestations.reduce((s, p) => s + p.price, 0),
    status: statut,
    notes: '',
    internal_notes: '',
    payment_method: null,
    tip: 0,
    tip_method: null,
    product_sold: null,
    product_price: 0,
    grand_total: null,
    gift_card_amount: 0,
    cancellation_reason: null,
    attended_at: null,
    created_date: `${jour(-20)}T09:00:00.000Z`,
    ...reste,
  };
}

const AUTRE_CLIENT = { full_name: 'Jules Martin', email: 'jules.martin@exemple.fr', phone: '0622334455' };
const TROISIEME_CLIENT = { full_name: 'Nina Roche', email: 'nina.roche@exemple.fr', phone: '0633445566' };

/** Rendez-vous connus, réutilisés par les tests (identifiants stables). */
export const RDV = {
  /** Visite passée du client avec Kevin : « barber habituel » de la réservation. */
  passeKevin: () => rendezVous({
    id: 'apt-passe-kevin', client: CLIENT, barber: BARBERS.kevin, prestations: [PRESTATIONS.coupe],
    date: jour(-14), debut: '11:00', statut: 'completed', payment_method: 'cb',
  }),
  /** Aujourd'hui 17 h avec Romain : dans le délai de 24 h, plus annulable en ligne. */
  procheRomain: () => rendezVous({
    id: 'apt-proche-romain', client: CLIENT, barber: BARBERS.romain, prestations: [PRESTATIONS.barbe],
    date: jour(0), debut: '17:00',
  }),
  /** Dans six jours avec Kevin : hors délai, annulable et déplaçable. */
  lointainKevin: () => rendezVous({
    id: 'apt-lointain-kevin', client: CLIENT, barber: BARBERS.kevin, prestations: [PRESTATIONS.coupeBarbe],
    date: jour(6), debut: '15:00',
  }),
  /** Agenda du jour : un client chez Dom à 11 h. */
  domJules: () => rendezVous({
    id: 'apt-dom-jules', client: AUTRE_CLIENT, barber: BARBERS.dom, prestations: [PRESTATIONS.coupe],
    date: jour(0), debut: '11:00',
  }),
  /** Agenda du jour : une cliente chez Kevin à 14 h. */
  kevinNina: () => rendezVous({
    id: 'apt-kevin-nina', client: TROISIEME_CLIENT, barber: BARBERS.kevin, prestations: [PRESTATIONS.coupeBarbe],
    date: jour(0), debut: '14:00',
  }),
};

// ─── Fil « New Gang » v2 (30 oct. 2026) ───

/** Logo du salon : avatar des contenus de l'admin (publiés au nom de « D'Home Barber »). */
export const LOGO_SALON = '/icons/icon-192.png';

/**
 * Membres du Gang simulés (auteurs et acteurs du fil), sans compte de connexion sauf `salon`
 * (l'admin, qui écrit au nom du salon) et `camille` (le client de test).
 */
export const MEMBRES = {
  yanis: { email: 'yanis.k@exemple.fr', name: 'Yanis K.', role: 'user', photo_url: media(31) },
  lucas: { email: 'lucas.m@exemple.fr', name: 'Lucas M.', role: 'user', photo_url: null },
  sarah: { email: 'sarah.k@exemple.fr', name: 'Sarah K.', role: 'user', photo_url: media(32) },
  mehdi: { email: 'mehdi.a@exemple.fr', name: 'Mehdi A.', role: 'user', photo_url: null },
  kevin: { email: 'kevin@dhomebarber.fr', name: 'Kevin', role: 'barber', photo_url: null },
  salon: { email: ADMIN.email, name: "D'Home Barber", role: 'admin', photo_url: LOGO_SALON },
  camille: { email: CLIENT.email, name: CLIENT.full_name, role: 'user', photo_url: null },
};

/** Instant ISO `minutes` avant l'heure figée des tests (mardi 10 h, Paris). */
export const ilYaMin = (minutes) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

/**
 * Publication du fil telle que le serveur la range (table `posts`) : `kind` NULL pour une
 * publication ordinaire, `meta` selon le format (contrat, section 2). `minutes` : âge.
 */
export function publicationFil({ id, auteur = MEMBRES.yanis, kind = null, content = '', image_url = null, meta = null, minutes = 30, ...reste }) {
  return {
    id,
    kind,
    author_email: auteur.email,
    author_name: auteur.name,
    author_role: auteur.role,
    author_photo_url: auteur.photo_url,
    content,
    image_url,
    meta,
    created_at: ilYaMin(minutes),
    ...reste,
  };
}

/** Sondage du salon (`kind = 'poll'`), ouvert `jours` jours à partir de sa publication. */
export function sondageFil({ id, question, reponses, jours = 3, minutes = 60, ...reste }) {
  const debut = MAINTENANT.getTime() - minutes * 60_000;
  return publicationFil({
    id,
    auteur: MEMBRES.salon,
    kind: 'poll',
    minutes,
    content: `📊 Sondage : ${question}`,
    meta: {
      question,
      options: reponses.map((label, i) => ({ id: 'abcd'[i], label })),
      ends_at: new Date(debut + jours * 86_400_000).toISOString(),
    },
    ...reste,
  });
}

/**
 * Look d'un client (`kind = 'look'`) : `content` en base = texte de repli, le mot de l'auteur dans
 * `meta.caption` ; barber et prestations relus de la visite par le serveur (jamais de prix).
 */
export function lookFil({ id, auteur = MEMBRES.sarah, mot = '', images = [media(61)], barber = BARBERS.kevin, prestations = [PRESTATIONS.coupe], reservable = true, minutes = 45, ...reste }) {
  const noms = prestations.map((p) => p.name);
  return publicationFil({
    id,
    auteur,
    kind: 'look',
    minutes,
    image_url: images[0],
    content: [mot, `✂️ ${noms.join(' + ')} avec ${barber.name}`].filter(Boolean).join('\n\n'),
    meta: {
      ...(images.length > 1 ? { images } : {}),
      caption: mot,
      employee_id: barber.id,
      employee_name: barber.name,
      service_ids: prestations.map((p) => p.id),
      service_names: noms,
      bookable: reservable,
    },
    ...reste,
  });
}

/** Avant / Après d'un client : `image_url` = la photo « après », `meta.images` = [avant, après]. */
export function avantApresFil({ id, auteur = MEMBRES.lucas, mot = '', avant = media(71), apres = media(72), minutes = 50, ...reste }) {
  return publicationFil({
    id,
    auteur,
    kind: 'before_after',
    minutes,
    image_url: apres,
    content: [mot, '↔️ Avant / Après'].filter(Boolean).join('\n\n'),
    meta: { images: [avant, apres], caption: mot, employee_id: null, employee_name: null },
    ...reste,
  });
}

/** Moment du Gang : publication du salon sans email d'auteur, au sujet d'un membre. */
export function momentFil({ id, membre = 'Mehdi', niveau = 'or', libelle = 'Or', minutes = 70, ...reste }) {
  return publicationFil({
    id,
    auteur: { ...MEMBRES.salon, email: null },
    kind: 'moment',
    minutes,
    content: `${membre} passe ${libelle} sur sa carte Gang 👏`,
    meta: { type: 'tier_up', tier: niveau, tier_label: libelle, member_name: membre, member_photo_url: null },
    ...reste,
  });
}

/** Réaction (`post_likes`) d'un membre sur une publication. */
let compteurReaction = 0;
export function reactionFil(postId, membre, reaction = '🔥') {
  compteurReaction += 1;
  return { id: `like-${compteurReaction}`, post_id: postId, user_email: membre.email, reaction, created_at: ilYaMin(10) };
}

/** Commentaire (`post_comments`) ; `parent_id` pour une réponse (un seul niveau). */
export function commentaireFil({ id, post_id, de = MEMBRES.lucas, content, parent_id = null, minutes = 20 }) {
  return {
    id,
    post_id,
    parent_id,
    author_email: de.email,
    author_name: de.name,
    author_role: de.role,
    author_photo_url: de.photo_url,
    content,
    created_at: ilYaMin(minutes),
  };
}

/** Signalement en attente (`post_reports`), tel que l'admin le lit. */
export function signalementFil({ id, post_id = null, comment_id = null, par = MEMBRES.lucas, contre = MEMBRES.yanis, raison = 'Spam ou publicité', extrait = '', minutes = 30 }) {
  return {
    id,
    post_id,
    comment_id,
    reporter_email: par.email,
    reporter_name: par.name,
    reported_name: contre.name,
    reason: raison,
    details: null,
    content_snapshot: extrait,
    status: 'pending',
    created_at: ilYaMin(minutes),
  };
}

/**
 * Ligne d'activité (`feed_activity`) pour le client de test : `de` = membre auteur du geste.
 * `lu` : déjà lue. Types : reaction, comment, reply, comment_like, moment, visit_invite.
 */
let compteurActivite = 0;
export function activiteFil({ type, de = MEMBRES.yanis, pour = CLIENT.email, post_id = null, comment_id = null, appointment_id = null, emoji = null, excerpt = null, minutes = 15, lu = false, ...reste }) {
  compteurActivite += 1;
  return {
    id: reste.id || `act-${compteurActivite}`,
    recipient_email: pour,
    type,
    post_id,
    comment_id,
    appointment_id,
    actor_email: de?.email ?? null,
    actor_name: de?.name ?? null,
    actor_role: de?.role ?? null,
    actor_photo_url: de?.photo_url ?? null,
    emoji,
    excerpt,
    created_at: ilYaMin(minutes),
    read_at: lu ? ilYaMin(Math.max(0, minutes - 1)) : null,
    pushed_at: null,
    ...reste,
  };
}

/** Fabrique une copie neuve des données. */
export function creerDonnees() {
  const employes = Object.values(BARBERS).map((b) => ({
    ...b,
    bio: `${b.name}, barber du salon.`,
    email: `${b.name.toLowerCase()}@dhomebarber.fr`,
    phone: '',
    photo_url: null,
    working_hours: structuredClone(SEPT_SUR_SEPT),
    permissions: [],
    skills: {},
    experience_level: 80,
    gallery: structuredClone(GALERIES[b.id] || []),
    is_active: true,
    is_hidden: false,
    created_at: ANCIEN,
  }));

  const prestations = Object.values(PRESTATIONS).map((p) => ({
    ...p,
    description: `${p.name} au salon.`,
    category_id: null,
    is_active: true,
    created_at: ANCIEN,
  }));

  return {
    comptes: [
      { ...CLIENT, motDePasse: MOT_DE_PASSE, birth_date: null, photo_url: null, created_date: ANCIEN },
      { ...ADMIN, motDePasse: MOT_DE_PASSE, birth_date: null, photo_url: null, created_date: ANCIEN },
    ],
    tables: {
      SalonSettings: [{
        id: 'settings-1',
        salon_name: "D'Home Barber",
        tagline: 'Premium BarberShop',
        description: 'Salon de coiffure pour hommes à Douvaine.',
        phone: SALON_TELEPHONE,
        email: 'contact@dhomebarber.fr',
        address: '3 Rue du Bois Arquet',
        city: 'Douvaine',
        opening_hours: structuredClone(OUVERTURE_SALON),
        cancellation_hours: 24,
        require_deposit: false,
        deposit_percentage: 0,
        homepage_order: null,
        // Catégories masquées par l'admin (« Organiser l'accueil ») : serveur à jour, rien de masqué
        homepage_hidden: [],
        comeback_weeks: 5,
      }],
      Employee: employes,
      Service: prestations,
      ServiceCategory: [],
      SkillCategory: [],
      Appointment: [
        RDV.passeKevin(), RDV.procheRomain(), RDV.lointainKevin(), RDV.domJules(), RDV.kevinNina(),
      ],
      TimeOff: [],
      Event: [],
      Review: [
        {
          id: 'rev-1', client_name: 'Jules M.', client_email: AUTRE_CLIENT.email, rating: 5,
          comment: 'Coupe parfaite, accueil au top.', employee_name: 'Dom', is_visible: true,
          created_date: `${jour(-5)}T12:00:00.000Z`,
        },
        {
          id: 'rev-2', client_name: 'Nina R.', client_email: TROISIEME_CLIENT.email, rating: 4,
          comment: 'Très bon dégradé.', employee_name: 'Kevin', is_visible: true,
          created_date: `${jour(-9)}T12:00:00.000Z`,
        },
      ],
      Product: [
        {
          id: 'prd-cire', name: 'Cire coiffante', price: 18, description: 'Tenue forte, fini mat.',
          image_url: null, images: [], brand: 'DHB', category: 'coiffant', stock: 12, ref: 'CIRE-01',
          critical_stock: 2, stock_type: 'boutique', is_active: true, created_at: ANCIEN,
        },
        {
          id: 'prd-huile', name: 'Huile à barbe', price: 22, description: 'Nourrit et adoucit la barbe.',
          image_url: null, images: [], brand: 'DHB', category: 'barbe', stock: 8, ref: 'HUILE-01',
          critical_stock: 2, stock_type: 'boutique', is_active: true, created_at: ANCIEN,
        },
      ],
      Order: [],
      Post: [],
      PostLike: [],
      PostComment: [],
      GiftCard: [],
      Partner: [],
      CleaningSchedule: [],
      CleaningTask: [],
      UserBlock: [],
      Feedback: [],
      SalonEvent: [],
      SalonEventInvite: [],
      TextileDrop: [],
      TextileConcept: [],
      TextileReservation: [],
      PostReport: [],
    },
    /**
     * Fil v2 : tables sans entité du serveur (contrat, section 2). `activite` = `feed_activity`
     * (lignes de `activiteFil`), `votes` = `post_poll_votes`, `likesCommentaires` = `comment_likes` ;
     * par email (minuscules) : `reglages` = `users.feed_prefs`, `vuLe` = `users.feed_seen_at` (ISO) ;
     * `vues` : nombre de membres qui ont vu chaque publication (par id).
     */
    fil: { activite: [], votes: [], likesCommentaires: [], reglages: {}, vuLe: {}, vues: {} },
    /** Réponse de `GET /api/apps/public/prod/public-settings/by-id/prod`. */
    parametresPublics: {
      id: 'prod',
      name: 'D Home Barber',
      features: {
        booking: true,
        products: true,
        reviews: true,
        hairUltra: false,
        aiWriter: false,
        snapLenses: false,
        orderCancel: true,
        appointmentCancelReason: true,
        orderCancelStatuses: ['pending', 'confirmed'],
        splitPayment: true,
        guestBooking: true,
        appleWallet: false,
        googleWallet: false,
        // Fil « New Gang » v2 servi (routes /feed… du faux serveur) ; `false` : l'ancien fil par les entités
        feedV2: true,
        // Sondages ouverts aux clients et aux barbers ; `false` : serveur plus ancien (salon seul, 403)
        feedMemberPolls: true,
      },
      popular_services: [],
      snap: null,
      public: true,
    },
  };
}
