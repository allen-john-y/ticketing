import React, { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function CreateTicket() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();

  const backendBase = "https://ticketing-production-5334.up.railway.app";

  const [formData, setFormData] = useState({
    category: '',
    subCategory: '',
    priority: 'Medium',
    description: '',
    onBehalf: 'Self',
    onBehalfEmail: '',
    deliveryEmail: '' // unified field for alternate email
  });

  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });
  const [createdRequestId, setCreatedRequestId] = useState(null);

  // verification states for Others
  const [verifyStatus, setVerifyStatus] = useState('idle'); // idle | verifying | verified | notfound | error
  const [verifiedName, setVerifiedName] = useState('');
  const [verifyError, setVerifyError] = useState('');

  const categoryOptions = {
    "Hardware": [
      "Laptop not booting",
      "Monitor issue",
      "Keyboard/Mouse fail",
      "Peripheral damage"
    ],
    "Software/Application": [
      "Application crash",
      "Feature not responding",
      "Patch failure",
      "License issue"
    ],
    "Network": [
      "LAN/WAN outage",
      "Wi-Fi not connecting",
      "Packet loss",
      "Slow connectivity"
    ],
    "Email & Messaging": [
      "Email not sending/receiving",
      "Outlook freeze",
      "Distribution list issue"
    ],
    "Access & Authentication": [
      "Password reset",
      "Account lockout",
      "MFA failure",
      "SSO login issue"
    ],
    "Security": [
      "Malware detected",
      "Phishing email",
      "Unauthorized access alert"
    ]
  };

  const subCategoryList = formData.category ? categoryOptions[formData.category] || [] : [];

  const handleVerifyOther = async () => {
    const email = (formData.onBehalfEmail || '').trim();
    setVerifyError('');
    setVerifiedName('');
    setVerifyStatus('idle');

    if (!email) {
      setVerifyError("Enter company email to verify.");
      setVerifyStatus('error');
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
        setVerifyStatus('notfound');
        setVerifyError("User not found in Azure AD.");
      }
    } catch (err) {
      console.error("Verification failed:", err);
      setVerifyStatus('error');
      setVerifyError(err?.response?.data?.message || err.message || 'Verification failed.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCreatedRequestId(null);

    // --- PASSWORD RESET FLOW VALIDATION ---
    if (formData.subCategory === 'Password reset') {
      const alt = formData.deliveryEmail.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (formData.onBehalf === 'Self') {
        if (!alt || !emailRegex.test(alt)) {
          setModal({ open: true, title: 'Validation', message: 'Enter valid alternate email to receive temp password.', type: 'error' });
          setLoading(false);
          return;
        }
      }

      if (formData.onBehalf === 'Others') {
        if (verifyStatus !== 'verified') {
          setModal({ open: true, title: 'Validation', message: 'Verify the user before submitting.', type: 'error' });
          setLoading(false);
          return;
        }
        if (!alt || !emailRegex.test(alt)) {
          setModal({ open: true, title: 'Validation', message: 'Enter valid alternate email to receive temp password for target user.', type: 'error' });
          setLoading(false);
          return;
        }
      }
    }

    // --- NORMAL VALIDATION FOR OTHER REQUESTS ---
    if (!formData.category || !formData.subCategory || !formData.description.trim()) {
      setModal({ open: true, title: 'Validation', message: 'Fill all required fields.', type: 'error' });
      setLoading(false);
      return;
    }

    // --- SUBMIT TO BACKEND ---
    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });

      const ticketData = {
        category: formData.category,
        subCategory: formData.subCategory,
        description: formData.description,
        priority: formData.priority,
        userId: accounts[0]?.localAccountId,
        userName: accounts[0]?.name,
        userEmail: accounts[0]?.username,
        status: "Pending",

        ...(formData.subCategory === 'Password reset' && {
          onBehalf: formData.onBehalf,
          onBehalfEmail: formData.onBehalf === 'Others' ? formData.onBehalfEmail.trim() : accounts[0]?.username,
          deliveryEmail: alt,
          returnPasswordToRequester: formData.onBehalf === 'Self'
        })
      };

      const response = await axios.post(`${backendBase}/tickets`, ticket_data, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      const id = response?.data?._id || null;
      if (id) {
        setCreatedRequestId(id);
      }

      setModal({ open: true, title: 'Request Raised', message: 'Request submitted successfully!', type: 'success' });

    } catch (error) {
      console.error('Submit error:', error);
      const msg = error?.response?.data?.message || error.message || 'Failed';
      setModal({ open: true, title: 'Failed', message: `⚠ ${msg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    const wasSuccess = modal.type === 'success';
    setModal({ open: false, title: '', message: '', type: 'info' });
    if (wasSuccess) navigate('/', { state: { refresh: true } });
  };

  // --- AVATAR INITIALS ---
  const initials = (accounts?.[0]?.name || accounts?.[0]?.username || 'U')
    .split(' ')
    .map(s => s[0])
    .slice(0,2)
    .join('')
    .toUpperCase();

  return (
    <div style={styles.pageWrap}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={styles.userNameText}>{accounts?.[0]?.name || 'Unknown User'}</div>
            <div style={styles.userEmailText}>{accounts?.[0]?.username || '—'}</div>
          </div>
        </div>

        <h1 style={styles.pageTitle}>Raise New Request</h1>

        <form onSubmit={handleSubmit}>
          <div style={styles.gridRow}>
            <div>
              <label style={styles.label}>Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value, subCategory: '' }))}
                required
                style={styles.select}
              >
                <option value="">Select Category</option>
                {Object.keys(categoryOptions).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={styles.label}>Sub-Category *</label>
              <select
                value={formData.subCategory}
                onChange={(e) => setFormData(prev => ({ ...prev, subCategory: e.target.value }))}
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
          </div>

          {/* PASSWORD RESET BLOCK */}
          {formData.subCategory === 'Password reset' && (
            <div style={{ marginBottom: 14 }}>
              <label style={styles.label}>On behalf of *</label>
              <select
                value={formData.onBehalf}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData(prev => ({ ...prev, onBehalf: val, onBehalfEmail: '', deliveryEmail: '' }));
                  setVerifyStatus('idle');
                  setVerifiedName('');
                  setVerifyError('');
                }}
                style={{ ...styles.select, maxWidth: 240 }}
              >
                <option value="Self">Self</option>
                <option value="Others">Others</option>
              </select>

              {formData.onBehalf === 'Others' && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Enter company email of target user"
                      value={formData.onBehalfEmail}
                      onChange={(e) => setFormData(prev => ({ ...prev, onBehalfEmail: e.target.value }))}
                      style={{ ...styles.input, flex: 1 }}
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
                  </div>

                  {/* Feedback */}
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {verifyStatus === 'verified' && <span style={{ color: 'green' }}>User verified: <strong>{verifiedName}</strong></span>}
                    {verifyStatus === 'notfound' && <span style={{ color: 'red' }}>{verifyError}</span>}
                    {verifyStatus === 'error' && <span style={{ color: 'red' }}>{verifyError}</span>}
                  </div>

                  {verifyStatus === 'verified' && (
                    <input
                      type="email"
                      placeholder="Alternate email to receive temp password"
                      value={formData.deliveryEmail}
                      onChange={(e) => setFormData(prev => ({ ...prev, deliveryEmail: e.target.value }))}
                      style={{ ...styles.input, marginTop: 8 }}
                      required
                    />
                  )}
                </div>
              )}

              {formData.onBehalf === 'Self' && (
                <input
                  type="email"
                  placeholder="Alternate email to receive temp password"
                  value={formData.deliveryEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, deliveryEmail: e.target.value }))}
                  style={{ ...styles.input, marginTop: 8 }}
                  required
                />
              )}
            </div>
          )}

          <div>
            <label style={styles.label}>Priority *</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              required
              style={styles.select}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          <div>
            <label style={styles.label}>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              required
              rows="5"
              style={styles.textarea}
              placeholder="Describe your issue..."
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button type="submit" style={styles.primaryButton} disabled={loading}>
              {loading ? 'Submitting...' : 'Raise Request'}
            </button>
            <button type="button" onClick={() => navigate('/')} style={styles.ghostButton}>Cancel</button>
          </div>
        </form>
      </div>

      {/* MODAL */}
      {modal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3 style={styles.modalTitle}>{modal.title}</h3>
            <p>{modal.message}</p>
            <button onClick={handleCloseModal} style={styles.primaryButton}>OK</button>
            {modal.type === 'success' && createdRequestId && (
              <button onClick={() => navigate(`/ticket/${createdRequestId}`)} style={styles.secondaryButton}>View Request</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  pageWrap: {
    padding: '2rem',
    maxWidth: 880,
    margin: '0 auto',
    background: '#f8fafc',
    fontFamily: 'Open Sans'
  },
  card: {
    background: 'white',
    padding: 24,
    borderRadius: 16,
    borderTop: '6px solid #e98404',
    boxShadow: '0 8px 25px rgba(0,0,0,0.06)',
  },
  headerRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  avatar: { width: 56, height: 56, borderRadius: 12, background: '#fff7ed', color: '#002060', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Red Hat Display', fontSize: 19 },
  pageTitle: { fontFamily: 'Red Hat Display', color: '#002060', fontSize: 26, fontWeight: 700, marginBottom: 18 },
  label: { fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 5 },
  input: { padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fefefe', fontSize: 14, width: '100%', fontFamily: 'Open Sans' },
  textarea: { padding: 12, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, width: '100%', resize: 'vertical', fontFamily: 'Open Sans', minHeight: 120 },
  select: { padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontSize: 14, width: '100%', fontFamily: 'Open Sans' },
  primaryButton: { background: '#e98404', color: 'white', padding: '12px 20px', borderRadius: 8, border: 'none', fontWeight: 700, fontFamily: 'Red Hat Display', fontSize: 14 },
  secondaryButton: { background: '#002060', color: 'white', padding: '10px 16px', borderRadius: 8, border: 'none', fontWeight: 600, marginLeft: 8, fontFamily: 'Open Sans', fontSize: 13 },
  ghostButton: { background: '#e2e8f0', color: '#002060', padding: '12px 20px', borderRadius: 8, border: 'none', fontWeight: 600, fontFamily: 'Open Sans', fontSize: 14 },
  verifyButton: { background: '#002060', color: 'white', padding: '10px 14px', borderRadius: 8, border: 'none', fontWeight: 600, fontFamily: 'Open Sans', fontSize: 13 },
  modalOverlay: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 10000 },
  modalBox: { background: "white", padding: 26, borderRadius: 12, width: 420, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', textAlign: 'center' },
  modalBox: { background: 'white', padding: 24, borderRadius: 12, width: 390, borderTop: '5px solid #e98404', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', textAlign: 'center', fontFamily: 'Open Sans', },
  modalTitle: { fontFamily: 'Red Hat Display', color: '#002060', fontSize: 18, fontWeight: 700, marginBottom: 10 },
  modalText: { fontSize: 14, color: '#4b5563', marginBottom: 18 }
};

export default CreateTicket;
