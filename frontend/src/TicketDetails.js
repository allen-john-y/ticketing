import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts, instance } = useMsal();
  const [ticket, setTicket] = useState(null);
  const [authority, setAuthority] = useState('basic'); // admin or basic
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Determine if user is admin
    const fetchAuthority = async () => {
      if (!accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });

        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('GS_Fortingate_VPN'); // your admin group
        setAuthority(isAdmin ? 'admin' : 'basic');
      } catch (err) {
        console.error(err);
      }
    };

    fetchAuthority();
  }, [accounts, instance]);

  const backendBase = "https://ticketing-production-4240.up.railway.app";

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await axios.get(`${backendBase}/tickets/${id}`);
        setTicket(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchTicket();
  }, [id]);

  const handleCloseTicket = async () => {
    if (!window.confirm('Are you sure you want to close this ticket?')) return;
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/close`);
      alert('✅ Ticket closed successfully');
      navigate('/', { state: { refresh: true } });
    } catch (err) {
      console.error(err);
      alert('⚠️ Failed to close ticket');
    }
    setLoading(false);
  };

  if (!ticket) return <p>Loading...</p>;

  return (
    <div style={{
      padding: '2rem',
      maxWidth: '600px',
      margin: '0 auto',
      background: 'white',
      borderRadius: '10px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
    }}>
      <h1>{ticket.category}</h1>
      <p><strong>Created by:</strong> {ticket.userName}</p>
      <p><strong>Email:</strong> {ticket.userEmail}</p>
      <p><strong>Description:</strong> {ticket.description}</p>
      <p><strong>Priority:</strong> {ticket.priority}</p>
      <p><strong>Status:</strong> {ticket.status}</p>

      {authority === 'admin' && ticket.status !== 'Closed' && (
        <button
          onClick={handleCloseTicket}
          disabled={loading}
          style={{
            marginTop: '1rem',
            background: '#e74c3c',
            color: 'white',
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          {loading ? 'Closing...' : 'Close Ticket'}
        </button>
      )}
    </div>
  );
}

export default TicketDetails;
