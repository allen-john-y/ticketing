// RemoveField.js - FULL UPDATED with working DELETE
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const backendBase = process.env.REACT_APP_BACKEND_URL;

export default function RemoveField() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();

  const [deleteType, setDeleteType] = useState(null);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategoryToRemove, setSelectedCategoryToRemove] = useState(null);
  const [removeCategoryLoading, setRemoveCategoryLoading] = useState(false);
  const [removeCategoryError, setRemoveCategoryError] = useState(null);
  const [removeCategorySuccess, setRemoveCategorySuccess] = useState(null);
  const [selectedCategoryForSub, setSelectedCategoryForSub] = useState(null);
  const [selectedSubCategories, setSelectedSubCategories] = useState([]);
  const [removeSubLoading, setRemoveSubLoading] = useState(false);
  const [removeSubError, setRemoveSubError] = useState(null);
  const [removeSubSuccess, setRemoveSubSuccess] = useState(null);

  const acquireTokenForAdmin = async () => {
    if (!accounts || !accounts[0]) throw new Error('No signed-in account');
    try {
      const resp = await instance.acquireTokenSilent({
        scopes: ['Group.ReadWrite.All', 'User.Read.All'],
        account: accounts[0],
      });
      return resp.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        const resp = await instance.acquireTokenPopup({
          scopes: ['Group.ReadWrite.All', 'User.Read.All'],
          account: accounts[0],
        });
        return resp.accessToken;
      }
      throw err;
    }
  };

  const loadCategories = async () => {
    setCategoriesLoading(true);
    setRemoveCategoryError(null);
    setRemoveSubError(null);
    try {
      const token = await acquireTokenForAdmin();
      const r = await fetch(`${backendBase}/api/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Failed to load categories ${r.status}`);
      const j = await r.json();
      setAvailableCategories(Array.isArray(j) ? j : []);
    } catch (err) {
      setRemoveCategoryError(err.message || 'Failed to load categories');
      setRemoveSubError(err.message || 'Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleDeleteTypeSelect = (type) => {
    setDeleteType(type);
    setSelectedCategoryToRemove(null);
    setSelectedCategoryForSub(null);
    setSelectedSubCategories([]);
    setRemoveCategoryError(null);
    setRemoveSubError(null);
    setRemoveCategorySuccess(null);
    setRemoveSubSuccess(null);
  };

  const goBackToTypeSelection = () => {
    setDeleteType(null);
    setSelectedCategoryToRemove(null);
    setSelectedCategoryForSub(null);
    setSelectedSubCategories([]);
  };

  const confirmRemoveCategory = async () => {
    if (!selectedCategoryToRemove) {
      setRemoveCategoryError('Select a category to remove');
      return;
    }
    setRemoveCategoryLoading(true);
    setRemoveCategoryError(null);
    try {
      const token = await acquireTokenForAdmin();
      
      // Get the correct ID - MongoDB uses _id
      const categoryId = selectedCategoryToRemove.id || selectedCategoryToRemove._id;
      
      console.log('🗑️ Deleting category with ID:', categoryId);
      
      const r = await fetch(
        `${backendBase}/api/categories/${encodeURIComponent(categoryId)}`,
        { 
          method: 'DELETE', 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          } 
        }
      );
      
      if (!r.ok) {
        const t = await r.text();
        console.error('Delete failed:', r.status, t);
        throw new Error(t || `Delete failed ${r.status}`);
      }
      
      const data = await r.json().catch(() => ({}));
      console.log('✅ Delete success:', data);
      
      setRemoveCategorySuccess(`"${selectedCategoryToRemove.name || selectedCategoryToRemove.categoryName}" has been removed`);
      setAvailableCategories(prev => prev.filter(c => (c.id || c._id) !== categoryId));
      setSelectedCategoryToRemove(null);
      setTimeout(() => {
        setDeleteType(null);
        setRemoveCategorySuccess(null);
      }, 2000);
    } catch (err) {
      console.error('Remove category error:', err);
      setRemoveCategoryError(err.message || 'Failed to delete category');
    } finally {
      setRemoveCategoryLoading(false);
    }
  };

  const toggleSubCategory = (subName) => {
    setSelectedSubCategories(prev => 
      prev.includes(subName) 
        ? prev.filter(s => s !== subName)
        : [...prev, subName]
    );
  };

  const selectAllSubs = () => {
    if (selectedCategoryForSub) {
      const allSubNames = selectedCategoryForSub.subCategories?.map(s => s.name) || [];
      setSelectedSubCategories(allSubNames);
    }
  };

  const deselectAllSubs = () => {
    setSelectedSubCategories([]);
  };

  const confirmRemoveSubCategories = async () => {
  if (!selectedCategoryForSub) {
    setRemoveSubError('Select a category first');
    return;
  }
  if (selectedSubCategories.length === 0) {
    setRemoveSubError('Select at least one sub-category to remove');
    return;
  }

  setRemoveSubLoading(true);
  setRemoveSubError(null);

  try {
    const token = await acquireTokenForAdmin();
    
    const currentSubs = selectedCategoryForSub.subCategories || [];
    const remainingSubs = currentSubs.filter(
      sub => !selectedSubCategories.includes(sub.name)
    );

    const payload = {
      // ✅ ADD THIS - Required by backend
      categoryName: selectedCategoryForSub.categoryName || selectedCategoryForSub.name,
      distributionList: selectedCategoryForSub.distributionList,
      subCategories: remainingSubs,
      dlGroupMembers: selectedCategoryForSub.dlGroupMembers || [],
      dlGroupOwners: selectedCategoryForSub.dlGroupOwners || [],
      updatedBy: {
        id: accounts?.[0]?.homeAccountId || accounts?.[0]?.localAccountId || '',
        name: accounts?.[0]?.name || accounts?.[0]?.username || '',
        mail: accounts?.[0]?.username || '',
      }
    };

    const categoryId = selectedCategoryForSub.id || selectedCategoryForSub._id;

    console.log('📤 Updating category with payload:', payload); // Debug log

    const r = await fetch(
      `${backendBase}/api/categories/${categoryId}`,
      { 
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!r.ok) {
      const errData = await r.json().catch(() => ({}));
      throw new Error(errData.message || `Delete failed ${r.status}`);
    }

    const updated = await r.json();
    
    setRemoveSubSuccess(
      `Removed ${selectedSubCategories.length} sub-categor${selectedSubCategories.length === 1 ? 'y' : 'ies'} from "${selectedCategoryForSub.name || selectedCategoryForSub.categoryName}"`
    );
    
    setAvailableCategories(prev => prev.map(cat => 
      (cat.id || cat._id) === categoryId ? updated : cat
    ));
    
    setSelectedCategoryForSub(updated);
    setSelectedSubCategories([]);
    
    await loadCategories();
    
    setTimeout(() => {
      setSelectedCategoryForSub(null);
      setRemoveSubSuccess(null);
    }, 2000);
    
  } catch (err) {
    setRemoveSubError(err.message || 'Failed to delete sub-categories');
  } finally {
    setRemoveSubLoading(false);
  }
};

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --orange2: #f5a623;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .rf-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    .rf-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .rf-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .rf-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .rf-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .rf-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .rf-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .rf-hero h1 em {
      font-style: normal;
      color: #ef4444;
    }
    .rf-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    .rf-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    .rf-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 24px; display: inline-flex;
      align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .rf-back-btn:hover { color: var(--orange); }

    .rf-choice-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      margin-top: 24px;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .rf-choice-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      padding: 32px;
      cursor: pointer;
      transition: all 0.22s;
      text-align: center;
    }
    .rf-choice-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 16px 40px rgba(0,32,96,0.1);
    }
    .rf-choice-card.danger:hover { border-color: #ef4444; }
    .rf-choice-card.warning:hover { border-color: var(--orange); }

    .rf-choice-icon { font-size: 48px; margin-bottom: 16px; }
    .rf-choice-title {
      font-family: 'Sora', sans-serif;
      font-size: 20px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 12px;
    }
    .rf-choice-desc {
      font-size: 14px; color: var(--muted);
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .rf-choice-warning {
      font-size: 12px; font-weight: 600;
      padding: 8px 16px;
      border-radius: 20px;
      display: inline-block;
    }
    .rf-choice-warning.danger {
      background: #fee2e2;
      color: #991b1b;
    }
    .rf-choice-warning.warning {
      background: #fef3c7;
      color: #92400e;
    }

    .rf-stats-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 20px 28px;
      margin-bottom: 24px;
      display: flex; align-items: center; gap: 32px;
      animation: fadeUp 0.45s 0.05s ease both;
    }

    .rf-stat-item { display: flex; align-items: baseline; gap: 12px; }
    .rf-stat-label {
      font-size: 13px; font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .rf-stat-value {
      font-family: 'Sora', sans-serif;
      font-size: 28px; font-weight: 800;
      color: var(--navy);
    }
    .rf-stat-value.danger { color: #ef4444; }
    .rf-stat-divider { width: 1.5px; height: 32px; background: var(--border); }

    .rf-banner {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 20px;
      border-radius: 14px;
      margin-bottom: 24px;
      font-size: 14px; font-weight: 500;
    }
    .rf-banner.danger {
      background: #fee2e2;
      border: 1.5px solid #ef4444;
      color: #991b1b;
    }
    .rf-banner.info {
      background: #dbeafe;
      border: 1.5px solid var(--navy);
      color: #1e40af;
    }

    .rf-list-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      margin-bottom: 24px;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .rf-list-header {
      padding: 18px 28px;
      background: var(--light);
      border-bottom: 1.5px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }

    .rf-list-title {
      font-family: 'Sora', sans-serif;
      font-size: 15px; font-weight: 700;
      color: var(--navy);
      letter-spacing: 0.03em;
    }

    .rf-list-badge {
      padding: 4px 14px;
      background: var(--navy);
      border-radius: 20px;
      font-size: 12px; font-weight: 700;
      color: white;
    }

    .rf-sub-actions { display: flex; gap: 8px; }
    .rf-sub-select-btn {
      padding: 6px 14px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      font-size: 12px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .rf-sub-select-btn:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .rf-grid {
      padding: 24px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    .rf-category-card {
      display: flex; align-items: center; gap: 16px;
      padding: 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .rf-category-card:hover {
      border-color: var(--navy);
      box-shadow: 0 4px 12px rgba(0,32,96,0.08);
    }
    .rf-category-card.selected {
      background: #fee2e2;
      border-color: #ef4444;
    }

    .rf-cat-avatar {
      width: 48px; height: 48px; border-radius: 12px;
      background: var(--navy);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: 700;
      color: white;
      flex-shrink: 0;
    }
    .rf-category-card.selected .rf-cat-avatar { background: #ef4444; }

    .rf-cat-info { flex: 1; min-width: 0; }
    .rf-cat-name {
      font-size: 15px; font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
    }
    .rf-cat-meta { font-size: 12px; color: var(--muted); }
    .rf-chevron { color: var(--muted); font-size: 18px; }

    .rf-sub-grid {
      padding: 24px;
      display: flex; flex-direction: column; gap: 10px;
    }

    .rf-sub-card {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 18px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .rf-sub-card:hover { border-color: var(--navy); }
    .rf-sub-card.selected {
      background: #fee2e2;
      border-color: #ef4444;
    }

    .rf-sub-checkbox {
      width: 20px; height: 20px; border-radius: 6px;
      border: 2px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      background: var(--white);
    }
    .rf-sub-card.selected .rf-sub-checkbox {
      background: #ef4444;
      border-color: #ef4444;
    }

    .rf-sub-info { flex: 1; }
    .rf-sub-name {
      font-size: 14px; font-weight: 600;
      color: var(--text);
      margin-bottom: 2px;
    }
    .rf-sub-desc { font-size: 12px; color: var(--muted); }
    .rf-approval-badge {
      padding: 4px 10px;
      background: #fef3c7;
      border-radius: 20px;
      font-size: 10px; font-weight: 700;
      color: #92400e;
    }

    .rf-loading { text-align: center; padding: 60px; }
    .rf-spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      animation: spin 0.9s linear infinite;
      margin: 0 auto 20px;
    }

    .rf-empty { text-align: center; padding: 60px; }
    .rf-empty-text { color: var(--muted); font-size: 14px; }

    .rf-success-message {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 24px;
      background: #d1fae5;
      border: 1.5px solid #10b981;
      border-radius: 16px;
      color: #065f46;
      font-size: 14px; font-weight: 600;
      margin-bottom: 24px;
      animation: fadeUp 0.3s ease;
    }

    .rf-error-message {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 24px;
      background: #fee2e2;
      border: 1.5px solid #ef4444;
      border-radius: 16px;
      color: #991b1b;
      font-size: 14px; font-weight: 600;
      margin-bottom: 24px;
      animation: fadeUp 0.3s ease;
    }

    .rf-action-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 100;
      padding: 0 48px 32px 48px;
      background: linear-gradient(to top, var(--bg) 0%, var(--bg) 60%, transparent 100%);
      animation: fadeUp 0.45s 0.2s ease both;
      pointer-events: none;
    }

    .rf-action-bar-inner {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      padding: 20px 28px;
      box-shadow: 0 8px 32px rgba(0,32,96,0.12);
      display: flex; align-items: center; justify-content: space-between;
      gap: 24px;
      max-width: 1320px;
      margin: 0 auto;
      pointer-events: auto;
    }

    .rf-action-info {
      display: flex; align-items: center; gap: 10px;
      flex: 1; flex-wrap: wrap;
      font-size: 14px;
    }

    .rf-action-label { color: var(--muted); font-weight: 600; }
    .rf-action-name { color: var(--text); font-weight: 700; }
    .rf-action-warning { color: #ef4444; font-style: italic; font-size: 13px; }
    .rf-no-selection { color: var(--muted); font-style: italic; }

    .rf-action-buttons { display: flex; gap: 12px; }

    .rf-btn-cancel {
      padding: 14px 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 15px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .rf-btn-cancel:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .rf-btn-remove {
      padding: 14px 32px;
      background: #ef4444;
      border: none;
      border-radius: 14px;
      font-size: 15px; font-weight: 700;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s;
      display: flex; align-items: center; gap: 10px;
      box-shadow: 0 4px 12px rgba(239,68,68,0.2);
    }
    .rf-btn-remove:hover:not(:disabled) {
      background: #dc2626;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(239,68,68,0.25);
    }
    .rf-btn-remove:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .rf-retry-btn {
      padding: 10px 24px;
      background: #ef4444;
      border: none;
      border-radius: 12px;
      font-size: 14px; font-weight: 600;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
    }

    @media (max-width: 768px) {
      .rf-hero { padding: 40px 24px; }
      .rf-content { padding: 24px 20px 140px; }
      .rf-choice-grid { grid-template-columns: 1fr; }
      .rf-grid { grid-template-columns: 1fr; }
      .rf-action-bar { padding: 0 20px 24px 20px; }
      .rf-action-bar-inner { flex-direction: column; }
      .rf-action-buttons { width: 100%; }
      .rf-btn-cancel, .rf-btn-remove { flex: 1; justify-content: center; }
    }
  `;

  // STEP 1: Choose what to delete
  if (!deleteType) {
    return (
      <div className="rf-page">
        <style>{sharedCSS}</style>

        <div className="rf-hero">
          <div className="rf-hero-inner">
            <div className="rf-hero-eyebrow">
              <div className="rf-hero-eyebrow-line" />
              Category Management
            </div>
            <h1>Remove <em>Item</em></h1>
            <p className="rf-hero-sub">Choose what you want to delete from the helpdesk</p>
          </div>
        </div>

        <div className="rf-content">
          <button className="rf-back-btn" onClick={() => navigate('/settings')}>
            ← Back to Settings
          </button>

          <div className="rf-choice-grid">
            <div 
              className="rf-choice-card danger"
              onClick={() => handleDeleteTypeSelect('category')}
            >
              <div className="rf-choice-icon">🗑️</div>
              <h2 className="rf-choice-title">Delete Category</h2>
              <p className="rf-choice-desc">Remove an entire category and all its sub-categories. This action is irreversible.</p>
              <span className="rf-choice-warning danger">⚠️ Affects all tickets in this category</span>
            </div>

            <div 
              className="rf-choice-card warning"
              onClick={() => handleDeleteTypeSelect('subcategory')}
            >
              <div className="rf-choice-icon">📂</div>
              <h2 className="rf-choice-title">Delete Sub-Category</h2>
              <p className="rf-choice-desc">Remove specific sub-categories from an existing category. The parent category remains.</p>
              <span className="rf-choice-warning warning">⚠️ Only removes selected sub-categories</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: Delete Category Mode
  if (deleteType === 'category') {
    const error = removeCategoryError;
    const success = removeCategorySuccess;
    const loading = removeCategoryLoading || categoriesLoading;

    return (
      <div className="rf-page">
        <style>{sharedCSS}</style>

        <div className="rf-hero">
          <div className="rf-hero-inner">
            <div className="rf-hero-eyebrow">
              <div className="rf-hero-eyebrow-line" />
              Category Management
            </div>
            <h1>Delete <em>Category</em></h1>
            <p className="rf-hero-sub">Select a category to permanently remove</p>
          </div>
        </div>

        <div className="rf-content">
          <button className="rf-back-btn" onClick={goBackToTypeSelection}>
            ← Back
          </button>

          <div className="rf-banner danger">
            <span>⚠️</span>
            <span>Deleting a category will remove all its sub-categories and may affect existing tickets. This action cannot be undone.</span>
          </div>

          <div className="rf-stats-card">
            <div className="rf-stat-item">
              <span className="rf-stat-label">Total Categories</span>
              <span className="rf-stat-value">{availableCategories.length}</span>
            </div>
            <div className="rf-stat-divider" />
            <div className="rf-stat-item">
              <span className="rf-stat-label">Selected</span>
              <span className="rf-stat-value danger">{selectedCategoryToRemove ? 1 : 0}</span>
            </div>
          </div>

          <div className="rf-list-card">
            <div className="rf-list-header">
              <span className="rf-list-title">Categories</span>
              <span className="rf-list-badge">{availableCategories.length} categories</span>
            </div>

            {categoriesLoading && (
              <div className="rf-loading">
                <div className="rf-spinner" />
                <p style={{ color: '#64748b', fontSize: 14 }}>Loading categories…</p>
              </div>
            )}

            {!categoriesLoading && error && !success && (
              <div className="rf-loading">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ color: '#ef4444', fontSize: 14, margin: '16px 0' }}>{error}</p>
                <button onClick={loadCategories} className="rf-retry-btn">Retry</button>
              </div>
            )}

            {!categoriesLoading && !error && availableCategories.length === 0 && (
              <div className="rf-empty">
                <p className="rf-empty-text">No categories found.</p>
              </div>
            )}

            {!categoriesLoading && availableCategories.length > 0 && (
              <div className="rf-grid">
                {availableCategories.map(c => {
                  const categoryId = c.id || c._id;
                  const isSelected = (selectedCategoryToRemove?.id || selectedCategoryToRemove?._id) === categoryId;
                  return (
                    <div
                      key={categoryId}
                      className={`rf-category-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedCategoryToRemove(c)}
                    >
                      <div className="rf-cat-avatar">
                        {(c.name || c.categoryName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="rf-cat-info">
                        <div className="rf-cat-name">{c.name || c.categoryName}</div>
                        <div className="rf-cat-meta">{c.subCategories?.length || 0} sub-categories</div>
                      </div>
                      {isSelected && (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <circle cx="10" cy="10" r="9" fill="#ef4444"/>
                          <path d="M6 10l3 3 5-5" stroke="white" strokeWidth="2"/>
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {success && (
            <div className="rf-success-message">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="#10b981"/>
                <path d="M6 10l3 3 5-6" stroke="white" strokeWidth="2"/>
              </svg>
              {success}
            </div>
          )}

          {error && !categoriesLoading && availableCategories.length > 0 && !success && (
            <div className="rf-error-message">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="#ef4444"/>
                <path d="M7 7l6 6M13 7l-6 6" stroke="white" strokeWidth="2"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        <div className="rf-action-bar">
          <div className="rf-action-bar-inner">
            <div className="rf-action-info">
              {selectedCategoryToRemove ? (
                <>
                  <span className="rf-action-label">Selected:</span>
                  <span className="rf-action-name">{selectedCategoryToRemove.name || selectedCategoryToRemove.categoryName}</span>
                  <span className="rf-action-warning">— this action is irreversible</span>
                </>
              ) : (
                <span className="rf-no-selection">No category selected</span>
              )}
            </div>
            <div className="rf-action-buttons">
              <button className="rf-btn-cancel" onClick={goBackToTypeSelection}>Back</button>
              <button
                className="rf-btn-remove"
                onClick={confirmRemoveCategory}
                disabled={loading || !selectedCategoryToRemove}
              >
                {loading ? (
                  <>
                    <span className="rf-spinner" style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: 'white' }} />
                    Removing…
                  </>
                ) : (
                  'Remove Category'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: Delete Sub-Category Mode
  if (deleteType === 'subcategory') {
    const error = removeSubError;
    const success = removeSubSuccess;
    const loading = removeSubLoading || categoriesLoading;

    if (!selectedCategoryForSub) {
      return (
        <div className="rf-page">
          <style>{sharedCSS}</style>

          <div className="rf-hero">
            <div className="rf-hero-inner">
              <div className="rf-hero-eyebrow">
                <div className="rf-hero-eyebrow-line" />
                Category Management
              </div>
              <h1>Delete <em>Sub-Category</em></h1>
              <p className="rf-hero-sub">First, select a category</p>
            </div>
          </div>

          <div className="rf-content">
            <button className="rf-back-btn" onClick={goBackToTypeSelection}>
              ← Back
            </button>

            <div className="rf-banner info">
              <span>📋</span>
              <span>Select a category to view and delete its sub-categories</span>
            </div>

            <div className="rf-stats-card">
              <div className="rf-stat-item">
                <span className="rf-stat-label">Total Categories</span>
                <span className="rf-stat-value">{availableCategories.length}</span>
              </div>
            </div>

            <div className="rf-list-card">
              <div className="rf-list-header">
                <span className="rf-list-title">Select Category</span>
                <span className="rf-list-badge">{availableCategories.length} categories</span>
              </div>

              {categoriesLoading && (
                <div className="rf-loading">
                  <div className="rf-spinner" />
                  <p style={{ color: '#64748b', fontSize: 14 }}>Loading categories…</p>
                </div>
              )}

              {!categoriesLoading && availableCategories.length === 0 && (
                <div className="rf-empty">
                  <p className="rf-empty-text">No categories found.</p>
                </div>
              )}

              {!categoriesLoading && availableCategories.length > 0 && (
                <div className="rf-grid">
                  {availableCategories.map(c => {
                    const categoryId = c.id || c._id;
                    return (
                      <div
                        key={categoryId}
                        className="rf-category-card"
                        onClick={() => setSelectedCategoryForSub(c)}
                      >
                        <div className="rf-cat-avatar">
                          {(c.name || c.categoryName || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="rf-cat-info">
                          <div className="rf-cat-name">{c.name || c.categoryName}</div>
                          <div className="rf-cat-meta">{c.subCategories?.length || 0} sub-categories</div>
                        </div>
                        <span className="rf-chevron">→</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {error && !categoriesLoading && (
              <div className="rf-error-message">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" fill="#ef4444"/>
                  <path d="M7 7l6 6M13 7l-6 6" stroke="white" strokeWidth="2"/>
                </svg>
                {error}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="rf-page">
        <style>{sharedCSS}</style>

        <div className="rf-hero">
          <div className="rf-hero-inner">
            <div className="rf-hero-eyebrow">
              <div className="rf-hero-eyebrow-line" />
              Category Management
            </div>
            <h1>Delete <em>Sub-Categories</em></h1>
            <p className="rf-hero-sub">
              From <strong style={{ color: '#e98404' }}>{selectedCategoryForSub.name || selectedCategoryForSub.categoryName}</strong>
            </p>
          </div>
        </div>

        <div className="rf-content">
          <button className="rf-back-btn" onClick={() => setSelectedCategoryForSub(null)}>
            ← Back to Categories
          </button>

          <div className="rf-banner info">
            <span>✅</span>
            <span>Select the sub-categories you want to remove from this category</span>
          </div>

          <div className="rf-stats-card">
            <div className="rf-stat-item">
              <span className="rf-stat-label">Category</span>
              <span className="rf-stat-value">{selectedCategoryForSub.name || selectedCategoryForSub.categoryName}</span>
            </div>
            <div className="rf-stat-divider" />
            <div className="rf-stat-item">
              <span className="rf-stat-label">Total Sub-Cats</span>
              <span className="rf-stat-value">{selectedCategoryForSub.subCategories?.length || 0}</span>
            </div>
            <div className="rf-stat-divider" />
            <div className="rf-stat-item">
              <span className="rf-stat-label">Selected to Delete</span>
              <span className="rf-stat-value danger">{selectedSubCategories.length}</span>
            </div>
          </div>

          <div className="rf-list-card">
            <div className="rf-list-header">
              <span className="rf-list-title">Sub-Categories in "{selectedCategoryForSub.name || selectedCategoryForSub.categoryName}"</span>
              <div className="rf-sub-actions">
                <button onClick={selectAllSubs} className="rf-sub-select-btn">Select All</button>
                <button onClick={deselectAllSubs} className="rf-sub-select-btn">Deselect All</button>
              </div>
            </div>

            {(!selectedCategoryForSub.subCategories || selectedCategoryForSub.subCategories.length === 0) ? (
              <div className="rf-empty">
                <p className="rf-empty-text">No sub-categories in this category.</p>
              </div>
            ) : (
              <div className="rf-sub-grid">
                {selectedCategoryForSub.subCategories.map((sub, idx) => (
                  <div
                    key={idx}
                    className={`rf-sub-card ${selectedSubCategories.includes(sub.name) ? 'selected' : ''}`}
                    onClick={() => toggleSubCategory(sub.name)}
                  >
                    <div className="rf-sub-checkbox">
                      {selectedSubCategories.includes(sub.name) && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      )}
                    </div>
                    <div className="rf-sub-info">
                      <div className="rf-sub-name">{sub.name}</div>
                      {sub.description && <div className="rf-sub-desc">{sub.description}</div>}
                    </div>
                    {sub.approval?.requireApproval && (
                      <div className="rf-approval-badge">Requires Approval</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {success && (
            <div className="rf-success-message">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="#10b981"/>
                <path d="M6 10l3 3 5-6" stroke="white" strokeWidth="2"/>
              </svg>
              {success}
            </div>
          )}

          {error && (
            <div className="rf-error-message">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="#ef4444"/>
                <path d="M7 7l6 6M13 7l-6 6" stroke="white" strokeWidth="2"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        <div className="rf-action-bar">
          <div className="rf-action-bar-inner">
            <div className="rf-action-info">
              {selectedSubCategories.length === 0 ? (
                <span className="rf-no-selection">Select sub-categories to delete</span>
              ) : (
                <>
                  <span className="rf-action-label">Removing:</span>
                  <span className="rf-action-name" style={{ color: '#ef4444' }}>
                    {selectedSubCategories.length} sub-categor{selectedSubCategories.length === 1 ? 'y' : 'ies'}
                  </span>
                </>
              )}
            </div>
            <div className="rf-action-buttons">
              <button className="rf-btn-cancel" onClick={() => setSelectedCategoryForSub(null)}>Cancel</button>
              <button
                className="rf-btn-remove"
                onClick={confirmRemoveSubCategories}
                disabled={loading || selectedSubCategories.length === 0}
              >
                {loading ? (
                  <>
                    <span className="rf-spinner" style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: 'white' }} />
                    Removing…
                  </>
                ) : (
                  `Remove ${selectedSubCategories.length} Sub-Categor${selectedSubCategories.length === 1 ? 'y' : 'ies'}`
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}