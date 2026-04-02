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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!accounts[0]) return;
      setLoading(true);
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });

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

        const backendUrl = process.env.REACT_APP_BACKEND_URL;
        const endpoint = isAdmin
          ? `${backendUrl}/tickets`
          : `${backendUrl}/tickets?userId=${accounts[0].localAccountId}`;

        const res = await axios.get(endpoint);
        const closedTickets = res.data.filter(t => t.status === 'Closed');
        const sortedClosed = closedTickets.sort((a, b) => (b.ticketNumber || 0) - (a.ticketNumber || 0));
        setTickets(sortedClosed);
        setFilteredTickets(sortedClosed);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [accounts, instance]);

  const handleCheckboxChange = (e) => {
    const checked = e.target.checked;
    setShowOnlyMine(checked);
    setFilteredTickets(checked
      ? tickets.filter(t => t.userId === accounts[0].localAccountId)
      : tickets
    );
  };

  const searchFiltered = searchTerm.trim() === ''
    ? filteredTickets
    : filteredTickets.filter(t =>
        (t.ticketNumber || '').toString().includes(searchTerm) ||
        (t.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.userName || '').toLowerCase().includes(searchTerm.toLowerCase())
      );

  const accentColor = (category) => {
    if (!category) return '#3b82f6';
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin')) return '#f59e0b';
    if (c.includes('payroll') || c.includes('expense')) return '#10b981';
    if (c.includes('leave') || c.includes('onboard')) return '#ef4444';
    return '#3b82f6';
  };

  const priorityMeta = (priority) => {
    if (!priority) return { color: '#9ca3af' };
    const p = priority.toLowerCase();
    if (p === 'high') return { color: '#f87171' };
    if (p === 'medium') return { color: '#fbbf24' };
    return { color: '#86efac' };
  };

  const totalClosed = tickets.length;
  const myClosed = tickets.filter(t => t.userId === accounts[0]?.localAccountId).length;
  const highPriorityClosed = tickets.filter(t => t.priority === 'High').length;
  const closedToday = tickets.filter(t => {
    const d = new Date(t.updatedAt || t.createdAt);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const thisMonthClosed = tickets.filter(t => {
    const d = new Date(t.updatedAt || t.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const TicketSkeleton = () => (
    <div className="db-row db-row-skel">
      <div className="db-accent-bar" style={{ background: 'rgba(255,255,255,0.1)' }} />
      <div className="db-row-main">
        <div className="db-row-top">
          <div className="skel" style={{ width: 180, height: 14, borderRadius: 3 }} />
          <div className="skel" style={{ width: 60, height: 18, borderRadius: 16 }} />
        </div>
        <div className="skel" style={{ width: '65%', height: 12, borderRadius: 3, marginTop: 10 }} />
        <div className="skel" style={{ width: '40%', height: 12, borderRadius: 3, marginTop: 8 }} />
        <div className="db-row-footer" style={{ marginTop: 12, gap: '1rem' }}>
          <div className="skel" style={{ width: 70, height: 12, borderRadius: 3 }} />
          <div className="skel" style={{ width: 90, height: 12, borderRadius: 3 }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="db-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .db-root {
          min-height: 100vh;
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
          animation: pulse 1.6s ease-in-out infinite;
          border-radius: 6px;
        }

        /* ── Body ── */
        .db-body {
          max-width: 1280px;
          margin: 0 auto;
          padding: 2rem 2rem 3rem;
        }

        /* ── Header ── */
        .db-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .db-header-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .db-date {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #9ca3af;
        }

        .db-page-title {
          font-size: 28px;
          font-weight: 700;
          color: #f3f4f6;
          letter-spacing: -0.02em;
        }

        .db-header-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .hd-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s;
          border: none;
        }
        .hd-btn-primary { 
          background: #3b82f6; 
          color: #fff;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        .hd-btn-primary:hover { 
          background: #2563eb; 
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
        }
        .hd-btn-secondary { 
          background: rgba(255, 255, 255, 0.1); 
          color: #e5e7eb; 
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .hd-btn-secondary:hover { 
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
        }

        /* ── Stats Grid ── */
        .db-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .db-stat {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.5rem;
          backdrop-filter: blur(10px);
        }

        .db-stat-accent {
          width: 32px;
          height: 3px;
          border-radius: 2px;
          margin-bottom: 1rem;
        }

        .db-stat-val {
          font-size: 36px;
          font-weight: 800;
          color: #f3f4f6;
          letter-spacing: -0.02em;
          line-height: 1;
          font-family: 'Inter', monospace;
          margin-bottom: 8px;
        }

        .db-stat-label {
          font-size: 11px;
          font-weight: 600;
          color: #9ca3af;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        /* ── Controls ── */
        .db-controls {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 1.5rem;
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-wrap: wrap;
        }

        .db-search-wrap {
          position: relative;
          flex: 1;
          min-width: 300px;
        }

        .db-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
          pointer-events: none;
        }

        .db-search {
          width: 100%;
          padding: 10px 16px 10px 42px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          background: rgba(255, 255, 255, 0.03);
          color: #f3f4f6;
          transition: all 0.2s ease;
        }
        .db-search:focus {
          outline: none;
          border-color: #3b82f6;
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .db-search::placeholder { color: #6b7280; }

        /* ── Admin toggle ── */
        .db-toggle-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          white-space: nowrap;
        }
        .db-toggle-label {
          font-size: 12px;
          font-weight: 500;
          color: #d1d5db;
          cursor: pointer;
          user-select: none;
        }
        .hd-switch { 
          position: relative; 
          width: 40px; 
          height: 20px; 
          flex-shrink: 0; 
        }
        .hd-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .hd-switch-track {
          position: absolute; 
          inset: 0; 
          background: #374151;
          border-radius: 20px; 
          transition: background 0.2s; 
          cursor: pointer;
        }
        .hd-switch input:checked + .hd-switch-track { background: #3b82f6; }
        .hd-switch-track::after {
          content: ''; 
          position: absolute; 
          top: 2px; 
          left: 2px;
          width: 16px; 
          height: 16px; 
          background: white;
          border-radius: 50%; 
          transition: transform 0.2s;
        }
        .hd-switch input:checked + .hd-switch-track::after { transform: translateX(20px); }

        /* ── Section heading ── */
        .db-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
          gap: 1rem;
        }

        .db-section-title {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #9ca3af;
        }

        .db-count-badge {
          font-size: 12px;
          font-weight: 600;
          font-family: 'Inter', monospace;
          color: #93c5fd;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.3);
          padding: 5px 12px;
          border-radius: 20px;
        }

        /* ── Ticket rows ── */
        .db-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .db-row {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
          overflow: hidden;
          cursor: pointer;
          backdrop-filter: blur(10px);
        }
        .db-row:hover { 
          background: rgba(59, 130, 246, 0.05);
          border-color: #3b82f6;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
        }
        .db-row-skel { cursor: default; }
        .db-row-skel:hover { 
          background: rgba(255, 255, 255, 0.05);
          transform: none;
          box-shadow: none;
        }

        .db-accent-bar {
          width: 3px;
          flex-shrink: 0;
          align-self: stretch;
        }

        .db-row-main {
          flex: 1;
          padding: 1.25rem 1.5rem;
        }

        .db-row-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 8px;
        }

        .db-ticket-id {
          font-size: 12px;
          font-weight: 700;
          font-family: 'Inter', monospace;
          color: #60a5fa;
        }

        .db-ticket-cat {
          font-size: 15px;
          font-weight: 700;
          color: #f3f4f6;
          margin-top: 2px;
        }

        .db-closed-pill {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 16px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
          background: rgba(16, 185, 129, 0.2);
          color: #86efac;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .db-description {
          font-size: 13px;
          color: #d1d5db;
          line-height: 1.5;
          margin-bottom: 10px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .db-admin-info {
          font-size: 12px;
          color: #d1d5db;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 8px 12px;
          margin-bottom: 10px;
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .db-admin-info strong { color: #f3f4f6; font-weight: 600; }

        .db-row-footer {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .db-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          color: #9ca3af;
          font-weight: 500;
        }

        .db-priority-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .db-close-reason {
          font-size: 12px;
          color: #d1d5db;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          margin-top: 8px;
          width: 100%;
        }
        .db-close-reason strong { color: #f3f4f6; font-weight: 600; }

        /* ── Empty ── */
        .db-empty {
          text-align: center;
          padding: 4rem 2rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #9ca3af;
          backdrop-filter: blur(10px);
        }
        .db-empty-icon { font-size: 44px; margin-bottom: 1rem; opacity: 0.4; }
        .db-empty h3 { font-size: 15px; font-weight: 600; color: #d1d5db; margin-bottom: 4px; }
        .db-empty p { font-size: 12px; color: #9ca3af; }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .db-body { padding: 1.5rem; }
          .db-stats { grid-template-columns: repeat(2, 1fr); }
          .db-controls { flex-direction: column; }
          .db-search-wrap { min-width: 100%; }
        }

        @media (max-width: 768px) {
          .db-body { padding: 1rem; }
          .db-header { flex-direction: column; align-items: flex-start; gap: 1rem; }
          .db-header-actions { width: 100%; }
          .hd-btn { flex: 1; justify-content: center; }
          .db-controls { flex-direction: column; }
          .db-search-wrap { min-width: 100%; }
        }

        @media (max-width: 640px) {
          .db-body { padding: 0.75rem; }
          .db-page-title { font-size: 24px; }
          .db-stats { grid-template-columns: 1fr; }
          .db-stat { padding: 1.25rem; }
          .db-stat-val { font-size: 32px; }
          .db-controls { padding: 1rem; }
          .db-search-wrap { min-width: 100%; }
          .db-admin-info { flex-direction: column; gap: 6px; }
          .db-row-footer { flex-direction: column; align-items: flex-start; gap: 8px; }
        }
      `}</style>

      <div className="db-body">
        {/* Header */}
        <div className="db-header">
          <div className="db-header-left">
            <div className="db-date">{today}</div>
            <div className="db-page-title">Closed Tickets</div>
          </div>
          <div className="db-header-actions">
            <Link to="/create" className="hd-btn hd-btn-primary">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              New Ticket
            </Link>
            <button onClick={() => navigate('/')} className="hd-btn hd-btn-secondary">
              ← Back
            </button>
          </div>
        </div>

        {/* Stats — 4 cells */}
        <div className="db-stats">
          <div className="db-stat">
            <div className="db-stat-accent" style={{ background: '#3b82f6' }} />
            <div className="db-stat-val">
              {loading ? <span className="skel" style={{ display: 'inline-block', width: 48, height: 36, borderRadius: 4 }} /> : totalClosed}
            </div>
            <div className="db-stat-label">Total Closed</div>
          </div>

          <div className="db-stat">
            <div className="db-stat-accent" style={{ background: '#ef4444' }} />
            <div className="db-stat-val">
              {loading ? <span className="skel" style={{ display: 'inline-block', width: 48, height: 36, borderRadius: 4 }} /> : highPriorityClosed}
            </div>
            <div className="db-stat-label">High Priority</div>
          </div>

          <div className="db-stat">
            <div className="db-stat-accent" style={{ background: '#10b981' }} />
            <div className="db-stat-val">
              {loading ? <span className="skel" style={{ display: 'inline-block', width: 48, height: 36, borderRadius: 4 }} /> : closedToday}
            </div>
            <div className="db-stat-label">Closed Today</div>
          </div>

          <div className="db-stat">
            <div className="db-stat-accent" style={{ background: '#8b5cf6' }} />
            <div className="db-stat-val">
              {loading ? <span className="skel" style={{ display: 'inline-block', width: 48, height: 36, borderRadius: 4 }} /> : thisMonthClosed}
            </div>
            <div className="db-stat-label">This Month</div>
          </div>
        </div>

        {/* Controls - search + toggle on ONE line */}
        <div className="db-controls">
          <div className="db-search-wrap">
            <svg className="db-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              className="db-search"
              type="text"
              placeholder="🔍 Search by number, category, description..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {authority === 'admin' && !loading && (
            <div className="db-toggle-wrap">
              <label className="hd-switch">
                <input
                  type="checkbox"
                  id="showOnlyMineToggle"
                  checked={showOnlyMine}
                  onChange={handleCheckboxChange}
                />
                <span className="hd-switch-track" />
              </label>
              <label htmlFor="showOnlyMineToggle" className="db-toggle-label">
                📌 My tickets
              </label>
            </div>
          )}
        </div>

        {/* Section heading */}
        <div className="db-section-head">
          <div className="db-section-title">
            {showOnlyMine ? '📌 My closed tickets' : '📂 All closed tickets'}
          </div>
          {!loading && (
            <div className="db-count-badge">
              {searchFiltered.length} ticket{searchFiltered.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="db-list">
            {[1, 2, 3, 4].map(i => <TicketSkeleton key={i} />)}
          </div>
        ) : searchFiltered.length === 0 ? (
          <div className="db-empty">
            <div className="db-empty-icon">📭</div>
            <h3>No closed tickets found</h3>
            <p>{searchTerm ? 'Try adjusting your search terms' : 'All tickets are still open or in progress'}</p>
          </div>
        ) : (
          <div className="db-list">
            {searchFiltered.map(ticket => {
              const pm = priorityMeta(ticket.priority);
              return (
                <Link key={ticket._id} to={`/ticket/${ticket._id}`} className="db-row">
                  <div className="db-accent-bar" style={{ background: accentColor(ticket.category) }} />
                  <div className="db-row-main">
                    <div className="db-row-top">
                      <div>
                        <div className="db-ticket-id">#{ticket.ticketNumber}</div>
                        <div className="db-ticket-cat">{ticket.category}</div>
                      </div>
                      <span className="db-closed-pill">✓ Closed</span>
                    </div>

                    <p className="db-description">{ticket.description}</p>

                    {authority === 'admin' && (
                      <div className="db-admin-info">
                        <span><strong>By:</strong> {ticket.userName || '—'}</span>
                        <span><strong>Email:</strong> {ticket.userEmail || '—'}</span>
                      </div>
                    )}

                    <div className="db-row-footer">
                      <div className="db-meta">
                        <div className="db-priority-dot" style={{ background: pm.color }} />
                        {ticket.priority} Priority
                      </div>
                      <div className="db-meta">
                        📅 {new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </div>
                      {ticket.assignedTo && (
                        <div className="db-meta">👤 {ticket.assignedTo}</div>
                      )}
                      {ticket.resolvedBy && (
                        <div className="db-meta">✓ {ticket.resolvedBy}</div>
                      )}
                    </div>

                    {ticket.closeReason && (
                      <div className="db-close-reason">
                        <strong>Reason:</strong> {ticket.closeReason}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;