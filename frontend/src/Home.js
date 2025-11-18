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
      {/* Inject small component-scoped CSS for the search input so the :focus and ::placeholder rules work */}
      <style>{`
        .input {
          padding: 10px;
          width: 120px;
          border: none;
          outline: none;
          border-radius: 5px;
          box-shadow: 0 1px gray;
          font-size: 18px;
          transition: width 0.3s;
          font-family: Consolas,monaco,monospace;
        }

        .input:focus {
          outline: 1px solid blue;
          box-shadow: none;
          width: 230px;
        }

        .input::placeholder {
          color: blue;
        }

        /* small responsive tweak so large screens keep the search centered nicely */
        @media (min-width: 900px) {
          .search-wrapper { display: flex; justify-content: center; }
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
              style={{
                background: '#3498db',
                color: 'white',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                marginRight: '10px'
              }}
            >
              Filter by Category ▾
            </button>

            {authority === 'admin' && (
              <button
                onClick={() => setDropdownOpen(dropdownOpen === 'user' ? null : 'user')}
                style={{
                  background: '#9b59b6',
                  color: 'white',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
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

        {/* ✅ Action Buttons */}
        <div style={{
          textAlign: 'center',
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'center',
          gap: '1rem'
        }}>
          <Link to="/create" style={{ textDecoration: 'none' }}>
            <button style={{
              background: '#3498db',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600'
            }}>
              Create New Ticket
            </button>
          </Link>

          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <button style={{
              background: '#9b59b6',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600'
            }}>
              View Closed Tickets
            </button>
          </Link>
        </div>

        {/* ✅ Search Bar (uses .input CSS you provided, and remains fully wired to searchTerm/filtering) */}
        <div className="search-wrapper" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <input
            type="text"
            className="input"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search tickets"
          />
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