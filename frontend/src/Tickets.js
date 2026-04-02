import React, { useState, useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import filterIcon from './filter.jpg';

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
  const [loadingMore, setLoadingMore] = useState(false);

  const [displayedTickets, setDisplayedTickets] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [ticketsPerPage] = useState(10);
  const [hasMore, setHasMore] = useState(false);

  // New state for view mode
  const [viewMode, setViewMode] = useState('table'); // 'table', 'list', 'tiles', 'content'
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const viewDropdownRef = useRef(null);

  const dropdownRef = useRef(null);
  const categoryBtnRef = useRef(null);
  const userBtnRef = useRef(null);
  const viewBtnRef = useRef(null);

  const [profilePhoto, setProfilePhoto] = useState(null);

  // View mode icons/emojis
  const viewIcons = {
    table: '📊',
    list: '📝',
    tiles: '🔲',
    content: '📄'
  };

  useEffect(() => {
    if (location.state?.filter) {
      setStatusFilter(location.state.filter);
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
            binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize));
          }
          const contentType = (photoRes.headers && photoRes.headers['content-type']) || 'image/jpeg';
          setProfilePhoto(`data:${contentType};base64,${btoa(binary)}`);
        } catch (_) {}

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
        setTickets(allTickets);
        setCategories([...new Set(allTickets.map(t => t.category).filter(Boolean))]);
        setUsers([...new Set(allTickets.map(t => t.userName).filter(Boolean))]);
        setCurrentPage(1);
      } catch (err) {
        console.error('Error fetching tickets:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

  useEffect(() => {
    updateDisplayedTickets();
  }, [tickets, appliedCategories, appliedUsers, searchTerm, statusFilter, showMyTickets, authority, accounts, currentPage]);

  // Close view dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target)) {
        setViewDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateDisplayedTickets = () => {
    const filtered = getFilteredTickets();
    const indexOfLastTicket = currentPage * ticketsPerPage;
    setDisplayedTickets(filtered.slice(0, indexOfLastTicket));
    setHasMore(filtered.length > indexOfLastTicket);
  };

  const getFilteredTickets = () => {
    const base = authority === 'admin' && showMyTickets
      ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
      : tickets;

    const byCat = appliedCategories.length === 0 ? base : base.filter(t => appliedCategories.includes(t.category));
    const byUser = appliedUsers.length === 0 ? byCat : byCat.filter(t => appliedUsers.includes(t.userName));
    const bySearch = searchTerm.trim() === '' ? byUser : byUser.filter(t =>
      (t.ticketNumber || '').toString().includes(searchTerm) ||
      (t.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (statusFilter === 'open')
      return bySearch.filter(t => t.status === 'Open' || t.status === 'Pending');

    if (statusFilter === 'progress')
      return bySearch.filter(t => t.status === 'Waiting for approval');

    if (statusFilter === 'closed')
      return bySearch.filter(t => t.status === 'Closed');

    if (statusFilter === 'high')
      return bySearch.filter(t => t.priority === 'High' && t.status !== 'Closed');

    return bySearch.filter(t => t.status !== 'Closed');
  };

  const totalFilteredCount = getFilteredTickets().length;

  const applyFilters = () => {
    setAppliedCategories([...selectedCategories]);
    setAppliedUsers([...selectedUsers]);
    setDropdownOpen(null);
    setCurrentPage(1);
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
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedUsers([]);
    setAppliedCategories([]);
    setAppliedUsers([]);
    setStatusFilter('all');
    setCurrentPage(1);
  };

  const handleSelect = (type, value) => {
    if (type === 'category') {
      setSelectedCategories(prev => prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]);
    } else {
      setSelectedUsers(prev => prev.includes(value) ? prev.filter(u => u !== value) : [...prev, value]);
    }
  };

  const openDropdown = (type) => {
    if (dropdownOpen === type) { setDropdownOpen(null); return; }
    setDropdownOpen(type);
    setTimeout(() => {
      const ref = type === 'category' ? categoryBtnRef.current : userBtnRef.current;
      if (ref) {
        const rect = ref.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX, width: Math.max(240, rect.width) });
      }
    }, 10);
  };

  const loadMoreTickets = () => {
    setLoadingMore(true);
    setTimeout(() => {
      setCurrentPage(prev => prev + 1);
      setLoadingMore(false);
    }, 400);
  };

  const statusMeta = (status) => {
    if (!status) return { label: '—', color: '#9ca3af', bg: 'rgba(255,255,255,0.1)' };
    const s = status.toLowerCase();
    if (s === 'open' || s === 'pending') return { label: status, color: '#fcd34d', bg: 'rgba(245, 158, 11, 0.2)' };
    if (s === 'waiting for approval') return { label: status, color: '#93c5fd', bg: 'rgba(59, 130, 246, 0.2)' };
    if (s === 'closed') return { label: status, color: '#86efac', bg: 'rgba(16, 185, 129, 0.2)' };
    return { label: status, color: '#d1d5db', bg: 'rgba(255,255,255,0.1)' };
  };

  const priorityMeta = (priority) => {
    if (!priority) return { color: '#9ca3af' };
    const p = priority.toLowerCase();
    if (p === 'high') return { color: '#f87171' };
    if (p === 'medium') return { color: '#fbbf24' };
    return { color: '#86efac' };
  };

  const sectionTitle = () => {
    if (statusFilter === 'open') return 'Open Tickets';
    if (statusFilter === 'progress') return 'Waiting for Approval';
    if (statusFilter === 'closed') return 'Closed Tickets';
    if (statusFilter === 'high') return 'High Priority Tickets';
    if (authority === 'admin') return showMyTickets ? 'My Tickets' : 'All Tickets';
    return 'Your Tickets';
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const mainTitle = statusFilter === 'all' ? 'All Tickets' : sectionTitle();

  // Skeleton row for table
  const TableSkeleton = () => (
    <tr className="tk-table-row-skel">
      <td><div className="skel" style={{ width: 80, height: 16 }} /></td>
      <td><div className="skel" style={{ width: 120, height: 16 }} /></td>
      <td><div className="skel" style={{ width: 100, height: 16 }} /></td>
      <td><div className="skel" style={{ width: 70, height: 16 }} /></td>
      <td><div className="skel" style={{ width: 200, height: 16 }} /></td>
    </tr>
  );

  // Skeleton for list view
  const ListSkeleton = () => (
    <div className="tk-list-item-skel">
      <div className="skel" style={{ width: '100%', height: 60, borderRadius: 8 }} />
    </div>
  );

  // Skeleton for tiles view
  const TileSkeleton = () => (
    <div className="tk-tile-skel">
      <div className="skel" style={{ width: '100%', height: 120, borderRadius: 10 }} />
    </div>
  );

  // Table View
  const renderTableView = () => (
    <div className="tk-table-container">
      <table className="tk-table">
        <thead>
          <tr>
            <th>Ticket #</th>
            <th>Category</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {displayedTickets.map(ticket => {
            const sm = statusMeta(ticket.status);
            let priorityStyle = {};
            if (ticket.priority === 'High') priorityStyle = { background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' };
            else if (ticket.priority === 'Medium') priorityStyle = { background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' };
            else if (ticket.priority === 'Low') priorityStyle = { background: 'rgba(16, 185, 129, 0.2)', color: '#86efac' };
            
            return (
              <tr 
                key={ticket._id} 
                onClick={() => window.location.href = `/ticket/${ticket._id}`}
              >
                <td className="tk-ticket-number">#{ticket.ticketNumber}</td>
                <td>{ticket.category}</td>
                <td>
                  <span className="tk-status-badge" style={{ background: sm.bg, color: sm.color }}>
                    {sm.label}
                  </span>
                </td>
                <td>
                  <span className="tk-priority-badge" style={priorityStyle}>
                    {ticket.priority}
                  </span>
                </td>
                <td className="tk-description-cell" title={ticket.description}>
                  {ticket.description}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // List View
  const renderListView = () => (
    <div className="tk-list-container">
      {displayedTickets.map(ticket => {
        const sm = statusMeta(ticket.status);
        const pm = priorityMeta(ticket.priority);
        return (
          <div 
            key={ticket._id} 
            className="tk-list-item"
            onClick={() => window.location.href = `/ticket/${ticket._id}`}
          >
            <div className="tk-list-item-accent" style={{ background: pm.color }} />
            <div className="tk-list-item-content">
              <div className="tk-list-item-header">
                <span className="tk-list-item-number">#{ticket.ticketNumber}</span>
                <span className="tk-list-item-category">{ticket.category}</span>
                <span className="tk-list-item-status" style={{ background: sm.bg, color: sm.color }}>
                  {sm.label}
                </span>
              </div>
              <div className="tk-list-item-description">{ticket.description}</div>
              <div className="tk-list-item-footer">
                <span>Priority: {ticket.priority}</span>
                <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Tiles View
  const renderTilesView = () => (
    <div className="tk-tiles-container">
      {displayedTickets.map(ticket => {
        const sm = statusMeta(ticket.status);
        const pm = priorityMeta(ticket.priority);
        return (
          <div 
            key={ticket._id} 
            className="tk-tile"
            onClick={() => window.location.href = `/ticket/${ticket._id}`}
          >
            <div className="tk-tile-header" style={{ borderLeftColor: pm.color }}>
              <span className="tk-tile-number">#{ticket.ticketNumber}</span>
              <span className="tk-tile-status" style={{ background: sm.bg, color: sm.color }}>
                {sm.label}
              </span>
            </div>
            <div className="tk-tile-category">{ticket.category}</div>
            <div className="tk-tile-description">{ticket.description.substring(0, 80)}...</div>
            <div className="tk-tile-footer">
              <span className="tk-tile-priority" style={{ color: pm.color }}>{ticket.priority}</span>
              <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Content View (more detailed)
  const renderContentView = () => (
    <div className="tk-content-container">
      {displayedTickets.map(ticket => {
        const sm = statusMeta(ticket.status);
        const pm = priorityMeta(ticket.priority);
        return (
          <div 
            key={ticket._id} 
            className="tk-content-item"
            onClick={() => window.location.href = `/ticket/${ticket._id}`}
          >
            <div className="tk-content-header">
              <div>
                <span className="tk-content-number">#{ticket.ticketNumber}</span>
                <span className="tk-content-category">{ticket.category}</span>
              </div>
              <span className="tk-content-status" style={{ background: sm.bg, color: sm.color }}>
                {sm.label}
              </span>
            </div>
            <div className="tk-content-description">{ticket.description}</div>
            <div className="tk-content-meta">
              <div className="tk-content-meta-item">
                <strong>Priority:</strong> {ticket.priority}
              </div>
              <div className="tk-content-meta-item">
                <strong>Created:</strong> {new Date(ticket.createdAt).toLocaleString()}
              </div>
              {ticket.userName && (
                <div className="tk-content-meta-item">
                  <strong>By:</strong> {ticket.userName}
                </div>
              )}
              {ticket.assignedTo && (
                <div className="tk-content-meta-item">
                  <strong>Assigned:</strong> {ticket.assignedTo}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Render current view based on viewMode
  const renderCurrentView = () => {
    if (loading) {
      if (viewMode === 'table') {
        return (
          <div className="tk-table-container">
            <table className="tk-table">
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(i => <TableSkeleton key={i} />)}
              </tbody>
            </table>
          </div>
        );
      } else if (viewMode === 'list') {
        return (
          <div className="tk-list-container">
            {[1, 2, 3, 4, 5].map(i => <ListSkeleton key={i} />)}
          </div>
        );
      } else if (viewMode === 'tiles') {
        return (
          <div className="tk-tiles-container">
            {[1, 2, 3, 4, 5, 6].map(i => <TileSkeleton key={i} />)}
          </div>
        );
      } else {
        return (
          <div className="tk-content-container">
            {[1, 2, 3, 4].map(i => <ListSkeleton key={i} />)}
          </div>
        );
      }
    }

    if (displayedTickets.length === 0) {
      return (
        <div className="tk-empty">
          <div className="tk-empty-icon">📭</div>
          <h3>No tickets found</h3>
          <p>Try adjusting your filters or search terms</p>
        </div>
      );
    }

    switch(viewMode) {
      case 'table':
        return renderTableView();
      case 'list':
        return renderListView();
      case 'tiles':
        return renderTilesView();
      case 'content':
        return renderContentView();
      default:
        return renderTableView();
    }
  };

  return (
    <div className="tk-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        * { 
          box-sizing: border-box; 
          margin: 0; 
          padding: 0; 
        }

        body {
          margin: 0;
          padding: 0;
          background: #0f172a;
        }

        .tk-root {
          min-height: 100vh;
          width: 100%;
          background: linear-gradient(135deg, #0f172a 0%, #1a1f35 100%);
          font-family: 'Inter', sans-serif;
          color: #f3f4f6;
        }

        /* ── Skeleton ── */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .skel {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          animation: pulse 1.6s ease-in-out infinite;
        }

        /* ── Body ── */
        .tk-body {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        /* ── Header ── */
        .tk-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 2.5rem;
          padding: 2rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          backdrop-filter: blur(10px);
        }

        .tk-date {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #9ca3af;
          margin-bottom: 8px;
        }

        .tk-page-title {
          font-size: 32px;
          font-weight: 700;
          color: #f3f4f6;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .tk-header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .hd-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s ease;
          border: none;
        }
        .hd-btn-primary { 
          background: #3b82f6; 
          color: #fff;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        .hd-btn-primary:hover { 
          background: #2563eb;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
        }
        .hd-btn-secondary { 
          background: rgba(255, 255, 255, 0.1); 
          color: #e5e7eb; 
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .hd-btn-secondary:hover { 
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
        }

        /* ── Filters row ── */
        .tk-filters-row-wrap {
          margin-bottom: 1.5rem;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .tk-filters-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-left: auto;
        }

        .tk-filter-btn {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          color: #d1d5db;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tk-filter-btn:hover { 
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.1);
          color: #93c5fd;
        }
        .tk-filter-btn.active { 
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.2);
          color: #93c5fd;
        }

        .tk-clear-btn {
          padding: 8px 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          color: #fca5a5;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .tk-clear-btn:hover { 
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.5);
        }

        .tk-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 1.5rem;
          justify-content: flex-end;
        }

        .tk-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          color: #d1d5db;
        }
        .tk-chip-x {
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 0;
          display: flex;
          align-items: center;
        }
        .tk-chip-x:hover { color: #f87171; }

        /* ── Toggle switch ── */
        .hd-switch {
          position: relative;
          width: 44px;
          height: 24px;
          flex-shrink: 0;
        }
        .hd-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .hd-switch-track {
          position: absolute;
          inset: 0;
          background: #374151;
          border-radius: 24px;
          transition: background 0.2s;
          cursor: pointer;
        }
        .hd-switch input:checked + .hd-switch-track { background: #3b82f6; }
        .hd-switch-track::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 3px;
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
        }
        .hd-switch input:checked + .hd-switch-track::after { transform: translateX(20px); }

        .tk-toggle-wrap {
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        }

        .tk-toggle-label {
          font-size: 14px;
          font-weight: 500;
          color: #d1d5db;
          cursor: pointer;
          user-select: none;
        }

        /* ── Controls (search) ── */
        .tk-controls {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 1.5rem;
          backdrop-filter: blur(10px);
        }

        .tk-search-wrap {
          position: relative;
        }

        .tk-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
          pointer-events: none;
        }

        .tk-search {
          width: 100%;
          padding: 12px 16px 12px 42px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          background: rgba(255, 255, 255, 0.05);
          color: #f3f4f6;
          transition: all 0.2s ease;
        }
        .tk-search:focus {
          outline: none;
          border-color: #3b82f6;
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .tk-search::placeholder { color: #6b7280; }

        /* ── Dropdown ── */
        .tk-dropdown {
          position: absolute;
          background: #1f2937;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
          z-index: 10000;
          padding: 0.5rem;
          max-height: 320px;
          overflow-y: auto;
          min-width: 180px;
        }

        .tk-view-dropdown {
          right: 0;
          left: auto !important;
        }

        .tk-dd-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: #d1d5db;
          transition: all 0.15s;
        }
        .tk-dd-item:hover { background: rgba(255, 255, 255, 0.1); }
        .tk-dd-item.active { background: rgba(59, 130, 246, 0.2); color: #93c5fd; font-weight: 600; }
        .tk-dd-item input { cursor: pointer; accent-color: #3b82f6; }

        .tk-dd-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .tk-dd-apply {
          flex: 1; padding: 8px; background: #3b82f6; color: #fff;
          border: none; border-radius: 8px; font-size: 13px;
          font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer;
          transition: all 0.2s;
        }
        .tk-dd-apply:hover { background: #2563eb; }
        .tk-dd-close {
          flex: 1; padding: 8px; background: rgba(255, 255, 255, 0.1); color: #d1d5db;
          border: none; border-radius: 8px; font-size: 13px;
          font-weight: 500; font-family: 'Inter', sans-serif; cursor: pointer;
          transition: all 0.2s;
        }
        .tk-dd-close:hover { background: rgba(255, 255, 255, 0.15); }

        /* ── Section heading ── */
        .tk-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 1.5rem;
        }

        .tk-count-badge {
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', monospace;
          color: #93c5fd;
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.3);
          padding: 6px 16px;
          border-radius: 20px;
        }

        .tk-view-wrapper {
          position: relative;
          margin-left: auto;
        }

        .tk-view-btn {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          color: #d1d5db;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tk-view-btn:hover { 
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.1);
          color: #93c5fd;
        }
        .tk-view-btn img {
          width: 16px;
          height: 16px;
          opacity: 0.6;
        }

        /* ── Table View ── */
        .tk-table-container {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 1.5rem;
          backdrop-filter: blur(10px);
        }

        .tk-table {
          width: 100%;
          border-collapse: collapse;
          font-family: 'Inter', sans-serif;
        }

        .tk-table th {
          text-align: left;
          padding: 1rem 1.25rem;
          background: rgba(255, 255, 255, 0.03);
          font-size: 11px;
          font-weight: 700;
          color: #9ca3af;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .tk-table td {
          padding: 1rem 1.25rem;
          font-size: 13px;
          color: #e5e7eb;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .tk-table tbody tr {
          cursor: pointer;
          transition: background 0.2s;
        }

        .tk-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .tk-table tbody tr:last-child td {
          border-bottom: none;
        }

        .tk-status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }

        .tk-priority-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
        }

        .tk-ticket-number {
          font-family: 'Inter', monospace;
          font-weight: 700;
          color: #60a5fa;
        }

        .tk-description-cell {
          max-width: 300px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #9ca3af;
        }

        /* ── List View ── */
        .tk-list-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 1.5rem;
        }

        .tk-list-item {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(10px);
        }
        .tk-list-item:hover {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
          transform: translateY(-2px);
          background: rgba(59, 130, 246, 0.05);
        }

        .tk-list-item-accent {
          width: 4px;
          flex-shrink: 0;
        }

        .tk-list-item-content {
          flex: 1;
          padding: 1rem 1.25rem;
        }

        .tk-list-item-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
          flex-wrap: wrap;
        }

        .tk-list-item-number {
          font-family: 'Inter', monospace;
          font-weight: 700;
          font-size: 13px;
          color: #60a5fa;
        }

        .tk-list-item-category {
          font-weight: 700;
          font-size: 14px;
          color: #f3f4f6;
        }

        .tk-list-item-status {
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.03em;
        }

        .tk-list-item-description {
          font-size: 13px;
          color: #d1d5db;
          margin-bottom: 10px;
          line-height: 1.5;
        }

        .tk-list-item-footer {
          display: flex;
          gap: 16px;
          font-size: 11px;
          color: #9ca3af;
        }

        /* ── Tiles View ── */
        .tk-tiles-container {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .tk-tile {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.25rem;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(10px);
        }
        .tk-tile:hover {
          border-color: #3b82f6;
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(59, 130, 246, 0.2);
          background: rgba(59, 130, 246, 0.05);
        }

        .tk-tile-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          border-left: 3px solid transparent;
          padding-left: 8px;
          margin-left: -8px;
        }

        .tk-tile-number {
          font-family: 'Inter', monospace;
          font-weight: 700;
          font-size: 13px;
          color: #60a5fa;
        }

        .tk-tile-status {
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.03em;
        }

        .tk-tile-category {
          font-weight: 700;
          font-size: 15px;
          color: #f3f4f6;
          margin-bottom: 8px;
        }

        .tk-tile-description {
          font-size: 12px;
          color: #d1d5db;
          margin-bottom: 16px;
          line-height: 1.5;
        }

        .tk-tile-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #9ca3af;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 12px;
        }

        .tk-tile-priority {
          font-weight: 700;
        }

        /* ── Content View ── */
        .tk-content-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .tk-content-item {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(10px);
        }
        .tk-content-item:hover {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
          background: rgba(59, 130, 246, 0.05);
        }

        .tk-content-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .tk-content-number {
          font-family: 'Inter', monospace;
          font-weight: 700;
          font-size: 14px;
          color: #60a5fa;
          margin-right: 12px;
        }

        .tk-content-category {
          font-weight: 700;
          font-size: 16px;
          color: #f3f4f6;
        }

        .tk-content-status {
          padding: 4px 14px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
        }

        .tk-content-description {
          font-size: 14px;
          color: #d1d5db;
          margin-bottom: 20px;
          line-height: 1.6;
          padding: 0 4px;
        }

        .tk-content-meta {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 1rem 1.25rem;
        }

        .tk-content-meta-item {
          font-size: 13px;
          color: #d1d5db;
        }
        .tk-content-meta-item strong {
          color: #f3f4f6;
          font-weight: 600;
          margin-right: 6px;
        }

        /* ── Empty ── */
        .tk-empty {
          text-align: center;
          padding: 4rem 2rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #9ca3af;
        }
        .tk-empty-icon {
          font-size: 48px;
          margin-bottom: 1rem;
          opacity: 0.5;
        }
        .tk-empty h3 {
          font-size: 16px;
          font-weight: 600;
          color: #d1d5db;
          margin-bottom: 4px;
        }
        .tk-empty p { font-size: 13px; }

        /* ── Load more ── */
        .tk-load-more {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin-top: 1.5rem;
        }

        .tk-load-btn {
          padding: 10px 28px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          color: #60a5fa;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .tk-load-btn:hover:not(:disabled) { 
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.15);
          transform: translateY(-2px);
        }
        .tk-load-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .tk-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .tk-showing {
          font-size: 12px;
          color: #9ca3af;
          font-family: 'Inter', monospace;
        }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .tk-body {
            padding: 1.5rem;
          }
        }

        @media (max-width: 768px) {
          .tk-table th:nth-child(5),
          .tk-table td:nth-child(5) {
            display: none;
          }
          .tk-tiles-container {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .tk-body { padding: 1rem; }
          .tk-header { flex-direction: column; align-items: flex-start; gap: 1rem; padding: 1.5rem; }
          .tk-header-actions { width: 100%; }
          .hd-btn { flex: 1; justify-content: center; }
          .tk-filters-left { width: 100%; }
          
          .tk-table th:nth-child(3),
          .tk-table td:nth-child(3),
          .tk-table th:nth-child(4),
          .tk-table td:nth-child(4) {
            display: none;
          }
          
          .tk-content-meta {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="tk-body">
        {/* Header */}
        <div className="tk-header">
          <div>
            <div className="tk-date">{today}</div>
            <div className="tk-page-title">{mainTitle}</div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="tk-filters-row-wrap">
          <div className="tk-filters-left">
            <button
              ref={categoryBtnRef}
              onClick={() => openDropdown('category')}
              className={`tk-filter-btn${appliedCategories.length > 0 ? ' active' : ''}`}
            >
              📂 Category {appliedCategories.length > 0 ? `(${appliedCategories.length})` : ''} ▾
            </button>

            {authority === 'admin' && (
              <button
                ref={userBtnRef}
                onClick={() => openDropdown('user')}
                className={`tk-filter-btn${appliedUsers.length > 0 ? ' active' : ''}`}
              >
                👤 User {appliedUsers.length > 0 ? `(${appliedUsers.length})` : ''} ▾
              </button>
            )}

            {(appliedCategories.length > 0 || appliedUsers.length > 0 || statusFilter !== 'all') && (
              <button className="tk-clear-btn" onClick={clearAllFilters}>
                ✕ Clear all
              </button>
            )}
          </div>
        </div>

        {/* Chips */}
        {(appliedCategories.length > 0 || appliedUsers.length > 0) && (
          <div className="tk-chips">
            {appliedCategories.map(cat => (
              <span key={cat} className="tk-chip">
                {cat}
                <button className="tk-chip-x" onClick={() => removeFilter('category', cat)}>×</button>
              </span>
            ))}
            {appliedUsers.map(user => (
              <span key={user} className="tk-chip">
                {user}
                <button className="tk-chip-x" onClick={() => removeFilter('user', user)}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* Admin toggle */}
        {authority === 'admin' && !loading && (
          <div className="tk-toggle-wrap">
            <label className="tk-toggle-label">Show my tickets only</label>
            <label className="hd-switch">
              <input
                type="checkbox"
                id="myTicketsToggle"
                checked={showMyTickets}
                onChange={() => setShowMyTickets(prev => !prev)}
              />
              <span className="hd-switch-track" />
            </label>
          </div>
        )}

        {/* Controls (search) */}
        <div className="tk-controls">
          <div className="tk-search-wrap">
            <svg className="tk-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              className="tk-search"
              type="text"
              placeholder="🔍 Search by ticket number, category, or description..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Dropdown for category/user filters */}
        {dropdownOpen && (
          <div
            ref={dropdownRef}
            className="tk-dropdown"
            style={{ top: dropdownPos.top, left: dropdownPos.left, minWidth: dropdownPos.width }}
          >
            {(dropdownOpen === 'category' ? categories : users).map(item => (
              <label key={item} className="tk-dd-item">
                <input
                  type="checkbox"
                  checked={dropdownOpen === 'category' ? selectedCategories.includes(item) : selectedUsers.includes(item)}
                  onChange={() => handleSelect(dropdownOpen, item)}
                />
                {item}
              </label>
            ))}
            <div className="tk-dd-actions">
              <button className="tk-dd-apply" onClick={applyFilters}>Apply</button>
              <button className="tk-dd-close" onClick={() => setDropdownOpen(null)}>Close</button>
            </div>
          </div>
        )}

        {/* Section heading */}
        <div className="tk-section-head">
          {!loading && (
            <div className="tk-count-badge">
              {totalFilteredCount} {totalFilteredCount === 1 ? 'ticket' : 'tickets'}
            </div>
          )}

          <div className="tk-view-wrapper" ref={viewDropdownRef}>
            <button
              ref={viewBtnRef}
              onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
              className="tk-view-btn"
            >
              <img src={filterIcon} alt="View" />
              {viewIcons[viewMode]} {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} ▾
            </button>

            {viewDropdownOpen && (
              <div
                className="tk-dropdown tk-view-dropdown"
                style={{
                  top: 'calc(100% + 6px)',
                  right: 0,
                  left: 'auto',
                  minWidth: 160
                }}
              >
                <div
                  className={`tk-dd-item ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => { setViewMode('table'); setViewDropdownOpen(false); }}
                >
                  <span>📊</span> Table
                </div>
                <div
                  className={`tk-dd-item ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => { setViewMode('list'); setViewDropdownOpen(false); }}
                >
                  <span>📝</span> List
                </div>
                <div
                  className={`tk-dd-item ${viewMode === 'tiles' ? 'active' : ''}`}
                  onClick={() => { setViewMode('tiles'); setViewDropdownOpen(false); }}
                >
                  <span>🔲</span> Tiles
                </div>
                <div
                  className={`tk-dd-item ${viewMode === 'content' ? 'active' : ''}`}
                  onClick={() => { setViewMode('content'); setViewDropdownOpen(false); }}
                >
                  <span>📄</span> Content
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic View Renderer */}
        {renderCurrentView()}

        {/* Load More */}
        {!loading && displayedTickets.length > 0 && (
          <div className="tk-load-more">
            {hasMore && (
              <button
                className="tk-load-btn"
                onClick={loadMoreTickets}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <><div className="tk-spinner" /> Loading more…</>
                ) : (
                  <>⬇️ Load more · {displayedTickets.length} of {totalFilteredCount}</>
                )}
              </button>
            )}
            {!hasMore && displayedTickets.length > 0 && (
              <div className="tk-showing">
                ✓ Showing {displayedTickets.length} of {totalFilteredCount} tickets
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Tickets;