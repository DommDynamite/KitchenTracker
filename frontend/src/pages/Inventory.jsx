import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Sliders, Calendar, Trash2, Check, X,
  ShoppingBag, Archive, HelpCircle, ThermometerSun, AlertTriangle, RotateCw,
  LayoutGrid, List, Edit2, Package, ChevronDown
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import InventoryModal from '../components/InventoryModal';
import { useToast } from '../context/ToastContext';

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

function formatStock(remainingServings, originalServings, productUnit, servingSize, servingUnit) {
  if (productUnit === '%') {
    return `${remainingServings.toFixed(0)}%`;
  }

  const normUnit = normalizeUnit(servingUnit || productUnit);
  const isPhysical = PHYSICAL_UNITS.has(normUnit);

  if (isPhysical && servingSize && servingSize > 0) {
    const remainingPhysical = remainingServings * servingSize;
    const originalPhysical = originalServings * servingSize;

    const f = (val) => {
      if (val % 1 === 0) return val.toFixed(0);
      return val.toFixed(1);
    };

    return `${f(remainingPhysical)}${normUnit} / ${f(originalPhysical)}${normUnit} (${remainingServings.toFixed(1)} / ${originalServings.toFixed(0)} srv)`;
  }

  return `${remainingServings.toFixed(1)} / ${originalServings.toFixed(0)} srv`;
}

function formatStockCompact(remainingServings, originalServings, productUnit, servingSize, servingUnit) {
  if (productUnit === '%') {
    return `${remainingServings.toFixed(0)}%`;
  }

  const normUnit = normalizeUnit(servingUnit || productUnit);
  const isPhysical = PHYSICAL_UNITS.has(normUnit);

  if (isPhysical && servingSize && servingSize > 0) {
    const remainingPhysical = remainingServings * servingSize;
    const originalPhysical = originalServings * servingSize;

    const f = (val) => {
      if (val % 1 === 0) return val.toFixed(0);
      return val.toFixed(1);
    };

    return `${f(remainingPhysical)}${normUnit}/${f(originalPhysical)}${normUnit} (${remainingServings.toFixed(1)}/${originalServings.toFixed(0)} srv)`;
  }

  return `${remainingServings.toFixed(1)}/${originalServings.toFixed(0)} srv`;
}

