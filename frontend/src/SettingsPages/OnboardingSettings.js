// src/SettingsPages/OnboardingSettings.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function OnboardingSettings() {
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const currentUser = accounts[0] || {};

  // ✅ Mode toggle - starts in edit mode if no settings exist
  const [isEditing, setIsEditing] = useState(false);

  // State for Approvers
  const [approvers, setApprovers] = useState([]);
  const [approverSearchQuery, setApproverSearchQuery] = useState('');
  const [approverResults, setApproverResults] = useState([]);
  const [searchingApprovers, setSearchingApprovers] = useState(false);
  const [showApproverDropdown, setShowApproverDropdown] = useState(false);
  const approverInputRef = useRef(null);
  const approverDropdownRef = useRef(null);

  // State for Groups
  const [allGroups, setAllGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [groupSearchTerm, setGroupSearchTerm] = useState('');

  // State for Settings
  const [settings, setSettings] = useState({
    approvers: [],
    selectedGroups: [],
    approvalRule: 'any',
    autoAddReportingManager: false,
    welcomeEmailSubject: 'Welcome to the Team!',
    welcomeEmailBody: `Dear {firstName},

Welcome to the team! Your account has been created.

Here are your login details:
Email: {email}
Temporary Password: {password}

Please follow these steps to get started:
1. Go to https://portal.office.com
2. Sign in with your email and temporary password
3. You will be prompted to change your password
4. Set up multi-factor authentication (MFA) using the Microsoft Authenticator app
5. Access your email and other Microsoft 365 apps

If you have any questions, please contact IT Support.

Best regards,
IT Team`,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (approverDropdownRef.current && !approverDropdownRef.current.contains(e.target) &&
          approverInputRef.current && !approverInputRef.current.contains(e.target)) {
        setShowApproverDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchAllGroups();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/onboarding/settings`);
      if (res.data) {
        setSettings(res.data);
        setApprovers(res.data.approvers || []);
        setSelectedGroups(res.data.selectedGroups || []);
        
        // ✅ Smart mode detection: If no approvers, show edit mode
        const hasData = res.data.approvers && res.data.approvers.length > 0;
        setIsEditing(!hasData);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      // ✅ If error (no settings found), show edit mode
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllGroups = async () => {
    setLoadingGroups(true);
    try {
      const token = await instance.acquireTokenSilent({
        scopes: ['Group.Read.All'],
        account: accounts[0],
      });

      const res = await axios.get(
        'https://graph.microsoft.com/v1.0/groups?$select=id,displayName,mail,groupTypes,securityEnabled,visibility&$top=100',
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );

      const groups = (res.data.value || []).map(group => {
        let type = 'security';
        if (group.groupTypes?.includes('Unified')) {
          type = 'm365';
        } else if (group.mail && !group.securityEnabled) {
          type = 'dl';
        }
        return {
          id: group.id,
          displayName: group.displayName,
          mail: group.mail || '',
          type: type,
          securityEnabled: group.securityEnabled || false,
          visibility: group.visibility || 'private',
          selected: selectedGroups.includes(group.id),
        };
      });

      setAllGroups(groups);
    } catch (err) {
      console.error('Error fetching groups:', err);
      showToast('Failed to fetch groups from Azure AD', 'error');
    } finally {
      setLoadingGroups(false);
    }
  };

  const searchApprovers = async (query) => {
    if (!query || query.trim().length < 2) {
      setApproverResults([]);
      setShowApproverDropdown(false);
      setSearchingApprovers(false);
      return;
    }

    setSearchingApprovers(true);
    setShowApproverDropdown(true);

    try {
      const token = await instance.acquireTokenSilent({
        scopes: ['User.Read.All'],
        account: accounts[0],
      });

      const q = query.trim().replace(/'/g, "''");
      const filter = `startswith(mail,'${q}') or startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')`;

      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=10`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );

      const data = await res.json();
      const results = (data.value || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.mail || '(no name)',
        mail: u.mail || u.userPrincipalName || '',
      }));

      const existingEmails = new Set(approvers.map(a => a.mail.toLowerCase()));
      setApproverResults(results.filter(u => !existingEmails.has(u.mail.toLowerCase())));
    } catch (err) {
      console.error('Error searching users:', err);
      setApproverResults([]);
    } finally {
      setSearchingApprovers(false);
    }
  };

  const handleApproverSearch = (value) => {
    setApproverSearchQuery(value);
    searchApprovers(value);
  };

  const addApprover = (user) => {
    setApprovers(prev => [...prev, user]);
    setApproverSearchQuery('');
    setApproverResults([]);
    setShowApproverDropdown(false);
  };

  const removeApprover = (userId) => {
    setApprovers(prev => prev.filter(a => a.id !== userId));
  };

  const handleGroupToggle = (groupId) => {
    setSelectedGroups(prev => {
      if (prev.includes(groupId)) {
        return prev.filter(id => id !== groupId);
      } else {
        return [...prev, groupId];
      }
    });
  };

  const toggleAllGroups = () => {
    const filteredGroups = getFilteredGroups();
    const allSelected = filteredGroups.every(g => selectedGroups.includes(g.id));

    if (allSelected) {
      const filteredIds = new Set(filteredGroups.map(g => g.id));
      setSelectedGroups(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      const filteredIds = filteredGroups.map(g => g.id);
      setSelectedGroups(prev => [...new Set([...prev, ...filteredIds])]);
    }
  };

  const getFilteredGroups = () => {
    let filtered = [...allGroups];

    if (groupFilter === 'm365') {
      filtered = filtered.filter(g => g.type === 'm365');
    } else if (groupFilter === 'security') {
      filtered = filtered.filter(g => g.type === 'security' && !g.groupTypes?.includes('Unified'));
    } else if (groupFilter === 'dl') {
      filtered = filtered.filter(g => g.type === 'dl');
    }

    if (groupSearchTerm) {
      const term = groupSearchTerm.toLowerCase();
      filtered = filtered.filter(g =>
        g.displayName.toLowerCase().includes(term) ||
        (g.mail && g.mail.toLowerCase().includes(term))
      );
    }

    return filtered;
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setApprovers(settings.approvers || []);
    setSelectedGroups(settings.selectedGroups || []);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (approvers.length === 0) {
      showToast('Please add at least one approver', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...settings,
        approvers: approvers,
        selectedGroups: selectedGroups,
        updatedBy: {
          id: currentUser.localAccountId || '',
          name: currentUser.name || '',
          email: currentUser.username || '',
        },
      };

      await axios.post(`${BACKEND}/api/onboarding/settings`, payload);
      
      setSettings(prev => ({
        ...prev,
        approvers: approvers,
        selectedGroups: selectedGroups,
      }));
      
      showToast('Onboarding settings saved successfully!', 'success');
      setIsEditing(false);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to save settings';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const groupTypeBadge = (type) => {
    if (type === 'm365') return { label: 'M365', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' };
    if (type === 'security') return { label: 'Security', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' };
    if (type === 'dl') return { label: 'DL', color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
    return { label: 'Unknown', color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
  };

  const getSelectedGroupDetails = () => {
    return allGroups.filter(g => selectedGroups.includes(g.id));
  };

  const hasSettingsData = approvers.length > 0 || selectedGroups.length > 0;

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
      --green: #10b981;
      --red: #ef4444;
    }

    .os-page {
      min-height: 70vh;
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 24px;
      font-family: 'Lato', sans-serif;
      color: var(--text);
      background: var(--bg);
    }

    .os-sticky-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--bg);
      padding: 12px 0 16px 0;
      margin-bottom: 24px;
      border-bottom: 2px solid var(--border);
    }
    .os-sticky-inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .os-sticky-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .os-sticky-left h1 {
      font-family: 'Sora', sans-serif;
      font-size: 22px;
      font-weight: 800;
      color: var(--navy);
      margin: 0;
    }
    .os-sticky-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .os-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 14px;
      border-radius: 30px;
      font-size: 12px;
      font-weight: 700;
      font-family: 'Sora', sans-serif;
    }
    .os-status-badge.preview {
      background: rgba(16,185,129,0.1);
      color: #065f46;
      border: 1px solid #10b981;
    }
    .os-status-badge.edit {
      background: rgba(233,132,4,0.1);
      color: #92400e;
      border: 1px solid #e98404;
    }

    .os-count-badge {
      background: var(--navy);
      color: white;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
    }

    .os-back-btn {
      padding: 8px 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: var(--navy);
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .os-back-btn:hover {
      border-color: var(--navy);
      background: rgba(0,32,96,0.04);
    }

    .os-btn {
      padding: 10px 24px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .os-btn.primary {
      background: var(--navy);
      color: white;
    }
    .os-btn.primary:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .os-btn.primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .os-btn.secondary {
      background: var(--white);
      color: var(--text);
      border: 1.5px solid var(--border);
    }
    .os-btn.secondary:hover {
      border-color: var(--navy);
      color: var(--navy);
    }
    .os-btn.edit {
      background: var(--orange);
      color: white;
    }
    .os-btn.edit:hover {
      background: #d97706;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(233,132,4,0.3);
    }
    .os-btn.danger {
      background: var(--red);
      color: white;
    }
    .os-btn.danger:hover {
      background: #dc2626;
    }

    .os-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 24px 28px;
      margin-bottom: 20px;
    }
    .os-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: var(--navy);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .os-card-title-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .os-card-desc {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 14px;
    }

    .os-label {
      display: block;
      font-family: 'Sora', sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 6px;
    }
    .os-label .required {
      color: var(--red);
      margin-left: 4px;
    }

    .os-input {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
      background: var(--white);
      color: var(--text);
    }
    .os-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .os-input:disabled {
      background: var(--bg);
      color: var(--muted);
      cursor: not-allowed;
    }

    .os-user-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      margin-top: 6px;
      max-height: 260px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
    }
    .os-dd-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1.5px solid var(--border);
      transition: background 0.15s;
    }
    .os-dd-item:hover {
      background: var(--bg);
    }
    .os-dd-avatar {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--navy);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .os-dd-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
    }
    .os-dd-email {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }

    .os-approver-tag {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(0,32,96,0.06);
      border: 1.5px solid rgba(0,32,96,0.12);
      border-radius: 30px;
      font-size: 13px;
      margin-right: 6px;
      margin-bottom: 6px;
    }
    .os-approver-tag-remove {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--muted);
      font-size: 14px;
      padding: 0 4px;
      transition: color 0.15s;
    }
    .os-approver-tag-remove:hover {
      color: var(--red);
    }
    .os-approver-tag-remove:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .os-checkbox-group {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 8px;
    }
    .os-checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      cursor: pointer;
    }
    .os-checkbox {
      accent-color: var(--navy);
      width: 17px;
      height: 17px;
      cursor: pointer;
    }
    .os-checkbox:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .os-group-filters {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .os-filter-btn {
      padding: 6px 16px;
      border: 1.5px solid var(--border);
      border-radius: 30px;
      background: var(--white);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
      color: var(--muted);
    }
    .os-filter-btn:hover:not(:disabled) {
      border-color: var(--navy);
      background: rgba(0, 32, 96, 0.06);
      color: var(--navy);
      transform: translateY(-1px);
    }
    .os-filter-btn.active {
      background: var(--navy);
      color: white;
      border-color: var(--navy);
    }
    .os-filter-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .os-group-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      max-height: 260px;
      overflow-y: auto;
      padding: 4px;
    }
    .os-group-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1.5px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .os-group-item:hover:not(.disabled) {
      border-color: var(--navy);
      background: rgba(0,32,96,0.02);
    }
    .os-group-item.selected {
      border-color: var(--navy);
      background: rgba(0,32,96,0.04);
    }
    .os-group-item.disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .os-group-item-check {
      accent-color: var(--navy);
      width: 15px;
      height: 15px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .os-group-item-check:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .os-group-name {
      font-size: 13px;
      font-weight: 500;
      flex: 1;
    }
    .os-group-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 20px;
      text-transform: uppercase;
      flex-shrink: 0;
    }

    /* ✅ FIXED: Group Capsules - always visible in edit mode */
    .os-group-capsules-container {
      margin-top: 12px;
      padding: 12px 14px;
      background: var(--bg);
      border-radius: 10px;
      border: 1.5px solid var(--border);
      min-height: 48px;
    }
    .os-group-capsules-container .capsule-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .os-group-capsules {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .os-group-capsule {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 30px;
      font-size: 12px;
      font-weight: 600;
      border: 1.5px solid;
    }
    .os-group-capsule .remove-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 12px;
      padding: 0 4px;
      color: inherit;
      opacity: 0.6;
      transition: opacity 0.15s;
    }
    .os-group-capsule .remove-btn:hover {
      opacity: 1;
    }
    .os-group-capsule .remove-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .os-empty-capsules {
      color: var(--muted);
      font-size: 13px;
    }

    /* ✅ FIXED: Group counts */
    .os-group-counts {
      display: flex;
      gap: 20px;
      font-size: 12px;
      color: var(--muted);
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .os-group-counts .total-selected {
      color: var(--navy);
      font-weight: 700;
    }
    .os-group-counts .filtered-count {
      color: var(--muted);
    }

    .os-textarea {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      resize: vertical;
      min-height: 120px;
      transition: all 0.2s;
      background: var(--white);
      color: var(--text);
    }
    .os-textarea:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .os-textarea:disabled {
      background: var(--bg);
      color: var(--muted);
      cursor: not-allowed;
    }

    .os-preview-text {
      padding: 4px 0;
      font-size: 14px;
      color: var(--text);
      line-height: 1.6;
    }
    .os-preview-text .label {
      font-weight: 600;
      color: var(--navy);
      min-width: 120px;
      display: inline-block;
    }
    .os-preview-text .value {
      color: var(--text);
    }
    .os-preview-text .empty {
      color: var(--muted);
      font-style: italic;
    }
    .os-preview-email {
      background: var(--bg);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      font-family: 'Lato', sans-serif;
      font-size: 14px;
      white-space: pre-wrap;
      color: var(--text);
      line-height: 1.6;
      max-height: 250px;
      overflow-y: auto;
    }

    .os-placeholder {
      color: var(--muted);
      font-size: 14px;
      text-align: center;
      padding: 16px;
    }

    .os-loading {
      text-align: center;
      padding: 40px;
    }
    .os-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      border-radius: 50%;
      margin: 0 auto 16px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .os-toast {
      position: fixed;
      bottom: 32px;
      right: 32px;
      z-index: 99999;
      padding: 14px 24px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      font-size: 14px;
      font-weight: 600;
      animation: slideIn 0.3s ease;
      font-family: 'Sora', sans-serif;
    }
    .os-toast.success {
      background: var(--green);
      color: white;
    }
    .os-toast.error {
      background: var(--red);
      color: white;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @media (max-width: 768px) {
      .os-page { padding: 16px; }
      .os-sticky-inner { flex-direction: column; align-items: stretch; gap: 8px; }
      .os-sticky-left { flex-wrap: wrap; }
      .os-sticky-right { flex-wrap: wrap; }
      .os-sticky-right .os-btn { flex: 1; justify-content: center; }
      .os-group-grid { grid-template-columns: 1fr; }
      .os-card { padding: 16px; }
      .os-approver-tag { width: 100%; justify-content: space-between; }
      .os-card-title { flex-direction: column; align-items: flex-start; gap: 8px; }
      .os-group-counts { flex-direction: column; gap: 4px; }
    }
  `;

  if (loading) {
    return (
      <div className="os-page">
        <style>{sharedCSS}</style>
        <div className="os-loading">
          <div className="os-spinner" />
          <p style={{ color: 'var(--muted)' }}>Loading settings...</p>
        </div>
      </div>
    );
  }

  const filteredGroups = getFilteredGroups();
  const filteredCount = filteredGroups.filter(g => selectedGroups.includes(g.id)).length;
  const totalSelected = selectedGroups.length;
  const selectedGroupDetails = getSelectedGroupDetails();

  return (
    <div className="os-page">
      <style>{sharedCSS}</style>

      {/* Sticky Header with Actions */}
      <div className="os-sticky-header">
        <div className="os-sticky-inner">
          <div className="os-sticky-left">
            <h1>⚙️ Onboarding Settings</h1>
            <span className={`os-status-badge ${isEditing ? 'edit' : 'preview'}`}>
              {isEditing ? '✏️ Editing' : '👁️ Preview'}
            </span>
            {hasSettingsData && !isEditing && (
              <>
                <span className="os-count-badge">{approvers.length} Approvers</span>
                <span className="os-count-badge">{selectedGroups.length} Groups</span>
              </>
            )}
          </div>
          <div className="os-sticky-right">
            <button className="os-back-btn" onClick={() => navigate('/settings')}>
              ← Back
            </button>
            {isEditing ? (
              <>
                <button className="os-btn secondary" onClick={handleCancel} disabled={saving}>
                  Cancel
                </button>
                <button className="os-btn primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : '💾 Save'}
                </button>
              </>
            ) : (
              <button className="os-btn edit" onClick={handleEdit}>
                ✏️ Edit Settings
              </button>
            )}
          </div>
        </div>
        {!isEditing && hasSettingsData && (
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
            {settings.approvalRule === 'all' ? '🔒 All approvers must approve' : '🔓 Any one approver can approve'}
            {settings.autoAddReportingManager && ' • Auto-adds Reporting Manager'}
          </div>
        )}
      </div>

      {/* Approvers Section */}
      <div className="os-card">
        <div className="os-card-title">
          <div className="os-card-title-left">👥 Approvers</div>
          {!isEditing && (
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {approvers.length} approver{approvers.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {isEditing ? (
          <>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <input
                ref={approverInputRef}
                className="os-input"
                placeholder="Search by name or email..."
                value={approverSearchQuery}
                onChange={e => handleApproverSearch(e.target.value)}
                onFocus={() => approverSearchQuery.length >= 2 && setShowApproverDropdown(true)}
                autoComplete="off"
              />
              {searchingApprovers && (
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>Searching...</div>
              )}
              {showApproverDropdown && approverResults.length > 0 && (
                <div ref={approverDropdownRef} className="os-user-dropdown">
                  {approverResults.map(user => (
                    <div key={user.id} className="os-dd-item" onClick={() => addApprover(user)}>
                      <div className="os-dd-avatar">{user.displayName.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="os-dd-name">{user.displayName}</div>
                        <div className="os-dd-email">{user.mail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '10px' }}>
              {approvers.map(approver => (
                <span key={approver.id} className="os-approver-tag">
                  {approver.displayName} ({approver.mail})
                  <button className="os-approver-tag-remove" onClick={() => removeApprover(approver.id)}>✕</button>
                </span>
              ))}
              {approvers.length === 0 && (
                <div className="os-placeholder">No approvers added yet. Search and add users above.</div>
              )}
            </div>

            <div className="os-checkbox-group">
              <label className="os-checkbox-label">
                <input
                  type="checkbox"
                  className="os-checkbox"
                  checked={settings.autoAddReportingManager}
                  onChange={e => setSettings(prev => ({ ...prev, autoAddReportingManager: e.target.checked }))}
                />
                Auto-add Reporting Manager as approver
              </label>
              <label className="os-checkbox-label">
                <input
                  type="checkbox"
                  className="os-checkbox"
                  checked={settings.approvalRule === 'all'}
                  onChange={e => setSettings(prev => ({
                    ...prev,
                    approvalRule: e.target.checked ? 'all' : 'any'
                  }))}
                />
                All approvers must approve
              </label>
            </div>
          </>
        ) : (
          <div>
            {approvers.length > 0 ? (
              <div>
                {approvers.map(approver => (
                  <span key={approver.id} className="os-approver-tag" style={{ cursor: 'default' }}>
                    {approver.displayName} ({approver.mail})
                  </span>
                ))}
              </div>
            ) : (
              <div className="os-placeholder">No approvers configured</div>
            )}
          </div>
        )}
      </div>

      {/* Groups Section */}
      <div className="os-card">
        <div className="os-card-title">
          <div className="os-card-title-left">📁 Azure AD Groups</div>
          {!isEditing && (
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {selectedGroups.length} group{selectedGroups.length !== 1 ? 's' : ''} selected
            </span>
          )}
        </div>

        {isEditing ? (
          <>
            <div className="os-group-filters">
              <button
                className={`os-filter-btn ${groupFilter === 'all' ? 'active' : ''}`}
                onClick={() => setGroupFilter('all')}
              >
                All
              </button>
              <button
                className={`os-filter-btn ${groupFilter === 'm365' ? 'active' : ''}`}
                onClick={() => setGroupFilter('m365')}
              >
                Microsoft 365
              </button>
              <button
                className={`os-filter-btn ${groupFilter === 'security' ? 'active' : ''}`}
                onClick={() => setGroupFilter('security')}
              >
                Security
              </button>
              <button
                className={`os-filter-btn ${groupFilter === 'dl' ? 'active' : ''}`}
                onClick={() => setGroupFilter('dl')}
              >
                Distribution Lists
              </button>
              <button
                className="os-filter-btn"
                onClick={toggleAllGroups}
                style={{ marginLeft: 'auto' }}
              >
                {filteredGroups.every(g => selectedGroups.includes(g.id)) ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <input
                className="os-input"
                placeholder="Search groups..."
                value={groupSearchTerm}
                onChange={e => setGroupSearchTerm(e.target.value)}
              />
            </div>

            {loadingGroups ? (
              <div className="os-loading" style={{ padding: '16px' }}>
                <div className="os-spinner" style={{ width: '30px', height: '30px' }} />
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading groups from Azure AD...</p>
              </div>
            ) : (
              <>
                <div className="os-group-grid">
                  {filteredGroups.length === 0 ? (
                    <div className="os-placeholder" style={{ gridColumn: 'span 2' }}>
                      No groups found matching the filter
                    </div>
                  ) : (
                    filteredGroups.map(group => {
                      const badge = groupTypeBadge(group.type);
                      const isSelected = selectedGroups.includes(group.id);
                      return (
                        <div
                          key={group.id}
                          className={`os-group-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleGroupToggle(group.id)}
                        >
                          <input
                            type="checkbox"
                            className="os-group-item-check"
                            checked={isSelected}
                            onChange={() => handleGroupToggle(group.id)}
                            onClick={e => e.stopPropagation()}
                          />
                          <span className="os-group-name">{group.displayName}</span>
                          <span className="os-group-badge" style={{ background: badge.bg, color: badge.color }}>
                            {badge.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* ✅ FIXED: Group counts - separate total from filtered */}
                <div className="os-group-counts">
                  <span className="total-selected">
                    ✅ {totalSelected} group{totalSelected !== 1 ? 's' : ''} selected total
                  </span>
                  <span className="filtered-count">
                    📊 {filteredCount} selected in current filter ({filteredGroups.length} total in filter)
                  </span>
                </div>

                {/* ✅ FIXED: Capsule preview of selected groups - ALWAYS visible */}
                <div className="os-group-capsules-container">
                  <div className="capsule-label">Selected Groups Preview:</div>
                  <div className="os-group-capsules">
                    {selectedGroupDetails.length > 0 ? (
                      selectedGroupDetails.map(group => {
                        const badge = groupTypeBadge(group.type);
                        return (
                          <span
                            key={group.id}
                            className="os-group-capsule"
                            style={{ borderColor: badge.color, background: badge.bg, color: badge.color }}
                          >
                            {group.displayName}
                            <span style={{ fontSize: '10px', opacity: 0.7 }}>{badge.label}</span>
                            <button
                              className="remove-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGroupToggle(group.id);
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <span className="os-empty-capsules">No groups selected yet. Check the groups above to add them.</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          // Preview Mode - Groups
          <div>
            {selectedGroups.length > 0 ? (
              <div className="os-group-capsules" style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: '10px', border: '1.5px solid var(--border)', minHeight: '40px' }}>
                {selectedGroupDetails.map(group => {
                  const badge = groupTypeBadge(group.type);
                  return (
                    <span
                      key={group.id}
                      className="os-group-capsule"
                      style={{ borderColor: badge.color, background: badge.bg, color: badge.color }}
                    >
                      {group.displayName}
                      <span style={{ fontSize: '10px', opacity: 0.7 }}>{badge.label}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="os-placeholder">No groups selected</div>
            )}
          </div>
        )}
      </div>

      {/* Email Content Section */}
      <div className="os-card">
        <div className="os-card-title">
          <div className="os-card-title-left">✉️ Welcome Email Template</div>
        </div>

        {isEditing ? (
          <>
            <div style={{ marginBottom: '12px' }}>
              <label className="os-label">Email Subject</label>
              <input
                className="os-input"
                value={settings.welcomeEmailSubject}
                onChange={e => setSettings(prev => ({ ...prev, welcomeEmailSubject: e.target.value }))}
                placeholder="Welcome to the Team!"
              />
            </div>

            <div>
              <label className="os-label">Email Body <span className="required">*</span></label>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                Use placeholders: {'{firstName}'}, {'{email}'}, {'{password}'}
              </div>
              <textarea
                className="os-textarea"
                value={settings.welcomeEmailBody}
                onChange={e => setSettings(prev => ({ ...prev, welcomeEmailBody: e.target.value }))}
                rows={10}
              />
            </div>
          </>
        ) : (
          <div>
            <div style={{ marginBottom: '6px' }}>
              <strong style={{ fontSize: '14px', color: 'var(--navy)' }}>Subject:</strong>
              <span style={{ fontSize: '14px', marginLeft: '8px' }}>{settings.welcomeEmailSubject}</span>
            </div>
            <div className="os-preview-email">
              {settings.welcomeEmailBody}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}