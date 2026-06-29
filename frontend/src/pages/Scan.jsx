import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Camera, CameraOff, AlertTriangle, Check, X, 
  RotateCw, Plus, ShoppingBag, Database, ArrowRight,
  Upload, Trash2
} from 'lucide-react';
import ProductModal from '../components/ProductModal';
import InventoryModal from '../components/InventoryModal';
import { useToast } from '../context/ToastContext';

function SearchableProductDropdown({ 
  products, 
  selectedProductId, 
  onSelect, 
  onRegisterNew 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProducts = products.filter(p => {
    const term = search.toLowerCase();
    const nameMatch = p.name?.toLowerCase().includes(term) || false;
    const brandMatch = p.brand?.toLowerCase().includes(term) || false;
    return nameMatch || brandMatch;
  });

  const selectedProduct = products.find(p => p.id === Number(selectedProductId));

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch('');
        }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg glass-input text-xs text-left text-white focus:outline-none focus:border-indigo-500"
      >
        <span className="truncate">
          {selectedProduct 
            ? `${selectedProduct.brand ? selectedProduct.brand + ' - ' : ''}${selectedProduct.name}`
            : "Select Product..."}
        </span>
        <span className="ml-2 text-slate-400 text-[10px]">▼</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 rounded-xl border border-slate-800 bg-slate-950/95 backdrop-blur-md p-2 shadow-2xl z-50 space-y-1 animate-scale-up max-h-60 flex flex-col">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-850 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          <div className="overflow-y-auto max-h-40 space-y-0.5 mt-1 flex-1">
            {filteredProducts.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500 text-center">No products found</div>
            ) : (
              filteredProducts.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors truncate block ${
                    p.id === Number(selectedProductId)
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  {p.brand ? `[${p.brand}] ` : ''}{p.name}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-850 pt-1.5 mt-1">
            <button
              type="button"
              onClick={() => {
                onRegisterNew();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold text-xs transition-colors border border-indigo-500/20"
            >
              <Plus className="h-3.5 w-3.5" /> Register New Brand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Scan({ settings }) {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  
  // Wizard Steps: 'scan' -> scanner dashboard, 'review_receipt' -> wizard list
  // barcode sub-steps: 'create_product', 'add_inventory'
  const [step, setStep] = useState('scan'); 
  const [loading, setLoading] = useState(false);
  const [resolvedProduct, setResolvedProduct] = useState(null);

  // HTML5 Qrcode state
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const html5QrcodeRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [storeSuggestions, setStoreSuggestions] = useState([]);

  // Receipt Scanner State
  const isReceiptScanningEnabled = settings?.receipt_scanning_enabled === true || settings?.receipt_scanning_enabled === 'true';
  const [activeTab, setActiveTab] = useState('barcode'); // 'barcode' or 'receipt'
  const [receiptItems, setReceiptItems] = useState([]);
  const [globalStore, setGlobalStore] = useState('');
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);
  const [productModalTargetIndex, setProductModalTargetIndex] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

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

  const fetchLocations = async () => {
    try {
      const res = await fetch('/api/locations');
      if (res.ok) {
        const data = await res.json();
        setLocations(data);
      }
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
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
            handleBarcodeFound(decodedText);
            stopScanner();
          },
          (errorMessage) => {
            // Verbose error, ignore
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
    fetchCategories();
    fetchProducts();

    // Cleanup scanner on unmount
    return () => {
      if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
        html5QrcodeRef.current.stop().catch(err => console.error(err));
      }
    };
  }, []);

  const handleBarcodeFound = async (barcode) => {
    setScannedBarcode(barcode);
    setLoading(true);
    setStep('scan'); // stay on scan screen but show loading
    
    try {
      const res = await fetch(`/api/products/barcode/${barcode}`);
      if (res.status === 200) {
        const product = await res.json();
        setResolvedProduct(product);
        setStep('add_inventory');
      } else {
        setResolvedProduct(null);
        setStep('create_product');
      }
    } catch (err) {
      console.error('Error resolving barcode:', err);
      showToast('Network error looking up barcode', 'error');
    } finally {
      setLoading(false);
    }
  };

  const urlBarcode = searchParams.get('barcode');

  useEffect(() => {
    if (urlBarcode) {
      setActiveTab('barcode');
      handleBarcodeFound(urlBarcode);
    }
  }, [urlBarcode]);

  const handleCancel = () => {
    stopScanner();
    setScannedBarcode('');
    setBarcodeInput('');
    setResolvedProduct(null);
    setReceiptItems([]);
    setGlobalStore('');
    setProductModalTargetIndex(null);
    setStep('scan');
    setSearchParams({});
  };

  const handleInventorySaved = () => {
    showToast(`Successfully added item to inventory!`, 'success');
    handleCancel();
    fetchProducts();
  };

  // Receipt Scanner Operations
  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processReceiptFile(file);
  };

  const processReceiptFile = async (file) => {
    setIsScanningReceipt(true);
    setReceiptItems([]);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result;
        try {
          const res = await fetch('/api/receipts/scan', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: base64Data })
          });

          if (!res.ok) {
            let errMsg = 'Failed to scan receipt';
            try {
              const contentType = res.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const errData = await res.json();
                errMsg = errData.error || errMsg;
              } else {
                if (res.status === 413) {
                  errMsg = 'Receipt image file size is too large. Try uploading a smaller or resized photo.';
                } else {
                  errMsg = `Server error (${res.status}): ${res.statusText || 'Unknown error'}`;
                }
              }
            } catch (_) {}
            throw new Error(errMsg);
          }

          const parsedData = await res.json();
          const itemsWithStorage = parsedData.map(item => {
            const product = products.find(p => p.id === Number(item.matched_product_id));
            return {
              ...item,
              storage_location: product?.storage_location || 'Pantry',
              expiration_date: ''
            };
          });
          setReceiptItems(itemsWithStorage);
          setStep('review_receipt');
        } catch (err) {
          console.error(err);
          showToast(err.message || 'Error processing receipt image', 'error');
        } finally {
          setIsScanningReceipt(false);
        }
      };
      reader.onerror = () => {
        showToast('Failed to read image file', 'error');
        setIsScanningReceipt(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      showToast('Failed to read image file', 'error');
      setIsScanningReceipt(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await processReceiptFile(file);
    } else {
      showToast('Please upload an image file.', 'warning');
    }
  };

  const handleSaveReceipt = async () => {
    const validItems = receiptItems.filter(item => !item.ignored && item.matched_product_id);
    if (validItems.length === 0 && receiptItems.filter(item => item.ignored).length === 0) {
      showToast('Please match at least one product or mark items to ignore.', 'warning');
      return;
    }

    setIsSavingReceipt(true);
    try {
      const payload = {
        items: receiptItems.map(item => ({
          product_id: item.matched_product_id,
          quantity: item.quantity,
          price: item.price,
          store_location: globalStore || null,
          storage_location: item.storage_location || 'Pantry',
          expiration_date: item.expiration_date || null,
          ignored: item.ignored,
          raw_description: item.raw_description
        })),
        ignoredRawDescriptions: receiptItems
          .filter(item => item.ignored && item.raw_description)
          .map(item => item.raw_description)
      };

      const res = await fetch('/api/receipts/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to log purchases');
      }

      showToast('Successfully logged receipt purchases and updated mappings!', 'success');
      setReceiptItems([]);
      setGlobalStore('');
      setStep('scan');
      fetchProducts();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error logging purchases', 'error');
    } finally {
      setIsSavingReceipt(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      <style>{`
        @keyframes scanLaser {
          0% { transform: translateY(0); opacity: 0.2; }
          50% { transform: translateY(220px); opacity: 1; }
          100% { transform: translateY(0); opacity: 0.2; }
        }
        .animate-scan-laser {
          animation: scanLaser 3s infinite linear;
        }
      `}</style>

      {/* Header */}
      <div>
        {step === 'review_receipt' ? (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl text-center">
              Review <span className="text-glow font-bold">Purchases</span>
            </h1>
            <p className="text-slate-400 mt-1 text-center">
              Verify quantities, prices, storage locations, or ignore items before logging.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl text-center">
              {activeTab === 'receipt' ? (
                <>Receipt <span className="text-glow font-bold">Scanner</span></>
              ) : (
                <>Barcode <span className="text-glow font-bold">Scanner</span></>
              )}
            </h1>
            <p className="text-slate-400 mt-1 text-center">
              {activeTab === 'receipt' 
                ? "Upload a receipt photo to automatically add all items using Gemini AI."
                : "Instantly add items to inventory using your phone's camera."}
            </p>
          </>
        )}
      </div>

      {/* Tabs Selector (hidden during checkout review or when disabled) */}
      {isReceiptScanningEnabled && step === 'scan' && !loading && !isScanningReceipt && (
        <div className="flex justify-center p-1 bg-slate-900/60 border border-slate-800 rounded-xl max-w-xs mx-auto mb-2">
          <button
            onClick={() => setActiveTab('barcode')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'barcode'
                ? 'bg-gradient-indigo text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Barcode Scan
          </button>
          <button
            onClick={() => setActiveTab('receipt')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'receipt'
                ? 'bg-gradient-indigo text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Receipt Scan
          </button>
        </div>
      )}

      {loading && (
        <div className="glass-panel p-8 text-center rounded-2xl flex flex-col items-center justify-center">
          <RotateCw className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-slate-400 mt-3 font-semibold">Processing barcode request...</p>
        </div>
      )}

      {isScanningReceipt && (
        <div className="glass-panel p-8 text-center rounded-2xl flex flex-col items-center justify-center relative overflow-hidden min-h-[250px]">
          <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent top-0 animate-scan-laser shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>
          <RotateCw className="h-10 w-10 animate-spin text-indigo-500 mb-4" />
          <h3 className="text-white font-bold text-lg">Scanning Receipt</h3>
          <p className="text-slate-400 mt-2 max-w-sm text-sm">
            Using Gemini AI to parse line items, expand descriptions, and match products.
          </p>
        </div>
      )}

      {/* STEP 1: SCANNING INTERFACE */}
      {!loading && !isScanningReceipt && step === 'scan' && (
        <>
          {activeTab === 'barcode' ? (
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              {/* Barcode Scanner Viewport */}
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
          ) : (
            /* Receipt Upload Zone */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all p-6 relative ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-500/5'
                  : 'border-slate-700 hover:border-indigo-500 bg-slate-900/40 hover:bg-slate-900/60'
              }`}
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleReceiptUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-400 transition-colors mb-3">
                <Upload className="h-10 w-10 animate-bounce" />
              </div>
              <span className="text-sm font-bold text-white">Upload Receipt Photo</span>
              <span className="text-xs text-slate-500 mt-1 text-center max-w-xs">
                Drag & drop receipt image, or tap to choose/take a picture from your camera.
              </span>
            </div>
          )}
        </>
      )}

      {/* STEP 2: RECEIPT REVIEW WIZARD */}
      {step === 'review_receipt' && (
        <div className="space-y-6">
          {/* Global Store Selector */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-slate-300">Receipt Details</h2>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 block">Store Location</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Costco, Kroger, Trader Joe's..."
                  value={globalStore}
                  onChange={(e) => setGlobalStore(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg glass-input text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                {storeSuggestions.length > 0 && !storeSuggestions.includes(globalStore) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {storeSuggestions.slice(0, 5).map(store => (
                      <button
                        key={store}
                        type="button"
                        onClick={() => setGlobalStore(store)}
                        className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-850 hover:border-slate-700 text-[10px] text-slate-300 hover:text-white transition-colors"
                      >
                        {store}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cards List */}
          <div className="space-y-4">
            {receiptItems.map((item, idx) => (
              <div 
                key={idx}
                className={`glass-panel p-5 rounded-2xl border transition-all duration-200 ${
                  item.ignored 
                    ? 'border-rose-500/20 bg-rose-950/5 shadow-[inset_0_0_12px_rgba(244,63,94,0.05)]' 
                    : 'border-slate-800 hover:border-slate-700/60'
                }`}
              >
                {/* Card Header: name and ignore toggle */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                  <div>
                    <h3 className={`font-bold text-sm ${item.ignored ? 'text-slate-500 line-through' : 'text-white'}`}>
                      {item.expanded_description || item.raw_description || "Unknown Item"}
                    </h3>
                    {item.raw_description && (
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                        Raw: {item.raw_description}
                      </span>
                    )}
                    {!item.ignored && item.confidence !== undefined && (
                      <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-md mt-1.5 ${
                        item.confidence >= 0.8 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : item.confidence >= 0.5 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        Confidence: {Math.round(item.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  
                  <div className="shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer select-none py-1 px-2.5 rounded-lg border border-slate-800 bg-slate-950/40 hover:bg-slate-900/60 transition-colors">
                      <input
                        type="checkbox"
                        checked={item.ignored || false}
                        onChange={(e) => {
                          setReceiptItems(prev => prev.map((ri, i) => i === idx ? { ...ri, ignored: e.target.checked } : ri));
                        }}
                        className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className={`text-[10px] font-bold ${item.ignored ? 'text-rose-400' : 'text-slate-400'}`}>
                        {item.ignored ? 'Ignored' : 'Ignore Item'}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Card Fields */}
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity duration-200 ${item.ignored ? 'opacity-30 pointer-events-none' : ''}`}>
                  {/* Searchable Brand Match */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 block">Database Product Match</label>
                    <SearchableProductDropdown
                      products={products}
                      selectedProductId={item.matched_product_id}
                      onSelect={(prodId) => {
                        const matchedProd = products.find(p => p.id === prodId);
                        setReceiptItems(prev => prev.map((ri, i) => i === idx ? { 
                          ...ri, 
                          matched_product_id: prodId,
                          storage_location: matchedProd?.storage_location || ri.storage_location || 'Pantry'
                        } : ri));
                      }}
                      onRegisterNew={() => setProductModalTargetIndex(idx)}
                    />
                  </div>

                  {/* Storage Location */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 block">Storage Location</label>
                    <select
                      value={item.storage_location || 'Pantry'}
                      onChange={(e) => {
                        setReceiptItems(prev => prev.map((ri, i) => i === idx ? { ...ri, storage_location: e.target.value } : ri));
                      }}
                      className="w-full px-3 py-2 rounded-lg glass-input text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      {locations.map(loc => (
                        <option key={loc.name} value={loc.name} className="bg-slate-950 text-white">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity and Price */}
                  <div className="grid grid-cols-2 gap-3 md:col-span-2">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 block">Qty (Packages)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={item.quantity === undefined || item.quantity === null ? '' : item.quantity}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                          setReceiptItems(prev => prev.map((ri, i) => i === idx ? { ...ri, quantity: val } : ri));
                        }}
                        className="w-full px-3 py-2 rounded-lg glass-input text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 block">Total Price ($)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={item.price === undefined || item.price === null ? '' : item.price}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                          setReceiptItems(prev => prev.map((ri, i) => i === idx ? { ...ri, price: val } : ri));
                        }}
                        className="w-full px-3 py-2 rounded-lg glass-input text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Expiration Date */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 block">Expiration Date (Optional)</label>
                    <input
                      type="date"
                      value={item.expiration_date || ''}
                      onChange={(e) => {
                        setReceiptItems(prev => prev.map((ri, i) => i === idx ? { ...ri, expiration_date: e.target.value } : ri));
                      }}
                      className="w-full px-3 py-2 rounded-lg glass-input text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-800 bg-slate-950/20 hover:bg-slate-900/60 text-slate-400 hover:text-white text-sm font-bold transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveReceipt}
              disabled={isSavingReceipt}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-indigo text-white text-sm font-bold shadow-lg hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-98"
            >
              {isSavingReceipt ? (
                <>
                  <RotateCw className="h-4 w-4 animate-spin" /> Logging Purchases...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Log Purchases ({receiptItems.filter(item => !item.ignored).length})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* MODALS */}
      {/* Existing Barcode Create Product Modal */}
      <ProductModal
        isOpen={step === 'create_product'}
        onClose={handleCancel}
        onSave={async (newProduct) => {
          setProducts(prev => [...prev, newProduct]);
          setResolvedProduct(newProduct);
          setStep('add_inventory');
          fetchProducts();
        }}
        prefilledBarcode={scannedBarcode}
        categories={categories}
        parentProducts={products.filter(p => p.is_parent === 1 || !p.parent_product_id)}
      />

      {/* Existing Barcode Add Inventory Modal */}
      <InventoryModal
        isOpen={step === 'add_inventory'}
        onClose={handleCancel}
        onSave={handleInventorySaved}
        preselectedProductId={resolvedProduct?.id}
        products={products}
        locations={locations}
        categories={categories}
        storeSuggestions={storeSuggestions}
      />

      {/* New Receipt Scan Create Product Modal */}
      <ProductModal
        isOpen={productModalTargetIndex !== null}
        onClose={() => setProductModalTargetIndex(null)}
        onSave={async (newProduct) => {
          setProducts(prev => [...prev, newProduct]);
          const idx = productModalTargetIndex;
          if (idx !== null) {
            setReceiptItems(prev => prev.map((ri, i) => i === idx ? { 
              ...ri, 
              matched_product_id: newProduct.id,
              storage_location: newProduct.storage_location || ri.storage_location || 'Pantry'
            } : ri));
          }
          setProductModalTargetIndex(null);
          fetchProducts();
        }}
        prefilledName={productModalTargetIndex !== null ? receiptItems[productModalTargetIndex]?.expanded_description : ''}
        categories={categories}
        parentProducts={products.filter(p => p.is_parent === 1 || !p.parent_product_id)}
      />
    </div>
  );
}
