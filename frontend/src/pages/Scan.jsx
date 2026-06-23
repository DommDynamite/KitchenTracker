import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Camera, CameraOff, AlertTriangle, Check, X, 
  RotateCw, Plus, ShoppingBag, Database, ArrowRight 
} from 'lucide-react';

export default function Scan() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  
  // Wizard Steps
  // 'scan' -> scan/enter barcode
  // 'create_product' -> barcode is unknown, fill product details
  // 'add_inventory' -> barcode is known, log purchase details
  const [step, setStep] = useState('scan'); 
  const [loading, setLoading] = useState(false);
  const [resolvedProduct, setResolvedProduct] = useState(null);

  // HTML5 Qrcode state
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const scannerRef = useRef(null);
  const html5QrcodeRef = useRef(null);

  // New Product Form State (for 'create_product' step)
  const [prodName, setProdName] = useState('');
  const [prodBrand, setProdBrand] = useState('');
  const [prodCategory, setProdCategory] = useState('Pantry');
  const [prodUnit, setProdUnit] = useState('pieces');
  const [prodSrvPkg, setProdSrvPkg] = useState(1);
  const [prodSrvSize, setProdSrvSize] = useState(1);
  const [prodSrvUnit, setProdSrvUnit] = useState('pieces');
  const [prodMinStock, setProdMinStock] = useState(0);
  const [prodUseByDays, setProdUseByDays] = useState('');
  const [prodPackageType, setProdPackageType] = useState('package');
  const [prodCalories, setProdCalories] = useState('');

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
    const pkgPlural = getPluralProdPackageType(prodPackageType);
    if (pkgPlural && pkgPlural !== capacityUnit) {
      options.push({ value: pkgPlural, label: `${pkgPlural} (package units)` });
    }
    return options;
  };

  useEffect(() => {
    const opts = getTrackingUnitOptions().map(o => o.value);
    if (opts.length > 0 && !opts.includes(prodUnit)) {
      setProdUnit(opts[0]);
    }
  }, [capacityUnit, prodPackageType]);

  const [storeSuggestions, setStoreSuggestions] = useState([]);

  // New Inventory Form State (for 'add_inventory' step)
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [storageLocation, setStorageLocation] = useState('Pantry');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expirationDate, setExpirationDate] = useState('');
  const [locations, setLocations] = useState([]);

  const fetchLocations = async () => {
    try {
      const res = await fetch('/api/locations');
      if (res.ok) {
        const data = await res.json();
        setLocations(data);
        if (data.length > 0) {
          const hasPantry = data.find(l => l.name.toLowerCase() === 'pantry');
          setStorageLocation(hasPantry ? hasPantry.name : data[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    }
  };

  // Start Scanner
  const startScanner = async () => {
    setScannerError('');
    
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setScannerError('Camera access is blocked by the browser over plain HTTP on local network IPs. To use your phone camera, you must access the app over HTTPS (e.g. via a Tailscale tailnet, Cloudflare tunnel, or self-signed cert) or from localhost.');
      return;
    }
    
    setIsScannerActive(true);
    
    // Tiny delay to ensure DOM element scanner-viewport exists
    setTimeout(async () => {
      try {
        const html5Qrcode = new Html5Qrcode('scanner-viewport');
        html5QrcodeRef.current = html5Qrcode;

        await html5Qrcode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 } // wider aspect ratio is ideal for barcodes
          },
          (decodedText) => {
            // Success callback
            handleBarcodeFound(decodedText);
            stopScanner();
          },
          (errorMessage) => {
            // Verbose error, ignore to avoid spamming state
          }
        );
      } catch (err) {
        console.error('Failed to start scanner:', err);
        setScannerError('Could not access camera. Make sure camera permissions are enabled, or enter the barcode manually.');
        setIsScannerActive(false);
      }
    }, 100);
  };

  // Stop Scanner
  const stopScanner = async () => {
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current = null;
      } catch (err) {
        console.error('Failed to stop scanner:', err);
      }
    }
    setIsScannerActive(false);
  };

  useEffect(() => {
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
    fetchStores();
    fetchLocations();

    // Cleanup scanner on unmount
    return () => {
      if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
        html5QrcodeRef.current.stop().catch(err => console.error(err));
      }
    };
  }, []);

  const getPluralProdPackageType = (type) => {
    if (!type) return 'packages';
    const t = type.toLowerCase();
    if (t === 'package') return 'packages';
    if (t === 'box') return 'boxes';
    if (t === 'pouch') return 'pouches';
    if (t === 'jar') return 'jars';
    return `${t}s`;
  };

  const handleBarcodeFound = async (barcode) => {
    setScannedBarcode(barcode);
    setLoading(true);
    setStep('scan'); // stay on scan screen but show loading
    
    try {
      const res = await fetch(`/api/products/barcode/${barcode}`);
      if (res.status === 200) {
        // Product is known
        const product = await res.json();
        setResolvedProduct(product);
        
        // Reset inventory logging fields
        setQuantity(1);
        setPrice('');
        setStoreLocation('');
        
        let defaultLoc = 'Pantry';
        const isCold = product.category === 'Dairy' || product.category === 'Meat & Seafood';
        const targetSearch = isCold ? 'fridge' : 'pantry';
        const matched = locations.find(l => l.name.toLowerCase() === targetSearch);
        if (matched) {
          defaultLoc = matched.name;
        } else if (locations.length > 0) {
          defaultLoc = locations[0].name;
        }
        setStorageLocation(defaultLoc);
        setExpirationDate('');
        
        setStep('add_inventory');
      } else {
        // Product is unknown, redirect to product creation wizard
        setProdName('');
        setProdBrand('');
        setProdCategory('Pantry');
        setProdUnit('pieces');
        setProdSrvPkg(1);
        setProdSrvSize(1);
        setProdSrvUnit('pieces');
        setProdMinStock(0);
        setProdUseByDays('');
        setProdPackageType('package');
        setProdCalories('');

        // Smart package states reset
        setCapacityValue(1);
        setCapacityUnit('pieces');
        setCalorieMode('per_unit');
        setCaloriesValue('');
        setHasCustomServing(false);
        setServingSizeValue(1);
        
        setStep('create_product');
      }
    } catch (err) {
      console.error('Error resolving barcode:', err);
      alert('Network error looking up barcode');
    } finally {
      setLoading(false);
    }
  };

  const urlBarcode = searchParams.get('barcode');

  useEffect(() => {
    if (urlBarcode) {
      handleBarcodeFound(urlBarcode);
    }
  }, [urlBarcode]);

  // Form submission: Create new product registry entry
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!prodName || !prodUnit) return;

    setLoading(true);

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
      name: prodName,
      barcode: scannedBarcode,
      brand: prodBrand || null,
      category: prodCategory,
      default_unit: prodUnit,
      servings_per_package: sPkg,
      serving_size: sSize,
      serving_unit: sUnit,
      minimum_stock: parseFloat(prodMinStock) || 0,
      use_by_days_after_opening: prodUseByDays ? parseInt(prodUseByDays, 10) : null,
      package_type: prodPackageType || 'package',
      calories_per_serving: calPerSrv
    };

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        // Product created, now load it into memory and transition to inventory logging step
        setResolvedProduct({ id: data.id, ...payload });
        setQuantity(1);
        setPrice('');
        setStoreLocation('');
        
        let defaultLoc = 'Pantry';
        const isCold = prodCategory === 'Dairy' || prodCategory === 'Meat & Seafood';
        const targetSearch = isCold ? 'fridge' : 'pantry';
        const matched = locations.find(l => l.name.toLowerCase() === targetSearch);
        if (matched) {
          defaultLoc = matched.name;
        } else if (locations.length > 0) {
          defaultLoc = locations[0].name;
        }
        setStorageLocation(defaultLoc);
        setExpirationDate('');
        
        setStep('add_inventory');
      } else {
        alert(`Failed to register product: ${data.error}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Form submission: Log inventory purchase
  const handleAddInventory = async (e) => {
    e.preventDefault();
    if (!resolvedProduct) return;

    setLoading(true);
    const payload = {
      product_id: resolvedProduct.id,
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
        alert(`Successfully added ${quantity} pkg of ${resolvedProduct.name} to inventory!`);
        // Reset and go back to scanner screen
        setScannedBarcode('');
        setBarcodeInput('');
        setResolvedProduct(null);
        setStep('scan');
        setSearchParams({});
      } else {
        const err = await res.json();
        alert(`Error logging inventory: ${err.error}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    stopScanner();
    setScannedBarcode('');
    setBarcodeInput('');
    setResolvedProduct(null);
    setStep('scan');
    setSearchParams({});
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl text-center">
          Barcode <span className="text-glow font-bold">Scanner</span>
        </h1>
        <p className="text-slate-400 mt-1 text-center">Instantly add items to inventory using your phone's camera.</p>
      </div>

      {loading && (
        <div className="glass-panel p-8 text-center rounded-2xl flex flex-col items-center justify-center">
          <RotateCw className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-slate-400 mt-3 font-semibold">Processing barcode request...</p>
        </div>
      )}

      {/* STEP 1: SCANNING INTERFACE */}
      {!loading && step === 'scan' && (
        <div className="glass-panel p-6 rounded-2xl space-y-6">
          {/* Scanner Viewport */}
          {isScannerActive ? (
            <div className="space-y-4">
              <div 
                id="scanner-viewport" 
                className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-slate-700/60"
              ></div>
              <button
                onClick={stopScanner}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-xs transition-colors"
              >
                <CameraOff className="h-4.5 w-4.5" /> Stop Camera Scanner
              </button>
            </div>
          ) : (
            <div 
              onClick={startScanner}
              className="w-full aspect-video rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 bg-slate-900/40 hover:bg-slate-900/60 flex flex-col items-center justify-center cursor-pointer group transition-colors p-6"
            >
              <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors mb-3">
                <Camera className="h-10 w-10" />
              </div>
              <span className="text-sm font-bold text-white">Activate Camera Scanner</span>
              <span className="text-xs text-slate-500 mt-1">Tap to capture barcode labels</span>
            </div>
          )}

          {scannerError && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs flex gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{scannerError}</span>
            </div>
          )}

          {/* Manual Input Fallback */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-300">Manual Entry Fallback</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type or paste barcode number..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-lg glass-input text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && barcodeInput) {
                    handleBarcodeFound(barcodeInput);
                  }
                }}
              />
              <button
                onClick={() => barcodeInput && handleBarcodeFound(barcodeInput)}
                disabled={!barcodeInput}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-gradient-indigo text-white text-xs font-semibold shadow-lg hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
              >
                Lookup <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <span className="text-[10px] text-slate-500 block">
              Compatible with keyboard-emulating USB/Bluetooth barcode scanners. Press Enter after scanning.
            </span>
          </div>
        </div>
      )}

      {/* STEP 2: CREATE PRODUCT METADATA */}
      {!loading && step === 'create_product' && (
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-400" /> Unknown Barcode Found
            </h2>
            <span className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">
              BC: {scannedBarcode}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            This barcode is not in your database registry. Please enter its metadata to register it, then log your purchase.
          </p>

          <form onSubmit={handleCreateProduct} className="space-y-4 text-xs text-slate-200">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold">Product Name *</label>
              <input 
                type="text" 
                value={prodName} 
                onChange={(e) => setProdName(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input text-slate-100"
                placeholder="e.g. Great Value Shredded Cheddar 16oz"
                required
              />
            </div>

            {/* Brand & Category */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Brand</label>
                <input 
                  type="text" 
                  value={prodBrand} 
                  onChange={(e) => setProdBrand(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input"
                  placeholder="e.g. Great Value"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Category</label>
                <select 
                  value={prodCategory} 
                  onChange={(e) => setProdCategory(e.target.value)}
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
            </div>

            {/* Package Type */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold">Package Type</label>
              <select 
                value={prodPackageType} 
                onChange={(e) => setProdPackageType(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input bg-slate-900 font-semibold"
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

            {/* Package Content & Capacity Configuration */}
            <div className="p-4 rounded-xl border border-indigo-500/10 bg-indigo-950/5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">Package Size & Contents</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 font-medium">
                    One <span className="capitalize text-white">{prodPackageType}</span> contains:
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      step="any"
                      value={capacityValue} 
                      onChange={(e) => setCapacityValue(e.target.value)}
                      className="w-full p-2.5 rounded-lg glass-input text-center font-semibold"
                      placeholder="e.g. 500 or 12"
                      min="0.01"
                      required
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
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">Track Inventory By:</label>
                  <select 
                    value={prodUnit} 
                    onChange={(e) => setProdUnit(e.target.value)}
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
                          <option value="per_package">Entire {prodPackageType} ({capacityValue} {capacityUnit})</option>
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

            {/* Min Stock */}
            <div className="space-y-1.5">
              <label className="block text-indigo-300 font-semibold">
                Inventory Minimum Alert Threshold (in {prodUnit})
              </label>
              <input 
                type="number" 
                step="any"
                value={prodMinStock} 
                onChange={(e) => setProdMinStock(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input"
                min="0"
              />
            </div>

            {/* Use-by Shelf Life After Opening */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold">
                Use-by Shelf Life After Opening (Days)
              </label>
              <input 
                type="number" 
                step="1"
                value={prodUseByDays} 
                onChange={(e) => setProdUseByDays(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input"
                min="1"
                placeholder="e.g. 5 (Optional)"
              />
            </div>

            {/* Save Action */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button 
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex items-center gap-1 px-5 py-2 rounded-lg bg-gradient-indigo text-white font-semibold shadow-lg hover:opacity-90"
              >
                Register & Proceed <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3: ADD PURCHASE LOG */}
      {!loading && step === 'add_inventory' && (
        <div className="glass-panel p-6 rounded-2xl space-y-4 animate-scale-up">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-indigo-400" /> Log Scanned Item Purchase
            </h2>
          </div>

          {/* Product Recap */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 flex justify-between items-center text-xs">
            <div>
              <span className="text-slate-500 font-semibold block">Registered Product</span>
              <strong className="text-white text-sm">{resolvedProduct?.name}</strong>
              <span className="text-slate-400 block mt-0.5">{resolvedProduct?.brand || 'Generic Brand'}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">
                BC: {scannedBarcode}
              </span>
            </div>
          </div>

          <form onSubmit={handleAddInventory} className="space-y-4 text-xs text-slate-200">
            {/* Quantity & Storage Location */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Quantity (Packages) *</label>
                <input 
                  type="number" 
                  step="any"
                  value={quantity} 
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input text-center"
                  min="0.1"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Storage Location</label>
                <select 
                  value={storageLocation} 
                  onChange={(e) => setStorageLocation(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input bg-slate-900"
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
                <label className="block text-slate-400 font-semibold">Price Paid ($)</label>
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 3.49"
                  value={price} 
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input"
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Store Purchased From</label>
                <input 
                  type="text" 
                  placeholder="e.g. Aldi"
                  value={storeLocation} 
                  onChange={(e) => setStoreLocation(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input"
                  list="store-suggestions"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Purchase Date *</label>
                <input 
                  type="date" 
                  value={purchaseDate} 
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Expiration Date</label>
                <input 
                  type="date" 
                  value={expirationDate} 
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button 
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex items-center gap-1 px-5 py-2 rounded-lg bg-gradient-indigo text-white font-semibold shadow-lg hover:opacity-90 transition-opacity"
              >
                <Check className="h-4.5 w-4.5" /> Complete Purchase Log
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* Autocomplete Suggestions Datalist */}
      <datalist id="store-suggestions">
        {storeSuggestions.map((store, idx) => (
          <option key={idx} value={store} />
        ))}
      </datalist>
    </div>
  );
}
