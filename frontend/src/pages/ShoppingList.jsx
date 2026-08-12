import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Check, X, RotateCw, ShoppingCart, ShoppingBag, Info, Store, PlusCircle, CheckSquare, Square
} from 'lucide-react';
import ProductModal from '../components/ProductModal';
import { useToast } from '../context/ToastContext';

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

function calculateDefaultPurchaseQty(amount, listUnit, targetProduct) {
  if (!targetProduct) return amount;
  
  const normListUnit = normalizeUnit(listUnit);
  const normSrvUnit = normalizeUnit(targetProduct.serving_unit);
  
  // Package capacity in physical units
  const capacity = targetProduct.servings_per_package * targetProduct.serving_size;
  
  if (normListUnit === normSrvUnit && capacity > 0) {
    return Math.ceil(amount / capacity);
  }
  
  return amount;
}

function getPluralPackageType(type) {
  if (!type) return 'packages';
  const t = type.toLowerCase();
  if (t === 'package') return 'packages';
  if (t === 'box') return 'boxes';
  if (t === 'pouch') return 'pouches';
  if (t === 'jar') return 'jars';
  return `${t}s`;
}

export default function ShoppingList() {
  const { showToast } = useToast();
  const [manualList, setManualList] = useState([]);
  const [autoList, setAutoList] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Manual Item Add form
  const [addMode, setAddMode] = useState('custom'); // 'custom' or 'catalog'
  const [customName, setCustomName] = useState('');
  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState('pieces');
  const [notes, setNotes] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Checkout Panel
  const [selectedItems, setSelectedItems] = useState({}); // { itemId: true/false }
  const [checkoutItems, setCheckoutItems] = useState([]); // List of items being checked out
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [globalStore, setGlobalStore] = useState('');
  const [globalStorage, setGlobalStorage] = useState('Pantry');
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);

  // For registering a brand new product during checkout
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registeringForItemIdx, setRegisteringForItemIdx] = useState(null);
  const [prefilledParentIdForRegister, setPrefilledParentIdForRegister] = useState(null);
  const [prefilledCategoryForRegister, setPrefilledCategoryForRegister] = useState('Pantry');

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const fetchShoppingListAndProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shopping-list');
      const data = await res.json();
      setManualList(data.manual || []);
      setAutoList(data.auto || []);

      const prodRes = await fetch('/api/products');
      const prodData = await prodRes.json();
      setProducts(prodData);

      const locRes = await fetch('/api/locations');
      if (locRes.ok) {
        const locData = await locRes.json();
        setLocations(locData);
      }
    } catch (error) {
      console.error('Error fetching shopping list:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShoppingListAndProducts();
    fetchCategories();
  }, []);

  const handleAddManualItem = async (e) => {
    e.preventDefault();
    if (addMode === 'custom' && !customName.trim()) {
      showToast('Item Name is required.', 'warning');
      return;
    }
    if (addMode === 'catalog' && !productId) {
      showToast('Please select a product from the list.', 'warning');
      return;
    }
    if (!amount || !unit) {
      showToast('Amount and Unit are required.', 'warning');
      return;
    }

    const payload = {
      product_id: addMode === 'catalog' ? parseInt(productId, 10) : null,
      custom_name: addMode === 'custom' ? customName.trim() : null,
      amount: parseFloat(amount) || 1.0,
      unit,
      notes: notes.trim() || null
    };

    try {
      const res = await fetch('/api/shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowAddModal(false);
        setCustomName('');
        setProductId('');
        setAmount('1');
        setUnit('pieces');
        setNotes('');
        fetchShoppingListAndProducts();
        showToast('Item added to shopping list!', 'success');
      } else {
        const err = await res.json();
        showToast(`Error adding item: ${err.error}`, 'error');
      }
    } catch (error) {
      console.error('Error adding shopping list item:', error);
      showToast('Network error adding item', 'error');
    }
  };

  const handleDeleteManualItem = async (id) => {
    try {
      const res = await fetch(`/api/shopping-list/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchShoppingListAndProducts();
      }
    } catch (error) {
      console.error('Error deleting shopping list item:', error);
    }
  };

  // Selection toggle
  const handleToggleSelect = (itemId, itemData) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Open Checkout Panel
  const handleOpenCheckout = () => {
    // Collect all selected items
    const selectedManual = manualList.filter(item => selectedItems[item.id]);
    const selectedAuto = autoList.filter(item => selectedItems[item.id]);
    
    const getDefaultStorageLocation = (catName) => {
      let defaultLoc = 'Pantry';
      if (catName) {
        const matchedCategory = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
        if (matchedCategory && matchedCategory.default_storage_location) {
          const matchedLoc = locations.find(l => l.name.toLowerCase() === matchedCategory.default_storage_location.toLowerCase());
          if (matchedLoc) {
            return matchedLoc.name;
          }
        }
        
        const isCold = catName === 'Dairy' || catName === 'Meat & Seafood';
        const targetSearch = isCold ? 'fridge' : 'pantry';
        const matched = locations.find(l => l.name.toLowerCase() === targetSearch);
        if (matched) {
          defaultLoc = matched.name;
        } else if (locations.length > 0) {
          defaultLoc = locations[0].name;
        }
      } else if (locations.length > 0) {
        defaultLoc = locations[0].name;
      }
      return defaultLoc;
    };

    const combined = [...selectedManual, ...selectedAuto].map(item => {
      const product = item.product_id ? products.find(p => p.id === item.product_id) : null;
      const catName = product ? product.category : null;
      
      // Determine the default child/active product
      let selectedProduct = product;
      if (product && product.is_parent === 1) {
        // Find children of this parent
        const children = products.filter(p => p.parent_product_id === product.id);
        if (children.length > 0) {
          selectedProduct = children[0];
        }
      }
      
      const defaultQty = selectedProduct 
        ? calculateDefaultPurchaseQty(item.amount, item.unit, selectedProduct) 
        : (parseFloat(item.amount) || 1);

      return {
        product_id: selectedProduct ? selectedProduct.id : (item.product_id || ''),
        name: selectedProduct ? selectedProduct.name : item.product_name,
        // The original shopping list details
        original_product_id: item.product_id || null,
        original_name: item.product_name,
        original_amount: item.amount,
        original_unit: item.unit,
        // The purchase details
        quantity: defaultQty,
        price: '',
        expiration_date: '',
        storage_location: getDefaultStorageLocation(catName),
        list_item_id: item.id
      };
    });

    if (combined.length === 0) {
      showToast('Please check at least one item to purchase.', 'warning');
      return;
    }

    setCheckoutItems(combined);
    setGlobalStore('');
    setGlobalStorage(locations.length > 0 ? locations[0].name : 'Pantry');
    setShowCheckoutModal(true);
  };

  const handleCheckoutFieldChange = (idx, field, value) => {
    const updated = [...checkoutItems];
    updated[idx][field] = value;
    setCheckoutItems(updated);
  };

  const handleCheckoutProductChange = (idx, newProductId) => {
    const updated = [...checkoutItems];
    const targetProduct = newProductId ? products.find(p => p.id === parseInt(newProductId, 10)) : null;
    
    updated[idx].product_id = targetProduct ? targetProduct.id : '';
    updated[idx].name = targetProduct ? targetProduct.name : updated[idx].original_name;
    
    const newQty = targetProduct 
      ? calculateDefaultPurchaseQty(updated[idx].original_amount, updated[idx].original_unit, targetProduct)
      : (parseFloat(updated[idx].original_amount) || 1);
    updated[idx].quantity = newQty;
    
    setCheckoutItems(updated);
  };

  const handleRegisteredProductAtCheckout = (newProduct, shouldClose = true) => {
    setProducts(prev => [...prev, newProduct]);
    if (registeringForItemIdx !== null) {
      handleCheckoutProductChange(registeringForItemIdx, newProduct.id);
    }
    if (shouldClose) {
      setRegisteringForItemIdx(null);
      setPrefilledParentIdForRegister(null);
      setPrefilledCategoryForRegister('Pantry');
      setShowRegisterModal(false);
    }
  };

  const handleGlobalStorageChange = (val) => {
    setGlobalStorage(val);
    setCheckoutItems(prev => prev.map(item => ({
      ...item,
      storage_location: val
    })));
  };

  // Complete purchase
  const handleCompleteCheckout = async (e) => {
    e.preventDefault();

    // Map checkout items with global store/storage values if individual ones aren't set
    const payloadItems = checkoutItems.map(item => ({
      product_id: item.product_id ? parseInt(item.product_id, 10) : null,
      quantity: parseFloat(item.quantity) || 1,
      price: item.price ? parseFloat(item.price) : null,
      store_location: globalStore || null,
      storage_location: item.storage_location || globalStorage,
      expiration_date: item.expiration_date || null,
      list_item_id: item.list_item_id
    }));

    try {
      const res = await fetch('/api/shopping-list/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payloadItems })
      });
      if (res.ok) {
        setShowCheckoutModal(false);
        setSelectedItems({});
        fetchShoppingListAndProducts();
        showToast('Items checked out! Inventory updated.', 'success');
      } else {
        const err = await res.json();
        showToast(`Error completing purchase: ${err.error}`, 'error');
      }
    } catch (error) {
      console.error('Error checking out items:', error);
    }
  };

  const allSelectedIds = [...manualList, ...autoList].map(i => i.id);
  const isAllChecked = allSelectedIds.length > 0 && allSelectedIds.every(id => selectedItems[id]);

  const handleSelectAll = () => {
    if (isAllChecked) {
      setSelectedItems({});
    } else {
      const nextSelected = {};
      allSelectedIds.forEach(id => {
        nextSelected[id] = true;
      });
      setSelectedItems(nextSelected);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Shopping <span className="text-glow font-bold">List</span>
          </h1>
          <p className="text-slate-400 mt-1">Combine dynamic stock minimums with manual overrides to auto-compile lists.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95"
          >
            <Plus className="h-4.5 w-4.5 text-indigo-400" /> Add Custom Item
          </button>
          <button 
            onClick={handleOpenCheckout}
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-indigo px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95 hover:opacity-90"
          >
            <ShoppingCart className="h-4.5 w-4.5" /> Purchase Checked
          </button>
        </div>
      </div>

      {/* Main List panels */}
      {loading ? (
        <div className="flex h-48 justify-center items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        </div>
      ) : (manualList.length === 0 && autoList.length === 0) ? (
        <div className="glass-panel p-12 text-center rounded-2xl flex flex-col items-center">
          <ShoppingCart className="h-16 w-16 opacity-30 text-slate-400 mb-4" />
          <h3 className="text-xl font-bold text-white">Shopping List Empty</h3>
          <p className="text-slate-500 mt-1">Stock levels are healthy and no manual items are added.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* List Toolbar */}
          <div className="glass-panel p-3.5 rounded-xl flex items-center justify-between text-xs text-slate-400 font-semibold">
            <button 
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300"
            >
              {isAllChecked ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
              {isAllChecked ? 'Uncheck All' : 'Check All Items'}
            </button>
            <span>
              Selected Items: <strong className="text-white">{Object.values(selectedItems).filter(Boolean).length}</strong>
            </span>
          </div>

          {/* Auto Stock shortages list */}
          {autoList.length > 0 && (
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
                <ShoppingCart className="h-5 w-5 text-indigo-400 animate-pulse" />
                Auto-Generated Stock Depletions
              </h3>

              <div className="divide-y divide-slate-800/60 space-y-3">
                {autoList.map(item => (
                  <div 
                    key={item.id}
                    onClick={() => handleToggleSelect(item.id, item)}
                    className="flex justify-between items-center py-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-indigo-400">
                        {selectedItems[item.id] ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-white text-sm block group-hover:text-indigo-300 transition-colors">
                          {item.product_name}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Info className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                          {item.notes}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                        Shortage: {item.amount % 1 === 0 ? item.amount : Number(item.amount.toFixed(2))} {item.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual lists */}
          {manualList.length > 0 && (
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
                <Plus className="h-5 w-5 text-indigo-400" />
                Custom Shopping Additions
              </h3>

              <div className="divide-y divide-slate-800/60 space-y-3">
                {manualList.map(item => (
                  <div 
                    key={item.id}
                    onClick={() => handleToggleSelect(item.id, item)}
                    className="flex justify-between items-center py-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-indigo-400">
                        {selectedItems[item.id] ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-white text-sm flex items-center gap-1.5 flex-wrap group-hover:text-indigo-300 transition-colors">
                          <span>{item.product_name}</span>
                          {item.product_brand && <span className="text-xs text-slate-400 font-normal">({item.product_brand})</span>}
                          {!item.product_id && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/25 text-indigo-300">
                              Custom
                            </span>
                          )}
                        </span>
                        {item.notes && (
                          <span className="text-xs text-slate-500 block mt-0.5">{item.notes}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-4">
                      <span className="text-xs font-bold text-white bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
                        Qty: {item.amount} {item.unit}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // prevent checking selection
                          handleDeleteManualItem(item.id);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/20"
                        title="Delete Item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Custom Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl glass-panel p-6 space-y-4 my-8 relative animate-scale-up">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-400" />
              Add Shopping Item
            </h2>

            <form onSubmit={handleAddManualItem} className="space-y-4 text-xs text-slate-200">
              {/* Mode Selector */}
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Item Source</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950/60 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAddMode('custom')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      addMode === 'custom' 
                        ? 'bg-gradient-indigo text-white shadow-md' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
                    }`}
                  >
                    Custom / Temp Item
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode('catalog')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      addMode === 'catalog' 
                        ? 'bg-gradient-indigo text-white shadow-md' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
                    }`}
                  >
                    From Product Catalog
                  </button>
                </div>
              </div>

              {addMode === 'custom' ? (
                <div className="space-y-1.5">
                  <label className="block text-slate-400 font-semibold">Item Name *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Paper Towels, Sliced Bread, Foil, Bananas"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input text-white font-medium"
                    required
                    autoFocus
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-slate-400 font-semibold">Select Registered Product *</label>
                  <select 
                    value={productId} 
                    onChange={(e) => {
                      const id = e.target.value;
                      setProductId(id);
                      if (id) {
                        const selected = products.find(p => p.id === parseInt(id, 10));
                        if (selected && selected.default_unit) {
                          setUnit(selected.default_unit);
                        }
                      }
                    }}
                    className="w-full p-2.5 rounded-lg glass-input bg-slate-900"
                    required
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.brand ? `(${p.brand})` : ''} {p.is_parent ? ' (Parent)' : ''}
                      </option>
                    ))}
                  </select>
                  {products.length === 0 && (
                    <span className="text-[11px] text-amber-400 block mt-1">
                      No registered products found. Switch to "Custom / Temp Item" to add items without registering.
                    </span>
                  )}
                </div>
              )}

              {/* Amount & Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-slate-400 font-semibold">Amount *</label>
                  <input 
                    type="number" 
                    step="any"
                    placeholder="e.g. 2"
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input"
                    min="0.01"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-slate-400 font-semibold">Unit *</label>
                  <select 
                    value={unit} 
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input bg-slate-900"
                    required
                  >
                    <option value="pieces">pieces</option>
                    <option value="pack">pack</option>
                    <option value="box">box</option>
                    <option value="bottle">bottle</option>
                    <option value="can">can</option>
                    <option value="bag">bag</option>
                    <option value="g">grams (g)</option>
                    <option value="kg">kilograms (kg)</option>
                    <option value="oz">ounces (oz)</option>
                    <option value="lb">pounds (lb)</option>
                    <option value="ml">milliliters (ml)</option>
                    <option value="l">liters (l)</option>
                    <option value="fl_oz">fluid ounces (fl_oz)</option>
                    <option value="cup">cup</option>
                    <option value="tbsp">tablespoon (tbsp)</option>
                    <option value="tsp">teaspoon (tsp)</option>
                    <option value="servings">servings</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Notes</label>
                <input 
                  type="text" 
                  placeholder="e.g. Buy store brand if organic is unavailable"
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex items-center gap-1 px-5 py-2 rounded-lg bg-gradient-indigo text-white font-semibold shadow-lg hover:opacity-90 cursor-pointer"
                >
                  <Check className="h-4 w-4" /> Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Checkout Modal Panel */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl glass-panel p-6 space-y-4 my-8 relative animate-scale-up">
            <button 
              onClick={() => setShowCheckoutModal(false)}
              className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
              <ShoppingBag className="h-5 w-5 text-indigo-400" />
              Complete Grocery Purchase Checkout
            </h2>

            <form onSubmit={handleCompleteCheckout} className="space-y-4 text-xs text-slate-200">
              {/* Global Store and Storage */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <div className="space-y-1.5">
                  <label className="block text-slate-400 font-semibold flex items-center gap-1">
                    <Store className="h-4 w-4" /> Store Location Purchased From
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. Costco, Walmart, Aldi"
                    value={globalStore}
                    onChange={(e) => setGlobalStore(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-slate-400 font-semibold">
                    Global Storage Destination
                  </label>
                  <select 
                    value={globalStorage} 
                    onChange={(e) => handleGlobalStorageChange(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input bg-slate-950"
                  >
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.name}>{loc.name}</option>
                    ))}
                    {locations.length === 0 && <option value="Pantry">Pantry</option>}
                  </select>
                </div>
              </div>

              {/* Items Detail Grid */}
              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                <h4 className="font-bold text-white text-xs text-left">Fill details for each package bought</h4>
                {checkoutItems.map((item, idx) => {
                  const originalProduct = item.original_product_id ? products.find(p => p.id === item.original_product_id) : null;
                  const groupParentId = originalProduct ? (originalProduct.parent_product_id || originalProduct.id) : null;
                  const alternatives = groupParentId 
                    ? products.filter(p => p.id === groupParentId || p.parent_product_id === groupParentId) 
                    : products;
                  
                  const targetProduct = item.product_id ? products.find(p => p.id === item.product_id) : null;
                  
                  let unitLabel = 'packages';
                  if (targetProduct) {
                    if (targetProduct.is_parent === 1) {
                      unitLabel = targetProduct.default_unit || 'pieces';
                    } else {
                      unitLabel = getPluralPackageType(targetProduct.package_type);
                    }
                  } else {
                    unitLabel = item.original_unit || 'pieces';
                  }

                  return (
                    <div key={idx} className="glass-card p-3 rounded-lg border border-slate-850 space-y-2.5 text-left">
                      <div className="flex justify-between items-center font-bold text-slate-400 text-xs">
                        <span>List request: <strong className="text-white">{item.original_name}</strong> ({item.original_amount} {item.original_unit})</span>
                        {!targetProduct && (
                          <span className="text-[10px] text-amber-400 font-normal">
                            Not added to inventory
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1 col-span-2">
                          <label className="block text-slate-500 font-medium">Brand/Product Purchased</label>
                          <select
                            value={item.product_id || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__register_new__') {
                                setRegisteringForItemIdx(idx);
                                setPrefilledParentIdForRegister(groupParentId);
                                setPrefilledCategoryForRegister(originalProduct?.category || 'Pantry');
                                setShowRegisterModal(true);
                              } else if (val === '') {
                                handleCheckoutProductChange(idx, '');
                              } else {
                                handleCheckoutProductChange(idx, parseInt(val, 10));
                              }
                            }}
                            className="w-full p-2 rounded glass-input bg-slate-950 font-semibold text-xs text-white"
                          >
                            {!item.original_product_id && (
                              <option value="">-- Temporary Item (Do Not Track in Inventory) --</option>
                            )}
                            {alternatives.map(alt => (
                              <option key={alt.id} value={alt.id}>
                                {alt.name} {alt.brand ? `(${alt.brand})` : ''} {alt.is_parent ? ' (Parent Category)' : ''}
                              </option>
                            ))}
                            <option value="__register_new__" className="text-indigo-400 font-bold">
                              + Register New Brand / Product...
                            </option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-slate-500 font-medium">Qty Bought ({unitLabel})</label>
                          <input 
                            type="number" 
                            step="any"
                            value={item.quantity} 
                            onChange={(e) => handleCheckoutFieldChange(idx, 'quantity', e.target.value)}
                            className="w-full p-2 rounded glass-input text-center font-semibold text-white"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-slate-500 font-medium">Price Paid ($)</label>
                          <input 
                            type="number" 
                            step="any"
                            placeholder="ea"
                            value={item.price} 
                            onChange={(e) => handleCheckoutFieldChange(idx, 'price', e.target.value)}
                            className="w-full p-2 rounded glass-input text-center font-semibold text-white"
                            min="0"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-slate-500 font-medium">Expiration Date</label>
                          <input 
                            type="date" 
                            value={item.expiration_date} 
                            onChange={(e) => handleCheckoutFieldChange(idx, 'expiration_date', e.target.value)}
                            className="w-full p-2 rounded glass-input text-center text-xs text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-slate-500 font-medium">Storage Destination</label>
                          <select 
                            value={item.storage_location || ''} 
                            onChange={(e) => handleCheckoutFieldChange(idx, 'storage_location', e.target.value)}
                            className="w-full p-2 rounded glass-input bg-slate-950 font-semibold text-xs text-white"
                            required
                          >
                            {locations.map(loc => (
                              <option key={loc.id} value={loc.name}>{loc.name}</option>
                            ))}
                            {locations.length === 0 && <option value="Pantry">Pantry</option>}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button 
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-gradient-emerald text-white font-bold shadow-lg hover:opacity-90 transition-opacity"
                >
                  <Check className="h-4.5 w-4.5" /> Log Purchased Items
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ProductModal
        isOpen={showRegisterModal}
        onClose={() => {
          setShowRegisterModal(false);
          setRegisteringForItemIdx(null);
        }}
        onSave={handleRegisteredProductAtCheckout}
        categories={categories}
        parentProducts={products.filter(p => p.is_parent === 1 || !p.parent_product_id)}
        prefilledParentProductId={prefilledParentIdForRegister}
        prefilledCategory={prefilledCategoryForRegister}
      />
    </div>
  );
}
