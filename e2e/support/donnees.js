/**
 * Données simulées du faux serveur : salon, trois barbers, prestations, comptes, rendez-vous,
 * avis, produits. Une copie neuve est fabriquée pour chaque test (les écritures d'un test ne
 * débordent jamais sur le suivant). Toutes les dates partent du jour de référence (`jour(n)`).
 */
import { jour } from './temps.js';

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
      },
      popular_services: [],
      snap: null,
      public: true,
    },
  };
}
