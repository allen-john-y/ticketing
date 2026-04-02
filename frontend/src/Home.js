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
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (location.state?.refresh) {
      setRefreshKey(prev => prev + 1);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    const fetchData = async () => {
      if (!accounts[0]) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

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
          setIsLoading(false);
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
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey, setProfilePhoto]);

  const filteredTickets = authority === 'admin' && showMyTickets
    ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
    : tickets;

  const openTickets = filteredTickets.filter(t => t.status === 'Open' || t.status === 'Pending');
  const closedTickets = filteredTickets.filter(t => t.status === 'Closed');
  const inProgressTickets = filteredTickets.filter(t => t.status === 'Waiting for approval');

  const highPriority = filteredTickets.filter(t => t.priority === 'High' && t.status !== 'Closed');
  const mediumPriority = filteredTickets.filter(t => t.priority === 'Medium' && t.status !== 'Closed');
  const lowPriority = filteredTickets.filter(t => t.priority === 'Low' && t.status !== 'Closed');

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  const AnimatedCounter = ({ value, duration = 900, isLoading }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
      if (isLoading) { setCount(0); return; }
      const steps = 50;
      const stepDuration = duration / steps;
      let currentStep = 0;
      const interval = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        setCount(Math.floor(value * easeProgress));
        if (currentStep >= steps) { clearInterval(interval); setCount(value); }
      }, stepDuration);
      return () => clearInterval(interval);
    }, [value, duration, isLoading]);

    if (isLoading) return <span className="skel-num" />;
    return <span>{formatNumber(count)}</span>;
  };

  const PieChart = ({ data, colors, size = 160, isLoading }) => {
    const [animatedData, setAnimatedData] = useState(data.map(d => ({ ...d, value: 0 })));
    const dataString = useMemo(() => JSON.stringify(data), [data]);

    useEffect(() => {
      setAnimatedData(data.map(d => ({ ...d, value: 0 })));
      const duration = 900;
      const steps = 55;
      const stepDuration = duration / steps;
      let currentStep = 0;
      const interval = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        setAnimatedData(data.map(d => ({ ...d, value: d.value * easeProgress })));
        if (currentStep >= steps) { clearInterval(interval); setAnimatedData(data); }
      }, stepDuration);
      return () => clearInterval(interval);
    }, [dataString, data]);

    if (isLoading) {
      return (
        <div style={{ width: size, height: size, borderRadius: '50%' }} className="skel-circle" />
      );
    }

    const total = animatedData.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '13px', fontWeight: '500' }}>
        No data
      </div>
    );

    let currentAngle = -90;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2;
    const innerR = r * 0.55;

    const segments = animatedData.map((d, i) => {
      const angle = (d.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1o = cx + r * Math.cos(startRad);
      const y1o = cy + r * Math.sin(startRad);
      const x2o = cx + r * Math.cos(endRad);
      const y2o = cy + r * Math.sin(endRad);
      const x1i = cx + innerR * Math.cos(endRad);
      const y1i = cy + innerR * Math.sin(endRad);
      const x2i = cx + innerR * Math.cos(startRad);
      const y2i = cy + innerR * Math.sin(startRad);
      const largeArc = angle > 180 ? 1 : 0;

      const path = `M ${x1o} ${y1o} A ${r} ${r} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;

      return <path key={i} d={path} fill={colors[i]} />;
    });

    const formattedTotal = formatNumber(Math.round(total));

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments}
        <circle cx={cx} cy={cy} r={innerR - 1} fill="#1f2937" />
        <text 
          x={cx} 
          y={cy - 6} 
          textAnchor="middle" 
          fill="#f3f4f6" 
          fontSize={formattedTotal.length > 4 ? "16" : "20"} 
          fontWeight="700" 
          fontFamily="inherit"
        >
          {formattedTotal}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#9ca3af" fontSize="10" fontFamily="inherit" letterSpacing="0.06em">TOTAL</text>
      </svg>
    );
  };

  const statusData = [
    { label: 'Open / Pending', value: openTickets.length },
    { label: 'Waiting for approval', value: inProgressTickets.length },
    { label: 'Closed', value: closedTickets.length }
  ];
  const statusColors = ['#f59e0b', '#3b82f6', '#10b981'];

  const priorityData = [
    { label: 'High', value: highPriority.length },
    { label: 'Medium', value: mediumPriority.length },
    { label: 'Low', value: lowPriority.length }
  ];
  const priorityColors = ['#ef4444', '#f59e0b', '#10b981'];

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="hd-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        * { 
          box-sizing: border-box; 
          margin: 0; 
          padding: 0; 
        }

        body {
          margin: 0;
          padding: 0;
          background: #0f172a;
        }

        .hd-root {
          min-height: 100vh;
          width: 100%;
          background: linear-gradient(135deg, #0f172a 0%, #1a1f35 100%);
          font-family: 'Inter', sans-serif;
          color: #f3f4f6;
        }

        /* ── Skeleton ── */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .skel {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          animation: pulse 1.6s ease-in-out infinite;
        }
        .skel-num {
          display: inline-block;
          width: 48px;
          height: 32px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          animation: pulse 1.6s ease-in-out infinite;
          vertical-align: middle;
        }
        .skel-circle {
          background: rgba(255, 255, 255, 0.1);
          animation: pulse 1.6s ease-in-out infinite;
        }
        .skel-text {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          animation: pulse 1.6s ease-in-out infinite;
        }

        /* ── Layout ── */
        .hd-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        /* ── Header ── */
        .hd-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2.5rem;
          padding: 2rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          backdrop-filter: blur(10px);
        }

        .hd-header-left {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .hd-profile-photo {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #1f2937);
          border: 2px solid rgba(59, 130, 246, 0.3);
          object-fit: cover;
          flex-shrink: 0;
        }

        .hd-profile-placeholder {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #1f2937);
          border: 2px solid rgba(59, 130, 246, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 700;
          color: #3b82f6;
          flex-shrink: 0;
        }

        .hd-greeting-wrap {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .hd-date {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #9ca3af;
        }

        .hd-greeting {
          font-size: 24px;
          font-weight: 700;
          color: #f3f4f6;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .hd-greeting-skel {
          width: 280px;
          height: 32px;
        }

        .hd-admin-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0.5rem 1rem;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          color: #60a5fa;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* ── Admin toggle ── */
        .hd-toggle-wrap {
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          backdrop-filter: blur(10px);
        }

        .hd-toggle-label {
          font-size: 14px;
          font-weight: 500;
          color: #e5e7eb;
          cursor: pointer;
          user-select: none;
        }

        .hd-switch {
          position: relative;
          width: 44px;
          height: 24px;
          flex-shrink: 0;
        }
        .hd-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .hd-switch-track {
          position: absolute;
          inset: 0;
          background: #374151;
          border-radius: 24px;
          transition: background 0.2s;
          cursor: pointer;
        }
        .hd-switch input:checked + .hd-switch-track { background: #3b82f6; }
        .hd-switch-track::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 3px;
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
        }
        .hd-switch input:checked + .hd-switch-track::after { transform: translateX(20px); }

        /* ── Stat Cards ── */
        .hd-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .hd-stat {
          background: rgba(255, 255, 255, 0.05);
          padding: 1.75rem;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        }

        .hd-stat::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          transition: left 0.5s;
        }

        .hd-stat:hover::before {
          left: 100%;
        }

        .hd-stat-open {
          border: 2px solid rgba(245, 158, 11, 0.3);
        }
        .hd-stat-open:hover {
          background: rgba(245, 158, 11, 0.1);
          border-color: rgba(245, 158, 11, 0.6);
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.2);
          transform: translateY(-4px);
        }

        .hd-stat-awaiting {
          border: 2px solid rgba(59, 130, 246, 0.3);
        }
        .hd-stat-awaiting:hover {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.6);
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.2);
          transform: translateY(-4px);
        }

        .hd-stat-closed {
          border: 2px solid rgba(16, 185, 129, 0.3);
        }
        .hd-stat-closed:hover {
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.6);
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
          transform: translateY(-4px);
        }

        .hd-stat-high {
          border: 2px solid rgba(239, 68, 68, 0.3);
        }
        .hd-stat-high:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.6);
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);
          transform: translateY(-4px);
        }

        .hd-stat-accent {
          width: 36px;
          height: 4px;
          border-radius: 2px;
          margin-bottom: 1.25rem;
        }

        .hd-stat-val {
          font-size: 42px;
          font-weight: 800;
          color: #f3f4f6;
          letter-spacing: -0.03em;
          line-height: 1;
          font-family: 'Inter', monospace;
          margin-bottom: 12px;
        }

        .hd-stat-label {
          font-size: 13px;
          font-weight: 600;
          color: #9ca3af;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .hd-stat-skel-val {
          width: 60px;
          height: 42px;
          margin-bottom: 8px;
        }
        .hd-stat-skel-label {
          width: 90px;
          height: 13px;
        }
        .hd-stat-skel-accent {
          width: 36px;
          height: 4px;
          border-radius: 2px;
          margin-bottom: 1.25rem;
        }

        /* ── Charts ── */
        .hd-charts {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .hd-chart {
          background: rgba(255, 255, 255, 0.05);
          padding: 2rem;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
        }

        .hd-chart-title {
          font-size: 13px;
          font-weight: 700;
          color: #9ca3af;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 1.75rem;
        }

        .hd-chart-inner {
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .hd-legend { 
          flex: 1;
          background: rgba(255, 255, 255, 0.03);
          padding: 0.5rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .hd-legend-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .hd-legend-row:last-child { border-bottom: none; }

        .hd-legend-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .hd-legend-name {
          font-size: 14px;
          color: #d1d5db;
          flex: 1;
          font-weight: 500;
        }

        .hd-legend-count {
          font-size: 18px;
          font-weight: 800;
          font-family: 'Inter', monospace;
          color: #f3f4f6;
        }

        .hd-chart-skel-title {
          width: 150px;
          height: 13px;
          margin-bottom: 1.75rem;
        }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .hd-container {
            padding: 1.5rem;
          }
          .hd-stats {
            gap: 1rem;
          }
          .hd-stat-val {
            font-size: 36px;
          }
          .hd-header {
            flex-direction: column;
            text-align: center;
            gap: 1rem;
          }
        }

        @media (max-width: 768px) {
          .hd-stats {
            grid-template-columns: repeat(2, 1fr);
          }
          .hd-charts {
            grid-template-columns: 1fr;
          }
          .hd-header {
            flex-direction: column;
            text-align: center;
            padding: 1.5rem;
          }
        }

        @media (max-width: 640px) {
          .hd-container {
            padding: 1rem;
          }
          .hd-stats {
            grid-template-columns: 1fr;
          }
          .hd-header {
            flex-direction: column;
            align-items: center;
            gap: 1rem;
          }
          .hd-chart-inner { 
            flex-direction: column;
            text-align: center;
          }
          .hd-legend {
            width: 100%;
          }
          .hd-stat {
            padding: 1.25rem;
          }
          .hd-stat-val {
            font-size: 32px;
          }
        }
      `}</style>

      <div className="hd-container">
        {/* Header */}
        <div className="hd-header">
          <div className="hd-header-left">
            {isLoading ? (
              <>
                <div className="skel" style={{ width: 56, height: 56, borderRadius: '50%' }} />
                <div className="skel hd-greeting-skel" />
              </>
            ) : (
              <>
                {profilePhoto ? (
                  <img src={profilePhoto} alt="Profile" className="hd-profile-photo" />
                ) : (
                  <div className="hd-profile-placeholder">
                    {userName
                      .split(' ')
                      .slice(0, 2)
                      .map(name => name.charAt(0).toUpperCase())
                      .join('')}
                  </div>
                )}
                <div className="hd-greeting-wrap">
                  <div className="hd-date">{today}</div>
                  <div className="hd-greeting">Welcome back, {userName}</div>
                </div>
              </>
            )}
          </div>
          {!isLoading && authority === 'admin' && (
            <div className="hd-admin-badge">
              ⚙️ Admin
            </div>
          )}
        </div>

        {/* Admin toggle */}
        {!isLoading && authority === 'admin' && (
          <div className="hd-toggle-wrap">
            <label className="hd-toggle-label">Show my tickets only</label>
            <label className="hd-switch">
              <input
                type="checkbox"
                id="myTicketsToggle"
                checked={showMyTickets}
                onChange={() => setShowMyTickets(prev => !prev)}
              />
              <span className="hd-switch-track" />
            </label>
          </div>
        )}

        {/* Stats with colored borders */}
        <div className="hd-stats">
          {isLoading ? (
            <>
              <div className="hd-stat" style={{ cursor: 'default', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="skel hd-stat-skel-accent" style={{ background: 'rgba(245, 158, 11, 0.3)' }} />
                <div className="skel hd-stat-skel-val" />
                <div className="skel hd-stat-skel-label" />
              </div>
              <div className="hd-stat" style={{ cursor: 'default', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="skel hd-stat-skel-accent" style={{ background: 'rgba(59, 130, 246, 0.3)' }} />
                <div className="skel hd-stat-skel-val" />
                <div className="skel hd-stat-skel-label" />
              </div>
              <div className="hd-stat" style={{ cursor: 'default', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="skel hd-stat-skel-accent" style={{ background: 'rgba(16, 185, 129, 0.3)' }} />
                <div className="skel hd-stat-skel-val" />
                <div className="skel hd-stat-skel-label" />
              </div>
              <div className="hd-stat" style={{ cursor: 'default', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="skel hd-stat-skel-accent" style={{ background: 'rgba(239, 68, 68, 0.3)' }} />
                <div className="skel hd-stat-skel-val" />
                <div className="skel hd-stat-skel-label" />
              </div>
            </>
          ) : (
            <>
              <div className="hd-stat hd-stat-open" onClick={() => navigate('/tickets', { state: { filter: 'open' } })}>
                <div className="hd-stat-accent" style={{ background: '#f59e0b' }} />
                <div className="hd-stat-val"><AnimatedCounter value={openTickets.length} isLoading={isLoading} /></div>
                <div className="hd-stat-label">Open Tickets</div>
              </div>
              <div className="hd-stat hd-stat-awaiting" onClick={() => navigate('/tickets', { state: { filter: 'progress' } })}>
                <div className="hd-stat-accent" style={{ background: '#3b82f6' }} />
                <div className="hd-stat-val"><AnimatedCounter value={inProgressTickets.length} isLoading={isLoading} /></div>
                <div className="hd-stat-label">Awaiting Approval</div>
              </div>
              <div className="hd-stat hd-stat-closed" onClick={() => navigate('/dashboard')}>
                <div className="hd-stat-accent" style={{ background: '#10b981' }} />
                <div className="hd-stat-val"><AnimatedCounter value={closedTickets.length} isLoading={isLoading} /></div>
                <div className="hd-stat-label">Closed Tickets</div>
              </div>
              <div className="hd-stat hd-stat-high" onClick={() => navigate('/tickets', { state: { filter: 'high' } })}>
                <div className="hd-stat-accent" style={{ background: '#ef4444' }} />
                <div className="hd-stat-val"><AnimatedCounter value={highPriority.length} isLoading={isLoading} /></div>
                <div className="hd-stat-label">High Priority</div>
              </div>
            </>
          )}
        </div>

        {/* Charts */}
        <div className="hd-charts">
          {isLoading ? (
            <>
              <div className="hd-chart">
                <div className="skel hd-chart-skel-title" />
                <div className="hd-chart-inner">
                  <div className="skel-circle" style={{ width: 160, height: 160, borderRadius: '50%', flexShrink: 0 }} />
                  <div className="hd-legend">
                    {[1, 2, 3].map((_, j) => (
                      <div className="hd-legend-row" key={j}>
                        <div className="skel" style={{ width: 12, height: 12, borderRadius: '50%' }} />
                        <div className="skel" style={{ flex: 1, height: 14, borderRadius: 4 }} />
                        <div className="skel" style={{ width: 32, height: 20, borderRadius: 4 }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="hd-chart">
                <div className="skel hd-chart-skel-title" />
                <div className="hd-chart-inner">
                  <div className="skel-circle" style={{ width: 160, height: 160, borderRadius: '50%', flexShrink: 0 }} />
                  <div className="hd-legend">
                    {[1, 2, 3].map((_, j) => (
                      <div className="hd-legend-row" key={j}>
                        <div className="skel" style={{ width: 12, height: 12, borderRadius: '50%' }} />
                        <div className="skel" style={{ flex: 1, height: 14, borderRadius: 4 }} />
                        <div className="skel" style={{ width: 32, height: 20, borderRadius: 4 }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="hd-chart">
                <div className="hd-chart-title">Status Distribution</div>
                <div className="hd-chart-inner">
                  <PieChart data={statusData} colors={statusColors} size={160} isLoading={isLoading} />
                  <div className="hd-legend">
                    {statusData.map((item, idx) => (
                      <div key={idx} className="hd-legend-row">
                        <div className="hd-legend-dot" style={{ background: statusColors[idx] }} />
                        <span className="hd-legend-name">{item.label}</span>
                        <span className="hd-legend-count">
                          <AnimatedCounter value={item.value} isLoading={isLoading} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="hd-chart">
                <div className="hd-chart-title">Priority Breakdown</div>
                <div className="hd-chart-inner">
                  <PieChart data={priorityData} colors={priorityColors} size={160} isLoading={isLoading} />
                  <div className="hd-legend">
                    {priorityData.map((item, idx) => (
                      <div key={idx} className="hd-legend-row">
                        <div className="hd-legend-dot" style={{ background: priorityColors[idx] }} />
                        <span className="hd-legend-name">{item.label} Priority</span>
                        <span className="hd-legend-count">
                          <AnimatedCounter value={item.value} isLoading={isLoading} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;