export default function Inventory() {
  const { showToast } = useToast();
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [preselectedProductId, setPreselectedProductId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [filterExpiringSoon, setFilterExpiringSoon] = useState(false);
  const [locDropdownOpen, setLocDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('kitchen_inventory_view_mode') || 'grid';
  });
  const [consumeAmounts, setConsumeAmounts] = useState({}); // { itemId: val }

  useEffect(() => {
    localStorage.setItem('kitchen_inventory_view_mode', viewMode);
  }, [viewMode]);

  // Edit Modal State (Grouped)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editRemainingServings, setEditRemainingServings] = useState(1);
  const [editStorageLocation, setEditStorageLocation] = useState('Pantry');
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [storeSuggestions, setStoreSuggestions] = useState([]);
  const [locations, setLocations] = useState([]);

  const [categories, setCategories] = useState([]);

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

  const fetchLocations = async () => {
    try {
      const res = await fetch('/api/locations');
      if (res.ok) {
        const data = await res.json();
        setLocations(data);
        if (data.length > 0) {
          const hasPantry = data.find(l => l.name.toLowerCase() === 'pantry');
          const defaultLoc = hasPantry ? hasPantry.name : data[0].name;
          setEditStorageLocation(defaultLoc);
        }
      }
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };
  const toggleLocation = (locName) => {
    if (locName === 'All') {
      setSelectedLocations([]);
      return;
    }
    setSelectedLocations(prev => {
      if (prev.includes(locName)) {
        return prev.filter(l => l !== locName);
      } else {
        return [...prev, locName];
      }
    });
  };
  const fetchInventoryAndProducts = async () => {
    setLoading(true);
    try {
      const invRes = await fetch('/api/inventory');
      const invData = await invRes.json();
      setInventory(invData);

      // Initialize default consume amounts by product_id
      const initialAmounts = {};
      invData.forEach(item => {
        if (!initialAmounts[item.product_id]) {
          initialAmounts[item.product_id] = item.default_consumption !== undefined ? item.default_consumption : 1.0;
        }
      });
      setConsumeAmounts(initialAmounts);

      const prodRes = await fetch('/api/products');
      const prodData = await prodRes.json();
      setProducts(prodData);
      return invData;
    } catch (error) {
      console.error('Error fetching inventory details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/inventory/stores');
      if (res.ok) {
        const data = await res.json();
        setStoreSuggestions(data);
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err);
    }
  };

  useEffect(() => {
    fetchInventoryAndProducts();
    fetchStores();
    fetchLocations();
    fetchCategories();
  }, []);

  const handleOpenAdd = () => {
    setShowModal(true);
  };

  const handleInventorySaved = () => {
    fetchInventoryAndProducts();
    fetchStores();
  };

  // Consume servings quick-click (product level FIFO)
  const handleGroupConsume = async (productId, servings) => {
    try {
      const res = await fetch(`/api/inventory/product/${productId}/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servings })
      });
      if (res.ok) {
        fetchInventoryAndProducts();
      } else {
        const err = await res.json();
        showToast(`Error consuming portion: ${err.error}`, 'error');
      }
    } catch (error) {
      console.error('Error consuming portion:', error);
    }
  };

  // Portions adjustment helper
  const handleAmountChange = (productId, val) => {
    setConsumeAmounts(prev => ({
      ...prev,
      [productId]: val
    }));
  };

  const handleDeleteItem = async (id) => {
    setDeleteConfirm({
      message: 'Delete this package log? (It will be removed entirely, not marked as consumed)',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/inventory/${id}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            setShowEditModal(false);
            setEditingGroup(null);
            setSelectedPackage(null);
            fetchInventoryAndProducts();
          }
        } catch (error) {
          console.error('Error deleting inventory item:', error);
        }
      }
    });
  };

  const handleOpenEdit = (group) => {
    setEditingGroup(group);
    // Auto-select the first package
    const firstItem = group.items[0] || null;
    selectPackageForEditing(firstItem);
    setShowEditModal(true);
  };

  const selectPackageForEditing = (pkg) => {
    setSelectedPackage(pkg);
    if (pkg) {
      setEditQuantity(pkg.quantity);
      setEditRemainingServings(pkg.remaining_servings);
      const hasPantry = locations.find(l => l.name.toLowerCase() === 'pantry');
      const defaultLoc = hasPantry ? hasPantry.name : (locations[0] ? locations[0].name : 'Pantry');
      setEditStorageLocation(pkg.storage_location || defaultLoc);
      setEditExpirationDate(pkg.expiration_date || '');
    } else {
      setEditQuantity(1);
      setEditRemainingServings(0);
      const hasPantry = locations.find(l => l.name.toLowerCase() === 'pantry');
      const defaultLoc = hasPantry ? hasPantry.name : (locations[0] ? locations[0].name : 'Pantry');
      setEditStorageLocation(defaultLoc);
      setEditExpirationDate('');
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!selectedPackage) return;

    const payload = {
      quantity: parseFloat(editQuantity),
      remaining_servings: parseFloat(editRemainingServings),
      storage_location: editStorageLocation,
      expiration_date: editExpirationDate || null
    };

    try {
      const res = await fetch(`/api/inventory/${selectedPackage.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowEditModal(false);
        setEditingGroup(null);
        setSelectedPackage(null);
        fetchInventoryAndProducts();
      } else {
        const err = await res.json();
        showToast(`Error updating item: ${err.error}`, 'error');
      }
    } catch (error) {
      console.error('Error saving manual inventory edit:', error);
    }
  };

  const handleConsumePackage = async (packageId) => {
    if (!selectedPackage) return;
    
    const payload = {
      quantity: parseFloat(editQuantity),
      remaining_servings: 0,
      storage_location: editStorageLocation,
      expiration_date: editExpirationDate || null
    };

    try {
      const res = await fetch(`/api/inventory/${packageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Package consumed!', 'success');
        fetchInventoryAndProducts();
      } else {
        const err = await res.json();
        showToast(`Error consuming package: ${err.error}`, 'error');
      }
    } catch (error) {
      console.error('Error consuming package:', error);
    }
  };

  // Filter criteria
  const today = new Date();
  today.setHours(0,0,0,0);

  const getUrgency = (expiryStr) => {
    if (!expiryStr) return 'safe';
    const expDate = new Date(expiryStr);
    expDate.setHours(0,0,0,0);
    const diff = expDate - today;
    const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'expired';
    if (diffDays <= 3) return 'danger';
    if (diffDays <= 7) return 'warning';
    return 'safe';
  };

  const getGroupSoonestExpiry = (items) => {
    let soonest = null;
    items.forEach(item => {
      const eff = getEffectiveExpiry(item);
      if (eff) {
        if (!soonest || eff < soonest) {
          soonest = eff;
        }
      }
    });
    return soonest;
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

  const filteredInventory = inventory.filter(item => {
    const product = products.find(p => p.id == item.product_id);
    const parentProduct = item.parent_product_id ? products.find(p => p.id == item.parent_product_id) : null;

    const searchTargets = [
      item.product_name,
      item.product_brand,
      item.store_location,
      item.product_category,
      product?.name,
      product?.brand,
      product?.category,
      parentProduct?.name,
      parentProduct?.brand,
      parentProduct?.category
    ].filter(Boolean);

    const matchSearch = !searchQuery.trim() || searchTargets.some(target => matchSearchText(target, searchQuery));

    const matchLocation = selectedLocations.length === 0 || 
      selectedLocations.includes(item.storage_location);

    const matchExpiringSoon = !filterExpiringSoon || getUrgency(getEffectiveExpiry(item)) !== 'safe';

    return matchSearch && matchLocation && matchExpiringSoon;
  });

  const groupedInventory = [];
  const groups = {};

  filteredInventory.forEach(item => {
    const groupId = item.parent_product_id || item.product_id;
    if (!groups[groupId]) {
      const parentProduct = item.parent_product_id ? products.find(p => p.id == item.parent_product_id) : null;

      groups[groupId] = {
        product_id: groupId,
        product_name: parentProduct ? parentProduct.name : item.product_name,
        product_brand: parentProduct ? (parentProduct.brand || '') : (item.product_brand || ''),
        product_image: parentProduct ? parentProduct.image_path : item.product_image,
        product_category: parentProduct ? parentProduct.category : item.product_category,
        product_unit: parentProduct ? parentProduct.default_unit : item.product_unit,
        servings_per_package: parentProduct ? parentProduct.servings_per_package : item.servings_per_package,
        serving_size: parentProduct ? parentProduct.serving_size : item.serving_size,
        serving_unit: parentProduct ? parentProduct.serving_unit : item.serving_unit,
        default_consumption: parentProduct ? parentProduct.default_consumption : item.default_consumption,
        use_by_days_after_opening: parentProduct ? parentProduct.use_by_days_after_opening : item.use_by_days_after_opening,
        package_count: 0,
        total_remaining_servings: 0,
        total_original_servings: 0,
        total_price: 0,
        storage_locations: new Set(),
        items: []
      };
      groupedInventory.push(groups[groupId]);
    }
    const g = groups[groupId];
    g.package_count += item.quantity;
    g.total_remaining_servings += item.remaining_servings;
    g.total_original_servings += item.original_servings;
    if (item.price) {
      g.total_price += item.price;
    }
    if (item.storage_location) {
      g.storage_locations.add(item.storage_location);
    }
    g.items.push(item);
  });

  // Resolve group properties (images and parent product inherited fields) after grouping is complete
  groupedInventory.forEach(g => {
    const groupProduct = products.find(p => p.id == g.product_id);
    
    // 1. Sort active inventory items (opened first, then oldest expiration/purchase date)
    let activeItemForInheritance = null;
    if (g.items.length > 0) {
      const sortedItems = [...g.items].sort((a, b) => {
        if (a.status === 'opened' && b.status !== 'opened') return -1;
        if (a.status !== 'opened' && b.status === 'opened') return 1;
        const aExp = getEffectiveExpiry(a);
        const bExp = getEffectiveExpiry(b);
        if (!aExp && bExp) return 1;
        if (aExp && !bExp) return -1;
        if (aExp && bExp) {
          return aExp < bExp ? -1 : aExp > bExp ? 1 : 0;
        }
        return a.purchase_date < b.purchase_date ? -1 : a.purchase_date > b.purchase_date ? 1 : 0;
      });
      activeItemForInheritance = sortedItems[0];

      // Resolve product image fallback
      if (groupProduct && groupProduct.image_path) {
        g.product_image = groupProduct.image_path;
      } else {
        const itemWithImage = sortedItems.find(item => item.product_image);
        if (itemWithImage) {
          g.product_image = itemWithImage.product_image;
        } else {
          const childProducts = products.filter(p => p.parent_product_id == g.product_id);
          const childWithImage = childProducts.find(p => p.image_path);
          g.product_image = childWithImage ? childWithImage.image_path : null;
        }
      }
    } else {
      g.product_image = groupProduct ? groupProduct.image_path : null;
    }

    // 2. If it is a parent product, inherit servings/calories/shelf life from active child item,
    // or fallback to registry child products.
    if (groupProduct && groupProduct.is_parent === 1) {
      let source = null;
      if (activeItemForInheritance) {
        // Find registry child product matching the active item's product_id
        source = products.find(p => p.id == activeItemForInheritance.product_id);
      }
      
      if (!source) {
        const childProducts = products.filter(p => p.parent_product_id == g.product_id);
        source = childProducts.find(c => (c.serving_size > 0 && c.serving_size !== 1.0) || c.calories_per_serving !== null) || childProducts[0];
      }

      if (source) {
        g.servings_per_package = source.servings_per_package;
        g.serving_size = source.serving_size;
        g.serving_unit = source.serving_unit;
        g.calories_per_serving = source.calories_per_serving;
        g.use_by_days_after_opening = source.use_by_days_after_opening;
        g.default_consumption = source.default_consumption;
      }
    }
  });

  // Keep editingGroup updated when inventory changes (e.g., after adding/deleting packages)
  useEffect(() => {
    if (showEditModal && editingGroup) {
      const freshGroup = groupedInventory.find(g => g.product_id === editingGroup.product_id);
      if (freshGroup) {
        setEditingGroup(freshGroup);
        if (selectedPackage) {
          const freshPkg = freshGroup.items.find(item => item.id === selectedPackage.id);
          if (freshPkg) {
            setSelectedPackage(freshPkg);
          } else {
            // Selected package was deleted, select first item
            const firstItem = freshGroup.items[0] || null;
            setSelectedPackage(firstItem);
            if (firstItem) {
              setEditQuantity(firstItem.quantity);
              setEditRemainingServings(firstItem.remaining_servings);
              setEditStorageLocation(firstItem.storage_location || 'Pantry');
              setEditExpirationDate(firstItem.expiration_date || '');
            }
          }
        }
      } else {
        // Group is gone
        setShowEditModal(false);
        setEditingGroup(null);
        setSelectedPackage(null);
      }
    }
  }, [inventory]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Kitchen <span className="text-glow font-bold">Inventory</span>
          </h1>
          <p className="text-slate-400 mt-1">Manage active packages, consume servings, and check expiry warning statuses.</p>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-indigo px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95 hover:opacity-90"
        >
          <Plus className="h-4.5 w-4.5" /> Log Purchase
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between glass-panel p-4 rounded-xl">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filter by product name, brand, store..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg glass-input text-sm"
          />
        </div>
        
        {/* Location & View Mode Filters */}
        <div className="flex flex-wrap gap-4 items-center justify-between w-full md:w-auto">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Dynamic Multi-select Location Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setLocDropdownOpen(!locDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-900/50 text-xs font-semibold text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
              >
                <Sliders className="h-3.5 w-3.5 text-indigo-400" />
                <span>
                  {selectedLocations.length === 0 
                    ? 'All Locations' 
                    : selectedLocations.length === 1 
                      ? selectedLocations[0] 
                      : `${selectedLocations.length} Locations`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-0.5" />
              </button>

              {locDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setLocDropdownOpen(false)} />
                  <div className="absolute left-0 mt-1.5 w-56 rounded-xl border border-slate-800 bg-slate-950/95 backdrop-blur-md p-2 shadow-2xl z-20 space-y-0.5 animate-scale-up">
                    <div className="flex justify-between items-center px-2 py-1.5 border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                      <span>Filter Locations</span>
                      {selectedLocations.length > 0 && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedLocations([]); }}
                          className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                      {['All', ...locations.map(l => l.name)].map(loc => {
                        const isChecked = loc === 'All'
                          ? selectedLocations.length === 0
                          : selectedLocations.includes(loc);
                        return (
                          <button
                            key={loc}
                            onClick={() => toggleLocation(loc)}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-left transition-colors text-slate-200 cursor-pointer text-xs"
                          >
                            <span className="truncate">{loc}</span>
                            {isChecked && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Expiring Soon Toggle */}
            <button
              onClick={() => setFilterExpiringSoon(!filterExpiringSoon)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                filterExpiringSoon 
                  ? 'bg-rose-500/25 border-rose-500/50 text-rose-350 shadow-[0_0_10px_rgba(244,63,94,0.15)]' 
                  : 'glass-input text-slate-355 hover:border-slate-500 hover:text-white'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Expiring Soon</span>
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Inventory Grid */}
      {loading ? (
        <div className="flex h-48 justify-center items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        </div>
      ) : groupedInventory.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-2xl flex flex-col items-center">
          <h3 className="text-xl font-bold text-white">No Items in Stock</h3>
          <p className="text-slate-500 mt-1">Adjust filters or click "Log Purchase" to load food into your stock.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW LAYOUT */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groupedInventory.map(group => {
            const soonestExpiry = getGroupSoonestExpiry(group.items);
            const urgency = getUrgency(soonestExpiry);
            const percentage = group.total_original_servings > 0 
              ? (group.total_remaining_servings / group.total_original_servings) * 100 
              : 0;

            const displayedImage = group.product_image;
            
            // Border color based on urgency
            let borderClass = 'border-slate-800/80';
            let alertBadge = null;
            if (urgency === 'expired') {
              borderClass = 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.1)]';
              alertBadge = (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="h-3 w-3" /> Expired
                </span>
              );
            } else if (urgency === 'danger') {
              borderClass = 'border-rose-400/30';
              alertBadge = (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-400/20">
                  Expiring Soon
                </span>
              );
            } else if (urgency === 'warning') {
              borderClass = 'border-amber-500/30';
              alertBadge = (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Expires soon
                </span>
              );
            }

            const currentConsumeAmount = consumeAmounts[group.product_id] !== undefined 
              ? consumeAmounts[group.product_id] 
              : (group.default_consumption || 1.0);

            // Check if any package is opened
            const hasOpenedPackage = group.items.some(item => item.status === 'opened');

            return (
              <div 
                key={group.product_id} 
                className={`glass-panel rounded-2xl p-5 flex flex-col justify-between border ${borderClass} relative overflow-hidden`}
              >
                {/* Image Preview watermark */}
                {displayedImage && (
                  <div className="absolute right-0 top-0 w-24 h-24 opacity-20 pointer-events-none select-none">
                    <img src={displayedImage} alt="" className="w-full h-full object-cover rounded-bl-full" />
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded">
                      {Array.from(group.storage_locations).join(', ') || 'Unspecified'}
                    </span>
                    <div className="flex gap-1.5">
                      {alertBadge}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-850 text-slate-300 border border-slate-700/50">
                        {group.package_count} package{group.package_count !== 1 ? 's' : ''}
                      </span>
                      {hasOpenedPackage && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          Opened
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white mt-3 truncate" title={group.product_name}>
                    {group.product_name}
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    {group.product_brand || 'Generic Brand'}
                  </p>

                  <div className="grid grid-cols-2 gap-2 mt-4 text-[11px] text-slate-400">
                    <div>
                      <span className="text-slate-500 block">Soonest Expiration</span>
                      <span className="text-white font-medium flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {soonestExpiry || 'No Expiry'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Category</span>
                      <span className="text-white font-medium">{group.product_category || 'Pantry'}</span>
                    </div>
                  </div>

                  {/* Servings visual bar & buttons */}
                  <div className="mt-5 space-y-2.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-400">Portions Remaining</span>
                      <span className="text-glow font-bold">
                        {formatStock(
                          group.total_remaining_servings,
                          group.total_original_servings,
                          group.product_unit,
                          group.serving_size,
                          group.serving_unit
                        )}
                      </span>
                    </div>
                    
                    {/* Visual Bar */}
                    <div className="w-full h-2 rounded bg-slate-800 overflow-hidden">
                      <div 
                        className={`h-full rounded transition-all duration-300 ${
                          percentage < 25 ? 'bg-rose-500' : percentage < 50 ? 'bg-amber-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>

                    {/* Typed portions consumption panel */}
                    <div className="flex items-center gap-2 pt-2 justify-between">
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                        <button 
                          type="button"
                          onClick={() => {
                            const val = parseFloat(currentConsumeAmount);
                            const step = group.product_unit === '%' ? 25 : 0.5;
                            handleAmountChange(group.product_id, Math.max(group.product_unit === '%' ? 25 : 0.1, val - step).toFixed(group.product_unit === '%' ? 0 : 1));
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold"
                        >
                          -
                        </button>
                        <input 
                          type="number"
                          step="any"
                          min="0.1"
                          value={currentConsumeAmount}
                          onChange={(e) => handleAmountChange(group.product_id, e.target.value)}
                          className="w-12 text-center text-xs font-semibold bg-transparent border-none outline-none text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const val = parseFloat(currentConsumeAmount);
                            const step = group.product_unit === '%' ? 25 : 0.5;
                            handleAmountChange(group.product_id, (val + step).toFixed(group.product_unit === '%' ? 0 : 1));
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const amt = parseFloat(currentConsumeAmount) || 1.0;
                          handleGroupConsume(group.product_id, amt);
                        }}
                        className="flex-1 py-1.5 px-3 rounded bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-xs font-bold text-white transition-all text-center border border-indigo-500/20"
                      >
                        Consume
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer and Price / Edit */}
                <div className="flex justify-between items-center mt-6 pt-3 border-t border-slate-800/60 text-xs">
                  <span className="text-slate-500 font-medium">
                    {group.total_price > 0 ? `Paid: $${group.total_price.toFixed(2)}` : 'No Price Logged'}
                  </span>
                  
                  <button 
                    onClick={() => handleOpenEdit(group)}
                    className="p-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-indigo-950/20 transition-colors"
                    title="Manage Product Packages"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* COMPACT LIST VIEW LAYOUT */
        <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="p-4">Product</th>
                  <th className="p-4">Locations</th>
                  <th className="p-4">Soonest Expiration</th>
                  <th className="p-4">Packages</th>
                  <th className="p-4">Remaining Servings</th>
                  <th className="p-4 text-center">Consume Action</th>
                  <th className="p-4 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {groupedInventory.map(group => {
                  const soonestExpiry = getGroupSoonestExpiry(group.items);
                  const urgency = getUrgency(soonestExpiry);
                  const percentage = group.total_original_servings > 0 
                    ? (group.total_remaining_servings / group.total_original_servings) * 100 
                    : 0;

                  const displayedImage = group.product_image;
                  
                  let alertColor = 'text-slate-300';
                  if (urgency === 'expired') alertColor = 'text-rose-400 font-bold';
                  else if (urgency === 'danger') alertColor = 'text-rose-300';
                  else if (urgency === 'warning') alertColor = 'text-amber-300';

                  const currentConsumeAmount = consumeAmounts[group.product_id] !== undefined 
                    ? consumeAmounts[group.product_id] 
                    : (group.default_consumption || 1.0);

                  return (
                    <tr key={group.product_id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {displayedImage ? (
                            <img src={displayedImage} alt="" className="h-10 w-10 object-cover rounded-lg border border-slate-800 shrink-0" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-center shrink-0">
                              <Package className="h-5 w-5 text-slate-500" />
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-white block text-sm">{group.product_name}</span>
                            <span className="text-slate-400 text-[10px]">{group.product_brand || 'Generic'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-300">
                          {Array.from(group.storage_locations).join(', ') || 'Unspecified'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={alertColor}>{soonestExpiry || 'No Expiry'}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-white font-semibold">{group.package_count}</span>
                      </td>
                      <td className="p-4 min-w-[120px]">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <div className="w-16 h-1.5 rounded bg-slate-800 overflow-hidden shrink-0">
                            <div 
                              className={`h-full rounded ${percentage < 25 ? 'bg-rose-500' : percentage < 50 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          <span className="font-semibold text-white">
                            {formatStockCompact(
                              group.total_remaining_servings,
                              group.total_original_servings,
                              group.product_unit,
                              group.serving_size,
                              group.serving_unit
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                           <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md p-1">
                             <button 
                               type="button" 
                               onClick={() => {
                                 const val = parseFloat(currentConsumeAmount);
                                 const step = group.product_unit === '%' ? 25 : 0.5;
                                 handleAmountChange(group.product_id, Math.max(group.product_unit === '%' ? 25 : 0.1, val - step).toFixed(group.product_unit === '%' ? 0 : 1));
                               }}
                               className="px-1.5 py-0.5 rounded bg-slate-850 hover:bg-slate-700 text-white text-[10px] font-bold animate-active"
                             >
                               -
                             </button>
                             <input 
                               type="number"
                               step="any"
                               min="0.1"
                               value={currentConsumeAmount}
                               onChange={(e) => handleAmountChange(group.product_id, e.target.value)}
                               className="w-10 text-center text-[10px] font-semibold bg-transparent outline-none border-none text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                             />
                             <button 
                               type="button" 
                               onClick={() => {
                                 const val = parseFloat(currentConsumeAmount);
                                 const step = group.product_unit === '%' ? 25 : 0.5;
                                 handleAmountChange(group.product_id, (val + step).toFixed(group.product_unit === '%' ? 0 : 1));
                               }}
                               className="px-1.5 py-0.5 rounded bg-slate-850 hover:bg-slate-700 text-white text-[10px] font-bold"
                             >
                               +
                             </button>
                           </div>
                          <button
                            type="button"
                            onClick={() => {
                              const amt = parseFloat(currentConsumeAmount) || 1.0;
                              handleGroupConsume(group.product_id, amt);
                            }}
                            className="py-1 px-3 rounded bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold text-white transition-all active:scale-95 text-center"
                          >
                            Consume
                          </button>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => handleOpenEdit(group)}
                          className="p-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-indigo-950/20 transition-colors"
                          title="Manage Group Packages"
                        >
                          <Edit2 className="h-4.5 w-4.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InventoryModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setPreselectedProductId(null);
        }}
        onSave={handleInventorySaved}
        preselectedProductId={preselectedProductId}
        products={products}
        locations={locations}
        categories={categories}
        storeSuggestions={storeSuggestions}
      />

      {/* Edit Inventory Item Modal */}
      {showEditModal && editingGroup && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl glass-panel p-6 space-y-6 my-8 relative animate-scale-up">
            <button 
              onClick={() => {
                setShowEditModal(false);
                setEditingGroup(null);
                setSelectedPackage(null);
              }}
              className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sliders className="h-5 w-5 text-indigo-400" />
              Manage Inventory Packages
            </h2>

            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-850 text-xs">
              <span className="text-slate-500 font-semibold block">Product Group</span>
              <strong className="text-white text-base">{editingGroup.product_name}</strong>
              <span className="text-slate-400 block mt-0.5">{editingGroup.product_brand || 'Generic Brand'}</span>
            </div>

            {/* Packages Sub-table */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Package to Edit</h3>
                <button
                  type="button"
                  onClick={() => {
                    setPreselectedProductId(editingGroup.product_id);
                    setShowModal(true);
                  }}
                  className="flex items-center gap-1 py-1.5 px-3 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold text-[10px] transition-colors border border-indigo-500/20 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Package
                </button>
              </div>
              <div className="border border-slate-800 rounded-xl overflow-hidden max-h-[180px] overflow-y-auto bg-slate-950/40">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-bold uppercase">
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Servings</th>
                      <th className="p-2.5">Storage</th>
                      <th className="p-2.5">Effective Expiry</th>
                      <th className="p-2.5 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {editingGroup.items.map((item, idx) => {
                      const isSelected = selectedPackage && selectedPackage.id === item.id;
                      const effExpiry = getEffectiveExpiry(item);
                      const urgency = getUrgency(effExpiry);
                      
                      let expiryColor = 'text-slate-300';
                      if (urgency === 'expired') expiryColor = 'text-rose-400 font-bold';
                      else if (urgency === 'danger') expiryColor = 'text-rose-300';
                      else if (urgency === 'warning') expiryColor = 'text-amber-300';

                      return (
                        <tr 
                          key={item.id} 
                          onClick={() => selectPackageForEditing(item)}
                          className={`cursor-pointer hover:bg-slate-900/40 transition-colors ${
                            isSelected ? 'bg-indigo-600/10' : ''
                          }`}
                        >
                          <td className="p-2.5">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold w-fit ${
                                item.status === 'opened' 
                                  ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                              }`}>
                                {item.status === 'opened' ? 'Opened' : 'Unopened'}
                              </span>
                              {item.product_brand && item.product_brand !== editingGroup.product_brand && (
                                <span className="text-[9px] text-slate-400 font-medium truncate max-w-[120px]" title={item.product_name}>
                                  {item.product_brand}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 font-medium text-white">
                            {formatStock(
                              item.remaining_servings,
                              item.original_servings,
                              editingGroup.product_unit,
                              editingGroup.serving_size,
                              editingGroup.serving_unit
                            )}
                          </td>
                          <td className="p-2.5 text-slate-300">{item.storage_location}</td>
                          <td className={`p-2.5 ${expiryColor}`}>{effExpiry || 'No Expiry'}</td>
                          <td className="p-2.5 text-right text-slate-400">
                            {item.price ? `$${item.price.toFixed(2)}` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedPackage && (
              <form onSubmit={handleSaveEdit} className="space-y-4 text-xs text-slate-200 border-t border-slate-800 pt-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                    Edit Package Details
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ID: {selectedPackage.id} • Purchased: {selectedPackage.purchase_date}
                  </span>
                </div>

                <div className="bg-indigo-950/20 p-3 rounded-xl border border-indigo-500/10 text-xs flex items-center gap-3">
                  {selectedPackage.product_image ? (
                    <img src={selectedPackage.product_image} alt="" className="h-12 w-12 object-cover rounded-lg border border-slate-800 shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg border border-slate-850 bg-slate-950 flex items-center justify-center shrink-0">
                      <Package className="h-6 w-6 text-slate-600" />
                    </div>
                  )}
                  <div>
                    <strong className="text-white text-sm block truncate max-w-[400px]" title={selectedPackage.product_name}>
                      {selectedPackage.product_name}
                    </strong>
                    {selectedPackage.product_brand && (
                      <span className="text-slate-400 block mt-0.5">Brand: {selectedPackage.product_brand}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Servings Remaining */}
                  {editingGroup.product_unit === '%' ? (
                    <div className="space-y-1.5 col-span-2">
                      <label className="block text-slate-400 font-semibold">Percentage Remaining</label>
                      <div className="grid grid-cols-5 gap-1.5 pt-1">
                        {[100, 75, 50, 25, 0].map(pct => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setEditRemainingServings(pct)}
                            className={`py-2 text-center rounded-lg border font-bold transition-all text-xs cursor-pointer ${
                              parseFloat(editRemainingServings) === pct
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                                : 'glass-input text-slate-350 hover:border-slate-500'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-500 block mt-1">Eyeball estimation of remaining vegetable</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 col-span-2">
                      <label className="block text-slate-400 font-semibold">Servings Remaining</label>
                      <input 
                        type="number" 
                        step="any"
                        value={editRemainingServings} 
                        onChange={(e) => setEditRemainingServings(e.target.value)}
                        className="w-full p-2.5 rounded-lg glass-input text-center font-bold text-white text-xs"
                        min="0"
                        required
                      />
                      <div className="flex flex-col gap-0.5 mt-1 text-[10px]">
                        <span className="text-slate-500">
                          Max: {((parseFloat(editQuantity) || 1) * (editingGroup.servings_per_package || 1)).toFixed(1)} servings
                          {PHYSICAL_UNITS.has(normalizeUnit(editingGroup.serving_unit || editingGroup.product_unit)) && editingGroup.serving_size > 0 && 
                            ` (${((parseFloat(editQuantity) || 1) * (editingGroup.servings_per_package || 1) * editingGroup.serving_size).toFixed(1)}${normalizeUnit(editingGroup.serving_unit || editingGroup.product_unit)})`
                          }
                        </span>
                        {PHYSICAL_UNITS.has(normalizeUnit(editingGroup.serving_unit || editingGroup.product_unit)) && editingGroup.serving_size > 0 && (
                          <span className="text-indigo-400 font-medium">
                            Equivalent: {((parseFloat(editRemainingServings) || 0) * editingGroup.serving_size).toFixed(1)}{normalizeUnit(editingGroup.serving_unit || editingGroup.product_unit)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Location & Expiry */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-400 font-semibold">Storage Location</label>
                    <select 
                      value={editStorageLocation} 
                      onChange={(e) => setEditStorageLocation(e.target.value)}
                      className="w-full p-2.5 rounded-lg glass-input bg-slate-900"
                    >
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.name}>{loc.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-400 font-semibold">Printed Expiration Date</label>
                    <input 
                      type="date" 
                      value={editExpirationDate} 
                      onChange={(e) => setEditExpirationDate(e.target.value)}
                      className="w-full p-2.5 rounded-lg glass-input text-center text-white"
                    />
                  </div>
                </div>

                {/* Save/Remove actions */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => {
                        handleDeleteItem(selectedPackage.id);
                      }}
                      className="px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 text-rose-400 font-bold text-xs cursor-pointer transition-colors"
                    >
                      Remove Package
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleConsumePackage(selectedPackage.id)}
                      className="px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 text-amber-400 font-bold text-xs cursor-pointer transition-colors"
                    >
                      Consume Package
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingGroup(null);
                        setSelectedPackage(null);
                      }}
                      className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex items-center gap-1 px-5 py-2 rounded-lg bg-gradient-indigo text-white font-semibold shadow-lg hover:opacity-90 transition-opacity"
                    >
                      <Check className="h-4 w-4" /> Save Changes
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}



      <ConfirmModal 
        isOpen={!!deleteConfirm}
        title="Delete Package"
        message={deleteConfirm?.message}
        onConfirm={() => {
          deleteConfirm?.onConfirm();
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
