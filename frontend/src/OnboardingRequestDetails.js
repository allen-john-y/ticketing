// src/OnboardingFormDetails.js
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function AlertModal({ open, type = 'success', title, message, onClose }) {
  if (!open) return null;
  const c = type === 'error'
    ? { bg: '#fee2e2', title: '#991b1b', border: '#ef4444' }
    : { bg: '#dcfce7', title: '#15803d', border: '#16a34a' };
  return (
    <div className="of-modal-overlay" onClick={onClose}>
      <div className="of-modal" onClick={e => e.stopPropagation()}>
        <div className="of-modal-inner" style={{ borderTop: `4px solid ${c.border}` }}>
          <div className="of-modal-icon" style={{ background: c.bg, color: c.title }}>{type === 'error' ? '⚠' : '✓'}</div>
          {title && <div className="of-modal-title" style={{ color: c.title }}>{title}</div>}
          <div className="of-modal-message">{message}</div>
          <button className="of-btn of-btn-primary" style={{ width: '100%', marginTop: 18 }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  } catch {
    return String(d);
  }
}

function formatDateShort(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function initials(first, last) {
  const a = (first || '').trim()[0] || '';
  const b = (last || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

const STATUS_STYLES = {
  pending_approval: { bg: '#fef3c7', color: '#92400e', border: '#fbbf24', label: 'Pending Approval', icon: '⏳' },
  processing: { bg: '#dbeafe', color: '#1e40af', border: '#60a5fa', label: 'Processing', icon: '🔄' },
  completed: { bg: '#dcfce7', color: '#15803d', border: '#16a34a', label: 'Completed', icon: '✅' },
  rejected: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444', label: 'Rejected', icon: '❌' },
  failed: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444', label: 'Failed', icon: '❌' },
};

const TABS = [
  { id: 'details', label: 'Employee Details', icon: '🪪' },
  { id: 'access', label: 'Access & Groups', icon: '🔐' },
  { id: 'history', label: 'Timeline', icon: '📜' },
];

function OnboardingFormDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts } = useMsal();
  const currentUser = accounts?.[0] || {};
  const currentUserEmail = (currentUser.username || '').toLowerCase();

  const [request, setRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');

  const [showPRModal, setShowPRModal] = useState(false);
  const [prAction, setPrAction] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [prLoading, setPrLoading] = useState(false);
  const [prResult, setPrResult] = useState(null);
  const [prError, setPrError] = useState('');

  const [alertModal, setAlertModal] = useState({ open: false, type: 'success', title: '', message: '' });
  const closeAlert = () => setAlertModal(s => ({ ...s, open: false }));

  const fetchRequest = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/onboarding/${id}`);
      setRequest(res.data);
    } catch (err) {
      console.error('Error fetching onboarding request:', err);
      setRequest(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchRequest(); }, [id]);

  const isApprover1 = request?.approver1?.toLowerCase() === currentUserEmail;
  const isApprover2 = request?.approver2?.toLowerCase() === currentUserEmail;
  const isCreator = request?.createdByEmail?.toLowerCase() === currentUserEmail;

  // Check if user is an approver (either from approver1, approver2, or approvers array)
  const isApproverUser = isApprover1 || isApprover2 || (request?.approvers || []).some(a => {
    const email = a?.email || a?.mail || '';
    return email.toLowerCase() === currentUserEmail;
  });

  // For display/read permissions (creators can view but not approve)
  const canView = isApproverUser || isCreator;

  // For actions (only approvers can act)
  const canAct = isApproverUser;

  const isPendingApproval = request?.status === 'pending_approval';

  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    // Only approvers should see the auto-open modal
    if (!isLoading && request && isApproverUser && isPendingApproval && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      setShowPRModal(true);
      setPrAction(null);
      setPrError('');
      setRejectReason('');
      setAdminNote('');
    }
  }, [isLoading, request, isApproverUser, isPendingApproval]);

  const handleApprove = async () => {
    setPrLoading(true);
    setPrError('');
    try {
      const res = await axios.post(`${BACKEND}/api/onboarding/${id}/approve`, {
        actorEmail: currentUser.username,
        actorName: currentUser.name,
        actorId: currentUser.localAccountId,
        note: adminNote,
      });
      setShowPRModal(false);
      setPrAction(null);
      setAdminNote('');
      await fetchRequest();
      setPrResult({
        type: 'approve',
        password: res.data.password,
        userPrincipalName: res.data.userPrincipalName,
      });
    } catch (err) {
      setPrError(err?.response?.data?.message || 'Approval failed. Please try again.');
    } finally {
      setPrLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { setPrError('Please provide a reason for rejection.'); return; }
    setPrLoading(true);
    setPrError('');
    try {
      await axios.post(`${BACKEND}/api/onboarding/${id}/reject`, {
        actorEmail: currentUser.username,
        actorName: currentUser.name,
        actorId: currentUser.localAccountId,
        reason: rejectReason.trim(),
        note: adminNote,
      });
      setShowPRModal(false);
      setPrAction(null);
      setRejectReason('');
      setAdminNote('');
      await fetchRequest();
      setPrResult({ type: 'rejected' });
    } catch (err) {
      setPrError(err?.response?.data?.message || 'Rejection failed. Please try again.');
    } finally {
      setPrLoading(false);
    }
  };

  const handleCancel = () => {
    setShowPRModal(false);
    setPrAction(null);
    setRejectReason('');
    setAdminNote('');
    setPrError('');
  };

  const closeResultModal = () => {
    setPrResult(null);
    setTimeout(() => navigate('/hr-request', { state: { refresh: true } }), 100);
  };

  const openReviewModal = () => {
    setShowPRModal(true);
    setPrAction(null);
    setPrError('');
    setRejectReason('');
    setAdminNote('');
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --green: #10b981;
      --red: #ef4444;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
      --shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
      --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
    }

    @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes scaleIn { from { transform: scale(0.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes stampIn { from { transform: rotate(-14deg) scale(1.4); opacity: 0; } to { transform: rotate(-10deg) scale(1); opacity: 1; } }
    @keyframes barUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    .of-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Top strip */
    .of-topbar {
      background: var(--navy);
      background-image: linear-gradient(120deg, #002060 0%, #002d82 60%, #003090 100%);
      padding: 18px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .of-topbar-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .of-back-btn {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.18);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      font-family: 'Sora', sans-serif;
      padding: 7px 14px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .of-back-btn:hover { background: rgba(255,255,255,0.2); }
    .of-topbar-title {
      font-family: 'Sora', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.55);
    }
    .of-topbar-title span { color: var(--orange); }
    .of-reqno {
      font-family: 'Sora', sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.05em;
      background: rgba(255,255,255,0.08);
      border: 1px dashed rgba(255,255,255,0.35);
      padding: 6px 12px;
      border-radius: 8px;
    }

    /* Status Banner */
    .of-status-banner {
      max-width: 1240px;
      margin: 24px auto 0;
      padding: 0 40px;
    }
    .of-status-banner-inner {
      background: var(--white);
      border-radius: 16px;
      padding: 16px 24px;
      border-left: 4px solid var(--border);
      box-shadow: var(--shadow);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .of-status-banner-inner.pending { border-left-color: #f59e0b; }
    .of-status-banner-inner.approved { border-left-color: var(--green); }
    .of-status-banner-inner.rejected { border-left-color: var(--red); }
    .of-status-banner-inner.processing { border-left-color: #3b82f6; }
    
    .of-status-banner-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .of-status-banner-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 13px;
    }
    .of-status-banner-meta {
      font-size: 13px;
      color: var(--muted);
    }
    .of-status-banner-meta strong {
      color: var(--text);
      font-weight: 600;
    }

    /* Content shell: badge rail + document pane */
    .of-shell {
      max-width: 1240px;
      margin: 0 auto;
      padding: 24px 40px 96px;
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 28px;
      align-items: start;
    }

    /* Badge card - Simplified without barcode and status stamp */
    .of-badge {
      position: sticky;
      top: 24px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      animation: fadeUp 0.45s ease both;
      box-shadow: var(--shadow);
      transition: box-shadow 0.3s ease;
    }
    .of-badge:hover {
      box-shadow: var(--shadow-lg);
    }
    .of-badge-top {
      background: linear-gradient(135deg, #002060 0%, #0a3a7a 100%);
      padding: 28px 24px 20px;
      position: relative;
      overflow: hidden;
      text-align: center;
    }
    .of-badge-top::after {
      content: '';
      position: absolute;
      right: -30px;
      top: -30px;
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.18) 0%, transparent 70%);
    }
    .of-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(255,255,255,0.12);
      border: 2px solid rgba(255,255,255,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Sora', sans-serif;
      font-size: 24px;
      font-weight: 800;
      color: #fff;
      margin: 0 auto 12px;
      position: relative;
      z-index: 1;
    }
    .of-badge-name {
      font-family: 'Sora', sans-serif;
      font-size: 18px;
      font-weight: 800;
      color: #fff;
      position: relative;
      z-index: 1;
    }
    .of-badge-role {
      font-size: 13px;
      color: rgba(255,255,255,0.68);
      margin-top: 3px;
      position: relative;
      z-index: 1;
    }
    .of-badge-body {
      padding: 20px 24px 24px;
      position: relative;
    }
    .of-badge-body .of-badge-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .of-badge-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .of-badge-row .k {
      color: var(--muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 10.5px;
      flex-shrink: 0;
    }
    .of-badge-row .v {
      color: var(--text);
      font-weight: 600;
      text-align: right;
      word-break: break-word;
    }

    /* Tabs */
    .of-tabs {
      display: flex;
      gap: 4px;
      border-bottom: 1.5px solid var(--border);
      margin-bottom: 24px;
      animation: fadeUp 0.4s ease both;
    }
    .of-tab {
      background: none;
      border: none;
      cursor: pointer;
      padding: 10px 18px 14px;
      font-family: 'Sora', sans-serif;
      font-size: 13.5px;
      font-weight: 700;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 7px;
      border-bottom: 2.5px solid transparent;
      margin-bottom: -1.5px;
      transition: all 0.15s;
    }
    .of-tab:hover { color: var(--navy); }
    .of-tab.active {
      color: var(--navy);
      border-bottom-color: var(--orange);
    }
    .of-tab .of-tab-count {
      background: var(--bg);
      color: var(--muted);
      font-size: 10.5px;
      padding: 1px 7px;
      border-radius: 20px;
      font-weight: 700;
    }
    .of-tab.active .of-tab-count { background: rgba(233,132,4,0.14); color: var(--orange); }

    /* Document panel */
    .of-doc {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      animation: fadeUp 0.4s 0.05s ease both;
      overflow: hidden;
      box-shadow: var(--shadow);
      transition: box-shadow 0.3s ease;
    }
    .of-doc:hover {
      box-shadow: var(--shadow-lg);
    }
    .of-doc-section {
      padding: 24px 28px;
      border-bottom: 1px solid var(--border);
    }
    .of-doc-section:last-child { border-bottom: none; }
    .of-doc-section-title {
      font-family: 'Sora', sans-serif;
      font-size: 11px;
      font-weight: 800;
      color: var(--navy);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .of-doc-section-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    .of-field-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0 24px;
    }
    .of-field {
      padding: 10px 0;
      border-bottom: 1px dotted var(--border);
    }
    .of-field.full { grid-column: 1 / -1; }
    .of-field .k {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      display: block;
      margin-bottom: 3px;
    }
    .of-field .v {
      font-size: 14.5px;
      font-weight: 600;
      color: var(--text);
    }
    .of-field .sub {
      font-size: 12.5px;
      color: var(--muted);
      margin-top: 1px;
    }

    .of-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 2px;
    }
    .of-chip {
      padding: 5px 14px;
      background: rgba(0,32,96,0.05);
      border: 1.5px solid rgba(0,32,96,0.12);
      border-radius: 30px;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--navy);
    }

    .of-notes {
      padding: 16px 18px;
      background: var(--bg);
      border-left: 3px solid var(--orange);
      border-radius: 8px;
      font-size: 13.5px;
      line-height: 1.7;
      white-space: pre-wrap;
    }

    /* Approval rule row */
    .of-approval-flow {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .of-approval-node {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 10px;
      background: var(--light);
      border: 1.5px solid var(--border);
      font-size: 12.5px;
      font-weight: 600;
    }
    .of-approval-node.done { background: rgba(16,185,129,0.08); border-color: #86efac; color: #065f46; }
    .of-approval-arrow { color: var(--muted); font-size: 13px; }
    .of-approval-rule-badge {
      font-family: 'Sora', sans-serif;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--orange);
      background: rgba(233,132,4,0.1);
      padding: 3px 10px;
      border-radius: 20px;
    }

    /* Timeline */
    .of-timeline { position: relative; padding-left: 22px; }
    .of-timeline::before {
      content: '';
      position: absolute;
      left: 5px;
      top: 6px;
      bottom: 6px;
      width: 2px;
      background: var(--border);
    }
    .of-tl-item { position: relative; padding-bottom: 22px; }
    .of-tl-item:last-child { padding-bottom: 0; }
    .of-tl-dot {
      position: absolute;
      left: -22px;
      top: 3px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2.5px solid var(--white);
      box-shadow: 0 0 0 1.5px currentColor;
    }
    .of-tl-action {
      font-family: 'Sora', sans-serif;
      font-size: 13.5px;
      font-weight: 700;
      text-transform: capitalize;
    }
    .of-tl-notes { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
    .of-tl-meta { font-size: 11.5px; color: var(--muted); margin-top: 4px; }

    /* Empty / locked states */
    .of-empty {
      text-align: center;
      padding: 32px 20px;
      color: var(--muted);
    }
    .of-empty .icon { font-size: 30px; margin-bottom: 8px; }
    .of-empty .t1 { font-size: 13.5px; font-weight: 700; color: var(--text); }
    .of-empty .t2 { font-size: 12.5px; margin-top: 3px; }

    /* Floating action bar */
    .of-actionbar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 500;
      background: var(--white);
      border-top: 1.5px solid var(--border);
      box-shadow: 0 -8px 24px rgba(15,23,42,0.08);
      animation: barUp 0.3s ease-out both;
    }
    .of-actionbar-inner {
      max-width: 1240px;
      margin: 0 auto;
      padding: 14px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .of-actionbar-msg {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13.5px;
      color: var(--text);
      font-weight: 600;
    }
    .of-actionbar-msg .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f59e0b;
      flex-shrink: 0;
      box-shadow: 0 0 0 4px rgba(245,158,11,0.15);
      animation: pulse 2s infinite;
    }
    .of-actionbar-btns { display: flex; gap: 10px; }

    /* Buttons */
    .of-btn {
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 13.5px;
      font-weight: 700;
      font-family: 'Sora', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .of-btn-primary { background: var(--navy); color: white; }
    .of-btn-primary:hover:not(:disabled) { background: var(--navy2); transform: translateY(-1px); }
    .of-btn-success { background: var(--green); color: white; }
    .of-btn-success:hover:not(:disabled) { background: #059669; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16,185,129,0.3); }
    .of-btn-danger { background: var(--red); color: white; }
    .of-btn-danger:hover:not(:disabled) { background: #dc2626; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239,68,68,0.3); }
    .of-btn-secondary { background: var(--bg); color: var(--text); border: 1.5px solid var(--border); }
    .of-btn-secondary:hover { border-color: var(--navy); color: var(--navy); }
    .of-btn-warning { background: #f59e0b; color: white; }
    .of-btn-warning:hover:not(:disabled) { background: #d97706; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(245,158,11,0.3); }
    .of-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Loading */
    .of-loading { min-height: 100vh; background: var(--bg); display: flex; align-items: center; justify-content: center; }
    .of-spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid var(--border); border-top-color: var(--navy);
      animation: spin 0.9s linear infinite; margin: 0 auto 14px;
    }

    /* Info Cards */
    .of-info-card {
      background: var(--bg);
      border-radius: 12px;
      padding: 16px 20px;
      margin-top: 12px;
      border: 1px solid var(--border);
    }
    .of-info-card .label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      display: block;
      margin-bottom: 4px;
    }
    .of-info-card .value {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
    }

    /* Modals */
    .of-modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 24px;
    }
    .of-modal { background: var(--white); border-radius: 20px; max-width: 480px; width: 100%; max-height: 90vh; overflow: hidden; animation: slideUp 0.2s ease; }
    .of-modal-inner { padding: 32px 28px 28px; text-align: center; }
    .of-modal-icon { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 14px; }
    .of-modal-title { font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 700; margin-bottom: 6px; }
    .of-modal-message { font-size: 14px; color: var(--muted); line-height: 1.6; }

    /* PR Modal - Updated with better design */
    .of-pr-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 24px;
    }
    .of-pr-modal {
      background: var(--white); border-radius: 24px; max-width: 640px; width: 100%; overflow: hidden;
      animation: scaleIn 0.22s ease both; box-shadow: 0 24px 80px rgba(0,0,0,0.25);
      max-height: 90vh; display: flex; flex-direction: column;
    }
    .of-pr-header { 
      padding: 28px 32px; 
      background: linear-gradient(135deg, #002060 0%, #003090 100%); 
      flex-shrink: 0;
    }
    .of-pr-header h2 { 
      font-family: 'Sora', sans-serif; 
      font-size: 20px; 
      font-weight: 800; 
      color: white; 
      display: flex; 
      align-items: center; 
      gap: 10px; 
    }
    .of-pr-header p { 
      font-size: 13px; 
      color: rgba(255,255,255,0.75); 
      margin-top: 6px; 
      line-height: 1.5; 
    }
    .of-pr-body { 
      padding: 28px 32px; 
      overflow-y: auto; 
      flex: 1; 
    }
    .of-pr-section { 
      margin-bottom: 20px; 
      padding-bottom: 20px; 
      border-bottom: 1px dashed var(--border); 
    }
    .of-pr-section:last-of-type { 
      border-bottom: none; 
      margin-bottom: 0; 
      padding-bottom: 0; 
    }
    .of-pr-section-title {
      font-family: 'Sora', sans-serif; 
      font-size: 11px; 
      font-weight: 700; 
      letter-spacing: 0.1em;
      color: var(--muted); 
      text-transform: uppercase; 
      margin-bottom: 12px; 
      display: flex; 
      align-items: center; 
      gap: 6px;
    }
    .of-pr-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 16px;
    }
    .of-pr-row { 
      display: flex; 
      justify-content: space-between; 
      align-items: flex-start; 
      padding: 6px 0; 
      gap: 16px; 
    }
    .of-pr-row .label { 
      font-size: 13px; 
      color: var(--muted); 
      font-weight: 500; 
      flex-shrink: 0; 
    }
    .of-pr-row .value { 
      font-size: 13px; 
      color: var(--text); 
      font-weight: 600; 
      text-align: right; 
    }
    .of-pr-warning {
      background: #fef3c7; 
      border: 1px solid #fbbf24; 
      border-radius: 10px; 
      padding: 12px 14px; 
      margin-bottom: 20px;
      font-size: 13px; 
      color: #92400e; 
      line-height: 1.5; 
      display: flex; 
      gap: 10px; 
      align-items: flex-start;
    }
    .of-pr-textarea {
      width: 100%; 
      padding: 10px 14px; 
      border: 1.5px solid var(--border); 
      border-radius: 10px;
      font-size: 13px; 
      font-family: 'Lato', sans-serif; 
      color: var(--text); 
      resize: vertical;
      transition: border-color 0.2s;
    }
    .of-pr-textarea:focus { 
      outline: none; 
      border-color: var(--navy); 
      box-shadow: 0 0 0 3px rgba(0,32,96,0.1); 
    }
    .of-pr-actions { 
      display: flex; 
      gap: 10px; 
      margin-top: 20px; 
      flex-wrap: wrap; 
    }
    .of-pr-error { 
      padding: 10px 14px; 
      background: #fee2e2; 
      border: 1px solid #fca5a5; 
      border-radius: 10px; 
      font-size: 13px; 
      color: #991b1b; 
      margin-top: 12px; 
    }
    .of-pr-btn {
      padding: 11px 22px; 
      border-radius: 12px; 
      font-size: 14px; 
      font-weight: 700; 
      font-family: 'Sora', sans-serif;
      cursor: pointer; 
      border: none; 
      transition: all 0.2s; 
      display: inline-flex; 
      align-items: center; 
      gap: 8px;
    }
    .of-pr-btn:disabled { 
      opacity: 0.6; 
      cursor: not-allowed; 
    }
    .of-pr-btn-approve { 
      background: #16a34a; 
      color: white; 
      flex: 1; 
      justify-content: center; 
    }
    .of-pr-btn-approve:hover:not(:disabled) { 
      background: #15803d; 
      transform: translateY(-1px); 
    }
    .of-pr-btn-reject { 
      background: #dc2626; 
      color: white; 
      flex: 1; 
      justify-content: center; 
    }
    .of-pr-btn-reject:hover:not(:disabled) { 
      background: #b91c1c; 
      transform: translateY(-1px); 
    }
    .of-pr-btn-cancel { 
      background: var(--bg); 
      color: var(--text); 
      border: 1.5px solid var(--border); 
    }
    .of-pr-btn-cancel:hover { 
      border-color: var(--navy); 
    }
    .of-pr-btn-back { 
      background: var(--bg); 
      color: var(--text); 
      border: 1.5px solid var(--border); 
    }
    .of-pr-btn-back:hover { 
      border-color: var(--navy); 
    }

    /* Result Modal */
    .of-result-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center; z-index: 10000; padding: 24px;
    }
    .of-result-modal { background: var(--white); border-radius: 24px; max-width: 480px; width: 100%; overflow: hidden; animation: scaleIn 0.22s ease both; box-shadow: 0 24px 80px rgba(0,0,0,0.3); }
    .of-result-header { padding: 28px 32px; }
    .of-result-header-approve { background: linear-gradient(135deg, #15803d 0%, #16a34a 100%); }
    .of-result-header-reject { background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%); }
    .of-result-header h2 { font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; color: white; }
    .of-result-header p { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 4px; }
    .of-result-body { padding: 28px 32px; }
    .of-result-password { background: #f0fdf4; border: 2px solid #86efac; border-radius: 14px; padding: 20px; margin-bottom: 20px; text-align: center; }
    .of-result-password .label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #16a34a; letter-spacing: 0.08em; margin-bottom: 8px; }
    .of-result-password .password { font-family: 'DM Mono', 'Courier New', monospace; font-size: 24px; font-weight: 700; color: #15803d; letter-spacing: 0.06em; word-break: break-all; }
    .of-result-password .note { font-size: 12px; color: #64748b; margin-top: 8px; }
    .of-result-info { font-size: 13px; color: var(--muted); line-height: 2; margin-bottom: 24px; }
    .of-result-actions { display: flex; gap: 12px; }
    .of-result-btn { flex: 1; padding: 12px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; border: none; transition: all 0.2s; }
    .of-result-btn-copy { background: var(--bg); color: var(--text); border: 1.5px solid var(--border); }
    .of-result-btn-copy:hover { border-color: var(--navy); color: var(--navy); }
    .of-result-btn-done { background: var(--navy); color: white; }
    .of-result-btn-done:hover { background: var(--navy2); transform: translateY(-1px); }

    /* Responsive */
    @media (max-width: 960px) {
      .of-shell { grid-template-columns: 1fr; }
      .of-badge { position: static; }
      .of-status-banner { padding: 0 20px; }
      .of-pr-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .of-topbar { padding: 16px 20px; }
      .of-shell { padding: 20px 16px 96px; }
      .of-field-grid { grid-template-columns: 1fr; }
      .of-actionbar-inner { padding: 14px 20px; flex-direction: column; align-items: stretch; }
      .of-actionbar-btns { width: 100%; }
      .of-actionbar-btns .of-btn { flex: 1; }
      .of-result-actions, .of-pr-actions { flex-direction: column; }
      .of-pr-btn { width: 100%; justify-content: center; }
      .of-status-banner-inner { flex-direction: column; align-items: stretch; text-align: center; }
      .of-pr-grid { grid-template-columns: 1fr; }
    }
  `;

  if (isLoading) {
    return (
      <div className="of-page">
        <style>{sharedCSS}</style>
        <div className="of-loading">
          <div style={{ textAlign: 'center' }}>
            <div className="of-spinner" />
            <div style={{ fontSize: 14, color: '#64748b' }}>Loading onboarding request…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="of-page">
        <style>{sharedCSS}</style>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 48 }}>🚫</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#64748b' }}>Onboarding request not found</div>
          <button className="of-btn of-btn-secondary" onClick={() => navigate('/hr-request')}>← Back to HR Requests</button>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[request.status] || STATUS_STYLES.pending_approval;
  const groupNames = (request.selectedGroups || []).map(g => g?.name || g).filter(Boolean);
  const historyEvents = request.history?.length > 0
    ? [...request.history].reverse()
    : [{ action: 'created', by: request.createdByName, at: request.createdAt }];

  const personalEmail = request.otherEmail || request.personalEmail || '—';
  const workEmail = request.userPrincipalName || `${request.emailPrefix}@${process.env.REACT_APP_COMPANY_DOMAIN || 'company.com'}`;
  const reportingName = request.reportingTo?.name || request.onboarding?.reportingTo?.name || '—';
  const reportingEmail = request.reportingTo?.email || request.onboarding?.reportingTo?.email;

  // Only approvers see the action bar
  const showActionBar = isApproverUser && isPendingApproval;

  const getBannerClass = () => {
    if (request.status === 'pending_approval') return 'pending';
    if (request.status === 'completed') return 'approved';
    if (request.status === 'rejected' || request.status === 'failed') return 'rejected';
    if (request.status === 'processing') return 'processing';
    return '';
  };

  return (
    <div className="of-page">
      <style>{sharedCSS}</style>

      <AlertModal open={alertModal.open} type={alertModal.type} title={alertModal.title} message={alertModal.message} onClose={closeAlert} />

      {/* Topbar */}
      <div className="of-topbar">
        <div className="of-topbar-left">
          <button className="of-back-btn" onClick={() => navigate('/hr-request')}>← Back</button>
          <div className="of-topbar-title">Onboarding</div>
        </div>
        <div className="of-reqno">{request.requestNumber}</div>
      </div>

      {/* Status Banner */}
      <div className="of-status-banner">
        <div className={`of-status-banner-inner ${getBannerClass()}`}>
          <div className="of-status-banner-left">
            <span className={`of-status-banner-status`} style={{ background: statusStyle.bg, color: statusStyle.color }}>
              {statusStyle.icon} {statusStyle.label}
            </span>
            <span className="of-status-banner-meta">
              Created by <strong>{request.createdByName || '—'}</strong> on <strong>{formatDateShort(request.createdAt)}</strong>
            </span>
          </div>
          <div className="of-status-banner-meta">
            {request.status === 'pending_approval' && '⏳ Awaiting review'}
            {request.status === 'completed' && `✅ Completed on ${formatDateShort(request.approvedAt || request.updatedAt)}`}
            {request.status === 'rejected' && '❌ Request was rejected'}
            {request.status === 'processing' && '🔄 In progress'}
          </div>
        </div>
      </div>

      <div className="of-shell">
        {/* Badge rail - Simplified without barcode and status stamp */}
        <div className="of-badge">
          <div className="of-badge-top">
            <div className="of-avatar">{initials(request.firstName, request.lastName)}</div>
            <div className="of-badge-name">{request.firstName} {request.lastName}</div>
            <div className="of-badge-role">{request.jobTitle}</div>
          </div>
          <div className="of-badge-body">
            <div className="of-badge-row">
              <span className="k">Employee ID</span>
              <span className="v">{request.employeeId || '—'}</span>
            </div>
            <div className="of-badge-row">
              <span className="k">Department</span>
              <span className="v">{request.department || '—'}</span>
            </div>
            <div className="of-badge-row">
              <span className="k">Location</span>
              <span className="v" style={{ textTransform: 'capitalize' }}>{request.workLocation || '—'}</span>
            </div>
            <div className="of-badge-row">
              <span className="k">Created</span>
              <span className="v">{formatDateShort(request.createdAt)}</span>
            </div>
            <div className="of-badge-row">
              <span className="k">Work Email</span>
              <span className="v" style={{ fontSize: '12px' }}>{workEmail}</span>
            </div>
          </div>
        </div>

        {/* Document pane */}
        <div>
          <div className="of-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`of-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                <span>{t.icon}</span> {t.label}
                {t.id === 'access' && groupNames.length > 0 && <span className="of-tab-count">{groupNames.length}</span>}
                {t.id === 'history' && <span className="of-tab-count">{historyEvents.length}</span>}
              </button>
            ))}
          </div>

          <div className="of-doc">
            {activeTab === 'details' && (
              <>
                <div className="of-doc-section">
                  <div className="of-doc-section-title">👤 Personal Information</div>
                  <div className="of-field-grid">
                    <div className="of-field">
                      <span className="k">Full Name</span>
                      <span className="v">{request.firstName} {request.lastName}</span>
                    </div>
                    <div className="of-field">
                      <span className="k">Employee ID</span>
                      <span className="v">{request.employeeId || '—'}</span>
                    </div>
                    <div className="of-field">
                      <span className="k">Personal Email</span>
                      <span className="v">{personalEmail}</span>
                    </div>
                    <div className="of-field">
                      <span className="k">Work Email</span>
                      <span className="v" style={{ fontSize: '13px' }}>{workEmail}</span>
                    </div>
                    <div className="of-field">
                      <span className="k">Phone Number</span>
                      <span className="v">{request.phoneNumber || '—'}</span>
                    </div>
                    <div className="of-field">
                      <span className="k">Work Location</span>
                      <span className="v" style={{ textTransform: 'capitalize' }}>{request.workLocation || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="of-doc-section">
                  <div className="of-doc-section-title">💼 Employment Details</div>
                  <div className="of-field-grid">
                    <div className="of-field">
                      <span className="k">Job Title</span>
                      <span className="v">{request.jobTitle}</span>
                    </div>
                    <div className="of-field">
                      <span className="k">Department</span>
                      <span className="v">{request.department}</span>
                    </div>
                    <div className="of-field full">
                      <span className="k">Reporting Manager</span>
                      <span className="v">{reportingName}</span>
                      {reportingEmail && <div className="sub">📧 {reportingEmail}</div>}
                    </div>
                  </div>
                </div>

                {request.additionalNotes && (
                  <div className="of-doc-section">
                    <div className="of-doc-section-title">📝 Additional Notes</div>
                    <div className="of-notes">{request.additionalNotes}</div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'access' && (
              <>
                <div className="of-doc-section">
                  <div className="of-doc-section-title">🔐 Account Details</div>
                  <div className="of-field-grid">
                    <div className="of-field full">
                      <span className="k">Work Email (UPN)</span>
                      <span className="v" style={{ fontSize: '14px' }}>{workEmail}</span>
                    </div>
                    <div className="of-field">
                      <span className="k">Account Status</span>
                      <span className="v">
                        {request.azureUserCreated ? (
                          <span style={{ color: '#16a34a' }}>✅ Provisioned</span>
                        ) : (
                          <span style={{ color: '#f59e0b' }}>⏳ Pending</span>
                        )}
                      </span>
                    </div>
                    {request.azureUserCreated && request.approvedAt && (
                      <div className="of-field">
                        <span className="k">Provisioned On</span>
                        <span className="v">{formatDateShort(request.approvedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="of-doc-section">
                  <div className="of-doc-section-title">👥 Security Groups</div>
                  <div className="of-info-card">
                    <span className="label">Requested Groups ({groupNames.length})</span>
                    <div className="of-chips" style={{ marginTop: '8px' }}>
                      {groupNames.length > 0 ? groupNames.map((g, i) => <span key={i} className="of-chip">{g}</span>) : <span style={{ color: 'var(--muted)', fontSize: 13 }}>No groups requested</span>}
                    </div>
                  </div>
                </div>

                <div className="of-doc-section">
                  <div className="of-doc-section-title">⚖️ Approval Workflow</div>
                  <div className="of-approval-flow">
                    <div className={`of-approval-node ${request.approvedBy?.email && (request.approvedBy.email.toLowerCase() === request.approver1?.toLowerCase()) ? 'done' : ''}`}>
                      {request.approvedBy?.email && request.approvedBy.email.toLowerCase() === request.approver1?.toLowerCase() ? '✅' : '👤'} {request.approver1 || 'Approver 1'}
                    </div>
                    {request.approver2 && (
                      <>
                        <span className="of-approval-arrow">{request.approvalType === 'both' ? '+' : '/'}</span>
                        <div className={`of-approval-node ${request.approvedBy?.email && (request.approvedBy.email.toLowerCase() === request.approver2?.toLowerCase()) ? 'done' : ''}`}>
                          {request.approvedBy?.email && request.approvedBy.email.toLowerCase() === request.approver2?.toLowerCase() ? '✅' : '👤'} {request.approver2}
                        </div>
                      </>
                    )}
                    <span className="of-approval-rule-badge">{request.approvalType === 'both' ? 'Both required' : 'Either approver'}</span>
                  </div>

                  {request.approvedBy?.email && (
                    <div className="of-info-card" style={{ borderColor: '#86efac', background: 'rgba(16,185,129,0.05)' }}>
                      <span className="label" style={{ color: '#16a34a' }}>✅ Approved By</span>
                      <div className="value">{request.approvedBy.name}</div>
                      <div className="sub">{formatDate(request.approvedAt)}</div>
                    </div>
                  )}

                  {request.status === 'rejected' && (
                    <div className="of-info-card" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.05)' }}>
                      <span className="label" style={{ color: '#dc2626' }}>❌ Rejection Reason</span>
                      <div className="value" style={{ color: '#dc2626' }}>{request.rejectionReason}</div>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'history' && (
              <div className="of-doc-section">
                <div className="of-doc-section-title">📜 Activity Timeline</div>
                <div className="of-timeline">
                  {historyEvents.map((event, idx) => {
                    const dotColor = event.action === 'approved' || event.action === 'completed' ? '#10b981'
                      : event.action === 'rejected' || event.action === 'failed' ? '#ef4444'
                      : event.action === 'warning' ? '#f59e0b'
                      : '#e98404';
                    return (
                      <div className="of-tl-item" key={idx}>
                        <div className="of-tl-dot" style={{ color: dotColor, background: dotColor }} />
                        <div className="of-tl-action">{event.action}</div>
                        {event.notes && <div className="of-tl-notes">{event.notes}</div>}
                        <div className="of-tl-meta">{event.by} · {formatDate(event.at)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isPendingApproval && !isApproverUser && activeTab === 'details' && (
              <div className="of-doc-section">
                <div className="of-empty">
                  <div className="icon">🔒</div>
                  <div className="t1">Awaiting Approval</div>
                  <div className="t2">You are not an approver for this request.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating action bar - Only approvers see this */}
      {showActionBar && (
        <div className="of-actionbar">
          <div className="of-actionbar-inner">
            <div className="of-actionbar-msg">
              <span className="dot" /> 
              <span>This request is awaiting your review.</span>
            </div>
            <div className="of-actionbar-btns">
              <button className="of-btn of-btn-warning" onClick={openReviewModal}>
                📋 Review Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve/Reject Modal - Updated with better design */}
      {showPRModal && (
        <div className="of-pr-overlay" onClick={handleCancel}>
          <div className="of-pr-modal" onClick={e => e.stopPropagation()}>
            <div className="of-pr-header">
              <h2><span>📋</span> Review Onboarding Request</h2>
              <p>Please review the details below and take appropriate action</p>
            </div>
            <div className="of-pr-body">
              <div className="of-pr-section">
                <div className="of-pr-section-title"><span>📋</span> Request Details</div>
                <div className="of-pr-grid">
                  <div className="of-pr-row"><span className="label">Request Number:</span><span className="value">{request.requestNumber}</span></div>
                  <div className="of-pr-row"><span className="label">Created:</span><span className="value">{formatDate(request.createdAt)}</span></div>
                  <div className="of-pr-row"><span className="label">Created By:</span><span className="value">{request.createdByName}</span></div>
                  <div className="of-pr-row"><span className="label">Status:</span><span className="value" style={{ color: statusStyle.color }}>{statusStyle.icon} {statusStyle.label}</span></div>
                </div>
              </div>
              <div className="of-pr-section">
                <div className="of-pr-section-title"><span>👤</span> New Hire Information</div>
                <div className="of-pr-grid">
                  <div className="of-pr-row"><span className="label">Full Name:</span><span className="value">{request.firstName} {request.lastName}</span></div>
                  <div className="of-pr-row"><span className="label">Job Title:</span><span className="value">{request.jobTitle}</span></div>
                  <div className="of-pr-row"><span className="label">Department:</span><span className="value">{request.department}</span></div>
                  <div className="of-pr-row"><span className="label">Work Email:</span><span className="value" style={{ fontSize: '12px' }}>{workEmail}</span></div>
                  <div className="of-pr-row"><span className="label">Personal Email:</span><span className="value" style={{ fontSize: '12px' }}>{personalEmail}</span></div>
                  <div className="of-pr-row"><span className="label">Reporting Manager:</span><span className="value">{reportingName}</span></div>
                </div>
              </div>
              {groupNames.length > 0 && (
                <div className="of-pr-section">
                  <div className="of-pr-section-title"><span>👥</span> Azure Groups</div>
                  <div className="of-pr-row"><span className="label">Groups:</span><span className="value" style={{ fontSize: '12px' }}>{groupNames.join(', ')}</span></div>
                </div>
              )}
              <div className="of-pr-warning">
                <span>⚠️</span>
                <span>Approving will immediately create the Azure AD account, add it to the groups above, and email the login credentials to <strong>{personalEmail}</strong>.</span>
              </div>
              <textarea 
                className="of-pr-textarea" 
                placeholder="Add an optional note for the employee or other approvers..." 
                value={adminNote} 
                onChange={(e) => setAdminNote(e.target.value)} 
                rows={2} 
              />
              {prAction === 'reject' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#dc2626' }}>Reason for rejection <span style={{ color: '#ef4444' }}>*</span></div>
                  <textarea 
                    className="of-pr-textarea" 
                    placeholder="Please provide a clear reason for rejecting this request..." 
                    value={rejectReason} 
                    onChange={(e) => setRejectReason(e.target.value)} 
                    rows={3} 
                    autoFocus 
                  />
                </div>
              )}
              {prError && <div className="of-pr-error">⚠ {prError}</div>}
              
              {!prAction ? (
                <div className="of-pr-actions">
                  <button className="of-pr-btn of-pr-btn-approve" onClick={() => setPrAction('approve')}>
                    ✅ Approve
                  </button>
                  <button className="of-pr-btn of-pr-btn-reject" onClick={() => setPrAction('reject')}>
                    ❌ Reject
                  </button>
                  <button className="of-pr-btn of-pr-btn-cancel" onClick={handleCancel}>
                    ✕ Cancel
                  </button>
                </div>
              ) : (
                <div className="of-pr-actions">
                  {prAction === 'approve' ? (
                    <button className="of-pr-btn of-pr-btn-approve" onClick={handleApprove} disabled={prLoading}>
                      {prLoading ? <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Processing...</> : '✅ Confirm Approve'}
                    </button>
                  ) : (
                    <button className="of-pr-btn of-pr-btn-reject" onClick={handleReject} disabled={prLoading}>
                      {prLoading ? <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Processing...</> : '❌ Confirm Reject'}
                    </button>
                  )}
                  <button 
                    className="of-pr-btn of-pr-btn-back" 
                    onClick={() => { setPrAction(null); setRejectReason(''); setPrError(''); }} 
                    disabled={prLoading}
                  >
                    ← Back
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Result: Approved */}
      {prResult?.type === 'approve' && (
        <div className="of-result-overlay">
          <div className="of-result-modal">
            <div className="of-result-header of-result-header-approve">
              <h2>✓ Account Created</h2>
              <p>The employee's Azure AD account has been provisioned</p>
            </div>
            <div className="of-result-body">
              <div className="of-result-password">
                <div className="label">Temporary Password</div>
                <div className="password">{prResult.password}</div>
                <div className="note">Emailed to <strong>{personalEmail}</strong></div>
              </div>
              <div className="of-result-info">
                Work Email: <strong>{prResult.userPrincipalName}</strong><br />
                Groups: <strong>{groupNames.join(', ') || '—'}</strong>
              </div>
              <div className="of-result-actions">
                <button className="of-result-btn of-result-btn-copy" onClick={() => navigator.clipboard.writeText(prResult.password || '')}>📋 Copy Password</button>
                <button className="of-result-btn of-result-btn-done" onClick={closeResultModal}>✅ Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result: Rejected */}
      {prResult?.type === 'reject' && (
        <div className="of-result-overlay">
          <div className="of-result-modal">
            <div className="of-result-header of-result-header-reject">
              <h2>✕ Request Rejected</h2>
              <p>The onboarding request has been rejected</p>
            </div>
            <div className="of-result-body">
              <div className="of-result-info">The requester and other approvers have been notified.</div>
              <div className="of-result-actions">
                <button className="of-result-btn of-result-btn-done" style={{ flex: 1 }} onClick={closeResultModal}>✅ Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OnboardingFormDetails;