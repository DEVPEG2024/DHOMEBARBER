import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Star, MessageSquare, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const GOOGLE_PLACE_ID = 'ChIJm6cgTFprjEcRZsuEqhCEPXY';
const GOOGLE_REVIEW_URL = `https://search.google.com/local/writereview?placeid=${GOOGLE_PLACE_ID}`;

function StarSelect({ rating, onRate }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} onClick={() => onRate(i)}>
          <Star className={`w-5 h-5 transition-colors ${i <= rating ? 'text-primary fill-primary' : 'text-muted-foreground/30'}`} />
        </button>
      ))}
    </div>
  );
}

export default function MyReviews() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['myReviews', user?.email],
    queryFn: () => api.entities.Review.filter({ client_email: user?.email }, '-created_date', 50),
    enabled: !!user?.email,
  });

  const createReview = useMutation({
    mutationFn: (data) => api.entities.Review.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myReviews'] });
      toast.success('Merci pour votre avis !');
      setShowForm(false);
      setRating(0);
      setComment('');
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  });

  const handleSubmit = () => {
    if (rating === 0) return toast.error('Veuillez donner une note');
    createReview.mutate({
      client_name: user?.full_name || 'Client',
      client_email: user?.email,
      rating,
      comment,
      is_visible: true,
    });
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold mb-1">Vos évaluations</p>
          <h1 className="font-display text-3xl font-bold text-foreground">Mes Avis</h1>
          <div className="h-0.5 w-12 mt-2 rounded-full bg-gradient-to-r from-primary to-primary/30" />
        </motion.div>

        {/* Google Review CTA */}
        <motion.a
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          href={GOOGLE_REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 mb-6 hover:bg-blue-500/10 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-blue-400 fill-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Laisser un avis Google</p>
            <p className="text-[11px] text-muted-foreground">Aidez-nous en partageant votre expérience</p>
          </div>
          <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
        </motion.a>

        {/* Write review */}
        {!showForm ? (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={() => setShowForm(true)}
            className="w-full py-3 rounded-2xl border border-primary/20 bg-primary/5 text-primary text-sm font-semibold mb-6 hover:bg-primary/10 transition-colors"
          >
            Écrire un avis sur l'app
          </motion.button>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4 mb-6 space-y-4">
            <p className="text-sm font-semibold">Votre avis</p>
            <StarSelect rating={rating} onRate={setRating} />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Partagez votre expérience..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-muted-foreground">
                Annuler
              </button>
              <button onClick={handleSubmit} disabled={createReview.isPending}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-primary text-primary-foreground disabled:opacity-60">
                {createReview.isPending ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>
          </motion.div>
        )}

        {/* My reviews list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-5">
              <MessageSquare className="w-8 h-8 text-muted-foreground/25" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Aucun avis</p>
            <p className="text-xs text-muted-foreground">Partagez votre expérience après votre visite</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review, i) => (
              <motion.div key={review.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? 'text-primary fill-primary' : 'text-muted-foreground/20'}`} />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {review.created_date && new Date(review.created_date).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                {review.comment && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{review.comment}</p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
