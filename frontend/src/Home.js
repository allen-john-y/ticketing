import React, { useState, useEffect, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Home() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();

  const [requests, setRequests]       = useState([]);
  const [incidents, setIncidents]     = useState([]);
  const [authority, setAuthority]     = useState('basic');
  const [userName, setUserName]       = useState('User');
  const [refreshKey, setRefreshKey]   = useState(0);
  const [showMyTickets, setShowMyTickets] = useState(false);
  const [isLoading, setIsLoading]     = useState(true);
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
          tokenResponse = await instance.acquireTokenPopup({
            scopes: ['User.Read', 'GroupMember.Read.All']
          });
        } else { setIsLoading(false); return; }
      }

      try {
        // ── 1. User display name ──────────────────────────────────
        const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        setUserName(userRes.data.displayName || 'User');

        // ── 2. Group membership → role ────────────────────────────
        const groupsRes = await axios.get(
          'https://graph.microsoft.com/v1.0/me/memberOf',
          { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` } }
        );
        const groups  = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('Helpdesk_Admin');
        setAuthority(isAdmin ? 'admin' : 'basic');

        const backendBase = process.env.REACT_APP_BACKEND_URL;
        // Derive user email from the MSAL account object
        const userEmail =
          accounts[0]?.username ||
          accounts[0]?.idTokenClaims?.preferred_username ||
          accounts[0]?.idTokenClaims?.email ||
          '';

        if (isAdmin) {
          // ── Admin: GET /api/requests  +  GET /api/incidents ────
          const [reqRes, incRes] = await Promise.all([
            axios.get(`${backendBase}/api/requests`),
            axios.get(`${backendBase}/api/incidents`),
          ]);
          setRequests(reqRes.data   || []);
          setIncidents(incRes.data  || []);
        } else {
          // ── Basic user: mine-only endpoints ────────────────────
          const encoded = encodeURIComponent(userEmail);
          const [reqRes, incRes] = await Promise.all([
            axios.get(`${backendBase}/api/requests/mine?email=${encoded}`),
            axios.get(`${backendBase}/api/incidents/mine?email=${encoded}`),
          ]);
          setRequests(reqRes.data   || []);
          setIncidents(incRes.data  || []);
        }

      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

  // ── "My submissions only" filter (admin toggle) ────────────────
  const currentUserEmail = (
    accounts[0]?.username ||
    accounts[0]?.idTokenClaims?.preferred_username ||
    ''
  ).toLowerCase();

  const filteredRequests = authority === 'admin' && showMyTickets
    ? requests.filter(r => (r.raisedBy?.mail || '').toLowerCase() === currentUserEmail)
    : requests;

  const filteredIncidents = authority === 'admin' && showMyTickets
    ? incidents.filter(i => (i.raisedBy?.mail || '').toLowerCase() === currentUserEmail)
    : incidents;

  // ────────────────────────────────────────────────────────────────
  // STAT CARD CALCULATIONS
  // Your request schema statuses (from server.js):
  //   "open" | "in_progress" | "pending_approval" | "resolved" | "closed" | "cancelled"
  // Your incident schema statuses:
  //   "open" | "in_progress" | "resolved" | "closed" | "cancelled"
  // ────────────────────────────────────────────────────────────────

  // 1. Total Incidents Created
  const totalIncidents = filteredIncidents.length;

  // 2. Total Requests Raised
  const totalRequests = filteredRequests.length;

  // 3. Closed Requests  (resolved OR closed)
  const closedRequests = filteredRequests.filter(
    r => r.status === 'resolved'
  ).length;

  // 4. Requests Waiting for Approval
  const awaitingRequests = filteredRequests.filter(
    r => r.status === 'pending_approval'
  ).length;

  // ── PIE 1: Request Status Distribution ──────────────────────────
  const openPendingCount   = filteredRequests.filter(r => r.status === 'open' || r.status === 'in_progress').length;
  const waitingCount       = filteredRequests.filter(r => r.status === 'pending_approval').length;
  const closedResolvedCount = filteredRequests.filter(r => r.status === 'closed' || r.status === 'resolved' || r.status === 'cancelled').length;

  // ── PIE 2: Priority Breakdown (active requests only) ────────────
  const activeRequests         = filteredRequests.filter(r => r.status !== 'closed' && r.status !== 'resolved' && r.status !== 'cancelled');
  const highPriorityCount      = activeRequests.filter(r => r.priority === 'high').length;
  const mediumPriorityCount    = activeRequests.filter(r => r.priority === 'medium').length;
  const lowPriorityCount       = activeRequests.filter(r => r.priority === 'low').length;

  // ── Combined list for basic-user recent activity ────────────────
  const allUserActivity = [
    ...requests.map(r  => ({ ...r,  _type: 'request'  })),
    ...incidents.map(i => ({ ...i,  _type: 'incident' })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // ── PIE datasets ──────────────────────────────────────────────
  const statusData   = [
    { label: 'Open / In Progress',   value: openPendingCount },
    { label: 'Waiting for Approval', value: waitingCount },
    { label: 'Closed / Resolved',    value: closedResolvedCount },
  ];
  const statusColors = ['#e98404', '#002060', '#10b981'];

  const priorityData   = [
    { label: 'High',   value: highPriorityCount },
    { label: 'Medium', value: mediumPriorityCount },
    { label: 'Low',    value: lowPriorityCount },
  ];
  const priorityColors = ['#ef4444', '#e98404', '#10b981'];

  // ── Date / greeting ──────────────────────────────────────────
  const today    = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ── Helpers ──────────────────────────────────────────────────
  const formatNumber = (n) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return n.toString();
  };

  const AnimatedCounter = ({ value, duration = 900, isLoading }) => {
    const [count, setCount]             = useState(0);
    const [hasAnimated, setHasAnimated] = useState(false);
    useEffect(() => {
      if (isLoading) { setCount(0); setHasAnimated(false); return; }
      if (!hasAnimated && value !== undefined) {
        const steps = 50, stepDuration = duration / steps;
        let step = 0;
        const iv = setInterval(() => {
          step++;
          const ease = 1 - Math.pow(1 - step / steps, 3);
          setCount(Math.floor(value * ease));
          if (step >= steps) { clearInterval(iv); setCount(value); setHasAnimated(true); }
        }, stepDuration);
        return () => clearInterval(iv);
      } else if (hasAnimated) setCount(value);
    }, [value, duration, isLoading, hasAnimated]);
    if (isLoading) return <span className="skel-num" />;
    return <span>{formatNumber(count)}</span>;
  };

  const PieChart = ({ data, colors, size = 160, isLoading }) => {
    const [animData, setAnimData]       = useState(data.map(d => ({ ...d, value: 0 })));
    const [hasAnimated, setHasAnimated] = useState(false);
    const dataStr = useMemo(() => JSON.stringify(data), [data]);
    useEffect(() => {
      if (isLoading) { setAnimData(data.map(d => ({ ...d, value: 0 }))); setHasAnimated(false); return; }
      if (!hasAnimated) {
        setAnimData(data.map(d => ({ ...d, value: 0 })));
        const steps = 55; let step = 0;
        const iv = setInterval(() => {
          step++;
          const ease = 1 - Math.pow(1 - step / steps, 3);
          setAnimData(data.map(d => ({ ...d, value: d.value * ease })));
          if (step >= steps) { clearInterval(iv); setAnimData(data); setHasAnimated(true); }
        }, 900 / steps);
        return () => clearInterval(iv);
      } else setAnimData(data);
    }, [dataStr, data, isLoading, hasAnimated]);

    if (isLoading) return <div style={{ width: size, height: size, borderRadius: '50%' }} className="skel-circle" />;
    const total = animData.reduce((s, d) => s + d.value, 0);
    if (total === 0) return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>
        No data
      </div>
    );
    let curAngle = -90;
    const cx = size / 2, cy = size / 2, r = size / 2 - 3, ir = r * 0.58;
    const segs = animData.map((d, i) => {
      const angle = (d.value / total) * 360;
      const sa = curAngle; curAngle += angle;
      const toRad = a => (a * Math.PI) / 180;
      const x1o = cx + r  * Math.cos(toRad(sa)),   y1o = cy + r  * Math.sin(toRad(sa));
      const x2o = cx + r  * Math.cos(toRad(curAngle)), y2o = cy + r  * Math.sin(toRad(curAngle));
      const x1i = cx + ir * Math.cos(toRad(curAngle)), y1i = cy + ir * Math.sin(toRad(curAngle));
      const x2i = cx + ir * Math.cos(toRad(sa)),   y2i = cy + ir * Math.sin(toRad(sa));
      const la = angle > 180 ? 1 : 0;
      return <path key={i} d={`M ${x1o} ${y1o} A ${r} ${r} 0 ${la} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${ir} ${ir} 0 ${la} 0 ${x2i} ${y2i} Z`} fill={colors[i]} />;
    });
    const ft = formatNumber(Math.round(total));
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segs}
        <circle cx={cx} cy={cy} r={ir - 1} fill="#fff" />
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#002060" fontSize={ft.length > 4 ? '16' : '20'} fontWeight="800" fontFamily="'Sora',sans-serif">{ft}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="sans-serif" letterSpacing="0.08em">TOTAL</text>
      </svg>
    );
  };

  const pillClass = (status = '') => {
    const s = status.toLowerCase();
    if (s === 'closed' || s === 'resolved') return 'closed';
    if (s === 'pending_approval')           return 'waiting';
    if (s === 'cancelled')                  return 'closed';
    return 'open';
  };

  // ── SHARED CSS ─────────────────────────────────────────────────
  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');
    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
    :root {
      --navy:#002060; --navy2:#003090;
      --orange:#e98404; --orange2:#f5a623;
      --white:#ffffff; --bg:#f5f7fa;
      --border:#e2e8f0; --text:#0f172a; --muted:#64748b;
    }
    @keyframes fadeUp { from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);} }
    @keyframes pulse  { 0%,100%{opacity:1;}50%{opacity:0.45;} }
    @keyframes spin   { to{transform:rotate(360deg);} }

    .skel        { background:#e2e8f0; border-radius:8px; animation:pulse 1.6s ease-in-out infinite; }
    .skel-num    { display:inline-block;width:48px;height:34px;background:#e2e8f0;border-radius:6px;animation:pulse 1.6s ease-in-out infinite;vertical-align:middle; }
    .skel-circle { background:#e2e8f0;animation:pulse 1.6s ease-in-out infinite; }

    .hd-page { min-height:100vh;width:100%;background:var(--bg);font-family:'Lato',sans-serif;color:var(--text); }

    /* HERO */
    .hd-hero { background:var(--navy);position:relative;overflow:hidden;padding:56px 48px 52px; }
    .hd-hero::after  { content:'';position:absolute;right:-60px;top:-60px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(233,132,4,.15) 0%,transparent 70%);pointer-events:none; }
    .hd-hero::before { content:'';position:absolute;left:35%;bottom:-80px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(0,48,144,.5) 0%,transparent 70%);pointer-events:none; }
    .hd-hero-inner   { position:relative;z-index:2;max-width:1320px;margin:0 auto;animation:fadeUp .55s ease both; }
    .hd-hero-eyebrow { display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--orange);margin-bottom:14px; }
    .hd-hero-eyebrow-line { width:28px;height:2px;background:var(--orange);border-radius:2px; }
    .hd-hero h1 { font-family:'Sora',sans-serif;font-size:clamp(28px,3vw,40px);font-weight:800;color:#fff;line-height:1.15;margin-bottom:12px;letter-spacing:-.02em; }
    .hd-hero h1 em { font-style:normal;color:var(--orange); }
    .hd-hero-sub { font-size:15px;color:rgba(255,255,255,.62);font-weight:400;line-height:1.6;max-width:480px; }

    .hd-search-wrap { margin-top:28px;display:flex;align-items:center;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.18);border-radius:12px;padding:13px 20px;max-width:520px;transition:border-color .2s,background .2s; }
    .hd-search-wrap:focus-within { background:rgba(255,255,255,.13);border-color:var(--orange); }
    .hd-search-wrap svg   { color:rgba(255,255,255,.45);margin-right:12px;flex-shrink:0; }
    .hd-search-wrap input { flex:1;background:none;border:none;outline:none;font-size:14px;color:#fff;font-family:'Lato',sans-serif; }
    .hd-search-wrap input::placeholder { color:rgba(255,255,255,.38); }

    /* CONTENT */
    .hd-content { max-width:1320px;margin:0 auto;padding:36px 48px 56px; }
    .hd-section-label { font-family:'Sora',sans-serif;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:20px;display:flex;align-items:center;gap:10px; }
    .hd-section-label::after { content:'';flex:1;height:1px;background:var(--border); }

    /* USER ACTION CARDS */
    .hd-user-cards { display:grid;grid-template-columns:repeat(3,1fr);gap:22px;animation:fadeUp .5s .1s ease both; }
    .hd-user-card  { background:var(--white);border-radius:18px;border:1.5px solid var(--border);padding:36px 28px 32px;cursor:pointer;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease;display:flex;flex-direction:column;align-items:flex-start;position:relative;overflow:hidden; }
    .hd-user-card::before { content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:18px 18px 0 0;transition:opacity .22s;opacity:0; }
    .hd-user-card:hover { transform:translateY(-5px);box-shadow:0 16px 40px rgba(0,32,96,.1);border-color:#c8d4e4; }
    .hd-user-card:hover::before { opacity:1; }
    .hd-user-card.c-issue::before   { background:linear-gradient(90deg,#ef4444,#f87171); }
    .hd-user-card.c-request::before { background:linear-gradient(90deg,var(--navy),var(--navy2)); }
    .hd-user-card.c-kb::before      { background:linear-gradient(90deg,var(--orange),var(--orange2)); }
    .hd-card-icon  { width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:22px; }
    .hd-card-icon svg { width:26px;height:26px; }
    .hd-card-title { font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:var(--navy);margin-bottom:8px; }
    .hd-card-desc  { font-size:13.5px;color:var(--muted);line-height:1.6;font-weight:400; }
    .hd-card-arrow { margin-top:22px;display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;letter-spacing:.04em;color:var(--navy);opacity:0;transition:opacity .18s; }
    .hd-user-card:hover .hd-card-arrow { opacity:1; }

    /* RECENT ACTIVITY (user) */
    .hd-tickets-preview { margin-top:40px;animation:fadeUp .5s .2s ease both; }
    .hd-ticket-row  { background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:16px 22px;display:flex;align-items:center;gap:16px;margin-bottom:10px;cursor:pointer;transition:border-color .18s,box-shadow .18s; }
    .hd-ticket-row:hover { border-color:var(--navy);box-shadow:0 4px 16px rgba(0,32,96,.07); }
    .hd-ticket-id   { font-family:'Sora',sans-serif;font-size:12px;font-weight:700;color:var(--navy);background:rgba(0,32,96,.07);padding:4px 9px;border-radius:7px;white-space:nowrap; }
    .hd-type-badge  { font-size:10px;font-weight:700;letter-spacing:.06em;padding:3px 8px;border-radius:5px;white-space:nowrap;text-transform:uppercase; }
    .hd-type-badge.incident { background:#fef2f2;color:#b91c1c; }
    .hd-type-badge.request  { background:#eff6ff;color:#1e40af; }
    .hd-ticket-title { flex:1;font-size:14px;color:var(--text);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .hd-ticket-pill  { font-size:11px;font-weight:700;letter-spacing:.04em;padding:4px 11px;border-radius:20px;white-space:nowrap; }
    .hd-ticket-pill.open    { background:#fef3c7;color:#92400e; }
    .hd-ticket-pill.closed  { background:#d1fae5;color:#065f46; }
    .hd-ticket-pill.waiting { background:#dbeafe;color:#1e40af; }
    .hd-ticket-date  { font-size:12px;color:var(--muted);white-space:nowrap; }

    /* ADMIN CONTROLS */
    .hd-admin-ctrl { display:flex;align-items:center;justify-content:space-between;padding:14px 22px;background:var(--white);border:1.5px solid var(--border);border-radius:14px;margin-bottom:28px;animation:fadeUp .4s ease both; }
    .hd-admin-ctrl-left { font-size:14px;color:var(--muted);font-weight:400; }
    .hd-admin-ctrl-left strong { color:var(--text);font-weight:700; }
    .hd-switch { position:relative;width:44px;height:24px; }
    .hd-switch input { opacity:0;width:0;height:0;position:absolute; }
    .hd-switch-track { position:absolute;inset:0;background:#cbd5e1;border-radius:24px;transition:background .2s;cursor:pointer; }
    .hd-switch input:checked + .hd-switch-track { background:var(--navy); }
    .hd-switch-track::after { content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;background:white;border-radius:50%;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.15); }
    .hd-switch input:checked + .hd-switch-track::after { transform:translateX(20px); }

    /* STAT CARDS */
    .hd-stats { display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:28px;animation:fadeUp .45s .05s ease both; }
    .hd-stat  { background:var(--white);border:1.5px solid var(--border);border-radius:18px;padding:26px 24px;cursor:pointer;position:relative;overflow:hidden;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease; }
    .hd-stat:hover { transform:translateY(-4px);box-shadow:0 12px 36px rgba(0,32,96,.1); }
    .hd-stat-stripe { position:absolute;top:0;left:0;right:0;height:4px;border-radius:18px 18px 0 0; }
    .hd-stat-icon   { width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:20px; }
    .hd-stat-icon svg { width:20px;height:20px; }
    .hd-stat-val    { font-family:'Sora',sans-serif;font-size:40px;font-weight:800;color:var(--navy);line-height:1;letter-spacing:-.03em;margin-bottom:8px; }
    .hd-stat-label  { font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted); }
    .hd-stat.s-incidents:hover { border-color:#ef4444; }
    .hd-stat.s-requests:hover  { border-color:var(--navy); }
    .hd-stat.s-closed:hover    { border-color:#10b981; }
    .hd-stat.s-awaiting:hover  { border-color:var(--orange); }

    /* CHARTS */
    .hd-charts { display:grid;grid-template-columns:1fr 1fr;gap:18px;animation:fadeUp .5s .1s ease both; }
    .hd-chart  { background:var(--white);border:1.5px solid var(--border);border-radius:18px;padding:28px; }
    .hd-chart-title { font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:var(--navy);letter-spacing:.03em;text-transform:uppercase;margin-bottom:24px;display:flex;align-items:center;gap:8px; }
    .hd-chart-title::before { content:'';width:4px;height:16px;border-radius:2px;background:var(--orange); }
    .hd-chart-inner { display:flex;align-items:center;gap:24px; }
    .hd-legend { flex:1; }
    .hd-legend-row   { display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;margin-bottom:4px;transition:background .15s;cursor:default; }
    .hd-legend-row:hover { background:var(--bg); }
    .hd-legend-dot   { width:11px;height:11px;border-radius:50%;flex-shrink:0; }
    .hd-legend-name  { font-size:13.5px;color:var(--muted);flex:1;font-weight:400; }
    .hd-legend-count { font-family:'Sora',sans-serif;font-size:17px;font-weight:800;color:var(--navy); }

    /* LOADING */
    .hd-loading-screen { min-height:100vh;background:var(--bg);display:flex;align-items:center;justify-content:center; }
    .hd-spinner { width:40px;height:40px;border-radius:50%;border:3px solid rgba(0,32,96,.12);border-top-color:var(--navy);animation:spin .9s linear infinite; }

    @media(max-width:1024px){ .hd-stats{grid-template-columns:repeat(2,1fr);} .hd-charts{grid-template-columns:1fr;} }
    @media(max-width:768px) { .hd-hero{padding:40px 24px;} .hd-content{padding:24px 20px 40px;} .hd-user-cards{grid-template-columns:1fr;} .hd-stats{grid-template-columns:repeat(2,1fr);} }
  `;

  // ── LOADING SCREEN ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="hd-page">
        <style>{sharedCSS}</style>
        <div className="hd-loading-screen">
          <div style={{ textAlign: 'center' }}>
            <div className="hd-spinner" style={{ margin: '0 auto' }} />
            <div style={{ marginTop: 14, fontSize: 14, color: '#64748b', fontFamily: "'Lato',sans-serif" }}>
              Loading your workspace…
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── BASIC USER VIEW ────────────────────────────────────────────
  if (authority === 'basic') {
    const myRecent = allUserActivity.slice(0, 5);

    return (
      <div className="hd-page">
        <style>{sharedCSS}</style>

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

        <div className="hd-content">
          <div className="hd-section-label">Quick Actions</div>
          <div className="hd-user-cards">

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

            <div className="hd-user-card c-kb" onClick={() => navigate('/kb')}>
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

          {myRecent.length > 0 && (
            <div className="hd-tickets-preview">
              <div className="hd-section-label">My Recent Activity</div>
              {myRecent.map((t, i) => (
                <div
                  key={t._id || i}
                  className="hd-ticket-row"
                  onClick={() =>
                    navigate(t._type === 'incident' ? `/incidents/${t._id}` : `/requests/${t._id}`)
                  }
                >
                  <span className="hd-ticket-id">
                    #{t.incidentNumber || t.requestNumber || String(i + 1).padStart(4, '0')}
                  </span>
                  <span className={`hd-type-badge ${t._type}`}>{t._type}</span>
                  <span className="hd-ticket-title">
                    {t.title || t.service?.name || 'Untitled'}
                  </span>
                  <span className={`hd-ticket-pill ${pillClass(t.status)}`}>{t.status}</span>
                  <span className="hd-ticket-date">
                    {t.createdAt
                      ? new Date(t.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                      : '—'}
                  </span>
                </div>
              ))}
              <div style={{ textAlign: 'right', marginTop: 10 }}>
                <span
                  onClick={() => navigate('/my-tickets')}
                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', cursor: 'pointer' }}
                >
                  View all activity →
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── ADMIN DASHBOARD ────────────────────────────────────────────
  return (
    <div className="hd-page">
      <style>{sharedCSS}</style>

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
            Viewing: <strong>{showMyTickets ? 'My submissions only' : 'All tickets'}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>My submissions only</span>
            <label className="hd-switch">
              <input type="checkbox" checked={showMyTickets} onChange={() => setShowMyTickets(p => !p)} />
              <span className="hd-switch-track" />
            </label>
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="hd-stats">

          {/* 1. Total Incidents Created */}
          <div className="hd-stat s-incidents" onClick={() => navigate('/incidents')}>
            <div className="hd-stat-stripe" style={{ background: '#ef4444' }} />
            <div className="hd-stat-icon" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="hd-stat-val"><AnimatedCounter value={totalIncidents} isLoading={isLoading} /></div>
            <div className="hd-stat-label">Total Incidents</div>
          </div>

          {/* 2. Total Requests Raised */}
          <div className="hd-stat s-requests" onClick={() => navigate('/requests')}>
            <div className="hd-stat-stripe" style={{ background: 'var(--navy)' }} />
            <div className="hd-stat-icon" style={{ background: 'rgba(0,32,96,0.08)' }}>
              <svg fill="none" viewBox="0 0 24 24" stroke="#002060" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="hd-stat-val"><AnimatedCounter value={totalRequests} isLoading={isLoading} /></div>
            <div className="hd-stat-label">Total Requests</div>
          </div>

          {/* 3. Closed Requests */}
          <div className="hd-stat s-closed" onClick={() => navigate('/requests', { state: { filterStatus: 'resolved' } })}>
            <div className="hd-stat-stripe" style={{ background: '#10b981' }} />
            <div className="hd-stat-icon" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <svg fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="hd-stat-val"><AnimatedCounter value={closedRequests} isLoading={isLoading} /></div>
            <div className="hd-stat-label">Resolved Requests</div>
          </div>

          {/* 4. Awaiting Approval */}
          <div className="hd-stat s-awaiting" onClick={() => navigate('/requests', {state: { filterStatus: 'pending_approval'}})}>
            <div className="hd-stat-stripe" style={{ background: 'var(--orange)' }} />
            <div className="hd-stat-icon" style={{ background: 'rgba(233,132,4,0.1)' }}>
              <svg fill="none" viewBox="0 0 24 24" stroke="#e98404" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="hd-stat-val"><AnimatedCounter value={awaitingRequests} isLoading={isLoading} /></div>
            <div className="hd-stat-label">Awaiting Approval</div>
          </div>

        </div>

        {/* CHARTS */}
        <div className="hd-charts">

          <div className="hd-chart">
            <div className="hd-chart-title">Request Status Distribution</div>
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
            <div className="hd-chart-title">Request Priority Breakdown</div>
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

        </div>
      </div>
    </div>
  );
}

export default Home;