import React, { useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronLeft, Scissors, Calendar, User, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

function SkillBar({ category, level, delay }) {
  const labels = ['Non évalué', 'Débutant', 'Intermédiaire', 'Avancé', 'Expert', 'Maître'];
  const pct = (level / 5) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2.5">
          <span className="text-base">{category.emoji}</span>
          <span className="text-sm font-medium text-foreground">{category.name}</span>
        </div>
        <span className={`text-xs font-medium ${level > 0 ? 'text-primary' : 'text-muted-foreground/50'}`}>
          {labels[level]}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: delay + 0.15, duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full bg-primary/80"
          style={{ boxShadow: level > 0 ? '0 0 8px hsl(var(--primary) / 0.3)' : 'none' }}
        />
      </div>
    </motion.div>
  );
}

function ExperienceBar({ value, delay }) {
  const getLabel = (v) => {
    if (v < 25) return 'Junior';
    if (v < 50) return 'Confirmé';
    if (v < 75) return 'Expérimenté';
    if (v < 90) return 'Expert';
    return 'Maître';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">Niveau d'expérience</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{getLabel(value)}</span>
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: delay + 0.3, type: 'spring' }}
            className="text-sm font-bold text-primary tabular-nums"
          >
            {value}%
          </motion.span>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ delay: delay + 0.2, duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
          style={{ boxShadow: '0 0 12px hsl(var(--primary) / 0.25)' }}
        />
      </div>
    </motion.div>
  );
}

// Glass card wrapper
function GlassCard({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] ${className}`}
    >
      {children}
    </motion.div>
  );
}

// Extract YouTube video ID from various URL formats
function getYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function MediaBlock({ videoUrl, photoUrl, name }) {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);

  const youtubeId = getYouTubeId(videoUrl);
  const isDirectVideo = videoUrl && !youtubeId;
  const showDirectVideo = isDirectVideo && !videoFailed;
  const showPhoto = (!videoUrl || (isDirectVideo && videoFailed)) && photoUrl;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.05 }}
      className="relative rounded-2xl overflow-hidden border border-white/[0.08] mb-6"
      style={{ aspectRatio: '1080/1350' }}
    >
      {/* YouTube embed — no title, no controls, no branding, fast start */}
      {youtubeId && (
        <>
          {photoUrl && <img src={photoUrl} alt={name} className="absolute inset-0 w-full h-full object-cover" />}
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&controls=0&showinfo=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&fs=0`}
            className="absolute inset-0 w-full h-full border-0 z-[1]"
            style={{ pointerEvents: 'none' }}
            allow="autoplay; encrypted-media"
            loading="eager"
            title=""
          />
        </>
      )}

      {/* Direct video */}
      {showDirectVideo && (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster={photoUrl || undefined}
          onError={() => setVideoFailed(true)}
          className="w-full h-full object-cover"
        />
      )}

      {/* Photo fallback */}
      {showPhoto && (
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
      )}

      {/* No media */}
      {!videoUrl && !photoUrl && (
        <div className="w-full h-full bg-white/[0.02] flex items-center justify-center">
          <User className="w-20 h-20 text-muted-foreground/20" />
        </div>
      )}

      {/* Gradient overlay bottom */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/80 to-transparent pointer-events-none z-[2]" />
      <div className="absolute bottom-3 right-3 w-9 h-9 rounded-xl bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/20 z-[2]">
        <Scissors className="w-4 h-4 text-primary-foreground" />
      </div>
    </motion.div>
  );
}

export default function BarberProfile() {
  const { id } = useParams();

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: async () => {
      const all = await api.entities.Employee.filter({ is_active: true }, 'sort_order', 100);
      return all.find(e => e.id === id) || null;
    },
    enabled: !!id,
    retry: 1,
  });

  const { data: skillCategories = [] } = useQuery({
    queryKey: ['skillCategories'],
    queryFn: async () => {
      try {
        return await api.entities.SkillCategory.list('sort_order', 100);
      } catch {
        return [];
      }
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Barber introuvable</p>
        <Link to="/" className="text-primary text-sm mt-2 inline-block">Retour à l'accueil</Link>
      </div>
    );
  }

  const employeeSkills = employee.skills || [];
  const allSkills = skillCategories.map(cat => {
    const s = employeeSkills.find(s => s.category_id === cat.id);
    return { category: cat, level: s?.level || 0 };
  });

  // Extract video URL from bio marker
  const VIDEO_MARKER = '\n%%VIDEO%%';
  const rawBio = employee.bio || '';
  const markerIdx = rawBio.indexOf(VIDEO_MARKER);
  const displayBio = markerIdx >= 0 ? rawBio.slice(0, markerIdx) : rawBio;
  const videoUrl = markerIdx >= 0 ? rawBio.slice(markerIdx + VIDEO_MARKER.length) : null;
  const photoUrl = employee.photo_url;
  const hasAboutContent = displayBio || allSkills.length > 0 || (employee.experience_level > 0);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Subtle ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/[0.04] rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-6 pb-28">
        {/* Back button */}
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ChevronLeft className="w-4 h-4" />
          Retour
        </Link>

        {/* Name + Title */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-5">
          <h1 className="font-display text-2xl font-bold text-foreground">{employee.name}</h1>
          <p className="text-sm text-primary/80 font-medium mt-1">{employee.title || 'Barber'}</p>
        </motion.div>

        {/* Video / Photo - format vertical 1350x1080 */}
        <MediaBlock videoUrl={videoUrl} photoUrl={photoUrl} name={employee.name} />

        {/* About section - Glass card */}
        {hasAboutContent && (
          <GlassCard className="p-5 mb-5 space-y-5" delay={0.1}>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-primary/60 font-semibold">À propos</h3>

            {/* Bio */}
            {displayBio && (
              <p className="text-sm text-muted-foreground leading-relaxed">{displayBio}</p>
            )}

            {/* Experience gauge */}
            {employee.experience_level > 0 && (
              <ExperienceBar value={employee.experience_level} delay={0.15} />
            )}

            {/* Skills */}
            {allSkills.length > 0 && (
              <>
                {(displayBio || employee.experience_level > 0) && (
                  <div className="border-t border-white/[0.06]" />
                )}
                <div>
                  <h4 className="text-[10px] uppercase tracking-[0.2em] text-primary/50 font-semibold mb-4">Spécialités</h4>
                  <div className="space-y-3.5">
                    {allSkills.map(({ category, level }, i) => (
                      <SkillBar key={category.id} category={category} level={level} delay={0.2 + i * 0.06} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </GlassCard>
        )}

        {/* Working hours - Glass card */}
        {employee.working_hours && Object.keys(employee.working_hours).length > 0 && (
          <GlassCard className="p-5 mb-6" delay={0.25}>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-primary/60 font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Horaires
            </h3>
            <div className="space-y-2">
              {Object.entries(employee.working_hours).map(([day, hours]) => {
                const dayLabels = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' };
                const label = dayLabels[day] || day;
                if (hours?.closed) {
                  return (
                    <div key={day} className="flex justify-between text-sm">
                      <span className="text-muted-foreground/50">{label}</span>
                      <span className="text-muted-foreground/30 text-xs">Fermé</span>
                    </div>
                  );
                }
                return (
                  <div key={day} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground/80 font-medium tabular-nums">{hours?.open || '09:00'} – {hours?.close || '19:00'}</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* CTA */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Link to={`/booking?barber=${employee.id}`}>
            <Button className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
              <Calendar className="w-4 h-4 mr-2" />
              Prendre rendez-vous avec {employee.name}
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
