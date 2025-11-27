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
    description: ''
  });

  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });
  const [createdTicketId, setCreatedTicketId] = useState(null);

  const [displayName, setDisplayName] = useState(accounts?.[0]?.name || '');
  const [displayEmail, setDisplayEmail] = useState(accounts?.[0]?.username || '');

  // Category → Sub-category map (from manager table)
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

  // Fetch profile from Graph to show name/email
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCreatedTicketId(null);

    // Basic validation
    if (!formData.category) {
      setModal({ open: true, title: 'Validation', message: 'Please select a category.', type: 'error' });
      setLoading(false);
      return;
    }
    if (!formData.subCategory) {
      setModal({ open: true, title: 'Validation', message: 'Please select a sub-category.', type: 'error' });
      setLoading(false);
      return;
    }
    if (!formData.description.trim()) {
      setModal({ open: true, title: 'Validation', message: 'Please provide a short description of the issue.', type: 'error' });
      setLoading(false);
      return;
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
      } catch (err) {
        // ignore, fallback to already set values
      }

      // TODO: later you can plug category+subCategory → auto priority logic here
      const requestData = {
        type: 'IT_REQUEST',   // just a marker – adjust as needed
        category: formData.category,
        subCategory: formData.subCategory,
        description: formData.description,
        priority: formData.priority,
        userId: accounts[0]?.localAccountId,
        userName: latestName || accounts[0]?.username,
        userEmail: latestEmail,
        status: 'Pending'
      };

      const response = await axios.post(`${backendBase}/tickets`, requestData, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      const id = response?.data?._id || response?.data?.id || response?.data?.ticketId || null;
      if (id) setCreatedTicketId(id);

      setModal({
        open: true,
        title: 'Request Raised',
        message: 'Your request has been submitted successfully and is now pending review.',
        type: 'success'
      });
    } catch (error) {
      console.error('Error creating request:', error);
      const message = error?.response?.data?.message || error.message || 'Failed to raise request.';
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

  const subCategoryList = formData.category ? categoryOptions[formData.category] || [] : [];

  return (
    <div style={styles.pageWrap}>
      <div style={styles.card}>
        {/* Header with user info */}
        <div style={styles.headerRow}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={styles.userNameText}>{displayName || displayEmail || 'Unknown User'}</div>
            <div style={styles.userEmailText}>{displayEmail || '—'}</div>
          </div>
          <div style={{ marginLeft: 12, textAlign: 'right' }}>
            <div style={styles.statusLabel}>Status</div>
            <div style={styles.statusValue}>Signed in</div>
          </div>
        </div>

        {/* Main title */}
        <h1 style={styles.pageTitle}>Raise New Request</h1>
        <p style={styles.pageSubtitle}>
          Please select the appropriate category and sub-category for your issue,
          then provide a brief description. This helps IT route your request to the right team.
        </p>

        <form onSubmit={handleSubmit}>
          {/* Category + Subcategory */}
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
                    subCategory: '' // reset sub-category when category changes
                  }));
                }}
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

            <div style={styles.field}>
              <label style={styles.label}>Sub-Category *</label>
              <select
                value={formData.subCategory}
                onChange={(e) => setFormData(prev => ({ ...prev, subCategory: e.target.value }))}
                required
                disabled={!formData.category}
                style={{
                  ...styles.select,
                  background: !formData.category ? '#f3f4f6' : 'white',
                  cursor: !formData.category ? 'not-allowed' : 'pointer'
                }}
              >
                <option value="">
                  {formData.category ? 'Select Sub-Category' : 'Select category first'}
                </option>
                {subCategoryList.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority */}
          <div style={styles.field}>
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
            <div style={styles.helperText}>
              Later we can auto-set this based on category & description if needed.
            </div>
          </div>

          {/* Description */}
          <div style={styles.field}>
            <label style={styles.label}>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              required
              rows="5"
              style={styles.textarea}
              placeholder="Example: My laptop is not booting since morning. I see a black screen with a blinking cursor..."
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              type="submit"
              style={{ ...styles.primaryButton, flex: 1 }}
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Raise Request'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={styles.ghostButton}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Notification Modal */}
      {modal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3 style={styles.modalTitle}>{modal.title}</h3>
            <p style={styles.modalText}>{modal.message}</p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button
                onClick={handleCloseModal}
                style={{
                  padding: '10px 18px',
                  background: modal.type === 'success' ? '#27ae60' : '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'Open Sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
                }}
              >
                OK
              </button>

              {modal.type === 'success' && createdTicketId && (
                <button
                  onClick={handleViewTicket}
                  style={{
                    padding: '10px 18px',
                    background: '#002060',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'Open Sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
                  }}
                >
                  View Request
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --- styles with your colours + fonts --- */
const styles = {
  pageWrap: {
    padding: '2rem',
    maxWidth: 900,
    margin: '0 auto',
    boxSizing: 'border-box',
    fontFamily: 'Open Sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    background: '#f3f4f6'
  },
  card: {
    background: 'white',
    padding: '1.75rem 2rem',
    borderRadius: 16,
    boxShadow: '0 12px 35px rgba(0,0,0,0.08)',
    boxSizing: 'border-box',
    overflow: 'hidden',
    borderTop: '6px solid #e98404'
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: '#e0e7ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    color: '#002060',
    fontSize: 20,
    fontFamily: 'Red Hat Display, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  },
  userNameText: {
    fontSize: 18,
    fontWeight: 700,
    color: '#002060',
    fontFamily: 'Red Hat Display, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  },
  userEmailText: {
    fontSize: 13,
    color: '#6b7280'
  },
  statusLabel: {
    fontSize: 12,
    color: '#6b7280'
  },
  statusValue: {
    fontWeight: 700,
    color: '#16a34a',
    fontSize: 13
  },
  pageTitle: {
    textAlign: 'left',
    margin: '8px 0 4px',
    fontSize: 24,
    color: '#002060',
    fontFamily: 'Red Hat Display, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 18,
    lineHeight: 1.5
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    alignItems: 'start',
    marginBottom: 12
  },
  field: {
    marginBottom: 12
  },
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
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fafafa',
    boxSizing: 'border-box',
    fontFamily: 'Open Sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 14
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: 'white',
    boxSizing: 'border-box',
    fontFamily: 'Open Sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 14
  },
  textarea: {
    width: '100%',
    minHeight: 140,
    maxHeight: 300,
    padding: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: 'white',
    resize: 'vertical',
    overflow: 'auto',
    boxSizing: 'border-box',
    fontFamily: 'Open Sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 14
  },
  primaryButton: {
    background: '#e98404',
    color: 'white',
    padding: '12px 18px',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700,
    fontFamily: 'Red Hat Display, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 14,
    letterSpacing: 0.2
  },
  ghostButton: {
    background: '#f3f4f6',
    color: '#002060',
    padding: '12px 18px',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: 'Open Sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 14
  },
  helperText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10000
  },
  modalBox: {
    background: "white",
    padding: "24px 26px",
    borderRadius: "12px",
    width: "380px",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
    borderTop: '5px solid #e98404'
  },
  modalTitle: {
    marginBottom: 12,
    fontFamily: 'Red Hat Display, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    color: '#002060'
  },
  modalText: {
    marginBottom: 20,
    fontFamily: 'Open Sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 14,
    color: '#4b5563'
  }
};

export default CreateTicket;
