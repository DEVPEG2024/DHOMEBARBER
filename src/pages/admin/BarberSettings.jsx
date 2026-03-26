import React, { useState, useRef, useEffect } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Camera, LogOut, Loader2, User, Save, Clock, Video, AlertTriangle } from 'lucide-react';
import ImageCropDialog from '@/components/shared/ImageCropDialog';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' };
const defaultHours = DAYS.reduce((acc, d) => ({
  ...acc,
  [d]: d === 'sunday' ? { start: '09:00', end: '19:00', closed: true } : { start: '09:00', end: '19:00', closed: false }
}), {});

function SkillSlider({ category, value, onChange }) {
  const level = value || 0;
  const labels = ['Non évalué', 'Débutant', 'Intermédiaire', 'Avancé', 'Expert', 'Maître'];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border border-border bg-secondary/30 p-4"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
          style={{ backgroundColor: category.color + '20' }}
        >
          {category.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{category.name}</p>
          <p className="text-[11px] font-medium" style={{ color: level > 0 ? '#22c55e' : 'var(--muted-foreground)' }}>
            {labels[level]}
          </p>
        </div>
        <motion.span
          key={level}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          className="text-lg font-bold tabular-nums"
          style={{ color: level > 0 ? '#22c55e' : 'var(--muted-foreground)' }}
        >
          {level}/5
        </motion.span>
      </div>

      <div
        className="relative h-6 rounded-full overflow-hidden cursor-pointer"
        style={{ backgroundColor: '#27272a', border: '2px solid #3f3f46' }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const pct = x / rect.width;
          const newLevel = Math.ceil(pct * 5);
          onChange(newLevel === level ? 0 : newLevel);
        }}
      >
        <motion.div
          initial={false}
          animate={{ width: `${(level / 5) * 100}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            backgroundColor: '#22c55e',
            boxShadow: level > 0 ? '0 0 12px rgba(34, 197, 94, 0.4)' : 'none',
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5 px-1">
        <span className="text-[9px] text-muted-foreground">0</span>
        <span className="text-[9px] text-muted-foreground">1</span>
        <span className="text-[9px] text-muted-foreground">2</span>
        <span className="text-[9px] text-muted-foreground">3</span>
        <span className="text-[9px] text-muted-foreground">4</span>
        <span className="text-[9px] text-muted-foreground">5</span>
      </div>
    </motion.div>
  );
}

function ExperienceGauge({ value }) {
  const getColor = (v) => {
    if (v < 25) return '#ef4444';
    if (v < 50) return '#f59e0b';
    if (v < 75) return '#3b82f6';
    return '#3fcf8e';
  };
  const getLabel = (v) => {
    if (v === 0) return 'Aucune compétence';
    if (v < 25) return 'Junior';
    if (v < 50) return 'Confirmé';
    if (v < 75) return 'Expérimenté';
    if (v < 90) return 'Expert';
    return 'Maître';
  };

  const color = getColor(value);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-base font-bold" style={{ color }}>{getLabel(value)}</span>
        </div>
        <motion.span
          key={value}
          initial={{ scale: 1.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-2xl font-bold tabular-nums"
          style={{ color }}
        >
          {value}%
        </motion.span>
      </div>

      <div className="relative h-4 rounded-full overflow-hidden bg-secondary">
        <motion.div
          initial={false}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, #ef4444, #f59e0b, #3b82f6, #3fcf8e)`,
            boxShadow: `0 0 12px ${color}40`,
          }}
        />
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
}

// Find employee matching user - try multiple strategies
function findEmployee(employees, user) {
  if (!user || !employees?.length) return null;
  // 1. By employee_id
  if (user.employee_id) {
    const match = employees.find(e => String(e.id) === String(user.employee_id));
    if (match) return match;
  }
  // 2. By email
  if (user.email) {
    const match = employees.find(e => e.email && e.email.toLowerCase() === user.email.toLowerCase());
    if (match) return match;
  }
  // 3. By name
  if (user.full_name) {
    const match = employees.find(e => e.name && e.name.toLowerCase() === user.full_name.toLowerCase());
    if (match) return match;
  }
  return null;
}

