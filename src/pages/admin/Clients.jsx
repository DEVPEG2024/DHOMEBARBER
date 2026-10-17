import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { UserPlus, AlertTriangle, Download, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportToCSV } from '@/utils/exportCSV';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import LoadError from '@/components/shared/LoadError';
import { useAuth } from '@/lib/AuthContext';
import { parisInstant } from '@/lib/calendarLinks';
import { invalidateAppointmentQueries } from '@/components/agenda/agendaUtils';
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

// Les comptes arrivent par lots (le serveur renvoie chaque photo de profil dans la liste :
// 1 000 comptes d'un coup, c'était des dizaines de Mo à chaque ouverture de l'écran).
const USERS_PAGE_SIZE = 50;
const USERS_MAX_PAGES = 60; // garde-fou : 3 000 comptes
const USERS_QUERY_KEY = ['registeredUsers', 'paged'];
// Nombre de fiches rendues avant « Afficher plus »
const ROWS_STEP = 50;
// Historique des rendez-vous (visites, dépenses) : clé propre, préfixe couvert par invalidateAppointmentQueries
const APPOINTMENTS_LIMIT = 2000;
const APPOINTMENTS_QUERY_KEY = ['allAppointments', 'clients', APPOINTMENTS_LIMIT];
const DELETED_ACCOUNT_REASON = 'Salon : compte client supprimé';

const isStaffRole = (role) => role === 'admin' || role === 'barber';

/** Date du jour à Paris (`yyyy-MM-dd`) : `toISOString()` donnait la veille entre minuit et 2 h. */
const parisTodayStr = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/** Fiche « Ajouter » / « Importer » : RDV annulé, sans prestation ni prix, posé pour faire exister le contact. */
const isPlaceholderAppointment = (apt) =>
  apt.status === 'cancelled' && !(apt.services?.length) && !Number(apt.total_price) && !apt.payment_method
  && String(apt.start_time || '') === String(apt.end_time || '');

/** RDV à venir (heure de Paris), pas encore encaissé : annulé à la suppression du compte. */
const isUpcomingUnpaid = (apt, now = Date.now()) =>
  ['confirmed', 'pending'].includes(apt.status) && !apt.payment_method && apt.payment_status !== 'paid'
  && !!apt.date && parisInstant(apt.date, apt.start_time || '00:00') > now;

/** Exécute `fn` sur chaque élément, par petits lots (le serveur limite le nombre de requêtes par minute). */
async function runInBatches(items, fn, size = 8) {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += size) {
    const results = await Promise.allSettled(items.slice(i, i + size).map(fn));
    for (const r of results) { if (r.status === 'fulfilled') ok++; else failed++; }
  }
  return { ok, failed };
}

/**
 * Suppression d'un compte client sans effacer son historique : les RDV passés ou encaissés restent
 * (CA, statistiques), les RDV à venir non encaissés sont annulés (le créneau se libère), seules les
 * fiches de contact posées par « Ajouter » / « Importer » sont supprimées.
 */
const cancelUpcoming = (apt) => api.entities.Appointment.update(apt.id, {
  status: 'cancelled',
  cancellation_reason: DELETED_ACCOUNT_REASON,
});
const deletePlaceholder = (apt) => api.entities.Appointment.delete(apt.id);

/** Fusionne comptes inscrits et rendez-vous en fiches clients (fonction pure : réutilisée
 *  par les actions groupées, qui travaillent sur la liste complète et non sur les lots chargés). */
