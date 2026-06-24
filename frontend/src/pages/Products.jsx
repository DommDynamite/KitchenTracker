import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Tag, 
  Layers, Package, Check, X, Upload, Camera, Database,
  Eye, EyeOff, LayoutGrid, List
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import ProductModal from '../components/ProductModal';

const PHYSICAL_UNITS = new Set([
  'g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'cup', 'pint', 'quart', 'gallon', 'tbsp', 'tsp'
]);

function normalizeUnit(unit) {
  if (!unit) return '';
  const u = unit.toLowerCase().trim();
  if (u === 'g' || u === 'gram' || u === 'grams') return 'g';
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return 'kg';
  if (u === 'oz' || u === 'ounce' || u === 'ounces') return 'oz';
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return 'lb';
  if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return 'ml';
  if (u === 'l' || u === 'liter' || u === 'liters') return 'l';
  if (u === 'fl oz' || u === 'fl_oz' || u === 'floz' || u === 'fluid ounce' || u === 'fluid ounces') return 'fl_oz';
  if (u === 'cup' || u === 'cups' || u === 'c') return 'cup';
  if (u === 'pint' || u === 'pints' || u === 'pt') return 'pint';
  if (u === 'quart' || u === 'quarts' || u === 'qt') return 'quart';
  if (u === 'gallon' || u === 'gallons' || u === 'gal') return 'gallon';
  if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') return 'tbsp';
  if (u === 'tsp' || u === 'teaspoon' || u === 'teaspoons') return 'tsp';
  return u;
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [parentProducts, setParentProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showChildProducts, setShowChildProducts] = useState(() => {
    const val = localStorage.getItem('kitchen_products_show_child');
    return val !== 'false';
  });
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('kitchen_products_view_mode') || 'grid';
  });

  useEffect(() => {
    localStorage.setItem('kitchen_products_show_child', showChildProducts);
  }, [showChildProducts]);

  useEffect(() => {
    localStorage.setItem('kitchen_products_view_mode', viewMode);
  }, [viewMode]);

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null); // { message: string, type: 'success' | 'error' }



  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
      
      // Filter parent products (where parent_product_id is null/empty)
      const parents = data.filter(p => !p.parent_product_id);
      setParentProducts(parents);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(true);
      setLoading(false);
    }
  };

  const [categories, setCategories] = useState([]);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (categories.length > 0 && !editingProduct) {
      const pantryCat = categories.find(c => c.name.toLowerCase() === 'pantry');
      if (pantryCat) {
        setCategory(pantryCat.name);
      } else {
        setCategory(categories[0].name);
      }
    }
  }, [categories, editingProduct]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setShowModal(true);
  };

  const handleOpenEdit = (prod) => {
    setEditingProduct(prod);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    setDeleteConfirm({
      message: 'Are you sure you want to delete this product? This will also remove any related inventory items.',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/products/${id}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            fetchProducts();
          }
        } catch (error) {
          console.error('Error deleting product:', error);
        }
      }
    });
  };

  const handleProductSaved = (savedProduct) => {
    setToast({
      message: editingProduct
        ? `Successfully updated "${savedProduct.name}"`
        : `Successfully added "${savedProduct.name}"`,
      type: 'success'
    });
    fetchProducts();
  };

  const matchSearchText = (text, query) => {
    if (!text) return false;
    if (!query) return true;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(Boolean);
    if (queryWords.length === 0) return true;
    const textWords = lowerText.split(/[^a-z0-9]+/i).filter(Boolean);
    return queryWords.every(qWord => 
      textWords.some(tWord => tWord.startsWith(qWord))
    );
  };

  // Filter products based on search and child product setting
  const filteredProducts = products.filter(p => {
    const isBarcodeMatch = p.barcode && p.barcode.includes(searchQuery);
    const searchTargets = [p.name, p.brand, p.category].filter(Boolean);
    const isTextMatch = !searchQuery.trim() || searchTargets.some(target => matchSearchText(target, searchQuery));
    const matchSearch = isBarcodeMatch || isTextMatch;
      
    const matchChild = showChildProducts || !p.parent_product_id;
    
    return matchSearch && matchChild;
  });

  const getProductImage = (prod) => {
    if (prod.image_path) return prod.image_path;
    const children = products.filter(p => p.parent_product_id == prod.id);
    const childWithImage = children.find(p => p.image_path);
    if (childWithImage) return childWithImage.image_path;
    return null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Products <span className="text-glow">Registry</span>
          </h1>
          <p className="text-slate-400 mt-1">Register products, scan barcodes, and configure stock minimum thresholds.</p>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-indigo px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95 hover:opacity-90"
        >
          <Plus className="h-4.5 w-4.5" /> Add Product
        </button>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between glass-panel p-4 rounded-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by name, brand, category, or barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg glass-input text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-4 items-center justify-between w-full md:w-auto">
          <button
            type="button"
            onClick={() => setShowChildProducts(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-xs transition-all duration-300 active:scale-95 ${
              showChildProducts 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.25)]' 
                : 'glass-input border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {showChildProducts ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                Hide Child Brands
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                Show Child Brands
              </>
            )}
          </button>
          
          <div className="flex bg-slate-950/60 p-1 rounded-lg border border-slate-800 shrink-0">
            <button 
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button 
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-4 text-sm text-slate-400 font-medium">
            <span>Total Products: <strong className="text-white">{products.length}</strong></span>
            <span>•</span>
            <span>Category Parents: <strong className="text-white">{parentProducts.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-2xl flex flex-col items-center">
          <Package className="h-16 w-16 opacity-30 text-slate-400 mb-4" />
          <h3 className="text-xl font-bold text-white">No Products Registered</h3>
          <p className="text-slate-500 mt-1">Add products manually or use a barcode scan to begin.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map(prod => (
            <div key={prod.id} className="glass-panel rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group">
              {getProductImage(prod) && (
                <div className="absolute right-0 top-0 w-24 h-24 opacity-20 pointer-events-none">
                  <img src={getProductImage(prod)} alt="" className="w-full h-full object-cover rounded-bl-full" />
                </div>
              )}
              
              <div>
                <div className="flex items-start justify-between">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                    {prod.category || 'Pantry'}
                  </span>
                  {prod.parent_name && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 bg-slate-800/40 px-2 py-0.5 rounded">
                      <Layers className="h-3 w-3" /> Child of {prod.parent_name}
                    </span>
                  )}
                  {!prod.parent_product_id && prod.minimum_stock > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                      Min: {prod.minimum_stock} {prod.default_unit}
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold text-white mt-3 group-hover:text-glow truncate" title={prod.name}>
                  {prod.name}
                </h3>
                
                <p className="text-xs text-slate-400 mt-1 font-semibold">
                  {prod.brand ? `Brand: ${prod.brand}` : 'No Brand'}
                </p>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-400">
                  <div>
                    <span className="block text-slate-500 font-medium">Default Unit</span>
                    <span className="text-white font-semibold">{prod.default_unit}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-medium">Servings / Pkg</span>
                    <span className="text-white font-semibold">{prod.servings_per_package}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-medium">Package Type</span>
                    <span className="text-white font-semibold capitalize">{prod.package_type || 'package'}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-medium">Calories</span>
                    <span className="text-white font-semibold">
                      {prod.calories_per_serving !== null && prod.calories_per_serving !== undefined 
                        ? `${prod.calories_per_serving} kcal/srv` 
                        : 'Not Set'}
                    </span>
                  </div>
                  <div className="col-span-2 mt-1">
                    <span className="block text-slate-500 font-medium">Serving Size</span>
                    <span className="text-white font-semibold">
                      1 serving = {prod.serving_size} {prod.serving_unit}
                    </span>
                  </div>
                  {PHYSICAL_UNITS.has(normalizeUnit(prod.serving_unit || prod.default_unit)) && prod.serving_size > 0 && (
                    <div className="col-span-2 mt-1">
                      <span className="block text-slate-500 font-medium">Package Capacity</span>
                      <span className="text-indigo-300 font-semibold">
                        {(prod.servings_per_package * prod.serving_size).toFixed(1)}{normalizeUnit(prod.serving_unit || prod.default_unit)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-6 pt-4 border-t border-slate-800/60 justify-between items-center">
                <span className="text-[11px] text-slate-500 font-mono">
                  {prod.barcode ? `BC: ${prod.barcode}` : 'No Barcode'}
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleOpenEdit(prod)}
                    className="p-1.5 rounded bg-slate-800/40 hover:bg-slate-700/60 text-indigo-400 hover:text-indigo-300"
                    title="Edit Product"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(prod.id)}
                    className="p-1.5 rounded bg-slate-800/40 hover:bg-rose-950/40 text-rose-400 hover:text-rose-300"
                    title="Delete Product"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* COMPACT LIST VIEW LAYOUT */
        <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="p-4">Product</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Barcode</th>
                  <th className="p-4">Capacity</th>
                  <th className="p-4">Servings</th>
                  <th className="p-4">Calories</th>
                  <th className="p-4">Min Alert</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredProducts.map(prod => {
                  const hasCapacity = PHYSICAL_UNITS.has(normalizeUnit(prod.serving_unit || prod.default_unit)) && prod.serving_size > 0;
                  return (
                    <tr key={prod.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {getProductImage(prod) ? (
                            <img src={getProductImage(prod)} alt="" className="h-10 w-10 object-cover rounded-lg border border-slate-800 shrink-0" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-center shrink-0">
                              <Package className="h-5 w-5 text-slate-500" />
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-white block text-sm">{prod.name}</span>
                            <span className="text-slate-400 text-[10px]">{prod.brand || 'Generic'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-300">
                        {prod.category || 'Pantry'}
                      </td>
                      <td className="p-4 font-mono text-slate-400 text-[11px]">
                        {prod.barcode || '-'}
                      </td>
                      <td className="p-4 text-white font-medium">
                        {hasCapacity 
                          ? `${(prod.servings_per_package * prod.serving_size).toFixed(1)}${normalizeUnit(prod.serving_unit || prod.default_unit)}`
                          : `${prod.servings_per_package} srv`}
                      </td>
                      <td className="p-4 text-slate-300">
                        {prod.servings_per_package} srv
                      </td>
                      <td className="p-4 text-slate-350">
                        {prod.calories_per_serving !== null && prod.calories_per_serving !== undefined 
                          ? `${prod.calories_per_serving} kcal/srv` 
                          : '-'}
                      </td>
                      <td className="p-4 text-slate-400">
                        {prod.parent_product_id ? (
                          <span className="text-[10px] text-slate-500 italic">Inherited</span>
                        ) : (
                          `${prod.minimum_stock || 0} ${prod.default_unit}`
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleOpenEdit(prod)}
                            className="p-1.5 rounded bg-slate-800/40 hover:bg-slate-700/60 text-indigo-400 hover:text-indigo-300 transition-colors"
                            title="Edit Product"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDelete(prod.id)}
                            className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors"
                            title="Delete Product"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ProductModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleProductSaved}
        editingProduct={editingProduct}
        categories={categories}
        parentProducts={parentProducts}
      />

      <ConfirmModal 
        isOpen={!!deleteConfirm}
        title="Delete Product"
        message={deleteConfirm?.message}
        onConfirm={() => {
          deleteConfirm?.onConfirm();
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-[110] flex items-center gap-2.5 px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-450 backdrop-blur-md shadow-2xl animate-slide-in-right">
          <Check className="h-5 w-5 shrink-0" />
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
