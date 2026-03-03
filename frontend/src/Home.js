import React, { useState, useEffect, useMemo } from 'react';
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
  const [,setProfilePhoto] = useState(null);

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

        const backendBase = process.env.REACT_APP_BACKEND_URL;
        const endpoint = isAdmin
          ? `${backendBase}/tickets`
          : `${backendBase}/tickets?userId=${accounts[0].localAccountId}`;

        const ticketsRes = await axios.get(endpoint);
        const allTickets = ticketsRes.data.reverse();
        setTickets(allTickets);
      } catch (err) {
        console.error('Error fetching tickets:', err);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey, setProfilePhoto]);

  // Filter tickets based on "my tickets" toggle
  const filteredTickets = authority === 'admin' && showMyTickets
    ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
    : tickets;

  // Calculate stats
  const openTickets = filteredTickets.filter(t => t.status === 'Open' || t.status === 'Pending');
  const closedTickets = filteredTickets.filter(t => t.status === 'Closed');
  const inProgressTickets = filteredTickets.filter(t => t.status === 'Waiting for approval');

  // Priority breakdown (open tickets only)
  const highPriority = filteredTickets.filter(t => t.priority === 'High' && t.status !== 'Closed');
  const mediumPriority = filteredTickets.filter(t => t.priority === 'Medium' && t.status !== 'Closed');
  const lowPriority = filteredTickets.filter(t => t.priority === 'Low' && t.status !== 'Closed');

 // const initials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  // Animated Pie Chart Component with smooth loading
  const PieChart = ({ data, colors, size = 180 }) => {
    const [animatedData, setAnimatedData] = useState(data.map(d => ({ ...d, value: 0 })));
    
    // Memoize data string for dependency tracking
    const dataString = useMemo(() => JSON.stringify(data), [data]);
    
    useEffect(() => {
      // Reset to 0 first
      setAnimatedData(data.map(d => ({ ...d, value: 0 })));
      
      // Animate from 0 to actual values
      const duration = 1000; // 1 second animation
      const steps = 60; // 60 frames for smooth animation
      const stepDuration = duration / steps;
      let currentStep = 0;

      const interval = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        
        // Ease-out cubic function for smooth deceleration
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        setAnimatedData(data.map(d => ({
          ...d,
          value: d.value * easeProgress
        })));

        if (currentStep >= steps) {
          clearInterval(interval);
          setAnimatedData(data); // Set to exact values at the end
        }
      }, stepDuration);

      return () => clearInterval(interval);
    }, [dataString, data]); // Include both dataString and data

    const total = animatedData.reduce((sum, d) => sum + d.value, 0);
    
    if (total === 0) return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: '600' }}>
        Loading...
      </div>
    );

    let currentAngle = -90;
    const segments = animatedData.map((d, i) => {
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

  // Animated Counter Component for smooth number animations
  const AnimatedCounter = ({ value, duration = 1000 }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
      const steps = 60;
      const stepDuration = duration / steps;
      let currentStep = 0;

      const interval = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        setCount(Math.floor(value * easeProgress));

        if (currentStep >= steps) {
          clearInterval(interval);
          setCount(value);
        }
      }, stepDuration);

      return () => clearInterval(interval);
    }, [value, duration]);

    return <span>{count}</span>;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        * { box-sizing: border-box; }
        
        /* Main Content Area - No sidebar margin needed anymore */
        .main-content {
          flex: 1;
          width: 100%;
        }

        .content-wrapper {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        /* Page Header */
        .page-header {
          background: white;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 2rem;
        }

        .page-header h1 {
          margin: 0;
          color: #0f172a;
          font-size: 24px;
          font-weight: 700;
        }

        .page-header p {
          margin: 0.5rem 0 0 0;
          color: #64748b;
          font-size: 14px;
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
          border: 1px solid #e2e8f0;
        }

        .my-tickets-toggle input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #002060;
        }

        .my-tickets-toggle label {
          font-weight: 600;
          color: #0f172a;
          cursor: pointer;
          user-select: none;
          font-size: 14px;
        }
        
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
          line-height: 1;
        }
        
        .stat-label {
          font-size: 14px;
          color: #64748b;
          font-weight: 600;
          margin-top: 6px;
        }
        
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
        
        /* Welcome Banner */
        .welcome-banner {
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .welcome-text h2 {
          margin: 0 0 0.5rem 0;
          color: #0f172a;
          font-size: 28px;
          font-weight: 800;
        }

        .welcome-text p {
          margin: 0;
          color: #64748b;
          font-size: 16px;
        }

        .quick-actions {
          display: flex;
          gap: 1rem;
        }

        .quick-action-btn {
          padding: 12px 24px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-create {
          background: #e98404;
          color: white;
          box-shadow: 0 4px 12px rgba(233, 132, 4, 0.3);
        }

        .btn-create:hover {
          background: #d17703;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(233, 132, 4, 0.4);
        }

        .btn-view {
          background: white;
          color: #002060;
          border: 2px solid #002060;
        }

        .btn-view:hover {
          background: #f8fafc;
          transform: translateY(-2px);
        }
        
        @media (max-width: 768px) {
          .content-wrapper {
            padding: 1rem;
          }

          .welcome-banner {
            flex-direction: column;
            text-align: center;
            gap: 1rem;
          }

          .quick-actions {
            width: 100%;
            flex-direction: column;
          }

          .quick-action-btn {
            width: 100%;
            justify-content: center;
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
        }
      `}</style>

      {/* Main Content */}
      <div className="main-content">
        {/* Welcome Banner */}
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Welcome back, {userName}! 👋</h2>
            <p>Track your support tickets and create new requests</p>
          </div>
          <div className="quick-actions">
            <Link to="/create" className="quick-action-btn btn-create">
              <span>+</span> Create Ticket
            </Link>
            <Link to="/tickets" className="quick-action-btn btn-view">
              <span>📋</span> View All Tickets
            </Link>
          </div>
        </div>

        <div className="content-wrapper">
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
                Show statistics for my tickets only
              </label>
            </div>
          )}

          {/* Stats Grid */}
          <div className="stats-grid">
            <div 
              className="stat-card orange"
              onClick={() => navigate('/tickets', { state: { filter: 'open' } })}
            >
              <div className="stat-header">
                <div>
                  <div className="stat-value"><AnimatedCounter value={openTickets.length} /></div>
                  <div className="stat-label">Open Tickets</div>
                </div>
                <div className="stat-icon orange">📝</div>
              </div>
            </div>

            <div 
              className="stat-card blue"
              onClick={() => navigate('/tickets', { state: { filter: 'progress' } })}
            >
              <div className="stat-header">
                <div>
                  <div className="stat-value"><AnimatedCounter value={inProgressTickets.length} /></div>
                  <div className="stat-label">Waiting for approval</div>
                </div>
                <div className="stat-icon blue">⚙️</div>
              </div>
            </div>

            <div 
              className="stat-card green"
              onClick={() => navigate('/dashboard')}
            >
              <div className="stat-header">
                <div>
                  <div className="stat-value"><AnimatedCounter value={closedTickets.length} /></div>
                  <div className="stat-label">Closed Tickets</div>
                </div>
                <div className="stat-icon green">✅</div>
              </div>
            </div>

            <div 
              className="stat-card red"
              onClick={() => navigate('/tickets', { state: { filter: 'high' } })}
            >
              <div className="stat-header">
                <div>
                  <div className="stat-value"><AnimatedCounter value={highPriority.length} /></div>
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
                      <span className="legend-value"><AnimatedCounter value={item.value} /></span>
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
                      <span className="legend-value"><AnimatedCounter value={item.value} /></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;