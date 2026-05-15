// Requests.js - With My Requests / Assigned to Me toggle
import React, { useState, useEffect, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Status config with Home.js color scheme
const STATUS_CONFIG = {
  open:             { label: 'Open',             color: '#e98404', bg: '#fef3c7', border: '#fbbf24' },
  in_progress:      { label: 'In Progress',      color: '#002060', bg: '#dbeafe', border: '#3b82f6' },
  pending_approval: { label: 'Pending Approval', color: '#7c3aed', bg: '#f3e8ff', border: '#a855f7' },
  resolved:         { label: 'Resolved',         color: '#10b981', bg: '#d1fae5', border: '#10b981' },
  closed:           { label: 'Closed',           color: '#64748b', bg: '#f3f4f6', border: '#cbd5e1' },
  cancelled:        { label: 'Cancelled',        color: '#ef4444', bg: '#fee2e2', border: '#ef4444' },
};

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    color: '#10b981', bg: '#d1fae5', icon: '🟢' },
  medium: { label: 'Medium', color: '#e98404', bg: '#fef3c7', icon: '🟡' },
  high:   { label: 'High',   color: '#ef4444', bg: '#fee2e2', icon: '🔴' },
};

const ALL_STATUSES = ['all', 'open', 'in_progress', 'pending_approval', 'resolved', 'closed', 'cancelled'];
const ALL_PRIORITIES = ['all', 'high', 'medium', 'low'];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: cfg.bg, border: `1.5px solid ${cfg.border}`, color: cfg.color,
      letterSpacing: '0.02em', whiteSpace: 'nowrap',
      fontFamily: "'Sora', sans-serif",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
      fontFamily: "'Sora', sans-serif",
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[140, 180, 110, 90, 140, 120, 80].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div className="req-skel" style={{ width: w, height: 14, borderRadius: 6 }} />
        </td>
      ))}
    </tr>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

