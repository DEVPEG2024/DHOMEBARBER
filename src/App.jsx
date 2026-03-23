import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';

// Layouts
import ClientLayout from '@/components/layout/ClientLayout';
import AdminLayout from '@/components/layout/AdminLayout';

// Client pages
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

// Admin pages
import AdminDashboard from '@/pages/admin/Dashboard';
import Agenda from '@/pages/admin/Agenda';
import AdminServices from '@/pages/admin/AdminServices';
import Team from '@/pages/admin/Team';
import Clients from '@/pages/admin/Clients';
import AdminProducts from '@/pages/admin/AdminProducts';
import AdminOrders from '@/pages/admin/AdminOrders';
import AdminReviews from '@/pages/admin/AdminReviews';
import Stats from '@/pages/admin/Stats';
import AdminSettings from '@/pages/admin/AdminSettings';
import Notifications from '@/pages/admin/Notifications';
import SmartAgenda from '@/pages/admin/SmartAgenda';

// Route guard: requires authentication
function RequireAuth() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
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

  return <Outlet />;
}

// Route guard: requires admin role
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

  if (user?.role !== 'admin') {
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
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/'} replace />;
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
        </Route>
      </Route>

      {/* Admin routes - require admin role */}
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/agenda" element={<Agenda />} />
          <Route path="/admin/services" element={<AdminServices />} />
          <Route path="/admin/team" element={<Team />} />
          <Route path="/admin/clients" element={<Clients />} />
          <Route path="/admin/products" element={<AdminProducts />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
          <Route path="/admin/reviews" element={<AdminReviews />} />
          <Route path="/admin/stats" element={<Stats />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/notifications" element={<Notifications />} />
          <Route path="/admin/smart-agenda" element={<SmartAgenda />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
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
  )
}

export default App
