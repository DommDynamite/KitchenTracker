import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, Check, X, Sliders, MapPin, AlertCircle, RotateCcw, History, Trash, Tag,
  Camera, Eye, EyeOff, Cpu
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

export default function Settings({ settings, onSettingsChange }) {
  const [locations, setLocations] = useState([]);
  const [newLocationName, setNewLocationName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryStorage, setNewCategoryStorage] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editingCatStorage, setEditingCatStorage] = useState('');
  const [catLoading, setCatLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [activityLogs, setActivityLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [undoingId, setUndoingId] = useState(null);

  // Gemini Receipt Scanning States
  const [apiKey, setApiKey] = useState('');
  const [maskKey, setMaskKey] = useState(true);
  const [ignoredItems, setIgnoredItems] = useState([]);
  const [ignoredLoading, setIgnoredLoading] = useState(false);

  useEffect(() => {
    if (settings?.gemini_api_key) {
      setApiKey(settings.gemini_api_key);
    }
  }, [settings]);

  const fetchIgnoredItems = async () => {
    setIgnoredLoading(true);
    try {
      const res = await fetch('/api/settings/ignored');
      if (res.ok) {
        const data = await res.json();
        setIgnoredItems(data);
      }
    } catch (err) {
      console.error('Error fetching ignored items:', err);
    } finally {
      setIgnoredLoading(false);
    }
  };

  useEffect(() => {
    if (settings?.receipt_scanning_enabled) {
      fetchIgnoredItems();
    }
  }, [settings?.receipt_scanning_enabled]);

  const handleToggleReceiptScanning = async () => {
    const nextVal = !settings.receipt_scanning_enabled;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'receipt_scanning_enabled', value: nextVal })
      });
      if (res.ok) {
        onSettingsChange();
      } else {
        setError('Failed to update receipt scanning state');
      }
    } catch (err) {
      setError('Network error updating receipt scanning state');
    }
  };

  const handleSaveApiKey = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'gemini_api_key', value: apiKey })
      });
      if (res.ok) {
        setSuccess('API Key updated successfully!');
        onSettingsChange();
      } else {
        setError('Failed to update Gemini API Key');
      }
    } catch (err) {
      setError('Network error saving API Key');
    }
  };

  const handleDeleteIgnoredItem = async (id, raw_description) => {
    setDeleteConfirm({
      title: 'Remove Ignored Item',
      message: `Are you sure you want to stop ignoring "${raw_description}"? Future receipt uploads containing this text will prompt you to match it.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/settings/ignored/${id}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            setSuccess('Ignored item removed successfully!');
            fetchIgnoredItems();
          } else {
            setError('Failed to delete ignored item');
          }
        } catch (err) {
          setError('Network error deleting ignored item');
        }
      }
    });
  };

  const fetchLocations = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/locations');
      if (res.ok) {
        const data = await res.json();
        setLocations(data);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to load locations');
      }
    } catch (err) {
      console.error(err);
      setError('Network error loading locations');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/activity-log');
      if (res.ok) {
        const data = await res.json();
        setActivityLogs(data);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to load activity logs');
      }
    } catch (err) {
      console.error(err);
      setError('Network error loading activity logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleUndo = async (logId) => {
    setUndoingId(logId);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/activity-log/${logId}/undo`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || 'Action successfully undone!');
        fetchLogs();
        fetchLocations(); // Refresh locations just in case
      } else {
        setError(data.error || 'Failed to undo action');
      }
    } catch (err) {
      console.error(err);
      setError('Network error trying to undo action');
    } finally {
      setUndoingId(null);
    }
  };

  const handleClearLogs = async () => {
    setDeleteConfirm({
      title: 'Clear Activity Log',
      message: 'Are you sure you want to clear the entire activity log? This cannot be undone and you will lose the ability to undo any past actions.',
      onConfirm: async () => {
        setError('');
        setSuccess('');
        try {
          const res = await fetch('/api/activity-log', {
            method: 'DELETE'
          });
          if (res.ok) {
            setSuccess('Activity log cleared successfully!');
            fetchLogs();
          } else {
            const data = await res.json();
            setError(data.error || 'Failed to clear activity log');
          }
        } catch (err) {
          console.error(err);
          setError('Network error clearing activity log');
        }
      }
    });
  };

  const fetchCategories = async () => {
    setCatLoading(true);
    setError('');
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to load categories');
      }
    } catch (err) {
      console.error(err);
      setError('Network error loading categories');
    } finally {
      setCatLoading(false);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newCategoryName,
          default_storage_location: newCategoryStorage || null
        })
      });
      const data = await res.json();
      if (res.ok) {
        setNewCategoryName('');
        setNewCategoryStorage('');
        setSuccess(`Category "${data.name}" added successfully!`);
        fetchCategories();
      } else {
        setError(data.error || 'Failed to add category');
      }
    } catch (err) {
      console.error(err);
      setError('Network error adding category');
    }
  };

  const handleStartEditCat = (cat) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
    setEditingCatStorage(cat.default_storage_location || '');
    setError('');
    setSuccess('');
  };

  const handleCancelEditCat = () => {
    setEditingCatId(null);
    setEditingCatName('');
    setEditingCatStorage('');
  };

  const handleSaveEditCat = async (id) => {
    if (!editingCatName.trim()) return;

    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: editingCatName,
          default_storage_location: editingCatStorage || null
        })
      });
      if (res.ok) {
        setSuccess('Category updated successfully!');
        setEditingCatId(null);
        setEditingCatName('');
        setEditingCatStorage('');
        fetchCategories();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update category');
      }
    } catch (err) {
      console.error(err);
      setError('Network error updating category');
    }
  };

  const handleDeleteCategory = async (id, name) => {
    setDeleteConfirm({
      title: 'Delete Category',
      message: `Are you sure you want to delete category "${name}"? Products using this category will remain, but they won't have a default storage location pre-populated.`,
      onConfirm: async () => {
        setError('');
        setSuccess('');
        try {
          const res = await fetch(`/api/categories/${id}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            setSuccess('Category deleted successfully!');
            fetchCategories();
          } else {
            const data = await res.json();
            setError(data.error || 'Failed to delete category');
          }
        } catch (err) {
          console.error(err);
          setError('Network error deleting category');
        }
      }
    });
  };

  useEffect(() => {
    fetchLocations();
    fetchCategories();
    fetchLogs();
  }, []);

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;

    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLocationName })
      });
      const data = await res.json();
      if (res.ok) {
        setNewLocationName('');
        setSuccess(`Location "${data.name}" added successfully!`);
        fetchLocations();
      } else {
        setError(data.error || 'Failed to add location');
      }
    } catch (err) {
      console.error(err);
      setError('Network error adding location');
    }
  };

  const handleStartEdit = (loc) => {
    setEditingId(loc.id);
    setEditingName(loc.name);
    setError('');
    setSuccess('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (id) => {
    if (!editingName.trim()) return;

    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/locations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName })
      });
      if (res.ok) {
        setSuccess('Location updated successfully!');
        setEditingId(null);
        setEditingName('');
        fetchLocations();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to rename location');
      }
    } catch (err) {
      console.error(err);
      setError('Network error renaming location');
    }
  };

  const handleDeleteLocation = async (id, name) => {
    setDeleteConfirm({
      title: 'Delete Location',
      message: `Are you sure you want to delete "${name}"? Any inventory items kept in this location will be set to unspecified.`,
      onConfirm: async () => {
        setError('');
        setSuccess('');
        try {
          const res = await fetch(`/api/locations/${id}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            setSuccess('Location deleted successfully!');
            fetchLocations();
          } else {
            const data = await res.json();
            setError(data.error || 'Failed to delete location');
          }
        } catch (err) {
          console.error(err);
          setError('Network error deleting location');
        }
      }
    });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Kitchen <span className="text-glow">Settings</span>
        </h1>
        <p className="text-slate-400 mt-1">Configure storage locations and fine-tune your pantry details.</p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-350 text-sm">
          <Check className="h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Form: Add Location */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 md:col-span-1 h-fit">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Plus className="h-4.5 w-4.5 text-indigo-400" />
            Add New Location
          </h2>
          <p className="text-xs text-slate-400">
            Define a specific drawer, shelf, or container to track where you keep ingredients.
          </p>

          <form onSubmit={handleAddLocation} className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Location Name
              </label>
              <input 
                type="text" 
                value={newLocationName} 
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="e.g. Snack Cabinet, Bottom Drawer"
                className="w-full p-2.5 rounded-lg glass-input text-xs"
                required
              />
            </div>

            <button 
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-indigo py-2 px-4 text-xs font-semibold text-white shadow-lg transition-transform active:scale-95 hover:opacity-90"
            >
              Add Location
            </button>
          </form>
        </div>

        {/* Right List: Configured Locations */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 md:col-span-2">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders className="h-4.5 w-4.5 text-indigo-400" />
            Configured Locations ({locations.length})
          </h2>

          <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/20">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-3.5">Storage Location</th>
                  <th className="p-3.5 text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {loading && locations.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="p-6 text-center text-slate-500">
                      Loading locations...
                    </td>
                  </tr>
                ) : locations.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="p-6 text-center text-slate-500">
                      No locations defined. Create one on the left!
                    </td>
                  </tr>
                ) : (
                  locations.map(loc => {
                    const isEditing = editingId === loc.id;
                    return (
                      <tr key={loc.id} className="hover:bg-slate-900/20 transition-colors">
                        <td className="p-3.5">
                          {isEditing ? (
                            <input 
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="w-full max-w-sm p-1.5 rounded glass-input text-xs font-semibold"
                              required
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-white font-semibold">
                              <MapPin className="h-3.5 w-3.5 text-indigo-400/80 shrink-0" />
                              <span>{loc.name}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-1.5">
                              <button 
                                onClick={() => handleSaveEdit(loc.id)}
                                className="p-1.5 rounded-lg bg-emerald-600/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-600/20"
                                title="Save"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                onClick={handleCancelEdit}
                                className="p-1.5 rounded-lg bg-rose-600/10 text-rose-400 border border-rose-500/25 hover:bg-rose-600/20"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1.5">
                              <button 
                                onClick={() => handleStartEdit(loc)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700/80 border border-slate-700/50"
                                title="Rename Location"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteLocation(loc.id, loc.name)}
                                className="p-1.5 rounded-lg bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 border border-rose-500/10"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Form: Add Category */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 md:col-span-1 h-fit">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Plus className="h-4.5 w-4.5 text-indigo-400" />
            Add New Category
          </h2>
          <p className="text-xs text-slate-400">
            Define custom item categories and select their default storage location.
          </p>

          <form onSubmit={handleAddCategory} className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Category Name
              </label>
              <input 
                type="text" 
                value={newCategoryName} 
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Ice Cream, Condiments"
                className="w-full p-2.5 rounded-lg glass-input text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Default Storage Location
              </label>
              <select
                value={newCategoryStorage}
                onChange={(e) => setNewCategoryStorage(e.target.value)}
                className="w-full p-2.5 rounded-lg glass-input text-xs"
              >
                <option value="">Unspecified</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.name}>{loc.name}</option>
                ))}
              </select>
            </div>

            <button 
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-indigo py-2 px-4 text-xs font-semibold text-white shadow-lg transition-transform active:scale-95 hover:opacity-90"
            >
              Add Category
            </button>
          </form>
        </div>

        {/* Right List: Configured Categories */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 md:col-span-2">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Tag className="h-4.5 w-4.5 text-indigo-400" />
            Configured Categories ({categories.length})
          </h2>

          <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/20">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 w-48">Default Storage</th>
                  <th className="p-3.5 text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {catLoading && categories.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="p-6 text-center text-slate-500">
                      Loading categories...
                    </td>
                  </tr>
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="p-6 text-center text-slate-500">
                      No categories defined.
                    </td>
                  </tr>
                ) : (
                  categories.map(cat => {
                    const isEditing = editingCatId === cat.id;
                    return (
                      <tr key={cat.id} className="hover:bg-slate-900/20 transition-colors">
                        <td className="p-3.5">
                          {isEditing ? (
                            <input 
                              type="text"
                              value={editingCatName}
                              onChange={(e) => setEditingCatName(e.target.value)}
                              className="w-full max-w-sm p-1.5 rounded glass-input text-xs font-semibold"
                              required
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-white font-semibold">
                              <Tag className="h-3.5 w-3.5 text-indigo-400/80 shrink-0" />
                              <span>{cat.name}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3.5">
                          {isEditing ? (
                            <select
                              value={editingCatStorage}
                              onChange={(e) => setEditingCatStorage(e.target.value)}
                              className="w-full p-1.5 rounded glass-input text-xs"
                            >
                              <option value="">Unspecified</option>
                              {locations.map(loc => (
                                <option key={loc.id} value={loc.name}>{loc.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-400">{cat.default_storage_location || 'Unspecified'}</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-1.5">
                              <button 
                                onClick={() => handleSaveEditCat(cat.id)}
                                className="p-1.5 rounded-lg bg-emerald-600/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-600/20"
                                title="Save"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                onClick={handleCancelEditCat}
                                className="p-1.5 rounded-lg bg-rose-600/10 text-rose-400 border border-rose-500/25 hover:bg-rose-600/20"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1.5">
                              <button 
                                onClick={() => handleStartEditCat(cat)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700/80 border border-slate-700/50"
                                title="Edit Category"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                className="p-1.5 rounded-lg bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 border border-rose-500/10"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Receipt Scanning (Gemini AI) Settings Section */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-5">
        <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-white">Gemini AI Features (Google AI Studio)</h2>
              <p className="text-xs text-slate-400 mt-0.5">Enable Gemini receipt scanning and recipe generation chatbot.</p>
            </div>
          </div>
          <button
            onClick={handleToggleReceiptScanning}
            type="button"
            className={`relative inline-flex h-6.5 w-11.5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              settings?.receipt_scanning_enabled ? 'bg-indigo-600' : 'bg-slate-800'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings?.receipt_scanning_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {settings?.receipt_scanning_enabled && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 animate-fade-in">
            {/* API Key Form */}
            <div className="md:col-span-1 space-y-4">
              <h3 className="text-xs font-bold text-slate-350 uppercase tracking-wider">Gemini API Key</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                AI features are powered by Gemini 2.5 Flash. You will need a Google AI Studio API key. 
                Keys are completely free for up to 15 requests per minute.
                <a 
                  href="https://aistudio.google.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-indigo-400 font-semibold hover:underline block mt-1.5"
                >
                  Get a free API Key &rarr;
                </a>
              </p>

              <form onSubmit={handleSaveApiKey} className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    API Key
                  </label>
                  <div className="relative">
                    <input 
                      type={maskKey ? "password" : "text"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={settings?.gemini_api_key === 'REDACTED' ? "••••••••••••••••" : "AIzaSy..."}
                      className="w-full p-2.5 pr-10 rounded-lg glass-input text-xs"
                      required={settings?.gemini_api_key !== 'REDACTED'}
                    />
                    <button
                      type="button"
                      onClick={() => setMaskKey(!maskKey)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                    >
                      {maskKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-indigo py-2 px-4 text-xs font-semibold text-white shadow-lg transition-transform active:scale-95 hover:opacity-90"
                >
                  Save API Key
                </button>
              </form>
            </div>

            {/* Ignored Items Manager */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-xs font-bold text-slate-350 uppercase tracking-wider font-semibold">
                Ignored Receipt Items ({ignoredItems.length})
              </h3>
              <p className="text-xs text-slate-400">
                These raw descriptions will be automatically skipped when scanning receipts.
              </p>

              <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/20 max-h-[260px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800/60 bg-slate-900/40 text-slate-450 font-mono text-[10px] uppercase">
                      <th className="p-3">Raw Receipt Description</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ignoredLoading ? (
                      <tr>
                        <td colSpan="2" className="p-4 text-center text-slate-500 font-mono">Loading ignored list...</td>
                      </tr>
                    ) : ignoredItems.length === 0 ? (
                      <tr>
                        <td colSpan="2" className="p-4 text-center text-slate-500 font-mono">No items ignored yet</td>
                      </tr>
                    ) : (
                      ignoredItems.map(item => (
                        <tr key={item.id} className="border-b border-slate-800/30 hover:bg-slate-900/10 transition-colors">
                          <td className="p-3 font-mono text-[11px] text-white">{item.raw_description}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteIgnoredItem(item.id, item.raw_description)}
                              type="button"
                              className="p-1.5 rounded-lg bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 border border-rose-500/10"
                              title="Delete Mapping"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Activity Log Section */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <History className="h-4.5 w-4.5 text-indigo-400" />
            System Activity Log
          </h2>
          {activityLogs.length > 0 && (
            <button
              onClick={handleClearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 border border-rose-500/10 text-xs font-semibold transition-colors"
            >
              <Trash className="h-3.5 w-3.5" />
              Clear Log
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Track modifications to your kitchen inventory and recipes. Revert accidental consumptions or purchases instantly.
        </p>

        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/20">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5 w-32">Action</th>
                <th className="p-3.5">Details</th>
                <th className="p-3.5 text-right w-28">Revert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {logsLoading && activityLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-6 text-center text-slate-500">
                    Loading activity history...
                  </td>
                </tr>
              ) : activityLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-6 text-center text-slate-500">
                    No actions logged yet. Go make some changes in your kitchen!
                  </td>
                </tr>
              ) : (
                activityLogs.map(log => {
                  const isUndone = log.undone === 1;
                  const isUndoing = undoingId === log.id;
                  
                  // Action badge color mapping
                  let badgeClass = "bg-slate-500/10 text-slate-400 border border-slate-500/20";
                  let actionLabel = log.action_type;
                  
                  if (log.action_type === 'add_inventory') {
                    badgeClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                    actionLabel = "Grocery Log";
                  } else if (log.action_type === 'consume_inventory') {
                    badgeClass = "bg-orange-500/10 text-orange-400 border border-orange-500/20";
                    actionLabel = "Consumption";
                  } else if (log.action_type === 'make_recipe') {
                    badgeClass = "bg-purple-500/10 text-purple-400 border border-purple-500/20";
                    actionLabel = "Recipe Make";
                  } else if (log.action_type === 'delete_inventory') {
                    badgeClass = "bg-rose-500/10 text-rose-450 border border-rose-500/20";
                    actionLabel = "Delete Pkg";
                  } else if (log.action_type === 'update_inventory') {
                    badgeClass = "bg-blue-500/10 text-blue-400 border border-blue-500/20";
                    actionLabel = "Update Pkg";
                  } else if (log.action_type === 'purchase_shopping_list') {
                    badgeClass = "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
                    actionLabel = "Checkout";
                  }

                  // Format timestamp
                  let formattedTime = log.created_at;
                  try {
                    // SQLite CURRENT_TIMESTAMP is UTC without 'Z', append Z to convert properly
                    const utcDateStr = log.created_at.endsWith('Z') ? log.created_at : log.created_at + 'Z';
                    const date = new Date(utcDateStr);
                    formattedTime = date.toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  } catch (e) {
                    console.error('Error formatting log date:', e);
                  }

                  return (
                    <tr key={log.id} className="hover:bg-slate-900/10 transition-colors">
                      <td className="p-3.5 text-slate-400 whitespace-nowrap">{formattedTime}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeClass}`}>
                          {actionLabel}
                        </span>
                      </td>
                      <td className={`p-3.5 font-medium ${isUndone ? 'line-through text-slate-550' : 'text-white'}`}>
                        {log.description}
                      </td>
                      <td className="p-3.5 text-right">
                        {isUndone ? (
                          <span className="text-[10px] font-bold uppercase text-slate-500 px-2 py-0.5 bg-slate-800/40 rounded border border-slate-800">
                            Undone
                          </span>
                        ) : (
                          <button
                            onClick={() => handleUndo(log.id)}
                            disabled={isUndoing}
                            className={`flex items-center gap-1.5 ml-auto px-2.5 py-1 rounded bg-indigo-650/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600/25 hover:text-white transition-colors text-[11px] font-bold ${isUndoing ? 'opacity-60 cursor-not-allowed' : ''}`}
                            title="Undo this action"
                          >
                            <RotateCcw className={`h-3 w-3 ${isUndoing ? 'animate-spin' : ''}`} />
                            Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal 
        isOpen={!!deleteConfirm}
        title={deleteConfirm?.title || "Confirm Action"}
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
