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
  { path: '/calendar',       icon: Calendar,        label: 'יומן' },
  { path: '/patients',       icon: Users,           label: 'מטופלים' },
  { path: '/intake-forms',   icon: FileText,        label: 'שאלונים' },
  { path: '/reports',        icon: BarChart2,       label: 'דוחות' },
  { path: '/reports/advanced', icon: TrendingUp,      label: 'מתקדם' },
  { path: '/templates',      icon: Layout,          label: 'תבניות' },
  { path: '/ai-assistant',   icon: Bot,             label: 'AI' },
  { path: '/settings',       icon: Settings,        label: 'הגדרות' },
];

// פריטים שיופיעו בסרגל התחתון בנייד (הכי שימושיים ביום-יום)
const MOBILE_BOTTOM_ITEMS = [
  { path: '/',         icon: LayoutDashboard, label: 'דשבורד' },
  { path: '/calendar', icon: Calendar,        label: 'יומן' },
  { path: '/patients', icon: Users,           label: 'מטופלים' },
  { path: '/ai-assistant', icon: Bot,         label: 'עוזר AI' },
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

  // קומפוננטת פריט ניווט לשימוש חוזר
  const NavItem = ({ item, onClick, isMobile = false }) => (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center transition-all ${
        isMobile 
          ? `flex-col gap-1 py-1 px-2 ${isActive(item.path) ? 'text-teal-600' : 'text-gray-400'}`
          : `gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              isActive(item.path)
                ? 'bg-gradient-to-l from-teal-500 to-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`
      }`}
    >
      <item.icon className={isMobile ? "w-5 h-5" : "w-5 h-5 flex-shrink-0"} />
      <span className={isMobile ? "text-[10px] font-medium" : ""}>{item.label}</span>
    </Link>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden text-right" dir="rtl">
      {/* Desktop Sidebar (מחשב וטאבלט במצב אופקי) */}
      <aside className="hidden lg:flex flex-col bg-white border-l border-gray-100 shadow-sm w-64 flex-shrink-0">
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

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => <NavItem key={item.path} item={item} />)}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
              {(profile?.name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.name || user?.email}</p>
              <button onClick={handleLogout} className="text-xs text-red-500 hover:underline">התנתק</button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer (תפריט "עוד" לנייד) */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-72 bg-white z-50 shadow-2xl flex flex-col lg:hidden text-right"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <span className="font-bold text-gray-900">תפריט נוסף</span>
                <button onClick={() => setDrawerOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navItems.map(item => (
                  <NavItem key={item.path} item={item} onClick={() => setDrawerOpen(false)} />
                ))}
              </nav>
              <div className="p-4 border-t border-gray-100">
                <button onClick={handleLogout} className="flex items-center gap-3 w-full text-red-600 font-medium">
                  <LogOut className="w-5 h-5" /> התנתקות
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 px-4 h-14 flex items-center gap-3 flex-shrink-0 shadow-sm z-30">
          <Link to="/" className="text-teal-600"><Home className="w-5 h-5" /></Link>
          
          {location.pathname !== '/' && (
            <button onClick={() => navigate(-1)} className="flex items-center text-sm text-gray-500 mr-2">
              <ChevronRight className="w-4 h-4" /> חזרה
            </button>
          )}

          <div className="flex-1" />

          {isAdmin && (
            <Link to="/admin/users" className="hidden sm:flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-full">
              <UserCog className="w-3 h-3" /> ניהול
            </Link>
          )}

          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-xs font-medium text-gray-600">{profile?.name || user?.email}</span>
            <div className="w-7 h-7 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold">
              {(profile?.name || user?.email || '?')[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page Content - pb-16 מוסיף רווח לסרגל התחתון בנייד */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 lg:pb-6">
          {children}
        </main>

        {/* Mobile Bottom Navigation (רק למסכי lg ומטה) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around items-center py-2 px-1 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          {MOBILE_BOTTOM_ITEMS.map(item => (
            <NavItem key={item.path} item={item} isMobile={true} />
          ))}
          <button 
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-1 px-3 py-1 text-gray-400"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">עוד</span>
          </button>
        </nav>
      </div>
    </div>
  );
}