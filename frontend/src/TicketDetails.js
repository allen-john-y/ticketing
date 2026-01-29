// TicketDetails.js — updated: use backend proxy URLs for attachments, PDF download, image inline, server ZIP for download-all
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';
import DownloadIcon from './Download.png'; // make sure Download.png is in the same folder

// CATEGORY HEAD EMAIL MAP (mirrors backend deptEmails)
const deptEmails = {
  "Password Reset": ["kodhan@sandeza-inc.com", "allenj@sandeza-inc.com"],
  "Admin Access": ["kodhan@sandeza-inc.com", "allenj@sandeza-inc.com"],
  "Operational & Finance": "vigneshm@sandeza-inc.com"
};

const approvalCategories = ["Password Reset", "Admin Access"];

function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts, instance } = useMsal();
  const [ticket, setTicket] = useState(null);
  const [authority, setAuthority] = useState('basic');
  const [loading, setLoading] = useState(false);

  // Close states
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeError, setCloseError] = useState('');
  

  // reopen useEffect
  const [showreopenReasonInput, setShowreopenReasonInput] = useState(false);
  const [reopenReason, setreopenReason] = useState('');
  const [reopenError, setreopenError] = useState('');

  const [confirmModal, setConfirmModal] = useState(false);
  const [confirmreopenModal, setConfirmreopenModal] = useState(false);

  const backendBase = "https://ticketing-hn59.onrender.com";

  // Category head / approval states
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isCategoryHead, setIsCategoryHead] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [returnedPassword, setReturnedPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  // Attachment modal state
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [activeAttachment, setActiveAttachment] = useState(null); // { fileName, fileType, fileUrl, id }
  const [attachmentList, setAttachmentList] = useState([]); // for multi attachments view when ticket.attachments exists
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  // fetch authority (admin group)
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
        const isAdmin = groups.includes('Helpdesk_Admin');
        setAuthority(isAdmin ? 'admin' : 'basic');
      } catch (err) {
        console.error('Authority error:', err);
      }
    };
    fetchAuthority();
  }, [accounts, instance]);

  useEffect(() => {
  let objectUrl = null;

  const loadImage = async () => {
    if (!activeAttachment || !activeAttachment.fileUrl) {
      setImagePreviewUrl(null);
      return;
    }

    try {
      // Fetch via backend proxy (no credentials), create object URL for inline preview
      const res = await fetch(activeAttachment.fileUrl);
      if (!res.ok) throw new Error('Failed to load image preview');
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      setImagePreviewUrl(objectUrl);
    } catch (e) {
      console.error("Image load failed", e);
      setImagePreviewUrl(null);
    }
  };

  loadImage();

  return () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
}, [activeAttachment]);  // ✅ correct dependency


  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await axios.get(`${backendBase}/tickets/${id}`);
        setTicket(res.data);

        // prepare attachments list if present
        const list = [];
        if (res.data.attachments && Array.isArray(res.data.attachments) && res.data.attachments.length) {
          res.data.attachments.forEach(a => {
            // prefer drive item id (id/fileId/driveItemId) and use backend proxy URL when available
            const driveId = a.id || a.fileId || a.driveItemId || null;
            const proxyUrl = driveId ? `${backendBase}/attachments/${driveId}` : (a.fileUrl || a.url || a.path || null);
            list.push({
              fileName: a.fileName || a.file_name || a.originalname || '',
              fileType: a.fileType || a.file_type || a.mimetype || '',
              fileUrl: proxyUrl,
              id: driveId || (a.id || a.fileId || null)
            });
          });
        } else if (res.data.attachment && (res.data.attachment.fileName || res.data.attachment.fileUrl)) {
          // fallback to legacy single attachment
          const a = res.data.attachment;
          const driveId = a.id || a.fileId || null;
          const proxyUrl = driveId ? `${backendBase}/attachments/${driveId}` : (a.fileUrl || null);
          list.push({
            fileName: a.fileName || '',
            fileType: a.fileType || '',
            fileUrl: proxyUrl,
            id: driveId || null
          });
        }
        setAttachmentList(list);

        // CATEGORY HEAD CHECK
        if (accounts[0] && res.data) {
          const acct = accounts[0] || {};
          const possibleEmails = [
            acct.username,
            acct.upn,
            acct.preferred_username,
            acct.email
          ].filter(Boolean);

          const loggedEmail = (possibleEmails.find(e => typeof e === 'string') || '')
            .toLowerCase()
            .trim();

          const headEntry = deptEmails[res.data.category];
          const headList = Array.isArray(headEntry) ? headEntry : (headEntry ? [headEntry] : []);
          const normalizedHeadList = headList
            .map(h => (h || '').toLowerCase().trim())
            .filter(Boolean);

          if (loggedEmail && normalizedHeadList.includes(loggedEmail)) {
            setIsCategoryHead(true);

            const status = (res.data.status || '').toString();
            if (
              approvalCategories.includes(res.data.category) &&
              (status === "Waiting for approval" || status === "Open")
            ) {
              setShowApprovalModal(true);
            }
          } else {
            setIsCategoryHead(false);
            setShowApprovalModal(false);
          }
        }
      } catch (err) {
        console.error('Error fetching ticket:', err);
      }
    };
    fetchTicket();
  }, [id, accounts, instance, backendBase]);

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Derived: show inline "Waiting for Approval" banner
  const needsApprovalBanner =
    isCategoryHead &&
    ticket &&
    (ticket.status === 'Waiting for approval' || ticket.status === 'Open') &&
    !showApprovalModal &&
    approvalCategories.includes(ticket.category);

  const copyToClipboard = (text) => {
    try {
      navigator.clipboard.writeText(text);
      alert('Password copied to clipboard');
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const handleApprove = async () => {
    setApproveLoading(true);
    try {
      if (!ticket || !approvalCategories.includes(ticket.category)) {
        alert("Approval not supported for this ticket type.");
        return;
      }

      const res = await axios.post(`${backendBase}/tickets/${id}/approve`, {
        approvedBy: accounts[0]?.name || accounts[0]?.username,
        note: adminNote
      });

      setShowApprovalModal(false);

      // Password Reset: backend returns newPassword
      if (res.data?.newPassword) {
        setReturnedPassword(res.data.newPassword);
        setShowPasswordPopup(true);
      } else {
        // Admin Access: no password, just go back
        setTimeout(() => {
          navigate("/", { state: { refresh: true } });
        }, 200);
      }
    } catch (err) {
      console.error("Approve error:", err);
      alert("Approval failed: " + (err?.response?.data?.message || err.message || 'Unknown error'));
    } finally {
      setApproveLoading(false);
      setAdminNote('');
    }
  };

  const handleReject = async () => {
    setRejectLoading(true);
    try {
      if (!ticket) throw new Error('Ticket missing');

      await axios.post(`${backendBase}/tickets/${id}/reject`, {
        rejectedBy: accounts[0]?.name || accounts[0]?.username,
        reason: adminNote
      });

      setShowApprovalModal(false);
      setAdminNote('');

      setTimeout(() => {
        navigate("/", { state: { refresh: true } });
      }, 200);
    } catch (err) {
      console.error("Reject error:", err);
      alert("Rejection failed: " + (err?.response?.data?.message || err.message || 'Unknown error'));
    } finally {
      setRejectLoading(false);
    }
  };

  const handleSubmitReason = () => {
    if (!closeReason.trim()) {
      setCloseError("Please provide a reason for closing this ticket.");
      return;
    }
    setCloseError('');
    setShowReasonInput(false);
    setConfirmModal(true);
  };

  const confirmCloseTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/close`, {
        closeReason: closeReason.trim(),
        closedBy: accounts[0]?.name || accounts[0]?.username
      });

      setConfirmModal(false);
      setShowReasonInput(false);
      setCloseReason('');
      setCloseError('');

      setTimeout(() => {
        navigate('/', { state: { refresh: true } });
      }, 200);
    } catch (err) {
      setCloseError("Failed to close ticket. Please try again.");
      console.error("Close error:", err);
    } finally {
      setLoading(false);
    }
  };

  const cancelClose = () => {
    setShowReasonInput(false);
    setConfirmModal(false);
    setCloseReason('');
    setCloseError('');
  };

  const handleSubmitreopenReason = () => {
    if (!reopenReason.trim()) {
      setreopenError("Please provide a reason for reviving this ticket.");
      return;
    }
    setreopenError('');
    setShowreopenReasonInput(false);
    setConfirmreopenModal(true);
  };

  const confirmreopenTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/revive`, {
        revivedBy: accounts[0]?.name || accounts[0]?.username || "User",
        reviveReason: reopenReason.trim()
      });

      setConfirmreopenModal(false);
      setShowreopenReasonInput(false);
      setreopenReason('');
      setreopenError('');

      setTimeout(() => {
        navigate('/', { state: { refresh: true } });
      }, 200);
    } catch (err) {
      setreopenError("Failed to reopen ticket. Please try again.");
      console.error("reopen error:", err);
    } finally {
      setLoading(false);
    }
  };

  const cancelreopen = () => {
    setShowreopenReasonInput(false);
    setConfirmreopenModal(false);
    setreopenReason('');
    setreopenError('');
  };

  if (!ticket) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading ticket...</p>;

  const statusColorStyles = {
    background:
      ticket.status === "Closed" ? "#fee2e2" :
      ticket.status === "Approved" ? "#dcfce7" :
      ticket.status === "Waiting for approval" ? "#fef3c7" :
      "#e0f2fe",
    color:
      ticket.status === "Closed" ? "#b91c1c" :
      ticket.status === "Approved" ? "#166534" :
      ticket.status === "Waiting for approval" ? "#92400e" :
      "#0369a1"
  };

  const historyEvents = ticket.history && ticket.history.length > 0
    ? ticket.history
    : [
        { action: "created", by: ticket.userName, at: ticket.createdAt, reason: null },
        ...(ticket.closedAt ? [{ action: "closed", by: ticket.closedBy || "Unknown", at: ticket.closedAt, reason: ticket.closeReason }] : []),
        ...(ticket.reopenedAt ? [{ action: "reopend", by: ticket.reopenedBy || "Unknown", at: ticket.reopenedAt, reason: ticket.reopenReason }] : [])
      ];

  // Helpers for attachment display (main ticket)
  const hasAttachment = (attachmentList && attachmentList.length > 0);

  const isImageType = (type) => type && type.startsWith && type.startsWith('image/');
  const isPdfType = (type, url) => {
    if (type && type === 'application/pdf') return true;
    if (url && url.toLowerCase().endsWith('.pdf')) return true;
    return false;
  };

  const openAttachmentViewer = (attachment) => {
    if (!attachment) return;

    // If file has id, backend proxy URL should already be set in attachment.fileUrl
    const fileUrl = attachment.fileUrl;

    const viewableImage = isImageType(attachment.fileType);
    const viewablePdf = isPdfType(attachment.fileType, fileUrl);

    if (viewablePdf) {
      // For PDFs, download directly (user requested PDF -> direct download)
      downloadAttachment(attachment);
      return;
    }

    if (!viewableImage) {
      // For non-previewable files, open in new tab (server will trigger download)
      window.open(fileUrl, '_blank', 'noopener');
      return;
    }

    // For images: open modal with backend URL
    setActiveAttachment({
      ...attachment,
      fileUrl
    });

    setAttachmentModalOpen(true);
  };


  // download helper: fetch blob and force download (better cross-origin reliability)
  const downloadAttachment = async (attachment) => {
    if (!attachment || !attachment.fileUrl) return;
    try {
      const resp = await fetch(attachment.fileUrl);
      if (!resp.ok) throw new Error('Network response not ok');
      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const filename = attachment.fileName || (attachment.fileUrl.split('/').pop().split('?')[0]) || 'download';
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // fallback: open in new tab
      console.warn('Download fallback, opening in new tab', err);
      window.open(attachment.fileUrl, '_blank', 'noopener');
    }
  };

  // download-all helper: use backend zip endpoint
  const downloadAllAttachments = async () => {
    if (!attachmentList || attachmentList.length === 0) return;
    // require that attachments have ids (drive item ids)
    const ids = attachmentList.map(a => a.id).filter(Boolean);
    if (ids.length === 0) {
      alert('No downloadable attachments available.');
      return;
    }
    const url = `${backendBase}/attachments/zip?ids=${encodeURIComponent(ids.join(','))}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `attachments-${ticket.ticketNumber || id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Helper for attachment in each history event
  const renderHistoryAttachment = (event) => {
    if (!event.attachment || (!event.attachment.fileName && !event.attachment.fileUrl)) return null;
    const label = event.attachment.fileName || 'Attachment';
    const typeLabel = event.attachment.fileType || '';
    const url = event.attachment.fileUrl;
    const att = { fileName: label, fileType: typeLabel, fileUrl: url, id: null };
    return (
      <div style={{ marginTop: 8, fontSize: 13 }}>
        <strong>Attachment:</strong>{' '}
        <button
          onClick={() => {
            // For history attachments, if PDF then download, else open viewer
            if (isPdfType(typeLabel, url)) {
              downloadAttachment(att);
            } else {
              openAttachmentViewer(att);
            }
          }}
          style={{ marginLeft: 8, background: '#2563eb', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
        >
          {isPdfType(typeLabel, url) ? 'Download PDF' : 'View attachment'}
        </button>
        {typeLabel && (
          <span style={{ marginLeft: 6, fontSize: 12, color: '#6b7280' }}>
            ({typeLabel})
          </span>
        )}
      </div>
    );
  };

  // Render attachment summary in ticket details & approval modal
  const renderAttachmentSummary = () => {
    if (!hasAttachment) return null;

    if (attachmentList.length === 1) {
      const a = attachmentList[0];
      const isPdf = isPdfType(a.fileType, a.fileUrl);
      return (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ minWidth: 90 }}>{isPdf ? 'PDF:' : 'Attachment:'}</strong>

          <button
            onClick={() => {
              if (isPdf) {
                downloadAttachment(a);
              } else {
                openAttachmentViewer(a);
              }
            }}
            style={{ marginLeft: 0, background: '#2563eb', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 800 }}
          >
            {isPdf ? 'Download PDF' : 'View attachment'}
          </button>

          {/* Download icon (single file) to the right */}
          {!isPdf && (
            <button
              onClick={() => downloadAttachment(a)}
              title="Download"
              style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid #e6edf8', background: '#fff', cursor: 'pointer' }}
            >
              <img src={DownloadIcon} alt="Download" style={{ width: 18, height: 18 }} />
            </button>
          )}
        </div>
      );
    }

    // multiple attachments: show view button + download-all (zip) button to right
    return (
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ minWidth: 90 }}>Attachments:</strong>
        <button
          onClick={() => {
            if (attachmentList.length) {
              setActiveAttachment(attachmentList[0]);
              setAttachmentModalOpen(true);
            }
          }}
          style={{ marginLeft: 0, background: '#2563eb', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 800 }}
        >
          Attachments uploaded ({attachmentList.length})
        </button>

        {/* Download-all (zip) button to the right of view */}
        <button
          onClick={downloadAllAttachments}
          title="Download all attachments (zip)"
          style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid #e6edf8', background: '#fff', cursor: 'pointer' }}
        >
          <img src={DownloadIcon} alt="Download all" style={{ width: 18, height: 18 }} />
          <span style={{ fontWeight: 700, color: '#0f172a' }}>Download all</span>
        </button>
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); } to { transform: scale(1); } }
        .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.65); display: flex; justify-content: center; align-items: center; z-index: 9999; animation: fadeIn 0.18s; }
        .modal-box { background: white; padding: 30px; border-radius: 12px; width: 92%; max-width: 980px; text-align: center; box-shadow: 0 15px 50px rgba(0,0,0,0.25); animation: zoomIn 0.18s; position: relative; }
        .reason-input { width: 80%; padding: 12px; margin: 12px 0; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 15px; }
        .error-text { color: #dc2626; font-size: 14px; margin-top: 8px; font-weight: 500; }

        /* Attachment viewer styles */
        .att-viewer { display:flex; flex-direction:column; gap:12px; align-items:stretch; }
        .att-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; }
        .att-title { font-weight:800; font-size:16px; color:#0f172a; }
        .att-close { background:transparent; border:none; font-size:20px; cursor:pointer; color:#475569; }
        .att-content { width:100%; min-height: 240px; max-height: 80vh; display:flex; justify-content:center; align-items:center; overflow:auto; background:#f8fafc; border-radius:10px; padding:12px; flex-direction:column; }
        .att-img { max-width:100%; max-height:78vh; object-fit:contain; border-radius:8px; box-shadow:0 6px 18px rgba(2,6,23,0.08); }
        .att-iframe { width:100%; height:78vh; border: none; border-radius:8px; }
        .att-list { display:flex; gap:8px; overflow:auto; padding-top:8px; }
        .att-thumb { padding:6px; background:#fff; border-radius:8px; border:1px solid #e6e9ee; cursor:pointer; min-width:120px; display:flex; gap:8px; align-items:center; }
        .att-thumb img { width:56px; height:56px; object-fit:cover; border-radius:6px; }
        .att-thumb .meta { display:flex; flex-direction:column; align-items:flex-start; min-width:0; }
        .att-thumb .meta .name { font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .att-thumb .meta .type { font-size:12px; color:#6b7280; }

        .att-actions { display:flex; gap:8px; margin-top:12px; }
        .att-btn { padding:10px 16px; background:#2563eb; color:#fff; border-radius:8px; text-decoration:none; font-weight:700; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px; }
        .att-btn img { width:18px; height:18px; }
      `}</style>

      {/* BACK BUTTON */}
      <div style={{ padding: "1rem", maxWidth: 720, margin: "0 auto" }}>
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
            fontWeight: 600, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', fontSize: '15px'
          }}
        >
          Back to Tickets
        </button>
      </div>

      {/* MAIN CARD */}
      <div style={{
        padding: '2.5rem',
        maxWidth: '720px',
        margin: '0 auto',
        background: '#ffffff',
        borderRadius: '16px',
        borderLeft: `8px solid ${ticket.status === "Closed" ? "#dc2626" : "#16a34a"}`,
        boxShadow: '0 12px 40px rgba(2,6,23,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        position: 'relative'
      }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: 1 }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: 'linear-gradient(135deg,#4f46e5 0%, #06b6d4 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '20px',
              boxShadow: '0 8px 30px rgba(79,70,229,0.12)'
            }}>
              {ticket.userName ? ticket.userName.split(' ').map(n => n[0]).slice(0,2).join('') : 'U'}
            </div>

            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: '1.65rem', color: '#0f172a', fontWeight: 800 }}>
                {ticket.category}
              </h1>

              <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: 'linear-gradient(90deg, #eef2ff 0%, #f0f9ff 100%)',
                  color: '#3730a3',
                  fontWeight: 800,
                  fontSize: 13,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  boxShadow: '0 6px 18px rgba(99,102,241,0.08)'
                }}>
                  <span style={{ fontSize: 12, color: '#4b5563', fontWeight: 700 }}>Ticket #</span>
                  <span style={{ fontSize: 20, marginTop: 4, letterSpacing: '0.6px' }}>{ticket.ticketNumber}</span>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: ticket.priority === 'High' ? '#fff1f2' : ticket.priority === 'Medium' ? '#fff7ed' : '#f0fdf4',
                    color: ticket.priority === 'High' ? '#991b1b' : ticket.priority === 'Medium' ? '#b45309' : '#166534',
                    fontWeight: 700,
                    fontSize: 13,
                    boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.02)'
                  }}>{ticket.priority}</span>

                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 13,
                    ...statusColorStyles
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ticket.status === 'Closed' ? '#dc2626' : (ticket.status === 'Approved' ? '#16a34a' : (ticket.status === 'Waiting for approval' ? '#f59e0b' : '#06b6d4')) }} />
                    {ticket.status}
                  </span>
                </div>
              </div>

              {/* Operational & Finance sub info under title */}
              {ticket.category === 'Operational & Finance' && ticket.subQuery && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#4b5563' }}>
                  <strong>Sub Category:</strong> {ticket.subQuery}
                  {ticket.subQuery === 'Other' && ticket.otherSubQueryText && (
                    <div style={{ marginTop: 4 }}>
                      <strong>Details:</strong> {ticket.otherSubQueryText}
                    </div>
                  )}
                </div>
              )}

              {/* NOTE: Removed duplicate small hint attachment shown above the Description box */}
            </div>
          </div>

          <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#64748b', fontSize: 13 }}>Created by</div>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>{ticket.userName}</div>
              <a href={`mailto:${ticket.userEmail}`} style={{ color: '#2563eb', fontSize: 13, textDecoration: 'none' }}>
                {ticket.userEmail}
              </a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 8 }}>
              {authority === 'admin' && ticket.status !== 'Closed' && (
                <button
                  onClick={() => setShowReasonInput(true)}
                  style={{
                    width: '100%', background: '#dc2626', color: 'white', padding: '12px 14px',
                    border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, fontSize: '15px',
                    boxShadow: '0 8px 24px rgba(220,38,38,0.18)'
                  }}
                >
                  Close Ticket
                </button>
              )}

              {ticket.status === 'Closed' && (
                <button
                  onClick={() => setShowreopenReasonInput(true)}
                  style={{
                    width: '100%', background: '#16a34a', color: 'white', padding: '12px 14px',
                    border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, fontSize: '15px',
                    boxShadow: '0 8px 24px rgba(16,185,129,0.12)'
                  }}
                >
                  reopen Ticket
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Waiting for approval banner */}
        {needsApprovalBanner && (
          <div style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            padding: "15px",
            borderRadius: 12,
            marginBottom: 20,
            textAlign: "center",
            boxShadow: "0 3px 10px rgba(0,0,0,0.06)"
          }}>
            <h3 style={{ margin: 0, color: "#92400e", fontWeight: 800 }}>
              Waiting for Your Approval
            </h3>
            <p style={{ color: "#92400e", marginTop: 6 }}>
              This ticket requires action from <strong>you ({ticket.category})</strong>.
            </p>

            <button
              onClick={() => setShowApprovalModal(true)}
              style={{
                marginTop: 10,
                background: "#d97706",
                color: "white",
                borderRadius: 10,
                padding: "10px 22px",
                border: "none",
                cursor: "pointer",
                fontWeight: 700
              }}
            >
              Review & Take Action
            </button>
          </div>
        )}

        {/* Description + attachment (detailed) */}
        <div style={{
          marginTop: 4,
          background: '#f8fafc',
          padding: 20,
          borderRadius: 14,
          display: 'block',
          border: '1px solid #edf2f7',
          color: '#334155',
          lineHeight: 1.7,
          fontSize: 15
        }}>
          <strong style={{ display: 'block', marginBottom: 8, fontSize: 15 }}>Description</strong>
          <div style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
          {/* Attachment detailed view - kept here (only this button will be visible) */}
          {renderAttachmentSummary()}
        </div>
      </div>

      {/* FULL HISTORY TIMELINE */}
      <div style={{ maxWidth: '720px', margin: '3rem auto', padding: '0 1rem' }}>
        <h2 style={{ fontSize: '1.9rem', color: '#1e293b', marginBottom: '2.5rem', textAlign: 'center', fontWeight: 700 }}>
          Ticket History
        </h2>
        <div>
          {historyEvents.map((event, index) => {
            const isCreatedEvent = event.action === 'created';
            const createdByDifferentPerson = isCreatedEvent && event.by !== ticket.userName;
            const showOnBehalf = isCreatedEvent && (ticket.onBehalf || createdByDifferentPerson);

            const isOpsFin = ticket.category === 'Operational & Finance';

            return (
              <div
                key={index}
                style={{
                  marginBottom: 20,
                  padding: 20,
                  background:
                    event.action === 'closed'
                      ? '#fff1f2'
                      : event.action === 'created'
                      ? '#fefce8'
                      : '#f1f5f9',
                  borderRadius: 12,
                  borderLeft: event.action === 'created' ? '4px solid #facc15' : 'none'
                }}
              >
                <strong style={{ display: 'block', marginBottom: 8, textTransform: 'capitalize', fontSize: '1.1rem' }}>
                  {event.action === 'created' ? 'Ticket Created' :
                   event.action === 'closed' ? 'Ticket Closed' :
                   event.action === 'reopend' ? 'Ticket reopend' : event.action}
                </strong>

                <small style={{ color: '#475569', fontWeight: 600, display: 'block', marginBottom: 10 }}>
                  {formatDate(event.at)} by <strong>{event.by || "Unknown"}</strong>
                  {showOnBehalf && (
                    <>
                      {' '}on behalf of{' '}
                      <strong style={{ color: '#dc2626' }}>
                        {ticket.onBehalf || ticket.userName}
                        {ticket.onBehalfEmail ? ` (${ticket.onBehalfEmail})` : ''}
                      </strong>
                    </>
                  )}
                </small>

                {/* Sub query info snapshot in history (if backend stored it per event) */}
                {isOpsFin && (event.subQuery || event.otherSubQueryText) && (
                  <div style={{ marginTop: 6, fontSize: 13, color: '#4b5563' }}>
                    {event.subQuery && (
                      <div>
                        <strong>Sub Category:</strong> {event.subQuery}
                      </div>
                    )}
                    {event.subQuery === 'Other' && event.otherSubQueryText && (
                      <div style={{ marginTop: 2 }}>
                        <strong>Details:</strong> {event.otherSubQueryText}
                      </div>
                    )}
                  </div>
                )}

                {/* Reason */}
                {event.reason && (
                  <div style={{ marginTop: 12, padding: 12, background: '#e2e8f0', borderRadius: 8 }}>
                    <strong>Reason:</strong> {event.reason}
                  </div>
                )}

                {/* Attachment snapshot in history */}
                {renderHistoryAttachment(event)}
              </div>
            );
          })}

          <div style={{ marginTop: 12, padding: 20, background: ticket.status === "Closed" ? '#fee2e2' : '#f0fdf4', borderRadius: 12 }}>
            <strong style={{ fontSize: '1.2rem', color: ticket.status === "Closed" ? '#b91c1c' : '#166534' }}>
              Current Status: {ticket.status}
            </strong>
          </div>
        </div>
      </div>

      {/* APPROVAL MODAL – Password Reset + Admin Access */}
      {showApprovalModal &&
        isCategoryHead &&
        approvalCategories.includes(ticket.category) && (
        <div className="overlay">
          <div className="modal-box" style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: 10, fontWeight: 800 }}>Approval Required</h2>
            <p style={{ color: "#475569", marginBottom: 20 }}>
              You are the <strong>Category Head</strong> for <strong>{ticket.category}</strong>.<br />
              Review the ticket details below before taking action.
            </p>

            <div style={{
              background: "#f8fafc",
              padding: 18,
              borderRadius: 12,
              textAlign: "left",
              marginBottom: 16,
              border: "1px solid #e2e8f0"
            }}>
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 700 }}>Ticket Summary</h3>
              <p style={{ margin: '6px 0' }}><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
              <p style={{ margin: '6px 0' }}><strong>Created By:</strong> {ticket.userName} ({ticket.userEmail})</p>
              <p style={{ margin: '6px 0' }}><strong>Category:</strong> {ticket.category}</p>
              <p style={{ margin: '6px 0' }}><strong>Priority:</strong> {ticket.priority}</p>
              <p style={{ margin: '6px 0' }}><strong>On Behalf:</strong> {ticket.onBehalf || "Self"}</p>
              {ticket.onBehalfEmail && <p style={{ margin: '6px 0' }}><strong>On Behalf Email:</strong> {ticket.onBehalfEmail}</p>}
              {ticket.deliveryEmail && <p style={{ margin: '6px 0' }}><strong>Delivery Email:</strong> {ticket.deliveryEmail}</p>}
              <p style={{ margin: '6px 0' }}><strong>Created On:</strong> {formatDate(ticket.createdAt)}</p>

              {/* subQuery summary inside approval modal */}
              {ticket.category === 'Operational & Finance' && ticket.subQuery && (
                <>
                  <p style={{ margin: '6px 0' }}><strong>Sub Category:</strong> {ticket.subQuery}</p>
                  {ticket.subQuery === 'Other' && ticket.otherSubQueryText && (
                    <p style={{ margin: '6px 0' }}><strong>Sub Details:</strong> {ticket.otherSubQueryText}</p>
                  )}
                </>
              )}

              {/* attachment summary inside approval modal */}
              {hasAttachment && (
                <div style={{ marginTop: 8 }}>
                  {renderAttachmentSummary()}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <strong>Description:</strong>
                <div style={{
                  background: "#e2e8f0",
                  padding: 10,
                  borderRadius: 8,
                  marginTop: 6,
                  whiteSpace: "pre-wrap"
                }}>
                  {ticket.description}
                </div>
              </div>
            </div>

            <textarea
              className="reason-input"
              placeholder="Optional note to requester..."
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={4}
              style={{ width: "100%", marginBottom: 10 }}
              required={true}
            />

            <div style={{ display: "flex", gap: 12, marginTop: 10, justifyContent: "center" }}>
              <button
                onClick={handleApprove}
                disabled={approveLoading}
                style={{
                  padding: "12px 22px", background: "#16a34a", color: "white",
                  borderRadius: 12, fontWeight: 700, cursor: "pointer", minWidth: 120
                }}
              >
                {approveLoading ? "Approving..." : "Approve"}
              </button>
              <button
                onClick={handleReject}
                disabled={rejectLoading}
                style={{
                  padding: "12px 22px", background: "#dc2626", color: "white",
                  borderRadius: 12, fontWeight: 700, cursor: "pointer", minWidth: 120
                }}
              >
                {rejectLoading ? "Rejecting..." : "Reject"}
              </button>
              <button
                onClick={() => { setShowApprovalModal(false); setAdminNote(''); }}
                style={{
                  padding: "12px 22px", background: "#64748b", color: "white",
                  borderRadius: 12, fontWeight: 700, cursor: "pointer"
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASSWORD POPUP FOR PASSWORD RESET */}
      {showPasswordPopup && (
        <div className="overlay">
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <h2>Password Reset Successful</h2>
            <p>The new temporary password generated for the target account is shown below. Please copy it and share as needed.</p>
            <div style={{
              padding: "12px",
              background: "#f1f5f9",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 18,
              marginTop: 10
            }}>
              {returnedPassword}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 18 }}>
              <button
                onClick={() => copyToClipboard(returnedPassword)}
                style={{ padding: "10px 18px", background: "#2563eb", color: 'white', borderRadius: 10 }}
              >
                Copy
              </button>
              <button
                onClick={() => { setShowPasswordPopup(false); navigate('/', { state: { refresh: true } }); }}
                style={{ padding: "10px 18px", background: "#10b981", color: 'white', borderRadius: 10 }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE / REOPEN modals... (unchanged) */}
      {showReasonInput && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>
              Close Ticket #{ticket.ticketNumber}
            </h3>
            <p style={{ color: '#475569', marginBottom: 20 }}>Please provide a reason for closing this ticket.</p>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Explain why this ticket is being closed..."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              autoFocus
            />
            {closeError && <div className="error-text">{closeError}</div>}
            <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button
                onClick={handleSubmitReason}
                style={{ padding: '14px 28px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}
              >
                Continue to Close
              </button>
              <button
                onClick={cancelClose}
                style={{ padding: '14px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#dc2626', fontSize: '1.6rem', fontWeight: 700 }}>Permanently Close Ticket?</h3>
            <p style={{ color: '#475569', marginBottom: 30, fontSize: '15px' }}>Are you sure?</p>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button
                onClick={confirmCloseTicket}
                disabled={loading}
                style={{ padding: '16px 36px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}
              >
                {loading ? 'Closing...' : 'Yes, Close It'}
              </button>
              <button
                onClick={cancelClose}
                style={{ padding: '16px 36px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showreopenReasonInput && (
        <div className="overlay" onClick={cancelreopen}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>
              reopen Ticket #{ticket.ticketNumber}
            </h3>
            <p style={{ color: '#475569', marginBottom: 20 }}>Please explain why this ticket needs to be reopened.</p>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Why is this ticket being reopend?"
              value={reopenReason}
              onChange={(e) => setreopenReason(e.target.value)}
              autoFocus
            />
            {reopenError && <div className="error-text">{reopenError}</div>}
            <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button
                onClick={handleSubmitreopenReason}
                style={{ padding: '14px 28px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}
              >
                Continue to reopen
              </button>
              <button
                onClick={cancelreopen}
                style={{ padding: '14px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmreopenModal && (
        <div className="overlay" onClick={cancelreopen}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#16a34a', fontSize: '1.6rem', fontWeight: 700 }}>reopen This Ticket?</h3>
            <p style={{ color: '#475569', marginBottom: 30, fontSize: '15px' }}>The ticket will be reopened and require attention.</p>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button
                onClick={confirmreopenTicket}
                disabled={loading}
                style={{ padding: '16px 36px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}
              >
                {loading ? 'Reviving...' : 'Yes, reopen It'}
              </button>
              <button
                onClick={cancelreopen}
                style={{ padding: '16px 36px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Viewer Modal */}
      {attachmentModalOpen && activeAttachment && (
        <div className="overlay" onClick={() => setAttachmentModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100 }}>
            <div className="att-viewer">
              <div className="att-toolbar">
                <div className="att-title">{activeAttachment.fileName || 'Attachment'}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {attachmentList && attachmentList.length > 1 && (
                    <div style={{ fontSize: 13, color: '#6b7280', marginRight: 8 }}>
                      {attachmentList.length} attachments
                    </div>
                  )}
                  <button className="att-close" onClick={() => setAttachmentModalOpen(false)} aria-label="Close attachment viewer">✖</button>
                </div>
              </div>

              <div className="att-content">
                {isImageType(activeAttachment.fileType) ? (
                  <>
                    <img
                    src={imagePreviewUrl}
                    alt={activeAttachment.fileName}
                    className="att-img"
                  />

                    <div className="att-actions">
                      {/* Download button for images (only control) */}
                      <button
                        className="att-btn"
                        onClick={() => downloadAttachment(activeAttachment)}
                        title="Download image"
                      >
                        <img src={DownloadIcon} alt="Download" />
                        Download image
                      </button>
                    </div>
                  </>
                ) : isPdfType(activeAttachment.fileType, activeAttachment.fileUrl) ? (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ marginBottom: 12 }}>PDF will be downloaded when you click the button.</p>
                    <button
                      className="att-btn"
                      onClick={() => downloadAttachment(activeAttachment)}
                    >
                      <img src={DownloadIcon} alt="Download" />
                      Download PDF
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ marginBottom: 12 }}>This file type cannot be previewed inline.</p>
                    <a
                      href={activeAttachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-block',
                        padding: '8px 14px',
                        background: '#2563eb',
                        color: '#fff',
                        borderRadius: 8,
                        textDecoration: 'none',
                        fontWeight: 700
                      }}
                    >
                      Open attachment
                    </a>
                  </div>
                )}
              </div>

              {/* If multiple attachments exist, show thumbnails / list below */}
              {attachmentList && attachmentList.length > 1 && (
                <div className="att-list" style={{ marginTop: 8 }}>
                  {attachmentList.map((a, idx) => {
                    const previewIsImage = isImageType(a.fileType);
                    return (
                      <div key={`${a.fileName}-${idx}`} className="att-thumb" onClick={() => setActiveAttachment(a)} title={a.fileName}>
                        {previewIsImage ? (
                          <img src={a.fileUrl} alt={a.fileName} />
                        ) : (
                          <div style={{ width:56, height:56, display:'flex', alignItems:'center', justifyContent:'center', background:'#f3f4f6', borderRadius:6, fontSize:12, padding:6 }}>
                            {a.fileName?.split('.').pop()?.toUpperCase() || 'FILE'}
                          </div>
                        )}
                        <div className="meta">
                          <div className="name">{a.fileName}</div>
                          <div className="type">{a.fileType || (a.fileUrl ? a.fileUrl.split('.').pop() : '')}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;