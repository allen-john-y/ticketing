import React, { useState, useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import logo from './sandeza.jpg'; // Make sure this path is correct

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
        } catch (photoErr) { }

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

        setCategories([...new Set(allTickets.map(t => t.category).filter(Boolean))]);
        setUsers([...new Set(allTickets.map(t => t.userName).filter(Boolean))]);
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
    if (!category) return '#002060';
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin')) return '#e98404';
    if (c.includes('payroll') || c.includes('expense')) return '#27ae60';
    if (c.includes('leave') || c.includes('onboard')) return '#e74c3c';
    return '#002060';
  };

  const initials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <>
      {/* Brand Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@700;900&family=Open+Sans:wght@400;600;800&display=swap" />

      <div style={{
        minHeight: '100vh',
        background: '#002060',
        color: '#333',
        fontFamily: 'Open Sans, sans-serif',
        padding: '2rem 1rem'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            background: '#002060',
            color: 'white',
            padding: '1.8rem 2.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src={logo} alt="Sandeza logo" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} />
              <div>
                <h1 style={{
                  margin: 0,
                  fontFamily: 'Red Hat Display, sans-serif',
                  fontWeight: 900,
                  fontSize: '2rem',
                  letterSpacing: '0.5px'
                }}>SANDEZA INC</h1>
                <p style={{ margin: '4px 0 0', fontSize: '1.1rem', opacity: 0.9 }}>IT Ticket Portal • Welcome, {userName}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {profilePhoto ? (
                <img src={profilePhoto} alt="Profile" style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid #e98404' }} />
              ) : (
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', background: '#e98404', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem'
                }}>{initials}</div>
              )}
              <span style={{
                background: authority === 'admin' ? '#e98404' : '#002060',
                padding: '8px 16px',
                borderRadius: 30,
                fontWeight: 700,
                fontSize: '0.9rem'
              }}>
                {authority.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Main Content */}
          <div style={{ padding: '2.5rem' }}>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 20, marginBottom: '2rem', flexWrap: 'wrap' }}>
              <div style={{ background: '#f8f9fa', padding: '1rem 1.5rem', borderRadius: 12, flex: 1, minWidth: 180, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#e98404' }}>{openTickets.length}</div>
                <div style={{ fontWeight: 600, color: '#002060' }}>Open Tickets</div>
              </div>
              <div style={{ background: '#f8f9fa', padding: '1rem 1.5rem', borderRadius: 12, flex: 1, minWidth: 180, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#27ae60' }}>{closedTickets.length}</div>
                <div style={{ fontWeight: 600, color: '#002060' }}>Closed Tickets</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 16, marginBottom: '2rem', flexWrap: 'wrap' }}>
              <Link to="/create" style={{ textDecoration: 'none' }}>
                <button style={{
                  background: '#e98404',
                  color: 'white',
                  border: 'none',
                  padding: '14px 28px',
                  borderRadius: 10,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(233,132,4,0.3)'
                }}>Create New Ticket</button>
              </Link>
              <Link to="/dashboard" style={{ textDecoration: 'none' }}>
                <button style={{
                  background: '#002060',
                  color: 'white',
                  border: 'none',
                  padding: '14px 28px',
                  borderRadius: 10,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>View All Closed</button>
              </Link>
            </div>

            {/* Admin: My Tickets Toggle */}
            {authority === 'admin' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: '#002060', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showMyTickets} onChange={() => setShowMyTickets(!showMyTickets)} />
                  Show only my tickets
                </label>
              </div>
            )}

            {/* Search */}
            <div style={{ marginBottom: '1.5rem' }}>
              <input
                type="text"
                placeholder="Search by ticket number, category, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  border: '2px solid #e0e0e0',
                  borderRadius: 12,
                  fontSize: '1rem',
                  outline: 'none',
                  transition: '0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#e98404'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <button ref={categoryBtnRef} onClick={() => openDropdown('category')} style={{
                padding: '10px 16px',
                background: 'white',
                border: '2px solid #002060',
                color: '#002060',
                borderRadius: 10,
                fontWeight: 600,
                cursor: 'pointer'
              }}>
                Category Filter ▼
              </button>
              {authority === 'admin' && (
                <button ref={userBtnRef} onClick={() => openDropdown('user')} style={{
                  padding: '10px 16px',
                  background: 'white',
                  border: '2px solid #002060',
                  color: '#002060',
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                  User Filter ▼
                </button>
              )}
            </div>

            {/* Dropdown */}
            {dropdownOpen && (
              <div ref={dropdownRef} style={{
                position: 'fixed',
                top: dropdownPos.top,
                left: dropdownPos.left,
                background: 'white',
                border: '1px solid #ddd',
                borderRadius: 12,
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                padding: '1rem',
                zIndex: 9999,
                minWidth: 260
              }}>
                {(dropdownOpen === 'category' ? categories : users).map(item => (
                  <label key={item} style={{ display: 'block', margin: '8px 0' }}>
                    <input
                      type="checkbox"
                      checked={dropdownOpen === 'category' ? selectedCategories.includes(item) : selectedUsers.includes(item)}
                      onChange={() => handleSelect(dropdownOpen, item)}
                    /> {item}
                  </label>
                ))}
                <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
                  <button onClick={applyFilters} style={{ background: '#002060', color: 'white', padding: '8px 14px', borderRadius: 8, border: 'none', fontWeight: 600 }}>Apply</button>
                  <button onClick={() => setDropdownOpen(null)} style={{ background: '#eee', padding: '8px 14px', borderRadius: 8, border: 'none' }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Applied Filters */}
            {(appliedCategories.length > 0 || appliedUsers.length > 0) && (
              <div style={{ marginBottom: '1.5rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {appliedCategories.map(c => (
                  <span key={c} style={{ background: '#e98404', color: 'white', padding: '6px 12px', borderRadius: 20, fontSize: '0.9rem' }}>
                    {c} <button onClick={() => removeFilter('category', c)} style={{ background: 'none', border: 'none', color: 'white', marginLeft: 6, cursor: 'pointer' }}>×</button>
                  </span>
                ))}
                {appliedUsers.map(u => (
                  <span key={u} style={{ background: '#002060', color: 'white', padding: '6px 12px', borderRadius: 20, fontSize: '0.9rem' }}>
                    {u} <button onClick={() => removeFilter('user', u)} style={{ background: 'none', border: 'none', color: 'white', marginLeft: 6, cursor: 'pointer' }}>×</button>
                  </span>
                ))}
                <button onClick={clearAllFilters} style={{ color: '#e74c3c', fontWeight: 600, background: 'none', border: 'none' }}>Clear All</button>
              </div>
            )}

            {/* Ticket List */}
            <h2 style={{
              fontFamily: 'Red Hat Display, sans-serif',
              fontWeight: 900,
              color: '#002060',
              fontSize: '1.8rem',
              margin: '2rem 0 1.5rem'
            }}>
              {authority === 'admin'
                ? showMyTickets ? `My Open Tickets (${openTickets.length})` : `All Open Tickets (${openTickets.length})`
                : `Your Open Tickets (${openTickets.length})`}
            </h2>

            {openTickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#777' }}>
                <h3>No tickets found</h3>
                <p>Try adjusting your search or filters.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1.2rem' }}>
                {openTickets.map(ticket => (
                  <Link key={ticket._id} to={`/ticket/${ticket._id}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      background: '#fff',
                      border: '1px solid #eee',
                      borderLeft: `5px solid ${categoryColor(ticket.category)}`,
                      borderRadius: 12,
                      padding: '1.5rem',
                      transition: '0.2s',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                      <h3 style={{ margin: 0, color: '#002060', fontWeight: 800, fontSize: '1.3rem' }}>
                        #{ticket.ticketNumber} • {ticket.category}
                      </h3>
                      <p style={{ color: '#444', margin: '0.8rem 0', lineHeight: 1.5 }}>{ticket.description}</p>
                      {authority === 'admin' && (
                        <p style={{ color: '#666', fontSize: '0.95rem' }}>
                          <strong>By:</strong> {ticket.userName} ({ticket.userEmail})
                        </p>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.95rem' }}>
                        <span style={{ color: '#27ae60', fontWeight: 700 }}>Status: {ticket.status}</span>
                        <span style={{ color: '#002060', fontWeight: 600 }}>Priority: {ticket.priority}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Home;