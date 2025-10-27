import React, { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link } from 'react-router-dom';
import axios from 'axios';

function Dashboard() {
  const { accounts, instance } = useMsal();
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [authority, setAuthority] = useState('basic');
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
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
        const isAdmin = groups.includes('GS_Fortingate_VPN');
        setAuthority(isAdmin ? 'admin' : 'basic');

        // ✅ Updated endpoints with Render URL
        const endpoint = isAdmin
          ? `https://ticketing-hn59.onrender.com/tickets`
          : `https://ticketing-hn59.onrender.com/tickets?userId=${accounts[0].localAccountId}`;

        const res = await axios.get(endpoint);
        const closedTickets = res.data.filter(t => t.status === 'Closed');
        setTickets(closedTickets.reverse());
        setFilteredTickets(closedTickets.reverse());
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [accounts, instance]);

  const handleCheckboxChange = (e) => {
    const checked = e.target.checked;
    setShowOnlyMine(checked);
    if (checked) {
      const mine = tickets.filter(t => t.userId === accounts[0].localAccountId);
      setFilteredTickets(mine);
    } else {
      setFilteredTickets(tickets);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: '#2c3e50', marginBottom: '1rem' }}>Closed Tickets</h1>

      {authority === 'admin' && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '1rem', color: '#2c3e50' }}>
            <input
              type="checkbox"
              checked={showOnlyMine}
              onChange={handleCheckboxChange}
              style={{ marginRight: '8px', transform: 'scale(1.2)' }}
            />
            Show only my closed tickets
          </label>
        </div>
      )}

      {filteredTickets.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '2rem' }}>
          <h3>No closed tickets</h3>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {filteredTickets.map(ticket => (
            <Link key={ticket._id} to={`/ticket/${ticket._id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: '#f8f9fa',
                  padding: '1.5rem',
                  borderRadius: '10px',
                  borderLeft: `4px solid ${
                    ticket.priority === 'High'
                      ? '#e74c3c'
                      : ticket.priority === 'Medium'
                      ? '#f39c12'
                      : '#27ae60'
                  }`,
                  transition: '0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#eef7ff')}
                onMouseLeave={e => (e.currentTarget.style.background = '#f8f9fa')}
              >
                <h3 style={{ margin: 0, color: '#2c3e50' }}>
                  #{ticket.ticketNumber} - {ticket.category}
                </h3>
                <p style={{ color: '#7f8c8d', margin: '0.5rem 0' }}>{ticket.description}</p>

                {authority === 'admin' && (
                  <>
                    <p style={{ margin: '0.3rem 0', color: '#34495e' }}>
                      <strong>Created by:</strong> {ticket.userName || 'N/A'}
                    </p>
                    <p style={{ margin: '0.3rem 0', color: '#34495e' }}>
                      <strong>Email:</strong> {ticket.userEmail || 'N/A'}
                    </p>
                  </>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.9rem'
                  }}
                >
                  <span style={{ color: '#27ae60' }}>Status: {ticket.status}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
