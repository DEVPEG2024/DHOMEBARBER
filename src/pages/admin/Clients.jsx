import React, { useMemo, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { UserPlus, AlertTriangle, Download, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportToCSV } from '@/utils/exportCSV';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';

export default function Clients() {
  const [search, setSearch] = React.useState('');
  const [clientToDelete, setClientToDelete] = useState(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: appointments = [] } = useQuery({
    queryKey: ['allAppointments'],
    queryFn: () => base44.entities.Appointment.list('-date', 1000),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
  });

  const clients = useMemo(() => {
    const map = {};
    appointments.forEach(apt => {
      if (!apt.client_email) return;
      if (!map[apt.client_email]) {
        map[apt.client_email] = {
          email: apt.client_email,
          name: apt.client_name,
          phone: apt.client_phone,
          visits: 0,
          noShows: 0,
          totalSpent: 0,
          lastVisit: null,
        };
      }
      const c = map[apt.client_email];
      if (apt.status === 'completed') {
        c.visits++;
        c.totalSpent += apt.total_price || 0;
      }
      if (apt.status === 'no_show') c.noShows++;
      if (!c.lastVisit || apt.date > c.lastVisit) c.lastVisit = apt.date;
    });
    return Object.values(map).sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));
  }, [appointments]);

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
    setDeleting(true);
    try {
      const clientAppointments = appointments.filter(
        apt => apt.client_email === clientToDelete.email
      );
      await Promise.all(
        clientAppointments.map(apt => base44.entities.Appointment.delete(apt.id))
      );
      queryClient.invalidateQueries({ queryKey: ['allAppointments'] });
      toast.success(`Client "${clientToDelete.name || clientToDelete.email}" supprimé`);
    } catch (err) {
      toast.error('Erreur lors de la suppression du client');
    } finally {
      setDeleting(false);
      setClientToDelete(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      await Promise.all(
        appointments.map(apt => base44.entities.Appointment.delete(apt.id))
      );
      queryClient.invalidateQueries({ queryKey: ['allAppointments'] });
      toast.success(`${clients.length} client(s) supprimé(s)`);
    } catch (err) {
      toast.error('Erreur lors de la suppression des clients');
    } finally {
      setDeleting(false);
      setShowDeleteAll(false);
    }
  };

  const handleAddClient = async () => {
    if (!newClient.email.trim()) {
      toast.error('L\'email est obligatoire');
      return;
    }
    if (clients.some(c => c.email.toLowerCase() === newClient.email.trim().toLowerCase())) {
      toast.error('Ce client existe déjà');
      return;
    }
    setSaving(true);
    try {
      const emp = employees[0] || {};
      await base44.entities.Appointment.create({
        client_name: newClient.name.trim(),
        client_email: newClient.email.trim(),
        client_phone: newClient.phone.trim(),
        date: new Date().toISOString().split('T')[0],
        start_time: '09:00',
        end_time: '09:00',
        status: 'cancelled',
        total_price: 0,
        total_duration: 0,
        employee_id: emp.id || 'none',
        employee_name: emp.name || '',
        services: [],
      });
      queryClient.invalidateQueries({ queryKey: ['allAppointments'] });
      toast.success(`Client "${newClient.name || newClient.email}" ajouté`);
      setNewClient({ name: '', email: '', phone: '' });
      setShowAddClient(false);
    } catch (err) {
      console.error('Erreur ajout client:', err);
      toast.error('Erreur lors de l\'ajout du client');
    } finally {
      setSaving(false);
    }
  };

  const handleExportJSON = () => {
    const data = clients.map(c => ({
      nom: c.name,
      email: c.email,
      telephone: c.phone || '',
    }));
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clients.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        let importedClients = [];

        if (file.name.endsWith('.json')) {
          importedClients = JSON.parse(text);
        } else {
          // CSV parsing
          const lines = text.split('\n').filter(l => l.trim());
          if (lines.length < 2) {
            toast.error('Le fichier CSV est vide ou invalide');
            return;
          }
          const separator = lines[0].includes(';') ? ';' : ',';
          const headers = lines[0].split(separator).map(h => h.replace(/"/g, '').trim().toLowerCase());

          const nameIdx = headers.findIndex(h => ['nom', 'name', 'client_name'].includes(h));
          const emailIdx = headers.findIndex(h => ['email', 'client_email', 'e-mail'].includes(h));
          const phoneIdx = headers.findIndex(h => ['telephone', 'phone', 'tel', 'client_phone', 'téléphone'].includes(h));

          if (emailIdx === -1) {
            toast.error('Colonne "email" introuvable dans le fichier');
            return;
          }

          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(separator).map(v => v.replace(/"/g, '').trim());
            const email = values[emailIdx];
            if (!email) continue;
            importedClients.push({
              nom: nameIdx !== -1 ? values[nameIdx] : '',
              email,
              telephone: phoneIdx !== -1 ? values[phoneIdx] : '',
            });
          }
        }

        if (importedClients.length === 0) {
          toast.error('Aucun client trouvé dans le fichier');
          return;
        }

        // Filter out clients that already exist
        const existingEmails = new Set(clients.map(c => c.email.toLowerCase()));
        const newClients = importedClients.filter(
          c => c.email && !existingEmails.has(c.email.toLowerCase())
        );

        if (newClients.length === 0) {
          toast.info('Tous les clients du fichier existent déjà');
          return;
        }

        // Create a placeholder appointment for each new client so they appear in the list
        await Promise.all(
          newClients.map(c =>
            base44.entities.Appointment.create({
              client_name: c.nom || c.name || '',
              client_email: c.email,
              client_phone: c.telephone || c.phone || '',
              date: new Date().toISOString().split('T')[0],
              start_time: '09:00',
              end_time: '09:00',
              status: 'cancelled',
              total_price: 0,
              total_duration: 0,
              employee_id: (employees[0] || {}).id || 'none',
              employee_name: (employees[0] || {}).name || '',
              services: [],
            })
          )
        );

        queryClient.invalidateQueries({ queryKey: ['allAppointments'] });
        toast.success(`${newClients.length} client(s) importé(s) avec succès`);
      } catch (err) {
        toast.error('Erreur lors de l\'importation du fichier');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">CRM</p>
          <h1 className="font-display text-2xl font-bold">Clients</h1>
          <p className="text-xs text-muted-foreground mt-1">{clients.length} clients enregistrés</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={handleImportCSV}
          />
          <Button size="sm" className="gap-1.5"
            onClick={() => setShowAddClient(true)}>
            <UserPlus className="w-3.5 h-3.5" /> Ajouter
          </Button>
          {clients.length > 0 && (
            <Button variant="outline" size="sm" className="border-border gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-500/10"
              onClick={() => setShowDeleteAll(true)}>
              <Trash2 className="w-3.5 h-3.5" /> Supprimer tout
            </Button>
          )}
          <Button variant="outline" size="sm" className="border-border gap-1.5"
            onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> Importer
          </Button>
          <Button variant="outline" size="sm" className="border-border gap-1.5"
            onClick={() => exportToCSV(clients.map(c => ({ nom: c.name, email: c.email, telephone: c.phone || '', visites: c.visits, depense_eur: c.totalSpent, no_shows: c.noShows, derniere_visite: c.lastVisit || '' })), 'clients')}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="border-border gap-1.5"
            onClick={handleExportJSON}>
            <Download className="w-3.5 h-3.5" /> JSON
          </Button>
        </div>
      </div>

      <Input
        placeholder="Rechercher un client..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="bg-card border-border mb-4"
      />

      <div className="space-y-2">
        {filtered.map((client, i) => (
          <motion.div
            key={client.email}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="bg-card border border-border rounded-xl p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">{client.name?.charAt(0) || '?'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{client.name || client.email}</p>
                <p className="text-[10px] text-muted-foreground">{client.email}</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="text-center">
                  <p className="font-bold">{client.visits}</p>
                  <p className="text-[9px] text-muted-foreground">visites</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-primary">{client.totalSpent}€</p>
                  <p className="text-[9px] text-muted-foreground">dépensé</p>
                </div>
                {client.noShows > 0 && (
                  <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                    {client.noShows}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  onClick={() => setClientToDelete(client)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Aucun client trouvé
        </div>
      )}

      {/* Add client inline form */}
      {showAddClient && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-5 mb-4"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Nouveau client</h3>
            <Button variant="ghost" size="sm" onClick={() => { setShowAddClient(false); setNewClient({ name: '', email: '', phone: '' }); }}>
              Annuler
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="client-name" className="text-xs">Nom</Label>
              <Input id="client-name" placeholder="Nom du client" value={newClient.name}
                onChange={e => setNewClient(prev => ({ ...prev, name: e.target.value }))} className="bg-background border-border" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-email" className="text-xs">Email *</Label>
              <Input id="client-email" type="email" placeholder="email@exemple.com" value={newClient.email}
                onChange={e => setNewClient(prev => ({ ...prev, email: e.target.value }))} className="bg-background border-border" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-phone" className="text-xs">Téléphone</Label>
              <Input id="client-phone" type="tel" placeholder="06 12 34 56 78" value={newClient.phone}
                onChange={e => setNewClient(prev => ({ ...prev, phone: e.target.value }))} className="bg-background border-border" />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button type="button" onClick={handleAddClient} disabled={saving} className="gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              {saving ? 'Ajout en cours...' : 'Ajouter le client'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Delete all confirmation dialog */}
      <AlertDialog open={showDeleteAll} onOpenChange={(open) => !open && setShowDeleteAll(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer tous les clients</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>tous les {clients.length} clients</strong> ?
              Tous les rendez-vous ({appointments.length}) seront également supprimés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Suppression...' : 'Tout supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete single client confirmation dialog */}
      <AlertDialog open={!!clientToDelete} onOpenChange={(open) => !open && setClientToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le client</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{clientToDelete?.name || clientToDelete?.email}</strong> ?
              Tous ses rendez-vous ({appointments.filter(a => a.client_email === clientToDelete?.email).length}) seront
              également supprimés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClient}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
