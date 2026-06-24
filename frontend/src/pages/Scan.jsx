import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Camera, CameraOff, AlertTriangle, Check, X, 
  RotateCw, Plus, ShoppingBag, Database, ArrowRight 
} from 'lucide-react';
import ProductModal from '../components/ProductModal';
import InventoryModal from '../components/InventoryModal';

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

  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [storeSuggestions, setStoreSuggestions] = useState([]);

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
        // Product is known
        const product = await res.json();
        setResolvedProduct(product);
        setStep('add_inventory');
      } else {
        // Product is unknown, redirect to product creation modal
        setResolvedProduct(null);
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

  const handleCancel = () => {
    stopScanner();
    setScannedBarcode('');
    setBarcodeInput('');
    setResolvedProduct(null);
    setStep('scan');
    setSearchParams({});
  };

  const handleInventorySaved = () => {
    alert(`Successfully added item to inventory!`);
    setScannedBarcode('');
    setBarcodeInput('');
    setResolvedProduct(null);
    setStep('scan');
    setSearchParams({});
    fetchProducts();
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
    </div>
  );
}
