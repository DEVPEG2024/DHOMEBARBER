import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Users, Scissors, UserCircle,
  BarChart3, Settings, Menu, X, ChevronLeft, ShoppingBag, Star, Bell, Brain, Sun, Moon, ClipboardList, ShieldCheck, Sparkles, CalendarDays, Newspaper, Warehouse, PartyPopper
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';

const STORAGE_KEY = 'admin_sidebar_order';

const allSidebarItems = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true, perm: 'dashboard' },
  { path: '/admin/agenda', icon: Calendar, label: 'Agenda', perm: 'agenda' },
  { path: '/admin/services', icon: Scissors, label: 'Prestations', perm: 'services' },
  { path: '/admin/team', icon: Users, label: 'Équipe', perm: 'team' },
  { path: '/admin/clients', icon: UserCircle, label: 'Clients', perm: 'clients' },
  { path: '/admin/products', icon: ShoppingBag, label: 'Produits', perm: 'products' },
  { path: '/admin/stock', icon: Warehouse, label: 'Stock Produits', perm: 'products' },
  { path: '/admin/orders', icon: ClipboardList, label: 'Commandes', perm: 'orders' },
  { path: '/admin/reviews', icon: Star, label: 'Avis', perm: 'reviews' },
  { path: '/admin/stats', icon: BarChart3, label: 'Statistiques', perm: 'stats' },
  { path: '/admin/notifications', icon: Bell, label: 'Notifications', perm: 'notifications' },
  { path: '/admin/cleaning', icon: Sparkles, label: 'Entretien', perm: 'cleaning' },
  { path: '/admin/my-cleaning', icon: Sparkles, label: 'Entretien', barberOnly: true, alwaysShow: true },
  { path: '/admin/smart-agenda', icon: Brain, label: 'Agenda IA', perm: 'smart-agenda' },
  { path: '/admin/feed', icon: Newspaper, label: 'New\'sGang', alwaysShow: true },
  { path: '/admin/settings', icon: Settings, label: 'Paramètres', perm: 'settings' },
  { path: '/admin/leave', icon: CalendarDays, label: 'Congés', adminOnly: true },
  { path: '/admin/my-leave', icon: CalendarDays, label: 'Mes Congés', barberOnly: true, alwaysShow: true },
  { path: '/admin/my-settings', icon: Settings, label: 'Paramètres', barberOnly: true, alwaysShow: true },
  { path: '/admin/events', icon: PartyPopper, label: 'Événements', adminOnly: true },
  { path: '/admin/barber-accounts', icon: ShieldCheck, label: 'Comptes Barbers', adminOnly: true },
];

function reorderByPaths(items, savedPaths) {
  if (!savedPaths || savedPaths.length === 0) return items;
  const map = {};
  items.forEach(item => { map[item.path] = item; });
  const ordered = [];
  savedPaths.forEach(path => {
    if (map[path]) {
      ordered.push(map[path]);
      delete map[path];
    }
  });
  // Append any new items not in saved order
  Object.values(map).forEach(item => ordered.push(item));
  return ordered;
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  const filteredItems = useMemo(() => {
    if (!user || user.role === 'admin') {
      return allSidebarItems.filter(item => !item.barberOnly);
    }
    const perms = user.permissions || [];
    return allSidebarItems.filter(item => {
      if (item.adminOnly) return false;
      if (item.alwaysShow || item.barberOnly) return true;
      return perms.includes(item.perm);
    });
  }, [user]);

  const [sidebarItems, setSidebarItems] = useState(filteredItems);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        setSidebarItems(reorderByPaths(filteredItems, saved));
      } else {
        setSidebarItems(filteredItems);
      }
    } catch {
      setSidebarItems(filteredItems);
    }
  }, [filteredItems]);

  const handleDragEnd = useCallback((result) => {
    if (!result.destination) return;
    const items = Array.from(sidebarItems);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setSidebarItems(items);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(i => i.path)));
  }, [sidebarItems]);

  // Barber route protection
  const isBarber = user?.role === 'barber';
  if (isBarber) {
    const currentPath = location.pathname;
    const isAllowed = sidebarItems.length > 0 && sidebarItems.some(item => {
      if (item.exact) return currentPath === item.path;
      return currentPath.startsWith(item.path);
    });
    if (!isAllowed) {
      const target = sidebarItems[0]?.path || '/admin/my-cleaning';
      return <Navigate to={target} replace />;
    }
  }

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 h-screen w-[260px] bg-card border-r border-border z-50
        transform transition-transform duration-300 lg:translate-x-0 flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo" className="w-9 h-9 object-contain" />
            <div>
              <h1 className="font-display text-sm font-bold text-primary tracking-wide">D'HOME BARBER</h1>
              <p className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">Back Office</p>
            </div>
          </div>
          <button className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
            onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav with drag & drop */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="sidebar">
            {(provided) => (
              <nav
                className="flex-1 overflow-y-auto p-2.5 space-y-0.5"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {sidebarItems.map((item, index) => (
                  <Draggable key={item.path} draggableId={item.path} index={index}>
                    {(provided, snapshot) => (
                      <Link
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                          snapshot.isDragging
                            ? 'bg-primary/15 text-primary shadow-lg shadow-primary/10 ring-1 ring-primary/20'
                            : isActive(item)
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        {item.label}
                      </Link>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </nav>
            )}
          </Droppable>
        </DragDropContext>

        {/* Bottom */}
        <div className="p-2.5 border-t border-border space-y-0.5 shrink-0">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          </button>
          {!isBarber && (
            <Link to="/" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-all">
              <ChevronLeft className="w-4 h-4" />
              Retour au salon
            </Link>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-h-screen min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-3 h-14 flex items-center lg:hidden">
          <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
            onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="ml-2 font-display text-sm font-semibold text-primary flex-1 truncate">D'HOME BARBER</span>
          {!isBarber && (
            <Link to="/" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </Link>
          )}
          <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
            onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* Page content */}
        <main className="p-3 sm:p-4 lg:p-6 max-w-[1600px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
