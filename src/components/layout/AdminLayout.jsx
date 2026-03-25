import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Users, Scissors, UserCircle,
  BarChart3, Settings, Menu, X, ChevronLeft, ChevronDown, ShoppingBag, Star, Bell, Brain, Sun, Moon, ClipboardList, ShieldCheck, Sparkles, CalendarDays, Newspaper, Warehouse, PartyPopper, LogOut, Gift, GripVertical
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';

// Items sans catégorie = en haut du menu
const allSidebarItems = [
  // --- En haut, sans catégorie ---
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true, perm: 'dashboard' },
  { path: '/admin/agenda', icon: Calendar, label: 'Agenda', perm: 'agenda' },
  { path: '/admin/smart-agenda', icon: Brain, label: 'Agenda IA', perm: 'smart-agenda' },

  // --- Clients ---
  { path: '/admin/clients', icon: UserCircle, label: 'Clients', perm: 'clients', category: 'Clients' },
  { path: '/admin/reviews', icon: Star, label: 'Avis', perm: 'reviews', category: 'Clients' },
  { path: '/admin/notifications', icon: Bell, label: 'Notifications', perm: 'notifications', category: 'Clients' },

  // --- Commerce ---
  { path: '/admin/services', icon: Scissors, label: 'Prestations', perm: 'services', category: 'Commerce' },
  { path: '/admin/products', icon: ShoppingBag, label: 'Produits', perm: 'products', category: 'Commerce' },
  { path: '/admin/stock', icon: Warehouse, label: 'Stock Produits', perm: 'products', category: 'Commerce' },
  { path: '/admin/orders', icon: ClipboardList, label: 'Commandes', perm: 'orders', category: 'Commerce' },
  { path: '/admin/gift-cards', icon: Gift, label: 'Cartes Cadeau', adminOnly: true, category: 'Commerce' },

  // --- Équipe ---
  { path: '/admin/team', icon: Users, label: 'Équipe', perm: 'team', category: 'Équipe' },
  { path: '/admin/barber-accounts', icon: ShieldCheck, label: 'Comptes Barbers', adminOnly: true, category: 'Équipe' },
  { path: '/admin/leave', icon: CalendarDays, label: 'Congés', adminOnly: true, category: 'Équipe' },
  { path: '/admin/cleaning', icon: Sparkles, label: 'Entretien', perm: 'cleaning', category: 'Équipe' },

  // --- Barber only (Mon espace) ---
  { path: '/admin/my-cleaning', icon: Sparkles, label: 'Entretien', barberOnly: true, alwaysShow: true, category: 'Mon espace' },
  { path: '/admin/my-leave', icon: CalendarDays, label: 'Mes Congés', barberOnly: true, alwaysShow: true, category: 'Mon espace' },
  { path: '/admin/my-settings', icon: Settings, label: 'Paramètres', barberOnly: true, alwaysShow: true, category: 'Mon espace' },

  // --- Analyse ---
  { path: '/admin/stats', icon: BarChart3, label: 'Statistiques', perm: 'stats', category: 'Analyse' },

  // --- Divers ---
  { path: '/admin/feed', icon: Newspaper, label: 'New\'sGang', alwaysShow: true, category: 'Divers' },
  { path: '/admin/events', icon: PartyPopper, label: 'Événements', adminOnly: true, category: 'Divers' },
  { path: '/admin/settings', icon: Settings, label: 'Paramètres', perm: 'settings', category: 'Divers' },
];

const CATEGORY_ICONS = {
  Clients: UserCircle,
  Commerce: ShoppingBag,
  'Équipe': Users,
  'Mon espace': Settings,
  Analyse: BarChart3,
  Divers: Newspaper,
};

const COLLAPSED_KEY = 'admin_sidebar_collapsed';
const ORDER_KEY = 'admin_sidebar_order';

function NavLink({ item, isActive, onClick }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function CategoryGroup({ name, items, isActive, onNavClick, collapsed, onToggle }) {
  const CatIcon = CATEGORY_ICONS[name] || Settings;
  const hasActive = items.some(item => isActive(item));

  return (
    <div>
      <button
        onClick={onToggle}
        className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          hasActive && collapsed
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        }`}
      >
        <CatIcon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{name}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      {!collapsed && (
        <div className="ml-4 pl-3 border-l border-border/50 mt-0.5 space-y-0.5">
          {items.map(item => (
            <NavLink key={item.path} item={item} isActive={isActive(item)} onClick={onNavClick} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const sidebarItems = useMemo(() => {
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

  // Build sections: each top-level item is a section, each category is a section
  const defaultSections = useMemo(() => {
    const sections = [];
    const catMap = new Map();
    sidebarItems.forEach(item => {
      if (!item.category) {
        sections.push({ type: 'item', id: item.path, item });
      } else {
        if (!catMap.has(item.category)) {
          catMap.set(item.category, []);
          sections.push({ type: 'category', id: `cat:${item.category}`, name: item.category, items: catMap.get(item.category) });
        }
        catMap.get(item.category).push(item);
      }
    });
    return sections;
  }, [sidebarItems]);

  // Reorder sections based on saved order
  const [sections, setSections] = useState(defaultSections);

  useEffect(() => {
    try {
      const savedOrder = JSON.parse(localStorage.getItem(ORDER_KEY));
      if (savedOrder?.length) {
        const map = {};
        defaultSections.forEach(s => { map[s.id] = s; });
        const ordered = [];
        savedOrder.forEach(id => {
          if (map[id]) { ordered.push(map[id]); delete map[id]; }
        });
        Object.values(map).forEach(s => ordered.push(s));
        setSections(ordered);
      } else {
        setSections(defaultSections);
      }
    } catch { setSections(defaultSections); }
  }, [defaultSections]);

  const handleDragEnd = useCallback((result) => {
    if (!result.destination) return;
    const reordered = Array.from(sections);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setSections(reordered);
    localStorage.setItem(ORDER_KEY, JSON.stringify(reordered.map(s => s.id)));
  }, [sections]);

  // Collapsed state per category, persisted in localStorage
  const [collapsedCats, setCollapsedCats] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSED_KEY)) || {};
    } catch { return {}; }
  });

  const toggleCategory = useCallback((catName) => {
    setCollapsedCats(prev => {
      const next = { ...prev, [catName]: !prev[catName] };
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

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
                {sections.map((section, index) => (
                  <Draggable key={section.id} draggableId={section.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={snapshot.isDragging ? 'opacity-80 shadow-lg shadow-primary/10 rounded-lg ring-1 ring-primary/20' : ''}
                      >
                        {section.type === 'item' ? (
                          <div className="flex items-center group">
                            <div {...provided.dragHandleProps} className="w-5 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab">
                              <GripVertical className="w-3 h-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <NavLink item={section.item} isActive={isActive(section.item)} onClick={() => setSidebarOpen(false)} />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start group">
                            <div {...provided.dragHandleProps} className="w-5 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab pt-2.5">
                              <GripVertical className="w-3 h-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <CategoryGroup
                                name={section.name}
                                items={section.items}
                                isActive={isActive}
                                onNavClick={() => setSidebarOpen(false)}
                                collapsed={!!collapsedCats[section.name]}
                                onToggle={() => toggleCategory(section.name)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
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
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
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
