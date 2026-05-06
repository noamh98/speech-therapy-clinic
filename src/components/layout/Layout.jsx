// src/components/layout/Layout.jsx — Mobile-first responsive redesign
import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Calendar, Users, FileText, BarChart2,
  TrendingUp, Layout, Bot, Settings, UserCog, LogOut,
  Menu, X, Stethoscope, ChevronDown, Bell, Receipt
} from 'lucide-react';

// ─── Navigation items ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { path: '/',                 icon: LayoutDashboard, label: 'דשבורד',         group: 'main' },
  { path: '/calendar',         icon: Calendar,        label: 'יומן',           group: 'main' },
  { path: '/patients',         icon: Users,           label: 'מטופלים',        group: 'main' },
  { path: '/intake-forms',     icon: FileText,        label: 'שאלונים',        group: 'tools' },
  { path: '/reports',          icon: BarChart2,       label: 'דוחות',          group: 'tools' },
  { path: '/reports/advanced', icon: TrendingUp,      label: 'דוחות מתקדמים', group: 'tools' },
  { path: '/templates',        icon: Layout,          label: 'תבניות',         group: 'tools' },
  { path: '/ai-assistant',     icon: Bot,             label: 'עוזר AI',        group: 'tools' },
  { path: '/receipts',         icon: Receipt,         label: 'קבלות',          group: 'tools' },
  { path: '/settings',         icon: Settings,        label: 'הגדרות',         group: 'system' },
];

// Bottom nav items for mobile (most-used)
const MOBILE_BOTTOM_ITEMS = [
  { path: '/',             icon: LayoutDashboard, label: 'דשבורד' },
  { path: '/calendar',     icon: Calendar,        label: 'יומן' },
  { path: '/patients',     icon: Users,           label: 'מטופלים' },
  { path: '/ai-assistant', icon: Bot,             label: 'AI' },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function AppLayout({ children }) {
  const { user, profile, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const navItems = isAdmin
    ? [...NAV_ITEMS, { path: '/admin/users', icon: UserCog, label: 'ניהול משתמשים', group: 'system' }]
    : NAV_ITEMS;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const userInitial = (profile?.name || user?.email || '?')[0].toUpperCase();
  const userName = profile?.name || user?.email || '';

  // Group nav items
  const mainItems   = navItems.filter(i => i.group === 'main');
  const toolItems   = navItems.filter(i => i.group === 'tools');
  const systemItems = navItems.filter(i => i.group === 'system');

  // ── Reusable NavLink ──
  const NavLink = ({ item, collapsed = false }) => {
    const active = isActive(item.path);
    return (
      <Link
        to={item.path}
        title={collapsed ? item.label : undefined}
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
          transition-all duration-150 group relative
          ${active
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }
          ${collapsed ? 'justify-center px-2' : ''}
        `}
      >
        <item.icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-500 group-hover:text-gray-700'}`} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {active && !collapsed && (
          <span className="mr-auto w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />
        )}
        {/* Tooltip for collapsed sidebar */}
        {collapsed && (
          <span className="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  // ── Sidebar Content (shared between desktop and mobile drawer) ──
  const SidebarContent = ({ collapsed = false, onClose }) => (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b border-gray-100 flex-shrink-0 ${collapsed ? 'justify-center px-2' : ''}`}>
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
          <Stethoscope className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">קליניקת תקשורת</p>
            <p className="text-xs text-gray-400">מערכת ניהול</p>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="mr-auto p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {/* Main group */}
        {!collapsed && <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">ראשי</p>}
        {mainItems.map(item => <NavLink key={item.path} item={item} collapsed={collapsed} />)}

        {/* Tools group */}
        {!collapsed && <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 mt-4">כלים</p>}
        {collapsed && <div className="my-2 border-t border-gray-100" />}
        {toolItems.map(item => <NavLink key={item.path} item={item} collapsed={collapsed} />)}

        {/* System group */}
        {!collapsed && <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 mt-4">מערכת</p>}
        {collapsed && <div className="my-2 border-t border-gray-100" />}
        {systemItems.map(item => <NavLink key={item.path} item={item} collapsed={collapsed} />)}
      </nav>

      {/* User footer */}
      <div className={`p-3 border-t border-gray-100 flex-shrink-0 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold cursor-pointer" title={userName}>
            {userInitial}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors mt-0.5"
              >
                <LogOut className="w-3 h-3" />
                התנתק
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden" dir="rtl">

      {/* ── Desktop Sidebar ── */}
      <aside className={`
        hidden lg:flex flex-col bg-white border-l border-gray-200 shadow-sm flex-shrink-0
        transition-all duration-200
        ${sidebarCollapsed ? 'w-16' : 'w-64'}
      `}>
        <SidebarContent collapsed={sidebarCollapsed} />
        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          className="absolute bottom-20 right-0 translate-x-1/2 w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors shadow-sm z-10"
          style={{ right: sidebarCollapsed ? '4rem' : '16rem' }}
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${sidebarCollapsed ? 'rotate-90' : '-rotate-90'}`} />
        </button>
      </aside>

      {/* ── Mobile Drawer Overlay ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed top-0 right-0 h-full w-72 bg-white z-50 shadow-2xl flex flex-col lg:hidden"
            >
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top Header ── */}
        <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 flex-shrink-0 z-30">
          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors -mr-1"
            aria-label="פתח תפריט"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile brand logo */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-800">קליניקת תקשורת</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Admin badge */}
          {isAdmin && (
            <Link
              to="/admin/users"
              className="hidden sm:flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full font-medium hover:bg-purple-100 transition-colors"
            >
              <UserCog className="w-3.5 h-3.5" />
              ניהול
            </Link>
          )}

          {/* Notification bell (placeholder) */}
          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors relative">
            <Bell className="w-5 h-5" />
          </button>

          {/* User avatar */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-sm font-medium text-gray-700 truncate max-w-[120px]">
              {userName}
            </span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold cursor-pointer">
              {userInitial}
            </div>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 lg:pb-6">
          {children}
        </main>

        {/* ── Mobile Bottom Navigation ── */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center z-40 shadow-[0_-1px_8px_rgba(0,0,0,0.06)]">
          {MOBILE_BOTTOM_ITEMS.map(item => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors
                  ${active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">עוד</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
