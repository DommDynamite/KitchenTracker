import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, ChevronRight, ChevronLeft, Check, X, 
  RotateCw, BookOpen, Clock, Heart, Users, Trash2, Upload, PlusCircle, MinusCircle, Layers,
  List, Sliders, LayoutGrid, Edit, ChevronDown
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

export default function Recipes() {
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [activeRecipeDetails, setActiveRecipeDetails] = useState(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [checkedEquipment, setCheckedEquipment] = useState({});
  const [stepsViewMode, setStepsViewMode] = useState('slider'); // 'slider' or 'list'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [selectedIngredientIds, setSelectedIngredientIds] = useState([]);
  const [ingDropdownOpen, setIngDropdownOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Derived state for recipe steps to avoid array out-of-bounds/glitches during transition
  const stepIndexToUse = activeRecipeDetails?.steps && activeStepIndex < activeRecipeDetails.steps.length ? activeStepIndex : 0;
  const currentStep = activeRecipeDetails?.steps?.[stepIndexToUse] || {};

  // Form State for creating a recipe
  const [recipeName, setRecipeName] = useState('');
  const [recipeDesc, setRecipeDesc] = useState('');
  const [recipeServings, setRecipeServings] = useState(2);
  const [recipeImage, setRecipeImage] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState([{ product_id: '', amount: '', unit: 'pieces' }]);
  const [recipeEquipment, setRecipeEquipment] = useState(['']);
  const [recipeSteps, setRecipeSteps] = useState([{ instruction: '', image_path: '' }]);
  const [uploadingImageIndex, setUploadingImageIndex] = useState(null); // 'main' or number for steps

  const fetchRecipesAndProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recipes');
      const data = await res.json();
      setRecipes(data);

      const prodRes = await fetch('/api/products');
      const prodData = await prodRes.json();
      setProducts(prodData);
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipesAndProducts();
  }, []);

  const fetchRecipeDetails = async (id) => {
    try {
      const res = await fetch(`/api/recipes/${id}`);
      const data = await res.json();
      setActiveRecipeDetails(data);
      setActiveStepIndex(0);
      setCheckedEquipment({});
    } catch (error) {
      console.error('Error fetching recipe details:', error);
    }
  };

  const handleOpenRecipe = (recipe) => {
    setActiveRecipe(recipe);
    fetchRecipeDetails(recipe.id);
  };

  const handleCloseRecipe = () => {
    setActiveRecipe(null);
    setActiveRecipeDetails(null);
    fetchRecipesAndProducts(); // refresh inventory stats in the list
  };

  const handleMakeRecipe = async () => {
    if (!activeRecipeDetails) return;
    try {
      const res = await fetch(`/api/recipes/${activeRecipeDetails.recipe.id}/make`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        // Refresh details (which updates ingredient stock status)
        fetchRecipeDetails(activeRecipeDetails.recipe.id);
      } else {
        alert(`Error making recipe: ${data.error}`);
      }
    } catch (error) {
      console.error('Error consuming recipe ingredients:', error);
    }
  };

  const handleDeleteRecipe = async (id, e) => {
    e.stopPropagation();
    setDeleteConfirm({
      message: 'Are you sure you want to delete this recipe?',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/recipes/${id}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            if (activeRecipe && activeRecipe.id === id) {
              handleCloseRecipe();
            } else {
              fetchRecipesAndProducts();
            }
          }
        } catch (error) {
          console.error('Error deleting recipe:', error);
        }
      }
    });
  };

  // Image Upload helper
  const handleUploadImage = async (e, type, stepIdx = null) => {
    const file = e.target.files[0];
    if (!file) return;

    if (type === 'main') setUploadingImageIndex('main');
    else setUploadingImageIndex(stepIdx);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.imageUrl) {
        if (type === 'main') {
          setRecipeImage(data.imageUrl);
        } else {
          const updatedSteps = [...recipeSteps];
          updatedSteps[stepIdx].image_path = data.imageUrl;
          setRecipeSteps(updatedSteps);
        }
      }
    } catch (error) {
      console.error('Image upload failed:', error);
    } finally {
      setUploadingImageIndex(null);
    }
  };

  // Dynamic ingredient form modifiers
  const addIngredientRow = () => {
    setRecipeIngredients([...recipeIngredients, { product_id: '', amount: '', unit: 'pieces' }]);
  };
  const removeIngredientRow = (idx) => {
    setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx));
  };
  const handleIngredientChange = (idx, field, value) => {
    const updated = [...recipeIngredients];
    updated[idx][field] = value;
    setRecipeIngredients(updated);
  };

  // Dynamic Equipment row modifiers
  const addEquipmentRow = () => {
    setRecipeEquipment([...recipeEquipment, '']);
  };
  const removeEquipmentRow = (idx) => {
    setRecipeEquipment(recipeEquipment.filter((_, i) => i !== idx));
  };
  const handleEquipmentChange = (idx, value) => {
    const updated = [...recipeEquipment];
    updated[idx] = value;
    setRecipeEquipment(updated);
  };

  // Dynamic Steps row modifiers
  const addStepRow = () => {
    setRecipeSteps([...recipeSteps, { instruction: '', image_path: '' }]);
  };
  const removeStepRow = (idx) => {
    setRecipeSteps(recipeSteps.filter((_, i) => i !== idx));
  };
  const handleStepChange = (idx, field, value) => {
    const updated = [...recipeSteps];
    updated[idx][field] = value;
    setRecipeSteps(updated);
  };

  const handleEditRecipeClick = async (recipe, e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`);
      const data = await res.json();
      
      setEditingRecipe(recipe);
      setRecipeName(data.recipe.name);
      setRecipeDesc(data.recipe.description || '');
      setRecipeServings(data.recipe.servings);
      setRecipeImage(data.recipe.image_path || '');
      
      // Populate ingredients
      if (data.ingredients && data.ingredients.length > 0) {
        setRecipeIngredients(data.ingredients.map(ing => ({
          product_id: ing.product_id.toString(),
          amount: ing.amount.toString(),
          unit: ing.unit
        })));
      } else {
        setRecipeIngredients([{ product_id: '', amount: '', unit: 'pieces' }]);
      }
      
      // Populate equipment
      if (data.equipment && data.equipment.length > 0) {
        setRecipeEquipment(data.equipment.map(eq => eq.name));
      } else {
        setRecipeEquipment(['']);
      }
      
      // Populate steps
      if (data.steps && data.steps.length > 0) {
        setRecipeSteps(data.steps.map(step => ({
          instruction: step.instruction,
          image_path: step.image_path || ''
        })));
      } else {
        setRecipeSteps([{ instruction: '', image_path: '' }]);
      }
      
      setShowAddModal(true);
    } catch (error) {
      console.error('Error fetching recipe details for edit:', error);
      alert('Failed to load recipe details for editing.');
    }
  };

  const handleSaveRecipe = async (e) => {
    e.preventDefault();
    if (!recipeName || recipeIngredients.some(i => !i.product_id || !i.amount)) {
      alert('Recipe name and ingredients are required.');
      return;
    }

    const payload = {
      name: recipeName,
      description: recipeDesc,
      servings: parseFloat(recipeServings) || 2,
      image_path: recipeImage || null,
      ingredients: recipeIngredients.map(i => ({
        product_id: parseInt(i.product_id),
        amount: parseFloat(i.amount),
        unit: i.unit
      })),
      equipment: recipeEquipment.filter(eq => eq.trim() !== ''),
      steps: recipeSteps.filter(s => s.instruction.trim() !== '')
    };

    try {
      const url = editingRecipe ? `/api/recipes/${editingRecipe.id}` : '/api/recipes';
      const method = editingRecipe ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowAddModal(false);
        setEditingRecipe(null);
        fetchRecipesAndProducts();
      } else {
        const err = await res.json();
        alert(`Error saving recipe: ${err.error}`);
      }
    } catch (error) {
      console.error('Error saving recipe:', error);
    }
  };

  const handleToggleEquipment = (eqName) => {
    setCheckedEquipment(prev => ({
      ...prev,
      [eqName]: !prev[eqName]
    }));
  };

  const toggleIngredient = (id) => {
    if (id === 'All') {
      setSelectedIngredientIds([]);
    } else {
      const numericId = parseInt(id);
      setSelectedIngredientIds(prev => 
        prev.includes(numericId)
          ? prev.filter(i => i !== numericId)
          : [...prev, numericId]
      );
    }
  };

  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesIngredient = selectedIngredientIds.length === 0 || 
      selectedIngredientIds.every(id => r.ingredientProductIds && r.ingredientProductIds.includes(id));
      
    return matchesSearch && matchesIngredient;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* List Page Header */}
      {!activeRecipe && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Recipe <span className="text-glow font-bold">Manager</span>
            </h1>
            <p className="text-slate-400 mt-1">Design recipes, checklist prep items, and auto-consume ingredients from stock.</p>
          </div>
          <button 
            onClick={() => {
              setEditingRecipe(null);
              setRecipeName('');
              setRecipeDesc('');
              setRecipeServings(2);
              setRecipeImage('');
              setRecipeIngredients([{ product_id: '', amount: '', unit: 'pieces' }]);
              setRecipeEquipment(['']);
              setRecipeSteps([{ instruction: '', image_path: '' }]);
              setShowAddModal(true);
            }}
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-indigo px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95 hover:opacity-90"
          >
            <Plus className="h-4.5 w-4.5" /> Create Recipe
          </button>
        </div>
      )}

      {/* Detail Page Header */}
      {activeRecipe && (
        <div className="flex items-center gap-3">
          <button 
            onClick={handleCloseRecipe}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-300 transition-colors"
          >
            <ChevronLeft className="h-4.5 w-4.5" /> Back to Recipes
          </button>
        </div>
      )}

      {/* Main Container */}
      {!activeRecipe ? (
        <>
          {/* Controls Bar */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between glass-panel p-4 rounded-xl">
            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1 max-w-2xl w-full">
              <div className="relative flex-1 flex items-center">
                <Search className="absolute left-3.5 h-4.5 w-4.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search recipes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg glass-input text-sm"
                />
              </div>

              {/* Filter by Ingredient Dropdown */}
              <div className="relative w-full sm:w-64">
                <button 
                  type="button"
                  onClick={() => setIngDropdownOpen(!ingDropdownOpen)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-700/80 bg-slate-900/50 text-sm font-semibold text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
                >
                  <span className="truncate">
                    {selectedIngredientIds.length === 0 
                      ? 'All Ingredients' 
                      : selectedIngredientIds.length === 1 
                        ? products.find(p => p.id === selectedIngredientIds[0])?.name || '1 Ingredient'
                        : `${selectedIngredientIds.length} Ingredients`}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400 ml-1.5 shrink-0" />
                </button>

                {ingDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIngDropdownOpen(false)} />
                    <div className="absolute left-0 mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-955/95 backdrop-blur-md p-2 shadow-2xl z-20 space-y-0.5 animate-scale-up">
                      <div className="flex justify-between items-center px-2 py-1.5 border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                        <span>Filter Ingredients</span>
                        {selectedIngredientIds.length > 0 && (
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedIngredientIds([]); }}
                            className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer text-[10px]"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-0.5">
                        <button
                          type="button"
                          onClick={() => toggleIngredient('All')}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-905 text-left transition-colors text-slate-200 cursor-pointer text-xs"
                        >
                          <span className="truncate">All Ingredients</span>
                          {selectedIngredientIds.length === 0 && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                        </button>
                        {products.map(p => {
                          const isChecked = selectedIngredientIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => toggleIngredient(p.id)}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-905 text-left transition-colors text-slate-200 cursor-pointer text-xs"
                            >
                              <span className="truncate">{p.name} {p.brand ? `(${p.brand})` : ''}</span>
                              {isChecked && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Grid / List View Toggle */}
            <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 p-1 rounded-lg self-end md:self-auto">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="h-4.5 w-4.5" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
                title="List View"
              >
                <List className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {/* Recipes List */}
          {loading ? (
            <div className="flex h-48 justify-center items-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className="glass-panel p-12 text-center rounded-2xl flex flex-col items-center">
              <BookOpen className="h-16 w-16 opacity-30 text-slate-400 mb-4" />
              <h3 className="text-xl font-bold text-white">No Recipes Found</h3>
              <p className="text-slate-500 mt-1">Design your first culinary masterpiece by clicking "Create Recipe" above.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRecipes.map(recipe => (
                <div 
                  key={recipe.id}
                  onClick={() => handleOpenRecipe(recipe)}
                  className="glass-panel rounded-2xl overflow-hidden cursor-pointer hover:border-indigo-500/30 transition-all flex flex-col group h-[320px]"
                >
                  <div className="h-40 w-full relative bg-slate-900 flex items-center justify-center overflow-hidden">
                    {recipe.image_path ? (
                      <img 
                        src={recipe.image_path} 
                        alt={recipe.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                    ) : (
                      <BookOpen className="h-12 w-12 text-slate-700 group-hover:text-indigo-400 transition-colors" />
                    )}
                    <div className="absolute right-3 top-3 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={(e) => handleEditRecipeClick(recipe, e)}
                        className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800 text-slate-400 hover:text-indigo-400 hover:border-indigo-950 transition-colors"
                        title="Edit Recipe"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteRecipe(recipe.id, e)}
                        className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-950 transition-colors"
                        title="Delete Recipe"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-glow truncate">
                        {recipe.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">
                        {recipe.description || 'No description provided.'}
                      </p>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-500 mt-3 pt-3 border-t border-slate-800/60 font-semibold">
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-indigo-400" /> Yields {recipe.servings} srv
                      </span>
                      <span className="text-indigo-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        Cook recipe <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List View UI */
            <div className="glass-panel overflow-hidden rounded-2xl border border-slate-800/60 animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs text-slate-200">
                  <thead className="border-b border-slate-800 bg-slate-950/40 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Recipe</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-6 py-4">Yield</th>
                      <th className="px-6 py-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/10">
                    {filteredRecipes.map(recipe => (
                      <tr 
                        key={recipe.id}
                        onClick={() => handleOpenRecipe(recipe)}
                        className="group hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4 font-semibold text-white">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-lg border border-slate-855 bg-slate-900/50 flex items-center justify-center shrink-0 overflow-hidden">
                              {recipe.image_path ? (
                                <img 
                                  src={recipe.image_path} 
                                  alt={recipe.name} 
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <BookOpen className="h-5 w-5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                              )}
                            </div>
                            <div>
                              <span className="text-sm font-bold text-white group-hover:text-glow block truncate max-w-xs">{recipe.name}</span>
                              <span className="text-[10px] text-indigo-400 font-medium">Click to view/cook</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-slate-400 line-clamp-2 max-w-md">
                            {recipe.description || 'No description provided.'}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300 bg-slate-850 px-2 py-0.5 rounded border border-slate-800">
                            <Users className="h-3 w-3 text-indigo-400" /> {recipe.servings} srv
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenRecipe(recipe)}
                              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                              title="Cook Recipe"
                            >
                              Cook
                            </button>
                            <button
                              onClick={(e) => handleEditRecipeClick(recipe, e)}
                              className="p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-indigo-400 hover:border-indigo-950 transition-colors"
                              title="Edit Recipe"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteRecipe(recipe.id, e)}
                              className="p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-rose-400 hover:border-rose-950 transition-colors"
                              title="Delete Recipe"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : !activeRecipeDetails ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 animate-fade-in">
          <RotateCw className="h-8 w-8 text-indigo-500 animate-spin" />
          <p className="text-slate-400 text-sm font-semibold animate-pulse">Loading recipe details...</p>
        </div>
      ) : (
        /* Detailed Recipe View Screen */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          {/* Left panel: Info & Ingredients */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Glass Box */}
            <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row gap-6">
              {activeRecipeDetails?.recipe.image_path && (
                <div className="w-full md:w-48 h-40 rounded-xl overflow-hidden shrink-0">
                  <img 
                    src={activeRecipeDetails.recipe.image_path} 
                    alt={activeRecipeDetails.recipe.name} 
                    className="w-full h-full object-cover" 
                  />
                </div>
              )}
              <div className="flex flex-col justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">{activeRecipeDetails?.recipe.name}</h2>
                  <p className="text-sm text-slate-400 mt-2">{activeRecipeDetails?.recipe.description}</p>
                </div>
                 <div className="flex flex-wrap gap-4 text-xs font-semibold text-indigo-400 mt-4 pt-3 border-t border-slate-800 animate-fade-in">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" /> Servings: {activeRecipeDetails?.recipe.servings}
                  </span>
                  {activeRecipeDetails?.recipe.totalCalories !== null && activeRecipeDetails?.recipe.totalCalories !== undefined && (
                    <>
                      <span className="text-slate-700">•</span>
                      <span className="flex items-center gap-1 text-amber-400">
                        <Layers className="h-4 w-4" /> Total Calories: {activeRecipeDetails.recipe.totalCalories} kcal
                      </span>
                      <span className="text-slate-700">•</span>
                      <span className="flex items-center gap-1 text-amber-400">
                        Calories / Serving: {Math.round(activeRecipeDetails.recipe.totalCalories / activeRecipeDetails.recipe.servings)} kcal
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Ingredients Check-list */}
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-indigo-400" /> Ingredients Inventory Check
                </h3>
                {activeRecipeDetails && (
                  <button
                    onClick={handleMakeRecipe}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-indigo px-4 py-2 text-xs font-bold text-white shadow hover:opacity-90 active:scale-95 transition-all"
                  >
                    <Check className="h-4 w-4" /> Make Recipe (Consume Items)
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-800/60 space-y-3">
                {activeRecipeDetails?.ingredients.map(ing => (
                  <div key={ing.id} className="flex justify-between items-center py-2.5 first:pt-0">
                    <div>
                      <span className="font-semibold text-white text-sm">{ing.product_name}</span>
                      <span className="text-xs text-slate-400 block mt-0.5">
                        Required: {ing.amount} {ing.unit} 
                        {ing.unit !== ing.prod_unit && ` (converts to ~${ing.requiredInProdUnit.toFixed(1)} ${ing.prod_unit})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs text-slate-500 block">In stock</span>
                        <span className={`text-xs font-bold ${ing.inStock ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {ing.availableAmount.toFixed(1)} {ing.prod_unit}
                        </span>
                      </div>
                      <div className={`p-1.5 rounded-full ${
                        ing.inStock ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {ing.inStock ? <Check className="h-4.5 w-4.5" /> : <X className="h-4.5 w-4.5" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step-by-Step interactive Slider or List */}
            {activeRecipeDetails?.steps && activeRecipeDetails.steps.length > 0 && (
              <div className="glass-panel p-6 rounded-2xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <h3 className="text-lg font-bold text-white">
                    Instructions Steps
                  </h3>
                  
                  {/* View Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => setStepsViewMode(prev => prev === 'slider' ? 'list' : 'slider')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-xs transition-all duration-300 active:scale-95 ${
                      stepsViewMode === 'list'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.25)]' 
                        : 'glass-input border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {stepsViewMode === 'slider' ? (
                      <>
                        <List className="h-3.5 w-3.5" />
                        Show List View
                      </>
                    ) : (
                      <>
                        <Sliders className="h-3.5 w-3.5" />
                        Show Slider View
                      </>
                    )}
                  </button>
                </div>
                {activeRecipeDetails.steps.length === 0 ? (
                  <div className="glass-card p-6 text-center rounded-xl border border-slate-800">
                    <p className="text-slate-400 text-sm italic">No steps registered for this recipe.</p>
                  </div>
                ) : stepsViewMode === 'slider' ? (
                  <div className="glass-card p-5 rounded-xl border border-slate-800 space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">
                        Step {stepIndexToUse + 1} of {activeRecipeDetails.steps.length}
                      </span>
                    </div>

                    <div className="flex flex-col md:flex-row gap-5 items-center">
                      {currentStep.image_path && (
                        <div className="w-full md:w-40 h-32 rounded-lg overflow-hidden shrink-0 border border-slate-800">
                          <img 
                            src={currentStep.image_path} 
                            alt={`Step ${stepIndexToUse + 1}`} 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                      )}
                      <p className="text-slate-200 text-sm leading-relaxed flex-1">
                        {currentStep.instruction}
                      </p>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-slate-850">
                      <button
                        onClick={() => setActiveStepIndex(prev => Math.max(0, prev - 1))}
                        disabled={stepIndexToUse === 0}
                        className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-xs text-white"
                      >
                        <ChevronLeft className="h-4 w-4" /> Previous
                      </button>
                      <button
                        onClick={() => setActiveStepIndex(prev => Math.min(activeRecipeDetails.steps.length - 1, prev + 1))}
                        disabled={stepIndexToUse === activeRecipeDetails.steps.length - 1}
                        className="flex items-center gap-1 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-xs text-white"
                      >
                        Next <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Step List UI */
                  <div className="space-y-4 animate-fade-in">
                    {activeRecipeDetails.steps.map((step, idx) => (
                      <div 
                        key={step.id || idx} 
                        className="glass-card p-5 rounded-xl border border-slate-850 flex flex-col md:flex-row gap-5 items-start"
                      >
                        <div className="flex gap-3 items-center md:items-start shrink-0">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400 font-extrabold text-xs border border-indigo-500/20">
                            {idx + 1}
                          </span>
                          {step.image_path && (
                            <div className="w-24 h-18 rounded-lg overflow-hidden border border-slate-800 md:hidden shrink-0">
                              <img 
                                src={step.image_path} 
                                alt={`Step ${idx + 1}`} 
                                className="w-full h-full object-cover" 
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col md:flex-row gap-5 items-start flex-1 w-full">
                          {step.image_path && (
                            <div className="w-32 h-24 rounded-lg overflow-hidden border border-slate-800 hidden md:block shrink-0">
                              <img 
                                src={step.image_path} 
                                alt={`Step ${idx + 1}`} 
                                className="w-full h-full object-cover" 
                              />
                            </div>
                          )}
                          <p className="text-slate-200 text-sm leading-relaxed flex-1 pt-0.5">
                            {step.instruction}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right panel: Equipment Checklist */}
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <h3 className="text-lg font-bold text-white pb-2 border-b border-slate-800">
                Equipment Prep Checklist
              </h3>
              
              {activeRecipeDetails?.equipment.length === 0 ? (
                <p className="text-xs text-slate-500">No special tools or equipment listed.</p>
              ) : (
                <div className="space-y-2">
                  {activeRecipeDetails?.equipment.map(eq => (
                    <label 
                      key={eq.id}
                      onClick={() => handleToggleEquipment(eq.name)}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                        checkedEquipment[eq.name] 
                          ? 'bg-indigo-950/10 border-indigo-500/30 text-slate-400 line-through' 
                          : 'glass-card border-slate-850 text-white'
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        checked={!!checkedEquipment[eq.name]}
                        onChange={() => {}} // handled by click on label
                        className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-semibold">{eq.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Recipe Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl glass-panel p-6 space-y-4 my-8 relative animate-scale-up">
            <button 
              onClick={() => {
                setShowAddModal(false);
                setEditingRecipe(null);
              }}
              className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
              <BookOpen className="h-5 w-5 text-indigo-400" />
              {editingRecipe ? 'Edit Recipe' : 'Create New Recipe'}
            </h2>

            <form onSubmit={handleSaveRecipe} className="space-y-4 text-xs text-slate-200 max-h-[70vh] overflow-y-auto pr-1">
              {/* Recipe Meta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-slate-400 font-semibold">Recipe Name *</label>
                  <input 
                    type="text" 
                    value={recipeName} 
                    onChange={(e) => setRecipeName(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input"
                    placeholder="e.g. Grandma's Chocolate Chip Cookies"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-slate-400 font-semibold">Yield (Servings)</label>
                  <input 
                    type="number" 
                    value={recipeServings} 
                    onChange={(e) => setRecipeServings(e.target.value)}
                    className="w-full p-2.5 rounded-lg glass-input"
                    min="1"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Description</label>
                <textarea 
                  value={recipeDesc} 
                  onChange={(e) => setRecipeDesc(e.target.value)}
                  className="w-full p-2.5 rounded-lg glass-input h-16"
                  placeholder="Describe your dish..."
                />
              </div>

              {/* Main Image Upload */}
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-semibold">Main Recipe Image</label>
                <div className="flex gap-4 items-center">
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2 rounded-lg transition-colors">
                    <Upload className="h-4 w-4" />
                    {uploadingImageIndex === 'main' ? 'Uploading...' : 'Upload Image'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleUploadImage(e, 'main')}
                      className="hidden"
                    />
                  </label>
                  {recipeImage && (
                    <img src={recipeImage} alt="Main preview" className="h-10 w-10 object-cover rounded-lg border border-slate-700" />
                  )}
                </div>
              </div>

              {/* Ingredients Setup */}
              <div className="space-y-2 border-t border-slate-800/80 pt-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-white text-sm">Ingredients Required</h4>
                  <button 
                    type="button" 
                    onClick={addIngredientRow}
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-bold"
                  >
                    <PlusCircle className="h-4.5 w-4.5" /> Add Ingredient
                  </button>
                </div>
                {recipeIngredients.map((ing, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select 
                      value={ing.product_id}
                      onChange={(e) => handleIngredientChange(idx, 'product_id', e.target.value)}
                      className="flex-1 p-2 rounded glass-input bg-slate-900 text-slate-200"
                    >
                      <option value="">-- Select Product --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.brand ? `(${p.brand})` : ''}
                        </option>
                      ))}
                    </select>
                    <input 
                      type="number" 
                      step="any"
                      placeholder="Amt"
                      value={ing.amount}
                      onChange={(e) => handleIngredientChange(idx, 'amount', e.target.value)}
                      className="w-16 p-2 rounded glass-input text-center"
                    />
                    <select 
                      value={ing.unit}
                      onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                      className="w-24 p-2 rounded glass-input bg-slate-900"
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="fl_oz">fl_oz</option>
                      <option value="pieces">pieces</option>
                      <option value="servings">servings</option>
                      <option value="cups">cups</option>
                      <option value="%">%</option>
                    </select>
                    {recipeIngredients.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => removeIngredientRow(idx)}
                        className="text-rose-400 hover:text-rose-300 p-1"
                      >
                        <MinusCircle className="h-4.5 w-4.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Equipment list */}
              <div className="space-y-2 border-t border-slate-800/80 pt-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-white text-sm">Equipment Needed</h4>
                  <button 
                    type="button" 
                    onClick={addEquipmentRow}
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-bold"
                  >
                    <PlusCircle className="h-4.5 w-4.5" /> Add Equipment
                  </button>
                </div>
                {recipeEquipment.map((eq, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      placeholder="e.g. Blender, Food Processor, Whisk"
                      value={eq}
                      onChange={(e) => handleEquipmentChange(idx, e.target.value)}
                      className="w-full p-2 rounded glass-input"
                    />
                    {recipeEquipment.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => removeEquipmentRow(idx)}
                        className="text-rose-400 hover:text-rose-300 p-1"
                      >
                        <MinusCircle className="h-4.5 w-4.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Step instructions */}
              <div className="space-y-3 border-t border-slate-800/80 pt-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-white text-sm">Instructions Steps</h4>
                  <button 
                    type="button" 
                    onClick={addStepRow}
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-bold"
                  >
                    <PlusCircle className="h-4.5 w-4.5" /> Add Step
                  </button>
                </div>
                {recipeSteps.map((step, idx) => (
                  <div key={idx} className="glass-card p-3 rounded-lg border border-slate-850 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-indigo-300">Step {idx + 1}</span>
                      {recipeSteps.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => removeStepRow(idx)}
                          className="text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-0.5"
                        >
                          <MinusCircle className="h-4 w-4" /> Remove
                        </button>
                      )}
                    </div>
                    <textarea 
                      placeholder="Describe what to do in this step..."
                      value={step.instruction}
                      onChange={(e) => handleStepChange(idx, 'instruction', e.target.value)}
                      className="w-full p-2 rounded glass-input h-14"
                    />
                    <div className="flex gap-4 items-center">
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded transition-colors text-[10px] font-bold">
                        <Upload className="h-3 w-3" />
                        {uploadingImageIndex === idx ? 'Uploading...' : 'Upload Step Photo'}
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleUploadImage(e, 'step', idx)}
                          className="hidden"
                        />
                      </label>
                      {step.image_path && (
                        <img src={step.image_path} alt={`Step ${idx + 1}`} className="h-8 w-8 object-cover rounded border border-slate-750" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Submit / Cancel */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button 
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingRecipe(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex items-center gap-1 px-5 py-2 rounded-lg bg-gradient-indigo text-white font-semibold shadow-lg hover:opacity-90 transition-opacity"
                >
                  <Check className="h-4 w-4" /> Save Recipe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={!!deleteConfirm}
        title="Delete Recipe"
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
