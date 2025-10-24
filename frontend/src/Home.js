import React, { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';

function Home() {
  const { accounts, instance } = useMsal();
  const location = useLocation();
  const [tickets, setTickets] = useState([]);
  const [authority, setAuthority] = useState('basic');
  const [userName, setUserName] = useState('User');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (location.state?.refresh) {
      setRefreshKey(prev => prev + 1);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    const fetchData = async () => {
      if (!accounts[0]) return;

      try {
        // Acquire token
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });

        // Get user displayName
        const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        setUserName(userRes.data.displayName || 'User');

        // Get groups to check admin
        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('GS_Fortingate_VPN');
        setAuthority(isAdmin ? 'admin' : 'basic');

        // Fetch tickets
        const endpoint = isAdmin
          ? `http://localhost:5000/tickets`
          : `http://localhost:5000/tickets?userId=${accounts[0].localAccountId}`;

        const ticketsRes = await axios.get(endpoint);
        setTickets(ticketsRes.data.reverse()); // Latest first

      } catch (err) {
        console.error('Error:', err);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

  const openTickets = tickets.filter(t => t.status !== 'Closed');

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>

        {/* Welcome and Role */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ color: '#2c3e50' }}>
            Welcome, <span style={{ color: '#3498db' }}>{userName}</span>
          </h1>
          <p>
            <span style={{
              background: authority === 'admin' ? '#27ae60' : '#95a5a6',
              color: 'white', padding: '6px 14px', borderRadius: '20px', fontSize: '0.9rem'
            }}>
              {authority === 'admin' ? 'ADMIN' : 'USER'}
            </span>
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ textAlign: 'center', marginBottom: '2rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <Link to="/create" style={{ textDecoration: 'none' }}>
            <button style={{
              background: '#3498db', color: 'white', border: 'none',
              padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600'
            }}>
              Create New Ticket
            </button>
          </Link>

          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <button style={{
              background: '#9b59b6', color: 'white', border: 'none',
              padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600'
            }}>
              View Closed Tickets
            </button>
          </Link>
        </div>

        {/* Open Tickets */}
        <h2 style={{ color: '#2c3e50', marginBottom: '1rem' }}>
          {authority === 'admin' ? `Open Tickets (${openTickets.length})` : `Your Open Tickets (${openTickets.length})`}
        </h2>

        {openTickets.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '2rem' }}>
            <h3>No open tickets</h3>
            <p>Create a new ticket above</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {openTickets.map(ticket => (
              <Link key={ticket._id} to={`/ticket/${ticket._id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: '#f8f9fa', padding: '1.5rem', borderRadius: '10px',
                  borderLeft: `4px solid ${
                    ticket.priority === 'High' ? '#e74c3c' :
                      ticket.priority === 'Medium' ? '#f39c12' : '#27ae60'
                  }`,
                  transition: '0.2s', cursor: 'pointer'
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eef7ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8f9fa'}
                >
                  <h3 style={{ margin: 0, color: '#2c3e50' }}>
                    #{ticket.ticketNumber} - {ticket.category}
                  </h3>
                  <p style={{ color: '#7f8c8d', margin: '0.5rem 0' }}>{ticket.description}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#27ae60' }}>Status: {ticket.status}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
