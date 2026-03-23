import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Send, Users, User, Bell, CheckCircle, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const API_BASE = import.meta.env.PROD
  ? 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com'
  : '';

function getAppId() {
  return localStorage.getItem('base44_app_id') || import.meta.env.VITE_BASE44_APP_ID || 'dhomebarber';
}

function getAuthHeaders() {
  const token = localStorage.getItem('base44_access_token') || localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function Notifications() {
  const [target, setTarget] = useState('all');
  const [clientEmail, setClientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  const [pushSubCount, setPushSubCount] = useState(0);
  const [pushSubscribers, setPushSubscribers] = useState([]);

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => base44.entities.Appointment.list('-created_date', 200),
  });

  // Get unique clients
  const clients = React.useMemo(() => {
    const map = {};
    appointments.forEach(a => {
      if (a.client_email && !map[a.client_email]) {
        map[a.client_email] = { email: a.client_email, name: a.client_name };
      }
    });
    return Object.values(map);
  }, [appointments]);

  // Fetch push subscriber count
  useEffect(() => {
    fetch(`${API_BASE}/api/apps/${getAppId()}/push/subscribers`, { headers: getAuthHeaders() })
      .then(r => r.json())
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
    setSending(true);
    try {
      // Send push notification
      const pushRes = await fetch(`${API_BASE}/api/apps/${getAppId()}/push/send`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: subject,
          body: message,
          target_email: target === 'one' ? clientEmail : undefined,
        }),
      });
      const pushResult = await pushRes.json();

      // Also send email
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
          // Email send failed for this client, continue
        }
      }

      setSent(prev => [...prev, {
        subject,
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compose */}
        <div className="lg:col-span-2 space-y-4">
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
              <div>
                <Label className="text-xs">Destinataires</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Tous les clients ({clients.length})</div>
                    </SelectItem>
                    <SelectItem value="one">
                      <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Client spécifique</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {target === 'one' && (
                <div>
                  <Label className="text-xs">Email du client</Label>
                  <Select value={clientEmail} onValueChange={setClientEmail}>
                    <SelectTrigger className="bg-secondary border-border mt-1">
                      <SelectValue placeholder="Choisir un client..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.email} value={c.email}>{c.name} — {c.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <p>• <strong>Email</strong> — envoi par email ({target === 'all' ? clients.length : 1} destinataire{target === 'all' && clients.length > 1 ? 's' : ''})</p>
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
            <p className="text-3xl font-bold text-primary">{pushSubCount}</p>
            <p className="text-xs text-muted-foreground mt-1">appareil(s) avec notifications activées</p>
            {pushSubscribers.length > 0 && (
              <div className="mt-3 space-y-1">
                {pushSubscribers.map(s => (
                  <div key={s.user_email} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate">{s.user_email}</span>
                    <span className="text-foreground font-medium">{s.devices} app.</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Email clients */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" /> Clients email
            </h3>
            <p className="text-3xl font-bold text-primary">{clients.length}</p>
            <p className="text-xs text-muted-foreground mt-1">clients dans la base</p>
          </div>

          {/* Recent sends */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" /> Envois récents
            </h3>
            {sent.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun envoi cette session</p>
            ) : (
              <div className="space-y-2">
                {sent.slice(-5).reverse().map((s, i) => (
                  <div key={i} className="text-xs border border-border rounded-lg p-2">
                    <p className="font-medium truncate">{s.subject}</p>
                    <p className="text-muted-foreground">
                      Push: {s.pushSent} · Email: {s.emailSent} · {s.date}
                    </p>
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
