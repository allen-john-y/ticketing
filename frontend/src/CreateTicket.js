import React, { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// Notification Popup Component
function NotificationPopup({ title, message, onClose }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: 'white',
        padding: '1.5rem 2rem',
        borderRadius: '10px',
        width: '400px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        position: 'relative',
        textAlign: 'center'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'transparent',
          border: 'none',
          fontSize: '1.2rem',
          cursor: 'pointer'
        }}>✖</button>

        <h2 style={{ marginBottom: '0.5rem' }}>{title}</h2>
        <p>{message}</p>
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
  const [notification, setNotification] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read'], account: accounts[0] });

      const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      const displayName = userRes.data.displayName || 'User';
      const userEmail = userRes.data.mail?.trim() || userRes.data.userPrincipalName?.trim() || accounts[0]?.username?.trim();

      const ticketData = {
        category: formData.category,
        description: formData.description,
        priority: formData.priority,
        userId: accounts[0]?.localAccountId,
        userName: displayName,
        userEmail,
        status: 'Open'
      };

      const response = await axios.post('https://ticketing-production-5334.up.railway.app/tickets', ticketData, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      // Show notification instead of alert
      setNotification({
        title: '✅ Ticket Created',
        message: `Ticket for ${displayName} (${userEmail}) created successfully!`
      });

      if (formData.category === 'Password Reset' && response.data.newPassword) {
        setNewPassword(response.data.newPassword);
        setShowPasswordPopup(true);
      }

      navigate('/', { state: { refresh: true } });
    } catch (error) {
      console.error('Error creating ticket:', error);

      setNotification({
        title: '⚠️ Ticket Failed',
        message: 'Failed to create ticket. Please try again.'
      });
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>➕ Create New Ticket</h1>
        <form onSubmit={handleSubmit}>
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

      {showPasswordPopup &&
        <NotificationPopup
          title="🎉 Ticket Created!"
          message={`Your new password: ${newPassword}`}
          onClose={() => setShowPasswordPopup(false)}
        />
      }

      {notification &&
        <NotificationPopup
          title={notification.title}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      }
    </div>
  );
}

export default CreateTicket;
