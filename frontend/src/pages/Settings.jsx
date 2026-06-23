import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, Check, X, Sliders, MapPin, AlertCircle 
} from 'lucide-react';

export default function Settings() {
  const [locations, setLocations] = useState([]);
  const [newLocationName, setNewLocationName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  useEffect(() => {
    fetchLocations();
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
    if (!window.confirm(`Are you sure you want to delete "${name}"? Any inventory items kept in this location will be set to unspecified.`)) return;

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
    </div>
  );
}
