import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Check } from 'lucide-react';

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

export default function InventoryModal({
  isOpen,
  onClose,
  onSave,
  preselectedProductId = null,
  products = [],
  locations = [],
  categories = [],
  storeSuggestions = []
}) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [storageLocation, setStorageLocation] = useState('Pantry');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expirationDate, setExpirationDate] = useState('');
  const [loading, setLoading] = useState(false);

  const getDefaultStorageLocation = (catName) => {
    let defaultLoc = 'Pantry';
    if (catName && categories.length > 0) {
      const matchedCategory = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      if (matchedCategory && matchedCategory.default_storage_location) {
        const matchedLoc = locations.find(l => l.name.toLowerCase() === matchedCategory.default_storage_location.toLowerCase());
        if (matchedLoc) {
          return matchedLoc.name;
        }
      }
    }
    return defaultLoc;
  };

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setPrice('');
      setStoreLocation('');
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setExpirationDate('');

      if (preselectedProductId) {
        setProductId(preselectedProductId);
        const selectedProd = products.find(p => p.id == preselectedProductId);
        if (selectedProd) {
          setStorageLocation(getDefaultStorageLocation(selectedProd.category));
        }
      } else {
        setProductId('');
        setStorageLocation('Pantry');
      }
    }
  }, [isOpen, preselectedProductId, products, categories, locations]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId) return;

    setLoading(true);
    const payload = {
      product_id: parseInt(productId, 10),
      quantity: parseFloat(quantity) || 1,
      price: price ? parseFloat(price) : null,
      store_location: storeLocation || null,
      storage_location: storageLocation,
      purchase_date: purchaseDate,
      expiration_date: expirationDate || null
    };

    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        onSave(payload);
        onClose();
      } else {
        const err = await res.json();
        alert(`Error logging inventory: ${err.error}`);
      }
    } catch (error) {
      console.error('Error logging inventory:', error);
      alert('Network error logging inventory');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl glass-panel p-6 space-y-4 my-8 relative animate-scale-up text-left">
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-indigo-400" />
          Log Grocery Purchase
        </h2>

        {products.length === 0 ? (
          <div className="text-center py-6 text-slate-400 space-y-2">
            <p>No products registered yet. Please create a product barcode registry entry first.</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-indigo-600 text-white text-xs font-semibold"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-sm text-slate-200">
            {/* Select Product (Hidden or disabled if preselected) */}
            {preselectedProductId ? (
              <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Logging Item</span>
                  <span className="text-sm font-bold text-white">
                    {products.find(p => p.id == preselectedProductId)?.name || 'Unknown Product'}
                  </span>
                  <span className="text-xs text-slate-450 block">
                    {products.find(p => p.id == preselectedProductId)?.brand || ''}
                  </span>
                </div>
                <span className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded uppercase font-bold font-mono">
                  {products.find(p => p.id == preselectedProductId)?.package_type || 'package'}
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 font-medium">Select Product *</label>
                <select 
                  value={productId} 
                  onChange={(e) => {
                    const newProdId = e.target.value;
                    setProductId(newProdId);
                    if (newProdId) {
                      const selectedProd = products.find(p => p.id == newProdId);
                      if (selectedProd) {
                        setStorageLocation(getDefaultStorageLocation(selectedProd.category));
                      }
                    }
                  }}
                  className="w-full p-2.5 rounded-lg glass-input bg-slate-900 text-xs"
                  required
                >
                  <option value="">-- Choose Product --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.brand ? `(${p.brand})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {productId && (() => {
              const selectedProd = products.find(p => p.id == productId);
              if (!selectedProd) return null;
              const normUnit = normalizeUnit(selectedProd.serving_unit || selectedProd.default_unit);
              const isPhysical = PHYSICAL_UNITS.has(normUnit);
              
              // Don't show servings/capacity info for parent products
              if (selectedProd.is_parent === 1) return null;

              return (
                <div className="text-[11px] text-slate-400 mt-1.5 flex flex-col gap-0.5 bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
                  <div className="flex justify-between">
                    <span>Package Servings:</span>
                    <span className="font-semibold text-white">
                      {selectedProd.servings_per_package} servings / package
                    </span>
                  </div>
                  {isPhysical && selectedProd.serving_size > 0 && (
                    <div className="flex justify-between">
                      <span>Package Capacity:</span>
                      <span className="font-semibold text-indigo-400">
                        {(selectedProd.servings_per_package * selectedProd.serving_size).toFixed(1)}{normUnit} / package
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Quantity & Storage Location */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Quantity (Packages) *</label>
                <input 
                  type="number" 
                  step="any"
                  value={quantity} 
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input text-xs"
                  min="0.1"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Storage Location</label>
                <select 
                  value={storageLocation} 
                  onChange={(e) => setStorageLocation(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input bg-slate-900 text-xs"
                >
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Price & Store Location */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Price Paid ($)</label>
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 3.49"
                  value={price} 
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input text-xs"
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Store Purchased From</label>
                <input 
                  type="text" 
                  placeholder="e.g. Aldi"
                  value={storeLocation} 
                  onChange={(e) => setStoreLocation(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input text-xs"
                  list="modal-store-suggestions"
                />
                <datalist id="modal-store-suggestions">
                  {storeSuggestions.map((store, idx) => (
                    <option key={idx} value={store} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Purchase & Expiration Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Purchase Date *</label>
                <input 
                  type="date" 
                  value={purchaseDate} 
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input text-xs font-mono"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Expiration Date</label>
                <input 
                  type="date" 
                  value={expirationDate} 
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input text-xs font-mono"
                />
              </div>
            </div>

            {/* Save actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button 
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex items-center gap-1 px-5 py-2 rounded-lg bg-gradient-indigo text-white text-xs font-semibold shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                disabled={loading || !productId}
              >
                <Check className="h-4 w-4" /> 
                {loading ? 'Saving...' : 'Save Purchase'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
