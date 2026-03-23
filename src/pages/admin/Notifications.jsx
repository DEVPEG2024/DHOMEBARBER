import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Send, Users, User, Bell, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function Notifications() {
  const [target, setTarget] = useState('all');
  const [clientEmail, setClientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);

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

  const templates = [
    { label: 'Rappel RDV', subject: 'Rappel de votre rendez-vous demain', body: 'Bonjour,\n\nNous vous rappelons votre rendez-vous demain. À très bientôt chez D\'Home Barber !' },
    { label: 'Promotion', subject: '🎉 Offre spéciale cette semaine', body: 'Bonjour,\n\nProfitez de -20% sur toutes nos prestations cette semaine uniquement. Réservez vite !' },
    { label: 'Fermeture exceptionnelle', subject: 'Fermeture exceptionnelle', body: 'Bonjour,\n\nNous vous informons que le salon sera fermé exceptionnellement. Nous vous remercions de votre compréhension.' },
    { label: 'Nouveauté', subject: 'Découvrez nos nouvelles prestations', body: 'Bonjour,\n\nNous avons le plaisir de vous présenter nos nouvelles prestations. Venez les découvrir !' },
  ];

  const handleSend = async () => {
    if (!subject || !message) {
      toast.error('Objet et message requis');
      return;
    }
    setSending(true);
    try {
      const targets = target === 'all' ? clients : clients.filter(c => c.email === clientEmail);
      let count = 0;
      for (const client of targets) {
        await base44.integrations.Core.SendEmail({
          to: client.email,
          subject,
          body: `Bonjour ${client.name || ''},\n\n${message}\n\n— L'équipe D'Home Barber`,
        });
        count++;
      }
      setSent(prev => [...prev, { subject, count, date: new Date().toLocaleTimeString('fr-FR') }]);
      toast.success(`Notification envoyée à ${count} client(s)`);
      setSubject('');
      setMessage('');
    } catch (e) {
      toast.error('Erreur lors de l\'envoi');
    }
    setSending(false);
  };

  return (
    <div>
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Communication</p>
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
                <Label className="text-xs">Objet</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="Objet du message..." className="bg-secondary border-border mt-1" />
              </div>

              <div>
                <Label className="text-xs">Message</Label>
                <Textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Votre message..." className="bg-secondary border-border mt-1 resize-none" rows={5} />
              </div>

              <Button onClick={handleSend} disabled={sending || !subject || !message}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                <Send className="w-4 h-4 mr-2" />
                {sending ? 'Envoi en cours...' : `Envoyer à ${target === 'all' ? `tous (${clients.length})` : '1 client'}`}
              </Button>
            </div>
          </div>
        </div>

        {/* History & Stats */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" /> Clients enregistrés
            </h3>
            <p className="text-3xl font-bold text-primary">{clients.length}</p>
            <p className="text-xs text-muted-foreground mt-1">clients dans la base</p>
          </div>

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
                    <p className="text-muted-foreground">{s.count} destinataire(s) · {s.date}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Liste des clients</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {clients.slice(0, 20).map(c => (
                <div key={c.email} className="flex items-center gap-2 text-xs">
                  <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-primary">
                    {c.name?.charAt(0) || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-muted-foreground truncate">{c.email}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}