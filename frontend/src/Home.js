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

  // Format large numbers to be compact
  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  // Animated Counter with number formatting
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

  // Pie Chart with number formatting
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
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px', fontWeight: '500', letterSpacing: '0.02em' }}>
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

    // Format the total number for display
    const formattedTotal = formatNumber(Math.round(total));

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments}
        <circle cx={cx} cy={cy} r={innerR - 1} fill="white" />
        <text 
          x={cx} 
          y={cy - 6} 
          textAnchor="middle" 
          fill="#111827" 
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
  const statusColors = ['#f59e0b', '#1d4ed8', '#10b981'];

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
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .hd-root {
          min-height: 100vh;
          background: #f4f4f0;
          font-family: 'DM Sans', sans-serif;
          color: #111827;
        }

        /* ── Skeleton ── */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        .skel {
          background: #ddd9d0;
          border-radius: 4px;
          animation: pulse 1.6s ease-in-out infinite;
        }
        .skel-num {
          display: inline-block;
          width: 48px;
          height: 30px;
          background: #ddd9d0;
          border-radius: 4px;
          animation: pulse 1.6s ease-in-out infinite;
          vertical-align: middle;
        }
        .skel-circle {
          background: #ddd9d0;
          animation: pulse 1.6s ease-in-out infinite;
        }
        .skel-text {
          background: #ddd9d0;
          border-radius: 3px;
          animation: pulse 1.6s ease-in-out infinite;
        }

        /* ── Layout ── */
        .hd-body {
          max-width: 1280px;
          margin: 0 auto;
          padding: 2.5rem 2rem 4rem;
        }

        /* ── Header ── */
        .hd-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 2.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #d9d5cc;
        }

        .hd-header-left {}

        .hd-date {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #9ca3af;
          margin-bottom: 6px;
        }

        .hd-greeting {
          font-size: 26px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .hd-greeting-skel {
          width: 280px;
          height: 32px;
        }

        .hd-header-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .hd-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 18px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
          border: none;
        }

        .hd-btn-primary {
          background: #000260;
          color: #fff;
        }
        .hd-btn-primary:hover {
          background: #1f2937;
          transform: translateY(-1px);
        }

        .hd-btn-secondary {
          background: #fff;
          color: #111827;
          border: 1px solid #d9d5cc;
        }
        .hd-btn-secondary:hover {
          background: #f9f8f6;
          transform: translateY(-1px);
        }

        .hd-btn-skel {
          width: 120px;
          height: 38px;
          border-radius: 6px;
        }

        /* ── Admin toggle ── */
        .hd-toggle-wrap {
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .hd-toggle-label {
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          user-select: none;
        }

        /* Custom toggle switch */
        .hd-switch {
          position: relative;
          width: 36px;
          height: 20px;
          flex-shrink: 0;
        }
        .hd-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .hd-switch-track {
          position: absolute;
          inset: 0;
          background: #d1d5db;
          border-radius: 20px;
          transition: background 0.2s;
          cursor: pointer;
        }
        .hd-switch input:checked + .hd-switch-track { background: #111827; }
        .hd-switch-track::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 3px;
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
        }
        .hd-switch input:checked + .hd-switch-track::after { transform: translateX(16px); }

        /* ── Stat Cards ── */
        .hd-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: #d9d5cc;
          border: 1px solid #d9d5cc;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 1.5rem;
        }

        .hd-stat {
          background: #fff;
          padding: 1.5rem 1.75rem;
          cursor: pointer;
          transition: background 0.15s;
          position: relative;
        }

        .hd-stat:hover { background: #fafaf8; }

        .hd-stat-accent {
          width: 28px;
          height: 3px;
          border-radius: 2px;
          margin-bottom: 1rem;
        }

        .hd-stat-val {
          font-size: 34px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.03em;
          line-height: 1;
          font-family: 'DM Mono', monospace;
          margin-bottom: 6px;
        }

        .hd-stat-label {
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .hd-stat-skel-val {
          width: 52px;
          height: 34px;
          margin-bottom: 6px;
        }
        .hd-stat-skel-label {
          width: 80px;
          height: 11px;
        }
        .hd-stat-skel-accent {
          width: 28px;
          height: 3px;
          border-radius: 2px;
          margin-bottom: 1rem;
        }

        /* ── Charts ── */
        .hd-charts {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: #d9d5cc;
          border: 1px solid #d9d5cc;
          border-radius: 10px;
          overflow: hidden;
        }

        .hd-chart {
          background: #fff;
          padding: 1.75rem 2rem;
        }

        .hd-chart-title {
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 1.5rem;
        }

        .hd-chart-inner {
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .hd-legend { flex: 1; }

        .hd-legend-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .hd-legend-row:last-child { border-bottom: none; }

        .hd-legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .hd-legend-name {
          font-size: 13px;
          color: #374151;
          flex: 1;
        }

        .hd-legend-count {
          font-size: 15px;
          font-weight: 600;
          font-family: 'DM Mono', monospace;
          color: #111827;
        }

        .hd-chart-skel-title {
          width: 140px;
          height: 11px;
          margin-bottom: 1.5rem;
        }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .hd-stats {
            grid-template-columns: 1fr 1fr;
          }
          .hd-charts {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 600px) {
          .hd-body { padding: 1.5rem 1rem 3rem; }
          .hd-stats { grid-template-columns: 1fr; }
          .hd-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
          .hd-header-actions { width: 100%; }
          .hd-btn { flex: 1; justify-content: center; }
          .hd-chart-inner { flex-direction: column; }
        }
      `}</style>

      <div className="hd-body">
        {/* Header */}
        <div className="hd-header">
          <div className="hd-header-left">
            <div className="hd-date">{today}</div>
            {isLoading ? (
              <div className="skel hd-greeting-skel" />
            ) : (
              <div className="hd-greeting">Good to see you, {userName}</div>
            )}
          </div>

          <div className="hd-header-actions">
            {isLoading ? (
              <>
                <div className="skel hd-btn-skel" />
                <div className="skel hd-btn-skel" />
              </>
            ) : (
              <>
                <Link to="/create" className="hd-btn hd-btn-primary">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  New Ticket
                </Link>
                <Link to="/tickets" className="hd-btn hd-btn-secondary">
                  All Tickets
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Admin toggle */}
        {!isLoading && authority === 'admin' && (
          <div className="hd-toggle-wrap">
            <label className="hd-switch">
              <input
                type="checkbox"
                id="myTicketsToggle"
                checked={showMyTickets}
                onChange={() => setShowMyTickets(prev => !prev)}
              />
              <span className="hd-switch-track" />
            </label>
            <label htmlFor="myTicketsToggle" className="hd-toggle-label">
              My tickets only
            </label>
          </div>
        )}

        {/* Stats */}
        <div className="hd-stats">
          {isLoading ? (
            [
              { color: '#f59e0b' },
              { color: '#1d4ed8' },
              { color: '#10b981' },
              { color: '#ef4444' }
            ].map((s, i) => (
              <div className="hd-stat" key={i} style={{ cursor: 'default' }}>
                <div className="skel hd-stat-skel-accent" style={{ background: s.color, opacity: 0.25 }} />
                <div className="skel hd-stat-skel-val" />
                <div className="skel hd-stat-skel-label" />
              </div>
            ))
          ) : (
            <>
              <div className="hd-stat" onClick={() => navigate('/tickets', { state: { filter: 'open' } })}>
                <div className="hd-stat-accent" style={{ background: '#f59e0b' }} />
                <div className="hd-stat-val"><AnimatedCounter value={openTickets.length} isLoading={isLoading} /></div>
                <div className="hd-stat-label">Open</div>
              </div>
              <div className="hd-stat" onClick={() => navigate('/tickets', { state: { filter: 'progress' } })}>
                <div className="hd-stat-accent" style={{ background: '#1d4ed8' }} />
                <div className="hd-stat-val"><AnimatedCounter value={inProgressTickets.length} isLoading={isLoading} /></div>
                <div className="hd-stat-label">Awaiting Approval</div>
              </div>
              <div className="hd-stat" onClick={() => navigate('/dashboard')}>
                <div className="hd-stat-accent" style={{ background: '#10b981' }} />
                <div className="hd-stat-val"><AnimatedCounter value={closedTickets.length} isLoading={isLoading} /></div>
                <div className="hd-stat-label">Closed</div>
              </div>
              <div className="hd-stat" onClick={() => navigate('/tickets', { state: { filter: 'high' } })}>
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
              {[0, 1].map(i => (
                <div className="hd-chart" key={i}>
                  <div className="skel hd-chart-skel-title" />
                  <div className="hd-chart-inner">
                    <div className="skel-circle" style={{ width: 160, height: 160, borderRadius: '50%', flexShrink: 0 }} />
                    <div className="hd-legend" style={{ flex: 1 }}>
                      {[80, 60, 70].map((w, j) => (
                        <div className="hd-legend-row" key={j}>
                          <div className="skel" style={{ width: 8, height: 8, borderRadius: '50%' }} />
                          <div className="skel" style={{ flex: 1, height: 12, borderRadius: 3 }} />
                          <div className="skel" style={{ width: 24, height: 16, borderRadius: 3 }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="hd-chart">
                <div className="hd-chart-title">Status distribution</div>
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
                <div className="hd-chart-title">Priority breakdown — open only</div>
                <div className="hd-chart-inner">
                  <PieChart data={priorityData} colors={priorityColors} size={160} isLoading={isLoading} />
                  <div className="hd-legend">
                    {priorityData.map((item, idx) => (
                      <div key={idx} className="hd-legend-row">
                        <div className="hd-legend-dot" style={{ background: priorityColors[idx] }} />
                        <span className="hd-legend-name">{item.label}</span>
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