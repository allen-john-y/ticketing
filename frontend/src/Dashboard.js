import React, { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

function Dashboard() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [authority, setAuthority] = useState('basic');
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [userName, setUserName] = useState('User');
  const [profilePhoto, setProfilePhoto] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });

        // Fetch user info
        const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        setUserName(userRes.data.displayName || 'User');

        // Try to fetch profile photo
        try {
          const photoRes = await axios.get('https://graph.microsoft.com/v1.0/me/photo/$value', {
            headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
            responseType: 'arraybuffer'
          });

          const u8 = new Uint8Array(photoRes.data);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < u8.length; i += chunkSize) {
            const slice = u8.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, slice);
          }
          const b64 = btoa(binary);
          const contentType = (photoRes.headers && photoRes.headers['content-type']) || 'image/jpeg';
          setProfilePhoto(`data:${contentType};base64,${b64}`);
        } catch (photoErr) {
          // No photo available
        }

        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });

        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('Helpdesk_Admin');
        setAuthority(isAdmin ? 'admin' : 'basic');

        const backendUrl = process.env.REACT_APP_BACKEND_URL;

        const endpoint = isAdmin
          ? `${backendUrl}/tickets`
          : `${backendUrl}/tickets?userId=${accounts[0].localAccountId}`;

        const res = await axios.get(endpoint);

        // Filter closed tickets and sort descending by ticketNumber
        const closedTickets = res.data.filter(t => t.status === 'Closed');
        const sortedClosed = closedTickets.sort((a, b) => (b.ticketNumber || 0) - (a.ticketNumber || 0));

        setTickets(sortedClosed);
        setFilteredTickets(sortedClosed);
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

  // Apply search filter
  const searchFiltered = searchTerm.trim() === ''
    ? filteredTickets
    : filteredTickets.filter(t =>
        (t.ticketNumber || '').toString().includes(searchTerm) ||
        (t.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.userName || '').toLowerCase().includes(searchTerm.toLowerCase())
      );

  const categoryColor = (category) => {
    if (!category) return '#002060';
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin access') || c.includes('admin')) return '#e98404';
    if (c.includes('payroll') || c.includes('expense')) return '#10b981';
    if (c.includes('leave') || c.includes('onboard') || c.includes('onboarding')) return '#ef4444';
    return '#002060';
  };

  const initials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  // Calculate stats
  const totalClosed = tickets.length;
  const myClosed = tickets.filter(t => t.userId === accounts[0]?.localAccountId).length;
  const highPriorityClosed = tickets.filter(t => t.priority === 'High').length;
  const thisMonthClosed = tickets.filter(t => {
    const ticketDate = new Date(t.updatedAt || t.createdAt);
    const now = new Date();
    return ticketDate.getMonth() === now.getMonth() && ticketDate.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        * { box-sizing: border-box; }
        
        .header-bar {
          background: linear-gradient(135deg, #002060 0%, #003380 100%);
          color: white;
          padding: 1.5rem 2rem;
          box-shadow: 0 4px 16px rgba(0, 32, 96, 0.15);
        }
        
        .header-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2rem;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        
        .avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: #002060;
          font-size: 18px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .user-info h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
        }
        
        .user-role {
          display: inline-block;
          background: rgba(233, 132, 4, 0.2);
          color: #e98404;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          margin-top: 4px;
          border: 1px solid rgba(233, 132, 4, 0.3);
        }
        
        .subtitle {
          font-size: 14px;
          opacity: 0.9;
          margin-top: 4px;
        }
        
        .header-actions {
          display: flex;
          gap: 1rem;
        }
        
        .btn-header {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        
        .btn-back {
          background: white;
          color: #002060;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .btn-back:hover {
          background: #f1f5f9;
          transform: translateY(-2px);
        }
        
        .btn-primary {
          background: #e98404;
          color: white;
          box-shadow: 0 4px 12px rgba(233, 132, 4, 0.3);
        }
        
        .btn-primary:hover {
          background: #d17703;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(233, 132, 4, 0.4);
        }
        
        .main-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        
        .stat-card {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          border-left: 4px solid;
          transition: all 0.2s;
        }
        
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
        }
        
        .stat-card.blue { border-left-color: #002060; }
        .stat-card.green { border-left-color: #10b981; }
        .stat-card.orange { border-left-color: #e98404; }
        .stat-card.purple { border-left-color: #8b5cf6; }
        
        .stat-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }
        
        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }
        
        .stat-icon.blue { background: rgba(0, 32, 96, 0.1); color: #002060; }
        .stat-icon.green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .stat-icon.orange { background: rgba(233, 132, 4, 0.1); color: #e98404; }
        .stat-icon.purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
        
        .stat-value {
          font-size: 36px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }
        
        .stat-label {
          font-size: 14px;
          color: #64748b;
          font-weight: 600;
          margin-top: 4px;
        }
        
        .controls-section {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          margin-bottom: 2rem;
        }
        
        .search-box {
          position: relative;
          margin-bottom: 1rem;
        }
        
        .search-input {
          width: 100%;
          padding: 12px 16px 12px 44px;
          border: 2px solid #e2e8f0;
          border-radius: 10px;
          font-size: 15px;
          transition: all 0.2s;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #002060;
          box-shadow: 0 0 0 3px rgba(0, 32, 96, 0.1);
        }
        
        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }
        
        .filters-row {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          align-items: center;
        }
        
        .my-tickets-toggle {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: #f8fafc;
          padding: 10px 16px;
          border-radius: 8px;
          border: 2px solid #e2e8f0;
        }
        
        .my-tickets-toggle input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }
        
        .my-tickets-toggle label {
          font-weight: 600;
          color: #0f172a;
          cursor: pointer;
          user-select: none;
        }
        
        .tickets-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        
        .section-title {
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
        }
        
        .ticket-count {
          font-size: 16px;
          font-weight: 600;
          color: #64748b;
          background: #f1f5f9;
          padding: 6px 12px;
          border-radius: 20px;
        }
        
        .ticket-card {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          border-left: 4px solid;
          margin-bottom: 1rem;
          transition: all 0.2s;
          text-decoration: none;
          display: block;
          color: inherit;
        }
        
        .ticket-card:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        }
        
        .ticket-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }
        
        .ticket-number {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        
        .ticket-status {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          background: #d1fae5;
          color: #065f46;
        }
        
        .ticket-description {
          color: #475569;
          margin: 0.5rem 0;
          line-height: 1.5;
        }
        
        .ticket-meta {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
          font-size: 14px;
          color: #64748b;
          margin-top: 1rem;
        }
        
        .meta-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .priority-badge {
          padding: 4px 10px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 12px;
        }
        
        .priority-high { background: #fee2e2; color: #991b1b; }
        .priority-medium { background: #fed7aa; color: #9a3412; }
        .priority-low { background: #d1fae5; color: #065f46; }
        
        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          color: #94a3b8;
        }
        
        .empty-icon {
          font-size: 64px;
          margin-bottom: 1rem;
        }
        
        @media (max-width: 768px) {
          .header-content {
            flex-direction: column;
            align-items: flex-start;
          }
          
          .header-actions {
            width: 100%;
          }
          
          .btn-header {
            flex: 1;
            justify-content: center;
          }
          
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          .tickets-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }
        }
      `}</style>

      {/* Header - Matching Home.js style */}
      <div className="header-bar">
        <div className="header-content">
          <div className="header-left">
            <div className="avatar">
              {profilePhoto ? (
                <img src={profilePhoto} alt={`${userName} profile`} />
              ) : (
                initials
              )}
            </div>
            <div className="user-info">
              <h1>Closed Tickets Archive</h1>
              <span className="user-role">{authority === 'admin' ? 'ADMINISTRATOR' : 'USER'}</span>
              <div className="subtitle">Review and manage resolved tickets</div>
            </div>
          </div>
          <div className="header-actions">
            <button onClick={() => navigate('/')} className="btn-header btn-back">
              ← Back to Home
            </button>
            <Link to="/create" className="btn-header btn-primary">
              + New Ticket
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-container">
        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card blue">
            <div className="stat-header">
              <div>
                <div className="stat-label">Total Closed</div>
                <div className="stat-value">{totalClosed}</div>
              </div>
              <div className="stat-icon blue">📋</div>
            </div>
          </div>

          {authority === 'admin' && (
            <div className="stat-card green">
              <div className="stat-header">
                <div>
                  <div className="stat-label">My Closed Tickets</div>
                  <div className="stat-value">{myClosed}</div>
                </div>
                <div className="stat-icon green">👤</div>
              </div>
            </div>
          )}

          <div className="stat-card orange">
            <div className="stat-header">
              <div>
                <div className="stat-label">High Priority Closed</div>
                <div className="stat-value">{highPriorityClosed}</div>
              </div>
              <div className="stat-icon orange">⚠️</div>
            </div>
          </div>

          <div className="stat-card purple">
            <div className="stat-header">
              <div>
                <div className="stat-label">Closed This Month</div>
                <div className="stat-value">{thisMonthClosed}</div>
              </div>
              <div className="stat-icon purple">📅</div>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="controls-section">
          <div className="search-box">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="11" cy="11" r="8" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              className="search-input"
              type="text"
              placeholder="Search closed tickets by number, category, description, or user..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {authority === 'admin' && (
            <div className="filters-row">
              <div className="my-tickets-toggle">
                <input
                  type="checkbox"
                  id="showOnlyMineToggle"
                  checked={showOnlyMine}
                  onChange={handleCheckboxChange}
                />
                <label htmlFor="showOnlyMineToggle">
                  Show only my closed tickets
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Tickets List */}
        <div className="tickets-header">
          <h2 className="section-title">
            {showOnlyMine ? 'My Closed Tickets' : 'All Closed Tickets'}
          </h2>
          <div className="ticket-count">
            {searchFiltered.length} {searchFiltered.length === 1 ? 'ticket' : 'tickets'}
          </div>
        </div>

        {searchFiltered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3 style={{ color: '#475569', marginBottom: '0.5rem' }}>No closed tickets found</h3>
            <p style={{ color: '#94a3b8' }}>
              {searchTerm ? 'Try adjusting your search terms' : 'All your tickets are still open or in progress'}
            </p>
          </div>
        ) : (
          <div>
            {searchFiltered.map(ticket => (
              <Link 
                key={ticket._id} 
                to={`/ticket/${ticket._id}`} 
                className="ticket-card" 
                style={{ borderLeftColor: categoryColor(ticket.category) }}
              >
                <div className="ticket-header">
                  <h3 className="ticket-number">#{ticket.ticketNumber} - {ticket.category}</h3>
                  <span className="ticket-status">Closed</span>
                </div>
                
                <p className="ticket-description">{ticket.description}</p>
                
                {authority === 'admin' && (
                  <div style={{ 
                    marginTop: '0.75rem', 
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '14px', 
                    color: '#475569'
                  }}>
                    <div><strong style={{ color: '#0f172a' }}>Created by:</strong> {ticket.userName || '—'}</div>
                    <div><strong style={{ color: '#0f172a' }}>Email:</strong> {ticket.userEmail || '—'}</div>
                  </div>
                )}
                
                <div className="ticket-meta">
                  <div className="meta-item">
                    <span className={`priority-badge priority-${ticket.priority?.toLowerCase()}`}>
                      {ticket.priority} Priority
                    </span>
                  </div>
                  <div className="meta-item">
                    📅 Closed: {new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString()}
                  </div>
                  {ticket.assignedTo && (
                    <div className="meta-item">
                      👤 Assigned to: {ticket.assignedTo}
                    </div>
                  )}
                  {ticket.resolvedBy && (
                    <div className="meta-item">
                      ✓ Resolved by: {ticket.resolvedBy}
                    </div>
                  )}
                  {ticket.closeReason && (
                    <div className="meta-item" style={{ width: '100%', marginTop: '0.5rem' }}>
                      <span style={{ fontWeight: 600 }}>Close reason:</span> {ticket.closeReason}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;