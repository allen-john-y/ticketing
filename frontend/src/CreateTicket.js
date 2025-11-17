import React, { useState } from 'react';
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
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '10px',
        textAlign: 'center',
        width: '400px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        position: 'relative'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>🎉 Ticket Created!</h2>
        <p><strong>Your new password:</strong></p>
        <p style={{
          fontFamily: 'monospace',
          fontSize: '1.2rem',
          background: '#f1f1f1',
          padding: '10px',
          borderRadius: '6px'
        }}>{password}</p>
        <button onClick={handleCopy} style={{
          marginTop: '1rem',
          background: '#3498db',
          color: 'white',
          padding: '8px 16px',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer'
        }}>
          Copy Password
        </button>
        {copied && <p style={{ color: 'green', marginTop: '0.5rem' }}>Copied!</p>}
        <button onClick={onClose} style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'transparent',
          border: 'none',
          fontSize: '1.2rem',
          cursor: 'pointer'
        }}>✖</button>
      </div>
    </div>
  );
}

function CreateTicket() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ category: '', description: '', priority: 'Medium' });
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  // Modal for success/error messages (replaces window.alert)
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Acquire token for Graph API
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });

      // Get actual display name from Microsoft Graph
      const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });
      const displayName = userRes.data.displayName || 'User';
      const userEmail = userRes.data.mail?.trim() ||
        userRes.data.userPrincipalName?.trim() ||
        accounts[0]?.username?.trim();

      // Prepare ticket data
      const ticketData = {
        category: formData.category,
        description: formData.description,
        priority: formData.priority,
        userId: accounts[0]?.localAccountId,
        userName: displayName || accounts[0]?.username,
        userEmail,
        status: 'Open'
      };

      // Post ticket to backend
      const response = await axios.post('https://ticketing-production-5334.up.railway.app/tickets', ticketData, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

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

  // Close modal handler: when success, navigate home and optionally refresh
  const handleCloseModal = () => {
    const wasSuccess = modal.type === 'success';
    setModal({ open: false, title: '', message: '', type: 'info' });
    if (wasSuccess) {
      navigate('/', { state: { refresh: true } });
    }
  };

  // derive a username to display in the form (read-only)
  const displayUsername = accounts?.[0]?.username || accounts?.[0]?.name || '';

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>➕ Create New Ticket</h1>
        <form onSubmit={handleSubmit}>

          {/* Username (read-only) */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label>Username</label>
            <input
              value={displayUsername}
              readOnly
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #eee',
                borderRadius: '8px',
                background: '#f9fafb'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label>Category *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
              style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px' }}
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

          <div style={{ marginBottom: '1.5rem' }}>
            <label>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows="4"
              style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px' }}
              placeholder="Describe your issue..."
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label>Priority *</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              required
              style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px' }}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          <button type="submit" style={{
            background: '#3498db', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '8px',
            cursor: 'pointer', width: '100%'
          }} disabled={loading}>
            {loading ? 'Creating...' : 'Create Ticket'}
          </button>
        </form>
      </div>

      {/* Notification Modal (replaces window.alert) */}
      {modal.open && (
        <div style={{
          position: "fixed",
          top: 0, left: 0,
          width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 10000
        }}>
          <div style={{
            background: "white",
            padding: "30px",
            borderRadius: "10px",
            width: "380px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
          }}>
            <h3 style={{ marginBottom: "12px" }}>{modal.title}</h3>
            <p style={{ marginBottom: "20px" }}>{modal.message}</p>

            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                onClick={handleCloseModal}
                style={{
                  padding: "10px 20px",
                  background: modal.type === "success" ? "#27ae60" : "#e74c3c",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer"
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showPasswordPopup &&
        <PasswordPopup
          password={newPassword}
          onClose={() => setShowPasswordPopup(false)}
        />
      }
    </div>
  );
}

export default CreateTicket;