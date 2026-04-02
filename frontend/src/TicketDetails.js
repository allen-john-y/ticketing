import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';
import DownloadIcon from './Download.png';
import AttachmentIcon from './attachment.jpg';
import HistoryIcon from './history.jpg';

function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts, instance } = useMsal();
  const [ticket, setTicket] = useState(null);
  const [authority, setAuthority] = useState('basic');
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeError, setCloseError] = useState('');

  const [showreopenReasonInput, setShowreopenReasonInput] = useState(false);
  const [reopenReason, setreopenReason] = useState('');
  const [reopenError, setreopenError] = useState('');

  const [confirmModal, setConfirmModal] = useState(false);
  const [confirmreopenModal, setConfirmreopenModal] = useState(false);
  const [categoryMeta, setCategoryMeta] = useState(null);

  const backendBase = process.env.REACT_APP_BACKEND_URL;

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isCategoryHead, setIsCategoryHead] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [returnedPassword, setReturnedPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [activeAttachment, setActiveAttachment] = useState(null);
  const [attachmentList, setAttachmentList] = useState([]);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  // ── Status update state ──
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState('');
  const [statusUpdateError, setStatusUpdateError] = useState('');

  const TICKET_STATUSES = [
    'Open',
    'In Progress',
    'Waiting for approval',
    'Approved',
    'Rejected',
    'On Hold',
    'Resolved',
    'Closed',
  ];

  useEffect(() => {
    const fetchAuthority = async () => {
      if (!accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });
        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const groups = groupsRes.data.value.map(g => g.displayName);
        setAuthority(groups.includes('Helpdesk_Admin') ? 'admin' : 'basic');
      } catch (err) {
        console.error('Authority error:', err);
      }
    };
    fetchAuthority();
  }, [accounts, instance]);

  useEffect(() => {
    let objectUrl = null;
    const loadImage = async () => {
      if (!activeAttachment || !activeAttachment.fileUrl) { setImagePreviewUrl(null); return; }
      try {
        const res = await fetch(activeAttachment.fileUrl);
        if (!res.ok) throw new Error('Failed to load image preview');
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setImagePreviewUrl(objectUrl);
      } catch (e) {
        setImagePreviewUrl(null);
      }
    };
    loadImage();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [activeAttachment]);

  useEffect(() => {
    const fetchTicket = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(`${backendBase}/tickets/${id}`);
        setTicket(res.data);
        setSelectedStatus(res.data.status || '');
        try {
          const all = await axios.get(`${backendBase}/api/categories`);
          setCategoryMeta(all.data.find(c => c.name?.toLowerCase() === res.data.category?.toLowerCase()) || null);
        } catch (e) { setCategoryMeta(null); }

        const list = [];
        if (res.data.attachments && Array.isArray(res.data.attachments) && res.data.attachments.length) {
          res.data.attachments.forEach(a => {
            const driveId = a.driveId || a.parentReference?.driveId || null;
            const driveItemId = a.id || a.fileId || null;
            const proxyUrl = driveItemId ? `${backendBase}/attachments/${driveItemId}${driveId ? `?driveId=${encodeURIComponent(driveId)}` : ''}` : (a.fileUrl || a.url || a.path || null);
            list.push({ fileName: a.fileName || a.file_name || a.originalname || '', fileType: a.fileType || a.file_type || a.mimetype || '', fileUrl: proxyUrl, id: driveItemId, driveId: driveId || null });
          });
        } else if (res.data.attachment && (res.data.attachment.fileName || res.data.attachment.fileUrl)) {
          const a = res.data.attachment;
          const driveId = a.driveId || a.parentReference?.driveId || null;
          const driveItemId = a.id || a.fileId || null;
          const proxyUrl = driveItemId ? `${backendBase}/attachments/${driveItemId}${driveId ? `?driveId=${encodeURIComponent(driveId)}` : ''}` : (a.fileUrl || null);
          list.push({ fileName: a.fileName || '', fileType: a.fileType || '', fileUrl: proxyUrl, id: driveItemId || null, driveId: driveId || null });
        }
        setAttachmentList(list);
      } catch (err) {
        console.error('Error fetching ticket:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTicket();
  }, [id, accounts, instance, backendBase]);

  useEffect(() => {
    if (!accounts[0] || !ticket || !categoryMeta) return;
    const acct = accounts[0] || {};
    const possibleEmails = [acct.username, acct.upn, acct.preferred_username, acct.email].filter(Boolean);
    const loggedEmail = (possibleEmails.find(e => typeof e === 'string') || '').toLowerCase().trim();
    const approvers = (ticket.approvers || [])
        .map(a => (a.email || a).toLowerCase().trim());

      const isApprover = loggedEmail && approvers.includes(loggedEmail.toLowerCase().trim());

      setIsCategoryHead(!!isApprover);
      setShowApprovalModal(
        isApprover && ticket.status?.toLowerCase() === 'waiting for approval'
      );
      console.log("APPROVERS:", approvers);
      console.log("LOGGED USER:", loggedEmail);
  }, [accounts, ticket, categoryMeta]);

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const needsApprovalBanner = isCategoryHead && ticket && ticket.status === 'Waiting for approval' && !showApprovalModal;

  const copyToClipboard = (text) => {
    try { navigator.clipboard.writeText(text); alert('Password copied to clipboard'); } catch (e) {}
  };

  // ── Status update handler ──
  const handleStatusUpdate = async () => {
    if (!selectedStatus || selectedStatus === ticket.status) {
      setStatusUpdateError('Please select a different status to update.');
      return;
    }
    setStatusUpdateLoading(true);
    setStatusUpdateError('');
    setStatusUpdateSuccess('');
    try {
      await axios.put(`${backendBase}/tickets/${id}/status`, {
        status: selectedStatus,
        note: statusNote.trim(),
        updatedBy: accounts[0]?.name || accounts[0]?.username,
        updatedByEmail: accounts[0]?.username,
      });
      setTicket(prev => ({ ...prev, status: selectedStatus }));
      setStatusNote('');
      setStatusUpdateSuccess(`Status updated to "${selectedStatus}". Notifications sent.`);
      setTimeout(() => setStatusUpdateSuccess(''), 5000);
    } catch (err) {
      setStatusUpdateError('Failed to update: ' + (err?.response?.data?.message || err.message || 'Unknown error'));
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const handleApprove = async () => {
    setApproveLoading(true);
    try {
      if (!ticket || ticket.status !== 'Waiting for approval') { alert('Approval is not allowed for this ticket.'); return; }
      const res = await axios.post(`${backendBase}/tickets/${id}/approve`, { approvedBy: getUserEmail(), note: adminNote });
      setShowApprovalModal(false);
      if (res.data?.newPassword) { setReturnedPassword(res.data.newPassword); setShowPasswordPopup(true); }
      else setTimeout(() => navigate('/', { state: { refresh: true } }), 200);
    } catch (err) {
      alert('Approval failed: ' + (err?.response?.data?.message || err.message || 'Unknown error'));
    } finally { setApproveLoading(false); setAdminNote(''); }
  };

  const handleReject = async () => {
    setRejectLoading(true);
    try {
      if (!ticket) throw new Error('Ticket missing');
      await axios.post(`${backendBase}/tickets/${id}/reject`, { rejectedBy: getUserEmail(), reason: adminNote });
      setShowApprovalModal(false); setAdminNote('');
      setTimeout(() => navigate('/', { state: { refresh: true } }), 200);
    } catch (err) {
      alert('Rejection failed: ' + (err?.response?.data?.message || err.message || 'Unknown error'));
    } finally { setRejectLoading(false); }
  };

  const handleSubmitReason = () => {
    if (!closeReason.trim()) { setCloseError('Please provide a reason for closing this ticket.'); return; }
    setCloseError(''); setShowReasonInput(false); setConfirmModal(true);
  };

  const confirmCloseTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/close`, { closeReason: closeReason.trim(), closedBy: getUserEmail(), closedByName: accounts[0]?.name  });
      setConfirmModal(false); setShowReasonInput(false); setCloseReason(''); setCloseError('');
      setTimeout(() => navigate('/tickets', { state: { refresh: true } }), 200);
    } catch (err) { setCloseError('Failed to close ticket. Please try again.'); }
    finally { setLoading(false); }
  };

  const cancelClose = () => { setShowReasonInput(false); setConfirmModal(false); setCloseReason(''); setCloseError(''); };

  const handleSubmitreopenReason = () => {
    if (!reopenReason.trim()) { setreopenError('Please provide a reason for reviving this ticket.'); return; }
    setreopenError(''); setShowreopenReasonInput(false); setConfirmreopenModal(true);
  };

  const confirmreopenTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/revive`, { revivedBy: getUserEmail(), revivedBy: getUserEmail(),  reviveReason: reopenReason.trim() });
      setConfirmreopenModal(false); setShowreopenReasonInput(false); setreopenReason(''); setreopenError('');
      setTimeout(() => navigate('/tickets', { state: { refresh: true } }), 200);
    } catch (err) { setreopenError('Failed to reopen ticket. Please try again.'); }
    finally { setLoading(false); }
  };

  const cancelreopen = () => { setShowreopenReasonInput(false); setConfirmreopenModal(false); setreopenReason(''); setreopenError(''); };

  const isImageType = (type) => type && type.startsWith && type.startsWith('image/');
  const isPdfType = (type, url) => (type && type === 'application/pdf') || (url && url.toLowerCase().endsWith('.pdf'));

  const openAttachmentViewer = (attachment) => {
    if (!attachment) return;
    if (isPdfType(attachment.fileType, attachment.fileUrl)) { downloadAttachment(attachment); return; }
    if (!isImageType(attachment.fileType)) { window.open(attachment.fileUrl, '_blank', 'noopener'); return; }
    setActiveAttachment({ ...attachment });
    setAttachmentModalOpen(true);
  };

  const getUserEmail = () => {
  const acct = accounts[0] || {};
  return (
    acct.username ||
    acct.preferred_username ||
    acct.email ||
    acct.upn ||
    ""
  ).toLowerCase().trim();
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
    const url = `${backendBase}/attachments/zip?ids=${encodeURIComponent(ids)}${driveIds ? `&driveIds=${encodeURIComponent(driveIds)}` : ''}`;
    const a = document.createElement('a');
    a.href = url; a.download = `attachments-${ticket.ticketNumber || id}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const accentColor = (ticket) => {
    if (!ticket) return '#3b82f6';
    if (ticket.status === 'Closed') return '#ef4444';
    if (ticket.status === 'Approved') return '#10b981';
    if (ticket.status === 'Waiting for approval') return '#f59e0b';
    return '#3b82f6';
  };

  const statusPill = (status) => {
    if (!status) return { bg: 'rgba(255,255,255,0.1)', color: '#d1d5db' };
    if (status === 'Closed') return { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171' };
    if (status === 'Approved') return { bg: 'rgba(16, 185, 129, 0.2)', color: '#86efac' };
    if (status === 'Waiting for approval') return { bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' };
    if (status === 'In Progress') return { bg: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd' };
    if (status === 'On Hold') return { bg: 'rgba(107, 114, 128, 0.2)', color: '#d1d5db' };
    if (status === 'Resolved') return { bg: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7' };
    if (status === 'Rejected') return { bg: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' };
    return { bg: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd' };
  };

  const priorityMeta = (p) => {
    if (!p) return { color: '#9ca3af', bg: 'rgba(255,255,255,0.1)' };
    if (p === 'High') return { color: '#f87171', bg: 'rgba(239, 68, 68, 0.2)' };
    if (p === 'Medium') return { color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.2)' };
    return { color: '#86efac', bg: 'rgba(16, 185, 129, 0.2)' };
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Skeleton ──
  if (isLoading) {
    return (
      <div className="td-root">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          .td-root { min-height: 100vh; background: linear-gradient(135deg, #0f172a 0%, #1a1f35 100%); font-family: 'Inter', sans-serif; }
          @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.5} }
          .skel { background: rgba(255, 255, 255, 0.1); animation: pulse 1.6s ease-in-out infinite; border-radius: 6px; }
        `}</style>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 12px', color: '#d1d5db', cursor: 'pointer', font: '600 13px Inter' }}>← Back</button>
              <div className="skel" style={{ width: 200, height: 28 }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>
            <div>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                {[1,2,3,4].map(i => <div key={i} className="skel" style={{ height: 14, width: `${60 + i * 8}%`, marginBottom: 12 }} />)}
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem' }}>
                {[1,2,3].map(i => <div key={i} className="skel" style={{ height: 60, borderRadius: 8, marginBottom: 12 }} />)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem', height: 'fit-content' }}>
              {[1,2,3,4].map(i => <div key={i} className="skel" style={{ height: 14, width: `${40 + i * 10}%`, marginBottom: 14 }} />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1a1f35 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', fontSize: 16, color: '#9ca3af', fontWeight: 500, flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: 44, marginBottom: '0.5rem' }}>📭</div>
      <div>Ticket not found</div>
      <button onClick={() => navigate('/tickets')} style={{ marginTop: '1rem', background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>← Back to Tickets</button>
    </div>
  );

  const sp = statusPill(ticket.status);
  const pm = priorityMeta(ticket.priority);
  const ac = accentColor(ticket);

  const historyEvents = ticket.history && ticket.history.length > 0
    ? ticket.history
    : [
        { action: 'created', by: ticket.userName, at: ticket.createdAt, reason: null },
        ...(ticket.closedAt ? [{ action: 'closed', by: ticket.closedBy || 'Unknown', at: ticket.closedAt, reason: ticket.closeReason }] : []),
        ...(ticket.reopenedAt ? [{ action: 'reopend', by: ticket.reopenedBy || 'Unknown', at: ticket.reopenedAt, reason: ticket.reopenReason }] : [])
      ];

  const hasAttachment = attachmentList && attachmentList.length > 0;

  const renderAttachmentBlock = (inline = false) => {
    if (!hasAttachment) return null;
    const a = attachmentList[0];
    const isPdf = isPdfType(a.fileType, a.fileUrl);
    return (
      <div style={{ marginTop: inline ? 16 : 0, paddingTop: inline ? 16 : 0, borderTop: inline ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={AttachmentIcon} alt="attachment" style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'cover' }} />
          {attachmentList.length > 1 ? `Attachments (${attachmentList.length})` : 'Attachment'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {attachmentList.length === 1 ? (
            <>
              <button onClick={() => isPdf ? downloadAttachment(a) : openAttachmentViewer(a)} className="td-btn td-btn-sm td-btn-secondary">
                {isPdf ? (
                  <><img src={DownloadIcon} alt="download" style={{ width: 13, height: 13, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} /> Download PDF</>
                ) : '👁️ View'}
              </button>
              {!isPdf && (
                <button onClick={() => downloadAttachment(a)} className="td-btn td-btn-sm td-btn-ghost">
                  <img src={DownloadIcon} alt="download" style={{ width: 13, height: 13, objectFit: 'contain', filter: 'brightness(0) invert(0.7)' }} />
                  Download
                </button>
              )}
              <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center', marginLeft: 'auto' }}>{a.fileName}</span>
            </>
          ) : (
            <>
              <button onClick={() => { setActiveAttachment(attachmentList[0]); setAttachmentModalOpen(true); }} className="td-btn td-btn-sm td-btn-secondary">
                👁️ View all
              </button>
              <button onClick={downloadAllAttachments} className="td-btn td-btn-sm td-btn-ghost">
                <img src={DownloadIcon} alt="download" style={{ width: 13, height: 13, objectFit: 'contain', filter: 'brightness(0) invert(0.7)' }} />
                Download ZIP
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderHistoryAttachment = (event) => {
    if (!event.attachment || (!event.attachment.fileName && !event.attachment.fileUrl)) return null;
    const att = { fileName: event.attachment.fileName || 'Attachment', fileType: event.attachment.fileType || '', fileUrl: event.attachment.fileUrl, id: null };
    const isPdf = isPdfType(att.fileType, att.fileUrl);
    return (
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <img src={AttachmentIcon} alt="attachment" style={{ width: 13, height: 13, borderRadius: 2, objectFit: 'cover' }} />
        <span style={{ fontSize: 12, color: '#d1d5db', fontWeight: 500 }}>Attachment:</span>
        <button onClick={() => isPdf ? downloadAttachment(att) : openAttachmentViewer(att)} className="td-btn td-btn-sm td-btn-secondary">
          {isPdf
            ? <><img src={DownloadIcon} alt="download" style={{ width: 12, height: 12, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} /> Download</>
            : '👁️ View'}
        </button>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{att.fileName}</span>
      </div>
    );
  };

  const historyEventMeta = (action) => {
    if (action === 'created') return { label: '✎ Ticket created', accent: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
    if (action === 'closed') return { label: '✕ Ticket closed', accent: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
    if (action === 'reopend' || action === 'reopened') return { label: '↻ Ticket reopened', accent: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    if (action === 'approved') return { label: '✓ Ticket approved', accent: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    if (action === 'rejected') return { label: '✕ Ticket rejected', accent: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
    if (action === 'status_updated') return { label: '↺ Status updated', accent: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
    return { label: action, accent: '#9ca3af', bg: 'rgba(255,255,255,0.05)' };
  };

  return (
    <div className="td-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .td-root {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1a1f35 100%);
          font-family: 'Inter', sans-serif;
          color: #f3f4f6;
        }

        .td-body { max-width: 1000px; margin: 0 auto; padding: 2rem; }

        .td-topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }

        .td-back-btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: #d1d5db; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; font-family: 'Inter', sans-serif; }
        .td-back-btn:hover { background: rgba(255,255,255,0.12); color: #f3f4f6; }

        .td-title-section { display: flex; flex-direction: column; gap: 4px; }
        .td-ticket-title { font-size: 20px; font-weight: 700; color: #f3f4f6; letter-spacing: -0.01em; }
        .td-ticket-subtitle { font-size: 12px; color: #9ca3af; font-weight: 500; }

        .td-layout { display: grid; grid-template-columns: 1fr 320px; gap: 1.5rem; margin-bottom: 2rem; }

        .td-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(10px); overflow: hidden; }

        .td-ticket-header { padding: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; gap: 1.25rem; align-items: flex-start; }
        .td-accent-bar { width: 4px; height: 100%; border-radius: 2px; flex-shrink: 0; min-height: 60px; }
        .td-header-content h2 { font-size: 16px; font-weight: 700; color: #f3f4f6; margin-bottom: 8px; letter-spacing: -0.01em; }
        .td-header-content p { font-size: 12px; color: #9ca3af; font-weight: 500; margin-bottom: 10px; }

        .td-pills { display: flex; gap: 8px; flex-wrap: wrap; }
        .td-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 16px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap; }
        .td-pill-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

        .td-approval-banner { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 10px; padding: 1.25rem; margin: 0 1.5rem 1.5rem; text-align: center; }
        .td-approval-banner h3 { font-size: 13px; font-weight: 700; color: #fbbf24; margin-bottom: 10px; }

        .td-section { padding: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .td-section:last-child { border-bottom: none; }
        .td-section-title { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; margin-bottom: 12px; }
        .td-section-content { font-size: 13px; color: #d1d5db; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }

        .td-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: rgba(255,255,255,0.05); }
        .td-meta-item { background: rgba(255,255,255,0.03); padding: 1.25rem 1.5rem; }
        .td-meta-item:nth-child(2n) { background: rgba(255,255,255,0.05); }
        .td-meta-key { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
        .td-meta-value { font-size: 14px; font-weight: 600; color: #f3f4f6; font-family: 'Inter', monospace; }

        .td-sidebar { display: flex; flex-direction: column; gap: 1.5rem; }
        .td-sidebar-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(10px); overflow: hidden; height: fit-content; }
        .td-sidebar-section { padding: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .td-sidebar-section:last-child { border-bottom: none; }
        .td-sidebar-label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; margin-bottom: 12px; }

        .td-info-group { display: flex; flex-direction: column; gap: 12px; }
        .td-info-item { display: flex; flex-direction: column; gap: 4px; }
        .td-info-key { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; }
        .td-info-value { font-size: 13px; font-weight: 600; color: #f3f4f6; }

        .td-actions { display: flex; flex-direction: column; gap: 8px; }

        .td-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; border: none; transition: all 0.2s; text-decoration: none; white-space: nowrap; }
        .td-btn-sm { padding: 7px 14px; font-size: 12px; }
        .td-btn-md { padding: 9px 18px; }
        .td-btn-lg { padding: 11px 22px; font-size: 14px; width: 100%; }
        .td-btn-primary { background: #3b82f6; color: #fff; box-shadow: 0 4px 12px rgba(59,130,246,0.3); }
        .td-btn-primary:hover { background: #2563eb; transform: translateY(-2px); }
        .td-btn-secondary { background: rgba(255,255,255,0.1); color: #e5e7eb; border: 1px solid rgba(255,255,255,0.2); }
        .td-btn-secondary:hover { background: rgba(255,255,255,0.15); }
        .td-btn-ghost { background: transparent; color: #9ca3af; border: 1px solid rgba(255,255,255,0.1); }
        .td-btn-ghost:hover { background: rgba(255,255,255,0.05); color: #d1d5db; }
        .td-btn-danger { background: #ef4444; color: #fff; }
        .td-btn-danger:hover { background: #dc2626; transform: translateY(-2px); }
        .td-btn-success { background: #10b981; color: #fff; }
        .td-btn-success:hover { background: #059669; transform: translateY(-2px); }
        .td-btn-warn { background: #f59e0b; color: #fff; }
        .td-btn-warn:hover { background: #d97706; transform: translateY(-2px); }
        .td-btn-muted { background: rgba(255,255,255,0.08); color: #d1d5db; border: 1px solid rgba(255,255,255,0.1); }
        .td-btn-muted:hover { background: rgba(255,255,255,0.12); }
        .td-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }

        .td-history { margin-top: 2rem; }
        .td-history-header { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px 12px 0 0; padding: 1.25rem 1.5rem; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; display: flex; align-items: center; gap: 8px; }
        .td-history-list { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-top: none; border-radius: 0 0 12px 12px; overflow: hidden; }
        .td-history-event { display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 1.25rem 1.5rem; }
        .td-history-event:last-child { border-bottom: none; }
        .td-history-event:nth-child(even) { background: rgba(255,255,255,0.02); }
        .td-history-accent { width: 3px; border-radius: 2px; flex-shrink: 0; margin-right: 12px; }
        .td-history-content { flex: 1; }
        .td-history-action { font-size: 13px; font-weight: 700; color: #f3f4f6; margin-bottom: 4px; }
        .td-history-meta { font-size: 11px; color: #9ca3af; font-family: 'Inter', monospace; margin-bottom: 8px; }
        .td-history-reason { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #d1d5db; margin-top: 8px; }

        /* ── Status Update Card ── */
        .td-su-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden; backdrop-filter: blur(10px); }
        .td-su-header { padding: 1rem 1.25rem; background: rgba(37,99,235,0.1); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 8px; }
        .td-su-header-title { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: #93c5fd; }
        .td-su-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }

        .td-su-flow-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; }
        .td-su-flow-item { display: flex; flex-direction: column; gap: 5px; flex: 1; }
        .td-su-flow-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563; }
        .td-su-flow-arrow { font-size: 16px; color: #374151; flex-shrink: 0; }

        .td-su-select-wrap { position: relative; }
        .td-su-select { width: 100%; padding: 10px 34px 10px 12px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #f3f4f6; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; appearance: none; -webkit-appearance: none; transition: all 0.2s; outline: none; }
        .td-su-select:focus { border-color: #3b82f6; background: rgba(59,130,246,0.1); box-shadow: 0 0 0 3px rgba(59,130,246,0.14); }
        .td-su-select option { background: #1e293b; color: #f3f4f6; font-weight: 500; }
        .td-su-select-arrow { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #6b7280; font-size: 10px; }

        .td-su-note { width: 100%; padding: 10px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #f3f4f6; font-size: 13px; font-family: 'Inter', sans-serif; resize: none; transition: all 0.2s; outline: none; line-height: 1.5; }
        .td-su-note:focus { border-color: #3b82f6; background: rgba(59,130,246,0.07); box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
        .td-su-note::placeholder { color: #374151; }

        .td-su-btn { width: 100%; padding: 11px 16px; background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%); border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 700; font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; letter-spacing: 0.01em; }
        .td-su-btn:hover:not(:disabled) { background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(37,99,235,0.4); }
        .td-su-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

        @keyframes suFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .td-su-success { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); border-radius: 8px; font-size: 12px; color: #6ee7b7; font-weight: 500; animation: suFadeIn 0.3s ease; line-height: 1.5; }
        .td-su-error { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; font-size: 12px; color: #fca5a5; font-weight: 500; line-height: 1.5; }
        .td-su-mail-note { display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 11px; color: #374151; padding: 4px 0 2px; }

        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .td-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999; animation: fadeIn 0.15s; backdrop-filter: blur(5px); padding: 1rem; }
        .td-modal { background: #1f2937; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 2rem; width: 100%; max-width: 560px; animation: slideUp 0.2s; max-height: 90vh; overflow-y: auto; }
        .td-modal-wide { max-width: 900px; }
        .td-modal-title { font-size: 18px; font-weight: 700; color: #f3f4f6; margin-bottom: 6px; letter-spacing: -0.01em; }
        .td-modal-subtitle { font-size: 13px; color: #d1d5db; margin-bottom: 1.5rem; line-height: 1.6; }
        .td-textarea { width: 100%; padding: 10px 14px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-size: 13px; font-family: 'Inter', sans-serif; background: rgba(255,255,255,0.05); color: #f3f4f6; resize: vertical; min-height: 100px; transition: all 0.2s; margin-bottom: 4px; }
        .td-textarea:focus { outline: none; border-color: #3b82f6; background: rgba(255,255,255,0.08); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        .td-textarea::placeholder { color: #6b7280; }
        .td-error { font-size: 12px; color: #f87171; font-weight: 600; margin-top: 4px; margin-bottom: 10px; }
        .td-modal-actions { display: flex; gap: 10px; margin-top: 1.5rem; flex-wrap: wrap; }
        .td-modal-actions .td-btn { flex: 1; }
        .td-approval-grid { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem; display: flex; flex-direction: column; gap: 8px; }
        .td-approval-row { display: flex; gap: 12px; font-size: 13px; align-items: flex-start; }
        .td-approval-key { font-weight: 600; color: #9ca3af; width: 140px; flex-shrink: 0; }
        .td-approval-value { color: #d1d5db; flex: 1; }
        .td-password-box { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1.5rem; font-family: 'Inter', monospace; font-size: 18px; font-weight: 700; color: #60a5fa; word-break: break-all; text-align: center; letter-spacing: 0.08em; margin: 1.5rem 0; }

        .td-att-content { min-height: 300px; max-height: 65vh; display: flex; justify-content: center; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; overflow: auto; flex-direction: column; }
        .td-att-img { max-width: 100%; max-height: 62vh; object-fit: contain; border-radius: 6px; }
        .td-att-list { display: flex; gap: 8px; overflow-x: auto; padding-top: 12px; padding-bottom: 4px; }
        .td-att-thumb { padding: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; min-width: 130px; display: flex; gap: 8px; align-items: center; flex-shrink: 0; transition: all 0.2s; }
        .td-att-thumb:hover { border-color: #3b82f6; background: rgba(59,130,246,0.1); }
        .td-att-thumb img { width: 52px; height: 52px; object-fit: cover; border-radius: 6px; }
        .td-att-thumb-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .td-att-thumb-name { font-size: 12px; font-weight: 600; color: #f3f4f6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .td-att-thumb-type { font-size: 11px; color: #9ca3af; }

        @media (max-width: 900px) { .td-layout { grid-template-columns: 1fr; } .td-meta-grid { grid-template-columns: 1fr; } }
        @media (max-width: 640px) { .td-body { padding: 1rem; } .td-topbar { flex-direction: column; align-items: flex-start; gap: 12px; } .td-modal { padding: 1.5rem; } .td-btn-lg { padding: 9px 14px; font-size: 12px; } .td-approval-key { width: 100%; } .td-approval-row { flex-direction: column; gap: 4px; } }
      `}</style>

      <div className="td-body">
        {/* ── Top bar ── */}
        <div className="td-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="td-back-btn" onClick={() => navigate(-1)}>← Back</button>
            <div className="td-title-section">
              <div className="td-ticket-title">#{ticket.ticketNumber}</div>
              <div className="td-ticket-subtitle">{ticket.category}</div>
            </div>
          </div>
        </div>

        {/* ── Main layout ── */}
        <div className="td-layout">
          {/* LEFT */}
          <div>
            <div className="td-card" style={{ marginBottom: '1.5rem' }}>
              <div className="td-ticket-header">
                <div className="td-accent-bar" style={{ background: ac }} />
                <div className="td-header-content" style={{ flex: 1 }}>
                  <h2>{ticket.category}</h2>
                  <p>{ticket.description?.substring(0, 100)}...</p>
                  <div className="td-pills">
                    <span className="td-pill" style={{ background: sp.bg, color: sp.color }}>
                      <span className="td-pill-dot" style={{ background: sp.color }} />
                      {ticket.status}
                    </span>
                    <span className="td-pill" style={{ background: pm.bg, color: pm.color }}>
                      ⚡ {ticket.priority}
                    </span>
                  </div>
                </div>
              </div>

              {needsApprovalBanner && (
                <div className="td-approval-banner">
                  <h3>⚠️ Waiting for your approval</h3>
                  <button onClick={() => setShowApprovalModal(true)} className="td-btn td-btn-md td-btn-warn">
                    Review & take action
                  </button>
                </div>
              )}

              <div className="td-section">
                <div className="td-section-title">📝 Description</div>
                <div className="td-section-content">{ticket.description}</div>
                {renderAttachmentBlock(true)}
              </div>

              <div className="td-meta-grid">
                <div className="td-meta-item">
                  <div className="td-meta-key">📅 Created</div>
                  <div className="td-meta-value">{formatDate(ticket.createdAt)}</div>
                </div>
                <div className="td-meta-item">
                  <div className="td-meta-key">👤 Submitted by</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="td-meta-value">{ticket.userName}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{ticket.userEmail}</div>
                  </div>
                </div>
                {ticket.closedAt && (
                  <div className="td-meta-item">
                    <div className="td-meta-key">✕ Closed</div>
                    <div className="td-meta-value">{formatDate(ticket.closedAt)}</div>
                  </div>
                )}
                {ticket.assignedTo && (
                  <div className="td-meta-item">
                    <div className="td-meta-key">🎯 Assigned</div>
                    <div className="td-meta-value">{ticket.assignedTo}</div>
                  </div>
                )}
              </div>
            </div>

            {/* History */}
            <div className="td-history">
              <div className="td-history-header">
                <img src={HistoryIcon} alt="history" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />
                History
              </div>
              <div className="td-history-list">
                {historyEvents.map((event, idx) => {
                  const hm = historyEventMeta(event.action);
                  const isOpsFin = ticket.category === 'Operational & Finance';
                  return (
                    <div key={idx} className="td-history-event">
                      <div className="td-history-accent" style={{ background: hm.accent }} />
                      <div className="td-history-content">
                        <div className="td-history-action">{hm.label}</div>
                        <div className="td-history-meta">
                          {formatDate(event.at)} · {event.by || 'Unknown'}
                          {event.action === 'created' && (ticket.onBehalf || (event.by !== ticket.userName)) && (
                            <span style={{ color: '#fbbf24', marginLeft: '6px' }}>on behalf of {ticket.onBehalf || ticket.userName}</span>
                          )}
                        </div>
                        {isOpsFin && event.subQuery && (
                          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
                            Sub: <strong>{event.subQuery}</strong>
                            {event.subQuery === 'Other' && event.otherSubQueryText && <span> — {event.otherSubQueryText}</span>}
                          </div>
                        )}
                        {event.reason && <div className="td-history-reason">{event.reason}</div>}
                        {event.action === 'status_updated' && event.newStatus && (
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>Changed to</span>
                            <span className="td-pill" style={{ ...statusPill(event.newStatus), fontSize: 10, padding: '2px 8px' }}>
                              {event.newStatus}
                            </span>
                          </div>
                        )}
                        {renderHistoryAttachment(event)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Sidebar */}
          <div className="td-sidebar">
            {/* Info card */}
            <div className="td-sidebar-card">
              <div className="td-sidebar-section">
                <div className="td-sidebar-label">ℹ️ Ticket Info</div>
                <div className="td-info-group">
                  <div className="td-info-item">
                    <div className="td-info-key">Status</div>
                    <span className="td-pill" style={{ background: sp.bg, color: sp.color, width: 'fit-content' }}>
                      <span className="td-pill-dot" style={{ background: sp.color }} />
                      {ticket.status}
                    </span>
                  </div>
                  <div className="td-info-item">
                    <div className="td-info-key">Priority</div>
                    <span className="td-pill" style={{ background: pm.bg, color: pm.color, width: 'fit-content' }}>
                      ⚡ {ticket.priority}
                    </span>
                  </div>
                  <div className="td-info-item">
                    <div className="td-info-key">Ticket Number</div>
                    <div className="td-info-value">#{ticket.ticketNumber}</div>
                  </div>
                  {ticket.onBehalf && (
                    <div className="td-info-item">
                      <div className="td-info-key">On Behalf Of</div>
                      <div className="td-info-value">{ticket.onBehalf}</div>
                      {ticket.onBehalfEmail && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{ticket.onBehalfEmail}</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Admin Status Update Card ── */}
            {authority === 'admin' && (
              <div className="td-su-card">
                <div className="td-su-header">
                  <span className="td-su-header-title">⚙️ Update Ticket Status</span>
                </div>
                <div className="td-su-body">

                  {/* Current → New status row */}
                  <div className="td-su-flow-row">
                    <div className="td-su-flow-item">
                      <span className="td-su-flow-label">Current</span>
                      <span className="td-pill" style={{ background: sp.bg, color: sp.color, fontSize: 11 }}>
                        <span className="td-pill-dot" style={{ background: sp.color }} />
                        {ticket.status}
                      </span>
                    </div>
                    <span className="td-su-flow-arrow">→</span>
                    <div className="td-su-flow-item">
                      <span className="td-su-flow-label">Change to</span>
                      {selectedStatus && selectedStatus !== ticket.status ? (
                        <span className="td-pill" style={{ background: statusPill(selectedStatus).bg, color: statusPill(selectedStatus).color, fontSize: 11 }}>
                          <span className="td-pill-dot" style={{ background: statusPill(selectedStatus).color }} />
                          {selectedStatus}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#4b5563', fontStyle: 'italic' }}>select below</span>
                      )}
                    </div>
                  </div>

                  {/* Status select */}
                  <div className="td-su-select-wrap">
                    <select
                      className="td-su-select"
                      value={selectedStatus}
                      onChange={(e) => {
                        setSelectedStatus(e.target.value);
                        setStatusUpdateError('');
                        setStatusUpdateSuccess('');
                      }}
                    >
                      {TICKET_STATUSES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <span className="td-su-select-arrow">▼</span>
                  </div>

                  {/* Note textarea */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Note to requester <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </div>
                    <textarea
                      className="td-su-note"
                      placeholder="e.g. We are looking into your request and will update you shortly…"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      rows={3}
                    />
                  </div>

                  {/* Feedback */}
                  {statusUpdateSuccess && (
                    <div className="td-su-success">
                      <span style={{ flexShrink: 0, fontSize: 14 }}>✓</span>
                      <span>{statusUpdateSuccess}</span>
                    </div>
                  )}
                  {statusUpdateError && (
                    <div className="td-su-error">
                      <span style={{ flexShrink: 0, fontSize: 14 }}>⚠</span>
                      <span>{statusUpdateError}</span>
                    </div>
                  )}

                  {/* Update button — uses DownloadIcon correctly as the "send/push" action icon */}
                  <button
                    className="td-su-btn"
                    onClick={handleStatusUpdate}
                    disabled={statusUpdateLoading || !selectedStatus || selectedStatus === ticket.status}
                  >
                    {statusUpdateLoading ? (
                      <>
                        <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 15 }}>⟳</span>
                        Updating & sending mail…
                      </>
                    ) : (
                      <>
                        <img src={DownloadIcon} alt="send" style={{ width: 15, height: 15, objectFit: 'contain', filter: 'brightness(0) invert(1)', transform: 'rotate(180deg)' }} />
                        Update & Notify
                      </>
                    )}
                  </button>

                  <div className="td-su-mail-note">
                    <span style={{ fontSize: 13, marginRight: 4 }}>✉️</span>
                    Mail sent to submitter + CC on every update
                  </div>
                </div>
              </div>
            )}

            {/* Actions card */}
            {(authority === 'admin' && ticket.status !== 'Closed') || ticket.status === 'Closed' ? (
              <div className="td-sidebar-card">
                <div className="td-sidebar-section">
                  <div className="td-sidebar-label">⚙️ Actions</div>
                  <div className="td-actions">
                    {authority === 'admin' && ticket.status !== 'Closed' && (
                      <button onClick={() => setShowReasonInput(true)} className="td-btn td-btn-lg td-btn-danger">
                        ✕ Close Ticket
                      </button>
                    )}
                    {ticket.status === 'Closed' && (
                      <button onClick={() => setShowreopenReasonInput(true)} className="td-btn td-btn-lg td-btn-success">
                        ↻ Reopen Ticket
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── APPROVAL MODAL ── */}
      {showApprovalModal && isCategoryHead && (
        <div className="td-overlay">
          <div className="td-modal td-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Approval required</div>
            <div className="td-modal-subtitle">Review the ticket details and take action as the category head.</div>
            <div className="td-approval-grid">
              {[
                ['Ticket #', ticket.ticketNumber],
                ['Category', ticket.category],
                ['Created by', ticket.userName],
                ['Email', ticket.userEmail],
                ['Priority', ticket.priority],
                ['On behalf', ticket.onBehalf || 'Self'],
                ticket.onBehalfEmail && ['On behalf email', ticket.onBehalfEmail],
                ticket.deliveryEmail && ['Delivery email', ticket.deliveryEmail],
                ['Created on', formatDate(ticket.createdAt)],
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} className="td-approval-row">
                  <span className="td-approval-key">{k}</span>
                  <span className="td-approval-value">{v}</span>
                </div>
              ))}
            </div>
            <textarea className="td-textarea" placeholder="Optional note to requester…" value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3} />
            <div className="td-modal-actions">
              <button onClick={handleApprove} disabled={approveLoading} className="td-btn td-btn-md td-btn-success">
                {approveLoading ? '⟳ Approving…' : '✓ Approve'}
              </button>
              <button onClick={handleReject} disabled={rejectLoading} className="td-btn td-btn-md td-btn-danger">
                {rejectLoading ? '⟳ Rejecting…' : '✕ Reject'}
              </button>
              <button onClick={() => { setShowApprovalModal(false); setAdminNote(''); }} className="td-btn td-btn-md td-btn-muted">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PASSWORD POPUP ── */}
      {showPasswordPopup && (
        <div className="td-overlay">
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title" style={{ color: '#86efac' }}>✓ Password Reset Successful</div>
            <div className="td-modal-subtitle">The new temporary password is shown below. Copy and share as needed.</div>
            <div className="td-password-box">{returnedPassword}</div>
            <div className="td-modal-actions">
              <button onClick={() => copyToClipboard(returnedPassword)} className="td-btn td-btn-md td-btn-secondary">📋 Copy</button>
              <button onClick={() => { setShowPasswordPopup(false); navigate('/', { state: { refresh: true } }); }} className="td-btn td-btn-md td-btn-success">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLOSE MODALS ── */}
      {showReasonInput && (
        <div className="td-overlay" onClick={cancelClose}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Close Ticket</div>
            <div className="td-modal-subtitle">Provide a reason for closing this ticket.</div>
            <textarea className="td-textarea" rows={5} placeholder="Why is this ticket being closed?" value={closeReason} onChange={e => setCloseReason(e.target.value)} autoFocus />
            {closeError && <div className="td-error">{closeError}</div>}
            <div className="td-modal-actions">
              <button onClick={handleSubmitReason} className="td-btn td-btn-md td-btn-danger">Continue</button>
              <button onClick={cancelClose} className="td-btn td-btn-md td-btn-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="td-overlay" onClick={cancelClose}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Confirm Close</div>
            <div className="td-modal-subtitle">This will permanently mark the ticket as closed. This action cannot be undone.</div>
            <div className="td-modal-actions">
              <button onClick={confirmCloseTicket} disabled={loading} className="td-btn td-btn-md td-btn-danger">
                {loading ? '⟳ Closing…' : 'Yes, close it'}
              </button>
              <button onClick={cancelClose} className="td-btn td-btn-md td-btn-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── REOPEN MODALS ── */}
      {showreopenReasonInput && (
        <div className="td-overlay" onClick={cancelreopen}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Reopen Ticket</div>
            <div className="td-modal-subtitle">Explain why this ticket needs to be reopened.</div>
            <textarea className="td-textarea" rows={5} placeholder="Why is this ticket being reopened?" value={reopenReason} onChange={e => setreopenReason(e.target.value)} autoFocus />
            {reopenError && <div className="td-error">{reopenError}</div>}
            <div className="td-modal-actions">
              <button onClick={handleSubmitreopenReason} className="td-btn td-btn-md td-btn-success">Continue</button>
              <button onClick={cancelreopen} className="td-btn td-btn-md td-btn-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmreopenModal && (
        <div className="td-overlay" onClick={cancelreopen}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Confirm Reopen</div>
            <div className="td-modal-subtitle">The ticket will be reopened and moved back to active status.</div>
            <div className="td-modal-actions">
              <button onClick={confirmreopenTicket} disabled={loading} className="td-btn td-btn-md td-btn-success">
                {loading ? '⟳ Reopening…' : 'Yes, reopen it'}
              </button>
              <button onClick={cancelreopen} className="td-btn td-btn-md td-btn-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ATTACHMENT VIEWER ── */}
      {attachmentModalOpen && activeAttachment && (
        <div className="td-overlay" onClick={() => setAttachmentModalOpen(false)}>
          <div className="td-modal td-modal-wide" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f3f4f6' }}>📄 {activeAttachment.fileName || 'Attachment'}</div>
              <button onClick={() => setAttachmentModalOpen(false)} className="td-btn td-btn-sm td-btn-muted">✕</button>
            </div>
            <div className="td-att-content">
              {isImageType(activeAttachment.fileType) ? (
                <img src={imagePreviewUrl} alt={activeAttachment.fileName} className="td-att-img" />
              ) : isPdfType(activeAttachment.fileType, activeAttachment.fileUrl) ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: '1rem' }}>PDF files are downloaded directly.</div>
                  <button onClick={() => downloadAttachment(activeAttachment)} className="td-btn td-btn-md td-btn-primary">
                    <img src={DownloadIcon} alt="download" style={{ width: 14, height: 14, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                    Download PDF
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: '1rem' }}>This file type cannot be previewed.</div>
                  <a href={activeAttachment.fileUrl} target="_blank" rel="noopener noreferrer" className="td-btn td-btn-md td-btn-primary" style={{ textDecoration: 'none' }}>📂 Open file</a>
                </div>
              )}
            </div>
            {isImageType(activeAttachment.fileType) && (
              <div style={{ marginTop: '1rem' }}>
                <button onClick={() => downloadAttachment(activeAttachment)} className="td-btn td-btn-sm td-btn-ghost">
                  <img src={DownloadIcon} alt="download" style={{ width: 13, height: 13, objectFit: 'contain', filter: 'brightness(0) invert(0.7)' }} />
                  Download
                </button>
              </div>
            )}
            {attachmentList.length > 1 && (
              <div className="td-att-list">
                {attachmentList.map((a, idx) => (
                  <div key={idx} className="td-att-thumb" onClick={() => setActiveAttachment(a)}>
                    {isImageType(a.fileType) ? (
                      <img src={a.fileUrl} alt={a.fileName} />
                    ) : (
                      <div style={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#d1d5db' }}>
                        {a.fileName?.split('.').pop()?.toUpperCase() || 'FILE'}
                      </div>
                    )}
                    <div className="td-att-thumb-info">
                      <div className="td-att-thumb-name">{a.fileName}</div>
                      <div className="td-att-thumb-type">{a.fileType || ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TicketDetails;