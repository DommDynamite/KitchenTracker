import React, { useState, useEffect } from 'react';
import { Check, X, Camera, Barcode, Upload } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function ChildProductModal({
  isOpen,
  onClose,
  onSave,
  parentProduct,
  editingProduct = null
}) {
  const { showToast } = useToast();
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [packageType, setPackageType] = useState('package');
  
  // Capacity / Serving details
  const [capacityValue, setCapacityValue] = useState(100);
  const [capacityUnit, setCapacityUnit] = useState('g');
  const [caloriesValue, setCaloriesValue] = useState('');
  const [servingSizeValue, setServingSizeValue] = useState(1);

  // Image uploader states
  const [imagePath, setImagePath] = useState('');
  const [uploading, setUploading] = useState(false);

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
      showToast('Image upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (editingProduct) {
        setBrand(editingProduct.brand || '');
        setBarcode(editingProduct.barcode || '');
        setPackageType(editingProduct.package_type || 'package');
        setCapacityValue(editingProduct.serving_size || 100);
        setCapacityUnit(editingProduct.serving_unit || 'g');
        setCaloriesValue(editingProduct.calories_per_serving !== null && editingProduct.calories_per_serving !== undefined ? editingProduct.calories_per_serving : '');
        setServingSizeValue(editingProduct.serving_size || 1);
        setImagePath(editingProduct.image_path || '');
      } else {
        setBrand('');
        setBarcode('');
        setPackageType(parentProduct?.is_spice ? 'jar' : 'package');
        setCapacityValue(parentProduct?.is_spice ? 100 : 500);
        setCapacityUnit(parentProduct?.is_spice ? 'g' : (parentProduct?.default_unit || 'g'));
        setCaloriesValue('');
        setServingSizeValue(parentProduct?.is_spice ? 100 : 100);
        setImagePath('');
      }
    }
  }, [isOpen, editingProduct, parentProduct]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!brand.trim()) {
      showToast('Brand name is required', 'error');
      return;
    }
    const sSize = parentProduct.is_spice ? (parseFloat(capacityValue) || 1.0) : (parseFloat(servingSizeValue) || 1.0);
    const sPkg = parentProduct.is_spice ? 1.0 : ((parseFloat(capacityValue) || 1.0) / sSize);

    const payload = {
      name: `${brand.trim()} ${parentProduct.name.trim()}`,
      barcode: barcode || null,
      parent_product_id: parentProduct.id,
      brand: brand.trim(),
      category: parentProduct.category || 'Pantry',
      default_unit: parentProduct.is_spice ? capacityUnit : (parentProduct.default_unit || 'g'),
      servings_per_package: sPkg,
      serving_size: sSize,
      serving_unit: capacityUnit,
      minimum_stock: 0,
      default_consumption: 1.0,
      use_by_days_after_opening: null,
      image_path: imagePath || null,
      package_type: packageType || 'package',
      calories_per_serving: parentProduct.is_spice ? null : (caloriesValue !== '' ? parseInt(caloriesValue, 10) : null),
      is_parent: 0,
      is_spice: parentProduct.is_spice ? 1 : 0,
      spice_reorder_percentage: parentProduct.spice_reorder_percentage || 20.0
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
        showToast('Brand format saved successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to save brand format', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('Error saving brand format', 'error');
    }
  };

  const triggerCameraScanner = () => {
    // Navigate or trigger scan barcode flow
    showToast('Barcode camera scanner can be triggered in the Main scanner tab', 'info');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md glass-panel bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-scale-up">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white">
              {editingProduct ? 'Edit Brand Format' : 'Add Brand Format'}
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Category: <strong className="text-indigo-400">{parentProduct?.name}</strong>
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="block text-slate-400 font-semibold">Brand / Manufacturer</label>
            <input 
              type="text" 
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full p-2.5 rounded-lg glass-input font-semibold"
              placeholder="e.g. McCormick, Heinz, Organic Valley"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-400 font-semibold">Barcode</label>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input 
                  type="text" 
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full p-2.5 pl-10 rounded-lg glass-input font-semibold"
                  placeholder="Scan or type barcode"
                />
              </div>
              <button 
                type="button"
                onClick={triggerCameraScanner}
                className="p-2.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white border border-slate-800 cursor-pointer"
                title="Scan Barcode"
              >
                <Camera className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold">Package Type</label>
              <select 
                value={packageType} 
                onChange={(e) => setPackageType(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input bg-slate-950 font-semibold"
              >
                <option value="package">Package (generic)</option>
                <option value="bottle">Bottle</option>
                <option value="jar">Jar</option>
                <option value="can">Can</option>
                <option value="box">Box</option>
                <option value="tub">Tub</option>
                <option value="pouch">Pouch</option>
                <option value="bag">Bag</option>
                <option value="tin">Tin</option>
                <option value="container">Container</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold">Capacity Unit</label>
              <select 
                value={capacityUnit} 
                onChange={(e) => setCapacityUnit(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input bg-slate-950 font-semibold"
              >
                <option value="g">g (grams)</option>
                <option value="ml">ml (milliliters)</option>
                <option value="fl_oz">fl_oz (fl. oz.)</option>
                <option value="pieces">pieces</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-400 font-semibold">Package Capacity (Contents size)</label>
            <input 
              type="number" 
              step="any"
              value={capacityValue}
              onChange={(e) => setCapacityValue(e.target.value)}
              className="w-full p-2.5 rounded-lg glass-input font-semibold"
              placeholder="e.g. 500 or 100"
              required
              min="0.01"
            />
          </div>

          {/* Calorie information (hidden for Spices) */}
          {!parentProduct?.is_spice && (
            <div className="p-3 bg-slate-950/20 border border-slate-800 rounded-xl space-y-3 animate-fade-in">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Calories & Nutrition Specs</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Serving Size ({capacityUnit})</label>
                  <input 
                    type="number" 
                    step="any"
                    value={servingSizeValue}
                    onChange={(e) => setServingSizeValue(e.target.value)}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-850 text-slate-200"
                    placeholder="e.g. 15"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Calories (kcal per serving)</label>
                  <input 
                    type="number" 
                    value={caloriesValue}
                    onChange={(e) => setCaloriesValue(e.target.value)}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-850 text-slate-200"
                    placeholder="e.g. 80"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-slate-400 font-semibold">Brand Photo</label>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2.5 rounded-lg text-xs transition-colors border border-slate-800">
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
                    className="text-xs text-rose-400 hover:text-rose-300 font-bold"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-350 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gradient-indigo text-white font-semibold text-xs shadow-lg hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Check className="h-4 w-4" /> Save Brand
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
