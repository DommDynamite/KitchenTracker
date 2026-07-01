import React, { useState, useEffect } from 'react';
import { 
  ChefHat, Plus, Search, Calendar, Trash2, Check, X,
  Layers, AlertTriangle, RotateCw, Sparkles, TrendingDown,
  Info, ShoppingCart, HelpCircle, Flame
} from 'lucide-react';
import ProductModal from '../components/ProductModal';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../context/ToastContext';

export default function SpiceRack({ settings }) {
  const { showToast } = useToast();
  const [spices, setSpices] = useState([]);
  const [parentProducts, setParentProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'low', 'out'
  
  // Modals state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(null);
  
  // Quick Add Backups state
  const [activeQuickAddId, setActiveQuickAddId] = useState(null);
  const [quickAddBrandId, setQuickAddBrandId] = useState('');
  const [quickAddQty, setQuickAddQty] = useState(1);
  const [quickAddExpiry, setQuickAddExpiry] = useState('');
  const [quickAddPercentage, setQuickAddPercentage] = useState(100);

  const fetchSpices = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/spices');
      if (res.ok) {
        const data = await res.json();
        setSpices(data);
      } else {
        showToast('Failed to fetch spices', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchParentProducts = async () => {
    try {
      const res = await fetch('/api/products?is_spice=true');
      if (res.ok) {
        const data = await res.json();
        setParentProducts(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSpices();
    fetchParentProducts();
    fetchCategories();
  }, []);

  const handlePercentageChange = (productId, val) => {
    setSpices(prev => prev.map(s => {
      if (s.product.id === productId) {
        return {
          ...s,
          activePercentage: val,
          activeItem: s.activeItem ? { ...s.activeItem, remaining_servings: val / 100 } : null
        };
      }
      return s;
    }));
  };

  const handlePercentageCommit = async (productId, val) => {
    try {
      const res = await fetch(`/api/spices/${productId}/percentage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentage: val })
      });
      if (res.ok) {
        showToast('Spice level updated', 'success');
        fetchSpices(); 
      } else {
        showToast('Failed to update percentage', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating spice level', 'error');
    }
  };

  const handleQuickAddSubmit = async (e, productId) => {
    e.preventDefault();
    const prodId = quickAddBrandId || productId;
    
    try {
      const res = await fetch('/api/spices/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: prodId,
          quantity: quickAddQty,
          expiration_date: quickAddExpiry || null,
          percentage: quickAddPercentage
        })
      });
      if (res.ok) {
        showToast('Spice logged successfully', 'success');
        setActiveQuickAddId(null);
        setQuickAddBrandId('');
        setQuickAddQty(1);
        setQuickAddExpiry('');
        setQuickAddPercentage(100);
        fetchSpices();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to log spice', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error logging spice purchase', 'error');
    }
  };

  const handleDeleteProduct = async () => {
    if (!showConfirmDelete) return;
    try {
      const res = await fetch(`/api/products/${showConfirmDelete}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Spice catalog product deleted', 'success');
        setShowConfirmDelete(null);
        fetchSpices();
      } else {
        showToast('Failed to delete product', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error deleting product', 'error');
    }
  };

  const filteredSpices = spices.filter(item => {
    const matchesSearch = item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.product.brand && item.product.brand.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const reorderThreshold = item.product.spice_reorder_percentage !== null ? item.product.spice_reorder_percentage : 20.0;
    const isLow = item.totalContainers === 0 || (item.totalContainers === 1 && item.activePercentage < reorderThreshold);
    const isOut = item.totalContainers === 0 || (item.activePercentage === 0 && item.totalContainers <= 1);

    if (activeTab === 'low') return matchesSearch && isLow;
    if (activeTab === 'out') return matchesSearch && isOut;
    return matchesSearch;
  });

  const getPercentageColor = (pct, threshold = 20) => {
    if (pct === 0) return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    if (pct < threshold) return 'text-rose-455 bg-rose-500/5 border-rose-500/10';
    if (pct < 50) return 'text-amber-400 bg-amber-500/5 border-amber-500/10';
    return 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10';
  };

  const getProgressBarColor = (pct, threshold = 20) => {
    if (pct === 0) return 'bg-slate-800';
    if (pct < threshold) return 'bg-gradient-to-r from-rose-600 to-rose-400 shadow-rose-500/25';
    if (pct < 50) return 'bg-gradient-to-r from-amber-600 to-amber-400 shadow-amber-500/25';
    return 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-emerald-500/25';
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12 select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2.5">
            <ChefHat className="h-7 w-7 text-indigo-400" />
            Spice <span className="text-glow font-bold">Rack</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track spices, seasonings, and condiments by percentage left and rotate backup shakers.
          </p>
        </div>

        <button 
          onClick={() => {
            setEditingProduct(null);
            setShowProductModal(true);
          }}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-indigo text-white text-xs font-bold shadow-lg shadow-indigo-650/15 hover:opacity-95 transition-opacity cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" /> Register New Spice
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-950/30 border border-slate-900 p-3 rounded-2xl">
        <div className="flex gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All Spices', icon: ChefHat },
            { id: 'low', label: 'Running Low', icon: AlertTriangle },
            { id: 'out', label: 'Out of Stock', icon: TrendingDown },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  active 
                    ? 'bg-slate-900 border border-slate-800 text-white shadow-inner' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search spices and brands..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2.5 pl-10 rounded-xl glass-input text-xs"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <RotateCw className="h-8 w-8 animate-spin text-indigo-400" />
          <span className="text-xs font-semibold">Loading Spice Rack...</span>
        </div>
      ) : filteredSpices.length === 0 ? (
        <div className="text-center py-16 bg-slate-950/20 border border-slate-900/60 rounded-2xl p-6">
          <ChefHat className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-350">No spices found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            {searchTerm 
              ? 'No registered spices match your active search terms.' 
              : activeTab === 'low'
              ? 'Excellent! No spices are currently running low.'
              : activeTab === 'out'
              ? 'All registered spices are in stock.'
              : 'Add parent spice items (e.g. Garlic Powder) and log shaker levels.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSpices.map(item => {
            const reorderThreshold = item.product.spice_reorder_percentage !== null ? item.product.spice_reorder_percentage : 20.0;
            const isLow = item.totalContainers === 0 || (item.totalContainers === 1 && item.activePercentage < reorderThreshold);
            const isExpired = item.expirationDate && new Date(item.expirationDate) < new Date();
            const isQuickAddOpen = activeQuickAddId === item.product.id;

            return (
              <div 
                key={item.product.id}
                className={`relative flex flex-col justify-between rounded-2xl bg-slate-950/40 backdrop-blur-md border p-4.5 space-y-4 hover:border-slate-800 transition-all shadow-lg hover:-translate-y-0.5 duration-250 ${
                  isLow ? 'border-rose-500/10 hover:border-rose-500/25 bg-rose-950/[0.01]' : 'border-slate-900'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-white leading-tight">{item.product.name}</h3>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Capacity: {item.product.serving_size} {item.product.serving_unit || item.product.default_unit}
                      </p>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      {isLow && (
                        <span 
                          className="p-1.5 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-455 hover:bg-rose-500/10 cursor-help"
                          title={`Auto-suggestions on shopping list: active jar is below ${reorderThreshold}%`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </span>
                      )}
                      
                      <button 
                        onClick={() => {
                          setEditingProduct(item.product);
                          setShowProductModal(true);
                        }}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-850 text-slate-455 hover:text-white transition-colors cursor-pointer"
                        title="Edit Spice Specs"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                      </button>

                      <button 
                        onClick={() => setShowConfirmDelete(item.product.id)}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-850 text-slate-455 hover:text-rose-455 transition-colors cursor-pointer"
                        title="Delete Spice Product"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {item.brands.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1.5">
                      {item.brands.map(b => (
                        <span key={b.id} className="text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-850/80">
                          {b.brand || 'Unbranded'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 p-3 bg-slate-900/30 rounded-xl border border-slate-900/60 shadow-inner">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-400">Active Shaker Level:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border font-mono ${getPercentageColor(item.activePercentage, reorderThreshold)}`}>
                      {item.totalContainers === 0 ? 'Out of Stock' : `${item.activePercentage}%`}
                    </span>
                  </div>

                  {item.totalContainers > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <input 
                          type="range"
                          min="0"
                          max="100"
                          value={item.activePercentage}
                          onChange={(e) => handlePercentageChange(item.product.id, parseInt(e.target.value))}
                          onMouseUp={(e) => handlePercentageCommit(item.product.id, parseInt(e.target.value))}
                          onTouchEnd={(e) => handlePercentageCommit(item.product.id, parseInt(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-800 accent-indigo-500"
                        />
                      </div>
                      
                      <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${getProgressBarColor(item.activePercentage, reorderThreshold)}`}
                          style={{ width: `${item.activePercentage}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 py-1.5 italic text-center">
                      No active jars logged. Add one below.
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-900/80 text-slate-455">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      Backups: <strong>{item.backupCount} jar(s)</strong>
                    </span>
                    {item.expirationDate && (
                      <span className={`font-mono flex items-center gap-1 ${isExpired ? 'text-rose-455 font-bold' : ''}`}>
                        <Calendar className="h-3 w-3" /> Exp: {item.expirationDate}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 border-t border-slate-900/50 pt-2.5">
                  {!isQuickAddOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveQuickAddId(item.product.id);
                        setQuickAddBrandId('');
                      }}
                      className="w-full py-2 px-3 rounded-xl border border-slate-900 hover:border-slate-850 hover:bg-slate-900/30 text-[11px] font-bold text-indigo-400 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Log Grocery Purchase / Jar
                    </button>
                  ) : (
                    <form 
                      onSubmit={(e) => handleQuickAddSubmit(e, item.product.id)}
                      className="space-y-3 p-3 rounded-xl border border-indigo-500/10 bg-indigo-950/[0.02] text-left animate-slide-in-down"
                    >
                      <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Log Spice Jar
                        </span>
                        <button 
                          type="button"
                          onClick={() => setActiveQuickAddId(null)}
                          className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        {item.brands.length > 0 && (
                          <div className="space-y-1 col-span-2">
                            <label className="block text-slate-400 font-semibold">Select Brand/Format</label>
                            <select
                              value={quickAddBrandId}
                              onChange={(e) => setQuickAddBrandId(e.target.value)}
                              className="w-full p-2 rounded bg-slate-950 border border-slate-850 text-slate-200"
                            >
                              <option value="">{item.product.name} (General)</option>
                              {item.brands.map(b => (
                                <option key={b.id} value={b.id}>{b.brand} {b.barcode ? `(${b.barcode})` : ''}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="block text-slate-400 font-semibold">Quantity Jars</label>
                          <input 
                            type="number" 
                            min="1"
                            value={quickAddQty}
                            onChange={(e) => setQuickAddQty(parseInt(e.target.value) || 1)}
                            className="w-full p-2 rounded bg-slate-950 border border-slate-850 text-slate-200"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-slate-400 font-semibold">Jar Fill %</label>
                          <input 
                            type="number" 
                            min="1"
                            max="100"
                            value={quickAddPercentage}
                            onChange={(e) => setQuickAddPercentage(Math.max(1, Math.min(100, parseInt(e.target.value) || 100)))}
                            className="w-full p-2 rounded bg-slate-950 border border-slate-850 text-slate-200"
                            required
                          />
                        </div>

                        <div className="space-y-1 col-span-2">
                          <label className="block text-slate-400 font-semibold">Expiration Date</label>
                          <input 
                            type="date" 
                            value={quickAddExpiry}
                            onChange={(e) => setQuickAddExpiry(e.target.value)}
                            className="w-full p-2 rounded bg-slate-950 border border-slate-850 text-slate-200"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-1.5 px-3 rounded bg-gradient-indigo text-white font-bold text-[10px] hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                      >
                        Add to Spice Rack
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showProductModal && (
        <ProductModal 
          isOpen={showProductModal}
          onClose={() => setShowProductModal(false)}
          onSave={fetchSpices}
          editingProduct={editingProduct}
          isSpiceMode={true}
          parentProducts={parentProducts}
          categories={categories}
        />
      )}

      {showConfirmDelete && (
        <ConfirmModal 
          isOpen={showConfirmDelete !== null}
          title="Delete Spice Catalog Item?"
          message="Warning: This will permanently delete this spice specification product from the catalog, along with all active shakers and backups in stock."
          onConfirm={handleDeleteProduct}
          onCancel={() => setShowConfirmDelete(null)}
        />
      )}
    </div>
  );
}
