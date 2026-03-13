import { useEffect, useState, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import attachmentIcon from './attachment.jpg';

function PasswordPopup({ password, onClose }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(password); setCopied(true); };
  return (
    <div className="ct-overlay">
      <div className="ct-modal">
        <div className="ct-modal-title">Password reset</div>
        <div className="ct-modal-sub">Your new temporary password is shown below.</div>
        <div className="ct-password-box">{password}</div>
        {copied && <div style={{ fontSize: 12, color: '#10b981', marginBottom: 12 }}>Copied to clipboard</div>}
        <div className="ct-modal-actions">
          <button className="ct-btn ct-btn-md ct-btn-secondary" onClick={handleCopy} type="button">Copy</button>
          <button className="ct-btn ct-btn-md ct-btn-primary" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}

function CreateTicket() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const backendBase = process.env.REACT_APP_BACKEND_URL;

  const [formData, setFormData] = useState({
    category: '', description: '', priority: 'Medium',
    onBehalf: 'Self', onBehalfEmail: '', alternativeEmail: '',
    subQuery: '', otherSubQueryText: '', subCategory: '',
  });

  const [categoriesConfig, setCategoriesConfig] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [selectedCategoryConfig, setSelectedCategoryConfig] = useState(null);
  const [otherSubCategoryText, setOtherSubCategoryText] = useState('');

  const [dynamicOnBehalfSelection, setDynamicOnBehalfSelection] = useState('Self');
  const [dynamicOnBehalfEmail, setDynamicOnBehalfEmail] = useState('');
  const [dynamicOnBehalfSearchResults, setDynamicOnBehalfSearchResults] = useState([]);
  const [dynamicOnBehalfSearching, setDynamicOnBehalfSearching] = useState(false);
  const [dynamicOnBehalfSelectedUser, setDynamicOnBehalfSelectedUser] = useState(null);

  const [attachments, setAttachments] = useState([]);
  const MAX_FILES = 5;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/png','image/jpeg','image/jpg','image/gif','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','application/zip'];

  const [loading, setLoading] = useState(false);
  const [newPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });
  const [createdTicketId, setCreatedTicketId] = useState(null);

  const [displayName, setDisplayName] = useState(accounts?.[0]?.name || '');
  const [displayEmail, setDisplayEmail] = useState(accounts?.[0]?.username || '');
  const [, setProfilePhoto] = useState(null);

  const [verifyStatus, setVerifyStatus] = useState('idle');
  const [verifiedName, setVerifiedName] = useState('');
  const [verifyError, setVerifyError] = useState('');

  const [isDeviceAdmin, setIsDeviceAdmin] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);
  const attachmentsRef = useRef(attachments);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  useEffect(() => { return () => { attachmentsRef.current.forEach(a => { if (a.preview) try { URL.revokeObjectURL(a.preview); } catch (e) {} }); }; }, []);

  useEffect(() => {
    let mounted = true;
    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const tokenResp = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });
        const response = await axios.get(`${backendBase}/api/categories`, { headers: { Authorization: `Bearer ${tokenResp.accessToken}` } });
        if (mounted && Array.isArray(response.data)) setCategoriesConfig(response.data);
      } catch (err) { console.error('Failed to fetch categories:', err); }
      finally { if (mounted) setLoadingCategories(false); }
    };
    if (accounts && accounts[0]) fetchCategories();
    return () => { mounted = false; };
  }, [instance, accounts, backendBase]);

  useEffect(() => {
    let mounted = true;
    const fetchUser = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResp = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });
        const resp = await axios.get('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${tokenResp.accessToken}` } });
        if (!mounted) return;
        setDisplayName(resp.data.displayName || accounts[0]?.name || '');
        setDisplayEmail((resp.data.mail && resp.data.mail.trim()) || (resp.data.userPrincipalName && resp.data.userPrincipalName.trim()) || accounts[0]?.username || '');
        try {
          const photoRes = await axios.get('https://graph.microsoft.com/v1.0/me/photo/$value', { headers: { Authorization: `Bearer ${tokenResp.accessToken}` }, responseType: 'arraybuffer' });
          const u8 = new Uint8Array(photoRes.data);
          let binary = '';
          for (let i = 0; i < u8.length; i += 0x8000) binary += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          const contentType = (photoRes.headers && photoRes.headers['content-type']) || 'image/jpeg';
          setProfilePhoto(`data:${contentType};base64,${btoa(binary)}`);
        } catch (_) {}
      } catch (err) { console.debug('Could not fetch user profile:', err?.message || err); }
    };
    fetchUser();
    return () => { mounted = false; };
  }, [instance, accounts, setProfilePhoto]);

  useEffect(() => {
    if (!accounts || !accounts[0]) return;
    const fetchGroups = async () => {
      setGroupsLoading(true);
      try {
        const tokenResp = await instance.acquireTokenSilent({ scopes: ['GroupMember.Read.All','User.Read'], account: accounts[0] });
        const res = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', { headers: { Authorization: `Bearer ${tokenResp.accessToken}` } });
        const groups = (res.data?.value || []).map(g => (g.displayName || '').toString());
        setIsDeviceAdmin(groups.some(name => name === process.env.REACT_APP_DEVICE_ADMIN_GROUP1_NAME || name === process.env.REACT_APP_DEVICE_ADMIN_GROUP2_NAME));
      } catch (err) { console.error('Error fetching groups:', err?.message || err); }
      finally { setGroupsLoading(false); }
    };
    fetchGroups();
  }, [instance, accounts]);

  useEffect(() => {
    if (formData.category && categoriesConfig.length > 0) {
      setSelectedCategoryConfig(categoriesConfig.find(c => c.name === formData.category) || null);
    } else { setSelectedCategoryConfig(null); }
  }, [formData.category, categoriesConfig]);

  const handleDynamicOnBehalfSearch = async (searchText) => {
    if (!searchText || searchText.trim().length < 2) { setDynamicOnBehalfSearchResults([]); return; }
    setDynamicOnBehalfSearching(true);
    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read.All'], account: accounts[0] });
      const response = await axios.get(`https://graph.microsoft.com/v1.0/users?$filter=startswith(mail,'${searchText}') or startswith(displayName,'${searchText}') or startswith(userPrincipalName,'${searchText}')&$top=5`, { headers: { Authorization: `Bearer ${token.accessToken}` } });
      setDynamicOnBehalfSearchResults(response.data.value || []);
    } catch (err) { setDynamicOnBehalfSearchResults([]); }
    finally { setDynamicOnBehalfSearching(false); }
  };

  const handleSelectDynamicOnBehalfUser = (user) => {
    setDynamicOnBehalfSelectedUser(user);
    setDynamicOnBehalfEmail(user.mail || user.userPrincipalName);
    setDynamicOnBehalfSearchResults([]);
  };

  const handleVerifyOther = async () => {
    const email = (formData.onBehalfEmail || '').trim();
    setVerifyError(''); setVerifiedName(''); setVerifyStatus('idle');
    if (!email) { setVerifyError("Please enter the target user's company email to verify."); return; }
    setVerifyStatus('verifying');
    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });
      const res = await axios.post(`${backendBase}/verify-user`, { email }, { headers: { Authorization: `Bearer ${token.accessToken}` } });
      if (res.data && res.data.exists) {
        setVerifyStatus('verified');
        setVerifiedName(res.data.displayName || res.data.mail || email);
        setFormData(prev => ({ ...prev, onBehalfEmail: res.data.mail || email }));
      } else { setVerifyStatus('notfound'); setVerifyError('User not found in Azure AD.'); }
    } catch (err) {
      setVerifyStatus('error');
      setVerifyError(err?.response?.data?.message || err.message || 'Verification failed');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCreatedTicketId(null);

    if (formData.category === 'Admin Access' && isDeviceAdmin) {
      setModal({ open: true, title: 'Cannot create request', message: 'You already have admin access to the device.', type: 'error' });
      setLoading(false); return;
    }

    if (selectedCategoryConfig?.features?.subCategories?.enabled) {
      if (selectedCategoryConfig.features.subCategories.required && !formData.subCategory) {
        setModal({ open: true, title: 'Validation', message: 'Please select a sub-category.', type: 'error' });
        setLoading(false); return;
      }
      if (formData.subCategory === 'Other' && !otherSubCategoryText.trim()) {
        setModal({ open: true, title: 'Validation', message: 'Please describe the issue for Other sub-category.', type: 'error' });
        setLoading(false); return;
      }
    }

    if (selectedCategoryConfig?.features?.onBehalf?.enabled && selectedCategoryConfig?.type !== 'PASSWORD_RESET') {
      if (selectedCategoryConfig.features.onBehalf.required && !dynamicOnBehalfSelection) {
        setModal({ open: true, title: 'Validation', message: 'Please select who this ticket is for.', type: 'error' });
        setLoading(false); return;
      }
      if (dynamicOnBehalfSelection === 'Other' && !dynamicOnBehalfSelectedUser) {
        setModal({ open: true, title: 'Validation', message: 'Please search and select a user.', type: 'error' });
        setLoading(false); return;
      }
    }

    if (selectedCategoryConfig?.features?.attachments?.enabled && selectedCategoryConfig.features.attachments.required && attachments.length === 0) {
      setModal({ open: true, title: 'Validation', message: 'Please attach at least one file for this category.', type: 'error' });
      setLoading(false); return;
    }

    if (selectedCategoryConfig?.type === 'PASSWORD_RESET' && formData.onBehalf === 'Other') {
      if (!formData.onBehalfEmail.trim()) { setModal({ open: true, title: 'Validation', message: "Please enter the company email of the person.", type: 'error' }); setLoading(false); return; }
      if (verifyStatus !== 'verified') { setModal({ open: true, title: 'Validation', message: "Please verify the target user's email first.", type: 'error' }); setLoading(false); return; }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!formData.alternativeEmail.trim() || !emailRegex.test(formData.alternativeEmail)) {
        setModal({ open: true, title: 'Validation', message: 'Please provide a valid alternative email.', type: 'error' }); setLoading(false); return;
      }
    }

    if (selectedCategoryConfig?.type === 'PASSWORD_RESET' && formData.onBehalf === 'Self') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!formData.alternativeEmail.trim() || !emailRegex.test(formData.alternativeEmail)) {
        setModal({ open: true, title: 'Validation', message: 'Please provide a valid alternative email.', type: 'error' }); setLoading(false); return;
      }
    }

    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });
      let latestName = displayName, latestEmail = displayEmail;
      try {
        const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${token.accessToken}` } });
        latestName = userRes.data.displayName || latestName || 'User';
        latestEmail = (userRes.data.mail && userRes.data.mail.trim()) || (userRes.data.userPrincipalName && userRes.data.userPrincipalName.trim()) || latestEmail || '';
      } catch (_) {}

      const isPasswordReset = selectedCategoryConfig?.type === 'PASSWORD_RESET';
      const normalizeServerResp = (sd, file) => ({ fileName: (sd||{}).fileName || (sd||{}).file_name || file?.name || '', fileType: (sd||{}).fileType || (sd||{}).file_type || file?.type || '', fileUrl: (sd||{}).fileUrl || (sd||{}).url || (sd||{}).path || (sd||{}).location || null, id: (sd||{}).id || (sd||{}).fileId || (sd||{}).filename || null, size: (sd||{}).size || (file ? file.size : null) });

      let attachmentsMeta = [];
      if (attachments && attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          const att = attachments[i];
          if (att.uploaded) { attachmentsMeta.push(normalizeServerResp(att.serverResponse, att.file)); continue; }
          setAttachments(prev => { const c = [...prev]; c[i] = { ...c[i], uploading: true, progress: 0, error: null }; return c; });
          try {
            const form = new FormData();
            form.append('file', att.file);
            const uploadResp = await axios.post(`${backendBase}/upload`, form, {
              headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'multipart/form-data' },
              onUploadProgress: (pe) => { const p = pe.total ? Math.round((pe.loaded * 100) / pe.total) : 0; setAttachments(prev => { const c = [...prev]; c[i] = { ...c[i], progress: p }; return c; }); }
            });
            const sd = normalizeServerResp(uploadResp?.data || null, att.file);
            setAttachments(prev => { const c = [...prev]; c[i] = { ...c[i], uploading: false, uploaded: true, serverResponse: sd, progress: 100 }; return c; });
            attachmentsMeta.push(sd);
          } catch (err) {
            setAttachments(prev => { const c = [...prev]; c[i] = { ...c[i], uploading: false, uploaded: false, error: err?.response?.data?.message || err.message || 'Upload failed' }; return c; });
            setModal({ open: true, title: 'Upload failed', message: `Failed to upload ${att.file.name}: ${err?.response?.data?.message || err.message}`, type: 'error' });
            setLoading(false); return;
          }
        }
      }

      let ticketUserName = latestName || accounts[0]?.username;
      let ticketUserEmail = latestEmail;
      let ticketCreatedBy = latestEmail;

      if (selectedCategoryConfig?.features?.onBehalf?.enabled && selectedCategoryConfig?.type !== 'PASSWORD_RESET' && dynamicOnBehalfSelection === 'Other' && dynamicOnBehalfSelectedUser) {
        ticketUserName = dynamicOnBehalfSelectedUser.displayName || dynamicOnBehalfSelectedUser.mail;
        ticketUserEmail = dynamicOnBehalfSelectedUser.mail || dynamicOnBehalfSelectedUser.userPrincipalName;
      }

      const ticketData = {
        category: formData.category, description: formData.description, priority: formData.priority,
        userId: accounts[0]?.localAccountId, userName: ticketUserName, userEmail: ticketUserEmail,
        ...(selectedCategoryConfig?.features?.onBehalf?.enabled && selectedCategoryConfig?.type !== 'PASSWORD_RESET' && dynamicOnBehalfSelection === 'Other' && dynamicOnBehalfSelectedUser ? { createdBy: ticketCreatedBy, createdByName: latestName, onBehalfOf: ticketUserEmail } : {}),
        ...(isPasswordReset ? { onBehalf: formData.onBehalf, onBehalfEmail: formData.onBehalf === 'Other' ? formData.onBehalfEmail.trim() : latestEmail } : {}),
        ...(formData.alternativeEmail && formData.alternativeEmail.trim() ? { deliveryEmail: formData.alternativeEmail.trim() } : {}),
        ...(isPasswordReset && formData.onBehalf === 'Self' ? { returnPasswordToRequester: true } : {}),
        ...(formData.category === 'Operational & Finance' && formData.subQuery ? { subQuery: formData.subQuery, ...(formData.subQuery === 'Other' && formData.otherSubQueryText.trim() ? { otherSubQueryText: formData.otherSubQueryText.trim() } : {}) } : {}),
        ...(formData.subCategory ? { subCategory: formData.subCategory, ...(formData.subCategory === 'Other' && otherSubCategoryText.trim() ? { otherSubCategoryText: otherSubCategoryText.trim() } : {}) } : {}),
        ...(attachmentsMeta && attachmentsMeta.length ? { attachments: attachmentsMeta } : {}),
      };

      const response = await axios.post(`${backendBase}/tickets`, ticketData, { headers: { Authorization: `Bearer ${token.accessToken}` } });
      const id = response?.data?._id || response?.data?.id || response?.data?.ticketId || null;
      if (id) setCreatedTicketId(id);

      const successMessage = dynamicOnBehalfSelection === 'Other' && dynamicOnBehalfSelectedUser
        ? `Ticket created on behalf of ${dynamicOnBehalfSelectedUser.displayName || dynamicOnBehalfSelectedUser.mail}.`
        : formData.category === 'Password Reset'
          ? 'Password reset ticket created. If approved, the new password will be sent to the delivery email.'
          : 'Ticket created successfully.';

      setModal({ open: true, title: 'Ticket created', message: successMessage, type: 'success' });
    } catch (error) {
      setModal({ open: true, title: 'Failed', message: error?.response?.data?.message || error.message || 'Failed to create ticket.', type: 'error' });
    } finally { setLoading(false); }
  };

  const handleCloseModal = () => {
    const wasSuccess = modal.type === 'success';
    setModal({ open: false, title: '', message: '', type: 'info' });
    if (wasSuccess) navigate('/', { state: { refresh: true } });
  };

  const handleViewTicket = () => {
    if (createdTicketId) navigate(`/ticket/${createdTicketId}`);
    else navigate('/', { state: { refresh: true } });
  };

  const disableCreate = formData.category === 'Admin Access' && isDeviceAdmin;

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const fileTypeLabel = (type, name) => {
    if (!type) { if (name) return name.split('.').pop()?.toLowerCase() || ''; return ''; }
    return type.split('/').pop();
  };

  const isImageType = (t) => t && t.startsWith('image/');

  const handleFilesSelected = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    if (attachments.length + incoming.length > MAX_FILES) {
      setModal({ open: true, title: 'Too many files', message: `You can attach up to ${MAX_FILES} files.`, type: 'error' }); return;
    }
    const validated = [];
    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE) { setModal({ open: true, title: 'File too large', message: `${file.name} exceeds ${formatBytes(MAX_FILE_SIZE)}.`, type: 'error' }); continue; }
      if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(docx|doc|xlsx|xls|pdf|txt|zip)$/i)) { setModal({ open: true, title: 'Unsupported type', message: `${file.name} is not a supported file type.`, type: 'error' }); continue; }
      validated.push({ file, preview: isImageType(file.type) ? URL.createObjectURL(file) : null, uploading: false, progress: 0, uploaded: false, error: null, serverResponse: null });
    }
    if (validated.length) { setAttachments(prev => [...prev, ...validated]); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleRemoveAttachment = (index) => {
    setAttachments(prev => { const c = [...prev]; const removed = c.splice(index, 1)[0]; if (removed?.preview) try { URL.revokeObjectURL(removed.preview); } catch (e) {} return c; });
    if (fileInputRef.current && attachments.length <= 1) fileInputRef.current.value = '';
  };

  const handleClearAllAttachments = () => {
    attachments.forEach(a => { if (a.preview) try { URL.revokeObjectURL(a.preview); } catch (e) {} });
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="ct-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .ct-root {
          min-height: 100vh;
          background: #f4f4f0;
          font-family: 'DM Sans', sans-serif;
          color: #111827;
        }

        .ct-body {
          max-width: 860px;
          margin: 0 auto;
          padding: 2.5rem 2rem 4rem;
        }

        /* ── Header ── */
        .ct-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 2.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #d9d5cc;
        }
        .ct-date {
          font-size: 11px; font-weight: 500;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: #9ca3af; margin-bottom: 6px;
        }
        .ct-page-title {
          font-size: 26px; font-weight: 600;
          color: #111827; letter-spacing: -0.02em;
        }
        .ct-header-actions { display: flex; gap: 10px; }

        /* ── Buttons ── */
        .ct-btn {
          display: inline-flex; align-items: center; gap: 7px;
          border-radius: 6px; font-size: 13px; font-weight: 500;
          font-family: 'DM Sans', sans-serif; cursor: pointer;
          border: none; transition: background 0.15s, transform 0.1s;
          text-decoration: none; white-space: nowrap;
        }
        .ct-btn-sm  { padding: 6px 12px; font-size: 12px; }
        .ct-btn-md  { padding: 9px 18px; }
        .ct-btn-lg  { padding: 11px 22px; font-size: 14px; }
        .ct-btn-full { width: 100%; justify-content: center; }

        .ct-btn-primary { background: #111827; color: #fff; }
        .ct-btn-primary:hover:not(:disabled) { background: #1f2937; transform: translateY(-1px); }
        .ct-btn-secondary { background: #fff; color: #111827; border: 1px solid #d9d5cc; }
        .ct-btn-secondary:hover { background: #f9f8f6; }
        .ct-btn-ghost { background: transparent; color: #6b7280; border: 1px solid #e5e7eb; }
        .ct-btn-ghost:hover { background: #f4f4f0; color: #374151; }
        .ct-btn-danger { background: #ef4444; color: #fff; }
        .ct-btn-danger:hover:not(:disabled) { background: #dc2626; }
        .ct-btn-success { background: #10b981; color: #fff; }
        .ct-btn-success:hover:not(:disabled) { background: #059669; }
        .ct-btn-submit { background: #111827; color: #fff; font-size: 14px; font-weight: 600; }
        .ct-btn-submit:hover:not(:disabled) { background: #1f2937; transform: translateY(-1px); }
        .ct-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }

        /* ── Form card ── */
        .ct-card {
          background: #fff;
          border: 1px solid #d9d5cc;
          border-radius: 10px;
          overflow: hidden;
        }

        .ct-card-section {
          padding: 1.5rem 1.75rem;
          border-bottom: 1px solid #f3f4f6;
        }
        .ct-card-section:last-child { border-bottom: none; }

        .ct-section-label {
          font-size: 11px; font-weight: 500;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: #9ca3af; margin-bottom: 1rem;
        }

        /* ── Form fields ── */
        .ct-field { display: flex; flex-direction: column; margin-bottom: 1.25rem; }
        .ct-field:last-child { margin-bottom: 0; }

        .ct-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .ct-row:last-child { margin-bottom: 0; }

        .ct-label {
          font-size: 12px; font-weight: 600;
          color: #374151; margin-bottom: 6px;
          letter-spacing: 0.01em;
        }
        .ct-required { color: #ef4444; margin-left: 3px; }

        .ct-input, .ct-select, .ct-textarea {
          width: 100%; padding: 9px 12px;
          border: 1px solid #d9d5cc; border-radius: 7px;
          font-size: 14px; font-family: 'DM Sans', sans-serif;
          background: #fafaf8; color: #111827;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ct-input:focus, .ct-select:focus, .ct-textarea:focus {
          outline: none; border-color: #111827; background: #fff;
          box-shadow: 0 0 0 3px rgba(17,24,39,0.07);
        }
        .ct-input::placeholder, .ct-textarea::placeholder { color: #9ca3af; }
        .ct-textarea { min-height: 130px; resize: vertical; }

        .ct-hint {
          font-size: 11px; color: #9ca3af;
          margin-top: 5px; line-height: 1.4;
        }

        /* ── Info banners ── */
        .ct-banner {
          padding: 10px 14px;
          border-radius: 6px;
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 1rem;
        }
        .ct-banner:last-child { margin-bottom: 0; }
        .ct-banner-warn  { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }
        .ct-banner-info  { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; }
        .ct-banner-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }

        /* ── On behalf / search ── */
        .ct-search-wrap { position: relative; }
        .ct-search-results {
          position: absolute; top: 100%; left: 0; right: 0;
          background: #fff; border: 1px solid #d9d5cc;
          border-radius: 7px; margin-top: 4px;
          max-height: 180px; overflow-y: auto;
          box-shadow: 0 8px 24px rgba(0,0,0,0.1);
          z-index: 1000;
        }
        .ct-search-item {
          padding: 10px 12px; cursor: pointer;
          border-bottom: 1px solid #f3f4f6;
          transition: background 0.1s;
        }
        .ct-search-item:last-child { border-bottom: none; }
        .ct-search-item:hover { background: #f4f4f0; }
        .ct-search-name { font-size: 13px; font-weight: 600; color: #111827; }
        .ct-search-email { font-size: 12px; color: #9ca3af; margin-top: 1px; }

        .ct-selected-user {
          margin-top: 10px; padding: 10px 12px;
          background: #f0fdf4; border: 1px solid #86efac;
          border-radius: 6px; font-size: 13px;
        }
        .ct-selected-user strong { color: #065f46; display: block; font-size: 12px; margin-bottom: 2px; }

        /* ── Verify ── */
        .ct-verify-row { display: flex; gap: 8px; align-items: flex-start; }
        .ct-verify-row .ct-input { flex: 1; }
        .ct-verify-status {
          font-size: 12px; padding: 7px 10px;
          border-radius: 5px; margin-top: 6px;
        }
        .ct-verify-idle     { background: #f4f4f0; color: #6b7280; }
        .ct-verify-verifying{ background: #dbeafe; color: #1e40af; }
        .ct-verify-verified { background: #d1fae5; color: #065f46; }
        .ct-verify-notfound,
        .ct-verify-error    { background: #fee2e2; color: #991b1b; }

        /* ── Attachments ── */
        .ct-dropzone {
          border: 1px dashed #d9d5cc;
          border-radius: 8px; padding: 2rem;
          text-align: center; cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          background: #fafaf8;
        }
        .ct-dropzone:hover, .ct-dropzone.dragging {
          border-color: #111827; background: #f4f4f0;
        }
        .ct-dropzone-icon { margin-bottom: 10px; }
        .ct-dropzone-icon img { width: 36px; height: 36px; object-fit: contain; opacity: 0.7; }
        .ct-dropzone-title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 4px; }
        .ct-dropzone-hint  { font-size: 12px; color: #9ca3af; }

        .ct-att-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 10px; margin-top: 12px;
        }
        .ct-att-item {
          border: 1px solid #e5e7eb; border-radius: 7px;
          padding: 10px; background: #fff; position: relative;
        }
        .ct-att-preview {
          width: 100%; height: 100px; border-radius: 5px;
          overflow: hidden; margin-bottom: 8px;
          background: #f4f4f0;
          display: flex; align-items: center; justify-content: center;
        }
        .ct-att-preview img { width: 100%; height: 100%; object-fit: cover; }
        .ct-att-type-icon {
          font-size: 13px; font-weight: 700; color: #6b7280;
          font-family: 'DM Mono', monospace;
        }
        .ct-att-name { font-size: 12px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
        .ct-att-size { font-size: 11px; color: #9ca3af; }
        .ct-att-remove {
          position: absolute; top: 6px; right: 6px;
          width: 22px; height: 22px; border-radius: 50%;
          background: #ef4444; color: #fff; border: none;
          cursor: pointer; font-size: 12px;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s;
        }
        .ct-att-remove:hover { background: #dc2626; }

        .ct-progress { margin-top: 6px; }
        .ct-progress-bar { height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
        .ct-progress-fill { height: 100%; background: #111827; transition: width 0.3s; }
        .ct-progress-text { font-size: 10px; color: #9ca3af; margin-top: 3px; }

        .ct-att-badge {
          font-size: 11px; padding: 3px 7px;
          border-radius: 4px; margin-top: 5px;
          display: inline-block; font-weight: 500;
        }
        .ct-att-badge-ok    { background: #d1fae5; color: #065f46; }
        .ct-att-badge-err   { background: #fee2e2; color: #991b1b; }

        /* ── Form actions ── */
        .ct-form-actions {
          padding: 1.5rem 1.75rem;
          display: flex; gap: 10px;
          background: #fafaf8;
          border-top: 1px solid #d9d5cc;
          border-radius: 0 0 10px 10px;
        }

        /* ── Modal ── */
        @keyframes fadeIn  { from { opacity: 0; }              to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .ct-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999; animation: fadeIn 0.15s;
          backdrop-filter: blur(3px); padding: 1rem;
        }
        .ct-modal {
          background: #fff; border-radius: 10px;
          padding: 1.75rem; width: 100%; max-width: 440px;
          animation: slideUp 0.2s;
        }
        .ct-modal-title { font-size: 17px; font-weight: 600; color: #111827; margin-bottom: 4px; }
        .ct-modal-sub   { font-size: 13px; color: #6b7280; margin-bottom: 1.25rem; line-height: 1.5; }
        .ct-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

        .ct-password-box {
          background: #f4f4f0; border: 1px solid #d9d5cc;
          border-radius: 7px; padding: 1rem;
          font-family: 'DM Mono', monospace; font-size: 17px;
          font-weight: 500; color: #111827;
          word-break: break-all; text-align: center;
          margin-bottom: 1rem; letter-spacing: 0.04em;
        }

        /* ── Responsive ── */
        @media (max-width: 640px) {
          .ct-body { padding: 1.5rem 1rem 3rem; }
          .ct-header { flex-direction: column; align-items: flex-start; gap: 1rem; }
          .ct-header-actions { width: 100%; }
          .ct-btn { flex: 1; justify-content: center; }
          .ct-row { grid-template-columns: 1fr; }
          .ct-att-list { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="ct-body">
        {/* Header */}
        <div className="ct-header">
          <div>
            <div className="ct-date">{today}</div>
            <div className="ct-page-title">New Ticket</div>
          </div>
          <div className="ct-header-actions">
            <button onClick={() => navigate('/')} className="ct-btn ct-btn-md ct-btn-secondary">
              ← Dashboard
            </button>
          </div>
        </div>

        {loadingCategories && (
          <div className="ct-banner ct-banner-info" style={{ marginBottom: '1rem' }}>Loading categories…</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="ct-card">

            {/* ── Category & Priority ── */}
            <div className="ct-card-section">
              <div className="ct-section-label">Ticket details</div>
              <div className="ct-row">
                <div className="ct-field" style={{ marginBottom: 0 }}>
                  <label className="ct-label">Category<span className="ct-required">*</span></label>
                  <select
                    className="ct-select"
                    value={formData.category}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, category: val, onBehalf: val === 'Password Reset' ? 'Self' : prev.onBehalf, onBehalfEmail: val === 'Password Reset' ? prev.onBehalfEmail : '', alternativeEmail: val === 'Password Reset' ? prev.alternativeEmail : '', subCategory: '', ...(val !== 'Operational & Finance' ? { subQuery: '', otherSubQueryText: '' } : {}) }));
                      setDynamicOnBehalfSelection('Self'); setDynamicOnBehalfEmail('');
                      setDynamicOnBehalfSelectedUser(null); setDynamicOnBehalfSearchResults([]);
                      setVerifyStatus('idle'); setVerifiedName(''); setVerifyError('');
                    }}
                    required
                  >
                    <option value="">Select category</option>
                    {categoriesConfig.map(cat => (
                      <option key={cat.id || cat.name} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="ct-field" style={{ marginBottom: 0 }}>
                  <label className="ct-label">Priority<span className="ct-required">*</span></label>
                  <select className="ct-select" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} required>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Dynamic sub-category ── */}
            {selectedCategoryConfig?.features?.subCategories?.enabled && (
              <div className="ct-card-section">
                <div className="ct-section-label">Sub-category</div>
                <div className="ct-field">
                  <label className="ct-label">
                    Sub-category{selectedCategoryConfig.features.subCategories.required && <span className="ct-required">*</span>}
                  </label>
                  <select
                    className="ct-select"
                    value={formData.subCategory}
                    onChange={(e) => { setFormData(prev => ({ ...prev, subCategory: e.target.value })); if (e.target.value !== 'Other') setOtherSubCategoryText(''); }}
                    required={selectedCategoryConfig.features.subCategories.required}
                  >
                    <option value="">Select sub-category</option>
                    {selectedCategoryConfig.features.subCategories.list?.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                  {formData.subCategory === 'Other' && (
                    <input type="text" className="ct-input" style={{ marginTop: 8 }} value={otherSubCategoryText} onChange={(e) => setOtherSubCategoryText(e.target.value)} placeholder="Describe the issue" required />
                  )}
                </div>
              </div>
            )}

            {/* ── Dynamic on-behalf (non-password) ── */}
            {selectedCategoryConfig?.features?.onBehalf?.enabled && selectedCategoryConfig?.type !== 'PASSWORD_RESET' && (
              <div className="ct-card-section">
                <div className="ct-section-label">On behalf of</div>
                <div className="ct-field">
                  <label className="ct-label">
                    Who is this ticket for?{selectedCategoryConfig.features.onBehalf.required && <span className="ct-required">*</span>}
                  </label>
                  <select
                    className="ct-select"
                    value={dynamicOnBehalfSelection}
                    onChange={(e) => { setDynamicOnBehalfSelection(e.target.value); if (e.target.value === 'Self') { setDynamicOnBehalfEmail(''); setDynamicOnBehalfSelectedUser(null); setDynamicOnBehalfSearchResults([]); } }}
                    required={selectedCategoryConfig.features.onBehalf.required}
                  >
                    <option value="Self">Self</option>
                    <option value="Other">Someone else</option>
                  </select>
                </div>

                {dynamicOnBehalfSelection === 'Other' && (
                  <div className="ct-field">
                    <label className="ct-label">Search user</label>
                    <div className="ct-search-wrap">
                      <input
                        type="text" className="ct-input"
                        value={dynamicOnBehalfEmail}
                        onChange={(e) => { setDynamicOnBehalfEmail(e.target.value); handleDynamicOnBehalfSearch(e.target.value); }}
                        placeholder="Type email or name…"
                      />
                      {dynamicOnBehalfSearching && <div className="ct-hint">Searching…</div>}
                      {dynamicOnBehalfSearchResults.length > 0 && (
                        <div className="ct-search-results">
                          {dynamicOnBehalfSearchResults.map(user => (
                            <div key={user.id} className="ct-search-item" onClick={() => handleSelectDynamicOnBehalfUser(user)}>
                              <div className="ct-search-name">{user.displayName || user.mail}</div>
                              <div className="ct-search-email">{user.mail || user.userPrincipalName}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {dynamicOnBehalfSelectedUser && (
                      <div className="ct-selected-user">
                        <strong>Selected user</strong>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{dynamicOnBehalfSelectedUser.displayName}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{dynamicOnBehalfSelectedUser.mail || dynamicOnBehalfSelectedUser.userPrincipalName}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Password reset on-behalf ── */}
            {selectedCategoryConfig?.type === 'PASSWORD_RESET' && (
              <div className="ct-card-section">
                <div className="ct-section-label">Password reset</div>
                <div className="ct-row">
                  <div className="ct-field" style={{ marginBottom: 0 }}>
                    <label className="ct-label">On behalf of<span className="ct-required">*</span></label>
                    <select
                      className="ct-select"
                      value={formData.onBehalf}
                      onChange={(e) => { const val = e.target.value; setFormData(prev => ({ ...prev, onBehalf: val, ...(val === 'Self' ? { onBehalfEmail: '' } : {}) })); setVerifyStatus('idle'); setVerifiedName(''); setVerifyError(''); }}
                    >
                      <option value="Self">Self</option>
                      <option value="Other">Someone else</option>
                    </select>
                  </div>

                  {formData.onBehalf === 'Other' && (
                    <div className="ct-field" style={{ marginBottom: 0 }}>
                      <label className="ct-label">Target user email<span className="ct-required">*</span></label>
                      <div className="ct-verify-row">
                        <input type="text" className="ct-input" placeholder="Company email" value={formData.onBehalfEmail} onChange={(e) => setFormData({ ...formData, onBehalfEmail: e.target.value })} required />
                        <button type="button" className="ct-btn ct-btn-md ct-btn-primary" onClick={handleVerifyOther} disabled={verifyStatus === 'verifying'}>
                          {verifyStatus === 'verifying' ? 'Checking…' : 'Verify'}
                        </button>
                      </div>
                      <div className={`ct-verify-status ct-verify-${verifyStatus}`}>
                        {verifyStatus === 'idle' && 'Click Verify to confirm the user exists'}
                        {verifyStatus === 'verifying' && 'Verifying…'}
                        {verifyStatus === 'verified' && `Verified: ${verifiedName}`}
                        {verifyStatus === 'notfound' && 'User not found in directory'}
                        {verifyStatus === 'error' && verifyError}
                      </div>
                    </div>
                  )}
                </div>

                {((formData.onBehalf === 'Other' && verifyStatus === 'verified') || formData.onBehalf === 'Self') && (
                  <div className="ct-field" style={{ marginTop: 16 }}>
                    <label className="ct-label">Delivery email<span className="ct-required">*</span></label>
                    <input type="email" className="ct-input" placeholder="Email to receive the reset password" value={formData.alternativeEmail} onChange={(e) => setFormData({ ...formData, alternativeEmail: e.target.value })} required />
                    <div className="ct-hint">The new password will be sent to this address</div>
                  </div>
                )}
              </div>
            )}

            {/* ── Admin access warning ── */}
            {formData.category === 'Admin Access' && (
              <div className="ct-card-section">
                {groupsLoading ? (
                  <div className="ct-banner ct-banner-info">Checking your access…</div>
                ) : isDeviceAdmin ? (
                  <div className="ct-banner ct-banner-error">
                    <strong>Already has admin access.</strong> Creating an Admin Access ticket is not allowed since you already have device admin access.
                  </div>
                ) : (
                  <div className="ct-banner ct-banner-info">
                    Submit this request for approval from the IT team.
                  </div>
                )}
              </div>
            )}

            {/* ── Description ── */}
            <div className="ct-card-section">
              <div className="ct-section-label">Description</div>
              <div className="ct-field">
                <label className="ct-label">Describe your issue<span className="ct-required">*</span></label>
                <textarea
                  className="ct-textarea"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Provide as much detail as possible…"
                  required
                />
              </div>
            </div>

            {/* ── Attachments ── */}
            {selectedCategoryConfig?.features?.attachments?.enabled && (
              <div className="ct-card-section">
                <div className="ct-section-label">
                  Attachments{selectedCategoryConfig.features.attachments.required && <span className="ct-required" style={{ fontSize: 11 }}>*</span>}
                </div>

                <div
                  className={`ct-dropzone${isDragging ? ' dragging' : ''}`}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFilesSelected(e.dataTransfer?.files); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  <div className="ct-dropzone-icon">
                    <img src={attachmentIcon} alt="Attach" />
                  </div>
                  <div className="ct-dropzone-title">Drag & drop or click to browse</div>
                  <div className="ct-dropzone-hint">Max {formatBytes(MAX_FILE_SIZE)} per file · up to {MAX_FILES} files</div>
                  <input ref={fileInputRef} type="file" multiple onChange={(e) => handleFilesSelected(e.target.files)} style={{ display: 'none' }} />
                </div>

                {attachments.length > 0 && (
                  <>
                    <div className="ct-att-list">
                      {attachments.map((att, idx) => (
                        <div key={idx} className="ct-att-item">
                          <button type="button" className="ct-att-remove" onClick={() => handleRemoveAttachment(idx)}>✕</button>
                          <div className="ct-att-preview">
                            {att.preview ? <img src={att.preview} alt={att.file.name} /> : <span className="ct-att-type-icon">.{fileTypeLabel(att.file.type, att.file.name)}</span>}
                          </div>
                          <div className="ct-att-name">{att.file.name}</div>
                          <div className="ct-att-size">{formatBytes(att.file.size)}</div>
                          {att.uploading && (
                            <div className="ct-progress">
                              <div className="ct-progress-bar"><div className="ct-progress-fill" style={{ width: `${att.progress}%` }} /></div>
                              <div className="ct-progress-text">{att.progress}%</div>
                            </div>
                          )}
                          {att.uploaded && <span className="ct-att-badge ct-att-badge-ok">Uploaded</span>}
                          {att.error && <span className="ct-att-badge ct-att-badge-err">{att.error}</span>}
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button type="button" className="ct-btn ct-btn-sm ct-btn-ghost" onClick={handleClearAllAttachments}>Clear all</button>
                    </div>
                  </>
                )}

                <div className="ct-hint" style={{ marginTop: 8 }}>
                  {selectedCategoryConfig.features.attachments.required ? 'Attachments are required for this category.' : 'Attach supporting documents if needed.'}
                </div>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="ct-form-actions">
              <button type="submit" className="ct-btn ct-btn-lg ct-btn-submit" disabled={loading || disableCreate} style={{ flex: 1 }}>
                {loading ? 'Creating…' : 'Create Ticket'}
              </button>
              <button type="button" className="ct-btn ct-btn-lg ct-btn-secondary" onClick={() => navigate('/')}>
                Cancel
              </button>
            </div>
          </div>
        </form>

        {/* ── Modal ── */}
        {modal.open && (
          <div className="ct-overlay">
            <div className="ct-modal">
              <div className="ct-modal-title">{modal.title}</div>
              <div className="ct-modal-sub">{modal.message}</div>
              <div className="ct-modal-actions">
                <button className={`ct-btn ct-btn-md ${modal.type === 'error' ? 'ct-btn-danger' : modal.type === 'success' ? 'ct-btn-success' : 'ct-btn-primary'}`} onClick={handleCloseModal}>OK</button>
                {modal.type === 'success' && createdTicketId && (
                  <button className="ct-btn ct-btn-md ct-btn-secondary" onClick={handleViewTicket}>View ticket</button>
                )}
              </div>
            </div>
          </div>
        )}

        {showPasswordPopup && <PasswordPopup password={newPassword} onClose={() => setShowPasswordPopup(false)} />}
      </div>
    </div>
  );
}

export default CreateTicket;