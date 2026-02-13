import React, { useEffect, useState, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// Password Popup Component (kept)
function PasswordPopup({ password, onClose }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
  };
  return (
    <div style={styles.overlay}>
      <div style={styles.passwordBox}>
        <h2 style={{ marginBottom: '1rem' }}>🎉 Password Reset</h2>
        <p><strong>Your new password:</strong></p>
        <p style={styles.passwordText}>{password}</p>
        <button onClick={handleCopy} style={styles.copyButton}>Copy Password</button>
        {copied && <p style={{ color: 'green', marginTop: '0.5rem' }}>Copied!</p>}
        <button onClick={onClose} style={styles.modalCloseButton}>✖</button>
      </div>
    </div>
  );
}

function CreateTicket() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();

  const backendBase = "https://ticketing-hn59.onrender.com";

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

  // NEW: Store fetched categories configuration
  const [categoriesConfig, setCategoriesConfig] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [selectedCategoryConfig, setSelectedCategoryConfig] = useState(null);
  const [otherSubCategoryText, setOtherSubCategoryText] = useState('');

  // NEW: Dynamic On Behalf states (separate from Password Reset)
  const [dynamicOnBehalfSelection, setDynamicOnBehalfSelection] = useState('Self');
  const [dynamicOnBehalfEmail, setDynamicOnBehalfEmail] = useState('');
  const [dynamicOnBehalfSearchResults, setDynamicOnBehalfSearchResults] = useState([]);
  const [dynamicOnBehalfSearching, setDynamicOnBehalfSearching] = useState(false);
  const [dynamicOnBehalfSelectedUser, setDynamicOnBehalfSelectedUser] = useState(null);

  // Attachments state
  const [attachments, setAttachments] = useState([]);

  const MAX_FILES = 5;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
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

  const [verifyStatus, setVerifyStatus] = useState('idle');
  const [verifiedName, setVerifiedName] = useState('');
  const [verifyError, setVerifyError] = useState('');

  const [isDeviceAdmin, setIsDeviceAdmin] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const fileInputRef = useRef(null);

  // NEW: Fetch categories configuration on mount
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

  // Fetch user profile
  useEffect(() => {
    let mounted = true;
    const fetchUser = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResp = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });
        const resp = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokenResp.accessToken}` }
        });
        if (!mounted) return;
        setDisplayName(resp.data.displayName || accounts[0]?.name || '');
        const email = (resp.data.mail && resp.data.mail.trim()) ||
                      (resp.data.userPrincipalName && resp.data.userPrincipalName.trim()) ||
                      accounts[0]?.username || '';
        setDisplayEmail(email);
      } catch (err) {
        console.debug('Could not fetch user profile for form display:', err?.message || err);
      }
    };
    fetchUser();
    return () => { mounted = false; };
  }, [instance, accounts]);

  // Fetch groups and detect GS_DeviceAdministrator membership
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
        const hasDeviceAdmin = groups.some(name => name === 'GS_DeviceAdministrator');
        setIsDeviceAdmin(hasDeviceAdmin);
      } catch (err) {
        console.error('Error fetching groups:', err?.message || err);
      } finally {
        setGroupsLoading(false);
      }
    };
    fetchGroups();
  }, [instance, accounts]);

  // NEW: Update selected category config when category changes
  useEffect(() => {
    if (formData.category && categoriesConfig.length > 0) {
      const config = categoriesConfig.find(c => c.name === formData.category);
      setSelectedCategoryConfig(config || null);
    } else {
      setSelectedCategoryConfig(null);
    }
  }, [formData.category, categoriesConfig]);

  // NEW: Search users for dynamic On Behalf feature
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

      // Search users in Azure AD
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

  // NEW: Handle selecting a user from search results
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

    // If user is device admin, block creation of Admin Access tickets
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

    // NEW: Validation for dynamic subcategory (if enabled and required)
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

    // NEW: Validation for dynamic onBehalf (if enabled and required)
    if ( selectedCategoryConfig?.features?.onBehalf?.enabled && selectedCategoryConfig?.type !== 'PASSWORD_RESET') {
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

    // NEW: Validation for dynamic attachments (if enabled and required)
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


    // Validation for Password Reset
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

      const isPasswordReset =
        selectedCategoryConfig?.type === 'PASSWORD_RESET';

      const onBehalf = isPasswordReset ? formData.onBehalf : undefined;

      const onBehalfEmail = isPasswordReset
        ? (formData.onBehalf === 'Other'
            ? formData.onBehalfEmail.trim()
            : latestEmail)
        : undefined;

      const returnPasswordToRequester =
            isPasswordReset && formData.onBehalf === 'Self';


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

      // Upload attachments (if any) before creating ticket
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

      // NEW: Determine ticket creation details based on dynamic On Behalf
      let ticketUserName = latestName || accounts[0]?.username;
      let ticketUserEmail = latestEmail;
      let ticketCreatedBy = latestEmail; // Track who actually created it

      if (
          selectedCategoryConfig?.features?.onBehalf?.enabled &&
          selectedCategoryConfig?.type !== 'PASSWORD_RESET' &&
          dynamicOnBehalfSelection === 'Other' &&
          dynamicOnBehalfSelectedUser
        ) {
        // Creating ticket on behalf of someone else
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
        
        // NEW: Add creator info when creating on behalf
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

        // SubQuery for Operational & Finance (legacy)
        ...(formData.category === 'Operational & Finance' && formData.subQuery
          ? {
              subQuery: formData.subQuery,
              ...(formData.subQuery === 'Other' && formData.otherSubQueryText.trim()
                ? { otherSubQueryText: formData.otherSubQueryText.trim() }
                : {}),
            }
          : {}),

        // NEW: Dynamic subcategory
        ...(formData.subCategory ? { 
            subCategory: formData.subCategory,
            ...(formData.subCategory === 'Other' && otherSubCategoryText.trim()
              ? { otherSubCategoryText: otherSubCategoryText.trim() }
              : {})
          } : {}),

        // Attachments metadata
        ...(attachmentsMeta && attachmentsMeta.length ? { attachments: attachmentsMeta } : {}),
      };

      const response = await axios.post(`${backendBase}/tickets`, ticketData, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      const id =
        response?.data?._id ||
        response?.data?.id ||
        response?.data?.ticketId ||
        null;
      if (id) setCreatedTicketId(id);

      const successMessage = dynamicOnBehalfSelection === 'Other' && dynamicOnBehalfSelectedUser
        ? `Ticket created successfully on behalf of ${dynamicOnBehalfSelectedUser.displayName || dynamicOnBehalfSelectedUser.mail}!`
        : formData.category === 'Password Reset'
          ? 'Your password reset ticket has been created and is now Waiting for approval category head approval. If approved, the new password will be sent to the delivery email you provided.'
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

  const initials = (displayName || displayEmail || 'U')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const disableCreateBecauseDeviceAdmin =
    formData.category === 'Admin Access' && isDeviceAdmin;

  // Attachment helpers
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
    <div style={styles.pageWrap}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
              {displayName || displayEmail || 'Unknown User'}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{displayEmail || '—'}</div>
          </div>
          <div style={{ marginLeft: 12, textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Status</div>
            <div style={{ fontWeight: 700, color: '#10b981' }}>Signed in</div>
          </div>
        </div>

        <h1 style={{ textAlign: 'center', margin: '18px 0 8px' }}>Create New Ticket</h1>
        
        {loadingCategories && (
          <div style={{ textAlign: 'center', color: '#6b7280', marginBottom: 12 }}>
            Loading categories...
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={styles.gridRow}>
            <div style={styles.field}>
              <label style={styles.label}>Category *</label>
              <select
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
                  // Reset dynamic on behalf when category changes
                  setDynamicOnBehalfSelection('Self');
                  setDynamicOnBehalfEmail('');
                  setDynamicOnBehalfSelectedUser(null);
                  setDynamicOnBehalfSearchResults([]);
                  setVerifyStatus('idle');
                  setVerifiedName('');
                  setVerifyError('');
                }}
                required
                style={styles.select}
              >
                <option value="">Select Category</option>
                
                {categoriesConfig.map(cat => (
                  <option key={cat.id || cat.name} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Priority *</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                required
                style={styles.select}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          {/* NEW: Dynamic On Behalf field (ONLY for non-Password Reset categories) */}
          {selectedCategoryConfig?.features?.onBehalf?.enabled && selectedCategoryConfig?.type !== 'PASSWORD_RESET' && (
            <div style={{ 
              padding: 16, 
              border: '1px solid #e6e9ee', 
              borderRadius: 8,
              background: '#f0f9ff',
              marginBottom: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontWeight: 700, fontSize: 14 }}>
                  On Behalf {selectedCategoryConfig.features.onBehalf.required && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
              </div>
              
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                Create this ticket for yourself or on behalf of someone else
              </div>

              <select
                value={dynamicOnBehalfSelection}
                onChange={(e) => {
                  setDynamicOnBehalfSelection(e.target.value);
                  if (e.target.value === 'Self') {
                    setDynamicOnBehalfEmail('');
                    setDynamicOnBehalfSelectedUser(null);
                    setDynamicOnBehalfSearchResults([]);
                  }
                }}
                style={styles.select}
                required={selectedCategoryConfig.features.onBehalf.required}
              >
                <option value="Self">Self</option>
                <option value="Other">Other</option>
              </select>

              {dynamicOnBehalfSelection === 'Other' && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'block' }}>
                    Search User by Email or Name
                  </label>
                  
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={dynamicOnBehalfEmail}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDynamicOnBehalfEmail(val);
                        handleDynamicOnBehalfSearch(val);
                      }}
                      placeholder="Type email or name to search..."
                      style={styles.input}
                    />

                    {dynamicOnBehalfSearching && (
                      <div style={{ 
                        position: 'absolute', 
                        right: 12, 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        color: '#6b7280',
                        fontSize: 12 
                      }}>
                        Searching...
                      </div>
                    )}

                    {dynamicOnBehalfSearchResults.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #e6e9ee',
                        borderRadius: 8,
                        marginTop: 4,
                        maxHeight: 200,
                        overflowY: 'auto',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 1000
                      }}>
                        {dynamicOnBehalfSearchResults.map((user) => (
                          <div
                            key={user.id}
                            onClick={() => handleSelectDynamicOnBehalfUser(user)}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f3f4f6',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>
                              {user.displayName || user.mail}
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                              {user.mail || user.userPrincipalName}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {dynamicOnBehalfSelectedUser && (
                    <div style={{
                      marginTop: 10,
                      padding: 10,
                      background: '#f0fdf4',
                      border: '1px solid #86efac',
                      borderRadius: 6
                    }}>
                      <div style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
                        ✅ Selected User:
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginTop: 4 }}>
                        {dynamicOnBehalfSelectedUser.displayName}
                      </div>
                      <div style={{ fontSize: 12, color: '#166534' }}>
                        {dynamicOnBehalfSelectedUser.mail || dynamicOnBehalfSelectedUser.userPrincipalName}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* NEW: Dynamic Sub-Category field (with Other support) */}
          {selectedCategoryConfig?.features?.subCategories?.enabled && (
            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>
                Sub-Category{" "}
                {selectedCategoryConfig.features.subCategories.required && (
                  <span style={{ color: '#ef4444' }}>*</span>
                )}
              </label>

              <select
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
                style={styles.select}
                required={selectedCategoryConfig.features.subCategories.required}
              >
                <option value="">Select sub-category</option>

                {selectedCategoryConfig.features.subCategories.list?.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>

              {formData.subCategory === 'Other' && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    value={otherSubCategoryText}
                    onChange={(e) => setOtherSubCategoryText(e.target.value)}
                    placeholder="Please describe the issue"
                    style={styles.input}
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* Password Reset - conditional UI (legacy - keep for backward compatibility) */}
          {selectedCategoryConfig?.type === 'PASSWORD_RESET' && (
            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>On behalf of *</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <select
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
                  style={{ ...styles.select, flex: '0 0 220px' }}
                >
                  <option value="Self">Self</option>
                  <option value="Other">Other</option>
                </select>

                {formData.onBehalf === 'Other' && (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Enter company email of target user"
                        value={formData.onBehalfEmail}
                        onChange={(e) => setFormData({ ...formData, onBehalfEmail: e.target.value })}
                        style={{ ...styles.input, flex: 1 }}
                        required
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOther}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: 'none',
                          cursor: 'pointer',
                          background: '#2563eb',
                          color: 'white',
                          fontWeight: 700
                        }}
                        disabled={verifyStatus === 'verifying'}
                      >
                        {verifyStatus === 'verifying' ? 'Verifying...' : 'Verify'}
                      </button>
                    </div>

                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      {verifyStatus === 'idle' && (
                        <span style={{ color: '#6b7280' }}>Click Verify to confirm the user exists in Azure AD.</span>
                      )}
                      {verifyStatus === 'verifying' && (
                        <span style={{ color: '#0ea5e9' }}>Verifying presence in Azure AD...</span>
                      )}
                      {verifyStatus === 'verified' && (
                        <span style={{ color: '#16a34a' }}>✅ User verified: <strong>{verifiedName}</strong></span>
                      )}
                      {verifyStatus === 'notfound' && (
                        <span style={{ color: '#dc2626' }}>❌ User not found in Azure AD. Check the email.</span>
                      )}
                      {verifyStatus === 'error' && (
                        <span style={{ color: '#dc2626' }}>❌ Verification error: {verifyError}</span>
                      )}
                    </div>

                    {verifyStatus === 'verified' && (
                      <div style={{ marginTop: 10 }}>
                        <input
                          type="email"
                          placeholder="Alternative email to receive reset (required)"
                          value={formData.alternativeEmail}
                          onChange={(e) => setFormData({ ...formData, alternativeEmail: e.target.value })}
                          style={{ ...styles.input }}
                          required
                        />
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                          The reset password will be sent to both the requester's primary email (if applicable) and this alternative email.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {formData.onBehalf === 'Self' && (
                  <input
                    type="email"
                    placeholder="Alternative email (required) to receive reset"
                    value={formData.alternativeEmail}
                    onChange={(e) => setFormData({ ...formData, alternativeEmail: e.target.value })}
                    style={{ ...styles.input, flex: 1 }}
                    required
                  />
                )}
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                Choose who the password reset is for. If "Other", provide their company email and click Verify.
              </div>
            </div>
          )}

          {/* Admin Access note */}
          {formData.category === 'Admin Access' && (
            <>
              {groupsLoading ? (
                <div style={{ marginTop: 12, color: '#6b7280' }}>Checking access...</div>
              ) : isDeviceAdmin ? (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: '#fffbeb',
                  borderRadius: 8,
                  border: '1px solid #fef3c7',
                  color: '#92400e'
                }}>
                  <strong>You already have device admin access.</strong>
                  <div style={{ marginTop: 6 }}>
                    Your account already have admin access, so creating an Admin Access ticket is disabled.
                  </div>
                </div>
              ) : (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1px solid #e6f0ff',
                  color: '#064e3b'
                }}>
                  <strong>Need Admin Access?</strong>
                  <div style={{ marginTop: 6 }}>Create an Admin Access ticket</div>
                </div>
              )}
            </>
          )}

          

          {/* NEW: Dynamic Attachments (if enabled for this category) */}
          {selectedCategoryConfig?.features?.attachments?.enabled && (
            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>
                Attachments {selectedCategoryConfig.features.attachments.required && <span style={{ color: '#ef4444' }}>*</span>}
              </label>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={() => setIsDragging(false)}
                style={{
                  border: isDragging ? '2px dashed #2563eb' : '1px dashed #e6e9ee',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: isDragging ? '#eff6ff' : '#fff',
                  cursor: 'pointer'
                }}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                role="button"
                tabIndex={0}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#1f2937' }}>
                    Drag & drop files here or click to browse
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                    Supported: images, PDF, Word, Excel, txt, zip. Max {formatBytes(MAX_FILE_SIZE)} each. Up to {MAX_FILES} files.
                  </div>
                </div>

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => handleFilesSelected(e.target.files)}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    style={{
                      padding: '8px 12px',
                      background: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer'
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>

              {attachments.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {attachments.map((att, idx) => (
                      <div
                        key={`${att.file.name}-${idx}`}
                        style={{
                          width: 180,
                          border: '1px solid #e6e9ee',
                          borderRadius: 8,
                          padding: 8,
                          background: '#ffffff',
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center',
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ width: 44, height: 44, flex: '0 0 44px' }}>
                          {att.preview ? (
                            <img
                              src={att.preview}
                              alt={att.file.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                            />
                          ) : (
                            <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', borderRadius: 6, fontSize: 12 }}>
                              {fileTypeLabel(att.file.type, att.file.name)}
                            </div>
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {att.file.name}
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{formatBytes(att.file.size)}</div>

                          {att.uploading && (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ height: 8, background: '#f3f4f6', borderRadius: 6 }}>
                                <div style={{ width: `${att.progress}%`, height: '100%', background: '#2563eb', borderRadius: 6 }} />
                              </div>
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{att.progress}%</div>
                            </div>
                          )}
                          {att.error && (
                            <div style={{ marginTop: 6, color: '#dc2626', fontSize: 12 }}>{att.error}</div>
                          )}
                          {att.uploaded && (
                            <div style={{ marginTop: 6, color: '#16a34a', fontSize: 12 }}>Uploaded</div>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(idx)}
                            title="Remove"
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: '#ef4444',
                              fontSize: 16,
                              padding: 4
                            }}
                          >
                            ✖
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button type="button" onClick={handleClearAllAttachments} style={{ ...styles.ghostButton }}>Clear all</button>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                {selectedCategoryConfig.features.attachments.required 
                  ? 'Attachments are required for this category.'
                  : 'Attach supporting documents if needed.'}
              </div>
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows="5"
              style={styles.textarea}
              placeholder="Describe your issue..."
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              type="submit"
              style={{ ...styles.primaryButton, flex: 1 }}
              disabled={loading || disableCreateBecauseDeviceAdmin}
              title={
                disableCreateBecauseDeviceAdmin
                  ? 'You already have device admin access — cannot create Admin Access ticket'
                  : undefined
              }
            >
              {loading ? 'Creating...' : 'Create Ticket'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{ ...styles.ghostButton }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {modal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3 style={{ marginBottom: 12 }}>{modal.title}</h3>
            <p style={{ marginBottom: 20 }}>{modal.message}</p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button
                onClick={handleCloseModal}
                style={{
                  padding: '10px 18px',
                  background: modal.type === 'success' ? '#27ae60' : '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                OK
              </button>

              {modal.type === 'success' && createdTicketId && (
                <button
                  onClick={handleViewTicket}
                  style={{
                    padding: '10px 18px',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
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
  );
}

const styles = {
  pageWrap: { padding: '2rem', maxWidth: 820, margin: '0 auto', boxSizing: 'border-box' },
  card: {
    background: 'white',
    padding: '1.25rem 1.5rem',
    borderRadius: 12,
    boxShadow: '0 6px 30px rgba(2,6,23,0.08)',
    boxSizing: 'border-box',
    overflow: 'hidden'
  },
  headerRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 10,
    background: '#eef2ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    color: '#4338ca',
    fontSize: 18
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    alignItems: 'start',
    marginBottom: 12
  },
  field: { marginBottom: 12 },
  label: {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    color: '#374151',
    fontWeight: 600
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e6e9ee',
    borderRadius: 8,
    background: '#fafafa',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e6e9ee',
    borderRadius: 8,
    background: 'white',
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    minHeight: 140,
    maxHeight: 300,
    padding: '12px',
    border: '1px solid #e6e9ee',
    borderRadius: 8,
    background: 'white',
    resize: 'vertical',
    overflow: 'auto',
    boxSizing: 'border-box'
  },
  primaryButton: {
    background: '#2563eb',
    color: 'white',
    padding: '12px 18px',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700
  },
  ghostButton: {
    background: '#f3f4f6',
    color: '#374151',
    padding: '12px 18px',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10000
  },
  modalBox: {
    background: "white",
    padding: "28px",
    borderRadius: "10px",
    width: "380px",
    textAlign: "center",
    boxShadow: "0 6px 24px rgba(2,6,23,0.12)"
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999
  },
  passwordBox: {
    background: 'white',
    padding: '2rem',
    borderRadius: '10px',
    textAlign: 'center',
    width: '400px',
    boxShadow: '0 8px 30px rgba(2,6,23,0.12)',
    position: 'relative'
  },
  passwordText: {
    fontFamily: 'monospace',
    fontSize: '1.1rem',
    background: '#f1f1f1',
    padding: '10px',
    borderRadius: '6px'
  },
  copyButton: {
    marginTop: '1rem',
    background: '#3498db',
    color: 'white',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  modalCloseButton: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    background: 'transparent',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer'
  }
};

export default CreateTicket;