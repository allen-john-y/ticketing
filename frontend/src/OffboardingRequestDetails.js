// src/OffboardingRequestDetails.js
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
    <div className="ofb-modal-overlay" onClick={onClose}>
      <div className="ofb-modal" onClick={e => e.stopPropagation()}>
        <div className="ofb-modal-inner" style={{ borderTop: `4px solid ${c.border}` }}>
          <div className="ofb-modal-icon" style={{ background: c.bg, color: c.title }}>{type === 'error' ? '⚠' : '✓'}</div>
          {title && <div className="ofb-modal-title" style={{ color: c.title }}>{title}</div>}
          <div className="ofb-modal-message">{message}</div>
          <button className="ofb-btn ofb-btn-primary" style={{ width: '100%', marginTop: 18 }} onClick={onClose}>Close</button>
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

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  const a = parts[0]?.[0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase() || '?';
}

// NOTE: these five map 1:1 to offboardingRequestSchema.status in server.js.
// There is no separate "RM Approved" / "IT Approved" / "Fully Approved" status
// on the backend — stage-by-stage progress lives in request.stages[], not in
// a distinct top-level status. This page reads that progress from `stages`.
const STATUS_STYLES = {
  pending_approval: { bg: '#fef3c7', color: '#92400e', border: '#fbbf24', label: 'Pending Approval', icon: '⏳' },
  approved_awaiting_schedule: { bg: '#dbeafe', color: '#1e40af', border: '#60a5fa', label: 'Approved · Awaiting Schedule', icon: '🗓️' },
  completed: { bg: '#dcfce7', color: '#15803d', border: '#16a34a', label: 'Completed', icon: '✅' },
  rejected: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444', label: 'Rejected', icon: '❌' },
  failed: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444', label: 'Execution Failed', icon: '⚠️' },
  cancelled: { bg: '#e5e7eb', color: '#4b5563', border: '#9ca3af', label: 'Cancelled', icon: '🚫' },
};

const STAGE_ICON = { manager: '👔', it: '💻', hr: '🧑\u200d💼' };

const TABS = [
  { id: 'details', label: 'Employee Details', icon: '🪪' },
  { id: 'approvals', label: 'Approval Stages', icon: '⚖️' },
  { id: 'history', label: 'Timeline', icon: '📜' },
];

// The 13-step sequential execution the process diagram specifies. The
// backend currently only automates step 1 (Disable Account / Delete Account
// via Graph API) inside executeOffboardingAction — everything else here is
// shown as the planned sequence, not as something the system has done.
// Keeping this visible (rather than faking per-step statuses the backend
// doesn't track) is intentional: it's a roadmap, not a report.
const EXECUTION_PLAN = [
  'Disable Account',
  'Block Sign-In',
  'Revoke Sessions',
  'Remove Azure AD Groups',
  'Remove Licenses',
  'Configure Mail Forwarding',
  'Configure Out-of-Office',
  'Block Mailbox Access',
  'IT Asset Collection',
  'HR Exit Interview',
  'Final Settlement',
  'Generate Relieving Letter',
  'Update Payroll',
];

