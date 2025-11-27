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

  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 260 });

  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const categoryBtnRef = useRef(null);
  const userBtnRef = useRef(null);

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
        } catch (photoErr) {}

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

        setCategories([...new Set(ticketsRes.data.map(t => t.category).filter(Boolean))]);
        setUsers([...new Set(ticketsRes.data.map(t => t.userName).filter(Boolean))]);
      } catch (err) {
        console.error('Error fetching tickets:', err);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

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

  const categoryColor = (category) => {
    if (!category) return '#3498db';
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin access') || c.includes('admin')) return '#f39c12';
    if (c.includes('payroll') || c.includes('expense')) return '#27ae60';
    if (c.includes('leave') || c.includes('onboard') || c.includes('onboarding')) return '#e98404';
    return '#002060';
  };

  const initials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <>
      {/* ✅ Import brand fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="sandbox:/fonts.googleapis.com/css2?family=Red+Hat+Display:wght@700;900&family=Open+Sans:wght@400;600;800&display=swap"
      />

      <div style={{ fontFamily: 'Open Sans, sans-serif', padding: '2rem', maxWidth: '1200px', margin: '0 auto', background:'#f8fafc' }}>

      <style>{`
        .header-title { font-family: 'Red Hat Display', sans-serif; font-weight:900; color:#002060; font-size:1.6rem; text-align:center; margin-bottom:16px }
        .badge-admin { background:#e98404; color:white; padding:6px 14px; border-radius:20px; font-weight:700; font-size:12px }
        .badge-user { background:#002060; color:white; padding:6px 14px; border-radius:20px; font-weight:700; font-size:12px }
        .ticket-card { background:white; padding:1.4rem; border-radius:10px; border-left:5px solid; transition:0.3s; box-shadow:0 6px 18px rgba(0,0,0,0.05) }
        .ticket-card:hover { transform:translateY(-2px); box-shadow:0 12px 30px rgba(233,132,4,0.12) }
        .btn-main { background:#e98404; color:white; padding:12px 18px; border-radius:8px; font-weight:700; border:none; cursor:pointer; font-family:'Open Sans'; width:100% }
        .btn-main:hover { opacity:0.92 }
        .filter-btn { background:#002060; color:white; padding:10px 16px; border:none; borderRadius:8px; cursor:pointer; font-weight:600 }
        .filter-btn:hover { opacity:0.9 }
      `}</style>

      {/* Portal heading */}
      <h1 className="header-title">SANDEZA HELPDESK PORTAL</h1>

      {/* Welcome card */}
      <div className="welcome" role="region" aria-label="Welcome" style={{ background:'white', borderRadius:12, padding:'20px', display:'flex', alignItems:'center', gap:16, boxShadow:'0 6px 18px rgba(0,0,0,0.05)' }}>
        <div className="avatar">
          {profilePhoto ? (
            <img src={profilePhoto} alt={`${userName} profile`} />
          ) : (
            initials
          )}
        </div>

        <div style={{ flex:1 }}>
          <h2 style={{ fontFamily:'Red Hat Display', fontWeight:700, margin:0, color:'#0f172a' }}>
            Welcome back, <span style={{ color:'#e98404' }}>{userName}</span>
          </h2>

          {/* Role badge + KPIs */}
          <div style={{ marginTop:10 }}>
            <span className={authority === 'admin' ? 'badge-admin' : 'badge-user'}>
              {authority === 'admin' ? 'ADMIN' : 'USER'}
            </span>

            <div className="kpis" style={{ marginTop:10 }}>
              <div className="kpi"><span className="num">{openTickets.length}</span> Open</div>
              <div className="kpi"><span className="num">{closedTickets.length}</span> Closed</div>
            </div>

            {/* Admin-only "Show only my tickets" checkbox */}
            {authority === 'admin' && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily:'Open Sans' }}>
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

        {/* Action buttons */}
        <div className="actions">
          <Link to="/create">
            <button className="btn btn-create" style={{ background:'#e98404', color:'white', padding:'10px 16px', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontFamily:'Open Sans' }}>Create Ticket</button>
          </Link>
          <Link to="/dashboard">
            <button className="btn btn-closed" style={{ background:'#002060', color:'white', padding:'10px 16px', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontFamily:'Open Sans' }}>Closed Tickets</button>
          </Link>
        </div>
      </div>

      {/* Centered Search */}
      <div className="search-wrapper">
        <div className="search-pill">
          <div className="search-inner">
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" strokeWidth="2"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2"/>
            </svg>
            <input
              className="search-input"
              placeholder="Search by ticket number, category, or issue..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search tickets"
              style={{ fontFamily:'Open Sans' }}
            />
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginBottom:16 }}>
        <button
          ref={categoryBtnRef}
          onClick={() => openDropdown('category')}
          className="filter-btn"
          aria-haspopup="true"
          aria-expanded={dropdownOpen === 'category'}>
          Filter by Category ▾
        </button>

        {authority === 'admin' && (
          <button
            ref={userBtnRef}
            onClick={() => openDropdown('user')}
            className="filter-btn"
            aria-haspopup="true"
            aria-expanded={dropdownOpen === 'user'}>
            Filter by User ▾
          </button>
        )}
      </div>

      {/* Dropdown */}
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
          }}>
          {(dropdownOpen === 'category' ? categories : users).map(item => (
            <label key={item} className="filter-item" style={{ fontFamily:'Open Sans' }}>
              <input
                type="checkbox"
                checked={dropdownOpen === 'category' ? selectedCategories.includes(item) : selectedUsers.includes(item)}
                onChange={() => handleSelect(dropdownOpen, item)}
              />
              {item}
            </label>
          ))}

          <div className="filter-actions">
            <button onClick={applyFilters} className="btn-main">Apply Filters</button>
            <button onClick={() => setDropdownOpen(null)} className="filter-btn" style={{ background:'#f3f4f6', color:'#0f172a', borderRadius:8 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Applied Filters */}
      {(appliedCategories.length > 0 || appliedUsers.length > 0) && (
        <div className="applied" aria-live="polite" style={{ justifyContent:'flex-end', marginBottom:16 }}>
          {[...appliedCategories.map(c => ({ type: 'category', value: c })), ...appliedUsers.map(u => ({ type: 'user', value: u }))].map(({ type, value }) => (
            <div key={value} className="chip" style={{ fontFamily:'Open Sans', borderLeft:`3px solid ${type === 'category' ? '#e98404' : '#002060'}` }}>
              {value}
              <button onClick={() => removeFilter(type, value)} style={{ border:'none', background:'transparent', color:'#e74c3c', cursor:'pointer', fontWeight:700 }}>✕</button>
            </div>
          ))}
          <button onClick={clearAllFilters} className="btn-main" style={{ width:'auto', padding:'6px 14px', borderRadius:20 }}>Clear All</button>
        </div>
      )}

      {/* Ticket List */}
      {openTickets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', fontFamily:'Open Sans' }}>
          <h3>No open tickets found</h3>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', fontFamily:'Open Sans' }}>
          {openTickets.map(ticket => (
            <Link key={ticket._id} to={`/ticket/${ticket._id}`} style={{ textDecoration: 'none' }}>
              <div className="ticket-card" style={{ borderLeftColor: categoryColor(ticket.category) }}>
                <h3 style={{ fontFamily:'Red Hat Display', fontWeight:900, margin:0, color:'#002060' }}>#{ticket.ticketNumber} - {ticket.category}</h3>
                <p style={{ margin:'6px 0 0', color:'#333', fontSize:14 }}>{ticket.description}</p>

                {/* Admin-only details untouched */}
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

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop:10, fontSize:13 }}>
                  <span style={{ color:'#27ae60', fontWeight:800 }}>Status: {ticket.status}</span>
                  <span style={{ color:'#666'}}>Priority: {ticket.priority}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

    </div>
    </>
  );
}

export default Home;
