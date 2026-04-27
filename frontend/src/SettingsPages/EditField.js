// EditField.js - Redesigned to match Home.js styling
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import {
  useAzureToken,
  useUserSearch,
  SubCategoryForm,
  SubCategoryBadges,
  UserSearchDropdown,
  SavingOverlay,
} from './CategoryFormCombined';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

export default function EditField() {
  const navigate = useNavigate();
  const { accounts } = useMsal();
  const acquireToken = useAzureToken();
  const memberSearch = useUserSearch(acquireToken);
  const ownerSearch = useUserSearch(acquireToken);

  // Main state
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [toast, setToast] = useState(null);

  // Step 1: Categories
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Step 2: Sub-Categories
  const [subCategories, setSubCategories] = useState([]);
  const [editingSubIndex, setEditingSubIndex] = useState(null);
  const [expandedSubIndex, setExpandedSubIndex] = useState(null);

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

  const handleSelectCategory = (category) => {
    setSelectedCategory(category);
    setSubCategories(category.subCategories || []);
    setStep(2);
    setExpandedSubIndex(null);
    setEditingSubIndex(null);
  };

  const updateSubCategory = (index, updates) => {
    setSubCategories(prev => prev.map((sub, i) => i === index ? { ...sub, ...updates } : sub));
  };

  const confirmSubCategory = (index) => {
    setEditingSubIndex(index);
    setExpandedSubIndex(null);
    setStep(3);
  };

  const handleSelectDL = async (dl) => {
    if (!dl) return;
    
    const currentSub = subCategories[editingSubIndex];
    if (currentSub?.distributionList?.id === dl.id) return;

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
      
      let dlMembers = [];
      let dlOwners = [];
      
      if (mRes.ok) {
        const d = await mRes.json();
        dlMembers = d.value || [];
      }
      if (oRes.ok) {
        const d = await oRes.json();
        dlOwners = d.value || [];
      }

      updateSubCategory(editingSubIndex, {
        distributionList: {
          id: dl.id,
          name: dl.displayName,
          mail: dl.mail || '',
          mailNickname: dl.mailNickname || '',
        },
        dlGroupMembers: dlMembers.map(m => ({
          id: m.id,
          email: m.mail || m.userPrincipalName,
          displayName: m.displayName,
        })),
        dlGroupOwners: dlOwners.map(o => ({
          id: o.id,
          email: o.mail || o.userPrincipalName,
          displayName: o.displayName,
        })),
      });
    } catch (e) {
      console.warn('Could not load DL members:', e.message);
    }
  };

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

  const assignGroupToSubCategory = (group) => {
    if (!group) return;
    
    updateSubCategory(editingSubIndex, {
      assignmentGroups: [{
        _id: group._id,
        id: group.id,
        name: group.name,
        members: group.members || [],
      }]
    });
    
    setSelectedGroupId('');
    setSelectedGroupForPreview(null);
  };

  const removeAssignmentGroup = () => {
    updateSubCategory(editingSubIndex, { assignmentGroups: [] });
  };

  const saveChanges = async () => {
    setError(null);
    setSaving(true);

    try {
      const updatedBy = {
        id: accounts?.[0]?.homeAccountId || '',
        name: accounts?.[0]?.name || '',
        mail: accounts?.[0]?.username || '',
      };

      const payload = {
        categoryName: selectedCategory.categoryName || selectedCategory.name,
        name: selectedCategory.categoryName || selectedCategory.name,
        distributionList: selectedCategory.distributionList || null,
        subCategories: subCategories,
        assignmentGroups: selectedCategory.assignmentGroups || [],
        dlGroupMembers: selectedCategory.dlGroupMembers || [],
        dlGroupOwners: selectedCategory.dlGroupOwners || [],
        updatedBy,
      };

      const url = `${BACKEND}/api/categories/${selectedCategory.id || selectedCategory._id}`;
      const method = 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Save failed (${res.status})`);
      }

      setSuccess('Category updated successfully!');
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

  const filteredCategories = searchQuery.trim().length < 1
    ? categories
    : categories.filter(c =>
        (c.categoryName || c.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      );

  const filteredDLs = dlSearchQuery.trim().length < 1
    ? allDLs
    : allDLs.filter(d =>
        d.displayName?.toLowerCase().includes(dlSearchQuery.toLowerCase()) ||
        d.mail?.toLowerCase().includes(dlSearchQuery.toLowerCase())
      );

  const currentSub = editingSubIndex !== null ? subCategories[editingSubIndex] : null;
  const hasChanges = subCategories.length > 0;

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

    .ef-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Hero Section */
    .ef-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .ef-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .ef-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .ef-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .ef-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .ef-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .ef-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .ef-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .ef-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    .ef-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 24px; display: inline-flex;
      align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .ef-back-btn:hover { color: var(--orange); }

    /* Step Bar */
    .ef-stepbar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 28px;
      padding: 16px 24px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      animation: fadeUp 0.45s 0.05s ease both;
    }

    .ef-step {
      display: flex; align-items: center; gap: 10px;
      flex: 1;
    }

    .ef-step-num {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      background: var(--bg);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 13px; font-weight: 700;
      color: var(--muted);
      font-family: 'Sora', sans-serif;
    }

    .ef-step.active .ef-step-num {
      background: var(--navy);
      border-color: var(--navy);
      color: white;
    }

    .ef-step.completed .ef-step-num {
      background: #10b981;
      border-color: #10b981;
      color: white;
    }

    .ef-step-label {
      font-size: 14px; font-weight: 600;
      color: var(--muted);
      font-family: 'Sora', sans-serif;
    }

    .ef-step.active .ef-step-label {
      color: var(--navy);
    }

    .ef-step-connector {
      width: 40px; height: 2px;
      background: var(--border);
      margin: 0 12px;
    }

    /* Cards */
    .ef-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 24px;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .ef-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 6px;
    }

    .ef-card-sub {
      font-size: 14px; color: var(--muted);
      margin-bottom: 24px;
    }

    /* Search Input */
    .ef-search-input {
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
    .ef-search-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }

    /* Buttons */
    .ef-btn-primary {
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
    .ef-btn-primary:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,32,96,0.25);
    }
    .ef-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .ef-btn-secondary {
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
    .ef-btn-secondary:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .ef-btn-success {
      background: #10b981;
      box-shadow: 0 4px 12px rgba(16,185,129,0.2);
    }
    .ef-btn-success:hover {
      background: #059669;
    }

    .ef-btn-danger {
      padding: 6px 14px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 12px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .ef-btn-danger:hover {
      border-color: #ef4444;
      color: #ef4444;
      background: #fee2e2;
    }

    .ef-btn-sm {
      padding: 6px 14px;
      font-size: 12px;
    }

    /* Category Grid */
    .ef-category-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 20px;
      max-height: 400px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .ef-category-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ef-category-card:hover {
      border-color: var(--navy);
      transform: translateY(-3px);
      box-shadow: 0 8px 24px rgba(0,32,96,0.1);
    }

    .ef-category-name {
      font-family: 'Sora', sans-serif;
      font-size: 16px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 6px;
    }

    .ef-category-meta {
      font-size: 13px; color: var(--muted);
      margin-bottom: 12px;
    }

    .ef-category-subs {
      display: flex; flex-wrap: wrap; gap: 6px;
    }

    .ef-sub-tag {
      font-size: 11px; font-weight: 600;
      padding: 4px 10px;
      background: rgba(0,32,96,0.08);
      border-radius: 20px;
      color: var(--navy);
    }

    /* Sub-Category Cards */
    .ef-sub-grid {
      display: flex; flex-direction: column; gap: 12px;
      margin: 20px 0;
    }

    .ef-sub-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }

    .ef-sub-header {
      display: flex; align-items: center; gap: 16px;
      padding: 16px 20px;
    }

    .ef-sub-icon {
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,32,96,0.08);
      border-radius: 12px;
      font-size: 18px;
      flex-shrink: 0;
    }

    .ef-sub-content {
      flex: 1; min-width: 0;
    }

    .ef-sub-name {
      font-family: 'Sora', sans-serif;
      font-size: 15px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 6px;
    }

    .ef-sub-config {
      display: flex; gap: 8px; flex-wrap: wrap;
      margin-top: 8px;
    }

    .ef-config-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 5px 12px;
      background: var(--bg);
      border-radius: 20px;
      font-size: 11px; font-weight: 600;
      color: var(--muted);
    }
    .ef-config-badge.configured {
      background: #d1fae5;
      color: #065f46;
    }

    /* DL Grid */
    .ef-dl-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
      margin: 20px 0;
      max-height: 350px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .ef-dl-card {
      display: flex; align-items: center; gap: 14px;
      padding: 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ef-dl-card:hover {
      border-color: var(--navy);
    }
    .ef-dl-card.selected {
      background: rgba(0,32,96,0.04);
      border-color: var(--navy);
    }

    .ef-dl-icon {
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,32,96,0.08);
      border-radius: 12px;
      font-size: 20px;
      flex-shrink: 0;
    }

    .ef-dl-info {
      flex: 1; min-width: 0;
    }

    .ef-dl-name {
      font-family: 'Sora', sans-serif;
      font-size: 14px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 3px;
    }

    .ef-dl-email {
      font-size: 12px; color: var(--muted);
    }

    /* Alert */
    .ef-alert-error {
      padding: 14px 18px;
      background: #fee2e2;
      border: 1.5px solid #ef4444;
      border-radius: 14px;
      color: #991b1b;
      font-size: 14px; font-weight: 500;
      margin-bottom: 20px;
      display: flex; align-items: center; gap: 10px;
    }

    .ef-alert-success {
      padding: 14px 18px;
      background: #d1fae5;
      border: 1.5px solid #10b981;
      border-radius: 14px;
      color: #065f46;
      font-size: 14px; font-weight: 500;
      margin-bottom: 20px;
    }

    /* Spinner */
    .ef-spinner {
      width: 20px; height: 20px;
      border: 2px solid var(--border);
      border-top-color: var(--navy);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }

    /* Divider */
    .ef-divider {
      height: 1.5px;
      background: var(--border);
      margin: 24px 0;
    }

    /* Flex Helpers */
    .ef-flex-between {
      display: flex; align-items: center; justify-content: space-between;
    }
    .ef-row { display: flex; align-items: center; }
    .ef-gap-1 { gap: 8px; }
    .ef-gap-2 { gap: 12px; }
    .ef-mt-4 { margin-top: 20px; }
    .ef-mb-4 { margin-bottom: 20px; }
    .ef-flex-1 { flex: 1; }
    .ef-actions { display: flex; align-items: center; gap: 8px; }
    .ef-center { text-align: center; }
    .ef-muted { color: var(--muted); font-size: 14px; }

    .ef-error-close {
      margin-left: auto;
      background: none;
      border: none;
      color: #991b1b;
      cursor: pointer;
      font-size: 18px;
    }

    /* Chip */
    .ef-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px;
      background: rgba(0,32,96,0.08);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      font-size: 12px; font-weight: 500;
      color: var(--navy);
    }
    .ef-chip button {
      background: none; border: none;
      color: var(--muted); cursor: pointer;
      font-size: 14px; padding: 0;
    }

    /* Modal */
    .ef-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000;
    }

    .ef-modal {
      width: 100%; max-width: 520px;
      max-height: 80vh; overflow-y: auto;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 24px;
      padding: 28px;
    }

    .ef-modal-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 20px;
    }

    .ef-modal-actions {
      display: flex; justify-content: flex-end;
      gap: 12px; margin-top: 24px;
    }

    /* Toast */
    .ef-toast {
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
    .ef-toast-success {
      background: #d1fae5;
      border: 1.5px solid #10b981;
      color: #065f46;
    }
    .ef-toast-error {
      background: #fee2e2;
      border: 1.5px solid #ef4444;
      color: #991b1b;
    }

    /* Current DL/AG Display */
    .ef-current-badge {
      padding: 16px;
      background: rgba(0,32,96,0.04);
      border: 1.5px solid var(--navy);
      border-radius: 14px;
      margin-bottom: 20px;
    }

    .ef-current-badge-green {
      padding: 20px;
      background: #d1fae5;
      border: 1.5px solid #10b981;
      border-radius: 16px;
      margin-bottom: 20px;
    }

    @media (max-width: 768px) {
      .ef-hero { padding: 40px 24px; }
      .ef-content { padding: 24px 20px 40px; }
      .ef-category-grid { grid-template-columns: 1fr; }
      .ef-stepbar { flex-wrap: wrap; }
      .ef-step-connector { display: none; }
    }
  `;

  return (
    <div className="ef-page">
      <style>{sharedCSS}</style>

      {/* Toast */}
      {toast && (
        <div className={`ef-toast ${toast.type === 'success' ? 'ef-toast-success' : 'ef-toast-error'}`}>
          <span>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ef-error-close">×</button>
        </div>
      )}

      {saving && <SavingOverlay />}

      {/* Hero Section */}
      <div className="ef-hero">
        <div className="ef-hero-inner">
          <div className="ef-hero-eyebrow">
            <div className="ef-hero-eyebrow-line" />
            Category Management
          </div>
          <h1>
            Edit <em>Category</em>
          </h1>
          <p className="ef-hero-sub">
            {selectedCategory 
              ? `Editing: ${selectedCategory.categoryName || selectedCategory.name}`
              : 'Select a category to edit its configuration'}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="ef-content">
        <button className="ef-back-btn" onClick={() => navigate('/settings')}>
          ← Back to Settings
        </button>

        {/* Step Bar */}
        <div className="ef-stepbar">
          {['Category', 'Sub-Categories', 'DL Group', 'Assignment'].map((label, idx) => (
            <React.Fragment key={idx}>
              <div className={`ef-step ${step === idx + 1 ? 'active' : ''} ${step > idx + 1 ? 'completed' : ''}`}>
                <div className="ef-step-num">{step > idx + 1 ? '✓' : idx + 1}</div>
                <span className="ef-step-label">{label}</span>
              </div>
              {idx < 3 && <div className="ef-step-connector" />}
            </React.Fragment>
          ))}
        </div>

        {/* Alerts */}
        {error && (
          <div className="ef-alert-error">
            <span>❌ {error}</span>
            <button onClick={() => setError(null)} className="ef-error-close">×</button>
          </div>
        )}
        {success && (
          <div className="ef-alert-success">
            <span>✓ {success}</span>
          </div>
        )}

        {/* STEP 1 - Select Category */}
        {step === 1 && (
          <div className="ef-card">
            <h2 className="ef-card-title">Select Category to Edit</h2>
            <p className="ef-card-sub">Choose an existing category to modify its configuration</p>

            <input
              className="ef-search-input ef-mb-4"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search categories..."
            />

            {loadingCats ? (
              <div className="ef-row ef-gap-1 ef-muted">
                <div className="ef-spinner" /> Loading...
              </div>
            ) : filteredCategories.length === 0 ? (
              <p className="ef-muted">No categories found.</p>
            ) : (
              <div className="ef-category-grid">
                {filteredCategories.map(cat => (
                  <div key={cat._id || cat.id} className="ef-category-card" onClick={() => handleSelectCategory(cat)}>
                    <div className="ef-category-name">{cat.categoryName || cat.name}</div>
                    <div className="ef-category-meta">
                      {cat.subCategories?.length || 0} sub-categor{cat.subCategories?.length === 1 ? 'y' : 'ies'}
                    </div>
                    <div className="ef-category-subs">
                      {cat.subCategories?.slice(0, 3).map((sub, i) => (
                        <span key={i} className="ef-sub-tag">{sub.name || sub.subCategoryName}</span>
                      ))}
                      {cat.subCategories?.length > 3 && (
                        <span className="ef-sub-tag">+{cat.subCategories.length - 3}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2 - Sub-Categories */}
        {step === 2 && (
          <div className="ef-card">
            <div className="ef-flex-between ef-mb-4">
              <div>
                <h2 className="ef-card-title">Sub-Categories</h2>
                <p className="ef-card-sub">
                  For <strong style={{ color: '#002060' }}>{selectedCategory?.categoryName || selectedCategory?.name}</strong>
                </p>
              </div>
            </div>

            {subCategories.length === 0 ? (
              <div className="ef-center ef-muted" style={{ padding: '40px' }}>
                No sub-categories available for this category.
              </div>
            ) : (
              <div className="ef-sub-grid">
                {subCategories.map((sub, idx) => (
                  <div key={idx} className="ef-sub-card">
                    <div className="ef-sub-header">
                      <div className="ef-sub-icon">📁</div>
                      <div className="ef-sub-content">
                        {expandedSubIndex === idx ? (
                          <SubCategoryForm
                            value={{
                              name: sub.name || '',
                              description: sub.description || '',
                              onBehalf: sub.onBehalf || { enabled: false, required: false },
                              attachments: sub.attachments || { enabled: false, required: false },
                              approval: sub.approval || { requireApproval: false, reportingManager: false, requireAll: false, otherApprovers: [] },
                            }}
                            onChange={(data) => updateSubCategory(idx, {
                              name: data.name,
                              description: data.description,
                              onBehalf: data.onBehalf,
                              attachments: data.attachments,
                              approval: data.approval,
                            })}
                            dlMemberCount={sub.dlGroupMembers?.length || 0}
                            acquireToken={acquireToken}
                            onSave={() => confirmSubCategory(idx)}
                            saveLabel="Confirm & Continue →"
                          />
                        ) : (
                          <>
                            <div className="ef-sub-name">{sub.name || 'Unnamed'}</div>
                            <SubCategoryBadges sub={sub} />
                            <div className="ef-sub-config">
                              {sub.distributionList && (
                                <span className="ef-config-badge configured">
                                  👥 DL: {sub.distributionList.name}
                                </span>
                              )}
                              {sub.assignmentGroups?.length > 0 && (
                                <span className="ef-config-badge configured">
                                  🏷️ {sub.assignmentGroups[0]?.name || 'Group'}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="ef-actions">
                        {expandedSubIndex !== idx && (
                          <button
                            className="ef-btn-secondary ef-btn-sm"
                            onClick={() => {
                              setExpandedSubIndex(idx);
                              setEditingSubIndex(idx);
                            }}
                          >
                            Edit Features
                          </button>
                        )}
                        {expandedSubIndex === idx && (
                          <button
                            className="ef-btn-secondary ef-btn-sm"
                            onClick={() => setExpandedSubIndex(null)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="ef-divider" />

            <div className="ef-flex-between">
              <button className="ef-btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button
                className="ef-btn-primary"
                onClick={saveChanges}
                disabled={!hasChanges}
              >
                💾 Save All Changes
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 - DL Configuration */}
        {step === 3 && currentSub && (
          <div className="ef-card">
            <div className="ef-flex-between ef-mb-4">
              <div>
                <h2 className="ef-card-title">Configure Distribution List</h2>
                <p className="ef-card-sub">
                  For sub-category: <strong style={{ color: '#002060' }}>{currentSub.name || 'Untitled'}</strong>
                </p>
              </div>
              <div className="ef-actions">
                <button className="ef-btn-primary ef-btn-success" onClick={() => setShowCreateDL(true)}>
                  + Create New DL
                </button>
              </div>
            </div>

            {/* Current DL */}
            {currentSub.distributionList && (
              <div className="ef-current-badge">
                <div style={{ fontSize: '12px', color: '#002060', marginBottom: '8px', fontWeight: 600 }}>Current DL</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>👥</span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>{currentSub.distributionList.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{currentSub.distributionList.mail}</div>
                  </div>
                </div>
              </div>
            )}

            <input
              className="ef-search-input ef-mb-4"
              value={dlSearchQuery}
              onChange={e => setDlSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
            />

            {dlLoading ? (
              <div className="ef-row ef-gap-1 ef-muted" style={{ padding: '20px' }}>
                <div className="ef-spinner" /> Loading...
              </div>
            ) : (
              <div className="ef-dl-grid">
                {filteredDLs.map(dl => (
                  <div
                    key={dl.id}
                    className={`ef-dl-card ${currentSub.distributionList?.id === dl.id ? 'selected' : ''}`}
                    onClick={() => handleSelectDL(dl)}
                  >
                    <div className="ef-dl-icon">👥</div>
                    <div className="ef-dl-info">
                      <div className="ef-dl-name">{dl.displayName}</div>
                      <div className="ef-dl-email">{dl.mail || '—'}</div>
                    </div>
                    {currentSub.distributionList?.id === dl.id && (
                      <span style={{ color: '#10b981', fontSize: 18 }}>✓</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!dlLoading && filteredDLs.length === 0 && (
              <p className="ef-muted" style={{ padding: '20px', textAlign: 'center' }}>
                No DLs found. Create one or adjust your search.
              </p>
            )}

            {dlError && <div className="ef-alert-error ef-mt-4">❌ {dlError}</div>}

            <div className="ef-divider" />

            <div className="ef-flex-between">
              <button className="ef-btn-secondary" onClick={() => { setStep(2); setExpandedSubIndex(null); }}>← Back</button>
              <button className="ef-btn-primary" onClick={() => setStep(4)}>
                Save & Next
              </button>
            </div>

            {/* Create DL Modal */}
            {showCreateDL && (
              <div className="ef-modal-overlay" onClick={() => setShowCreateDL(false)}>
                <div className="ef-modal" onClick={e => e.stopPropagation()}>
                  <h2 className="ef-modal-title">Create Distribution List</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label className="ef-label" style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, color: '#002060', marginBottom: 8 }}>DL Name</label>
                      <input className="ef-search-input" style={{ backgroundImage: 'none', padding: '14px 18px' }} placeholder="Display name" value={newDL.name} onChange={e => setNewDL({ ...newDL, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="ef-label" style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, color: '#002060', marginBottom: 8 }}>Email</label>
                      <div className="ef-row ef-gap-1" style={{ alignItems: 'center' }}>
                        <input className="ef-search-input" style={{ backgroundImage: 'none', padding: '14px 18px', flex: 1 }} placeholder="prefix" value={newDL.emailPrefix} onChange={e => setNewDL({ ...newDL, emailPrefix: e.target.value })} />
                        <span style={{ fontSize: 13, color: '#64748b', marginLeft: 6 }}>@sandeza-inc.com</span>
                      </div>
                    </div>
                    <div>
                      <label className="ef-label" style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, color: '#002060', marginBottom: 8 }}>Members</label>
                      <UserSearchDropdown hook={memberSearch} selected={newDL.members} onSelect={u => { if (!newDL.members.find(m => m.id === u.id)) setNewDL({ ...newDL, members: [...newDL.members, u] }); }} />
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {newDL.members.map(m => (
                          <span key={m.id} className="ef-chip">{m.displayName}<button onClick={() => setNewDL({ ...newDL, members: newDL.members.filter(x => x.id !== m.id) })}>✕</button></span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="ef-label" style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, color: '#002060', marginBottom: 8 }}>Owners</label>
                      <UserSearchDropdown hook={ownerSearch} selected={newDL.owners} onSelect={u => { if (!newDL.owners.find(o => o.id === u.id)) setNewDL({ ...newDL, owners: [...newDL.owners, u] }); }} />
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {newDL.owners.map(o => (
                          <span key={o.id} className="ef-chip">{o.displayName}<button onClick={() => setNewDL({ ...newDL, owners: newDL.owners.filter(x => x.id !== o.id) })}>✕</button></span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="ef-modal-actions">
                    <button className="ef-btn-secondary" onClick={() => setShowCreateDL(false)}>Cancel</button>
                    <button className="ef-btn-primary ef-btn-success" onClick={createDL} disabled={creatingDL}>
                      {creatingDL ? <><span className="ef-spinner" style={{ width: 16, height: 16, marginRight: 8 }} /> Creating...</> : 'Create DL'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4 - Assignment Group */}
        {step === 4 && currentSub && (
          <div className="ef-card">
            <h2 className="ef-card-title">Configure Assignment Group</h2>
            <p className="ef-card-sub">
              For sub-category: <strong style={{ color: '#002060' }}>{currentSub.name || 'Untitled'}</strong>
            </p>

            {/* Current Assignment Group */}
            {currentSub.assignmentGroups?.length > 0 && (
              <div className="ef-current-badge-green">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '28px' }}>🏷️</span>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '16px', color: '#002060', marginBottom: '4px' }}>
                        {currentSub.assignmentGroups[0]?.name}
                      </div>
                      <div style={{ fontSize: '13px', color: '#065f46' }}>
                        ✓ Currently assigned
                      </div>
                    </div>
                  </div>
                  <button className="ef-btn-danger" onClick={removeAssignmentGroup}>
                    Remove
                  </button>
                </div>
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1.5px solid #10b981' }}>
                  <div style={{ fontSize: '12px', color: '#065f46', marginBottom: '8px', fontWeight: 600 }}>
                    Members ({currentSub.assignmentGroups[0]?.members?.length || 0})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {currentSub.assignmentGroups[0]?.members?.slice(0, 6).map(m => (
                      <span key={m.id || m.mail} style={{
                        fontSize: '11px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#065f46',
                        padding: '4px 10px',
                        borderRadius: '20px',
                      }}>
                        {m.name || m.mail}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Select New Group */}
            {(!currentSub.assignmentGroups || currentSub.assignmentGroups.length === 0) && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 700, color: '#002060', marginBottom: 10, display: 'block' }}>
                  Select Assignment Group
                </label>
                
                {loadingGroups ? (
                  <div className="ef-row ef-gap-1 ef-muted" style={{ padding: '20px' }}>
                    <div className="ef-spinner" /> Loading groups...
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
                        right: '18px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        color: '#64748b',
                        fontSize: '12px',
                      }}>▼</span>
                    </div>

                    {selectedGroupForPreview && (
                      <div style={{
                        marginTop: '16px',
                        padding: '20px',
                        background: 'rgba(0,32,96,0.04)',
                        border: '1.5px solid var(--navy)',
                        borderRadius: '14px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                          <span style={{ fontSize: '24px' }}>👥</span>
                          <div>
                            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: '600', fontSize: '15px', color: '#002060' }}>
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
                        </div>
                        <button
                          className="ef-btn-primary"
                          style={{ marginTop: '20px', width: '100%' }}
                          onClick={() => assignGroupToSubCategory(selectedGroupForPreview)}
                        >
                          + Assign This Group
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {agError && (
              <div className="ef-alert-error" style={{ marginBottom: '16px' }}>
                {agError}
              </div>
            )}

            <div className="ef-divider" />

            <div className="ef-flex-between">
              <button className="ef-btn-secondary" onClick={() => setStep(3)}>← Back</button>
              <button className="ef-btn-primary" onClick={() => { setStep(2); setExpandedSubIndex(null); setEditingSubIndex(null); }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}