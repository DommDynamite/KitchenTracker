import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export default function ConfirmModal({ 
  isOpen, 
  title = "Confirm Deletion", 
  message = "Are you sure you want to proceed with this deletion?", 
  confirmText = "Delete", 
  cancelText = "Cancel", 
  onConfirm, 
  onCancel,
  icon = "trash" // 'trash' or 'warning'
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div 
        className="fixed inset-0 z-0" 
        onClick={onCancel} 
      />
      
      <div className="w-full max-w-md rounded-2xl glass-panel p-6 space-y-5 my-24 relative z-10 animate-scale-up border border-rose-500/20">
        <button 
          onClick={onCancel}
          className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-white transition-colors"
          title="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center space-y-3">
          <div className={`p-3 rounded-full ${
            icon === 'warning' 
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            {icon === 'warning' ? (
              <AlertTriangle className="h-8 w-8 animate-pulse" />
            ) : (
              <Trash2 className="h-8 w-8 animate-pulse" />
            )}
          </div>
          
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
            <p className="text-sm text-slate-300 leading-relaxed px-2">{message}</p>
          </div>
        </div>

        <div className="flex justify-center gap-3 pt-3 border-t border-slate-800/80">
          <button 
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-900/40 text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:border-slate-500 active:scale-95 transition-all cursor-pointer"
          >
            {cancelText}
          </button>
          <button 
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 text-sm font-bold text-white shadow-lg shadow-rose-950/20 hover:from-rose-550 hover:to-rose-650 active:scale-95 transition-all cursor-pointer"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
