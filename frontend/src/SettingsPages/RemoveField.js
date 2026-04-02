import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const backendBase = process.env.REACT_APP_BACKEND_URL;

/* ── inject keyframes once ─────────────────────────────────────── */
if (!document.getElementById('rf-styles')) {
  const s = document.createElement('style');
  s.id = 'rf-styles';
  s.textContent = `@keyframes rf-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
}

export default function RemoveField() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();

  // Step 1: What to delete? 'category' or 'subcategory'
  const [deleteType, setDeleteType] = useState(null);
  
  // Category data
  const [availableCategories, setAvailableCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  
  // For category deletion
  const [selectedCategoryToRemove, setSelectedCategoryToRemove] = useState(null);
  const [removeCategoryLoading, setRemoveCategoryLoading] = useState(false);
  const [removeCategoryError, setRemoveCategoryError] = useState(null);
  const [removeCategorySuccess, setRemoveCategorySuccess] = useState(null);

  // For subcategory deletion
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset when delete type changes
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

  // ──────────────────────────────────────────────────────────────
  // DELETE CATEGORY
  // ──────────────────────────────────────────────────────────────
  const confirmRemoveCategory = async () => {
    if (!selectedCategoryToRemove) {
      setRemoveCategoryError('Select a category to remove');
      return;
    }
    setRemoveCategoryLoading(true);
    setRemoveCategoryError(null);
    try {
      const token = await acquireTokenForAdmin();
      const r = await fetch(
        `${backendBase}/api/categories/${encodeURIComponent(selectedCategoryToRemove.id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `Delete failed ${r.status}`);
      }
      setRemoveCategorySuccess(`"${selectedCategoryToRemove.name || selectedCategoryToRemove.categoryName}" has been removed`);
      setAvailableCategories(prev => prev.filter(c => c.id !== selectedCategoryToRemove.id));
      setSelectedCategoryToRemove(null);
      // After 2 seconds, go back to type selection
      setTimeout(() => {
        setDeleteType(null);
        setRemoveCategorySuccess(null);
      }, 2000);
    } catch (err) {
      setRemoveCategoryError(err.message || 'Failed to delete category');
    } finally {
      setRemoveCategoryLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // DELETE SUB-CATEGORIES
  // ──────────────────────────────────────────────────────────────
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

      const r = await fetch(
        `${backendBase}/api/categories/${selectedCategoryForSub.id}`,
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
        `Removed ${selectedSubCategories.length} sub-categor${selectedSubCategories.length === 1 ? 'y' : 'ies'} from "${selectedCategoryForSub.name}"`
      );
      
      setAvailableCategories(prev => prev.map(cat => 
        cat.id === selectedCategoryForSub.id ? updated : cat
      ));
      
      setSelectedCategoryForSub(updated);
      setSelectedSubCategories([]);
      
      await loadCategories();
      
      // After 2 seconds, go back to category selection (not type selection)
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

  // ──────────────────────────────────────────────────────────────
  // RENDER - STEP 1: Choose what to delete
  // ──────────────────────────────────────────────────────────────
  if (!deleteType) {
    return (
      <div style={st.page}>
        <div style={st.header}>
          <div style={st.headerInner}>
            <button onClick={() => navigate('/settings')} style={st.backButton}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginRight: 4 }}>
                <path d="M12 16L6 10L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back to Settings
            </button>
            <h1 style={st.title}>Remove Item</h1>
            <p style={st.subtitle}>Choose what you want to delete from the helpdesk</p>
          </div>
        </div>

        <div style={st.content}>
          <div style={st.choiceContainer}>
            <div 
              style={st.choiceCard}
              onClick={() => handleDeleteTypeSelect('category')}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#ef4444';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={st.choiceIcon}>🗑️</div>
              <h2 style={st.choiceTitle}>Delete Category</h2>
              <p style={st.choiceDesc}>Remove an entire category and all its sub-categories. This action is irreversible.</p>
              <div style={st.choiceWarning}>⚠️ Affects all tickets in this category</div>
            </div>

            <div 
              style={st.choiceCard}
              onClick={() => handleDeleteTypeSelect('subcategory')}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#f59e0b';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={st.choiceIcon}>📂</div>
              <h2 style={st.choiceTitle}>Delete Sub-Category</h2>
              <p style={st.choiceDesc}>Remove specific sub-categories from an existing category. The parent category remains.</p>
              <div style={{ ...st.choiceWarning, background: '#fef3c7', color: '#d97706' }}>⚠️ Only removes selected sub-categories</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // RENDER - STEP 2: Delete Category Mode
  // ──────────────────────────────────────────────────────────────
  if (deleteType === 'category') {
    const error = removeCategoryError;
    const success = removeCategorySuccess;
    const loading = removeCategoryLoading || categoriesLoading;

    return (
      <div style={st.page}>
        <div style={st.header}>
          <div style={st.headerInner}>
            <button onClick={goBackToTypeSelection} style={st.backButton}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginRight: 4 }}>
                <path d="M12 16L6 10L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <h1 style={st.title}>Delete Category</h1>
            <p style={st.subtitle}>Select a category to permanently remove</p>
          </div>
        </div>

        <div style={st.content}>
          <div style={st.warningBanner}>
            <span>⚠️</span>
            <span>Deleting a category will remove all its sub-categories and may affect existing tickets. This action cannot be undone.</span>
          </div>

          <div style={st.statsCard}>
            <div style={st.statItem}>
              <span style={st.statLabel}>Total Categories</span>
              <span style={st.statValue}>{availableCategories.length}</span>
            </div>
            <div style={st.statDivider} />
            <div style={st.statItem}>
              <span style={st.statLabel}>Selected</span>
              <span style={st.statValue}>{selectedCategoryToRemove ? 1 : 0}</span>
            </div>
          </div>

          <div style={st.listCard}>
            <div style={st.listHeader}>
              <h2 style={st.listTitle}>Categories</h2>
              <span style={st.listBadge}>{availableCategories.length} categories</span>
            </div>

            {categoriesLoading && (
              <div style={st.centeredState}>
                <div style={st.spinner} />
                <p style={st.dimText}>Loading categories…</p>
              </div>
            )}

            {!categoriesLoading && error && !success && (
              <div style={st.centeredState}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ color: '#ef4444', fontSize: 14, margin: '0 0 1rem' }}>{error}</p>
                <button onClick={loadCategories} style={st.retryBtn}>Retry</button>
              </div>
            )}

            {!categoriesLoading && !error && availableCategories.length === 0 && (
              <div style={st.centeredState}>
                <p style={st.dimText}>No categories found.</p>
              </div>
            )}

            {!categoriesLoading && availableCategories.length > 0 && (
              <div style={st.grid}>
                {availableCategories.map(c => {
                  const isSelected = selectedCategoryToRemove?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCategoryToRemove(c)}
                      style={{
                        ...st.catCard,
                        ...(isSelected ? st.catCardSelected : {}),
                      }}
                    >
                      <div style={{ ...st.catAvatar, background: isSelected ? '#fee2e2' : '#f3f4f6', color: isSelected ? '#ef4444' : '#4b5563' }}>
                        {(c.name || c.categoryName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={st.catInfo}>
                        <div style={st.catName}>{c.name || c.categoryName}</div>
                        <div style={st.catMeta}>
                          <span>{c.subCategories?.length || 0} sub-categories</span>
                        </div>
                      </div>
                      {isSelected && (
                        <div style={st.selectedDot}>
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <circle cx="9" cy="9" r="8" fill="#ef4444"/>
                            <path d="M5 9l3 3 5-5" stroke="white" strokeWidth="1.75"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {success && (
            <div style={st.successMsg}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="#10b981"/>
                <path d="M6 10l3 3 5-6" stroke="white" strokeWidth="2"/>
              </svg>
              {success}
            </div>
          )}

          {error && !categoriesLoading && availableCategories.length > 0 && !success && (
            <div style={st.errorMsg}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="#ef4444"/>
                <path d="M7 7l6 6M13 7l-6 6" stroke="white" strokeWidth="2"/>
              </svg>
              {error}
            </div>
          )}

          <div style={st.actionBarWrap}>
            <div style={st.actionBar}>
              <div style={st.actionInfo}>
                {selectedCategoryToRemove ? (
                  <>
                    <span style={st.actionLabel}>Selected:</span>
                    <span style={st.actionName}>{selectedCategoryToRemove.name || selectedCategoryToRemove.categoryName}</span>
                    <span style={{ ...st.actionLabel, marginLeft: 4, color: '#ef4444', fontStyle: 'italic' }}>
                      — this action is irreversible
                    </span>
                  </>
                ) : (
                  <span style={st.noSelection}>No category selected</span>
                )}
              </div>
              <div style={st.actionBtns}>
                <button onClick={goBackToTypeSelection} style={st.cancelBtn}>
                  Back
                </button>
                <button
                  onClick={confirmRemoveCategory}
                  disabled={loading || !selectedCategoryToRemove}
                  style={{
                    ...st.removeBtn,
                    ...(loading || !selectedCategoryToRemove ? st.removeBtnDisabled : {}),
                  }}
                >
                  {loading ? (
                    <>
                      <span style={st.btnSpinner} />
                      Removing Category…
                    </>
                  ) : (
                    'Remove Category'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // RENDER - STEP 2: Delete Sub-Category Mode
  // ──────────────────────────────────────────────────────────────
  if (deleteType === 'subcategory') {
    const error = removeSubError;
    const success = removeSubSuccess;
    const loading = removeSubLoading || categoriesLoading;

    // If no category selected yet, show category list
    if (!selectedCategoryForSub) {
      return (
        <div style={st.page}>
          <div style={st.header}>
            <div style={st.headerInner}>
              <button onClick={goBackToTypeSelection} style={st.backButton}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginRight: 4 }}>
                  <path d="M12 16L6 10L12 4" stroke="currentColor" strokeWidth="2"/>
                </svg>
                Back
              </button>
              <h1 style={st.title}>Delete Sub-Category</h1>
              <p style={st.subtitle}>First, select a category</p>
            </div>
          </div>

          <div style={st.content}>
            <div style={st.infoBanner}>
              <span>📋</span>
              <span>Select a category to view and delete its sub-categories</span>
            </div>

            <div style={st.statsCard}>
              <div style={st.statItem}>
                <span style={st.statLabel}>Total Categories</span>
                <span style={st.statValue}>{availableCategories.length}</span>
              </div>
            </div>

            <div style={st.listCard}>
              <div style={st.listHeader}>
                <h2 style={st.listTitle}>Select Category</h2>
                <span style={st.listBadge}>{availableCategories.length} categories</span>
              </div>

              {categoriesLoading && (
                <div style={st.centeredState}>
                  <div style={st.spinner} />
                  <p style={st.dimText}>Loading categories…</p>
                </div>
              )}

              {!categoriesLoading && availableCategories.length === 0 && (
                <div style={st.centeredState}>
                  <p style={st.dimText}>No categories found.</p>
                </div>
              )}

              {!categoriesLoading && availableCategories.length > 0 && (
                <div style={st.grid}>
                  {availableCategories.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCategoryForSub(c)}
                      style={st.catCard}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#f59e0b';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div style={st.catAvatar}>
                        {(c.name || c.categoryName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={st.catInfo}>
                        <div style={st.catName}>{c.name || c.categoryName}</div>
                        <div style={st.catMeta}>
                          <span>{c.subCategories?.length || 0} sub-categories</span>
                        </div>
                      </div>
                      <div style={st.chevron}>→</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && !categoriesLoading && (
              <div style={st.errorMsg}>
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

    // Show sub-categories for selected category
    return (
      <div style={st.page}>
        <div style={st.header}>
          <div style={st.headerInner}>
            <button onClick={() => setSelectedCategoryForSub(null)} style={st.backButton}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginRight: 4 }}>
                <path d="M12 16L6 10L12 4" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Back to Categories
            </button>
            <h1 style={st.title}>Delete Sub-Categories</h1>
            <p style={st.subtitle}>
              From <strong style={{ color: '#f59e0b' }}>{selectedCategoryForSub.name}</strong>
            </p>
          </div>
        </div>

        <div style={st.content}>
          <div style={st.infoBanner}>
            <span>✅</span>
            <span>Select the sub-categories you want to remove from this category</span>
          </div>

          <div style={st.statsCard}>
            <div style={st.statItem}>
              <span style={st.statLabel}>Category</span>
              <span style={st.statValue}>{selectedCategoryForSub.name}</span>
            </div>
            <div style={st.statDivider} />
            <div style={st.statItem}>
              <span style={st.statLabel}>Total Sub-Cats</span>
              <span style={st.statValue}>{selectedCategoryForSub.subCategories?.length || 0}</span>
            </div>
            <div style={st.statDivider} />
            <div style={st.statItem}>
              <span style={st.statLabel}>Selected to Delete</span>
              <span style={{ ...st.statValue, color: '#ef4444' }}>{selectedSubCategories.length}</span>
            </div>
          </div>

          <div style={st.listCard}>
            <div style={st.listHeader}>
              <h2 style={st.listTitle}>Sub-Categories in "{selectedCategoryForSub.name}"</h2>
              <div style={st.subActions}>
                <button onClick={selectAllSubs} style={st.subSelectBtn}>Select All</button>
                <button onClick={deselectAllSubs} style={st.subSelectBtn}>Deselect All</button>
              </div>
            </div>

            {(!selectedCategoryForSub.subCategories || selectedCategoryForSub.subCategories.length === 0) ? (
              <div style={st.centeredState}>
                <p style={st.dimText}>No sub-categories in this category.</p>
              </div>
            ) : (
              <div style={st.subGrid}>
                {selectedCategoryForSub.subCategories.map((sub, idx) => (
                  <div
                    key={idx}
                    onClick={() => toggleSubCategory(sub.name)}
                    style={{
                      ...st.subCard,
                      ...(selectedSubCategories.includes(sub.name) ? st.subCardSelected : {}),
                    }}
                  >
                    <div style={st.subCheckbox}>
                      {selectedSubCategories.includes(sub.name) && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 7l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      )}
                    </div>
                    <div style={st.subInfo}>
                      <div style={st.subName}>{sub.name}</div>
                      {sub.description && <div style={st.subDesc}>{sub.description}</div>}
                    </div>
                    {sub.approval?.requireApproval && (
                      <div style={st.approvalBadge}>Requires Approval</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {success && (
            <div style={st.successMsg}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="#10b981"/>
                <path d="M6 10l3 3 5-6" stroke="white" strokeWidth="2"/>
              </svg>
              {success}
            </div>
          )}

          {error && (
            <div style={st.errorMsg}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="#ef4444"/>
                <path d="M7 7l6 6M13 7l-6 6" stroke="white" strokeWidth="2"/>
              </svg>
              {error}
            </div>
          )}

          <div style={st.actionBarWrap}>
            <div style={st.actionBar}>
              <div style={st.actionInfo}>
                {selectedSubCategories.length === 0 ? (
                  <span style={st.noSelection}>Select sub-categories to delete</span>
                ) : (
                  <>
                    <span style={st.actionLabel}>Removing:</span>
                    <span style={{ ...st.actionName, color: '#ef4444' }}>
                      {selectedSubCategories.length} sub-categor{selectedSubCategories.length === 1 ? 'y' : 'ies'}
                    </span>
                  </>
                )}
              </div>
              <div style={st.actionBtns}>
                <button onClick={() => setSelectedCategoryForSub(null)} style={st.cancelBtn}>
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveSubCategories}
                  disabled={loading || selectedSubCategories.length === 0}
                  style={{
                    ...st.removeBtn,
                    ...(loading || selectedSubCategories.length === 0 ? st.removeBtnDisabled : {}),
                  }}
                >
                  {loading ? (
                    <>
                      <span style={st.btnSpinner} />
                      Removing Sub-Categories…
                    </>
                  ) : (
                    `Remove ${selectedSubCategories.length} Sub-Categor${selectedSubCategories.length === 1 ? 'y' : 'ies'}`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/* ── Styles ─────────────────────────────────────────────────────── */
const st = {
  page: {
    minHeight: '100vh',
    background: '#f3f4f6',
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  header: {
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '1.5rem 2rem',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerInner: { maxWidth: 1200, margin: '0 auto' },
  backButton: {
    display: 'inline-flex', alignItems: 'center',
    padding: '0.5rem 1rem', background: '#f9fafb',
    border: '1px solid #e5e7eb', borderRadius: 8,
    fontSize: 14, fontWeight: 500, color: '#4b5563',
    cursor: 'pointer', marginBottom: '1.5rem',
    fontFamily: "'DM Sans', sans-serif",
  },
  title: { fontSize: '2rem', fontWeight: 600, color: '#111827', margin: '0 0 0.5rem', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '1rem', color: '#6b7280', margin: 0, lineHeight: 1.6 },

  content: { maxWidth: 1200, margin: '2rem auto', padding: '0 2rem' },

  choiceContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '2rem',
    marginTop: '2rem',
  },
  choiceCard: {
    background: 'white',
    borderRadius: 16,
    padding: '2rem',
    textAlign: 'center',
    cursor: 'pointer',
    border: '2px solid #e5e7eb',
    transition: 'all 0.2s ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  choiceIcon: { fontSize: 48, marginBottom: '1rem' },
  choiceTitle: { fontSize: '1.5rem', fontWeight: 600, color: '#111827', margin: '0 0 0.5rem' },
  choiceDesc: { fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1rem', lineHeight: 1.5 },
  choiceWarning: {
    fontSize: '0.75rem',
    padding: '0.5rem',
    background: '#fef2f2',
    borderRadius: 8,
    color: '#dc2626',
    fontWeight: 500,
  },

  warningBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 10,
    color: '#991b1b',
    fontSize: 14,
    marginBottom: '2rem',
  },
  infoBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 10,
    color: '#1e40af',
    fontSize: 14,
    marginBottom: '2rem',
  },

  statsCard: {
    background: 'white', borderRadius: 12, border: '1px solid #e5e7eb',
    padding: '1.5rem 2rem', marginBottom: '2rem',
    display: 'flex', alignItems: 'center', gap: '2rem',
  },
  statItem: { display: 'flex', alignItems: 'baseline', gap: '0.75rem' },
  statLabel: { fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 },
  statValue: { fontSize: '1.5rem', fontWeight: 600, color: '#111827' },
  statDivider: { width: 1, height: '2rem', background: '#e5e7eb' },

  listCard: {
    background: 'white', borderRadius: 12,
    border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '2rem',
  },
  listHeader: {
    padding: '1.25rem 1.75rem', borderBottom: '1px solid #e5e7eb',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#fafafa',
  },
  listTitle: { fontSize: '1.125rem', fontWeight: 600, color: '#111827', margin: 0 },
  listBadge: {
    padding: '0.25rem 0.75rem', background: '#f3f4f6',
    borderRadius: 100, fontSize: '0.875rem', fontWeight: 500, color: '#4b5563',
  },

  grid: {
    padding: '1.5rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1rem',
  },
  catCard: {
    display: 'flex', alignItems: 'center', gap: '1rem',
    padding: '1rem', background: 'white',
    border: '1px solid #e5e7eb', borderRadius: 10,
    cursor: 'pointer', transition: 'all 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    position: 'relative',
  },
  catCardSelected: {
    background: '#fef2f2', borderColor: '#ef4444',
    borderLeft: '4px solid #ef4444',
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(239,68,68,0.12)',
  },
  catAvatar: {
    width: 40, height: 40, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700, flexShrink: 0,
    border: '1px solid #e5e7eb',
    background: '#f3f4f6',
  },
  catInfo: { flex: 1, minWidth: 0 },
  catName: {
    fontSize: 14, fontWeight: 600, color: '#111827',
    marginBottom: 4, whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },
  catMeta: { display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: 11, color: '#9ca3af' },
  selectedDot: { flexShrink: 0 },
  chevron: { fontSize: 18, color: '#9ca3af' },

  subActions: { display: 'flex', gap: '0.5rem' },
  subSelectBtn: {
    padding: '0.25rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    cursor: 'pointer',
    color: '#4b5563',
  },
  subGrid: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  subCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  subCardSelected: {
    background: '#fef2f2',
    borderColor: '#ef4444',
    borderLeft: '3px solid #ef4444',
  },
  subCheckbox: {
    width: 18, height: 18, borderRadius: 4,
    border: '2px solid #d1d5db',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, background: 'white',
  },
  subInfo: { flex: 1 },
  subName: { fontSize: 14, fontWeight: 500, color: '#111827' },
  subDesc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  approvalBadge: {
    padding: '0.25rem 0.5rem', background: '#fef3c7',
    borderRadius: 4, fontSize: 10, fontWeight: 600, color: '#d97706',
  },

  centeredState: { padding: '4rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  dimText: { fontSize: 14, color: '#9ca3af', margin: 0 },
  retryBtn: { padding: '0.5rem 1.25rem', background: '#ef4444', border: 'none', borderRadius: 6, color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  spinner: { width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'rf-spin .8s linear infinite', marginBottom: '1rem' },

  successMsg: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.5rem', background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 10, color: '#065f46', fontSize: 14, fontWeight: 500, marginBottom: '2rem' },
  errorMsg: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', fontSize: 14, fontWeight: 500, marginBottom: '2rem' },

  actionBarWrap: { position: 'sticky', bottom: '2rem', zIndex: 20 },
  actionBar: { background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1rem 1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  actionInfo: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  actionLabel: { fontSize: 14, color: '#6b7280', fontWeight: 500 },
  actionName: { fontSize: 14, fontWeight: 600, color: '#111827' },
  noSelection: { fontSize: 14, color: '#9ca3af', fontStyle: 'italic' },
  actionBtns: { display: 'flex', gap: '1rem', flexShrink: 0 },
  cancelBtn: { padding: '0.625rem 1.25rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontWeight: 500, color: '#4b5563', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  removeBtn: { padding: '0.625rem 1.5rem', background: '#ef4444', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: "'DM Sans', sans-serif", transition: 'background .15s' },
  removeBtnDisabled: { background: '#fca5a5', cursor: 'not-allowed' },
  btnSpinner: { width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'rf-spin .8s linear infinite', display: 'inline-block' },
};