import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Tag, 
  Layers, Package, Check, X, Upload, Camera, Database,
  Eye, EyeOff
} from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [parentProducts, setParentProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showChildProducts, setShowChildProducts] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [parentProductId, setParentProductId] = useState('');
  const [isParent, setIsParent] = useState(false);
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('Pantry');
  const [defaultUnit, setDefaultUnit] = useState('pieces');
  const [servingsPerPackage, setServingsPerPackage] = useState(1);
  const [servingSize, setServingSize] = useState(1);
  const [servingUnit, setServingUnit] = useState('pieces');
  const [minimumStock, setMinimumStock] = useState(0);
  const [defaultConsumption, setDefaultConsumption] = useState(1.0);
  const [imagePath, setImagePath] = useState('');
  const [uploading, setUploading] = useState(false);
  const [useByDaysAfterOpening, setUseByDaysAfterOpening] = useState('');
  const [packageType, setPackageType] = useState('package');
  const [caloriesPerServing, setCaloriesPerServing] = useState('');

  // Smart Package Content and Calorie form states
  const [capacityValue, setCapacityValue] = useState(1);
  const [capacityUnit, setCapacityUnit] = useState('pieces');
  const [calorieMode, setCalorieMode] = useState('per_unit');
  const [caloriesValue, setCaloriesValue] = useState('');
  const [hasCustomServing, setHasCustomServing] = useState(false);
  const [servingSizeValue, setServingSizeValue] = useState(1);

  const getTrackingUnitOptions = () => {
    const options = [];
    if (capacityUnit) {
      options.push({ value: capacityUnit, label: `${capacityUnit} (physical units)` });
    }
    const pkgPlural = getPluralPackageType(packageType);
    if (pkgPlural && pkgPlural !== capacityUnit) {
      options.push({ value: pkgPlural, label: `${pkgPlural} (package units)` });
    }
    return options;
  };

  useEffect(() => {
    const opts = getTrackingUnitOptions().map(o => o.value);
    if (opts.length > 0 && !opts.includes(defaultUnit)) {
      setDefaultUnit(opts[0]);
    }
  }, [capacityUnit, packageType]);

  useEffect(() => {
    if (capacityUnit === '%') {
      setCapacityValue(100);
    }
  }, [capacityUnit]);

  const getPluralPackageType = (type) => {
    if (!type) return 'packages';
    const t = type.toLowerCase();
    if (t === 'package') return 'packages';
    if (t === 'box') return 'boxes';
    if (t === 'pouch') return 'pouches';
    if (t === 'jar') return 'jars';
    return `${t}s`;
  };

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

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setBarcode('');
    setParentProductId('');
    setIsParent(true);
    setBrand('');
    setCategory('Pantry');
    setDefaultUnit('pieces');
    setServingsPerPackage(1);
    setServingSize(1);
    setServingUnit('pieces');
    setMinimumStock(0);
    setDefaultConsumption(1.0);
    setUseByDaysAfterOpening('');
    setPackageType('package');
    setCaloriesPerServing('');
    setImagePath('');

    // Smart Package Content and Calorie form states
    setCapacityValue(1);
    setCapacityUnit('pieces');
    setCalorieMode('per_unit');
    setCaloriesValue('');
    setHasCustomServing(false);
    setServingSizeValue(1);

    setShowModal(true);
  };

  const handleOpenEdit = (prod) => {
    setEditingProduct(prod);
    setName(prod.name);
    setBarcode(prod.barcode || '');
    setParentProductId(prod.parent_product_id || '');
    setIsParent(!prod.parent_product_id && prod.minimum_stock > 0);
    setBrand(prod.brand || '');
    setCategory(prod.category || 'Pantry');
    setDefaultUnit(prod.default_unit);
    setServingsPerPackage(prod.servings_per_package);
    setServingSize(prod.serving_size);
    setServingUnit(prod.serving_unit);
    setMinimumStock(prod.minimum_stock || 0);
    setDefaultConsumption(prod.default_consumption || 1.0);
    setUseByDaysAfterOpening(prod.use_by_days_after_opening || '');
    setPackageType(prod.package_type || 'package');
    setCaloriesPerServing(prod.calories_per_serving !== null && prod.calories_per_serving !== undefined ? prod.calories_per_serving : '');
    setImagePath(prod.image_path || '');

    // Reconstruct UI States from DB values
    const sUnit = prod.serving_unit || prod.default_unit || 'pieces';
    const sSize = prod.serving_size || 1.0;
    const sPkg = prod.servings_per_package || 1.0;
    
    const capVal = Math.round((sPkg * sSize) * 1000) / 1000;
    setCapacityValue(capVal);
    setCapacityUnit(sUnit);
    
    const cal = prod.calories_per_serving !== null && prod.calories_per_serving !== undefined ? prod.calories_per_serving : '';
    setCaloriesValue(cal);
    
    // Determine hasCustomServing and calorieMode
    if (sSize === 1.0) {
      setHasCustomServing(false);
      setCalorieMode('per_unit');
      setServingSizeValue(1);
    } else if (sSize === 100.0 && (sUnit === 'g' || sUnit === 'ml' || sUnit === 'fl_oz')) {
      setHasCustomServing(false);
      setCalorieMode('per_100');
      setServingSizeValue(100);
    } else if (sPkg === 1.0 && sSize === capVal) {
      setHasCustomServing(false);
      setCalorieMode('per_package');
      setServingSizeValue(capVal);
    } else {
      setHasCustomServing(true);
      setCalorieMode('per_serving');
      setServingSizeValue(sSize);
    }

    setShowModal(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.imageUrl) {
        setImagePath(data.imageUrl);
      }
    } catch (error) {
      console.error('Image upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product? This will also remove any related inventory items.')) return;
    
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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !defaultUnit) {
      alert('Product Name and Default Unit are required.');
      return;
    }

    // Calculate DB fields from UI states
    let sUnit = capacityUnit;
    let sSize = 1.0;
    let sPkg = 1.0;
    let calPerSrv = caloriesValue !== '' ? parseInt(caloriesValue, 10) : null;

    const capVal = parseFloat(capacityValue) || 1.0;

    if (hasCustomServing) {
      sSize = parseFloat(servingSizeValue) || 1.0;
      sPkg = capVal / sSize;
    } else {
      if (calorieMode === 'per_unit') {
        sSize = 1.0;
        sPkg = capVal;
      } else if (calorieMode === 'per_100') {
        sSize = 100.0;
        sPkg = capVal / 100.0;
      } else if (calorieMode === 'per_package') {
        sSize = capVal;
        sPkg = 1.0;
      }
    }

    const payload = {
      name,
      barcode: barcode || null,
      parent_product_id: isParent ? null : (parentProductId || null),
      brand,
      category,
      default_unit: defaultUnit,
      servings_per_package: sPkg,
      serving_size: sSize,
      serving_unit: sUnit,
      minimum_stock: (isParent || !parentProductId) ? (parseFloat(minimumStock) || 0) : 0,
      default_consumption: parseFloat(defaultConsumption) || 1.0,
      use_by_days_after_opening: useByDaysAfterOpening ? parseInt(useByDaysAfterOpening, 10) : null,
      image_path: imagePath || null,
      package_type: packageType || 'package',
      calories_per_serving: calPerSrv
    };

    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowModal(false);
        fetchProducts();
      } else {
        const errData = await res.json();
        alert(`Error saving product: ${errData.error}`);
      }
    } catch (error) {
      console.error('Error saving product:', error);
    }
  };

  // Filter products based on search and child product setting
  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.barcode && p.barcode.includes(searchQuery));
      
    const matchChild = showChildProducts || !p.parent_product_id;
    
    return matchSearch && matchChild;
  });

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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map(prod => (
            <div key={prod.id} className="glass-panel rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group">
              {/* Image Preview background or banner */}
              {prod.image_path && (
                <div className="absolute right-0 top-0 w-24 h-24 opacity-20 pointer-events-none">
                  <img src={prod.image_path} alt="" className="w-full h-full object-cover rounded-bl-full" />
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
      )}

      {/* Edit / Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl glass-panel p-6 space-y-4 my-8 relative animate-scale-up">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-400" />
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm text-slate-200">
              {/* Product Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Product Name *</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input text-slate-100"
                  placeholder="e.g. Organic Whole Milk 0.5 Gal"
                  required
                />
              </div>

              {/* Barcode & Brand */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">Barcode</label>
                  <input 
                    type="text" 
                    value={barcode} 
                    onChange={(e) => setBarcode(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input"
                    placeholder="Scan or type barcode"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">Brand</label>
                  <input 
                    type="text" 
                    value={brand} 
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input"
                    placeholder="e.g. Horizon Organic"
                  />
                </div>
              </div>

              {/* Category & Package Type */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">Category</label>
                  <select 
                    value={category} 
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input bg-slate-900"
                  >
                    <option value="Dairy">Dairy</option>
                    <option value="Produce">Produce</option>
                    <option value="Meat & Seafood">Meat & Seafood</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Pantry">Pantry</option>
                    <option value="Frozen">Frozen</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">Package Type</label>
                  <select 
                    value={packageType} 
                    onChange={(e) => setPackageType(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input bg-slate-900"
                  >
                    <option value="package">Package (generic)</option>
                    <option value="tub">Tub</option>
                    <option value="pack">Pack</option>
                    <option value="carton">Carton</option>
                    <option value="can">Can</option>
                    <option value="bottle">Bottle</option>
                    <option value="jar">Jar</option>
                    <option value="box">Box</option>
                    <option value="bag">Bag</option>
                    <option value="tin">Tin</option>
                    <option value="pouch">Pouch</option>
                    <option value="roll">Roll</option>
                    <option value="container">Container</option>
                  </select>
                </div>
              </div>

              {/* Product Role Checkbox */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Product Role</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input 
                      type="checkbox" 
                      checked={isParent} 
                      onChange={(e) => {
                        setIsParent(e.target.checked);
                        if (e.target.checked) setParentProductId('');
                      }}
                      className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                    />
                    Is Parent/Category Product
                  </label>
                </div>
              </div>

              {/* Parent Product Selector (only if not IsParent) */}
              {!isParent && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">Parent Category Product</label>
                  <select 
                    value={parentProductId} 
                    onChange={(e) => setParentProductId(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input bg-slate-900"
                  >
                    <option value="">-- None (Standalone Product) --</option>
                    {parentProducts
                      .filter(p => !editingProduct || p.id !== editingProduct.id)
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))
                    }
                  </select>
                  <span className="text-[11px] text-slate-500 block">
                    Choose a parent product so this brand counts towards the same inventory minimum stock.
                  </span>
                </div>
              )}

              {/* Package Content & Capacity Configuration */}
              <div className="p-4 rounded-xl border border-indigo-500/10 bg-indigo-950/5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">Package Size & Contents</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400 font-medium">
                      One <span className="capitalize text-white">{packageType}</span> contains:
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        step="any"
                        value={capacityValue} 
                        onChange={(e) => setCapacityValue(e.target.value)}
                        className="w-full p-2.5 rounded-lg glass-input text-center font-semibold disabled:opacity-60"
                        placeholder="e.g. 500 or 12"
                        min="0.01"
                        required
                        disabled={capacityUnit === '%'}
                      />
                      <select 
                        value={capacityUnit} 
                        onChange={(e) => setCapacityUnit(e.target.value)}
                        className="p-2.5 rounded-lg glass-input bg-slate-900 w-32 font-semibold"
                      >
                        <option value="pieces">pieces</option>
                        <option value="g">g (grams)</option>
                        <option value="ml">ml (milliliters)</option>
                        <option value="fl_oz">fl_oz (fl. oz.)</option>
                        <option value="servings">servings</option>
                        <option value="%">% (percentage)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400">Track Inventory By:</label>
                    <select 
                      value={defaultUnit} 
                      onChange={(e) => setDefaultUnit(e.target.value)}
                      className="w-full p-2.5 rounded-lg glass-input bg-slate-900 font-semibold"
                      required
                    >
                      {getTrackingUnitOptions().map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Servings & Calories Configuration */}
              <div className="p-4 rounded-xl border border-indigo-500/10 bg-indigo-950/5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">Servings & Calories</h3>
                
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input 
                      type="checkbox" 
                      checked={hasCustomServing} 
                      onChange={(e) => setHasCustomServing(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                    />
                    This product has a custom serving size (e.g. nutrition label serves 30g out of a 500g tub)
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {hasCustomServing ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-400">Serving Size</label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              step="any"
                              value={servingSizeValue} 
                              onChange={(e) => setServingSizeValue(e.target.value)}
                              className="w-full p-2.5 rounded-lg glass-input text-center font-semibold"
                              placeholder="e.g. 30"
                              min="0.01"
                              required
                            />
                            <span className="text-sm text-slate-400 w-16 text-left">{capacityUnit}</span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-400">Calories per Serving (kcal)</label>
                          <input 
                            type="number" 
                            value={caloriesValue} 
                            onChange={(e) => setCaloriesValue(e.target.value)}
                            className="w-full p-2.5 rounded-lg glass-input font-semibold"
                            placeholder="e.g. 120 (Optional)"
                            min="0"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-400 font-medium">Calories Specified Per:</label>
                          <select 
                            value={calorieMode} 
                            onChange={(e) => setCalorieMode(e.target.value)}
                            className="w-full p-2.5 rounded-lg glass-input bg-slate-900 font-semibold"
                          >
                            <option value="per_unit">1 {capacityUnit === 'pieces' ? 'piece' : capacityUnit === 'servings' ? 'serving' : capacityUnit}</option>
                            {(capacityUnit === 'g' || capacityUnit === 'ml' || capacityUnit === 'fl_oz') && (
                              <option value="per_100">100 {capacityUnit}</option>
                            )}
                            <option value="per_package">Entire {packageType} ({capacityValue} {capacityUnit})</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-400">Calories (kcal)</label>
                          <input 
                            type="number" 
                            value={caloriesValue} 
                            onChange={(e) => setCaloriesValue(e.target.value)}
                            className="w-full p-2.5 rounded-lg glass-input font-semibold"
                            placeholder="e.g. 150 (Optional)"
                            min="0"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Minimum Stock Level (only if it is a parent, or standalone) */}
              {(isParent || !parentProductId) && (
                <div className="space-y-1.5 bg-indigo-950/20 p-3 rounded-lg border border-indigo-500/10">
                  <label className="block text-xs font-semibold text-indigo-300">
                    Inventory Minimum Alert Threshold (in {defaultUnit})
                  </label>
                  <input 
                    type="number" 
                    step="any"
                    value={minimumStock} 
                    onChange={(e) => setMinimumStock(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input"
                    min="0"
                    placeholder="e.g. 1000"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">
                    When remaining stock of this product (and all child brands) drops below this number, it auto-appears on the shopping list. Set to 0 to disable.
                  </span>
                </div>
              )}

              {/* Default Consumption Servings */}
              <div className="space-y-1.5 bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300">
                  Default Consumption Servings
                </label>
                <input 
                  type="number" 
                  step="any"
                  value={defaultConsumption} 
                  onChange={(e) => setDefaultConsumption(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input"
                  min="0.1"
                  placeholder="e.g. 1.0"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  How many servings you typically consume at a time. The Inventory page will pre-fill its consumption field to this.
                </span>
              </div>

              {/* Use-by Shelf Life After Opening */}
              <div className="space-y-1.5 bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300">
                  Use-by Shelf Life After Opening (Days)
                </label>
                <input 
                  type="number" 
                  step="1"
                  value={useByDaysAfterOpening} 
                  onChange={(e) => setUseByDaysAfterOpening(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input"
                  min="1"
                  placeholder="e.g. 5 (Optional)"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Shelf life in days once opened. Enables early expiration warnings for opened packages. Leave blank to disable.
                </span>
              </div>

              {/* Image Upload */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Product Photo</label>
                <div className="flex gap-4 items-center">
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2 rounded-lg text-xs transition-colors">
                    <Upload className="h-4 w-4" />
                    {uploading ? 'Uploading...' : 'Choose File'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                  {imagePath && (
                    <div className="flex items-center gap-2">
                      <img src={imagePath} alt="Upload preview" className="h-10 w-10 object-cover rounded-lg border border-slate-700" />
                      <button 
                        type="button" 
                        onClick={() => setImagePath('')}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex items-center gap-1 px-5 py-2 rounded-lg bg-gradient-indigo text-white text-xs font-semibold shadow-lg hover:opacity-90 transition-opacity"
                >
                  <Check className="h-4 w-4" /> Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