function buildClients(registeredUsers, appointments, employees) {
  const map = {};

  // D'abord, ajouter tous les utilisateurs inscrits
  registeredUsers.forEach(user => {
    if (!user.email) return;
    // Pour les barbers/admins, chercher la photo dans le profil employé
    let photo = user.photo_url || '';
    if (user.employee_id) {
      const emp = employees.find(e => String(e.id) === String(user.employee_id));
      if (emp?.photo_url) photo = emp.photo_url;
    }
    map[user.email.toLowerCase()] = {
      email: user.email,
      name: user.full_name || user.email,
      phone: user.phone || '',
      photo_url: photo,
      role: user.role,
      visits: 0,
      noShows: 0,
      totalSpent: 0,
      lastVisit: null,
      registeredAt: user.created_at,
    };
  });

  // Ensuite, enrichir/ajouter avec les données des rendez-vous
  appointments.forEach(apt => {
    if (!apt.client_email) return;
    const key = apt.client_email.toLowerCase();
    if (!map[key]) {
      map[key] = {
        email: apt.client_email,
        name: apt.client_name,
        phone: apt.client_phone,
        visits: 0,
        noShows: 0,
        totalSpent: 0,
        lastVisit: null,
      };
    }
    const c = map[key];
    // Mettre à jour le nom/téléphone depuis le RDV si manquant
    if (!c.name || c.name === c.email) c.name = apt.client_name || c.name;
    if (!c.phone) c.phone = apt.client_phone || '';
    if (apt.status === 'completed') {
      c.visits++;
      c.totalSpent += apt.total_price || 0;
    }
    if (apt.status === 'no_show') c.noShows++;
    if (!c.lastVisit || apt.date > c.lastVisit) c.lastVisit = apt.date;
  });
  return Object.values(map).sort((a, b) => (b.lastVisit || b.registeredAt || '').localeCompare(a.lastVisit || a.registeredAt || ''));
}

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
  const { user } = useAuth();
  // Suppressions réservées à l'admin (un barber voit la liste, sans corbeille)
  const isAdmin = user?.role === 'admin';

  const appointmentsQ = useQuery({
    queryKey: APPOINTMENTS_QUERY_KEY,
    queryFn: () => api.entities.Appointment.list('-date', APPOINTMENTS_LIMIT),
  });
  const appointments = appointmentsQ.data ?? [];
  const appointmentsCapped = appointments.length >= APPOINTMENTS_LIMIT;

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.filter({ is_active: true }),
  });

  // Comptes inscrits chargés par lots de 50 (`skip` = OFFSET côté serveur)
  const {
    data: usersPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError: usersError,
    error: usersErr,
    refetch: refetchUsers,
    isFetching: usersFetching,
  } = useInfiniteQuery({
    queryKey: USERS_QUERY_KEY,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.entities.User.list('-created_at', USERS_PAGE_SIZE, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      (lastPage?.length || 0) < USERS_PAGE_SIZE || allPages.length >= USERS_MAX_PAGES
        ? undefined
        : allPages.length * USERS_PAGE_SIZE,
  });

  const registeredUsers = useMemo(() => usersPages?.pages.flat() ?? [], [usersPages]);

  // Comptes ou rendez-vous non chargés : LoadError, jamais « Aucun client » ni des clients à
  // 0 visite / 0 € (leurs rendez-vous manquent)
  const usersFailed = usersError && !usersPages;
  const appointmentsFailed = appointmentsQ.isError && !appointmentsQ.data;
  const listFailed = usersFailed || appointmentsFailed;
  const retryList = () => Promise.all([
    usersFailed ? refetchUsers() : null,
    appointmentsFailed ? appointmentsQ.refetch() : null,
  ]);

  /**
   * Complète le chargement des comptes puis renvoie la liste entière.
   * Utilisé par la recherche (elle doit porter sur toute la base, pas sur les lots affichés)
   * et par les actions groupées (export, import, suppression). Les lots déjà en cache
   * sont conservés, et le cache de la requête paginée est mis à jour pour que l'écran suive.
   */
  const allUsersPromise = useRef(null);
  const ensureAllUsers = useCallback(() => {
    if (allUsersPromise.current) return allUsersPromise.current;
    const run = async () => {
      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      const cached = queryClient.getQueryData(USERS_QUERY_KEY);
      const pages = cached?.pages ? [...cached.pages] : [];
      const complete = pages.length > 0 && pages[pages.length - 1].length < USERS_PAGE_SIZE;
      if (!complete) {
        for (let i = pages.length; i < USERS_MAX_PAGES; i++) {
          const page = await api.entities.User.list('-created_at', USERS_PAGE_SIZE, i * USERS_PAGE_SIZE);
          pages.push(page);
          if (page.length < USERS_PAGE_SIZE) break;
        }
        queryClient.setQueryData(USERS_QUERY_KEY, {
          pages,
          pageParams: pages.map((_, i) => i * USERS_PAGE_SIZE),
        });
      }
      return pages.flat();
    };
    allUsersPromise.current = run().finally(() => { allUsersPromise.current = null; });
    return allUsersPromise.current;
  }, [queryClient]);

  // Le nombre de clients affiché en tête doit être le vrai total : on complète le chargement de
  // tous les comptes en tâche de fond dès l'ouverture (la liste ne transporte plus de photos,
  // quelques lots légers). La recherche et les actions groupées en profitent aussi.
  useEffect(() => {
    if (hasNextPage) ensureAllUsers().catch(() => {});
  }, [hasNextPage, ensureAllUsers]);

  const clients = useMemo(
    () => buildClients(registeredUsers, appointments, employees),
    [appointments, registeredUsers, employees]
  );

  const filtered = useMemo(() => clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  ), [clients, search]);

  // Rendez-vous qui seront annulés (aperçu dans les fenêtres de confirmation)
  const clientUpcomingCount = clientToDelete
    ? appointments.filter(a => a.client_email?.toLowerCase() === clientToDelete.email?.toLowerCase() && isUpcomingUnpaid(a)).length
    : 0;
  const allUpcomingCount = showDeleteAll ? appointments.filter(a => a.client_email && isUpcomingUnpaid(a)).length : 0;

  // Le rendu est lui aussi progressif : 300 fiches animées d'un coup, c'est une page qui rame
  const [visibleCount, setVisibleCount] = useState(ROWS_STEP);
  useEffect(() => { setVisibleCount(ROWS_STEP); }, [search]);
  const visibleClients = filtered.slice(0, visibleCount);
  const canShowMore = filtered.length > visibleCount;

  const handleDeleteClient = async () => {
    if (!clientToDelete || !isAdmin) return;
    if (isStaffRole(clientToDelete.role)) {
      toast.error('Compte du personnel : gérez-le depuis Comptes barbers');
      setClientToDelete(null);
      return;
    }
    setDeleting(true);
    const email = clientToDelete.email?.toLowerCase();
    try {
      // Le compte d'abord (il peut être dans un lot non encore chargé) : un membre du personnel dont
      // la fiche n'avait pas encore son rôle n'est jamais touché, ni lui ni ses rendez-vous
      const sameEmail = u => u.email?.toLowerCase() === email;
      const registeredUser = registeredUsers.find(sameEmail)
        || (hasNextPage ? (await ensureAllUsers()).find(sameEmail) : undefined);
      if (registeredUser && isStaffRole(registeredUser.role)) {
        toast.error('Compte du personnel : gérez-le depuis Comptes barbers');
        return;
      }
      // Ses rendez-vous lus côté serveur (la liste chargée ici est plafonnée)
      const clientAppointments = (await api.entities.Appointment.filter({ client_email: clientToDelete.email }, '-date', 500))
        .filter(apt => apt.client_email?.toLowerCase() === email);
      const now = Date.now();
      const upcoming = await runInBatches(clientAppointments.filter(apt => isUpcomingUnpaid(apt, now)), cancelUpcoming);
      const placeholders = await runInBatches(clientAppointments.filter(isPlaceholderAppointment), deletePlaceholder);
      if (registeredUser) {
        await api.entities.User.delete(registeredUser.id);
      }
      const name = clientToDelete.name || clientToDelete.email;
      if (upcoming.failed + placeholders.failed > 0) {
        toast.warning(`Client "${name}" supprimé, mais ${upcoming.failed + placeholders.failed} rendez-vous n'ont pas pu être traités`);
      } else {
        toast.success(`Client "${name}" supprimé`, {
          description: upcoming.ok > 0 ? `${upcoming.ok} rendez-vous à venir annulé${upcoming.ok > 1 ? 's' : ''}, historique conservé` : 'Historique conservé',
        });
      }
    } catch (err) {
      toast.error(err?.message && !/^HTTP/.test(err.message) ? err.message : 'Erreur lors de la suppression du client');
    } finally {
      invalidateAppointmentQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['registeredUsers'] });
      setDeleting(false);
      setClientToDelete(null);
    }
  };

  // Même règle pour tous les comptes clients : historique conservé, RDV à venir annulés
  const handleDeleteAll = async () => {
    if (!isAdmin) return;
    setDeleting(true);
    try {
      // On charge d'abord tous les lots, sinon seuls les comptes affichés seraient supprimés
      const allUsers = await ensureAllUsers();
      const clientUsers = allUsers.filter(u => u.role === 'user');
      const staffEmails = new Set(allUsers.filter(u => isStaffRole(u.role)).map(u => u.email?.toLowerCase()));
      const now = Date.now();
      // RDV des clients (jamais ceux saisis au nom d'un membre du personnel)
      const ofClients = appointments.filter(apt => apt.client_email && !staffEmails.has(apt.client_email.toLowerCase()));
      const upcoming = await runInBatches(ofClients.filter(apt => isUpcomingUnpaid(apt, now)), cancelUpcoming);
      const placeholders = await runInBatches(ofClients.filter(isPlaceholderAppointment), deletePlaceholder);
      const accounts = await runInBatches(clientUsers, u => api.entities.User.delete(u.id));
      const failed = upcoming.failed + placeholders.failed + accounts.failed;
      if (failed > 0) {
        toast.warning(`${accounts.ok} compte(s) supprimé(s), ${failed} opération(s) en échec : relancez pour terminer`);
      } else {
        toast.success(`${accounts.ok} compte(s) client supprimé(s)`, {
          description: `${upcoming.ok} rendez-vous à venir annulé(s), historique conservé`,
        });
      }
    } catch {
      toast.error('Erreur lors de la suppression des clients');
    } finally {
      invalidateAppointmentQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['registeredUsers'] });
      setDeleting(false);
      setShowDeleteAll(false);
    }
  };

  const handleAddClient = async () => {
    if (!newClient.email.trim()) {
      toast.error('L\'email est obligatoire');
      return;
    }
    setSaving(true);
    try {
      // Doublon : on vérifie sur toute la base, pas seulement sur les comptes déjà chargés
      const allClients = buildClients(await ensureAllUsers(), appointments, employees);
      if (allClients.some(c => c.email?.toLowerCase() === newClient.email.trim().toLowerCase())) {
        toast.error('Ce client existe déjà');
        return;
      }
      const emp = employees[0] || {};
      await api.entities.Appointment.create({
        client_name: newClient.name.trim(),
        client_email: newClient.email.trim(),
        client_phone: newClient.phone.trim(),
        date: parisTodayStr(),
        start_time: '09:00',
        end_time: '09:00',
        status: 'cancelled',
        total_price: 0,
        total_duration: 0,
        employee_id: emp.id || 'none',
        employee_name: emp.name || '',
        services: [],
      });
      invalidateAppointmentQueries(queryClient);
      toast.success(`Client "${newClient.name || newClient.email}" ajouté`);
      setNewClient({ name: '', email: '', phone: '' });
      setShowAddClient(false);
    } catch (err) {
      toast.error('Erreur lors de l\'ajout du client');
    } finally {
      setSaving(false);
    }
  };

  // Les exports portent sur toute la base : on complète d'abord les lots de comptes
  const handleExportCSV = async () => {
    const allClients = buildClients(await ensureAllUsers(), appointments, employees);
    exportToCSV(allClients.map(c => ({
      nom: c.name,
      email: c.email,
      telephone: c.phone || '',
      visites: c.visits,
      depense_eur: c.totalSpent,
      no_shows: c.noShows,
      derniere_visite: c.lastVisit || '',
    })), 'clients');
  };

  const handleExportJSON = async () => {
    const allClients = buildClients(await ensureAllUsers(), appointments, employees);
    const data = allClients.map(c => ({
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

        // Filter out clients that already exist (sur toute la base, pas sur les lots chargés)
        const allClients = buildClients(await ensureAllUsers(), appointments, employees);
        const existingEmails = new Set(allClients.map(c => c.email.toLowerCase()));
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
            api.entities.Appointment.create({
              client_name: c.nom || c.name || '',
              client_email: c.email,
              client_phone: c.telephone || c.phone || '',
              date: parisTodayStr(),
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

        invalidateAppointmentQueries(queryClient);
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
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">CRM</p>
          <h1 className="font-display text-2xl font-bold">Clients</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {hasNextPage ? 'Comptage des clients…' : `${clients.length} client${clients.length > 1 ? 's' : ''} enregistré${clients.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
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
          {isAdmin && clients.length > 0 && (
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
            onClick={handleExportCSV}>
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

      {appointmentsCapped && (
        <p className="text-[11px] text-amber-400 -mt-2 mb-3">
          Seuls les {APPOINTMENTS_LIMIT} derniers rendez-vous sont pris en compte (visites, dépenses, dernière visite).
        </p>
      )}

      {search.trim() && hasNextPage && (
        <p className="text-[11px] text-muted-foreground -mt-3 mb-3">
          Chargement des comptes restants pour chercher dans toute la base...
        </p>
      )}

      {listFailed && (
        <LoadError
          what="la liste des clients"
          error={usersFailed ? usersErr : appointmentsQ.error}
          onRetry={retryList}
          retrying={usersFetching || appointmentsQ.isFetching}
        />
      )}

      {!listFailed && (
      <div className="space-y-2">
        {visibleClients.map((client, i) => (
          <motion.div
            key={client.email}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 20) * 0.02 }}
            className="bg-card border border-border rounded-xl p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {client.photo_url ? (
                  <img src={client.photo_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-primary">{client.name?.charAt(0) || '?'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{client.name || client.email}</p>
                {/* truncate : un email long passait sous « visites » sur téléphone */}
                <p className="text-[10px] text-muted-foreground truncate" title={client.email}>{client.email}</p>
              </div>
              <div className="flex items-center gap-3 text-xs shrink-0">
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
                {isAdmin && !isStaffRole(client.role) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                    aria-label={`Supprimer ${client.name || client.email}`}
                    onClick={() => setClientToDelete(client)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      )}

      {/* Affichage progressif : d'abord les fiches déjà chargées, puis le lot de comptes suivant */}
      {!listFailed && filtered.length > 0 && (canShowMore || hasNextPage) && (
        <div className="flex justify-center py-5">
          <Button
            variant="outline"
            size="sm"
            className="border-border"
            disabled={isFetchingNextPage}
            onClick={() => (canShowMore ? setVisibleCount(v => v + ROWS_STEP) : fetchNextPage())}
          >
            {isFetchingNextPage ? 'Chargement...' : `Afficher plus (${visibleClients.length}/${filtered.length})`}
          </Button>
        </div>
      )}

      {!listFailed && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {search.trim() && hasNextPage ? 'Recherche dans tous les comptes...' : 'Aucun client trouvé'}
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
            <AlertDialogTitle>Supprimer tous les comptes clients</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>tous les comptes clients</strong> ? Leurs rendez-vous à venir
              non encaissés ({allUpcomingCount}) seront annulés. Les rendez-vous passés et encaissés sont conservés
              (chiffre d'affaires, statistiques). Les comptes du personnel ne sont pas touchés. Cette action est irréversible.
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
              Êtes-vous sûr de vouloir supprimer le compte de <strong>{clientToDelete?.name || clientToDelete?.email}</strong> ?
              Ses rendez-vous à venir non encaissés ({clientUpcomingCount}) seront annulés. Son historique (rendez-vous
              passés et encaissés) est conservé : il restera visible ici tant qu'il a des rendez-vous. Cette action est irréversible.
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
