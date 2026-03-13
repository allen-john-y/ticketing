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
    if (!category) return '#1d4ed8';
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin')) return '#f59e0b';
    if (c.includes('payroll') || c.includes('expense')) return '#10b981';
    if (c.includes('leave') || c.includes('onboard')) return '#ef4444';
    return '#1d4ed8';
  };

  const priorityMeta = (priority) => {
    if (!priority) return { color: '#6b7280' };
    const p = priority.toLowerCase();
    if (p === 'high') return { color: '#ef4444' };
    if (p === 'medium') return { color: '#f59e0b' };
    return { color: '#10b981' };
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
      <div className="db-accent-bar" style={{ background: '#e5e7eb' }} />
      <div className="db-row-main">
        <div className="db-row-top">
          <div className="skel" style={{ width: 180, height: 15, borderRadius: 3 }} />
          <div className="skel" style={{ width: 60, height: 20, borderRadius: 20 }} />
        </div>
        <div className="skel" style={{ width: '65%', height: 13, borderRadius: 3, marginTop: 10 }} />
        <div className="skel" style={{ width: '40%', height: 13, borderRadius: 3, marginTop: 6 }} />
        <div className="db-row-footer" style={{ marginTop: 14 }}>
          <div className="skel" style={{ width: 70, height: 13, borderRadius: 3 }} />
          <div className="skel" style={{ width: 90, height: 13, borderRadius: 3 }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="db-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .db-root {
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
          animation: pulse 1.6s ease-in-out infinite;
        }

        /* ── Body ── */
        .db-body {
          max-width: 1280px;
          margin: 0 auto;
          padding: 2.5rem 2rem 4rem;
        }

        /* ── Header ── */
        .db-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 2.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #d9d5cc;
        }

        .db-date {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #9ca3af;
          margin-bottom: 6px;
        }

        .db-page-title {
          font-size: 26px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.02em;
        }

        .db-header-actions {
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
          transition: background 0.15s, transform 0.1s;
          border: none;
        }
        .hd-btn-primary { background: #111827; color: #fff; }
        .hd-btn-primary:hover { background: #1f2937; transform: translateY(-1px); }
        .hd-btn-secondary { background: #fff; color: #111827; border: 1px solid #d9d5cc; }
        .hd-btn-secondary:hover { background: #f9f8f6; transform: translateY(-1px); }

        /* ── Stats ── */
        .db-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: #d9d5cc;
          border: 1px solid #d9d5cc;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 1.5rem;
        }

        .db-stat {
          background: #fff;
          padding: 1.5rem 1.75rem;
        }

        .db-stat-accent {
          width: 28px;
          height: 3px;
          border-radius: 2px;
          margin-bottom: 1rem;
        }

        .db-stat-val {
          font-size: 34px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.03em;
          line-height: 1;
          font-family: 'DM Mono', monospace;
          margin-bottom: 6px;
        }

        .db-stat-label {
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        /* ── Controls ── */
        .db-controls {
          background: #fff;
          border: 1px solid #d9d5cc;
          border-radius: 10px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 1.5rem;
        }

        .db-search-wrap {
          position: relative;
          margin-bottom: 1rem;
        }

        .db-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
          pointer-events: none;
        }

        .db-search {
          width: 100%;
          padding: 10px 14px 10px 38px;
          border: 1px solid #d9d5cc;
          border-radius: 7px;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          background: #fafaf8;
          color: #111827;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .db-search:focus {
          outline: none;
          border-color: #111827;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(17,24,39,0.07);
        }
        .db-search::placeholder { color: #9ca3af; }

        /* ── Admin toggle ── */
        .db-toggle-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .db-toggle-label {
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          user-select: none;
        }
        .hd-switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
        .hd-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .hd-switch-track {
          position: absolute; inset: 0; background: #d1d5db;
          border-radius: 20px; transition: background 0.2s; cursor: pointer;
        }
        .hd-switch input:checked + .hd-switch-track { background: #111827; }
        .hd-switch-track::after {
          content: ''; position: absolute; top: 3px; left: 3px;
          width: 14px; height: 14px; background: white;
          border-radius: 50%; transition: transform 0.2s;
        }
        .hd-switch input:checked + .hd-switch-track::after { transform: translateX(16px); }

        /* ── Section heading ── */
        .db-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }

        .db-section-title {
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6b7280;
        }

        .db-count-badge {
          font-size: 12px;
          font-weight: 500;
          font-family: 'DM Mono', monospace;
          color: #6b7280;
          background: #fff;
          border: 1px solid #d9d5cc;
          padding: 3px 10px;
          border-radius: 20px;
        }

        /* ── Ticket rows ── */
        .db-list {
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: #d9d5cc;
          border: 1px solid #d9d5cc;
          border-radius: 10px;
          overflow: hidden;
        }

        .db-row {
          display: flex;
          background: #fff;
          text-decoration: none;
          color: inherit;
          transition: background 0.12s;
        }
        .db-row:hover { background: #fafaf8; }
        .db-row-skel { cursor: default; }
        .db-row-skel:hover { background: #fff; }

        .db-accent-bar {
          width: 3px;
          flex-shrink: 0;
          align-self: stretch;
        }

        .db-row-main {
          flex: 1;
          padding: 1.1rem 1.5rem;
        }

        .db-row-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 6px;
        }

        .db-ticket-id {
          font-size: 13px;
          font-weight: 600;
          font-family: 'DM Mono', monospace;
          color: #6b7280;
        }

        .db-ticket-cat {
          font-size: 15px;
          font-weight: 600;
          color: #111827;
          margin-top: 1px;
        }

        .db-closed-pill {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
          background: #d1fae5;
          color: #065f46;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .db-description {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.5;
          margin-bottom: 10px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .db-admin-info {
          font-size: 12px;
          color: #6b7280;
          background: #fafaf8;
          border: 1px solid #e5e7eb;
          border-radius: 5px;
          padding: 6px 10px;
          margin-bottom: 10px;
          display: flex;
          gap: 1.5rem;
        }
        .db-admin-info strong { color: #374151; font-weight: 600; }

        .db-row-footer {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-wrap: wrap;
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
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .db-close-reason {
          font-size: 12px;
          color: #6b7280;
          padding-top: 8px;
          border-top: 1px solid #f3f4f6;
          margin-top: 6px;
          width: 100%;
        }
        .db-close-reason strong { color: #374151; font-weight: 600; }

        /* ── Empty ── */
        .db-empty {
          text-align: center;
          padding: 5rem 2rem;
          background: #fff;
          border: 1px solid #d9d5cc;
          border-radius: 10px;
          color: #9ca3af;
        }
        .db-empty-icon { font-size: 40px; margin-bottom: 1rem; opacity: 0.4; }
        .db-empty h3 { font-size: 15px; font-weight: 600; color: #6b7280; margin-bottom: 4px; }
        .db-empty p { font-size: 13px; }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .db-stats { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 640px) {
          .db-body { padding: 1.5rem 1rem 3rem; }
          .db-stats { grid-template-columns: 1fr; }
          .db-header { flex-direction: column; align-items: flex-start; gap: 1rem; }
          .db-header-actions { width: 100%; }
          .hd-btn { flex: 1; justify-content: center; }
          .db-admin-info { flex-direction: column; gap: 4px; }
        }
      `}</style>

      <div className="db-body">
        {/* Header */}
        <div className="db-header">
          <div>
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
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Stats — always 4 cells */}
        <div className="db-stats">
          <div className="db-stat">
            <div className="db-stat-accent" style={{ background: '#1d4ed8' }} />
            <div className="db-stat-val">{loading ? <span className="skel" style={{ display: 'inline-block', width: 48, height: 34, borderRadius: 4 }} /> : totalClosed}</div>
            <div className="db-stat-label">Total Closed</div>
          </div>

          <div className="db-stat">
            <div className="db-stat-accent" style={{ background: '#f59e0b' }} />
            <div className="db-stat-val">{loading ? <span className="skel" style={{ display: 'inline-block', width: 48, height: 34, borderRadius: 4 }} /> : highPriorityClosed}</div>
            <div className="db-stat-label">High Priority</div>
          </div>

          <div className="db-stat">
            <div className="db-stat-accent" style={{ background: '#10b981' }} />
            <div className="db-stat-val">{loading ? <span className="skel" style={{ display: 'inline-block', width: 48, height: 34, borderRadius: 4 }} /> : closedToday}</div>
            <div className="db-stat-label">Closed Today</div>
          </div>

          <div className="db-stat">
            <div className="db-stat-accent" style={{ background: '#8b5cf6' }} />
            <div className="db-stat-val">{loading ? <span className="skel" style={{ display: 'inline-block', width: 48, height: 34, borderRadius: 4 }} /> : thisMonthClosed}</div>
            <div className="db-stat-label">This Month</div>
          </div>
        </div>

        {/* Controls */}
        <div className="db-controls">
          <div className="db-search-wrap">
            <svg className="db-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              className="db-search"
              type="text"
              placeholder="Search by number, category, description, or user…"
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
                My closed tickets only
              </label>
            </div>
          )}
        </div>

        {/* Section heading */}
        <div className="db-section-head">
          <div className="db-section-title">
            {showOnlyMine ? 'My closed tickets' : 'All closed tickets'}
          </div>
          {!loading && (
            <div className="db-count-badge">
              {searchFiltered.length} {searchFiltered.length === 1 ? 'ticket' : 'tickets'}
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
                      <span className="db-closed-pill">Closed</span>
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
                        Closed {new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      {ticket.assignedTo && (
                        <div className="db-meta">→ {ticket.assignedTo}</div>
                      )}
                      {ticket.resolvedBy && (
                        <div className="db-meta">✓ {ticket.resolvedBy}</div>
                      )}
                    </div>

                    {ticket.closeReason && (
                      <div className="db-close-reason">
                        <strong>Close reason:</strong> {ticket.closeReason}
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