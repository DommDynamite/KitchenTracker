import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Database, 
  ShoppingBag, 
  BookOpen, 
  ShoppingCart, 
  Camera, 
  Menu, 
  X,
  Settings
} from 'lucide-react';

// Import Pages
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Recipes from './pages/Recipes';
import ShoppingList from './pages/ShoppingList';
import Scan from './pages/Scan';
import SettingsPage from './pages/Settings';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      const target = e.target;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (diff > 100) {
        buffer = '';
      }

      if (e.key.length === 1) {
        buffer += e.key;
      } else if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          console.log('Global barcode scan detected:', buffer);
          navigate(`/scan?barcode=${encodeURIComponent(buffer)}`);
          buffer = '';
        } else {
          buffer = '';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate]);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/inventory', label: 'Inventory', icon: ShoppingBag },
    { path: '/products', label: 'Products', icon: Database },
    { path: '/recipes', label: 'Recipes', icon: BookOpen },
    { path: '/shopping-list', label: 'Shopping List', icon: ShoppingCart },
    { path: '/scan', label: 'Scan Barcode', icon: Camera },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 glass-panel h-screen sticky top-0 border-r border-slate-800/80 p-5 shrink-0">
        <div className="flex items-center gap-2.5 pb-6 border-b border-slate-800/60 mb-6">
          <div className="h-9 w-9 rounded-xl bg-gradient-indigo flex items-center justify-center font-bold text-white text-lg shadow-lg">
            K
          </div>
          <span className="font-extrabold text-white text-lg tracking-tight">
            Kitchen<span className="text-glow font-bold">Tracker</span>
          </span>
        </div>

        <nav className="flex-1 space-y-1.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  active 
                    ? 'bg-gradient-indigo text-white shadow-lg shadow-indigo-650/15' 
                    : 'text-slate-400 hover:bg-slate-900/60 hover:text-white hover:border-slate-800'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-slate-800/60 text-xs text-slate-500 font-mono">
          v1.0.0 • SQLite Connected
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between glass-panel px-4 py-3 border-b border-slate-800/80 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-indigo flex items-center justify-center font-bold text-white text-sm">
            K
          </div>
          <span className="font-bold text-white text-base tracking-tight">KitchenTracker</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg glass-input text-slate-300"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Mobile Sidebar Overlay Drawer */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        >
          <nav 
            className="w-64 glass-panel h-screen p-5 space-y-2 animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/65 mb-6">
              <span className="font-bold text-white text-base">Navigation</span>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    active 
                      ? 'bg-gradient-indigo text-white shadow-lg' 
                      : 'text-slate-400 hover:bg-slate-900/60 hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (App-like feel) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 glass-panel border-t border-slate-800/80 px-2 py-1.5 flex justify-around">
        {navItems.filter(item => item.path !== '/settings').map(item => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-colors ${
                active ? 'text-indigo-400 font-bold' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5.5 w-5.5" />
              <span className="text-[10px]">{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function App() {
  return (
    <Router>
      <div className="flex flex-col md:flex-row min-h-screen">
        {/* Navigation Layer */}
        <Navigation />

        {/* Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 pb-20 md:pb-8 overflow-x-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/shopping-list" element={<ShoppingList />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
