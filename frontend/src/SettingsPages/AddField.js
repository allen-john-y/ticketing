// AddField.js - Redesigned to match Home.js styling
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import {
  useAzureToken,
  useUserSearch,
  SubCategoryForm,
  SubCategoryBadges,
  defaultSubCategory,
  formSubToDb,
  UserSearchDropdown,
  SavingOverlay,
} from './CategoryFormCombined';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const uid = () => `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export default function AddField() {
  const navigate = useNavigate();
  const location = useLocation();
  const { accounts } = useMsal();
  const acquireToken = useAzureToken();
  const memberSearch = useUserSearch(acquireToken);
  const ownerSearch = useUserSearch(acquireToken);
  const agSearch = useUserSearch(acquireToken);

  // Main state
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('create');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [toast, setToast] = useState(null);

  // Step 1: Categories
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Step 2: Sub-Categories
  const [existingSubCats, setExistingSubCats] = useState([]);
  const [newSubCards, setNewSubCards] = useState([]);
  const [editingSubCardId, setEditingSubCardId] = useState(null);

  // Step 3: DL Groups
  const [allDLs, setAllDLs] = useState([]);
  const [dlLoading, setDlLoading] = useState(false);
  const [dlSearchQuery, setDlSearchQuery] = useState('');
  const [showCreateDL, setShowCreateDL] = useState(false);
  const [creatingDL, setCreatingDL] = useState(false);
  const [dlError, setDlError] = useState(null);
  const [newDL, setNewDL] = useState({ name: '', emailPrefix: '', members: [], owners: [] });

  // Step 4: Assignment Groups
  const [existingGroups, setExistingGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroupForPreview, setSelectedGroupForPreview] = useState(null);
  const [agError, setAgError] = useState(null);

  // Load all categories on mount
  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoadingCats(true);
    try {
      const res = await fetch(`${BACKEND}/api/categories`);
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load categories:', err);
      setCategories([]);
    } finally {
      setLoadingCats(false);
    }
  };

  // Load DLs when entering step 3
  const loadDLs = useCallback(async () => {
    setDlLoading(true);
    setDlError(null);
    try {
      const token = await acquireToken();
      const query = new URLSearchParams({
        $filter: 'mailEnabled eq true and securityEnabled eq false',
        $select: 'id,displayName,mail,mailNickname,description,groupTypes',
        $top: '200',
      });
      const res = await fetch(`https://graph.microsoft.com/v1.0/groups?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Graph error ${res.status}`);
      const { value = [] } = await res.json();
      setAllDLs(value.filter(g => !g.groupTypes || g.groupTypes.length === 0));
    } catch (e) {
      setDlError(`Could not load distribution lists. ${e.message}`);
    } finally {
      setDlLoading(false);
    }
  }, [acquireToken]);

  // Load existing assignment groups
  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const res = await fetch(`${BACKEND}/api/assignment-groups`);
      const data = await res.json();
      setExistingGroups(Array.isArray(data) ? data : []);
    } catch {
      setExistingGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    if (step === 3) loadDLs();
    if (step === 4) loadGroups();
  }, [step, loadDLs, loadGroups]);

  // Handle category selection (edit mode)
  const handleSelectCategory = (category) => {
    setSelectedCategory(category);
    setMode('edit');
    setExistingSubCats(category.subCategories || []);
    setStep(2);
  };

  // Handle create new category
  const handleCreateNew = () => {
    if (!newCategoryName.trim()) {
      setError('Category name is required');
      return;
    }
    setSelectedCategory({
      id: uid(),
      categoryName: newCategoryName.trim(),
      name: newCategoryName.trim(),
      subCategories: [],
    });
    setMode('create');
    setExistingSubCats([]);
    setStep(2);
  };

  // Sub-category management
  const addNewSubCard = () => {
    const newCard = {
      fid: uid(),
      data: defaultSubCategory(),
      open: true,
      saved: false,
      selectedDL: null,
      dlMembers: [],
      dlOwners: [],
      assignmentGroup: null,
    };
    setNewSubCards(prev => [...prev, newCard]);
    setEditingSubCardId(newCard.fid);
  };

  const updateSubCard = (fid, patch) => {
    setNewSubCards(prev => prev.map(c => c.fid === fid ? { ...c, ...patch } : c));
  };

  const removeSubCard = (fid) => {
    setNewSubCards(prev => prev.filter(c => c.fid !== fid));
    if (editingSubCardId === fid) {
      setEditingSubCardId(null);
    }
  };

  const confirmSubCard = (fid) => {
    updateSubCard(fid, { open: false, saved: true });
    setEditingSubCardId(fid);
    setStep(3);
  };

  const handleSelectDLForSubCard = async (fid, dl) => {
    const card = newSubCards.find(c => c.fid === fid);
    if (card?.selectedDL?.id === dl.id) return;

    updateSubCard(fid, { selectedDL: dl, dlMembers: [], dlOwners: [] });

    try {
      const token = await acquireToken();
      const [mRes, oRes] = await Promise.all([
        fetch(`https://graph.microsoft.com/v1.0/groups/${dl.id}/members?$select=id,displayName,mail,userPrincipalName`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`https://graph.microsoft.com/v1.0/groups/${dl.id}/owners?$select=id,displayName,mail,userPrincipalName`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
      ]);
      if (mRes.ok) {
        const d = await mRes.json();
        updateSubCard(fid, { dlMembers: d.value || [] });
      }
      if (oRes.ok) {
        const d = await oRes.json();
        updateSubCard(fid, { dlOwners: d.value || [] });
      }
    } catch (e) {
      console.warn('Could not load DL members:', e.message);
    }
  };

  // Create new DL
  const createDL = async () => {
    setDlError(null);
    setCreatingDL(true);
    try {
      const res = await fetch(`${BACKEND}/api/dl/create-dl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDL.name,
          email: `${newDL.emailPrefix}@sandeza-inc.com`,
          members: newDL.members,
          owners: newDL.owners,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create DL');
      showToast('success', 'Distribution List created successfully');
      setNewDL({ name: '', emailPrefix: '', members: [], owners: [] });
      setShowCreateDL(false);
      await loadDLs();
    } catch (err) {
      setDlError(err.message);
      showToast('error', err.message || 'Failed to create DL');
    } finally {
      setCreatingDL(false);
    }
  };

  // Publish/Save everything
  const publish = async () => {
    setError(null);
    setSaving(true);

    // Validate all sub-cards have DL selected
    const missingDL = newSubCards.some(c => !c.selectedDL);
    if (missingDL) {
      setError('All sub-categories must have a Distribution List selected');
      setSaving(false);
      return;
    }

    try {
      const createdBy = {
        id: accounts?.[0]?.homeAccountId || '',
        name: accounts?.[0]?.name || '',
        mail: accounts?.[0]?.username || '',
      };

      // Build sub-categories combining existing and new
      const allSubCategories = [
        ...existingSubCats.map(sub => ({
          ...sub,
          isExisting: true,
        })),
        ...newSubCards.map(card => ({
          ...formSubToDb(card.data),
          distributionList: card.selectedDL ? {
            id: card.selectedDL.id,
            name: card.selectedDL.displayName,
            mail: card.selectedDL.mail || '',
            mailNickname: card.selectedDL.mailNickname || '',
          } : null,
          assignmentGroups: card.assignmentGroup ? [card.assignmentGroup] : [],
          dlGroupMembers: (card.dlMembers || []).map(m => ({
            id: m.id,
            email: m.mail || m.userPrincipalName,
            displayName: m.displayName,
          })),
          dlGroupOwners: (card.dlOwners || []).map(o => ({
            id: o.id,
            email: o.mail || o.userPrincipalName,
            displayName: o.displayName,
          })),
          isExisting: false,
        })),
      ];

      const payload = {
        categoryName: selectedCategory.categoryName || selectedCategory.name,
        name: selectedCategory.categoryName || selectedCategory.name,
        distributionList: newSubCards[0]?.selectedDL ? {
          id: newSubCards[0].selectedDL.id,
          name: newSubCards[0].selectedDL.displayName,
          mail: newSubCards[0].selectedDL.mail || '',
          mailNickname: newSubCards[0].selectedDL.mailNickname || '',
        } : null,
        subCategories: allSubCategories,
        assignmentGroups: [],
        dlGroupMembers: [],
        dlGroupOwners: [],
        createdBy,
      };

      const url = mode === 'create'
        ? `${BACKEND}/api/categories`
        : `${BACKEND}/api/categories/${selectedCategory.id || selectedCategory._id}`;

      const method = mode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Save failed (${res.status})`);
      }

      setSuccess(`Category ${mode === 'create' ? 'created' : 'updated'} successfully!`);
      setTimeout(() => navigate('/settings'), 1600);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const filteredDLs = dlSearchQuery.trim().length < 1
    ? allDLs
    : allDLs.filter(d =>
        d.displayName?.toLowerCase().includes(dlSearchQuery.toLowerCase()) ||
        d.mail?.toLowerCase().includes(dlSearchQuery.toLowerCase())
      );

  const currentSubCard = newSubCards.find(c => c.fid === editingSubCardId);
  const canPublish = newSubCards.length > 0 && 
    newSubCards.every(c => c.saved) && 
    newSubCards.every(c => c.selectedDL);

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

    .af-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Hero Section */
    .af-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .af-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .af-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .af-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .af-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .af-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .af-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .af-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .af-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    .af-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 24px; display: inline-flex;
      align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .af-back-btn:hover { color: var(--orange); }

    /* Step Bar */
    .af-stepbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      padding: 16px 24px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      animation: fadeUp 0.45s 0.05s ease both;
    }

    .af-step {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
    }

    .af-step-num {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      background: var(--bg);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 13px; font-weight: 700;
      color: var(--muted);
      font-family: 'Sora', sans-serif;
    }

    .af-step.active .af-step-num {
      background: var(--navy);
      border-color: var(--navy);
      color: white;
    }

    .af-step.completed .af-step-num {
      background: #10b981;
      border-color: #10b981;
      color: white;
    }

    .af-step-label {
      font-size: 14px; font-weight: 600;
      color: var(--muted);
      font-family: 'Sora', sans-serif;
    }

    .af-step.active .af-step-label {
      color: var(--navy);
    }

    .af-step-connector {
      width: 40px; height: 2px;
      background: var(--border);
      margin: 0 12px;
    }

    /* Cards */
    .af-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 24px;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .af-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 6px;
    }

    .af-card-sub {
      font-size: 14px; color: var(--muted);
      margin-bottom: 24px;
    }

    /* Form Elements */
    .af-label {
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      display: block;
      margin-bottom: 8px;
      font-family: 'Sora', sans-serif;
      letter-spacing: 0.02em;
    }

    .af-input {
      width: 100%;
      padding: 14px 18px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 14px;
      color: var(--text);
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
    }
    .af-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .af-input::placeholder {
      color: var(--muted);
    }

    .af-search-input {
      width: 100%;
      padding: 14px 18px 14px 44px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 14px;
      color: var(--text);
      font-family: 'Lato', sans-serif;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: 16px center;
    }
    .af-search-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }

    /* Buttons */
    .af-btn-primary {
      padding: 12px 24px;
      background: var(--navy);
      border: none;
      border-radius: 14px;
      font-size: 14px; font-weight: 700;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s;
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .af-btn-primary:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,32,96,0.25);
    }
    .af-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .af-btn-secondary {
      padding: 12px 24px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 14px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .af-btn-secondary:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .af-btn-success {
      background: #10b981;
      box-shadow: 0 4px 12px rgba(16,185,129,0.2);
    }
    .af-btn-success:hover {
      background: #059669;
    }

    .af-btn-danger {
      padding: 6px 14px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 12px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .af-btn-danger:hover {
      border-color: #ef4444;
      color: #ef4444;
      background: #fee2e2;
    }

    .af-btn-sm {
      padding: 6px 14px;
      font-size: 12px;
    }

    /* Category Grid */
    .af-category-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }

    .af-category-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .af-category-card:hover {
      border-color: var(--navy);
      transform: translateY(-3px);
      box-shadow: 0 8px 24px rgba(0,32,96,0.1);
    }

    .af-category-name {
      font-family: 'Sora', sans-serif;
      font-size: 16px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 6px;
    }

    .af-category-meta {
      font-size: 13px; color: var(--muted);
      margin-bottom: 12px;
    }

    .af-category-subs {
      display: flex; flex-wrap: wrap; gap: 6px;
    }

    .af-sub-tag {
      font-size: 11px; font-weight: 600;
      padding: 4px 10px;
      background: rgba(0,32,96,0.08);
      border-radius: 20px;
      color: var(--navy);
    }

    /* Sub-Category Cards */
    .af-sub-grid {
      display: flex; flex-direction: column; gap: 12px;
      margin: 20px 0;
    }

    .af-sub-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }
    .af-sub-card.existing {
      background: var(--light);
    }

    .af-sub-header {
      display: flex; align-items: center; gap: 16px;
      padding: 16px 20px;
    }

    .af-sub-icon {
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,32,96,0.08);
      border-radius: 12px;
      font-size: 18px;
      flex-shrink: 0;
    }

    .af-sub-content {
      flex: 1; min-width: 0;
    }

    .af-sub-name {
      font-family: 'Sora', sans-serif;
      font-size: 15px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 6px;
    }

    .af-sub-config {
      display: flex; gap: 8px;
      margin-top: 8px;
    }

    .af-config-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 5px 12px;
      background: var(--bg);
      border-radius: 20px;
      font-size: 11px; font-weight: 600;
      color: var(--muted);
    }
    .af-config-badge.configured {
      background: #d1fae5;
      color: #065f46;
    }

    /* DL Grid */
    .af-dl-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
      margin: 20px 0;
      max-height: 350px;
      overflow-y: auto;
      padding-right: 4px;
    }

    /* New Add Category Button - Orange #e98404 */
    .af-add-category-btn {
      width: 80;
      padding: 14px 24px;
      background: #e98404;
      border: none;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(233,132,4,0.3);
    }
    .af-add-category-btn:hover {
      background: #d07a03;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(233,132,4,0.35);
    }

    .af-dl-card {
      display: flex; align-items: center; gap: 14px;
      padding: 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .af-dl-card:hover {
      border-color: var(--navy);
    }
    .af-dl-card.selected {
      background: rgba(0,32,96,0.04);
      border-color: var(--navy);
    }

    .af-dl-icon {
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,32,96,0.08);
      border-radius: 12px;
      font-size: 20px;
      flex-shrink: 0;
    }

    .af-dl-info {
      flex: 1; min-width: 0;
    }

    .af-dl-name {
      font-family: 'Sora', sans-serif;
      font-size: 14px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 3px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .af-dl-email {
      font-size: 12px; color: var(--muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* Alert */
    .af-alert-error {
      padding: 14px 18px;
      background: #fee2e2;
      border: 1.5px solid #ef4444;
      border-radius: 14px;
      color: #991b1b;
      font-size: 14px; font-weight: 500;
      margin-bottom: 20px;
      display: flex; align-items: center; gap: 10px;
    }

    .af-alert-success {
      padding: 14px 18px;
      background: #d1fae5;
      border: 1.5px solid #10b981;
      border-radius: 14px;
      color: #065f46;
      font-size: 14px; font-weight: 500;
      margin-bottom: 20px;
    }

    /* Spinner */
    .af-spinner {
      width: 20px; height: 20px;
      border: 2px solid var(--border);
      border-top-color: var(--navy);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }

    /* Divider */
    .af-divider {
      height: 1.5px;
      background: var(--border);
      margin: 24px 0;
    }

    /* Flex Helpers */
    .af-flex-between {
      display: flex; align-items: center; justify-content: space-between;
    }
    .af-flex-end {
      display: flex; justify-content: flex-end;
    }
    .af-gap-2 { gap: 12px; }
    .af-gap-1 { gap: 8px; }
    .af-mt-4 { margin-top: 20px; }
    .af-mb-4 { margin-bottom: 20px; }
    .af-row { display: flex; align-items: center; }
    .af-flex-1 { flex: 1; }
    .af-actions { display: flex; align-items: center; gap: 8px; }
    .af-center { text-align: center; }
    .af-muted { color: var(--muted); font-size: 14px; }

    .af-error-close {
      margin-left: auto;
      background: none;
      border: none;
      color: #991b1b;
      cursor: pointer;
      font-size: 18px;
    }

    /* Chip */
    .af-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px;
      background: rgba(0,32,96,0.08);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      font-size: 12px; font-weight: 500;
      color: var(--navy);
    }
    .af-chip button {
      background: none; border: none;
      color: var(--muted); cursor: pointer;
      font-size: 14px; padding: 0;
    }

    /* Modal */
    .af-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000;
    }

    .af-modal {
      width: 100%; max-width: 520px;
      max-height: 80vh; overflow-y: auto;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 24px;
      padding: 28px;
    }

    .af-modal-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 20px;
    }

    .af-modal-actions {
      display: flex; justify-content: flex-end;
      gap: 12px; margin-top: 24px;
    }

    /* Toast */
    .af-toast {
      position: fixed;
      top: 24px; right: 24px;
      z-index: 99999;
      display: flex; align-items: center; gap: 10px;
      padding: 14px 20px;
      border-radius: 14px;
      font-size: 14px; font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      font-family: 'Sora', sans-serif;
    }
    .af-toast-success {
      background: #d1fae5;
      border: 1.5px solid #10b981;
      color: #065f46;
    }
    .af-toast-error {
      background: #fee2e2;
      border: 1.5px solid #ef4444;
      color: #991b1b;
    }

    @media (max-width: 768px) {
      .af-hero { padding: 40px 24px; }
      .af-content { padding: 24px 20px 40px; }
      .af-category-grid { grid-template-columns: 1fr; }
      .af-stepbar { flex-wrap: wrap; }
      .af-step-connector { display: none; }
    }
  `;

  return (
    <div className="af-page">
      <style>{sharedCSS}</style>

      {toast && (
        <div className={`af-toast ${toast.type === 'success' ? 'af-toast-success' : 'af-toast-error'}`}>
          <span>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="af-error-close">×</button>
        </div>
      )}

      {saving && <SavingOverlay />}

      {/* Hero Section */}
      <div className="af-hero">
        <div className="af-hero-inner">
          <div className="af-hero-eyebrow">
            <div className="af-hero-eyebrow-line" />
            Category Management
          </div>
          <h1>
            {mode === 'create' ? 'Create' : 'Edit'} <em>Category</em>
          </h1>
          <p className="af-hero-sub">
            {mode === 'create' 
              ? 'Create a new category with sub-categories, distribution lists, and assignment groups' 
              : `Editing: ${selectedCategory?.categoryName || selectedCategory?.name}`}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="af-content">
        <button className="af-back-btn" onClick={() => navigate('/settings')}>
          ← Back to Settings
        </button>

        {/* Step Bar */}
        <div className="af-stepbar">
          {['Category', 'Sub-Categories', 'DL Group', 'Assignment'].map((label, idx) => (
            <React.Fragment key={idx}>
              <div className={`af-step ${step === idx + 1 ? 'active' : ''} ${step > idx + 1 ? 'completed' : ''}`}>
                <div className="af-step-num">{step > idx + 1 ? '✓' : idx + 1}</div>
                <span className="af-step-label">{label}</span>
              </div>
              {idx < 3 && <div className="af-step-connector" />}
            </React.Fragment>
          ))}
        </div>

        {/* Alerts */}
        {error && (
          <div className="af-alert-error">
            <span>❌ {error}</span>
            <button onClick={() => setError(null)} className="af-error-close">×</button>
          </div>
        )}
        {success && (
          <div className="af-alert-success">
            <span>✓ {success}</span>
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div className="af-card">
            <h2 className="af-card-title">Create New Category</h2>
            <p className="af-card-sub">Or select an existing category to edit</p>

            {/* NEW: Add Category Button - Orange color */}
            <div className="af-mb-4">
              <button
                className="af-add-category-btn"
                onClick={() => {
                  setNewCategoryName('');
                  // Open modal logic
                  const modal = document.createElement('div');
                  modal.className = 'af-modal-overlay';
                  modal.innerHTML = `
                    <div class="af-modal" style="max-width: 480px;">
                      <h2 class="af-modal-title" style="display: flex; align-items: center; gap: 10px;">
                        <span>➕</span> Create New Category
                      </h2>
                      <div style="margin-bottom: 20px;">
                        <label class="af-label">Category Name</label>
                        <input id="af-category-input" class="af-input" placeholder="e.g. IT Support, HR Request..." autocomplete="off">
                      </div>
                      <div class="af-modal-actions">
                        <button id="af-cancel-modal" class="af-btn-secondary">Cancel</button>
                        <button id="af-create-modal" class="af-btn-primary" style="background: #e98404;">Create</button>
                      </div>
                    </div>
                  `;
                  document.body.appendChild(modal);
                  
                  const input = modal.querySelector('#af-category-input');
                  input?.focus();
                  
                  const createBtn = modal.querySelector('#af-create-modal');
                  const cancelBtn = modal.querySelector('#af-cancel-modal');
                  
                  const handleCreate = () => {
                    const catName = input?.value.trim();
                    if (!catName) {
                      alert('Category name is required');
                      return;
                    }
                    setNewCategoryName(catName);
                    modal.remove();
                    // Trigger the create handler
                    setTimeout(() => handleCreateNew(), 10);
                  };
                  
                  createBtn?.addEventListener('click', handleCreate);
                  cancelBtn?.addEventListener('click', () => modal.remove());
                  
                  // Close on overlay click
                  modal.addEventListener('click', (e) => {
                    if (e.target === modal) modal.remove();
                  });
                  
                  // Enter key support
                  input?.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') handleCreate();
                  });
                }}
              >
                <span style={{ fontSize: '18px', marginRight: '8px' }}>+</span> Add Category
              </button>
            </div>

            {/* NEW: Search Bar for filtering existing categories */}
            <div className="af-mb-4">
              <label className="af-label" style={{ marginBottom: '8px' }}>
                🔍 Search Existing Categories
              </label>
              <input
                type="text"
                className="af-search-input"
                placeholder="Type to filter categories..."
                value={dlSearchQuery} // Reusing dlSearchQuery state for search
                onChange={(e) => setDlSearchQuery(e.target.value)}
              />
            </div>

            <div className="af-divider" />

            <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: 15, fontWeight: 700, color: '#002060', marginBottom: 16 }}>
              Existing Categories
            </h3>

            {loadingCats ? (
              <div className="af-row af-gap-1 af-muted">
                <div className="af-spinner" /> Loading...
              </div>
            ) : categories.length === 0 ? (
              <p className="af-muted">No categories yet. Click "+ Add Category" to create one.</p>
            ) : (
              <div className="af-category-grid">
                {categories
                  .filter(cat => {
                    const searchTerm = dlSearchQuery.trim().toLowerCase();
                    if (!searchTerm) return true;
                    const catName = (cat.categoryName || cat.name || '').toLowerCase();
                    return catName.includes(searchTerm);
                  })
                  .map(cat => (
                    <div key={cat._id || cat.id} className="af-category-card" onClick={() => handleSelectCategory(cat)}>
                      <div className="af-category-name">{cat.categoryName || cat.name}</div>
                      <div className="af-category-meta">
                        {cat.subCategories?.length || 0} sub-categor{cat.subCategories?.length === 1 ? 'y' : 'ies'}
                      </div>
                      <div className="af-category-subs">
                        {cat.subCategories?.slice(0, 3).map((sub, i) => (
                          <span key={i} className="af-sub-tag">{sub.name || sub.subCategoryName}</span>
                        ))}
                        {cat.subCategories?.length > 3 && (
                          <span className="af-sub-tag">+{cat.subCategories.length - 3}</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
            
            {/* Show message when no search results */}
            {!loadingCats && categories.length > 0 && dlSearchQuery.trim() && 
              categories.filter(cat => (cat.categoryName || cat.name || '').toLowerCase().includes(dlSearchQuery.trim().toLowerCase())).length === 0 && (
                <p className="af-muted" style={{ textAlign: 'center', padding: '20px' }}>
                  No categories match "{dlSearchQuery}"
                </p>
              )}
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="af-card">
            <div className="af-flex-between af-mb-4">
              <div>
                <h2 className="af-card-title">Sub-Categories</h2>
                <p className="af-card-sub">
                  For <strong style={{ color: '#002060' }}>{selectedCategory?.categoryName || selectedCategory?.name}</strong>
                </p>
              </div>
              <div className="af-actions">
                <button className="af-btn-primary" onClick={addNewSubCard}>
                  + Add Sub-Category
                </button>
              </div>
            </div>

            {/* Existing Sub-Categories */}
            {existingSubCats.length > 0 && (
              <>
                <p className="af-label" style={{ marginBottom: 12 }}>
                  Existing Sub-Categories
                  <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12, marginLeft: 8 }}>(read-only)</span>
                </p>
                <div className="af-sub-grid">
                  {existingSubCats.map((sub, idx) => (
                    <div key={idx} className="af-sub-card existing">
                      <div className="af-sub-header">
                        <div className="af-sub-icon">📁</div>
                        <div className="af-sub-content">
                          <div className="af-sub-name">{sub.name || sub.subCategoryName}</div>
                          <div className="af-sub-config">
                            {sub.distributionList && (
                              <span className="af-config-badge configured">
                                👥 DL: {sub.distributionList.name}
                              </span>
                            )}
                            {sub.assignmentGroups?.length > 0 && (
                              <span className="af-config-badge configured">
                                🏷️ {sub.assignmentGroups.length} group{sub.assignmentGroups.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="af-divider" />
              </>
            )}

            {/* New Sub-Categories */}
            {newSubCards.length > 0 && (
              <>
                <p className="af-label" style={{ marginBottom: 12 }}>New Sub-Categories</p>
                <div className="af-sub-grid">
                  {newSubCards.map((card) => (
                    <div key={card.fid} className="af-sub-card">
                      <div className="af-sub-header">
                        <div className="af-sub-icon">
                          {card.saved ? '✓' : '📝'}
                        </div>
                        <div className="af-sub-content">
                          {card.open ? (
                            <SubCategoryForm
                              value={card.data}
                              onChange={data => updateSubCard(card.fid, { data, saved: false })}
                              dlMemberCount={card.dlMembers?.length || 0}
                              acquireToken={acquireToken}
                              onSave={() => {
                                if (!card.data.name.trim()) return;
                                confirmSubCard(card.fid);
                              }}
                              saveLabel="Confirm ✓"
                            />
                          ) : (
                            <>
                              <div className="af-sub-name">
                                {card.data.name || <span className="af-muted" style={{ fontStyle: 'italic' }}>Untitled</span>}
                              </div>
                              <SubCategoryBadges sub={card.data} />
                              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                {card.selectedDL && <span className="af-config-badge configured">👥 DL: {card.selectedDL.displayName}</span>}
                                {card.assignmentGroup && <span className="af-config-badge configured">🏷️ {card.assignmentGroup.name}</span>}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="af-actions">
                          {!card.open && !card.saved && (
                            <button
                              className="af-btn-secondary af-btn-sm"
                              onClick={() => updateSubCard(card.fid, { open: true })}
                            >
                              Edit
                            </button>
                          )}
                          {!card.open && card.saved && (
                            <button
                              className="af-btn-secondary af-btn-sm"
                              onClick={() => {
                                setEditingSubCardId(card.fid);
                                setStep(3);
                              }}
                            >
                              Manage
                            </button>
                          )}
                          <button
                            className="af-btn-danger"
                            onClick={() => removeSubCard(card.fid)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {newSubCards.length === 0 && existingSubCats.length === 0 && (
              <div className="af-center af-muted" style={{ padding: '40px' }}>
                No sub-categories yet. Click "Add Sub-Category" to get started.
              </div>
            )}

            <div className="af-divider" />

            <div className="af-flex-between">
              <button className="af-btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button
                className="af-btn-primary"
                onClick={publish}
                disabled={!canPublish}
              >
                {mode === 'create' ? '✅ Publish Category' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: DL */}
        {step === 3 && currentSubCard && (
          <div className="af-card">
            <div className="af-flex-between af-mb-4">
              <div>
                <h2 className="af-card-title">Configure Distribution List</h2>
                <p className="af-card-sub">
                  For sub-category: <strong style={{ color: '#002060' }}>{currentSubCard.data.name || 'Untitled'}</strong>
                </p>
              </div>
              <div className="af-actions">
                <button className="af-btn-primary af-btn-success" onClick={() => setShowCreateDL(true)}>
                  + Create New DL
                </button>
              </div>
            </div>

            <input
              className="af-search-input af-mb-4"
              value={dlSearchQuery}
              onChange={e => setDlSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
            />

            {dlLoading ? (
              <div className="af-row af-gap-1 af-muted" style={{ padding: '20px' }}>
                <div className="af-spinner" /> Loading...
              </div>
            ) : (
              <div className="af-dl-grid">
                {filteredDLs.map(dl => (
                  <div
                    key={dl.id}
                    className={`af-dl-card ${currentSubCard.selectedDL?.id === dl.id ? 'selected' : ''}`}
                    onClick={() => handleSelectDLForSubCard(currentSubCard.fid, dl)}
                  >
                    <div className="af-dl-icon">👥</div>
                    <div className="af-dl-info">
                      <div className="af-dl-name">{dl.displayName}</div>
                      <div className="af-dl-email">{dl.mail || '—'}</div>
                    </div>
                    {currentSubCard.selectedDL?.id === dl.id && (
                      <span style={{ color: '#10b981', fontSize: 18 }}>✓</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!dlLoading && filteredDLs.length === 0 && (
              <p className="af-muted" style={{ padding: '20px', textAlign: 'center' }}>
                No DLs found. Create one or adjust your search.
              </p>
            )}

            {dlError && <div className="af-alert-error af-mt-4">❌ {dlError}</div>}

            <div className="af-divider" />

            <div className="af-flex-between">
              <button className="af-btn-secondary" onClick={() => setStep(2)}>← Back to Sub-Categories</button>
              <button className="af-btn-primary" onClick={() => setStep(4)} disabled={!currentSubCard.selectedDL}>
                Save & Next
              </button>
            </div>

            {/* Create DL Modal */}
            {showCreateDL && (
              <div className="af-modal-overlay" onClick={() => setShowCreateDL(false)}>
                <div className="af-modal" onClick={e => e.stopPropagation()}>
                  <h2 className="af-modal-title">Create Distribution List</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label className="af-label">DL Name</label>
                      <input className="af-input" placeholder="Display name" value={newDL.name} onChange={e => setNewDL({ ...newDL, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="af-label">Email</label>
                      <div className="af-row af-gap-1" style={{ alignItems: 'center' }}>
                        <input className="af-input" style={{ flex: 1 }} placeholder="prefix" value={newDL.emailPrefix} onChange={e => setNewDL({ ...newDL, emailPrefix: e.target.value })} />
                        <span style={{ fontSize: 13, color: '#64748b', marginLeft: 6 }}>@sandeza-inc.com</span>
                      </div>
                    </div>
                    <div>
                      <label className="af-label">Members</label>
                      <UserSearchDropdown hook={memberSearch} selected={newDL.members} onSelect={u => { if (!newDL.members.find(m => m.id === u.id)) setNewDL({ ...newDL, members: [...newDL.members, u] }); }} />
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {newDL.members.map(m => (
                          <span key={m.id} className="af-chip">{m.displayName}<button onClick={() => setNewDL({ ...newDL, members: newDL.members.filter(x => x.id !== m.id) })}>✕</button></span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="af-label">Owners</label>
                      <UserSearchDropdown hook={ownerSearch} selected={newDL.owners} onSelect={u => { if (!newDL.owners.find(o => o.id === u.id)) setNewDL({ ...newDL, owners: [...newDL.owners, u] }); }} />
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {newDL.owners.map(o => (
                          <span key={o.id} className="af-chip">{o.displayName}<button onClick={() => setNewDL({ ...newDL, owners: newDL.owners.filter(x => x.id !== o.id) })}>✕</button></span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="af-modal-actions">
                    <button className="af-btn-secondary" onClick={() => setShowCreateDL(false)}>Cancel</button>
                    <button className="af-btn-primary af-btn-success" onClick={createDL} disabled={creatingDL}>
                      {creatingDL ? <><span className="af-spinner" style={{ width: 16, height: 16, marginRight: 8 }} /> Creating...</> : 'Create DL'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: ASSIGNMENT GROUP */}
        {step === 4 && currentSubCard && (
          <div className="af-card">
            <h2 className="af-card-title">Configure Assignment Group</h2>
            <p className="af-card-sub">
              For sub-category: <strong style={{ color: '#002060' }}>{currentSubCard.data.name || 'Untitled'}</strong>
            </p>

            {/* Selected Group Display */}
            {currentSubCard.assignmentGroup ? (
              <div style={{
                padding: '24px',
                background: '#d1fae5',
                border: '1.5px solid #10b981',
                borderRadius: '16px',
                marginBottom: '24px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '32px' }}>🏷️</span>
                    <div>
                      <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: '700', fontSize: '18px', color: '#002060', marginBottom: '4px' }}>
                        {currentSubCard.assignmentGroup.name}
                      </div>
                      <div style={{ fontSize: '14px', color: '#065f46' }}>
                        ✓ Assigned to this sub-category
                      </div>
                    </div>
                  </div>
                  <button
                    className="af-btn-danger"
                    onClick={() => updateSubCard(currentSubCard.fid, { assignmentGroup: null })}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1.5px solid #10b981' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#065f46', marginBottom: '10px' }}>
                    Members ({currentSubCard.assignmentGroup.members?.length || 0})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {currentSubCard.assignmentGroup.members?.slice(0, 6).map(m => (
                      <span key={m.id || m.mail} style={{
                        fontSize: '12px', fontWeight: '500',
                        background: 'rgba(16,185,129,0.15)',
                        color: '#065f46',
                        padding: '6px 14px',
                        borderRadius: '20px',
                      }}>
                        {m.name || m.mail}
                      </span>
                    ))}
                    {currentSubCard.assignmentGroup.members?.length > 6 && (
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        +{currentSubCard.assignmentGroup.members.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '24px' }}>
                  <label className="af-label" style={{ marginBottom: '12px' }}>
                    Select Assignment Group
                  </label>
                  
                  {loadingGroups ? (
                    <div className="af-row af-gap-1 af-muted" style={{ padding: '20px' }}>
                      <div className="af-spinner" /> Loading groups...
                    </div>
                  ) : (
                    <>
                      <div style={{ position: 'relative' }}>
                        <select
                          style={{
                            width: '100%',
                            padding: '14px 40px 14px 18px',
                            background: 'var(--white)',
                            border: '1.5px solid var(--border)',
                            borderRadius: '14px',
                            fontSize: '14px',
                            color: 'var(--text)',
                            fontFamily: "'Lato', sans-serif",
                            cursor: 'pointer',
                            appearance: 'none',
                            outline: 'none',
                          }}
                          value={selectedGroupId || ''}
                          onChange={e => {
                            const groupId = e.target.value;
                            setSelectedGroupId(groupId);
                            const group = existingGroups.find(g => (g._id || g.id) === groupId);
                            setSelectedGroupForPreview(group);
                            setAgError(null);
                          }}
                        >
                          <option value="">Select an assignment group...</option>
                          {existingGroups.map(g => (
                            <option key={g._id || g.id} value={g._id || g.id}>
                              {g.name} ({g.members?.length || 0} members)
                            </option>
                          ))}
                        </select>
                        <span style={{
                          position: 'absolute',
                          right: '18px', top: '50%',
                          transform: 'translateY(-50%)',
                          pointerEvents: 'none',
                          color: '#64748b',
                          fontSize: '12px',
                        }}>▼</span>
                      </div>

                      {selectedGroupForPreview && (
                        <div style={{
                          marginTop: '20px',
                          padding: '20px',
                          background: 'rgba(0,32,96,0.04)',
                          border: '1.5px solid var(--navy)',
                          borderRadius: '14px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                            <span style={{ fontSize: '24px' }}>👥</span>
                            <div>
                              <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: '600', fontSize: '15px', color: '#002060' }}>
                                {selectedGroupForPreview.name}
                              </div>
                              <div style={{ fontSize: '13px', color: '#64748b' }}>
                                {selectedGroupForPreview.members?.length || 0} members
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {selectedGroupForPreview.members?.slice(0, 5).map(m => (
                              <span key={m.id || m.mail} style={{
                                fontSize: '12px',
                                background: 'rgba(0,32,96,0.08)',
                                color: '#002060',
                                padding: '6px 14px',
                                borderRadius: '20px',
                              }}>
                                {m.name || m.mail}
                              </span>
                            ))}
                            {selectedGroupForPreview.members?.length > 5 && (
                              <span style={{ fontSize: '12px', color: '#64748b' }}>
                                +{selectedGroupForPreview.members.length - 5} more
                              </span>
                            )}
                          </div>
                          <button
                            className="af-btn-primary"
                            style={{ marginTop: '20px', width: '100%' }}
                            onClick={() => {
                              if (!selectedGroupId) return;
                              const group = existingGroups.find(g => (g._id || g.id) === selectedGroupId);
                              if (group) {
                                updateSubCard(currentSubCard.fid, {
                                  assignmentGroup: {
                                    _id: group._id,
                                    id: group.id,
                                    name: group.name,
                                    members: group.members || [],
                                  }
                                });
                                setSelectedGroupId('');
                                setSelectedGroupForPreview(null);
                              }
                            }}
                          >
                            + Assign This Group
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {agError && (
              <div className="af-alert-error" style={{ marginBottom: '20px' }}>
                {agError}
              </div>
            )}

            <div className="af-divider" />

            <div className="af-flex-between">
              <button className="af-btn-secondary" onClick={() => setStep(3)}>← Back</button>
              <button className="af-btn-primary" onClick={() => setStep(2)}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}