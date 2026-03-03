import { useEffect, useState, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import attachmentIcon from './attachment.jpg';

function PasswordPopup({ password, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-title">🎉 Password Reset</div>

        <div className="modal-message">
          <strong>Your new password:</strong>
          <div
            style={{
              marginTop: '10px',
              padding: '10px 12px',
              background: '#f1f5f9',
              borderRadius: '6px',
              fontFamily: 'monospace',
              fontSize: '15px'
            }}
          >
            {password}
          </div>

          {copied && (
            <div style={{ marginTop: '8px', color: '#059669', fontSize: '13px' }}>
              Copied!
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button
            className="btn-modal info"
            onClick={handleCopy}
            type="button"
          >
            Copy
          </button>

          <button
            className="btn-modal success"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
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
    category: '',
    description: '',
    priority: 'Medium',
    onBehalf: 'Self',
    onBehalfEmail: '',
    alternativeEmail: '',
    subQuery: '',
    otherSubQueryText: '',
    subCategory: '',
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
  const ALLOWED_TYPES = [
    'image/png', 'image/jpeg', 'image/jpg', 'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip'
  ];

  const [loading, setLoading] = useState(false);
  const [newPassword] = useState("");
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });
  const [createdTicketId, setCreatedTicketId] = useState(null);

  const [displayName, setDisplayName] = useState(accounts?.[0]?.name || '');
  const [displayEmail, setDisplayEmail] = useState(accounts?.[0]?.username || '');
  const [,setProfilePhoto] = useState(null);

  const [verifyStatus, setVerifyStatus] = useState('idle');
  const [verifiedName, setVerifiedName] = useState('');
  const [verifyError, setVerifyError] = useState('');

  const [isDeviceAdmin, setIsDeviceAdmin] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const fileInputRef = useRef(null);

  // Fetch categories configuration
  useEffect(() => {
    let mounted = true;
    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const tokenResp = await instance.acquireTokenSilent({ 
          scopes: ['User.Read'], 
          account: accounts[0] 
        });
        
        const response = await axios.get(`${backendBase}/api/categories`, {
          headers: { Authorization: `Bearer ${tokenResp.accessToken}` }
        });
        
        if (mounted && Array.isArray(response.data)) {
          setCategoriesConfig(response.data);
        }
      } catch (err) {
        console.error('Failed to fetch categories config:', err);
      } finally {
        if (mounted) setLoadingCategories(false);
      }
    };

    if (accounts && accounts[0]) {
      fetchCategories();
    }

    return () => { mounted = false; };
  }, [instance, accounts, backendBase]);

  // Fetch user profile and photo
  useEffect(() => {
    let mounted = true;
    const fetchUser = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResp = await instance.acquireTokenSilent({ 
          scopes: ['User.Read'], 
          account: accounts[0] 
        });
        
        const resp = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokenResp.accessToken}` }
        });
        
        if (!mounted) return;
        
        setDisplayName(resp.data.displayName || accounts[0]?.name || '');
        const email = (resp.data.mail && resp.data.mail.trim()) ||
                      (resp.data.userPrincipalName && resp.data.userPrincipalName.trim()) ||
                      accounts[0]?.username || '';
        setDisplayEmail(email);

        // Try to fetch profile photo
        try {
          const photoRes = await axios.get('https://graph.microsoft.com/v1.0/me/photo/$value', {
            headers: { Authorization: `Bearer ${tokenResp.accessToken}` },
            responseType: 'arraybuffer'
          });

          const u8 = new Uint8Array(photoRes.data);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < u8.length; i += chunkSize) {
            const slice = u8.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, slice);
          }
          const b64 = btoa(binary);
          const contentType = (photoRes.headers && photoRes.headers['content-type']) || 'image/jpeg';
          setProfilePhoto(`data:${contentType};base64,${b64}`);
        } catch (photoErr) {
          // No photo available
        }
      } catch (err) {
        console.debug('Could not fetch user profile:', err?.message || err);
      }
    };
    fetchUser();
    return () => { mounted = false; };
  }, [instance, accounts, setProfilePhoto]);

  // Fetch groups and detect device admin
  useEffect(() => {
    if (!accounts || !accounts[0]) return;
    const fetchGroups = async () => {
      setGroupsLoading(true);
      try {
        const tokenResp = await instance.acquireTokenSilent({
          scopes: ['GroupMember.Read.All', 'User.Read'],
          account: accounts[0]
        });
        const res = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResp.accessToken}` }
        });
        const groups = (res.data?.value || []).map(g => (g.displayName || '').toString());
        const hasDeviceAdmin = groups.some(
          name => name === process.env.REACT_APP_DEVICE_ADMIN_GROUP1_NAME || name === process.env.REACT_APP_DEVICE_ADMIN_GROUP2_NAME
        );
        setIsDeviceAdmin(hasDeviceAdmin);
      } catch (err) {
        console.error('Error fetching groups:', err?.message || err);
      } finally {
        setGroupsLoading(false);
      }
    };
    fetchGroups();
  }, [instance, accounts]);

  // Update selected category config
  useEffect(() => {
    if (formData.category && categoriesConfig.length > 0) {
      const config = categoriesConfig.find(c => c.name === formData.category);
      setSelectedCategoryConfig(config || null);
    } else {
      setSelectedCategoryConfig(null);
    }
  }, [formData.category, categoriesConfig]);

  const handleDynamicOnBehalfSearch = async (searchText) => {
    if (!searchText || searchText.trim().length < 2) {
      setDynamicOnBehalfSearchResults([]);
      return;
    }

    setDynamicOnBehalfSearching(true);
    try {
      const token = await instance.acquireTokenSilent({ 
        scopes: ['User.Read.All'], 
        account: accounts[0] 
      });

      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/users?$filter=startswith(mail,'${searchText}') or startswith(displayName,'${searchText}') or startswith(userPrincipalName,'${searchText}')&$top=5`,
        {
          headers: { Authorization: `Bearer ${token.accessToken}` }
        }
      );

      setDynamicOnBehalfSearchResults(response.data.value || []);
    } catch (err) {
      console.error('Error searching users:', err);
      setDynamicOnBehalfSearchResults([]);
    } finally {
      setDynamicOnBehalfSearching(false);
    }
  };

  const handleSelectDynamicOnBehalfUser = (user) => {
    setDynamicOnBehalfSelectedUser(user);
    setDynamicOnBehalfEmail(user.mail || user.userPrincipalName);
    setDynamicOnBehalfSearchResults([]);
  };

  const handleVerifyOther = async () => {
    const email = (formData.onBehalfEmail || '').trim();
    setVerifyError('');
    setVerifiedName('');
    setVerifyStatus('idle');

    if (!email) {
      setVerifyError('Please enter the target user\'s company email to verify.');
      return;
    }
    setVerifyStatus('verifying');
    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });

      const res = await axios.post(`${backendBase}/verify-user`, { email }, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      if (res.data && res.data.exists) {
        setVerifyStatus('verified');
        setVerifiedName(res.data.displayName || res.data.mail || email);
        setFormData(prev => ({ ...prev, onBehalfEmail: res.data.mail || email }));
      } else {
        setVerifiedName('');
        setVerifyStatus('notfound');
        setVerifyError('User not found in Azure AD. Please check the email and try again.');
      }
    } catch (err) {
      console.error('Verify error', err);
      setVerifyStatus('error');
      const msg = err?.response?.data?.message || err.message || 'Verification failed';
      setVerifyError(msg);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCreatedTicketId(null);

    if (formData.category === 'Admin Access' && isDeviceAdmin) {
      setModal({
        open: true,
        title: 'Cannot Create Request',
        message: 'You already have admin access to the device. Creating an Admin Access ticket is not allowed.',
        type: 'error'
      });
      setLoading(false);
      return;
    }

    if (selectedCategoryConfig?.features?.subCategories?.enabled) {
      if (
        selectedCategoryConfig.features.subCategories.required &&
        !formData.subCategory
      ) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please select a sub-category.',
          type: 'error'
        });
        setLoading(false);
        return;
      }

      if (
        formData.subCategory === 'Other' &&
        !otherSubCategoryText.trim()
      ) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please describe the issue for Other sub-category.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
    }

    if (selectedCategoryConfig?.features?.onBehalf?.enabled && selectedCategoryConfig?.type !== 'PASSWORD_RESET') {
      if (
        selectedCategoryConfig.features.onBehalf.required &&
        !dynamicOnBehalfSelection
      ) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please select who this ticket is for.',
          type: 'error'
        });
        setLoading(false);
        return;
      }

      if (dynamicOnBehalfSelection === 'Other' && !dynamicOnBehalfSelectedUser) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please search and select a user to create ticket on their behalf.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
    }

    if (selectedCategoryConfig?.features?.attachments?.enabled) {
      if (selectedCategoryConfig.features.attachments.required && attachments.length === 0) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please attach at least one file for this category.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
    }

    if (selectedCategoryConfig?.type === 'PASSWORD_RESET' && formData.onBehalf === 'Other') {
      if (!formData.onBehalfEmail.trim()) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please enter the company email of the person you are requesting the reset for.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
      if (verifyStatus !== 'verified') {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please verify the target user\'s email using the Verify button before submitting.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
      const del = (formData.alternativeEmail || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!del || !emailRegex.test(del)) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please provide a valid alternative email address to receive the reset password for the target user.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
    }

    if (selectedCategoryConfig?.type === 'PASSWORD_RESET' && formData.onBehalf === 'Self') {
      const alt = (formData.alternativeEmail || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!alt) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please provide an alternative email address to receive the reset password.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
      if (!emailRegex.test(alt)) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please enter a valid alternative email address.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
    }

    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });

      let latestName = displayName;
      let latestEmail = displayEmail;
      try {
        const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${token.accessToken}` }
        });
        latestName = userRes.data.displayName || latestName || 'User';
        latestEmail =
          (userRes.data.mail && userRes.data.mail.trim()) ||
          (userRes.data.userPrincipalName && userRes.data.userPrincipalName.trim()) ||
          latestEmail || '';
      } catch (err) {
        // ignore
      }

      const isPasswordReset = selectedCategoryConfig?.type === 'PASSWORD_RESET';
      const onBehalf = isPasswordReset ? formData.onBehalf : undefined;
      const onBehalfEmail = isPasswordReset
        ? (formData.onBehalf === 'Other'
            ? formData.onBehalfEmail.trim()
            : latestEmail)
        : undefined;
      const returnPasswordToRequester = isPasswordReset && formData.onBehalf === 'Self';

      const normalizeServerResp = (serverData, file) => {
        const sd = serverData || {};
        const fileUrl = sd.fileUrl || sd.url || sd.path || sd.location || null;
        return {
          fileName: sd.fileName || sd.file_name || file?.name || '',
          fileType: sd.fileType || sd.file_type || file?.type || '',
          fileUrl,
          id: sd.id || sd.fileId || sd.filename || null,
          size: sd.size || (file ? file.size : null)
        };
      };

      let attachmentsMeta = [];
      if (attachments && attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          const att = attachments[i];

          if (att.uploaded) {
            const normalized = normalizeServerResp(att.serverResponse, att.file);
            attachmentsMeta.push(normalized);
            continue;
          }

          setAttachments(prev => {
            const copy = [...prev];
            copy[i] = { ...copy[i], uploading: true, progress: 0, error: null };
            return copy;
          });

          try {
            const form = new FormData();
            form.append('file', att.file);

            const uploadResp = await axios.post(`${backendBase}/upload`, form, {
              headers: {
                Authorization: `Bearer ${token.accessToken}`,
                'Content-Type': 'multipart/form-data'
              },
              onUploadProgress: (progressEvent) => {
                const p = progressEvent.total ? Math.round((progressEvent.loaded * 100) / progressEvent.total) : 0;
                setAttachments(prev => {
                  const copy = [...prev];
                  copy[i] = { ...copy[i], progress: p };
                  return copy;
                });
              }
            });

            const serverDataRaw = uploadResp?.data || null;
            const serverData = normalizeServerResp(serverDataRaw, att.file);

            setAttachments(prev => {
              const copy = [...prev];
              copy[i] = { ...copy[i], uploading: false, uploaded: true, serverResponse: serverData, progress: 100 };
              return copy;
            });

            attachmentsMeta.push(serverData);
          } catch (err) {
            console.error('Upload error for file', att.file.name, err);
            setAttachments(prev => {
              const copy = [...prev];
              copy[i] = { ...copy[i], uploading: false, uploaded: false, error: err?.response?.data?.message || err.message || 'Upload failed' };
              return copy;
            });
            setModal({ open: true, title: 'Upload Failed', message: `Failed to upload ${att.file.name}: ${err?.response?.data?.message || err.message || 'Upload failed'}`, type: 'error' });
            setLoading(false);
            return;
          }
        }
      }

      let ticketUserName = latestName || accounts[0]?.username;
      let ticketUserEmail = latestEmail;
      let ticketCreatedBy = latestEmail;

      if (
        selectedCategoryConfig?.features?.onBehalf?.enabled &&
        selectedCategoryConfig?.type !== 'PASSWORD_RESET' &&
        dynamicOnBehalfSelection === 'Other' &&
        dynamicOnBehalfSelectedUser
      ) {
        ticketUserName = dynamicOnBehalfSelectedUser.displayName || dynamicOnBehalfSelectedUser.mail;
        ticketUserEmail = dynamicOnBehalfSelectedUser.mail || dynamicOnBehalfSelectedUser.userPrincipalName;
      }

      const ticketData = {
        category: formData.category,
        description: formData.description,
        priority: formData.priority,
        userId: accounts[0]?.localAccountId,
        userName: ticketUserName,
        userEmail: ticketUserEmail,
        
        ...(selectedCategoryConfig?.features?.onBehalf?.enabled &&
            selectedCategoryConfig?.type !== 'PASSWORD_RESET' &&
            dynamicOnBehalfSelection === 'Other' &&
            dynamicOnBehalfSelectedUser
          ? { 
              createdBy: ticketCreatedBy,
              createdByName: latestName,
              onBehalfOf: ticketUserEmail 
            }
          : {}),

        ...(onBehalf ? { onBehalf } : {}),
        ...(onBehalfEmail ? { onBehalfEmail } : {}),
        ...(formData.alternativeEmail && formData.alternativeEmail.trim()
          ? { deliveryEmail: formData.alternativeEmail.trim() }
          : {}),
        ...(returnPasswordToRequester ? { returnPasswordToRequester: true } : {}),

        ...(formData.category === 'Operational & Finance' && formData.subQuery
          ? {
              subQuery: formData.subQuery,
              ...(formData.subQuery === 'Other' && formData.otherSubQueryText.trim()
                ? { otherSubQueryText: formData.otherSubQueryText.trim() }
                : {}),
            }
          : {}),

        ...(formData.subCategory ? { 
            subCategory: formData.subCategory,
            ...(formData.subCategory === 'Other' && otherSubCategoryText.trim()
              ? { otherSubCategoryText: otherSubCategoryText.trim() }
              : {})
          } : {}),

        ...(attachmentsMeta && attachmentsMeta.length ? { attachments: attachmentsMeta } : {}),
      };

      const response = await axios.post(`${backendBase}/tickets`, ticketData, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      const id = response?.data?._id || response?.data?.id || response?.data?.ticketId || null;
      if (id) setCreatedTicketId(id);

      const successMessage = dynamicOnBehalfSelection === 'Other' && dynamicOnBehalfSelectedUser
        ? `Ticket created successfully on behalf of ${dynamicOnBehalfSelectedUser.displayName || dynamicOnBehalfSelectedUser.mail}!`
        : formData.category === 'Password Reset'
          ? 'Your password reset ticket has been created and is now waiting for category head approval. If approved, the new password will be sent to the delivery email you provided.'
          : 'Ticket created successfully!';

      setModal({
        open: true,
        title: 'Ticket Created',
        message: successMessage,
        type: 'success'
      });
    } catch (error) {
      console.error('Error creating ticket:', error);
      const message = error?.response?.data?.message || error.message || 'Failed to create ticket.';
      setModal({ open: true, title: 'Failed', message: `⚠️ ${message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
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


  const disableCreateBecauseDeviceAdmin = formData.category === 'Admin Access' && isDeviceAdmin;

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const fileTypeLabel = (type, name) => {
    if (!type) {
      if (name) {
        const ext = name.split('.').pop()?.toLowerCase();
        return ext || '';
      }
      return '';
    }
    return type.split('/').pop();
  };

  const isImageType = (t) => t && t.startsWith('image/');

  const handleFilesSelected = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const currentCount = attachments.length;
    if (currentCount + incoming.length > MAX_FILES) {
      setModal({
        open: true,
        title: 'Too many files',
        message: `You can attach up to ${MAX_FILES} files.`,
        type: 'error'
      });
      return;
    }

    const validated = [];
    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE) {
        setModal({
          open: true,
          title: 'File too large',
          message: `${file.name} is larger than ${formatBytes(MAX_FILE_SIZE)}.`,
          type: 'error'
        });
        continue;
      }
      if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(docx|doc|xlsx|xls|pdf|txt|zip)$/i)) {
        setModal({
          open: true,
          title: 'Unsupported file type',
          message: `${file.name} is not a supported file type.`,
          type: 'error'
        });
        continue;
      }
      const preview = isImageType(file.type) ? URL.createObjectURL(file) : null;
      validated.push({
        file,
        preview,
        uploading: false,
        progress: 0,
        uploaded: false,
        error: null,
        serverResponse: null
      });
    }

    if (validated.length) {
      setAttachments(prev => [...prev, ...validated]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (index) => {
    setAttachments(prev => {
      const copy = [...prev];
      const removed = copy.splice(index, 1)[0];
      if (removed && removed.preview) {
        try { URL.revokeObjectURL(removed.preview); } catch (e) {}
      }
      return copy;
    });
    if (fileInputRef.current && attachments.length <= 1) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearAllAttachments = () => {
    attachments.forEach(a => { if (a.preview) try { URL.revokeObjectURL(a.preview); } catch (e) {} });
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [isDragging, setIsDragging] = useState(false);
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dtFiles = e.dataTransfer?.files;
    handleFilesSelected(dtFiles);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const attachmentsRef = useRef(attachments);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach(a => { 
        if (a.preview) {
          try { URL.revokeObjectURL(a.preview); } catch (e) {} 
        }
      });
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        * { box-sizing: border-box; }
        
        /* Page Header */
        .page-header {
          background: white;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .page-header h1 {
          margin: 0;
          color: #0f172a;
          font-size: 24px;
          font-weight: 700;
        }
        
        .page-header p {
          margin: 0.5rem 0 0 0;
          color: #64748b;
          font-size: 14px;
        }
        
        .btn-back {
          padding: 10px 20px;
          background: #f1f5f9;
          color: #475569;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 14px;
        }
        
        .btn-back:hover {
          background: #e2e8f0;
          transform: translateY(-2px);
        }
        
        /* Main Container */
        .main-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 2rem 2rem 2rem;
        }
        
        /* Form Card */
        .form-card {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          margin-bottom: 2rem;
        }
        
        .form-title {
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 1.5rem 0;
          padding-bottom: 1rem;
          border-bottom: 2px solid #f1f5f9;
        }
        
        /* Form Fields */
        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .form-field {
          display: flex;
          flex-direction: column;
        }
        
        .form-label {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
        }
        
        .required {
          color: #ef4444;
          margin-left: 4px;
        }
        
        .form-input,
        .form-select,
        .form-textarea {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 15px;
          transition: all 0.2s;
          background: white;
        }
        
        .form-input:focus,
        .form-select:focus,
        .form-textarea:focus {
          outline: none;
          border-color: #002060;
          box-shadow: 0 0 0 3px rgba(0, 32, 96, 0.1);
        }
        
        .form-textarea {
          min-height: 140px;
          resize: vertical;
          font-family: inherit;
        }
        
        .form-hint {
          font-size: 12px;
          color: #64748b;
          margin-top: 0.5rem;
        }
        
        /* Special Sections */
        .info-box {
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          border-left: 4px solid;
        }
        
        .info-box.warning {
          background: #fffbeb;
          border-left-color: #e98404;
          color: #92400e;
        }
        
        .info-box.info {
          background: #eff6ff;
          border-left-color: #002060;
          color: #1e3a8a;
        }
        
        .info-box.success {
          background: #f0fdf4;
          border-left-color: #10b981;
          color: #065f46;
        }
        
        /* On Behalf Section */
        .onbehalf-section {
          background: #f8fafc;
          padding: 1.5rem;
          border-radius: 10px;
          border: 2px solid #e2e8f0;
          margin-bottom: 1.5rem;
        }
        
        .onbehalf-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        
        .search-results {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-top: 4px;
          max-height: 200px;
          overflow-y: auto;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          z-index: 1000;
        }
        
        .search-result-item {
          padding: 12px;
          cursor: pointer;
          border-bottom: 1px solid #f3f4f6;
          transition: background 0.2s;
        }
        
        .search-result-item:hover {
          background: #f9fafb;
        }
        
        .search-result-name {
          font-weight: 600;
          font-size: 14px;
          color: #1f2937;
        }
        
        .search-result-email {
          font-size: 12px;
          color: #6b7280;
          margin-top: 2px;
        }
        
        .selected-user-box {
          margin-top: 1rem;
          padding: 1rem;
          background: #f0fdf4;
          border: 1px solid #86efac;
          border-radius: 8px;
        }
        
        /* Verify Button Section */
        .verify-section {
          display: flex;
          gap: 0.5rem;
          align-items: flex-start;
        }
        
        .btn-verify {
          padding: 12px 20px;
          background: #002060;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
        }
        
        .btn-verify:hover {
          background: #003380;
          transform: translateY(-2px);
        }
        
        .btn-verify:disabled {
          background: #94a3b8;
          cursor: not-allowed;
          transform: none;
        }
        
        .verify-status {
          margin-top: 0.5rem;
          font-size: 13px;
          padding: 8px 12px;
          border-radius: 6px;
        }
        
        .verify-status.idle {
          background: #f8fafc;
          color: #64748b;
        }
        
        .verify-status.verifying {
          background: #dbeafe;
          color: #1e40af;
        }
        
        .verify-status.verified {
          background: #d1fae5;
          color: #065f46;
        }
        
        .verify-status.error {
          background: #fee2e2;
          color: #991b1b;
        }
        
        /* Attachments Section */
        .attachment-dropzone {
          border: 2px dashed #e2e8f0;
          border-radius: 10px;
          padding: 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        }
        
        .attachment-dropzone:hover,
        .attachment-dropzone.dragging {
          border-color: #002060;
          background: #eff6ff;
        }
        
        .dropzone-icon {
          margin-bottom: 1rem;
        }
        
        .dropzone-icon img {
          width: 42px;
          height: 42px;
          object-fit: contain;
          opacity: 0.9;
        }

        .dropzone-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 0.5rem;
        }
        
        .dropzone-hint {
          font-size: 13px;
          color: #64748b;
        }
        
        .attachments-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }
        
        .attachment-item {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          background: white;
          position: relative;
        }
        
        .attachment-preview {
          width: 100%;
          height: 120px;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 0.75rem;
          background: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .attachment-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .file-type-icon {
          font-size: 36px;
          color: #64748b;
        }
        
        .attachment-name {
          font-size: 13px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .attachment-size {
          font-size: 12px;
          color: #6b7280;
        }
        
        .attachment-progress {
          margin-top: 0.5rem;
        }
        
        .progress-bar {
          height: 6px;
          background: #e2e8f0;
          border-radius: 3px;
          overflow: hidden;
        }
        
        .progress-fill {
          height: 100%;
          background: #002060;
          transition: width 0.3s;
        }
        
        .progress-text {
          font-size: 11px;
          color: #64748b;
          margin-top: 4px;
        }
        
        .attachment-status {
          font-size: 12px;
          margin-top: 0.5rem;
          padding: 4px 8px;
          border-radius: 4px;
          display: inline-block;
        }
        
        .attachment-status.uploading {
          background: #dbeafe;
          color: #1e40af;
        }
        
        .attachment-status.uploaded {
          background: #d1fae5;
          color: #065f46;
        }
        
        .attachment-status.error {
          background: #fee2e2;
          color: #991b1b;
        }
        
        .btn-remove-attachment {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.9);
          color: white;
          border: none;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        
        .btn-remove-attachment:hover {
          background: #dc2626;
          transform: scale(1.1);
        }
        
        .attachment-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
        }
        
        /* Form Actions */
        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 2px solid #f1f5f9;
        }
        
        .btn-primary {
          flex: 1;
          padding: 14px 24px;
          background: #e98404;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(233, 132, 4, 0.3);
        }
        
        .btn-primary:hover:not(:disabled) {
          background: #d17703;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(233, 132, 4, 0.4);
        }
        
        .btn-primary:disabled {
          background: #94a3b8;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        
        .btn-secondary {
          padding: 14px 24px;
          background: #f1f5f9;
          color: #475569;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-secondary:hover {
          background: #e2e8f0;
          transform: translateY(-2px);
        }
        
        .btn-ghost {
          padding: 10px 16px;
          background: #f8fafc;
          color: #64748b;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-ghost:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        
        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 1rem;
        }
        
        .modal-box {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        
        .modal-title {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 1rem 0;
        }
        
        .modal-message {
          color: #475569;
          line-height: 1.6;
          margin-bottom: 1.5rem;
        }
        
        .modal-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }
        
        .btn-modal {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-modal.success {
          background: #10b981;
          color: white;
        }
        
        .btn-modal.success:hover {
          background: #059669;
        }
        
        .btn-modal.error {
          background: #ef4444;
          color: white;
        }
        
        .btn-modal.error:hover {
          background: #dc2626;
        }
        
        .btn-modal.info {
          background: #002060;
          color: white;
        }
        
        .btn-modal.info:hover {
          background: #003380;
        }
        
        /* Responsive Design */
        @media (max-width: 768px) {
          .main-container {
            padding: 0 1rem 2rem 1rem;
          }
          
          .form-card {
            padding: 1.5rem;
          }
          
          .form-row {
            grid-template-columns: 1fr;
          }
          
          .form-actions {
            flex-direction: column;
          }
          
          .attachments-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Create New Ticket</h1>
          <p>Submit a support request</p>
        </div>
        <button onClick={() => navigate('/')} className="btn-back">
          ← Back to Home
        </button>
      </div>

      {/* Main Content */}
      <div className="main-container">
        {loadingCategories && (
          <div className="info-box info">
            Loading categories...
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-card">
            <h2 className="form-title">Ticket Details</h2>

            {/* Category & Priority */}
            <div className="form-row">
              <div className="form-field">
                <label className="form-label">
                  Category<span className="required">*</span>
                </label>
                <select
                  className="form-select"
                  value={formData.category}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      category: val,
                      onBehalf: val === 'Password Reset' ? 'Self' : prev.onBehalf,
                      onBehalfEmail: val === 'Password Reset' ? prev.onBehalfEmail : '',
                      alternativeEmail: val === 'Password Reset' ? prev.alternativeEmail : '',
                      subCategory: '',
                      ...(val !== 'Operational & Finance'
                        ? { subQuery: '', otherSubQueryText: '' }
                        : {})
                    }));
                    setDynamicOnBehalfSelection('Self');
                    setDynamicOnBehalfEmail('');
                    setDynamicOnBehalfSelectedUser(null);
                    setDynamicOnBehalfSearchResults([]);
                    setVerifyStatus('idle');
                    setVerifiedName('');
                    setVerifyError('');
                  }}
                  required
                >
                  <option value="">Select Category</option>
                  {categoriesConfig.map(cat => (
                    <option key={cat.id || cat.name} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">
                  Priority<span className="required">*</span>
                </label>
                <select
                  className="form-select"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  required
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            {/* Dynamic On Behalf (non-password reset) */}
            {selectedCategoryConfig?.features?.onBehalf?.enabled && 
             selectedCategoryConfig?.type !== 'PASSWORD_RESET' && (
              <div className="onbehalf-section">
                <div className="onbehalf-header">
                  <label className="form-label" style={{ margin: 0 }}>
                    On Behalf Of {selectedCategoryConfig.features.onBehalf.required && <span className="required">*</span>}
                  </label>
                </div>
                
                <div className="form-hint" style={{ marginBottom: '1rem' }}>
                  Create this ticket for yourself or on behalf of someone else
                </div>

                <select
                  className="form-select"
                  value={dynamicOnBehalfSelection}
                  onChange={(e) => {
                    setDynamicOnBehalfSelection(e.target.value);
                    if (e.target.value === 'Self') {
                      setDynamicOnBehalfEmail('');
                      setDynamicOnBehalfSelectedUser(null);
                      setDynamicOnBehalfSearchResults([]);
                    }
                  }}
                  required={selectedCategoryConfig.features.onBehalf.required}
                >
                  <option value="Self">Self</option>
                  <option value="Other">Other</option>
                </select>

                {dynamicOnBehalfSelection === 'Other' && (
                  <div style={{ marginTop: '1rem', position: 'relative' }}>
                    <label className="form-label">Search User</label>
                    <input
                      type="text"
                      className="form-input"
                      value={dynamicOnBehalfEmail}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDynamicOnBehalfEmail(val);
                        handleDynamicOnBehalfSearch(val);
                      }}
                      placeholder="Type email or name to search..."
                    />

                    {dynamicOnBehalfSearching && (
                      <div className="form-hint">Searching...</div>
                    )}

                    {dynamicOnBehalfSearchResults.length > 0 && (
                      <div className="search-results">
                        {dynamicOnBehalfSearchResults.map((user) => (
                          <div
                            key={user.id}
                            className="search-result-item"
                            onClick={() => handleSelectDynamicOnBehalfUser(user)}
                          >
                            <div className="search-result-name">
                              {user.displayName || user.mail}
                            </div>
                            <div className="search-result-email">
                              {user.mail || user.userPrincipalName}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {dynamicOnBehalfSelectedUser && (
                      <div className="selected-user-box">
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>
                          ✅ Selected User:
                        </div>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>
                          {dynamicOnBehalfSelectedUser.displayName}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          {dynamicOnBehalfSelectedUser.mail || dynamicOnBehalfSelectedUser.userPrincipalName}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Dynamic Sub-Category */}
            {selectedCategoryConfig?.features?.subCategories?.enabled && (
              <div className="form-field">
                <label className="form-label">
                  Sub-Category{" "}
                  {selectedCategoryConfig.features.subCategories.required && (
                    <span className="required">*</span>
                  )}
                </label>

                <select
                  className="form-select"
                  value={formData.subCategory}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      subCategory: val
                    }));
                    if (val !== 'Other') {
                      setOtherSubCategoryText('');
                    }
                  }}
                  required={selectedCategoryConfig.features.subCategories.required}
                >
                  <option value="">Select sub-category</option>
                  {selectedCategoryConfig.features.subCategories.list?.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>

                {formData.subCategory === 'Other' && (
                  <input
                    type="text"
                    className="form-input"
                    style={{ marginTop: '0.75rem' }}
                    value={otherSubCategoryText}
                    onChange={(e) => setOtherSubCategoryText(e.target.value)}
                    placeholder="Please describe the issue"
                    required
                  />
                )}
              </div>
            )}

            {/* Password Reset - On Behalf */}
            {selectedCategoryConfig?.type === 'PASSWORD_RESET' && (
              <div className="onbehalf-section">
                <label className="form-label">
                  On behalf of<span className="required">*</span>
                </label>

                <div className="form-row">
                  <div className="form-field">
                    <select
                      className="form-select"
                      value={formData.onBehalf}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => ({
                          ...prev,
                          onBehalf: val,
                          ...(val === 'Self' ? { onBehalfEmail: '' } : {})
                        }));
                        setVerifyStatus('idle');
                        setVerifiedName('');
                        setVerifyError('');
                      }}
                    >
                      <option value="Self">Self</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {formData.onBehalf === 'Other' && (
                    <div className="form-field">
                      <div className="verify-section">
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Enter company email"
                          value={formData.onBehalfEmail}
                          onChange={(e) => setFormData({ ...formData, onBehalfEmail: e.target.value })}
                          required
                        />
                        <button
                          type="button"
                          className="btn-verify"
                          onClick={handleVerifyOther}
                          disabled={verifyStatus === 'verifying'}
                        >
                          {verifyStatus === 'verifying' ? 'Verifying...' : 'Verify'}
                        </button>
                      </div>

                      <div className={`verify-status ${verifyStatus}`}>
                        {verifyStatus === 'idle' && 'Click Verify to confirm user exists'}
                        {verifyStatus === 'verifying' && '🔍 Verifying user...'}
                        {verifyStatus === 'verified' && `✅ Verified: ${verifiedName}`}
                        {verifyStatus === 'notfound' && '❌ User not found'}
                        {verifyStatus === 'error' && `❌ ${verifyError}`}
                      </div>
                    </div>
                  )}
                </div>

                {((formData.onBehalf === 'Other' && verifyStatus === 'verified') || 
                  formData.onBehalf === 'Self') && (
                  <div className="form-field" style={{ marginTop: '1rem' }}>
                    <label className="form-label">
                      Alternative Email<span className="required">*</span>
                    </label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="Email to receive reset password"
                      value={formData.alternativeEmail}
                      onChange={(e) => setFormData({ ...formData, alternativeEmail: e.target.value })}
                      required
                    />
                    <div className="form-hint">
                      The reset password will be sent to this email address
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Admin Access Warning */}
            {formData.category === 'Admin Access' && (
              <>
                {groupsLoading ? (
                  <div className="info-box info">Checking access...</div>
                ) : isDeviceAdmin ? (
                  <div className="info-box warning">
                    <strong>⚠️ You already have device admin access.</strong>
                    <div style={{ marginTop: '6px' }}>
                      Your account already has admin access, so creating an Admin Access ticket is disabled.
                    </div>
                  </div>
                ) : (
                  <div className="info-box info">
                    <strong>Need Admin Access?</strong>
                    <div style={{ marginTop: '6px' }}>
                      Please submit this request for approval.
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Description */}
            <div className="form-field">
              <label className="form-label">
                Description<span className="required">*</span>
              </label>

              <textarea
                className="form-textarea"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Describe your issue..."
                required
              />
            </div>

            {/* Attachments */}
            {selectedCategoryConfig?.features?.attachments?.enabled && (
              <div className="form-field" style={{ marginTop: '1.5rem' }}>
                <label className="form-label">
                  Attachments
                  {selectedCategoryConfig.features.attachments.required && (
                    <span className="required">*</span>
                  )}
                </label>

                <div
                  className={`attachment-dropzone ${isDragging ? 'dragging' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  <div className="dropzone-icon">
                    <img
                      src={attachmentIcon}
                      alt="Attachment"
                    />
                  </div>

                  <div className="dropzone-title">
                    Drag & drop files here or click to browse
                  </div>
                  <div className="dropzone-hint">
                    Max {formatBytes(MAX_FILE_SIZE)} each. Up to {MAX_FILES} files.
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => handleFilesSelected(e.target.files)}
                    style={{ display: 'none' }}
                  />
                </div>

                {attachments.length > 0 && (
                  <>
                    <div className="attachments-list">
                      {attachments.map((att, idx) => (
                        <div key={idx} className="attachment-item">
                          <button
                            type="button"
                            className="btn-remove-attachment"
                            onClick={() => handleRemoveAttachment(idx)}
                          >
                            ✖
                          </button>

                          <div className="attachment-preview">
                            {att.preview ? (
                              <img src={att.preview} alt={att.file.name} />
                            ) : (
                              <div className="file-type-icon">
                                {fileTypeLabel(att.file.type, att.file.name)}
                              </div>
                            )}
                          </div>

                          <div className="attachment-name">
                            {att.file.name}
                          </div>

                          <div className="attachment-size">
                            {formatBytes(att.file.size)}
                          </div>

                          {att.uploading && (
                            <div className="attachment-progress">
                              <div className="progress-bar">
                                <div
                                  className="progress-fill"
                                  style={{ width: `${att.progress}%` }}
                                />
                              </div>
                              <div className="progress-text">{att.progress}%</div>
                            </div>
                          )}

                          {att.uploaded && (
                            <div className="attachment-status uploaded">
                              Uploaded
                            </div>
                          )}

                          {att.error && (
                            <div className="attachment-status error">
                              {att.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="attachment-actions">
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={handleClearAllAttachments}
                      >
                        Clear all
                      </button>
                    </div>
                  </>
                )}

                <div className="form-hint" style={{ marginTop: '0.5rem' }}>
                  {selectedCategoryConfig.features.attachments.required
                    ? 'Attachments are required for this category.'
                    : 'Attach supporting documents if needed.'}
                </div>
              </div>
            )}

            {/* Form actions */}
            <div className="form-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={loading || disableCreateBecauseDeviceAdmin}
                title={
                  disableCreateBecauseDeviceAdmin
                    ? 'You already have device admin access'
                    : undefined
                }
              >
                {loading ? 'Creating...' : 'Create Ticket'}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate('/')}
              >
                Cancel
              </button>
            </div>

          </div>
        </form>

        {/* Modal */}
        {modal.open && (
          <div className="modal-overlay">
            <div className="modal-box">
              <div className="modal-title">{modal.title}</div>
              <div className="modal-message">{modal.message}</div>

              <div className="modal-actions">
                <button
                  className={`btn-modal ${modal.type}`}
                  onClick={handleCloseModal}
                >
                  OK
                </button>

                {modal.type === 'success' && createdTicketId && (
                  <button
                    className="btn-modal info"
                    onClick={handleViewTicket}
                  >
                    View Ticket
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showPasswordPopup && (
          <PasswordPopup
            password={newPassword}
            onClose={() => setShowPasswordPopup(false)}
          />
        )}
      </div>
    </div>
  );
}

export default CreateTicket;