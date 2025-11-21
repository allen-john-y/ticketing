import React, { useState, useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// Password Popup Component (kept minimal, as in your original)
function PasswordPopup({ password, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.passwordBox}>
        <h2 style={{ marginBottom: '1rem' }}>🎉 Password Reset Complete</h2>
        <p><strong>Temporary password:</strong></p>
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

  // API base (set REACT_APP_API_BASE in your frontend env if needed)
  const API_BASE = process.env.REACT_APP_API_BASE || '';

  // form state
  const [formData, setFormData] = useState({ category: '', description: '', priority: 'Medium' });

  // on-behalf state (only relevant for Password Reset)
  const [onBehalfType, setOnBehalfType] = useState(null); // null | 'Self' | 'Others'
  const [onBehalfUser, setOnBehalfUser] = useState(null); // { id, displayName, mail }
  const [alternateEmail, setAlternateEmail] = useState('');

  // search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]); // always keep as array
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef(null);

  // UI
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });
  const [createdTicketId, setCreatedTicketId] = useState(null);

  // password popup
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  // displayed user info
  const [displayName, setDisplayName] = useState(accounts?.[0]?.name || '');
  const [displayEmail, setDisplayEmail] = useState(accounts?.[0]?.username || '');

  // fetch current user profile to show accurate name/email in header
  useEffect(() => {
    let mounted = true;
    const fetchMe = async () => {
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
        // ignore, keep account values
        console.debug('Could not fetch /me:', err?.message || err);
      }
    };
    fetchMe();
    return () => { mounted = false; };
  }, [instance, accounts]);

  // Reset or keep on-behalf state depending on category
  useEffect(() => {
    if (formData.category === 'Password Reset') {
      // don't auto-select Self; require explicit selection by user
      return;
    }
    // clear on-behalf fields for other categories
    setOnBehalfType(null);
    setOnBehalfUser(null);
    setAlternateEmail('');
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
      searchTimeout.current = null;
    }
  }, [formData.category]);

  // Debounced search against backend /users/search
  useEffect(() => {
    const shouldSearch = formData.category === 'Password Reset'
      && onBehalfType === 'Others'
      && searchQuery
      && searchQuery.trim().length > 0;

    if (!shouldSearch) {
      setSearchResults([]);
      setSearching(false);
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
        searchTimeout.current = null;
      }
      return;
    }

    setSearching(true);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const resp = await axios.get(`${API_BASE}/users/search`, {
          params: { query: searchQuery.trim() }
        });

        // Debug: keep developer able to inspect returned shape
        console.debug('/users/search resp.data =', resp.data);

        // Normalize the response into an array of { id, displayName, mail }
        let results = [];
        if (Array.isArray(resp.data)) {
          results = resp.data.map(u => ({
            id: u.id,
            displayName: u.displayName || u.userPrincipalName || u.mail || '',
            mail: u.mail || u.userPrincipalName || ''
          }));
        } else if (resp.data && Array.isArray(resp.data.value)) {
          results = resp.data.value.map(u => ({
            id: u.id,
            displayName: u.displayName || u.userPrincipalName || u.mail || '',
            mail: u.mail || u.userPrincipalName || ''
          }));
        } else {
          // unexpected shape -> empty
          results = [];
        }

        setSearchResults(results);
      } catch (err) {
        console.error('Search error:', err?.response?.data || err.message || err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, onBehalfType, formData.category, API_BASE]);

  const handleSelectSearchResult = (u) => {
    setOnBehalfUser({
      id: u.id,
      displayName: u.displayName || u.mail || '',
      mail: u.mail || ''
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCreatedTicketId(null);
    setShowPasswordPopup(false);
    setNewPassword('');

    try {
      // Validation: when Password Reset, enforce onBehalfType selection and alternateEmail mandatory
      if (formData.category === 'Password Reset') {
        if (!onBehalfType) {
          setModal({ open: true, title: 'Missing selection', message: 'Please choose "On behalf of" (Self or Others).', type: 'error' });
          setLoading(false);
          return;
        }
        if (onBehalfType === 'Others' && !onBehalfUser) {
          setModal({ open: true, title: 'User required', message: 'Please search and select the user from Azure AD when "Others" is chosen.', type: 'error' });
          setLoading(false);
          return;
        }
        if (!alternateEmail || !alternateEmail.trim()) {
          setModal({ open: true, title: 'Alternate email required', message: 'Please provide an alternate email to receive the temporary password.', type: 'error' });
          setLoading(false);
          return;
        }
        // simple email format check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(alternateEmail.trim())) {
          setModal({ open: true, title: 'Invalid email', message: 'Please provide a valid alternate email address.', type: 'error' });
          setLoading(false);
          return;
        }
      }

      // Acquire token silently if possible (for backend auth and Graph calls)
      let tokenAccess = null;
      if (accounts && accounts[0]) {
        try {
          const tokenResp = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });
          tokenAccess = tokenResp?.accessToken;
        } catch (err) {
          console.debug('acquireTokenSilent failed:', err?.message || err);
        }
      }

      // Attempt to get freshest name/email for creator
      let latestName = displayName;
      let latestEmail = displayEmail;
      if (tokenAccess) {
        try {
          const meResp = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokenAccess}` }
          });
          latestName = meResp.data.displayName || latestName || accounts?.[0]?.name || '';
          latestEmail = (meResp.data.mail && meResp.data.mail.trim()) ||
                        (meResp.data.userPrincipalName && meResp.data.userPrincipalName.trim()) ||
                        latestEmail || accounts?.[0]?.username || '';
        } catch (err) {
          // ignore
        }
      }

      // Build ticket payload
      const payload = {
        category: formData.category,
        description: formData.description,
        priority: formData.priority,
        userId: accounts?.[0]?.localAccountId,
        userName: latestName || accounts?.[0]?.username,
        userEmail: latestEmail,
        status: 'Open'
      };

      if (formData.category === 'Password Reset') {
        payload.onBehalfType = onBehalfType;
        payload.onBehalfUserId = onBehalfType === 'Others' ? onBehalfUser?.id : accounts?.[0]?.localAccountId;
        payload.onBehalfUserName = onBehalfType === 'Others' ? onBehalfUser?.displayName : latestName;
        payload.onBehalfUserEmail = onBehalfType === 'Others' ? onBehalfUser?.mail : latestEmail;
        payload.alternateEmail = alternateEmail.trim();
      }

      const headers = {};
      if (tokenAccess) headers.Authorization = `Bearer ${tokenAccess}`;

      const response = await axios.post(`${API_BASE}/tickets`, payload, { headers });

      const created = response.data;
      const id = created?._id || created?.id || null;
      if (id) setCreatedTicketId(id);

      // If backend returned newPassword (Self reset auto), show popup
      if (response.data?.newPassword) {
        setNewPassword(response.data.newPassword);
        setShowPasswordPopup(true);
      }

      // Show appropriate modal
      if (formData.category === 'Password Reset' && onBehalfType === 'Others') {
        setModal({
          open: true,
          title: 'Ticket Created - Pending Approval',
          message: `Ticket created successfully and is awaiting admin approval. Ticket No: ${created?.ticketNumber || '—'}. Once approved, temporary password will be emailed.`,
          type: 'success'
        });
      } else {
        setModal({
          open: true,
          title: 'Ticket Created',
          message: 'Ticket created successfully!',
          type: 'success'
        });
      }

    } catch (err) {
      console.error('Create ticket error:', err?.response?.data || err.message || err);
      const message = err?.response?.data?.message || err?.response?.data?.error || err.message || 'Failed to create ticket.';
      setModal({ open: true, title: 'Failed', message: `⚠️ ${message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    const wasSuccess = modal.type === 'success';
    setModal({ open: false, title: '', message: '', type: 'info' });
    if (wasSuccess) {
      navigate('/', { state: { refresh: true } });
    }
  };

  const handleViewTicket = () => {
    if (createdTicketId) navigate(`/ticket/${createdTicketId}`);
    else navigate('/', { state: { refresh: true } });
  };

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

        <h1 style={{ textAlign: 'center', margin: '18px 0 8px' }}>Create New Ticket</h1>

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

          {/* On-behalf only for Password Reset */}
          {formData.category === 'Password Reset' && (
            <div style={styles.field}>
              <label style={styles.label}>On behalf of *</label>
              <select
                value={onBehalfType || ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setOnBehalfType(val);
                  setOnBehalfUser(null);
                  setAlternateEmail('');
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                required
                style={styles.select}
              >
                <option value="" disabled>-- choose --</option>
                <option value="Self">Self</option>
                <option value="Others">Others</option>
              </select>

              {onBehalfType === 'Others' && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ ...styles.label, marginBottom: 6 }}>Search user (name or email) *</label>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type name or email to search Azure AD..."
                    style={styles.input}
                    autoComplete="off"
                  />
                  {searching && <div style={{ marginTop: 8 }}>Searching...</div>}

                  {/* safe render: only map when array */}
                  {Array.isArray(searchResults) && searchResults.length > 0 && (
                    <div style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', border: '1px solid #e6e9ee', borderRadius: 8, padding: 8, background: 'white' }}>
                      {searchResults.map(u => (
                        <div key={u.id} style={{ padding: 8, cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }} onClick={() => handleSelectSearchResult(u)}>
                          <div style={{ fontWeight: 700 }}>{u.displayName || u.mail || u.id}</div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{u.mail || '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {onBehalfUser && (
                    <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                      <div style={{ fontWeight: 700 }}>{onBehalfUser.displayName}</div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>{onBehalfUser.mail}</div>
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <label style={styles.label}>Alternate email to receive temporary password (mandatory)</label>
                    <input
                      value={alternateEmail}
                      onChange={(e) => setAlternateEmail(e.target.value)}
                      placeholder="someone@example.com"
                      style={styles.input}
                      type="email"
                      required
                    />
                  </div>
                </div>
              )}

              {onBehalfType === 'Self' && (
                <div style={{ marginTop: 12 }}>
                  <label style={styles.label}>Alternate email to receive temporary password (mandatory)</label>
                  <input
                    value={alternateEmail}
                    onChange={(e) => setAlternateEmail(e.target.value)}
                    placeholder="someone@example.com"
                    style={styles.input}
                    type="email"
                    required
                  />
                </div>
              )}
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

      {/* Notification Modal */}
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
    width: "420px",
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