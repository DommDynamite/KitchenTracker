import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    
    // Add new toast to list
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after duration
    setTimeout(() => {
      // Trigger slide out before deleting
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Toast Portal Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none select-none">
        <style>{`
          @keyframes toastSlideIn {
            from { transform: translateX(120%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes shrinkWidth {
            from { width: 100%; }
            to { width: 0%; }
          }
          .animate-toast-in {
            animation: toastSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        `}</style>

        {toasts.map((toast) => {
          // Status configurations
          let themeClass = 'border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.4)]';
          let icon = <Info className="h-4.5 w-4.5 text-indigo-400" />;
          let barColor = 'bg-indigo-500';

          if (toast.type === 'success') {
            themeClass = 'border-emerald-500/20 bg-emerald-950/5 shadow-[0_0_15px_rgba(16,185,129,0.08)]';
            icon = <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />;
            barColor = 'bg-emerald-500';
          } else if (toast.type === 'error') {
            themeClass = 'border-rose-500/20 bg-rose-955/5 shadow-[0_0_15px_rgba(244,63,94,0.08)]';
            icon = <XCircle className="h-4.5 w-4.5 text-rose-450" />;
            barColor = 'bg-rose-500';
          } else if (toast.type === 'warning') {
            themeClass = 'border-amber-500/20 bg-amber-955/5 shadow-[0_0_15px_rgba(245,158,11,0.08)]';
            icon = <AlertTriangle className="h-4.5 w-4.5 text-amber-400" />;
            barColor = 'bg-amber-500';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex gap-3 p-4 rounded-xl border bg-slate-950/90 backdrop-blur-md text-white font-medium text-xs transition-all relative overflow-hidden animate-toast-in ${themeClass}`}
            >
              {/* Status Icon */}
              <div className="shrink-0 pt-0.5">{icon}</div>

              {/* Message */}
              <div className="flex-1 pr-4 leading-normal text-slate-200 select-text">
                {toast.message}
              </div>

              {/* Dismiss Button */}
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-0.5 rounded hover:bg-white/10 text-slate-450 hover:text-white transition-colors cursor-pointer absolute right-3 top-3.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>

              {/* Loading progress indicator */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800/40">
                <div className={`h-full ${barColor} w-full`} style={{
                  animation: 'shrinkWidth 4s linear forwards'
                }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
