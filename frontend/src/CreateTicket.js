import React, { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function CreateTicket() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ category: '', description: '', priority: 'Medium' });
  const [loading, setLoading] = useState(false);

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

      // Prepare ticket data (remove createdAt — backend will handle)
      const ticketData = {
        category: formData.category,
        description: formData.description,
        priority: formData.priority,
        userId: accounts[0]?.localAccountId,
        userName: displayName,
        status: 'Open'
      };

      // Post ticket to backend
      await axios.post('http://localhost:5000/tickets', ticketData, {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      });

      alert('✅ Ticket created successfully!');
      // Refresh home page to fetch latest tickets (sorted by createdAt descending)
      navigate('/', { state: { refresh: true } });
    } catch (error) {
      console.error('Error creating ticket:', error);
      alert('⚠️ Failed to create ticket.');
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
    </div>
  );
}

export default CreateTicket;
