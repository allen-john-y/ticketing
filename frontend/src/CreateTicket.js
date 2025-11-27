import React, { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// ✅ Your Password Popup (same code)
function PasswordPopup({ password, onClose }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
  };
  return (
    <div style={styles.overlay}>
      <div style={styles.passwordBox}>
        <h2 style={{ marginBottom: '1rem', fontFamily: 'Red Hat Display' }}>🎉 Password Reset</h2>
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
  const backendBase = "https://ticketing-production-5334.up.railway.app";

  const [formData, setFormData] = useState({
    category: '',
    subCategory: '',
    description: '',
    priority: 'Medium',
    onBehalf: 'Self',
    onBehalfEmail: '',
    alternativeEmail: ''
  });

  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });
  const [createdTicketId, setCreatedTicketId] = useState(null);
  const [displayName, setDisplayName] = useState(accounts?.[0]?.name || '');
  const [displayEmail, setDisplayEmail] = useState(accounts?.[0]?.username || '');
  const [verifyStatus, setVerifyStatus] = useState('idle');
  const [verifiedName, setVerifiedName] = useState('');
  const [verifyError, setVerifyError] = useState('');

  // ✅ Your Graph profile fetch (same logic)
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

  // ✅ Your verification function (same)
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

    // ✅ Password reset validation (same)
    if (formData.category === 'Password Reset' && formData.onBehalf === 'Other') {
      if (!formData.onBehalfEmail.trim()) {
        setModal({ open: true, title: 'Validation', message: 'Please enter the company email of the person you are requesting the reset for.', type: 'error' });
        setLoading(false);
        return;
      }

      if (verifyStatus !== 'verified') {
        setModal({ open: true, title: 'Validation', message: 'Please verify the target user\'s email using the Verify button before submitting.', type: 'error' });
        setLoading(false);
        return;
      }

      const del = (formData.alternativeEmail || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!del || !emailRegex.test(del)) {
        setModal({ open: true, title: 'Validation', message: 'Please provide a valid alternative email address to receive the reset password for the target user.', type: 'error' });
        setLoading(false);
        return;
      }
    }

    if (formData.category === 'Password Reset' && formData.onBehalf === 'Self') {
      const alt = (formData.alternativeEmail || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!alt) {
        setModal({ open: true, title: 'Validation', message: 'Please provide an alternative email address to receive the reset password.', type: 'error' });
        setLoading(false);
        return;
      }
      if (!emailRegex.test(alt)) {
        setModal({ open: true, title: 'Validation', message: 'Please enter a valid alternative email address.', type: 'error' });
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
        latestEmail = (userRes.data.mail && userRes.data.mail.trim()) ||
                      (userRes.data.userPrincipalName && userRes.data.userPrincipalName.trim()) ||
                      latestEmail || '';
      } catch (err) {}

      const onBeHalf = formData.category === 'Password Reset' ? formData.onBeHalf : undefined;
      const onBeHalfEmail = formData.category === 'Password Reset'
        ? (formData.onBeHalf === 'Other' ? formData.onBeHalfEmail.trim() : latestEmail)
        : undefined;

      const returnPasswordToRequester = formData.category === 'Password Reset' && formData.onBeHalf === 'Self';

      const ticketData = {
        category: formData.category,
        subCategory: formData.subCategory,
        description: formData.description,
        priority: formData.priority,
        userId: accounts[0]?.localAccountId,
        userName: latestName || accounts[0]?.localAccountId,
        userEmail: latestEmail,
        status: "Pending",

        ...(onBeHalf ? { onBeHalf } : {}),
        ...(onBeHalfEmail ? { onBeHalfEmail } : {}),
        ...(formData.onBeHalf === 'Self' ? { alternativeEmail: formData.alternativeEmail.trim() } : {}),
        ...(returnPasswordToRequester ? { returnPasswordToRequester: true } : {})
      };

      const response = await axios.post(`${backendBase}/tickets`, ticketData, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      const id = response?.data?._id || response?.data?.id || null;
      if (id) setCreatedTicketId(id);

      setModal({
        open: true,
        title: 'Request Raised',
        message: formData.subCategory === 'Password Reset'
          ? 'Your password reset request has been raised and pending approval. If approved, temp password will be sent to your alternative email.'
          : 'Request raised successfully!',
        type: 'success'
      });

    } catch (error) {
      console.error('Error raising request:', error);
      const message = error?.response?.data?.message || error.message || 'Failed to create request.';
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

  const initials = (displayName || displayEmail || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <div style={styles.pageWrap}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{displayName || 'Unknown User'}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{displayEmail}</div>
          </div>
        </div>

        <h1 style={styles.pageTitle}>Raise New Request</h1>

        <form onSubmit={handleSubmit}>
          {/* Category */}
          <div>
            <label style={styles.label}>Category *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value, subCategory: '' })}
              required
              style={styles.select}
            >
              <option value="">Select Category</option>
              <option value="Hardware">Hardware</option>
              <option value="Software/Application">Software / Application</option>
              <option value="Network">Network</option>
              <option value="Email & Messaging">Email & Messaging</option>
              <option value="Access & Authentication">Access & Authentication</option>
              <option value="Security">Security</option>
            </select>
          </div>

          {/* Sub Category */}
          <div style={{ marginTop: 12 }}>
            <label style={styles.label}>Sub Category *</label>
            <select
              value={formData.subCategory}
              onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
              required
              disabled={!formData.category}
              style={styles.select}
            >
              <option value="">Select category first</option>
              {subCategoryList.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>

          {/* ✅ PASSWORD RESET FLOW (exact same logic block from your old code) */}
          {formData.subCategory === 'Password reset' && (
            <div style={{ marginTop: 16 }}>

              <label style={styles.label}>On behalf of *</label>

              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>

                <select
                  value={formData.onBehalf}
                  onChange={(e) => {
                    setFormData({ ...formData, onBehalf: e.target.value, onBehalfEmail: '', alternativeEmail: '' });
                    setVerifyStatus('idle');
                    setVerifiedName('');
                    setVerifyError('');
                  }}
                  style={{ ...styles.select, flex: '0 0 200px' }}
                >
                  <option value="Self">Self</option>
                  <option value="Other">Other</option>
                </select>

                {/* If Other → ask company mail + verify */}
                {formData.onBehalf === 'Other' && (
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      placeholder="Enter target user's company email"
                      value={formData.onBehalfEmail}
                      onChange={(e) => setFormData({ ...formData, onBehalfEmail: e.target.value })}
                      style={styles.input}
                      required
                    />
                    <button
                      type="button"
                      onClick={handleVerifyOther}
                      style={styles.verifyButton}
                      disabled={verifyStatus === 'verifying'}
                    >
                      {verifyStatus === 'verifying' ? 'Verifying...' : 'Verify'}
                    </button>

                    {/* Feedback */}
                    {verifyStatus === 'verified' && <p style={{ color: 'green' }}>✅ Verified: {verifiedName}</p>}
                    {verifyStatus === 'notfound' && <p style={{ color: 'red' }}>❌ {verifyError}</p>}
                    {verifyStatus === 'error' && <p style={{ color: 'red' }}>⚠ {verifyError}</p>}

                    {/* Once verified → ask alternate mail */}
                    {verifyStatus === 'verified' && (
                      <input
                        type="email"
                        placeholder="Enter alternate email to receive temp password"
                        value={formData.alternativeEmail}
                        onChange={(e) => setFormData({ ...formData, alternativeEmail: e.target.value })}
                        style={{ ...styles.input, marginTop: 8 }}
                        required
                      />
                    )}
                  </div>
                )}

                {/* If Self → ask alternate mail */}
                {formData.onBehalf === 'Self' && (
                  <input
                    type="email"
                    placeholder="Enter alternate email"
                    value={formData.alternativeEmail}
                    onChange={(e) => setFormData({ ...formData, alternativeEmail: e.target.value })}
                    style={{ ...styles.input, flex: 1 }}
                    required
                  />
                )}
              </div>

            </div>
          )}

          {/* Description */}
          <div style={{ marginTop: 16 }}>
            <label style={styles.label}>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              style={styles.textarea}
              placeholder="Describe your issue"
            />
          </div>

          {/* Priority */}
          <div style={{ marginTop: 12 }}>
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

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            <button type="submit" style={styles.primaryButton} disabled={loading}>
              {loading ? 'Submitting...' : 'Raise Request'}
            </button>
            <button type="button" onClick={() => navigate('/')} style={styles.ghostButton}>Cancel</button>
          </div>

        </form>

        {/* ✅ Show popup when needed */}
        {showPasswordPopup && (
          <PasswordPopup password={newPassword} onClose={() => setShowPasswordPopup(false)} />
        )}

        {/* ✅ Modal */}
        {modal.open && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalBox}>
              <h3 style={styles.modalTitle}>{modal.title}</h3>
              <p style={styles.modalText}>{modal.message}</p>
              <button onClick={handleCloseModal} style={styles.primaryButton}>OK</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  pageWrap: { padding: 24 },
  card: { background: 'white', padding: 24, borderRadius: 14 },
  headerRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 50, height: 50, borderRadius: 10, background: '#e98404', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 700, fontSize: 18 },
  label: { fontWeight: 600, marginBottom: 4, fontSize: 13, fontFamily: 'Open Sans', color: '#002060' },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', marginTop: 6, fontFamily: 'Open Sans', fontSize: 14, width: '100%' },
  select: { padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', width: '100%', fontFamily: 'Open Sans', fontSize: 14 },
  textarea: { padding: 12, borderRadius: 8, border: '1px solid #ccc', width: '100%', resize: 'vertical', minHeight: 120, fontFamily: 'Open Sans', fontSize: 14 },
  primaryButton: { background: '#e98404', color: 'white', padding: '12px 18px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontFamily: 'Red Hat Display' },
  ghostButton: { background: '#002060', color: 'white', padding: '12px 18px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontFamily: 'Open Sans' },
  verifyButton: { background: '#002060', color: 'white', padding: '10px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontFamily: 'Red Hat Display', fontSize: 13, marginLeft: 8 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 },
  modalBox: { background: 'white', padding: 24, borderRadius: 12, width: 390, borderTop: '5px solid #e98404', boxShadow: '0 10px 25px rgba(0,0,0,0.18)', textAlign: 'center', fontFamily: 'Open Sans' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#002060', marginBottom: 8, fontFamily: 'Red Hat Display' },
  modalText: { fontSize: 14, color: '#4b5563', marginBottom: 16 }
};

export default CreateTicket;
