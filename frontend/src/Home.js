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

  // Toast for "Login successful" message
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);

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
        const displayName = userRes.data.displayName || 'User';
        setUserName(displayName);

        // Show a small professional toast when the user first lands here after sign-in.
        // Use a sessionStorage flag per localAccountId so it shows once per sign-in.
        try {
          const acctId = accounts[0]?.localAccountId || accounts[0]?.homeAccountId || 'anon';
          const flagKey = `welcomeShown_${acctId}`;
          if (!sessionStorage.getItem(flagKey)) {
            setToastMessage(`Signed in successfully — Welcome, ${displayName}.`);
            setToastOpen(true);
            sessionStorage.setItem(flagKey, 'true');

            // auto-hide after 4 seconds
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => {
              setToastOpen(false);
              toastTimerRef.current = null;
            }, 4000);
          }
        } catch (e) {
          console.debug('Could not set welcome flag:', e);
        }

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

    return () => {
      // cleanup toast timer on unmount
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
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

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>

        {/* Toast: small professional login success popup */}
        {toastOpen && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#e6ffed',
            color: '#0b6b2f',
            border: '1px solid #b7f0c9',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 6px 20px rgba(8, 58, 20, 0.08)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '260px'
          }}>
            <div style={{ fontSize: '18px' }}>✅</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Signed in</div>
              <div style={{ fontSize: '0.9rem', color: '#0b6b2f' }}>{toastMessage}</div>
            </div>
            <button
              onClick={() => setToastOpen(false)}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0b6b2f',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              ✖
            </button>
          </div>
        )}

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

        {/* ✅ Search Bar */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <input
            type="text"
            placeholder="Search by ticket number, category, or issue..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '10px 15px',
              borderRadius: '8px',
              border: '1px solid #ccc',
              width: '60%',
              fontSize: '1rem'
            }}
          />
        </div>

        {/* ✅ Ticket Display */}
        <h2 style={{ color: '#2c3e50', marginBottom: '1rem' }}>
          {authority === 'admin'
            ? showMyTickets
              ? `My Open Tickets (${openTickets.length})`
              : `All Open Tickets (${openTickets.length})`
            : `Your Open Tickets (${openTickets.length})`}
        </h2>

        {openTickets.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '2rem' }}>
            <h3>No results found for your search</h3>
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
                    borderLeft: `4px solid ${
                      ticket.priority === 'High'
                        ? '#e74c3c'
                        : ticket.priority === 'Medium'
                        ? '#f39c12'
                        : '#27ae60'
                    }`,
                    transition: '0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eef7ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8f9fa'}
                >
                  <h3 style={{ margin: 0, color: '#2c3e50' }}>
                    #{ticket.ticketNumber} - {ticket.category}
                  </h3>
                  <p style={{ color: '#7f8c8d', margin: '0.5rem 0' }}>{ticket.description}</p>

                  {authority === 'admin' && (
                    <>
                      <p style={{ color: '#34495e', fontSize: '0.9rem', margin: 0 }}>
                        <strong>Created by:</strong> {ticket.userName || '—'}
                      </p>
                      <p style={{ color: '#34495e', fontSize: '0.9rem', margin: 0 }}>
                        <strong>Email:</strong> {ticket.userEmail || '—'}
                      </p>
                    </>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.9rem',
                    marginTop: '0.5rem'
                  }}>
                    <span style={{ color: '#27ae60' }}>Status: {ticket.status}</span>
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