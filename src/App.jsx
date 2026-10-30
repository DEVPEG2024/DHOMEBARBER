import React, { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, Link, useLocation, useSearchParams } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import { MusicProvider, MusicRouteSync } from '@/lib/MusicContext';
import MusicToggle from '@/components/shared/MusicToggle';
import ErrorBoundary from '@/components/ErrorBoundary';
import { queryFailed } from '@/components/shared/LoadError';
import CoupeLoadError from '@/components/coupe/CoupeLoadError';
import { useCoupeFlagQuery } from '@/lib/coupe/coupeApi';

// Layouts
import ClientLayout from '@/components/layout/ClientLayout';
import AdminLayout from '@/components/layout/AdminLayout';

// Client pages (loaded eagerly - main user flow)
import Home from '@/pages/Home';
import Services from '@/pages/Services';
import Booking from '@/pages/Booking';
import Appointments from '@/pages/Appointments';
import Profile from '@/pages/Profile';
import Shop from '@/pages/Shop';
import Login from '@/pages/Login';
import Orders from '@/pages/Orders';
import MyReviews from '@/pages/MyReviews';
import UserSettings from '@/pages/Settings';
import ClientNotifications from '@/pages/ClientNotifications';
import BarberProfile from '@/pages/BarberProfile';
import Feed from '@/pages/Feed';
import Events from '@/pages/Events';
import GiftCards from '@/pages/GiftCards';
import { initAnalytics, trackPage } from '@/lib/analytics';

// Essayage couleur (lazy : embarque MediaPipe)
const TryOn = React.lazy(() => import('@/pages/TryOn'));
// Filtres Snap (Camera Kit, lazy)
const SnapLenses = React.lazy(() => import('@/pages/SnapLenses'));
// Textile & drops (lazy : page riche, hors du parcours de réservation)
const Textile = React.lazy(() => import('@/pages/Textile'));
// Bons plans du Gang (partenaires du salon, lazy)
const Partners = React.lazy(() => import('@/pages/Partners'));
const Favorites = React.lazy(() => import('@/pages/Favorites'));
// Jeux du salon : liste des jeux ouverts (La Coupe du Gang…), lazy
const Jeux = React.lazy(() => import('@/pages/Jeux'));
// Carte Gang du client (lazy)
const GangCardPage = React.lazy(() => import('@/pages/GangCardPage'));
// Prototype réseau de La Coupe du Gang (lazy, plein écran, hors des mises en page)
const CoupeTest = React.lazy(() => import('@/pages/CoupeTest'));
// La Coupe du Gang : accueil du jeu et classement (lazy, plein écran, hors des mises en page)
const Coupe = React.lazy(() => import('@/pages/Coupe'));
const CoupeClassement = React.lazy(() => import('@/pages/CoupeClassement'));

// Admin pages (lazy-loaded - only for admin/barber users)
const AdminDashboard = React.lazy(() => import('@/pages/admin/Dashboard'));
const Agenda = React.lazy(() => import('@/pages/admin/Agenda'));
const AdminServices = React.lazy(() => import('@/pages/admin/AdminServices'));
const Team = React.lazy(() => import('@/pages/admin/Team'));
const Clients = React.lazy(() => import('@/pages/admin/Clients'));
const AdminProducts = React.lazy(() => import('@/pages/admin/AdminProducts'));
const AdminStock = React.lazy(() => import('@/pages/admin/AdminStock'));
const AdminOrders = React.lazy(() => import('@/pages/admin/AdminOrders'));
const AdminReviews = React.lazy(() => import('@/pages/admin/AdminReviews'));
const Stats = React.lazy(() => import('@/pages/admin/Stats'));
const AdminSettings = React.lazy(() => import('@/pages/admin/AdminSettings'));
const Notifications = React.lazy(() => import('@/pages/admin/Notifications'));
const SmartAgenda = React.lazy(() => import('@/pages/admin/SmartAgenda'));
const Cleaning = React.lazy(() => import('@/pages/admin/Cleaning'));
const BarberCleaning = React.lazy(() => import('@/pages/admin/BarberCleaning'));
// Tableau de bord « Mon espace » d'un barber (page d'arrivée des barbers, 18 oct. 2026)
const BarberHome = React.lazy(() => import('@/pages/admin/BarberHome'));
const BarberAccounts = React.lazy(() => import('@/pages/admin/BarberAccounts'));
const AdminLeave = React.lazy(() => import('@/pages/admin/AdminLeave'));
const BarberLeave = React.lazy(() => import('@/pages/admin/BarberLeave'));
const BarberSettings = React.lazy(() => import('@/pages/admin/BarberSettings'));
const AdminEvents = React.lazy(() => import('@/pages/admin/AdminEvents'));
const AdminGiftCards = React.lazy(() => import('@/pages/admin/AdminGiftCards'));
const AdminTextile = React.lazy(() => import('@/pages/admin/AdminTextile'));
const AdminSalonEvents = React.lazy(() => import('@/pages/admin/AdminSalonEvents'));
const AdminSnap = React.lazy(() => import('@/pages/admin/AdminSnap'));
const AdminPartners = React.lazy(() => import('@/pages/admin/AdminPartners'));
const AdminFeedback = React.lazy(() => import('@/pages/admin/AdminFeedback'));
const AdminActivity = React.lazy(() => import('@/pages/admin/AdminActivity'));
const AdminTraffic = React.lazy(() => import('@/pages/admin/AdminTraffic'));
const AdminGangCards = React.lazy(() => import('@/pages/admin/AdminGangCards'));
const AdminCoupe = React.lazy(() => import('@/pages/admin/AdminCoupe'));

const LazyFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
  </div>
);

// Page d'arrivée d'un barber : son tableau de bord « Mon espace » (18 oct. 2026), d'où il
// rejoint agenda, entretien, congés… Avant : la première section à laquelle il avait droit.
function barberHomePath() {
  return '/admin/me';
}

// Paramètre `redirect` de /login : chemin interne uniquement (jamais « //autre-site »
// ni une URL absolue), et pas /login lui-même. null = page d'accueil du rôle.
function safeRedirect(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value === '/' || value === '/login' || value.startsWith('/login?')) return null;
  return value;
}

// Adresse de /login qui ramène ici une fois connecté (requête comprise : /booking?services=…) ;
// `expired=1` quand la session vient d'être refermée par le serveur (Login dit pourquoi)
const loginPathFor = (location, expired = false) =>
  `/login?redirect=${encodeURIComponent(location.pathname + location.search)}${expired ? '&expired=1' : ''}`;

// Route guard: requires authentication (client routes only)
function RequireAuth() {
  const { user, isAuthenticated, isLoadingAuth, sessionExpired } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPathFor(location, sessionExpired)} replace />;
  }

  // Redirect barbers to admin interface
  if (user?.role === 'barber') {
    return <Navigate to={barberHomePath()} replace />;
  }

  // Admin can browse client pages freely (e.g. "Retour au salon")
  return <Outlet />;
}

// Route guard: requires admin or barber role
function RequireAdmin() {
  const { user, isAuthenticated, isLoadingAuth, sessionExpired } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPathFor(location, sessionExpired)} replace />;
  }

  if (user?.role !== 'admin' && user?.role !== 'barber') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

// Garde du prototype réseau de La Coupe du Gang (/coupe-test) : admin, barbers et comptes
// testeurs (`users.is_tester`, renvoyé par /me). Le serveur de jeu vérifie aussi (not_allowed).
function RequireCoupeTester() {
  const { user, isAuthenticated, isLoadingAuth, sessionExpired } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPathFor(location, sessionExpired)} replace />;
  }

  const allowed = user?.role === 'admin' || user?.role === 'barber' || user?.is_tester === true;
  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

// Garde de La Coupe du Gang (/coupe, /coupe/classement ; contrat docs/fonctions/coupe-du-gang-contrat.md,
// 5.1) : tout compte connecté, barbers compris (RequireAuth les renverrait vers Mon espace), et
// seulement quand le serveur a ouvert le jeu (`features.coupe`, faux avec COUPE_WS=off).
// Renvoi vers l'accueil SEULEMENT si le drapeau a été lu à faux. Lecture ratée (réseau, 503) :
// « Réessayer » sur place, sans quitter l'adresse (un lien de défi `?defi=` reste valable).
// Même requête que `useCoupeEnabled` (`useCoupeFlagQuery` : même clé, rejette sur une panne).
function RequireCoupe() {
  const { isAuthenticated, isLoadingAuth, sessionExpired } = useAuth();
  const location = useLocation();
  const flag = useCoupeFlagQuery();
  // Page ouverte : un drapeau relu plus tard à faux (réseau qui flanche pendant la relecture d'après
  // match) ne renvoie plus à l'accueil en pleine partie. Si le serveur a vraiment coupé le jeu, ses
  // routes répondent `disabled` et la page le dit.
  const [admitted, setAdmitted] = useState(false);
  useEffect(() => {
    if (flag.data === true) setAdmitted(true);
  }, [flag.data]);

  // Fond du jeu (noir du thème stade) pendant l'attente du drapeau : pas d'éclair clair avant l'écran de la Coupe
  const spinner = (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0b0b0c' }}>
      <div className="w-6 h-6 border-2 border-[#ff3d44]/30 border-t-[#ff3d44] rounded-full animate-spin" />
    </div>
  );

  if (isLoadingAuth) return spinner;

  if (!isAuthenticated) {
    return <Navigate to={loginPathFor(location, sessionExpired)} replace />;
  }

  if (flag.data === true || admitted) return <Outlet />;
  if (flag.data === false) return <Navigate to="/" replace />;

  // Drapeau illisible (panne, réseau) ou requête en pause faute de réseau : on le dit, on garde l'adresse
  if (flag.isError || queryFailed(flag)) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 p-6" style={{ background: '#0b0b0c', colorScheme: 'dark' }}>
        <CoupeLoadError
          what="la Coupe du Gang"
          error={flag.error}
          onRetry={() => flag.refetch()}
          retrying={flag.isFetching}
          className="w-full max-w-sm"
        />
        <Link to="/" replace className="min-h-[44px] px-4 inline-flex items-center text-sm font-semibold text-[#a9abaf] underline underline-offset-2">
          Retour à l’accueil
        </Link>
      </div>
    );
  }

  return spinner;
}

