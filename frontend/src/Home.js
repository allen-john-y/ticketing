import React, { useState, useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import logo from './sandeza.jpg';

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
          const contentType = photoRes.headers?.['content-type'] || 'image/jpeg';
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
    <div style={{
      minHeight: '100vh',
      background: '#002060',
      fontFamily: '"Open Sans", sans-serif',
      color: '#333'
    }}>
      {/* Header - Exactly like Login.js */}
      <div style={{
        background: '#002060',
        color: 'white',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{
          maxWidth: '500px',
          margin: '0 auto',
          background: 'white',
          borderRadius: '15px',
          padding: '2.5rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          color: '#002060'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
            <img src={logo} alt="Sandeza" style={{ width: 64, height: 64, borderRadius: 12 }} />
            <h1 style={{ margin: 0, fontFamily: '"Red Hat Display", sans-serif', fontWeight: 900, fontSize: '2.2rem' }}>
              SANDEZA INC
            </h1>
          </div>
          <h2 style={{ margin: '1rem 0 0', fontFamily: '"Red Hat Display", sans-serif', fontWeight: 900, color: '#e98404' }}>
            IT Ticket Portal
          </h2>
          <p style={{ margin: '1rem 0 0', fontSize: '1.1rem', opacity: 0.9 }}>
            Welcome back, <strong>{userName}</strong> • {authority === 'admin' ? 'Administrator' : 'User'}
          </p>
        </div>
      </div>

      {/* Main Content Card */}
      <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: '15px', padding: '2.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ textAlign: 'center', padding: '1.5rem', background: '#f9f9f9', borderRadius: 12 }}>
              <div style={{ fontSize: '3rem', fontWeight: 900, color: '#e98404' }}>{openTickets.length}</div>
              <div style={{ fontWeight: 600, color: '#002060' }}>Open Tickets</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1.5rem', background: '#f9f9f9', borderRadius: 12 }}>
              <div style={{ fontSize: '3rem', fontWeight: 900, color: '#27ae60' }}>{closedTickets.length}</div>
              <div style={{ fontWeight: 600, color: '#002060' }}>Closed Tickets</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/create"><button style={{ background: '#e98404', color: 'white', border: 'none', padding: '15px 32px', borderRadius: 8, fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer' }}>Create New Ticket</button></Link>
            <Link to="/dashboard"><button style={{ background: '#002060', color: 'white', border: 'none', padding: '15px 32px', borderRadius: 8, fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer' }}>View All Closed</button></Link>
          </div>

          {/* Admin Toggle */}
          {authority === 'admin' && (
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <label style={{ fontWeight: 600 }}>
                <input type="checkbox" checked={showMyTickets} onChange={() => setShowMyTickets(!showMyTickets)} style={{ marginRight: 8 }} />
                Show only my tickets
              </label>
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '14px', border: '2px solid #ddd', borderRadius: 8, fontSize: '1rem', marginBottom: '1.5rem' }}
          />

          {/* Filters */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <button ref={categoryBtnRef} onClick={() => openDropdown('category')} style={{ padding: '10px 20px', background: 'white', border: '2px solid #002060', color: '#002060', borderRadius: 8, fontWeight: 600 }}>Category Filter</button>
            {authority === 'admin' && <button ref={userBtnRef} onClick={() => openDropdown('user')} style={{ padding: '10px 20px', background: 'white', border: '2px solid #002060', color: '#002060', borderRadius: 8, fontWeight: 600 }}>User Filter</button>}
          </div>

          {/* Dropdown & Filters UI - kept functional, styled simply */}
          {dropdownOpen && (
            <div ref={dropdownRef} style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, background: 'white', border: '1px solid #ddd', borderRadius: 8, padding: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', zIndex: 9999, minWidth: 260 }}>
              {(dropdownOpen === 'category' ? categories : users).map(item => (
                <label key={item} style={{ display: 'block', margin: '8px 0' }}>
                  <input type="checkbox" checked={dropdownOpen === 'category' ? selectedCategories.includes(item) : selectedUsers.includes(item)} onChange={() => handleSelect(dropdownOpen, item)} /> {item}
                </label>
              ))}
              <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                <button onClick={applyFilters} style={{ background: '#002060', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, marginRight: 8 }}>Apply</button>
                <button onClick={() => setDropdownOpen(null)} style={{ background: '#eee', padding: '8px 16px', borderRadius: 6 }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Applied Filters */}
          {(appliedCategories.length > 0 || appliedUsers.length > 0) && (
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {appliedCategories.map(c => <span key={c} style={{ background: '#e98404', color: 'white', padding: '6px 12px', borderRadius: 20 }}>#{c} <button onClick={() => removeFilter('category', c)} style={{ background: 'none', border: 'none', color: 'white', marginLeft: 6 }}>×</button></span>)}
              {appliedUsers.map(u => <span key={u} style={{ background: '#002060', color: 'white', padding: '6px 12px', borderRadius: 20 }}>@ {u} <button onClick={() => removeFilter('user', u)} style={{ background: 'none', border: 'none', color: 'white', marginLeft: 6 }}>×</button></span>)}
              <button onClick={clearAllFilters} style={{ color: '#e74c3c', fontWeight: 600 }}>Clear All</button>
            </div>
          )}

          {/* Tickets List */}
          <h2 style={{ fontFamily: '"Red Hat Display", sans-serif', fontWeight: 900, color: '#002060', margin: '2rem 0 1rem' }}>
            {authority === 'admin' ? (showMyTickets ? 'My Open Tickets' : 'All Open Tickets') : 'Your Open Tickets'} ({openTickets.length})
          </h2>

          {openTickets.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#777', padding: '3rem 0' }}>No tickets found.</p>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {openTickets.map(ticket => (
                <Link key={ticket._id} to={`/ticket/${ticket._id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{
                    background: 'white',
                    border: '1px solid #eee',
                    borderLeft: `6px solid ${categoryColor(ticket.category)}`,
                    borderRadius: 10,
                    padding: '1.5rem',
                    transition: '0.2s'
                  }}>
                    <h3 style={{ margin: '0 0 0.5rem', color: '#002060', fontWeight: 800 }}>
                      #{ticket.ticketNumber} - {ticket.category}
                    </h3>
                    <p style={{ margin: '0.5rem 0', color: '#444' }}>{ticket.description}</p>
                    {authority === 'admin' && (
                      <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.5rem 0' }}>
                        <strong>By:</strong> {ticket.userName} • {ticket.userEmail}
                      </p>
                    )}
                    <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#002060', fontWeight: 600 }}>
                      Status: {ticket.status} • Priority: {ticket.priority}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;