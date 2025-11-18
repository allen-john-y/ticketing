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

  // Handle category + user filter
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
          t.ticketNumber.toString().includes(searchTerm) ||
          t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.description.toLowerCase().includes(searchTerm.toLowerCase())
      );

  const openTickets = searchFiltered.filter(t => t.status !== 'Closed');

  // Category -> color mapping (per your request)
  const categoryColor = (category) => {
    if (!category) return '#3498db'; // default blue
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin access') || c.includes('admin')) return '#f39c12'; // orange
    if (c.includes('payroll') || c.includes('expense')) return '#27ae60'; // green
    if (c.includes('leave') || c.includes('onboard') || c.includes('onboarding')) return '#e74c3c'; // red
    return '#3498db';
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Component-scoped CSS for upgraded button styles + search control */}
      <style>{`
        /* BUTTONS: consistent sizing, subtle elevation and hover states */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 18px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 0.95rem;
          transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
          border: none;
        }
        .btn:active { transform: translateY(1px); }

        /* Primary - bright blue gradient */
        .btn-primary {
          background: linear-gradient(90deg, #2563eb 0%, #60a5fa 100%);
          color: white;
          box-shadow: 0 8px 20px rgba(37,99,235,0.12);
        }
        .btn-primary:hover { filter: brightness(0.97); }

        /* Accent - purple for closed tickets / secondary action */
        .btn-accent {
          background: linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%);
          color: white;
          box-shadow: 0 8px 20px rgba(124,58,237,0.12);
        }
        .btn-accent:hover { filter: brightness(0.97); }

        /* Outline style for filters */
        .btn-outline {
          background: white;
          border: 1px solid #e6e9ee;
          color: #111827;
          font-weight: 600;
          padding: 8px 14px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(2,6,23,0.04);
        }
        .btn-outline .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .btn-orange {
          border-color: #f39c12;
          color: #b45400;
        }
        .btn-orange:hover { background: #fff7ec; }

        .btn-violet {
          border-color: #7c3aed;
          color: #5b21b6;
        }
        .btn-violet:hover { background: #fbf6ff; }

        /* Make action buttons consistent size */
        .action-buttons { display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; }

        /* Search box */
        .search-wrapper { display: flex; justify-content: center; margin-bottom: 1.5rem; }
        .search-box { position: relative; display: inline-flex; align-items: center; width: 100%; max-width: 560px; box-sizing: border-box; }
        .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: #6b7280; pointer-events: none; opacity: 0.9; }
        .search-input {
          width: 100%;
          padding: 10px 16px 10px 42px;
          border: 1px solid #e6e9ee;
          border-radius: 999px;
          background: #ffffff;
          font-size: 16px;
          transition: box-shadow 0.18s ease, transform 0.18s ease;
          font-family: Consolas, Monaco, monospace;
          box-shadow: 0 1px rgba(0,0,0,0.04);
          outline: none;
          color: #111827;
        }
        .search-input::placeholder { color: #2563eb; opacity: 0.85; }
        .search-input:focus {
          box-shadow: 0 8px 24px rgba(37,99,235,0.12);
          border-color: #2563eb;
          transform: translateY(-1px);
        }

        @media (max-width: 640px) {
          .action-buttons { gap: 8px; }
          .btn { padding: 10px 12px; font-size: 0.92rem; }
          .search-box { padding: 0 12px; max-width: 100%; }
        }
      `}</style>

      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ color: '#2c3e50' }}>
              Welcome, <span style={{ color: '#3498db' }}>{userName}</span>
            </h1>
            <p>
              <span style={{
                background: authority === 'admin' ? '#27ae60' : '#95a5a6',
                color: 'white',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.9rem'
              }}>
                {authority === 'admin' ? 'ADMIN' : 'USER'}
              </span>
            </p>

            {authority === 'admin' && (
              <div style={{ marginTop: '1rem' }}>
                <label style={{ fontSize: '0.95rem', color: '#2c3e50' }}>
                  <input
                    type="checkbox"
                    checked={showMyTickets}
                    onChange={() => setShowMyTickets(prev => !prev)}
                    style={{ marginRight: '8px', transform: 'scale(1.2)' }}
                  />
                  Show only my tickets
                </label>
              </div>
            )}
          </div>

          {/* Filters */}
          <div ref={dropdownRef} style={{ position: 'relative', textAlign: 'right' }}>
            <button
              onClick={() => setDropdownOpen(dropdownOpen === 'category' ? null : 'category')}
              className="btn-outline btn-orange"
              style={{ marginRight: 8 }}
              aria-expanded={dropdownOpen === 'category'}
            >
              <span className="dot" style={{ background: '#f39c12' }}></span>
              Filter by Category ▾
            </button>

            {authority === 'admin' && (
              <button
                onClick={() => setDropdownOpen(dropdownOpen === 'user' ? null : 'user')}
                className="btn-outline btn-violet"
                aria-expanded={dropdownOpen === 'user'}
              >
                <span className="dot" style={{ background: '#7c3aed' }}></span>
                Filter by User ▾
              </button>
            )}

            {dropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  marginTop: '8px',
                  background: 'white',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                  zIndex: 10,
                  minWidth: '220px',
                  padding: '10px'
                }}
              >
                {(dropdownOpen === 'category' ? categories : users).map(item => (
                  <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="checkbox"
                      checked={
                        dropdownOpen === 'category'
                          ? selectedCategories.includes(item)
                          : selectedUsers.includes(item)
                      }
                      onChange={() => handleSelect(dropdownOpen, item)}
                    />
                    {item}
                  </label>
                ))}
                <button
                  onClick={applyFilters}
                  style={{
                    background: '#27ae60',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    marginTop: '10px',
                    width: '100%',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  Apply Filter
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ✅ Applied Filters */}
        {(appliedCategories.length > 0 || appliedUsers.length > 0) && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: '8px',
            marginBottom: '1rem'
          }}>
            {[...appliedCategories.map(c => ({ type: 'category', value: c })), 
              ...appliedUsers.map(u => ({ type: 'user', value: u }))].map(({ type, value }) => (
              <div key={value} style={{
                background: '#ecf9ff',
                borderRadius: '20px',
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ color: '#2c3e50', fontWeight: '500' }}>{value}</span>
                <button
                  onClick={() => removeFilter(type, value)}
                  style={{
                    background: 'transparent',
                    color: '#e74c3c',
                    border: 'none',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              onClick={clearAllFilters}
              style={{
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '20px',
                padding: '6px 14px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Clear All
            </button>
          </div>
        )}

        {/* ✅ Action Buttons (Create + View) */}
        <div className="action-buttons" style={{ marginBottom: '1.5rem' }}>
          <Link to="/create" style={{ textDecoration: 'none' }}>
            <button className="btn btn-primary" aria-label="Create New Ticket">
              ➕ Create New Ticket
            </button>
          </Link>

          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <button className="btn btn-accent" aria-label="View Closed Tickets">
              📥 View Closed Tickets
            </button>
          </Link>
        </div>

        {/* ✅ Search Bar (now nicely integrated) */}
        <div className="search-wrapper">
          <div className="search-box" role="search" aria-label="Search tickets">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M21 21l-4.35-4.35" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="11" cy="11" r="6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              className="search-input"
              placeholder="Search by number, category, or issue..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search tickets"
            />
          </div>
        </div>

        {/* ✅ Ticket Display (styled like Dashboard closed tickets) */}
        <h2 style={{ color: '#0f172a', marginBottom: '1rem' }}>
          {authority === 'admin'
            ? showMyTickets
              ? `My Open Tickets (${openTickets.length})`
              : `All Open Tickets (${openTickets.length})`
            : `Your Open Tickets (${openTickets.length})`}
        </h2>

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

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.9rem',
                    marginTop: 8
                  }}>
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