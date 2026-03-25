import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Users, Scissors, UserCircle,
  BarChart3, Settings, Menu, X, ChevronLeft, ChevronDown, ShoppingBag, Star, Bell, Brain, Sun, Moon, ClipboardList, ShieldCheck, Sparkles, CalendarDays, Newspaper, Warehouse, PartyPopper, LogOut, Gift, GripVertical
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';

// All nav items with their default category
const allNavItems = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true, perm: 'dashboard' },
  { path: '/admin/agenda', icon: Calendar, label: 'Agenda', perm: 'agenda' },
  { path: '/admin/smart-agenda', icon: Brain, label: 'Agenda IA', perm: 'smart-agenda' },
  { path: '/admin/clients', icon: UserCircle, label: 'Clients', perm: 'clients', category: 'Clients' },
  { path: '/admin/reviews', icon: Star, label: 'Avis', perm: 'reviews', category: 'Clients' },
  { path: '/admin/notifications', icon: Bell, label: 'Notifications', perm: 'notifications', category: 'Clients' },
  { path: '/admin/services', icon: Scissors, label: 'Prestations', perm: 'services', category: 'Commerce' },
  { path: '/admin/products', icon: ShoppingBag, label: 'Produits', perm: 'products', category: 'Commerce' },
  { path: '/admin/stock', icon: Warehouse, label: 'Stock Produits', perm: 'products', category: 'Commerce' },
  { path: '/admin/orders', icon: ClipboardList, label: 'Commandes', perm: 'orders', category: 'Commerce' },
  { path: '/admin/gift-cards', icon: Gift, label: 'Cartes Cadeau', adminOnly: true, category: 'Commerce' },
  { path: '/admin/team', icon: Users, label: 'Équipe', perm: 'team', category: 'Équipe' },
  { path: '/admin/barber-accounts', icon: ShieldCheck, label: 'Comptes Barbers', adminOnly: true, category: 'Équipe' },
  { path: '/admin/leave', icon: CalendarDays, label: 'Congés', adminOnly: true, category: 'Équipe' },
  { path: '/admin/cleaning', icon: Sparkles, label: 'Entretien', perm: 'cleaning', category: 'Équipe' },
  { path: '/admin/my-cleaning', icon: Sparkles, label: 'Entretien', barberOnly: true, alwaysShow: true, category: 'Mon espace' },
  { path: '/admin/my-leave', icon: CalendarDays, label: 'Mes Congés', barberOnly: true, alwaysShow: true, category: 'Mon espace' },
  { path: '/admin/my-settings', icon: Settings, label: 'Paramètres', barberOnly: true, alwaysShow: true, category: 'Mon espace' },
  { path: '/admin/stats', icon: BarChart3, label: 'Statistiques', perm: 'stats', category: 'Analyse' },
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
const ORDER_KEY = 'admin_sidebar_order_v2';

// Build a flat list of entries: { type: 'header', id, name } and { type: 'item', id, ...navItem }
function buildDefaultFlatList(filteredItems) {
  const list = [];
  const seenCategories = new Set();
  filteredItems.forEach(item => {
    if (item.category && !seenCategories.has(item.category)) {
      seenCategories.add(item.category);
      list.push({ type: 'header', id: `hdr:${item.category}`, name: item.category });
    }
    list.push({ type: 'item', id: item.path, ...item });
  });
  return list;
}

// Reorder flat list based on saved order of IDs
function applyOrder(defaultList, savedIds) {
  if (!savedIds?.length) return defaultList;
  const map = {};
  defaultList.forEach(entry => { map[entry.id] = entry; });
  const ordered = [];
  savedIds.forEach(id => {
    if (map[id]) { ordered.push(map[id]); delete map[id]; }
  });
  // Append any new entries not in saved order
  Object.values(map).forEach(entry => ordered.push(entry));
  return ordered;
}

