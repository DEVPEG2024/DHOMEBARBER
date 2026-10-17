import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiRequest, apiUrl } from '@/api/apiClient';
import { motion } from 'framer-motion';
import { CalendarDays, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import LoadError from '@/components/shared/LoadError';
import { fetchLeaveConflicts, agendaErrorMessage } from '@/components/agenda/agendaUtils';

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: Clock },
  approved: { label: 'Approuvé', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
  declined: { label: 'Refusé', color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: XCircle },
};

const LEAVE_TYPES = {
  vacation: 'Vacances',
  sick: 'Maladie',
  personal: 'Personnel',
  closure: 'Fermeture',
};

export default function AdminLeave() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all'); // all, pending, approved, declined
  const [leaveToDelete, setLeaveToDelete] = useState(null);
  // Approbation d'un congé qui tombe sur des RDV clients : { leave, conflicts, failed } ; `checkingId` pendant la vérification
  const [approval, setApproval] = useState(null);
  const [checkingId, setCheckingId] = useState(null);

  const timeOffsQuery = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
  });
  const timeOffs = timeOffsQuery.data ?? [];
  const isLoading = timeOffsQuery.isLoading;

  const filtered = useMemo(() => {
    if (filter === 'all') return timeOffs;
    return timeOffs.filter(t => t.status === filter);
  }, [timeOffs, filter]);

  const pendingCount = timeOffs.filter(t => t.status === 'pending').length;

  const handleUpdateStatus = async (leave, newStatus, remaining = 0) => {
    try {
      await apiRequest('PATCH', apiUrl(`/leave/${leave.id}/status`), { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ['timeOffs'] });
      toast.success(
        newStatus === 'approved'
          ? `Congé de ${leave.employee_name} approuvé - notification envoyée${remaining > 0 ? ` · ${remaining} rendez-vous client${remaining > 1 ? 's' : ''} à déplacer ou annuler` : ''}`
          : `Congé de ${leave.employee_name} refusé - notification envoyée`,
        remaining > 0 ? { duration: 8000 } : undefined,
      );
    } catch (err) {
      toast.error(agendaErrorMessage(err, 'Erreur lors de la mise à jour'));
    }
  };

  // « Valider » : d'abord les RDV clients encore actifs sur ces jours. S'il y en a (ou si la
  // vérification échoue : on ne conclut jamais qu'il n'y en a pas), la fenêtre les liste.
  const handleApprove = async (leave) => {
    if (checkingId) return;
    setCheckingId(leave.id);
    try {
      const conflicts = await fetchLeaveConflicts(leave.employee_id, leave.start_date, leave.end_date);
      if (conflicts.length === 0) await handleUpdateStatus(leave, 'approved');
      else setApproval({ leave, conflicts, failed: false });
    } catch {
      setApproval({ leave, conflicts: [], failed: true });
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async () => {
    if (!leaveToDelete) return;
    try {
      await api.entities.TimeOff.delete(leaveToDelete.id);
      queryClient.invalidateQueries({ queryKey: ['timeOffs'] });
      toast.success('Congé supprimé');
    } catch (err) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setLeaveToDelete(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr + 'T00:00:00'), 'd MMM yyyy', { locale: fr });
    } catch { return dateStr; }
  };

  const filters = [
    { key: 'all', label: 'Tous' },
    { key: 'pending', label: `En attente${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { key: 'approved', label: 'Approuvés' },
    { key: 'declined', label: 'Refusés' },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Gestion</p>
          <h1 className="font-display text-2xl font-bold">Congés</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {pendingCount > 0
              ? `${pendingCount} demande(s) en attente`
              : 'Aucune demande en attente'}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {filters.map(f => (
          <button key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === f.key
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-secondary/50 border-border text-muted-foreground hover:border-primary/20'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Leave requests list */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Chargement...</div>
      ) : timeOffsQuery.isError && !timeOffsQuery.data ? (
        <LoadError what="les demandes de congé" error={timeOffsQuery.error} onRetry={timeOffsQuery.refetch} retrying={timeOffsQuery.isFetching} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Aucune demande de congé {filter !== 'all' ? 'dans cette catégorie' : ''}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((leave, i) => {
            const cfg = STATUS_CONFIG[leave.status] || STATUS_CONFIG.pending;
            const StatusIcon = cfg.icon;
            const isPending = leave.status === 'pending';

            return (
              <motion.div key={leave.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`bg-card border rounded-xl p-4 ${isPending ? 'border-yellow-500/30' : 'border-border'}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CalendarDays className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{leave.employee_name || 'Barber inconnu'}</p>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                        {cfg.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {LEAVE_TYPES[leave.type] || leave.type || 'Congé'}
                      </span>
                    </div>
                    <p className="text-xs text-foreground mt-1">
                      Du <strong>{formatDate(leave.start_date)}</strong> au <strong>{formatDate(leave.end_date)}</strong>
                    </p>
                    {leave.reason && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Motif : {leave.reason}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Demandé le {formatDate(leave.requested_at?.split('T')[0] || leave.created_at?.split('T')[0])}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isPending && (
                      <>
                        <Button size="sm" className="gap-1 text-xs bg-green-600 hover:bg-green-700"
                          disabled={!!checkingId}
                          onClick={() => handleApprove(leave)}>
                          <CheckCircle className="w-3 h-3" /> {checkingId === leave.id ? 'Vérification…' : 'Valider'}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                          onClick={() => handleUpdateStatus(leave, 'declined')}>
                          <XCircle className="w-3 h-3" /> Refuser
                        </Button>
                      </>
                    )}
                    {!isPending && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500"
                        onClick={() => setLeaveToDelete(leave)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Congé sur des RDV clients : à déplacer ou annuler depuis l'agenda (le client est alors prévenu) */}
      <AlertDialog open={!!approval}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {approval?.failed
                ? 'Impossible de vérifier les rendez-vous de ces jours'
                : `${approval?.conflicts.length} rendez-vous client${approval?.conflicts.length > 1 ? 's' : ''} sur ce congé`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {approval?.failed
                ? `Des clients ont peut-être rendez-vous avec ${approval?.leave.employee_name || 'ce barber'} pendant ce congé : vérifiez l'agenda avant ou après l'approbation.`
                : 'Déplacez-les ou annulez-les depuis l\'agenda pour que les clients soient prévenus ; sinon ils recevront leur rappel.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {approval && !approval.failed && (
            <ul className="space-y-1.5">
              {approval.conflicts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-secondary/60 px-3 py-2 text-xs min-w-0">
                  <span className="min-w-0 break-words">
                    <strong>{a.client_name || 'Client'}</strong>
                    {' · '}{format(new Date(`${String(a.date).slice(0, 10)}T12:00:00`), 'EEE d MMM', { locale: fr })} à {String(a.start_time || '').slice(0, 5)}
                  </span>
                  <Link
                    to={`/admin/agenda?view=day&date=${String(a.date).slice(0, 10)}&barber=${approval.leave.employee_id}`}
                    className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap"
                  >
                    Ouvrir l'agenda
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setApproval(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const { leave, conflicts } = approval;
                setApproval(null);
                handleUpdateStatus(leave, 'approved', conflicts.length);
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Approuver quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!leaveToDelete} onOpenChange={(open) => !open && setLeaveToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce congé</AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer le congé de <strong>{leaveToDelete?.employee_name}</strong> du {formatDate(leaveToDelete?.start_date)} au {formatDate(leaveToDelete?.end_date)} ?
              {leaveToDelete?.status === 'approved' && ' Les dates seront débloquées dans l\'agenda.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
