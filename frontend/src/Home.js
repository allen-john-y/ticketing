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
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [appliedCategories, setAppliedCategories] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
        if (error.name === "InteractionRequiredAuthError") {
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

        const backendBase = "https://ticketing-hn59.onrender.com";

const endpoint = isAdmin
  ? `${backendBase}/tickets`
  : `${backendBase}/tickets?userId=${accounts[0].localAccountId}`;


        const ticketsRes = await axios.get(endpoint);
        const allTickets = ticketsRes.data.reverse();
        setTickets(allTickets);

        const uniqueCategories = [...new Set(allTickets.map(t => t.category).filter(Boolean))];
        setCategories(uniqueCategories);
      } catch (err) {
        console.error('Error fetching tickets:', err);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

  // ✅ Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCategoryChange = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const applyFilter = () => {
    setAppliedCategories(selectedCategories);
    setDropdownOpen(false);
  };

  const removeSingleFilter = (filter) => {
    const updated = appliedCategories.filter(f => f !== filter);
    setAppliedCategories(updated);
    setSelectedCategories(updated);
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setAppliedCategories([]);
  };

  const filteredTickets =
    authority === 'admin' && showMyTickets
      ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
      : tickets;

  const categoryFilteredTickets =
    appliedCategories.length === 0
      ? filteredTickets
      : filteredTickets.filter(t => appliedCategories.includes(t.category));

  const openTickets = categoryFilteredTickets.filter(t => t.status !== 'Closed');

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
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

          {/* ✅ Filter Dropdown */}
          <div ref={dropdownRef} style={{ position: 'relative', textAlign: 'right' }}>
            <button
              onClick={() => setDropdownOpen(prev => !prev)}
              style={{
                background: '#3498db',
                color: 'white',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Filter by Category ▾
            </button>

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
                {categories.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#7f8c8d', margin: 0 }}>No categories</p>
                ) : (
                  categories.map(cat => (
                    <label
                      key={cat}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '6px',
                        cursor: 'pointer',
                        color: '#2c3e50'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat)}
                        onChange={() => handleCategoryChange(cat)}
                      />
                      {cat}
                    </label>
                  ))
                )}
                <button
                  onClick={applyFilter}
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

        {/* ✅ Applied Filters with Individual ‘×’ */}
        {appliedCategories.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: '8px',
            marginBottom: '1rem'
          }}>
            {appliedCategories.map((filter) => (
              <div
                key={filter}
                style={{
                  background: '#ecf9ff',
                  borderRadius: '20px',
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{ color: '#2c3e50', fontWeight: '500' }}>{filter}</span>
                <button
                  onClick={() => removeSingleFilter(filter)}
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

            {/* Clear all */}
            <button
              onClick={clearFilters}
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

        {/* Action Buttons */}
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

        {/* Ticket List */}
        <h2 style={{ color: '#2c3e50', marginBottom: '1rem' }}>
          {authority === 'admin'
            ? showMyTickets
              ? `My Open Tickets (${openTickets.length})`
              : `All Open Tickets (${openTickets.length})`
            : `Your Open Tickets (${openTickets.length})`}
        </h2>

        {openTickets.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '2rem' }}>
            <h3>No open tickets</h3>
            <p>Create a new ticket above</p>
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
