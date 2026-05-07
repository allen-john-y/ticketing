// CreateIncident.js - Redesigned to match Home.js styling
import React, { useState, useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function CreateIncident() {
  const { instance, accounts } = useMsal();
  const currentUser = accounts[0] || {};
  const currentUserName = currentUser.name || currentUser.username || 'User';
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubCategory, setSelectedSubCategory] = useState('');
  const [subCategoryDetails, setSubCategoryDetails] = useState(null);
  
  // On Behalf state
  const [onBehalfEnabled, setOnBehalfEnabled] = useState(false);
  const [onBehalfUser, setOnBehalfUser] = useState({ id: '', name: '', mail: '' });
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userDropdownRef = useRef(null);
  const userInputRef = useRef(null);
  
  // Attachments
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });
  const [nextIncidentNumber, setNextIncidentNumber] = useState('INC-0001');

  useEffect(() => {
    const handler = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target) &&
          userInputRef.current && !userInputRef.current.contains(e.target)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchNextIncidentNumber();
  }, []);

  const fetchNextIncidentNumber = async () => {
    try {
      const res = await axios.get(`${BACKEND}/api/incidents`);
      const allIncidents = res.data || [];
      const maxNumber = allIncidents.reduce((max, inc) => {
        if (inc.incidentNumber) {
          const num = parseInt(inc.incidentNumber.replace('INC-', '').replace('INC', ''));
          return isNaN(num) ? max : Math.max(max, num);
        }
        return max;
      }, 0);
      setNextIncidentNumber(`INC-${String(maxNumber + 1).padStart(4, '0')}`);
    } catch (err) {
      console.error('Failed to fetch next number:', err);
    }
  };

  const fetchCategories = async () => {
    setLoadingCategories(true);
    try {
      const res = await axios.get(`${BACKEND}/api/categories`);
      console.log('📦 FULL CATEGORIES:', res.data);
      
      // Log the specific category and sub-category
      const hrCategory = res.data.find(c => c.categoryName === 'HR' || c.name === 'HR');
      if (hrCategory) {
        console.log('👔 HR CATEGORY:', hrCategory);
        const invoiceSub = hrCategory.subCategories?.find(s => s.name === 'Invoice');
        console.log('📄 INVOICE SUB-CATEGORY:', invoiceSub);
        console.log('🏷️ ASSIGNMENT GROUPS:', invoiceSub?.assignmentGroups);
      }
      
      setCategories(res.data || []);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      showToast('Failed to load categories', 'error');
    } finally {
      setLoadingCategories(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const handleCategoryChange = (categoryName) => {
    setSelectedCategory(categoryName);
    setSelectedSubCategory('');
    setSubCategoryDetails(null);
    setOnBehalfEnabled(false);
    setOnBehalfUser({ id: '', name: '', mail: '' });
  };

  const handleSubCategoryChange = (subCategoryName) => {
    setSelectedSubCategory(subCategoryName);
    const category = categories.find(c => c.categoryName === selectedCategory);
    const subCategory = category?.subCategories?.find(s => s.name === subCategoryName);
    setSubCategoryDetails(subCategory || null);
    setOnBehalfEnabled(false);
    setOnBehalfUser({ id: '', name: '', mail: '' });
  };

  const getSelectedCategoryData = () => {
    return categories.find(c => c.categoryName === selectedCategory);
  };

  const getSubCategoriesForCategory = () => {
    const category = getSelectedCategoryData();
    return category?.subCategories || [];
  };

  const hasSubCategories = () => {
    return getSubCategoriesForCategory().length > 0;
  };

  // ✅ FIXED: Return FULL assignment group with ALL members
  const getAssignmentDetails = () => {
    const category = getSelectedCategoryData();
    console.log('📂 Category:', category?.categoryName);
    
    if (!category) return { assignmentGroup: null };
    
    if (!selectedSubCategory) {
      console.log('⚠️ No sub-category selected yet');
      return { assignmentGroup: null };
    }
    
    const subCategory = category.subCategories?.find(s => s.name === selectedSubCategory);
    console.log('📄 SubCategory:', subCategory?.name);
    console.log('🏷️ SubCategory.assignmentGroups:', subCategory?.assignmentGroups);
    
    if (!subCategory) return { assignmentGroup: null };
    
    const assignmentGroups = subCategory.assignmentGroups || [];
    const assignmentGroup = assignmentGroups.length > 0 ? assignmentGroups[0] : null;
    
    console.log('✅ Found assignment group:', assignmentGroup);
    console.log('   Members count:', assignmentGroup?.members?.length);
    
    // ✅ Return the FULL GROUP with ALL members
    return { 
      assignmentGroup: assignmentGroup ? {
        groupId: assignmentGroup._id || assignmentGroup.id,
        groupName: assignmentGroup.name,
        members: assignmentGroup.members || []  // ← ALL members of the group
      } : null
    };
  };

  const searchUsers = async (query) => {
    if (!query || query.trim().length < 2) {
      setUserSearchResults([]);
      setShowUserDropdown(false);
      setSearchingUsers(false);
      return;
    }
    setSearchingUsers(true);
    setShowUserDropdown(true);
    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read.All'], account: accounts[0] });
      const q = query.trim().replace(/'/g, "''");
      const filter = `startswith(mail,'${q}') or startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')`;
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=5`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      const data = await res.json();
      setUserSearchResults((data.value || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.mail || '(no name)',
        mail: u.mail || u.userPrincipalName || '',
      })));
    } catch (err) {
      setUserSearchResults([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleUserSearch = (value) => {
    setUserSearchQuery(value);
    searchUsers(value);
  };

  const selectOnBehalfUser = (user) => {
    setOnBehalfUser({ id: user.id, name: user.displayName, mail: user.mail });
    setUserSearchQuery('');
    setUserSearchResults([]);
    setShowUserDropdown(false);
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axios.post(`${BACKEND}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setAttachments(prev => [...prev, {
          id: res.data.id,
          driveId: res.data.driveId,
          fileName: res.data.fileName,
          fileType: res.data.fileType,
          url: res.data.url
        }]);
      }
      showToast(`${files.length} file(s) uploaded`, 'success');
    } catch (err) {
      console.error('Upload failed:', err);
      showToast('Failed to upload file(s)', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  // ✅ FIXED: Submit with GROUP assignment (no assignedMember)
  const handleSubmit = async () => {
    if (!title.trim()) {
      showToast('Title is required', 'error');
      return;
    }

    if (!description.trim()) {
      showToast('Description is required', 'error');
      return;
    }

    if (!selectedCategory) {
      showToast('Please select a category', 'error');
      return;
    }

    if (hasSubCategories() && !selectedSubCategory) {
      showToast('Please select a sub-category', 'error');
      return;
    }

    if (subCategoryDetails?.onBehalf?.enabled && subCategoryDetails.onBehalf.required && !onBehalfUser.mail) {
      showToast('Please select a user for on-behalf request', 'error');
      return;
    }

    if (subCategoryDetails?.attachments?.enabled && subCategoryDetails.attachments.required && attachments.length === 0) {
      showToast('Please attach at least one file', 'error');
      return;
    }

    const category = getSelectedCategoryData();
    const { assignmentGroup } = getAssignmentDetails();

    // ✅ Validate assignment group exists
    if (!assignmentGroup || !assignmentGroup.groupName) {
      showToast('No assignment group configured for this sub-category', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // ✅ CORRECT PAYLOAD - NO assignedMember, only assignmentGroup with members
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category: {
          id: category._id,
          name: category.categoryName
        },
        subCategory: hasSubCategories() ? selectedSubCategory : null,
        // ✅ SEND THE FULL GROUP with ALL members
        assignmentGroup: {
          groupId: assignmentGroup.groupId,
          groupName: assignmentGroup.groupName,
          members: assignmentGroup.members  // ← ALL members of the group
        },
        // ❌ NO assignedMember field
        raisedBy: {
          id: currentUser.localAccountId || '',
          name: currentUser.name || '',
          mail: currentUser.username || ''
        },
        onBehalf: {
          enabled: subCategoryDetails?.onBehalf?.enabled && onBehalfEnabled,
          user: onBehalfEnabled ? onBehalfUser : null
        },
        priority: priority,
        attachments: attachments
      };

      console.log('🚀 Submitting incident with GROUP:', {
        groupName: payload.assignmentGroup.groupName,
        membersCount: payload.assignmentGroup.members?.length
      });

      const res = await axios.post(`${BACKEND}/api/incidents`, payload);
      showToast(`Incident ${res.data.incidentNumber} created successfully`, 'success');
      
      resetForm();
      navigate('/incidents');
    } catch (err) {
      console.error('Submit failed:', err);
      showToast(err?.response?.data?.message || 'Failed to create incident', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setPriority('medium');
    setDescription('');
    setSelectedCategory('');
    setSelectedSubCategory('');
    setSubCategoryDetails(null);
    setOnBehalfEnabled(false);
    setOnBehalfUser({ id: '', name: '', mail: '' });
    setAttachments([]);
  };

  const handleCancel = () => {
    resetForm();
    navigate('/');
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:   #002060;
      --navy2:  #003090;
      --orange: #e98404;
      --orange2: #f5a623;
      --white:  #ffffff;
      --bg:     #f5f7fa;
      --border: #e2e8f0;
      --text:   #0f172a;
      --muted:  #64748b;
      --light:  #f8fafc;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1); }
    }

    .ci-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Hero Section */
    .ci-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .ci-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .ci-hero::before {
      content: '';
      position: absolute;
      left: 35%; bottom: -80px;
      width: 320px; height: 320px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(0,48,144,0.5) 0%, transparent 70%);
      pointer-events: none;
    }
    .ci-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .ci-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .ci-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .ci-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .ci-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .ci-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
      max-width: 480px;
    }

    /* Content Area */
    .ci-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    /* Form Styles */
    .ci-form-container {
      animation: fadeUp 0.4s ease both;
    }

    .ci-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 24px; display: inline-flex;
      align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .ci-back-btn:hover { color: var(--orange); }

    .ci-form-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 24px;
      overflow: hidden;
    }

    .ci-form-header {
      padding: 32px 36px;
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
    }
    .ci-incident-number {
      font-family: 'Sora', sans-serif;
      font-size: 28px; font-weight: 800;
      color: var(--navy); letter-spacing: -0.02em;
    }
    .ci-new-badge {
      padding: 5px 14px; border-radius: 30px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
      background: #ef4444; color: white;
      margin-left: 16px;
    }
    .ci-form-title {
      font-size: 16px; font-weight: 500;
      color: var(--muted); margin-top: 8px;
    }

    .ci-form-body {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 0;
    }

    .ci-form-left {
      padding: 36px;
      border-right: 1.5px solid var(--border);
    }

    .ci-form-right {
      padding: 36px;
      background: var(--light);
    }

    .ci-form-group {
      margin-bottom: 32px;
    }
    .ci-form-label {
      display: block;
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 12px;
      letter-spacing: 0.02em;
    }
    .ci-form-label .required {
      color: #ef4444;
      margin-left: 4px;
    }

    .ci-form-input,
    .ci-form-select,
    .ci-form-textarea {
      width: 100%;
      padding: 14px 18px;
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
    }
    .ci-form-input:focus,
    .ci-form-select:focus,
    .ci-form-textarea:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .ci-form-textarea {
      resize: vertical;
      min-height: 160px;
    }

    .ci-checkbox-wrapper {
      display: flex; align-items: center; gap: 8px;
      cursor: pointer;
    }
    .ci-checkbox {
      width: 18px; height: 18px;
      accent-color: var(--navy);
      cursor: pointer;
    }

    .ci-user-dropdown {
      position: absolute; top: 100%; left: 0; right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      margin-top: 8px;
      max-height: 280px; overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
    }
    .ci-dd-item {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 18px; cursor: pointer;
      border-bottom: 1.5px solid var(--border);
      transition: background 0.15s;
    }
    .ci-dd-item:hover { background: var(--bg); }
    .ci-dd-avatar {
      width: 40px; height: 40px; border-radius: 12px;
      background: var(--navy); color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700;
      flex-shrink: 0;
    }
    .ci-dd-name {
      font-size: 15px; font-weight: 600; color: var(--text);
    }
    .ci-dd-email {
      font-size: 12px; color: var(--muted); margin-top: 2px;
    }

    .ci-selected-user {
      margin-top: 16px; padding: 16px;
      background: rgba(0,32,96,0.04);
      border: 1.5px solid var(--navy);
      border-radius: 14px;
    }
    .ci-selected-label {
      font-size: 12px; color: var(--navy); margin-bottom: 8px;
      font-weight: 700;
    }

    .ci-attach-btn {
      padding: 16px 24px;
      background: var(--white);
      border: 2px dashed var(--border);
      border-radius: 14px;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      transition: all 0.2s;
      width: 100%; text-align: center;
      font-family: 'Sora', sans-serif;
    }
    .ci-attach-btn:hover {
      border-color: var(--navy);
      background: rgba(0,32,96,0.02);
    }

    .ci-attachment-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      margin-top: 10px;
    }
    .ci-attachment-remove {
      background: none; border: none;
      color: var(--muted); cursor: pointer;
      font-size: 18px; padding: 4px 8px;
      transition: color 0.2s;
    }
    .ci-attachment-remove:hover { color: #ef4444; }

    .ci-priority-group {
      display: flex; gap: 12px;
    }
    .ci-priority-btn {
      flex: 1;
      padding: 14px 20px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 14px; font-weight: 600;
      color: var(--muted); cursor: pointer;
      transition: all 0.2s;
      font-family: 'Sora', sans-serif;
    }
    .ci-priority-btn:hover {
      border-color: var(--navy);
      color: var(--navy);
    }
    .ci-priority-btn.active-low {
      background: rgba(16,185,129,0.08);
      border-color: #10b981;
      color: #065f46;
      font-weight: 700;
    }
    .ci-priority-btn.active-medium {
      background: rgba(233,132,4,0.08);
      border-color: var(--orange);
      color: #92400e;
      font-weight: 700;
    }
    .ci-priority-btn.active-high {
      background: rgba(239,68,68,0.08);
      border-color: #ef4444;
      color: #991b1b;
      font-weight: 700;
    }

    .ci-info-banner {
      background: rgba(0,32,96,0.04);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      padding: 16px 20px;
      font-size: 14px; color: var(--navy);
      line-height: 1.6;
    }

    .ci-form-footer {
      display: flex; justify-content: flex-end; gap: 16px;
      padding: 28px 36px;
      border-top: 1.5px solid var(--border);
      background: var(--light);
    }

    .ci-btn-cancel {
      padding: 16px 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 15px; font-weight: 600;
      color: var(--muted); cursor: pointer;
      transition: all 0.2s;
      font-family: 'Sora', sans-serif;
    }
    .ci-btn-cancel:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .ci-btn-submit {
      padding: 16px 36px;
      background: #ef4444;
      border: none;
      border-radius: 14px;
      font-size: 15px; font-weight: 700;
      color: white; cursor: pointer;
      transition: all 0.3s;
      font-family: 'Sora', sans-serif;
      box-shadow: 0 4px 12px rgba(239,68,68,0.2);
    }
    .ci-btn-submit:hover:not(:disabled) {
      background: #dc2626;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(239,68,68,0.25);
    }
    .ci-btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .ci-toast {
      position: fixed; bottom: 32px; right: 32px; z-index: 10000;
      padding: 16px 28px; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      font-size: 15px; font-weight: 600;
      animation: slideIn 0.3s ease;
      font-family: 'Sora', sans-serif;
    }
    .ci-toast-success {
      background: #10b981; color: white;
    }
    .ci-toast-error {
      background: #ef4444; color: white;
    }

    @media (max-width: 1024px) {
      .ci-form-body { grid-template-columns: 1fr; }
      .ci-form-left { border-right: none; }
    }
    @media (max-width: 768px) {
      .ci-hero { padding: 40px 24px; }
      .ci-content { padding: 24px 20px 40px; }
    }
  `;

  return (
    <div className="ci-page">
      <style>{sharedCSS}</style>

      {/* Hero Section */}
      <div className="ci-hero">
        <div className="ci-hero-inner">
          <div className="ci-hero-eyebrow">
            <div className="ci-hero-eyebrow-line" />
            Incident Management
          </div>
          <h1>Report an <em>Incident</em></h1>
          <p className="ci-hero-sub">Something not working? Let us know and we'll get it fixed ASAP.</p>
        </div>
      </div>

      {/* Form Content */}
      <div className="ci-content ci-form-container">
        <button className="ci-back-btn" onClick={handleCancel}>
          ← Back to Home
        </button>

        <div className="ci-form-card">
          {/* Form Header */}
          <div className="ci-form-header">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <span className="ci-incident-number">{nextIncidentNumber}</span>
              <span className="ci-new-badge">NEW INCIDENT</span>
            </div>
            <div className="ci-form-title">Reported by {currentUserName}</div>
          </div>

          {/* Form Body */}
          <div className="ci-form-body">
            {/* Left Column */}
            <div className="ci-form-left">
              {/* Title */}
              <div className="ci-form-group">
                <label className="ci-form-label">
                  Brief summary of the incident <span className="required">*</span>
                </label>
                <input
                  className="ci-form-input"
                  placeholder="e.g. Email service is down"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              {/* Category Selection */}
              <div className="ci-form-group">
                <label className="ci-form-label">
                  Category <span className="required">*</span>
                </label>
                <select
                  className="ci-form-select"
                  value={selectedCategory}
                  onChange={e => handleCategoryChange(e.target.value)}
                >
                  <option value="">Select a category...</option>
                  {loadingCategories ? (
                    <option disabled>Loading categories...</option>
                  ) : (
                    categories.map(category => (
                      <option key={category._id} value={category.categoryName}>
                        {category.categoryName}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Sub-Category Selection */}
              {selectedCategory && hasSubCategories() && (
                <div className="ci-form-group">
                  <label className="ci-form-label">
                    Sub-Category <span className="required">*</span>
                  </label>
                  <select
                    className="ci-form-select"
                    value={selectedSubCategory}
                    onChange={e => handleSubCategoryChange(e.target.value)}
                  >
                    <option value="">Select a sub-category...</option>
                    {getSubCategoriesForCategory().map((sub, index) => (
                      <option key={sub._id || sub.name || `sub-${index}`} value={sub.name || sub}>
                        {sub.name || sub}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* On Behalf Section */}
              {subCategoryDetails?.onBehalf?.enabled && (
                <div className="ci-form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <label className="ci-form-label">
                      On Behalf Request {subCategoryDetails.onBehalf.required && <span className="required">*</span>}
                    </label>
                    <label className="ci-checkbox-wrapper">
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Enable</span>
                      <input
                        type="checkbox"
                        className="ci-checkbox"
                        checked={onBehalfEnabled}
                        onChange={(e) => {
                          setOnBehalfEnabled(e.target.checked);
                          if (!e.target.checked) setOnBehalfUser({ id: '', name: '', mail: '' });
                        }}
                      />
                    </label>
                  </div>
                  
                  {onBehalfEnabled && (
                    <div style={{ position: 'relative' }}>
                      <input
                        ref={userInputRef}
                        className="ci-form-input"
                        placeholder="Search by name or email..."
                        value={onBehalfUser.name ? `${onBehalfUser.name} (${onBehalfUser.mail})` : userSearchQuery}
                        onChange={e => {
                          if (onBehalfUser.name) setOnBehalfUser({ id: '', name: '', mail: '' });
                          handleUserSearch(e.target.value);
                        }}
                        onFocus={() => userSearchQuery.length >= 2 && setShowUserDropdown(true)}
                        autoComplete="off"
                      />
                      {searchingUsers && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Searching...</div>}
                      {showUserDropdown && userSearchResults.length > 0 && (
                        <div ref={userDropdownRef} className="ci-user-dropdown">
                          {userSearchResults.map(user => (
                            <div key={user.id} className="ci-dd-item" onClick={() => selectOnBehalfUser(user)}>
                              <div className="ci-dd-avatar">{user.displayName.charAt(0).toUpperCase()}</div>
                              <div>
                                <div className="ci-dd-name">{user.displayName}</div>
                                <div className="ci-dd-email">{user.mail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {onBehalfUser.name && (
                        <div className="ci-selected-user">
                          <div className="ci-selected-label">✓ Selected User</div>
                          <div style={{ fontWeight: '600', color: '#0f172a' }}>{onBehalfUser.name}</div>
                          <div style={{ fontSize: '13px', color: '#64748b' }}>{onBehalfUser.mail}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="ci-form-group">
                <label className="ci-form-label">
                  Detailed Description <span className="required">*</span>
                </label>
                <textarea
                  className="ci-form-textarea"
                  placeholder="Describe the incident in detail - what happened, when, impact, etc."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={8}
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="ci-form-right">
              {/* Priority */}
              <div className="ci-form-group">
                <label className="ci-form-label">Priority Level</label>
                <div className="ci-priority-group">
                  {['low', 'medium', 'high'].map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`ci-priority-btn ${priority === p ? `active-${p}` : ''}`}
                      onClick={() => setPriority(p)}
                    >
                      {p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢'} {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Attachments */}
              {subCategoryDetails?.attachments?.enabled && (
                <div className="ci-form-group">
                  <label className="ci-form-label">
                    Attachments {subCategoryDetails.attachments.required && <span className="required">*</span>}
                  </label>
                  <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
                  <button
                    type="button"
                    className="ci-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    📎 {uploading ? 'Uploading...' : 'Add Attachments'}
                  </button>
                  {attachments.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      {attachments.map(att => (
                        <div key={att.id} className="ci-attachment-item">
                          <span>📄 {att.fileName}</span>
                          <button className="ci-attachment-remove" onClick={() => removeAttachment(att.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ✅ UPDATED: Assignment Preview - Shows GROUP not individual */}
              <div className="ci-form-group">
                <label className="ci-form-label">Assignment Group</label>
                <div className="ci-info-banner">
                  {(() => {
                    const { assignmentGroup } = getAssignmentDetails();
                    if (!assignmentGroup) return 'No assignment group configured for selected sub-category.';
                    return (
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          🏢 {assignmentGroup.groupName}
                        </div>
                        <div style={{ color: '#64748b', marginTop: 6 }}>
                          📋 {assignmentGroup.members?.length || 0} member(s) will handle this incident
                        </div>
                        {assignmentGroup.members?.length > 0 && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: 8 }}>
                            👥 {assignmentGroup.members.slice(0, 3).map(m => m.name).join(', ')}
                            {assignmentGroup.members.length > 3 && ` +${assignmentGroup.members.length - 3} more`}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Form Footer */}
          <div className="ci-form-footer">
            <button className="ci-btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button
              className="ci-btn-submit"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Reporting...' : '🚨 Report Incident'}
            </button>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast.open && (
        <div className={`ci-toast ${toast.type === 'success' ? 'ci-toast-success' : 'ci-toast-error'}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default CreateIncident;