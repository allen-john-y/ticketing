import React, { useState, useEffect, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Home() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);
  const [authority, setAuthority] = useState('basic');
  const [userName, setUserName] = useState('User');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMyTickets, setShowMyTickets] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!accounts[0]) { setIsLoading(false); return; }
      setIsLoading(true);

      let tokenResponse;
      try {
        tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });
      } catch (err) {
        if (err.name === 'InteractionRequiredAuthError') {
          tokenResponse = await instance.acquireTokenPopup({ scopes: ['User.Read', 'GroupMember.Read.All'] });
        } else { setIsLoading(false); return; }
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
            binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize));
          }
          const contentType = (photoRes.headers && photoRes.headers['content-type']) || 'image/jpeg';
          setProfilePhoto(`data:${contentType};base64,${btoa(binary)}`);
        } catch (_) {}

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
        setTickets(ticketsRes.data.reverse());
        setDataLoaded(true);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [accounts, instance, refreshKey]);

  const filteredTickets = authority === 'admin' && showMyTickets
    ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
    : tickets;

  const openTickets      = filteredTickets.filter(t => t.status === 'Open' || t.status === 'Pending');
  const closedTickets    = filteredTickets.filter(t => t.status === 'Closed');
  const inProgressTickets= filteredTickets.filter(t => t.status === 'Waiting for approval');
  const highPriority     = filteredTickets.filter(t => t.priority === 'High' && t.status !== 'Closed');
  const mediumPriority   = filteredTickets.filter(t => t.priority === 'Medium' && t.status !== 'Closed');
  const lowPriority      = filteredTickets.filter(t => t.priority === 'Low' && t.status !== 'Closed');

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000)    return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const AnimatedCounter = ({ value, duration = 900, isLoading }) => {
    const [count, setCount] = useState(0);
    const [hasAnimated, setHasAnimated] = useState(false);
    useEffect(() => {
      if (isLoading) { setCount(0); setHasAnimated(false); return; }
      if (!hasAnimated && value !== undefined) {
        const steps = 50;
        const stepDuration = duration / steps;
        let currentStep = 0;
        const interval = setInterval(() => {
          currentStep++;
          const ease = 1 - Math.pow(1 - currentStep / steps, 3);
          setCount(Math.floor(value * ease));
          if (currentStep >= steps) { clearInterval(interval); setCount(value); setHasAnimated(true); }
        }, stepDuration);
        return () => clearInterval(interval);
      } else if (hasAnimated) setCount(value);
    }, [value, duration, isLoading, hasAnimated]);
    if (isLoading) return <span className="skel-num" />;
    return <span>{formatNumber(count)}</span>;
  };

  const PieChart = ({ data, colors, size = 160, isLoading }) => {
    const [animatedData, setAnimatedData] = useState(data.map(d => ({ ...d, value: 0 })));
    const [hasAnimated, setHasAnimated] = useState(false);
    const dataString = useMemo(() => JSON.stringify(data), [data]);
    useEffect(() => {
      if (isLoading) { setAnimatedData(data.map(d => ({ ...d, value: 0 }))); setHasAnimated(false); return; }
      if (!hasAnimated) {
        setAnimatedData(data.map(d => ({ ...d, value: 0 })));
        const steps = 55; let currentStep = 0;
        const interval = setInterval(() => {
          currentStep++;
          const ease = 1 - Math.pow(1 - currentStep / steps, 3);
          setAnimatedData(data.map(d => ({ ...d, value: d.value * ease })));
          if (currentStep >= steps) { clearInterval(interval); setAnimatedData(data); setHasAnimated(true); }
        }, 900 / steps);
        return () => clearInterval(interval);
      } else setAnimatedData(data);
    }, [dataString, data, isLoading, hasAnimated]);

    if (isLoading) return <div style={{ width: size, height: size, borderRadius: '50%' }} className="skel-circle" />;
    const total = animatedData.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: '500' }}>No data</div>
    );
    let currentAngle = -90;
    const cx = size / 2, cy = size / 2, r = size / 2 - 3, innerR = r * 0.58;
    const segments = animatedData.map((d, i) => {
      const angle = (d.value / total) * 360;
      const startAngle = currentAngle; currentAngle += angle;
      const toRad = a => (a * Math.PI) / 180;
      const x1o = cx + r * Math.cos(toRad(startAngle)), y1o = cy + r * Math.sin(toRad(startAngle));
      const x2o = cx + r * Math.cos(toRad(currentAngle)), y2o = cy + r * Math.sin(toRad(currentAngle));
      const x1i = cx + innerR * Math.cos(toRad(currentAngle)), y1i = cy + innerR * Math.sin(toRad(currentAngle));
      const x2i = cx + innerR * Math.cos(toRad(startAngle)), y2i = cy + innerR * Math.sin(toRad(startAngle));
      const largeArc = angle > 180 ? 1 : 0;
      return <path key={i} d={`M ${x1o} ${y1o} A ${r} ${r} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i} Z`} fill={colors[i]} />;
    });
    const formattedTotal = formatNumber(Math.round(total));
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments}
        <circle cx={cx} cy={cy} r={innerR - 1} fill="#ffffff" />
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#002060" fontSize={formattedTotal.length > 4 ? "16" : "20"} fontWeight="800" fontFamily="'Sora', sans-serif">{formattedTotal}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="sans-serif" letterSpacing="0.08em">TOTAL</text>
      </svg>
    );
  };

  const statusData    = [{ label: 'Open / Pending', value: openTickets.length }, { label: 'Awaiting Approval', value: inProgressTickets.length }, { label: 'Closed', value: closedTickets.length }];
  const statusColors  = ['#e98404', '#002060', '#10b981'];
  const priorityData  = [{ label: 'High', value: highPriority.length }, { label: 'Medium', value: mediumPriority.length }, { label: 'Low', value: lowPriority.length }];
  const priorityColors= ['#ef4444', '#e98404', '#10b981'];

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour  = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ── SHARED STYLES ──────────────────────────────────────────────
  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:   #002060;
      --navy2:  #003090;
      --orange: #e98404;
      --orange2:#f5a623;
      --white:  #ffffff;
      --bg:     #f5f7fa;
      --border: #e2e8f0;
      --text:   #0f172a;
      --muted:  #64748b;
      --light:  #f8fafc;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.45; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .skel {
      background: #e2e8f0;
      border-radius: 8px;
      animation: pulse 1.6s ease-in-out infinite;
    }
    .skel-num {
      display: inline-block; width: 48px; height: 34px;
      background: #e2e8f0; border-radius: 6px;
      animation: pulse 1.6s ease-in-out infinite;
      vertical-align: middle;
    }
    .skel-circle {
      background: #e2e8f0;
      animation: pulse 1.6s ease-in-out infinite;
    }

    .hd-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* ─── HERO BANNER ─── */
    .hd-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 56px 48px 52px;
    }
    .hd-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .hd-hero::before {
      content: '';
      position: absolute;
      left: 35%; bottom: -80px;
      width: 320px; height: 320px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(0,48,144,0.5) 0%, transparent 70%);
      pointer-events: none;
    }
    .hd-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .hd-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .hd-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .hd-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 40px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 12px;
      letter-spacing: -0.02em;
    }
    .hd-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .hd-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
      max-width: 480px;
    }

    /* search bar (user view only) */
    .hd-search-wrap {
      margin-top: 28px;
      display: flex; align-items: center;
      background: rgba(255,255,255,0.08);
      border: 1.5px solid rgba(255,255,255,0.18);
      border-radius: 12px;
      padding: 13px 20px;
      max-width: 520px;
      transition: border-color 0.2s, background 0.2s;
    }
    .hd-search-wrap:focus-within {
      background: rgba(255,255,255,0.13);
      border-color: var(--orange);
    }
    .hd-search-wrap svg { color: rgba(255,255,255,0.45); margin-right: 12px; flex-shrink: 0; }
    .hd-search-wrap input {
      flex: 1; background: none; border: none; outline: none;
      font-size: 14px; color: #fff; font-family: 'Lato', sans-serif;
    }
    .hd-search-wrap input::placeholder { color: rgba(255,255,255,0.38); }

    /* ─── CONTENT AREA ─── */
    .hd-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 36px 48px 56px;
    }

    /* ─── SECTION LABEL ─── */
    .hd-section-label {
      font-family: 'Sora', sans-serif;
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 20px;
      display: flex; align-items: center; gap: 10px;
    }
    .hd-section-label::after {
      content: '';
      flex: 1; height: 1px; background: var(--border);
    }

    /* ─── USER CARDS ─── */
    .hd-user-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 22px;
      animation: fadeUp 0.5s 0.1s ease both;
    }
    .hd-user-card {
      background: var(--white);
      border-radius: 18px;
      border: 1.5px solid var(--border);
      padding: 36px 28px 32px;
      cursor: pointer;
      transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
      display: flex; flex-direction: column; align-items: flex-start;
      position: relative; overflow: hidden;
    }
    .hd-user-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      border-radius: 18px 18px 0 0;
      transition: opacity 0.22s;
      opacity: 0;
    }
    .hd-user-card:hover { transform: translateY(-5px); box-shadow: 0 16px 40px rgba(0,32,96,0.1); border-color: #c8d4e4; }
    .hd-user-card:hover::before { opacity: 1; }

    .hd-user-card.c-issue::before  { background: linear-gradient(90deg, #ef4444, #f87171); }
    .hd-user-card.c-request::before{ background: linear-gradient(90deg, var(--navy), var(--navy2)); }
    .hd-user-card.c-kb::before     { background: linear-gradient(90deg, var(--orange), var(--orange2)); }

    .hd-card-icon {
      width: 56px; height: 56px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 22px;
    }
    .hd-card-icon svg { width: 26px; height: 26px; }

    .hd-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 17px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 8px;
    }
    .hd-card-desc {
      font-size: 13.5px; color: var(--muted);
      line-height: 1.6; font-weight: 400;
    }
    .hd-card-arrow {
      margin-top: 22px; display: flex; align-items: center; gap: 6px;
      font-size: 12.5px; font-weight: 700; letter-spacing: 0.04em;
      color: var(--navy); opacity: 0;
      transition: opacity 0.18s;
    }
    .hd-user-card:hover .hd-card-arrow { opacity: 1; }

    /* ─── MY TICKETS PREVIEW (user) ─── */
    .hd-tickets-preview {
      margin-top: 40px;
      animation: fadeUp 0.5s 0.2s ease both;
    }
    .hd-ticket-row {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      padding: 16px 22px;
      display: flex; align-items: center; gap: 16px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: border-color 0.18s, box-shadow 0.18s;
    }
    .hd-ticket-row:hover { border-color: var(--navy); box-shadow: 0 4px 16px rgba(0,32,96,0.07); }
    .hd-ticket-id {
      font-family: 'Sora', sans-serif;
      font-size: 12px; font-weight: 700;
      color: var(--navy);
      background: rgba(0,32,96,0.07);
      padding: 4px 9px; border-radius: 7px;
      white-space: nowrap;
    }
    .hd-ticket-title {
      flex: 1; font-size: 14px; color: var(--text); font-weight: 400;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .hd-ticket-pill {
      font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
      padding: 4px 11px; border-radius: 20px;
      white-space: nowrap;
    }
    .hd-ticket-pill.open    { background: #fef3c7; color: #92400e; }
    .hd-ticket-pill.closed  { background: #d1fae5; color: #065f46; }
    .hd-ticket-pill.waiting { background: #dbeafe; color: #1e40af; }
    .hd-ticket-date { font-size: 12px; color: var(--muted); white-space: nowrap; }

    /* ─── ADMIN DASHBOARD ─── */

    /* toggle row */
    .hd-admin-ctrl {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 22px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      margin-bottom: 28px;
      animation: fadeUp 0.4s ease both;
    }
    .hd-admin-ctrl-left {
      font-size: 14px; color: var(--muted); font-weight: 400;
    }
    .hd-admin-ctrl-left strong { color: var(--text); font-weight: 700; }

    .hd-switch { position: relative; width: 44px; height: 24px; }
    .hd-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
    .hd-switch-track {
      position: absolute; inset: 0;
      background: #cbd5e1; border-radius: 24px;
      transition: background 0.2s; cursor: pointer;
    }
    .hd-switch input:checked + .hd-switch-track { background: var(--navy); }
    .hd-switch-track::after {
      content: ''; position: absolute;
      top: 3px; left: 3px;
      width: 18px; height: 18px;
      background: white; border-radius: 50%;
      transition: transform 0.2s;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    }
    .hd-switch input:checked + .hd-switch-track::after { transform: translateX(20px); }

    /* stat cards */
    .hd-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 18px;
      margin-bottom: 28px;
      animation: fadeUp 0.45s 0.05s ease both;
    }
    .hd-stat {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 26px 24px;
      cursor: pointer;
      position: relative; overflow: hidden;
      transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
    }
    .hd-stat:hover { transform: translateY(-4px); box-shadow: 0 12px 36px rgba(0,32,96,0.1); }
    .hd-stat-stripe {
      position: absolute; top: 0; left: 0; right: 0; height: 4px; border-radius: 18px 18px 0 0;
    }
    .hd-stat-icon {
      width: 42px; height: 42px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 20px;
    }
    .hd-stat-icon svg { width: 20px; height: 20px; }
    .hd-stat-val {
      font-family: 'Sora', sans-serif;
      font-size: 40px; font-weight: 800;
      color: var(--navy); line-height: 1;
      letter-spacing: -0.03em; margin-bottom: 8px;
    }
    .hd-stat-label {
      font-size: 12px; font-weight: 700;
      letter-spacing: 0.05em; text-transform: uppercase;
      color: var(--muted);
    }

    /* stat hover accent borders */
    .hd-stat.s-open:hover    { border-color: var(--orange); }
    .hd-stat.s-awaiting:hover{ border-color: var(--navy); }
    .hd-stat.s-closed:hover  { border-color: #10b981; }
    .hd-stat.s-high:hover    { border-color: #ef4444; }

    /* chart panels */
    .hd-charts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      animation: fadeUp 0.5s 0.1s ease both;
    }
    .hd-chart {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 28px;
    }
    .hd-chart-title {
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      letter-spacing: 0.03em;
      text-transform: uppercase;
      margin-bottom: 24px;
      display: flex; align-items: center; gap: 8px;
    }
    .hd-chart-title::before {
      content: '';
      width: 4px; height: 16px;
      border-radius: 2px;
      background: var(--orange);
    }
    .hd-chart-inner {
      display: flex; align-items: center; gap: 24px;
    }
    .hd-legend { flex: 1; }
    .hd-legend-row {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 12px;
      border-radius: 10px;
      margin-bottom: 4px;
      transition: background 0.15s;
      cursor: default;
    }
    .hd-legend-row:hover { background: var(--bg); }
    .hd-legend-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
    .hd-legend-name { font-size: 13.5px; color: var(--muted); flex: 1; font-weight: 400; }
    .hd-legend-count {
      font-family: 'Sora', sans-serif;
      font-size: 17px; font-weight: 800; color: var(--navy);
    }

    /* Loading */
    .hd-loading-screen {
      min-height: 100vh; background: var(--bg);
      display: flex; align-items: center; justify-content: center;
    }
    .hd-spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid rgba(0,32,96,0.12);
      border-top-color: var(--navy);
      animation: spin 0.9s linear infinite;
    }

    @media (max-width: 1024px) {
      .hd-stats  { grid-template-columns: repeat(2, 1fr); }
      .hd-charts { grid-template-columns: 1fr; }
    }
    @media (max-width: 768px) {
      .hd-hero   { padding: 40px 24px; }
      .hd-content{ padding: 24px 20px 40px; }
      .hd-user-cards { grid-template-columns: 1fr; }
      .hd-stats  { grid-template-columns: repeat(2, 1fr); }

    }
  `;



  // ── LOADING SCREEN ──
  if (isLoading) {
    return (
      <div className="hd-page">
        <style>{sharedCSS}</style>
        <div className="hd-loading-screen">
          <div style={{ textAlign: 'center' }}>
            <div className="hd-spinner" style={{ margin: '0 auto' }} />
            <div style={{ marginTop: 14, fontSize: 14, color: '#64748b', fontFamily: "'Lato', sans-serif" }}>Loading your workspace…</div>
          </div>
        </div>
      </div>
    );
  }

  // ── BASIC USER VIEW ──────────────────────────────────────────────
  if (authority === 'basic') {
    const myRecent = tickets.slice(0, 5);

    const pillClass = (status) => {
      if (status === 'Closed') return 'closed';
      if (status === 'Waiting for approval') return 'waiting';
      return 'open';
    };

    return (
      <div className="hd-page">
        <style>{sharedCSS}</style>

        {/* Hero */}
        <div className="hd-hero">
          <div className="hd-hero-inner">
            <div className="hd-hero-eyebrow">
              <div className="hd-hero-eyebrow-line" />
              IT Service Portal
            </div>
            <h1>{greeting}, <em>{userName}</em>.<br />How can we help?</h1>
            <p className="hd-hero-sub">Search our knowledge base, report an issue, or request a service — we're here to help you stay productive.</p>
            <div className="hd-search-wrap">
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search services, articles, or your tickets…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="hd-content">
          <div className="hd-section-label">Quick Actions</div>
          <div className="hd-user-cards">

            {/* Report Issue */}
            <div className="hd-user-card c-issue" onClick={() => navigate('/create-incident')}>
              <div className="hd-card-icon" style={{ background: '#fef2f2' }}>
                <svg fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div className="hd-card-title">Report an Issue</div>
              <div className="hd-card-desc">Something broken or not working as expected? Log it here and we'll get it fixed fast.</div>
              <div className="hd-card-arrow" style={{ color: '#ef4444' }}>
                Get started
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </div>
            </div>

            {/* Request Service */}
            <div className="hd-user-card c-request" onClick={() => navigate('/create-request')}>
              <div className="hd-card-icon" style={{ background: 'rgba(0,32,96,0.07)' }}>
                <svg fill="none" viewBox="0 0 24 24" stroke="#002060" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="hd-card-title">Request a Service</div>
              <div className="hd-card-desc">Need new hardware, software access, or a system change? Browse our service catalog.</div>
              <div className="hd-card-arrow" style={{ color: 'var(--navy)' }}>
                View catalog
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </div>
            </div>

            {/* Knowledge Base */}
            <div className="hd-user-card c-kb" onClick={() => navigate('/knowledge-base')}>
              <div className="hd-card-icon" style={{ background: 'rgba(233,132,4,0.1)' }}>
                <svg fill="none" viewBox="0 0 24 24" stroke="#e98404" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="hd-card-title">Knowledge Base</div>
              <div className="hd-card-desc">Find answers, how-to guides, and troubleshooting articles. Self-service help, 24/7.</div>
              <div className="hd-card-arrow" style={{ color: 'var(--orange)' }}>
                Browse articles
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </div>
            </div>
          </div>

          {/* Recent tickets */}
          {myRecent.length > 0 && (
            <div className="hd-tickets-preview">
              <div className="hd-section-label">My Recent Tickets</div>
              {myRecent.map((t, i) => (
                <div key={t._id || i} className="hd-ticket-row" onClick={() => navigate(`/tickets/${t._id}`)}>
                  <span className="hd-ticket-id">#{t.ticketId || String(i + 1).padStart(4, '0')}</span>
                  <span className="hd-ticket-title">{t.title || t.subject || 'Untitled ticket'}</span>
                  <span className={`hd-ticket-pill ${pillClass(t.status)}`}>{t.status}</span>
                  <span className="hd-ticket-date">{t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</span>
                </div>
              ))}
              <div style={{ textAlign: 'right', marginTop: 10 }}>
                <span
                  onClick={() => navigate('/my-tickets')}
                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', cursor: 'pointer', letterSpacing: '0.02em' }}
                >
                  View all tickets →
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── ADMIN DASHBOARD ──────────────────────────────────────────────
  return (
    <div className="hd-page">
      <style>{sharedCSS}</style>

      {/* Admin Hero */}
      <div className="hd-hero">
        <div className="hd-hero-inner">
          <div className="hd-hero-eyebrow">
            <div className="hd-hero-eyebrow-line" />
            Admin Dashboard
          </div>
          <h1>{greeting}, <em>{userName}</em>.</h1>
          <p className="hd-hero-sub">{today} — here's a live snapshot of your helpdesk queue.</p>
        </div>
      </div>

      <div className="hd-content">

        {/* Toggle */}
        <div className="hd-admin-ctrl">
          <div className="hd-admin-ctrl-left">
            Viewing: <strong>{showMyTickets ? 'My tickets only' : 'All tickets'}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>My tickets only</span>
            <label className="hd-switch">
              <input type="checkbox" checked={showMyTickets} onChange={() => setShowMyTickets(p => !p)} />
              <span className="hd-switch-track" />
            </label>
          </div>
        </div>

        {/* Stats */}
        <div className="hd-stats">
          <div className="hd-stat s-open" onClick={() => navigate('/tickets', { state: { filter: 'open' } })}>
            <div className="hd-stat-stripe" style={{ background: 'var(--orange)' }} />
            <div className="hd-stat-icon" style={{ background: 'rgba(233,132,4,0.1)' }}>
              <svg fill="none" viewBox="0 0 24 24" stroke="#e98404" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 0l9 6 9-6" />
              </svg>
            </div>
            <div className="hd-stat-val"><AnimatedCounter value={openTickets.length} isLoading={isLoading} /></div>
            <div className="hd-stat-label">Open Tickets</div>
          </div>

          <div className="hd-stat s-awaiting" onClick={() => navigate('/tickets', { state: { filter: 'progress' } })}>
            <div className="hd-stat-stripe" style={{ background: 'var(--navy)' }} />
            <div className="hd-stat-icon" style={{ background: 'rgba(0,32,96,0.08)' }}>
              <svg fill="none" viewBox="0 0 24 24" stroke="#002060" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="hd-stat-val"><AnimatedCounter value={inProgressTickets.length} isLoading={isLoading} /></div>
            <div className="hd-stat-label">Awaiting Approval</div>
          </div>

          <div className="hd-stat s-closed" onClick={() => navigate('/dashboard')}>
            <div className="hd-stat-stripe" style={{ background: '#10b981' }} />
            <div className="hd-stat-icon" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <svg fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="hd-stat-val"><AnimatedCounter value={closedTickets.length} isLoading={isLoading} /></div>
            <div className="hd-stat-label">Closed Tickets</div>
          </div>

          <div className="hd-stat s-high" onClick={() => navigate('/tickets', { state: { filter: 'high' } })}>
            <div className="hd-stat-stripe" style={{ background: '#ef4444' }} />
            <div className="hd-stat-icon" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="hd-stat-val"><AnimatedCounter value={highPriority.length} isLoading={isLoading} /></div>
            <div className="hd-stat-label">High Priority</div>
          </div>
        </div>

        {/* Charts */}
        <div className="hd-charts">
          <div className="hd-chart">
            <div className="hd-chart-title">Status Distribution</div>
            <div className="hd-chart-inner">
              <PieChart data={statusData} colors={statusColors} size={160} isLoading={isLoading} />
              <div className="hd-legend">
                {statusData.map((item, idx) => (
                  <div key={idx} className="hd-legend-row">
                    <div className="hd-legend-dot" style={{ background: statusColors[idx] }} />
                    <span className="hd-legend-name">{item.label}</span>
                    <span className="hd-legend-count"><AnimatedCounter value={item.value} isLoading={isLoading} /></span>
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
                    <span className="hd-legend-count"><AnimatedCounter value={item.value} isLoading={isLoading} /></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Home;