import React, { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// Password Popup Component
function PasswordPopup({ password, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.passwordBox}>
        <h2 style={{ marginBottom: '1rem' }}>🎉 Ticket Created!</h2>
        <p><strong>Your new password:</strong></p>
        <p style={styles.passwordText}>{password}</p>
        <button onClick={handleCopy} style={styles.copyButton}>
          Copy Password
        </button>
        {copied && <p style={{ color: 'green', marginTop: '0.5rem' }}>Copied!</p>}
        <button onClick={onClose} style={styles.modalCloseButton}>✖</button>
      </div>
    </div>
  );
}

function CreateTicket() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();

  // removed phone from formData
  const [formData, setFormData] = useState({ category: '', description: '', priority: 'Medium' });
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  // Modal for success/error messages (replaces window.alert)
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });

  // store created ticket id (if backend returns it) so we can offer "View Ticket"
  const [createdTicketId, setCreatedTicketId] = useState(null);

  // Displayed user info (read-only in the form)
  const [displayName, setDisplayName] = useState(accounts?.[0]?.name || '');
  const [displayEmail, setDisplayEmail] = useState(accounts?.[0]?.username || '');

  // Fetch up-to-date name/email from Graph when component mounts (if possible)
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
        // Silent fail — keep values from accounts if Graph call fails (no interrupt for user)
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

    try {
      // Acquire token for Graph API (and to authenticate backend)
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });

      // Try to get the latest displayName and email (graceful fallback to earlier values)
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
        // ignore, we'll use existing displayName/displayEmail
      }

      // Prepare ticket data (phone removed)
      const ticketData = {
        category: formData.category,
        description: formData.description,
        priority: formData.priority,
        userId: accounts[0]?.localAccountId,
        userName: latestName || accounts[0]?.username,
        userEmail: latestEmail,
        status: 'Open'
      };

      // Post ticket to backend
      const response = await axios.post('https://ticketing-production-5334.up.railway.app/tickets', ticketData, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      // capture returned ticket id (backend may return different property names)
      const id = response?.data?._id || response?.data?.id || response?.data?.ticketId || null;
      if (id) setCreatedTicketId(id);

      // Show success modal instead of alert
      setModal({
        open: true,
        title: 'Ticket Created',
        message: '✅ Ticket created successfully!',
        type: 'success'
      });

      // If password reset, show popup with new password
      if (formData.category === 'Password Reset' && response.data?.newPassword) {
        setNewPassword(response.data.newPassword);
        setShowPasswordPopup(true);
      }
    } catch (error) {
      console.error('Error creating ticket:', error);

      // Show error modal instead of alert
      const message = error?.response?.data?.message || error.message || 'Failed to create ticket.';
      setModal({
        open: true,
        title: 'Failed',
        message: `⚠️ ${message}`,
        type: 'error'
      });
    }

    setLoading(false);
  };

  // Close modal handler: if success and user clicks OK we navigate home; user can also view the ticket
  const handleCloseModal = () => {
    const wasSuccess = modal.type === 'success';
    setModal({ open: false, title: '', message: '', type: 'info' });
    if (wasSuccess) {
      navigate('/', { state: { refresh: true } });
    }
  };

  const handleViewTicket = () => {
    if (createdTicketId) {
      // navigate to the ticket details page
      navigate(`/ticket/${createdTicketId}`);
    } else {
      // fallback: go home to refresh list
      navigate('/', { state: { refresh: true } });
    }
  };

  // small helper to render user's initials as an avatar
  const initials = (displayName || displayEmail || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <div style={styles.pageWrap}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>{displayName || displayEmail || 'Unknown User'}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{displayEmail || '—'}</div>
          </div>
          <div style={{ marginLeft: 12, textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Status</div>
            <div style={{ fontWeight: 700, color: '#10b981' }}>Signed in</div>
          </div>
        </div>

        <h1 style={{ textAlign: 'center', margin: '18px 0 8px' }}>➕ Create New Ticket</h1>
        <form onSubmit={handleSubmit}>

          <div style={styles.gridRow}>
            <div style={styles.field}>
              <label style={styles.label}>Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
                style={styles.select}
              >
                <option value="">Select Category</option>
                <option value="Password Reset">🔑 Password Reset</option>
                <option value="Admin Access">👨‍💼 Admin Access</option>
                <option value="Payroll Issue">💰 Payroll Issue</option>
                <option value="Expense Reimbursement">💳 Expense Reimbursement</option>
                <option value="Leave Request">📅 Leave Request</option>
                <option value="Employee Onboarding">👋 Employee Onboarding</option>
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
            <button type="submit" style={{ ...styles.primaryButton, flex: 1 }} disabled={loading}>
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

      {/* Notification Modal (replaces window.alert) */}
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

              {/* Offer to view newly created ticket if the backend returned an ID */}
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

/* --- styles --- */
const styles = {
  pageWrap: {
    padding: '2rem',
    maxWidth: 820,
    margin: '0 auto',
    boxSizing: 'border-box'
  },
  card: {
    background: 'white',
    padding: '1.25rem 1.5rem',
    borderRadius: 12,
    boxShadow: '0 6px 30px rgba(2,6,23,0.08)',
    boxSizing: 'border-box',
    overflow: 'hidden'
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8
  },
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
    top: 0, left: 0,
    width: "100vw", height: "100vh",
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
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
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