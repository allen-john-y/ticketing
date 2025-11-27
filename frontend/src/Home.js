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
      try {
        const ticketsRes = await axios.get("https://ticketing-production-5334.up.railway.app/tickets");
        const allTickets = ticketsRes.data.reverse();
        setTickets(allTickets);
        setCategories([...new Set(allTickets.map(t => t.category).filter(Boolean))]);
        setUsers([...new Set(allTickets.map(t => t.userName).filter(Boolean))]);
        setUserName(accounts[0].name || "User");
        setAuthority(allTickets.some(t => t.userId === accounts[0].localAccountId) ? "admin" : "basic");
      } catch (err) {
        console.error("Error fetching tickets:", err);
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

  const openTickets = userFiltered.filter(t => t.status !== 'Closed');
  const closedTickets = tickets.filter(t => t.status === 'Closed');

  const applyFilters = () => {
    setAppliedCategories(selectedCategories);
    setAppliedUsers(selectedUsers);
    setDropdownOpen(null);
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

  const initials = (userName || accounts?.[0]?.username || 'U')
    .split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <>
      {/* Font linking same as login page */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="sandbox:/fonts.googleapis.com/css2?family=Red+Hat+Display:wght@700;900&family=Open+Sans:wght@400;600;800&display=swap" />

      <div
        style={{
          minHeight: '100vh',
          padding: '2rem',
          background: '#002060',
          fontFamily: 'Open Sans, sans-serif'
        }}
      >
        {/* Main Card container */}
        <div
          style={{
            background: 'white',
            padding: '2.5rem',
            borderRadius: 15,
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            maxWidth: '900px',
            margin: '0 auto'
          }}
        >
          {/* Welcome Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '2rem',
            flexWrap: 'wrap',
            gap: 15
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  background: '#002060',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 22,
                  color: 'white',
                  overflow: 'hidden'
                }}
              >
                {profilePhoto ? (
                  <img src={profilePhoto} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  initials
                )}
              </div>
              <div>
                <h2 style={{
                  margin: 0,
                  fontSize: '1.6rem',
                  fontWeight: 900,
                  fontFamily: 'Red Hat Display, sans-serif',
                  color: '#002060'
                }}>
                  Welcome back,<span style={{ color: '#e98404', marginLeft: 8 }}>{userName}</span>
                </h2>

                <div style={{ marginTop: 8 }}>
                  <span style={{
                    background: authority === 'admin' ? '#e98404' : '#002060',
                    padding: '5px 14px',
                    borderRadius: 20,
                    fontSize: 13,
                    color: 'white',
                    fontWeight: 700
                  }}>
                    {authority === 'admin' ? 'ADMIN' : 'USER'}
                  </span>
                </div>
              </div>
            </div>

            {/* KPI Status */}
            <div style={{
              display: 'flex',
              gap: 18,
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#334155'
            }}>
              <span>🔵 Open: <span style={{ color: '#002060', fontWeight: 900 }}>{openTickets.length}</span></span>
              <span>🟠 Closed: <span style={{ color: '#e98404', fontWeight: 900 }}>{closedTickets.length}</span></span>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <Link to="/create" style={{ textDecoration: 'none' }}>
                <button style={{
                  background: '#e98404',
                  color: 'white',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'Open Sans, sans-serif'
                }}>Create Ticket</button>
              </Link>

              <Link to="/dashboard" style={{ textDecoration: 'none' }}>
                <button style={{
                  background: '#002060',
                  color: 'white',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'Open Sans, sans-serif'
                }}>Closed Tickets</button>
              </Link>
            </div>
          </div>

          {/* Search Bar */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <input
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                maxWidth: '600px',
                border: '1px solid #e6e9ee',
                padding: '12px 16px',
                borderRadius: 30,
                outline: 'none',
                fontSize: 15,
                fontWeight: 600,
                fontFamily: 'Open Sans, sans-serif'
              }}
            />
          </div>

          {/* Filter Buttons */}
          <div style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
            marginBottom: '1rem',
            flexWrap: 'wrap'
          }}>
            <button
              ref={categoryBtnRef}
              onClick={() => openDropdown('category')}
              style={{
                background: '#002060',
                color: 'white',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Open Sans, sans-serif'
              }}>Filter by Category ▾</button>

            {authority === 'admin' && (
              <button
                ref={userBtnRef}
                onClick={() => openDropdown('user')}
                style={{
                  background: '#e98404',
                  color: 'white',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'Open Sans, sans-serif'
                }}>Filter by User ▾</button>
            )}

            {(appliedCategories.length > 0 || appliedUsers.length > 0) && (
              <button onClick={clearAllFilters} style={{
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Open Sans, sans-serif'
              }}>Clear All</button>
            )}
          </div>

          {/* Dropdown */}
          {dropdownOpen && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute',
                top: dropdownPos.top,
                left: dropdownPos.left,
                background: 'white',
                padding: 14,
                borderRadius: 10,
                minWidth: 260,
                boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                border: '1px solid #e6e9ee',
                zIndex: 9999
              }}
            >
              {(dropdownOpen === 'category' ? categories : users).map(item => (
                <label key={item} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  fontWeight: 600,
                  fontFamily: 'Open Sans, sans-serif',
                  color: '#0f172a'
                }}>
                  <input
                    type="checkbox"
                    checked={dropdownOpen === 'category' ? selectedCategories.includes(item) : selectedUsers.includes(item)}
                    onChange={() => handleSelect(dropdownOpen, item)}
                    style={{ transform: 'scale(1.05)' }}
                  />
                  {item}
                </label>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={applyFilters} style={{
                  flex: 1,
                  background: '#27ae60',
                  color: 'white',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 700
                }}>Apply</button>

                <button onClick={() => setDropdownOpen(null)} style={{
                  flex: 1,
                  background: '#f3f4f6',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 700
                }}>Close</button>
              </div>
            </div>
          )}

          {/* Tickets List */}
          <div style={{ display: 'grid', gap: '1rem' }}>
            {openTickets.map(ticket => (
              <Link key={ticket._id} to={`/ticket/${ticket._id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: '#f8f9fa',
                    padding: '1.4rem',
                    borderRadius: '10px',
                    borderLeft: `4px solid ${categoryColor(ticket.category)}`,
                    transition: '0.2s',
                    cursor: 'pointer',
                    fontFamily:'Open Sans, sans-serif'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eef7ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8f9fa'}
                >
                  <h3 style={{ margin: 0, fontWeight: 800, fontFamily:'Red Hat Display, sans-serif', color:'#002060' }}>
                    #{ticket.ticketNumber} - {ticket.category}
                  </h3>
                  <p style={{ marginTop: 6, color:'#334155', fontSize:15, fontWeight:600 }}>{ticket.description}</p>

                  {authority === 'admin' && (
                    <>
                      <p style={{ margin: '0.3rem 0', color:'#334155', fontSize:14 }}>
                        <strong>Created by:</strong> {ticket.userName || '—'}
                      </p>
                      <p style={{ margin: '0.3rem 0', color:'#334155', fontSize:14 }}>
                        <strong>Email:</strong> {ticket.userEmail || '—'}
                      </p>
                    </>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop:12, fontSize:14, fontWeight:700 }}>
                    <span style={{ color:'#002060' }}>Status: {ticket.status}</span>
                    <span style={{ color:'#e98404' }}>Priority: {ticket.priority}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default Home;
