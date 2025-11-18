import React, { useState, useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';

function Home() {
  const { accounts, instance } = useMsal();
  const location = useLocation();
  const [tickets, setTickets] = useState([]);
  const [authority, setAuthority] = useState('basic');
  const [userName, setUserName] = useState('User');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMyTickets, setShowMyTickets] = useState(false);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [appliedCategories, setAppliedCategories] = useState([]);
  const [appliedUsers, setAppliedUsers] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(null); // 'category' | 'user' | null
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

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
      } catch (error) {
        if (error.name === 'InteractionRequiredAuthError') {
          tokenResponse = await instance.acquireTokenPopup({
            scopes: ['User.Read', 'GroupMember.Read.All']
          });
        } else {
          console.error('Token acquisition failed:', error);
          return;
        }
      }

      try {
        const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        setUserName(userRes.data.displayName || 'User');

        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('GS_Fortingate_VPN');
        setAuthority(isAdmin ? 'admin' : 'basic');

        const backendBase = "https://ticketing-production-5334.up.railway.app";
        const endpoint = isAdmin
          ? `${backendBase}/tickets`
          : `${backendBase}/tickets?userId=${accounts[0].localAccountId}`;

        const ticketsRes = await axios.get(endpoint);
        const allTickets = ticketsRes.data.reverse();
        setTickets(allTickets);

        const uniqueCategories = [...new Set(allTickets.map(t => t.category).filter(Boolean))];
        setCategories(uniqueCategories);

        const uniqueUsers = [...new Set(allTickets.map(t => t.userName).filter(Boolean))];
        setUsers(uniqueUsers);
      } catch (err) {
        console.error('Error fetching tickets:', err);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle category + user filter selection
  const handleSelect = (type, value) => {
    if (type === 'category') {
      setSelectedCategories((prev) =>
        prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
      );
    } else {
      setSelectedUsers((prev) =>
        prev.includes(value) ? prev.filter((u) => u !== value) : [...prev, value]
      );
    }
  };

  const applyFilters = () => {
    setAppliedCategories(selectedCategories);
    setAppliedUsers(selectedUsers);
    setDropdownOpen(null);
  };

  const removeFilter = (type, value) => {
    if (type === 'category') {
      const updated = appliedCategories.filter((c) => c !== value);
      setAppliedCategories(updated);
      setSelectedCategories(updated);
    } else {
      const updated = appliedUsers.filter((u) => u !== value);
      setAppliedUsers(updated);
      setSelectedUsers(updated);
    }
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedUsers([]);
    setAppliedCategories([]);
    setAppliedUsers([]);
  };

  // Filtering logic
  const filteredTickets = authority === 'admin' && showMyTickets
    ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
    : tickets;

  const categoryFiltered = appliedCategories.length === 0
    ? filteredTickets
    : filteredTickets.filter(t => appliedCategories.includes(t.category));

  const userFiltered = appliedUsers.length === 0
    ? categoryFiltered
    : categoryFiltered.filter(t => appliedUsers.includes(t.userName));

  const searchFiltered = searchTerm.trim() === ''
    ? userFiltered
    : userFiltered.filter(
        t =>
          (t.ticketNumber || '').toString().includes(searchTerm) ||
          (t.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (t.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      );

  const openTickets = searchFiltered.filter(t => t.status !== 'Closed');
  const closedTickets = tickets.filter(t => t.status === 'Closed');

  // Category -> color mapping
  const categoryColor = (category) => {
    if (!category) return '#3498db';
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin access') || c.includes('admin')) return '#f39c12';
    if (c.includes('payroll') || c.includes('expense')) return '#27ae60';
    if (c.includes('leave') || c.includes('onboard') || c.includes('onboarding')) return '#e74c3c';
    return '#3498db';
  };

  // derive initials
  const initials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        /* Welcome card */
        .welcome {
          display: flex;
          gap: 16px;
          align-items: center;
          background: linear-gradient(180deg, #ffffff, #fbfdff);
          padding: 18px;
          border-radius: 12px;
          box-shadow: 0 6px 24px rgba(2,6,23,0.06);
          margin-bottom: 18px;
        }
        .avatar {
          width: 64px;
          height: 64px;
          border-radius: 12px;
          background: linear-gradient(135deg, #eef2ff, #e9f5ff);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          color: #3730a3;
          font-size: 20px;
          box-shadow: 0 4px 12px rgba(2,6,23,0.06);
        }
        .welcome-left { flex: 1; display: flex; gap: 12px; align-items: center; }
        .welcome-meta { display:flex; flex-direction: column; gap: 6px; }
        .welcome-title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0; }
        .welcome-sub { color: #475569; margin: 0; font-size: 13px; }
        .role-badge { display:inline-block; padding: 6px 12px; border-radius: 999px; font-weight:700; font-size: 12px; color: white; }
        .role-admin { background: linear-gradient(90deg,#16a34a,#60a5fa); }
        .role-user { background: linear-gradient(90deg,#94a3b8,#64748b); }

        /* KPI chips */
        .kpis { display:flex; gap:10px; margin-top: 6px; flex-wrap:wrap; }
        .kpi { background: #f8fafc; padding: 8px 12px; border-radius: 10px; font-weight:700; color:#0f172a; display:inline-flex; gap:10px; align-items:center; box-shadow: 0 4px 12px rgba(2,6,23,0.03); }
        .kpi .num { color: #0b6fbd; font-weight:900; }

        /* Actions area */
        .welcome-actions { display:flex; gap:10px; align-items:center; }

        /* Filter controls (polished pill style) */
        .filter-controls { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .filter-btn {
          display:inline-flex;
          align-items:center;
          gap:10px;
          padding:9px 12px;
          border-radius:10px;
          background: white;
          border: 1px solid rgba(15,23,42,0.06);
          box-shadow: 0 4px 12px rgba(2,6,23,0.04);
          color: #0f172a;
          font-weight: 600;
          cursor: pointer;
          transition: transform 80ms ease, box-shadow 120ms ease;
        }
        .filter-btn:hover { box-shadow: 0 8px 20px rgba(2,6,23,0.06); }
        .filter-dot { width:10px; height:10px; border-radius:50%; display:inline-block; box-shadow: 0 2px 6px rgba(2,6,23,0.06); }
        .filter-category { background: linear-gradient(180deg,#f59e0b,#d97706); }
        .filter-user { background: linear-gradient(180deg,#7c3aed,#6d28d9); }

        /* Search pill (centered above filters) */
        .search-wrapper { display:flex; justify-content:center; margin-bottom: 14px; }
        .search-pill { width:100%; max-width:760px; border-radius:999px; padding:6px; background: linear-gradient(90deg, rgba(37,99,235,0.06), rgba(124,58,237,0.04)); box-shadow: 0 6px 18px rgba(37,99,235,0.04); box-sizing:border-box; }
        .search-inner { display:flex; align-items:center; background:white; border-radius:999px; padding:10px 14px; min-height:46px; }
        .search-icon { width:20px; height:20px; margin-right:12px; color:#64748b; flex:0 0 20px; }
        .search-input { width:100%; border:none; outline:none; font-size:15px; font-family: Consolas, Monaco, monospace; color:#0f172a; }
        .search-input::placeholder { color:#2563eb; opacity:0.95; }
        .search-inner:focus-within { box-shadow: 0 10px 30px rgba(37,99,235,0.08); transform: translateY(-1px); }

        /* container layout for filters below search */
        .filters-row { display:flex; justify-content:flex-start; gap:12px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
        .applied-filters { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; margin-bottom:12px; }

        @media (max-width: 840px) {
          .welcome { flex-direction: column; align-items: stretch; }
          .welcome-left { width: 100%; }
          .welcome-actions { justify-content: space-between; width: 100%; margin-top: 8px; }
          .search-pill { max-width: 100%; padding: 4px; }
        }
      `}</style>

      {/* Welcome card */}
      <div className="welcome" role="region" aria-label="Welcome">
        <div className="avatar" aria-hidden>{initials}</div>

        <div className="welcome-left">
          <div className="welcome-meta">
            <h2 className="welcome-title">Welcome back, <span style={{ color: '#2563eb' }}>{userName}</span></h2>
            <p className="welcome-sub">
              <span className={`role-badge ${authority === 'admin' ? 'role-admin' : 'role-user'}`}>
                {authority === 'admin' ? 'ADMIN' : 'USER'}
              </span>
            </p>

            <div className="kpis" aria-hidden>
              <div className="kpi"><span className="num">{openTickets.length}</span><span style={{ marginLeft: 8 }}>Open</span></div>
              <div className="kpi"><span className="num">{closedTickets.length}</span><span style={{ marginLeft: 8 }}>Closed</span></div>
              <div className="kpi"><span className="num">{tickets.length}</span><span style={{ marginLeft: 8 }}>Total</span></div>
            </div>
          </div>
        </div>

        <div className="welcome-actions" role="toolbar" aria-label="Quick actions">
          <Link to="/create" style={{ textDecoration: 'none' }}>
            <button className="btn btn-create" aria-label="Create New Ticket">➕ Create Ticket</button>
          </Link>

          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <button className="btn btn-closed" aria-label="View Closed Tickets">📥 Closed Tickets</button>
          </Link>
        </div>
      </div>

      <div style={{ background: 'white', padding: '1.5rem 2rem', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>

        {/* SEARCH: centered, visually prominent */}
        <div className="search-wrapper" aria-hidden={false}>
          <div className="search-pill" role="search" aria-label="Search tickets">
            <div className="search-inner">
              <svg className="search-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path d="M21 21l-4.35-4.35" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="11" cy="11" r="6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <input
                className="search-input"
                placeholder="Search by ticket number, category, or issue..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search tickets"
              />
            </div>
          </div>
        </div>

        {/* FILTERS: moved below search and styled to fit the environment */}
        <div className="filters-row" ref={dropdownRef}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setDropdownOpen(dropdownOpen === 'category' ? null : 'category')}
              className="filter-btn"
              aria-expanded={dropdownOpen === 'category'}
              aria-controls="filter-dropdown"
            >
              <span className="filter-dot filter-category" aria-hidden />
              Filter by Category ▾
            </button>

            {authority === 'admin' && (
              <button
                onClick={() => setDropdownOpen(dropdownOpen === 'user' ? null : 'user')}
                className="filter-btn"
                aria-expanded={dropdownOpen === 'user'}
                aria-controls="filter-dropdown"
              >
                <span className="filter-dot filter-user" aria-hidden />
                Filter by User ▾
              </button>
            )}
          </div>

          {/* dropdown anchored to the filter controls area */}
          {dropdownOpen && (
            <div id="filter-dropdown" style={{
              position: 'absolute',
              left: 24,
              marginTop: 56,
              background: 'white',
              border: '1px solid #e6e9ee',
              borderRadius: 8,
              boxShadow: '0 8px 30px rgba(2,6,23,0.08)',
              zIndex: 60,
              minWidth: 260,
              padding: 12
            }}>
              {(dropdownOpen === 'category' ? categories : users).map(item => (
                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={
                      dropdownOpen === 'category'
                        ? selectedCategories.includes(item)
                        : selectedUsers.includes(item)
                    }
                    onChange={() => handleSelect(dropdownOpen, item)}
                  />
                  <span style={{ fontWeight: 600 }}>{item}</span>
                </label>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={applyFilters} style={{ background: '#27ae60', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                  Apply
                </button>
                <button onClick={() => setDropdownOpen(null)} style={{ background: '#f3f4f6', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Applied filters */}
        {(appliedCategories.length > 0 || appliedUsers.length > 0) && (
          <div className="applied-filters">
            {[...appliedCategories.map(c => ({ type: 'category', value: c })), ...appliedUsers.map(u => ({ type: 'user', value: u }))].map(({ type, value }) => (
              <div key={value} style={{ background: '#ecf9ff', borderRadius: '20px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#2c3e50', fontWeight: '500' }}>{value}</span>
                <button onClick={() => removeFilter(type, value)} style={{ background: 'transparent', color: '#e74c3c', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>✕</button>
              </div>
            ))}

            <button onClick={clearAllFilters} style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontWeight: '600' }}>
              Clear All
            </button>
          </div>
        )}

        {/* Ticket list header */}
        <h2 style={{ color: '#0f172a', marginBottom: '1rem' }}>
          {authority === 'admin'
            ? showMyTickets
              ? `My Open Tickets (${openTickets.length})`
              : `All Open Tickets (${openTickets.length})`
            : `Your Open Tickets (${openTickets.length})`}
        </h2>

        {/* Ticket list */}
        {openTickets.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '2rem' }}>
            <h3 style={{ color: '#374151' }}>No results found for your search</h3>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {openTickets.map(ticket => (
              <Link key={ticket._id} to={`/ticket/${ticket._id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: '#f8f9fa',
                    padding: '1.5rem',
                    borderRadius: '10px',
                    borderLeft: `4px solid ${categoryColor(ticket.category)}`,
                    transition: '0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eef7ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8f9fa'}
                >
                  <h3 style={{ margin: 0, color: '#0f172a' }}>
                    #{ticket.ticketNumber} - {ticket.category}
                  </h3>
                  <p style={{ color: '#334155', margin: '0.5rem 0' }}>{ticket.description}</p>

                  {authority === 'admin' && (
                    <>
                      <p style={{ margin: '0.3rem 0', color: '#34495e' }}>
                        <strong>Created by:</strong> {ticket.userName || '—'}
                      </p>
                      <p style={{ margin: '0.3rem 0', color: '#34495e' }}>
                        <strong>Email:</strong> {ticket.userEmail || '—'}
                      </p>
                    </>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: 8 }}>
                    <span style={{ color: '#10b981', fontWeight: 700 }}>Status: {ticket.status}</span>
                    <span style={{ color: '#6b7280' }}>Priority: {ticket.priority}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;