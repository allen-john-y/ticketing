// IncidentDetails.js - Redesigned to match Home.js styling
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

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

  // Chat state
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [canChat, setCanChat] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(true);

  const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'];

  const currentUserEmail = accounts?.[0]?.username || '';
  const currentUserName = accounts?.[0]?.name || '';

  // Check authority
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

  // Check if user can chat
  const checkCanChat = (incidentData) => {
    if (!incidentData || !currentUserEmail) return false;
    const raisedEmail = incidentData.raisedBy?.mail?.toLowerCase();
    const assignedEmail = incidentData.assignedMember?.memberEmail?.toLowerCase();
    const userEmail = currentUserEmail.toLowerCase();
    return userEmail === raisedEmail || userEmail === assignedEmail;
  };

  // Fetch chat messages
  const fetchMessages = async () => {
    if (!id) return;
    setChatLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/incidents/${id}/messages`);
      const sortedMessages = (res.data || []).sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
      setMessages(sortedMessages);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setChatLoading(false);
    }
  };

  // Load image preview
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
        setImagePreviewUrl(null);
      }
    };
    loadImage();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [activeAttachment]);

  // Fetch incident data
  useEffect(() => {
    const fetchIncident = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(`${BACKEND}/api/incidents/${id}`);
        setIncident(res.data);
        setSelectedStatus(res.data.status || '');
        
        const canUserChat = checkCanChat(res.data);
        setCanChat(canUserChat);
        
        const list = [];
        if (res.data.attachments && Array.isArray(res.data.attachments)) {
          res.data.attachments.forEach(a => {
            const driveId = a.driveId || a.parentReference?.driveId || null;
            const driveItemId = a.id || a.fileId || null;
            const proxyUrl = driveItemId 
              ? `${BACKEND}/attachments/${driveItemId}${driveId ? `?driveId=${encodeURIComponent(driveId)}` : ''}` 
              : (a.fileUrl || a.url || a.path || null);
            list.push({ 
              fileName: a.fileName || a.originalname || '', 
              fileType: a.fileType || a.mimetype || '', 
              fileUrl: proxyUrl, 
              id: driveItemId, 
              driveId: driveId || null 
            });
          });
        }
        setAttachmentList(list);
        
        if (canUserChat) {
          await fetchMessages();
        }
      } catch (err) {
        console.error('Error fetching incident:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchIncident();
  }, [id, currentUserEmail]);

  // Poll for new messages
  useEffect(() => {
    if (!canChat) return;
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [canChat, id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current && messages.length > 0) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { 
      day: 'numeric', month: 'short', year: 'numeric', 
      hour: '2-digit', minute: '2-digit', hour12: true 
    });
  };

  const formatMessageTime = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const isImageType = (type) => type && type.startsWith && type.startsWith('image/');
  const isPdfType = (type, url) => (type && type === 'application/pdf') || (url && url.toLowerCase().endsWith('.pdf'));

  const openAttachmentViewer = (attachment) => {
    if (!attachment) return;
    if (isPdfType(attachment.fileType, attachment.fileUrl)) { 
      downloadAttachment(attachment); 
      return; 
    }
    if (!isImageType(attachment.fileType)) { 
      window.open(attachment.fileUrl, '_blank', 'noopener'); 
      return; 
    }
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
    } catch (err) { 
      window.open(attachment.fileUrl, '_blank', 'noopener'); 
    }
  };

  const downloadAllAttachments = async () => {
    if (!attachmentList || attachmentList.length === 0) return;
    const downloadable = attachmentList.filter(a => a && a.id);
    if (!downloadable.length) { 
      alert('No downloadable attachments available.'); 
      return; 
    }
    const ids = downloadable.map(a => a.id).join(',');
    const driveIds = downloadable.map(a => a.driveId || '').join(',');
    const url = `${BACKEND}/attachments/zip?ids=${encodeURIComponent(ids)}${driveIds ? `&driveIds=${encodeURIComponent(driveIds)}` : ''}`;
    const a = document.createElement('a');
    a.href = url; 
    a.download = `attachments-${incident?.incidentNumber || id}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const handleStatusUpdate = async () => {
    if (!selectedStatus || selectedStatus === incident.status) {
      setStatusUpdateError('Please select a different status to update.');
      return;
    }
    setStatusUpdateLoading(true);
    setStatusUpdateError('');
    setStatusUpdateSuccess('');
    try {
      await axios.patch(`${BACKEND}/api/incidents/${id}`, {
        status: selectedStatus,
        notes: statusNote,
        updatedBy: { 
          id: accounts[0]?.localAccountId, 
          name: accounts[0]?.name, 
          mail: accounts[0]?.username 
        }
      });
      setIncident(prev => ({ ...prev, status: selectedStatus }));
      setStatusNote('');
      setStatusUpdateSuccess(`Status updated to "${selectedStatus}". Notifications sent.`);
      setTimeout(() => setStatusUpdateSuccess(''), 5000);
    } catch (err) {
      setStatusUpdateError('Failed to update: ' + (err?.response?.data?.message || err.message || 'Unknown error'));
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sendingMessage) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setSendingMessage(true);

    try {
      const messageData = {
        message: messageText,
        sender: {
          id: accounts[0]?.localAccountId || '',
          name: currentUserName,
          email: currentUserEmail,
        },
      };

      const res = await axios.post(`${BACKEND}/api/incidents/${id}/messages`, messageData);
      setMessages(prev => [...prev, res.data]);
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to send message. Please try again.');
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

  const isCurrentUser = (email) => {
    return email?.toLowerCase() === currentUserEmail?.toLowerCase();
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
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    @keyframes slideUp {
      from { transform: translateY(16px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .id-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Hero Section */
    .id-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .id-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .id-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .id-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .id-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .id-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(24px, 3vw, 32px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
      display: flex; align-items: center; gap: 16px;
    }
    .id-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .id-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .id-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    .id-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 24px; display: inline-flex;
      align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .id-back-btn:hover { color: var(--orange); }

    /* Layout */
    .id-layout {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 24px;
    }

    /* Main Card */
    .id-main-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      animation: fadeUp 0.4s ease both;
    }

    .id-card-header {
      padding: 28px 32px;
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
    }

    .id-title-row {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 12px;
    }
    .id-incident-number {
      font-family: 'Sora', sans-serif;
      font-size: 24px; font-weight: 800;
      color: var(--navy); letter-spacing: -0.02em;
    }
    .id-incident-title {
      font-family: 'Sora', sans-serif;
      font-size: 20px; font-weight: 700;
      color: var(--text); margin-bottom: 8px;
    }

    .id-pills {
      display: flex; gap: 10px; flex-wrap: wrap;
      margin-top: 12px;
    }
    .id-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 30px;
      font-size: 12px; font-weight: 700; letter-spacing: 0.03em;
      border: 1.5px solid;
    }
    .id-pill-dot {
      width: 6px; height: 6px; border-radius: 50%;
    }

    .id-section {
      padding: 28px 32px;
      border-bottom: 1.5px solid var(--border);
    }
    .id-section:last-child { border-bottom: none; }

    .id-section-title {
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 16px;
      letter-spacing: 0.02em;
      display: flex; align-items: center; gap: 8px;
    }

    .id-description {
      font-size: 15px; color: var(--text);
      line-height: 1.7; white-space: pre-wrap;
    }

    .id-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1px;
      background: var(--border);
    }
    .id-meta-item {
      background: var(--white);
      padding: 20px 24px;
    }
    .id-meta-key {
      font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--muted); margin-bottom: 6px;
    }
    .id-meta-value {
      font-size: 15px; font-weight: 600;
      color: var(--text);
    }
    .id-meta-sub {
      font-size: 13px; color: var(--muted);
      margin-top: 4px;
    }

    /* Sidebar Cards */
    .id-sidebar {
      display: flex; flex-direction: column; gap: 20px;
    }

    .id-sidebar-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .id-sidebar-header {
      padding: 20px 24px;
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
    }
    .id-sidebar-header-title {
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      letter-spacing: 0.03em;
    }

    .id-sidebar-body {
      padding: 24px;
    }

    .id-info-row {
      display: flex; flex-direction: column; gap: 6px;
      margin-bottom: 20px;
    }
    .id-info-label {
      font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--muted);
    }
    .id-info-value {
      font-size: 15px; font-weight: 600;
      color: var(--text);
    }

    /* Status Update Card */
    .id-status-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
    }

    .id-status-header {
      padding: 18px 24px;
      border-bottom: 1.5px solid var(--border);
      background: #fef2f2;
    }
    .id-status-header-title {
      font-family: 'Sora', sans-serif;
      font-size: 12px; font-weight: 700;
      color: #991b1b;
      letter-spacing: 0.04em;
      display: flex; align-items: center; gap: 8px;
    }

    .id-status-body {
      padding: 24px;
    }

    .id-status-flow {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px;
      background: var(--bg);
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .id-status-current, .id-status-new {
      flex: 1;
    }
    .id-status-arrow {
      color: var(--muted); font-size: 18px;
    }

    .id-select {
      width: 100%;
      padding: 12px 16px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      cursor: pointer;
      margin-bottom: 16px;
    }
    .id-select:focus {
      outline: none;
      border-color: var(--navy);
    }

    .id-textarea {
      width: 100%;
      padding: 12px 16px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      resize: vertical;
      min-height: 80px;
      margin-bottom: 16px;
    }
    .id-textarea:focus {
      outline: none;
      border-color: var(--navy);
    }

    .id-btn {
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 14px; font-weight: 700;
      font-family: 'Sora', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      display: inline-flex; align-items: center; justify-content: center;
      gap: 8px;
    }
    .id-btn-primary {
      background: #ef4444;
      color: white;
    }
    .id-btn-primary:hover:not(:disabled) {
      background: #dc2626;
      transform: translateY(-2px);
    }
    .id-btn-secondary {
      background: var(--white);
      border: 1.5px solid var(--border);
      color: var(--text);
    }
    .id-btn-secondary:hover {
      border-color: var(--navy);
    }
    .id-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .id-success-message {
      padding: 12px 16px;
      background: #d1fae5;
      border: 1.5px solid #10b981;
      border-radius: 12px;
      color: #065f46;
      font-size: 13px; font-weight: 500;
      margin-bottom: 16px;
    }

    .id-error-message {
      padding: 12px 16px;
      background: #fee2e2;
      border: 1.5px solid #ef4444;
      border-radius: 12px;
      color: #991b1b;
      font-size: 13px; font-weight: 500;
      margin-bottom: 16px;
    }

    /* Chat Section */
    .id-chat-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      margin-top: 24px;
    }

    .id-chat-header {
      padding: 18px 24px;
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
      display: flex; align-items: center; justify-content: space-between;
      cursor: pointer;
    }
    .id-chat-header-left {
      display: flex; align-items: center; gap: 10px;
    }
    .id-chat-title {
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      letter-spacing: 0.03em;
    }
    .id-chat-badge {
      background: var(--navy);
      color: white;
      font-size: 11px; font-weight: 700;
      padding: 2px 10px; border-radius: 20px;
    }

    .id-chat-messages {
      padding: 24px;
      max-height: 350px;
      overflow-y: auto;
      display: flex; flex-direction: column; gap: 16px;
    }

    .id-message {
      display: flex; gap: 12px;
    }
    .id-message.own {
      flex-direction: row-reverse;
    }
    .id-message-avatar {
      width: 36px; height: 36px; border-radius: 12px;
      background: var(--navy); color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700;
      flex-shrink: 0;
    }
    .id-message.own .id-message-avatar {
      background: #ef4444;
    }

    .id-message-content {
      max-width: 70%;
    }
    .id-message-bubble {
      padding: 12px 16px;
      background: var(--bg);
      border-radius: 16px;
      border-top-left-radius: 4px;
      font-size: 14px; color: var(--text);
      line-height: 1.5;
    }
    .id-message.own .id-message-bubble {
      background: var(--navy);
      color: white;
      border-top-left-radius: 16px;
      border-top-right-radius: 4px;
    }
    .id-message-meta {
      display: flex; align-items: center; gap: 8px;
      margin-top: 4px; padding: 0 6px;
    }
    .id-message-sender {
      font-size: 12px; font-weight: 600;
      color: var(--muted);
    }
    .id-message.own .id-message-sender {
      color: var(--navy);
    }
    .id-message-time {
      font-size: 11px; color: var(--muted);
    }

    .id-chat-input-area {
      padding: 20px 24px;
      border-top: 1.5px solid var(--border);
      display: flex; gap: 12px;
    }
    .id-chat-input {
      flex: 1;
      padding: 12px 16px;
      border: 1.5px solid var(--border);
      border-radius: 24px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      resize: none;
    }
    .id-chat-input:focus {
      outline: none;
      border-color: var(--navy);
    }
    .id-chat-send {
      width: 44px; height: 44px;
      border-radius: 50%;
      background: var(--navy);
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .id-chat-send:hover:not(:disabled) {
      background: var(--navy2);
    }

    .id-chat-empty, .id-chat-no-access {
      text-align: center; padding: 40px 24px;
      color: var(--muted); font-size: 14px;
    }

    /* Timeline */
    .id-timeline {
      margin-top: 24px;
    }
    .id-timeline-header {
      padding: 18px 24px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px 18px 0 0;
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
    }
    .id-timeline-list {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-top: none;
      border-radius: 0 0 18px 18px;
      overflow: hidden;
    }
    .id-timeline-item {
      padding: 20px 24px;
      border-bottom: 1.5px solid var(--border);
      display: flex; gap: 16px;
    }
    .id-timeline-item:last-child { border-bottom: none; }
    .id-timeline-icon {
      width: 8px; height: 8px; border-radius: 50%;
      margin-top: 6px; flex-shrink: 0;
    }
    .id-timeline-content {
      flex: 1;
    }
    .id-timeline-action {
      font-size: 14px; font-weight: 700;
      color: var(--text); margin-bottom: 4px;
    }
    .id-timeline-meta {
      font-size: 12px; color: var(--muted);
      margin-bottom: 8px;
    }
    .id-timeline-note {
      padding: 10px 14px;
      background: var(--bg);
      border-radius: 10px;
      font-size: 13px; color: var(--text);
      margin-top: 8px;
    }

    /* Attachments */
    .id-attachments {
      display: flex; flex-wrap: wrap; gap: 10px;
      margin-top: 16px;
    }
    .id-attachment-item {
      padding: 10px 16px;
      background: var(--bg);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      display: flex; align-items: center; gap: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .id-attachment-item:hover {
      border-color: var(--navy);
      background: var(--white);
    }

    /* Modal */
    .id-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex; justify-content: center; align-items: center;
      z-index: 9999;
      padding: 24px;
    }
    .id-modal {
      background: var(--white);
      border-radius: 20px;
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      animation: slideUp 0.2s;
    }
    .id-modal-header {
      padding: 24px 28px;
      border-bottom: 1.5px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .id-modal-title {
      font-family: 'Sora', sans-serif;
      font-size: 16px; font-weight: 700;
      color: var(--navy);
    }
    .id-modal-close {
      background: none; border: none;
      font-size: 20px; cursor: pointer;
      color: var(--muted);
    }
    .id-modal-body {
      padding: 28px;
      overflow-y: auto;
      max-height: calc(90vh - 80px);
    }
    .id-modal-image {
      max-width: 100%; max-height: 60vh;
      object-fit: contain; border-radius: 12px;
    }

    /* Loading */
    .id-loading {
      min-height: 100vh; background: var(--bg);
      display: flex; align-items: center; justify-content: center;
    }
    .id-spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      animation: spin 0.9s linear infinite;
    }

    .skel {
      background: #e2e8f0;
      border-radius: 8px;
      animation: pulse 1.6s ease-in-out infinite;
    }

    @media (max-width: 1024px) {
      .id-layout { grid-template-columns: 1fr; }
      .id-meta-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 768px) {
      .id-hero { padding: 40px 24px; }
      .id-content { padding: 24px 20px 40px; }
      .id-message-content { max-width: 85%; }
    }
  `;

  // Loading state
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

  // Not found
  if (!incident) {
    return (
      <div className="id-page">
        <style>{sharedCSS}</style>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 48 }}>🚫</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#64748b' }}>Incident not found</div>
          <button className="id-btn id-btn-secondary" onClick={() => navigate('/tickets')}>
            ← Back to Tickets
          </button>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyles(incident.status);
  const priorityStyle = getPriorityStyles(incident.priority);
  const historyEvents = incident.history?.length > 0 
    ? incident.history 
    : [{ action: 'created', by: incident.raisedBy?.name || 'Unknown', at: incident.createdAt }];

  return (
    <div className="id-page">
      <style>{sharedCSS}</style>

      {/* Hero Section */}
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

      {/* Content */}
      <div className="id-content">
        <button className="id-back-btn" onClick={() => navigate('/tickets')}>
          ← Back to Tickets
        </button>

        <div className="id-layout">
          {/* Main Column */}
          <div>
            <div className="id-main-card">
              {/* Header */}
              <div className="id-card-header">
                <div className="id-title-row">
                  <div>
                    <div className="id-incident-title">{incident.category?.name || 'Incident'}</div>
                    <div style={{ fontSize: 14, color: '#64748b' }}>
                      Created {formatDate(incident.createdAt)}
                    </div>
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

              {/* Description */}
              <div className="id-section">
                <div className="id-section-title">
                  <span>📝</span> Description
                </div>
                <div className="id-description">{incident.description}</div>
                
                {/* Attachments */}
                {attachmentList.length > 0 && (
                  <div className="id-attachments">
                    {attachmentList.map((att, idx) => (
                      <div 
                        key={idx} 
                        className="id-attachment-item"
                        onClick={() => openAttachmentViewer(att)}
                      >
                        <span>📎</span>
                        <span>{att.fileName}</span>
                      </div>
                    ))}
                    {attachmentList.length > 1 && (
                      <button 
                        className="id-btn id-btn-secondary" 
                        style={{ padding: '10px 16px' }}
                        onClick={downloadAllAttachments}
                      >
                        Download All
                      </button>
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
                {incident.assignedMember?.memberName && (
                  <div className="id-meta-item">
                    <div className="id-meta-key">Assigned To</div>
                    <div className="id-meta-value">{incident.assignedMember.memberName}</div>
                    <div className="id-meta-sub">{incident.assignedMember.memberEmail}</div>
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
            </div>

            {/* Chat Section */}
            <div className="id-chat-card">
              <div className="id-chat-header" onClick={() => setChatExpanded(!chatExpanded)}>
                <div className="id-chat-header-left">
                  <span>💬</span>
                  <span className="id-chat-title">Incident Conversation</span>
                  {messages.length > 0 && (
                    <span className="id-chat-badge">{messages.length}</span>
                  )}
                </div>
                <span style={{ fontSize: 12, transition: 'transform 0.2s', transform: chatExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
              </div>

              {chatExpanded && (
                <>
                  {!canChat ? (
                    <div className="id-chat-no-access">
                      <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>🔒</span>
                      Only the person who raised this incident and the assigned person can chat.
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
                                <div className="id-message-avatar">
                                  {msg.sender?.name?.charAt(0) || '?'}
                                </div>
                                <div className="id-message-content">
                                  <div className="id-message-bubble">{msg.message}</div>
                                  <div className="id-message-meta">
                                    {!isOwn && <span className="id-message-sender">{msg.sender?.name}</span>}
                                    <span className="id-message-time">{formatMessageTime(msg.createdAt)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <form className="id-chat-input-area" onSubmit={handleSendMessage}>
                        <textarea
                          className="id-chat-input"
                          placeholder="Type your message..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage(e);
                            }
                          }}
                          rows={1}
                        />
                        <button
                          type="submit"
                          className="id-chat-send"
                          disabled={!newMessage.trim() || sendingMessage}
                        >
                          {sendingMessage ? '⋯' : '➤'}
                        </button>
                      </form>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Timeline */}
            <div className="id-timeline">
              <div className="id-timeline-header">
                📋 Incident Timeline
              </div>
              <div className="id-timeline-list">
                {historyEvents.map((event, idx) => {
                  const isCreated = event.action === 'created';
                  const isResolved = event.action === 'resolved';
                  const isClosed = event.action === 'closed';
                  const iconColor = isCreated ? '#ef4444' : isResolved ? '#10b981' : isClosed ? '#9ca3af' : '#3b82f6';
                  
                  return (
                    <div key={idx} className="id-timeline-item">
                      <div className="id-timeline-icon" style={{ background: iconColor }} />
                      <div className="id-timeline-content">
                        <div className="id-timeline-action">
                          {event.action === 'created' && '🚨 Incident Created'}
                          {event.action === 'status_updated' && '↺ Status Updated'}
                          {event.action === 'resolved' && '✓ Incident Resolved'}
                          {event.action === 'closed' && '✕ Incident Closed'}
                          {event.action === 'cancelled' && '⊘ Incident Cancelled'}
                          {!['created', 'status_updated', 'resolved', 'closed', 'cancelled'].includes(event.action) && event.action}
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
                })}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="id-sidebar">
            {/* Info Card */}
            <div className="id-sidebar-card">
              <div className="id-sidebar-header">
                <span className="id-sidebar-header-title">ℹ️ Incident Information</span>
              </div>
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
                {incident.subCategory && (
                  <div className="id-info-row">
                    <span className="id-info-label">Sub-Category</span>
                    <span className="id-info-value">{incident.subCategory}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Update Card (Admin only) */}
            {authority === 'admin' && (
              <div className="id-status-card">
                <div className="id-status-header">
                  <span className="id-status-header-title">
                    <span>🔄</span> Update Status
                  </span>
                </div>
                <div className="id-status-body">
                  <div className="id-status-flow">
                    <div className="id-status-current">
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>CURRENT</div>
                      <span className="id-pill" style={{ background: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}>
                        {incident.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <span className="id-status-arrow">→</span>
                    <div className="id-status-new">
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>CHANGE TO</div>
                      <span className="id-pill" style={{ 
                        background: getStatusStyles(selectedStatus).bg, 
                        color: getStatusStyles(selectedStatus).color,
                        borderColor: getStatusStyles(selectedStatus).border
                      }}>
                        {selectedStatus !== incident.status ? selectedStatus.replace('_', ' ').toUpperCase() : '—'}
                      </span>
                    </div>
                  </div>

                  <select
                    className="id-select"
                    value={selectedStatus}
                    onChange={(e) => {
                      setSelectedStatus(e.target.value);
                      setStatusUpdateError('');
                      setStatusUpdateSuccess('');
                    }}
                  >
                    {TICKET_STATUSES.map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>
                    ))}
                  </select>

                  <textarea
                    className="id-textarea"
                    placeholder="Add update notes (optional)..."
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                  />

                  {statusUpdateSuccess && (
                    <div className="id-success-message">
                      ✓ {statusUpdateSuccess}
                    </div>
                  )}
                  {statusUpdateError && (
                    <div className="id-error-message">
                      ⚠ {statusUpdateError}
                    </div>
                  )}

                  <button
                    className="id-btn id-btn-primary"
                    style={{ width: '100%' }}
                    onClick={handleStatusUpdate}
                    disabled={statusUpdateLoading || !selectedStatus || selectedStatus === incident.status}
                  >
                    {statusUpdateLoading ? (
                      <>
                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                        Updating...
                      </>
                    ) : (
                      'Update & Notify'
                    )}
                  </button>

                  <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#64748b' }}>
                    ✉️ Notification will be sent to requester
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Attachment Modal */}
      {attachmentModalOpen && activeAttachment && (
        <div className="id-modal-overlay" onClick={() => setAttachmentModalOpen(false)}>
          <div className="id-modal" onClick={e => e.stopPropagation()}>
            <div className="id-modal-header">
              <span className="id-modal-title">{activeAttachment.fileName}</span>
              <button className="id-modal-close" onClick={() => setAttachmentModalOpen(false)}>✕</button>
            </div>
            <div className="id-modal-body">
              {isImageType(activeAttachment.fileType) ? (
                <img src={imagePreviewUrl} alt={activeAttachment.fileName} className="id-modal-image" />
              ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ marginBottom: 20, color: '#64748b' }}>This file type cannot be previewed</div>
                  <button 
                    className="id-btn id-btn-primary"
                    onClick={() => downloadAttachment(activeAttachment)}
                  >
                    Download File
                  </button>
                </div>
              )}
              
              {/* Thumbnail list for multiple attachments */}
              {attachmentList.length > 1 && (
                <div style={{ display: 'flex', gap: 10, marginTop: 24, overflowX: 'auto', paddingBottom: 8 }}>
                  {attachmentList.map((att, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 16px',
                        background: att.id === activeAttachment.id ? '#002060' : '#f5f7fa',
                        color: att.id === activeAttachment.id ? 'white' : '#0f172a',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontSize: 13,
                        whiteSpace: 'nowrap'
                      }}
                      onClick={() => setActiveAttachment(att)}
                    >
                      {att.fileName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IncidentDetails;