// Determine which category each item belongs to based on position in flat list
// Items after a header belong to that header's category, until the next header
function getCategoryForIndex(flatList, index) {
  for (let i = index - 1; i >= 0; i--) {
    if (flatList[i].type === 'header') return flatList[i].name;
  }
  return null; // top-level
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  // Filter items by role/permissions
  const filteredItems = useMemo(() => {
    if (!user || user.role === 'admin') {
      return allNavItems.filter(item => !item.barberOnly);
    }
    const perms = user.permissions || [];
    return allNavItems.filter(item => {
      if (item.adminOnly) return false;
      if (item.alwaysShow || item.barberOnly) return true;
      return perms.includes(item.perm);
    });
  }, [user]);

  // Build default flat list
  const defaultFlatList = useMemo(() => buildDefaultFlatList(filteredItems), [filteredItems]);

  // Flat list state with persistence
  const [flatList, setFlatList] = useState(defaultFlatList);

  useEffect(() => {
    try {
      const savedIds = JSON.parse(localStorage.getItem(ORDER_KEY));
      setFlatList(applyOrder(defaultFlatList, savedIds));
    } catch { setFlatList(defaultFlatList); }
  }, [defaultFlatList]);

  const handleDragEnd = useCallback((result) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = Array.from(flatList);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setFlatList(reordered);
    localStorage.setItem(ORDER_KEY, JSON.stringify(reordered.map(e => e.id)));
  }, [flatList]);

  // Collapsed state per category
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
  const allItems = useMemo(() => flatList.filter(e => e.type === 'item'), [flatList]);
  if (isBarber) {
    const currentPath = location.pathname;
    const isAllowed = allItems.some(item => {
      if (item.exact) return currentPath === item.path;
      return currentPath.startsWith(item.path);
    });
    if (!isAllowed) {
      const target = allItems[0]?.path || '/admin/my-cleaning';
      return <Navigate to={target} replace />;
    }
  }

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  };

  // Determine which items are hidden (inside a collapsed category)
  // We need to figure out current category for each item based on position
  const visibilityMap = useMemo(() => {
    const map = {};
    let currentCat = null;
    flatList.forEach(entry => {
      if (entry.type === 'header') {
        currentCat = entry.name;
        map[entry.id] = true; // headers always visible
      } else {
        map[entry.id] = currentCat ? !collapsedCats[currentCat] : true;
      }
    });
    return map;
  }, [flatList, collapsedCats]);

  // Check if a collapsed category has an active item
  const collapsedActiveMap = useMemo(() => {
    const map = {};
    let currentCat = null;
    flatList.forEach(entry => {
      if (entry.type === 'header') {
        currentCat = entry.name;
      } else if (currentCat && collapsedCats[currentCat] && isActive(entry)) {
        map[currentCat] = true;
      }
    });
    return map;
  }, [flatList, collapsedCats, location.pathname]);

  // For indentation: is this item inside a category?
  const inCategoryMap = useMemo(() => {
    const map = {};
    let currentCat = null;
    flatList.forEach(entry => {
      if (entry.type === 'header') {
        currentCat = entry.name;
      } else {
        map[entry.id] = currentCat;
      }
    });
    return map;
  }, [flatList]);

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
                className="flex-1 overflow-y-auto p-2.5"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {flatList.map((entry, index) => {
                  // Hide items inside collapsed categories
                  if (!visibilityMap[entry.id]) return null;

                  return (
                    <Draggable key={entry.id} draggableId={entry.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={snapshot.isDragging ? 'opacity-90 shadow-lg shadow-primary/10 rounded-lg ring-1 ring-primary/20 bg-card' : ''}
                        >
                          {entry.type === 'header' ? (
                            /* Category header */
                            <div className="flex items-center group mt-2 first:mt-0">
                              <div {...provided.dragHandleProps} className="w-4 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab">
                                <GripVertical className="w-3 h-3" />
                              </div>
                              <button
                                onClick={() => toggleCategory(entry.name)}
                                className={`flex items-center gap-3 flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                  collapsedActiveMap[entry.name]
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                }`}
                              >
                                {(() => { const CatIcon = CATEGORY_ICONS[entry.name] || Settings; return <CatIcon className="w-4 h-4 shrink-0" />; })()}
                                <span className="flex-1 text-left">{entry.name}</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsedCats[entry.name] ? '-rotate-90' : ''}`} />
                              </button>
                            </div>
                          ) : (
                            /* Nav item */
                            <div className={`flex items-center group ${inCategoryMap[entry.id] ? 'ml-3 pl-2 border-l border-border/40' : ''}`}>
                              <div {...provided.dragHandleProps} className="w-4 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab">
                                <GripVertical className="w-3 h-3" />
                              </div>
                              <Link
                                to={entry.path}
                                onClick={() => setSidebarOpen(false)}
                                className={`flex items-center gap-3 flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                  isActive(entry)
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                }`}
                              >
                                <entry.icon className="w-4 h-4 shrink-0" />
                                {entry.label}
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
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
