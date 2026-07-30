// src/HrRequest.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';
import onboardingImg from './SettingsPages/onboarding.png';
import offboardingImg from './SettingsPages/offboarding.png';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// ✅ Request types that use a dedicated image instead of an emoji.
// Matched against the request type's name (case-insensitive).
const NAME_ICON_MAP = {
  onboarding: onboardingImg,
  offboarding: offboardingImg,
};

const getNameIcon = (name = '') => NAME_ICON_MAP[name.trim().toLowerCase()] || null;

function HrRequest() {
  const navigate = useNavigate();
  const { accounts } = useMsal();
  const currentUser = accounts[0] || {};

  const [viewMode, setViewMode] = useState('requests'); // 'requests' | 'new'
  const [requestViewType, setRequestViewType] = useState('my'); // 'my' | 'all'

  // My Requests state
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // New Request (tile picker) state
  const [hrTypes, setHrTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(true);

  // User role state
  const [isAdminOrApprover, setIsAdminOrApprover] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteRequestId, setDeleteRequestId] = useState(null);
  const [deleteRequestNumber, setDeleteRequestNumber] = useState('');
  const [deleteRequestType, setDeleteRequestType] = useState('onboarding');
  const [deleting, setDeleting] = useState(false);
  const [dropdownOpenId, setDropdownOpenId] = useState(null);
  
  // Disable modal state for offboarding
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableRequestId, setDisableRequestId] = useState(null);
  const [disableRequestNumber, setDisableRequestNumber] = useState('');
  const [disabling, setDisabling] = useState(false);
  
  // Ref for dropdowns
  const dropdownRefs = useRef({});

  // Get logged-in user email
  const loggedInEmail = currentUser?.username || currentUser?.mail || '';

  useEffect(() => {
    checkUserRole();
    fetchAllHrRequests();
    fetchHrTypes();
  }, []);

  // Refetch when view type changes
  useEffect(() => {
    if (viewMode === 'requests') {
      fetchAllHrRequests();
    }
  }, [requestViewType]);

  // Check if user is admin or approver
  const checkUserRole = async () => {
    setCheckingRole(true);
    try {
      const email = loggedInEmail;
      if (!email) {
        setIsAdminOrApprover(false);
        setCheckingRole(false);
        return;
      }

      const adminRes = await axios.post(`${BACKEND}/api/check-admin`, { email });
      const isAdmin = adminRes.data?.isAdmin || false;

      const settingsRes = await axios.get(`${BACKEND}/api/onboarding/settings`);
      const approvers = settingsRes.data?.approvers || [];
      const isApprover = approvers.some(a => 
        a.mail?.toLowerCase() === email.toLowerCase() ||
        a.email?.toLowerCase() === email.toLowerCase()
      );

      setIsAdminOrApprover(isAdmin || isApprover);
      console.log(`🔍 [ROLE CHECK] User ${email}: isAdmin=${isAdmin}, isApprover=${isApprover}`);
    } catch (err) {
      console.error('Error checking user role:', err);
      setIsAdminOrApprover(false);
    } finally {
      setCheckingRole(false);
    }
  };

  const fetchAllHrRequests = async () => {
    setLoading(true);
    try {
      let onboardingUrl = `${BACKEND}/api/onboarding`;
      let offboardingUrl = `${BACKEND}/api/offboarding`;
      
      if (requestViewType === 'my' && loggedInEmail) {
        onboardingUrl = `${BACKEND}/api/onboarding/my?email=${encodeURIComponent(loggedInEmail)}`;
      }
      
      const [onboardingRes, offboardingRes] = await Promise.all([
        axios.get(onboardingUrl),
        axios.get(offboardingUrl)
      ]);
      
      let onboardingRequests = onboardingRes.data || [];
      let offboardingRequests = offboardingRes.data || [];
      
      if (requestViewType === 'my' && loggedInEmail) {
        offboardingRequests = offboardingRequests.filter(req => 
          req.createdByEmail?.toLowerCase() === loggedInEmail.toLowerCase()
        );
      }
      
      offboardingRequests = offboardingRequests.map(req => ({
        ...req,
        _type: 'offboarding',
        serviceName: 'Offboarding',
        firstName: req.targetUser?.name?.split(' ')[0] || '',
        lastName: req.targetUser?.name?.split(' ').slice(1).join(' ') || '',
        userPrincipalName: req.targetUser?.email || '',
        createdByName: req.createdByName || req.createdBy || '',
        raisedBy: { name: req.createdByName || req.createdBy, mail: req.createdByEmail || '' },
        // ✅ Preserve action and schedule data
        actionType: req.actionType || req.action?.type || '',
        actionSchedule: req.actionSchedule || req.schedule || '',
        executedAt: req.executedAt || req.actionExecutedAt || null
      }));
      
      onboardingRequests = onboardingRequests.map(req => ({
        ...req,
        _type: 'onboarding'
      }));
      
      const combined = [...onboardingRequests, ...offboardingRequests];
      combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      setRequests(combined);
    } catch (err) {
      console.error('Error fetching HR requests:', err);
      setError('Failed to load HR requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchHrTypes = async () => {
    setTypesLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/hr-requests`);
      setHrTypes(res.data || []);
    } catch (err) {
      console.error('Error fetching HR request types:', err);
    } finally {
      setTypesLoading(false);
    }
  };

  const slugify = (name = '') =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const handleTileClick = (hrType) => {
    const slug = slugify(hrType.name);

    if (slug === 'onboarding') {
      navigate('/onboarding/form', {
        state: { fromHrRequest: true, hrRequestType: hrType },
      });
      return;
    }

    if (slug === 'offboarding') {
      navigate('/offboarding/form', {
        state: { fromHrRequest: true, hrRequestType: hrType },
      });
      return;
    }

    navigate(`/hr-request/${slug}`, {
      state: { fromHrRequest: true, hrRequestType: hrType },
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending_approval: { bg: '#fef3c7', color: '#92400e', label: '⏳ Pending Approval' },
      approved: { bg: '#dbeafe', color: '#1e40af', label: '✅ Approved' },
      rejected: { bg: '#fee2e2', color: '#991b1b', label: '❌ Rejected' },
      processing: { bg: '#fef3c7', color: '#92400e', label: '🔄 Processing' },
      completed: { bg: '#d1fae5', color: '#065f46', label: '✅ Completed' },
      failed: { bg: '#fee2e2', color: '#991b1b', label: '❌ Failed' },
      approved_awaiting_schedule: { bg: '#dbeafe', color: '#1e40af', label: '⏳ Awaiting Schedule' },
    };
    return styles[status] || { bg: '#e5e7eb', color: '#374151', label: status?.replace(/_/g, ' ') || status };
  };

  const getServiceBadge = (req) => {
    if (req._type === 'offboarding' || req.targetUser || req.actionType) {
      return {
        label: 'Offboarding',
        bg: 'rgba(124,58,237,0.08)',
        color: '#7c3aed',
        icon: '🚪'
      };
    }
    return {
      label: 'Onboarding',
      bg: 'rgba(233,132,4,0.08)',
      color: 'var(--orange)',
      icon: '👤'
    };
  };

  // ✅ NEW: Format action display for offboarding requests with proper logic
  const formatActionDisplay = (req) => {
    if (req._type !== 'offboarding') {
      return null; // Onboarding shows dash
    }

    const actionType = req.actionType || req.action?.type || 'N/A';
    const schedule = req.actionSchedule || req.schedule || '';
    const executedAt = req.executedAt || req.actionExecutedAt || null;

    // Check if schedule is "Immediate" or a date
    const isImmediate = schedule.toLowerCase() === 'immediate';
    
    // Check if executedAt exists (action was already performed)
    const hasExecutedAt = executedAt !== null && executedAt !== undefined && executedAt !== '';
    
    // Check if schedule is a date (future or past)
    let scheduleDate = null;
    let isScheduleDate = false;
    
    if (!isImmediate && schedule) {
      try {
        const parsed = new Date(schedule);
        if (!isNaN(parsed.getTime())) {
          scheduleDate = parsed;
          isScheduleDate = true;
        }
      } catch (e) {
        // Not a valid date
      }
    }

    // Format date for display
    const formatActionDate = (date) => {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }) + ', ' + d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    let scheduleDisplay = '';
    let executionDisplay = '';

    // Determine what to show
    if (isImmediate) {
      scheduleDisplay = 'Immediate';
      // If executed, show executed at
      if (hasExecutedAt) {
        executionDisplay = `Executed at: ${formatActionDate(executedAt)}`;
      }
      // If not executed yet (shouldn't happen for Immediate but just in case)
      // No execution display
    } else if (isScheduleDate && scheduleDate) {
      const formattedSchedule = formatActionDate(scheduleDate);
      scheduleDisplay = formattedSchedule;
      
      if (hasExecutedAt) {
        // Already executed
        executionDisplay = `Executed at: ${formatActionDate(executedAt)}`;
      } else {
        // Future scheduled - show "Will be executed at"
        executionDisplay = `Will be executed at: ${formattedSchedule}`;
      }
    } else if (schedule) {
      // Custom schedule text (not "Immediate" and not a date)
      scheduleDisplay = schedule;
      if (hasExecutedAt) {
        executionDisplay = `Executed at: ${formatActionDate(executedAt)}`;
      }
    } else {
      // No schedule info
      scheduleDisplay = 'Not scheduled';
    }

    return {
      actionType: actionType.toUpperCase(),
      scheduleDisplay: scheduleDisplay,
      executionDisplay: executionDisplay,
      hasExecutedAt: hasExecutedAt,
      isImmediate: isImmediate
    };
  };

  // ✅ Get offboarding actions (Disable/Delete buttons)
  const getOffboardingActions = (req) => {
    const actions = [];
    
    if (req._type !== 'offboarding') {
      return actions;
    }
    
    const status = req.status;
    
    if (status === 'approved' || status === 'approved_awaiting_schedule') {
      actions.push({
        type: 'disable',
        label: '🛑 Disable User',
        color: '#dc2626',
        bg: 'rgba(220,38,38,0.08)',
        handler: () => openDisableModal(req._id, req.requestNumber, req)
      });
    }
    
    
    return actions;
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const filteredRequests = requests.filter(req => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const name = `${req.firstName || ''} ${req.lastName || ''}`.toLowerCase();
      const email = (req.userPrincipalName || req.targetUser?.email || '').toLowerCase();
      const number = (req.requestNumber || '').toLowerCase();
      const serviceName = (req.serviceName || 'HR Request').toLowerCase();
      if (!name.includes(term) && !email.includes(term) && !number.includes(term) && !serviceName.includes(term)) {
        return false;
      }
    }
    if (filterStatus !== 'all' && req.status !== filterStatus) {
      return false;
    }
    return true;
  });

  const getStatusOptions = () => {
    const statuses = ['pending_approval', 'approved', 'rejected', 'processing', 'completed', 'failed', 'approved_awaiting_schedule'];
    const labels = {
      pending_approval: 'Pending Approval',
      approved: 'Approved',
      rejected: 'Rejected',
      processing: 'Processing',
      completed: 'Completed',
      failed: 'Failed',
      approved_awaiting_schedule: 'Awaiting Schedule'
    };
    return statuses.map(s => ({ value: s, label: labels[s] || s }));
  };

  const openDeleteModal = (requestId, requestNumber, req) => {
    setDeleteRequestId(requestId);
    setDeleteRequestNumber(requestNumber);
    setDeleteRequestType(req._type === 'offboarding' ? 'offboarding' : 'onboarding');
    setShowDeleteModal(true);
    setDropdownOpenId(null);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteRequestId(null);
    setDeleteRequestNumber('');
  };

  const handleDelete = async () => {
    if (!deleteRequestId) return;
    
    setDeleting(true);
    try {
      const endpoint = deleteRequestType === 'offboarding' 
        ? `${BACKEND}/api/offboarding/${deleteRequestId}`
        : `${BACKEND}/api/onboarding/${deleteRequestId}`;
      
      await axios.delete(endpoint);
      setRequests(prev => prev.filter(req => req._id !== deleteRequestId));
      closeDeleteModal();
    } catch (err) {
      console.error('Error deleting request:', err);
      alert('Failed to delete request. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const openDisableModal = (requestId, requestNumber, req) => {
    setDisableRequestId(requestId);
    setDisableRequestNumber(requestNumber);
    setShowDisableModal(true);
    setDropdownOpenId(null);
  };

  const closeDisableModal = () => {
    setShowDisableModal(false);
    setDisableRequestId(null);
    setDisableRequestNumber('');
  };

  const handleDisableUser = async () => {
    if (!disableRequestId) return;
    
    setDisabling(true);
    try {
      const req = requests.find(r => r._id === disableRequestId);
      if (!req) {
        alert('Request not found');
        return;
      }
      
      await axios.post(`${BACKEND}/api/offboarding/${disableRequestId}/disable-user`, {
        targetUser: req.targetUser
      });
      
      setRequests(prev => prev.map(r => 
        r._id === disableRequestId 
          ? { ...r, status: 'completed', userDisabled: true } 
          : r
      ));
      
      closeDisableModal();
      alert('✅ User has been disabled successfully!');
    } catch (err) {
      console.error('Error disabling user:', err);
      alert('Failed to disable user. Please try again.');
    } finally {
      setDisabling(false);
    }
  };

  const toggleDropdown = (requestId, e) => {
    e.stopPropagation();
    setDropdownOpenId(dropdownOpenId === requestId ? null : requestId);
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

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

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .onb-list-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    .onb-list-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .onb-list-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .onb-list-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .onb-list-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .onb-list-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .onb-list-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .onb-list-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .onb-list-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    .onb-list-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    .onb-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .onb-tabs {
      display: inline-flex;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      padding: 4px;
      gap: 4px;
      flex-wrap: wrap;
    }
    .onb-tab {
      padding: 10px 20px;
      border: none;
      background: transparent;
      border-radius: 10px;
      font-size: 13.5px;
      font-weight: 700;
      font-family: 'Sora', sans-serif;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s;
    }
    .onb-tab:hover {
      color: var(--navy);
    }
    .onb-tab.active {
      background: var(--navy);
      color: #ffffff;
    }
    .onb-tab.active-all {
      background: #7c3aed;
      color: #ffffff;
    }
    .onb-tab.active-all:hover {
      background: #6d28d9;
    }
    .onb-tab.admin-badge {
      position: relative;
    }
    .onb-tab.admin-badge::after {
      content: '👑';
      position: absolute;
      top: -6px;
      right: -6px;
      font-size: 12px;
    }

    .onb-new-request-btn {
      padding: 12px 28px;
      background: var(--orange);
      color: #ffffff;
      border: none;
      border-radius: 12px;
      font-family: 'Sora', sans-serif;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(233, 132, 4, 0.3);
      white-space: nowrap;
    }
    .onb-new-request-btn:hover {
      background: #d67804;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(233, 132, 4, 0.4);
    }
    .onb-new-request-btn:active {
      transform: translateY(0);
    }

    .onb-list-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .onb-list-toolbar-left {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      flex: 1;
    }

    .onb-list-search {
      padding: 10px 16px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      background: var(--white);
      color: var(--text);
      min-width: 200px;
      flex: 1;
      max-width: 300px;
    }
    .onb-list-search:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }

    .onb-list-filter {
      padding: 10px 16px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      background: var(--white);
      color: var(--text);
    }
    .onb-list-filter:focus {
      outline: none;
      border-color: var(--navy);
    }

    .onb-list-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      animation: fadeUp 0.4s ease both;
    }

    .onb-list-table-wrap {
      overflow-x: auto;
    }
    .onb-list-table {
      width: 100%;
      border-collapse: collapse;
    }
    .onb-list-table th {
      text-align: left;
      padding: 14px 20px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
      font-family: 'Sora', sans-serif;
    }
    .onb-list-table td {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
      vertical-align: middle;
    }
    .onb-list-table tr:last-child td {
      border-bottom: none;
    }
    .onb-list-table tr:hover td {
      background: rgba(0,32,96,0.02);
    }

    .onb-list-request-number {
      font-family: 'Sora', sans-serif;
      font-weight: 700;
      color: var(--navy);
      font-size: 14px;
    }
    .onb-list-employee {
      font-weight: 600;
      color: var(--text);
    }
    .onb-list-email {
      font-size: 12px;
      color: var(--muted);
    }
    .onb-list-department {
      font-size: 13px;
      color: var(--muted);
    }

    .onb-list-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 30px;
      font-size: 12px;
      font-weight: 700;
      font-family: 'Sora', sans-serif;
    }

    .onb-list-created-by {
      font-size: 12px;
      color: var(--muted);
    }

    /* ✅ Action cell styles */
    .onb-action-cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 120px;
    }
    .onb-action-type {
      font-size: 13px;
      font-weight: 700;
      color: #dc2626;
      font-family: 'Sora', sans-serif;
      letter-spacing: 0.02em;
    }
    .onb-action-schedule {
      font-size: 11px;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .onb-action-schedule-label {
      font-weight: 600;
      color: #64748b;
    }
    .onb-action-schedule-value {
      color: #0f172a;
    }
    .onb-action-execution {
      font-size: 11px;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .onb-action-execution-label {
      font-weight: 600;
      color: #64748b;
    }
    .onb-action-execution-value {
      color: #0f172a;
    }
    .onb-action-dash {
      color: #94a3b8;
      font-size: 14px;
      font-weight: 300;
      letter-spacing: 1px;
    }

    /* ✅ Action button styles */
    .onb-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: none;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Sora', sans-serif;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .onb-action-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .onb-action-btn:active {
      transform: translateY(0);
    }
    .onb-action-btn-disable {
      background: rgba(220, 38, 38, 0.1);
      color: #dc2626;
    }
    .onb-action-btn-disable:hover {
      background: #dc2626;
      color: white;
    }
    .onb-action-btn-delete {
      background: rgba(239, 68, 68, 0.08);
      color: #ef4444;
    }
    .onb-action-btn-delete:hover {
      background: #ef4444;
      color: white;
    }

    .onb-action-buttons {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    /* Dropdown styles */
    .onb-dropdown-wrapper {
      position: relative;
      display: inline-block;
    }
    .onb-dropdown-btn {
      background: transparent;
      border: none;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      color: var(--muted);
      transition: all 0.2s;
    }
    .onb-dropdown-btn:hover {
      background: var(--bg);
      color: var(--text);
    }
    .onb-dropdown-menu {
      position: absolute;
      right: 0;
      top: 100%;
      min-width: 160px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
      z-index: 1000;
      margin-top: 6px;
      animation: fadeIn 0.15s ease;
      overflow: hidden;
    }
    .onb-dropdown-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      font-size: 14px;
      font-weight: 600;
      color: var(--red);
      cursor: pointer;
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
      transition: background 0.15s;
      font-family: 'Lato', sans-serif;
    }
    .onb-dropdown-item:hover {
      background: rgba(239, 68, 68, 0.06);
    }
    .onb-dropdown-item svg {
      flex-shrink: 0;
    }

    .onb-list-empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
    }
    .onb-list-empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .onb-list-empty h4 {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 8px;
    }
    .onb-list-empty p {
      font-size: 14px;
    }

    .onb-list-loading {
      text-align: center;
      padding: 60px 20px;
    }
    .onb-list-spinner {
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

    .onb-list-count {
      font-size: 13px;
      color: var(--muted);
      padding: 12px 20px;
      border-top: 1.5px solid var(--border);
      background: var(--light);
    }

    /* Modal styles */
    .onb-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 20000;
      animation: fadeIn 0.2s ease;
      backdrop-filter: blur(4px);
    }
    .onb-modal {
      background: var(--white);
      border-radius: 20px;
      max-width: 480px;
      width: 90%;
      padding: 36px 40px 32px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .onb-modal-icon {
      font-size: 48px;
      text-align: center;
      margin-bottom: 16px;
    }
    .onb-modal-title {
      font-family: 'Sora', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
      text-align: center;
      margin-bottom: 8px;
    }
    .onb-modal-desc {
      font-size: 15px;
      color: var(--muted);
      text-align: center;
      margin-bottom: 28px;
      line-height: 1.6;
    }
    .onb-modal-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .onb-modal-btn-cancel {
      padding: 14px 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 15px;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Sora', sans-serif;
      flex: 1;
    }
    .onb-modal-btn-cancel:hover {
      border-color: var(--navy);
      color: var(--navy);
    }
    .onb-modal-btn-delete {
      padding: 14px 28px;
      background: var(--red);
      border: none;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      color: white;
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Sora', sans-serif;
      flex: 1;
    }
    .onb-modal-btn-delete:hover:not(:disabled) {
      background: #dc2626;
    }
    .onb-modal-btn-delete:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .onb-modal-btn-disable {
      padding: 14px 28px;
      background: #dc2626;
      border: none;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      color: white;
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Sora', sans-serif;
      flex: 1;
    }
    .onb-modal-btn-disable:hover:not(:disabled) {
      background: #b91c1c;
    }
    .onb-modal-btn-disable:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Tile picker (New Request view) */
    .hrtile-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 18px;
      animation: fadeUp 0.4s ease both;
    }
    .hrtile-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 26px 22px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .hrtile-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 14px 34px rgba(0,32,96,0.1);
      border-color: var(--navy);
    }
    .hrtile-emoji {
      font-size: 42px;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hrtile-icon-img {
      width: 48px;
      height: 48px;
      object-fit: contain;
    }
    .hrtile-name {
      font-family: 'Sora', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: var(--navy);
      margin-bottom: 6px;
    }
    .hrtile-desc {
      font-size: 12.5px;
      color: var(--muted);
      line-height: 1.5;
    }
    .hrtile-arrow {
      margin-top: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      color: var(--navy);
      opacity: 0;
      transition: opacity 0.15s;
    }
    .hrtile-card:hover .hrtile-arrow {
      opacity: 1;
    }

    @media (max-width: 768px) {
      .onb-list-hero { padding: 40px 24px; }
      .onb-list-content { padding: 24px 20px 40px; }
      .onb-list-toolbar { flex-direction: column; align-items: stretch; }
      .onb-list-toolbar-left { flex-direction: column; }
      .onb-list-search { max-width: 100%; }
      .onb-list-table th, .onb-list-table td { padding: 10px 12px; font-size: 13px; }
      .hrtile-grid { grid-template-columns: 1fr; }
      .onb-header-row { flex-direction: column; align-items: stretch; }
      .onb-new-request-btn { justify-content: center; }
      .onb-modal { padding: 28px 20px 24px; }
      .onb-modal-actions { flex-direction: column; }
      .onb-tabs { width: 100%; }
      .onb-tab { flex: 1; text-align: center; }
    }
  `;

  return (
    <div className="onb-list-page">
      <style>{sharedCSS}</style>

      {/* Hero Section */}
      <div className="onb-list-hero">
        <div className="onb-list-hero-inner">
          <div className="onb-list-hero-eyebrow">
            <div className="onb-list-hero-eyebrow-line" />
            HR Requests
          </div>
          <h1>Manage <em>HR</em> Requests</h1>
          <p className="onb-list-hero-sub">View your HR requests or start a new one.</p>
        </div>
      </div>

      {/* Content */}
      <div className="onb-list-content">
        <div className="onb-header-row">
          <div className="onb-tabs">
            <button
              className={`onb-tab ${requestViewType === 'my' && viewMode === 'requests' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('requests');
                setRequestViewType('my');
              }}
            >
              📋 My Requests
            </button>

            {!checkingRole && isAdminOrApprover && (
              <button
                className={`onb-tab admin-badge ${requestViewType === 'all' && viewMode === 'requests' ? 'active-all' : ''}`}
                onClick={() => {
                  setViewMode('requests');
                  setRequestViewType('all');
                }}
                title="View all HR requests (Admin/Approver only)"
              >
                📊 All Requests
              </button>
            )}
          </div>
          <button
            className="onb-new-request-btn"
            onClick={() => {
              setViewMode('new');
              setRequestViewType('my');
            }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Request
          </button>
        </div>

        {viewMode === 'requests' && (
          <div style={{ 
            marginBottom: '16px', 
            fontSize: '14px', 
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            {requestViewType === 'my' ? (
              <>👤 Showing requests created by <strong>{loggedInEmail}</strong></>
            ) : (
              <>📊 Showing <strong>ALL</strong> HR requests (Admin/Approver view)</>
            )}
            {isAdminOrApprover && requestViewType === 'my' && (
              <span style={{ 
                background: '#7c3aed', 
                color: 'white', 
                padding: '2px 10px', 
                borderRadius: '12px', 
                fontSize: '11px',
                fontWeight: '700'
              }}>
                👑 Admin
              </span>
            )}
          </div>
        )}

        {viewMode === 'requests' ? (
          <>
            <div className="onb-list-toolbar">
              <div className="onb-list-toolbar-left">
                <input
                  className="onb-list-search"
                  placeholder="Search by name, email, or request number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select
                  className="onb-list-filter"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">All Status</option>
                  {getStatusOptions().map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="onb-list-card">
              {loading || checkingRole ? (
                <div className="onb-list-loading">
                  <div className="onb-list-spinner" />
                  <p style={{ color: '#64748b', fontSize: 14 }}>
                    {checkingRole ? 'Checking user permissions...' : 'Loading HR requests...'}
                  </p>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="onb-list-empty">
                  <div className="onb-list-empty-icon">📋</div>
                  <h4>No HR requests found</h4>
                  <p>
                    {requestViewType === 'my' 
                      ? 'You haven\'t submitted any HR requests yet.' 
                      : 'No HR requests have been submitted yet.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="onb-list-table-wrap">
                    <table className="onb-list-table">
                      <thead>
                        <tr>
                          <th>Request ID</th>
                          <th>Service</th>
                          <th>Action &amp; Schedule</th> {/* ✅ Moved here - between Service and Employee */}
                          <th>Employee</th>
                          <th>Email</th>
                          <th>Status</th>
                          {requestViewType === 'all' && <th>Created By</th>}
                          <th>Created</th>
                          <th style={{ width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRequests.map((req) => {
                          const status = getStatusBadge(req.status);
                          const service = getServiceBadge(req);
                          const email = req.userPrincipalName || req.targetUser?.email || req.otherEmail || 
                            `${req.emailPrefix}@${process.env.REACT_APP_COMPANY_DOMAIN || 'company.com'}`;
                          const employeeName = req.targetUser?.name || `${req.firstName || ''} ${req.lastName || ''}`.trim() || '—';
                          
                          const isOffboarding = req._type === 'offboarding' || req.targetUser || req.actionType;
                          const detailPath = isOffboarding ? `/offboarding-request/${req._id}` : `/hr-request/${req._id}`;
                          
                          const actions = getOffboardingActions(req);
                          const actionDisplay = formatActionDisplay(req);
                          
                          return (
                            <tr key={req._id}>
                              <td 
                                className="onb-list-request-number"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigate(detailPath)}
                              >
                                {req.requestNumber || 'HRQ-0001'}
                              </td>
                              <td 
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigate(detailPath)}
                              >
                                <span style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  padding: '4px 12px',
                                  background: service.bg,
                                  borderRadius: '20px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  color: service.color
                                }}>
                                  <span>{service.icon}</span> {service.label}
                                </span>
                              </td>
                              {/* ✅ Action & Schedule column - NOW BETWEEN Service and Employee */}
                              <td>
                                {req._type === 'offboarding' && actionDisplay ? (
                                  <div className="onb-action-cell">
                                    {/* Action Type */}
                                    <div className="onb-action-type">
                                      {actionDisplay.actionType}
                                    </div>
                                    
                                    {/* Execution display - only show if not Immediate OR if executed */}
                                    {actionDisplay.executionDisplay && (
                                      <div className="onb-action-execution">
                                        <span className="onb-action-execution-value">
                                          {actionDisplay.executionDisplay}
                                        </span>
                                      </div>
                                    )}
                                    
                                    {/* Action buttons (Disable/Delete) */}
                                    {actions.length > 0 && (
                                      <div className="onb-action-buttons">
                                        {actions.map((action, index) => (
                                          <button
                                            key={index}
                                            className={`onb-action-btn onb-action-btn-${action.type}`}
                                            onClick={action.handler}
                                          >
                                            {action.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="onb-action-dash">—</span>
                                )}
                              </td>
                              <td 
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigate(detailPath)}
                              >
                                <div className="onb-list-employee">{employeeName}</div>
                              </td>
                              <td 
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigate(detailPath)}
                              >
                                <div className="onb-list-email">{email}</div>
                              </td>
                              <td 
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigate(detailPath)}
                              >
                                <span
                                  className="onb-list-status"
                                  style={{ background: status.bg, color: status.color }}
                                >
                                  {status.label}
                                </span>
                              </td>
                              {requestViewType === 'all' && (
                                <td className="onb-list-created-by">
                                  {req.createdByName || req.createdBy?.name || req.raisedBy?.name || 'Unknown'}
                                </td>
                              )}
                              <td 
                                style={{ fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
                                onClick={() => navigate(detailPath)}
                              >
                                {formatDate(req.createdAt)}
                              </td>
                              <td>
                                <div 
                                  className="onb-dropdown-wrapper" 
                                  ref={el => dropdownRefs.current[req._id] = el}
                                >
                                  <button
                                    className="onb-dropdown-btn"
                                    onClick={(e) => toggleDropdown(req._id, e)}
                                  >
                                    ⋮
                                  </button>
                                  {dropdownOpenId === req._id && (
                                    <div className="onb-dropdown-menu">
                                      <button
                                        className="onb-dropdown-item"
                                        onClick={() => openDeleteModal(req._id, req.requestNumber, req)}
                                      >
                                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="onb-list-count">
                    Showing {filteredRequests.length} of {requests.length} HR requests
                    {requestViewType === 'my' && ` (your requests)`}
                    {requestViewType === 'all' && ` (all requests)`}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="onb-list-card" style={{ padding: '28px' }}>
            {typesLoading ? (
              <div className="onb-list-loading">
                <div className="onb-list-spinner" />
                <p style={{ color: '#64748b', fontSize: 14 }}>Loading HR services...</p>
              </div>
            ) : hrTypes.length === 0 ? (
              <div className="onb-list-empty">
                <div className="onb-list-empty-icon">📋</div>
                <h4>No HR request types set up yet</h4>
                <p>Ask an admin to add types under Settings → HR Request Types.</p>
              </div>
            ) : (
              <div className="hrtile-grid">
                {hrTypes.map((type) => (
                  <div
                    key={type._id}
                    className="hrtile-card"
                    onClick={() => handleTileClick(type)}
                  >
                    <div className="hrtile-emoji">
                      {getNameIcon(type.name) ? (
                        <img
                          src={getNameIcon(type.name)}
                          alt={type.name}
                          className="hrtile-icon-img"
                        />
                      ) : (
                        type.emoji || '📋'
                      )}
                    </div>
                    <div className="hrtile-name">{type.name}</div>
                    <div className="hrtile-desc">{type.description || '—'}</div>
                    <div className="hrtile-arrow">
                      Request this
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="onb-modal-overlay" onClick={closeDeleteModal}>
          <div className="onb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="onb-modal-icon">⚠️</div>
            <div className="onb-modal-title">Delete Request</div>
            <div className="onb-modal-desc">
              Are you sure you want to delete request <strong>{deleteRequestNumber}</strong>?<br />
              This action cannot be undone.
            </div>
            <div className="onb-modal-actions">
              <button className="onb-modal-btn-cancel" onClick={closeDeleteModal}>
                Cancel
              </button>
              <button 
                className="onb-modal-btn-delete" 
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable User Confirmation Modal */}
      {showDisableModal && (
        <div className="onb-modal-overlay" onClick={closeDisableModal}>
          <div className="onb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="onb-modal-icon">🛑</div>
            <div className="onb-modal-title">Disable User</div>
            <div className="onb-modal-desc">
              Are you sure you want to disable the user for request <strong>{disableRequestNumber}</strong>?<br />
              This will deactivate the user's account.
            </div>
            <div className="onb-modal-actions">
              <button className="onb-modal-btn-cancel" onClick={closeDisableModal}>
                Cancel
              </button>
              <button 
                className="onb-modal-btn-disable" 
                onClick={handleDisableUser}
                disabled={disabling}
              >
                {disabling ? 'Disabling...' : 'Disable User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HrRequest;