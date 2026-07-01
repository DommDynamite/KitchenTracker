import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, ChevronRight, ChevronLeft, Check, X, 
  RotateCw, BookOpen, Clock, Heart, Users, Trash2, Upload, PlusCircle, MinusCircle, Layers,
  List, Sliders, LayoutGrid, Edit, ChevronDown, Link, Link2Off, Sparkles, MessageSquare, Send, Trash
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../context/ToastContext';

export default function Recipes({ settings = {} }) {
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [activeRecipeDetails, setActiveRecipeDetails] = useState(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [checkedEquipment, setCheckedEquipment] = useState({});
  const [stepsViewMode, setStepsViewMode] = useState(() => {
    return localStorage.getItem('kitchen_recipes_steps_view_mode') || 'slider';
  });
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('kitchen_recipes_view_mode') || 'grid';
  });

  useEffect(() => {
    localStorage.setItem('kitchen_recipes_steps_view_mode', stepsViewMode);
  }, [stepsViewMode]);

  useEffect(() => {
    localStorage.setItem('kitchen_recipes_view_mode', viewMode);
  }, [viewMode]);

  const [selectedIngredientIds, setSelectedIngredientIds] = useState([]);
  const [ingDropdownOpen, setIngDropdownOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { showToast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustedIngredients, setAdjustedIngredients] = useState([]);

  // Gemini Chatbot Panel States
  const [showGeminiPanel, setShowGeminiPanel] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Derived state for recipe steps to avoid array out-of-bounds/glitches during transition
  const stepIndexToUse = activeRecipeDetails?.steps && activeStepIndex < activeRecipeDetails.steps.length ? activeStepIndex : 0;
  const currentStep = activeRecipeDetails?.steps?.[stepIndexToUse] || {};

  // Form State for creating a recipe
  const [recipeName, setRecipeName] = useState('');
  const [recipeDesc, setRecipeDesc] = useState('');
  const [recipeServings, setRecipeServings] = useState(2);
  const [recipeImage, setRecipeImage] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState([{ product_id: '', name: '', amount: '', unit: 'pieces', isUnlinked: false }]);
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

  // Gemini chat operation helpers
  const fetchChats = async () => {
    try {
      const recipeIdParam = activeRecipe ? `?recipe_id=${activeRecipe.id}` : '';
      const res = await fetch(`/api/gemini/chats${recipeIdParam}`);
      if (res.ok) {
        const data = await res.json();
        setChats(data);
        if (data.length > 0) {
          // Keep active chat selected if it still exists, otherwise select the first one
          const activeExists = data.some(c => c.id === activeChatId);
          if (!activeExists) {
            setActiveChatId(data[0].id);
            setChatMessages(data[0].messages || []);
          }
        } else {
          setActiveChatId(null);
          setChatMessages([]);
        }
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    }
  };

  useEffect(() => {
    if (settings?.receipt_scanning_enabled && showGeminiPanel) {
      fetchChats();
    }
  }, [activeRecipe, showGeminiPanel]);

  const handleCreateChat = async () => {
    try {
      const res = await fetch('/api/gemini/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe_id: activeRecipe ? activeRecipe.id : null,
          title: activeRecipe ? `Chat about ${activeRecipe.name}` : `Culinary Chat ${new Date().toLocaleDateString()}`
        })
      });
      if (res.ok) {
        const newChat = await res.json();
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        setChatMessages([]);
      }
    } catch (err) {
      console.error('Error creating chat:', err);
    }
  };

  const handleDeleteChat = async (chatId, e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/gemini/chats/${chatId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setChats(prev => prev.filter(c => c.id !== chatId));
        if (activeChatId === chatId) {
          setActiveChatId(null);
          setChatMessages([]);
        }
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isGenerating) return;

    let chatId = activeChatId;
    if (!chatId) {
      // Auto-create chat if none is active
      try {
        const createRes = await fetch('/api/gemini/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipe_id: activeRecipe ? activeRecipe.id : null,
            title: activeRecipe ? `Chat about ${activeRecipe.name}` : `Culinary Chat ${new Date().toLocaleDateString()}`
          })
        });
        if (createRes.ok) {
          const newChat = await createRes.json();
          setChats(prev => [newChat, ...prev]);
          chatId = newChat.id;
          setActiveChatId(chatId);
        } else {
          return;
        }
      } catch (err) {
        console.error('Failed to auto-create chat:', err);
        return;
      }
    }

    const textToSend = chatInput;
    setChatInput('');
    const optimisticMessages = [...chatMessages, { role: 'user', content: textToSend }];
    setChatMessages(optimisticMessages);
    setIsGenerating(true);

    try {
      const res = await fetch(`/api/gemini/chats/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend })
      });
      if (res.ok) {
        const updatedMessages = await res.json();
        setChatMessages(updatedMessages);
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: updatedMessages } : c));
      } else {
        const err = await res.json();
        setChatMessages([...optimisticMessages, { role: 'model', content: `Error: ${err.error || 'Failed to send message'}` }]);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setChatMessages([...optimisticMessages, { role: 'model', content: 'Error: Network connection failed.' }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateSpicePercentage = async (productId, newPercentage) => {
    try {
      const res = await fetch(`/api/spices/${productId}/percentage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentage: newPercentage })
      });
      if (res.ok) {
        showToast('Spice percentage updated!', 'success');
        setActiveRecipeDetails(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            ingredients: prev.ingredients.map(ing => {
              if (ing.product_id === productId) {
                const totalConts = newPercentage === 0 ? Math.max(0, ing.totalContainers - 1) : ing.totalContainers;
                const nextPct = newPercentage === 0 && totalConts > 0 ? 100 : newPercentage;
                return {
                  ...ing,
                  activePercentage: nextPct,
                  totalContainers: totalConts,
                  inStock: totalConts > 0
                };
              }
              return ing;
            })
          };
        });
      } else {
        showToast('Failed to update spice level', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating spice level', 'error');
    }
  };

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

  const extractRecipeJson = (text) => {
    if (!text) return null;
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (_) {}
    }
    return null;
  };

  const renderFormattedText = (text) => {
    if (!text) return null;
    
    // First, unify underscores to asterisks
    const unified = text
      .replace(/__(.*?)__/g, '**$1**')
      .replace(/_(.*?)_/g, '*$1*');

    // Split by newlines so we can render line breaks properly
    const lines = unified.split('\n');
    
    return lines.map((line, lineIdx) => {
      // Split each line by bold markers: **bold**
      const boldParts = line.split(/(\*\*.*?\*\*)/g);
      const parsedElements = boldParts.map((part, partIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          // Split bold text by italic markers: *italic*
          const italicParts = boldText.split(/(\*.*?\*)/g);
          return (
            <strong key={partIdx} className="font-bold text-white">
              {italicParts.map((item, itemIdx) => {
                if (item.startsWith('*') && item.endsWith('*')) {
                  return <em key={itemIdx} className="italic text-slate-350">{item.slice(1, -1)}</em>;
                }
                return item;
              })}
            </strong>
          );
        } else {
          // Split regular text by italic markers
          const italicParts = part.split(/(\*.*?\*)/g);
          return italicParts.map((item, itemIdx) => {
            if (item.startsWith('*') && item.endsWith('*')) {
              return <em key={itemIdx} className="italic text-slate-300">{item.slice(1, -1)}</em>;
            }
            return item;
          });
        }
      });

      return (
        <React.Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {parsedElements}
        </React.Fragment>
      );
    });
  };

  const renderMessageContent = (content) => {
    if (!content) return null;
    const jsonMatch = content.match(/([\s\S]*?)```json\s*([\s\S]*?)\s*```([\s\S]*)/);
    if (jsonMatch) {
      const beforeText = jsonMatch[1].trim();
      const jsonStr = jsonMatch[2].trim();
      const afterText = jsonMatch[3].trim();
      
      let recipeData = null;
      try {
        recipeData = JSON.parse(jsonStr);
      } catch (e) {
        // Fallback to plain text if JSON is invalid
        return <p className="whitespace-pre-wrap">{renderFormattedText(content)}</p>;
      }

      return (
        <div className="space-y-3 text-left">
          {beforeText && <p className="whitespace-pre-wrap">{renderFormattedText(beforeText)}</p>}
          
          {/* Styled Recipe Card Preview */}
          <div className="bg-slate-950/80 border border-indigo-500/20 rounded-xl p-3.5 space-y-3 my-2 shadow-inner text-left select-text">
            <div className="flex items-start justify-between gap-2 border-b border-slate-850 pb-2">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">Recipe Preview</span>
                <h4 className="text-sm font-bold text-white mt-1">{recipeData.name}</h4>
              </div>
              {recipeData.servings && (
                <span className="text-[10px] bg-slate-800 text-slate-355 px-2 py-0.5 rounded border border-slate-700 font-semibold shrink-0">
                  {recipeData.servings} servings
                </span>
              )}
            </div>
            
            {recipeData.description && (
              <p className="text-[11px] text-slate-400 italic line-clamp-3 leading-relaxed">{recipeData.description}</p>
            )}

            {recipeData.ingredients && recipeData.ingredients.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-450 block uppercase tracking-wider">Ingredients:</span>
                <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5 pl-1">
                  {recipeData.ingredients.map((ing, idx) => (
                    <li key={idx} className="truncate">
                      <span className="font-semibold text-slate-200">{ing.amount} {ing.unit}</span> {ing.name || ing.product_name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recipeData.steps && recipeData.steps.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-450 block uppercase tracking-wider">Instructions:</span>
                <ol className="list-decimal list-inside text-[11px] text-slate-300 space-y-1 pl-1">
                  {recipeData.steps.map((step, idx) => {
                    const instructionText = typeof step === 'object' ? step.instruction : step;
                    return (
                      <li key={idx} className="line-clamp-2 leading-relaxed">
                        {instructionText}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            
            <button
              type="button"
              onClick={() => handleImportRecipe(recipeData)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-450 font-bold text-xs cursor-pointer transition-all active:scale-95 mt-1"
            >
              <Plus className="h-3.5 w-3.5" /> Import to Recipes
            </button>
          </div>

          {afterText && <p className="whitespace-pre-wrap">{renderFormattedText(afterText)}</p>}
        </div>
      );
    }
    
    return <p className="whitespace-pre-wrap">{renderFormattedText(content)}</p>;
  };

  const handleImportRecipe = async (recipeJson) => {
    try {
      const res = await fetch('/api/recipes/import-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipeJson)
      });
      if (res.ok) {
        const resolved = await res.json();
        setEditingRecipe(null);
        setRecipeName(resolved.name);
        setRecipeDesc(resolved.description);
        setRecipeServings(resolved.servings);
        setRecipeImage('');
        setRecipeIngredients(resolved.ingredients);
        setRecipeEquipment(resolved.equipment);
        setRecipeSteps(resolved.steps);
        setShowAddModal(true);
        showToast('Recipe parsed successfully! Review and click Save.', 'success');
      } else {
        showToast('Failed to resolve recipe ingredients.', 'error');
      }
    } catch (err) {
      console.error('Error importing recipe:', err);
      showToast('Failed to parse recipe.', 'error');
    }
  };

  const handleMakeRecipe = async () => {
    if (!activeRecipeDetails) return;
    try {
      const res = await fetch(`/api/recipes/${activeRecipeDetails.recipe.id}/make`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        // Refresh details (which updates ingredient stock status)
        fetchRecipeDetails(activeRecipeDetails.recipe.id);
      } else {
        showToast(`Error making recipe: ${data.error}`, 'error');
      }
    } catch (error) {
      console.error('Error consuming recipe ingredients:', error);
    }
  };

  const handleOpenAdjustModal = () => {
    if (!activeRecipeDetails) return;
    const cloned = activeRecipeDetails.ingredients.map(ing => ({
      product_id: ing.product_id,
      product_name: ing.product_name,
      amount: ing.amount,
      originalAmount: ing.amount,
      unit: ing.unit,
      prod_unit: ing.prod_unit
    }));
    setAdjustedIngredients(cloned);
    setShowAdjustModal(true);
  };

  const handleScaleIngredients = async (factor) => {
    const scaled = await Promise.all(adjustedIngredients.map(async (ing, idx) => {
      const originalIng = activeRecipeDetails.ingredients[idx];
      const targetAmountInOriginalUnit = originalIng.amount * factor;
      if (ing.unit === originalIng.unit) {
        return {
          ...ing,
          amount: parseFloat(targetAmountInOriginalUnit.toFixed(2))
        };
      } else {
        try {
          const res = await fetch(`/api/convert-unit?amount=${targetAmountInOriginalUnit}&from=${originalIng.unit}&to=${ing.unit}&product_id=${ing.product_id}`);
          const data = await res.json();
          if (res.ok) {
            return {
              ...ing,
              amount: parseFloat(data.result.toFixed(2))
            };
          }
        } catch (e) {
          console.error(e);
        }
        return ing;
      }
    }));
    setAdjustedIngredients(scaled);
  };

  const handleUnitChange = async (idx, newUnit) => {
    const ing = adjustedIngredients[idx];
    if (ing.unit === newUnit) return;
    try {
      const res = await fetch(`/api/convert-unit?amount=${ing.amount}&from=${ing.unit}&to=${newUnit}&product_id=${ing.product_id}`);
      const data = await res.json();
      if (res.ok) {
        setAdjustedIngredients(prev => prev.map((item, i) => 
          i === idx 
            ? { ...item, amount: parseFloat(data.result.toFixed(2)), unit: newUnit } 
            : item
        ));
      } else {
        showToast(`Error converting unit: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error('Error converting unit:', err);
      showToast('Failed to convert unit.', 'error');
    }
  };

  const handleConfirmMakeRecipe = async () => {
    try {
      const res = await fetch(`/api/recipes/${activeRecipeDetails.recipe.id}/make`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: adjustedIngredients.map(ing => ({
            product_id: ing.product_id,
            amount: parseFloat(ing.amount),
            unit: ing.unit
          }))
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setShowAdjustModal(false);
        fetchRecipeDetails(activeRecipeDetails.recipe.id);
      } else {
        showToast(`Error making recipe: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error('Error making recipe:', err);
      showToast('Failed to consume ingredients.', 'error');
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
      showToast('Failed to load recipe details for editing.', 'error');
    }
  };

  const handleSaveRecipe = async (e) => {
    e.preventDefault();
    if (!recipeName || recipeIngredients.some(i => (i.isUnlinked ? !i.name : !i.product_id) || !i.amount)) {
      showToast('Recipe name and ingredient details are required.', 'error');
      return;
    }

    const payload = {
      name: recipeName,
      description: recipeDesc,
      servings: parseFloat(recipeServings) || 2,
      image_path: recipeImage || null,
      ingredients: recipeIngredients.map(i => ({
        product_id: i.isUnlinked ? null : parseInt(i.product_id),
        name: i.isUnlinked ? i.name : null,
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
        showToast('Recipe saved successfully!', 'success');
      } else {
        const err = await res.json();
        showToast(`Error saving recipe: ${err.error}`, 'error');
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

  const matchSearchText = (text, query) => {
    if (!text) return false;
    if (!query) return true;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(Boolean);
    if (queryWords.length === 0) return true;
    const textWords = lowerText.split(/[^a-z0-9]+/i).filter(Boolean);
    return queryWords.every(qWord => 
      textWords.some(tWord => tWord.startsWith(qWord))
    );
  };

  const filteredRecipes = recipes.filter(r => {
    const searchTargets = [r.name, r.description].filter(Boolean);
    const matchesSearch = !searchQuery.trim() || searchTargets.some(target => matchSearchText(target, searchQuery));
      
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
          <div className="flex items-center gap-3">
            {settings?.receipt_scanning_enabled && (
              <button
                type="button"
                onClick={() => setShowGeminiPanel(!showGeminiPanel)}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer ${
                  showGeminiPanel
                    ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] border border-indigo-400/30'
                    : 'bg-slate-900 border border-slate-700/80 text-indigo-400 hover:border-indigo-500/50'
                }`}
              >
                <Sparkles className="h-4.5 w-4.5" />
                {showGeminiPanel ? 'Close Gemini Assistant' : 'Ask Gemini Assistant'}
              </button>
            )}
            <button 
              onClick={() => {
                setEditingRecipe(null);
                setRecipeName('');
                setRecipeDesc('');
                setRecipeServings(2);
                setRecipeImage('');
                setRecipeIngredients([{ product_id: '', name: '', amount: '', unit: 'pieces', isUnlinked: false }]);
                setRecipeEquipment(['']);
                setRecipeSteps([{ instruction: '', image_path: '' }]);
                setShowAddModal(true);
              }}
              className="flex items-center justify-center gap-2 rounded-lg bg-gradient-indigo px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95 hover:opacity-90"
            >
              <Plus className="h-4.5 w-4.5" /> Create Recipe
            </button>
          </div>
        </div>
      )}

      {/* Detail Page Header */}
      {activeRecipe && (
        <div className="flex items-center justify-between gap-3">
          <button 
            onClick={handleCloseRecipe}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-300 transition-colors"
          >
            <ChevronLeft className="h-4.5 w-4.5" /> Back to Recipes
          </button>

          {settings?.receipt_scanning_enabled && (
            <button
              type="button"
              onClick={() => setShowGeminiPanel(!showGeminiPanel)}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                showGeminiPanel
                  ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.3)] border border-indigo-400/25'
                  : 'bg-slate-900 border border-slate-700 text-indigo-400 hover:border-indigo-500/50'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              {showGeminiPanel ? 'Close Assistant' : 'Ask Gemini about Recipe'}
            </button>
          )}
        </div>
      )}

      {/* Main Layout Container */}
      <div className="flex flex-col lg:flex-row gap-6 items-start relative min-h-[calc(100vh-14rem)] w-full">
        <div className="flex-1 min-w-0 space-y-6 w-full">
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
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleOpenAdjustModal}
                      className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-4 py-2 text-xs font-bold text-indigo-400 shadow active:scale-95 transition-all cursor-pointer"
                    >
                      <Sliders className="h-4 w-4" /> Adjust & Make
                    </button>
                    <button
                      type="button"
                      onClick={handleMakeRecipe}
                      className="flex items-center gap-1.5 rounded-lg bg-gradient-indigo px-4 py-2 text-xs font-bold text-white shadow hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                    >
                      <Check className="h-4 w-4" /> Make Recipe (Consume Items)
                    </button>
                  </div>
                )}
              </div>

              <div className="divide-y divide-slate-800/60 space-y-3">
                {activeRecipeDetails?.ingredients.map(ing => (
                  <div key={ing.id} className="flex justify-between items-center py-2.5 first:pt-0">
                    <div>
                      <span className="font-semibold text-white text-sm">{ing.product_name}</span>
                      <span className="text-xs text-slate-400 block mt-0.5">
                        Required: {ing.amount} {ing.unit} 
                        {ing.product_id && ing.unit !== ing.prod_unit && ` (converts to ~${ing.requiredInProdUnit.toFixed(1)} ${ing.prod_unit})`}
                      </span>
                    </div>
                    {ing.product_id ? (
                      ing.is_spice ? (
                        <div className="flex items-center gap-3">
                          <div className="text-right flex items-center gap-2">
                            <span className="text-[10.5px] text-slate-500 block">Active Fill:</span>
                            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 select-none">
                              <button
                                type="button"
                                onClick={() => handleUpdateSpicePercentage(ing.product_id, Math.max(0, ing.activePercentage - 10))}
                                className="px-1.5 py-0.5 text-xs font-bold text-rose-400 hover:bg-slate-850 rounded cursor-pointer transition-colors active:scale-95"
                                title="Decrease 10%"
                              >
                                -
                              </button>
                              <span className={`text-[10.5px] font-extrabold px-1 font-mono ${
                                ing.activePercentage < (ing.spice_reorder_percentage || 20) ? 'text-rose-400' : 'text-emerald-400'
                              }`}>
                                {ing.totalContainers === 0 ? '0%' : `${ing.activePercentage}%`}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateSpicePercentage(ing.product_id, Math.min(100, ing.activePercentage + 10))}
                                className="px-1.5 py-0.5 text-xs font-bold text-emerald-400 hover:bg-slate-850 rounded cursor-pointer transition-colors active:scale-95"
                                title="Increase 10%"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className={`p-1.5 rounded-full ${
                            ing.inStock ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {ing.inStock ? <Check className="h-4.5 w-4.5" /> : <X className="h-4.5 w-4.5" />}
                          </div>
                        </div>
                      ) : (
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
                      )
                    ) : (
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-semibold select-none">
                        Not Tracked
                      </span>
                    )}
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
    </div>

        {/* Gemini Panel */}
        {settings?.receipt_scanning_enabled && showGeminiPanel && (
          <div className="w-full lg:w-96 shrink-0 fixed lg:static top-[53px] lg:top-auto bottom-[56px] lg:bottom-auto right-0 z-[35] lg:z-40 bg-slate-950/95 border-l border-slate-800 p-4 flex flex-col lg:h-[calc(100vh-14rem)] lg:rounded-2xl lg:bg-slate-950/40 lg:backdrop-blur-md shadow-2xl lg:shadow-none animate-slide-in-right">
            {/* Panel Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
                <span className="font-bold text-white text-sm">Gemini Assistant</span>
              </div>
              <button 
                type="button"
                onClick={() => setShowGeminiPanel(false)}
                className="p-2.5 -mr-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-900 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                title="Close Assistant"
              >
                <X className="h-5.5 w-5.5" />
              </button>
            </div>

            {/* Chat Selection Row */}
            <div className="flex gap-2 mb-3 shrink-0">
              <select
                value={activeChatId || ''}
                onChange={(e) => {
                  const id = e.target.value ? parseInt(e.target.value) : null;
                  setActiveChatId(id);
                  if (id) {
                    const selectedChat = chats.find(c => c.id === id);
                    setChatMessages(selectedChat?.messages || []);
                  } else {
                    setChatMessages([]);
                  }
                }}
                className="flex-1 p-2 rounded glass-input bg-slate-900 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                <option value="">-- Select Chat Session --</option>
                {chats.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleCreateChat}
                className="p-2 rounded bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 font-bold text-xs cursor-pointer transition-colors"
                title="Start new chat session"
              >
                <Plus className="h-4 w-4" />
              </button>
              {activeChatId && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteChat(activeChatId, e)}
                  className="p-2 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 font-bold text-xs cursor-pointer transition-colors"
                  title="Delete active chat session"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Messages Viewport */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 mb-3 scroll-smooth">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400 space-y-3">
                  <MessageSquare className="h-10 w-10 text-slate-600 animate-pulse" />
                  <div>
                    <h5 className="font-bold text-slate-300 text-xs">No active conversation</h5>
                    <p className="text-[10px] text-slate-500 max-w-xs mt-1">
                      Start a chat to ask Gemini for recipe suggestions based on your inventory, or ask details about the open recipe.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateChat}
                    className="py-1.5 px-3 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-450 font-bold text-xs cursor-pointer transition-all"
                  >
                    Start Chatting
                  </button>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                  >
                    <div className={`p-3 rounded-xl text-xs leading-relaxed select-text ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-md'
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                    }`}>
                      {renderMessageContent(msg.content)}
                    </div>
                  </div>
                ))
              )}
              {isGenerating && (
                <div className="flex flex-col max-w-[85%] mr-auto items-start animate-pulse">
                  <div className="p-3 rounded-xl text-xs bg-slate-900 border border-slate-800 text-slate-400 rounded-bl-none flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span>Gemini is thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Row */}
            <form onSubmit={handleSendMessage} className="flex gap-2 shrink-0 border-t border-slate-850 pt-3">
              <input
                type="text"
                placeholder={activeRecipe ? "Ask about this recipe..." : "Ask Gemini about inventory..."}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isGenerating}
                className="flex-1 p-2 rounded-lg glass-input text-xs"
              />
              <button
                type="submit"
                disabled={isGenerating || !chatInput.trim()}
                className="p-2 rounded-lg bg-gradient-indigo text-white font-bold text-xs cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}
      </div>

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
                    {ing.isUnlinked ? (
                      <input 
                        type="text" 
                        placeholder="Ingredient name (e.g. Cumin)"
                        value={ing.name || ''}
                        onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}
                        className="flex-1 p-2 rounded glass-input text-slate-200 text-xs"
                      />
                    ) : (
                      <select 
                        value={ing.product_id}
                        onChange={(e) => handleIngredientChange(idx, 'product_id', e.target.value)}
                        className="flex-1 p-2 rounded glass-input bg-slate-900 text-slate-200 text-xs"
                      >
                        <option value="">-- Select Product --</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.brand ? `(${p.brand})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    
                    {/* Toggle Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const nextState = !ing.isUnlinked;
                        handleIngredientChange(idx, 'isUnlinked', nextState);
                        if (nextState) {
                          handleIngredientChange(idx, 'product_id', '');
                        } else {
                          handleIngredientChange(idx, 'name', '');
                        }
                      }}
                      className={`p-2 rounded border cursor-pointer transition-colors ${
                        ing.isUnlinked
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-400'
                          : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-400'
                      }`}
                      title={ing.isUnlinked ? "Unlinked (Click to link to registered product)" : "Linked (Click to use custom text spice)"}
                    >
                      {ing.isUnlinked ? <Link2Off className="h-4 w-4" /> : <Link className="h-4 w-4" />}
                    </button>

                    <input 
                      type="number" 
                      step="any"
                      placeholder="Amt"
                      value={ing.amount}
                      onChange={(e) => handleIngredientChange(idx, 'amount', e.target.value)}
                      className="w-16 p-2 rounded glass-input text-center text-xs"
                    />
                    <select 
                      value={ing.unit}
                      onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                      className="w-24 p-2 rounded glass-input bg-slate-900 text-xs"
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

      {/* Adjust Recipe Ingredients Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl glass-panel p-6 space-y-5 my-8 relative animate-scale-up">
            <button 
              onClick={() => setShowAdjustModal(false)}
              className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
              <Sliders className="h-5 w-5 text-indigo-400" />
              Adjust Ingredient Amounts
            </h2>

            {/* Quick Scaling Buttons */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Quick Scale Recipe</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleScaleIngredients(0.5)}
                  className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                >
                  ½x (Half)
                </button>
                <button
                  type="button"
                  onClick={() => handleScaleIngredients(1.0)}
                  className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                >
                  1x (Original)
                </button>
                <button
                  type="button"
                  onClick={() => handleScaleIngredients(2.0)}
                  className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                >
                  2x (Double)
                </button>
              </div>
            </div>

            {/* Ingredient List for Adjustment */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Ingredients</label>
              {adjustedIngredients.map((ing, idx) => (
                <div key={idx} className="flex flex-col gap-1.5 p-3 rounded-xl border border-slate-850 bg-slate-900/40">
                  <span className="text-sm font-semibold text-white truncate">{ing.product_name}</span>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={ing.amount}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setAdjustedIngredients(prev => prev.map((item, i) => 
                          i === idx ? { ...item, amount: val } : item
                        ));
                      }}
                      className="flex-1 p-2 rounded-lg glass-input text-xs font-semibold"
                    />
                    <select
                      value={ing.unit}
                      onChange={(e) => handleUnitChange(idx, e.target.value)}
                      className="w-28 p-2 rounded-lg glass-input bg-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="oz">oz</option>
                      <option value="lb">lb</option>
                      <option value="ml">ml</option>
                      <option value="l">l</option>
                      <option value="fl_oz">fl_oz</option>
                      <option value="cups">cups</option>
                      <option value="pieces">pieces</option>
                      <option value="servings">servings</option>
                      <option value="%">%</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button 
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleConfirmMakeRecipe}
                className="flex items-center gap-1 px-5 py-2 rounded-lg bg-gradient-indigo text-white text-xs font-semibold shadow-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                <Check className="h-4 w-4" /> Confirm & Consume
              </button>
            </div>
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