// Delete Confirmation Modal Component
function DeleteModal({ request, onClose, onConfirm, deleting }) {
  if (!request) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon">⚠️</div>
          <h3>Delete Request</h3>
        </div>
        <div className="modal-body">
          <p>Are you sure you want to delete this request?</p>
          <div className="modal-request-info">
            <div className="modal-info-row">
              <span className="modal-label">Request #</span>
              <span className="modal-value">{request.requestNumber || '—'}</span>
            </div>
            <div className="modal-info-row">
              <span className="modal-label">Service</span>
              <span className="modal-value">{request.service?.name || '—'}</span>
            </div>
            <div className="modal-info-row">
              <span className="modal-label">Status</span>
              <StatusBadge status={request.status} />
            </div>
          </div>
          <p className="modal-warning">This action cannot be undone.</p>
        </div>
        <div className="modal-footer">
          <button 
            className="modal-btn-cancel" 
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button 
            className="modal-btn-delete" 
            onClick={() => onConfirm(request._id)}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <span className="modal-spinner" />
                Deleting...
              </>
            ) : (
              'Delete Request'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Requests() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const location = useLocation();

  // Get current user info
  const currentUser = accounts[0];
  const currentUserEmail = currentUser?.username || currentUser?.mail || '';
  const currentUserName = currentUser?.name || '';
  const currentUserId = currentUser?.localAccountId || currentUser?.homeAccountId || '';

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(
    location.state?.filterStatus || 'all'
  );
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('my-requests'); // 'my-requests' or 'assigned-to-me'

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // Dropdown & Delete state
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(`${BACKEND}/api/requests`);
        setRequests(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('❌ Fetch requests:', err);
        setError('Failed to load requests. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, []);

  useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter, sortBy, viewMode]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openMenuId && !e.target.closest('.req-menu-wrapper')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId]);

  // Helper function to check if a member matches the current user
  const isMemberCurrentUser = (member) => {
    // Match by email (multiple possible fields)
    const memberEmails = [
      member.email,
      member.mail,
      member.username,
      member.userPrincipalName,
      member.upn
    ].filter(Boolean).map(e => e.toLowerCase().trim());

    if (currentUserEmail && memberEmails.includes(currentUserEmail.toLowerCase().trim())) {
      return true;
    }

    // Match by name
    if (currentUserName && member.name && 
        member.name.toLowerCase().trim() === currentUserName.toLowerCase().trim()) {
      return true;
    }

    // Match by user ID
    const memberIds = [
      member.userId,
      member._id,
      member.id,
      member.azureId,
      member.objectId
    ].filter(Boolean);

    if (currentUserId && memberIds.includes(currentUserId)) {
      return true;
    }

    // If member is a string, compare directly
    if (typeof member === 'string') {
      const memberStr = member.toLowerCase().trim();
      if (currentUserEmail && memberStr === currentUserEmail.toLowerCase().trim()) {
        return true;
      }
      if (currentUserName && memberStr === currentUserName.toLowerCase().trim()) {
        return true;
      }
    }

    return false;
  };

  // Helper function to check if current user is in assignment group
  const isUserInGroup = (request) => {
    if (!request.assignmentGroup?.members?.length || !currentUserEmail) {
      return false;
    }
    return request.assignmentGroup.members.some(member => isMemberCurrentUser(member));
  };

  // Helper function to check if request is created by current user
  const isCreatedByUser = (request) => {
    if (!currentUserEmail) return false;
    const raiserEmail = (request.raisedBy?.mail || request.raisedBy?.email || '').toLowerCase().trim();
    return raiserEmail === currentUserEmail.toLowerCase().trim();
  };

  const filtered = useMemo(() => {
    let list = [...requests];

    // Apply view mode filter first
    if (viewMode === 'my-requests') {
      list = list.filter(r => isCreatedByUser(r));
    } else if (viewMode === 'assigned-to-me') {
      list = list.filter(r => isUserInGroup(r));
    }

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.requestNumber?.toLowerCase().includes(q) ||
        r.service?.name?.toLowerCase().includes(q) ||
        r.service?.categoryName?.toLowerCase().includes(q) ||
        r.raisedBy?.name?.toLowerCase().includes(q) ||
        r.raisedBy?.mail?.toLowerCase().includes(q) ||
        r.assignmentGroup?.groupName?.toLowerCase().includes(q) ||
        r.assignedMember?.memberName?.toLowerCase().includes(q)
      );
    }

    // Apply status and priority filters
    if (statusFilter !== 'all')   list = list.filter(r => r.status === statusFilter);
    if (priorityFilter !== 'all') list = list.filter(r => r.priority === priorityFilter);

    // Apply sorting
    list.sort((a, b) => {
      if (sortBy === 'newest')   return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === 'oldest')   return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'priority') {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
      }
      return 0;
    });

    return list;
  }, [requests, search, statusFilter, priorityFilter, sortBy, viewMode, currentUserEmail]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats based on current view
  const stats = useMemo(() => {
    let baseList = [...requests];
    
    if (viewMode === 'my-requests') {
      baseList = baseList.filter(r => isCreatedByUser(r));
    } else if (viewMode === 'assigned-to-me') {
      baseList = baseList.filter(r => isUserInGroup(r));
    }

    return {
      total:      baseList.length,
      open:       baseList.filter(r => r.status === 'open').length,
      pending:    baseList.filter(r => r.status === 'pending_approval').length,
      resolved:   baseList.filter(r => r.status === 'resolved' || r.status === 'closed').length,
      high:       baseList.filter(r => r.priority === 'high' && r.status !== 'closed').length,
    };
  }, [requests, viewMode, currentUserEmail]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Handle Delete
  const handleDelete = async (requestId) => {
    setDeleting(true);
    try {
      await axios.delete(`${BACKEND}/api/requests/${requestId}`);
      setRequests(prev => prev.filter(r => r._id !== requestId));
      setDeleteTarget(null);
      setOpenMenuId(null);
    } catch (err) {
      console.error('❌ Delete request:', err);
      alert('Failed to delete request. Please try again.');
    } finally {
      setDeleting(false);
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
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes dropdownIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .req-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    .req-skel {
      background: #e2e8f0;
      border-radius: 8px;
      animation: pulse 1.6s ease-in-out infinite;
    }

    /* Hero Section */
    .req-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .req-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .req-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .req-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .req-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .req-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .req-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .req-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .req-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    /* View Toggle */
    .req-view-toggle {
      display: flex;
      gap: 0;
      margin-bottom: 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      padding: 5px;
      width: fit-content;
      animation: fadeUp 0.45s 0.05s ease both;
    }

    .req-toggle-btn {
      padding: 12px 28px;
      border: none;
      background: transparent;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s ease;
      white-space: nowrap;
      position: relative;
    }

    .req-toggle-btn-active {
      background: var(--navy);
      color: white;
      box-shadow: 0 4px 12px rgba(0, 32, 96, 0.2);
    }

    .req-toggle-btn:hover:not(.req-toggle-btn-active) {
      color: var(--navy);
      background: rgba(0, 32, 96, 0.05);
    }

    /* Stats Row */
    .req-stats {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin-bottom: 28px;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .req-stat-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 24px 20px;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: transform 0.22s ease, box-shadow 0.22s ease;
    }
    .req-stat-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 36px rgba(0,32,96,0.1);
    }

    .req-stat-stripe {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      border-radius: 18px 18px 0 0;
    }

    .req-stat-value {
      font-family: 'Sora', sans-serif;
      font-size: 34px; font-weight: 800;
      color: var(--navy);
      line-height: 1;
      letter-spacing: -0.03em;
      margin-bottom: 6px;
    }

    .req-stat-label {
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.05em; text-transform: uppercase;
      color: var(--muted);
    }

    /* Filters Bar */
    .req-filters {
      display: flex; gap: 12px; margin-bottom: 24px;
      flex-wrap: wrap;
      padding: 20px 24px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      animation: fadeUp 0.45s 0.15s ease both;
    }

    .req-search-wrapper {
      position: relative;
      flex: 1;
      min-width: 220px;
    }

    .req-search-icon {
      position: absolute;
      left: 14px; top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      font-size: 14px;
    }

    .req-search-input {
      width: 100%;
      padding: 11px 14px 11px 40px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
    }
    .req-search-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
    }
    .req-search-input::placeholder {
      color: var(--muted);
    }

    .req-select {
      padding: 11px 32px 11px 14px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      transition: all 0.2s;
    }
    .req-select:focus {
      outline: none;
      border-color: var(--navy);
    }

    /* Result Meta */
    .req-result-meta {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
      padding: 0 4px;
    }

    .req-clear-btn {
      padding: 6px 14px;
      font-size: 12px; font-weight: 600;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .req-clear-btn:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    /* Table */
    .req-table-wrapper {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      animation: fadeUp 0.5s 0.2s ease both;
    }

    .req-table {
      width: 100%;
      border-collapse: collapse;
    }

    .req-thead-row {
      background: var(--light);
      border-bottom: 1.5px solid var(--border);
    }

    .req-th {
      padding: 14px 16px;
      font-family: 'Sora', sans-serif;
      font-size: 11px; font-weight: 700;
      color: var(--navy);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: left;
      white-space: nowrap;
    }

    .req-tbody-row {
      border-bottom: 1.5px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
      animation: fadeUp 0.3s ease both;
    }
    .req-tbody-row:hover {
      background: var(--bg);
    }

    .req-td {
      padding: 14px 16px;
      vertical-align: middle;
    }

    .req-number {
      font-family: 'Sora', sans-serif;
      font-weight: 700; font-size: 13px;
      color: var(--navy);
      letter-spacing: 0.02em;
    }

    .req-service-name {
      font-size: 13px; font-weight: 600;
      color: var(--text);
      max-width: 160px;
      display: block;
      overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;
    }

    .req-category {
      font-size: 13px; color: var(--muted);
      max-width: 140px;
      display: block;
      overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;
    }

    .req-user-cell {
      display: flex; align-items: center; gap: 10px;
    }
    .req-user-avatar {
      width: 32px; height: 32px; border-radius: 10px;
      background: rgba(0,32,96,0.1);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      flex-shrink: 0;
    }
    .req-user-info {
      display: flex; flex-direction: column; gap: 2px;
    }
    .req-user-name {
      font-size: 13px; font-weight: 600;
      color: var(--text);
      line-height: 1.3;
    }
    .req-user-email {
      font-size: 11px; color: var(--muted);
    }

    /* Assignment Group Styles */
    .req-group-cell {
      display: flex; align-items: center; gap: 10px;
    }
    .req-group-avatar {
      width: 32px; height: 32px; border-radius: 10px;
      background: rgba(16,185,129,0.1);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700;
      color: #10b981;
      flex-shrink: 0;
    }
    .req-group-info {
      display: flex; flex-direction: column; gap: 2px;
    }
    .req-group-name {
      font-size: 13px; font-weight: 600;
      color: var(--text);
      line-height: 1.3;
    }
    .req-group-sub {
      font-size: 11px; color: var(--muted);
    }
    .req-unassigned {
      font-size: 12px; color: var(--muted);
      font-style: italic;
    }

    .req-date-cell {
      display: flex; flex-direction: column; gap: 3px;
    }
    .req-date-main {
      font-size: 13px; font-weight: 600;
      color: var(--text);
    }
    .req-date-rel {
      font-size: 11px; color: var(--muted);
    }

    /* Three-dot Menu */
    .req-menu-wrapper {
      position: relative;
      display: inline-flex;
      justify-content: center;
    }

    .req-menu-btn {
      width: 32px; height: 32px;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: var(--muted);
      transition: all 0.2s;
      font-weight: 700;
      letter-spacing: 1px;
    }

    .req-menu-btn:hover {
      background: var(--bg);
      color: var(--navy);
    }

    .req-menu-dropdown {
      position: fixed;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      min-width: 160px;
      z-index: 9999;
      overflow: hidden;
      animation: dropdownIn 0.2s ease;
    }

    .req-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 16px;
      border: none;
      background: transparent;
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.15s;
    }

    .req-menu-item:hover {
      background: var(--bg);
    }

    .req-menu-item-delete {
      color: #ef4444;
    }
    .req-menu-item-delete:hover {
      background: #fef2f2;
    }

    /* Modal Overlay */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }

    .modal-content {
      background: var(--white);
      border-radius: 20px;
      max-width: 480px;
      width: 100%;
      animation: modalIn 0.25s ease;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }

    .modal-header {
      padding: 24px 28px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .modal-icon {
      font-size: 28px;
    }

    .modal-header h3 {
      font-family: 'Sora', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: var(--navy);
    }

    .modal-body {
      padding: 16px 28px 24px;
    }

    .modal-body p {
      font-size: 14px;
      color: var(--muted);
      line-height: 1.6;
      margin-bottom: 12px;
    }

    .modal-request-info {
      background: var(--bg);
      border-radius: 12px;
      padding: 16px;
      margin: 12px 0;
    }

    .modal-info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }

    .modal-info-row + .modal-info-row {
      border-top: 1px solid var(--border);
    }

    .modal-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .modal-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }

    .modal-warning {
      font-size: 12px;
      color: #ef4444;
      font-weight: 600;
    }

    .modal-footer {
      padding: 20px 28px;
      border-top: 1.5px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    .modal-btn-cancel {
      padding: 10px 20px;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      background: var(--white);
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }

    .modal-btn-cancel:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .modal-btn-delete {
      padding: 10px 20px;
      border: none;
      border-radius: 10px;
      background: #ef4444;
      font-size: 13px;
      font-weight: 600;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }

    .modal-btn-delete:hover:not(:disabled) {
      background: #dc2626;
    }

    .modal-btn-delete:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .modal-spinner {
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    /* Actions column */
    .req-th-actions {
      width: 60px;
    }

    /* Empty State */
    .req-empty {
      text-align: center; padding: 60px 20px;
    }
    .req-empty-icon {
      font-size: 48px; margin-bottom: 16px;
    }
    .req-empty-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight:700;
      color: var(--navy);
      margin-bottom: 6px;
    }
    .req-empty-sub {
      font-size: 14px; color: var(--muted);
    }

    /* Error State */
    .req-error {
      text-align: center; padding: 60px 20px;
    }
    .req-error-icon {
      font-size: 48px; margin-bottom: 16px;
    }
    .req-error-title {
      font-family: 'Sora', sans-serif;
      font-size: 16px; font-weight: 700;
      color: '#ef4444';
      margin-bottom: 12px;
    }
    .req-retry-btn {
      padding: 10px 24px;
      background: var(--navy);
      border: none;
      border-radius: 12px;
      font-size: 14px; font-weight: 600;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
    }

    /* Pagination */
    .req-pagination {
      display: flex; align-items: center; justify-content: center;
      gap: 8px; margin-top: 28px;
    }
    .req-page-btn {
      padding: 9px 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 13px; font-weight: 600;
      color: var(--text);
      font-family: 'Sora', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
    }
    .req-page-btn:hover:not(:disabled) {
      border-color: var(--navy);
      color: var(--navy);
    }
    .req-page-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .req-page-btn-active {
      background: var(--navy);
      border-color: var(--navy);
      color: white;
    }
    .req-page-ellipsis {
      color: var(--muted);
      font-size: 13px;
      padding: 0 4px;
    }

    /* New Request Button */
    .req-new-btn {
      padding: 14px 28px;
      background: #e98404;
      border: none;
      border-radius: 14px;
      font-size: 15px; font-weight: 700;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s;
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .req-new-btn:hover {
      background: #e98404;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,32,96,0.25);
    }

    /* Loading */
    .req-loading {
      min-height: 100vh;
      background: var(--bg);
      display: flex; align-items: center; justify-content: center;
    }
    .req-spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      animation: spin 0.9s linear infinite;
    }

    @media (max-width: 1200px) {
      .req-stats { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 768px) {
      .req-hero { padding: 40px 24px; }
      .req-content { padding: 24px 20px 40px; }
      .req-stats { grid-template-columns: repeat(2, 1fr); }
      .req-table-wrapper { overflow-x: auto; }
      .req-view-toggle { width: 100%; }
      .req-toggle-btn { flex: 1; text-align: center; padding: 12px 16px; }
    }
  `;

  if (loading) {
    return (
      <div className="req-page">
        <style>{sharedCSS}</style>
        <div className="req-loading">
          <div style={{ textAlign: 'center' }}>
            <div className="req-spinner" />
            <div style={{ marginTop: 14, fontSize: 14, color: '#64748b' }}>Loading requests…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="req-page">
      <style>{sharedCSS}</style>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteModal
          request={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      {/* Hero Section */}
      <div className="req-hero">
        <div className="req-hero-inner">
          <div className="req-hero-eyebrow">
            <div className="req-hero-eyebrow-line" />
            Service Catalog
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
            <div>
              <h1>All <em>Requests</em></h1>
              <p className="req-hero-sub">{today} — Browse and manage service requests</p>
            </div>
            <button className="req-new-btn" onClick={() => navigate('/create-request')}>
              + New Request
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="req-content">
        {/* View Toggle */}
        <div className="req-view-toggle">
          <button
            className={`req-toggle-btn ${viewMode === 'my-requests' ? 'req-toggle-btn-active' : ''}`}
            onClick={() => setViewMode('my-requests')}
          >
            👤 My Requests
          </button>
          <button
            className={`req-toggle-btn ${viewMode === 'assigned-to-me' ? 'req-toggle-btn-active' : ''}`}
            onClick={() => setViewMode('assigned-to-me')}
          >
            📋 Assigned to Me
          </button>
        </div>

        {/* Stats */}
        <div className="req-stats">
          {[
            { label: 'Total', value: stats.total, color: '#002060' },
            { label: 'Open', value: stats.open, color: '#e98404' },
            { label: 'Pending Approval', value: stats.pending, color: '#7c3aed' },
            { label: 'Resolved', value: stats.resolved, color: '#10b981' },
            { label: 'High Priority', value: stats.high, color: '#ef4444' },
          ].map((stat, idx) => (
            <div key={idx} className="req-stat-card">
              <div className="req-stat-stripe" style={{ background: stat.color }} />
              <div className="req-stat-value">{stat.value}</div>
              <div className="req-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="req-filters">
          <div className="req-search-wrapper">
            <span className="req-search-icon">🔍</span>
            <input
              className="req-search-input"
              placeholder="Search by number, service, user, or team…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select className="req-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>
                {s === 'all' ? 'All Statuses' : STATUS_CONFIG[s]?.label || s}
              </option>
            ))}
          </select>

          <select className="req-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
            {ALL_PRIORITIES.map(p => (
              <option key={p} value={p}>
                {p === 'all' ? 'All Priorities' : PRIORITY_CONFIG[p]?.label || p}
              </option>
            ))}
          </select>

          <select className="req-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="priority">By Priority</option>
          </select>
        </div>

        {/* Result Meta */}
        <div className="req-result-meta">
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Showing <strong style={{ color: '#002060' }}>{filtered.length}</strong> requests in{' '}
            <strong style={{ color: '#002060' }}>
              {viewMode === 'my-requests' ? 'My Requests' : 'Assigned to Me'}
            </strong>
          </span>
          {(search || statusFilter !== 'all' || priorityFilter !== 'all') && (
            <button
              className="req-clear-btn"
              onClick={() => { setSearch(''); setStatusFilter('all'); setPriorityFilter('all'); }}
            >
              ✕ Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="req-table-wrapper">
          {error ? (
            <div className="req-error">
              <div className="req-error-icon">⚠️</div>
              <div className="req-error-title">{error}</div>
              <button className="req-retry-btn" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          ) : (
            <table className="req-table">
              <thead>
                <tr className="req-thead-row">
                  {['Request #', 'Service', 'Category', 'Priority', 'Raised By', 'Assigned Team', 'Status', 'Created', ''].map(h => (
                    <th key={h} className={`req-th ${h === '' ? 'req-th-actions' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <div className="req-empty">
                        <div className="req-empty-icon">📋</div>
                        <div className="req-empty-title">No requests found</div>
                        <div className="req-empty-sub">
                          {viewMode === 'my-requests' 
                            ? "You haven't created any requests yet" 
                            : "No requests assigned to your groups"}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((req, idx) => (
                    <tr
                      key={req._id}
                      className="req-tbody-row"
                      style={{ animationDelay: `${idx * 30}ms` }}
                      onClick={() => navigate(`/requests/${req._id}`)}
                    >
                      <td className="req-td">
                        <span className="req-number">{req.requestNumber || '—'}</span>
                      </td>
                      <td className="req-td">
                        <span className="req-service-name">{req.service?.name || '—'}</span>
                      </td>
                      <td className="req-td">
                        <span className="req-category">{req.service?.categoryName || '—'}</span>
                      </td>
                      <td className="req-td">
                        <PriorityBadge priority={req.priority} />
                      </td>
                      <td className="req-td">
                        <div className="req-user-cell">
                          <div className="req-user-avatar">
                            {(req.raisedBy?.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="req-user-info">
                            <div className="req-user-name">{req.raisedBy?.name || '—'}</div>
                            <div className="req-user-email">{req.raisedBy?.mail || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="req-td">
                        {req.assignmentGroup?.groupName ? (
                          <div className="req-group-cell">
                            <div className="req-group-avatar">
                              {req.assignmentGroup.groupName.charAt(0).toUpperCase()}
                            </div>
                            <div className="req-group-info">
                              <div className="req-group-name">{req.assignmentGroup.groupName}</div>
                              {req.assignmentGroup.members && req.assignmentGroup.members.length > 0 && (
                                <div className="req-group-sub">
                                  {req.assignmentGroup.members.length} member{req.assignmentGroup.members.length !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="req-unassigned">Unassigned</span>
                        )}
                      </td>
                      <td className="req-td">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="req-td">
                        <div className="req-date-cell">
                          <span className="req-date-main">{formatDate(req.createdAt)}</span>
                          <span className="req-date-rel">{formatRelative(req.createdAt)}</span>
                        </div>
                      </td>
                      <td className="req-td" onClick={e => e.stopPropagation()}>
                        <div className="req-menu-wrapper">
                          <button
                            className="req-menu-btn"
                            onClick={() => setOpenMenuId(openMenuId === req._id ? null : req._id)}
                          >
                            ⋮
                          </button>
                          {openMenuId === req._id && (
                            <div className="req-menu-dropdown">
                              <button
                                className="req-menu-item req-menu-item-delete"
                                onClick={() => {
                                  setDeleteTarget(req);
                                  setOpenMenuId(null);
                                }}
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="req-pagination">
            <button
              className="req-page-btn"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Prev
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`e-${i}`} className="req-page-ellipsis">…</span>
                  ) : (
                    <button
                      key={p}
                      className={`req-page-btn ${page === p ? 'req-page-btn-active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  )
                )}
            </div>

            <button
              className="req-page-btn"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}