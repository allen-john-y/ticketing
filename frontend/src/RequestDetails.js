// RequestDetails.js - Complete Working Version with Full Group Member Support
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function RequestDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts, instance } = useMsal();

  const [request, setRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authority, setAuthority] = useState('basic');

  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [activeAttachment, setActiveAttachment] = useState(null);
  const [attachmentList, setAttachmentList] = useState([]);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState('');
  const [statusUpdateError, setStatusUpdateError] = useState('');

  // Modal States
  const [showPRModal, setShowPRModal] = useState(false);
  const [prAction, setPrAction] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [prLoading, setPrLoading] = useState(false);
  const [prResult, setPrResult] = useState(null);
  const [prError, setPrError] = useState('');
  const [hasUserCancelled, setHasUserCancelled] = useState(false);

  const REQUEST_STATUSES = ["open", "in_progress", "pending_approval", "resolved", "closed", "cancelled"];

  // Check user authority
  useEffect(() => {
    const checkAuthority = async () => {
      if (!accounts?.[0]) return;
      try {
        const tokenRes = await instance.acquireTokenSilent({
          scopes: ['GroupMember.Read.All'],
          account: accounts[0],
        });
        const resp = await fetch('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenRes.accessToken}` },
        });
        const json = await resp.json();
        const groups = (json.value || []).map(g => g.displayName);
        setAuthority(groups.includes('Helpdesk_Admin') ? 'admin' : 'basic');
      } catch (e) {
        setAuthority('basic');
      }
    };
    checkAuthority();
  }, [accounts, instance]);

  // Load image preview
  useEffect(() => {
    let objectUrl = null;
    const loadImage = async () => {
      if (!activeAttachment || !activeAttachment.fileUrl) { setImagePreviewUrl(null); return; }
      try {
        const res = await fetch(activeAttachment.fileUrl);
        if (!res.ok) throw new Error('Failed');
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setImagePreviewUrl(objectUrl);
      } catch (e) { setImagePreviewUrl(null); }
    };
    loadImage();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [activeAttachment]);

  // Fetch request details
  useEffect(() => {
    const fetchRequest = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(`${BACKEND}/api/requests/${id}`);
        setRequest(res.data);
        setSelectedStatus(res.data.status || '');
        
        const list = [];
        if (res.data.attachments && Array.isArray(res.data.attachments)) {
          res.data.attachments.forEach(a => {
            const driveId = a.driveId || a.parentReference?.driveId || null;
            const driveItemId = a.id || a.fileId || null;
            const proxyUrl = driveItemId
              ? `${BACKEND}/attachments/${driveItemId}${driveId ? `?driveId=${encodeURIComponent(driveId)}` : ''}`
              : (a.fileUrl || a.url || a.path || null);
            list.push({ fileName: a.fileName || a.originalname || '', fileType: a.fileType || a.mimetype || '', fileUrl: proxyUrl, id: driveItemId, driveId: driveId || null });
          });
        }
        setAttachmentList(list);
      } catch (err) {
        console.error('Error fetching request:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRequest();
  }, [id]);

  // ✅ Check if current user is in assignment group (works for both password reset and admin access)
  const isUserInAssignmentGroup = () => {
    if (!request || !accounts?.[0]) return false;
    
    const email = (accounts[0]?.username || '').toLowerCase();
    const userId = (accounts[0]?.localAccountId || '').toLowerCase();
    const members = request.assignmentGroup?.members || [];
    
    console.log('🔍 [GROUP CHECK] Checking assignment group members:', {
      userEmail: email,
      userId: userId,
      membersCount: members.length,
      members: members.map(m => ({ email: m.email || m.mail, id: m.id }))
    });
    
    const isInGroup = members.some(member => {
      const memberEmail = (member.email || member.mail || '').toLowerCase();
      const memberId = (member.id || member.memberId || '').toLowerCase();
      return memberEmail === email || memberEmail === userId || memberId === userId;
    });
    
    console.log('🔍 [GROUP CHECK] Is user in assignment group?', isInGroup);
    return isInGroup;
  };

  // ✅ UPDATED: Auto-open modal for assigned member OR any group member (for BOTH types)
  useEffect(() => {
    console.log('🔍 [MODAL CHECK] Running auto-open check...');
    if (!request || !accounts?.[0] || hasUserCancelled) {
      console.log('  ❌ Early exit');
      return;
    }
    
    const email = (accounts[0]?.username || '').toLowerCase();
    const userId = (accounts[0]?.localAccountId || '').toLowerCase();
    const serviceName = request.service?.name || '';
    
    const isPR = serviceName.toLowerCase().includes('password reset');
    const isAdminAccess = serviceName.toLowerCase().includes('admin access') ||
                          serviceName.toLowerCase().includes('device admin');
    const needsApproval = isPR || isAdminAccess;
    
    // Check assigned member
    const assignedEmail = (request.assignedMember?.memberEmail || '').toLowerCase();
    const assignedMemberId = (request.assignedMember?.memberId || '').toLowerCase();
    
    const isAssignedMember =
      (assignedEmail && email === assignedEmail) ||
      (assignedMemberId && userId === assignedMemberId) ||
      (assignedEmail && userId === assignedEmail);
    
    // ✅ Check if user is in assignment group (for BOTH types)
    const inAssignmentGroup = isUserInAssignmentGroup();
    
    const terminal = ['resolved', 'closed', 'cancelled'];
    const isTerminal = terminal.includes(request.status);
    
    // Authorized if assigned OR in assignment group
    const isAuthorized = isAssignedMember || inAssignmentGroup;
    
    console.log('🔍 [MODAL CHECK] Details:', {
      serviceName,
      isPR,
      isAdminAccess,
      needsApproval,
      userEmail: email,
      userId: userId,
      assignedEmail: assignedEmail,
      isAssignedMember,
      inAssignmentGroup,
      isAuthorized,
      requestStatus: request.status,
      isTerminal,
      hasResult: !!prResult
    });
    
    if (needsApproval && isAuthorized && !isTerminal && !prResult) {
      console.log('🎯 [MODAL CHECK] ✅ OPENING MODAL for:', serviceName);
      setShowPRModal(true);
      setHasUserCancelled(false);
      setPrAction(null);
      setPrError('');
      setRejectReason('');
      setAdminNote('');
    } else {
      console.log('  ❌ Conditions not met');
      if (!needsApproval) console.log('     - Not an approval request');
      if (!isAuthorized) console.log('     - User not authorized (not assigned nor in group)');
      if (isTerminal) console.log('     - Request already resolved/closed/cancelled');
      if (prResult) console.log('     - Already have a result');
    }
  }, [request, accounts, hasUserCancelled, prResult]);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const isImageType = (type) => type && type.startsWith && type.startsWith('image/');
  const isPdfType = (type, url) => (type && type === 'application/pdf') || (url && url.toLowerCase().endsWith('.pdf'));

  const openAttachmentViewer = (attachment) => {
    if (!attachment) return;
    if (isPdfType(attachment.fileType, attachment.fileUrl)) { downloadAttachment(attachment); return; }
    if (!isImageType(attachment.fileType)) { window.open(attachment.fileUrl, '_blank', 'noopener'); return; }
    setActiveAttachment({ ...attachment });
    setAttachmentModalOpen(true);
  };

  const downloadAttachment = async (attachment) => {
    if (!attachment || !attachment.fileUrl) return;
    try {
      const resp = await fetch(attachment.fileUrl);
      if (!resp.ok) throw new Error('Network response not ok');
      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.fileName || attachment.fileUrl.split('/').pop().split('?')[0] || 'download';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) { window.open(attachment.fileUrl, '_blank', 'noopener'); }
  };

  const downloadAllAttachments = async () => {
    if (!attachmentList || attachmentList.length === 0) return;
    const downloadable = attachmentList.filter(a => a && a.id);
    if (!downloadable.length) { alert('No downloadable attachments available.'); return; }
    const ids = downloadable.map(a => a.id).join(',');
    const driveIds = downloadable.map(a => a.driveId || '').join(',');
    const url = `${BACKEND}/attachments/zip?ids=${encodeURIComponent(ids)}${driveIds ? `&driveIds=${encodeURIComponent(driveIds)}` : ''}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `attachments-${request?.requestNumber || id}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const handleStatusUpdate = async () => {
    if (!selectedStatus || selectedStatus === request.status) { setStatusUpdateError('Please select a different status to update.'); return; }
    setStatusUpdateLoading(true); setStatusUpdateError(''); setStatusUpdateSuccess('');
    try {
      const res = await axios.patch(`${BACKEND}/api/requests/${id}`, {
        status: selectedStatus, notes: statusNote,
        updatedBy: { id: accounts[0]?.localAccountId, name: accounts[0]?.name, mail: accounts[0]?.username }
      });
      setRequest(res.data); setStatusNote('');
      setStatusUpdateSuccess(`Status updated to "${selectedStatus}". Notifications sent.`);
      setTimeout(() => setStatusUpdateSuccess(''), 5000);
    } catch (err) {
      setStatusUpdateError('Failed to update: ' + (err?.response?.data?.message || err.message || 'Unknown error'));
    } finally { setStatusUpdateLoading(false); }
  };

  // Handle Approve Action (works for both)
  const handleApprove = async () => {
    setPrLoading(true);
    setPrError('');
    try {
      const res = await axios.post(`${BACKEND}/api/requests/${id}/approve`, {
        actorEmail: accounts[0]?.username,
        actorName: accounts[0]?.name,
        actorId: accounts[0]?.localAccountId,
        note: adminNote,
      });
      
      setShowPRModal(false);
      setPrAction(null);
      setAdminNote('');
      
      const updated = await axios.get(`${BACKEND}/api/requests/${id}`);
      setRequest(updated.data);
      setSelectedStatus(updated.data.status);
      
      if (res.data.tempPassword) {
        setPrResult({ 
          type: 'approve', 
          tempPassword: res.data.tempPassword, 
          targetEmail: res.data.targetEmail 
        });
      } else {
        setPrResult({ type: 'admin_approve' });
      }
    } catch (err) {
      console.error('Approve error:', err);
      setPrError(err?.response?.data?.message || 'Approval failed. Please try again.');
    } finally {
      setPrLoading(false);
    }
  };

  // Handle Reject Action (works for both)
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setPrError('Please provide a reason for rejection.');
      return;
    }
    
    setPrLoading(true);
    setPrError('');
    try {
      const response = await axios.post(`${BACKEND}/api/requests/${id}/reject`, {
        actorEmail: accounts[0]?.username,
        actorName: accounts[0]?.name,
        actorId: accounts[0]?.localAccountId,
        reason: rejectReason.trim(),
        note: adminNote,
      });
      
      setShowPRModal(false);
      setPrAction(null);
      setRejectReason('');
      setAdminNote('');
      
      const updated = await axios.get(`${BACKEND}/api/requests/${id}`);
      setRequest(updated.data);
      setSelectedStatus(updated.data.status);
      
      setPrResult({ type: 'reject' });
    } catch (err) {
      console.error('Reject error:', err);
      setPrError(err?.response?.data?.message || err.message || 'Rejection failed. Please try again.');
    } finally {
      setPrLoading(false);
    }
  };

  // Handle Cancel (just close modal, don't take action)
  const handleCancel = () => {
    setShowPRModal(false);
    setPrAction(null);
    setRejectReason('');
    setAdminNote('');
    setPrError('');
    setHasUserCancelled(true);
  };

  // Close result modal and redirect
  const closeResultModal = () => {
    setPrResult(null);
    setTimeout(() => navigate('/requests', { state: { refresh: true } }), 100);
  };

  const getStatusStyles = (status) => {
    const styles = {
      open: { bg: '#fef3c7', color: '#92400e', border: '#fbbf24' },
      in_progress: { bg: '#dbeafe', color: '#1e40af', border: '#3b82f6' },
      pending_approval: { bg: '#f3e8ff', color: '#6b21a8', border: '#a855f7' },
      resolved: { bg: '#d1fae5', color: '#065f46', border: '#10b981' },
      closed: { bg: '#f3f4f6', color: '#374151', border: '#9ca3af' },
      cancelled: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444' }
    };
    return styles[status] || styles.open;
  };

  const getPriorityStyles = (priority) => {
    const styles = {
      high: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444', icon: '🔴' },
      medium: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b', icon: '🟡' },
      low: { bg: '#d1fae5', color: '#065f46', border: '#10b981', icon: '🟢' }
    };
    return styles[priority] || styles.medium;
  };

  const getTargetInfo = () => {
    if (!request) return { name: '', email: '', deliveryEmail: '' };
    
    const isOnBehalf = request.onBehalf?.enabled && request.onBehalf?.user;
    return {
      name: isOnBehalf ? request.onBehalf.user.name : (request.raisedBy?.name || ''),
      email: isOnBehalf ? request.onBehalf.user.mail : (request.raisedBy?.mail || ''),
      deliveryEmail: isOnBehalf ? request.onBehalf.user.mail : (request.deliveryEmail || request.raisedBy?.mail || ''),
    };
  };

  const targetInfo = getTargetInfo();
  const isPasswordReset = request?.service?.name?.toLowerCase().includes('password reset');
  const isAdminAccess = request?.service?.name?.toLowerCase().includes('admin access') ||
                        request?.service?.name?.toLowerCase().includes('device admin');

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #002060; --navy2: #003090; --orange: #e98404; --orange2: #f5a623;
      --white: #ffffff; --bg: #f5f7fa; --border: #e2e8f0; --text: #0f172a; --muted: #64748b; --light: #f8fafc;
    }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes scaleIn { from { transform: scale(0.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    .rd-page { min-height: 100vh; width: 100%; background: var(--bg); font-family: 'Lato', sans-serif; color: var(--text); }
    .rd-hero { background: var(--navy); position: relative; overflow: hidden; padding: 48px 48px 44px; }
    .rd-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%); pointer-events: none; }
    .rd-hero-inner { position: relative; z-index: 2; max-width: 1320px; margin: 0 auto; animation: fadeUp 0.55s ease both; }
    .rd-hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--orange); margin-bottom: 14px; }
    .rd-hero-eyebrow-line { width: 28px; height: 2px; background: var(--orange); border-radius: 2px; }
    .rd-hero h1 { font-family: 'Sora', sans-serif; font-size: clamp(24px, 3vw, 32px); font-weight: 800; color: #ffffff; line-height: 1.15; margin-bottom: 8px; letter-spacing: -0.02em; display: flex; align-items: center; gap: 16px; }
    .rd-hero h1 em { font-style: normal; color: var(--orange); }
    .rd-hero-sub { font-size: 15px; color: rgba(255,255,255,0.62); font-weight: 400; line-height: 1.6; }
    .rd-content { max-width: 1320px; margin: 0 auto; padding: 32px 48px 56px; }
    .rd-back-btn { background: none; border: none; font-size: 14px; font-weight: 600; color: var(--navy); cursor: pointer; padding: 0; margin-bottom: 24px; display: inline-flex; align-items: center; gap: 6px; font-family: 'Sora', sans-serif; }
    .rd-back-btn:hover { color: var(--orange); }
    .rd-layout { display: grid; grid-template-columns: 1fr 360px; gap: 24px; }
    .rd-main-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 20px; overflow: hidden; animation: fadeUp 0.4s ease both; }
    .rd-card-header { padding: 28px 32px; border-bottom: 1.5px solid var(--border); background: var(--light); }
    .rd-title-row { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
    .rd-request-title { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .rd-pills { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .rd-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 30px; font-size: 12px; font-weight: 700; letter-spacing: 0.03em; border: 1.5px solid; font-family: 'Sora', sans-serif; }
    .rd-pill-dot { width: 6px; height: 6px; border-radius: 50%; }
    .rd-section { padding: 28px 32px; border-bottom: 1.5px solid var(--border); }
    .rd-section:last-child { border-bottom: none; }
    .rd-section-title { font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 16px; letter-spacing: 0.02em; display: flex; align-items: center; gap: 8px; }
    .rd-description { font-size: 15px; color: var(--text); line-height: 1.7; white-space: pre-wrap; }
    .rd-meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--border); }
    .rd-meta-item { background: var(--white); padding: 20px 24px; }
    .rd-meta-key { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 6px; }
    .rd-meta-value { font-size: 15px; font-weight: 600; color: var(--text); }
    .rd-meta-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
    .rd-attachments { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .rd-attachment-item { padding: 12px 16px; background: var(--bg); border: 1.5px solid var(--border); border-radius: 10px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: all 0.2s; }
    .rd-attachment-item:hover { border-color: var(--navy); background: var(--white); }
    .rd-btn { padding: 10px 20px; border-radius: 12px; font-size: 13px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s; border: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .rd-btn-secondary { background: var(--white); border: 1.5px solid var(--border); color: var(--text); }
    .rd-btn-secondary:hover { border-color: var(--navy); }
    .rd-btn-warning { background: #f59e0b; color: white; }
    .rd-btn-warning:hover { background: #d97706; transform: translateY(-2px); }
    .rd-sidebar { display: flex; flex-direction: column; gap: 20px; }
    .rd-sidebar-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 18px; overflow: hidden; animation: fadeUp 0.45s 0.1s ease both; }
    .rd-sidebar-header { padding: 20px 24px; border-bottom: 1.5px solid var(--border); background: var(--light); }
    .rd-sidebar-header-title { font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: var(--navy); letter-spacing: 0.03em; }
    .rd-sidebar-body { padding: 24px; }
    .rd-info-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
    .rd-info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
    .rd-info-value { font-size: 15px; font-weight: 600; color: var(--text); }
    .rd-status-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 18px; overflow: hidden; }
    .rd-status-header { padding: 18px 24px; border-bottom: 1.5px solid var(--border); background: #fef2f2; }
    .rd-status-header-title { font-family: 'Sora', sans-serif; font-size: 12px; font-weight: 700; color: #991b1b; letter-spacing: 0.04em; display: flex; align-items: center; gap: 8px; }
    .rd-status-body { padding: 24px; }
    .rd-select { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; cursor: pointer; margin-bottom: 16px; }
    .rd-select:focus { outline: none; border-color: var(--navy); }
    .rd-textarea { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; resize: vertical; min-height: 80px; margin-bottom: 16px; }
    .rd-textarea:focus { outline: none; border-color: var(--navy); }
    .rd-btn-primary { background: var(--navy); color: white; width: 100%; }
    .rd-btn-primary:hover:not(:disabled) { background: var(--navy2); transform: translateY(-2px); }
    .rd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .rd-success-message { padding: 12px 16px; background: #d1fae5; border: 1.5px solid #10b981; border-radius: 12px; color: #065f46; font-size: 13px; font-weight: 500; margin-bottom: 16px; }
    .rd-error-message { padding: 12px 16px; background: #fee2e2; border: 1.5px solid #ef4444; border-radius: 12px; color: #991b1b; font-size: 13px; font-weight: 500; margin-bottom: 16px; }
    .rd-timeline { margin-top: 24px; }
    .rd-timeline-header { padding: 18px 24px; background: var(--white); border: 1.5px solid var(--border); border-radius: 18px 18px 0 0; font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: var(--navy); }
    .rd-timeline-list { background: var(--white); border: 1.5px solid var(--border); border-top: none; border-radius: 0 0 18px 18px; overflow: hidden; }
    .rd-timeline-item { padding: 20px 24px; border-bottom: 1.5px solid var(--border); display: flex; gap: 16px; }
    .rd-timeline-item:last-child { border-bottom: none; }
    .rd-timeline-icon { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
    .rd-timeline-content { flex: 1; }
    .rd-timeline-action { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .rd-timeline-meta { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .rd-timeline-note { padding: 10px 14px; background: var(--bg); border-radius: 10px; font-size: 13px; color: var(--text); margin-top: 8px; }

    /* Modal Styles */
    .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 24px; backdrop-filter: blur(3px); }
    .pr-modal { background: var(--white); border-radius: 24px; max-width: 600px; width: 100%; overflow: hidden; animation: scaleIn 0.22s ease both; box-shadow: 0 24px 80px rgba(0,0,0,0.25); max-height: 90vh; display: flex; flex-direction: column; }
    .pr-modal-header { padding: 28px 32px; background: linear-gradient(135deg, #002060 0%, #003090 100%); flex-shrink: 0; }
    .pr-modal-header-title { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 800; color: white; display: flex; align-items: center; gap: 10px; }
    .pr-modal-header-sub { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 8px; line-height: 1.5; }
    .pr-modal-body { padding: 32px; overflow-y: auto; flex: 1; }
    .pr-details-section { background: #f8fafc; border: 1.5px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 20px; }
    .pr-details-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
    .pr-details-row { display: flex; padding: 8px 0; border-bottom: 1px solid var(--border); }
    .pr-details-row:last-child { border-bottom: none; }
    .pr-details-label { font-size: 13px; font-weight: 600; color: var(--text); width: 130px; flex-shrink: 0; }
    .pr-details-value { font-size: 13px; color: var(--text); flex: 1; word-break: break-word; }
    .pr-warning-box { background: #fffbeb; border: 1.5px solid #fbbf24; border-radius: 12px; padding: 14px 18px; font-size: 13px; color: #92400e; line-height: 1.6; margin-bottom: 20px; display: flex; gap: 10px; align-items: flex-start; }
    .pr-warning-box-admin { background: #eef2ff; border: 1.5px solid #6366f1; border-radius: 12px; padding: 14px 18px; font-size: 13px; color: #4338ca; line-height: 1.6; margin-bottom: 20px; display: flex; gap: 10px; align-items: flex-start; }
    .pr-textarea { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; resize: vertical; min-height: 80px; margin-bottom: 8px; }
    .pr-textarea:focus { outline: none; border-color: #7c3aed; }
    .pr-error { background: #fee2e2; border: 1.5px solid #ef4444; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #991b1b; margin-bottom: 16px; }
    .pr-actions { display: flex; gap: 12px; margin-top: 8px; }
    .pr-btn { flex: 1; padding: 13px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .pr-btn-approve { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; }
    .pr-btn-approve:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(16,185,129,0.35); }
    .pr-btn-reject { background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%); color: white; }
    .pr-btn-reject:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(220,38,38,0.35); }
    .pr-btn-cancel { background: var(--white); border: 1.5px solid var(--border); color: var(--text); }
    .pr-btn-cancel:hover:not(:disabled) { border-color: var(--navy); background: #f8fafc; }
    .pr-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

    /* Result Modals */
    .result-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; justify-content: center; align-items: center; z-index: 10000; padding: 24px; backdrop-filter: blur(3px); }
    .result-modal { background: var(--white); border-radius: 24px; max-width: 500px; width: 100%; overflow: hidden; animation: scaleIn 0.22s ease both; }
    .result-modal-header-approve { padding: 28px 32px; background: linear-gradient(135deg, #065f46 0%, #059669 100%); }
    .result-modal-header-admin { padding: 28px 32px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); }
    .result-modal-header-reject { padding: 28px 32px; background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%); }
    .result-modal-title { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 800; color: white; }
    .result-modal-sub { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 6px; }
    .result-modal-body { padding: 32px; }
    .temp-password-box { background: #f0fdf4; border: 2px dashed #10b981; border-radius: 14px; padding: 20px; text-align: center; margin-bottom: 16px; }
    .temp-password-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #059669; margin-bottom: 10px; }
    .temp-password-value { font-family: 'Courier New', monospace; font-size: 22px; font-weight: 700; color: #065f46; letter-spacing: 0.12em; background: white; border: 1.5px solid #a7f3d0; border-radius: 10px; padding: 12px 20px; display: inline-block; margin-bottom: 10px; }
    .result-info { font-size: 13px; color: #374151; line-height: 1.6; margin-bottom: 20px; }
    .result-actions { display: flex; gap: 12px; }
    .result-btn { flex: 1; padding: 13px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; border: none; }
    .result-btn-done { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; }
    .result-btn-copy { background: var(--white); border: 1.5px solid var(--border); color: var(--text); }

    /* Review Button */
    .review-button-container { background: #fef3c7; border: 1.5px solid #fbbf24; border-radius: 16px; padding: 20px; margin-bottom: 24px; text-align: center; }
    .review-button-container p { font-size: 14px; color: #92400e; margin-bottom: 12px; }
    .rd-btn-review { background: #f59e0b; color: white; padding: 12px 24px; font-size: 14px; }
    .rd-btn-review:hover { background: #d97706; transform: translateY(-2px); }

    .rd-loading { min-height: 100vh; background: var(--bg); display: flex; align-items: center; justify-content: center; }
    .rd-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--navy); animation: spin 0.9s linear infinite; }

    @media (max-width: 1024px) { .rd-layout { grid-template-columns: 1fr; } .rd-meta-grid { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .rd-hero { padding: 32px 20px; } .rd-content { padding: 20px; } .pr-modal-body { padding: 20px; } .pr-actions { flex-direction: column; } .pr-details-row { flex-direction: column; gap: 4px; } .pr-details-label { width: 100%; } }
  `;

  if (isLoading) {
    return (
      <div className="rd-page">
        <style>{sharedCSS}</style>
        <div className="rd-loading">
          <div style={{ textAlign: 'center' }}>
            <div className="rd-spinner" />
            <div style={{ marginTop: 14, fontSize: 14, color: '#64748b' }}>Loading request details…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="rd-page">
        <style>{sharedCSS}</style>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 48 }}>🚫</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#64748b' }}>Request not found</div>
          <button className="rd-btn rd-btn-secondary" onClick={() => navigate('/requests')}>← Back to Requests</button>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyles(request.status);
  const priorityStyle = getPriorityStyles(request.priority);
  const historyEvents = request.history?.length > 0
    ? request.history
    : [{ action: 'created', by: request.raisedBy?.name || 'Unknown', at: request.createdAt }];

  const isPendingApproval = request.status === 'pending_approval';
  const showReviewButton = hasUserCancelled && isPendingApproval && (isPasswordReset || isAdminAccess);

  return (
    <div className="rd-page">
      <style>{sharedCSS}</style>

      <div className="rd-hero">
        <div className="rd-hero-inner">
          <div className="rd-hero-eyebrow"><div className="rd-hero-eyebrow-line" />Service Request</div>
          <h1>
            <span>{request.requestNumber}</span>
            <em>•</em>
            <span style={{ fontSize: 'clamp(18px, 2vw, 24px)' }}>{request.service?.name}</span>
          </h1>
          <p className="rd-hero-sub">View and manage service request details, track progress, and update status.</p>
        </div>
      </div>

      <div className="rd-content">
        <button className="rd-back-btn" onClick={() => navigate('/requests')}>← Back to Requests</button>

        {showReviewButton && (
          <div className="review-button-container">
            <p>{isPasswordReset ? '🔐 This password reset request is awaiting your review and approval.' : '🛡️ This admin access request is awaiting your review and approval.'}</p>
            <button className="rd-btn rd-btn-review" onClick={() => {
              setShowPRModal(true);
              setHasUserCancelled(false);
              setPrAction(null);
              setPrError('');
              setRejectReason('');
              setAdminNote('');
            }}>
              📋 Review Request Again
            </button>
          </div>
        )}

        <div className="rd-layout">
          {/* Main Column */}
          <div>
            <div className="rd-main-card">
              <div className="rd-card-header">
                <div className="rd-title-row">
                  <div>
                    <div className="rd-request-title">{request.service?.categoryName || 'Service Request'}</div>
                    <div style={{ fontSize: 14, color: '#64748b' }}>Created {formatDate(request.createdAt)}</div>
                  </div>
                </div>
                <div className="rd-pills">
                  <span className="rd-pill" style={{ background: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}>
                    <span className="rd-pill-dot" style={{ background: statusStyle.color }} />
                    {request.status?.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  <span className="rd-pill" style={{ background: priorityStyle.bg, color: priorityStyle.color, borderColor: priorityStyle.border }}>
                    {priorityStyle.icon} {request.priority?.toUpperCase()}
                  </span>
                  {isPasswordReset && (
                    <span className="rd-pill" style={{ background: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' }}>🔑 Password Reset</span>
                  )}
                  {isAdminAccess && (
                    <span className="rd-pill" style={{ background: '#dbeafe', color: '#1e40af', borderColor: '#3b82f6' }}>🛡️ Admin Access</span>
                  )}
                </div>
              </div>

              <div className="rd-section">
                <div className="rd-section-title"><span>📝</span> Description</div>
                <div className="rd-description">{request.description}</div>
                {attachmentList.length > 0 && (
                  <div className="rd-attachments">
                    {attachmentList.map((att, idx) => (
                      <div key={idx} className="rd-attachment-item" onClick={() => openAttachmentViewer(att)}>
                        <span>📎</span><span>{att.fileName}</span>
                      </div>
                    ))}
                    {attachmentList.length > 1 && (
                      <button className="rd-btn rd-btn-secondary" onClick={downloadAllAttachments}>Download All</button>
                    )}
                  </div>
                )}
              </div>

              <div className="rd-meta-grid">
                <div className="rd-meta-item">
                  <div className="rd-meta-key">Requested By</div>
                  <div className="rd-meta-value">{request.raisedBy?.name}</div>
                  <div className="rd-meta-sub">{request.raisedBy?.mail}</div>
                </div>
                {request.onBehalf?.enabled && request.onBehalf?.user && (
                  <div className="rd-meta-item">
                    <div className="rd-meta-key">On Behalf Of</div>
                    <div className="rd-meta-value">{request.onBehalf.user.name}</div>
                    <div className="rd-meta-sub">{request.onBehalf.user.mail}</div>
                  </div>
                )}
                {isPasswordReset && (
                  <div className="rd-meta-item" style={{ background: '#faf5ff', borderLeft: '3px solid #7c3aed' }}>
                    <div className="rd-meta-key" style={{ color: '#7c3aed' }}>Password Reset Target</div>
                    <div className="rd-meta-value">{targetInfo.name}</div>
                    <div className="rd-meta-sub">{targetInfo.email}</div>
                  </div>
                )}
                {request.assignmentGroup?.members?.length > 0 && (
                  <div className="rd-meta-item">
                    <div className="rd-meta-key">Assigned Group Members</div>
                    <div className="rd-meta-value">{request.assignmentGroup.members.map(m => m.name || m.email).join(', ')}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="rd-timeline">
              <div className="rd-timeline-header">📋 Request Timeline</div>
              <div className="rd-timeline-list">
                {historyEvents.map((event, idx) => {
                  const isCreated = event.action === 'created';
                  const isResolved = event.action === 'resolved';
                  const isClosed = event.action === 'closed';
                  const isApproved = event.action === 'approved';
                  const iconColor = isCreated ? '#002060' : isResolved ? '#10b981' : isClosed ? '#9ca3af' : isApproved ? '#e98404' : '#3b82f6';
                  return (
                    <div key={idx} className="rd-timeline-item">
                      <div className="rd-timeline-icon" style={{ background: iconColor }} />
                      <div className="rd-timeline-content">
                        <div className="rd-timeline-action">
                          {event.action === 'created' && '📝 Request Created'}
                          {event.action === 'status_updated' && '↺ Status Updated'}
                          {event.action === 'approved' && '✓ Request Approved'}
                          {event.action === 'resolved' && '✅ Request Resolved'}
                          {event.action === 'closed' && '🔒 Request Closed'}
                          {event.action === 'cancelled' && '✕ Request Cancelled'}
                          {!['created','status_updated','approved','resolved','closed','cancelled'].includes(event.action) && event.action}
                        </div>
                        <div className="rd-timeline-meta">{formatDate(event.at)} · {event.by || 'System'}</div>
                        {(event.reason || event.notes) && (
                          <div className="rd-timeline-note">{event.reason || event.notes}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="rd-sidebar">
            <div className="rd-sidebar-card">
              <div className="rd-sidebar-header">
                <span className="rd-sidebar-header-title">ℹ️ Request Information</span>
              </div>
              <div className="rd-sidebar-body">
                <div className="rd-info-row">
                  <span className="rd-info-label">Status</span>
                  <span className="rd-pill" style={{ background: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border, width: 'fit-content' }}>
                    <span className="rd-pill-dot" style={{ background: statusStyle.color }} />
                    {request.status?.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <div className="rd-info-row">
                  <span className="rd-info-label">Priority</span>
                  <span className="rd-pill" style={{ background: priorityStyle.bg, color: priorityStyle.color, borderColor: priorityStyle.border, width: 'fit-content' }}>
                    {priorityStyle.icon} {request.priority?.toUpperCase()}
                  </span>
                </div>
                <div className="rd-info-row">
                  <span className="rd-info-label">Service</span>
                  <span className="rd-info-value">{request.service?.name}</span>
                </div>
                <div className="rd-info-row">
                  <span className="rd-info-label">Category</span>
                  <span className="rd-info-value">{request.service?.categoryName || '—'}</span>
                </div>
                {isPasswordReset && targetInfo.deliveryEmail && (
                  <div className="rd-info-row">
                    <span className="rd-info-label">Delivery Email</span>
                    <span className="rd-info-value">{targetInfo.deliveryEmail}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Update Card */}
            {authority === 'admin' && (!isPendingApproval || !(isPasswordReset || isAdminAccess) || hasUserCancelled) && (
              <div className="rd-status-card">
                <div className="rd-status-header">
                  <span className="rd-status-header-title"><span>🔄</span> Update Status</span>
                </div>
                <div className="rd-status-body">
                  <select className="rd-select" value={selectedStatus} onChange={(e) => { setSelectedStatus(e.target.value); setStatusUpdateError(''); setStatusUpdateSuccess(''); }}>
                    <option value="">Select new status...</option>
                    {REQUEST_STATUSES.map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>
                    ))}
                  </select>
                  <textarea className="rd-textarea" placeholder="Add update notes (optional)..." value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                  {statusUpdateSuccess && <div className="rd-success-message">✓ {statusUpdateSuccess}</div>}
                  {statusUpdateError && <div className="rd-error-message">⚠ {statusUpdateError}</div>}
                  <button className="rd-btn rd-btn-primary" onClick={handleStatusUpdate} disabled={statusUpdateLoading || !selectedStatus || selectedStatus === request.status}>
                    {statusUpdateLoading ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Updating...</> : 'Update & Notify'}
                  </button>
                  <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#64748b' }}>✉️ Notification will be sent to requester</div>
                </div>
              </div>
            )}

            {/* Awaiting Decision Message */}
            {authority === 'admin' && isPendingApproval && (isPasswordReset || isAdminAccess) && !hasUserCancelled && (
              <div className="rd-status-card">
                <div className="rd-status-body" style={{ textAlign: 'center', padding: '24px' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{isPasswordReset ? '🔐' : '🛡️'}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#6b21a8', marginBottom: 8 }}>Awaiting Your Decision</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {isPasswordReset 
                      ? 'Please review and approve/reject the password reset request before updating status.'
                      : 'Please review and approve/reject the admin access request before updating status.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== PASSWORD RESET MODAL ==================== */}
      {showPRModal && isPasswordReset && (
        <div className="pr-modal-overlay" onClick={handleCancel}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div className="pr-modal-header">
              <div className="pr-modal-header-title"><span>🔐</span> Password Reset Request</div>
              <div className="pr-modal-header-sub">Please review the details below and take appropriate action</div>
            </div>
            <div className="pr-modal-body">
              <div className="pr-details-section">
                <div className="pr-details-title"><span>📋</span> REQUEST DETAILS</div>
                <div className="pr-details-row"><div className="pr-details-label">Request Type:</div><div className="pr-details-value">{request.service?.name}</div></div>
                <div className="pr-details-row"><div className="pr-details-label">Request Number:</div><div className="pr-details-value">{request.requestNumber}</div></div>
                <div className="pr-details-row"><div className="pr-details-label">Created:</div><div className="pr-details-value">{formatDate(request.createdAt)}</div></div>
              </div>
              <div className="pr-details-section">
                <div className="pr-details-title"><span>👤</span> REQUESTER INFORMATION</div>
                <div className="pr-details-row"><div className="pr-details-label">Name:</div><div className="pr-details-value">{request.raisedBy?.name}</div></div>
                <div className="pr-details-row"><div className="pr-details-label">Email:</div><div className="pr-details-value">{request.raisedBy?.mail}</div></div>
              </div>
              {request.onBehalf?.enabled && request.onBehalf?.user && (
                <div className="pr-details-section">
                  <div className="pr-details-title"><span>🔄</span> ON BEHALF OF</div>
                  <div className="pr-details-row"><div className="pr-details-label">Name:</div><div className="pr-details-value">{request.onBehalf.user.name}</div></div>
                  <div className="pr-details-row"><div className="pr-details-label">Email:</div><div className="pr-details-value">{request.onBehalf.user.mail}</div></div>
                </div>
              )}
              <div className="pr-details-section">
                <div className="pr-details-title"><span>🎯</span> PASSWORD RESET FOR</div>
                <div className="pr-details-row"><div className="pr-details-label">Name:</div><div className="pr-details-value">{targetInfo.name}</div></div>
                <div className="pr-details-row"><div className="pr-details-label">Email:</div><div className="pr-details-value">{targetInfo.email}</div></div>
                <div className="pr-details-row"><div className="pr-details-label">Delivery Email:</div><div className="pr-details-value">{targetInfo.deliveryEmail}</div></div>
              </div>
              <div className="pr-warning-box"><span>⚠️</span><span>Approving will immediately reset the password. A temporary password will be sent to <strong>{targetInfo.deliveryEmail}</strong>.</span></div>
              <textarea className="pr-textarea" placeholder="Add a note to the requester (optional)..." value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} />
              {prAction === 'reject' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Reason for rejection <span style={{ color: '#ef4444' }}>*</span></div>
                  <textarea className="pr-textarea" placeholder="Please provide a reason for rejecting this request..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} autoFocus />
                </div>
              )}
              {prError && <div className="pr-error">⚠ {prError}</div>}
              {!prAction ? (
                <div className="pr-actions">
                  <button className="pr-btn pr-btn-approve" onClick={() => setPrAction('approve')}>✓ Approve</button>
                  <button className="pr-btn pr-btn-reject" onClick={() => setPrAction('reject')}>✗ Reject</button>
                  <button className="pr-btn pr-btn-cancel" onClick={handleCancel}>✕ Cancel</button>
                </div>
              ) : (
                <div className="pr-actions">
                  {prAction === 'approve' ? (
                    <button className="pr-btn pr-btn-approve" onClick={handleApprove} disabled={prLoading}>
                      {prLoading ? <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Processing...</> : '✓ Confirm Approve'}
                    </button>
                  ) : (
                    <button className="pr-btn pr-btn-reject" onClick={handleReject} disabled={prLoading}>
                      {prLoading ? <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Processing...</> : '✗ Confirm Reject'}
                    </button>
                  )}
                  <button className="pr-btn pr-btn-cancel" onClick={() => { setPrAction(null); setRejectReason(''); setPrError(''); }} disabled={prLoading}>Back</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== ADMIN ACCESS MODAL ==================== */}
      {showPRModal && isAdminAccess && (
        <div className="pr-modal-overlay" onClick={handleCancel}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div className="pr-modal-header">
              <div className="pr-modal-header-title"><span>🛡️</span> Admin Access Request</div>
              <div className="pr-modal-header-sub">Please review the details below and take appropriate action</div>
            </div>
            <div className="pr-modal-body">
              <div className="pr-details-section">
                <div className="pr-details-title"><span>📋</span> REQUEST DETAILS</div>
                <div className="pr-details-row"><div className="pr-details-label">Request Type:</div><div className="pr-details-value">{request.service?.name}</div></div>
                <div className="pr-details-row"><div className="pr-details-label">Request Number:</div><div className="pr-details-value">{request.requestNumber}</div></div>
                <div className="pr-details-row"><div className="pr-details-label">Created:</div><div className="pr-details-value">{formatDate(request.createdAt)}</div></div>
              </div>
              <div className="pr-details-section">
                <div className="pr-details-title"><span>👤</span> REQUESTER INFORMATION</div>
                <div className="pr-details-row"><div className="pr-details-label">Name:</div><div className="pr-details-value">{request.raisedBy?.name}</div></div>
                <div className="pr-details-row"><div className="pr-details-label">Email:</div><div className="pr-details-value">{request.raisedBy?.mail}</div></div>
              </div>
              {request.description && (
                <div className="pr-details-section">
                  <div className="pr-details-title"><span>📝</span> DESCRIPTION / REASON</div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{request.description}</div>
                </div>
              )}
              {attachmentList.length > 0 && (
                <div className="pr-details-section">
                  <div className="pr-details-title"><span>📎</span> ATTACHMENTS</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {attachmentList.map((att, idx) => (
                      <button key={idx} onClick={() => openAttachmentViewer(att)} style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: 12, cursor: 'pointer' }}>📄 {att.fileName}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="pr-warning-box-admin">
                <span>⚠️</span>
                <span>Approving will add <strong>{request.raisedBy?.name || request.raisedBy?.mail}</strong> to the <strong>Device Administrators</strong> group in Azure AD.</span>
              </div>
              <textarea className="pr-textarea" placeholder="Add a note to the requester (optional)..." value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} />
              {prAction === 'reject' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Reason for rejection <span style={{ color: '#ef4444' }}>*</span></div>
                  <textarea className="pr-textarea" placeholder="Please provide a reason for rejecting this admin access request..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} autoFocus />
                </div>
              )}
              {prError && <div className="pr-error">⚠ {prError}</div>}
              {!prAction ? (
                <div className="pr-actions">
                  <button className="pr-btn pr-btn-approve" onClick={() => setPrAction('approve')}>✓ Approve</button>
                  <button className="pr-btn pr-btn-reject" onClick={() => setPrAction('reject')}>✗ Reject</button>
                  <button className="pr-btn pr-btn-cancel" onClick={handleCancel}>✕ Cancel</button>
                </div>
              ) : (
                <div className="pr-actions">
                  {prAction === 'approve' ? (
                    <button className="pr-btn pr-btn-approve" onClick={handleApprove} disabled={prLoading}>
                      {prLoading ? <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Processing...</> : '✓ Confirm Approve'}
                    </button>
                  ) : (
                    <button className="pr-btn pr-btn-reject" onClick={handleReject} disabled={prLoading}>
                      {prLoading ? <><span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Processing...</> : '✗ Confirm Reject'}
                    </button>
                  )}
                  <button className="pr-btn pr-btn-cancel" onClick={() => { setPrAction(null); setRejectReason(''); setPrError(''); }} disabled={prLoading}>Back</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Result Modal - Password Reset Approved */}
      {prResult?.type === 'approve' && (
        <div className="result-modal-overlay" onClick={closeResultModal}>
          <div className="result-modal" onClick={e => e.stopPropagation()}>
            <div className="result-modal-header-approve">
              <div className="result-modal-title">✅ Password Reset Complete</div>
              <div className="result-modal-sub">Temporary password issued successfully</div>
            </div>
            <div className="result-modal-body">
              <div className="temp-password-box">
                <div className="temp-password-label">Temporary Password</div>
                <div className="temp-password-value">{prResult.tempPassword}</div>
                <div className="temp-password-note" style={{ fontSize: 12, marginTop: 8 }}>Emailed to <strong>{prResult.targetEmail}</strong></div>
              </div>
              <div className="result-info">✓ Password has been reset successfully<br />✓ Request status updated to "Resolved"</div>
              <div className="result-actions">
                <button className="result-btn result-btn-copy" onClick={() => { navigator.clipboard.writeText(prResult.tempPassword); alert('Copied!'); }}>📋 Copy</button>
                <button className="result-btn result-btn-done" onClick={closeResultModal}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result Modal - Admin Access Approved */}
      {prResult?.type === 'admin_approve' && (
        <div className="result-modal-overlay" onClick={closeResultModal}>
          <div className="result-modal" onClick={e => e.stopPropagation()}>
            <div className="result-modal-header-admin">
              <div className="result-modal-title">✅ Admin Access Granted</div>
              <div className="result-modal-sub">User added to Device Administrators group</div>
            </div>
            <div className="result-modal-body">
              <div className="result-info">✓ User added to Device Administrators group<br />✓ Email notification sent<br />✓ Request status updated to "Resolved"</div>
              <div className="result-actions">
                <button className="result-btn result-btn-done" onClick={closeResultModal}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result Modal - Rejected */}
      {prResult?.type === 'reject' && (
        <div className="result-modal-overlay" onClick={closeResultModal}>
          <div className="result-modal" onClick={e => e.stopPropagation()}>
            <div className="result-modal-header-reject">
              <div className="result-modal-title">✕ Request Rejected</div>
              <div className="result-modal-sub">The request has been rejected</div>
            </div>
            <div className="result-modal-body">
              <div className="result-info">✓ Request rejected<br />✓ Requester notified<br />✓ Status updated to "Cancelled"</div>
              <div className="result-actions">
                <button className="result-btn result-btn-done" onClick={closeResultModal}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Modal */}
      {attachmentModalOpen && activeAttachment && (
        <div className="pr-modal-overlay" onClick={() => setAttachmentModalOpen(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="pr-modal-header" style={{ padding: '20px 24px' }}>
              <div className="pr-modal-header-title" style={{ fontSize: '16px' }}><span>📎</span> {activeAttachment.fileName}</div>
              <button onClick={() => setAttachmentModalOpen(false)} style={{ position: 'absolute', right: '24px', top: '24px', background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <div className="pr-modal-body" style={{ textAlign: 'center' }}>
              {isImageType(activeAttachment.fileType) ? (
                <img src={imagePreviewUrl} alt={activeAttachment.fileName} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px' }} />
              ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ marginBottom: 20, color: '#64748b' }}>This file type cannot be previewed</div>
                  <button className="rd-btn rd-btn-primary" style={{ width: 'auto', padding: '12px 24px' }} onClick={() => downloadAttachment(activeAttachment)}>Download File</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RequestDetails;