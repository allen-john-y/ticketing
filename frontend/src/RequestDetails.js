// RequestDetails.js - Complete Version with Assignment Feature FIXED
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// ==================== ALERT MODAL ====================
function AlertModal({ open, type = 'success', title, message, onClose }) {
  if (!open) return null;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const colors = {
    success: { bg: '#d1fae5', border: '#10b981', title: '#065f46', btn: '#10b981' },
    error:   { bg: '#fee2e2', border: '#ef4444', title: '#991b1b', btn: '#ef4444' },
    warning: { bg: '#fef3c7', border: '#f59e0b', title: '#92400e', btn: '#f59e0b' },
    info:    { bg: '#dbeafe', border: '#3b82f6', title: '#1e40af', btn: '#3b82f6' },
  };
  const c = colors[type] || colors.info;
  return (
    <div className="rd-modal-overlay" onClick={onClose}>
      <div className="rd-modal rd-alert-modal" onClick={e => e.stopPropagation()}>
        <div className="rd-alert-modal-inner" style={{ borderTop: `4px solid ${c.border}` }}>
          <div className="rd-alert-icon" style={{ background: c.bg, color: c.title }}>
            <span style={{ fontSize: 28 }}>{icons[type]}</span>
          </div>
          {title && <div className="rd-alert-title" style={{ color: c.title }}>{title}</div>}
          <div className="rd-alert-message">{message}</div>
          <button
            className="rd-btn"
            style={{ background: c.btn, color: '#fff', border: 'none', width: '100%', marginTop: 4 }}
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== CONFIRM MODAL ====================
function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, danger }) {
  if (!open) return null;
  return (
    <div className="rd-modal-overlay" onClick={onCancel}>
      <div className="rd-modal rd-confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="rd-alert-modal-inner" style={{ borderTop: `4px solid ${danger ? '#ef4444' : '#3b82f6'}` }}>
          <div className="rd-alert-icon" style={{ background: danger ? '#fee2e2' : '#dbeafe', color: danger ? '#991b1b' : '#1e40af' }}>
            <span style={{ fontSize: 28 }}>{danger ? '⚠️' : '❓'}</span>
          </div>
          {title && <div className="rd-alert-title" style={{ color: danger ? '#991b1b' : '#1e40af' }}>{title}</div>}
          <div className="rd-alert-message">{message}</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button className="rd-btn rd-btn-secondary" style={{ flex: 1 }} onClick={onCancel}>{cancelLabel}</button>
            <button
              className="rd-btn"
              style={{ flex: 1, background: danger ? '#ef4444' : '#3b82f6', color: '#fff', border: 'none' }}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

  // PR/Approval modal states
  const [showPRModal, setShowPRModal] = useState(false);
  const [prAction, setPrAction] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [prLoading, setPrLoading] = useState(false);
  const [prResult, setPrResult] = useState(null);
  const [prError, setPrError] = useState('');
  const [hasUserCancelled, setHasUserCancelled] = useState(false);

  // Assignment states
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [assignGroupModalOpen, setAssignGroupModalOpen] = useState(false);
  const [allAssignmentGroups, setAllAssignmentGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Alert / Confirm modal states
  const [alertModal, setAlertModal] = useState({ open: false, type: 'success', title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', danger: false, onConfirm: null, onCancel: null });

  const showAlert = (message, type = 'success', title = '') =>
    setAlertModal({ open: true, type, title, message });
  const closeAlert = () => setAlertModal(s => ({ ...s, open: false }));
  const showConfirm = ({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }) =>
    setConfirmModal({ open: true, title, message, confirmLabel: confirmLabel || 'Confirm', cancelLabel: cancelLabel || 'Cancel', danger: !!danger, onConfirm, onCancel });
  const closeConfirm = () => setConfirmModal(s => ({ ...s, open: false, onConfirm: null, onCancel: null }));

  const REQUEST_STATUSES = ["open", "in_progress", "pending_approval", "resolved", "closed", "cancelled"];

  const currentUserEmail = accounts?.[0]?.username || '';
  const currentUserName = accounts?.[0]?.name || '';

  // ==================== HELPER FUNCTIONS ====================
  const getMemberEmail = (member) => {
    if (!member) return '';
    const raw =
      member.email || member.mail || member.userPrincipalName ||
      member.userPrincipalname || member.userPrincipal ||
      (member.user && (member.user.mail || member.user.userPrincipalName)) || '';
    return String(raw || '').trim().toLowerCase();
  };

  const getMemberId = (member) => {
    if (!member) return '';
    return member.id || member._id || member.objectId || member.userId || member.azureObjectId || '';
  };

  const normalizeRequestAssignedMember = (data) => {
    if (!data) return data;
    const normalized = { ...data };
    const assigned = normalized.assignedMember ?? normalized.assignee ?? normalized.assignedTo ?? null;
    normalized.assignedMember = assigned;
    return normalized;
  };

  // ==================== FIXED ACCESS FUNCTIONS ====================
  const isInOriginalGroup = () => {
    if (!request || !currentUserEmail) return false;
    const originalMembers = request.originalGroupMembers || [];
    const userEmailLower = currentUserEmail.toLowerCase();
    const userId = accounts?.[0]?.localAccountId || '';
    return originalMembers.some((member) => {
      const memberEmail = getMemberEmail(member);
      const memberId = getMemberId(member);
      return (memberEmail && memberEmail === userEmailLower) || 
             (memberId && userId && String(memberId) === String(userId));
    });
  };

  const isInCurrentGroup = () => {
    if (!request || !currentUserEmail) return false;
    const groupMembers = request.assignmentGroup?.members || [];
    const userEmailLower = currentUserEmail.toLowerCase();
    const userId = accounts?.[0]?.localAccountId || '';
    return groupMembers.some((member) => {
      const memberEmail = getMemberEmail(member);
      const memberId = getMemberId(member);
      return (memberEmail && memberEmail === userEmailLower) || 
             (memberId && userId && String(memberId) === String(userId));
    });
  };

  // FIXED: Full access = Admin OR (in current group AND not just an original member after reassignment)
  const hasFullAccess = () => {
  // Admin is ONLY in original group? NO assignment buttons
  if (authority === 'admin') {
    const inCurrent = isInCurrentGroup();
    const inOriginal = isInOriginalGroup();
    
    // If request was reassigned and admin is NOT in current group
    if (request?.originalAssignmentGroupId && !inCurrent) {
      return false; // Admin loses full access if not in current group
    }
    
    // Admin gets full access only if they are in current group
    return inCurrent;
  }
  
  const inCurrent = isInCurrentGroup();
  const inOriginal = isInOriginalGroup();
  
  if (request?.originalAssignmentGroupId && inOriginal && !inCurrent) {
    return false;
  }
  
  return inCurrent;
};

  // View only = In original group BUT not in current group (after reassignment)
  const hasViewOnlyAccess = () => {
    if (authority === 'admin') return false;
    const inOriginal = isInOriginalGroup();
    const inCurrent = isInCurrentGroup();
    
    // Only view-only if they're in original group AND not in current group
    return inOriginal && !inCurrent;
  };

  const isCurrentUserGroupMember = () => isInCurrentGroup();

  const isAssignedToMe = () => {
    if (!request || !currentUserEmail) return false;
    const assignedMemberEmail = (request.assignedMember?.memberEmail || '').toString().toLowerCase();
    const assignedMemberId = (request.assignedMember?.memberId || '').toString();
    const userId = accounts?.[0]?.localAccountId || '';
    return assignedMemberEmail === currentUserEmail.toLowerCase() ||
      (assignedMemberId && userId && String(assignedMemberId) === String(userId));
  };

  const getAssignedMember = () => request?.assignedMember || null;

  // ==================== FETCH ALL ASSIGNMENT GROUPS ====================
  const fetchAllAssignmentGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await axios.get(`${BACKEND}/api/assignment-groups`);
      setAllAssignmentGroups(res.data || []);
    } catch (err) {
      showAlert('Failed to load assignment groups', 'error');
    } finally {
      setLoadingGroups(false);
    }
  };

  // ==================== CHECK AUTHORITY ====================
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
        const normalized = normalizeRequestAssignedMember(res.data);
        setRequest(normalized);
        setSelectedStatus(normalized.status || '');

        const list = [];
        if (normalized.attachments && Array.isArray(normalized.attachments)) {
          normalized.attachments.forEach(a => {
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

  // ✅ Check if current user is in assignment group
  const isUserInAssignmentGroup = () => {
    if (!request || !accounts?.[0]) return false;
    const email = (accounts[0]?.username || '').toLowerCase();
    const userId = (accounts[0]?.localAccountId || '').toLowerCase();
    const members = request.assignmentGroup?.members || [];
    return members.some(member => {
      const memberEmail = (member.email || member.mail || '').toLowerCase();
      const memberId = (member.id || member.memberId || '').toLowerCase();
      return memberEmail === email || memberEmail === userId || memberId === userId;
    });
  };

  // Auto-open PR/approval modal
  useEffect(() => {
    if (!request || !accounts?.[0] || hasUserCancelled) return;
    const email = (accounts[0]?.username || '').toLowerCase();
    const userId = (accounts[0]?.localAccountId || '').toLowerCase();
    const serviceName = request.service?.name || '';
    const isPR = serviceName.toLowerCase().includes('password reset');
    const isAdminAccess = serviceName.toLowerCase().includes('admin access') ||
                          serviceName.toLowerCase().includes('device admin');
    const needsApproval = isPR || isAdminAccess;
    const assignedEmail = (request.assignedMember?.memberEmail || '').toLowerCase();
    const assignedMemberId = (request.assignedMember?.memberId || '').toLowerCase();
    const isAssignedMember =
      (assignedEmail && email === assignedEmail) ||
      (assignedMemberId && userId === assignedMemberId) ||
      (assignedEmail && userId === assignedEmail);
    const inAssignmentGroup = isUserInAssignmentGroup();
    const terminal = ['resolved', 'closed', 'cancelled'];
    const isTerminal = terminal.includes(request.status);
    const isAuthorized = isAssignedMember || inAssignmentGroup;
    if (needsApproval && isAuthorized && !isTerminal && !prResult) {
      setShowPRModal(true);
      setHasUserCancelled(false);
      setPrAction(null);
      setPrError('');
      setRejectReason('');
      setAdminNote('');
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
    if (!downloadable.length) { showAlert('No downloadable attachments available.', 'warning'); return; }
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

  // ==================== UNASSIGN ====================
  const handleUnassign = async () => {
    if (!request?.assignedMember) { showAlert('Request is not assigned.', 'warning'); return; }
    const assigned = request.assignedMember;
    showConfirm({
      title: 'Remove Assignment',
      message: `Remove assignment from ${assigned.memberName || assigned.memberEmail || 'assigned user'}?`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        closeConfirm();
        try {
          setAssigning(true);
          const payload = {
            assignedMember: null,
            notes: `Unassigned ${assigned.memberName || assigned.memberEmail || ''} by ${currentUserName}`,
            updatedBy: { id: accounts[0]?.localAccountId, name: currentUserName, mail: currentUserEmail },
          };
          await axios.patch(`${BACKEND}/api/requests/${id}`, payload);
          const refreshed = await axios.get(`${BACKEND}/api/requests/${id}`);
          const normalized = normalizeRequestAssignedMember(refreshed.data);
          setRequest(normalized);
          showAlert('Assignment has been removed successfully.', 'success', 'Unassigned');
        } catch (err) {
          showAlert('Failed to remove assignment. ' + (err?.response?.data?.message || err.message), 'error', 'Unassign Failed');
        } finally {
          setAssigning(false);
        }
      },
    });
  };

  // ==================== ASSIGN TO ME ====================
  const handleAssignToMe = async () => {
    setAssignmentModalOpen(false);
    setSelectedMember(null);
    if (!request) { showAlert('No request data', 'error'); return; }
    const groupMembers = request.assignmentGroup?.members || [];
    const userId = accounts?.[0]?.localAccountId || '';
    const currentUserMember = groupMembers.find((member) => {
      const memberEmail = getMemberEmail(member);
      const memberId = getMemberId(member);
      return memberEmail === currentUserEmail.toLowerCase() || (memberId && userId && String(memberId) === String(userId));
    });
    if (!currentUserMember) {
      showAlert('You are not a member of the current assignment group.', 'error', 'Not a Group Member');
      return;
    }
    const payloadAssigned = {
      memberId: getMemberId(currentUserMember) || currentUserMember.id || currentUserMember._id,
      memberName: currentUserMember.name || currentUserName,
      memberEmail: currentUserMember.email || currentUserMember.mail || currentUserEmail,
    };
    try {
      setAssigning(true);
      await axios.patch(`${BACKEND}/api/requests/${id}`, {
        assignedMember: payloadAssigned,
        notes: `Assigned to myself (${currentUserName})`,
        updatedBy: { id: accounts[0]?.localAccountId, name: currentUserName, mail: currentUserEmail },
      });
      const refreshed = await axios.get(`${BACKEND}/api/requests/${id}`);
      const normalized = normalizeRequestAssignedMember(refreshed.data);
      setRequest(normalized);
      showAlert(`Request has been assigned to you (${currentUserName}).`, 'success', 'Assigned Successfully');
    } catch (err) {
      showAlert('Failed to assign request to yourself. ' + (err?.response?.data?.message || err.message), 'error', 'Assignment Failed');
    } finally {
      setAssigning(false);
    }
  };

  // ==================== ASSIGN TO MEMBER ====================
  const handleAssignToMember = async () => {
    if (!selectedMember) { showAlert('Please select a member to assign.', 'warning'); return; }
    const payloadAssigned = {
      memberId: getMemberId(selectedMember) || selectedMember.id || selectedMember._id,
      memberName: selectedMember.name,
      memberEmail: selectedMember.email || selectedMember.mail || selectedMember.userPrincipalName || '',
    };
    setAssignmentModalOpen(false);
    showConfirm({
      title: 'Confirm Assignment',
      message: `Assign this request to ${selectedMember.name} (${selectedMember.email || selectedMember.mail || 'unknown email'})?`,
      confirmLabel: 'Assign',
      danger: false,
      onConfirm: async () => {
        closeConfirm();
        try {
          setAssigning(true);
          await axios.patch(`${BACKEND}/api/requests/${id}`, {
            assignedMember: payloadAssigned,
            notes: `Assigned to ${payloadAssigned.memberName} by ${currentUserName}`,
            updatedBy: { id: accounts[0]?.localAccountId, name: currentUserName, mail: currentUserEmail },
          });
          const refreshed = await axios.get(`${BACKEND}/api/requests/${id}`);
          const normalized = normalizeRequestAssignedMember(refreshed.data);
          setRequest(normalized);
          setSelectedMember(null);
          showAlert(`Request has been assigned to ${payloadAssigned.memberName}.`, 'success', 'Assigned Successfully');
        } catch (err) {
          showAlert('Failed to assign request. ' + (err?.response?.data?.message || err.message), 'error', 'Assignment Failed');
        } finally {
          setAssigning(false);
        }
      },
    });
  };

  // ==================== ASSIGN TO GROUP ====================
  const handleAssignToGroup = async () => {
    if (!selectedGroup) { showAlert('Please select a group to assign.', 'warning'); return; }
    const originalGroupId = request.originalAssignmentGroupId || request.assignmentGroup?.groupId || request.assignmentGroup?._id;
    const originalGroupMembers = request.assignmentGroup?.members || [];
    const newGroupMembers = selectedGroup.members || [];
    let defaultAssignee = null;
    if (newGroupMembers.length > 0) {
      const currentUserInNewGroup = newGroupMembers.find(member => {
        const memberEmail = getMemberEmail(member);
        const memberId = getMemberId(member);
        return (memberEmail && memberEmail === currentUserEmail.toLowerCase()) ||
               (memberId && accounts?.[0]?.localAccountId && String(memberId) === String(accounts[0]?.localAccountId));
      });
      if (currentUserInNewGroup) {
        defaultAssignee = {
          memberId: getMemberId(currentUserInNewGroup) || currentUserInNewGroup.id,
          memberName: currentUserInNewGroup.name,
          memberEmail: currentUserInNewGroup.email || currentUserInNewGroup.mail || currentUserEmail,
        };
      } else if (newGroupMembers.length > 0) {
        const firstMember = newGroupMembers[0];
        defaultAssignee = {
          memberId: getMemberId(firstMember) || firstMember.id,
          memberName: firstMember.name,
          memberEmail: firstMember.email || firstMember.mail,
        };
      }
    }
    setAssignGroupModalOpen(false);
    setTimeout(() => {
      showConfirm({
        title: 'Confirm Group Reassignment',
        message: `Assign this request to "${selectedGroup.name}"?\n\nMembers of the previous group will have view-only access. Members of the new group will have full access.\n\n${defaultAssignee ? `The request will be assigned to: ${defaultAssignee.memberName}` : ''}`,
        confirmLabel: 'Assign to Group',
        danger: false,
        onConfirm: async () => {
          closeConfirm();
          try {
            setAssigning(true);
            const payload = {
              assignmentGroup: {
                _id: selectedGroup._id,
                id: selectedGroup._id,
                groupName: selectedGroup.name,
                groupId: selectedGroup._id,
                members: selectedGroup.members || [],
              },
              assignedMember: null,
              originalAssignmentGroupId: originalGroupId || request.assignmentGroup?.groupId || request.assignmentGroup?._id,
              originalGroupMembers: originalGroupMembers,
              notes: `Request reassigned to group "${selectedGroup.name}" by ${currentUserName}`,
              updatedBy: { id: accounts[0]?.localAccountId, name: currentUserName, mail: currentUserEmail },
            };
            await axios.patch(`${BACKEND}/api/requests/${id}`, payload);
            const refreshed = await axios.get(`${BACKEND}/api/requests/${id}`);
            const normalized = normalizeRequestAssignedMember(refreshed.data);
            setRequest(normalized);
            setSelectedGroup(null);
            showAlert(`Request has been reassigned to "${selectedGroup.name}".`, 'success', 'Group Reassigned');
          } catch (err) {
            showAlert('Failed to reassign group. ' + (err?.response?.data?.message || err.message), 'error', 'Assignment Failed');
          } finally {
            setAssigning(false);
          }
        },
        onCancel: () => {
          closeConfirm();
          setAssignGroupModalOpen(true);
        }
      });
    }, 100);
  };

  // Handle Approve Action
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
      setRequest(normalizeRequestAssignedMember(updated.data));
      setSelectedStatus(updated.data.status);
      if (res.data.tempPassword) {
        setPrResult({ type: 'approve', tempPassword: res.data.tempPassword, targetEmail: res.data.targetEmail });
      } else {
        setPrResult({ type: 'admin_approve' });
      }
    } catch (err) {
      setPrError(err?.response?.data?.message || 'Approval failed. Please try again.');
    } finally {
      setPrLoading(false);
    }
  };

  // Handle Reject Action
  const handleReject = async () => {
    if (!rejectReason.trim()) { setPrError('Please provide a reason for rejection.'); return; }
    setPrLoading(true);
    setPrError('');
    try {
      await axios.post(`${BACKEND}/api/requests/${id}/reject`, {
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
      setRequest(normalizeRequestAssignedMember(updated.data));
      setSelectedStatus(updated.data.status);
      setPrResult({ type: 'reject' });
    } catch (err) {
      setPrError(err?.response?.data?.message || err.message || 'Rejection failed. Please try again.');
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
    setHasUserCancelled(true);
  };

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
    if (request.pwOnBehalf === 'Other' && request.pwTargetEmail) {
      return { name: request.pwTargetName || request.pwTargetEmail, email: request.pwTargetEmail, deliveryEmail: request.pwDeliveryEmail || request.pwTargetEmail };
    }
    if (request.pwOnBehalf === 'Self' || request.pwTargetEmail) {
      return { name: request.raisedBy?.name || '', email: request.pwTargetEmail || request.raisedBy?.mail || '', deliveryEmail: request.pwDeliveryEmail || request.raisedBy?.mail || '' };
    }
    const isOnBehalf = request.onBehalf?.enabled && request.onBehalf?.user;
    return {
      name: isOnBehalf ? request.onBehalf.user.name : (request.raisedBy?.name || ''),
      email: isOnBehalf ? request.onBehalf.user.mail : (request.raisedBy?.mail || ''),
      deliveryEmail: isOnBehalf ? request.onBehalf.user.mail : (request.pwDeliveryEmail || request.raisedBy?.mail || ''),
    };
  };

  

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
    .rd-attachments { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; align-items: center; }
    .rd-attachment-item { padding: 12px 16px; background: var(--bg); border: 1.5px solid var(--border); border-radius: 10px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: all 0.2s; }
    .rd-attachment-item:hover { border-color: var(--navy); background: var(--white); }
    .rd-attachment-chip { padding: 6px 12px; background: var(--bg); border: 1.5px solid var(--border); border-radius: 8px; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s; font-size: 12px; font-weight: 600; color: var(--text); max-width: 160px; }
    .rd-attachment-chip span.chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rd-attachment-chip:hover { border-color: var(--navy); background: var(--white); }
    .rd-attachment-single-dl { padding: 10px 18px; background: var(--navy); color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; }
    .rd-attachment-single-dl:hover { background: #001540; }
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

    /* Assignment Card */
    .rd-assignment-card { background: var(--bg); border: 1.5px solid var(--border); border-radius: 14px; padding: 18px 20px; }
    .rd-assignment-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 6px; }
    .rd-assignment-value { font-size: 15px; font-weight: 700; color: var(--text); }
    .rd-assignment-email { font-size: 13px; color: var(--muted); margin-top: 2px; }
    .rd-assign-btn { padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s; border: 1.5px solid var(--border); background: var(--white); color: var(--text); display: inline-flex; align-items: center; gap: 6px; }
    .rd-assign-btn:hover:not(:disabled) { border-color: var(--navy); background: rgba(0,32,96,0.04); transform: translateY(-1px); }
    .rd-assign-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .rd-assign-btn-primary { background: var(--navy); color: white; border-color: var(--navy); }
    .rd-assign-btn-primary:hover:not(:disabled) { background: var(--navy2); border-color: var(--navy2); }

    /* Modals */
    .rd-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 24px; }
    .rd-modal { background: var(--white); border-radius: 20px; max-width: 500px; width: 100%; max-height: 90vh; overflow: hidden; animation: slideUp 0.2s; }
    .rd-modal-header { padding: 24px 28px; border-bottom: 1.5px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .rd-modal-title { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: var(--text); }
    .rd-modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted); padding: 4px; line-height: 1; }
    .rd-modal-body { padding: 28px; overflow-y: auto; max-height: calc(90vh - 80px); }
    .rd-modal-member-list { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
    .rd-modal-member-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--bg); border: 1.5px solid var(--border); border-radius: 12px; cursor: pointer; transition: all 0.2s; }
    .rd-modal-member-item.selected { border-color: var(--navy); background: rgba(0,32,96,0.05); }
    .rd-modal-member-item.disabled { opacity: 0.5; cursor: not-allowed; }
    .rd-modal-member-name { font-size: 14px; font-weight: 600; color: var(--text); }
    .rd-modal-member-email { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .rd-alert-modal { max-width: 400px !important; }
    .rd-confirm-modal { max-width: 420px !important; }
    .rd-alert-modal-inner { padding: 32px 28px 28px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .rd-alert-icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .rd-alert-title { font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 700; text-align: center; }
    .rd-alert-message { font-size: 14px; color: var(--muted); text-align: center; line-height: 1.6; }

    /* PR Modal Styles */
    .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 24px; backdrop-filter: blur(3px); }
    .pr-modal { background: var(--white); border-radius: 24px; max-width: 600px; width: 100%; overflow: hidden; animation: scaleIn 0.22s ease both; box-shadow: 0 24px 80px rgba(0,0,0,0.25); max-height: 90vh; display: flex; flex-direction: column; }
    .pr-modal-header { padding: 28px 32px; background: linear-gradient(135deg, #002060 0%, #003090 100%); flex-shrink: 0; }
    .pr-modal-header-title { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 800; color: white; display: flex; align-items: center; gap: 10px; }
    .pr-modal-header-sub { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 8px; line-height: 1.5; }
    .pr-modal-body { padding: 28px 32px; overflow-y: auto; flex: 1; }
    .pr-details-section { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
    .pr-details-section:last-of-type { border-bottom: none; }
    .pr-details-title { font-family: 'Sora', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
    .pr-details-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; gap: 16px; }
    .pr-details-label { font-size: 13px; color: var(--muted); font-weight: 500; flex-shrink: 0; }
    .pr-details-value { font-size: 13px; color: var(--text); font-weight: 600; text-align: right; }
    .pr-warning-box { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 10px; padding: 12px 14px; margin-bottom: 20px; font-size: 13px; color: #92400e; line-height: 1.5; display: flex; gap: 10px; align-items: flex-start; }
    .pr-warning-box-admin { background: #dbeafe; border: 1px solid #93c5fd; border-radius: 10px; padding: 12px 14px; margin-bottom: 20px; font-size: 13px; color: #1e40af; line-height: 1.5; display: flex; gap: 10px; align-items: flex-start; }
    .pr-textarea { width: 100%; padding: 10px 14px; border: 1.5px solid var(--border); border-radius: 10px; font-size: 13px; font-family: 'Lato', sans-serif; color: var(--text); resize: vertical; }
    .pr-textarea:focus { outline: none; border-color: var(--navy); }
    .pr-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    .pr-btn { padding: 11px 22px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; border: none; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
    .pr-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .pr-btn-approve { background: #16a34a; color: white; flex: 1; justify-content: center; }
    .pr-btn-approve:hover:not(:disabled) { background: #15803d; }
    .pr-btn-reject { background: #dc2626; color: white; flex: 1; justify-content: center; }
    .pr-btn-reject:hover:not(:disabled) { background: #b91c1c; }
    .pr-btn-cancel { background: var(--bg); color: var(--text); border: 1.5px solid var(--border); }
    .pr-btn-cancel:hover { border-color: var(--navy); }
    .pr-error { padding: 10px 14px; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 10px; font-size: 13px; color: #991b1b; margin-top: 12px; }
    .result-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; justify-content: center; align-items: center; z-index: 10000; padding: 24px; backdrop-filter: blur(3px); }
    .result-modal { background: var(--white); border-radius: 24px; max-width: 480px; width: 100%; overflow: hidden; animation: scaleIn 0.22s ease both; box-shadow: 0 24px 80px rgba(0,0,0,0.3); }
    .result-modal-header-approve { padding: 28px 32px; background: linear-gradient(135deg, #15803d 0%, #16a34a 100%); }
    .result-modal-header-admin { padding: 28px 32px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); }
    .result-modal-header-reject { padding: 28px 32px; background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%); }
    .result-modal-title { font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; color: white; }
    .result-modal-sub { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 6px; }
    .result-modal-body { padding: 28px 32px; }
    .temp-password-box { background: #f0fdf4; border: 2px solid #86efac; border-radius: 14px; padding: 20px; margin-bottom: 20px; text-align: center; }
    .temp-password-label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #16a34a; letter-spacing: 0.08em; margin-bottom: 8px; }
    .temp-password-value { font-family: 'DM Mono', 'Courier New', monospace; font-size: 28px; font-weight: 700; color: #15803d; letter-spacing: 0.1em; }
    .temp-password-note { font-size: 12px; color: #64748b; }
    .result-info { font-size: 13px; color: var(--muted); line-height: 2; margin-bottom: 24px; }
    .result-actions { display: flex; gap: 12px; }
    .result-btn { flex: 1; padding: 12px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; border: none; transition: all 0.2s; }
    .result-btn-copy { background: var(--bg); color: var(--text); border: 1.5px solid var(--border); }
    .result-btn-done { background: var(--navy); color: white; }
    .review-button-container { background: #fef3c7; border: 1.5px solid #fbbf24; border-radius: 14px; padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
    .review-button-container p { font-size: 13px; color: #92400e; flex: 1; }
    .rd-btn-review { background: #002060; color: white; border: none; white-space: nowrap; }
    .rd-btn-review:hover { background: #003090; transform: translateY(-1px); }
    .rd-loading { min-height: 100vh; background: var(--bg); display: flex; align-items: center; justify-content: center; }
    .rd-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--navy); animation: spin 0.9s linear infinite; }

    @media (max-width: 1024px) { .rd-layout { grid-template-columns: 1fr; } .rd-meta-grid { grid-template-columns: 1fr; } }
    @media (max-width: 768px) { .rd-hero { padding: 40px 24px; } .rd-content { padding: 24px 20px 40px; } }
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

  const targetInfo = getTargetInfo();
  const isPasswordReset = request?.service?.name?.toLowerCase().includes('password reset');
  const isAdminAccess = request?.service?.name?.toLowerCase().includes('admin access') ||
                        request?.service?.name?.toLowerCase().includes('device admin');
  const statusStyle = getStatusStyles(request.status);
  const priorityStyle = getPriorityStyles(request.priority);
  const historyEvents = request.history?.length > 0
    ? request.history
    : [{ action: 'created', by: request.raisedBy?.name || 'Unknown', at: request.createdAt }];
  const isPendingApproval = request.status === 'pending_approval';
  const showReviewButton = hasUserCancelled && isPendingApproval && (isPasswordReset || isAdminAccess);

  // FIXED: Use the corrected access variables
  const isGroupMember = isInCurrentGroup(); // Current group member
  const assignedToMe = isAssignedToMe();
  const assignedMember = getAssignedMember();
  const fullAccess = hasFullAccess(); // FIXED: Returns false for original group members after reassignment
  const viewOnly = hasViewOnlyAccess(); // FIXED: Returns true for original group members after reassignment

  // ========== ADD THIS DEBUG LOGS HERE ==========
console.log('===== ACCESS DEBUG =====');
console.log('1. User Email:', currentUserEmail);
console.log('2. Authority (admin?):', authority);
console.log('3. Is Admin?', authority === 'admin');
console.log('4. Is in Current Group?:', isGroupMember);
console.log('5. Is in Original Group?:', isInOriginalGroup());
console.log('6. Has Full Access?:', fullAccess);
console.log('7. Has View Only?:', viewOnly);
console.log('8. Request has originalGroupId?:', request?.originalAssignmentGroupId);
console.log('9. Current Group Name:', request?.assignmentGroup?.groupName);
console.log('10. Current Group Members Count:', request?.assignmentGroup?.members?.length);
console.log('=========================');

  return (
    <div className="rd-page">
      <style>{sharedCSS}</style>

      <AlertModal open={alertModal.open} type={alertModal.type} title={alertModal.title} message={alertModal.message} onClose={closeAlert} />
      <ConfirmModal
        open={confirmModal.open} title={confirmModal.title} message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel} cancelLabel={confirmModal.cancelLabel}
        danger={confirmModal.danger} onConfirm={confirmModal.onConfirm} onCancel={confirmModal.onCancel}
      />

      {/* ==================== ASSIGN TO MEMBER MODAL ==================== */}
      {assignmentModalOpen && (
        <div className="rd-modal-overlay" onClick={() => { setAssignmentModalOpen(false); setSelectedMember(null); }}>
          <div className="rd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="rd-modal-header">
              <span className="rd-modal-title">👥 Assign to Member</span>
              <button className="rd-modal-close" onClick={() => { setAssignmentModalOpen(false); setSelectedMember(null); }}>✕</button>
            </div>
            <div className="rd-modal-body">
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                Select a member from <strong>{request.assignmentGroup?.groupName || 'the assignment group'}</strong>:
              </div>
              <div className="rd-modal-member-list">
                {(request.assignmentGroup?.members || []).map((member, idx) => {
                  const memberEmail = getMemberEmail(member);
                  const memberId = getMemberId(member);
                  const isSelected = selectedMember && (getMemberId(selectedMember) === memberId || getMemberEmail(selectedMember) === memberEmail);
                  const isCurrentlyAssigned = assignedMember && (
                    String(assignedMember.memberId) === String(memberId) ||
                    (assignedMember.memberEmail || '').toLowerCase() === memberEmail
                  );
                  return (
                    <div
                      key={idx}
                      className={`rd-modal-member-item${isSelected ? ' selected' : ''}`}
                      onClick={() => setSelectedMember(member)}
                    >
                      <div>
                        <div className="rd-modal-member-name">{member.name}</div>
                        <div className="rd-modal-member-email">{memberEmail}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {isCurrentlyAssigned && (
                          <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>Current</span>
                        )}
                        {isSelected && <span style={{ fontSize: 18, color: '#002060' }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button className="rd-btn rd-btn-secondary" style={{ flex: 1 }} onClick={() => { setAssignmentModalOpen(false); setSelectedMember(null); }}>Cancel</button>
                <button
                  className="rd-btn"
                  style={{ flex: 1, background: selectedMember ? '#002060' : '#9ca3af', color: 'white', border: 'none' }}
                  disabled={!selectedMember}
                  onClick={handleAssignToMember}
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ASSIGN TO GROUP MODAL ==================== */}
      {assignGroupModalOpen && (
        <div className="rd-modal-overlay" onClick={() => { setAssignGroupModalOpen(false); setSelectedGroup(null); }}>
          <div className="rd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="rd-modal-header">
              <span className="rd-modal-title">🏷️ Assign to Group</span>
              <button className="rd-modal-close" onClick={() => { setAssignGroupModalOpen(false); setSelectedGroup(null); }}>✕</button>
            </div>
            <div className="rd-modal-body">
              {loadingGroups ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>Loading groups…</div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Select a group to reassign this request to:</div>
                  <div className="rd-modal-member-list">
                    {allAssignmentGroups.map((group, idx) => {
                      const isCurrent = String(group._id) === String(request.assignmentGroup?._id || request.assignmentGroup?.groupId);
                      const isSelected = selectedGroup && String(selectedGroup._id) === String(group._id);
                      return (
                        <div
                          key={idx}
                          className={`rd-modal-member-item${isSelected ? ' selected' : ''}${isCurrent ? ' disabled' : ''}`}
                          onClick={() => !isCurrent && setSelectedGroup(group)}
                        >
                          <div>
                            <div className="rd-modal-member-name">{group.name}</div>
                            <div className="rd-modal-member-email">{group.members?.length || 0} members</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {isCurrent && (
                              <span style={{ fontSize: 11, background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>Current</span>
                            )}
                            {isSelected && <span style={{ fontSize: 18, color: '#002060' }}>✓</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button className="rd-btn rd-btn-secondary" style={{ flex: 1 }} onClick={() => { setAssignGroupModalOpen(false); setSelectedGroup(null); }}>Cancel</button>
                    <button
                      className="rd-btn"
                      style={{ flex: 1, background: selectedGroup ? '#002060' : '#9ca3af', color: 'white', border: 'none' }}
                      disabled={!selectedGroup}
                      onClick={handleAssignToGroup}
                    >
                      Assign to Group
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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

              {/* ==================== ASSIGNMENT CARD ==================== */}
              {request.assignmentGroup && (
                <div className="rd-section">
                  <div className="rd-section-title"><span>👤</span> Assignment</div>
                  <div className="rd-assignment-card">
                    <div className="rd-assignment-label">Currently Assigned To</div>

                    {assignedMember ? (
                      <>
                        <div className="rd-assignment-value">{assignedMember.memberName}</div>
                        <div className="rd-assignment-email">{assignedMember.memberEmail}</div>
                        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {/* FIXED: Only show assignment buttons if fullAccess is true */}
                          {fullAccess && assignedToMe && (
                            <button className="rd-assign-btn rd-assign-btn-primary" onClick={handleUnassign} disabled={assigning}>
                              {assigning ? 'Working…' : '↩️ Deassign from me'}
                            </button>
                          )}
                          {fullAccess && authority === 'admin' && !assignedToMe && (
                            <button className="rd-assign-btn rd-assign-btn-primary" onClick={handleUnassign} disabled={assigning}>
                              {assigning ? 'Working…' : '✖ Unassign'}
                            </button>
                          )}
                          {fullAccess && (isGroupMember) && (
                            <>
                              <button
                                className="rd-assign-btn"
                                onClick={() => {
                                  setAssignmentModalOpen(true);
                                  const groupMembers = request.assignmentGroup?.members || [];
                                  const assignedInGroup = groupMembers.find(m => String(getMemberId(m)) === String(assignedMember.memberId));
                                  setSelectedMember(assignedInGroup || null);
                                }}
                                disabled={assigning}
                              >
                                👥 Reassign
                              </button>
                              {!viewOnly && (
                                <button
                                  className="rd-assign-btn"
                                  onClick={() => { setAssignGroupModalOpen(true); fetchAllAssignmentGroups(); }}
                                  disabled={assigning}
                                >
                                  🏷️ Assign to Group
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rd-assignment-value" style={{ color: '#64748b' }}>Not assigned</div>
                        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {/* FIXED: Only show assignment buttons if fullAccess is true */}
                          {fullAccess && (isGroupMember || authority === 'admin') && (
                            <>
                              <button className="rd-assign-btn rd-assign-btn-primary" onClick={handleAssignToMe} disabled={assigning}>
                                {assigning ? 'Assigning...' : '📌 Assign to Me'}
                              </button>
                              <button className="rd-assign-btn" onClick={() => setAssignmentModalOpen(true)} disabled={assigning}>
                                👥 Assign to Member
                              </button>
                              {!viewOnly && (
                                <button
                                  className="rd-assign-btn"
                                  onClick={() => { setAssignGroupModalOpen(true); fetchAllAssignmentGroups(); }}
                                  disabled={assigning}
                                >
                                  🏷️ Assign to Group
                                </button>
                              )}
                            </>
                          )}
                          {!fullAccess && authority !== 'admin' && (
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {viewOnly ? 'You have view-only access (original group member after reassignment).' : 'You are not a member of the current group.'}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* FIXED: Show view-only warning for original group members after reassignment */}
                    {viewOnly && (
                      <div style={{ marginTop: 16, padding: 12, background: '#fef3c7', borderRadius: 10, borderLeft: '3px solid #f59e0b' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>🔒</span> View-Only Access
                        </div>
                        <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>
                          This request has been reassigned to a different group. You can only view it. Contact an admin if you need to take action.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                      <button className="rd-btn rd-btn-secondary" onClick={downloadAllAttachments}>⬇️ Download All</button>
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
                {/* FIXED: Show assigned group name instead of members list */}
                {request.assignmentGroup && (
                  <div className="rd-meta-item">
                    <div className="rd-meta-key">Assigned Group</div>
                    <div className="rd-meta-value">
                      {request.assignmentGroup.groupName || request.assignmentGroup.name || '—'}
                    </div>
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
                  const isRejected = event.action === 'rejected' || event.action === 'cancelled';
                  const isAssigned = event.action === 'assigned';
                  const dotColor = isCreated ? '#002060' : isResolved ? '#16a34a' : isClosed ? '#6b7280' :
                    isApproved ? '#16a34a' : isRejected ? '#dc2626' : isAssigned ? '#8b5cf6' : '#e98404';
                  return (
                    <div key={idx} className="rd-timeline-item">
                      <div className="rd-timeline-icon" style={{ background: dotColor, marginTop: 6 }} />
                      <div className="rd-timeline-content">
                        <div className="rd-timeline-action">
                          {isCreated ? 'Request Created' : isResolved ? 'Request Resolved' : isClosed ? 'Request Closed' :
                           isApproved ? 'Request Approved' : isRejected ? 'Request Rejected/Cancelled' :
                           isAssigned ? 'Request Assigned' : event.action?.replace(/_/g, ' ') || 'Updated'}
                        </div>
                        <div className="rd-timeline-meta">
                          by {event.by} · {formatDate(event.at)}
                          {event.oldStatus && event.newStatus && ` · ${event.oldStatus} → ${event.newStatus}`}
                        </div>
                        {event.notes && <div className="rd-timeline-note">{event.notes}</div>}
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
                <div className="rd-sidebar-header-title">REQUEST INFO</div>
              </div>
              <div className="rd-sidebar-body">
                <div className="rd-info-row">
                  <span className="rd-info-label">Request Number</span>
                  <span className="rd-info-value">{request.requestNumber}</span>
                </div>
                <div className="rd-info-row">
                  <span className="rd-info-label">Service</span>
                  <span className="rd-info-value">{request.service?.name}</span>
                </div>
                <div className="rd-info-row">
                  <span className="rd-info-label">Category</span>
                  <span className="rd-info-value">{request.service?.categoryName || '—'}</span>
                </div>
                <div className="rd-info-row">
                  <span className="rd-info-label">Priority</span>
                  <span className="rd-info-value">{request.priority?.toUpperCase() || '—'}</span>
                </div>
                <div className="rd-info-row">
                  <span className="rd-info-label">Created</span>
                  <span className="rd-info-value">{formatDate(request.createdAt)}</span>
                </div>
                {request.resolvedAt && (
                  <div className="rd-info-row">
                    <span className="rd-info-label">Resolved</span>
                    <span className="rd-info-value">{formatDate(request.resolvedAt)}</span>
                  </div>
                )}
                {isPasswordReset && targetInfo.deliveryEmail && (
                  <div className="rd-info-row">
                    <span className="rd-info-label">Delivery Email</span>
                    <span className="rd-info-value">{targetInfo.deliveryEmail}</span>
                  </div>
                )}
              </div>
            </div>

            {/* FIXED: Status Update Card - Hide for view-only users */}
            {!viewOnly && (authority === 'admin' || isGroupMember) && (!isPendingApproval || !(isPasswordReset || isAdminAccess) || hasUserCancelled) && (
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
            {(authority === 'admin' || isGroupMember) && isPendingApproval && (isPasswordReset || isAdminAccess) && !hasUserCancelled && (
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
                <button className="result-btn result-btn-copy" onClick={() => { navigator.clipboard.writeText(prResult.tempPassword); }}>📋 Copy</button>
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
                <div>
                  <img src={imagePreviewUrl} alt={activeAttachment.fileName} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px' }} />
                  <div style={{ marginTop: 16 }}>
                    <button className="rd-btn rd-btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => downloadAttachment(activeAttachment)}>⬇️ Download</button>
                  </div>
                </div>
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