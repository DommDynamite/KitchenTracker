import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  AlertTriangle, 
  Calendar, 
  Flame, 
  ShoppingCart, 
  Plus, 
  RotateCw, 
  Database,
  TrendingDown
} from 'lucide-react';

function addDays(dateStr, days) {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const date = new Date(year, month, day);
  date.setDate(date.getDate() + days);
  
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getEffectiveExpiry(item) {
  const printedExpiry = item.expiration_date;
  const openedDate = item.opened_date;
  const useByDays = item.use_by_days_after_opening;

  if (item.status === 'opened' && openedDate && useByDays !== null && useByDays !== undefined && useByDays !== '') {
    const openedExpiryStr = addDays(openedDate, parseInt(useByDays, 10));
    if (printedExpiry) {
      return printedExpiry < openedExpiryStr ? printedExpiry : openedExpiryStr;
    }
    return openedExpiryStr;
  }
  return printedExpiry;
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalItems: 0,
    expiredCount: 0,
    expiringSoonCount: 0,
    lowStockCount: 0,
    recipeCount: 0
  });
  const [expiringItems, setExpiringItems] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Inventory
      const invRes = await fetch('/api/inventory');
      const inventory = await invRes.json();
      
      // 2. Fetch Recipes
      const recRes = await fetch('/api/recipes');
      const recipes = await recRes.json();

      // 3. Fetch Shopping List (which includes low stock calculations)
      const shopRes = await fetch('/api/shopping-list');
      const shoppingList = await shopRes.json();

      // Calculations
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let expired = 0;
      let expiringSoon = 0;
      const expiringList = [];

      inventory.forEach(item => {
        const effectiveExpiry = getEffectiveExpiry(item);
        if (effectiveExpiry) {
          const expParts = effectiveExpiry.split('-');
          const expDate = new Date(parseInt(expParts[0], 10), parseInt(expParts[1], 10) - 1, parseInt(expParts[2], 10));
          expDate.setHours(0, 0, 0, 0);
          
          const diffTime = expDate - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            expired++;
            expiringList.push({ ...item, daysLeft: diffDays, urgency: 'expired', effectiveExpiry });
          } else if (diffDays <= 5) {
            expiringSoon++;
            expiringList.push({ ...item, daysLeft: diffDays, urgency: 'soon', effectiveExpiry });
          }
        }
      });

      // Sort expiring list by days left
      expiringList.sort((a, b) => a.daysLeft - b.daysLeft);

      setExpiringItems(expiringList);
      setLowStockItems(shoppingList.auto || []);
      
      setStats({
        totalItems: inventory.length,
        expiredCount: expired,
        expiringSoonCount: expiringSoon,
        lowStockCount: shoppingList.auto ? shoppingList.auto.length : 0,
        recipeCount: recipes.length
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RotateCw className="h-10 w-10 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome & Quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            My Kitchen <span className="text-glow font-bold">Dashboard</span>
          </h1>
          <p className="text-slate-400 mt-1">Real-time tracking of your ingredients, servings, and shopping list.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link 
            to="/scan" 
            className="flex items-center gap-2 rounded-lg bg-gradient-indigo px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95 hover:opacity-90"
          >
            <Plus className="h-4.5 w-4.5" /> Scan Barcode
          </Link>
          <button 
            onClick={fetchDashboardData}
            className="flex items-center justify-center p-2.5 rounded-lg glass-input hover:border-slate-500 text-slate-300"
            title="Refresh Data"
          >
            <RotateCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Total items */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-sm font-medium">In Stock Items</span>
            <Database className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-white">{stats.totalItems}</span>
            <span className="text-xs text-slate-500 block mt-1">Individual packages</span>
          </div>
        </div>

        {/* Expired items */}
        <div className={`glass-panel p-5 rounded-2xl flex flex-col justify-between min-h-[120px] border-l-4 ${stats.expiredCount > 0 ? 'border-l-rose-500' : 'border-l-indigo-500'}`}>
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-sm font-medium">Expired Foods</span>
            <AlertTriangle className={`h-5 w-5 ${stats.expiredCount > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="mt-4">
            <span className={`text-3xl font-bold ${stats.expiredCount > 0 ? 'text-rose-400' : 'text-white'}`}>{stats.expiredCount}</span>
            <span className="text-xs text-slate-500 block mt-1">Require disposal</span>
          </div>
        </div>

        {/* Expiring soon */}
        <div className={`glass-panel p-5 rounded-2xl flex flex-col justify-between min-h-[120px] border-l-4 ${stats.expiringSoonCount > 0 ? 'border-l-amber-500' : 'border-l-indigo-500'}`}>
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-sm font-medium">Expiring Soon</span>
            <Calendar className={`h-5 w-5 ${stats.expiringSoonCount > 0 ? 'text-amber-500' : 'text-slate-500'}`} />
          </div>
          <div className="mt-4">
            <span className={`text-3xl font-bold ${stats.expiringSoonCount > 0 ? 'text-amber-400' : 'text-white'}`}>{stats.expiringSoonCount}</span>
            <span className="text-xs text-slate-500 block mt-1">Consume within 5 days</span>
          </div>
        </div>

        {/* Low Stock count */}
        <div className={`glass-panel p-5 rounded-2xl flex flex-col justify-between min-h-[120px] border-l-4 ${stats.lowStockCount > 0 ? 'border-l-indigo-500' : 'border-l-indigo-500'}`}>
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-sm font-medium">Low Stock Groups</span>
            <TrendingDown className={`h-5 w-5 ${stats.lowStockCount > 0 ? 'text-indigo-400' : 'text-slate-500'}`} />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold text-white">{stats.lowStockCount}</span>
            <span className="text-xs text-slate-500 block mt-1">Pending auto-shopping</span>
          </div>
        </div>
      </div>

      {/* Warnings & Alerts section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Expiration warnings */}
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-400" /> Expiration Alerts
            </h2>
            <Link to="/inventory" className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">View Inventory</Link>
          </div>
          
          {expiringItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Calendar className="h-10 w-10 opacity-40 mb-2" />
              <p className="text-sm">No items are expired or expiring soon!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {expiringItems.map(item => (
                <div 
                  key={item.id} 
                  className={`p-3.5 rounded-xl glass-card flex items-center justify-between border-l-4 ${
                    item.urgency === 'expired' ? 'border-l-rose-500 bg-rose-950/10' : 'border-l-amber-500 bg-amber-950/10'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-semibold text-white truncate text-sm">{item.product_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {item.product_brand ? `${item.product_brand} • ` : ''}{item.storage_location} • {item.remaining_servings.toFixed(0)} servings left
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {item.urgency === 'expired' ? (
                      <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        Expired {Math.abs(item.daysLeft)}d ago
                      </span>
                    ) : (
                      <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Expires in {item.daysLeft}d
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-indigo-400" /> Auto Shopping Recommendations
            </h2>
            <Link to="/shopping-list" className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">View List</Link>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <ShoppingCart className="h-10 w-10 opacity-40 mb-2" />
              <p className="text-sm">All grocery levels are healthy!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {lowStockItems.map(item => (
                <div key={item.id} className="p-3.5 rounded-xl glass-card flex items-center justify-between border-l-4 border-l-indigo-500">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-semibold text-white text-sm">{item.product_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{item.notes}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[11px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                      Buy +{item.amount.toFixed(0)} {item.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Tips */}
      <div className="glass-panel p-6 rounded-2xl bg-gradient-to-r from-indigo-950/20 to-slate-900/40 border border-indigo-500/10">
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <Flame className="h-5 w-5 text-amber-400" /> Pro-Tip: Expiration & Servings
        </h3>
        <p className="text-slate-400 text-sm mt-2 leading-relaxed">
          Open a package by using the sliders in the <strong>Inventory</strong> tab. When making a recipe, the system automatically uses <strong>FIFO (First-In, First-Out)</strong> logic based on expiration dates to consume the oldest items first, helping you minimize food waste!
        </p>
      </div>
    </div>
  );
}
