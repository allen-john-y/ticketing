// CreateRequest.js - Updated with Admin Access support
import React, { useState, useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const SERVICE_TYPES = {
  HARDWARE: { icon: '💻', color: '#f59e0b', label: 'HARDWARE' },
  SOFTWARE: { icon: '🖥️', color: '#002060', label: 'SOFTWARE' },
  ACCESS:   { icon: '🔐', color: '#8b5cf6', label: 'ACCESS' },
  SERVICES: { icon: '🛠️', color: '#10b981', label: 'SERVICES' },
  GENERAL:  { icon: '✨', color: '#e98404', label: 'GENERAL' },
};

const getCategoryType = (categoryName = "") => {
  const name = (categoryName || "").toUpperCase();
  if (name.includes("HARDWARE") || name.includes("LAPTOP") || name.includes("DEVICE")) return "HARDWARE";
  if (name.includes("SOFTWARE") || name.includes("LICENSE") || name.includes("APP")) return "SOFTWARE";
  if (name.includes("ACCESS") || name.includes("VPN") || name.includes("PERMISSION")) return "ACCESS";
  if (name.includes("SERVICE") || name.includes("SETUP") || name.includes("SUPPORT")) return "SERVICES";
  return "GENERAL";
};

function CreateRequest() {
  const { instance, accounts } = useMsal();
  const currentUser = accounts[0] || {};
  const currentUserName = currentUser.name || currentUser.username || 'User';

  const [viewMode, setViewMode] = useState('catalog');
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [selectedService, setSelectedService] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL');

  const [customRequestName, setCustomRequestName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [onBehalfEnabled, setOnBehalfEnabled] = useState(false);
  const [onBehalfUser, setOnBehalfUser] = useState({ id: '', name: '', mail: '' });
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userDropdownRef = useRef(null);
  const userInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [pwOnBehalf, setPwOnBehalf] = useState('Self');
  const [pwTargetEmail, setPwTargetEmail] = useState('');
  const [pwDeliveryEmail, setPwDeliveryEmail] = useState('');
  const [verifyStatus, setVerifyStatus] = useState('idle');
  const [verifiedName, setVerifiedName] = useState('');
  const [verifyError, setVerifyError] = useState('');

  const [isDeviceAdmin, setIsDeviceAdmin] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [nextRequestNumber, setNextRequestNumber] = useState('REQ-0001');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });

  const isGeneralRequest = selectedService?.category?.name === 'GENERAL';
  const isPasswordReset = !isGeneralRequest && selectedService?.serviceName?.toLowerCase().includes('password reset');
  const isAdminAccess = !isGeneralRequest && selectedService?.serviceName?.toLowerCase().includes('admin access');

  const filters = ['ALL', 'HARDWARE', 'SOFTWARE', 'ACCESS', 'SERVICES', 'GENERAL'];

  const filteredServices = services.filter(s => {
    if (activeFilter === 'ALL') return true;
    const type = getCategoryType(s.category?.name || '');
    return type === activeFilter;
  });

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

  useEffect(() => { fetchServices(); fetchNextRequestNumber(); }, []);

  useEffect(() => {
    if (!isAdminAccess || !accounts?.[0]) return;
    const checkAdminGroups = async () => {
      setGroupsLoading(true);
      try {
        const token = await instance.acquireTokenSilent({
          scopes: ['GroupMember.Read.All', 'User.Read'],
          account: accounts[0],
        });
        const res = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });
        const groups = (res.data?.value || []).map(g => g.displayName || '');
        setIsDeviceAdmin(
          groups.some(
            name =>
              name === process.env.REACT_APP_DEVICE_ADMIN_GROUP1_NAME ||
              name === process.env.REACT_APP_DEVICE_ADMIN_GROUP2_NAME
          )
        );
      } catch (err) {
        console.error('Error checking admin groups:', err);
      } finally {
        setGroupsLoading(false);
      }
    };
    checkAdminGroups();
  }, [isAdminAccess, instance, accounts]);

  const fetchServices = async () => {
    setLoadingServices(true);
    try {
      const res = await axios.get(`${BACKEND}/api/services`);
      setServices(res.data || []);
    } catch (err) {
      showToast('Failed to load services', 'error');
    } finally {
      setLoadingServices(false);
    }
  };

  const fetchNextRequestNumber = async () => {
    try {
      const res = await axios.get(`${BACKEND}/api/requests`);
      const allRequests = res.data || [];
      const maxNumber = allRequests.reduce((max, req) => {
        if (req.requestNumber) {
          const num = parseInt(req.requestNumber.replace('REQ-', '').replace('REQ', ''));
          return isNaN(num) ? max : Math.max(max, num);
        }
        return max;
      }, 0);
      setNextRequestNumber(`REQ-${String(maxNumber + 1).padStart(4, '0')}`);
    } catch (err) {
      console.error('Failed to fetch next number:', err);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const handleSelectService = (service) => {
    setSelectedService(service);
    setViewMode('form');
    setCustomRequestName('');
    setDescription('');
    setPriority('medium');
    setOnBehalfEnabled(false);
    setOnBehalfUser({ id: '', name: '', mail: '' });
    setAttachments([]);
    setPwOnBehalf('Self');
    setPwTargetEmail('');
    setPwDeliveryEmail('');
    setVerifyStatus('idle');
    setVerifiedName('');
    setVerifyError('');
    setIsDeviceAdmin(false);
  };

  const handleBackToCatalog = () => {
    setViewMode('catalog');
    setSelectedService(null);
  };

  const handleVerifyTargetUser = async () => {
    const email = pwTargetEmail.trim();
    setVerifyError(''); setVerifiedName(''); setVerifyStatus('idle');
    if (!email) { setVerifyError("Please enter the target user's company email."); return; }
    setVerifyStatus('verifying');
    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });
      const res = await axios.post(
        `${BACKEND}/verify-user`,
        { email },
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      if (res.data?.exists) {
        setVerifyStatus('verified');
        setVerifiedName(res.data.displayName || res.data.mail || email);
        setPwTargetEmail(res.data.mail || email);
      } else {
        setVerifyStatus('notfound');
        setVerifyError('User not found in Azure AD.');
      }
    } catch (err) {
      setVerifyStatus('error');
      setVerifyError(err?.response?.data?.message || err.message || 'Verification failed');
    }
  };

  const searchUsers = async (query) => {
    if (!query || query.trim().length < 2) {
      setUserSearchResults([]); setShowUserDropdown(false); setSearchingUsers(false); return;
    }
    setSearchingUsers(true); setShowUserDropdown(true);
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

  const handleUserSearch = (value) => { setUserSearchQuery(value); searchUsers(value); };
  
  const selectOnBehalfUser = (user) => {
    setOnBehalfUser({ id: user.id, name: user.displayName, mail: user.mail });
    setUserSearchQuery(''); setUserSearchResults([]); setShowUserDropdown(false);
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axios.post(`${BACKEND}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setAttachments(prev => [...prev, { id: res.data.id, driveId: res.data.driveId, fileName: res.data.fileName, fileType: res.data.fileType, url: res.data.url }]);
      }
      showToast(`${files.length} file(s) uploaded`, 'success');
    } catch (err) {
      showToast('Failed to upload file(s)', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id) => setAttachments(prev => prev.filter(a => a.id !== id));

  const handleSubmit = async () => {
    if (!selectedService) { 
      showToast('Please select a service', 'error'); 
      return; 
    }

    if (isGeneralRequest) {
      if (!customRequestName.trim()) {
        showToast('Please enter a request name', 'error');
        return;
      }
      if (!description.trim()) {
        showToast('Please provide a description', 'error');
        return;
      }
    }

    // ✅ Admin Access validation - Description is REQUIRED
    if (isAdminAccess) {
      if (isDeviceAdmin) {
        showToast('You already have admin access to the device.', 'error'); 
        return;
      }
      if (!description.trim()) {
        showToast('Please provide a description/reason for admin access request', 'error');
        return;
      }
    }

    if (isPasswordReset) {
      if (pwOnBehalf === 'Other') {
        if (!pwTargetEmail.trim()) { 
          showToast("Please enter the target user's company email.", 'error'); 
          return; 
        }
        if (verifyStatus !== 'verified') { 
          showToast("Please verify the target user's email first.", 'error'); 
          return; 
        }
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!pwDeliveryEmail.trim() || !emailRegex.test(pwDeliveryEmail)) {
        showToast('Please provide a valid delivery email.', 'error'); 
        return;
      }
    }

    if (onBehalfEnabled && !onBehalfUser.mail) {
      showToast('Please select a user for on-behalf request', 'error'); 
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        service: { 
          id: selectedService._id, 
          name: isGeneralRequest ? customRequestName.trim() : selectedService.serviceName,
          categoryName: selectedService.category?.name || '' 
        },
        assignmentGroup: selectedService.assignmentGroup || {},
        assignedMember: selectedService.assignedMember || {},
        raisedBy: { 
          id: currentUser.localAccountId || '', 
          name: currentUser.name || '', 
          mail: currentUser.username || '' 
        },
        onBehalf: { 
          enabled: onBehalfEnabled, 
          user: onBehalfEnabled ? onBehalfUser : null 
        },
        description: description.trim(),
        attachments: attachments, // ✅ Attachments are optional, will be sent if any
        priority,
        approval: { required: isPasswordReset || isAdminAccess },
        // ✅ NEW
        ...(isPasswordReset && {
          pwOnBehalf,
          pwTargetEmail: pwOnBehalf === 'Other' ? pwTargetEmail.trim() : currentUser.username || '',
          pwTargetName: pwOnBehalf === 'Other' ? verifiedName : currentUser.name || '',
          pwDeliveryEmail: pwDeliveryEmail.trim(),
        }),
      };

      const res = await axios.post(`${BACKEND}/api/requests`, payload);
      showToast(`Request ${res.data.requestNumber} created successfully`, 'success');
      setViewMode('catalog');
      setSelectedService(null);
      fetchNextRequestNumber();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to create request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getServiceTypeInfo = (service) => {
    const type = getCategoryType(service.category?.name || service.serviceName || '');
    return SERVICE_TYPES[type] || SERVICE_TYPES.GENERAL;
  };

  const disableSubmit = submitting || (isAdminAccess && isDeviceAdmin);

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:   #002060;
      --navy2:  #003090;
      --orange: #e98404;
      --orange2:#f5a623;
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
      to { transform: translateX(0); opacity: 1; }
    }

    .cr-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Hero Section */
    .cr-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .cr-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .cr-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .cr-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .cr-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .cr-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .cr-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .cr-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .cr-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    /* Section Label */
    .cr-section-label {
      font-family: 'Sora', sans-serif;
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 24px;
      display: flex; align-items: center; gap: 10px;
    }
    .cr-section-label::after {
      content: '';
      flex: 1; height: 1px; background: var(--border);
    }

    /* Filter Tabs */
    .cr-filters {
      display: flex; gap: 10px; flex-wrap: wrap;
      margin-bottom: 36px;
    }
    .cr-filter-tab {
      padding: 8px 20px;
      border-radius: 40px;
      border: 1.5px solid var(--border);
      background: var(--white);
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      color: var(--muted);
      transition: all 0.2s;
      font-family: 'Sora', sans-serif;
      letter-spacing: 0.03em;
    }
    .cr-filter-tab:hover {
      border-color: var(--navy);
      color: var(--navy);
    }
    .cr-filter-tab.active {
      background: var(--navy);
      color: white;
      border-color: var(--navy);
    }

    /* Service Grid */
    .cr-service-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 22px;
      animation: fadeUp 0.5s 0.1s ease both;
    }

    .cr-service-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 32px 28px;
      cursor: pointer;
      transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
      display: flex; flex-direction: column;
    }
    .cr-service-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 16px 40px rgba(0,32,96,0.1);
      border-color: var(--navy);
    }

    .cr-card-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 20px;
    }
    .cr-card-icon {
      width: 56px; height: 56px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    .cr-card-badge {
      font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
      padding: 5px 12px; border-radius: 30px;
      text-transform: uppercase;
    }

    .cr-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 10px;
    }
    .cr-card-desc {
      font-size: 13.5px; color: var(--muted);
      line-height: 1.6; font-weight: 400;
      flex: 1;
    }
    .cr-card-arrow {
      margin-top: 22px; display: flex; align-items: center; gap: 6px;
      font-size: 12.5px; font-weight: 700; letter-spacing: 0.04em;
      color: var(--navy); opacity: 0;
      transition: opacity 0.18s;
    }
    .cr-service-card:hover .cr-card-arrow { opacity: 1; }

    /* Form Styles */
    .cr-form-container {
      animation: fadeUp 0.4s ease both;
    }

    .cr-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 24px; display: inline-flex;
      align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .cr-back-btn:hover { color: var(--orange); }

    .cr-form-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 24px;
      overflow: hidden;
    }

    .cr-form-header {
      padding: 32px 36px;
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
    }
    .cr-request-number {
      font-family: 'Sora', sans-serif;
      font-size: 28px; font-weight: 800;
      color: var(--navy); letter-spacing: -0.02em;
    }
    .cr-new-badge {
      padding: 5px 14px; border-radius: 30px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
      background: var(--navy); color: white;
      margin-left: 16px;
    }
    .cr-form-title {
      font-size: 16px; font-weight: 500;
      color: var(--muted); margin-top: 8px;
    }

    .cr-service-banner {
      padding: 20px 36px;
      background: rgba(0,32,96,0.03);
      border-bottom: 1.5px solid var(--border);
      display: flex; align-items: center; gap: 16px;
    }
    .cr-service-icon {
      width: 52px; height: 52px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    .cr-service-name {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
    }
    .cr-service-type {
      font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
      padding: 4px 12px; border-radius: 30px;
      margin-top: 6px; display: inline-block;
    }

    .cr-form-body {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 0;
    }

    .cr-form-left {
      padding: 36px;
      border-right: 1.5px solid var(--border);
    }

    .cr-form-right {
      padding: 36px;
      background: var(--light);
    }

    .cr-form-group {
      margin-bottom: 32px;
    }
    .cr-form-label {
      display: block;
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 12px;
      letter-spacing: 0.02em;
    }
    .cr-form-label .required {
      color: #ef4444;
      margin-left: 4px;
    }

    .cr-form-input,
    .cr-form-select,
    .cr-form-textarea {
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
    .cr-form-input:focus,
    .cr-form-select:focus,
    .cr-form-textarea:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .cr-form-textarea {
      resize: vertical;
      min-height: 140px;
    }

    .cr-verify-btn {
      padding: 14px 24px;
      background: var(--navy);
      color: white;
      border: none;
      border-radius: 14px;
      font-size: 14px; font-weight: 700;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .cr-verify-btn:hover:not(:disabled) {
      background: var(--navy2);
    }
    .cr-verify-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .cr-verify-status {
      font-size: 13px; padding: 12px 16px; border-radius: 12px;
      margin-top: 12px;
    }
    .cr-verify-idle { background: var(--bg); color: var(--muted); border: 1.5px solid var(--border); }
    .cr-verify-info { background: rgba(0,32,96,0.05); color: var(--navy); border: 1.5px solid var(--navy); }
    .cr-verify-ok { background: rgba(16,185,129,0.08); color: #065f46; border: 1.5px solid #10b981; }
    .cr-verify-err { background: rgba(239,68,68,0.08); color: #991b1b; border: 1.5px solid #ef4444; }

    .cr-info-banner {
      background: rgba(0,32,96,0.04);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      padding: 16px 20px;
      font-size: 14px; color: var(--navy);
      line-height: 1.6;
    }

    .cr-error-banner {
      background: rgba(239,68,68,0.04);
      border: 1.5px solid #ef4444;
      border-radius: 14px;
      padding: 16px 20px;
      font-size: 14px; color: #991b1b;
    }

    .cr-radio-group {
      display: flex; flex-direction: column; gap: 14px;
    }
    .cr-radio-label {
      display: flex; align-items: center; gap: 12px;
      font-size: 15px; color: var(--text); cursor: pointer;
    }
    .cr-radio {
      accent-color: var(--navy);
      width: 18px; height: 18px; cursor: pointer;
    }

    .cr-user-dropdown {
      position: absolute; top: 100%; left: 0; right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      margin-top: 8px;
      max-height: 280px; overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
    }
    .cr-dd-item {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 18px; cursor: pointer;
      border-bottom: 1.5px solid var(--border);
      transition: background 0.15s;
    }
    .cr-dd-item:hover { background: var(--bg); }
    .cr-dd-avatar {
      width: 40px; height: 40px; border-radius: 12px;
      background: var(--navy); color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700;
      flex-shrink: 0;
    }
    .cr-dd-name {
      font-size: 15px; font-weight: 600; color: var(--text);
    }
    .cr-dd-email {
      font-size: 12px; color: var(--muted); margin-top: 2px;
    }

    .cr-selected-user {
      margin-top: 16px; padding: 16px;
      background: rgba(16,185,129,0.04);
      border: 1.5px solid #10b981;
      border-radius: 14px;
    }
    .cr-selected-label {
      font-size: 12px; color: #065f46; margin-bottom: 8px;
      font-weight: 700;
    }

    .cr-attach-btn {
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
    .cr-attach-btn:hover {
      border-color: var(--navy);
      background: rgba(0,32,96,0.02);
    }

    .cr-attachment-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      margin-top: 10px;
    }
    .cr-attachment-remove {
      background: none; border: none;
      color: var(--muted); cursor: pointer;
      font-size: 18px; padding: 4px 8px;
      transition: color 0.2s;
    }
    .cr-attachment-remove:hover { color: #ef4444; }

    .cr-priority-group {
      display: flex; gap: 12px;
    }
    .cr-priority-btn {
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
    .cr-priority-btn:hover {
      border-color: var(--navy);
      color: var(--navy);
    }
    .cr-priority-btn.active-low {
      background: rgba(16,185,129,0.08);
      border-color: #10b981;
      color: #065f46;
      font-weight: 700;
    }
    .cr-priority-btn.active-medium {
      background: rgba(233,132,4,0.08);
      border-color: var(--orange);
      color: #92400e;
      font-weight: 700;
    }
    .cr-priority-btn.active-high {
      background: rgba(239,68,68,0.08);
      border-color: #ef4444;
      color: #991b1b;
      font-weight: 700;
    }

    .cr-form-footer {
      display: flex; justify-content: flex-end; gap: 16px;
      padding: 28px 36px;
      border-top: 1.5px solid var(--border);
      background: var(--light);
    }

    .cr-btn-cancel {
      padding: 16px 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 15px; font-weight: 600;
      color: var(--muted); cursor: pointer;
      transition: all 0.2s;
      font-family: 'Sora', sans-serif;
    }
    .cr-btn-cancel:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .cr-btn-submit {
      padding: 16px 36px;
      background: var(--navy);
      border: none;
      border-radius: 14px;
      font-size: 15px; font-weight: 700;
      color: white; cursor: pointer;
      transition: all 0.3s;
      font-family: 'Sora', sans-serif;
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .cr-btn-submit:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,32,96,0.25);
    }
    .cr-btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    /* Loading States */
    .cr-loading {
      text-align: center; padding: 80px;
    }
    .cr-spinner {
      width: 48px; height: 48px;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      border-radius: 50%;
      margin: 0 auto;
      animation: spin 0.8s linear infinite;
    }

    .cr-empty {
      text-align: center; padding: 80px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 24px;
    }

    .cr-toast {
      position: fixed; bottom: 32px; right: 32px; z-index: 10000;
      padding: 16px 28px; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      font-size: 15px; font-weight: 600;
      animation: slideIn 0.3s ease;
      font-family: 'Sora', sans-serif;
    }
    .cr-toast-success {
      background: #10b981; color: white;
    }
    .cr-toast-error {
      background: #ef4444; color: white;
    }

    @media (max-width: 1024px) {
      .cr-form-body { grid-template-columns: 1fr; }
      .cr-form-left { border-right: none; }
    }
    @media (max-width: 768px) {
      .cr-hero { padding: 40px 24px; }
      .cr-content { padding: 24px 20px 40px; }
      .cr-service-grid { grid-template-columns: 1fr; }
    }
  `;

  // Get verify status style
  const getVerifyStyle = () => {
    if (verifyStatus === 'verified') return 'cr-verify-ok';
    if (verifyStatus === 'notfound' || verifyStatus === 'error') return 'cr-verify-err';
    if (verifyStatus === 'verifying') return 'cr-verify-info';
    return 'cr-verify-idle';
  };

  return (
    <div className="cr-page">
      <style>{sharedCSS}</style>

      {viewMode === 'catalog' ? (
        <>
          {/* Hero Section */}
          <div className="cr-hero">
            <div className="cr-hero-inner">
              <div className="cr-hero-eyebrow">
                <div className="cr-hero-eyebrow-line" />
                Service Request
              </div>
              <h1>Browse our <em>service catalog</em></h1>
              <p className="cr-hero-sub">Select a service to submit a request. We'll route it to the right team.</p>
            </div>
          </div>

          {/* Content */}
          <div className="cr-content">
            <div className="cr-section-label">Available Services</div>

            {/* Filters */}
            <div className="cr-filters">
              {filters.map(f => (
                <button
                  key={f}
                  className={`cr-filter-tab ${activeFilter === f ? 'active' : ''}`}
                  onClick={() => setActiveFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Service Grid */}
            {loadingServices ? (
              <div className="cr-loading">
                <div className="cr-spinner" />
                <p style={{ color: '#64748b', marginTop: 20, fontSize: 14 }}>Loading services...</p>
              </div>
            ) : filteredServices.length === 0 ? (
              <div className="cr-empty">
                <div style={{ fontSize: 64, marginBottom: 20 }}>📋</div>
                <div style={{ fontWeight: 700, color: '#002060', fontSize: 20, marginBottom: 8, fontFamily: "'Sora', sans-serif" }}>
                  No services available
                </div>
                <div style={{ fontSize: 14, color: '#64748b' }}>Please contact your administrator</div>
              </div>
            ) : (
              <div className="cr-service-grid">
                {filteredServices.map(service => {
                  const typeInfo = getServiceTypeInfo(service);
                  return (
                    <div
                      key={service._id}
                      className="cr-service-card"
                      onClick={() => handleSelectService(service)}
                    >
                      <div className="cr-card-header">
                        <div className="cr-card-icon" style={{ background: typeInfo.color + '15' }}>
                          {typeInfo.icon}
                        </div>
                        <span className="cr-card-badge" style={{ 
                          background: typeInfo.color + '15', 
                          color: typeInfo.color 
                        }}>
                          {typeInfo.label}
                        </span>
                      </div>

                      <div className="cr-card-title">{service.serviceName}</div>
                      <div className="cr-card-desc">
                        {service.description || 'Request this service for your needs.'}
                      </div>
                      <div className="cr-card-arrow">
                        Request service
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Form View */
        <div className="cr-content cr-form-container">
          <button className="cr-back-btn" onClick={handleBackToCatalog}>
            ← Back to Catalog
          </button>

          <div className="cr-form-card">
            {/* Form Header */}
            <div className="cr-form-header">
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span className="cr-request-number">{nextRequestNumber}</span>
                <span className="cr-new-badge">NEW REQUEST</span>
              </div>
              <div className="cr-form-title">Requested by {currentUserName}</div>
            </div>

            {/* Service Banner */}
            <div className="cr-service-banner">
              <div className="cr-service-icon" style={{ background: getServiceTypeInfo(selectedService).color + '15' }}>
                {getServiceTypeInfo(selectedService).icon}
              </div>
              <div>
                <div className="cr-service-name">{selectedService?.serviceName}</div>
                <span className="cr-service-type" style={{ 
                  background: getServiceTypeInfo(selectedService).color + '15',
                  color: getServiceTypeInfo(selectedService).color 
                }}>
                  {getServiceTypeInfo(selectedService).label}
                </span>
              </div>
            </div>

            {/* Form Body */}
            <div className="cr-form-body">
              <div className="cr-form-left">
                {/* Request Name - General */}
                {isGeneralRequest && (
                  <div className="cr-form-group">
                    <label className="cr-form-label">
                      Request Name <span className="required">*</span>
                    </label>
                    <input
                      className="cr-form-input"
                      placeholder="Enter a descriptive name for your request"
                      value={customRequestName}
                      onChange={e => setCustomRequestName(e.target.value)}
                    />
                  </div>
                )}

                {/* Password Reset Section */}
                {isPasswordReset && (
                  <div className="cr-form-group">
                    <label className="cr-form-label">
                      Reset password for <span className="required">*</span>
                    </label>
                    <select
                      className="cr-form-select"
                      value={pwOnBehalf}
                      onChange={e => {
                        setPwOnBehalf(e.target.value);
                        setPwTargetEmail('');
                        setVerifyStatus('idle');
                        setVerifiedName('');
                        setVerifyError('');
                      }}
                    >
                      <option value="Self">Myself</option>
                      <option value="Other">Someone else</option>
                    </select>

                    {pwOnBehalf === 'Other' && (
                      <div style={{ marginTop: '16px' }}>
                        <label className="cr-form-label">
                          Target user email <span className="required">*</span>
                        </label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <input
                            className="cr-form-input"
                            style={{ flex: 1 }}
                            type="text"
                            placeholder="Company email"
                            value={pwTargetEmail}
                            onChange={e => {
                              setPwTargetEmail(e.target.value);
                              setVerifyStatus('idle');
                              setVerifiedName('');
                              setVerifyError('');
                            }}
                          />
                          <button
                            type="button"
                            className="cr-verify-btn"
                            onClick={handleVerifyTargetUser}
                            disabled={verifyStatus === 'verifying'}
                          >
                            {verifyStatus === 'verifying' ? 'Verifying...' : 'Verify'}
                          </button>
                        </div>
                        <div className={`cr-verify-status ${getVerifyStyle()}`}>
                          {verifyStatus === 'idle' && 'Click Verify to confirm the user exists'}
                          {verifyStatus === 'verifying' && 'Verifying...'}
                          {verifyStatus === 'verified' && `✓ Verified: ${verifiedName}`}
                          {verifyStatus === 'notfound' && '✕ User not found'}
                          {verifyStatus === 'error' && `✕ ${verifyError}`}
                        </div>
                      </div>
                    )}

                    {(pwOnBehalf === 'Self' || (pwOnBehalf === 'Other' && verifyStatus === 'verified')) && (
                      <div style={{ marginTop: '16px' }}>
                        <label className="cr-form-label">
                          Delivery email <span className="required">*</span>
                        </label>
                        <input
                          className="cr-form-input"
                          type="email"
                          placeholder="Email to receive new password"
                          value={pwDeliveryEmail}
                          onChange={e => setPwDeliveryEmail(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="cr-info-banner" style={{ marginTop: '20px' }}>
                      ℹ️ Password reset requires approval. New password will be sent to delivery email.
                    </div>
                  </div>
                )}

                {/* Admin Access Section - UPDATED with description requirement and attachments note */}
                {isAdminAccess && (
                  <div className="cr-form-group">
                    <label className="cr-form-label">Admin Access Request</label>
                    {groupsLoading ? (
                      <div className="cr-info-banner">Checking your current access...</div>
                    ) : isDeviceAdmin ? (
                      <div className="cr-error-banner">
                        ⚠ You already have device admin access.
                      </div>
                    ) : (
                      <>
                        <div className="cr-info-banner" style={{ marginBottom: '16px' }}>
                          🛡️ This request will be sent for approval to the IT team.
                          <br />
                          <br />
                          📌 <strong>What happens after approval?</strong>
                          <br />
                          • You will be added to Device Administrators group in Azure AD
                          <br />
                          • You will gain administrative privileges on Azure AD joined devices
                          <br />
                          • You will receive an email confirmation once approved
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Request For - NOT shown for Admin Access */}
                {!isPasswordReset && !isAdminAccess && (
                  <div className="cr-form-group">
                    <label className="cr-form-label">Request For</label>
                    <div className="cr-radio-group">
                      <label className="cr-radio-label">
                        <input
                          type="radio"
                          name="requestFor"
                          className="cr-radio"
                          checked={!onBehalfEnabled}
                          onChange={() => { setOnBehalfEnabled(false); setOnBehalfUser({ id: '', name: '', mail: '' }); }}
                        />
                        <span>Myself ({currentUserName})</span>
                      </label>
                      <label className="cr-radio-label">
                        <input
                          type="radio"
                          name="requestFor"
                          className="cr-radio"
                          checked={onBehalfEnabled}
                          onChange={() => setOnBehalfEnabled(true)}
                        />
                        <span>On Behalf Of Someone Else</span>
                      </label>
                    </div>

                    {onBehalfEnabled && (
                      <div style={{ marginTop: '20px', position: 'relative' }}>
                        <input
                          ref={userInputRef}
                          className="cr-form-input"
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
                          <div ref={userDropdownRef} className="cr-user-dropdown">
                            {userSearchResults.map(user => (
                              <div key={user.id} className="cr-dd-item" onClick={() => selectOnBehalfUser(user)}>
                                <div className="cr-dd-avatar">{user.displayName.charAt(0).toUpperCase()}</div>
                                <div>
                                  <div className="cr-dd-name">{user.displayName}</div>
                                  <div className="cr-dd-email">{user.mail}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {onBehalfUser.name && (
                          <div className="cr-selected-user">
                            <div className="cr-selected-label">✓ Selected User</div>
                            <div style={{ fontWeight: '600', color: '#0f172a' }}>{onBehalfUser.name}</div>
                            <div style={{ fontSize: '13px', color: '#64748b' }}>{onBehalfUser.mail}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Description - REQUIRED for Admin Access, optional for others */}
                <div className="cr-form-group">
                  <label className="cr-form-label">
                    Description {isAdminAccess && <span className="required">*</span>}
                  </label>
                  <textarea
                    className="cr-form-textarea"
                    placeholder={isAdminAccess 
                      ? "Please provide a reason for requesting admin access (e.g., troubleshooting needs, software installation, etc.)..." 
                      : "Provide detailed information about your request..."}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={6}
                  />
                  {isAdminAccess && (
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                      ℹ️ This description will be visible to the approver.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column */}
              <div className="cr-form-right">
                {/* Attachments - Show for ALL except Password Reset */}
                {!isPasswordReset && (
                  <div className="cr-form-group">
                    <label className="cr-form-label">
                      Attachments {isAdminAccess && <span style={{ fontSize: '11px', fontWeight: 'normal' }}>(optional)</span>}
                    </label>
                    <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
                    <button
                      type="button"
                      className="cr-attach-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      📎 {uploading ? 'Uploading...' : 'Add Attachments'}
                    </button>
                    {attachments.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        {attachments.map(att => (
                          <div key={att.id} className="cr-attachment-item">
                            <span>📄 {att.fileName}</span>
                            <button className="cr-attachment-remove" onClick={() => removeAttachment(att.id)}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {isAdminAccess && (
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '12px' }}>
                        💡 Tip: Upload approval forms, justification documents, or any supporting files (optional)
                      </div>
                    )}
                  </div>
                )}

                {/* Priority */}
                <div className="cr-form-group">
                  <label className="cr-form-label">Priority Level</label>
                  <div className="cr-priority-group">
                    {['low', 'medium', 'high'].map(p => (
                      <button
                        key={p}
                        type="button"
                        className={`cr-priority-btn ${priority === p ? `active-${p}` : ''}`}
                        onClick={() => setPriority(p)}
                      >
                        {p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢'} {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Form Footer */}
            <div className="cr-form-footer">
              <button className="cr-btn-cancel" onClick={handleBackToCatalog}>
                Cancel
              </button>
              <button
                className="cr-btn-submit"
                onClick={handleSubmit}
                disabled={disableSubmit}
              >
                {submitting ? 'Submitting Request...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.open && (
        <div className={`cr-toast ${toast.type === 'success' ? 'cr-toast-success' : 'cr-toast-error'}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default CreateRequest;