// Abonnements au mois (contrat : docs/fonctions/abonnements-contrat.md) : faux serveur des routes
// /subscriptions…, branché par mockApi.js (`api.abonnements`). Mêmes règles et mêmes formes de réponse
// que lib/subscriptions.js du vrai serveur. Les RDV vont dans `tables.Appointment`, les cartes dans
// `tables.GiftCard` : le faux serveur des entités et du débit les relit tels quels.
//
// Aides pour les tests :
//   creer({ client, prestation, barber, jours, heure, statut }) : un abonnement dans l'état voulu
//   (statut `pending` ou `active`), rendu avec sa vue ; `prestation` = ligne de PRESTATIONS_ABONNEMENT ;
//   vue(id), lignes.
import { cleDuJourParis, ajouterJours, instantParis } from './temps.js';

export const VISITES = 4;
export const ECART_MIN_JOURS = 3;
export const DUREE_MAX_JOURS = 35;
export const PLAFOND_A_VENIR = 6;
const NOM_FORMULE = /^\s*4\s*coupes\b/i;

const erreur = (status, code, message, extra = {}) => ({ status, json: { error: message, code, ...extra } });
const cents = (v) => Math.round((Number(v) || 0) * 100);
const numJour = (cle) => {
  const [a, m, j] = String(cle).split('-').map(Number);
  return Date.UTC(a, m - 1, j) / 86400000;
};
const finDe = (debut, duree) => {
  const [h, m] = debut.split(':').map(Number);
  const t = h * 60 + m + duree;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const estOuvert = (a) => ['confirmed', 'pending'].includes(a.status) && !a.payment_method && !(Number(a.gift_card_amount) > 0);

export class FauxAbonnements {
  constructor(serveur) {
    this.serveur = serveur;
    /** Lignes de la table `subscriptions`. */
    this.lignes = [];
    this.suite = 0;
    this.suiteCarte = 0;
  }

  get rdv() { return this.serveur.tables.Appointment || (this.serveur.tables.Appointment = []); }
  get cartes() { return this.serveur.tables.GiftCard || (this.serveur.tables.GiftCard = []); }

  // Heure du faux serveur : le navigateur vit le mardi de référence, jamais la date réelle
  aujourdhui() { return cleDuJourParis(this.serveur.maintenant()); }

  formules() {
    return (this.serveur.tables.Service || [])
      .filter((s) => s.is_active !== false && NOM_FORMULE.test(s.name || '') && Number(s.price) > 0 && Number(s.duration) > 0)
      .map((s) => ({
        service_id: s.id, name: s.name, description: s.description || '', price: Number(s.price),
        unit_price: Math.floor(cents(s.price) / VISITES) / 100, duration: Number(s.duration), visits: VISITES,
      }))
      .sort((a, b) => a.price - b.price);
  }

  carteDe(l) { return l.gift_card_id ? this.cartes.find((c) => String(c.id) === String(l.gift_card_id)) || null : null; }

  restantes(l, carte) {
    if (l.status === 'pending') return l.visits;
    if (l.status !== 'active' || !carte || carte.status === 'expired') return 0;
    const unite = cents(l.unit_price);
    return unite > 0 ? Math.floor(cents(carte.remaining_balance ?? carte.amount) / unite) : 0;
  }

  /** Même forme que `subscriptionView` du serveur. */
  vue(idOuLigne, { equipe = false, avecCode = true } = {}) {
    const l = typeof idOuLigne === 'object' ? idOuLigne : this.lignes.find((x) => String(x.id) === String(idOuLigne));
    if (!l) return null;
    const carte = this.carteDe(l);
    const lignes = this.rdv
      .filter((a) => String(a.subscription_id) === String(l.id) && a.status !== 'cancelled')
      .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
    const restantes = this.restantes(l, carte);
    const validite = carte?.valid_until ? String(carte.valid_until).slice(0, 10) : null;
    const depassee = !!validite && validite < this.aujourdhui();
    const vue = {
      id: l.id, status: l.status, display_status: l.status === 'active' && restantes <= 0 ? 'finished' : l.status,
      service_id: l.service_id, service_name: l.service_name, service_duration: l.service_duration,
      price: l.price, unit_price: l.unit_price, visits: l.visits, visits_left: restantes,
      to_rebook: depassee || !['pending', 'active'].includes(l.status) ? 0 : Math.max(0, restantes - lignes.filter(estOuvert).length),
      outdated: depassee, valid_until: validite, payment_method: l.payment_method || null,
      created_at: l.created_at, validated_at: l.validated_at || null, cancelled_at: l.cancelled_at || null,
      client_name: l.client_name || '',
      card: carte ? {
        id: carte.id, ...(avecCode ? { code: carte.code } : {}), status: carte.status, amount: Number(carte.amount),
        remaining_balance: carte.remaining_balance == null ? carte.remaining_balance : Number(carte.remaining_balance), valid_until: validite,
      } : null,
      appointments: lignes.map((a) => ({
        id: a.id, date: String(a.date).slice(0, 10), start_time: a.start_time, end_time: a.end_time,
        employee_id: a.employee_id, employee_name: a.employee_name, status: a.status, visit: a.subscription_visit,
        payment_method: a.payment_method || null, paid_by_card: Number(a.gift_card_amount) > 0,
        ...(equipe ? {} : { calendar_url: `https://dhomebarber.fr/agenda/rdv/${a.id}/signature` }),
      })),
    };
    if (equipe) {
      vue.client_phone = l.client_phone || '';
      vue.client_email = l.client_email || '';
      vue.validated_by = l.validated_by || null;
      vue.cancellation_reason = l.cancellation_reason || null;
    }
    return vue;
  }

  ligneRdv(l, { employee_id, employee_name, date, start_time }, visite) {
    return {
      id: `rdv-abo-${++this.suite}`, client_name: l.client_name, client_email: l.client_email, client_phone: l.client_phone,
      employee_id, employee_name,
      services: [{ service_id: l.service_id, name: l.service_name, duration: l.service_duration, price: l.unit_price }],
      date, start_time, end_time: finDe(start_time, l.service_duration), total_duration: l.service_duration, total_price: l.unit_price,
      status: 'confirmed', notes: '', internal_notes: '', payment_method: null, tip: 0, tip_method: null, product_sold: null,
      product_price: 0, grand_total: null, gift_card_amount: 0, cancellation_reason: null, attended_at: null,
      created_date: new Date().toISOString(), subscription_id: l.id, subscription_visit: visite,
    };
  }

  ligneDeBase(compte, formule, extra = {}) {
    return {
      id: `abo-${++this.suite}`, client_email: compte.email, client_name: compte.full_name || '', client_phone: compte.phone || '',
      service_id: formule.service_id, service_name: formule.name, service_duration: formule.duration,
      price: formule.price, unit_price: formule.unit_price, visits: VISITES, status: 'pending', gift_card_id: null,
      payment_method: null, validated_at: null, validated_by: null, cancelled_at: null, cancellation_reason: null,
      request_key: null, created_at: new Date().toISOString(), ...extra,
    };
  }

  creerCarte(l, moyen) {
    const fin = ajouterJours(this.aujourdhui(), 365);
    const carte = {
      id: `carte-abo-${++this.suiteCarte}`, code: `DHB-ABO${String(this.suiteCarte).padStart(1, '0')}-TEST`, amount: l.price, remaining_balance: l.price,
      status: 'validated', sender_email: l.client_email, sender_name: l.client_name, sender_phone: l.client_phone,
      recipient_name: l.client_name, valid_until: fin, validated_at: new Date().toISOString(), validated_by: 'Admin',
      payment_method: moyen, created_at: new Date().toISOString(), subscription_id: l.id, subscription_name: l.service_name,
      subscription_unit_price: l.unit_price, subscription_visits: l.visits,
    };
    this.cartes.push(carte);
    l.status = 'active';
    l.gift_card_id = carte.id;
    l.payment_method = moyen;
    l.validated_at = carte.validated_at;
    l.validated_by = 'Admin';
    return carte;
  }

  /**
   * Abonnement prêt pour un test : 4 RDV, tous les 7 jours à partir de `jours` (décalage depuis
   * aujourd'hui, 0 = le RDV du jour), à `heure`. `statut: 'active'` : payé, avec sa carte.
   */
  creer({ client, prestation, barber, jours = 2, heure = '17:00', statut = 'pending', moyen = 'cb' }) {
    const formule = {
      service_id: prestation.id, name: prestation.name, duration: prestation.duration, price: prestation.price,
      unit_price: Math.floor(cents(prestation.price) / VISITES) / 100,
    };
    const l = this.ligneDeBase(client, formule);
    this.lignes.push(l);
    for (let i = 0; i < VISITES; i++) {
      this.rdv.push(this.ligneRdv(l, { employee_id: barber.id, employee_name: barber.name, date: ajouterJours(this.aujourdhui(), jours + 7 * i), start_time: heure }, i + 1));
    }
    if (statut === 'active') this.creerCarte(l, moyen);
    return this.vue(l, { equipe: true });
  }

  aVenir(email) {
    const auj = this.aujourdhui();
    return this.rdv.filter((a) => String(a.client_email || '').toLowerCase() === String(email).toLowerCase()
      && a.status === 'confirmed' && String(a.date).slice(0, 10) >= auj).length;
  }

  creneauPris(s) {
    return this.rdv.some((a) => String(a.employee_id) === String(s.employee_id) && String(a.date).slice(0, 10) === s.date
      && !['cancelled'].includes(a.status) && a.start_time === s.start_time && a.client_email);
  }

  traiter(req) {
    const features = this.serveur.donnees.parametresPublics.features || {};
    if (features.subscriptions !== true) return erreur(404, 'disabled', 'Abonnements indisponibles');
    const { methode, chemin, compte } = req;
    const corps = req.corps && typeof req.corps === 'object' ? req.corps : {};

    if (methode === 'GET' && chemin === '/subscriptions/plans') return { json: { plans: this.formules() } };
    if (!compte) return erreur(401, 'unauthorized', 'Connexion requise');

    if (methode === 'GET' && chemin === '/subscriptions/mine') {
      const miens = this.lignes.filter((l) => String(l.client_email || '').toLowerCase() === String(compte.email).toLowerCase())
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { json: { subscriptions: miens.map((l) => this.vue(l)) } };
    }
    if (methode === 'POST' && chemin === '/subscriptions') return this.creation(compte, corps);

    if (methode === 'GET' && chemin === '/subscriptions') {
      if (compte.role !== 'admin') return erreur(403, 'forbidden', 'Accès réservé aux administrateurs');
      const statut = req.query?.status;
      const liste = this.lignes.filter((l) => !statut || l.status === statut);
      return { json: { subscriptions: [...liste].reverse().map((l) => this.vue(l, { equipe: true })) } };
    }

    const m = /^\/subscriptions\/([^/]+)(?:\/(rebook|validate|cancel))?$/.exec(chemin);
    const l = m && this.lignes.find((x) => String(x.id) === m[1]);
    if (!m) return null;
    if (!l) return erreur(404, 'subscription_not_found', 'Abonnement introuvable.');
    const action = m[2] || null;

    if (methode === 'GET' && !action) {
      if (!['admin', 'barber'].includes(compte.role)) return erreur(403, 'forbidden', 'Accès réservé à l\'équipe');
      return { json: { subscription: this.vue(l, { equipe: true, avecCode: compte.role === 'admin' }) } };
    }
    if (methode === 'POST' && action === 'rebook') return this.reprise(compte, l, corps);
    if (methode === 'POST' && (action === 'validate' || action === 'cancel')) {
      if (compte.role !== 'admin') return erreur(403, 'forbidden', 'Accès réservé aux administrateurs');
      return action === 'validate' ? this.validation(l, corps) : this.annulation(l);
    }
    return null;
  }

  creation(compte, corps) {
    if (['admin', 'barber'].includes(compte.role)) return erreur(403, 'staff_account', 'Un compte de l\'équipe ne prend pas d\'abonnement : passez par l\'agenda.');
    const cle = typeof corps.request_key === 'string' ? corps.request_key : null;
    const deja = cle && this.lignes.find((x) => x.request_key === cle && x.client_email === compte.email);
    if (deja) return { json: { subscription: this.vue(deja), duplicate: true } };
    const formule = this.formules().find((f) => String(f.service_id) === String(corps.service_id));
    if (!formule) return erreur(400, 'plan_not_found', 'Cet abonnement n\'existe pas.');
    if (!Array.isArray(corps.slots) || corps.slots.length !== VISITES) return erreur(400, 'invalid_slots', `Choisissez ${VISITES} rendez-vous.`);
    const creneaux = corps.slots.map((s) => ({ ...s })).sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
    for (let i = 1; i < creneaux.length; i++) {
      if (numJour(creneaux[i].date) - numJour(creneaux[i - 1].date) < ECART_MIN_JOURS) return erreur(400, 'slots_too_close', `Laissez au moins ${ECART_MIN_JOURS} jours entre deux rendez-vous.`);
    }
    if (numJour(creneaux[creneaux.length - 1].date) - numJour(creneaux[0].date) > DUREE_MAX_JOURS) return erreur(400, 'slots_too_far', 'Vos 4 rendez-vous doivent tenir dans les 5 semaines qui suivent le premier.');
    for (let i = 0; i < creneaux.length; i++) {
      if (this.creneauPris(creneaux[i])) {
        return erreur(409, 'slot_unavailable', 'Ce créneau vient d\'être réservé, choisissez-en un autre.', { slot: i, date: creneaux[i].date, start_time: creneaux[i].start_time });
      }
    }
    if (this.lignes.some((x) => x.status === 'pending' && x.client_email === compte.email)) {
      return erreur(409, 'pending_exists', 'Vous avez déjà un abonnement à régler au salon : réglez-le avant d\'en prendre un autre.');
    }
    const aVenir = this.aVenir(compte.email);
    if (aVenir + VISITES > PLAFOND_A_VENIR) {
      return erreur(409, 'too_many_upcoming', `Un abonnement réserve ${VISITES} rendez-vous et vous en avez déjà ${aVenir} à venir (${PLAFOND_A_VENIR} au plus). Annulez-en ${aVenir + VISITES - PLAFOND_A_VENIR} pour continuer.`, { upcoming: aVenir });
    }
    const employes = this.serveur.tables.Employee || [];
    const nomDe = (id) => employes.find((e) => String(e.id) === String(id))?.name || '';
    const l = this.ligneDeBase(compte, formule, { request_key: cle });
    this.lignes.push(l);
    creneaux.forEach((s, i) => this.rdv.push(this.ligneRdv(l, { employee_id: s.employee_id, employee_name: nomDe(s.employee_id), date: s.date, start_time: s.start_time }, i + 1)));
    return { json: { subscription: this.vue(l), duplicate: false } };
  }

  reprise(compte, l, corps) {
    if (String(l.client_email || '').toLowerCase() !== String(compte.email).toLowerCase()) return erreur(404, 'subscription_not_found', 'Abonnement introuvable.');
    const vue = this.vue(l);
    const pareil = (a) => a.status === 'confirmed' && a.date === corps.date && a.start_time === corps.start_time && String(a.employee_id) === String(corps.employee_id);
    if (vue.appointments.some(pareil)) return { json: { subscription: vue, duplicate: true } };
    if (this.creneauPris(corps)) return erreur(409, 'slot_unavailable', 'Ce créneau vient d\'être réservé, choisissez-en un autre.', { slot: 0, date: corps.date, start_time: corps.start_time });
    if (vue.to_rebook <= 0) return erreur(409, 'no_visit_left', 'Il ne reste aucune coupe à reprogrammer sur cet abonnement.');
    if (vue.valid_until && corps.date > vue.valid_until) return erreur(400, 'after_validity', `Vos coupes sont valables jusqu'au ${vue.valid_until}.`);
    const pris = new Set(vue.appointments.filter((a) => a.status !== 'no_show').map((a) => Number(a.visit)));
    let visite = 1;
    while (pris.has(visite) && visite < l.visits) visite += 1;
    const nom = (this.serveur.tables.Employee || []).find((e) => String(e.id) === String(corps.employee_id))?.name || '';
    this.rdv.push(this.ligneRdv(l, { employee_id: corps.employee_id, employee_name: nom, date: corps.date, start_time: corps.start_time }, visite));
    return { json: { subscription: this.vue(l), duplicate: false } };
  }

  validation(l, corps) {
    if (!['cb', 'especes'].includes(corps.payment_method)) return erreur(400, 'invalid_payment', 'Choisissez CB ou espèces.');
    if (l.status === 'active') return { json: { subscription: this.vue(l, { equipe: true }), replayed: true } };
    if (l.status !== 'pending') return erreur(409, 'subscription_cancelled', 'Cet abonnement a été annulé.');
    this.creerCarte(l, corps.payment_method);
    return { json: { subscription: this.vue(l, { equipe: true }), replayed: false } };
  }

  annulation(l) {
    if (l.status === 'cancelled') return { json: { subscription: this.vue(l, { equipe: true }), replayed: true, refund_due: l.rendu || 0, cancelled_appointments: 0 } };
    // Abonnement payé avec un RDV passé pas encore clôturé : le salon tranche d'abord
    if (l.status === 'active') {
      const passes = this.rdv.filter((a) => String(a.subscription_id) === String(l.id) && estOuvert(a)
        && instantParis(String(a.date).slice(0, 10), a.start_time).getTime() <= this.serveur.maintenant().getTime()).length;
      if (passes > 0) {
        return erreur(409, 'past_visits_open', `${passes > 1 ? `${passes} RDV déjà passés ne sont pas clôturés` : 'Un RDV déjà passé n\'est pas clôturé'} : scannez la carte ou marquez-les absents, puis annulez l'abonnement.`, { past_open: passes });
      }
    }
    let annules = 0;
    for (const a of this.rdv) {
      if (String(a.subscription_id) === String(l.id) && estOuvert(a)) {
        a.status = 'cancelled';
        a.cancelled_by = 'staff';
        a.cancellation_reason = 'Salon : abonnement annulé';
        annules += 1;
      }
    }
    let rendu = 0;
    const carte = this.carteDe(l);
    if (carte && carte.status === 'validated') {
      rendu = Number(carte.remaining_balance ?? carte.amount) || 0;
      carte.status = 'expired';
      carte.remaining_balance = 0;
    }
    l.rendu = rendu;
    l.status = 'cancelled';
    l.cancelled_at = new Date().toISOString();
    l.cancellation_reason = 'Salon : abonnement annulé';
    return { json: { subscription: this.vue(l, { equipe: true }), replayed: false, refund_due: rendu, cancelled_appointments: annules } };
  }
}

/**
 * Débit des cartes (routes/giftCardDebit.js du serveur), avec les règles qui comptent ici : solde,
 * RDV déjà réglé, carte qui n'est pas celle de l'abonnement du RDV. `{ card, transaction }`.
 */
export class FauxDebit {
  constructor(serveur) {
    this.serveur = serveur;
    this.mouvements = [];
    this.suite = 0;
  }

  traiter(req) {
    const m = /^\/gift-cards\/([^/]+)\/(debit|transactions)(?:\/([^/]+)\/undo)?$/.exec(req.chemin);
    if (!m) return null;
    if (!req.compte) return erreur(401, 'unauthorized', 'Connexion requise');
    const carte = (this.serveur.tables.GiftCard || []).find((c) => String(c.id) === m[1]);
    if (!carte) return erreur(404, 'gift_card_not_found', 'Carte introuvable');
    if (m[2] === 'transactions') {
      return { json: { transactions: this.mouvements.filter((t) => t.gift_card_id === carte.id), ...(req.compte.role === 'admin' ? { events: [] } : {}) } };
    }
    if (req.compte.role !== 'admin') return erreur(403, 'forbidden', 'Accès réservé aux administrateurs');
    return m[3] ? this.annuler(carte, m[3]) : this.debiter(carte, req.corps || {});
  }

  debiter(carte, corps) {
    const montant = cents(corps.amount);
    if (montant <= 0) return erreur(400, 'invalid_amount', 'Montant invalide.');
    if (corps.client_ref) {
      const deja = this.mouvements.find((t) => t.gift_card_id === carte.id && t.client_ref === corps.client_ref);
      if (deja) return { json: { card: { ...carte }, transaction: deja, replayed: true } };
    }
    if (carte.status === 'pending') return erreur(409, 'not_validated', 'Carte pas encore validée : encaissez-la d\'abord.');
    if (carte.status === 'expired') return erreur(409, 'expired', 'Carte annulée ou expirée.');
    const solde = cents(carte.remaining_balance ?? carte.amount);
    if (carte.status === 'used' || solde <= 0) return erreur(409, 'used', 'Carte déjà entièrement utilisée.');
    if (montant > solde) return erreur(409, 'insufficient_balance', `Solde insuffisant : il reste ${solde / 100} € sur la carte.`, { balance: solde / 100 });
    if (corps.appointment_id) {
      const rdv = (this.serveur.tables.Appointment || []).find((a) => String(a.id) === String(corps.appointment_id));
      if (!rdv) return erreur(400, 'appointment_not_found', 'Rendez-vous introuvable.');
      if (rdv.subscription_id && String(carte.subscription_id || '') !== String(rdv.subscription_id)) {
        return erreur(409, 'wrong_card', 'Ce RDV fait partie d\'un abonnement : scannez la carte de cet abonnement.');
      }
      if (['completed', 'cancelled', 'no_show'].includes(rdv.status) || rdv.payment_method) return erreur(409, 'appointment_closed', 'Ce RDV est déjà encaissé.');
      rdv.gift_card_amount = (Number(rdv.gift_card_amount) || 0) + montant / 100;
    }
    const apres = solde - montant;
    carte.remaining_balance = apres / 100;
    if (apres === 0) carte.status = 'used';
    const transaction = {
      id: `mouvement-${++this.suite}`, gift_card_id: carte.id, kind: 'debit', amount: montant / 100, balance_after: apres / 100,
      appointment_id: corps.appointment_id || null, services: corps.services || null, note: corps.note || null,
      client_ref: corps.client_ref || null, staff_email: 'admin', staff_name: 'Admin', undone_at: null, created_at: new Date().toISOString(),
    };
    this.mouvements.push(transaction);
    return { json: { card: { ...carte }, transaction } };
  }

  annuler(carte, id) {
    const tx = this.mouvements.find((t) => t.id === id && t.gift_card_id === carte.id);
    if (!tx) return erreur(404, 'transaction_not_found', 'Débit introuvable.');
    if (tx.undone_at) return erreur(409, 'already_undone', 'Ce débit a déjà été annulé.');
    tx.undone_at = new Date().toISOString();
    const rendu = cents(tx.amount);
    carte.remaining_balance = (cents(carte.remaining_balance) + rendu) / 100;
    carte.status = 'validated';
    let appointment = null;
    if (tx.appointment_id) {
      const rdv = (this.serveur.tables.Appointment || []).find((a) => String(a.id) === String(tx.appointment_id));
      if (rdv) {
        rdv.gift_card_amount = Math.max(0, (Number(rdv.gift_card_amount) || 0) - rendu / 100);
        appointment = { id: rdv.id, closed: rdv.status === 'completed' || !!rdv.payment_method, payment_method: rdv.payment_method || null, status: rdv.status, client_name: rdv.client_name, date: rdv.date, start_time: rdv.start_time };
      }
    }
    const transaction = { id: `mouvement-${++this.suite}`, gift_card_id: carte.id, kind: 'undo', amount: rendu / 100, balance_after: carte.remaining_balance, appointment_id: tx.appointment_id, reverses_id: tx.id, created_at: new Date().toISOString() };
    this.mouvements.push(transaction);
    return { json: { card: { ...carte }, transaction, returned: rendu / 100, ...(appointment ? { appointment } : {}) } };
  }
}

/** Formules du catalogue pour les tests : à ajouter à `tables.Service`. */
export const PRESTATIONS_ABONNEMENT = {
  classiques: { id: 'srv-abo-classiques', name: '4 coupes classiques', price: 100, duration: 30, sort_order: 21, is_active: true, description: 'Abonnement mensuel' },
  premium: { id: 'srv-abo-premium', name: '4 coupes premium', price: 120, duration: 35, sort_order: 24, is_active: true, description: 'Abonnement mensuel' },
  degrade: { id: 'srv-abo-degrade', name: '4 coupes + dégradé barbe', price: 140, duration: 45, sort_order: 22, is_active: true, description: 'Abonnement mensuel' },
  barbe: { id: 'srv-abo-barbe', name: '4 coupes + barbe premium', price: 200, duration: 55, sort_order: 23, is_active: true, description: 'Abonnement mensuel' },
};