// Redirect to home if already authenticated
// Seul endroit qui décide où aller après une connexion ou une inscription : Login se
// contente d'ouvrir la session, cette garde redirige aussitôt (avant, les deux se
// faisaient la course et le paramètre `redirect` était perdu).
function GuestOnly() {
  const { user, isAuthenticated, isLoadingAuth, welcomePending } = useAuth();
  const [searchParams] = useSearchParams();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    // Juste après une inscription : Login affiche l'écran « Bienvenue ! » (installer l'app,
    // activer les notifications) ; « Commencer » lève ce drapeau et on repasse ici.
    if (welcomePending) return <Outlet />;
    // Page demandée avant la connexion (ex. /booking), sinon l'accueil du rôle
    const redirect = safeRedirect(searchParams.get('redirect'));
    if (redirect) return <Navigate to={redirect} replace />;
    if (user?.role === 'admin') return <Navigate to="/admin" replace />;
    if (user?.role === 'barber') return <Navigate to={barberHomePath()} replace />;
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

// Remet la page tout en haut à chaque changement de route (le profil barber
// s'ouvre sur la carte, pas à la position de défilement de la page précédente).
// Le défilement est instantané malgré `html { scroll-behavior: smooth }`.
function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previous;
  }, [pathname]);

  return null;
}

// Mesure d'audience (Admin → Trafic, src/lib/analytics.js) : chaque changement de page
function AnalyticsTracker() {
  const { pathname } = useLocation();
  useEffect(() => { initAnalytics(); }, []);
  useEffect(() => { trackPage(pathname); }, [pathname]);
  return null;
}

