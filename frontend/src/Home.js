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
  const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' or 'list'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'open', 'progress', 'closed'

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
        } catch (photoErr) {
          // No photo available
        }

        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('Helpdesk_Admin');
        setAuthority(isAdmin ? 'admin' : 'basic');

        const backendBase = "https://ticketing-hn59.onrender.com";
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

  // FIXED FILTERING LOGIC
  // Step 1: Filter by "my tickets" if admin has toggled it
  const baseFilteredTickets = authority === 'admin' && showMyTickets
    ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
    : tickets;

  // Step 2: Apply category filters
  const categoryFiltered = appliedCategories.length === 0
    ? baseFilteredTickets
    : baseFilteredTickets.filter(t => appliedCategories.includes(t.category));

  // Step 3: Apply user filters
  const userFiltered = appliedUsers.length === 0
    ? categoryFiltered
    : categoryFiltered.filter(t => appliedUsers.includes(t.userName));

  // Step 4: Apply search
  const searchFiltered = searchTerm.trim() === ''
    ? userFiltered
    : userFiltered.filter(t =>
        (t.ticketNumber || '').toString().includes(searchTerm) ||
        (t.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      );

  // Step 5: Apply status filter (from clicking stat cards)
  let statusFiltered = searchFiltered;
  if (statusFilter === 'open') {
    statusFiltered = searchFiltered.filter(t => t.status === 'Open' || t.status === 'Pending');
  } else if (statusFilter === 'progress') {
    statusFiltered = searchFiltered.filter(t => t.status === 'In Progress');
  } else if (statusFilter === 'closed') {
    statusFiltered = searchFiltered.filter(t => t.status === 'Closed');
  }

  // Calculate stats based on the filtered tickets (respecting "my tickets" toggle)
  const allFilteredForStats = authority === 'admin' && showMyTickets
    ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
    : tickets;

  const openTickets = allFilteredForStats.filter(t => t.status === 'Open' || t.status === 'Pending');
  const closedTickets = allFilteredForStats.filter(t => t.status === 'Closed');
  const inProgressTickets = allFilteredForStats.filter(t => t.status === 'In Progress');

  // Priority breakdown (open tickets only)
  const highPriority = allFilteredForStats.filter(t => t.priority === 'High' && t.status !== 'Closed');
  const mediumPriority = allFilteredForStats.filter(t => t.priority === 'Medium' && t.status !== 'Closed');
  const lowPriority = allFilteredForStats.filter(t => t.priority === 'Low' && t.status !== 'Closed');

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
    if (c.includes('password') || c.includes('admin access') || c.includes('admin')) return '#e98404';
    if (c.includes('payroll') || c.includes('expense')) return '#10b981';
    if (c.includes('leave') || c.includes('onboard') || c.includes('onboarding')) return '#ef4444';
    return '#002060';
  };

  const initials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  // Simple Pie Chart Component
  const PieChart = ({ data, colors, size = 180 }) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: '600' }}>
        No data
      </div>
    );

    let currentAngle = -90;
    const segments = data.map((d, i) => {
      const percentage = (d.value / total) * 100;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      const radius = size / 2;
      const x1 = radius + radius * Math.cos(startRad);
      const y1 = radius + radius * Math.sin(startRad);
      const x2 = radius + radius * Math.cos(endRad);
      const y2 = radius + radius * Math.sin(endRad);
      const largeArc = angle > 180 ? 1 : 0;

      return (
        <path
          key={i}
          d={`M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
          fill={colors[i]}
          stroke="white"
          strokeWidth="3"
        />
      );
    });

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments}
      </svg>
    );
  };

  const statusData = [
    { label: 'Open/Pending', value: openTickets.length },
    { label: 'In Progress', value: inProgressTickets.length },
    { label: 'Closed', value: closedTickets.length }
  ];

  const statusColors = ['#e98404', '#002060', '#10b981'];

  const priorityData = [
    { label: 'High', value: highPriority.length },
    { label: 'Medium', value: mediumPriority.length },
    { label: 'Low', value: lowPriority.length }
  ];

  const priorityColors = ['#ef4444', '#e98404', '#10b981'];

  // Handler for stat card clicks
  const handleStatClick = (status) => {
    setStatusFilter(status);
    setViewMode('list');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        * { box-sizing: border-box; }
        
        /* Header */
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
        
        /* Main Container */
        .main-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        /* View Toggle */
        .view-toggle {
          display: flex;
          gap: 0.5rem;
          background: white;
          padding: 4px;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          margin-bottom: 2rem;
          width: fit-content;
        }
        
        .view-btn {
          padding: 8px 16px;
          border: none;
          background: transparent;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          color: #64748b;
          transition: all 0.2s;
        }
        
        .view-btn.active {
          background: #002060;
          color: white;
        }
        
        /* Dashboard Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        
        .stat-card {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          border-left: 4px solid;
          transition: all 0.2s;
          cursor: pointer;
        }
        
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
        }
        
        .stat-card.active {
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          transform: translateY(-4px);
        }
        
        .stat-card.orange { border-left-color: #e98404; }
        .stat-card.blue { border-left-color: #002060; }
        .stat-card.green { border-left-color: #10b981; }
        .stat-card.red { border-left-color: #ef4444; }
        
        .stat-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }
        
        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }
        
        .stat-icon.orange { background: rgba(233, 132, 4, 0.1); color: #e98404; }
        .stat-icon.blue { background: rgba(0, 32, 96, 0.1); color: #002060; }
        .stat-icon.green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .stat-icon.red { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        
        .stat-value {
          font-size: 36px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }
        
        .stat-label {
          font-size: 14px;
          color: #64748b;
          font-weight: 600;
          margin-top: 4px;
        }
        
        /* Charts Section */
        .charts-section {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 2rem;
          margin-bottom: 2rem;
        }
        
        .chart-card {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
        }
        
        .chart-title {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 1.5rem;
        }
        
        .chart-content {
          display: flex;
          gap: 2rem;
          align-items: center;
        }
        
        .chart-legend {
          flex: 1;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        
        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        
        .legend-label {
          font-size: 14px;
          color: #475569;
          flex: 1;
        }
        
        .legend-value {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }
        
        /* Quick Actions - SMALLER */
        .quick-actions {
          background: white;
          padding: 1.25rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          margin-bottom: 2rem;
        }
        
        .quick-actions h3 {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 1rem 0;
        }
        
        .quick-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.75rem;
        }
        
        .quick-btn {
          padding: 1rem;
          border-radius: 10px;
          color: white;
          text-align: center;
          cursor: pointer;
          transition: transform 0.2s;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        
        .quick-btn:hover {
          transform: translateY(-3px);
        }
        
        .quick-icon {
          font-size: 24px;
        }
        
        .quick-label {
          font-weight: 700;
          font-size: 13px;
        }
        
        /* Search & Filters */
        .controls-section {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          margin-bottom: 2rem;
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
          z-index: 9999;
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
        
        /* Tickets List */
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
        }
        
        .ticket-card:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
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
        .status-progress, .status-in { background: #dbeafe; color: #1e3a8a; }
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

        .my-tickets-toggle {
          background: white;
          padding: 1rem;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
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
          
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          .charts-section {
            grid-template-columns: 1fr;
          }
          
          .chart-content {
            flex-direction: column;
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
              <h1>Welcome, {userName}</h1>
              <span className="user-role">{authority === 'admin' ? 'ADMINISTRATOR' : 'USER'}</span>
            </div>
          </div>
          <div className="header-actions">
            <Link to="/create" className="btn-header btn-primary">
              + Create Ticket
            </Link>
            <Link to="/dashboard" className="btn-header btn-secondary">
              Closed Tickets
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

        {/* View Toggle */}
        <div className="view-toggle">
          <button 
            className={`view-btn ${viewMode === 'dashboard' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('dashboard');
              setStatusFilter('all');
            }}
          >
            📊 Dashboard
          </button>
          <button 
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            📋 All Tickets
          </button>
        </div>

        {viewMode === 'dashboard' && (
          <>
            {/* Stats Grid - CLICKABLE */}
            <div className="stats-grid">
              <div 
                className={`stat-card orange ${statusFilter === 'open' ? 'active' : ''}`}
                onClick={() => handleStatClick('open')}
              >
                <div className="stat-header">
                  <div>
                    <div className="stat-value">{openTickets.length}</div>
                    <div className="stat-label">Open Tickets</div>
                  </div>
                  <div className="stat-icon orange">📝</div>
                </div>
              </div>

              <div 
                className={`stat-card blue ${statusFilter === 'progress' ? 'active' : ''}`}
                onClick={() => handleStatClick('progress')}
              >
                <div className="stat-header">
                  <div>
                    <div className="stat-value">{inProgressTickets.length}</div>
                    <div className="stat-label">In Progress</div>
                  </div>
                  <div className="stat-icon blue">⚙️</div>
                </div>
              </div>

              <div 
                className={`stat-card green ${statusFilter === 'closed' ? 'active' : ''}`}
                onClick={() => handleStatClick('closed')}
              >
                <div className="stat-header">
                  <div>
                    <div className="stat-value">{closedTickets.length}</div>
                    <div className="stat-label">Closed Tickets</div>
                  </div>
                  <div className="stat-icon green">✅</div>
                </div>
              </div>

              <div className="stat-card red">
                <div className="stat-header">
                  <div>
                    <div className="stat-value">{highPriority.length}</div>
                    <div className="stat-label">High Priority</div>
                  </div>
                  <div className="stat-icon red">⚠️</div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="charts-section">
              {/* Status Distribution */}
              <div className="chart-card">
                <h3 className="chart-title">Ticket Status Distribution</h3>
                <div className="chart-content">
                  <PieChart data={statusData} colors={statusColors} size={180} />
                  <div className="chart-legend">
                    {statusData.map((item, idx) => (
                      <div key={idx} className="legend-item">
                        <div className="legend-color" style={{ background: statusColors[idx] }}></div>
                        <span className="legend-label">{item.label}</span>
                        <span className="legend-value">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Priority Distribution */}
              <div className="chart-card">
                <h3 className="chart-title">Priority Breakdown (Open)</h3>
                <div className="chart-content">
                  <PieChart data={priorityData} colors={priorityColors} size={180} />
                  <div className="chart-legend">
                    {priorityData.map((item, idx) => (
                      <div key={idx} className="legend-item">
                        <div className="legend-color" style={{ background: priorityColors[idx] }}></div>
                        <span className="legend-label">{item.label} Priority</span>
                        <span className="legend-value">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions - SMALLER */}
            <div className="quick-actions">
              <h3>Quick Actions</h3>
              <div className="quick-grid">
                <Link to="/create" className="quick-btn" style={{ background: 'linear-gradient(135deg, #e98404 0%, #f59e0b 100%)' }}>
                  <div className="quick-icon">➕</div>
                  <div className="quick-label">New Ticket</div>
                </Link>

                <Link to="/dashboard" className="quick-btn" style={{ background: 'linear-gradient(135deg, #002060 0%, #0039a6 100%)' }}>
                  <div className="quick-icon">📋</div>
                  <div className="quick-label">Closed Tickets</div>
                </Link>

                {authority === 'admin' && (
                  <div 
                    className="quick-btn" 
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' }}
                    onClick={() => setShowMyTickets(!showMyTickets)}
                  >
                    <div className="quick-icon">👤</div>
                    <div className="quick-label">{showMyTickets ? 'All Tickets' : 'My Tickets'}</div>
                  </div>
                )}
              </div>
            </div>
          </>
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

        {/* Dropdown */}
        {dropdownOpen && (
          <div
            ref={dropdownRef}
            className="filter-dropdown"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              minWidth: dropdownPos.width,
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
            {statusFilter === 'open' && `Open Tickets (${statusFiltered.length})`}
            {statusFilter === 'progress' && `In Progress Tickets (${statusFiltered.length})`}
            {statusFilter === 'closed' && `Closed Tickets (${statusFiltered.length})`}
            {statusFilter === 'all' && (authority === 'admin'
              ? showMyTickets
                ? `My Tickets (${statusFiltered.length})`
                : `All Tickets (${statusFiltered.length})`
              : `Your Tickets (${statusFiltered.length})`)}
          </h2>
        </div>

        {statusFiltered.length === 0 ? (
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
                  <span className={`ticket-status status-${ticket.status?.toLowerCase().replace(' ', '')}`}>
                    {ticket.status}
                  </span>
                </div>
                
                <p className="ticket-description">{ticket.description}</p>
                
                {authority === 'admin' && (
                  <div style={{ marginTop: '0.75rem', fontSize: '14px', color: '#64748b' }}>
                    <div><strong>Created by:</strong> {ticket.userName || '—'}</div>
                    <div><strong>Email:</strong> {ticket.userEmail || '—'}</div>
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

export default Home;