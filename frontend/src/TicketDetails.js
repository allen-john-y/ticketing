// TicketDetails.js — Redesigned to match Home.js / Tickets.js / Dashboard.js design system
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
    const heads = (categoryMeta.categoryHeads || []).map(h => (h.email || '').toLowerCase().trim()).filter(Boolean);
    const isHead = loggedEmail && heads.includes(loggedEmail);
    setIsCategoryHead(!!isHead);
    setShowApprovalModal(isHead && ticket.status === 'Waiting for approval');
  }, [accounts, ticket, categoryMeta]);

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const needsApprovalBanner = isCategoryHead && ticket && ticket.status === 'Waiting for approval' && !showApprovalModal;

  const copyToClipboard = (text) => {
    try { navigator.clipboard.writeText(text); alert('Password copied to clipboard'); } catch (e) {}
  };

  const handleApprove = async () => {
    setApproveLoading(true);
    try {
      if (!ticket || ticket.status !== 'Waiting for approval') { alert('Approval is not allowed for this ticket.'); return; }
      const res = await axios.post(`${backendBase}/tickets/${id}/approve`, { approvedBy: accounts[0]?.name || accounts[0]?.username, note: adminNote });
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
      await axios.post(`${backendBase}/tickets/${id}/reject`, { rejectedBy: accounts[0]?.name || accounts[0]?.username, reason: adminNote });
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
      await axios.put(`${backendBase}/tickets/${id}/close`, { closeReason: closeReason.trim(), closedBy: accounts[0]?.name || accounts[0]?.username });
      setConfirmModal(false); setShowReasonInput(false); setCloseReason(''); setCloseError('');
      setTimeout(() => navigate('/', { state: { refresh: true } }), 200);
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
      await axios.put(`${backendBase}/tickets/${id}/revive`, { revivedBy: accounts[0]?.name || accounts[0]?.username || 'User', reviveReason: reopenReason.trim() });
      setConfirmreopenModal(false); setShowreopenReasonInput(false); setreopenReason(''); setreopenError('');
      setTimeout(() => navigate('/', { state: { refresh: true } }), 200);
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
    if (!ticket) return '#1d4ed8';
    if (ticket.status === 'Closed') return '#ef4444';
    if (ticket.status === 'Approved') return '#10b981';
    if (ticket.status === 'Waiting for approval') return '#f59e0b';
    return '#1d4ed8';
  };

  const statusPill = (status) => {
    if (!status) return { bg: '#f3f4f6', color: '#374151' };
    if (status === 'Closed') return { bg: '#fee2e2', color: '#b91c1c' };
    if (status === 'Approved') return { bg: '#d1fae5', color: '#065f46' };
    if (status === 'Waiting for approval') return { bg: '#fef3c7', color: '#92400e' };
    return { bg: '#dbeafe', color: '#1e3a8a' };
  };

  const priorityMeta = (p) => {
    if (!p) return { color: '#6b7280', bg: '#f3f4f6' };
    if (p === 'High') return { color: '#ef4444', bg: '#fee2e2' };
    if (p === 'Medium') return { color: '#f59e0b', bg: '#fef3c7' };
    return { color: '#10b981', bg: '#d1fae5' };
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Skeleton ──
  if (isLoading) {
    return (
      <div className="td-root">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          .td-root { min-height: 100vh; background: #f4f4f0; font-family: 'DM Sans', sans-serif; }
          @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.45} }
          .skel { background: #ddd9d0; animation: pulse 1.6s ease-in-out infinite; border-radius: 4px; }
        `}</style>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2.5rem 2rem 4rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #d9d5cc' }}>
            <div>
              <div className="skel" style={{ width: 160, height: 11, marginBottom: 8 }} />
              <div className="skel" style={{ width: 240, height: 28 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="skel" style={{ width: 120, height: 38, borderRadius: 6 }} />
              <div className="skel" style={{ width: 120, height: 38, borderRadius: 6 }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
            <div>
              <div style={{ background: '#fff', border: '1px solid #d9d5cc', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ width: 3, background: '#e5e7eb', position: 'absolute' }} />
                <div style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[1,2,3,4].map(i => <div key={i} className="skel" style={{ height: 14, width: `${60 + i * 8}%` }} />)}
                </div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #d9d5cc', borderRadius: 10, padding: '1.5rem 1.75rem' }}>
                {[1,2,3].map(i => <div key={i} className="skel" style={{ height: 60, borderRadius: 6, marginBottom: 12 }} />)}
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #d9d5cc', borderRadius: 10, padding: '1.5rem', height: 'fit-content' }}>
              {[1,2,3,4].map(i => <div key={i} className="skel" style={{ height: 14, width: `${40 + i * 10}%`, marginBottom: 14 }} />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) return (
    <div style={{ minHeight: '100vh', background: '#f4f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif', fontSize: 16, color: '#6b7280', fontWeight: 500 }}>
      Ticket not found
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
      <div style={{ marginTop: inline ? 16 : 0, paddingTop: inline ? 16 : 0, borderTop: inline ? '1px solid #e5e7eb' : 'none' }}>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 10 }}>
          {attachmentList.length > 1 ? `Attachments (${attachmentList.length})` : 'Attachment'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {attachmentList.length === 1 ? (
            <>
              <button onClick={() => isPdf ? downloadAttachment(a) : openAttachmentViewer(a)} className="td-btn td-btn-sm td-btn-secondary">
                {isPdf ? 'Download PDF' : 'View file'}
              </button>
              {!isPdf && (
                <button onClick={() => downloadAttachment(a)} className="td-btn td-btn-sm td-btn-ghost">
                  Download
                </button>
              )}
              <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>{a.fileName}</span>
            </>
          ) : (
            <>
              <button onClick={() => { setActiveAttachment(attachmentList[0]); setAttachmentModalOpen(true); }} className="td-btn td-btn-sm td-btn-secondary">
                View all
              </button>
              <button onClick={downloadAllAttachments} className="td-btn td-btn-sm td-btn-ghost">
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
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Attachment:</span>
        <button onClick={() => isPdf ? downloadAttachment(att) : openAttachmentViewer(att)} className="td-btn td-btn-sm td-btn-secondary">
          {isPdf ? 'Download PDF' : 'View'}
        </button>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{att.fileName}</span>
      </div>
    );
  };

  const historyEventMeta = (action) => {
    if (action === 'created') return { label: 'Ticket created', accent: '#f59e0b', bg: '#fffbeb' };
    if (action === 'closed') return { label: 'Ticket closed', accent: '#ef4444', bg: '#fef2f2' };
    if (action === 'reopend' || action === 'reopened') return { label: 'Ticket reopened', accent: '#10b981', bg: '#f0fdf4' };
    if (action === 'approved') return { label: 'Ticket approved', accent: '#10b981', bg: '#f0fdf4' };
    if (action === 'rejected') return { label: 'Ticket rejected', accent: '#ef4444', bg: '#fef2f2' };
    return { label: action, accent: '#6b7280', bg: '#f9fafb' };
  };

  return (
    <div className="td-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .td-root {
          min-height: 100vh;
          background: #f4f4f0;
          font-family: 'DM Sans', sans-serif;
          color: #111827;
        }

        .td-body {
          max-width: 1280px;
          margin: 0 auto;
          padding: 2.5rem 2rem 4rem;
        }

        /* ── Header ── */
        .td-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 2.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #d9d5cc;
        }
        .td-date {
          font-size: 11px; font-weight: 500;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: #9ca3af; margin-bottom: 6px;
        }
        .td-page-title {
          font-size: 26px; font-weight: 600;
          color: #111827; letter-spacing: -0.02em;
        }
        .td-header-actions { display: flex; gap: 10px; align-items: center; }

        /* ── Buttons ── */
        .hd-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 18px; border-radius: 6px; font-size: 13px;
          font-weight: 500; font-family: 'DM Sans', sans-serif;
          cursor: pointer; text-decoration: none;
          transition: background 0.15s, transform 0.1s; border: none;
        }
        .hd-btn-primary { background: #111827; color: #fff; }
        .hd-btn-primary:hover { background: #1f2937; transform: translateY(-1px); }
        .hd-btn-secondary { background: #fff; color: #111827; border: 1px solid #d9d5cc; }
        .hd-btn-secondary:hover { background: #f9f8f6; transform: translateY(-1px); }

        .td-btn {
          display: inline-flex; align-items: center; gap: 6px;
          border-radius: 6px; font-size: 13px; font-weight: 500;
          font-family: 'DM Sans', sans-serif; cursor: pointer;
          border: none; transition: background 0.15s, transform 0.1s;
          text-decoration: none;
        }
        .td-btn-sm { padding: 7px 14px; }
        .td-btn-md { padding: 9px 18px; }
        .td-btn-lg { padding: 11px 22px; font-size: 14px; }

        .td-btn-primary { background: #111827; color: #fff; }
        .td-btn-primary:hover { background: #1f2937; transform: translateY(-1px); }
        .td-btn-secondary { background: #fff; color: #374151; border: 1px solid #d9d5cc; }
        .td-btn-secondary:hover { background: #f9f8f6; }
        .td-btn-ghost { background: transparent; color: #6b7280; border: 1px solid #e5e7eb; }
        .td-btn-ghost:hover { background: #f4f4f0; color: #374151; }
        .td-btn-danger { background: #ef4444; color: #fff; }
        .td-btn-danger:hover { background: #dc2626; transform: translateY(-1px); }
        .td-btn-success { background: #10b981; color: #fff; }
        .td-btn-success:hover { background: #059669; transform: translateY(-1px); }
        .td-btn-warn { background: #f59e0b; color: #fff; }
        .td-btn-warn:hover { background: #d97706; transform: translateY(-1px); }
        .td-btn-muted { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
        .td-btn-muted:hover { background: #e5e7eb; }
        .td-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }

        /* ── Main Layout ── */
        .td-layout {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 1px;
          background: #d9d5cc;
          border: 1px solid #d9d5cc;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 24px;
        }

        .td-main-col { background: #fff; }
        .td-side-col { background: #fff; }

        /* ── Ticket header strip ── */
        .td-ticket-strip {
          padding: 1.5rem 1.75rem;
          border-bottom: 1px solid #f3f4f6;
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }

        .td-accent-bar {
          width: 3px;
          border-radius: 2px;
          align-self: stretch;
          flex-shrink: 0;
          min-height: 60px;
        }

        .td-ticket-id {
          font-size: 11px; font-weight: 600;
          font-family: 'DM Mono', monospace;
          color: #9ca3af; letter-spacing: 0.06em;
          margin-bottom: 3px;
        }
        .td-ticket-cat {
          font-size: 20px; font-weight: 600;
          color: #111827; letter-spacing: -0.02em;
          margin-bottom: 10px;
        }

        .td-pills { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .td-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px; border-radius: 20px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.03em;
          white-space: nowrap;
        }
        .td-pill-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        /* ── Description block ── */
        .td-description {
          padding: 1.5rem 1.75rem;
          border-bottom: 1px solid #f3f4f6;
        }
        .td-block-label {
          font-size: 11px; font-weight: 500;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: #9ca3af; margin-bottom: 10px;
        }
        .td-desc-text {
          font-size: 14px; color: #374151; line-height: 1.7;
          white-space: pre-wrap;
        }

        /* ── Meta grid ── */
        .td-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: #f3f4f6;
          border-top: 1px solid #f3f4f6;
        }
        .td-meta-cell {
          background: #fff;
          padding: 1rem 1.75rem;
        }
        .td-meta-key {
          font-size: 11px; font-weight: 500;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: #9ca3af; margin-bottom: 4px;
        }
        .td-meta-val {
          font-size: 14px; font-weight: 600;
          color: #111827; font-family: 'DM Sans', sans-serif;
        }
        .td-meta-val-mono {
          font-family: 'DM Mono', monospace;
          font-size: 13px;
        }

        /* ── Sidebar ── */
        .td-sidebar-section {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #f3f4f6;
        }
        .td-sidebar-section:last-child { border-bottom: none; }

        /* ── Approval banner ── */
        .td-approval-banner {
          background: #fffbeb;
          border: 1px solid #fcd34d;
          border-radius: 8px;
          padding: 1.25rem;
          margin: 1.5rem 1.75rem;
          text-align: center;
        }

        /* ── History ── */
        .td-history {
          background: #fff;
          border: 1px solid #d9d5cc;
          border-radius: 10px;
          overflow: hidden;
        }

        .td-history-header {
          padding: 1.25rem 1.75rem;
          border-bottom: 1px solid #f3f4f6;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6b7280;
        }

        .td-history-event {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .td-history-event:last-child { border-bottom: none; }

        .td-history-accent { width: 3px; flex-shrink: 0; align-self: stretch; }
        .td-history-body { padding: 1.1rem 1.5rem; flex: 1; }
        .td-history-action {
          font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 3px;
        }
        .td-history-by {
          font-size: 12px; color: #9ca3af; margin-bottom: 8px;
          font-family: 'DM Mono', monospace;
        }
        .td-history-reason {
          font-size: 13px; color: #374151;
          background: #fafaf8; border: 1px solid #e5e7eb;
          border-radius: 5px; padding: 8px 12px; margin-top: 8px;
        }

        .td-current-status {
          padding: 1.25rem 1.75rem;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fafaf8;
        }
        .td-current-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        /* ── Modals ── */
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .td-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex; justify-content: center; align-items: center;
          z-index: 9999;
          animation: fadeIn 0.15s;
          backdrop-filter: blur(3px);
        }

        .td-modal {
          background: #fff;
          border-radius: 10px;
          padding: 2rem;
          width: 92%; max-width: 560px;
          animation: slideUp 0.2s;
          max-height: 90vh; overflow-y: auto;
        }

        .td-modal-wide { max-width: 900px; }

        .td-modal-title {
          font-size: 18px; font-weight: 600; color: #111827;
          margin-bottom: 6px; letter-spacing: -0.01em;
        }
        .td-modal-sub {
          font-size: 13px; color: #6b7280; margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .td-textarea {
          width: 100%; padding: 10px 14px;
          border: 1px solid #d9d5cc; border-radius: 7px;
          font-size: 14px; font-family: 'DM Sans', sans-serif;
          background: #fafaf8; color: #111827;
          resize: vertical; min-height: 100px;
          transition: border-color 0.15s, box-shadow 0.15s;
          margin-bottom: 4px;
        }
        .td-textarea:focus {
          outline: none; border-color: #111827; background: #fff;
          box-shadow: 0 0 0 3px rgba(17,24,39,0.07);
        }

        .td-error { font-size: 12px; color: #ef4444; font-weight: 500; margin-top: 4px; margin-bottom: 10px; }

        .td-modal-actions { display: flex; gap: 10px; margin-top: 1.5rem; flex-wrap: wrap; }

        /* ── Approval detail grid ── */
        .td-approval-grid {
          background: #fafaf8; border: 1px solid #e5e7eb;
          border-radius: 8px; padding: 1.25rem;
          margin-bottom: 1.25rem;
        }
        .td-approval-row {
          display: flex; gap: 8px;
          font-size: 13px; margin-bottom: 8px;
          align-items: flex-start;
        }
        .td-approval-row:last-child { margin-bottom: 0; }
        .td-approval-key { font-weight: 600; color: #6b7280; width: 120px; flex-shrink: 0; }
        .td-approval-val { color: #111827; }

        /* ── Password popup ── */
        .td-password-box {
          background: #f4f4f0; border: 1px solid #d9d5cc;
          border-radius: 8px; padding: 1.25rem;
          font-family: 'DM Mono', monospace;
          font-size: 18px; font-weight: 500;
          color: #111827; word-break: break-all;
          margin: 1rem 0 1.5rem; text-align: center;
          letter-spacing: 0.05em;
        }

        /* ── Attachment viewer ── */
        .td-att-content {
          min-height: 200px; max-height: 65vh;
          display: flex; justify-content: center; align-items: center;
          background: #f4f4f0; border: 1px solid #d9d5cc;
          border-radius: 8px; padding: 1rem;
          overflow: auto; flex-direction: column;
        }
        .td-att-img { max-width: 100%; max-height: 62vh; object-fit: contain; border-radius: 6px; }
        .td-att-list { display: flex; gap: 8px; overflow-x: auto; padding-top: 12px; }
        .td-att-thumb {
          padding: 8px; background: #fff;
          border: 1px solid #d9d5cc; border-radius: 7px;
          cursor: pointer; min-width: 130px; display: flex;
          gap: 8px; align-items: center; flex-shrink: 0;
          transition: border-color 0.15s;
        }
        .td-att-thumb:hover { border-color: #111827; }
        .td-att-thumb img { width: 52px; height: 52px; object-fit: cover; border-radius: 5px; }
        .td-att-thumb-name { font-size: 12px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .td-att-thumb-type { font-size: 11px; color: #9ca3af; }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .td-layout { grid-template-columns: 1fr; }
          .td-side-col { border-top: 1px solid #d9d5cc; }
        }
        @media (max-width: 640px) {
          .td-body { padding: 1.5rem 1rem 3rem; }
          .td-header { flex-direction: column; align-items: flex-start; gap: 1rem; }
          .td-header-actions { width: 100%; }
          .hd-btn { flex: 1; justify-content: center; }
          .td-meta-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="td-body">
        {/* ── Header ── */}
        <div className="td-header">
          <div>
            <div className="td-date">{today}</div>
            <div className="td-page-title">Ticket Details</div>
          </div>
          <div className="td-header-actions">
            <Link to="/create" className="hd-btn hd-btn-primary">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              New Ticket
            </Link>
            <button onClick={() => navigate('/tickets')} className="hd-btn hd-btn-secondary">
              ← All Tickets
            </button>
          </div>
        </div>

        {/* ── Main layout ── */}
        <div className="td-layout">
          {/* LEFT: main content */}
          <div className="td-main-col">
            {/* Ticket strip */}
            <div className="td-ticket-strip">
              <div className="td-accent-bar" style={{ background: ac }} />
              <div style={{ flex: 1 }}>
                <div className="td-ticket-id">TICKET #{ticket.ticketNumber}</div>
                <div className="td-ticket-cat">{ticket.category}</div>
                {ticket.category === 'Operational & Finance' && ticket.subQuery && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>Sub-category:</span> {ticket.subQuery}
                    {ticket.subQuery === 'Other' && ticket.otherSubQueryText && <span> — {ticket.otherSubQueryText}</span>}
                  </div>
                )}
                <div className="td-pills">
                  <span className="td-pill" style={{ background: sp.bg, color: sp.color }}>
                    <span className="td-pill-dot" style={{ background: sp.color }} />
                    {ticket.status}
                  </span>
                  <span className="td-pill" style={{ background: pm.bg, color: pm.color }}>
                    {ticket.priority} Priority
                  </span>
                </div>
              </div>
            </div>

            {/* Approval banner */}
            {needsApprovalBanner && (
              <div className="td-approval-banner">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                  Waiting for your approval — {ticket.category}
                </div>
                <button onClick={() => setShowApprovalModal(true)} className="td-btn td-btn-md td-btn-warn">
                  Review & take action
                </button>
              </div>
            )}

            {/* Description */}
            <div className="td-description">
              <div className="td-block-label">Description</div>
              <div className="td-desc-text">{ticket.description}</div>
              {renderAttachmentBlock(true)}
            </div>

            {/* Meta grid */}
            <div className="td-meta-grid">
              <div className="td-meta-cell">
                <div className="td-meta-key">Created</div>
                <div className="td-meta-val td-meta-val-mono">{formatDate(ticket.createdAt)}</div>
              </div>
              <div className="td-meta-cell">
                <div className="td-meta-key">Submitted by</div>
                <div className="td-meta-val">{ticket.userName}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{ticket.userEmail}</div>
              </div>
              {ticket.closedAt && (
                <div className="td-meta-cell">
                  <div className="td-meta-key">Closed</div>
                  <div className="td-meta-val td-meta-val-mono">{formatDate(ticket.closedAt)}</div>
                </div>
              )}
              {ticket.assignedTo && (
                <div className="td-meta-cell">
                  <div className="td-meta-key">Assigned to</div>
                  <div className="td-meta-val">{ticket.assignedTo}</div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: sidebar */}
          <div className="td-side-col">
            {/* Actions */}
            {(authority === 'admin' && ticket.status !== 'Closed') || ticket.status === 'Closed' ? (
              <div className="td-sidebar-section">
                <div className="td-block-label" style={{ marginBottom: 12 }}>Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {authority === 'admin' && ticket.status !== 'Closed' && (
                    <button onClick={() => setShowReasonInput(true)} className="td-btn td-btn-md td-btn-danger" style={{ width: '100%', justifyContent: 'center' }}>
                      Close ticket
                    </button>
                  )}
                  {ticket.status === 'Closed' && (
                    <button onClick={() => setShowreopenReasonInput(true)} className="td-btn td-btn-md td-btn-success" style={{ width: '100%', justifyContent: 'center' }}>
                      Reopen ticket
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {/* Quick info */}
            <div className="td-sidebar-section">
              <div className="td-block-label" style={{ marginBottom: 12 }}>Ticket info</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Status</div>
                  <span className="td-pill" style={{ background: sp.bg, color: sp.color }}>
                    <span className="td-pill-dot" style={{ background: sp.color }} />
                    {ticket.status}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Priority</div>
                  <span className="td-pill" style={{ background: pm.bg, color: pm.color }}>{ticket.priority}</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Ticket #</div>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 500, color: '#111827' }}>{ticket.ticketNumber}</span>
                </div>
                {ticket.onBehalf && (
                  <div>
                    <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>On behalf of</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{ticket.onBehalf}</div>
                    {ticket.onBehalfEmail && <div style={{ fontSize: 12, color: '#9ca3af' }}>{ticket.onBehalfEmail}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── History ── */}
        <div className="td-history">
          <div className="td-history-header">Ticket history</div>
          {historyEvents.map((event, idx) => {
            const hm = historyEventMeta(event.action);
            const isOpsFin = ticket.category === 'Operational & Finance';
            return (
              <div key={idx} className="td-history-event">
                <div className="td-history-accent" style={{ background: hm.accent }} />
                <div className="td-history-body" style={{ background: idx % 2 === 0 ? '#fff' : '#fafaf8' }}>
                  <div className="td-history-action">{hm.label}</div>
                  <div className="td-history-by">
                    {formatDate(event.at)} · {event.by || 'Unknown'}
                    {event.action === 'created' && (ticket.onBehalf || (event.by !== ticket.userName)) && (
                      <span style={{ color: '#f59e0b' }}> · on behalf of {ticket.onBehalf || ticket.userName}{ticket.onBehalfEmail ? ` (${ticket.onBehalfEmail})` : ''}</span>
                    )}
                  </div>
                  {isOpsFin && event.subQuery && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                      Sub-category: <strong>{event.subQuery}</strong>
                      {event.subQuery === 'Other' && event.otherSubQueryText && <span> — {event.otherSubQueryText}</span>}
                    </div>
                  )}
                  {event.reason && (
                    <div className="td-history-reason">{event.reason}</div>
                  )}
                  {renderHistoryAttachment(event)}
                </div>
              </div>
            );
          })}
          <div className="td-current-status">
            <div className="td-current-dot" style={{ background: sp.color }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Current status:</span>
            <span className="td-pill" style={{ background: sp.bg, color: sp.color }}>{ticket.status}</span>
          </div>
        </div>
      </div>

      {/* ── APPROVAL MODAL ── */}
      {showApprovalModal && isCategoryHead && (
        <div className="td-overlay">
          <div className="td-modal td-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Approval required — {ticket.category}</div>
            <div className="td-modal-sub">You are the category head. Review the ticket and take action.</div>
            <div className="td-approval-grid">
              {[
                ['Ticket #', ticket.ticketNumber],
                ['Created by', `${ticket.userName} (${ticket.userEmail})`],
                ['Priority', ticket.priority],
                ['On behalf of', ticket.onBehalf || 'Self'],
                ticket.onBehalfEmail && ['On behalf email', ticket.onBehalfEmail],
                ticket.deliveryEmail && ['Delivery email', ticket.deliveryEmail],
                ['Created on', formatDate(ticket.createdAt)],
                ticket.category === 'Operational & Finance' && ticket.subQuery && ['Sub-category', ticket.subQuery],
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} className="td-approval-row">
                  <span className="td-approval-key">{k}</span>
                  <span className="td-approval-val">{v}</span>
                </div>
              ))}
              <div className="td-approval-row" style={{ flexDirection: 'column' }}>
                <span className="td-approval-key" style={{ width: 'auto', marginBottom: 6 }}>Description</span>
                <div style={{ fontSize: 13, color: '#374151', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
              </div>
              {hasAttachment && <div style={{ marginTop: 8 }}>{renderAttachmentBlock()}</div>}
            </div>
            <textarea className="td-textarea" placeholder="Optional note to requester…" value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3} />
            <div className="td-modal-actions">
              <button onClick={handleApprove} disabled={approveLoading} className="td-btn td-btn-lg td-btn-success">
                {approveLoading ? 'Approving…' : '✓ Approve'}
              </button>
              <button onClick={handleReject} disabled={rejectLoading} className="td-btn td-btn-lg td-btn-danger">
                {rejectLoading ? 'Rejecting…' : '✕ Reject'}
              </button>
              <button onClick={() => { setShowApprovalModal(false); setAdminNote(''); }} className="td-btn td-btn-lg td-btn-muted">
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
            <div className="td-modal-title" style={{ color: '#10b981' }}>Password reset successful</div>
            <div className="td-modal-sub">The new temporary password is shown below. Copy and share as needed.</div>
            <div className="td-password-box">{returnedPassword}</div>
            <div className="td-modal-actions">
              <button onClick={() => copyToClipboard(returnedPassword)} className="td-btn td-btn-lg td-btn-secondary">
                Copy to clipboard
              </button>
              <button onClick={() => { setShowPasswordPopup(false); navigate('/', { state: { refresh: true } }); }} className="td-btn td-btn-lg td-btn-success">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLOSE MODALS ── */}
      {showReasonInput && (
        <div className="td-overlay" onClick={cancelClose}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Close ticket #{ticket.ticketNumber}</div>
            <div className="td-modal-sub">Provide a reason for closing this ticket.</div>
            <textarea className="td-textarea" rows={5} placeholder="Why is this ticket being closed?" value={closeReason} onChange={e => setCloseReason(e.target.value)} autoFocus />
            {closeError && <div className="td-error">{closeError}</div>}
            <div className="td-modal-actions">
              <button onClick={handleSubmitReason} className="td-btn td-btn-lg td-btn-danger">Continue</button>
              <button onClick={cancelClose} className="td-btn td-btn-lg td-btn-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="td-overlay" onClick={cancelClose}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Confirm close ticket?</div>
            <div className="td-modal-sub">This will permanently mark the ticket as closed.</div>
            <div className="td-modal-actions">
              <button onClick={confirmCloseTicket} disabled={loading} className="td-btn td-btn-lg td-btn-danger">
                {loading ? 'Closing…' : 'Yes, close it'}
              </button>
              <button onClick={cancelClose} className="td-btn td-btn-lg td-btn-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── REOPEN MODALS ── */}
      {showreopenReasonInput && (
        <div className="td-overlay" onClick={cancelreopen}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Reopen ticket #{ticket.ticketNumber}</div>
            <div className="td-modal-sub">Explain why this ticket needs to be reopened.</div>
            <textarea className="td-textarea" rows={5} placeholder="Why is this ticket being reopened?" value={reopenReason} onChange={e => setreopenReason(e.target.value)} autoFocus />
            {reopenError && <div className="td-error">{reopenError}</div>}
            <div className="td-modal-actions">
              <button onClick={handleSubmitreopenReason} className="td-btn td-btn-lg td-btn-success">Continue</button>
              <button onClick={cancelreopen} className="td-btn td-btn-lg td-btn-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmreopenModal && (
        <div className="td-overlay" onClick={cancelreopen}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-title">Confirm reopen ticket?</div>
            <div className="td-modal-sub">The ticket will be reopened and require attention.</div>
            <div className="td-modal-actions">
              <button onClick={confirmreopenTicket} disabled={loading} className="td-btn td-btn-lg td-btn-success">
                {loading ? 'Reopening…' : 'Yes, reopen it'}
              </button>
              <button onClick={cancelreopen} className="td-btn td-btn-lg td-btn-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ATTACHMENT VIEWER ── */}
      {attachmentModalOpen && activeAttachment && (
        <div className="td-overlay" onClick={() => setAttachmentModalOpen(false)}>
          <div className="td-modal td-modal-wide" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{activeAttachment.fileName || 'Attachment'}</div>
              <button onClick={() => setAttachmentModalOpen(false)} className="td-btn td-btn-sm td-btn-muted">✕</button>
            </div>
            <div className="td-att-content">
              {isImageType(activeAttachment.fileType) ? (
                <img src={imagePreviewUrl} alt={activeAttachment.fileName} className="td-att-img" />
              ) : isPdfType(activeAttachment.fileType, activeAttachment.fileUrl) ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>PDF files are downloaded directly.</div>
                  <button onClick={() => downloadAttachment(activeAttachment)} className="td-btn td-btn-md td-btn-primary">Download PDF</button>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>This file type cannot be previewed.</div>
                  <a href={activeAttachment.fileUrl} target="_blank" rel="noopener noreferrer" className="td-btn td-btn-md td-btn-primary" style={{ textDecoration: 'none' }}>Open file</a>
                </div>
              )}
            </div>
            {isImageType(activeAttachment.fileType) && (
              <div style={{ marginTop: 12 }}>
                <button onClick={() => downloadAttachment(activeAttachment)} className="td-btn td-btn-sm td-btn-ghost">Download image</button>
              </div>
            )}
            {attachmentList.length > 1 && (
              <div className="td-att-list">
                {attachmentList.map((a, idx) => (
                  <div key={idx} className="td-att-thumb" onClick={() => setActiveAttachment(a)}>
                    {isImageType(a.fileType) ? (
                      <img src={a.fileUrl} alt={a.fileName} />
                    ) : (
                      <div style={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', borderRadius: 5, fontSize: 11, fontWeight: 700, color: '#374151' }}>
                        {a.fileName?.split('.').pop()?.toUpperCase() || 'FILE'}
                      </div>
                    )}
                    <div>
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