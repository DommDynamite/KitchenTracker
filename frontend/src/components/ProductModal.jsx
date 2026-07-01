import React, { useState, useEffect } from 'react';
import { X, Upload, Check, Layers, Package, Database } from 'lucide-react';
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

export default function ProductModal({
  isOpen,
  onClose,
  onSave,
  editingProduct = null,
  prefilledBarcode = '',
  categories = [],
  parentProducts = [],
  prefilledParentProductId = '',
  prefilledCategory = '',
  prefilledName = '',
  prefilledBrand = '',
  isSpiceMode = false
}) {
  const { showToast } = useToast();
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
  const [useByDaysAfterOpening, setUseByDaysAfterOpening] = useState('');
  const [packageType, setPackageType] = useState('package');
  const [imagePath, setImagePath] = useState('');
  
  // Spice reorder settings
  const [spiceReorderPercentage, setSpiceReorderPercentage] = useState(20);
  
  // Smart Package Content and Calorie form states
  const [capacityValue, setCapacityValue] = useState(1);
  const [capacityUnit, setCapacityUnit] = useState('pieces');
  const [calorieMode, setCalorieMode] = useState('per_unit');
  const [caloriesValue, setCaloriesValue] = useState('');
  const [hasCustomServing, setHasCustomServing] = useState(false);
  const [servingsPerPackageValue, setServingsPerPackageValue] = useState(1);
  const [servingSizeValue, setServingSizeValue] = useState(1);
  const [uploading, setUploading] = useState(false);

  const getPluralPackageType = (type) => {
    if (!type) return 'packages';
    const t = type.toLowerCase();
    if (t === 'package') return 'packages';
    if (t === 'box') return 'boxes';
    if (t === 'pouch') return 'pouches';
    if (t === 'jar') return 'jars';
    return `${t}s`;
  };

  const getTrackingUnitOptions = () => {
    const options = [];
    if (isParent) {
      options.push({ value: 'pieces', label: 'pieces (physical units)' });
      const pkgPlural = getPluralPackageType(packageType);
      options.push({ value: pkgPlural, label: `${pkgPlural} (package units)` });
    } else {
      if (capacityUnit) {
        options.push({ value: capacityUnit, label: `${capacityUnit} (physical units)` });
      }
      const pkgPlural = getPluralPackageType(packageType);
      if (pkgPlural && pkgPlural !== capacityUnit) {
        options.push({ value: pkgPlural, label: `${pkgPlural} (package units)` });
      }
    }
    return options;
  };

  useEffect(() => {
    const opts = getTrackingUnitOptions().map(o => o.value);
    if (opts.length > 0 && !opts.includes(defaultUnit)) {
      setDefaultUnit(opts[0]);
    }
  }, [capacityUnit, packageType, isParent]);

  useEffect(() => {
    if (capacityUnit === '%') {
      setCapacityValue(100);
    }
  }, [capacityUnit]);

  useEffect(() => {
    if (isOpen) {
      if (editingProduct) {
        setName(editingProduct.name || '');
        setBarcode(editingProduct.barcode || '');
        setParentProductId(editingProduct.parent_product_id || '');
        setIsParent(editingProduct.is_parent == 1);
        setBrand(editingProduct.brand || '');
        setCategory(editingProduct.category || (isSpiceMode ? 'Spices' : 'Pantry'));
        setDefaultUnit(editingProduct.default_unit || (isSpiceMode ? 'g' : 'pieces'));
        setServingsPerPackage(editingProduct.servings_per_package || 1);
        setServingSize(editingProduct.serving_size || 1);
        setServingUnit(editingProduct.serving_unit || (isSpiceMode ? 'g' : 'pieces'));
        setMinimumStock(editingProduct.minimum_stock || 0);
        setDefaultConsumption(editingProduct.default_consumption || 1.0);
        setUseByDaysAfterOpening(editingProduct.use_by_days_after_opening || '');
        setPackageType(editingProduct.package_type || (isSpiceMode ? 'jar' : 'package'));
        setImagePath(editingProduct.image_path || '');
        setSpiceReorderPercentage(editingProduct.spice_reorder_percentage !== undefined && editingProduct.spice_reorder_percentage !== null ? editingProduct.spice_reorder_percentage : 20);

        const sUnit = editingProduct.serving_unit || editingProduct.default_unit || (isSpiceMode ? 'g' : 'pieces');
        const sSize = editingProduct.serving_size || 1.0;
        const sPkg = editingProduct.servings_per_package || 1.0;
        
        const capVal = Math.round((sPkg * sSize) * 1000) / 1000;
        setCapacityValue(capVal);
        setCapacityUnit(sUnit);

        const cal = editingProduct.calories_per_serving !== null && editingProduct.calories_per_serving !== undefined ? editingProduct.calories_per_serving : '';
        setCaloriesValue(cal);
        
        if (sSize === 1.0) {
          setHasCustomServing(false);
          setCalorieMode('per_unit');
          setServingSizeValue(1);
          setServingsPerPackageValue(sPkg);
        } else if (sSize === 100.0 && (sUnit === 'g' || sUnit === 'ml' || sUnit === 'fl_oz')) {
          setHasCustomServing(false);
          setCalorieMode('per_100');
          setServingSizeValue(100);
          setServingsPerPackageValue(sPkg);
        } else if (sPkg === 1.0 && sSize === capVal) {
          setHasCustomServing(false);
          setCalorieMode('per_package');
          setServingSizeValue(capVal);
          setServingsPerPackageValue(1);
        } else {
          setHasCustomServing(true);
          setCalorieMode('per_serving');
          setServingSizeValue(sSize);
          setServingsPerPackageValue(sPkg);
        }
      } else {
        setName(prefilledName || '');
        setBarcode(prefilledBarcode || '');
        setParentProductId(prefilledParentProductId || '');
        setIsParent(false);
        setBrand(prefilledBrand || '');
        if (isSpiceMode) {
          setCategory('Spices');
        } else if (prefilledCategory) {
          setCategory(prefilledCategory);
        } else if (categories.length > 0) {
          const pantryCat = categories.find(c => c.name.toLowerCase() === 'pantry');
          setCategory(pantryCat ? pantryCat.name : categories[0].name);
        } else {
          setCategory('Pantry');
        }
        setDefaultUnit(isSpiceMode ? 'g' : 'pieces');
        setServingsPerPackage(1);
        setServingSize(1);
        setServingUnit(isSpiceMode ? 'g' : 'pieces');
        setMinimumStock(0);
        setDefaultConsumption(1.0);
        setUseByDaysAfterOpening('');
        setPackageType(isSpiceMode ? 'jar' : 'package');
        setImagePath('');

        setCapacityValue(isSpiceMode ? 100 : 1);
        setCapacityUnit(isSpiceMode ? 'g' : 'pieces');
        setCalorieMode('per_unit');
        setCaloriesValue('');
        setHasCustomServing(false);
        setServingSizeValue(1);
        setServingsPerPackageValue(1);
        setSpiceReorderPercentage(20);
      }
    }
  }, [isOpen, editingProduct, prefilledBarcode, categories, prefilledParentProductId, prefilledCategory, prefilledName, prefilledBrand, isSpiceMode]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !defaultUnit) {
      showToast('Product Name and Default Unit are required.', 'warning');
      return;
    }

    let sUnit = capacityUnit;
    let sSize = 1.0;
    let sPkg = 1.0;
    let calPerSrv = null;

    if (isParent) {
      sUnit = defaultUnit;
      sSize = 1.0;
      sPkg = 1.0;
      calPerSrv = null;
    } else {
      const capVal = parseFloat(capacityValue) || 1.0;
      if (hasCustomServing) {
        sPkg = parseFloat(servingsPerPackageValue) || 1.0;
        sSize = capVal / sPkg;
        sUnit = capacityUnit;
      } else {
        if (calorieMode === 'per_unit') {
          sSize = 1.0;
          sPkg = capVal;
        } else if (calorieMode === 'per_100') {
          sSize = 100.0;
          sPkg = capVal / 100.0;
          sUnit = capacityUnit;
        } else if (calorieMode === 'per_package') {
          sSize = capVal;
          sPkg = 1.0;
          sUnit = capacityUnit;
        }
      }

      if (caloriesValue !== '') {
        const rawCal = parseInt(caloriesValue, 10);
        if (hasCustomServing && calorieMode === 'per_serving') {
          calPerSrv = rawCal;
        } else if (calorieMode === 'per_unit') {
          calPerSrv = rawCal * sSize;
        } else if (calorieMode === 'per_100') {
          calPerSrv = (rawCal / 100.0) * sSize;
        } else if (calorieMode === 'per_package') {
          calPerSrv = rawCal / sPkg;
        } else {
          calPerSrv = rawCal;
        }
      }
    }

    const payload = {
      name,
      barcode: barcode || null,
      parent_product_id: isParent ? null : (parentProductId || null),
      brand: brand || null,
      category,
      default_unit: isSpiceMode ? capacityUnit : defaultUnit,
      servings_per_package: isSpiceMode ? 1.0 : sPkg,
      serving_size: isSpiceMode ? capacityValue : sSize,
      serving_unit: isSpiceMode ? capacityUnit : sUnit,
      minimum_stock: isSpiceMode ? 0 : ((isParent || !parentProductId) ? (parseFloat(minimumStock) || 0) : 0),
      default_consumption: isSpiceMode ? 1.0 : (parseFloat(defaultConsumption) || 1.0),
      use_by_days_after_opening: isParent ? null : (useByDaysAfterOpening ? parseInt(useByDaysAfterOpening, 10) : null),
      image_path: imagePath || null,
      package_type: packageType || (isSpiceMode ? 'jar' : 'package'),
      calories_per_serving: isSpiceMode ? null : calPerSrv,
      is_parent: isParent ? 1 : 0,
      is_spice: isSpiceMode ? 1 : (editingProduct ? (editingProduct.is_spice || 0) : 0),
      spice_reorder_percentage: isSpiceMode ? (parseFloat(spiceReorderPercentage) || 20.0) : (editingProduct ? (editingProduct.spice_reorder_percentage || 20.0) : 20.0)
    };

    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        onSave({ id: editingProduct ? editingProduct.id : data.id, ...payload });
        onClose();
        showToast('Product saved successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to save product', 'error');
      }
    } catch (error) {
      console.error('Error saving product:', error);
      showToast('Network error saving product', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl glass-panel p-6 space-y-4 my-8 relative animate-scale-up text-left">
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Database className="h-5 w-5 text-indigo-400" />
          {editingProduct ? 'Edit Product Details' : 'Register New Product'}
        </h2>

        <form 
          onSubmit={handleSubmit} 
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
              e.preventDefault();
            }
          }}
          className="space-y-4 text-xs text-slate-200"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <label className="block text-slate-400 font-semibold">Product Name *</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input text-slate-100 font-bold"
                placeholder="e.g. Horizon Organic Whole Milk half gallon"
                required
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold">Barcode</label>
              <input 
                type="text" 
                value={barcode} 
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input"
                placeholder="Scan or type barcode"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold">Brand</label>
              <input 
                type="text" 
                value={brand} 
                onChange={(e) => setBrand(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input"
                placeholder="e.g. Horizon Organic"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold">Category</label>
              <select 
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input bg-slate-900"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
                {categories.length === 0 && (
                  <>
                    <option value="Dairy">Dairy</option>
                    <option value="Produce">Produce</option>
                    <option value="Meat & Seafood">Meat & Seafood</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Pantry">Pantry</option>
                    <option value="Frozen">Frozen</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Other">Other</option>
                  </>
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold">Package Type</label>
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

          <div className="space-y-1.5">
            <label className="block text-slate-400 font-semibold">Product Role</label>
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

          {!isParent && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="block text-slate-400 font-semibold">
                {isSpiceMode ? 'Parent Spice Category' : 'Parent Category Product'}
              </label>
              <select 
                value={parentProductId} 
                onChange={(e) => setParentProductId(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input bg-slate-900"
              >
                <option value="">-- None (Standalone Product) --</option>
                {parentProducts
                  .filter(p => (!editingProduct || p.id !== editingProduct.id) && (isSpiceMode ? p.is_spice == 1 : (p.is_spice == 0 || p.is_spice === null)))
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))
                }
              </select>
              <span className="text-[11px] text-slate-500 block">
                {isSpiceMode 
                  ? 'Choose a parent spice category (e.g. Onion Powder) if this is a specific brand brand.'
                  : 'Choose a parent product so this brand counts towards the same inventory minimum stock.'}
              </span>
            </div>
          )}

          {isSpiceMode ? (
            !isParent && (
              <div className="p-4 rounded-xl border border-indigo-500/10 bg-indigo-950/5 space-y-4 animate-fade-in">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">Spice Capacity & Reorder Level</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400 font-medium">
                      Jar/Bottle Capacity:
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        step="any"
                        value={capacityValue} 
                        onChange={(e) => setCapacityValue(e.target.value)}
                        className="w-full p-2.5 rounded-lg glass-input text-center font-semibold"
                        placeholder="e.g. 100"
                        min="0.01"
                        required
                      />
                      <select 
                        value={capacityUnit} 
                        onChange={(e) => setCapacityUnit(e.target.value)}
                        className="p-2.5 rounded-lg glass-input bg-slate-900 w-32 font-semibold"
                      >
                        <option value="g">g (grams)</option>
                        <option value="ml">ml (milliliters)</option>
                        <option value="fl_oz">fl_oz (fl. oz.)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400">Reorder Threshold (Percentage Left):</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        value={spiceReorderPercentage} 
                        onChange={(e) => setSpiceReorderPercentage(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                        className="w-full p-2.5 rounded-lg glass-input text-center font-semibold"
                        placeholder="e.g. 20"
                        min="0"
                        max="100"
                        required
                      />
                      <span className="text-slate-400 font-bold">%</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : (
            <>
              {!isParent ? (
                <>
                  <div className="p-4 rounded-xl border border-indigo-500/10 bg-indigo-950/5 space-y-4 animate-fade-in">
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

                      <div className="col-span-1 sm:col-span-2 border-t border-slate-800/60 pt-3 mt-1 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-350">
                          <input 
                            type="checkbox" 
                            checked={hasCustomServing} 
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setHasCustomServing(checked);
                              if (checked) {
                                setServingsPerPackageValue(1.0);
                                setServingSizeValue(parseFloat(capacityValue) || 1.0);
                                setServingUnit(capacityUnit || 'pieces');
                                setCalorieMode('per_serving');
                              } else {
                                setCalorieMode('per_unit');
                              }
                            }}
                            className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                          />
                          Define portions/servings count for this package (e.g. 20 servings)
                        </label>

                        {hasCustomServing && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
                            <div className="space-y-1.5">
                              <label className="block text-xs font-semibold text-slate-400">Portions / Servings count</label>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="number" 
                                  step="any"
                                  value={servingsPerPackageValue} 
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setServingsPerPackageValue(e.target.value);
                                    if (val > 0) {
                                      setServingSizeValue((parseFloat(capacityValue) || 1.0) / val);
                                    }
                                  }}
                                  className="w-full p-2.5 rounded-lg glass-input text-center font-semibold"
                                  placeholder="e.g. 20"
                                  min="0.01"
                                  required
                                />
                                <span className="text-sm text-slate-400 w-16 text-left">servings</span>
                              </div>
                            </div>
                            <div className="flex items-end pb-2">
                              <span className="text-[11px] text-slate-500 font-medium italic">
                                Calculated: 1 serving = {((parseFloat(capacityValue) || 1.0) / (parseFloat(servingsPerPackageValue) || 1.0)).toFixed(2)} {capacityUnit}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-indigo-500/10 bg-indigo-950/5 space-y-4 animate-fade-in">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">Calories & Nutrition</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-400 font-medium">Calories Specified Per:</label>
                        <select 
                          value={calorieMode} 
                          onChange={(e) => setCalorieMode(e.target.value)}
                          className="w-full p-2.5 rounded-lg glass-input bg-slate-900 font-semibold"
                        >
                          {hasCustomServing && (
                            <option value="per_serving">1 serving</option>
                          )}
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
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl border border-indigo-500/10 bg-indigo-950/5 space-y-4 animate-fade-in">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">Package Details</h3>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400 font-medium">Track Inventory By:</label>
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
              )}

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

              {!isParent && (
                <div className="space-y-1.5 bg-slate-900/40 p-3 rounded-lg border border-slate-800 animate-fade-in">
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
              )}
            </>
          )}

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

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button 
              type="button"
              onClick={onClose}
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
  );
}
