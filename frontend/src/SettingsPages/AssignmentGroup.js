// AssignmentGroups.js - Redesigned to match Home.js styling
import { useEffect, useState, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function AssignmentGroups() {
  const { instance, accounts } = useMsal();
  const currentUser = accounts[0] || {};

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });

  // Form fields
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [distributionLists, setDistributionLists] = useState([]);
  const [loadingDL, setLoadingDL] = useState(false);
  const [memberSource, setMemberSource] = useState('manual');
  const [selectedDL, setSelectedDL] = useState(null);
  const [dlSearch, setDlSearch] = useState('');
  const [manualMembers, setManualMembers] = useState([]);
  
  // User search
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  
  const userDropdownRef = useRef(null);
  const userInputRef = useRef(null);

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

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/assignment-groups`);
      setGroups(res.data || []);
    } catch (err) {
      showToast('Failed to load assignment groups', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchDLs = async () => {
    setLoadingDL(true);
    try {
      const token = await instance.acquireTokenSilent({
        scopes: ['Group.Read.All'],
        account: accounts[0],
      });

      const res = await axios.get(
        'https://graph.microsoft.com/v1.0/groups?$select=id,displayName,mail,mailEnabled,securityEnabled,groupTypes',
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );

      const dls = (res.data.value || [])
        .filter(g =>
          g.mailEnabled === true &&
          g.securityEnabled === false &&
          (!g.groupTypes || g.groupTypes.length === 0)
        )
        .map(dl => ({
          id: dl.id,
          name: dl.displayName,
          mail: dl.mail,
          members: [],
        }));

      await Promise.all(dls.map(async (dl) => {
        try {
          const mRes = await axios.get(
            `https://graph.microsoft.com/v1.0/groups/${dl.id}/members?$select=id,displayName,mail,userPrincipalName`,
            { headers: { Authorization: `Bearer ${token.accessToken}` } }
          );
          dl.members = (mRes.data.value || []).map(m => ({
            id: m.id,
            name: m.displayName,
            mail: m.mail || m.userPrincipalName,
          }));
        } catch {
          dl.members = [];
        }
      }));

      setDistributionLists(dls);
    } catch (err) {
      console.error('Failed to fetch DLs:', err);
      showToast('Failed to load distribution lists', 'error');
    } finally {
      setLoadingDL(false);
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchDLs();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const resetForm = () => {
    setGroupName('');
    setDescription('');
    setMemberSource('manual');
    setSelectedDL(null);
    setDlSearch('');
    setManualMembers([]);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setShowUserDropdown(false);
  };

  const openCreate = () => {
    resetForm();
    setModalMode('create');
    setSelectedGroup(null);
    setShowModal(true);
  };

  const openEdit = (group) => {
    resetForm();
    setModalMode('edit');
    setSelectedGroup(group);
    setGroupName(group.name || '');
    setDescription(group.description || '');
    
    if (group.distributionList?.id) {
      setMemberSource('dl');
      setSelectedDL(group.distributionList);
    } else {
      setMemberSource('manual');
      setManualMembers((group.members || []).filter(m => m.isManual));
    }
    
    setShowModal(true);
  };

  const openDelete = (group) => {
    setModalMode('delete');
    setSelectedGroup(group);
    setShowModal(true);
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
      const token = await instance.acquireTokenSilent({
        scopes: ['User.Read.All'],
        account: accounts[0],
      });

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
        userPrincipalName: u.userPrincipalName || '',
      })));
    } catch (err) {
      console.error('User search failed:', err);
      setUserSearchResults([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleUserSearch = (value) => {
    setUserSearchQuery(value);
    searchUsers(value);
  };

  const selectUser = (user) => {
    setShowUserDropdown(false);
    setUserSearchQuery('');
    setUserSearchResults([]);
    
    if (manualMembers.some(m => m.id === user.id)) {
      showToast('User already added', 'error');
      return;
    }

    setManualMembers(prev => [...prev, {
      id: user.id,
      name: user.displayName,
      email: user.mail,
      isManual: true,
    }]);
  };

  const removeManualMember = (id) => {
    setManualMembers(prev => prev.filter(m => m.id !== id));
  };

  const handleSelectDL = (dl) => {
    setSelectedDL(dl);
    setManualMembers([]);
  };

  const getFinalMembers = () => {
    if (memberSource === 'dl' && selectedDL) {
      return selectedDL.members || [];
    }
    return manualMembers;
  };

  const handleSubmit = async () => {
    if (!groupName.trim()) return showToast('Group name is required', 'error');
    
    const finalMembers = getFinalMembers();
    if (finalMembers.length === 0) {
      return showToast('Add at least one member or select a distribution list', 'error');
    }

    setSubmitting(true);
    try {
      const payload = {
        name: groupName.trim(),
        description: description.trim(),
        members: finalMembers,
        distributionList: memberSource === 'dl' && selectedDL 
          ? { id: selectedDL.id, name: selectedDL.name, mail: selectedDL.mail } 
          : null,
        createdBy: {
          id: currentUser.localAccountId || '',
          name: currentUser.name || '',
          email: currentUser.username || '',
        },
      };

      if (modalMode === 'create') {
        await axios.post(`${BACKEND}/api/assignment-groups`, payload);
        showToast('Assignment group created successfully', 'success');
      } else {
        await axios.put(`${BACKEND}/api/assignment-groups/${selectedGroup._id}`, payload);
        showToast('Assignment group updated successfully', 'success');
      }

      setShowModal(false);
      fetchGroups();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save group', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await axios.delete(`${BACKEND}/api/assignment-groups/${selectedGroup._id}`);
      showToast('Assignment group deleted', 'success');
      setShowModal(false);
      fetchGroups();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to delete group', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredDLs = dlSearch
    ? distributionLists.filter(dl =>
        dl.name?.toLowerCase().includes(dlSearch.toLowerCase()) ||
        dl.mail?.toLowerCase().includes(dlSearch.toLowerCase())
      )
    : distributionLists;

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
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ag-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Hero Section */
    .ag-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .ag-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .ag-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .ag-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .ag-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .ag-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .ag-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .ag-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .ag-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    /* Header Bar */
    .ag-header-bar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 28px;
      padding: 20px 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      animation: fadeUp 0.45s 0.05s ease both;
    }

    .ag-header-left h2 {
      font-family: 'Sora', sans-serif;
      font-size: 20px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 4px;
    }

    .ag-header-left p {
      font-size: 13px; color: var(--muted);
    }

    .ag-btn-primary {
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
    .ag-btn-primary:hover {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,32,96,0.25);
    }

    .ag-btn-secondary {
      padding: 10px 20px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 13px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .ag-btn-secondary:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .ag-btn-danger {
      padding: 10px 20px;
      background: var(--white);
      border: 1.5px solid #fee2e2;
      border-radius: 12px;
      font-size: 13px; font-weight: 600;
      color: #991b1b;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .ag-btn-danger:hover {
      background: #fee2e2;
      border-color: #ef4444;
    }

    /* Groups Grid */
    .ag-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 22px;
      animation: fadeUp 0.5s 0.1s ease both;
    }

    .ag-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      transition: all 0.22s;
    }
    .ag-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 16px 40px rgba(0,32,96,0.1);
      border-color: #c8d4e4;
    }

    .ag-card-header {
      padding: 20px 24px;
      background: var(--light);
      border-bottom: 1.5px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }

    .ag-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 17px; font-weight: 700;
      color: var(--navy);
    }

    .ag-card-badge {
      padding: 4px 12px;
      background: var(--navy);
      border-radius: 20px;
      font-size: 11px; font-weight: 700;
      color: white;
    }

    .ag-card-body {
      padding: 20px 24px;
    }

    .ag-info-row {
      display: flex; justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .ag-info-label {
      color: var(--muted);
    }

    .ag-info-value {
      color: var(--text);
      font-weight: 500;
    }

    .ag-members-section {
      margin-top: 16px;
    }

    .ag-members-label {
      font-family: 'Sora', sans-serif;
      font-size: 11px; font-weight: 700;
      color: var(--navy);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 10px;
    }

    .ag-member-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
    }
    .ag-member-row:last-child {
      border-bottom: none;
    }

    .ag-avatar {
      width: 32px; height: 32px; border-radius: 10px;
      background: var(--navy);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700;
      color: white;
      flex-shrink: 0;
    }

    .ag-member-info {
      flex: 1;
    }

    .ag-member-name {
      font-size: 13px; font-weight: 600;
      color: var(--text);
      margin-bottom: 2px;
    }

    .ag-member-email {
      font-size: 11px; color: var(--muted);
    }

    .ag-manual-badge {
      font-size: 9px; font-weight: 700;
      padding: 2px 8px; border-radius: 12px;
      background: #d1fae5;
      color: #065f46;
    }

    .ag-more-members {
      font-size: 12px; color: var(--muted);
      text-align: center; margin-top: 8px;
    }

    .ag-card-footer {
      padding: 16px 24px;
      background: var(--light);
      border-top: 1.5px solid var(--border);
      display: flex; gap: 10px;
    }

    /* Empty State */
    .ag-empty {
      text-align: center; padding: 60px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
    }
    .ag-empty-icon {
      font-size: 48px; margin-bottom: 16px;
    }
    .ag-empty-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 8px;
    }

    /* Loading */
    .ag-loading {
      text-align: center; padding: 60px;
    }
    .ag-spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      animation: spin 0.9s linear infinite;
      margin: 0 auto 20px;
    }

    /* Modal */
    .ag-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
      padding: 24px;
    }

    .ag-modal {
      background: var(--white);
      border-radius: 24px;
      width: 100%; max-width: 640px;
      max-height: 90vh; overflow-y: auto;
      border: 1.5px solid var(--border);
    }

    .ag-modal-header {
      padding: 24px 28px;
      border-bottom: 1.5px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; background: var(--white); z-index: 10;
    }

    .ag-modal-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
    }

    .ag-modal-close {
      background: none; border: none;
      font-size: 20px; color: var(--muted);
      cursor: pointer;
    }

    .ag-modal-body {
      padding: 28px;
    }

    .ag-modal-footer {
      padding: 20px 28px;
      border-top: 1.5px solid var(--border);
      display: flex; gap: 12px; justify-content: flex-end;
      position: sticky; bottom: 0; background: var(--white);
    }

    /* Form Elements */
    .ag-form-group {
      margin-bottom: 24px;
    }

    .ag-label {
      display: block;
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 10px;
      letter-spacing: 0.02em;
    }
    .ag-label .required {
      color: #ef4444;
      margin-left: 4px;
    }

    .ag-input, .ag-textarea {
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
    .ag-input:focus, .ag-textarea:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .ag-textarea {
      resize: vertical;
      min-height: 80px;
    }

    /* Source Buttons */
    .ag-source-row {
      display: flex; gap: 12px;
      margin-bottom: 20px;
    }

    .ag-source-btn {
      flex: 1;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1.5px solid var(--border);
      background: var(--white);
      cursor: pointer;
      font-size: 14px; font-weight: 600;
      display: flex; align-items: center; justify-content: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .ag-source-btn:hover {
      border-color: var(--navy);
    }
    .ag-source-btn.active {
      background: rgba(0,32,96,0.04);
      border-color: var(--navy);
      color: var(--navy);
    }

    /* DL List */
    .ag-dl-list {
      max-height: 250px;
      overflow-y: auto;
      display: flex; flex-direction: column; gap: 8px;
      margin-top: 12px;
    }

    .ag-dl-item {
      padding: 14px 18px;
      background: var(--bg);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ag-dl-item:hover {
      border-color: var(--navy);
      background: var(--white);
    }
    .ag-dl-item.selected {
      background: rgba(0,32,96,0.04);
      border-color: var(--navy);
    }

    .ag-dl-name {
      font-weight: 600; font-size: 14px;
      color: var(--text);
      margin-bottom: 2px;
    }

    .ag-dl-email {
      font-size: 11px; color: var(--muted);
    }

    .ag-dl-members {
      font-size: 11px; color: var(--muted);
      margin-top: 4px;
    }

    .ag-selected-dl {
      padding: 18px;
      background: #d1fae5;
      border: 1.5px solid #10b981;
      border-radius: 14px;
      margin-bottom: 16px;
    }

    /* User Dropdown */
    .ag-user-search-wrapper {
      position: relative;
    }

    .ag-user-dropdown {
      position: absolute; top: 100%; left: 0; right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      margin-top: 8px;
      max-height: 280px; overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
      animation: slideDown 0.15s ease-out;
    }

    .ag-user-dropdown-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; cursor: pointer;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    .ag-user-dropdown-item:last-child { border-bottom: none; }
    .ag-user-dropdown-item:hover { background: var(--bg); }

    .ag-user-avatar {
      width: 36px; height: 36px; border-radius: 10px;
      background: var(--navy);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700;
      color: white;
      flex-shrink: 0;
    }

    .ag-user-name {
      font-size: 14px; font-weight: 600;
      color: var(--text);
      margin-bottom: 2px;
      display: flex; align-items: center; gap: 8px;
    }

    .ag-user-email {
      font-size: 12px; color: var(--muted);
    }

    .ag-added-badge {
      font-size: 10px; font-weight: 700;
      color: #10b981;
      background: #d1fae5;
      padding: 2px 8px; border-radius: 12px;
    }

    /* Manual Members */
    .ag-manual-list {
      margin-top: 16px;
      display: flex; flex-direction: column; gap: 8px;
    }

    .ag-manual-row {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px;
      background: var(--bg);
      border: 1.5px solid var(--border);
      border-radius: 12px;
    }

    .ag-remove-btn {
      background: none; border: none;
      color: var(--muted); cursor: pointer;
      font-size: 16px; padding: 4px 8px;
      transition: color 0.2s;
    }
    .ag-remove-btn:hover { color: #ef4444; }

    /* Summary */
    .ag-summary {
      padding: 14px 18px;
      background: rgba(0,32,96,0.04);
      border: 1.5px solid var(--navy);
      border-radius: 14px;
      font-size: 13px; color: var(--navy);
      margin-top: 20px;
    }

    /* Toast */
    .ag-toast {
      position: fixed; bottom: 32px; right: 32px; z-index: 10001;
      padding: 14px 24px; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      font-size: 14px; font-weight: 600;
      animation: slideIn 0.25s ease;
      font-family: 'Sora', sans-serif;
    }
    .ag-toast-success {
      background: #d1fae5;
      border: 1.5px solid #10b981;
      color: #065f46;
    }
    .ag-toast-error {
      background: #fee2e2;
      border: 1.5px solid #ef4444;
      color: #991b1b;
    }

    @media (max-width: 768px) {
      .ag-hero { padding: 40px 24px; }
      .ag-content { padding: 24px 20px 40px; }
      .ag-grid { grid-template-columns: 1fr; }
      .ag-source-row { flex-direction: column; }
    }
  `;

  return (
    <div className="ag-page">
      <style>{sharedCSS}</style>

      {/* Hero Section */}
      <div className="ag-hero">
        <div className="ag-hero-inner">
          <div className="ag-hero-eyebrow">
            <div className="ag-hero-eyebrow-line" />
            Team Management
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h1>Assignment <em>Groups</em></h1>
              <p className="ag-hero-sub">Manage groups and their members for request & incident assignment</p>
            </div>
            <button className="ag-btn-primary" onClick={openCreate}>
              + Create Group
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="ag-content">
        {loading ? (
          <div className="ag-loading">
            <div className="ag-spinner" />
            <p style={{ color: '#64748b' }}>Loading assignment groups...</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="ag-empty">
            <div className="ag-empty-icon">👥</div>
            <div className="ag-empty-title">No assignment groups yet</div>
            <p style={{ color: '#64748b' }}>Click "Create Group" to get started</p>
          </div>
        ) : (
          <div className="ag-grid">
            {groups.map(group => (
              <div key={group._id} className="ag-card">
                <div className="ag-card-header">
                  <span className="ag-card-title">{group.name}</span>
                  <span className="ag-card-badge">{group.members?.length || 0} members</span>
                </div>

                <div className="ag-card-body">
                  <div className="ag-info-row">
                    <span className="ag-info-label">Source</span>
                    <span className="ag-info-value">
                      {group.distributionList?.id ? `📧 ${group.distributionList.name}` : '✏️ Manual'}
                    </span>
                  </div>
                  {group.description && (
                    <div className="ag-info-row">
                      <span className="ag-info-label">Description</span>
                      <span className="ag-info-value">{group.description}</span>
                    </div>
                  )}
                  <div className="ag-info-row">
                    <span className="ag-info-label">Created</span>
                    <span className="ag-info-value">{new Date(group.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="ag-members-section">
                    <div className="ag-members-label">Members</div>
                    {(group.members || []).slice(0, 4).map(m => (
                      <div key={m.id} className="ag-member-row">
                        <div className="ag-avatar">{(m.name || '?').charAt(0).toUpperCase()}</div>
                        <div className="ag-member-info">
                          <div className="ag-member-name">{m.name}</div>
                          <div className="ag-member-email">{m.mail}</div>
                        </div>
                        {m.isManual && <span className="ag-manual-badge">Manual</span>}
                      </div>
                    ))}
                    {(group.members || []).length > 4 && (
                      <div className="ag-more-members">
                        +{group.members.length - 4} more members
                      </div>
                    )}
                  </div>
                </div>

                <div className="ag-card-footer">
                  <button className="ag-btn-secondary" style={{ flex: 1 }} onClick={() => openEdit(group)}>
                    ✏️ Edit
                  </button>
                  <button className="ag-btn-danger" style={{ flex: 1 }} onClick={() => openDelete(group)}>
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="ag-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="ag-modal" onClick={e => e.stopPropagation()}>
            <div className="ag-modal-header">
              <span className="ag-modal-title">
                {modalMode === 'create' ? '➕ Create Assignment Group' :
                 modalMode === 'edit'   ? '✏️ Edit Assignment Group'   : '🗑️ Delete Assignment Group'}
              </span>
              <button className="ag-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {modalMode === 'delete' ? (
              <>
                <div className="ag-modal-body">
                  <p style={{ color: '#0f172a', lineHeight: 1.6, marginBottom: 16 }}>
                    Are you sure you want to delete <strong>"{selectedGroup?.name}"</strong>?
                  </p>
                  <p style={{ color: '#991b1b', fontSize: 13 }}>
                    ⚠️ This cannot be undone. All members will be notified via email.
                  </p>
                </div>
                <div className="ag-modal-footer">
                  <button className="ag-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="ag-btn-primary" style={{ background: '#ef4444' }} onClick={handleDelete} disabled={submitting}>
                    {submitting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ag-modal-body">
                  <div className="ag-form-group">
                    <label className="ag-label">
                      Group Name <span className="required">*</span>
                    </label>
                    <input
                      className="ag-input"
                      placeholder="e.g. IT Support Team"
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                    />
                  </div>

                  <div className="ag-form-group">
                    <label className="ag-label">Description</label>
                    <textarea
                      className="ag-textarea"
                      placeholder="What does this group handle?"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="ag-form-group">
                    <label className="ag-label">
                      Member Source <span className="required">*</span>
                    </label>
                    <div className="ag-source-row">
                      <button
                        className={`ag-source-btn ${memberSource === 'dl' ? 'active' : ''}`}
                        onClick={() => { setMemberSource('dl'); setManualMembers([]); }}
                      >
                        <span>📧</span> From Distribution List
                      </button>
                      <button
                        className={`ag-source-btn ${memberSource === 'manual' ? 'active' : ''}`}
                        onClick={() => { setMemberSource('manual'); setSelectedDL(null); }}
                      >
                        <span>🔍</span> Add Manually
                      </button>
                    </div>
                  </div>

                  {memberSource === 'dl' && (
                    <div className="ag-form-group">
                      <label className="ag-label">Select Distribution List</label>
                      {loadingDL ? (
                        <div style={{ color: '#64748b', fontSize: 13, padding: '8px 0' }}>Loading distribution lists...</div>
                      ) : (
                        <>
                          {!selectedDL ? (
                            <>
                              <input
                                className="ag-input"
                                style={{ marginBottom: 12 }}
                                placeholder="🔍 Search distribution lists..."
                                value={dlSearch}
                                onChange={e => setDlSearch(e.target.value)}
                              />
                              <div className="ag-dl-list">
                                {filteredDLs.map(dl => (
                                  <div
                                    key={dl.id}
                                    className={`ag-dl-item ${selectedDL?.id === dl.id ? 'selected' : ''}`}
                                    onClick={() => handleSelectDL(dl)}
                                  >
                                    <div className="ag-dl-name">{dl.name}</div>
                                    <div className="ag-dl-email">{dl.mail}</div>
                                    <div className="ag-dl-members">{dl.members.length} members</div>
                                  </div>
                                ))}
                                {filteredDLs.length === 0 && (
                                  <div style={{ color: '#64748b', fontSize: 13, padding: '8px 0', textAlign: 'center' }}>
                                    No distribution lists found
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div>
                              <div className="ag-selected-dl">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                  <span style={{ fontSize: 24 }}>📧</span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: '#002060' }}>{selectedDL.name}</div>
                                    <div style={{ fontSize: 12, color: '#065f46' }}>{selectedDL.mail}</div>
                                  </div>
                                </div>
                                <div style={{ fontSize: 13, color: '#065f46' }}>
                                  ✅ All {selectedDL.members.length} members will be added to this group
                                </div>
                              </div>
                              <button
                                className="ag-btn-secondary"
                                style={{ width: '100%' }}
                                onClick={() => { setSelectedDL(null); setDlSearch(''); }}
                              >
                                🔄 Change Distribution List
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {memberSource === 'manual' && (
                    <div className="ag-form-group">
                      <label className="ag-label">Search Users to Add</label>
                      <div className="ag-user-search-wrapper">
                        <input
                          ref={userInputRef}
                          className="ag-input"
                          placeholder="Type name or email to search..."
                          value={userSearchQuery}
                          onChange={e => handleUserSearch(e.target.value)}
                          onFocus={() => userSearchQuery.length >= 2 && setShowUserDropdown(true)}
                          autoComplete="off"
                        />
                        
                        {searchingUsers && (
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                            Searching...
                          </div>
                        )}

                        {showUserDropdown && userSearchResults.length > 0 && (
                          <div ref={userDropdownRef} className="ag-user-dropdown">
                            {userSearchResults.map(user => (
                              <div
                                key={user.id}
                                className="ag-user-dropdown-item"
                                style={{ opacity: manualMembers.find(m => m.id === user.id) ? 0.6 : 1 }}
                                onClick={() => selectUser(user)}
                              >
                                <div className="ag-user-avatar">
                                  {user.displayName.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div className="ag-user-name">
                                    {user.displayName}
                                    {manualMembers.find(m => m.id === user.id) && (
                                      <span className="ag-added-badge">Added</span>
                                    )}
                                  </div>
                                  <div className="ag-user-email">{user.mail}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {showUserDropdown && !searchingUsers && userSearchResults.length === 0 && userSearchQuery.trim().length >= 2 && (
                          <div ref={userDropdownRef} className="ag-user-dropdown">
                            <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                              No users found for "{userSearchQuery}"
                            </div>
                          </div>
                        )}
                      </div>

                      {manualMembers.length > 0 && (
                        <div className="ag-manual-list">
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                            Selected Members ({manualMembers.length})
                          </div>
                          {manualMembers.map(m => (
                            <div key={m.id} className="ag-manual-row">
                              <div className="ag-avatar">{(m.name || '?').charAt(0).toUpperCase()}</div>
                              <div style={{ flex: 1 }}>
                                <div className="ag-member-name">{m.name}</div>
                                <div className="ag-member-email">{m.email}</div>
                              </div>
                              <button className="ag-remove-btn" onClick={() => removeManualMember(m.id)}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="ag-summary">
                    Total members: <strong>{getFinalMembers().length}</strong>
                    {memberSource === 'dl' && selectedDL && ` (from ${selectedDL.name})`}
                    {memberSource === 'manual' && ` (${manualMembers.length} selected)`}
                  </div>
                </div>

                <div className="ag-modal-footer">
                  <button className="ag-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="ag-btn-primary" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Saving...' : modalMode === 'create' ? 'Create Group' : 'Save Changes'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.open && (
        <div className={`ag-toast ${toast.type === 'success' ? 'ag-toast-success' : 'ag-toast-error'}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default AssignmentGroups;