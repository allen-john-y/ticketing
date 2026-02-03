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

  // dropdownOpen: null | 'category' | 'user'
  const [dropdownOpen, setDropdownOpen] = useState(null);
  // dropdown position for anchoring
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 260 });

  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const categoryBtnRef = useRef(null);
  const userBtnRef = useRef(null);

  // New: store profile photo data URL (if available)
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

        // Try to fetch the user's photo from Graph. If it exists, convert to base64 and use it.
        // If it fails (404 or other), we silently ignore and keep initials fallback.
        try {
          const photoRes = await axios.get('https://graph.microsoft.com/v1.0/me/photo/$value', {
            headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
            responseType: 'arraybuffer'
          });

          // Convert arraybuffer to base64 (browser-safe)
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
          // No photo available or permission issue — fall back to initials (do not log noisy errors)
          // console.debug('No profile photo:', photoErr?.response?.status || photoErr.message);
        }

        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('Helpdesk_Admin');
        setAuthority(isAdmin ? 'admin' : 'basic');

        const backendBase = "https://helpdesk.sandeza.ai/backend";
        const endpoint = isAdmin
          ? `${backendBase}/tickets`
          : `${backendBase}/tickets?userId=${accounts[0].localAccountId}`;

        const ticketsRes = await axios.get(endpoint);
        const allTickets = ticketsRes.data.reverse();
        setTickets(allTickets);

        setCategories([...new Set(allTickets.map(t => t.category).filter(Boolean))]);
        setUsers([...new Set(allTickets.map(t => t.userName).filter(Boolean))]);
      } catch (err) {
        console.error('Error fetching tickets:', err);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const onDocClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          !categoryBtnRef.current?.contains(e.target) &&
          !userBtnRef.current?.contains(e.target)) {
        setDropdownOpen(null);
      }
    };
    window.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', () => setDropdownOpen(null), true);
    window.addEventListener('resize', () => setDropdownOpen(null));
    return () => {
      window.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', () => setDropdownOpen(null), true);
      window.removeEventListener('resize', () => setDropdownOpen(null));
    };
  }, []);

  // compute filtered lists
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
    : userFiltered.filter(t =>
        (t.ticketNumber || '').toString().includes(searchTerm) ||
        (t.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      );

  const openTickets = searchFiltered.filter(t => t.status !== 'Closed');
  const closedTickets = tickets.filter(t => t.status === 'Closed');

  const applyFilters = () => {
    setAppliedCategories(selectedCategories);
    setAppliedUsers(selectedUsers);
    setDropdownOpen(null);
  };

  const removeFilter = (type, value) => {
    if (type === 'category') {
      const updated = appliedCategories.filter(c => c !== value);
      setAppliedCategories(updated);
      setSelectedCategories(updated);
    } else {
      const updated = appliedUsers.filter(u => u !== value);
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

  const handleSelect = (type, value) => {
    if (type === 'category') {
      setSelectedCategories(prev => prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]);
    } else {
      setSelectedUsers(prev => prev.includes(value) ? prev.filter(u => u !== value) : [...prev, value]);
    }
  };

  // Anchor dropdown under the clicked button
  const openDropdown = (type) => {
    setDropdownOpen(prev => prev === type ? null : type);
    const ref = type === 'category' ? categoryBtnRef.current : userBtnRef.current;
    if (ref) {
      const rect = ref.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: Math.max(260, rect.width)
      });
    }
  };

  // Category color mapping
  const categoryColor = (category) => {
    if (!category) return '#3498db';
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin access') || c.includes('admin')) return '#f39c12';
    if (c.includes('payroll') || c.includes('expense')) return '#27ae60';
    if (c.includes('leave') || c.includes('onboard') || c.includes('onboarding')) return '#e74c3c';
    return '#3498db';
  };

  const initials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        /* Overall spacing + card */
        .welcome { display:flex; gap:16px; align-items:center; background:linear-gradient(180deg,#fff,#fbfdff); padding:18px; border-radius:12px; box-shadow:0 6px 24px rgba(2,6,23,0.06); margin-bottom:18px; }
        .avatar { width:64px; height:64px; border-radius:12px; background:linear-gradient(135deg,#eef2ff,#e9f5ff); display:flex; align-items:center; justify-content:center; font-weight:800; color:#3730a3; font-size:20px; box-shadow:0 4px 12px rgba(2,6,23,0.06); overflow:hidden; }
        .avatar img { width:100%; height:100%; object-fit:cover; display:block; }
        .welcome-left { flex:1; display:flex; gap:12px; align-items:center; }
        .welcome-title { font-size:20px; font-weight:800; color:#0f172a; margin:0; }
        .role-badge { display:inline-block; padding:6px 12px; border-radius:999px; font-weight:700; font-size:12px; color:white; }
        .role-admin { background:linear-gradient(90deg,#16a34a,#60a5fa); }
        .role-user { background:linear-gradient(90deg,#94a3b8,#64748b); }

        /* KPIs */
        .kpis { display:flex; gap:10px; margin-top:6px; flex-wrap:wrap; }
        .kpi { background:#f8fafc; padding:8px 12px; border-radius:10px; font-weight:700; color:#0f172a; display:inline-flex; gap:10px; align-items:center; box-shadow:0 4px 12px rgba(2,6,23,0.03); }
        .kpi .num { color:#0b6fbd; font-weight:900; }

        /* Action buttons */
        .actions { display:flex; gap:10px; }
        .btn { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:700; border:none; }
        .btn-create { background:linear-gradient(90deg,#2563eb,#60a5fa); color:white; box-shadow:0 8px 20px rgba(14, 79, 217, 0.12); }
        .btn-closed { background:linear-gradient(90deg,#7c3aed,#a78bfa); color:white; box-shadow:0 8px 20px rgba(88, 19, 207, 0.12); }

        /* Search area: always centered */
        .search-wrapper { display:flex; justify-content:center; margin-bottom:14px; }
        .search-pill { width:100%; max-width:760px; border-radius:999px; padding:6px; background:linear-gradient(90deg, rgba(37,99,235,0.06), rgba(124,58,237,0.04)); box-shadow:0 6px 18px rgba(37,99,235,0.04); box-sizing:border-box; }
        .search-inner { display:flex; align-items:center; background:white; border-radius:999px; padding:10px 14px; min-height:46px; }
        .search-icon { width:20px; height:20px; margin-right:12px; color:#64748b; flex:0 0 20px; }
        .search-input { width:100%; border:none; outline:none; font-size:15px; font-family:Consolas,Monaco,monospace; color:#0f172a; }
        .search-input::placeholder { color:#2563eb; opacity:0.95; }
        .search-inner:focus-within { box-shadow:0 10px 30px rgba(216, 180, 18, 0.08); transform:translateY(-1px); }

        /* Filters row (below search) */
        .filters-row { display:flex; gap:12px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
        .filter-btn { display:inline-flex; align-items:center; gap:8px; padding:9px 12px; border-radius:10px; background:white; border:1px solid rgba(15,23,42,0.06); box-shadow:0 4px 12px rgba(2,6,23,0.04); color:#0f172a; font-weight:600; cursor:pointer; transition:box-shadow 120ms; }
        .filter-btn:hover { box-shadow:0 8px 20px rgba(2,6,23,0.06); }
        .filter-dot { width:10px; height:10px; border-radius:50%; box-shadow:0 2px 6px rgba(2,6,23,0.06); }
        .filter-category { background:linear-gradient(180deg,#f59e0b,#d97706); }
        .filter-user { background:linear-gradient(180deg,#7c3aed,#6d28d9); }

        /* Dropdown (anchored) */
        .filter-dropdown { position:fixed; background:white; border:1px solid #e6e9ee; border-radius:8px; box-shadow:0 12px 40px rgba(2,6,23,0.12); z-index:9999; padding:12px; }
        .filter-item { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        .filter-actions { display:flex; gap:8px; margin-top:8px; }

        /* Applied filters */
        .applied { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; justify-content:flex-end; }
        .chip { background:#ecf9ff; border-radius:20px; padding:6px 10px; display:flex; align-items:center; gap:6px; font-weight:600; color:#2c3e50; }

        @media (max-width:840px) {
          .welcome { flex-direction:column; align-items:stretch; }
          .actions { justify-content:space-between; width:100%; }
          .search-pill { max-width:100%; }
          .filters-row { justify-content:flex-end; }
        }
      `}</style>

      {/* Welcome card */}
      <div className="welcome" role="region" aria-label="Welcome">
        <div className="avatar" aria-hidden>
          {profilePhoto ? (
            <img src={profilePhoto} alt={`${userName} profile`} />
          ) : (
            initials
          )}
        </div>

        <div className="welcome-left">
          <div>
            <h2 className="welcome-title">Welcome back, <span style={{ color: '#2563eb' }}>{userName}</span></h2>
            <div style={{ marginTop: 6 }}>
              <span className={`role-badge ${authority === 'admin' ? 'role-admin' : 'role-user'}`}>
                {authority === 'admin' ? 'ADMIN' : 'USER'}
              </span>
              <div className="kpis" style={{ marginTop: 8 }}>
                <div className="kpi"><span className="num">{openTickets.length}</span><span style={{ marginLeft: 8 }}>Open</span></div>
                <div className="kpi"><span className="num">{closedTickets.length}</span><span style={{ marginLeft: 8 }}>Closed</span></div>
                {/* Total KPI removed per request */}
              </div>

              {/* Admin-only "Show only my tickets" checkbox */}
              {authority === 'admin' && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: '0.95rem', color: '#2c3e50', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={showMyTickets}
                      onChange={() => setShowMyTickets(prev => !prev)}
                      style={{ transform: 'scale(1.1)' }}
                    />
                    Show only my tickets
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="actions" role="toolbar" aria-label="Quick actions">
          <Link to="/create" style={{ textDecoration: 'none' }}>
            <button className="btn btn-create" aria-label="Create New Ticket">Create Ticket</button>
          </Link>
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <button className="btn btn-closed" aria-label="View Closed Tickets">Closed Tickets</button>
          </Link>
        </div>
      </div>

      {/* centered search */}
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

      {/* filters row (moved below search) */}
      <div className="filters-row" ref={dropdownRef}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <button
            ref={categoryBtnRef}
            onClick={() => openDropdown('category')}
            className="filter-btn"
            aria-expanded={dropdownOpen === 'category'}
            aria-controls="filter-dropdown"
            aria-haspopup="true"
            title="Filter by Category"
          >
            <span className="filter-dot filter-category" aria-hidden />
            Filter by Category ▾
          </button>

          {authority === 'admin' && (
            <button
              ref={userBtnRef}
              onClick={() => openDropdown('user')}
              className="filter-btn"
              aria-expanded={dropdownOpen === 'user'}
              aria-controls="filter-dropdown"
              aria-haspopup="true"
              title="Filter by User"
            >
              <span className="filter-dot filter-user" aria-hidden />
              Filter by User ▾
            </button>
          )}
        </div>
      </div>

      {/* anchored dropdown (positioned under clicked button) */}
      {dropdownOpen && (
        <div
          id="filter-dropdown"
          role="dialog"
          aria-modal="false"
          ref={dropdownRef}
          className="filter-dropdown"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            minWidth: dropdownPos.width,
          }}
        >
          {(dropdownOpen === 'category' ? categories : users).map(item => (
            <label key={item} className="filter-item">
              <input
                type="checkbox"
                checked={dropdownOpen === 'category' ? selectedCategories.includes(item) : selectedUsers.includes(item)}
                onChange={() => handleSelect(dropdownOpen, item)}
              />
              <span style={{ fontWeight: 600 }}>{item}</span>
            </label>
          ))}

          <div className="filter-actions">
            <button onClick={applyFilters} style={{ background: '#27ae60', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
              Apply
            </button>
            <button onClick={() => setDropdownOpen(null)} style={{ background: '#f3f4f6', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* applied filters */}
      {(appliedCategories.length > 0 || appliedUsers.length > 0) && (
        <div className="applied" aria-live="polite">
          {[...appliedCategories.map(c => ({ type: 'category', value: c })), ...appliedUsers.map(u => ({ type: 'user', value: u }))].map(({ type, value }) => (
            <div key={value} className="chip">
              <span>{value}</span>
              <button onClick={() => removeFilter(type, value)} style={{ background: 'transparent', color: '#e74c3c', border: 'none', fontWeight: 'bold', cursor: 'pointer' }} aria-label={`Remove filter ${value}`}>✕</button>
            </div>
          ))}
          <button onClick={clearAllFilters} style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontWeight: '600' }}>
            Clear All
          </button>
        </div>
      )}

      {/* ticket list header */}
      <h2 style={{ color: '#0f172a', marginBottom: '1rem' }}>
        {authority === 'admin'
          ? showMyTickets
            ? `My Open Tickets (${openTickets.length})`
            : `All Open Tickets (${openTickets.length})`
          : `Your Open Tickets (${openTickets.length})`}
      </h2>

      {/* tickets */}
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
  );
}

export default Home;