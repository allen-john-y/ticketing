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
    onBehalf: 'Self',        // Self or Other
    onBehalfEmail: '',       // for Other: company email to verify
    alternativeEmail: '',    // delivery email (for Self or Other)

    // sub query and other text for Operational & Finance
    subQuery: '',            // e.g. Salary, Reimbursement, Invoice issue...
    otherSubQueryText: '',   // free text when subQuery === 'Other'

    // attachment metadata (we only keep the file object in UI)
    attachmentFile: null,
  });

  const [loading, setLoading] = useState(false);
  const [newPassword] = useState("");
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });
  const [createdTicketId, setCreatedTicketId] = useState(null);

  const [displayName, setDisplayName] = useState(accounts?.[0]?.name || '');
  const [displayEmail, setDisplayEmail] = useState(accounts?.[0]?.username || '');

  // verification of "Other" on-behalf email
  const [verifyStatus, setVerifyStatus] = useState('idle');
  const [verifiedName, setVerifiedName] = useState('');
  const [verifyError, setVerifyError] = useState('');

  // device admin group check
  const [isDeviceAdmin, setIsDeviceAdmin] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // ref for file input to allow clearing
  const fileInputRef = useRef(null); // [web:34][web:40]

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

  // fetch groups and detect GS_DeviceAdministrator membership
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

  // verify "Other" on-behalf email
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

    // validation for Operational & Finance subQuery
    if (formData.category === 'Operational & Finance') {
      if (!formData.subQuery) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please select a sub category under Operational & Finance.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
      if (formData.subQuery === 'Other' && !formData.otherSubQueryText.trim()) {
        setModal({
          open: true,
          title: 'Validation',
          message: 'Please describe the issue for Other sub category.',
          type: 'error'
        });
        setLoading(false);
        return;
      }
    }

    // Validation for Password Reset
    if (formData.category === 'Password Reset' && formData.onBehalf === 'Other') {
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

    if (formData.category === 'Password Reset' && formData.onBehalf === 'Self') {
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

      const onBehalf = formData.category === 'Password Reset' ? formData.onBehalf : undefined;
      const onBehalfEmail = formData.category === 'Password Reset'
        ? (formData.onBehalf === 'Other' ? formData.onBehalfEmail.trim() : latestEmail)
        : undefined;

      const returnPasswordToRequester =
        formData.category === 'Password Reset' && formData.onBehalf === 'Self';

      // Build attachment metadata if present
      let attachmentMeta;
      if (formData.attachmentFile) {
        attachmentMeta = {
          fileName: formData.attachmentFile.name,
          fileType: formData.attachmentFile.type || 'application/octet-stream',
        };
      }

      const ticketData = {
        category: formData.category,
        description: formData.description,
        priority: formData.priority,
        userId: accounts[0]?.localAccountId,
        userName: latestName || accounts[0]?.username,
        userEmail: latestEmail,
        status: 'Waiting for approval',
        ...(onBehalf ? { onBehalf } : {}),
        ...(onBehalfEmail ? { onBehalfEmail } : {}),
        ...(formData.alternativeEmail && formData.alternativeEmail.trim()
          ? { deliveryEmail: formData.alternativeEmail.trim() }
          : {}),
        ...(returnPasswordToRequester ? { returnPasswordToRequester: true } : {}),

        // SubQuery for Operational & Finance
        ...(formData.category === 'Operational & Finance' && formData.subQuery
          ? {
              subQuery: formData.subQuery,
              ...(formData.subQuery === 'Other' && formData.otherSubQueryText.trim()
                ? { otherSubQueryText: formData.otherSubQueryText.trim() }
                : {}),
            }
          : {}),

        // Attachment metadata
        ...(attachmentMeta ? { attachment: attachmentMeta } : {}),
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

      setModal({
        open: true,
        title: 'Ticket Created',
        message:
          formData.category === 'Password Reset'
            ? 'Your password reset ticket has been created and is now Waiting for approval category head approval. If approved, the new password will be sent to the delivery email you provided.'
            : 'Ticket created successfully!',
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

  // Determine whether to disable the create button:
  const disableCreateBecauseDeviceAdmin =
    formData.category === 'Admin Access' && isDeviceAdmin;

  // Clear attachment handler
  const handleClearAttachment = () => {
    setFormData(prev => ({ ...prev, attachmentFile: null }));
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // reset file input UI [web:34][web:40]
    }
  };

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
                    ...(val !== 'Operational & Finance'
                      ? { subQuery: '', otherSubQueryText: '' }
                      : {})
                  }));
                  // reset verification when switching category
                  setVerifyStatus('idle');
                  setVerifiedName('');
                  setVerifyError('');
                }}
                required
                style={styles.select}
              >
                <option value="">Select Category</option>
                <option value="Password Reset">🔑 Password Reset</option>
                <option value="Admin Access">🛠️ Admin Access</option>
                <option value="Operational & Finance">💼 Operational & Finance</option>
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

          {/* Password Reset - conditional UI */}
          {formData.category === 'Password Reset' && (
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
                      ...(val === 'Self'
                        ? { onBehalfEmail: '' }
                        : {})
                    }));
                    // reset verification when user toggles between Self/Other
                    setVerifyStatus('idle');
                    setVerifiedName('');
                    setVerifyError('');
                  }}
                  style={{ ...styles.select, flex: '0 0 220px' }}
                >
                  <option value="Self">Self</option>
                  <option value="Other">Other</option>
                </select>

                {/* If Other -> show email + verify */}
                {formData.onBehalf === 'Other' && (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Enter company email of target user"
                        value={formData.onBehalfEmail}
                        onChange={(e) =>
                          setFormData({ ...formData, onBehalfEmail: e.target.value })
                        }
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

                    {/* Verification feedback */}
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      {verifyStatus === 'idle' && (
                        <span style={{ color: '#6b7280' }}>
                          Click Verify to confirm the user exists in Azure AD.
                        </span>
                      )}
                      {verifyStatus === 'verifying' && (
                        <span style={{ color: '#0ea5e9' }}>
                          Verifying presence in Azure AD...
                        </span>
                      )}
                      {verifyStatus === 'verified' && (
                        <span style={{ color: '#16a34a' }}>
                          ✅ User verified: <strong>{verifiedName}</strong>
                        </span>
                      )}
                      {verifyStatus === 'notfound' && (
                        <span style={{ color: '#dc2626' }}>
                          ❌ User not found in Azure AD. Check the email.
                        </span>
                      )}
                      {verifyStatus === 'error' && (
                        <span style={{ color: '#dc2626' }}>
                          ❌ Verification error: {verifyError}
                        </span>
                      )}
                    </div>

                    {/* If verified -> ask for delivery email (alternative) */}
                    {verifyStatus === 'verified' && (
                      <div style={{ marginTop: 10 }}>
                        <input
                          type="email"
                          placeholder="Alternative email to receive reset (required)"
                          value={formData.alternativeEmail}
                          onChange={(e) =>
                            setFormData({ ...formData, alternativeEmail: e.target.value })
                          }
                          style={{ ...styles.input }}
                          required
                        />
                        <div
                          style={{
                            fontSize: 12,
                            color: '#6b7280',
                            marginTop: 6
                          }}
                        >
                          The reset password will be sent to both the requester's primary email
                          (if applicable) and this alternative email.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* If Self -> alternative email mandatory as before */}
                {formData.onBehalf === 'Self' && (
                  <input
                    type="email"
                    placeholder="Alternative email (required) to receive reset"
                    value={formData.alternativeEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, alternativeEmail: e.target.value })
                    }
                    style={{ ...styles.input, flex: 1 }}
                    required
                  />
                )}
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                Choose who the password reset is for. If "Other", provide their company email and
                click Verify.
              </div>
            </div>
          )}

          {/* Admin Access note - ONLY show when user selected Admin Access */}
          {formData.category === 'Admin Access' && (
            <>
              {groupsLoading ? (
                <div style={{ marginTop: 12, color: '#6b7280' }}>Checking access...</div>
              ) : isDeviceAdmin ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: '#fffbeb',
                    borderRadius: 8,
                    border: '1px solid #fef3c7',
                    color: '#92400e'
                  }}
                >
                  <strong>You already have device admin access.</strong>
                  <div style={{ marginTop: 6 }}>
                    Your account already have admin access, so creating an Admin Access ticket is
                    disabled.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #e6f0ff',
                    color: '#064e3b'
                  }}
                >
                  <strong>Need Admin Access?</strong>
                  <div style={{ marginTop: 6 }}>Create an Admin Access ticket</div>
                </div>
              )}
            </>
          )}

          {/* Operational & Finance - sub category + attachment */}
          {formData.category === 'Operational & Finance' && (
            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>Sub Category *</label>
              <select
                value={formData.subQuery}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    subQuery: e.target.value,
                    otherSubQueryText: ''
                  })
                }
                style={styles.select}
                required
              >
                <option value="">Select sub category</option>
                <option value="Salary">Salary</option>
                <option value="Reimbursement">Reimbursement</option>
                <option value="Invoice issue">Invoice issue</option>
                <option value="Tax / GST">Tax / GST</option>
                <option value="Payroll Issue">Payroll Issue</option>
                <option value="Other">Other</option>
              </select>

              {formData.subQuery === 'Other' && (
                <div style={{ marginTop: 8 }}>
                  {/* Single-line text input instead of textarea */}
                  <input
                    type="text"
                    placeholder="Please describe the issue"
                    value={formData.otherSubQueryText}
                    onChange={(e) =>
                      setFormData({ ...formData, otherSubQueryText: e.target.value })
                    }
                    style={styles.input}
                    required
                  />
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <label style={styles.label}>Attachment (optional)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setFormData({ ...formData, attachmentFile: file });
                  }}
                  style={{ fontSize: 13 }}
                />

                {/* Show selected file with remove (X) */}
                {formData.attachmentFile && (
                  <div
                    style={{
                      marginTop: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: '#e5f0ff',
                      fontSize: 13
                    }}
                  >
                    <span>[Uploaded File] {formData.attachmentFile.name}</span>
                    <button
                      type="button"
                      onClick={handleClearAttachment}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontWeight: 700,
                        color: '#dc2626'
                      }}
                      title="Remove attachment"
                    >
                      ✖
                    </button>
                  </div>
                )}

                <div
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    marginTop: 4
                  }}
                >
                  You can attach a supporting document (invoice, payslip, etc.). Currently only file
                  metadata is stored; uploads can be wired later.
                </div>
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

/* --- styles --- (same as before) */
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
