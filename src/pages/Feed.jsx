import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { Send, Heart, Trash2, Loader2, Camera, MessageCircle, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getRoleBadge(role) {
  if (role === 'admin') return { label: 'Admin', color: '#ef4444' };
  if (role === 'barber') return { label: 'Barber', color: '#3fcf8e' };
  return null;
}

function CommentItem({ comment, currentUser, onDelete }) {
  const badge = getRoleBadge(comment.author_role);
  const initials = comment.author_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';
  const isOwner = currentUser?.email === comment.author_email || currentUser?.role === 'admin';

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5"
    >
      <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center flex-shrink-0">
        {comment.author_photo_url ? (
          <img src={comment.author_photo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">{initials}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-secondary/50 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">{comment.author_name}</span>
            {badge && (
              <span className="text-[9px] font-bold px-1 py-0.5 rounded-full" style={{ backgroundColor: badge.color + '20', color: badge.color }}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground/80 mt-0.5 whitespace-pre-wrap">{comment.content}</p>
        </div>
        <div className="flex items-center gap-3 mt-1 px-1">
          <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
          {isOwner && (
            <button onClick={() => onDelete(comment.id)} className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors">
              Supprimer
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function GlassCard({ children }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const x = useTransform(scrollYProgress, [0, 0.5, 1], [-30, 15, -20]);
  const opacity = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [0, 0.6, 0.6, 0]);

  return (
    <div ref={ref} className="relative">
      <motion.div
        className="absolute -bottom-3 left-4 right-4 h-16 rounded-2xl blur-xl pointer-events-none"
        style={{
          x,
          opacity,
          background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(16,185,129,0.1) 50%, rgba(34,197,94,0.08) 100%)',
          backdropFilter: 'blur(8px)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

const REACTIONS = ['❤️', '🔥', '💪', '😂', '👏', '💈'];

function PostCard({ post, currentUser, onLike, onDelete, likes, comments, onComment, onDeleteComment, getAuthorPhoto }) {
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const postLikes = likes.filter(l => l.post_id === post.id);
  const userLike = postLikes.find(l => l.user_email === currentUser?.email);
  const likeCount = postLikes.length;

  // Group reactions by emoji
  const reactionCounts = {};
  postLikes.forEach(l => {
    const r = l.reaction || '❤️';
    reactionCounts[r] = (reactionCounts[r] || 0) + 1;
  });
  const postComments = comments.filter(c => c.post_id === post.id);
  const commentCount = postComments.length;
  const badge = getRoleBadge(post.author_role);
  const initials = post.author_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';
  const isOwner = currentUser?.email === post.author_email || currentUser?.role === 'admin';

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    await onComment(post.id, commentText.trim());
    setCommentText('');
    setSubmitting(false);
    setShowComments(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-card border border-border rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center flex-shrink-0">
          {post.author_photo_url ? (
            <img src={post.author_photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-muted-foreground">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{post.author_name}</p>
            {badge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: badge.color + '20', color: badge.color }}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{timeAgo(post.created_at)}</p>
        </div>
        {isOwner && (
          <button onClick={() => onDelete(post.id)} className="text-muted-foreground/40 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      {post.content && (
        <p className="px-4 pb-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>
      )}

      {/* Image - 4:5 vertical format (1080x1350) */}
      {post.image_url && (
        <div className="px-4 pb-3">
          <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: '4/5' }}>
            <img src={post.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* Reaction summary */}
      {likeCount > 0 && (
        <div className="flex items-center gap-1 px-4 py-1.5">
          <div className="flex -space-x-1">
            {Object.entries(reactionCounts).slice(0, 3).map(([emoji]) => (
              <span key={emoji} className="text-sm">{emoji}</span>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-1">{likeCount}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-t border-border relative">
        {/* Reaction picker */}
        <AnimatePresence>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="absolute bottom-full left-3 mb-2 flex gap-1 bg-card border border-border rounded-2xl px-2 py-1.5 shadow-xl"
            >
              {REACTIONS.map(emoji => (
                <motion.button
                  key={emoji}
                  whileHover={{ scale: 1.3 }}
                  whileTap={{ scale: 0.8 }}
                  onClick={() => {
                    onLike(post.id, !!userLike, emoji);
                    setShowReactions(false);
                  }}
                  className={`text-xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors ${
                    userLike?.reaction === emoji ? 'bg-primary/15' : ''
                  }`}
                >
                  {emoji}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => userLike ? onLike(post.id, true, userLike.reaction) : setShowReactions(!showReactions)}
          onDoubleClick={() => setShowReactions(!showReactions)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-secondary transition-colors"
        >
          {userLike ? (
            <span className="text-lg">{userLike.reaction || '❤️'}</span>
          ) : (
            <Heart className="w-5 h-5 text-muted-foreground" />
          )}
          <span className={`text-xs font-medium ${userLike ? 'text-foreground' : 'text-muted-foreground'}`}>
            {userLike ? 'Aimé' : 'J\'aime'}
          </span>
        </motion.button>

        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-xs font-medium">
            {commentCount > 0 ? `${commentCount}` : 'Commenter'}
          </span>
        </button>
      </div>

      {/* Comments section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              {/* Comment list */}
              {postComments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUser={currentUser}
                  onDelete={onDeleteComment}
                />
              ))}
              {postComments.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Aucun commentaire</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comment input - always visible */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
        <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center flex-shrink-0">
          {getAuthorPhoto() ? (
            <img src={getAuthorPhoto()} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] font-bold text-muted-foreground">{currentUser?.full_name?.charAt(0) || '?'}</span>
          )}
        </div>
        <Input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); } }}
          placeholder="Écrire un commentaire..."
          className="bg-secondary/50 border-border text-xs h-8 flex-1"
        />
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={handleSubmitComment}
          disabled={submitting || !commentText.trim()}
          className="text-primary disabled:text-muted-foreground/30 transition-colors"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function Feed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const fileInputRef = useRef(null);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['posts'],
    queryFn: () => base44.entities.Post.list('-created_at', 100),
  });

  const { data: likes = [] } = useQuery({
    queryKey: ['postLikes'],
    queryFn: () => base44.entities.PostLike.list('-created_at', 500),
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['postComments'],
    queryFn: () => base44.entities.PostComment.list('created_at', 500),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
  });

  const getAuthorPhoto = () => {
    if (user?.role === 'barber' || user?.role === 'admin') {
      const emp = employees.find(e => e.id === user?.employee_id);
      return emp?.photo_url || '';
    }
    return '';
  };

  const createPost = async () => {
    if (!content.trim() && !imageUrl) return;
    setPosting(true);
    try {
      await base44.entities.Post.create({
        author_email: user.email,
        author_name: user.full_name || user.email,
        author_role: user.role || 'user',
        author_photo_url: getAuthorPhoto(),
        content: content.trim(),
        image_url: imageUrl || null,
      });
      setContent('');
      setImageUrl('');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Publication envoyée 🎉');
    } catch {
      toast.error('Erreur lors de la publication');
    } finally {
      setPosting(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
    } catch {
      toast.error("Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const handleLike = async (postId, alreadyLiked, reaction = '❤️') => {
    try {
      if (alreadyLiked) {
        const like = likes.find(l => l.post_id === postId && l.user_email === user.email);
        if (like) await base44.entities.PostLike.delete(like.id);
      } else {
        await base44.entities.PostLike.create({ post_id: postId, user_email: user.email, reaction });
      }
      queryClient.invalidateQueries({ queryKey: ['postLikes'] });
    } catch {}
  };

  const handleComment = async (postId, text) => {
    try {
      await base44.entities.PostComment.create({
        post_id: postId,
        author_email: user.email,
        author_name: user.full_name || user.email,
        author_role: user.role || 'user',
        author_photo_url: getAuthorPhoto(),
        content: text,
      });
      queryClient.invalidateQueries({ queryKey: ['postComments'] });
    } catch {
      toast.error('Erreur lors du commentaire');
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await base44.entities.PostComment.delete(commentId);
      queryClient.invalidateQueries({ queryKey: ['postComments'] });
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleDelete = async (postId) => {
    try {
      await base44.entities.Post.delete(postId);
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Publication supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Communauté</p>
        <h1 className="font-display text-2xl font-bold">New'sGang</h1>
      </div>

      {/* Floating publish button */}
      <motion.button
        onClick={() => setShowComposer(true)}
        className="fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 flex items-center justify-center"
        animate={{ boxShadow: ['0 0 0 0 rgba(34,197,94,0.4)', '0 0 0 12px rgba(34,197,94,0)', '0 0 0 0 rgba(34,197,94,0.4)'] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        whileTap={{ scale: 0.9 }}
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      {/* Composer drawer */}
      <AnimatePresence>
        {showComposer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60"
              onClick={() => setShowComposer(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t border-border bg-background p-5"
            >
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full bg-muted" />
              </div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-bold">Nouvelle publication</h3>
                <button onClick={() => setShowComposer(false)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {getAuthorPhoto() ? (
                    <img src={getAuthorPhoto()} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">
                      {user?.full_name?.charAt(0) || '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Quoi de neuf ? Partagez un moment, une photo..."
                    className="bg-secondary/50 border-border text-sm resize-none min-h-[80px]"
                    rows={3}
                    autoFocus
                  />
                </div>
              </div>

              {imageUrl && (
                <div className="relative mt-3 ml-[52px] w-32">
                  <div className="rounded-xl overflow-hidden" style={{ aspectRatio: '4/5' }}>
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <button
                    onClick={() => setImageUrl('')}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-xs"
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between mt-4 ml-[52px]">
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    Photo
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>
                <Button
                  onClick={async () => { await createPost(); setShowComposer(false); }}
                  disabled={posting || (!content.trim() && !imageUrl)}
                  size="sm"
                  className="bg-primary text-primary-foreground text-xs rounded-full px-4"
                >
                  {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                  Publier
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Posts */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <MessageCircle className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucune publication pour le moment</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Soyez le premier à publier !</p>
        </div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence>
            {posts.map(post => (
              <GlassCard key={post.id}>
                <PostCard
                  post={post}
                  currentUser={user}
                  likes={likes}
                  comments={comments}
                  onLike={handleLike}
                  onComment={handleComment}
                  onDelete={handleDelete}
                  onDeleteComment={handleDeleteComment}
                  getAuthorPhoto={getAuthorPhoto}
                />
              </GlassCard>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
