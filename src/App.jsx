import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import ErrorBoundary from '@/components/ErrorBoundary';

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
const BarberAccounts = React.lazy(() => import('@/pages/admin/BarberAccounts'));
const AdminLeave = React.lazy(() => import('@/pages/admin/AdminLeave'));
const BarberLeave = React.lazy(() => import('@/pages/admin/BarberLeave'));
const BarberSettings = React.lazy(() => import('@/pages/admin/BarberSettings'));
const AdminEvents = React.lazy(() => import('@/pages/admin/AdminEvents'));
const AdminGiftCards = React.lazy(() => import('@/pages/admin/AdminGiftCards'));

const LazyFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
  </div>
);

// Route guard: requires authentication (client routes only)
function RequireAuth() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // Redirect barbers to admin interface
  if (user?.role === 'barber') {
    const perms = user.permissions || [];
    const permToPath = { agenda: '/admin/agenda', dashboard: '/admin', services: '/admin/services', clients: '/admin/clients' };
    const firstPerm = perms[0];
    return <Navigate to={permToPath[firstPerm] || '/admin/my-cleaning'} replace />;
  }

  // Admin can browse client pages freely (e.g. "Retour au salon")
  return <Outlet />;
}

// Route guard: requires admin or barber role
function RequireAdmin() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (user?.role !== 'admin' && user?.role !== 'barber') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

// Redirect to home if already authenticated
function GuestOnly() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    if (user?.role === 'admin') return <Navigate to="/admin" replace />;
    if (user?.role === 'barber') {
      // Redirect to first permitted page
      const perms = user.permissions || [];
      const permToPath = { agenda: '/admin/agenda', dashboard: '/admin', services: '/admin/services', clients: '/admin/clients' };
      const firstPerm = perms[0];
      return <Navigate to={permToPath[firstPerm] || '/admin/my-cleaning'} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
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
          <Route path="/admin/smart-agenda" element={<Suspense fallback={<LazyFallback />}><SmartAgenda /></Suspense>} />
          <Route path="/admin/barber-accounts" element={<Suspense fallback={<LazyFallback />}><BarberAccounts /></Suspense>} />
          <Route path="/admin/leave" element={<Suspense fallback={<LazyFallback />}><AdminLeave /></Suspense>} />
          <Route path="/admin/my-leave" element={<Suspense fallback={<LazyFallback />}><BarberLeave /></Suspense>} />
          <Route path="/admin/feed" element={<Feed />} />
          <Route path="/admin/events" element={<Suspense fallback={<LazyFallback />}><AdminEvents /></Suspense>} />
          <Route path="/admin/gift-cards" element={<Suspense fallback={<LazyFallback />}><AdminGiftCards /></Suspense>} />
          <Route path="/admin/my-settings" element={<Suspense fallback={<LazyFallback />}><BarberSettings /></Suspense>} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <AppRoutes />
            </Router>
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
