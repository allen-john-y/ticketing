// TicketDetails.js — Professional Business UI matching Home.js style
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
  }, [activeAttachment]);

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await axios.get(`${backendBase}/tickets/${id}`);
        setTicket(res.data);
        try {
          const all = await axios.get(`${backendBase}/api/categories`);
          setCategoryMeta(
            all.data.find(
              c => c.name?.toLowerCase() === res.data.category?.toLowerCase()
            ) || null
          );
        } catch (e) {
          setCategoryMeta(null);
        }

        const list = [];
        if (res.data.attachments && Array.isArray(res.data.attachments) && res.data.attachments.length) {
          res.data.attachments.forEach(a => {
            const driveId = a.driveId || a.parentReference?.driveId || null;
            const driveItemId = a.id || a.fileId || null;
            const proxyUrl = driveItemId ? `${backendBase}/attachments/${driveItemId}${driveId ? `?driveId=${encodeURIComponent(driveId)}` : ''}` : (a.fileUrl || a.url || a.path || null);
            list.push({
              fileName: a.fileName || a.file_name || a.originalname || '',
              fileType: a.fileType || a.file_type || a.mimetype || '',
              fileUrl: proxyUrl,
              id: driveItemId,
              driveId: driveId || null
            });
          });
        } else if (res.data.attachment && (res.data.attachment.fileName || res.data.attachment.fileUrl)) {
          const a = res.data.attachment;
          const driveId = a.driveId || a.parentReference?.driveId || null;
          const driveItemId = a.id || a.fileId || null;
          const proxyUrl = driveItemId ? `${backendBase}/attachments/${driveItemId}${driveId ? `?driveId=${encodeURIComponent(driveId)}` : ''}` : (a.fileUrl || null);
          list.push({
            fileName: a.fileName || '',
            fileType: a.fileType || '',
            fileUrl: proxyUrl,
            id: driveItemId || null,
            driveId: driveId || null
          });
        }
        setAttachmentList(list);

      } catch (err) {
        console.error('Error fetching ticket:', err);
      }
    };
    fetchTicket();
  }, [id, accounts, instance, backendBase]);

  useEffect(() => {
    if (!accounts[0] || !ticket || !categoryMeta) return;

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

    const heads =
      (categoryMeta.categoryHeads || [])
        .map(h => (h.email || '').toLowerCase().trim())
        .filter(Boolean);

    const isHead = loggedEmail && heads.includes(loggedEmail);

    setIsCategoryHead(!!isHead);

    const status = (ticket.status || '').toString();

    if (isHead && status === "Waiting for approval") {
      setShowApprovalModal(true);
    } else {
      setShowApprovalModal(false);
    }
  }, [accounts, ticket, categoryMeta]);

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

  const needsApprovalBanner =
    isCategoryHead &&
    ticket &&
    ticket.status === 'Waiting for approval' &&
    !showApprovalModal;

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
      if (!ticket || ticket.status !== "Waiting for approval") {
        alert("Approval is not allowed for this ticket.");
        setApproveLoading(false);
        return;
      }

      const res = await axios.post(`${backendBase}/tickets/${id}/approve`, {
        approvedBy: accounts[0]?.name || accounts[0]?.username,
        note: adminNote
      });

      setShowApprovalModal(false);

      if (res.data?.newPassword) {
        setReturnedPassword(res.data.newPassword);
        setShowPasswordPopup(true);
      } else {
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

  if (!ticket) return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontSize: '18px',
      color: '#64748b',
      fontWeight: 600
    }}>
      Loading ticket...
    </div>
  );

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

  const hasAttachment = (attachmentList && attachmentList.length > 0);

  const isImageType = (type) => type && type.startsWith && type.startsWith('image/');
  const isPdfType = (type, url) => {
    if (type && type === 'application/pdf') return true;
    if (url && url.toLowerCase().endsWith('.pdf')) return true;
    return false;
  };

  const openAttachmentViewer = (attachment) => {
    if (!attachment) return;

    const fileUrl = attachment.fileUrl;
    const viewableImage = isImageType(attachment.fileType);
    const viewablePdf = isPdfType(attachment.fileType, fileUrl);

    if (viewablePdf) {
      downloadAttachment(attachment);
      return;
    }

    if (!viewableImage) {
      window.open(fileUrl, '_blank', 'noopener');
      return;
    }

    setActiveAttachment({
      ...attachment,
      fileUrl
    });

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
      const filename = attachment.fileName || (attachment.fileUrl.split('/').pop().split('?')[0]) || 'download';
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn('Download fallback, opening in new tab', err);
      window.open(attachment.fileUrl, '_blank', 'noopener');
    }
  };

  const downloadAllAttachments = async () => {
    if (!attachmentList || attachmentList.length === 0) return;

    const downloadable = attachmentList.filter(a => a && a.id);
    if (downloadable.length === 0) {
      alert('No downloadable attachments available (missing internal ids).');
      return;
    }

    const ids = downloadable.map(a => a.id).join(',');
    const driveIds = downloadable.map(a => a.driveId || '').join(',');

    if (downloadable.length < attachmentList.length) {
      alert(`Only ${downloadable.length} of ${attachmentList.length} attachments can be included in the ZIP. The downloadable ones will be downloaded.`);
    }

    const encodedIds = encodeURIComponent(ids);
    const encodedDriveIds = driveIds ? `&driveIds=${encodeURIComponent(driveIds)}` : '';
    const url = `${backendBase}/attachments/zip?ids=${encodedIds}${encodedDriveIds}`;

    const a = document.createElement('a');
    a.href = url;
    a.download = `attachments-${ticket.ticketNumber || id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const renderHistoryAttachment = (event) => {
    if (!event.attachment || (!event.attachment.fileName && !event.attachment.fileUrl)) return null;
    const label = event.attachment.fileName || 'Attachment';
    const typeLabel = event.attachment.fileType || '';
    const url = event.attachment.fileUrl;
    const att = { fileName: label, fileType: typeLabel, fileUrl: url, id: null };
    return (
      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '14px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <img src={AttachmentIcon} alt="Attachment" style={{ width: '18px', height: '18px' }} />
          Attachment:
        </span>

        <button
          onClick={() => {
            if (isPdfType(typeLabel, url)) {
              downloadAttachment(att);
            } else {
              openAttachmentViewer(att);
            }
          }}
          style={{ 
            background: '#002060', 
            color: 'white', 
            border: 'none', 
            padding: '8px 16px', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            fontWeight: 600,
            fontSize: '13px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(0, 32, 96, 0.15)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#001a4d';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 32, 96, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#002060';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 32, 96, 0.15)';
          }}
        >
          {isPdfType(typeLabel, url) ? 'Download PDF' : 'View attachment'}
        </button>
        {typeLabel && (
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
            ({typeLabel})
          </span>
        )}
      </div>
    );
  };

  const renderAttachmentSummary = () => {
    if (!hasAttachment) return null;

    if (attachmentList.length === 1) {
      const a = attachmentList[0];
      const isPdf = isPdfType(a.fileType, a.fileUrl);
      return (
        <div style={{ 
          marginTop: '20px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          padding: '16px',
          background: '#f8fafc',
          borderRadius: '10px',
          border: '2px solid #e2e8f0'
        }}>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <img src={AttachmentIcon} alt="Attachment" style={{ width: '18px', height: '18px' }} />
            Attachment:
          </span>

          <button
            onClick={() => {
              if (isPdf) {
                downloadAttachment(a);
              } else {
                openAttachmentViewer(a);
              }
            }}
            style={{ 
              background: '#002060', 
              color: 'white', 
              border: 'none', 
              padding: '8px 16px', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 600,
              fontSize: '13px',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(0, 32, 96, 0.15)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#001a4d';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#002060';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {isPdf ? 'Download PDF' : 'View attachment'}
          </button>
          {!isPdf && (
            <button
              onClick={() => downloadAttachment(a)}
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: '8px 12px', 
                borderRadius: '8px', 
                border: '2px solid #e2e8f0', 
                background: '#fff', 
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#002060';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <img src={DownloadIcon} alt="Download" style={{ width: '18px', height: '18px' }} />
            </button>
          )}
          <span style={{ fontSize: '13px', color: '#64748b' }}>{a.fileName}</span>
        </div>
      );
    }

    return (
      <div style={{ 
        marginTop: '20px', 
        padding: '16px',
        background: '#f8fafc',
        borderRadius: '10px',
        border: '2px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <img src={AttachmentIcon} alt="Attachments" style={{ width: '18px', height: '18px' }} />
            Attachments ({attachmentList.length}):
          </span>

          <button
            onClick={() => {
              if (attachmentList.length) {
                setActiveAttachment(attachmentList[0]);
                setAttachmentModalOpen(true);
              }
            }}
            style={{ 
              background: '#002060', 
              color: 'white', 
              border: 'none', 
              padding: '8px 16px', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 600,
              fontSize: '13px',
              transition: 'all 0.2s'
            }}
          >
            View all attachments
          </button>
          <button
            onClick={downloadAllAttachments}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '8px 16px', 
              borderRadius: '8px', 
              border: '2px solid #e2e8f0', 
              background: '#fff', 
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              color: '#0f172a',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#002060';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fff';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            <img src={DownloadIcon} alt="Download all" style={{ width: '18px', height: '18px' }} />
            Download all (ZIP)
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: '40px' }}>
      <style>{`
        * { box-sizing: border-box; }
        
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        
        .overlay { 
          position: fixed; 
          top: 0; 
          left: 0; 
          width: 100vw; 
          height: 100vh; 
          background: rgba(0,0,0,0.65); 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          z-index: 9999; 
          animation: fadeIn 0.2s; 
          backdrop-filter: blur(4px);
        }
        
        .modal-box { 
          background: white; 
          padding: 32px; 
          border-radius: 16px; 
          width: 92%; 
          max-width: 980px; 
          text-align: center; 
          box-shadow: 0 20px 60px rgba(0,0,0,0.3); 
          animation: slideUp 0.3s; 
          position: relative; 
          max-height: 90vh;
          overflow-y: auto;
        }
        
        .reason-input { 
          width: 100%; 
          padding: 14px; 
          margin: 12px 0; 
          border: 2px solid #e2e8f0; 
          border-radius: 12px; 
          font-size: 15px;
          font-family: inherit;
          transition: all 0.2s;
        }
        
        .reason-input:focus {
          outline: none;
          border-color: #002060;
          box-shadow: 0 0 0 3px rgba(0, 32, 96, 0.1);
        }
        
        .error-text { 
          color: #dc2626; 
          font-size: 14px; 
          margin-top: 8px; 
          font-weight: 600; 
        }

        .att-viewer { 
          display:flex; 
          flex-direction:column; 
          gap:16px; 
          align-items:stretch; 
        }
        
        .att-toolbar { 
          display:flex; 
          justify-content:space-between; 
          align-items:center; 
          gap:12px; 
          padding-bottom: 16px;
          border-bottom: 2px solid #e2e8f0;
        }
        
        .att-title { 
          font-weight:800; 
          font-size:18px; 
          color:#0f172a; 
        }
        
        .att-close { 
          background:transparent; 
          border:none; 
          font-size:24px; 
          cursor:pointer; 
          color:#64748b;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }
        
        .att-close:hover {
          background: #f1f5f9;
          color: #475569;
        }
        
        .att-content { 
          width:100%; 
          min-height: 240px; 
          max-height: 70vh; 
          display:flex; 
          justify-content:center; 
          align-items:center; 
          overflow:auto; 
          background:#f8fafc; 
          border-radius:12px; 
          padding:16px; 
          flex-direction:column; 
          border: 2px solid #e2e8f0;
        }
        
        .att-img { 
          max-width:100%; 
          max-height:68vh; 
          object-fit:contain; 
          border-radius:10px; 
          box-shadow:0 8px 24px rgba(0,0,0,0.12); 
        }
        
        .att-list { 
          display:flex; 
          gap:10px; 
          overflow:auto; 
          padding-top:12px; 
        }
        
        .att-thumb { 
          padding:10px; 
          background:#fff; 
          border-radius:10px; 
          border:2px solid #e2e8f0; 
          cursor:pointer; 
          min-width:140px; 
          display:flex; 
          gap:10px; 
          align-items:center;
          transition: all 0.2s;
        }
        
        .att-thumb:hover {
          border-color: #002060;
          box-shadow: 0 4px 12px rgba(0, 32, 96, 0.1);
        }
        
        .att-thumb img { 
          width:60px; 
          height:60px; 
          object-fit:cover; 
          border-radius:8px; 
        }
        
        .att-thumb .meta { 
          display:flex; 
          flex-direction:column; 
          align-items:flex-start; 
          min-width:0; 
        }
        
        .att-thumb .meta .name { 
          font-weight:700; 
          font-size:13px; 
          white-space:nowrap; 
          overflow:hidden; 
          text-overflow:ellipsis; 
        }
        
        .att-thumb .meta .type { 
          font-size:12px; 
          color:#64748b; 
        }

        .att-actions { 
          display:flex; 
          gap:10px; 
          margin-top:16px; 
        }
        
        .att-btn { 
          padding:12px 20px; 
          background:#002060; 
          color:#fff; 
          border-radius:10px; 
          text-decoration:none; 
          font-weight:700; 
          border:none; 
          cursor:pointer; 
          display:inline-flex; 
          align-items:center; 
          gap:8px;
          transition: all 0.2s;
        }
        
        .att-btn:hover {
          background: #001a4d;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 32, 96, 0.3);
        }
        
        .att-btn img { 
          width:18px; 
          height:18px; 
        }
        
        .btn-primary {
          background: linear-gradient(135deg, #002060 0%, #003380 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 6px 18px rgba(0, 32, 96, 0.15);
        }
        
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 32, 96, 0.25);
        }
        
        .btn-danger {
          background: #ef4444;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 6px 18px rgba(239, 68, 68, 0.15);
        }
        
        .btn-danger:hover {
          background: #dc2626;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(239, 68, 68, 0.25);
        }
        
        .btn-success {
          background: #10b981;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 6px 18px rgba(16, 185, 129, 0.15);
        }
        
        .btn-success:hover {
          background: #059669;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.25);
        }
        
        .btn-secondary {
          background: #64748b;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-secondary:hover {
          background: #475569;
        }
        
        @media (max-width: 768px) {
          .modal-box {
            padding: 24px;
            width: 95%;
          }
        }
      `}</style>

      {/* Header Bar - Matching Home.js style */}
      <div style={{
        background: 'linear-gradient(135deg, #002060 0%, #003380 100%)',
        color: 'white',
        padding: '1.5rem 2rem',
        boxShadow: '0 4px 16px rgba(0, 32, 96, 0.15)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '2rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <button
              onClick={() => navigate('/tickets')}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                fontSize: '15px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
              ← Back to Tickets
            </button>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>Ticket Details</h1>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/create" className="btn-header btn-primary" style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              textDecoration: 'none',
              display: 'inline-block',
              background: '#e98404',
              color: 'white',
              boxShadow: '0 4px 12px rgba(233, 132, 4, 0.3)'
            }}>
              + Create Ticket
            </Link>
          </div>
        </div>
      </div>

      {/* MAIN CARD */}
      <div style={{
        maxWidth: '800px',
        margin: '2rem auto',
        padding: '0 1.5rem'
      }}>
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          borderLeft: `6px solid ${ticket.status === "Closed" ? "#ef4444" : ticket.status === "Approved" ? "#10b981" : "#e98404"}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
          padding: '2.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flex: 1, minWidth: '300px' }}>
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #002060 0%, #003380 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '20px',
                boxShadow: '0 8px 24px rgba(0, 32, 96, 0.2)',
                flexShrink: 0
              }}>
                {ticket.userName ? ticket.userName.split(' ').map(n => n[0]).slice(0,2).join('') : 'U'}
              </div>

              <div style={{ flex: 1 }}>
                <h1 style={{ margin: '0 0 8px 0', fontSize: '1.75rem', color: '#0f172a', fontWeight: 800 }}>
                  {ticket.category}
                </h1>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{
                    padding: '8px 16px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    color: '#002060',
                    fontWeight: 800,
                    fontSize: '13px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    boxShadow: '0 4px 12px rgba(0, 32, 96, 0.08)'
                  }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Ticket #</span>
                    <span style={{ fontSize: '20px', marginTop: '2px', letterSpacing: '0.5px' }}>{ticket.ticketNumber}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '8px 12px',
                      borderRadius: '999px',
                      background: ticket.priority === 'High' ? '#fee2e2' : ticket.priority === 'Medium' ? '#fff7ed' : '#d1fae5',
                      color: ticket.priority === 'High' ? '#991b1b' : ticket.priority === 'Medium' ? '#b45309' : '#065f46',
                      fontWeight: 700,
                      fontSize: '13px',
                      border: `2px solid ${ticket.priority === 'High' ? '#fecaca' : ticket.priority === 'Medium' ? '#fed7aa' : '#a7f3d0'}`
                    }}>{ticket.priority} Priority</span>

                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '999px',
                      fontWeight: 700,
                      fontSize: '13px',
                      border: '2px solid',
                      ...statusColorStyles,
                      borderColor: ticket.status === 'Closed' ? '#fecaca' : (ticket.status === 'Approved' ? '#a7f3d0' : (ticket.status === 'Waiting for approval' ? '#fcd34d' : '#bae6fd'))
                    }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ticket.status === 'Closed' ? '#dc2626' : (ticket.status === 'Approved' ? '#10b981' : (ticket.status === 'Waiting for approval' ? '#e98404' : '#0284c7')) }} />
                      {ticket.status}
                    </span>
                  </div>
                </div>

                {ticket.category === 'Operational & Finance' && ticket.subQuery && (
                  <div style={{ marginTop: '12px', fontSize: '14px', color: '#475569' }}>
                    <span style={{ fontWeight: 700 }}>Sub Category:</span> {ticket.subQuery}
                    {ticket.subQuery === 'Other' && ticket.otherSubQueryText && (
                      <div style={{ marginTop: '4px' }}>
                        <span style={{ fontWeight: 700 }}>Details:</span> {ticket.otherSubQueryText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-end' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Created by</div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '15px' }}>{ticket.userName}</div>
                <a href={`mailto:${ticket.userEmail}`} style={{ color: '#002060', fontSize: '13px', textDecoration: 'none', fontWeight: 600 }}>
                  {ticket.userEmail}
                </a>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '10px' }}>
                {authority === 'admin' && ticket.status !== 'Closed' && (
                  <button
                    onClick={() => setShowReasonInput(true)}
                    className="btn-danger"
                    style={{ width: '100%', fontSize: '15px' }}
                  >
                    Close Ticket
                  </button>
                )}

                {ticket.status === 'Closed' && (
                  <button
                    onClick={() => setShowreopenReasonInput(true)}
                    className="btn-success"
                    style={{ width: '100%', fontSize: '15px' }}
                  >
                    Reopen Ticket
                  </button>
                )}
              </div>
            </div>
          </div>

          {needsApprovalBanner && (
            <div style={{
              background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
              border: "2px solid #fcd34d",
              padding: "20px",
              borderRadius: "14px",
              textAlign: "center",
              boxShadow: "0 6px 18px rgba(252, 211, 77, 0.15)"
            }}>
              <h3 style={{ margin: 0, color: "#92400e", fontWeight: 800, fontSize: '1.2rem' }}>
                ⚠️ Waiting for Your Approval
              </h3>
              <p style={{ color: "#92400e", marginTop: '8px', marginBottom: '12px' }}>
                This ticket requires action from <strong>you ({ticket.category})</strong>.
              </p>

              <button
                onClick={() => setShowApprovalModal(true)}
                style={{
                  marginTop: '10px',
                  background: "#e98404",
                  color: "white",
                  borderRadius: "12px",
                  padding: "12px 24px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  boxShadow: "0 6px 18px rgba(233, 132, 4, 0.2)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#d97706";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#e98404";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Review & Take Action
              </button>
            </div>
          )}

          <div style={{
            marginTop: '4px',
            background: '#f8fafc',
            padding: '24px',
            borderRadius: '14px',
            border: '2px solid #e2e8f0',
            color: '#334155',
            lineHeight: 1.7,
            fontSize: '15px'
          }}>
            <strong style={{ display: 'block', marginBottom: '12px', fontSize: '16px', color: '#0f172a' }}>Description</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
            {renderAttachmentSummary()}
          </div>

          {/* Metadata Section */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginTop: '8px'
          }}>
            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '2px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>Created Date</div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatDate(ticket.createdAt)}</div>
            </div>
            {ticket.closedAt && (
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '2px solid #e2e8f0' }}>
                <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>Closed Date</div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatDate(ticket.closedAt)}</div>
              </div>
            )}
            {ticket.assignedTo && (
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '2px solid #e2e8f0' }}>
                <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>Assigned To</div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{ticket.assignedTo}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HISTORY TIMELINE */}
      <div style={{ maxWidth: '800px', margin: '3rem auto 4rem', padding: '0 1.5rem' }}>
        <h2 style={{ 
          fontSize: '2rem', 
          color: '#0f172a', 
          marginBottom: '2.5rem', 
          textAlign: 'center', 
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px'
        }}>
          <img src={HistoryIcon} alt="History" style={{ width: '28px', height: '28px' }} />
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
                  marginBottom: '20px',
                  padding: '24px',
                  background:
                    event.action === 'closed'
                      ? '#fee2e2'
                      : event.action === 'created'
                      ? '#fef3c7'
                      : '#f1f5f9',
                  borderRadius: '14px',
                  borderLeft: event.action === 'created' ? '4px solid #e98404' : event.action === 'closed' ? '4px solid #ef4444' : '4px solid #10b981',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                }}
              >
                <strong style={{ display: 'block', marginBottom: '10px', textTransform: 'capitalize', fontSize: '1.15rem', color: '#0f172a' }}>
                  {event.action === 'created' ? '✨ Ticket Created' :
                   event.action === 'closed' ? '🔒 Ticket Closed' :
                   event.action === 'reopend' ? '🔄 Ticket Reopened' : event.action}
                </strong>

                <small style={{ color: '#475569', fontWeight: 600, display: 'block', marginBottom: '12px' }}>
                  {formatDate(event.at)} by <strong>{event.by || "Unknown"}</strong>
                  {showOnBehalf && (
                    <>
                      {' '}on behalf of{' '}
                      <strong style={{ color: '#e98404' }}>
                        {ticket.onBehalf || ticket.userName}
                        {ticket.onBehalfEmail ? ` (${ticket.onBehalfEmail})` : ''}
                      </strong>
                    </>
                  )}
                </small>

                {isOpsFin && (event.subQuery || event.otherSubQueryText) && (
                  <div style={{ marginTop: '8px', fontSize: '13px', color: '#64748b' }}>
                    {event.subQuery && (
                      <div>
                        <span style={{ fontWeight: 700 }}>Sub Category:</span> {event.subQuery}
                      </div>
                    )}
                    {event.subQuery === 'Other' && event.otherSubQueryText && (
                      <div style={{ marginTop: '2px' }}>
                        <span style={{ fontWeight: 700 }}>Details:</span> {event.otherSubQueryText}
                      </div>
                    )}
                  </div>
                )}

                {event.reason && (
                  <div style={{ 
                    marginTop: '14px', 
                    padding: '14px', 
                    background: '#ffffff', 
                    borderRadius: '10px', 
                    border: '2px solid #e2e8f0',
                    fontSize: '14px'
                  }}>
                    <span style={{ fontWeight: 700 }}>Reason:</span> {event.reason}
                  </div>
                )}

                {renderHistoryAttachment(event)}
              </div>
            );
          })}

          <div style={{ 
            marginTop: '24px', 
            padding: '24px', 
            background: ticket.status === "Closed" ? 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)' : 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', 
            borderRadius: '14px',
            border: `2px solid ${ticket.status === "Closed" ? "#fecaca" : "#a7f3d0"}`,
            boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
            textAlign: 'center'
          }}>
            <strong style={{ fontSize: '1.3rem', color: ticket.status === "Closed" ? '#991b1b' : '#065f46', display: 'block' }}>
              Current Status: {ticket.status}
            </strong>
          </div>
        </div>
      </div>

      {/* APPROVAL MODAL */}
      {showApprovalModal && isCategoryHead && (
        <div className="overlay">
          <div className="modal-box" style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: '12px', fontWeight: 800, color: '#0f172a', fontSize: '1.75rem' }}>
              Approval Required
            </h2>
            <p style={{ color: "#64748b", marginBottom: '24px', fontSize: '15px' }}>
              You are the <strong style={{ color: '#002060' }}>Category Head</strong> for <strong>{ticket.category}</strong>.<br />
              Review the ticket details below before taking action.
            </p>

            <div style={{
              background: "#f8fafc",
              padding: "24px",
              borderRadius: "14px",
              textAlign: "left",
              marginBottom: "20px",
              border: "2px solid #e2e8f0"
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                📋 Ticket Summary
              </h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>Ticket #:</span> {ticket.ticketNumber}</p>
                <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>Created By:</span> {ticket.userName} ({ticket.userEmail})</p>
                <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>Category:</span> {ticket.category}</p>
                <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>Priority:</span> {ticket.priority}</p>
                <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>On Behalf:</span> {ticket.onBehalf || "Self"}</p>
                {ticket.onBehalfEmail && <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>On Behalf Email:</span> {ticket.onBehalfEmail}</p>}
                {ticket.deliveryEmail && <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>Delivery Email:</span> {ticket.deliveryEmail}</p>}
                <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>Created On:</span> {formatDate(ticket.createdAt)}</p>

                {ticket.category === 'Operational & Finance' && ticket.subQuery && (
                  <>
                    <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>Sub Category:</span> {ticket.subQuery}</p>
                    {ticket.subQuery === 'Other' && ticket.otherSubQueryText && (
                      <p style={{ margin: 0 }}><span style={{ fontWeight: 700, color: '#475569' }}>Sub Details:</span> {ticket.otherSubQueryText}</p>
                    )}
                  </>
                )}
              </div>

              {hasAttachment && (
                <div style={{ marginTop: '16px' }}>
                  {renderAttachmentSummary()}
                </div>
              )}

              <div style={{ marginTop: '20px' }}>
                <span style={{ fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Description:</span>
                <div style={{
                  background: "#ffffff",
                  padding: "16px",
                  borderRadius: "10px",
                  whiteSpace: "pre-wrap",
                  border: '2px solid #e2e8f0',
                  fontSize: '14px',
                  lineHeight: 1.6
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
              style={{ width: "100%", marginBottom: "16px" }}
            />

            <div style={{ display: "flex", gap: "14px", marginTop: "12px", justifyContent: "center", flexWrap: 'wrap' }}>
              <button
                onClick={handleApprove}
                disabled={approveLoading}
                className="btn-success"
                style={{ minWidth: "140px", fontSize: '15px' }}
              >
                {approveLoading ? "Approving..." : "✓ Approve"}
              </button>
              <button
                onClick={handleReject}
                disabled={rejectLoading}
                className="btn-danger"
                style={{ minWidth: "140px", fontSize: '15px' }}
              >
                {rejectLoading ? "Rejecting..." : "✕ Reject"}
              </button>
              <button
                onClick={() => { setShowApprovalModal(false); setAdminNote(''); }}
                className="btn-secondary"
                style={{ fontSize: '15px' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASSWORD POPUP */}
      {showPasswordPopup && (
        <div className="overlay">
          <div className="modal-box" style={{ maxWidth: "600px" }}>
            <h2 style={{ color: '#10b981', fontWeight: 800, fontSize: '1.75rem', marginBottom: '16px' }}>
              ✓ Password Reset Successful
            </h2>
            <p style={{ color: '#64748b', marginBottom: '24px' }}>
              The new temporary password generated for the target account is shown below. Please copy it and share as needed.
            </p>
            <div style={{
              padding: "20px",
              background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
              borderRadius: "12px",
              fontFamily: "monospace",
              fontSize: "20px",
              fontWeight: 700,
              color: '#002060',
              border: '2px solid #bae6fd',
              marginBottom: '24px',
              wordBreak: 'break-all'
            }}>
              {returnedPassword}
            </div>
            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center' }}>
              <button
                onClick={() => copyToClipboard(returnedPassword)}
                className="btn-primary"
              >
                📋 Copy to Clipboard
              </button>
              <button
                onClick={() => { setShowPasswordPopup(false); navigate('/', { state: { refresh: true } }); }}
                className="btn-success"
              >
                ✓ Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE MODALS */}
      {showReasonInput && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#0f172a', fontSize: '1.6rem', fontWeight: 800 }}>
              Close Ticket #{ticket.ticketNumber}
            </h3>
            <p style={{ color: '#64748b', marginBottom: '24px' }}>Please provide a reason for closing this ticket.</p>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Explain why this ticket is being closed..."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              autoFocus
            />
            {closeError && <div className="error-text">{closeError}</div>}
            <div style={{ marginTop: '28px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button onClick={handleSubmitReason} className="btn-danger" style={{ padding: '14px 32px' }}>
                Continue to Close
              </button>
              <button onClick={cancelClose} className="btn-secondary" style={{ padding: '14px 32px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#ef4444', fontSize: '1.75rem', fontWeight: 800 }}>
              ⚠️ Permanently Close Ticket?
            </h3>
            <p style={{ color: '#64748b', marginBottom: '32px', fontSize: '15px' }}>Are you sure you want to close this ticket?</p>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
              <button onClick={confirmCloseTicket} disabled={loading} className="btn-danger" style={{ padding: '16px 40px' }}>
                {loading ? 'Closing...' : 'Yes, Close It'}
              </button>
              <button onClick={cancelClose} className="btn-secondary" style={{ padding: '16px 40px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REOPEN MODALS */}
      {showreopenReasonInput && (
        <div className="overlay" onClick={cancelreopen}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#0f172a', fontSize: '1.6rem', fontWeight: 800 }}>
              Reopen Ticket #{ticket.ticketNumber}
            </h3>
            <p style={{ color: '#64748b', marginBottom: '24px' }}>Please explain why this ticket needs to be reopened.</p>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Why is this ticket being reopened?"
              value={reopenReason}
              onChange={(e) => setreopenReason(e.target.value)}
              autoFocus
            />
            {reopenError && <div className="error-text">{reopenError}</div>}
            <div style={{ marginTop: '28px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button onClick={handleSubmitreopenReason} className="btn-success" style={{ padding: '14px 32px' }}>
                Continue to Reopen
              </button>
              <button onClick={cancelreopen} className="btn-secondary" style={{ padding: '14px 32px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmreopenModal && (
        <div className="overlay" onClick={cancelreopen}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#10b981', fontSize: '1.75rem', fontWeight: 800 }}>
              🔄 Reopen This Ticket?
            </h3>
            <p style={{ color: '#64748b', marginBottom: '32px', fontSize: '15px' }}>The ticket will be reopened and require attention.</p>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
              <button onClick={confirmreopenTicket} disabled={loading} className="btn-success" style={{ padding: '16px 40px' }}>
                {loading ? 'Reopening...' : 'Yes, Reopen It'}
              </button>
              <button onClick={cancelreopen} className="btn-secondary" style={{ padding: '16px 40px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ATTACHMENT VIEWER MODAL */}
      {attachmentModalOpen && activeAttachment && (
        <div className="overlay" onClick={() => setAttachmentModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1100px' }}>
            <div className="att-viewer">
              <div className="att-toolbar">
                <div className="att-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <img src={AttachmentIcon} alt="Attachment" style={{ width: '20px', height: '20px' }} />
                  {activeAttachment.fileName || 'Attachment'}
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {attachmentList && attachmentList.length > 1 && (
                    <div style={{ fontSize: '13px', color: '#64748b', marginRight: '8px', fontWeight: 600 }}>
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
                    <p style={{ marginBottom: '16px', color: '#64748b' }}>PDF will be downloaded when you click the button.</p>
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
                    <p style={{ marginBottom: '16px', color: '#64748b' }}>This file type cannot be previewed inline.</p>
                    <a
                      href={activeAttachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="att-btn"
                      style={{ textDecoration: 'none' }}
                    >
                      Open attachment
                    </a>
                  </div>
                )}
              </div>

              {attachmentList && attachmentList.length > 1 && (
                <div className="att-list" style={{ marginTop: '12px' }}>
                  {attachmentList.map((a, idx) => {
                    const previewIsImage = isImageType(a.fileType);
                    return (
                      <div key={`${a.fileName}-${idx}`} className="att-thumb" onClick={() => setActiveAttachment(a)} title={a.fileName}>
                        {previewIsImage ? (
                          <img src={a.fileUrl} alt={a.fileName} />
                        ) : (
                          <div style={{ width: '60px', height: '60px', display:'flex', alignItems:'center', justifyContent:'center', background:'#f3f4f6', borderRadius:'8px', fontSize:'12px', padding:'6px', fontWeight: 700, color: '#002060' }}>
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
    </div>
  );
}

export default TicketDetails;