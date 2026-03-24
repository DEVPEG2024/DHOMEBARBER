import React, { useState, useEffect } from 'react';
import { base44, apiRequest, apiUrl } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Send, Users, User, Bell, CheckCircle, Smartphone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function Notifications() {
  const [target, setTarget] = useState('all');
  const [clientEmail, setClientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  const [pushSubCount, setPushSubCount] = useState(0);
  const [pushSubscribers, setPushSubscribers] = useState([]);
  const [clientSearch, setClientSearch] = useState('');

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => base44.entities.Appointment.list('-created_date', 200),
  });

  const { data: registeredUsers = [] } = useQuery({
    queryKey: ['registeredUsers'],
    queryFn: () => base44.entities.User.list('-created_at', 1000),
  });

  const clients = React.useMemo(() => {
    const map = {};
    registeredUsers.forEach(u => {
      if (u.email && u.role === 'user') {
        map[u.email.toLowerCase()] = { email: u.email, name: u.full_name || u.email };
      }
    });
    appointments.forEach(a => {
      if (a.client_email && !map[a.client_email.toLowerCase()]) {
        map[a.client_email.toLowerCase()] = { email: a.client_email, name: a.client_name || a.client_email };
      }
    });
    return Object.values(map).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [appointments, registeredUsers]);

  const filteredClients = clients.filter(c => {
    if (!clientSearch) return true;
    const s = clientSearch.toLowerCase();
    return c.name?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s);
  });

  useEffect(() => {
    apiRequest('GET', apiUrl('/push/subscribers'))
      .then(data => {
        setPushSubCount(data.count || 0);
        setPushSubscribers(data.subscribers || []);
      })
      .catch(() => {});
  }, [sent]);

  const templates = [
    { label: 'Rappel RDV', subject: 'Rappel de votre rendez-vous demain', body: "Nous vous rappelons votre rendez-vous demain. À très bientôt chez D'Home Barber !" },
    { label: 'Promotion', subject: 'Offre spéciale cette semaine', body: 'Profitez de -20% sur toutes nos prestations cette semaine uniquement. Réservez vite !' },
    { label: 'Fermeture', subject: 'Fermeture exceptionnelle', body: 'Le salon sera fermé exceptionnellement. Nous vous remercions de votre compréhension.' },
    { label: 'Nouveauté', subject: 'Nouvelles prestations', body: 'Nous avons le plaisir de vous présenter nos nouvelles prestations. Venez les découvrir !' },
  ];

  const handleSend = async () => {
    if (!subject || !message) {
      toast.error('Objet et message requis');
      return;
    }
    if (target === 'one' && !clientEmail) {
      toast.error('Sélectionnez un client');
      return;
    }
    setSending(true);
    try {
      // Send push notification
      const pushResult = await apiRequest('POST', apiUrl('/push/send'), {
        title: subject,
        body: message,
        target_email: target === 'one' ? clientEmail : undefined,
      });

      // Send emails
      const targets = target === 'all' ? clients : clients.filter(c => c.email === clientEmail);
      let emailCount = 0;
      for (const client of targets) {
        try {
          await base44.integrations.Core.SendEmail({
            to: client.email,
            subject,
            body: `Bonjour ${client.name || ''},\n\n${message}\n\n— L'équipe D'Home Barber`,
          });
          emailCount++;
        } catch {
          // continue
        }
      }

      setSent(prev => [...prev, {
        subject,
        target: target === 'all' ? `Tous (${targets.length})` : clientEmail,
        pushSent: pushResult.sent || 0,
        emailSent: emailCount,
        date: new Date().toLocaleTimeString('fr-FR'),
      }]);
      toast.success(`Push: ${pushResult.sent || 0} appareil(s) · Email: ${emailCount} client(s)`);
      setSubject('');
      setMessage('');
    } catch {
      toast.error("Erreur lors de l'envoi");
    }
    setSending(false);
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
          <p className="text-2xl font-bold text-primary font-display">{pushSubCount}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Push abonnés</p>
        </div>
        <div className="rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-primary font-display">{clients.length}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Clients email</p>
        </div>
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
                  <button key={t.label} onClick={() => { setSubject(t.subject); setMessage(t.body); }}
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
                    onClick={() => { setTarget('all'); setClientEmail(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      target === 'all' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" /> Tous les clients ({clients.length})
                  </button>
                  <button
                    onClick={() => setTarget('one')}
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
                    {filteredClients.length === 0 && (
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
                        <span className="text-muted-foreground ml-2">{c.email}</span>
                      </button>
                    ))}
                  </div>
                  {clientEmail && (
                    <p className="text-xs text-primary mt-1.5 font-medium">
                      Sélectionné : {clientEmail}
                    </p>
                  )}
                </div>
              )}

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
                <p>• <strong>Push</strong> — notification sur le téléphone ({pushSubCount} abonné{pushSubCount > 1 ? 's' : ''})</p>
                <p>• <strong>Email</strong> — envoi par email ({target === 'all' ? clients.length : clientEmail ? 1 : 0} destinataire{target === 'all' && clients.length > 1 ? 's' : ''})</p>
              </div>

              <Button onClick={handleSend} disabled={sending || !subject || !message}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                <Send className="w-4 h-4 mr-2" />
                {sending ? 'Envoi en cours...' : 'Envoyer (Push + Email)'}
              </Button>
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
            {pushSubscribers.length > 0 ? (
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
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-primary">Push: {s.pushSent}</span>
                      <span className="text-primary">Email: {s.emailSent}</span>
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
