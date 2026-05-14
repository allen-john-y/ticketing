// IncidentDetails.js - COMPLETE FIXED VERSION
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// ==================== TOAST / ALERT MODAL ====================
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
    <div className="id-modal-overlay" onClick={onClose}>
      <div className="id-modal id-alert-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="id-alert-modal-inner" style={{ borderTop: `4px solid ${c.border}` }}>
          <div className="id-alert-icon" style={{ background: c.bg, color: c.title }}>
            <span style={{ fontSize: 28 }}>{icons[type]}</span>
          </div>
          {title && <div className="id-alert-title" style={{ color: c.title }}>{title}</div>}
          <div className="id-alert-message">{message}</div>
          <button
            className="id-btn"
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
    <div className="id-modal-overlay" onClick={onCancel}>
      <div className="id-modal id-confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="id-alert-modal-inner" style={{ borderTop: `4px solid ${danger ? '#ef4444' : '#3b82f6'}` }}>
          <div className="id-alert-icon" style={{ background: danger ? '#fee2e2' : '#dbeafe', color: danger ? '#991b1b' : '#1e40af' }}>
            <span style={{ fontSize: 28 }}>{danger ? '⚠️' : '❓'}</span>
          </div>
          {title && <div className="id-alert-title" style={{ color: danger ? '#991b1b' : '#1e40af' }}>{title}</div>}
          <div className="id-alert-message">{message}</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button
              className="id-btn id-btn-secondary"
              style={{ flex: 1 }}
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              className="id-btn"
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

function IncidentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts, instance } = useMsal();
  const chatContainerRef = useRef(null);

  const [incident, setIncident] = useState(null);
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

  // Assignment Modal state
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [assigning, setAssigning] = useState(false);

  // Assign to Group Modal state
  const [assignGroupModalOpen, setAssignGroupModalOpen] = useState(false);
  const [allAssignmentGroups, setAllAssignmentGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [canChat, setCanChat] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(true);

  // Custom modal state
  const [alertModal, setAlertModal] = useState({ open: false, type: 'success', title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', danger: false, onConfirm: null, onCancel: null });

  const showAlert = (message, type = 'success', title = '') =>
    setAlertModal({ open: true, type, title, message });

  const closeAlert = () => setAlertModal(s => ({ ...s, open: false }));

  const showConfirm = ({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }) =>
    setConfirmModal({ open: true, title, message, confirmLabel: confirmLabel || 'Confirm', cancelLabel: cancelLabel || 'Cancel', danger: !!danger, onConfirm, onCancel });

  const closeConfirm = () => setConfirmModal(s => ({ ...s, open: false, onConfirm: null, onCancel: null }));

  const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'];

  const currentUserEmail = accounts?.[0]?.username || '';
  const currentUserName = accounts?.[0]?.name || '';

  // Helper functions for member identification
  const getMemberEmail = (member) => {
    if (!member) return '';
    const raw =
      member.email ||
      member.mail ||
      member.userPrincipalName ||
      member.userPrincipalname ||
      member.userPrincipal ||
      (member.user && (member.user.mail || member.user.userPrincipalName)) ||
      '';
    return String(raw || '').trim().toLowerCase();
  };

  const getMemberId = (member) => {
    if (!member) return '';
    return member.id || member._id || member.objectId || member.userId || member.azureObjectId || '';
  };

  // Fetch all assignment groups
  const fetchAllAssignmentGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await axios.get(`${BACKEND}/api/assignment-groups`);
      setAllAssignmentGroups(res.data || []);
      console.log('🔍 [FETCH_GROUPS] Loaded groups:', res.data.length);
    } catch (err) {
      console.error('Failed to fetch assignment groups:', err);
      showAlert('Failed to load assignment groups', 'error');
    } finally {
      setLoadingGroups(false);
    }
  };

  // Check if current user is in the ORIGINAL group (before any reassign)
  const isInOriginalGroup = () => {
    if (!incident || !currentUserEmail) return false;
    
    const originalGroupId = incident.originalAssignmentGroupId || incident.assignmentGroup?.groupId || incident.assignmentGroup?._id;
    const groupMembers = incident.originalGroupMembers || incident.assignmentGroup?.members || [];
    const userEmailLower = currentUserEmail.toLowerCase();
    const userId = accounts?.[0]?.localAccountId || '';
    
    return groupMembers.some((member) => {
      const memberEmail = getMemberEmail(member);
      const memberId = getMemberId(member);
      return (memberEmail && memberEmail === userEmailLower) || (memberId && userId && String(memberId) === String(userId));
    });
  };

  // Check if current user is in the CURRENT assignment group
  const isInCurrentGroup = () => {
    if (!incident || !currentUserEmail) return false;
    const groupMembers = incident.assignmentGroup?.members || [];
    const userEmailLower = currentUserEmail.toLowerCase();
    const userId = accounts?.[0]?.localAccountId || '';
    return groupMembers.some((member) => {
      const memberEmail = getMemberEmail(member);
      const memberId = getMemberId(member);
      return (memberEmail && memberEmail === userEmailLower) || (memberId && userId && String(memberId) === String(userId));
    });
  };

  // Check if user has FULL access
  const hasFullAccess = () => {
    if (authority === 'admin') return true;
    if (!incident?.originalAssignmentGroupId) return isInCurrentGroup();
    return isInCurrentGroup() && !isInOriginalGroup();
  };

  // Check if user has VIEW ONLY access
  const hasViewOnlyAccess = () => {
    if (authority === 'admin') return false;
    return isInOriginalGroup() && !isInCurrentGroup();
  };

  // Check authority (admin/basic)
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
        const groups = (json.value || []).map((g) => g.displayName);
        const isAdmin = groups.includes('Helpdesk_Admin');
        setAuthority(isAdmin ? 'admin' : 'basic');
        console.log('🔍 [AUTH] Authority set to:', isAdmin ? 'admin' : 'basic');
      } catch (e) {
        setAuthority('basic');
        console.log('🔍 [AUTH] Authority set to basic (default)');
      }
    };
    checkAuthority();
  }, [accounts, instance]);

  const checkCanChat = (incidentData) => {
    if (!incidentData || !currentUserEmail) return false;
    const raisedEmail = (incidentData.raisedBy?.mail || incidentData.raisedBy?.email || '').toLowerCase();
    const userEmail = currentUserEmail.toLowerCase();
    if (userEmail === raisedEmail) return true;
    const userId = accounts?.[0]?.localAccountId || '';
    const groupMembers = incidentData.assignmentGroup?.members || [];
    const isGroupMember = groupMembers.some((member) => {
      const memberEmail = getMemberEmail(member);
      const memberId = getMemberId(member);
      return (memberEmail && memberEmail === userEmail) || (memberId && userId && String(memberId) === String(userId));
    });
    return isGroupMember || authority === 'admin';
  };

  const isCurrentUserGroupMember = () => isInCurrentGroup();
  const isAssignedToMe = () => {
    if (!incident || !currentUserEmail) return false;
    const assignedMemberEmail = (incident.assignedMember?.memberEmail || '').toString().toLowerCase();
    const assignedMemberId = (incident.assignedMember?.memberId || '').toString();
    const userId = accounts?.[0]?.localAccountId || '';
    return assignedMemberEmail === currentUserEmail.toLowerCase() || (assignedMemberId && userId && String(assignedMemberId) === String(userId));
  };

  const getAssignedMember = () => incident?.assignedMember || null;

  const fetchMessages = async () => {
    if (!id) return;
    setChatLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/incidents/${id}/messages`);
      const sortedMessages = (res.data || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      setMessages(sortedMessages);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setChatLoading(false);
    }
  };

  const normalizeIncidentAssignedMember = (data) => {
    if (!data) return data;
    const normalized = { ...data };
    const assigned = normalized.assignedMember ?? normalized.assignee ?? normalized.assignedTo ?? normalized.owner ?? null;
    normalized.assignedMember = assigned;
    return normalized;
  };

  // Fetch incident with logs
  useEffect(() => {
    const fetchIncident = async () => {
      setIsLoading(true);
      try {
        console.log('🔍 [FETCH] Fetching incident with ID:', id);
        const res = await axios.get(`${BACKEND}/api/incidents/${id}`);
        console.log('🔍 [FETCH] Raw incident data:', res.data);
        console.log('🔍 [FETCH] assignedMember in raw data:', res.data.assignedMember);
        
        const normalized = normalizeIncidentAssignedMember(res.data);
        console.log('🔍 [FETCH] Normalized incident data:', normalized);
        console.log('🔍 [FETCH] assignedMember after normalization:', normalized.assignedMember);
        
        setIncident(normalized);
        setSelectedStatus(normalized.status || '');
        const canUserChat = checkCanChat(normalized);
        setCanChat(canUserChat);
        
        const list = [];
        if (normalized.attachments && Array.isArray(normalized.attachments)) {
          normalized.attachments.forEach((a) => {
            const driveId = a.driveId || a.parentReference?.driveId || null;
            const driveItemId = a.id || a.fileId || null;
            const proxyUrl = driveItemId
              ? `${BACKEND}/attachments/${driveItemId}${driveId ? `?driveId=${encodeURIComponent(driveId)}` : ''}`
              : a.fileUrl || a.url || a.path || null;
            list.push({
              fileName: a.fileName || a.originalname || '',
              fileType: a.fileType || a.mimetype || '',
              fileUrl: proxyUrl,
              id: driveItemId,
              driveId: driveId || null,
            });
          });
        }
        setAttachmentList(list);
        if (canUserChat) await fetchMessages();
      } catch (err) {
        console.error('❌ [FETCH INCIDENT] Error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchIncident();
  }, [id, currentUserEmail, authority]);

  useEffect(() => {
    if (!canChat) return;
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [canChat, id]);

  useEffect(() => {
    if (chatContainerRef.current && messages.length > 0) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  const isImageType = (type) => type && type.startsWith && type.startsWith('image/');
  const isPdfType = (type, url) => (type && type === 'application/pdf') || (url && url.toLowerCase().endsWith('.pdf'));

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
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(attachment.fileUrl, '_blank', 'noopener');
    }
  };

  const downloadAllAttachments = async () => {
    if (!attachmentList || attachmentList.length === 0) return;
    const downloadable = attachmentList.filter((a) => a && a.id);
    if (!downloadable.length) {
      showAlert('No downloadable attachments available.', 'warning');
      return;
    }
    const ids = downloadable.map((a) => a.id).join(',');
    const driveIds = downloadable.map((a) => a.driveId || '').join(',');
    const url = `${BACKEND}/attachments/zip?ids=${encodeURIComponent(ids)}${driveIds ? `&driveIds=${encodeURIComponent(driveIds)}` : ''}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `attachments-${incident?.incidentNumber || id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // ==================== UNASSIGN WITH LOGS ====================
  const handleUnassign = async () => {
    console.log('🔍 [UNASSIGN] Function called');
    console.log('🔍 [UNASSIGN] Incident ID:', id);
    console.log('🔍 [UNASSIGN] Current incident state:', incident);
    console.log('🔍 [UNASSIGN] Current assignedMember:', incident?.assignedMember);
    
    if (!incident?.assignedMember) {
      console.log('⚠️ [UNASSIGN] No assigned member found, showing warning');
      showAlert('Incident is not assigned.', 'warning');
      return;
    }
    
    const assigned = incident.assignedMember;
    console.log('🔍 [UNASSIGN] Assigned member details:', {
      memberId: assigned.memberId,
      memberName: assigned.memberName,
      memberEmail: assigned.memberEmail
    });

    showConfirm({
      title: 'Remove Assignment',
      message: `Remove assignment from ${assigned.memberName || assigned.memberEmail || 'assigned user'}?`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        console.log('✅ [UNASSIGN] User confirmed, proceeding with unassign');
        closeConfirm();
        try {
          setAssigning(true);
          console.log('🔄 [UNASSIGN] Sending PATCH request to:', `${BACKEND}/api/incidents/${id}`);
          
          const payload = {
            assignedMember: null,
            notes: `Unassigned ${assigned.memberName || assigned.memberEmail || ''} by ${currentUserName}`,
            updatedBy: { 
              id: accounts[0]?.localAccountId, 
              name: currentUserName, 
              mail: currentUserEmail 
            },
          };
          console.log('📤 [UNASSIGN] Payload being sent:', JSON.stringify(payload, null, 2));
          
          const response = await axios.patch(`${BACKEND}/api/incidents/${id}`, payload);
          console.log('✅ [UNASSIGN] PATCH response status:', response.status);
          console.log('✅ [UNASSIGN] PATCH response data:', response.data);
          
          setIncident((prev) => ({ ...prev, assignedMember: null, updatedAt: new Date().toISOString() }));
          console.log('🔄 [UNASSIGN] Local state updated - assignedMember set to null');
          
          console.log('🔄 [UNASSIGN] Refreshing incident from backend...');
          const refreshed = await axios.get(`${BACKEND}/api/incidents/${id}`);
          console.log('🔄 [UNASSIGN] Refreshed incident data:', refreshed.data);
          console.log('🔄 [UNASSIGN] Refreshed assignedMember:', refreshed.data.assignedMember);
          
          const normalized = normalizeIncidentAssignedMember(refreshed.data);
          setIncident(normalized);
          
          showAlert('Assignment has been removed successfully.', 'success', 'Unassigned');
          console.log('✅ [UNASSIGN] Unassign completed successfully');
        } catch (err) {
          console.error('❌ [UNASSIGN] Error occurred:', err);
          console.error('❌ [UNASSIGN] Error response:', err?.response?.data);
          console.error('❌ [UNASSIGN] Error message:', err?.response?.data?.message || err.message);
          showAlert('Failed to remove assignment. ' + (err?.response?.data?.message || err.message), 'error', 'Unassign Failed');
        } finally {
          setAssigning(false);
          console.log('🔒 [UNASSIGN] assigning state set to false');
        }
      },
    });
  };

  // ==================== ASSIGN TO ME WITH LOGS ====================
  const handleAssignToMe = async () => {
    console.log('🔍 [ASSIGN_TO_ME] Function called');
    console.log('🔍 [ASSIGN_TO_ME] Incident ID:', id);
    
    setAssignmentModalOpen(false);
    setSelectedMember(null);
    
    if (!incident) { 
      console.log('⚠️ [ASSIGN_TO_ME] No incident data');
      showAlert('No incident data', 'error');
      return; 
    }
    
    const groupMembers = incident.assignmentGroup?.members || [];
    console.log('🔍 [ASSIGN_TO_ME] Group members count:', groupMembers.length);
    console.log('🔍 [ASSIGN_TO_ME] Current user email:', currentUserEmail);
    console.log('🔍 [ASSIGN_TO_ME] Current user ID:', accounts?.[0]?.localAccountId);
    
    const userId = accounts?.[0]?.localAccountId || '';
    const currentUserMember = groupMembers.find((member) => {
      const memberEmail = getMemberEmail(member);
      const matchByEmail = memberEmail === currentUserEmail.toLowerCase();
      const memberId = getMemberId(member);
      const matchById = memberId && userId && String(memberId) === String(userId);
      console.log(`🔍 [ASSIGN_TO_ME] Checking member: ${member.name}, email: ${memberEmail}, matchByEmail: ${matchByEmail}, matchById: ${matchById}`);
      return matchByEmail || matchById;
    });

    if (!currentUserMember) {
      console.log('⚠️ [ASSIGN_TO_ME] Current user not found in group members');
      showAlert('You are not a member of the current assignment group.', 'error', 'Not a Group Member');
      return;
    }

    console.log('✅ [ASSIGN_TO_ME] Found current user in group:', currentUserMember);

    const payloadAssigned = {
      memberId: getMemberId(currentUserMember) || currentUserMember.id || currentUserMember._id,
      memberName: currentUserMember.name || currentUserName,
      memberEmail: currentUserMember.email || currentUserMember.mail || currentUserEmail,
    };

    const payload = {
      assignedMember: payloadAssigned,
      notes: `Assigned to myself (${currentUserName})`,
      updatedBy: { id: accounts[0]?.localAccountId, name: currentUserName, mail: currentUserEmail },
    };

    console.log('📤 [ASSIGN_TO_ME] Payload:', payload);

    try {
      setAssigning(true);
      const response = await axios.patch(`${BACKEND}/api/incidents/${id}`, payload);
      console.log('✅ [ASSIGN_TO_ME] Response:', response.data);
      
      setIncident((prev) => ({
        ...prev,
        assignedMember: { memberId: payloadAssigned.memberId, memberName: payloadAssigned.memberName, memberEmail: payloadAssigned.memberEmail },
        updatedAt: new Date().toISOString(),
      }));
      
      try {
        const refreshed = await axios.get(`${BACKEND}/api/incidents/${id}`);
        const normalized = normalizeIncidentAssignedMember(refreshed.data);
        setIncident((prev) => ({ ...prev, ...(normalized || {}), assignedMember: normalized.assignedMember ?? prev.assignedMember }));
      } catch (_) {}
      
      showAlert(`Incident has been assigned to you (${currentUserName}).`, 'success', 'Assigned Successfully');
    } catch (err) {
      console.error('❌ [ASSIGN_TO_ME] Error:', err);
      showAlert('Failed to assign incident to yourself. ' + (err?.response?.data?.message || err.message), 'error', 'Assignment Failed');
    } finally {
      setAssigning(false);
    }
  };

  // ==================== ASSIGN TO MEMBER WITH LOGS ====================
  const handleAssignToMember = async () => {
    if (!selectedMember) { 
      showAlert('Please select a member to assign.', 'warning');
      return; 
    }

    const payloadAssigned = {
      memberId: getMemberId(selectedMember) || selectedMember.id || selectedMember._id,
      memberName: selectedMember.name,
      memberEmail: selectedMember.email || selectedMember.mail || selectedMember.userPrincipalName || '',
    };

    console.log('🔍 [ASSIGN_TO_MEMBER] Assigning to:', payloadAssigned);

    setAssignmentModalOpen(false);
    
    showConfirm({
      title: 'Confirm Assignment',
      message: `Assign this incident to ${selectedMember.name} (${selectedMember.email || selectedMember.mail || 'unknown email'})?`,
      confirmLabel: 'Assign',
      danger: false,
      onConfirm: async () => {
        closeConfirm();
        
        try {
          setAssigning(true);
          const payload = {
            assignedMember: payloadAssigned,
            notes: `Assigned to ${payloadAssigned.memberName} by ${currentUserName}`,
            updatedBy: { id: accounts[0]?.localAccountId, name: currentUserName, mail: currentUserEmail },
          };
          
          const response = await axios.patch(`${BACKEND}/api/incidents/${id}`, payload);
          console.log('✅ [ASSIGN_TO_MEMBER] Response:', response.data);
          
          setIncident((prev) => ({
            ...prev,
            assignedMember: { memberId: payloadAssigned.memberId, memberName: payloadAssigned.memberName, memberEmail: payloadAssigned.memberEmail },
            updatedAt: new Date().toISOString(),
          }));
          
          try {
            const refreshed = await axios.get(`${BACKEND}/api/incidents/${id}`);
            const normalized = normalizeIncidentAssignedMember(refreshed.data);
            setIncident((prev) => ({ ...prev, ...(normalized || {}), assignedMember: normalized.assignedMember ?? prev.assignedMember }));
          } catch (_) {}
          
          setSelectedMember(null);
          showAlert(`Incident has been assigned to ${payloadAssigned.memberName}.`, 'success', 'Assigned Successfully');
        } catch (err) {
          console.error('❌ [ASSIGN_TO_MEMBER] Error:', err);
          showAlert('Failed to assign incident. ' + (err?.response?.data?.message || err.message), 'error', 'Assignment Failed');
        } finally {
          setAssigning(false);
        }
      },
    });
  };

  // ==================== ASSIGN TO GROUP (FIXED) ====================
  const handleAssignToGroup = async () => {
    console.log('🔍 [ASSIGN_TO_GROUP] Function called');
    console.log('🔍 [ASSIGN_TO_GROUP] Selected group:', selectedGroup);
    
    if (!selectedGroup) {
      showAlert('Please select a group to assign.', 'warning');
      return;
    }

    const originalGroupId = incident.originalAssignmentGroupId || incident.assignmentGroup?.groupId || incident.assignmentGroup?._id;
    const originalGroupMembers = incident.assignmentGroup?.members || [];

    // Find a default assignee from the new group
    const newGroupMembers = selectedGroup.members || [];
    let defaultAssignee = null;
    
    console.log('🔍 [ASSIGN_TO_GROUP] New group members:', newGroupMembers.length);
    
    if (newGroupMembers.length > 0) {
      // Try to find current user in new group first
      const currentUserInNewGroup = newGroupMembers.find(member => {
        const memberEmail = getMemberEmail(member);
        const memberId = getMemberId(member);
        const match = (memberEmail && memberEmail === currentUserEmail.toLowerCase()) || 
               (memberId && accounts?.[0]?.localAccountId && String(memberId) === String(accounts[0]?.localAccountId));
        if (match) console.log('🔍 [ASSIGN_TO_GROUP] Found current user in new group:', member.name);
        return match;
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
        console.log('🔍 [ASSIGN_TO_GROUP] Using first member as assignee:', firstMember.name);
      }
    }

    console.log('🔍 [ASSIGN_TO_GROUP] Original group ID:', originalGroupId);
    console.log('🔍 [ASSIGN_TO_GROUP] Default assignee:', defaultAssignee);

    // Close the group selection modal FIRST
    setAssignGroupModalOpen(false);
    
    // Show confirmation modal after a short delay
    setTimeout(() => {
      showConfirm({
        title: 'Confirm Group Reassignment',
        message: `Assign this incident to "${selectedGroup.name}"?\n\nMembers of the previous group will have view-only access. Members of the new group will have full access.\n\n${defaultAssignee ? `The incident will be assigned to: ${defaultAssignee.memberName}` : ''}`,
        confirmLabel: 'Assign to Group',
        danger: false,
        onConfirm: async () => {
          console.log('✅ [ASSIGN_TO_GROUP] User confirmed');
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
              originalAssignmentGroupId: originalGroupId || incident.assignmentGroup?.groupId || incident.assignmentGroup?._id,
              originalGroupMembers: originalGroupMembers,
              notes: `Incident reassigned to group "${selectedGroup.name}" by ${currentUserName}`,
              updatedBy: { id: accounts[0]?.localAccountId, name: currentUserName, mail: currentUserEmail },
            };
            
            console.log('📤 [ASSIGN_TO_GROUP] Payload:', JSON.stringify(payload, null, 2));
            
            const response = await axios.patch(`${BACKEND}/api/incidents/${id}`, payload);
            console.log('✅ [ASSIGN_TO_GROUP] Response status:', response.status);
            console.log('✅ [ASSIGN_TO_GROUP] Response data:', response.data);
            
            const refreshed = await axios.get(`${BACKEND}/api/incidents/${id}`);
            const normalized = normalizeIncidentAssignedMember(refreshed.data);
            setIncident(normalized);
            
            setSelectedGroup(null);
            showAlert(`Incident has been reassigned to "${selectedGroup.name}".`, 'success', 'Group Reassigned');
            console.log('✅ [ASSIGN_TO_GROUP] Group reassignment completed');
          } catch (err) {
            console.error('❌ [ASSIGN_TO_GROUP] Error:', err);
            console.error('❌ [ASSIGN_TO_GROUP] Error response:', err?.response?.data);
            showAlert('Failed to reassign group. ' + (err?.response?.data?.message || err.message), 'error', 'Assignment Failed');
          } finally {
            setAssigning(false);
          }
        },
        onCancel: () => {
          console.log('❌ [ASSIGN_TO_GROUP] User cancelled');
          closeConfirm();
          // Reopen the group selection modal
          setAssignGroupModalOpen(true);
        }
      });
    }, 100);
  };

  // Send message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sendingMessage) return;
    const messageText = newMessage.trim();
    setNewMessage('');
    setSendingMessage(true);
    try {
      const messageData = {
        message: messageText,
        sender: { id: accounts[0]?.localAccountId || '', name: currentUserName, email: currentUserEmail },
      };
      const res = await axios.post(`${BACKEND}/api/incidents/${id}/messages`, messageData);
      setMessages((prev) => [...prev, res.data]);
    } catch (err) {
      showAlert('Failed to send message. Please try again.', 'error');
      setNewMessage(messageText);
    } finally {
      setSendingMessage(false);
    }
  };

  const getStatusStyles = (status) => {
    const styles = {
      open: { bg: '#fef3c7', color: '#92400e', border: '#fbbf24' },
      in_progress: { bg: '#dbeafe', color: '#1e40af', border: '#3b82f6' },
      resolved: { bg: '#d1fae5', color: '#065f46', border: '#10b981' },
      closed: { bg: '#f3f4f6', color: '#374151', border: '#9ca3af' },
      cancelled: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444' },
    };
    return styles[status] || styles.open;
  };

  const getPriorityStyles = (priority) => {
    const styles = {
      high: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444', icon: '🔴' },
      medium: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b', icon: '🟡' },
      low: { bg: '#d1fae5', color: '#065f46', border: '#10b981', icon: '🟢' },
    };
    return styles[priority] || styles.medium;
  };

  const isCurrentUser = (email) => email?.toLowerCase() === currentUserEmail?.toLowerCase();

  const isGroupMember = isInCurrentGroup();
  const assignedToMe = isAssignedToMe();
  const assignedMember = getAssignedMember();
  const fullAccess = hasFullAccess();
  const viewOnly = hasViewOnlyAccess();

  if (isLoading) {
    return (
      <div className="id-page">
        <style>{sharedCSS}</style>
        <div className="id-loading">
          <div style={{ textAlign: 'center' }}>
            <div className="id-spinner" />
            <div style={{ marginTop: 14, fontSize: 14, color: '#64748b' }}>Loading incident details…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="id-page">
        <style>{sharedCSS}</style>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 48 }}>🚫</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#64748b' }}>Incident not found</div>
          <button className="id-btn id-btn-secondary" onClick={() => navigate('/incidents')}>← Back to Incidents</button>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyles(incident.status);
  const priorityStyle = getPriorityStyles(incident.priority);
  const historyEvents = incident.history?.length > 0 ? incident.history : [{ action: 'created', by: incident.raisedBy?.name || 'Unknown', at: incident.createdAt }];

  return (
    <div className="id-page">
      <style>{sharedCSS}</style>

      <AlertModal
        open={alertModal.open}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        onClose={closeAlert}
      />
      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        cancelLabel={confirmModal.cancelLabel}
        danger={confirmModal.danger}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />

      <div className="id-hero">
        <div className="id-hero-inner">
          <div className="id-hero-eyebrow">
            <div className="id-hero-eyebrow-line" />
            Incident Details
          </div>
          <h1>
            <span>{incident.incidentNumber}</span>
            <em>•</em>
            <span style={{ fontSize: 'clamp(18px, 2vw, 24px)' }}>{incident.title}</span>
          </h1>
          <p className="id-hero-sub">View and manage incident information, track progress, and communicate with stakeholders.</p>
        </div>
      </div>

      <div className="id-content">
        <button className="id-back-btn" onClick={() => navigate('/incidents')}>← Back to Incidents</button>

        <div className="id-layout">
          <div>
            <div className="id-main-card">
              <div className="id-card-header">
                <div className="id-title-row">
                  <div>
                    <div className="id-incident-title">{incident.category?.name || 'Incident'}</div>
                    <div style={{ fontSize: 14, color: '#64748b' }}>Created {formatDate(incident.createdAt)}</div>
                  </div>
                </div>
                <div className="id-pills">
                  <span className="id-pill" style={{ background: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}>
                    <span className="id-pill-dot" style={{ background: statusStyle.color }} />
                    {incident.status.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="id-pill" style={{ background: priorityStyle.bg, color: priorityStyle.color, borderColor: priorityStyle.border }}>
                    {priorityStyle.icon} {incident.priority?.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Assignment Card */}
              {incident.assignmentGroup && (
                <div className="id-section">
                  <div className="id-section-title">
                    <span>👤</span> Assignment
                  </div>

                  <div className="id-assignment-card">
                    <div className="id-assignment-label">Currently Assigned To</div>

                    {assignedMember ? (
                      <>
                        <div className="id-assignment-value">{assignedMember.memberName}</div>
                        <div className="id-assignment-email">{assignedMember.memberEmail}</div>

                        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {fullAccess && assignedToMe && (
                            <button className="id-assign-btn id-assign-btn-primary" onClick={handleUnassign} disabled={assigning}>
                              {assigning ? 'Working…' : '↩️ Deassign from me'}
                            </button>
                          )}
                          {fullAccess && authority === 'admin' && !assignedToMe && (
                            <button className="id-assign-btn id-assign-btn-primary" onClick={handleUnassign} disabled={assigning}>
                              {assigning ? 'Working…' : '✖ Unassign'}
                            </button>
                          )}
                          {fullAccess && (isGroupMember || authority === 'admin') && (
                            <>
                              <button
                                className="id-assign-btn"
                                onClick={() => {
                                  setAssignmentModalOpen(true);
                                  const groupMembers = incident.assignmentGroup?.members || [];
                                  const assignedInGroup = groupMembers.find(m => String(getMemberId(m)) === String(assignedMember.memberId));
                                  setSelectedMember(assignedInGroup || null);
                                }}
                                disabled={assigning}
                              >
                                👥 Reassign
                              </button>
                              <button
                                className="id-assign-btn"
                                onClick={() => {
                                  setAssignGroupModalOpen(true);
                                  fetchAllAssignmentGroups();
                                }}
                                disabled={assigning}
                              >
                                🏷️ Assign to Group
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="id-assignment-value" style={{ color: '#64748b' }}>Not assigned</div>

                        <div className="id-assign-buttons" style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {fullAccess && (isGroupMember || authority === 'admin') && (
                            <>
                              <button className="id-assign-btn id-assign-btn-primary" onClick={handleAssignToMe} disabled={assigning}>
                                {assigning ? 'Assigning...' : '📌 Assign to Me'}
                              </button>
                              <button className="id-assign-btn" onClick={() => setAssignmentModalOpen(true)} disabled={assigning}>
                                👥 Assign to Member
                              </button>
                              <button
                                className="id-assign-btn"
                                onClick={() => {
                                  setAssignGroupModalOpen(true);
                                  fetchAllAssignmentGroups();
                                }}
                                disabled={assigning}
                              >
                                🏷️ Assign to Group
                              </button>
                            </>
                          )}
                          {!fullAccess && !authority === 'admin' && (
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {viewOnly ? 'You have view-only access (original group member after reassignment).' : 'You are not a member of the current group.'}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* View Only Warning */}
                    {viewOnly && (
                      <div style={{ marginTop: 16, padding: 12, background: '#fef3c7', borderRadius: 10, borderLeft: '3px solid #f59e0b' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>🔒</span> View-Only Access
                        </div>
                        <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>
                          You were a member of the original assignment group. After reassignment, you can only view this incident. Contact an admin for updates.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="id-section">
                <div className="id-section-title"><span>📝</span> Description</div>
                <div className="id-description">{incident.description}</div>

                {attachmentList.length > 0 && (
                  <div className="id-attachments">
                    {attachmentList.map((att, idx) => (
                      <div key={idx} className="id-attachment-item" onClick={() => {
                        if (isPdfType(att.fileType, att.fileUrl)) downloadAttachment(att);
                        else if (isImageType(att.fileType)) { setActiveAttachment(att); setAttachmentModalOpen(true); }
                        else window.open(att.fileUrl, '_blank', 'noopener');
                      }}>
                        <span>📎</span>
                        <span>{att.fileName}</span>
                      </div>
                    ))}
                    {attachmentList.length > 1 && (
                      <button className="id-btn id-btn-secondary" style={{ padding: '10px 16px' }} onClick={downloadAllAttachments}>Download All</button>
                    )}
                  </div>
                )}
              </div>

              {/* Meta Grid */}
              <div className="id-meta-grid">
                <div className="id-meta-item">
                  <div className="id-meta-key">Raised By</div>
                  <div className="id-meta-value">{incident.raisedBy?.name}</div>
                  <div className="id-meta-sub">{incident.raisedBy?.mail}</div>
                </div>

                {incident.assignmentGroup?.groupName && (
                  <div className="id-meta-item">
                    <div className="id-meta-key">Current Group</div>
                    <div className="id-meta-value">{incident.assignmentGroup.groupName}</div>
                    <div className="id-meta-sub">{incident.assignmentGroup.members?.length || 0} members</div>
                    {incident.assignmentGroup.members?.length > 0 && (
                      <details style={{ marginTop: 12 }}>
                        <summary style={{ fontSize: 12, color: '#3b82f6', cursor: 'pointer' }}>View members ({incident.assignmentGroup.members.length})</summary>
                        <div style={{ marginTop: 10 }}>
                          {incident.assignmentGroup.members.map((member, idx) => (
                            <div key={idx} style={{ fontSize: 12, padding: '4px 0', color: '#64748b' }}>
                              • {member.name} ({member.email || member.mail || member.userPrincipalName || ''})
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {incident.originalAssignmentGroupId && (
                  <div className="id-meta-item">
                    <div className="id-meta-key">Original Group</div>
                    <div className="id-meta-value" style={{ color: '#92400e' }}>Previously Assigned Group</div>
                    <div className="id-meta-sub">Members of original group have view-only access</div>
                  </div>
                )}

                {incident.resolvedAt && (
                  <div className="id-meta-item">
                    <div className="id-meta-key">Resolved</div>
                    <div className="id-meta-value">{formatDate(incident.resolvedAt)}</div>
                  </div>
                )}
                {incident.closedAt && (
                  <div className="id-meta-item">
                    <div className="id-meta-key">Closed</div>
                    <div className="id-meta-value">{formatDate(incident.closedAt)}</div>
                  </div>
                )}
              </div>

              {/* Full Member List */}
              {incident.assignmentGroup?.members?.length > 0 && (
                <div className="id-section">
                  <div className="id-section-title"><span>👥</span> Current Group Members ({incident.assignmentGroup.members.length})</div>
                  <div className="id-members-list">
                    {incident.assignmentGroup.members.map((member, idx) => (
                      <div key={idx} className="id-member-chip" onClick={() => { if (fullAccess) { setSelectedMember(member); setAssignmentModalOpen(true); } }}>
                        <span className="id-member-avatar">{member.name?.charAt(0)?.toUpperCase() || '?'}</span>
                        <span>{member.name}</span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>({member.email || member.mail || member.userPrincipalName || ''})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Chat */}
            <div className="id-chat-card">
              <div className="id-chat-header" onClick={() => setChatExpanded(!chatExpanded)}>
                <div className="id-chat-header-left">
                  <span>💬</span>
                  <span className="id-chat-title">Incident Conversation</span>
                  {messages.length > 0 && <span className="id-chat-badge">{messages.length}</span>}
                </div>
                <span style={{ fontSize: 12, transition: 'transform 0.2s', transform: chatExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
              </div>

              {chatExpanded && (
                <>
                  {!canChat ? (
                    <div className="id-chat-no-access">
                      <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>🔒</span>
                      Only the person who raised this incident and members of the assigned group can chat.
                    </div>
                  ) : (
                    <>
                      <div className="id-chat-messages" ref={chatContainerRef}>
                        {chatLoading ? (
                          <div style={{ textAlign: 'center', padding: 20 }}>
                            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 20 }}>⟳</span>
                          </div>
                        ) : messages.length === 0 ? (
                          <div className="id-chat-empty">
                            <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>💬</span>
                            No messages yet. Start the conversation!
                          </div>
                        ) : (
                          messages.map((msg, idx) => {
                            const isOwn = isCurrentUser(msg.sender?.email);
                            return (
                              <div key={msg._id || idx} className={`id-message ${isOwn ? 'own' : ''}`}>
                                <div className="id-message-avatar">{msg.sender?.name?.charAt(0) || '?'}</div>
                                <div className="id-message-content">
                                  <div className="id-message-bubble">{msg.message}</div>
                                  <div className="id-message-meta">
                                    {!isOwn && <span className="id-message-sender">{msg.sender?.name}</span>}
                                    <span className="id-message-time">{new Date(msg.createdAt).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <form className="id-chat-input-area" onSubmit={handleSendMessage}>
                        <textarea className="id-chat-input" placeholder="Type your message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} rows={1} />
                        <button type="submit" className="id-chat-send" disabled={!newMessage.trim() || sendingMessage}>{sendingMessage ? '⋯' : '➤'}</button>
                      </form>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Timeline */}
            <div className="id-timeline">
              <div className="id-timeline-header">
                <span>📋</span> Incident Timeline
                {historyEvents.filter(e => new Date(e.at) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length > 0 && (
                  <span className="id-timeline-badge">
                    {historyEvents.filter(e => new Date(e.at) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length} new
                  </span>
                )}
              </div>

              <div className="id-timeline-list">
                {historyEvents.length === 0 ? (
                  <div className="id-timeline-empty">
                    <div className="id-timeline-empty-icon">📭</div>
                    <div className="id-timeline-empty-text">No timeline events yet</div>
                  </div>
                ) : (
                  historyEvents.map((event, idx) => {
                    const isCreated = event.action === 'created';
                    const isResolved = event.action === 'resolved';
                    const isClosed = event.action === 'closed';
                    const isAssigned = event.action === 'assigned';
                    const isCancelled = event.action === 'cancelled';

                    let iconColor = '#3b82f6';
                    let eventType = 'status_updated';

                    if (isCreated) { iconColor = '#ef4444'; eventType = 'created'; }
                    else if (isResolved) { iconColor = '#10b981'; eventType = 'resolved'; }
                    else if (isClosed) { iconColor = '#9ca3af'; eventType = 'closed'; }
                    else if (isAssigned) { iconColor = '#8b5cf6'; eventType = 'assigned'; }
                    else if (isCancelled) { iconColor = '#6b7280'; eventType = 'cancelled'; }

                    return (
                      <div key={idx} className="id-timeline-item" style={{ '--item-index': idx }}>
                        <div className="id-timeline-icon" style={{ background: iconColor }} data-type={eventType} />
                        <div className="id-timeline-content">
                          <div className="id-timeline-action">
                            {event.action === 'created' && '🚨 Incident Created'}
                            {event.action === 'status_updated' && '🔄 Status Updated'}
                            {event.action === 'assigned' && '👤 Assignment Changed'}
                            {event.action === 'resolved' && '✅ Incident Resolved'}
                            {event.action === 'closed' && '🔒 Incident Closed'}
                            {event.action === 'cancelled' && '🚫 Incident Cancelled'}
                            {!['created','status_updated','assigned','resolved','closed','cancelled'].includes(event.action) &&
                              <span>📌 {event.action.replace('_', ' ').toUpperCase()}</span>
                            }
                          </div>
                          <div className="id-timeline-meta">
                            {formatDate(event.at)} · {event.by || 'System'}
                          </div>
                          {(event.reason || event.notes) && (
                            <div className="id-timeline-note">{event.reason || event.notes}</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="id-sidebar">
            <div className="id-sidebar-card">
              <div className="id-sidebar-header"><span className="id-sidebar-header-title">ℹ️ Incident Information</span></div>
              <div className="id-sidebar-body">
                <div className="id-info-row">
                  <span className="id-info-label">Status</span>
                  <span className="id-pill" style={{ background: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border, width: 'fit-content' }}>
                    <span className="id-pill-dot" style={{ background: statusStyle.color }} />
                    {incident.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div className="id-info-row">
                  <span className="id-info-label">Priority</span>
                  <span className="id-pill" style={{ background: priorityStyle.bg, color: priorityStyle.color, borderColor: priorityStyle.border, width: 'fit-content' }}>
                    {priorityStyle.icon} {incident.priority?.toUpperCase()}
                  </span>
                </div>
                <div className="id-info-row">
                  <span className="id-info-label">Category</span>
                  <span className="id-info-value">{incident.category?.name || '—'}</span>
                </div>
                {incident.assignmentGroup?.groupName && (
                  <div className="id-info-row">
                    <span className="id-info-label">Current Group</span>
                    <span className="id-info-value">{incident.assignmentGroup.groupName}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{incident.assignmentGroup.members?.length || 0} member(s)</span>
                  </div>
                )}
                {assignedMember && (
                  <div className="id-info-row">
                    <span className="id-info-label">Assigned To</span>
                    <span className="id-info-value">{assignedMember.memberName}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{assignedMember.memberEmail}</span>
                  </div>
                )}
                {viewOnly && (
                  <div className="id-info-row">
                    <span className="id-info-label">Access Level</span>
                    <span className="id-info-value" style={{ color: '#92400e' }}>🔒 View Only</span>
                    <span style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>Original group member after reassignment</span>
                  </div>
                )}
                {fullAccess && authority !== 'admin' && (
                  <div className="id-info-row">
                    <span className="id-info-label">Access Level</span>
                    <span className="id-info-value" style={{ color: '#10b981' }}>✅ Full Access</span>
                    <span style={{ fontSize: 12, color: '#065f46', marginTop: 4 }}>You can update status and assign</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Update - Only show for users with FULL ACCESS */}
            {(fullAccess || authority === 'admin') && (
              <div className="id-status-card">
                <div className="id-status-header"><span className="id-status-header-title"><span>🔄</span> Update Status</span></div>
                <div className="id-status-body">
                  <div className="id-status-flow">
                    <div className="id-status-current">
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>CURRENT</div>
                      <span className="id-pill" style={{ background: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}>{incident.status.replace('_',' ').toUpperCase()}</span>
                    </div>
                    <span className="id-status-arrow">→</span>
                    <div className="id-status-new">
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>CHANGE TO</div>
                      <span className="id-pill" style={{ background: getStatusStyles(selectedStatus).bg, color: getStatusStyles(selectedStatus).color, borderColor: getStatusStyles(selectedStatus).border }}>
                        {selectedStatus !== incident.status ? selectedStatus.replace('_',' ').toUpperCase() : '—'}
                      </span>
                    </div>
                  </div>

                  <select className="id-select" value={selectedStatus} onChange={(e) => { setSelectedStatus(e.target.value); setStatusUpdateError(''); setStatusUpdateSuccess(''); }}>
                    {TICKET_STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ').toUpperCase()}</option>)}
                  </select>

                  <textarea className="id-textarea" placeholder="Add update notes (optional)..." value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />

                  {statusUpdateSuccess && <div className="id-success-message">✓ {statusUpdateSuccess}</div>}
                  {statusUpdateError && <div className="id-error-message">⚠ {statusUpdateError}</div>}

                  <button className="id-btn id-btn-primary" style={{ width: '100%' }} onClick={async () => {
                    if (!selectedStatus || selectedStatus === incident.status) { setStatusUpdateError('Please select a different status to update.'); return; }
                    setStatusUpdateLoading(true);
                    try {
                      await axios.patch(`${BACKEND}/api/incidents/${id}`, { status: selectedStatus, notes: statusNote, updatedBy: { id: accounts[0]?.localAccountId, name: accounts[0]?.name, mail: accounts[0]?.username } });
                      setIncident(prev => ({ ...prev, status: selectedStatus }));
                      setStatusNote('');
                      setStatusUpdateSuccess(`Status updated to "${selectedStatus}". Notifications sent.`);
                      setTimeout(() => setStatusUpdateSuccess(''), 5000);
                    } catch (err) {
                      setStatusUpdateError('Failed to update: ' + (err?.response?.data?.message || err.message || 'Unknown error'));
                    } finally {
                      setStatusUpdateLoading(false);
                    }
                  }} disabled={statusUpdateLoading || !selectedStatus || selectedStatus === incident.status}>
                    {statusUpdateLoading ? (<><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>Updating...</>) : 'Update & Notify'}
                  </button>

                  <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#64748b' }}>✉️ Notification will be sent to requester and group members</div>
                </div>
              </div>
            )}

            {/* View Only Message */}
            {viewOnly && (
              <div className="id-status-card">
                <div className="id-status-header" style={{ background: '#fef3c7' }}>
                  <span className="id-status-header-title" style={{ color: '#92400e' }}><span>🔒</span> Status Updates Disabled</span>
                </div>
                <div className="id-status-body">
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: 24, marginBottom: 12 }}>🔒</div>
                    <div style={{ fontSize: 14, color: '#92400e', fontWeight: 500, marginBottom: 8 }}>View-Only Access</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      You were a member of the original assignment group. After reassignment, you can only view this incident.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assignment Modal (Assign to Member) */}
      {assignmentModalOpen && (
        <div className="id-modal-overlay" onClick={() => { setAssignmentModalOpen(false); setSelectedMember(null); }}>
          <div className="id-modal" onClick={(e) => e.stopPropagation()}>
            <div className="id-modal-header">
              <span className="id-modal-title">Assign to Group Member</span>
              <button className="id-modal-close" onClick={() => { setAssignmentModalOpen(false); setSelectedMember(null); }}>✕</button>
            </div>
            <div className="id-modal-body">
              <p style={{ marginBottom: 12, color: '#64748b' }}>Select a member from <strong>{incident.assignmentGroup?.groupName}</strong> to assign this incident.</p>

              <div className="id-modal-member-list">
                {incident.assignmentGroup?.members?.map((member, idx) => (
                  <div key={idx} className={`id-modal-member-item ${selectedMember && (getMemberId(selectedMember) === getMemberId(member)) ? 'selected' : ''}`} onClick={() => setSelectedMember(member)}>
                    <div className="id-modal-member-info">
                      <div className="id-modal-member-name">{member.name}</div>
                      <div className="id-modal-member-email">{member.email || member.mail || member.userPrincipalName}</div>
                    </div>
                    <input type="radio" className="id-modal-radio" checked={selectedMember && (getMemberId(selectedMember) === getMemberId(member))} onChange={() => setSelectedMember(member)} />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, width: '100%', justifyContent: 'space-between', marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <button className="id-btn id-btn-primary" style={{ width: '100%' }} onClick={handleAssignToMe} disabled={(!isGroupMember && authority !== 'admin') || assigning}>
                    {assigning ? 'Assigning...' : '📌 Assign to Me'}
                  </button>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Assign to yourself (requires you to be a group member). Admins can also assign.</div>
                </div>

                <div style={{ flex: 1 }}>
                  <button className="id-btn id-btn-secondary" style={{ width: '100%' }} onClick={handleAssignToMember} disabled={!selectedMember || assigning}>
                    {assigning ? 'Assigning...' : `👤 Assign to ${selectedMember?.name || 'Member'}`}
                  </button>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Select a member and click to confirm assignment.</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button className="id-btn id-btn-secondary" onClick={() => { setAssignmentModalOpen(false); setSelectedMember(null); }} style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Group Modal - FIXED */}
      {assignGroupModalOpen && (
        <div className="id-modal-overlay" onClick={() => { setAssignGroupModalOpen(false); setSelectedGroup(null); }}>
          <div className="id-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 550 }}>
            <div className="id-modal-header">
              <span className="id-modal-title">🏷️ Assign to Different Group</span>
              <button className="id-modal-close" onClick={() => { setAssignGroupModalOpen(false); setSelectedGroup(null); }}>✕</button>
            </div>
            <div className="id-modal-body">
              <p style={{ marginBottom: 16, color: '#64748b' }}>
                Select an assignment group to reassign this incident.
              </p>
              <p style={{ marginBottom: 20, fontSize: 13, background: '#fef3c7', padding: 10, borderRadius: 10, color: '#92400e' }}>
                ⚠️ After reassignment, members of the original group will have <strong>view-only access</strong>. Members of the new group will have <strong>full access</strong> (can update status and assign).
              </p>

              {loadingGroups ? (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <div className="id-spinner" style={{ width: 30, height: 30 }} />
                </div>
              ) : (
                <div className="id-modal-member-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {allAssignmentGroups.map((group) => {
                    // Get the current group ID correctly from incident
                    const currentGroupId = incident.assignmentGroup?.groupId || incident.assignmentGroup?._id || incident.assignmentGroup?.id;
                    const groupId = group._id || group.id;
                    const isCurrentGroup = String(groupId) === String(currentGroupId);
                    
                    console.log('🔍 [GROUP_MODAL]', { groupName: group.name, groupId, currentGroupId, isCurrentGroup });
                    
                    return (
                      <div
                        key={groupId}
                        className={`id-modal-member-item ${selectedGroup?._id === groupId ? 'selected' : ''} ${isCurrentGroup ? 'disabled' : ''}`}
                        onClick={() => {
                          if (!isCurrentGroup) {
                            console.log('🔍 [GROUP_MODAL] Selected group:', group.name);
                            setSelectedGroup(group);
                          }
                        }}
                        style={{ opacity: isCurrentGroup ? 0.5 : 1, cursor: isCurrentGroup ? 'not-allowed' : 'pointer' }}
                      >
                        <div className="id-modal-member-info">
                          <div className="id-modal-member-name">
                            {group.name}
                            {isCurrentGroup && <span style={{ marginLeft: 8, fontSize: 11, color: '#10b981' }}>(Current Group)</span>}
                          </div>
                          <div className="id-modal-member-email">{group.members?.length || 0} members</div>
                        </div>
                        {!isCurrentGroup && (
                          <input type="radio" className="id-modal-radio" checked={selectedGroup?._id === groupId} onChange={() => setSelectedGroup(group)} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="id-btn id-btn-secondary" onClick={() => { setAssignGroupModalOpen(false); setSelectedGroup(null); }} style={{ flex: 1 }}>Cancel</button>
                <button className="id-btn id-btn-primary" onClick={handleAssignToGroup} disabled={!selectedGroup || assigning} style={{ flex: 1 }}>
                  {assigning ? 'Assigning...' : `Assign to ${selectedGroup?.name || 'Group'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Modal */}
      {activeAttachment && attachmentModalOpen && (
        <div className="id-modal-overlay" onClick={() => setAttachmentModalOpen(false)}>
          <div className="id-modal" onClick={(e) => e.stopPropagation()}>
            <div className="id-modal-header"><span className="id-modal-title">{activeAttachment.fileName}</span><button className="id-modal-close" onClick={() => setAttachmentModalOpen(false)}>✕</button></div>
            <div className="id-modal-body">
              {isImageType(activeAttachment.fileType) ? (<img src={imagePreviewUrl} alt={activeAttachment.fileName} className="id-modal-image" />) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ marginBottom: 20, color: '#64748b' }}>This file type cannot be previewed</div>
                  <button className="id-btn id-btn-primary" onClick={() => downloadAttachment(activeAttachment)}>Download File</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// CSS (same as your existing file)
const sharedCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --navy: #002060; --navy2: #003090; --orange: #e98404; --orange2: #f5a623; --white: #ffffff; --bg: #f5f7fa; --border: #e2e8f0; --text: #0f172a; --muted: #64748b; --light: #f8fafc; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes gradientShift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
  @keyframes slideInLeft { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }

  .id-page { min-height: 100vh; width: 100%; background: var(--bg); font-family: 'Lato', sans-serif; color: var(--text); }
  .id-hero { background: var(--navy); position: relative; overflow: hidden; padding: 48px 48px 44px; }
  .id-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%); pointer-events: none; }
  .id-hero-inner { position: relative; z-index: 2; max-width: 1320px; margin: 0 auto; animation: fadeUp 0.55s ease both; }
  .id-hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--orange); margin-bottom: 14px; }
  .id-hero-eyebrow-line { width: 28px; height: 2px; background: var(--orange); border-radius: 2px; }
  .id-hero h1 { font-family: 'Sora', sans-serif; font-size: clamp(24px, 3vw, 32px); font-weight: 800; color: #ffffff; line-height: 1.15; margin-bottom: 8px; letter-spacing: -0.02em; display: flex; align-items: center; gap: 16px; }
  .id-hero-sub { font-size: 15px; color: rgba(255,255,255,0.62); font-weight: 400; line-height: 1.6; }
  .id-back-btn { background: none; border: none; font-size: 14px; font-weight: 600; color: var(--navy); cursor: pointer; padding: 0; margin-bottom: 24px; display: inline-flex; align-items: center; gap: 6px; font-family: 'Sora', sans-serif; }
  .id-back-btn:hover { color: var(--orange); }
  .id-layout { display: grid; grid-template-columns: 1fr 360px; gap: 24px; max-width: 1320px; margin: 0 auto; padding: 32px 48px 56px; }
  .id-main-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 20px; overflow: hidden; animation: fadeUp 0.4s ease both; }
  .id-card-header { padding: 28px 32px; border-bottom: 1.5px solid var(--border); background: var(--light); }
  .id-title-row { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
  .id-incident-title { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
  .id-pills { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
  .id-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 30px; font-size: 12px; font-weight: 700; letter-spacing: 0.03em; border: 1.5px solid; }
  .id-pill-dot { width: 6px; height: 6px; border-radius: 50%; }
  .id-assignment-card { background: var(--light); border: 1.5px solid var(--border); border-radius: 14px; padding: 20px; margin-top: 12px; }
  .id-assignment-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 8px; }
  .id-assignment-value { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .id-assignment-email { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
  .id-assign-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
  .id-assign-btn { padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 600; font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s; border: 1.5px solid var(--border); background: var(--white); color: var(--navy); }
  .id-assign-btn:hover { border-color: var(--navy); background: var(--navy); color: white; }
  .id-assign-btn-primary { background: #ef4444; border-color: #ef4444; color: white; }
  .id-section { padding: 28px 32px; border-bottom: 1.5px solid var(--border); }
  .id-section-title { font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 16px; letter-spacing: 0.02em; display: flex; align-items: center; gap: 8px; }
  .id-description { font-size: 15px; color: var(--text); line-height: 1.7; white-space: pre-wrap; }
  .id-meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--border); }
  .id-meta-item { background: var(--white); padding: 20px 24px; }
  .id-meta-key { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 6px; }
  .id-meta-value { font-size: 15px; font-weight: 600; color: var(--text); }
  .id-meta-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
  .id-members-list { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .id-member-chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--white); border: 1px solid var(--border); border-radius: 30px; font-size: 12px; color: var(--text); cursor: pointer; transition: all 0.2s; }
  .id-member-avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--navy); color: white; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
  .id-sidebar { display: flex; flex-direction: column; gap: 20px; }
  .id-sidebar-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 18px; overflow: hidden; animation: fadeUp 0.45s 0.1s ease both; }
  .id-sidebar-header { padding: 20px 24px; border-bottom: 1.5px solid var(--border); background: var(--light); }
  .id-sidebar-header-title { font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: var(--navy); letter-spacing: 0.03em; }
  .id-sidebar-body { padding: 24px; }
  .id-info-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
  .id-info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
  .id-info-value { font-size: 15px; font-weight: 600; color: var(--text); }
  .id-status-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 18px; overflow: hidden; }
  .id-status-header { padding: 18px 24px; border-bottom: 1.5px solid var(--border); background: #fef2f2; }
  .id-status-header-title { font-family: 'Sora', sans-serif; font-size: 12px; font-weight: 700; color: #991b1b; letter-spacing: 0.04em; display: flex; align-items: center; gap: 8px; }
  .id-status-body { padding: 24px; }
  .id-status-flow { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--bg); border-radius: 12px; margin-bottom: 20px; }
  .id-select { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; cursor: pointer; margin-bottom: 16px; }
  .id-textarea { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; resize: vertical; min-height: 80px; margin-bottom: 16px; }
  .id-btn { padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s; border: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
  .id-btn-primary { background: #ef4444; color: white; } .id-btn-secondary { background: var(--white); border: 1.5px solid var(--border); color: var(--text); }
  .id-success-message { padding: 12px 16px; background: #d1fae5; border: 1.5px solid #10b981; border-radius: 12px; color: #065f46; font-size: 13px; font-weight: 500; margin-bottom: 16px; }
  .id-error-message { padding: 12px 16px; background: #fee2e2; border: 1.5px solid #ef4444; border-radius: 12px; color: #991b1b; font-size: 13px; font-weight: 500; margin-bottom: 16px; }
  .id-chat-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 18px; overflow: hidden; margin-top: 24px; }
  .id-chat-header { padding: 18px 24px; border-bottom: 1.5px solid var(--border); background: var(--light); display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
  .id-chat-messages { padding: 24px; max-height: 350px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
  .id-message { display: flex; gap: 12px; } .id-message.own { flex-direction: row-reverse; }
  .id-message-avatar { width: 36px; height: 36px; border-radius: 12px; background: var(--navy); color: white; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
  .id-message-content { max-width: 70%; } .id-message-bubble { padding: 12px 16px; background: var(--bg); border-radius: 16px; border-top-left-radius: 4px; font-size: 14px; color: var(--text); line-height: 1.5; }
  .id-chat-input-area { padding: 20px 24px; border-top: 1.5px solid var(--border); display: flex; gap: 12px; } .id-chat-input { flex: 1; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 24px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; resize: none; }
  .id-chat-send { width: 44px; height: 44px; border-radius: 50%; background: var(--navy); border: none; color: white; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .id-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 24px; }
  .id-modal { background: var(--white); border-radius: 20px; max-width: 500px; width: 100%; max-height: 90vh; overflow: hidden; animation: slideUp 0.2s; }
  .id-modal-header { padding: 24px 28px; border-bottom: 1.5px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .id-modal-body { padding: 28px; overflow-y: auto; max-height: calc(90vh - 80px); }
  .id-modal-member-list { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  .id-modal-member-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--bg); border: 1.5px solid var(--border); border-radius: 12px; cursor: pointer; transition: all 0.2s; }
  .id-modal-member-item.selected { border-color: var(--navy); background: rgba(0,32,96,0.05); }
  .id-modal-member-item.disabled { opacity: 0.5; cursor: not-allowed; }
  .id-modal-title { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: var(--text); }
  .id-modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted); padding: 4px; line-height: 1; }
  .id-modal-member-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .id-modal-member-email { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .id-loading { min-height: 100vh; background: var(--bg); display: flex; align-items: center; justify-content: center; }
  .id-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--navy); animation: spin 0.9s linear infinite; }
  .id-chat-no-access { padding: 32px 24px; text-align: center; color: var(--muted); font-size: 14px; line-height: 1.6; }
  .id-chat-empty { padding: 32px 24px; text-align: center; color: var(--muted); font-size: 14px; line-height: 1.6; }
  .id-chat-title { font-family: 'Sora', sans-serif; font-size: 14px; font-weight: 700; color: var(--navy); }
  .id-chat-badge { background: var(--navy); color: white; border-radius: 20px; padding: 2px 8px; font-size: 11px; font-weight: 700; margin-left: 4px; }
  .id-chat-header-left { display: flex; align-items: center; gap: 8px; }
  .id-message-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .id-message-sender { font-size: 12px; font-weight: 600; color: var(--navy); }
  .id-message-time { font-size: 11px; color: var(--muted); }
  .id-attachments { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  .id-attachment-item { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--light); border: 1.5px solid var(--border); border-radius: 10px; font-size: 13px; color: var(--navy); cursor: pointer; transition: all 0.2s; }
  .id-attachment-item:hover { border-color: var(--navy); background: rgba(0,32,96,0.04); }
  .id-modal-image { width: 100%; height: auto; border-radius: 12px; }
  .id-status-arrow { font-size: 18px; color: var(--muted); flex-shrink: 0; }
  .id-status-current, .id-status-new { display: flex; flex-direction: column; align-items: flex-start; }

  .id-alert-modal { max-width: 400px !important; }
  .id-confirm-modal { max-width: 420px !important; }
  .id-alert-modal-inner { padding: 32px 28px 28px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .id-alert-icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .id-alert-title { font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 700; text-align: center; }
  .id-alert-message { font-size: 14px; color: var(--muted); text-align: center; line-height: 1.6; }

  .id-timeline { background: var(--white); border: 1.5px solid var(--border); border-radius: 20px; overflow: hidden; margin-top: 24px; animation: fadeUp 0.4s ease both; transition: all 0.3s ease; }
  .id-timeline-header { padding: 20px 28px; background: linear-gradient(135deg, var(--light) 0%, var(--white) 100%); border-bottom: 2px solid var(--border); font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; color: var(--navy); letter-spacing: 0.02em; display: flex; align-items: center; gap: 10px; position: relative; overflow: hidden; }
  .id-timeline-header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--orange), var(--navy), var(--orange)); animation: gradientShift 3s ease infinite; }
  .id-timeline-list { padding: 24px 28px; max-height: 500px; overflow-y: auto; scroll-behavior: smooth; }
  .id-timeline-list::-webkit-scrollbar { width: 6px; }
  .id-timeline-list::-webkit-scrollbar-track { background: var(--bg); border-radius: 10px; }
  .id-timeline-list::-webkit-scrollbar-thumb { background: var(--orange); border-radius: 10px; }
  .id-timeline-item { display: flex; gap: 20px; margin-bottom: 28px; position: relative; animation: slideInLeft 0.4s ease both; animation-delay: calc(var(--item-index, 0) * 0.05s); }
  .id-timeline-item:last-child { margin-bottom: 0; }
  .id-timeline-item::before { content: ''; position: absolute; left: 14px; top: 32px; bottom: -28px; width: 2px; background: linear-gradient(180deg, var(--orange) 0%, var(--border) 100%); opacity: 0.3; }
  .id-timeline-item:last-child::before { display: none; }
  .id-timeline-icon { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; position: relative; z-index: 2; transition: all 0.2s ease; }
  .id-timeline-item:hover .id-timeline-icon { transform: scale(1.1); }
  .id-timeline-content { flex: 1; padding-bottom: 4px; }
  .id-timeline-action { font-family: 'Sora', sans-serif; font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .id-timeline-meta { font-size: 12px; color: var(--muted); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .id-timeline-meta::before { content: '🕐'; font-size: 11px; opacity: 0.7; }
  .id-timeline-note { font-size: 13px; color: var(--text); background: var(--bg); padding: 8px 12px; border-radius: 10px; margin-top: 8px; line-height: 1.5; border-left: 3px solid var(--orange); transition: all 0.2s ease; }
  .id-timeline-item:hover .id-timeline-note { background: rgba(233, 132, 4, 0.05); transform: translateX(2px); }
  .id-timeline-icon[data-type="created"] { background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15); }
  .id-timeline-icon[data-type="resolved"] { background: #10b981; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15); }
  .id-timeline-icon[data-type="closed"] { background: #9ca3af; box-shadow: 0 0 0 4px rgba(156, 163, 175, 0.15); }
  .id-timeline-icon[data-type="status_updated"] { background: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15); }
  .id-timeline-icon[data-type="assigned"] { background: #8b5cf6; box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.15); }
  .id-timeline-icon[data-type="cancelled"] { background: #6b7280; box-shadow: 0 0 0 4px rgba(107, 114, 128, 0.15); }
  .id-timeline-badge { display: inline-block; padding: 2px 8px; background: #ef4444; color: white; border-radius: 12px; font-size: 10px; font-weight: 700; margin-left: 8px; animation: pulse 1.5s ease infinite; }
  .id-timeline-empty { text-align: center; padding: 48px 28px; color: var(--muted); }
  .id-timeline-empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
  .id-timeline-empty-text { font-size: 14px; font-weight: 500; }

  @media (max-width: 1024px) { .id-layout { grid-template-columns: 1fr; } .id-meta-grid { grid-template-columns: 1fr; } }
  @media (max-width: 768px) { .id-hero { padding: 40px 24px; } .id-layout { padding: 24px 20px 40px; } .id-message-content { max-width: 85%; } .id-timeline-list { padding: 20px; } .id-timeline-item { gap: 12px; margin-bottom: 20px; } .id-timeline-icon { width: 28px; height: 28px; } .id-timeline-item::before { left: 12px; top: 28px; } }
`;

export default IncidentDetails;