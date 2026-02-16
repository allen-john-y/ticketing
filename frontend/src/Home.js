import React, { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

function Home() {
  const { accounts, instance } = useMsal();
  const location = useLocation();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);
  const [authority, setAuthority] = useState('basic');
  const [userName, setUserName] = useState('User');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMyTickets, setShowMyTickets] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(null);

  useEffect(() => {
    if (location.state?.refresh) {
      setRefreshKey(prev => prev + 1);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    const fetchData = async () => {
      if (!accounts[0]) return;

      let tokenResponse;
      try {
        tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });
      } catch (err) {
        if (err.name === 'InteractionRequiredAuthError') {
          tokenResponse = await instance.acquireTokenPopup({
            scopes: ['User.Read', 'GroupMember.Read.All']
          });
        } else {
          console.error('Token acquisition failed:', err);
          return;
        }
      }

      try {
        const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        setUserName(userRes.data.displayName || 'User');

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

        const backendBase = "https://ticketing-hn59.onrender.com";
        const endpoint = isAdmin
          ? `${backendBase}/tickets`
          : `${backendBase}/tickets?userId=${accounts[0].localAccountId}`;

        const ticketsRes = await axios.get(endpoint);
        setTickets(ticketsRes.data);
      } catch (err) {
        console.error('Error fetching tickets:', err);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

  // Calculate stats based on filtered tickets
  const statsTickets = authority === 'admin' && showMyTickets
    ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
    : tickets;

  const openTickets = statsTickets.filter(t => t.status === 'Open' || t.status === 'Pending');
  const closedTickets = statsTickets.filter(t => t.status === 'Closed');
  const inProgressTickets = statsTickets.filter(t => t.status === 'Waiting for approval');

  const highPriority = statsTickets.filter(t => t.priority === 'High' && t.status !== 'Closed');
  const mediumPriority = statsTickets.filter(t => t.priority === 'Medium' && t.status !== 'Closed');
  const lowPriority = statsTickets.filter(t => t.priority === 'Low' && t.status !== 'Closed');

  const initials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  // Simple Pie Chart Component
  const PieChart = ({ data, colors, size = 180 }) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: '600' }}>
        No data
      </div>
    );

    let currentAngle = -90;
    const segments = data.map((d, i) => {
      const percentage = (d.value / total) * 100;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      const radius = size / 2;
      const x1 = radius + radius * Math.cos(startRad);
      const y1 = radius + radius * Math.sin(startRad);
      const x2 = radius + radius * Math.cos(endRad);
      const y2 = radius + radius * Math.sin(endRad);
      const largeArc = angle > 180 ? 1 : 0;

      return (
        <path
          key={i}
          d={`M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
          fill={colors[i]}
          stroke="white"
          strokeWidth="3"
        />
      );
    });

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments}
      </svg>
    );
  };

  const statusData = [
    { label: 'Open/Pending', value: openTickets.length },
    { label: 'Waiting for approval', value: inProgressTickets.length },
    { label: 'Closed', value: closedTickets.length }
  ];

  const statusColors = ['#e98404', '#002060', '#10b981'];

  const priorityData = [
    { label: 'High', value: highPriority.length },
    { label: 'Medium', value: mediumPriority.length },
    { label: 'Low', value: lowPriority.length }
  ];

  const priorityColors = ['#ef4444', '#e98404', '#10b981'];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        * { box-sizing: border-box; }
        
        /* Header */
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
          display: inline-block;
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
        
        .btn-secondary {
          background: white;
          color: #002060;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .btn-secondary:hover {
          background: #f1f5f9;
          transform: translateY(-2px);
        }
        
        .btn-view {
          background: #10b981;
          color: white;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        
        .btn-view:hover {
          background: #059669;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
        }
        
        /* Main Container */
        .main-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        /* Welcome Banner */
        .welcome-banner {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          padding: 2rem;
          border-radius: 16px;
          margin-bottom: 2rem;
          border: 2px solid #e2e8f0;
          text-align: center;
        }
        
        .welcome-title {
          font-size: 2rem;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 0.5rem;
        }
        
        .welcome-subtitle {
          font-size: 1.1rem;
          color: #475569;
        }
        
        /* Dashboard Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
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
          cursor: pointer;
        }
        
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
        }
        
        .stat-card.orange { border-left-color: #e98404; }
        .stat-card.blue { border-left-color: #002060; }
        .stat-card.green { border-left-color: #10b981; }
        .stat-card.red { border-left-color: #ef4444; }
        
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
        
        .stat-icon.orange { background: rgba(233, 132, 4, 0.1); color: #e98404; }
        .stat-icon.blue { background: rgba(0, 32, 96, 0.1); color: #002060; }
        .stat-icon.green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .stat-icon.red { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        
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
        
        /* Charts Section */
        .charts-section {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 2rem;
          margin-bottom: 2rem;
        }
        
        .chart-card {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
        }
        
        .chart-title {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 1.5rem;
        }
        
        .chart-content {
          display: flex;
          gap: 2rem;
          align-items: center;
        }
        
        .chart-legend {
          flex: 1;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        
        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        
        .legend-label {
          font-size: 14px;
          color: #475569;
          flex: 1;
        }
        
        .legend-value {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }
        
        /* Quick Actions */
        .quick-actions {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
        }
        
        .quick-actions h3 {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 1.5rem 0;
        }
        
        .quick-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }
        
        .quick-btn {
          padding: 1.5rem;
          border-radius: 12px;
          color: white;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }
        
        .quick-btn:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        }
        
        .quick-icon {
          font-size: 32px;
        }
        
        .quick-label {
          font-weight: 700;
          font-size: 16px;
        }
        
        .quick-desc {
          font-size: 13px;
          opacity: 0.9;
        }

        .my-tickets-toggle {
          background: white;
          padding: 1rem 1.5rem;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          margin-bottom: 2rem;
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
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
            text-align: center;
          }
          
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          .charts-section {
            grid-template-columns: 1fr;
          }
          
          .chart-content {
            flex-direction: column;
          }
          
          .quick-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Header */}
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
              <h1>Welcome, {userName}</h1>
              <span className="user-role">{authority === 'admin' ? 'ADMINISTRATOR' : 'USER'}</span>
            </div>
          </div>
          <div className="header-actions">
            <Link to="/create" className="btn-header btn-primary">
              + Create Ticket
            </Link>
            <Link to="/dashboard" className="btn-header btn-secondary">
              Closed Archive
            </Link>
            <Link to="/tickets" className="btn-header btn-view">
              📋 View All Tickets
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-container">
        {/* Welcome Banner */}
        <div className="welcome-banner">
          <h2 className="welcome-title">Dashboard Overview</h2>
          <p className="welcome-subtitle">
            Get insights into your ticket activity and performance metrics
          </p>
        </div>

        {/* Admin: Show only my tickets toggle */}
        {authority === 'admin' && (
          <div className="my-tickets-toggle">
            <input
              type="checkbox"
              id="myTicketsToggle"
              checked={showMyTickets}
              onChange={() => setShowMyTickets(prev => !prev)}
            />
            <label htmlFor="myTicketsToggle">
              Show stats for my tickets only
            </label>
          </div>
        )}

        {/* Stats Grid */}
        <div className="stats-grid">
          <div 
            className="stat-card orange"
            onClick={() => navigate('/tickets', { state: { statusFilter: 'open' } })}
          >
            <div className="stat-header">
              <div>
                <div className="stat-value">{openTickets.length}</div>
                <div className="stat-label">Open Tickets</div>
              </div>
              <div className="stat-icon orange">📝</div>
            </div>
          </div>

          <div 
            className="stat-card blue"
            onClick={() => navigate('/tickets', { state: { statusFilter: 'progress' } })}
          >
            <div className="stat-header">
              <div>
                <div className="stat-value">{inProgressTickets.length}</div>
                <div className="stat-label">Waiting for approval</div>
              </div>
              <div className="stat-icon blue">⚙️</div>
            </div>
          </div>

          <div 
            className="stat-card green"
            onClick={() => navigate('/tickets', { state: { statusFilter: 'closed' } })}
          >
            <div className="stat-header">
              <div>
                <div className="stat-value">{closedTickets.length}</div>
                <div className="stat-label">Closed Tickets</div>
              </div>
              <div className="stat-icon green">✅</div>
            </div>
          </div>

          <div className="stat-card red">
            <div className="stat-header">
              <div>
                <div className="stat-value">{highPriority.length}</div>
                <div className="stat-label">High Priority</div>
              </div>
              <div className="stat-icon red">⚠️</div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="charts-section">
          {/* Status Distribution */}
          <div className="chart-card">
            <h3 className="chart-title">Ticket Status Distribution</h3>
            <div className="chart-content">
              <PieChart data={statusData} colors={statusColors} size={180} />
              <div className="chart-legend">
                {statusData.map((item, idx) => (
                  <div key={idx} className="legend-item">
                    <div className="legend-color" style={{ background: statusColors[idx] }}></div>
                    <span className="legend-label">{item.label}</span>
                    <span className="legend-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Priority Distribution */}
          <div className="chart-card">
            <h3 className="chart-title">Priority Breakdown (Open)</h3>
            <div className="chart-content">
              <PieChart data={priorityData} colors={priorityColors} size={180} />
              <div className="chart-legend">
                {priorityData.map((item, idx) => (
                  <div key={idx} className="legend-item">
                    <div className="legend-color" style={{ background: priorityColors[idx] }}></div>
                    <span className="legend-label">{item.label} Priority</span>
                    <span className="legend-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          <h3>Quick Actions</h3>
          <div className="quick-grid">
            <Link to="/create" className="quick-btn" style={{ background: 'linear-gradient(135deg, #e98404 0%, #f59e0b 100%)' }}>
              <div className="quick-icon">➕</div>
              <div className="quick-label">Create New Ticket</div>
              <div className="quick-desc">Submit a new request</div>
            </Link>

            <Link to="/tickets" className="quick-btn" style={{ background: 'linear-gradient(135deg, #002060 0%, #0039a6 100%)' }}>
              <div className="quick-icon">📋</div>
              <div className="quick-label">View All Tickets</div>
              <div className="quick-desc">Browse and filter tickets</div>
            </Link>

            <Link to="/dashboard" className="quick-btn" style={{ background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' }}>
              <div className="quick-icon">📊</div>
              <div className="quick-label">Closed Archive</div>
              <div className="quick-desc">View resolved tickets</div>
            </Link>

            {authority === 'admin' && (
              <div 
                className="quick-btn" 
                style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)' }}
                onClick={() => setShowMyTickets(!showMyTickets)}
              >
                <div className="quick-icon">👤</div>
                <div className="quick-label">{showMyTickets ? 'All Tickets' : 'My Tickets'}</div>
                <div className="quick-desc">Toggle personal view</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;