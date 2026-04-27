// Incidents.js - Redesigned to match Home.js styling
import React, { useState, useEffect, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Status config with Home.js color scheme
const STATUS_CONFIG = {
  open:        { label: 'Open',        color: '#e98404', bg: '#fef3c7', border: '#fbbf24' },
  in_progress: { label: 'In Progress', color: '#002060', bg: '#dbeafe', border: '#3b82f6' },
  resolved:    { label: 'Resolved',    color: '#10b981', bg: '#d1fae5', border: '#10b981' },
  closed:      { label: 'Closed',      color: '#64748b', bg: '#f3f4f6', border: '#cbd5e1' },
  cancelled:   { label: 'Cancelled',   color: '#ef4444', bg: '#fee2e2', border: '#ef4444' },
};

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      color: '#10b981', bg: '#d1fae5', icon: '🟢' },
  medium:   { label: 'Medium',   color: '#e98404', bg: '#fef3c7', icon: '🟡' },
  high:     { label: 'High',     color: '#ef4444', bg: '#fee2e2', icon: '🔴' },
  critical: { label: 'Critical', color: '#dc2626', bg: '#fee2e2', icon: '🚨' },
};

const ALL_STATUSES   = ['all', 'open', 'in_progress', 'resolved', 'closed', 'cancelled'];
const ALL_PRIORITIES = ['all', 'critical', 'high', 'medium', 'low'];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: cfg.bg, border: `1.5px solid ${cfg.border}`, color: cfg.color,
      letterSpacing: '0.02em', whiteSpace: 'nowrap',
      fontFamily: "'Sora', sans-serif",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
      fontFamily: "'Sora', sans-serif",
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[120, 200, 110, 90, 140, 120, 80, 80].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div className="inc-skel" style={{ width: w, height: 14, borderRadius: 6 }} />
        </td>
      ))}
    </tr>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export default function Incidents() {
  const { accounts } = useMsal();
  const navigate = useNavigate();

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  useEffect(() => {
    const fetchIncidents = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(`${BACKEND}/api/incidents`);
        setIncidents(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('❌ Fetch incidents:', err);
        setError('Failed to load incidents. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchIncidents();
  }, []);

  useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter, sortBy]);

  const filtered = useMemo(() => {
    let list = [...incidents];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.incidentNumber?.toLowerCase().includes(q) ||
        i.title?.toLowerCase().includes(q) ||
        i.category?.name?.toLowerCase().includes(q) ||
        i.raisedBy?.name?.toLowerCase().includes(q) ||
        i.raisedBy?.mail?.toLowerCase().includes(q) ||
        i.assignedMember?.memberName?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all')   list = list.filter(i => i.status === statusFilter);
    if (priorityFilter !== 'all') list = list.filter(i => i.priority === priorityFilter);

    list.sort((a, b) => {
      if (sortBy === 'newest')   return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === 'oldest')   return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'priority') {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
      }
      return 0;
    });

    return list;
  }, [incidents, search, statusFilter, priorityFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats
  const stats = useMemo(() => ({
    total:    incidents.length,
    open:     incidents.filter(i => i.status === 'open').length,
    active:   incidents.filter(i => i.status === 'in_progress').length,
    resolved: incidents.filter(i => i.status === 'resolved' || i.status === 'closed').length,
    critical: incidents.filter(i => i.priority === 'critical' && i.status !== 'closed').length,
    high:     incidents.filter(i => i.priority === 'high' && i.status !== 'closed').length,
  }), [incidents]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --orange2: #f5a623;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .inc-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    .inc-skel {
      background: #e2e8f0;
      border-radius: 8px;
      animation: pulse 1.6s ease-in-out infinite;
    }

    /* Hero Section */
    .inc-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .inc-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .inc-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .inc-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .inc-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .inc-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .inc-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .inc-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .inc-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    /* Stats Row */
    .inc-stats {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 16px;
      margin-bottom: 28px;
      animation: fadeUp 0.45s 0.05s ease both;
    }

    .inc-stat-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 24px 20px;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: transform 0.22s ease, box-shadow 0.22s ease;
    }
    .inc-stat-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 36px rgba(0,32,96,0.1);
    }

    .inc-stat-stripe {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      border-radius: 18px 18px 0 0;
    }

    .inc-stat-value {
      font-family: 'Sora', sans-serif;
      font-size: 34px; font-weight: 800;
      color: var(--navy);
      line-height: 1;
      letter-spacing: -0.03em;
      margin-bottom: 6px;
    }

    .inc-stat-label {
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.05em; text-transform: uppercase;
      color: var(--muted);
    }

    /* Filters Bar */
    .inc-filters {
      display: flex; gap: 12px; margin-bottom: 24px;
      flex-wrap: wrap;
      padding: 20px 24px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .inc-search-wrapper {
      position: relative;
      flex: 1;
      min-width: 220px;
    }

    .inc-search-icon {
      position: absolute;
      left: 14px; top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      font-size: 14px;
    }

    .inc-search-input {
      width: 100%;
      padding: 11px 14px 11px 40px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
    }
    .inc-search-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
    }
    .inc-search-input::placeholder {
      color: var(--muted);
    }

    .inc-select {
      padding: 11px 32px 11px 14px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      transition: all 0.2s;
    }
    .inc-select:focus {
      outline: none;
      border-color: var(--navy);
    }

    /* Result Meta */
    .inc-result-meta {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
      padding: 0 4px;
    }

    .inc-clear-btn {
      padding: 6px 14px;
      font-size: 12px; font-weight: 600;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .inc-clear-btn:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    /* Table */
    .inc-table-wrapper {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      animation: fadeUp 0.5s 0.15s ease both;
    }

    .inc-table {
      width: 100%;
      border-collapse: collapse;
    }

    .inc-thead-row {
      background: var(--light);
      border-bottom: 1.5px solid var(--border);
    }

    .inc-th {
      padding: 14px 16px;
      font-family: 'Sora', sans-serif;
      font-size: 11px; font-weight: 700;
      color: var(--navy);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: left;
      white-space: nowrap;
    }

    .inc-tbody-row {
      border-bottom: 1.5px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
      animation: fadeUp 0.3s ease both;
    }
    .inc-tbody-row:hover {
      background: var(--bg);
    }

    .inc-td {
      padding: 14px 16px;
      vertical-align: middle;
    }

    .inc-number {
      font-family: 'Sora', sans-serif;
      font-weight: 700; font-size: 13px;
      color: var(--navy);
      letter-spacing: 0.02em;
    }

    .inc-title-cell {
      display: flex; flex-direction: column; gap: 3px;
      max-width: 240px;
    }
    .inc-title-main {
      font-size: 14px; font-weight: 600;
      color: var(--text);
      line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;
    }
    .inc-title-desc {
      font-size: 12px; color: var(--muted);
      line-height: 1.3;
    }

    .inc-category {
      font-size: 13px; color: var(--muted);
      max-width: 140px;
      display: block;
      overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;
    }

    .inc-user-cell {
      display: flex; align-items: center; gap: 10px;
    }
    .inc-user-avatar {
      width: 32px; height: 32px; border-radius: 10px;
      background: rgba(0,32,96,0.1);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      flex-shrink: 0;
    }
    .inc-user-info {
      display: flex; flex-direction: column; gap: 2px;
    }
    .inc-user-name {
      font-size: 13px; font-weight: 600;
      color: var(--text);
      line-height: 1.3;
    }
    .inc-user-email {
      font-size: 11px; color: var(--muted);
    }

    .inc-assigned-avatar {
      width: 32px; height: 32px; border-radius: 10px;
      background: rgba(16,185,129,0.1);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700;
      color: '#10b981';
      flex-shrink: 0;
    }

    .inc-unassigned {
      font-size: 12px; color: var(--muted);
      font-style: italic;
    }

    .inc-date-cell {
      display: flex; flex-direction: column; gap: 3px;
    }
    .inc-date-main {
      font-size: 13px; font-weight: 600;
      color: var(--text);
    }
    .inc-date-rel {
      font-size: 11px; color: var(--muted);
    }

    /* Empty State */
    .inc-empty {
      text-align: center; padding: 60px 20px;
    }
    .inc-empty-icon {
      font-size: 48px; margin-bottom: 16px;
    }
    .inc-empty-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 6px;
    }
    .inc-empty-sub {
      font-size: 14px; color: var(--muted);
    }

    /* Error State */
    .inc-error {
      text-align: center; padding: 60px 20px;
    }
    .inc-error-icon {
      font-size: 48px; margin-bottom: 16px;
    }
    .inc-error-title {
      font-family: 'Sora', sans-serif;
      font-size: 16px; font-weight: 700;
      color: '#ef4444';
      margin-bottom: 12px;
    }
    .inc-retry-btn {
      padding: 10px 24px;
      background: var(--navy);
      border: none;
      border-radius: 12px;
      font-size: 14px; font-weight: 600;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
    }

    /* Pagination */
    .inc-pagination {
      display: flex; align-items: center; justify-content: center;
      gap: 8px; margin-top: 28px;
    }
    .inc-page-btn {
      padding: 9px 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 13px; font-weight: 600;
      color: var(--text);
      font-family: 'Sora', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
    }
    .inc-page-btn:hover:not(:disabled) {
      border-color: var(--navy);
      color: var(--navy);
    }
    .inc-page-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .inc-page-btn-active {
      background: var(--navy);
      border-color: var(--navy);
      color: white;
    }
    .inc-page-ellipsis {
      color: var(--muted);
      font-size: 13px;
      padding: 0 4px;
    }

    /* New Incident Button */
    .inc-new-btn {
      padding: 14px 28px;
      background: #ef4444;
      border: none;
      border-radius: 14px;
      font-size: 15px; font-weight: 700;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s;
      box-shadow: 0 4px 12px rgba(239,68,68,0.2);
    }
    .inc-new-btn:hover {
      background: #dc2626;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(239,68,68,0.25);
    }

    /* Loading */
    .inc-loading {
      min-height: 100vh;
      background: var(--bg);
      display: flex; align-items: center; justify-content: center;
    }
    .inc-spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      animation: spin 0.9s linear infinite;
    }

    @media (max-width: 1200px) {
      .inc-stats { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 768px) {
      .inc-hero { padding: 40px 24px; }
      .inc-content { padding: 24px 20px 40px; }
      .inc-stats { grid-template-columns: repeat(2, 1fr); }
      .inc-table-wrapper { overflow-x: auto; }
    }
  `;

  if (loading) {
    return (
      <div className="inc-page">
        <style>{sharedCSS}</style>
        <div className="inc-loading">
          <div style={{ textAlign: 'center' }}>
            <div className="inc-spinner" />
            <div style={{ marginTop: 14, fontSize: 14, color: '#64748b' }}>Loading incidents…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inc-page">
      <style>{sharedCSS}</style>

      {/* Hero Section */}
      <div className="inc-hero">
        <div className="inc-hero-inner">
          <div className="inc-hero-eyebrow">
            <div className="inc-hero-eyebrow-line" />
            Incident Management
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h1>All <em>Incidents</em></h1>
              <p className="inc-hero-sub">{today} — Track and manage incidents across the helpdesk</p>
            </div>
            <button className="inc-new-btn" onClick={() => navigate('/raise-incident')}>
              🚨 Report Incident
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="inc-content">
        {/* Stats */}
        <div className="inc-stats">
          {[
            { label: 'Total', value: stats.total, color: '#002060' },
            { label: 'Open', value: stats.open, color: '#e98404' },
            { label: 'In Progress', value: stats.active, color: '#3b82f6' },
            { label: 'Resolved', value: stats.resolved, color: '#10b981' },
            { label: 'Critical', value: stats.critical, color: '#ef4444' },
            { label: 'High Priority', value: stats.high, color: '#f59e0b' },
          ].map((stat, idx) => (
            <div key={idx} className="inc-stat-card">
              <div className="inc-stat-stripe" style={{ background: stat.color }} />
              <div className="inc-stat-value">{stat.value}</div>
              <div className="inc-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="inc-filters">
          <div className="inc-search-wrapper">
            <span className="inc-search-icon">🔍</span>
            <input
              className="inc-search-input"
              placeholder="Search by number, title, user…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select className="inc-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {ALL_STATUSES.map(st => (
              <option key={st} value={st}>
                {st === 'all' ? 'All Statuses' : STATUS_CONFIG[st]?.label || st}
              </option>
            ))}
          </select>

          <select className="inc-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
            {ALL_PRIORITIES.map(p => (
              <option key={p} value={p}>
                {p === 'all' ? 'All Priorities' : PRIORITY_CONFIG[p]?.label || p}
              </option>
            ))}
          </select>

          <select className="inc-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="priority">By Severity</option>
          </select>
        </div>

        {/* Result Meta */}
        <div className="inc-result-meta">
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Showing <strong style={{ color: '#002060' }}>{filtered.length}</strong> of{' '}
            <strong style={{ color: '#002060' }}>{incidents.length}</strong> incidents
          </span>
          {(search || statusFilter !== 'all' || priorityFilter !== 'all') && (
            <button
              className="inc-clear-btn"
              onClick={() => { setSearch(''); setStatusFilter('all'); setPriorityFilter('all'); }}
            >
              ✕ Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="inc-table-wrapper">
          {error ? (
            <div className="inc-error">
              <div className="inc-error-icon">⚠️</div>
              <div className="inc-error-title">{error}</div>
              <button className="inc-retry-btn" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          ) : (
            <table className="inc-table">
              <thead>
                <tr className="inc-thead-row">
                  {['Incident #', 'Title', 'Category', 'Priority', 'Raised By', 'Assigned To', 'Status', 'Created'].map(h => (
                    <th key={h} className="inc-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <div className="inc-empty">
                        <div className="inc-empty-icon">🚨</div>
                        <div className="inc-empty-title">No incidents found</div>
                        <div className="inc-empty-sub">Try adjusting your filters</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((inc, idx) => (
                    <tr
                      key={inc._id}
                      className="inc-tbody-row"
                      style={{ animationDelay: `${idx * 30}ms` }}
                      onClick={() => navigate(`/incidents/${inc._id}`)}
                    >
                      <td className="inc-td">
                        <span className="inc-number">{inc.incidentNumber || '—'}</span>
                      </td>
                      <td className="inc-td">
                        <div className="inc-title-cell">
                          <span className="inc-title-main">{inc.title || '—'}</span>
                          {inc.description && (
                            <span className="inc-title-desc">
                              {inc.description.length > 60 ? inc.description.slice(0, 60) + '…' : inc.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="inc-td">
                        <span className="inc-category">{inc.category?.name || '—'}</span>
                      </td>
                      <td className="inc-td">
                        <PriorityBadge priority={inc.priority} />
                      </td>
                      <td className="inc-td">
                        <div className="inc-user-cell">
                          <div className="inc-user-avatar">
                            {(inc.raisedBy?.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="inc-user-info">
                            <div className="inc-user-name">{inc.raisedBy?.name || '—'}</div>
                            <div className="inc-user-email">{inc.raisedBy?.mail || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="inc-td">
                        {inc.assignedMember?.memberName ? (
                          <div className="inc-user-cell">
                            <div className="inc-assigned-avatar">
                              {inc.assignedMember.memberName.charAt(0).toUpperCase()}
                            </div>
                            <div className="inc-user-info">
                              <div className="inc-user-name">{inc.assignedMember.memberName}</div>
                              {inc.assignmentGroup?.groupName && (
                                <div className="inc-user-email">{inc.assignmentGroup.groupName}</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="inc-unassigned">Unassigned</span>
                        )}
                      </td>
                      <td className="inc-td">
                        <StatusBadge status={inc.status} />
                      </td>
                      <td className="inc-td">
                        <div className="inc-date-cell">
                          <span className="inc-date-main">{formatDate(inc.createdAt)}</span>
                          <span className="inc-date-rel">{formatRelative(inc.createdAt)}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="inc-pagination">
            <button
              className="inc-page-btn"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Prev
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`e-${i}`} className="inc-page-ellipsis">…</span>
                  ) : (
                    <button
                      key={p}
                      className={`inc-page-btn ${page === p ? 'inc-page-btn-active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  )
                )}
            </div>

            <button
              className="inc-page-btn"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}