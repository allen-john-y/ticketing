import React, { useState, useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';

function Tickets() {
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  
  const dropdownRef = useRef(null);
  const categoryBtnRef = useRef(null);
  const userBtnRef = useRef(null);

  const [profilePhoto, setProfilePhoto] = useState(null);

  // Handle location state for filters from Home page
  useEffect(() => {
    if (location.state?.filter) {
      setStatusFilter(location.state.filter);
      // Clear the state after using it
      window.history.replaceState({}, '');
    } else if (location.state?.refresh) {
      setRefreshKey(prev => prev + 1);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    const fetchData = async () => {
      if (!accounts[0]) return;

      setLoading(true);
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
        } catch (photoErr) {
          // No photo available
        }

        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('Helpdesk_Admin');
        setAuthority(isAdmin ? 'admin' : 'basic');

        const backendBase = process.env.REACT_APP_BACKEND_URL;
        const endpoint = isAdmin
          ? `${backendBase}/tickets`
          : `${backendBase}/tickets?userId=${accounts[0].localAccountId}`;

        const ticketsRes = await axios.get(endpoint);
        const allTickets = ticketsRes.data.reverse();
        console.log('Fetched tickets:', allTickets.length); // Debug log
        setTickets(allTickets);

        setCategories([...new Set(allTickets.map(t => t.category).filter(Boolean))]);
        setUsers([...new Set(allTickets.map(t => t.userName).filter(Boolean))]);
      } catch (err) {
        console.error('Error fetching tickets:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

  // Improved dropdown positioning and click outside handling
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen) {
        const isClickOnButton = 
          (categoryBtnRef.current && categoryBtnRef.current.contains(event.target)) ||
          (userBtnRef.current && userBtnRef.current.contains(event.target));
        
        const isClickInDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
        
        if (!isClickOnButton && !isClickInDropdown) {
          setDropdownOpen(null);
        }
      }
    };

    const handleScroll = () => {
      if (dropdownOpen) {
        // Update dropdown position on scroll
        const ref = dropdownOpen === 'category' ? categoryBtnRef.current : userBtnRef.current;
        if (ref) {
          const rect = ref.getBoundingClientRect();
          setDropdownPos({
            top: rect.bottom + window.scrollY + 8,
            left: rect.left + window.scrollX,
            width: Math.max(260, rect.width)
          });
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [dropdownOpen]);

  // FILTERING LOGIC
  const baseFilteredTickets = authority === 'admin' && showMyTickets
    ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
    : tickets;

  const categoryFiltered = appliedCategories.length === 0
    ? baseFilteredTickets
    : baseFilteredTickets.filter(t => appliedCategories.includes(t.category));

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

  let statusFiltered = searchFiltered;
  if (statusFilter === 'open') {
    statusFiltered = searchFiltered.filter(t => t.status === 'Open' || t.status === 'Pending');
  } else if (statusFilter === 'progress') {
    statusFiltered = searchFiltered.filter(t => t.status === 'Waiting for approval');
  } else if (statusFilter === 'closed') {
    statusFiltered = searchFiltered.filter(t => t.status === 'Closed');
  }

  const applyFilters = () => {
    setAppliedCategories([...selectedCategories]);
    setAppliedUsers([...selectedUsers]);
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
    setStatusFilter('all');
  };

  const handleSelect = (type, value) => {
    if (type === 'category') {
      setSelectedCategories(prev => prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]);
    } else {
      setSelectedUsers(prev => prev.includes(value) ? prev.filter(u => u !== value) : [...prev, value]);
    }
  };

  const openDropdown = (type) => {
    // Close if same type is clicked, otherwise open new
    if (dropdownOpen === type) {
      setDropdownOpen(null);
    } else {
      setDropdownOpen(type);
      
      // Use setTimeout to ensure refs are available after state update
      setTimeout(() => {
        const ref = type === 'category' ? categoryBtnRef.current : userBtnRef.current;
        if (ref) {
          const rect = ref.getBoundingClientRect();
          setDropdownPos({
            top: rect.bottom + window.scrollY + 8,
            left: rect.left + window.scrollX,
            width: Math.max(260, rect.width)
          });
        }
      }, 10);
    }
  };

  const categoryColor = (category) => {
    if (!category) return '#002060';
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin access') || c.includes('admin')) return '#e98404';
    if (c.includes('payroll') || c.includes('expense')) return '#10b981';
    if (c.includes('leave') || c.includes('onboard') || c.includes('onboarding')) return '#ef4444';
    return '#002060';
  };

  const initials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        * { box-sizing: border-box; }
        
        .header-bar {
          background: linear-gradient(135deg, #002060 0%, #003380 100%);
          color: white;
          padding: 1.5rem 2rem;
          box-shadow: 0 4px 16px rgba(0, 32, 96, 0.15);
        }
        
        .header-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2rem;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        
        .avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: #002060;
          font-size: 18px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .user-info h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
        }
        
        .user-role {
          display: inline-block;
          background: rgba(233, 132, 4, 0.2);
          color: #e98404;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          margin-top: 4px;
          border: 1px solid rgba(233, 132, 4, 0.3);
        }
        
        .header-actions {
          display: flex;
          gap: 1rem;
        }
        
        .btn-header {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-block;
        }
        
        .btn-primary {
          background: #e98404;
          color: white;
          box-shadow: 0 4px 12px rgba(233, 132, 4, 0.3);
        }
        
        .btn-primary:hover {
          background: #d17703;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(233, 132, 4, 0.4);
        }
        
        .btn-secondary {
          background: white;
          color: #002060;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .btn-secondary:hover {
          background: #f1f5f9;
          transform: translateY(-2px);
        }
        
        .main-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        .page-title {
          font-size: 32px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 1rem;
        }
        
        .page-subtitle {
          color: #64748b;
          font-size: 16px;
          margin-bottom: 2rem;
        }

        .my-tickets-toggle {
          background: white;
          padding: 1rem 1.5rem;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          margin-bottom: 2rem;
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          border: 1px solid #e2e8f0;
        }

        .my-tickets-toggle input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .my-tickets-toggle label {
          font-weight: 600;
          color: #0f172a;
          cursor: pointer;
          user-select: none;
        }
        
        .controls-section {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          margin-bottom: 2rem;
          border: 1px solid #e2e8f0;
        }
        
        .search-box {
          position: relative;
          margin-bottom: 1rem;
        }
        
        .search-input {
          width: 100%;
          padding: 12px 16px 12px 44px;
          border: 2px solid #e2e8f0;
          border-radius: 10px;
          font-size: 15px;
          transition: all 0.2s;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #002060;
          box-shadow: 0 0 0 3px rgba(0, 32, 96, 0.1);
        }
        
        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }
        
        .filters-row {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          align-items: center;
          position: relative;
        }
        
        .filter-btn {
          padding: 10px 16px;
          background: #f8fafc;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          color: #475569;
          transition: all 0.2s;
          position: relative;
          z-index: 5;
        }
        
        .filter-btn:hover {
          border-color: #002060;
          background: #f1f5f9;
        }
        
        .filter-dropdown {
          position: fixed;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
          z-index: 10000;
          padding: 1rem;
          max-height: 400px;
          overflow-y: auto;
        }
        
        .filter-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 8px;
          margin-bottom: 4px;
          border-radius: 6px;
          cursor: pointer;
        }
        
        .filter-item:hover {
          background: #f8fafc;
        }
        
        .filter-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
        }
        
        .applied-filters {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 1rem;
        }
        
        .filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 6px 12px;
          background: #eff6ff;
          color: #002060;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
        }
        
        .chip-remove {
          background: transparent;
          border: none;
          color: #ef4444;
          cursor: pointer;
          font-weight: 700;
          padding: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .tickets-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        
        .section-title {
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
        }
        
        .ticket-count {
          font-size: 16px;
          font-weight: 600;
          color: #64748b;
          background: #f1f5f9;
          padding: 6px 12px;
          border-radius: 20px;
        }
        
        .ticket-card {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          border-left: 4px solid;
          margin-bottom: 1rem;
          transition: all 0.2s;
          text-decoration: none;
          display: block;
          color: inherit;
          border: 1px solid #e2e8f0;
        }
        
        .ticket-card:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
          border-color: #002060;
        }
        
        .ticket-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }
        
        .ticket-number {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        
        .ticket-status {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
        }
        
        .status-open, .status-pending { background: #fef3c7; color: #92400e; }
        .status-waitingforapproval { background: #dbeafe; color: #1e3a8a; }
        .status-closed { background: #d1fae5; color: #065f46; }
        
        .ticket-description {
          color: #475569;
          margin: 0.5rem 0;
          line-height: 1.5;
        }
        
        .ticket-meta {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
          font-size: 14px;
          color: #64748b;
          margin-top: 1rem;
        }
        
        .meta-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .priority-badge {
          padding: 4px 10px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 12px;
        }
        
        .priority-high { background: #fee2e2; color: #991b1b; }
        .priority-medium { background: #fed7aa; color: #9a3412; }
        .priority-low { background: #d1fae5; color: #065f46; }
        
        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          color: #94a3b8;
        }
        
        .empty-icon {
          font-size: 64px;
          margin-bottom: 1rem;
        }
        
        @media (max-width: 768px) {
          .header-content {
            flex-direction: column;
            align-items: flex-start;
          }
          
          .header-actions {
            width: 100%;
          }
          
          .btn-header {
            flex: 1;
          }
        }
      `}</style>

      {/* Header */}
      <div className="header-bar">
        <div className="header-content">
          <div className="header-left">
            <div className="avatar">
              {profilePhoto ? (
                <img src={profilePhoto} alt={`${userName} profile`} />
              ) : (
                initials
              )}
            </div>
            <div className="user-info">
              <h1>All Tickets</h1>
              <span className="user-role">{authority === 'admin' ? 'ADMINISTRATOR' : 'USER'}</span>
            </div>
          </div>
          <div className="header-actions">
            <Link to="/create" className="btn-header btn-primary">
              + Create Ticket
            </Link>
            <Link to="/" className="btn-header btn-secondary">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-container">
        {/* Admin: Show only my tickets toggle */}
        {authority === 'admin' && (
          <div className="my-tickets-toggle">
            <input
              type="checkbox"
              id="myTicketsToggle"
              checked={showMyTickets}
              onChange={() => setShowMyTickets(prev => !prev)}
            />
            <label htmlFor="myTicketsToggle">
              Show only my tickets
            </label>
          </div>
        )}

        {/* Search & Filters */}
        <div className="controls-section">
          <div className="search-box">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="11" cy="11" r="8" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              className="search-input"
              type="text"
              placeholder="Search by ticket number, category, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filters-row">
            <button
              ref={categoryBtnRef}
              onClick={() => openDropdown('category')}
              className="filter-btn"
            >
              🏷️ Category {selectedCategories.length > 0 && `(${selectedCategories.length})`} ▾
            </button>

            {authority === 'admin' && (
              <button
                ref={userBtnRef}
                onClick={() => openDropdown('user')}
                className="filter-btn"
              >
                👤 User {selectedUsers.length > 0 && `(${selectedUsers.length})`} ▾
              </button>
            )}

            {(appliedCategories.length > 0 || appliedUsers.length > 0 || statusFilter !== 'all') && (
              <button
                onClick={clearAllFilters}
                style={{ marginLeft: 'auto', padding: '10px 16px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
              >
                Clear All Filters
              </button>
            )}
          </div>

          {(appliedCategories.length > 0 || appliedUsers.length > 0) && (
            <div className="applied-filters">
              {appliedCategories.map(cat => (
                <div key={cat} className="filter-chip">
                  {cat}
                  <button className="chip-remove" onClick={() => removeFilter('category', cat)}>×</button>
                </div>
              ))}
              {appliedUsers.map(user => (
                <div key={user} className="filter-chip">
                  {user}
                  <button className="chip-remove" onClick={() => removeFilter('user', user)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dropdown - Fixed positioning */}
        {dropdownOpen && (
          <div
            ref={dropdownRef}
            className="filter-dropdown"
            style={{
              top: `${dropdownPos.top}px`,
              left: `${dropdownPos.left}px`,
              minWidth: `${dropdownPos.width}px`,
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
              <button onClick={applyFilters} style={{ flex: 1, padding: '8px', background: '#002060', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                Apply
              </button>
              <button onClick={() => setDropdownOpen(null)} style={{ flex: 1, padding: '8px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* Tickets List */}
        <div className="tickets-header">
          <h2 className="section-title">
            {statusFilter === 'open' && `Open Tickets`}
            {statusFilter === 'progress' && `Waiting for Approval`}
            {statusFilter === 'closed' && `Closed Tickets`}
            {statusFilter === 'all' && (authority === 'admin'
              ? showMyTickets
                ? `My Tickets`
                : `All Tickets`
              : `Your Tickets`)}
          </h2>
          <div className="ticket-count">
            {statusFiltered.length} {statusFiltered.length === 1 ? 'ticket' : 'tickets'}
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-icon">⏳</div>
            <h3 style={{ color: '#475569', marginBottom: '0.5rem' }}>Loading tickets...</h3>
            <p style={{ color: '#94a3b8' }}>Please wait while we fetch your tickets</p>
          </div>
        ) : statusFiltered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3 style={{ color: '#475569', marginBottom: '0.5rem' }}>No tickets found</h3>
            <p style={{ color: '#94a3b8' }}>Try adjusting your filters or search terms</p>
          </div>
        ) : (
          <div>
            {statusFiltered.map(ticket => (
              <Link key={ticket._id} to={`/ticket/${ticket._id}`} className="ticket-card" style={{ borderLeftColor: categoryColor(ticket.category) }}>
                <div className="ticket-header">
                  <h3 className="ticket-number">#{ticket.ticketNumber} - {ticket.category}</h3>
                  <span className={`ticket-status status-${ticket.status?.toLowerCase().replace(' ', '').replace('for', '')}`}>
                    {ticket.status}
                  </span>
                </div>
                
                <p className="ticket-description">{ticket.description}</p>
                
                {authority === 'admin' && (
                  <div style={{ 
                    marginTop: '0.75rem', 
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '14px', 
                    color: '#475569'
                  }}>
                    <div><strong style={{ color: '#0f172a' }}>Created by:</strong> {ticket.userName || '—'}</div>
                    <div><strong style={{ color: '#0f172a' }}>Email:</strong> {ticket.userEmail || '—'}</div>
                  </div>
                )}
                
                <div className="ticket-meta">
                  <div className="meta-item">
                    <span className={`priority-badge priority-${ticket.priority?.toLowerCase()}`}>
                      {ticket.priority} Priority
                    </span>
                  </div>
                  <div className="meta-item">
                    📅 {new Date(ticket.createdAt).toLocaleDateString()}
                  </div>
                  {ticket.assignedTo && (
                    <div className="meta-item">
                      👤 {ticket.assignedTo}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Tickets;