function OffboardingRequestDetails() {
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

  // Reminder state
  const [remindLoading, setRemindLoading] = useState(false);
  const [remindResult, setRemindResult] = useState(null);

  // Cancel schedule state
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [alertModal, setAlertModal] = useState({ open: false, type: 'success', title: '', message: '' });
  const closeAlert = () => setAlertModal(s => ({ ...s, open: false }));

  const fetchRequest = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/offboarding/${id}`);
      setRequest(res.data);

       // 🔍 DEBUG: Log the fetched request data
    console.log('🔍 [FETCHED REQUEST]', {
      id: res.data._id,
      requestNumber: res.data.requestNumber,
      status: res.data.status,
      scheduleType: res.data.scheduleType,
      createdByEmail: res.data.createdByEmail,
      createdAt: res.data.createdAt,
      currentStage: res.data.currentStage,
      stages: res.data.stages?.map(s => ({ stage: s.stage, label: s.label, status: s.status })),
    });
    } catch (err) {
      console.error('Error fetching offboarding request:', err);
      setRequest(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchRequest();
    console.log('🔍 [USEFFECT] Current user email:', currentUserEmail);
   }, [id]);

  const isPendingApproval = request?.status === 'pending_approval';
  const currentStage = request?.stages?.[(request?.currentStage || 1) - 1] || null;

  // Authorization is decided by the backend (GET /can-act), not re-derived
  // here. An approver on a stage can be an individual OR an AAD group (e.g.
  // "IT Operations"), and resolving group membership requires a Graph call
  // the frontend has no business making directly — so we ask the server,
  // which runs the same isAuthorizedForStage() logic used to gate the
  // actual approve/reject calls.
  const [canAct, setCanAct] = useState(false);
  const [canActLoading, setCanActLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!id || !currentUserEmail) {
      setCanAct(false);
      setCanActLoading(false);
      return;
    }
    setCanActLoading(true);
    axios.get(`${BACKEND}/api/offboarding/${id}/can-act`, { params: { email: currentUserEmail } })
      .then(res => { if (!cancelled) setCanAct(!!res.data?.canAct); })
      .catch(() => { if (!cancelled) setCanAct(false); })
      .finally(() => { if (!cancelled) setCanActLoading(false); });
    return () => { cancelled = true; };
  }, [id, currentUserEmail, request?.currentStage, request?.status]);

  const isCreator = (request?.createdByEmail || '').toLowerCase() === currentUserEmail;
  const canView = canAct || isCreator;

  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!isLoading && request && canAct && isPendingApproval && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      setShowPRModal(true);
      setPrAction(null);
      setPrError('');
      setRejectReason('');
      setAdminNote('');
    }
  }, [isLoading, request, canAct, isPendingApproval]);

  const handleApprove = async () => {
    setPrLoading(true);
    setPrError('');
    try {
      const res = await axios.post(`${BACKEND}/api/offboarding/${id}/approve`, {
        actorEmail: currentUser.username,
        actorName: currentUser.name,
        actorId: currentUser.localAccountId,
        comment: adminNote,
      });
      setShowPRModal(false);
      setPrAction(null);
      setAdminNote('');
      await fetchRequest();
      setPrResult({ type: 'approve', message: res.data.message, scheduledAt: res.data.scheduledAt });
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
      await axios.post(`${BACKEND}/api/offboarding/${id}/reject`, {
        actorEmail: currentUser.username,
        actorName: currentUser.name,
        reason: rejectReason.trim(),
      });
      setShowPRModal(false);
      setPrAction(null);
      setRejectReason('');
      setAdminNote('');
      await fetchRequest();
      setPrResult({ type: 'reject' });
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

  // ==================== CANCEL SCHEDULE HANDLER ====================
  const handleCancelSchedule = async () => {
    if (!cancelReason.trim()) {
      setAlertModal({ open: true, type: 'error', title: 'Reason Required', message: 'Please provide a reason for cancelling the schedule.' });
      return;
    }
    setCancelLoading(true);
    try {
      const res = await axios.post(`${BACKEND}/api/offboarding/${id}/cancel-schedule`, {
        actorEmail: currentUser.username,
        actorName: currentUser.name,
        reason: cancelReason.trim(),
      });
      setShowCancelModal(false);
      setCancelReason('');
      await fetchRequest();
      setCancelResult({ success: true, message: res.data.message });
      setTimeout(() => {
        setCancelResult(null);
        navigate('/hr-request', { state: { refresh: true } });
      }, 3000);
    } catch (err) {
      setAlertModal({ 
        open: true, 
        type: 'error', 
        title: 'Cancel Failed', 
        message: err?.response?.data?.message || 'Failed to cancel schedule. Please try again.' 
      });
    } finally {
      setCancelLoading(false);
    }
  };

  const openCancelModal = () => {
    setShowCancelModal(true);
    setCancelReason('');
  };

  const closeCancelModal = () => {
    setShowCancelModal(false);
    setCancelReason('');
  };

  // ==================== REMINDER HANDLER ====================
  const handleSendReminder = async () => {
    setRemindLoading(true);
    setRemindResult(null);
    try {
      const res = await axios.post(`${BACKEND}/api/offboarding/${id}/remind`, {
        actorEmail: currentUser.username,
        actorName: currentUser.name,
      });
      setRemindResult({ success: true, message: res.data.message, recipientsCount: res.data.recipientsCount });
      // Refresh request to show history entry
      await fetchRequest();
      // Auto-close after 5 seconds
      setTimeout(() => {
        setRemindResult(null);
      }, 5000);
    } catch (err) {
      setRemindResult({ 
        success: false, 
        message: err?.response?.data?.message || 'Failed to send reminder. Please try again.' 
      });
      setTimeout(() => {
        setRemindResult(null);
      }, 5000);
    } finally {
      setRemindLoading(false);
    }
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
    @keyframes barUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes slideDown { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    .ofb-page { min-height: 100vh; width: 100%; background: var(--bg); font-family: 'Lato', sans-serif; color: var(--text); }

    .ofb-topbar {
      background: var(--navy);
      background-image: linear-gradient(120deg, #002060 0%, #002d82 60%, #003090 100%);
      padding: 18px 40px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    }
    .ofb-topbar-left { display: flex; align-items: center; gap: 14px; }
    .ofb-back-btn {
      background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18); color: #fff;
      font-size: 13px; font-weight: 600; font-family: 'Sora', sans-serif; padding: 7px 14px; border-radius: 8px;
      cursor: pointer; transition: all 0.2s;
    }
    .ofb-back-btn:hover { background: rgba(255,255,255,0.2); }
    .ofb-topbar-title { font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.55); }
    .ofb-topbar-title span { color: var(--orange); }
    .ofb-reqno {
      font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: #fff; letter-spacing: 0.05em;
      background: rgba(255,255,255,0.08); border: 1px dashed rgba(255,255,255,0.35); padding: 6px 12px; border-radius: 8px;
    }

    .ofb-status-banner { max-width: 1240px; margin: 24px auto 0; padding: 0 40px; }
    .ofb-status-banner-inner {
      background: var(--white); border-radius: 16px; padding: 16px 24px; border-left: 4px solid var(--border);
      box-shadow: var(--shadow); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
    }
    .ofb-status-banner-inner.pending { border-left-color: #f59e0b; }
    .ofb-status-banner-inner.approved { border-left-color: var(--green); }
    .ofb-status-banner-inner.rejected { border-left-color: var(--red); }
    .ofb-status-banner-inner.processing { border-left-color: #3b82f6; }
    .ofb-status-banner-inner.cancelled { border-left-color: #9ca3af; }
    .ofb-status-banner-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .ofb-status-banner-status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 13px; }
    .ofb-status-banner-meta { font-size: 13px; color: var(--muted); }
    .ofb-status-banner-meta strong { color: var(--text); font-weight: 600; }

    .ofb-shell { max-width: 1240px; margin: 0 auto; padding: 24px 40px 96px; display: grid; grid-template-columns: 320px 1fr; gap: 28px; align-items: start; }

    .ofb-badge {
      position: sticky; top: 24px; background: var(--white); border: 1.5px solid var(--border); border-radius: 20px;
      overflow: hidden; animation: fadeUp 0.45s ease both; box-shadow: var(--shadow); transition: box-shadow 0.3s ease;
    }
    .ofb-badge:hover { box-shadow: var(--shadow-lg); }
    .ofb-badge-top {
      background: linear-gradient(135deg, #002060 0%, #0a3a7a 100%); padding: 28px 24px 20px; position: relative; overflow: hidden; text-align: center;
    }
    .ofb-badge-top::after {
      content: ''; position: absolute; right: -30px; top: -30px; width: 140px; height: 140px; border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.18) 0%, transparent 70%);
    }
    .ofb-avatar {
      width: 72px; height: 72px; border-radius: 50%; background: rgba(255,255,255,0.12); border: 2px solid rgba(255,255,255,0.4);
      display: flex; align-items: center; justify-content: center; font-family: 'Sora', sans-serif; font-size: 24px; font-weight: 800;
      color: #fff; margin: 0 auto 12px; position: relative; z-index: 1;
    }
    .ofb-badge-name { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 800; color: #fff; position: relative; z-index: 1; }
    .ofb-badge-role { font-size: 13px; color: rgba(255,255,255,0.68); margin-top: 3px; position: relative; z-index: 1; }
    .ofb-badge-body { padding: 20px 24px 24px; position: relative; }
    .ofb-badge-body .ofb-badge-row:last-child { border-bottom: none; padding-bottom: 0; }
    .ofb-badge-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
    .ofb-badge-row .k { color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10.5px; flex-shrink: 0; }
    .ofb-badge-row .v { color: var(--text); font-weight: 600; text-align: right; word-break: break-word; }

    .ofb-action-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11.5px; font-weight: 800; font-family: 'Sora', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
    .ofb-action-chip.disable { background: rgba(233,132,4,0.14); color: #b45309; }
    .ofb-action-chip.delete { background: rgba(239,68,68,0.14); color: #b91c1c; }

    .ofb-tabs { display: flex; gap: 4px; border-bottom: 1.5px solid var(--border); margin-bottom: 24px; animation: fadeUp 0.4s ease both; }
    .ofb-tab {
      background: none; border: none; cursor: pointer; padding: 10px 18px 14px; font-family: 'Sora', sans-serif; font-size: 13.5px;
      font-weight: 700; color: var(--muted); display: flex; align-items: center; gap: 7px; border-bottom: 2.5px solid transparent;
      margin-bottom: -1.5px; transition: all 0.15s;
    }
    .ofb-tab:hover { color: var(--navy); }
    .ofb-tab.active { color: var(--navy); border-bottom-color: var(--orange); }
    .ofb-tab .ofb-tab-count { background: var(--bg); color: var(--muted); font-size: 10.5px; padding: 1px 7px; border-radius: 20px; font-weight: 700; }
    .ofb-tab.active .ofb-tab-count { background: rgba(233,132,4,0.14); color: var(--orange); }

    .ofb-doc { background: var(--white); border: 1.5px solid var(--border); border-radius: 18px; animation: fadeUp 0.4s 0.05s ease both; overflow: hidden; box-shadow: var(--shadow); transition: box-shadow 0.3s ease; }
    .ofb-doc:hover { box-shadow: var(--shadow-lg); }
    .ofb-doc-section { padding: 24px 28px; border-bottom: 1px solid var(--border); }
    .ofb-doc-section:last-child { border-bottom: none; }
    .ofb-doc-section-title { font-family: 'Sora', sans-serif; font-size: 11px; font-weight: 800; color: var(--navy); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .ofb-doc-section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

    .ofb-field-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 24px; }
    .ofb-field { padding: 10px 0; border-bottom: 1px dotted var(--border); }
    .ofb-field.full { grid-column: 1 / -1; }
    .ofb-field .k { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); display: block; margin-bottom: 3px; }
    .ofb-field .v { font-size: 14.5px; font-weight: 600; color: var(--text); }
    .ofb-field .sub { font-size: 12.5px; color: var(--muted); margin-top: 1px; }

    .ofb-notes { padding: 16px 18px; background: var(--bg); border-left: 3px solid var(--orange); border-radius: 8px; font-size: 13.5px; line-height: 1.7; white-space: pre-wrap; }

    /* Stage flow — dynamic 2 or 3 nodes depending on request.stages */
    .ofb-stage-flow { display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
    .ofb-stage-node {
      flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: 12px;
      background: var(--light); border: 1.5px solid var(--border);
    }
    .ofb-stage-node.approved { background: rgba(16,185,129,0.07); border-color: #86efac; }
    .ofb-stage-node.rejected { background: rgba(239,68,68,0.07); border-color: #fca5a5; }
    .ofb-stage-node.active { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(233,132,4,0.12); }
    .ofb-stage-node-head { display: flex; align-items: center; gap: 8px; font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; }
    .ofb-stage-node-sub { font-size: 11.5px; color: var(--muted); }
    .ofb-stage-node-status { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .ofb-stage-node-status.approved { color: #15803d; }
    .ofb-stage-node-status.rejected { color: #b91c1c; }
    .ofb-stage-node-status.pending { color: #b45309; }
    .ofb-stage-arrow { align-self: center; color: var(--muted); font-size: 16px; }

    .ofb-plan { display: flex; flex-direction: column; gap: 6px; }
    .ofb-plan-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: var(--light); border: 1px solid var(--border); font-size: 13px; }
    .ofb-plan-item .num { font-family: 'Sora', sans-serif; font-size: 11px; font-weight: 800; color: var(--muted); width: 20px; flex-shrink: 0; }
    .ofb-plan-item.done { background: rgba(16,185,129,0.07); border-color: #86efac; }
    .ofb-plan-item.done .num { color: #15803d; }
    .ofb-plan-note { margin-top: 12px; font-size: 12.5px; color: var(--muted); line-height: 1.6; background: var(--bg); border-left: 3px solid var(--orange); border-radius: 8px; padding: 12px 14px; }

    .of-chips, .ofb-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
    .ofb-chip { padding: 5px 14px; background: rgba(0,32,96,0.05); border: 1.5px solid rgba(0,32,96,0.12); border-radius: 30px; font-size: 12.5px; font-weight: 600; color: var(--navy); }

    .ofb-timeline { position: relative; padding-left: 22px; }
    .ofb-timeline::before { content: ''; position: absolute; left: 5px; top: 6px; bottom: 6px; width: 2px; background: var(--border); }
    .ofb-tl-item { position: relative; padding-bottom: 22px; }
    .ofb-tl-item:last-child { padding-bottom: 0; }
    .ofb-tl-dot { position: absolute; left: -22px; top: 3px; width: 12px; height: 12px; border-radius: 50%; border: 2.5px solid var(--white); box-shadow: 0 0 0 1.5px currentColor; }
    .ofb-tl-action { font-family: 'Sora', sans-serif; font-size: 13.5px; font-weight: 700; text-transform: capitalize; }
    .ofb-tl-notes { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
    .ofb-tl-meta { font-size: 11.5px; color: var(--muted); margin-top: 4px; }

    .ofb-empty { text-align: center; padding: 32px 20px; color: var(--muted); }
    .ofb-empty .icon { font-size: 30px; margin-bottom: 8px; }
    .ofb-empty .t1 { font-size: 13.5px; font-weight: 700; color: var(--text); }
    .ofb-empty .t2 { font-size: 12.5px; margin-top: 3px; }

    .ofb-actionbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 500; background: var(--white); border-top: 1.5px solid var(--border); box-shadow: 0 -8px 24px rgba(15,23,42,0.08); animation: barUp 0.3s ease-out both; }
    .ofb-actionbar-inner { max-width: 1240px; margin: 0 auto; padding: 14px 40px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .ofb-actionbar-msg { display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: var(--text); font-weight: 600; }
    .ofb-actionbar-msg .dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; box-shadow: 0 0 0 4px rgba(245,158,11,0.15); animation: pulse 2s infinite; }
    .ofb-actionbar-btns { display: flex; gap: 10px; }

    /* Cancel schedule button styles */
    .ofb-cancel-btn {
      background: #6b7280;
      color: white;
    }
    .ofb-cancel-btn:hover:not(:disabled) {
      background: #4b5563;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(107,114,128,0.3);
    }
    .ofb-cancel-btn-danger {
      background: #dc2626;
      color: white;
    }
    .ofb-cancel-btn-danger:hover:not(:disabled) {
      background: #b91c1c;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(220,38,38,0.3);
    }

    /* Reminder banner */
    .ofb-reminder-banner {
      max-width: 1240px; margin: 12px auto 0; padding: 0 40px; animation: slideDown 0.3s ease;
    }
    .ofb-reminder-banner-inner {
      background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px; padding: 12px 20px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    }
    .ofb-reminder-banner-inner.error {
      background: #fef2f2; border-color: #fca5a5;
    }
    .ofb-reminder-banner-msg {
      display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600;
    }
    .ofb-reminder-banner-msg .icon { font-size: 18px; }
    .ofb-reminder-banner-msg .text { color: #15803d; }
    .ofb-reminder-banner-msg .text.error { color: #b91c1c; }
    .ofb-reminder-banner-close {
      background: none; border: none; font-size: 18px; cursor: pointer; color: #64748b; padding: 0 4px;
    }
    .ofb-reminder-banner-close:hover { color: var(--text); }

    .ofb-btn { padding: 10px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s; border: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .ofb-btn-primary { background: var(--navy); color: white; }
    .ofb-btn-primary:hover:not(:disabled) { background: var(--navy2); transform: translateY(-1px); }
    .ofb-btn-secondary { background: var(--bg); color: var(--text); border: 1.5px solid var(--border); }
    .ofb-btn-secondary:hover { border-color: var(--navy); color: var(--navy); }
    .ofb-btn-warning { background: #f59e0b; color: white; }
    .ofb-btn-warning:hover:not(:disabled) { background: #d97706; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(245,158,11,0.3); }
    .ofb-btn-remind { background: #3b82f6; color: white; }
    .ofb-btn-remind:hover:not(:disabled) { background: #2563eb; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59,130,246,0.3); }
    .ofb-btn-remind:disabled { opacity: 0.6; cursor: not-allowed; }
    .ofb-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .ofb-loading { min-height: 100vh; background: var(--bg); display: flex; align-items: center; justify-content: center; }
    .ofb-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--navy); animation: spin 0.9s linear infinite; margin: 0 auto 14px; }

    .ofb-info-card { background: var(--bg); border-radius: 12px; padding: 16px 20px; margin-top: 12px; border: 1px solid var(--border); }
    .ofb-info-card .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); display: block; margin-bottom: 4px; }
    .ofb-info-card .value { font-size: 14px; font-weight: 600; color: var(--text); }

    .ofb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 24px; }
    .ofb-modal { background: var(--white); border-radius: 20px; max-width: 480px; width: 100%; max-height: 90vh; overflow: hidden; animation: slideUp 0.2s ease; }
    .ofb-modal-inner { padding: 32px 28px 28px; text-align: center; }
    .ofb-modal-icon { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 14px; }
    .ofb-modal-title { font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 700; margin-bottom: 6px; }
    .ofb-modal-message { font-size: 14px; color: var(--muted); line-height: 1.6; }

    .ofb-pr-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 24px; }
    .ofb-pr-modal { background: var(--white); border-radius: 24px; max-width: 640px; width: 100%; overflow: hidden; animation: scaleIn 0.22s ease both; box-shadow: 0 24px 80px rgba(0,0,0,0.25); max-height: 90vh; display: flex; flex-direction: column; }
    .ofb-pr-header { padding: 28px 32px; background: linear-gradient(135deg, #002060 0%, #003090 100%); flex-shrink: 0; }
    .ofb-pr-header h2 { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 800; color: white; display: flex; align-items: center; gap: 10px; }
    .ofb-pr-header p { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 6px; line-height: 1.5; }
    .ofb-pr-body { padding: 28px 32px; overflow-y: auto; flex: 1; }
    .ofb-pr-section { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px dashed var(--border); }
    .ofb-pr-section:last-of-type { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .ofb-pr-section-title { font-family: 'Sora', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
    .ofb-pr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .ofb-pr-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0; gap: 16px; }
    .ofb-pr-row .label { font-size: 13px; color: var(--muted); font-weight: 500; flex-shrink: 0; }
    .ofb-pr-row .value { font-size: 13px; color: var(--text); font-weight: 600; text-align: right; }
    .ofb-pr-warning { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 10px; padding: 12px 14px; margin-bottom: 20px; font-size: 13px; color: #92400e; line-height: 1.5; display: flex; gap: 10px; align-items: flex-start; }
    .ofb-pr-textarea { width: 100%; padding: 10px 14px; border: 1.5px solid var(--border); border-radius: 10px; font-size: 13px; font-family: 'Lato', sans-serif; color: var(--text); resize: vertical; transition: border-color 0.2s; }
    .ofb-pr-textarea:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 3px rgba(0,32,96,0.1); }
    .ofb-pr-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    .ofb-pr-error { padding: 10px 14px; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 10px; font-size: 13px; color: #991b1b; margin-top: 12px; }
    .ofb-pr-btn { padding: 11px 22px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; border: none; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
    .ofb-pr-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .ofb-pr-btn-approve { background: #16a34a; color: white; flex: 1; justify-content: center; }
    .ofb-pr-btn-approve:hover:not(:disabled) { background: #15803d; transform: translateY(-1px); }
    .ofb-pr-btn-reject { background: #dc2626; color: white; flex: 1; justify-content: center; }
    .ofb-pr-btn-reject:hover:not(:disabled) { background: #b91c1c; transform: translateY(-1px); }
    .ofb-pr-btn-cancel, .ofb-pr-btn-back { background: var(--bg); color: var(--text); border: 1.5px solid var(--border); }
    .ofb-pr-btn-cancel:hover, .ofb-pr-btn-back:hover { border-color: var(--navy); }

    .ofb-result-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 10000; padding: 24px; }
    .ofb-result-modal { background: var(--white); border-radius: 24px; max-width: 480px; width: 100%; overflow: hidden; animation: scaleIn 0.22s ease both; box-shadow: 0 24px 80px rgba(0,0,0,0.3); }
    .ofb-result-header { padding: 28px 32px; }
    .ofb-result-header-approve { background: linear-gradient(135deg, #15803d 0%, #16a34a 100%); }
    .ofb-result-header-reject { background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%); }
    .ofb-result-header-cancel { background: linear-gradient(135deg, #4b5563 0%, #6b7280 100%); }
    .ofb-result-header h2 { font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; color: white; }
    .ofb-result-header p { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 4px; }
    .ofb-result-body { padding: 28px 32px; }
    .ofb-result-info { font-size: 13px; color: var(--muted); line-height: 2; margin-bottom: 24px; }
    .ofb-result-actions { display: flex; gap: 12px; }
    .ofb-result-btn { flex: 1; padding: 12px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; border: none; transition: all 0.2s; }
    .ofb-result-btn-done { background: var(--navy); color: white; }
    .ofb-result-btn-done:hover { background: var(--navy2); transform: translateY(-1px); }

    /* Cancel modal */
    .ofb-cancel-modal { background: var(--white); border-radius: 24px; max-width: 480px; width: 100%; overflow: hidden; animation: scaleIn 0.22s ease both; box-shadow: 0 24px 80px rgba(0,0,0,0.25); }
    .ofb-cancel-header { padding: 24px 28px; background: linear-gradient(135deg, #4b5563 0%, #6b7280 100%); }
    .ofb-cancel-header h2 { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 800; color: white; display: flex; align-items: center; gap: 10px; }
    .ofb-cancel-body { padding: 24px 28px; }
    .ofb-cancel-warning { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 13px; color: #92400e; line-height: 1.5; display: flex; gap: 10px; align-items: flex-start; }
    .ofb-cancel-actions { display: flex; gap: 10px; margin-top: 16px; }
    .ofb-cancel-actions .ofb-btn { flex: 1; }

    @media (max-width: 960px) {
      .ofb-shell { grid-template-columns: 1fr; }
      .ofb-badge { position: static; }
      .ofb-status-banner { padding: 0 20px; }
      .ofb-pr-grid { grid-template-columns: 1fr; }
      .ofb-stage-flow { flex-direction: column; }
      .ofb-stage-arrow { transform: rotate(90deg); }
    }
    @media (max-width: 640px) {
      .ofb-topbar { padding: 16px 20px; }
      .ofb-shell { padding: 20px 16px 96px; }
      .ofb-field-grid { grid-template-columns: 1fr; }
      .ofb-actionbar-inner { padding: 14px 20px; flex-direction: column; align-items: stretch; }
      .ofb-actionbar-btns { width: 100%; }
      .ofb-actionbar-btns .ofb-btn { flex: 1; }
      .ofb-result-actions, .ofb-pr-actions { flex-direction: column; }
      .ofb-pr-btn { width: 100%; justify-content: center; }
      .ofb-status-banner-inner { flex-direction: column; align-items: stretch; text-align: center; }
      .ofb-pr-grid { grid-template-columns: 1fr; }
      .ofb-reminder-banner { padding: 0 16px; }
      .ofb-cancel-actions { flex-direction: column; }
    }
  `;

  if (isLoading) {
    return (
      <div className="ofb-page">
        <style>{sharedCSS}</style>
        <div className="ofb-loading">
          <div style={{ textAlign: 'center' }}>
            <div className="ofb-spinner" />
            <div style={{ fontSize: 14, color: '#64748b' }}>Loading offboarding request…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="ofb-page">
        <style>{sharedCSS}</style>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 48 }}>🚫</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#64748b' }}>Offboarding request not found</div>
          <button className="ofb-btn ofb-btn-secondary" onClick={() => navigate('/hr-request')}>← Back to Offboarding</button>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[request.status] || STATUS_STYLES.pending_approval;
  const stages = request.stages || [];
  const historyEvents = request.history?.length > 0 ? [...request.history].reverse() : [];
  const target = request.targetUser || {};

  const showActionBar = canAct && isPendingApproval;
  const showRemindButton = isCreator && isPendingApproval && !canAct;
  const showCancelButton = isCreator && request.status === 'approved_awaiting_schedule';
  console.log('🔍 [CANCEL SCHEDULE DEBUG]', {
  isCreator,
  requestStatus: request?.status,
  showCancelButton,
  creatorEmail: request?.createdByEmail,
  currentUserEmail,
  scheduleType: request?.scheduleType,
  isCreatorCheck: (request?.createdByEmail || '').toLowerCase() === currentUserEmail,
  statusCheck: request?.status === 'approved_awaiting_schedule',
});

  const getBannerClass = () => {
    if (request.status === 'pending_approval') return 'pending';
    if (request.status === 'completed') return 'approved';
    if (request.status === 'rejected' || request.status === 'failed') return 'rejected';
    if (request.status === 'approved_awaiting_schedule') return 'processing';
    if (request.status === 'cancelled') return 'cancelled';
    return '';
  };

  const rejectedStage = stages.find(s => s.status === 'rejected');

  return (
    <div className="ofb-page">
      <style>{sharedCSS}</style>

      <AlertModal open={alertModal.open} type={alertModal.type} title={alertModal.title} message={alertModal.message} onClose={closeAlert} />

      {/* Topbar */}
      <div className="ofb-topbar">
        <div className="ofb-topbar-left">
          <button className="ofb-back-btn" onClick={() => navigate('/hr-request')}>← Back</button>
          <div className="ofb-topbar-title">Offboarding</div>
        </div>
        <div className="ofb-reqno">{request.requestNumber}</div>
      </div>

      {/* Status Banner */}
      <div className="ofb-status-banner">
        <div className={`ofb-status-banner-inner ${getBannerClass()}`}>
          <div className="ofb-status-banner-left">
            <span className="ofb-status-banner-status" style={{ background: statusStyle.bg, color: statusStyle.color }}>
              {statusStyle.icon} {statusStyle.label}
            </span>
            <span className={`ofb-action-chip ${request.actionType}`}>{request.actionType === 'delete' ? '🗑️ Delete' : '🚫 Disable'}</span>
            <span className="ofb-status-banner-meta">
              Requested by <strong>{request.createdByName || request.createdByEmail || '—'}</strong> on <strong>{formatDateShort(request.createdAt)}</strong>
            </span>
          </div>
          <div className="ofb-status-banner-meta">
            {request.status === 'pending_approval' && currentStage && `⏳ Awaiting ${currentStage.label} (Stage ${currentStage.stage} of ${stages.length})`}
            {request.status === 'approved_awaiting_schedule' && `🗓️ Scheduled for ${formatDate(request.scheduledAt)}`}
            {request.status === 'completed' && `✅ Completed on ${formatDateShort(request.executedAt || request.updatedAt)}`}
            {request.status === 'rejected' && rejectedStage && `❌ Rejected at ${rejectedStage.label}`}
            {request.status === 'failed' && '⚠️ Automatic execution failed — manual action required'}
            {request.status === 'cancelled' && `🚫 Cancelled${request.cancelledReason ? `: ${request.cancelledReason}` : ''}`}
          </div>
        </div>
      </div>

      {/* Cancel Result Banner */}
      {cancelResult && (
        <div className="ofb-reminder-banner">
          <div className={`ofb-reminder-banner-inner ${cancelResult.success ? '' : 'error'}`}>
            <div className="ofb-reminder-banner-msg">
              <span className="icon">{cancelResult.success ? '✅' : '❌'}</span>
              <span className={`text ${cancelResult.success ? '' : 'error'}`}>
                {cancelResult.message}
              </span>
            </div>
            <button className="ofb-reminder-banner-close" onClick={() => setCancelResult(null)}>✕</button>
          </div>
        </div>
      )}

      {/* Reminder Result Banner */}
      {remindResult && (
        <div className="ofb-reminder-banner">
          <div className={`ofb-reminder-banner-inner ${remindResult.success ? '' : 'error'}`}>
            <div className="ofb-reminder-banner-msg">
              <span className="icon">{remindResult.success ? '✅' : '❌'}</span>
              <span className={`text ${remindResult.success ? '' : 'error'}`}>
                {remindResult.message}
                {remindResult.success && remindResult.recipientsCount && ` (${remindResult.recipientsCount} recipient${remindResult.recipientsCount > 1 ? 's' : ''})`}
              </span>
            </div>
            <button className="ofb-reminder-banner-close" onClick={() => setRemindResult(null)}>✕</button>
          </div>
        </div>
      )}

      <div className="ofb-shell">
        {/* Badge rail */}
        <div className="ofb-badge">
          <div className="ofb-badge-top">
            <div className="ofb-avatar">{initials(target.name)}</div>
            <div className="ofb-badge-name">{target.name || '—'}</div>
            <div className="ofb-badge-role" style={{ fontSize: 12 }}>{target.email}</div>
          </div>
          <div className="ofb-badge-body">
            <div className="ofb-badge-row">
              <span className="k">Action</span>
              <span className="v"><span className={`ofb-action-chip ${request.actionType}`}>{request.actionType === 'delete' ? 'Delete' : 'Disable'}</span></span>
            </div>
            <div className="ofb-badge-row">
              <span className="k">Schedule</span>
              <span className="v">{request.scheduleType === 'scheduled' ? formatDateShort(request.scheduledAt) : 'Immediate'}</span>
            </div>
            <div className="ofb-badge-row">
              <span className="k">Reporting Mgr</span>
              <span className="v">{target.reportingManagerName || 'N/A'}</span>
            </div>
            <div className="ofb-badge-row">
              <span className="k">Office</span>
              <span className="v">{target.officeLocation || '—'}</span>
            </div>
            <div className="ofb-badge-row">
              <span className="k">Requested</span>
              <span className="v">{formatDateShort(request.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Document pane */}
        <div>
          <div className="ofb-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`ofb-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                <span>{t.icon}</span> {t.label}
                {t.id === 'approvals' && <span className="ofb-tab-count">{stages.filter(s => s.status === 'approved').length}/{stages.length}</span>}
                {t.id === 'history' && <span className="ofb-tab-count">{historyEvents.length}</span>}
              </button>
            ))}
          </div>

          <div className="ofb-doc">
            {activeTab === 'details' && (
              <>
                <div className="ofb-doc-section">
                  <div className="ofb-doc-section-title">👤 Employee Information</div>
                  <div className="ofb-field-grid">
                    <div className="ofb-field">
                      <span className="k">Full Name</span>
                      <span className="v">{target.name || '—'}</span>
                    </div>
                    <div className="ofb-field">
                      <span className="k">Work Email</span>
                      <span className="v" style={{ fontSize: '13px' }}>{target.email || '—'}</span>
                    </div>
                    <div className="ofb-field">
                      <span className="k">Phone Number</span>
                      <span className="v">{target.phoneNumber || '—'}</span>
                    </div>
                    <div className="ofb-field">
                      <span className="k">Office Location</span>
                      <span className="v">{target.officeLocation || '—'}</span>
                    </div>
                    <div className="ofb-field">
                      <span className="k">License Assigned</span>
                      <span className="v">{target.licenseAssigned || '—'}</span>
                    </div>
                    <div className="ofb-field full">
                      <span className="k">Reporting Manager</span>
                      <span className="v">{target.reportingManagerName || 'N/A'}</span>
                      {target.reportingManagerEmail && <div className="sub">📧 {target.reportingManagerEmail}</div>}
                    </div>
                  </div>
                </div>

                <div className="ofb-doc-section">
                  <div className="ofb-doc-section-title">⚙️ Action &amp; Schedule</div>
                  <div className="ofb-field-grid">
                    <div className="ofb-field">
                      <span className="k">Action Type</span>
                      <span className="v"><span className={`ofb-action-chip ${request.actionType}`}>{request.actionType === 'delete' ? '🗑️ Delete Account' : '🚫 Disable Account'}</span></span>
                    </div>
                    <div className="ofb-field">
                      <span className="k">Schedule Type</span>
                      <span className="v" style={{ textTransform: 'capitalize' }}>{request.scheduleType}</span>
                    </div>
                    {request.scheduleType === 'scheduled' && (
                      <div className="ofb-field full">
                        <span className="k">Scheduled For</span>
                        <span className="v">{formatDate(request.scheduledAt)}</span>
                      </div>
                    )}
                    {request.executedAt && (
                      <div className="ofb-field">
                        <span className="k">Executed At</span>
                        <span className="v">{formatDate(request.executedAt)}</span>
                      </div>
                    )}
                    {request.executionError && (
                      <div className="ofb-field full">
                        <span className="k">Execution Error</span>
                        <span className="v" style={{ color: '#dc2626' }}>{request.executionError}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cancel Schedule Button - Only visible to creator when in approved_awaiting_schedule status */}
                {showCancelButton && (
                  <div className="ofb-doc-section" style={{ background: '#fef3c7', borderBottom: '1px solid #fbbf24' }}>
                    <div className="ofb-doc-section-title" style={{ color: '#92400e' }}>🚫 Cancel Schedule</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '13.5px', color: '#78350f' }}>
                        This request is scheduled for <strong>{formatDate(request.scheduledAt)}</strong>.
                        Cancel the schedule to prevent the offboarding action from running.
                      </div>
                      <button 
                        className="ofb-btn ofb-cancel-btn-danger" 
                        onClick={openCancelModal}
                        disabled={cancelLoading}
                      >
                        {cancelLoading ? (
                          <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Cancelling...</>
                        ) : (
                          '🚫 Cancel Schedule'
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Remind Button Section - Only visible to creator when pending */}
                {showRemindButton && (
                  <div className="ofb-doc-section" style={{ background: '#f0f9ff', borderBottom: '1px solid #bae6fd' }}>
                    <div className="ofb-doc-section-title" style={{ color: '#0369a1' }}>🔔 Need a Reminder?</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '13.5px', color: '#0c4a6e' }}>
                        The request is awaiting approval from <strong>{currentStage?.label}</strong> approvers.
                        Send them a reminder to review this request.
                      </div>
                      <button 
                        className="ofb-btn ofb-btn-remind" 
                        onClick={handleSendReminder}
                        disabled={remindLoading}
                      >
                        {remindLoading ? (
                          <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Sending...</>
                        ) : (
                          '🔔 Remind Approvers'
                        )}
                      </button>
                    </div>
                    {currentStage && (
                      <div style={{ marginTop: 10, fontSize: '12px', color: '#64748b' }}>
                        Approvers: {(currentStage.approvers || []).map(a => a.name || a.email).join(', ') || 'No approvers configured'}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'approvals' && (
              <>
                <div className="ofb-doc-section">
                  <div className="ofb-doc-section-title">⚖️ Approval Workflow</div>
                  <div className="ofb-stage-flow">
                    {stages.map((s, i) => (
                      <React.Fragment key={s.stage}>
                        <div className={`ofb-stage-node ${s.status} ${request.status === 'pending_approval' && request.currentStage === s.stage ? 'active' : ''}`}>
                          <div className="ofb-stage-node-head">
                            <span>{STAGE_ICON[s.role] || '👤'}</span> {s.label}
                          </div>
                          <div className="ofb-stage-node-sub">
                            {(s.approvers || []).length > 0
                              ? s.approvers.map(a => a.name || a.email).join(', ')
                              : 'No approvers configured'}
                          </div>
                          <div className={`ofb-stage-node-status ${s.status}`}>
                            {s.status === 'approved' && `✅ Approved${s.actedByName ? ` by ${s.actedByName}` : ''}`}
                            {s.status === 'rejected' && `❌ Rejected${s.actedByName ? ` by ${s.actedByName}` : ''}`}
                            {s.status === 'pending' && '⏳ Pending'}
                          </div>
                          {s.comment && <div className="ofb-tl-notes">"{s.comment}"</div>}
                          {s.actedAt && <div className="ofb-tl-meta">{formatDate(s.actedAt)}</div>}
                        </div>
                        {i < stages.length - 1 && <span className="ofb-stage-arrow">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                  {request.actionType === 'disable' && (
                    <div className="ofb-info-card">
                      <span className="label">ℹ️ Note</span>
                      <div className="value" style={{ fontWeight: 500, fontSize: 13 }}>HR approval is only required when the action type is Delete. This is a Disable request, so it completes after IT approval.</div>
                    </div>
                  )}
                  {!stages.some(s => s.role === 'manager') && (
                    <div className="ofb-info-card">
                      <span className="label">ℹ️ Note</span>
                      <div className="value" style={{ fontWeight: 500, fontSize: 13 }}>
                        {target.name} has no reporting manager on file, so Reporting Manager Approval was skipped. This request starts directly at {stages[0]?.label || 'IT Team Approval'}.
                      </div>
                    </div>
                  )}
                  {request.status === 'rejected' && request.rejectionReason && (
                    <div className="ofb-info-card" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.05)' }}>
                      <span className="label" style={{ color: '#dc2626' }}>❌ Rejection Reason</span>
                      <div className="value" style={{ color: '#dc2626' }}>{request.rejectionReason}</div>
                    </div>
                  )}
                  {request.status === 'cancelled' && request.cancelledReason && (
                    <div className="ofb-info-card" style={{ borderColor: '#9ca3af', background: 'rgba(156,163,175,0.05)' }}>
                      <span className="label" style={{ color: '#4b5563' }}>🚫 Cancellation Reason</span>
                      <div className="value" style={{ color: '#4b5563' }}>{request.cancelledReason}</div>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'history' && (
              <div className="ofb-doc-section">
                <div className="ofb-doc-section-title">📜 Activity Timeline</div>
                {historyEvents.length === 0 ? (
                  <div className="ofb-empty">
                    <div className="icon">📭</div>
                    <div className="t1">No activity yet</div>
                  </div>
                ) : (
                  <div className="ofb-timeline">
                    {historyEvents.map((event, idx) => {
                      const dotColor = event.action === 'stage_approved' || event.action === 'executed' || event.action === 'all_stages_approved' ? '#10b981'
                        : event.action === 'rejected' || event.action === 'execution_failed' ? '#ef4444'
                        : event.action === 'reminder_sent' ? '#3b82f6'
                        : event.action === 'schedule_cancelled' ? '#9ca3af'
                        : '#e98404';
                      return (
                        <div className="ofb-tl-item" key={idx}>
                          <div className="ofb-tl-dot" style={{ color: dotColor, background: dotColor }} />
                          <div className="ofb-tl-action">{(event.action || '').replace(/_/g, ' ')}</div>
                          {event.notes && <div className="ofb-tl-notes">{event.notes}</div>}
                          <div className="ofb-tl-meta">{event.by} · {formatDate(event.at)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {isPendingApproval && !canView && activeTab === 'details' && (
              <div className="ofb-doc-section">
                <div className="ofb-empty">
                  <div className="icon">🔒</div>
                  <div className="t1">Awaiting Approval</div>
                  <div className="t2">You are not an approver for the current stage of this request.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating action bar - for approvers */}
      {showActionBar && (
        <div className="ofb-actionbar">
          <div className="ofb-actionbar-inner">
            <div className="ofb-actionbar-msg">
              <span className="dot" />
              <span>Stage {currentStage?.stage} ({currentStage?.label}) is awaiting your review.</span>
            </div>
            <div className="ofb-actionbar-btns">
              <button className="ofb-btn ofb-btn-warning" onClick={openReviewModal}>
                📋 Review Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Schedule Modal */}
      {showCancelModal && (
        <div className="ofb-pr-overlay" onClick={closeCancelModal}>
          <div className="ofb-cancel-modal" onClick={e => e.stopPropagation()}>
            <div className="ofb-cancel-header">
              <h2><span>🚫</span> Cancel Schedule</h2>
            </div>
            <div className="ofb-cancel-body">
              <div className="ofb-cancel-warning">
                <span>⚠️</span>
                <span>
                  <strong>This will cancel the scheduled offboarding action.</strong><br />
                  The request will be marked as <strong>Cancelled</strong> and the offboarding will NOT be executed.
                  {request.scheduleType === 'scheduled' && (
                    <> The scheduled time was <strong>{formatDate(request.scheduledAt)}</strong>.</>
                  )}
                </span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#4b5563' }}>
                  Reason for cancellation <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <textarea
                  className="ofb-pr-textarea"
                  placeholder="Please provide a reason for cancelling this schedule..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  autoFocus
                />
              </div>
              <div className="ofb-cancel-actions">
                <button 
                  className="ofb-btn ofb-cancel-btn-danger" 
                  onClick={handleCancelSchedule}
                  disabled={cancelLoading}
                >
                  {cancelLoading ? (
                    <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Cancelling...</>
                  ) : (
                    '🚫 Confirm Cancel'
                  )}
                </button>
                <button 
                  className="ofb-btn ofb-btn-secondary" 
                  onClick={closeCancelModal}
                  disabled={cancelLoading}
                >
                  ← Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve/Reject Modal */}
      {showPRModal && currentStage && (
        <div className="ofb-pr-overlay" onClick={handleCancel}>
          <div className="ofb-pr-modal" onClick={e => e.stopPropagation()}>
            <div className="ofb-pr-header">
              <h2><span>📋</span> Review Offboarding Request</h2>
              <p>Stage {currentStage.stage} of {stages.length} — {currentStage.label}</p>
            </div>
            <div className="ofb-pr-body">
              <div className="ofb-pr-section">
                <div className="ofb-pr-section-title"><span>📋</span> Request Details</div>
                <div className="ofb-pr-grid">
                  <div className="ofb-pr-row"><span className="label">Request Number:</span><span className="value">{request.requestNumber}</span></div>
                  <div className="ofb-pr-row"><span className="label">Requested:</span><span className="value">{formatDate(request.createdAt)}</span></div>
                  <div className="ofb-pr-row"><span className="label">Requested By:</span><span className="value">{request.createdByName}</span></div>
                  <div className="ofb-pr-row"><span className="label">Action:</span><span className="value">{request.actionType === 'delete' ? 'Delete' : 'Disable'}</span></div>
                </div>
              </div>
              <div className="ofb-pr-section">
                <div className="ofb-pr-section-title"><span>👤</span> Employee</div>
                <div className="ofb-pr-grid">
                  <div className="ofb-pr-row"><span className="label">Name:</span><span className="value">{target.name}</span></div>
                  <div className="ofb-pr-row"><span className="label">Email:</span><span className="value" style={{ fontSize: '12px' }}>{target.email}</span></div>
                  <div className="ofb-pr-row"><span className="label">Reporting Manager:</span><span className="value">{target.reportingManagerName || 'N/A'}</span></div>
                  <div className="ofb-pr-row"><span className="label">Schedule:</span><span className="value">{request.scheduleType === 'scheduled' ? formatDate(request.scheduledAt) : 'Immediate'}</span></div>
                </div>
              </div>
              <div className="ofb-pr-warning">
                <span>⚠️</span>
                <span>
                  {request.currentStage >= stages.length
                    ? `Approving completes the approval chain. ${request.scheduleType === 'immediate' ? `The ${request.actionType} action will run immediately.` : `The ${request.actionType} action will run at the scheduled time.`}`
                    : `Approving moves this request to Stage ${request.currentStage + 1} (${stages[request.currentStage]?.label}). No account action happens yet.`}
                </span>
              </div>
              <textarea
                className="ofb-pr-textarea"
                placeholder="Add an optional note for other approvers..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={2}
              />
              {prAction === 'reject' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#dc2626' }}>Reason for rejection <span style={{ color: '#ef4444' }}>*</span></div>
                  <textarea
                    className="ofb-pr-textarea"
                    placeholder="Please provide a clear reason for rejecting this request..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                </div>
              )}
              {prError && <div className="ofb-pr-error">⚠ {prError}</div>}

              {!prAction ? (
                <div className="ofb-pr-actions">
                  <button className="ofb-pr-btn ofb-pr-btn-approve" onClick={() => setPrAction('approve')}>
                    ✅ Approve
                  </button>
                  <button className="ofb-pr-btn ofb-pr-btn-reject" onClick={() => setPrAction('reject')}>
                    ❌ Reject
                  </button>
                  <button className="ofb-pr-btn ofb-pr-btn-cancel" onClick={handleCancel}>
                    ✕ Cancel
                  </button>
                </div>
              ) : (
                <div className="ofb-pr-actions">
                  {prAction === 'approve' ? (
                    <button className="ofb-pr-btn ofb-pr-btn-approve" onClick={handleApprove} disabled={prLoading}>
                      {prLoading ? <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Processing...</> : '✅ Confirm Approve'}
                    </button>
                  ) : (
                    <button className="ofb-pr-btn ofb-pr-btn-reject" onClick={handleReject} disabled={prLoading}>
                      {prLoading ? <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Processing...</> : '❌ Confirm Reject'}
                    </button>
                  )}
                  <button
                    className="ofb-pr-btn ofb-pr-btn-back"
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
        <div className="ofb-result-overlay">
          <div className="ofb-result-modal">
            <div className="ofb-result-header ofb-result-header-approve">
              <h2>✓ Stage Approved</h2>
              <p>{prResult.message}</p>
            </div>
            <div className="ofb-result-body">
              <div className="ofb-result-info">
                {prResult.scheduledAt
                  ? <>All approvals are complete. Execution is scheduled for <strong>{formatDate(prResult.scheduledAt)}</strong>.</>
                  : 'The request has moved forward in the approval chain.'}
              </div>
              <div className="ofb-result-actions">
                <button className="ofb-result-btn ofb-result-btn-done" style={{ flex: 1 }} onClick={closeResultModal}>✅ Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result: Rejected */}
      {prResult?.type === 'reject' && (
        <div className="ofb-result-overlay">
          <div className="ofb-result-modal">
            <div className="ofb-result-header ofb-result-header-reject">
              <h2>✕ Request Rejected</h2>
              <p>The offboarding request has been rejected</p>
            </div>
            <div className="ofb-result-body">
              <div className="ofb-result-info">The requester has been notified.</div>
              <div className="ofb-result-actions">
                <button className="ofb-result-btn ofb-result-btn-done" style={{ flex: 1 }} onClick={closeResultModal}>✅ Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OffboardingRequestDetails;