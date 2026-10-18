import React, { useState, useEffect, useCallback } from 'react';
import { api, apiRequest, apiUrl } from '@/api/apiClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Users, User, CheckCircle, Smartphone, Mail, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import AiWriterPanel from '@/components/notifications/AiWriterPanel';
import LoadError, { isNetworkError } from '@/components/shared/LoadError';
import { normalizeSearch } from '@/components/admin-activity/activityUi';

// Téléphone comparable : chiffres seuls, indicatif français (+33 / 0033) ramené au 0
const phoneDigits = (v) => String(v || '').replace(/\D/g, '').replace(/^(?:00)?33(?=\d{9}$)/, '0');
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Bornes de la route d'envoi groupé (routes/push.js) : vérifiées AVANT le push, sinon le push
// partirait puis les emails seraient refusés
const BROADCAST_SUBJECT_MAX = 120;
const BROADCAST_MESSAGE_MAX = 2000;

/** Message d'erreur lisible : réseau traduit, message du serveur, sinon le repli. */
function errorText(err, fallback) {
  if (isNetworkError(err)) return 'pas de connexion internet';
  return err?.message && !/^HTTP \d+$/.test(err.message) ? err.message : fallback;
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

// La liste des destinataires n'est chargée que lorsqu'on en a besoin (choix d'un client ou
// envoi), et par lots : le serveur renvoie chaque photo de profil dans la liste des comptes.
const RECIPIENTS_PAGE_SIZE = 200;
const RECIPIENTS_MAX_PAGES = 25; // garde-fou : 5 000 comptes
const RECIPIENT_USERS_KEY = ['registeredUsers', 'recipients'];
const RECIPIENT_APPOINTMENTS_KEY = ['appointments', 'recipients'];

async function fetchRecipientUsers() {
  const all = [];
  for (let i = 0; i < RECIPIENTS_MAX_PAGES; i++) {
    const page = await api.entities.User.list('-created_at', RECIPIENTS_PAGE_SIZE, i * RECIPIENTS_PAGE_SIZE);
    all.push(...page);
    if (page.length < RECIPIENTS_PAGE_SIZE) break;
  }
  return all;
}

const fetchRecipientAppointments = () => api.entities.Appointment.list('-created_date', 200);

/** Clients joignables : comptes clients + emails vus dans les derniers rendez-vous */
function buildClients(registeredUsers, appointments) {
  const map = {};
  registeredUsers.forEach(u => {
    if (u.email && u.role === 'user') {
      // Refus des offres (Paramètres ou lien d'un email) : le serveur n'envoie plus d'email à ce compte
      map[u.email.toLowerCase()] = { email: u.email, name: u.full_name || u.email, phone: u.phone, optedOut: u.marketing_emails === false };
    }
  });
  appointments.forEach(a => {
    if (a.client_email && !map[a.client_email.toLowerCase()]) {
      map[a.client_email.toLowerCase()] = { email: a.client_email, name: a.client_name || a.client_email, phone: a.client_phone };
    }
  });
  return Object.values(map).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export default function Notifications() {
  const [target, setTarget] = useState('all');
  // Envoi à « Tous les clients » : une confirmation avant de partir (fenêtre avec croix)
  const [confirmAll, setConfirmAll] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  // null = pas encore chargé ; subsError = échec (jamais « 0 abonné » ni « Aucun abonné push »)
  const [pushSubCount, setPushSubCount] = useState(null);
  const [pushSubscribers, setPushSubscribers] = useState([]);
  const [subsError, setSubsError] = useState(false);
  const [subsLoading, setSubsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  // Push parti mais aucun email : contexte gardé pour relancer les emails seuls (jamais le push)
  const [emailRetry, setEmailRetry] = useState(null);

  const queryClient = useQueryClient();
  // Rien n'est chargé à l'ouverture : la liste des clients ne part que sur une action
  // (choix des destinataires ou envoi), et l'envoi la réclame de toute façon.
  const [clientsNeeded, setClientsNeeded] = useState(false);

  const { data: appointments = [], isSuccess: appointmentsReady } = useQuery({
    queryKey: RECIPIENT_APPOINTMENTS_KEY,
    queryFn: fetchRecipientAppointments,
    enabled: clientsNeeded,
    staleTime: 5 * 60 * 1000,
  });

  const { data: registeredUsers = [], isSuccess: usersReady } = useQuery({
    queryKey: RECIPIENT_USERS_KEY,
    queryFn: fetchRecipientUsers,
    enabled: clientsNeeded,
    staleTime: 5 * 60 * 1000,
  });

  const clientsLoaded = clientsNeeded && usersReady && appointmentsReady;
  const clientsLoading = clientsNeeded && !clientsLoaded;

  const clients = React.useMemo(
    () => buildClients(registeredUsers, appointments),
    [appointments, registeredUsers]
  );

  /** Garantit la liste complète des destinataires (utilisée par l'envoi) */
  const ensureClients = async () => {
    setClientsNeeded(true);
    const [users, appts] = await Promise.all([
      queryClient.fetchQuery({ queryKey: RECIPIENT_USERS_KEY, queryFn: fetchRecipientUsers, staleTime: 5 * 60 * 1000 }),
      queryClient.fetchQuery({ queryKey: RECIPIENT_APPOINTMENTS_KEY, queryFn: fetchRecipientAppointments, staleTime: 5 * 60 * 1000 }),
    ]);
    return buildClients(users, appts);
  };

  const filteredClients = clients.filter(c => {
    const q = normalizeSearch(clientSearch);
    if (!q) return true;
    if (normalizeSearch(`${c.name || ''} ${c.email || ''}`).includes(q)) return true;
    const qd = /^[\d\s.+\-()]+$/.test(q) ? phoneDigits(q) : '';
    return qd.length >= 3 && phoneDigits(c.phone).includes(qd);
  });

  const loadSubscribers = useCallback(() => {
    setSubsLoading(true);
    return apiRequest('GET', apiUrl('/push/subscribers'))
      .then(data => {
        setPushSubCount(data?.count || 0);
        setPushSubscribers(data?.subscribers || []);
        setSubsError(false);
      })
      .catch(() => setSubsError(true))
      .finally(() => setSubsLoading(false));
  }, []);

  useEffect(() => { loadSubscribers(); }, [sent, loadSubscribers]);
  const subsUnknown = subsError || pushSubCount === null;

  const templates = [
    // Visé à un client : ce texte n'a de sens que pour celui qui a un rendez-vous demain
    { label: 'Rappel RDV', target: 'one', subject: 'Rappel de votre rendez-vous demain', body: "Nous vous rappelons votre rendez-vous demain. À très bientôt chez D'Home Barber !" },
    { label: 'Promotion', subject: 'Offre spéciale cette semaine', body: 'Profitez de -20% sur toutes nos prestations cette semaine uniquement. Réservez vite !' },
    { label: 'Fermeture', subject: 'Fermeture exceptionnelle', body: 'Le salon sera fermé exceptionnellement. Nous vous remercions de votre compréhension.' },
    { label: 'Nouveauté', subject: 'Nouvelles prestations', body: 'Nous avons le plaisir de vous présenter nos nouvelles prestations. Venez les découvrir !' },
  ];

  /**
   * Ancien serveur sans la route d'envoi groupé : un SendEmail par client. On compte les échecs et
   * on s'arrête au premier 429 (les suivants seraient refusés aussi).
   */
  const sendEmailsOneByOne = async (targets, subject, message) => {
    let sentCount = 0;
    let failed = 0;
    let lastError = null;
    let optedOut = false;
    for (let i = 0; i < targets.length; i++) {
      const client = targets[i];
      // Désinscrit des offres : le serveur refuserait (409), ce n'est pas un échec à relancer
      if (client.optedOut) {
        optedOut = true;
        if (targets.length === 1) lastError = "ce client a refusé les emails d'offres (le push peut partir)";
        continue;
      }
      try {
        await api.integrations.Core.SendEmail({
          to: client.email,
          subject,
          body: `Bonjour ${client.name || ''},\n\n${message}\n\n— L'équipe D'Home Barber`,
        });
        sentCount++;
      } catch (err) {
        if (err?.status === 409 && err?.data?.code === 'opted_out') {
          optedOut = true;
          if (targets.length === 1) lastError = errorText(err, "ce client a refusé les emails d'offres");
          continue;
        }
        failed++;
        if (err?.status === 429) {
          const left = targets.length - i;
          return { sent: sentCount, failed: failed + (left - 1), error: `Limite d'envoi atteinte : ${plural(left, 'email')} non envoyé${left > 1 ? 's' : ''}` };
        }
        lastError = errorText(err, "échec de l'envoi");
      }
    }
    return { sent: sentCount, failed, error: lastError, optedOut };
  };

  /**
   * Étape emails, partagée par l'envoi et la relance « emails seulement » : envoi groupé pour
   * « tous » (repli un par un sur 404), un par un pour un client.
   */
  const sendEmailsStep = async ({ subject, message, target, targets }) => {
    let email = { sent: 0, failed: 0, error: null, total: targets.length };
    if (target === 'all') {
      try {
        // Envoi groupé côté serveur : destinataires calculés par le serveur, pas de quota par email
        const r = await apiRequest('POST', apiUrl('/notifications/broadcast-email'), { subject, message });
        if (r?.queued) {
          // 202 : le serveur répond tout de suite et envoie en arrière-plan (délai de 30 s
          // d'Heroku) ; le récapitulatif arrive ensuite en push à l'admin
          email = { sent: 0, failed: 0, error: null, total: Number(r?.total) || 0, queued: true };
        } else {
          email = { sent: Number(r?.sent) || 0, failed: Number(r?.failed) || 0, error: null, total: Number(r?.total) || 0 };
          if (email.failed > 0) email.error = `${plural(email.failed, 'email')} refusé${email.failed > 1 ? 's' : ''} par le serveur d'envoi`;
        }
      } catch (err) {
        if (err?.status === 404) {
          email = { ...(await sendEmailsOneByOne(targets, subject, message)), total: targets.length };
        } else if (isNetworkError(err) || err?.timeout || err?.status === 504 || (err?.status === 503 && !/SMTP/i.test(String(err?.message || '')))) {
          // Réponse perdue ou coupée par le routeur : l'envoi a pu partir, ne pas inciter à relancer
          email = { sent: 0, failed: 0, total: targets.length, uncertain: true, error: null };
        } else {
          email = { sent: 0, failed: targets.length, total: targets.length, error: errorText(err, "échec de l'envoi des emails") };
        }
      }
    } else if (targets.length > 0) {
      email = { ...(await sendEmailsOneByOne(targets, subject, message)), total: targets.length };
    } else {
      email = { sent: 0, failed: 0, total: 0, error: "ce client n'a pas d'email connu" };
    }
    return email;
  };

  /** Libellé du compte rendu des emails (toast) */
  const emailPartOf = (email) => (email.queued
    ? `Envoi de ${plural(email.total, 'email')} en cours`
    : email.uncertain
      ? 'Emails : envoi peut-être en cours, vérifiez avant de relancer'
      : email.failed > 0 || email.error
        ? `Emails : ${email.sent} envoyé${email.sent > 1 ? 's' : ''}, ${email.failed} non envoyé${email.failed > 1 ? 's' : ''}${email.error ? ` (${email.error})` : ''}`
        : `Emails : ${email.sent} envoyé${email.sent > 1 ? 's' : ''}`);

  /** Relance des emails seuls : aucun appel à /push/send, destinataires déjà chargés réutilisés */
  const retryEmails = async () => {
    if (!emailRetry || sending) return;
    const ctx = emailRetry;
    setSending(true);
    try {
      const email = await sendEmailsStep(ctx);
      const emailPart = emailPartOf(email);
      const done = email.sent > 0 || !!email.queued || !!email.uncertain;
      const allOk = !email.error && email.failed === 0 && !email.uncertain;
      if (allOk) toast.success(emailPart);
      else if (done) toast.warning(emailPart, { duration: 10000 });
      else toast.error(emailPart, { duration: 10000 });
      if (done) {
        setEmailRetry(null);
        setSent(prev => [...prev, {
          subject: ctx.subject,
          target: ctx.target === 'all' ? `Tous (${email.total || ctx.targets.length})` : ctx.clientEmail,
          emailOnly: true,
          pushSent: 0,
          pushError: null,
          emailSent: email.sent,
          emailFailed: email.failed,
          emailQueued: !!email.queued,
          emailUncertain: !!email.uncertain,
          date: new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }),
        }]);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    // Une relance d'emails en attente vise l'ancien message : jamais deux envois mêlés
    if (emailRetry) return;
    if (!subject || !message) {
      toast.error('Objet et message requis');
      return;
    }
    if (target === 'one' && !clientEmail) {
      toast.error('Sélectionnez un client');
      return;
    }
    // Tous les clients : confirmation d'abord (un modèle touché par erreur partait à tout le monde)
    if (target === 'all' && !confirmAll) {
      setConfirmAll(true);
      return;
    }
    setConfirmAll(false);
    await doSend();
  };

  const doSend = async () => {
    if (emailRetry) return;
    if (!subject || !message) {
      toast.error('Objet et message requis');
      return;
    }
    if (target === 'one' && !clientEmail) {
      toast.error('Sélectionnez un client');
      return;
    }
    if (target === 'all' && (subject.length > BROADCAST_SUBJECT_MAX || message.length > BROADCAST_MESSAGE_MAX)) {
      toast.error(`Titre limité à ${BROADCAST_SUBJECT_MAX} caractères et message à ${BROADCAST_MESSAGE_MAX} pour un envoi à tous`);
      return;
    }
    setSending(true);
    try {
      // 1) Destinataires d'abord : tant que rien n'est parti, un nouvel essai ne crée aucun doublon
      let allClients;
      try {
        allClients = await ensureClients();
      } catch (err) {
        toast.error(err?.message && !isNetworkError(err)
          ? `Destinataires non chargés : ${err.message}. Rien n'a été envoyé.`
          : "Impossible de charger les destinataires, rien n'a été envoyé");
        return;
      }
      const targets = target === 'all'
        ? allClients.filter(c => !c.optedOut)
        : allClients.filter(c => c.email.toLowerCase() === clientEmail.toLowerCase());

      // 2) Push, dans son propre essai : les emails partent même s'il échoue
      let pushResult = null;
      let pushError = null;
      try {
        pushResult = await apiRequest('POST', apiUrl('/push/send'), {
          title: subject,
          body: message,
          target_email: target === 'one' ? clientEmail : undefined,
        });
      } catch (err) {
        pushError = errorText(err, 'échec du push');
      }

      // 3) Emails
      const email = await sendEmailsStep({ subject, message, target, targets });

      // Push parti, aucun email parti (ni en file ni incertain) : proposer de relancer les emails
      // seuls. `sent === 0` : un envoi un par un partiellement réussi n'est jamais relancé (doublons)
      // Client désinscrit des offres : rien à relancer, le serveur refuserait encore
      if (pushResult && !pushError && !email.queued && !email.uncertain && !email.optedOut && email.sent === 0
        && (email.failed > 0 || email.error) && (email.total > 0 || targets.length > 0)) {
        setEmailRetry({ subject, message, target, clientEmail, targets });
      } else {
        setEmailRetry(null);
      }

      // 4) Compte rendu par canal
      const pushSent = Number(pushResult?.sent) || 0;
      const pushPart = pushError ? `Push non envoyé : ${pushError}` : `Push : ${plural(pushSent, 'appareil')}`;
      const emailPart = emailPartOf(email);
      // Envoi en cours ou incertain : compté comme parti (saisie vidée), pour éviter un doublon
      const anyOk = !!pushResult || email.sent > 0 || !!email.queued || !!email.uncertain;
      const allOk = !pushError && !email.error && email.failed === 0 && !email.uncertain;
      if (allOk) toast.success(`${pushPart} · ${emailPart}`);
      else if (anyOk) toast.warning(`${pushPart} · ${emailPart}`, { duration: 10000 });
      else toast.error(`${pushPart} · ${emailPart}`, { duration: 10000 });

      if (anyOk) {
        setSent(prev => [...prev, {
          subject,
          target: target === 'all' ? `Tous (${email.total || targets.length})` : clientEmail,
          pushSent,
          pushError,
          emailSent: email.sent,
          emailFailed: email.failed,
          emailQueued: !!email.queued,
          emailUncertain: !!email.uncertain,
          date: new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }),
        }]);
        // Un second appui ne doit jamais renvoyer le même push
        setSubject('');
        setMessage('');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Communication</p>
        <h1 className="font-display text-2xl font-bold">Notifications Clients</h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Smartphone className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-primary font-display">{subsUnknown ? '—' : pushSubCount}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
            {subsError ? 'Abonnés indisponibles' : 'Push abonnés'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setClientsNeeded(true)}
          className="w-full rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-4 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-primary font-display">
            {clientsLoaded ? clients.length : clientsLoading ? '...' : '—'}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
            {clientsNeeded ? 'Clients email' : 'Clients (afficher)'}
          </p>
        </button>
        <div className="rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-green-400 font-display">{sent.length}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Envoyés</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compose */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" /> Composer un message
            </h2>

            {/* Templates */}
            <div className="mb-4">
              <Label className="text-xs mb-2 block">Modèles rapides</Label>
              <div className="flex flex-wrap gap-2">
                {templates.map(t => (
                  <button key={t.label} onClick={() => {
                    setSubject(t.subject);
                    setMessage(t.body);
                    if (t.target === 'one') { setTarget('one'); setClientsNeeded(true); }
                  }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition-colors bg-secondary">
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {/* Target */}
              <div>
                <Label className="text-xs mb-1.5 block">Destinataires</Label>
                <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/8">
                  <button
                    onClick={() => { setTarget('all'); setClientEmail(''); setClientsNeeded(true); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      target === 'all' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" /> Tous les clients{clientsLoaded ? ` (${clients.filter(c => !c.optedOut).length})` : ''}
                  </button>
                  <button
                    onClick={() => { setTarget('one'); setClientsNeeded(true); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      target === 'one' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" /> Client spécifique
                  </button>
                </div>
              </div>

              {/* Client picker */}
              {target === 'one' && (
                <div>
                  <Label className="text-xs mb-1.5 block">Choisir un client</Label>
                  <Input
                    placeholder="Rechercher un client..."
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    className="bg-secondary border-border mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-secondary/50">
                    {clientsLoading && (
                      <p className="text-xs text-muted-foreground p-3 text-center">Chargement des clients...</p>
                    )}
                    {!clientsLoading && filteredClients.length === 0 && (
                      <p className="text-xs text-muted-foreground p-3 text-center">Aucun client trouvé</p>
                    )}
                    {filteredClients.map(c => (
                      <button
                        key={c.email}
                        onClick={() => { setClientEmail(c.email); setClientSearch(''); }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-primary/10 transition-colors border-b border-border/50 last:border-0 ${
                          clientEmail === c.email ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'
                        }`}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground ml-2 break-all">{c.email}</span>
                        {c.optedOut && <span className="ml-2 text-[10px] text-amber-400">désinscrit des offres</span>}
                      </button>
                    ))}
                  </div>
                  {clientEmail && (
                    <p className="text-xs text-primary mt-1.5 font-medium break-all">
                      Sélectionné : {clientEmail}
                    </p>
                  )}
                  {clientEmail && clients.some(c => c.optedOut && c.email.toLowerCase() === clientEmail.toLowerCase()) && (
                    <p className="text-[11px] text-amber-400 mt-1">
                      Ce client a refusé les emails d'offres : l'email ne partira pas (la notification push, si.)
                    </p>
                  )}
                </div>
              )}

              <AiWriterPanel
                subject={subject}
                message={message}
                audience={target}
                onApply={(next) => { setSubject(next.subject); setMessage(next.message); }}
              />

              <div>
                <Label className="text-xs">Titre / Objet</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="Titre de la notification..." className="bg-secondary border-border mt-1" />
              </div>

              <div>
                <Label className="text-xs">Message</Label>
                <Textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Votre message..." className="bg-secondary border-border mt-1 resize-none" rows={5} />
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Canaux d'envoi :</p>
                <p>• <strong>Push</strong> — notification sur le téléphone ({subsError
                  ? 'abonnés indisponibles'
                  : pushSubCount === null ? '…' : `${pushSubCount} abonné${pushSubCount > 1 ? 's' : ''}`})</p>
                <p>• <strong>Email</strong> — envoi par email ({target === 'all'
                  ? (clientsLoaded ? `${clients.filter(c => !c.optedOut).length} destinataire${clients.filter(c => !c.optedOut).length > 1 ? 's' : ''}` : 'tous les clients')
                  : `${clientEmail ? 1 : 0} destinataire`})</p>
              </div>

              <Button onClick={handleSend} disabled={sending || !subject || !message || !!emailRetry}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                <Send className="w-4 h-4 mr-2" />
                {sending ? 'Envoi en cours...' : 'Envoyer (Push + Email)'}
              </Button>

              {/* Confirmation d'un envoi à tous (croix et « Annuler » visibles) */}
              <Dialog open={confirmAll} onOpenChange={(o) => { if (!o) setConfirmAll(false); }}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Envoyer à tous les clients ?</DialogTitle>
                    <DialogDescription>
                      Push : {subsError || pushSubCount === null ? 'abonnés inconnus' : `${pushSubCount} abonné${pushSubCount > 1 ? 's' : ''}`}
                      {' · '}Email : {clientsLoaded ? `${clients.filter(c => !c.optedOut).length} destinataire${clients.filter(c => !c.optedOut).length > 1 ? 's' : ''}` : 'tous les clients'}
                    </DialogDescription>
                  </DialogHeader>
                  <p className="text-sm font-semibold break-words">« {subject} »</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-line break-words max-h-40 overflow-y-auto">{message}</p>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button variant="outline" onClick={() => setConfirmAll(false)} disabled={sending}>Annuler</Button>
                    <Button onClick={() => { setConfirmAll(false); doSend(); }} disabled={sending}>
                      Envoyer à tous
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {emailRetry && (
                <div role="alert" className="relative rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 pr-10 text-xs">
                  <button
                    type="button"
                    onClick={() => setEmailRetry(null)}
                    aria-label="Abandonner l'envoi des emails"
                    className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <p className="font-semibold text-amber-400">Le push est parti, les emails n'ont pas été envoyés</p>
                  <p className="text-muted-foreground mt-1 break-words">
                    « {emailRetry.subject} » — {emailRetry.target === 'all' ? 'tous les clients' : emailRetry.clientEmail}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={retryEmails}
                    disabled={sending}
                    className="mt-2.5 border-amber-500/40 text-amber-300 hover:text-amber-200"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    {sending ? 'Envoi en cours...' : 'Renvoyer seulement les emails'}
                  </Button>
                  <p className="text-muted-foreground/80 mt-2">Fermez cet encadré pour écrire un nouveau message.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Push subscribers */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" /> Abonnés Push
            </h3>
            {subsError ? (
              <LoadError compact what="les abonnés push" onRetry={loadSubscribers} retrying={subsLoading} />
            ) : pushSubCount === null ? (
              <p className="text-xs text-muted-foreground">Chargement…</p>
            ) : pushSubscribers.length > 0 ? (
              <div className="space-y-1.5">
                {pushSubscribers.map(s => (
                  <div key={s.user_email} className="flex items-center justify-between text-xs bg-secondary/50 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground truncate flex-1">{s.user_email}</span>
                    <span className="text-foreground font-medium ml-2 shrink-0">{s.devices} app.</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Aucun abonné push</p>
            )}
          </div>

          {/* Recent sends */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" /> Envois récents
            </h3>
            {sent.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun envoi cette session</p>
            ) : (
              <div className="space-y-2">
                {sent.slice(-5).reverse().map((s, i) => (
                  <div key={i} className="text-xs border border-border rounded-lg p-2.5 bg-secondary/30">
                    <p className="font-medium truncate text-foreground">{s.subject}</p>
                    <p className="text-muted-foreground mt-0.5">{s.target}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {s.emailOnly
                        ? <span className="text-muted-foreground">Emails seulement</span>
                        : <span className={s.pushError ? 'text-amber-400' : 'text-primary'}>Push : {s.pushError ? 'non envoyé' : s.pushSent}</span>}
                      <span className="text-primary">Email : {s.emailQueued ? 'en cours' : s.emailUncertain ? 'à vérifier' : s.emailSent}</span>
                      {s.emailFailed > 0 && <span className="text-amber-400">{s.emailFailed} non envoyé{s.emailFailed > 1 ? 's' : ''}</span>}
                      <span className="text-muted-foreground/60 ml-auto">{s.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
