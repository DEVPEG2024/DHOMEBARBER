import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

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

// Admin pages
import AdminDashboard from '@/pages/admin/Dashboard';
import Agenda from '@/pages/admin/Agenda';
import AdminServices from '@/pages/admin/AdminServices';
import Team from '@/pages/admin/Team';
import Clients from '@/pages/admin/Clients';
import AdminProducts from '@/pages/admin/AdminProducts';
import AdminReviews from '@/pages/admin/AdminReviews';
import Stats from '@/pages/admin/Stats';
import AdminSettings from '@/pages/admin/AdminSettings';
import Notifications from '@/pages/admin/Notifications';
import SmartAgenda from '@/pages/admin/SmartAgenda';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-muted-foreground tracking-widest uppercase">BLADE & CO.</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      {/* Client routes */}
      <Route element={<ClientLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/booking" element={<Booking />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/shop" element={<Shop />} />
      </Route>

      {/* Admin routes */}
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/agenda" element={<Agenda />} />
        <Route path="/admin/services" element={<AdminServices />} />
        <Route path="/admin/team" element={<Team />} />
        <Route path="/admin/clients" element={<Clients />} />
        <Route path="/admin/products" element={<AdminProducts />} />
        <Route path="/admin/reviews" element={<AdminReviews />} />
        <Route path="/admin/stats" element={<Stats />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/notifications" element={<Notifications />} />
        <Route path="/admin/smart-agenda" element={<SmartAgenda />} />
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
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App