export default function BarberSettings() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [cropSrc, setCropSrc] = useState(null);
  const [showCrop, setShowCrop] = useState(false);
  const [skills, setSkills] = useState(null);
  const [bio, setBio] = useState('');
  const [workingHours, setWorkingHours] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.list('-created_at', 100),
  });

  const { data: skillCategories = [] } = useQuery({
    queryKey: ['skillCategories'],
    queryFn: async () => {
      try { return await api.entities.SkillCategory.list('sort_order', 100); }
      catch { return []; }
    },
    retry: false,
  });

  const employee = findEmployee(employees, user);

  // Init from employee data
  useEffect(() => {
    if (employee && skills === null) {
      setSkills(employee.skills || []);
      setBio(employee.bio || '');
      setVideoUrl(employee.working_hours?._video_url || '');
      setWorkingHours(employee.working_hours || defaultHours);
    }
  }, [employee]);

  const computedExperience = (() => {
    if (!skills || skills.length === 0 || skillCategories.length === 0) return 0;
    const totalPossible = skillCategories.length * 5;
    const totalPoints = skills.reduce((sum, s) => sum + (s.level || 0), 0);
    return Math.round((totalPoints / totalPossible) * 100);
  })();

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Employee.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => {
      toast.error('Erreur : ' + (err?.message || 'sauvegarde échouée'));
    },
  });

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !employee) return;
    const reader = new FileReader();
    reader.onload = () => { setCropSrc(reader.result); setShowCrop(true); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCroppedPhoto = async (croppedFile) => {
    if (!employee) return;
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file: croppedFile });
      updateMutation.mutate({ id: employee.id, data: { photo_url: file_url } }, {
        onSuccess: () => toast.success('Photo mise à jour'),
      });
    } catch {
      toast.error("Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const getSkillLevel = (categoryId) => {
    const s = (skills || []).find(s => s.category_id === categoryId);
    return s?.level || 0;
  };

  const updateHours = (day, field, value) => {
    setDirty(true);
    setWorkingHours(prev => ({
      ...prev,
      [day]: { ...prev?.[day], [field]: value }
    }));
  };

  const setSkillLevel = (categoryId, level) => {
    setDirty(true);
    setSkills(prev => {
      const existing = (prev || []).filter(s => s.category_id !== categoryId);
      if (level > 0) {
        return [...existing, { category_id: categoryId, level }];
      }
      return existing;
    });
  };

  const saveProfile = async () => {
    if (!employee) {
      toast.error('Profil barber introuvable');
      setSaveStatus('Profil introuvable');
      return;
    }
    setSaveStatus('Sauvegarde en cours...');
    // Build working_hours with video URL
    const hours = { ...(employee.working_hours || defaultHours), ...(workingHours || {}) };
    const trimmedVideo = videoUrl.trim();
    if (trimmedVideo) {
      hours._video_url = trimmedVideo;
    } else {
      delete hours._video_url;
    }
    setWorkingHours(hours);

    try {
      await api.entities.Employee.update(employee.id, {
        skills,
        bio,
        experience_level: computedExperience,
        working_hours: hours,
      });
      toast.success('Profil sauvegardé !');
      setSaveStatus('Sauvegardé !');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err) {
      toast.error('Erreur : ' + (err?.message || 'sauvegarde échouée'));
      setSaveStatus('Erreur : ' + (err?.message || 'échec'));
    }
  };

  // Show debug info if employee not found
  if (!loadingEmployees && !employee) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h2 className="text-sm font-semibold text-red-400">Profil barber introuvable</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Votre compte utilisateur n'est pas lié à un profil employé.
          </p>
          <div className="bg-secondary/50 rounded-lg p-3 text-xs font-mono space-y-1">
            <p>user.id: {user?.id || 'null'}</p>
            <p>user.email: {user?.email || 'null'}</p>
            <p>user.employee_id: {user?.employee_id || 'null'}</p>
            <p>user.role: {user?.role || 'null'}</p>
            <p>employees trouvés: {employees.length}</p>
            {employees.map(e => (
              <p key={e.id}>- emp [{e.id}] {e.name} ({e.email || 'pas d\'email'})</p>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Demandez à l'admin de lier votre compte dans "Comptes Barbers".
          </p>
        </div>
        <Button
          onClick={logout}
          variant="outline"
          className="w-full mt-4 border-red-500/20 bg-red-500/8 text-red-400"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Déconnexion
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Mon compte</p>
          <h1 className="font-display text-2xl font-bold">Paramètres</h1>
        </div>
        <Button
          onClick={saveProfile}
          disabled={updateMutation.isPending}
          className="bg-primary text-primary-foreground text-xs"
        >
          {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          Sauvegarder
        </Button>
      </div>

      {/* Save status feedback */}
      {saveStatus && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-secondary/50 text-xs text-muted-foreground">
          {saveStatus}
        </div>
      )}

      <div className="space-y-6 max-w-md">
        {/* Profile photo */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-5">Photo de profil</h3>
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-secondary border border-border flex items-center justify-center">
                {employee?.photo_url ? (
                  <img src={employee.photo_url} alt={employee.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-muted-foreground/40" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{employee?.name || user?.full_name || '—'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Upload...</> : <><Camera className="w-3 h-3 mr-1.5" />Changer la photo</>}
              </Button>
            </div>
          </div>
        </div>

        {/* Video */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <Video className="w-4 h-4" /> Vidéo de présentation
          </h3>
          <p className="text-[11px] text-muted-foreground mb-4">Collez un lien YouTube ou vidéo directe (.mp4). Cliquez Sauvegarder en haut.</p>
          <Input
            value={videoUrl}
            onChange={(e) => { setVideoUrl(e.target.value); setDirty(true); }}
            placeholder="https://youtube.com/watch?v=... ou lien .mp4"
            className="bg-secondary border-border text-sm"
          />
          {videoUrl.trim() && videoUrl.trim() !== (employee?.working_hours?._video_url || '') && (
            <p className="text-[11px] text-primary mt-2">Cliquez "Sauvegarder" en haut pour enregistrer la vidéo</p>
          )}
          {employee?.working_hours?._video_url && (() => {
            const url = employee.working_hours._video_url;
            const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
            const ytId = ytMatch?.[1];
            return (
            <div className="mt-3">
              <p className="text-[11px] text-green-400 mb-2">Vidéo enregistrée</p>
              <div className="rounded-xl overflow-hidden border border-border" style={{ aspectRatio: '16/9', maxWidth: 240 }}>
                {ytId ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${ytId}?autoplay=0&controls=1&modestbranding=1`}
                    className="w-full h-full border-0"
                    allow="encrypted-media"
                  />
                ) : (
                  <video src={url} controls muted playsInline className="w-full h-full object-cover" />
                )}
              </div>
            </div>
            );
          })()}
        </div>

        {/* Bio */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">À propos de moi</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Présentez-vous aux clients en quelques lignes</p>
          <Textarea
            value={bio}
            onChange={(e) => { setBio(e.target.value); setDirty(true); }}
            placeholder="Ex: Passionné par la coiffure depuis 10 ans, spécialisé dans les coupes modernes et les dégradés..."
            className="bg-secondary border-border text-sm"
            rows={4}
          />
        </div>

        {/* Working Hours */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Mes horaires
          </h3>
          <p className="text-[11px] text-muted-foreground mb-4">Définissez vos jours et heures de travail</p>
          <div className="space-y-2">
            {DAYS.map(day => {
              const dayData = workingHours?.[day] || defaultHours[day];
              const isOpen = !dayData?.closed;
              return (
                <div
                  key={day}
                  className={`rounded-lg px-3 py-2.5 transition-colors ${isOpen ? 'bg-secondary/50' : 'bg-secondary/20'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={isOpen}
                        onCheckedChange={v => updateHours(day, 'closed', !v)}
                      />
                      <span className={`text-sm font-medium ${isOpen ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {DAY_LABELS[day]}
                      </span>
                    </div>
                    {!isOpen && (
                      <span className="text-xs text-muted-foreground/60 italic">Repos</span>
                    )}
                  </div>
                  {isOpen && (
                    <div className="flex items-center gap-2 mt-2 ml-[52px]">
                      <Input
                        type="time"
                        value={dayData?.start || '09:00'}
                        onChange={e => updateHours(day, 'start', e.target.value)}
                        className="flex-1 h-9 text-sm text-center bg-background border-border font-medium"
                      />
                      <span className="text-muted-foreground text-xs">→</span>
                      <Input
                        type="time"
                        value={dayData?.end || '19:00'}
                        onChange={e => updateHours(day, 'end', e.target.value)}
                        className="flex-1 h-9 text-sm text-center bg-background border-border font-medium"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Skills */}
        {skillCategories.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-sm font-semibold mb-1">Mes spécialités</h3>
            <p className="text-[11px] text-muted-foreground mb-5">Évaluez votre niveau de 1 à 5</p>
            <div className="space-y-5">
              {skillCategories.map((cat, i) => (
                <SkillSlider
                  key={cat.id}
                  category={cat}
                  value={getSkillLevel(cat.id)}
                  onChange={(level) => setSkillLevel(cat.id, level)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Experience Level Gauge */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">Niveau d'expérience</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Calculé automatiquement selon vos compétences</p>
          <ExperienceGauge value={computedExperience} />
        </div>

        {/* Account info */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-4">Informations du compte</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nom</span>
              <span className="font-medium">{user?.full_name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rôle</span>
              <span className="font-medium capitalize">{user?.role || '—'}</span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <Button
          onClick={logout}
          variant="outline"
          className="w-full border-red-500/20 bg-red-500/8 text-red-400 hover:bg-red-500/15 hover:text-red-400"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Déconnexion
        </Button>
      </div>

      <ImageCropDialog
        open={showCrop}
        onOpenChange={setShowCrop}
        imageSrc={cropSrc}
        onCropComplete={handleCroppedPhoto}
      />
    </div>
  );
}