const AppRoutes = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-muted-foreground tracking-widest uppercase">D'HOME BARBER</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Login - only for guests */}
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<Login />} />
      </Route>

      {/* All client routes require auth */}
      <Route element={<RequireAuth />}>
        <Route element={<ClientLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/booking" element={<Booking />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/reviews" element={<MyReviews />} />
          <Route path="/settings" element={<UserSettings />} />
          <Route path="/notifications" element={<ClientNotifications />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/barber/:id" element={<BarberProfile />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/events" element={<Events />} />
          <Route path="/gift-cards" element={<GiftCards />} />
          <Route path="/try-on" element={<Suspense fallback={<LazyFallback />}><TryOn /></Suspense>} />
          <Route path="/snap" element={<Suspense fallback={<LazyFallback />}><SnapLenses /></Suspense>} />
          <Route path="/textile" element={<Suspense fallback={<LazyFallback />}><Textile /></Suspense>} />
          <Route path="/partners" element={<Suspense fallback={<LazyFallback />}><Partners /></Suspense>} />
          <Route path="/jeux" element={<Suspense fallback={<LazyFallback />}><Jeux /></Suspense>} />
          <Route path="/favorites" element={<Suspense fallback={<LazyFallback />}><Favorites /></Suspense>} />
          <Route path="/gang-card" element={<Suspense fallback={<LazyFallback />}><GangCardPage /></Suspense>} />
        </Route>
      </Route>

      {/* Admin routes - require admin role (lazy-loaded) */}
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Suspense fallback={<LazyFallback />}><AdminDashboard /></Suspense>} />
          <Route path="/admin/agenda" element={<Suspense fallback={<LazyFallback />}><Agenda /></Suspense>} />
          <Route path="/admin/services" element={<Suspense fallback={<LazyFallback />}><AdminServices /></Suspense>} />
          <Route path="/admin/team" element={<Suspense fallback={<LazyFallback />}><Team /></Suspense>} />
          <Route path="/admin/clients" element={<Suspense fallback={<LazyFallback />}><Clients /></Suspense>} />
          <Route path="/admin/products" element={<Suspense fallback={<LazyFallback />}><AdminProducts /></Suspense>} />
          <Route path="/admin/stock" element={<Suspense fallback={<LazyFallback />}><AdminStock /></Suspense>} />
          <Route path="/admin/orders" element={<Suspense fallback={<LazyFallback />}><AdminOrders /></Suspense>} />
          <Route path="/admin/reviews" element={<Suspense fallback={<LazyFallback />}><AdminReviews /></Suspense>} />
          <Route path="/admin/stats" element={<Suspense fallback={<LazyFallback />}><Stats /></Suspense>} />
          <Route path="/admin/settings" element={<Suspense fallback={<LazyFallback />}><AdminSettings /></Suspense>} />
          <Route path="/admin/notifications" element={<Suspense fallback={<LazyFallback />}><Notifications /></Suspense>} />
          <Route path="/admin/cleaning" element={<Suspense fallback={<LazyFallback />}><Cleaning /></Suspense>} />
          <Route path="/admin/my-cleaning" element={<Suspense fallback={<LazyFallback />}><BarberCleaning /></Suspense>} />
          <Route path="/admin/me" element={<Suspense fallback={<LazyFallback />}><BarberHome /></Suspense>} />
          <Route path="/admin/smart-agenda" element={<Suspense fallback={<LazyFallback />}><SmartAgenda /></Suspense>} />
          <Route path="/admin/barber-accounts" element={<Suspense fallback={<LazyFallback />}><BarberAccounts /></Suspense>} />
          <Route path="/admin/leave" element={<Suspense fallback={<LazyFallback />}><AdminLeave /></Suspense>} />
          <Route path="/admin/my-leave" element={<Suspense fallback={<LazyFallback />}><BarberLeave /></Suspense>} />
          <Route path="/admin/feed" element={<Feed />} />
          <Route path="/admin/events" element={<Suspense fallback={<LazyFallback />}><AdminEvents /></Suspense>} />
          <Route path="/admin/gift-cards" element={<Suspense fallback={<LazyFallback />}><AdminGiftCards /></Suspense>} />
          <Route path="/admin/textile" element={<Suspense fallback={<LazyFallback />}><AdminTextile /></Suspense>} />
          <Route path="/admin/salon-events" element={<Suspense fallback={<LazyFallback />}><AdminSalonEvents /></Suspense>} />
          <Route path="/admin/snap" element={<Suspense fallback={<LazyFallback />}><AdminSnap /></Suspense>} />
          <Route path="/admin/partners" element={<Suspense fallback={<LazyFallback />}><AdminPartners /></Suspense>} />
          <Route path="/admin/feedback" element={<Suspense fallback={<LazyFallback />}><AdminFeedback /></Suspense>} />
          <Route path="/admin/activity" element={<Suspense fallback={<LazyFallback />}><AdminActivity /></Suspense>} />
          <Route path="/admin/traffic" element={<Suspense fallback={<LazyFallback />}><AdminTraffic /></Suspense>} />
          <Route path="/admin/gang-cards" element={<Suspense fallback={<LazyFallback />}><AdminGangCards /></Suspense>} />
          {/* La Coupe du Gang : chiffres, paires, signalements (admin seul, garde dans la page) */}
          <Route path="/admin/coupe" element={<Suspense fallback={<LazyFallback />}><AdminCoupe /></Suspense>} />
          <Route path="/admin/my-settings" element={<Suspense fallback={<LazyFallback />}><BarberSettings /></Suspense>} />
          {/* Historique des notifications reçues par un barber (/notifications est une page client) */}
          <Route path="/admin/my-notifications" element={<ClientNotifications />} />
        </Route>
      </Route>

      {/* La Coupe du Gang, prototype réseau : plein écran, hors des mises en page client / admin */}
      <Route element={<RequireCoupeTester />}>
        <Route path="/coupe-test" element={<Suspense fallback={<LazyFallback />}><CoupeTest /></Suspense>} />
      </Route>

      {/* La Coupe du Gang : plein écran, hors des mises en page, tout compte connecté, drapeau features.coupe */}
      <Route element={<RequireCoupe />}>
        <Route path="/coupe" element={<Suspense fallback={<LazyFallback />}><Coupe /></Suspense>} />
        <Route path="/coupe/classement" element={<Suspense fallback={<LazyFallback />}><CoupeClassement /></Suspense>} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <MusicProvider>
          <AuthProvider>
            <QueryClientProvider client={queryClientInstance}>
              <Router>
                <ScrollToTop />
                <AnalyticsTracker />
                <AppRoutes />
                {/* Dans le Router : le bouton lit la route (masqué sur l'accueil, intégré au hero) ;
                    le morceau aussi (chant de la Coupe sur ses pages) */}
                <MusicRouteSync />
                <MusicToggle />
              </Router>
              <SonnerToaster />
            </QueryClientProvider>
          </AuthProvider>
        </MusicProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
