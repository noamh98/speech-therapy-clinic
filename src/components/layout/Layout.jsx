// src/components/layout/Layout.jsx
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Calendar, Users, FileText, BarChart2,
  TrendingUp, Layout, Bot, Settings, UserCog, LogOut,
  Menu, X, Home, ChevronRight, Stethoscope
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/',               icon: LayoutDashboard, label: 'דשבורד' },
  { path: '/calendar',       icon: Calendar,        label: 'יומן טיפולים' },
  { path: '/patients',       icon: Users,           label: 'מטופלים' },
  { path: '/intake-forms',   icon: FileText,        label: 'שאלוני קבלה' },
  { path: '/reports',        icon: BarChart2,       label: 'דוחות' },
  { path: '/reports/advanced', icon: TrendingUp,   label: 'דוחות מתקדמים' },
  { path: '/templates',      icon: Layout,          label: 'תבניות' },
  { path: '/ai-assistant',   icon: Bot,             label: 'עוזר AI' },
  { path: '/settings',       icon: Settings,        label: 'הגדרות' },
];

export default function AppLayout({ children }) {
  const { user, profile, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = isAdmin
    ? [...NAV_ITEMS, { path: '/admin/users', icon: UserCog, label: 'ניהול משתמשים' }]
    : NAV_ITEMS;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const NavItem = ({ item, onClick }) => (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
        ${isActive(item.path)
          ? 'bg-gradient-to-l from-teal-500 to-blue-600 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
    >
      <item.icon className="w-5 h-5 flex-shrink-0" />
      <span>{item.label}</span>
    </Link>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col bg-white border-l border-gray-100 shadow-sm"
             style={{ width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)' }}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">קליניקת תקשורת</p>
              <p className="text-xs text-gray-400">מערכת ניהול</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => <NavItem key={item.path} item={item} />)}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {(profile?.name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.name || user?.email}</p>
              <p className="text-xs text-gray-400 truncate">{isAdmin ? 'מנהל' : 'קלינאית'}</p>
            </div>
            <button
              onClick={handleLogout}
              title="התנתק"
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Backdrop */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-72 bg-white z-50 shadow-2xl flex flex-col lg:hidden"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <Stethoscope className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-bold text-gray-900">קליניקת תקשורת</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map(item => (
                <NavItem key={item.path} item={item} onClick={() => setDrawerOpen(false)} />
              ))}
            </nav>
            <div className="p-3 border-t border-gray-100">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-all"
              >
                <LogOut className="w-5 h-5" />
                התנתקות
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 px-4 h-14 flex items-center gap-3 flex-shrink-0 shadow-sm">
          {/* Mobile hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Back button */}
          {location.pathname !== '/' && (
            <button
              onClick={() => navigate(-1)}
              className="hidden sm:flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ChevronRight className="w-4 h-4" />
              חזרה
            </button>
          )}

          {/* Home button */}
          <Link to="/" className="text-gray-400 hover:text-teal-600 transition-colors">
            <Home className="w-5 h-5" />
          </Link>

          <div className="flex-1" />

          {/* Admin badge */}
          {isAdmin && (
            <Link
              to="/admin/users"
              className="hidden sm:flex items-center gap-1.5 text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full hover:bg-purple-200 transition-colors"
            >
              <UserCog className="w-3 h-3" />
              ניהול משתמשים
            </Link>
          )}

          {/* User chip */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
              {(profile?.name || user?.email || '?')[0].toUpperCase()}
            </div>
            <span className="hidden md:block text-sm text-gray-600 font-medium">
              {profile?.name || user?.email}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
