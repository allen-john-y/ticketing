import React, { useState, useEffect, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Status config with Home.js color scheme
const STATUS_CONFIG = {
  open:        { label: 'Open',        color: '#e98404', bg: '#fef3c7', border: '#fbbf24' },
  in_progress: { label: 'In Progress', color: '#002060', bg: '#dbeafe', border: '#3b82f6' },
  resolved:    { label: 'Resolved',    color: '#10b981', bg: '#d1fae5', border: '#10b981' },
  closed:      { label: 'Closed',      color: '#64748b', bg: '#f3f4f6', border: '#cbd5e1' },
  cancelled:   { label: 'Cancelled',   color: '#ef4444', bg: '#fee2e2', border: '#ef4444' },
};

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      color: '#10b981', bg: '#d1fae5', icon: '🟢' },
  medium:   { label: 'Medium',   color: '#e98404', bg: '#fef3c7', icon: '🟡' },
  high:     { label: 'High',     color: '#ef4444', bg: '#fee2e2', icon: '🔴' },
  critical: { label: 'Critical', color: '#dc2626', bg: '#fee2e2', icon: '🚨' },
};

const ALL_STATUSES   = ['all', 'open', 'in_progress', 'resolved', 'closed', 'cancelled'];
const ALL_PRIORITIES = ['all', 'critical', 'high', 'medium', 'low'];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      background: cfg.bg, border: `1.5px solid ${cfg.border}`, color: cfg.color,
      letterSpacing: '0.02em', whiteSpace: 'nowrap',
      fontFamily: "'Sora', sans-serif",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
      fontFamily: "'Sora', sans-serif",
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function MemberTooltip({ members }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!members || members.length === 0) return null;

  return (
    <div 
      style={{ position: 'relative', cursor: 'pointer', display: 'inline-block' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        background: 'rgba(59, 130, 246, 0.08)',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        color: '#3b82f6',
        fontFamily: "'Sora', sans-serif",
      }}>
        👥 {members.length}
      </div>

      {showTooltip && (
        <div style={{
          position: 'fixed',
          background: '#ffffff',
          border: '1.5px solid #e2e8f0',
          borderRadius: 12,
          minWidth: '220px',
          maxWidth: '300px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          zIndex: 9999,
          padding: 12,
          pointerEvents: 'auto',
          bottom: 'auto',
          left: 'auto',
          right: 'auto',
          top: 'auto',
          transform: 'translateY(-12px)',
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 800,
            color: '#002060',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid #e2e8f0',
          }}>
            Team Members ({members.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '300px', overflowY: 'auto' }}>
            {members.map((member, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#3b82f6',
                  flexShrink: 0,
                }}>
                  {(member.name || member.email || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#0f172a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {member.name || '—'}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {member.email || member.mail || ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[120, 200, 110, 90, 140, 120, 80, 80].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div className="inc-skel" style={{ width: w, height: 14, borderRadius: 6 }} />
        </td>
      ))}
    </tr>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

// Delete Confirmation Modal Component
function DeleteModal({ incident, onClose, onConfirm, deleting }) {
  if (!incident) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon">⚠️</div>
          <h3>Delete Incident</h3>
        </div>
        <div className="modal-body">
          <p>Are you sure you want to delete this incident?</p>
          <div className="modal-request-info">
            <div className="modal-info-row">
              <span className="modal-label">Incident #</span>
              <span className="modal-value">{incident.incidentNumber || '—'}</span>
            </div>
            <div className="modal-info-row">
              <span className="modal-label">Title</span>
              <span className="modal-value">{incident.title || '—'}</span>
            </div>
            <div className="modal-info-row">
              <span className="modal-label">Status</span>
              <StatusBadge status={incident.status} />
            </div>
          </div>
          <p className="modal-warning">This action cannot be undone.</p>
        </div>
        <div className="modal-footer">
          <button 
            className="modal-btn-cancel" 
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button 
            className="modal-btn-delete" 
            onClick={() => onConfirm(incident._id)}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <span className="modal-spinner" />
                Deleting...
              </>
            ) : (
              'Delete Incident'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Incidents() {
  const { accounts } = useMsal();
  const navigate = useNavigate();

  // Get current user info
  const currentUser = accounts[0];
  const currentUserEmail = currentUser?.username || currentUser?.mail || '';
  const currentUserName = currentUser?.name || '';
  const currentUserId = currentUser?.localAccountId || currentUser?.homeAccountId || '';
  
  // DEBUG: Log current user info
  console.log('🔍 CURRENT USER INFO:', {
    name: currentUserName,
    username: currentUserEmail,
    localAccountId: currentUser?.localAccountId,
    homeAccountId: currentUser?.homeAccountId,
    allKeys: currentUser ? Object.keys(currentUser) : [],
    fullObject: currentUser
  });
  console.log('📧 Current User Email:', currentUserEmail);
  console.log('👤 Current User Name:', currentUserName);
  console.log('🆔 Current User ID:', currentUserId);

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('my-incidents'); // 'my-incidents' or 'assigned-to-me'

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // Dropdown & Delete state
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchIncidents = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(`${BACKEND}/api/incidents`);
        const data = Array.isArray(res.data) ? res.data : [];
        setIncidents(data);
        
        // DEBUG: Log all incidents with FULL member details
        console.log('📋 ALL INCIDENTS FETCHED:', data.length);
        data.forEach((inc, index) => {
          console.log(`\n🔹 Incident #${index + 1}:`);
          console.log(`  ID: ${inc._id}`);
          console.log(`  Number: ${inc.incidentNumber}`);
          console.log(`  Title: ${inc.title}`);
          console.log(`  Raised By (FULL):`, JSON.stringify(inc.raisedBy, null, 2));
          console.log(`  Assignment Group Name: ${inc.assignmentGroup?.groupName}`);
          console.log(`  Assignment Group Members FULL DATA:`);
          console.log(JSON.stringify(inc.assignmentGroup?.members, null, 2));
          
          // Check each member's fields
          if (inc.assignmentGroup?.members) {
            inc.assignmentGroup.members.forEach((member, mIdx) => {
              console.log(`\n  👤 Member ${mIdx + 1} DETAILS:`);
              console.log(`    - Type: ${typeof member}`);
              console.log(`    - Keys:`, Object.keys(member));
              console.log(`    - Values:`, Object.values(member));
              console.log(`    - Full object:`, member);
              console.log(`    - Has email: ${!!member.email}`);
              console.log(`    - Has mail: ${!!member.mail}`);
              console.log(`    - Has username: ${!!member.username}`);
              console.log(`    - Has userId: ${!!(member.userId || member._id)}`);
              console.log(`    - Name: ${member.name}`);
            });
          }
        });
      } catch (err) {
        console.error('❌ Fetch incidents:', err);
        setError('Failed to load incidents. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchIncidents();
  }, []);

  useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter, sortBy, viewMode]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openMenuId && !e.target.closest('.inc-menu-wrapper')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId]);

  // Helper function to check if a member matches the current user
  const isMemberCurrentUser = (member) => {
    console.log('  🔎 Checking if member matches current user:', {
      memberName: member.name,
      memberKeys: Object.keys(member),
      currentUserName,
      currentUserEmail,
      currentUserId
    });

    // Match by email (multiple possible fields)
    const memberEmails = [
      member.email,
      member.mail,
      member.username,
      member.userPrincipalName,
      member.upn
    ].filter(Boolean).map(e => e.toLowerCase().trim());

    if (currentUserEmail && memberEmails.includes(currentUserEmail.toLowerCase().trim())) {
      console.log('  ✅ MATCHED BY EMAIL');
      return true;
    }

    // Match by name
    if (currentUserName && member.name && 
        member.name.toLowerCase().trim() === currentUserName.toLowerCase().trim()) {
      console.log('  ✅ MATCHED BY NAME');
      return true;
    }

    // Match by user ID
    const memberIds = [
      member.userId,
      member._id,
      member.id,
      member.azureId,
      member.objectId
    ].filter(Boolean);

    if (currentUserId && memberIds.includes(currentUserId)) {
      console.log('  ✅ MATCHED BY USER ID');
      return true;
    }

    // If member is a string, compare directly
    if (typeof member === 'string') {
      const memberStr = member.toLowerCase().trim();
      if (currentUserEmail && memberStr === currentUserEmail.toLowerCase().trim()) {
        console.log('  ✅ MATCHED BY STRING (email)');
        return true;
      }
      if (currentUserName && memberStr === currentUserName.toLowerCase().trim()) {
        console.log('  ✅ MATCHED BY STRING (name)');
        return true;
      }
    }

    console.log('  ❌ NO MATCH');
    return false;
  };

  // Helper function to check if current user is in assignment group
  const isUserInGroup = (incident) => {
    if (!incident.assignmentGroup?.members?.length || !currentUserEmail) {
      console.log(`⚠️ isUserInGroup: Missing data for "${incident.title}"`, {
        hasMembers: !!incident.assignmentGroup?.members?.length,
        hasEmail: !!currentUserEmail
      });
      return false;
    }
    
    const found = incident.assignmentGroup.members.some(member => {
      return isMemberCurrentUser(member);
    });
    
    console.log(`📌 isUserInGroup result for "${incident.title}": ${found}`);
    return found;
  };

  // Helper function to check if incident is created by current user
  const isCreatedByUser = (incident) => {
    if (!currentUserEmail) {
      console.log('⚠️ No current user email');
      return false;
    }
    const raiserEmail = (incident.raisedBy?.mail || incident.raisedBy?.email || '').toLowerCase().trim();
    const currentEmail = currentUserEmail.toLowerCase().trim();
    const match = raiserEmail === currentEmail;
    
    console.log('👤 Checking if created by user:', {
      raiserEmail,
      currentEmail,
      match,
      incidentTitle: incident.title
    });
    
    return match;
  };

  const filtered = useMemo(() => {
    console.log('\n🔄 ===== FILTERING STARTED =====');
    console.log('📊 View Mode:', viewMode);
    console.log('📊 Total incidents before filtering:', incidents.length);
    
    let list = [...incidents];

    // Apply view mode filter first
    console.log('\n🎯 APPLYING VIEW MODE FILTER:', viewMode);
    
    if (viewMode === 'my-incidents') {
      console.log('👤 Filtering for MY INCIDENTS...');
      list.forEach(inc => {
        console.log(`  Checking: ${inc.title} - isCreatedByUser: ${isCreatedByUser(inc)}`);
      });
      list = list.filter(inc => isCreatedByUser(inc));
      console.log('📊 After My Incidents filter:', list.length);
    } else if (viewMode === 'assigned-to-me') {
      console.log('📋 Filtering for ASSIGNED TO ME...');
      list.forEach(inc => {
        console.log(`\n  📝 Incident: ${inc.title}`);
        console.log(`     Assignment Group: ${inc.assignmentGroup?.groupName || 'NO GROUP'}`);
        console.log(`     Members count: ${inc.assignmentGroup?.members?.length || 0}`);
        if (inc.assignmentGroup?.members) {
          inc.assignmentGroup.members.forEach((m, i) => {
            console.log(`     Member ${i+1}:`, m.name, '| Keys:', Object.keys(m));
          });
        }
        console.log(`     isUserInGroup: ${isUserInGroup(inc)}`);
      });
      list = list.filter(inc => isUserInGroup(inc));
      console.log('📊 After Assigned to Me filter:', list.length);
    }

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const beforeSearch = list.length;
      list = list.filter(i =>
        i.incidentNumber?.toLowerCase().includes(q) ||
        i.title?.toLowerCase().includes(q) ||
        i.category?.name?.toLowerCase().includes(q) ||
        i.raisedBy?.name?.toLowerCase().includes(q) ||
        i.raisedBy?.mail?.toLowerCase().includes(q) ||
        i.assignmentGroup?.groupName?.toLowerCase().includes(q) ||
        i.assignmentGroup?.members?.some(m => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q))
      );
      console.log('🔍 After search filter:', `${beforeSearch} → ${list.length}`);
    }

    // Apply status and priority filters
    if (statusFilter !== 'all') {
      const before = list.length;
      list = list.filter(i => i.status === statusFilter);
      console.log('🏷️ After status filter:', `${before} → ${list.length}`);
    }
    if (priorityFilter !== 'all') {
      const before = list.length;
      list = list.filter(i => i.priority === priorityFilter);
      console.log('⚡ After priority filter:', `${before} → ${list.length}`);
    }

    // Apply sorting
    list.sort((a, b) => {
      if (sortBy === 'newest')   return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === 'oldest')   return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'priority') {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
      }
      return 0;
    });

    console.log('\n✅ FINAL FILTERED RESULTS:', list.length);
    console.log('📋 Final list:', list.map(inc => ({
      title: inc.title,
      incidentNumber: inc.incidentNumber,
      raisedBy: inc.raisedBy?.mail,
      group: inc.assignmentGroup?.groupName
    })));
    console.log('===== FILTERING COMPLETE =====\n');

    return list;
  }, [incidents, search, statusFilter, priorityFilter, sortBy, viewMode, currentUserEmail]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats based on current view
  const stats = useMemo(() => {
    let baseList = [...incidents];
    
    if (viewMode === 'my-incidents') {
      baseList = baseList.filter(inc => isCreatedByUser(inc));
    } else if (viewMode === 'assigned-to-me') {
      baseList = baseList.filter(inc => isUserInGroup(inc));
    }

    return {
      total:    baseList.length,
      open:     baseList.filter(i => i.status === 'open').length,
      active:   baseList.filter(i => i.status === 'in_progress').length,
      resolved: baseList.filter(i => i.status === 'resolved' || i.status === 'closed').length,
      critical: baseList.filter(i => i.priority === 'critical' && i.status !== 'closed').length,
      high:     baseList.filter(i => i.priority === 'high' && i.status !== 'closed').length,
    };
  }, [incidents, viewMode, currentUserEmail]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Handle Delete
  const handleDelete = async (incidentId) => {
    setDeleting(true);
    try {
      await axios.delete(`${BACKEND}/api/incidents/${incidentId}`);
      setIncidents(prev => prev.filter(i => i._id !== incidentId));
      setDeleteTarget(null);
      setOpenMenuId(null);
    } catch (err) {
      console.error('❌ Delete incident:', err);
      alert('Failed to delete incident. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --orange2: #f5a623;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes slideInLeft {
      from { opacity: 0; transform: translateX(10px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .inc-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    .inc-skel {
      background: #e2e8f0;
      border-radius: 8px;
      animation: pulse 1.6s ease-in-out infinite;
    }

    /* Hero Section */
    .inc-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .inc-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .inc-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .inc-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .inc-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .inc-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .inc-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .inc-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .inc-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    /* View Toggle */
    .inc-view-toggle {
      display: flex;
      gap: 0;
      margin-bottom: 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      padding: 5px;
      width: fit-content;
      animation: fadeUp 0.45s 0.05s ease both;
    }

    .inc-toggle-btn {
      padding: 12px 28px;
      border: none;
      background: transparent;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s ease;
      white-space: nowrap;
      position: relative;
    }

    .inc-toggle-btn-active {
      background: var(--navy);
      color: white;
      box-shadow: 0 4px 12px rgba(0, 32, 96, 0.2);
    }

    .inc-toggle-btn:hover:not(.inc-toggle-btn-active) {
      color: var(--navy);
      background: rgba(0, 32, 96, 0.05);
    }

    /* Stats Row */
    .inc-stats {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 16px;
      margin-bottom: 28px;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .inc-stat-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 24px 20px;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: transform 0.22s ease, box-shadow 0.22s ease;
    }
    .inc-stat-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 36px rgba(0,32,96,0.1);
    }

    .inc-stat-stripe {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      border-radius: 18px 18px 0 0;
    }

    .inc-stat-value {
      font-family: 'Sora', sans-serif;
      font-size: 34px; font-weight: 800;
      color: var(--navy);
      line-height: 1;
      letter-spacing: -0.03em;
      margin-bottom: 6px;
    }

    .inc-stat-label {
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.05em; text-transform: uppercase;
      color: var(--muted);
    }

    /* Filters Bar */
    .inc-filters {
      display: flex; gap: 12px; margin-bottom: 24px;
      flex-wrap: wrap;
      padding: 20px 24px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      animation: fadeUp 0.45s 0.15s ease both;
    }

    .inc-search-wrapper {
      position: relative;
      flex: 1;
      min-width: 220px;
    }

    .inc-search-icon {
      position: absolute;
      left: 14px; top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      font-size: 14px;
    }

    .inc-search-input {
      width: 100%;
      padding: 11px 14px 11px 40px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
    }
    .inc-search-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
    }
    .inc-search-input::placeholder {
      color: var(--muted);
    }

    .inc-select {
      padding: 11px 32px 11px 14px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      transition: all 0.2s;
    }
    .inc-select:focus {
      outline: none;
      border-color: var(--navy);
    }

    /* Result Meta */
    .inc-result-meta {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
      padding: 0 4px;
    }

    .inc-clear-btn {
      padding: 8px 16px;
      font-size: 12px; font-weight: 600;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .inc-clear-btn:hover {
      border-color: var(--navy);
      color: var(--navy);
      background: var(--light);
    }

    /* Table */
    .inc-table-wrapper {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      animation: fadeUp 0.5s 0.2s ease both;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    .inc-table {
      width: 100%;
      border-collapse: collapse;
    }

    .inc-thead-row {
      background: linear-gradient(to right, var(--light), rgba(0, 32, 96, 0.02));
      border-bottom: 1.5px solid var(--border);
    }

    .inc-th {
      padding: 16px 18px;
      font-family: 'Sora', sans-serif;
      font-size: 10px; font-weight: 800;
      color: var(--navy);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      text-align: left;
      white-space: nowrap;
    }

    .inc-tbody-row {
      border-bottom: 1.5px solid var(--border);
      cursor: pointer;
      transition: all 0.15s ease;
      animation: fadeUp 0.3s ease both;
      position: relative;
    }

    .inc-tbody-row:nth-child(even) {
      background: rgba(0, 32, 96, 0.01);
    }

    .inc-tbody-row:hover {
      background: rgba(0, 32, 96, 0.05);
      box-shadow: inset 0 0 0 1px rgba(0, 32, 96, 0.08);
    }

    .inc-tbody-row:hover .inc-menu-btn {
      opacity: 1;
      visibility: visible;
    }

    .inc-td {
      padding: 16px 18px;
      vertical-align: middle;
      font-size: 13px;
      position: relative;
    }

    .inc-number {
      font-family: 'Sora', sans-serif;
      font-weight: 700; font-size: 13px;
      color: var(--navy);
      letter-spacing: 0.02em;
    }

    .inc-title-cell {
      display: flex; flex-direction: column; gap: 4px;
      max-width: 240px;
    }
    .inc-title-main {
      font-size: 14px; font-weight: 600;
      color: var(--navy);
      line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;
    }
    .inc-title-desc {
      font-size: 12px; color: var(--muted);
      line-height: 1.3;
    }

    .inc-category {
      font-size: 13px; color: var(--text);
      font-weight: 500;
      max-width: 140px;
      display: block;
      overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;
    }

    .inc-user-cell {
      display: flex; align-items: center; gap: 10px;
    }
    .inc-user-avatar {
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, rgba(0,32,96,0.15), rgba(0,32,96,0.08));
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      flex-shrink: 0;
    }
    .inc-user-info {
      display: flex; flex-direction: column; gap: 2px;
    }
    .inc-user-name {
      font-size: 13px; font-weight: 600;
      color: var(--text);
      line-height: 1.3;
    }
    .inc-user-email {
      font-size: 11px; color: var(--muted);
    }

    /* Assignment Group styling */
    .inc-group-cell {
      display: flex; align-items: center; gap: 12px;
      position: relative;
      z-index: 10;
    }
    .inc-group-avatar {
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.08));
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700;
      color: #3b82f6;
      flex-shrink: 0;
    }
    .inc-group-info {
      display: flex; flex-direction: column; gap: 3px;
    }
    .inc-group-name {
      font-size: 13px; font-weight: 600;
      color: var(--text);
      line-height: 1.3;
    }

    .inc-unassigned {
      font-size: 12px; color: var(--muted);
      font-style: italic;
    }

    .inc-date-cell {
      display: flex; flex-direction: column; gap: 2px;
      white-space: nowrap;
    }
    .inc-date-main {
      font-size: 13px; font-weight: 600;
      color: var(--text);
    }
    .inc-date-rel {
      font-size: 10px; color: var(--muted);
    }

    /* Three-dot Menu */
    .inc-menu-wrapper {
      position: relative;
      display: inline-block;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .inc-menu-btn {
      width: 36px; height: 36px;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: var(--muted);
      transition: all 0.2s ease;
      font-weight: 700;
      letter-spacing: 1px;
      opacity: 0.6;
      visibility: visible;
    }

    .inc-menu-btn:hover {
      background: var(--light);
      color: var(--navy);
      opacity: 1;
    }

    /* Dropdown Menu */
    .inc-menu-dropdown {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.15);
      min-width: 160px;
      z-index: 100;
      overflow: hidden;
      animation: slideInLeft 0.2s ease;
      padding: 4px;
    }

    .inc-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 11px 16px;
      border: none;
      background: transparent;
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.15s;
      border-radius: 8px;
    }

    .inc-menu-item:hover {
      background: var(--light);
      color: var(--navy);
    }

    .inc-menu-item-delete {
      color: #ef4444;
    }
    .inc-menu-item-delete:hover {
      background: rgba(239, 68, 68, 0.08);
      color: #dc2626;
    }

    /* Modal Overlay */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }

    .modal-content {
      background: var(--white);
      border-radius: 20px;
      max-width: 480px;
      width: 100%;
      animation: modalIn 0.25s ease;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }

    .modal-header {
      padding: 24px 28px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .modal-icon {
      font-size: 28px;
    }

    .modal-header h3 {
      font-family: 'Sora', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: var(--navy);
    }

    .modal-body {
      padding: 16px 28px 24px;
    }

    .modal-body p {
      font-size: 14px;
      color: var(--muted);
      line-height: 1.6;
      margin-bottom: 12px;
    }

    .modal-request-info {
      background: var(--bg);
      border-radius: 12px;
      padding: 16px;
      margin: 12px 0;
    }

    .modal-info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }

    .modal-info-row + .modal-info-row {
      border-top: 1px solid var(--border);
    }

    .modal-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .modal-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }

    .modal-warning {
      font-size: 12px;
      color: #ef4444;
      font-weight: 600;
    }

    .modal-footer {
      padding: 20px 28px;
      border-top: 1.5px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    .modal-btn-cancel {
      padding: 10px 20px;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      background: var(--white);
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }

    .modal-btn-cancel:hover {
      border-color: var(--navy);
      color: var(--navy);
      background: var(--light);
    }

    .modal-btn-delete {
      padding: 10px 20px;
      border: none;
      border-radius: 10px;
      background: #ef4444;
      font-size: 13px;
      font-weight: 600;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }

    .modal-btn-delete:hover:not(:disabled) {
      background: #dc2626;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
    }

    .modal-btn-delete:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .modal-spinner {
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    /* Actions column */
    .inc-th-actions {
      width: 60px;
      text-align: center;
    }

    /* Empty State */
    .inc-empty {
      text-align: center; padding: 80px 20px;
    }
    .inc-empty-icon {
      font-size: 56px; margin-bottom: 16px;
    }
    .inc-empty-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 8px;
    }
    .inc-empty-sub {
      font-size: 14px; color: var(--muted);
    }

    /* Error State */
    .inc-error {
      text-align: center; padding: 80px 20px;
    }
    .inc-error-icon {
      font-size: 56px; margin-bottom: 16px;
    }
    .inc-error-title {
      font-family: 'Sora', sans-serif;
      font-size: 16px; font-weight: 700;
      color: #ef4444;
      margin-bottom: 12px;
    }
    .inc-retry-btn {
      padding: 11px 24px;
      background: var(--navy);
      border: none;
      border-radius: 12px;
      font-size: 14px; font-weight: 600;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .inc-retry-btn:hover {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }

    /* Pagination */
    .inc-pagination {
      display: flex; align-items: center; justify-content: center;
      gap: 8px; margin-top: 32px;
    }
    .inc-page-btn {
      padding: 10px 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 13px; font-weight: 600;
      color: var(--text);
      font-family: 'Sora', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
    }
    .inc-page-btn:hover:not(:disabled) {
      border-color: var(--navy);
      color: var(--navy);
      background: var(--light);
    }
    .inc-page-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .inc-page-btn-active {
      background: var(--navy);
      border-color: var(--navy);
      color: white;
    }
    .inc-page-ellipsis {
      color: var(--muted);
      font-size: 13px;
      padding: 0 4px;
    }

    /* New Incident Button */
    .inc-new-btn {
      padding: 14px 28px;
      background: #ef4444;
      border: none;
      border-radius: 14px;
      font-size: 15px; font-weight: 700;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(239,68,68,0.2);
    }
    .inc-new-btn:hover {
      background: #dc2626;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(239,68,68,0.25);
    }

    /* Loading */
    .inc-loading {
      min-height: 100vh;
      background: var(--bg);
      display: flex; align-items: center; justify-content: center;
    }
    .inc-spinner {
      width: 48px; height: 48px; border-radius: 50%;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      animation: spin 0.9s linear infinite;
    }

    @media (max-width: 1200px) {
      .inc-stats { grid-template-columns: repeat(3, 1fr); }
      .inc-td { padding: 14px 14px; }
      .inc-th { padding: 14px 14px; }
    }
    @media (max-width: 768px) {
      .inc-hero { padding: 40px 24px; }
      .inc-content { padding: 24px 20px 40px; }
      .inc-stats { grid-template-columns: repeat(2, 1fr); }
      .inc-table-wrapper { overflow-x: auto; }
      .inc-filters { flex-direction: column; }
      .inc-search-wrapper { min-width: 100%; }
      .inc-select { width: 100%; }
      .inc-td { padding: 12px 12px; font-size: 12px; }
      .inc-th { padding: 12px 12px; font-size: 9px; }
      .inc-view-toggle { width: 100%; }
      .inc-toggle-btn { flex: 1; text-align: center; padding: 12px 16px; }
    }
  `;

  if (loading) {
    return (
      <div className="inc-page">
        <style>{sharedCSS}</style>
        <div className="inc-loading">
          <div style={{ textAlign: 'center' }}>
            <div className="inc-spinner" />
            <div style={{ marginTop: 14, fontSize: 14, color: '#64748b' }}>Loading incidents…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inc-page">
      <style>{sharedCSS}</style>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteModal
          incident={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      {/* Hero Section */}
      <div className="inc-hero">
        <div className="inc-hero-inner">
          <div className="inc-hero-eyebrow">
            <div className="inc-hero-eyebrow-line" />
            Incident Management
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <h1>All <em>Incidents</em></h1>
              <p className="inc-hero-sub">{today} — Track and manage incidents across the helpdesk</p>
            </div>
            <button className="inc-new-btn" onClick={() => navigate('/create-incident')}>
              🚨 Report Incident
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="inc-content">
        {/* View Toggle */}
        <div className="inc-view-toggle">
          <button
            className={`inc-toggle-btn ${viewMode === 'my-incidents' ? 'inc-toggle-btn-active' : ''}`}
            onClick={() => {
              console.log('🔄 Switching to MY INCIDENTS view');
              setViewMode('my-incidents');
            }}
          >
            👤 My Incidents
          </button>
          <button
            className={`inc-toggle-btn ${viewMode === 'assigned-to-me' ? 'inc-toggle-btn-active' : ''}`}
            onClick={() => {
              console.log('🔄 Switching to ASSIGNED TO ME view');
              setViewMode('assigned-to-me');
            }}
          >
            📋 Assigned to Me
          </button>
        </div>

        {/* Stats */}
        <div className="inc-stats">
          {[
            { label: 'Total', value: stats.total, color: '#002060' },
            { label: 'Open', value: stats.open, color: '#e98404' },
            { label: 'In Progress', value: stats.active, color: '#3b82f6' },
            { label: 'Resolved', value: stats.resolved, color: '#10b981' },
            { label: 'Critical', value: stats.critical, color: '#ef4444' },
            { label: 'High Priority', value: stats.high, color: '#f59e0b' },
          ].map((stat, idx) => (
            <div key={idx} className="inc-stat-card">
              <div className="inc-stat-stripe" style={{ background: stat.color }} />
              <div className="inc-stat-value">{stat.value}</div>
              <div className="inc-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="inc-filters">
          <div className="inc-search-wrapper">
            <span className="inc-search-icon">🔍</span>
            <input
              className="inc-search-input"
              placeholder="Search by number, title, group, member…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select className="inc-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {ALL_STATUSES.map(st => (
              <option key={st} value={st}>
                {st === 'all' ? 'All Statuses' : STATUS_CONFIG[st]?.label || st}
              </option>
            ))}
          </select>

          <select className="inc-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
            {ALL_PRIORITIES.map(p => (
              <option key={p} value={p}>
                {p === 'all' ? 'All Priorities' : PRIORITY_CONFIG[p]?.label || p}
              </option>
            ))}
          </select>

          <select className="inc-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="priority">By Severity</option>
          </select>
        </div>

        {/* Result Meta */}
        <div className="inc-result-meta">
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Showing <strong style={{ color: '#002060' }}>{filtered.length}</strong> incidents in{' '}
            <strong style={{ color: '#002060' }}>
              {viewMode === 'my-incidents' ? 'My Incidents' : 'Assigned to Me'}
            </strong>
          </span>
          {(search || statusFilter !== 'all' || priorityFilter !== 'all') && (
            <button
              className="inc-clear-btn"
              onClick={() => { setSearch(''); setStatusFilter('all'); setPriorityFilter('all'); }}
            >
              ✕ Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="inc-table-wrapper">
          {error ? (
            <div className="inc-error">
              <div className="inc-error-icon">⚠️</div>
              <div className="inc-error-title">{error}</div>
              <button className="inc-retry-btn" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          ) : (
            <table className="inc-table">
              <thead>
                <tr className="inc-thead-row">
                  {['Incident #', 'Title', 'Category', 'Priority', 'Raised By', 'Assigned Group', 'Status', 'Created', ''].map(h => (
                    <th key={h} className={`inc-th ${h === '' ? 'inc-th-actions' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <div className="inc-empty">
                        <div className="inc-empty-icon">🚨</div>
                        <div className="inc-empty-title">No incidents found</div>
                        <div className="inc-empty-sub">
                          {viewMode === 'my-incidents' 
                            ? "You haven't created any incidents yet" 
                            : "No incidents assigned to your groups"}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((inc, idx) => (
                    <tr
                      key={inc._id}
                      className="inc-tbody-row"
                      style={{ animationDelay: `${idx * 30}ms` }}
                      onClick={() => navigate(`/incidents/${inc._id}`)}
                    >
                      <td className="inc-td">
                        <span className="inc-number">{inc.incidentNumber || '—'}</span>
                      </td>
                      <td className="inc-td">
                        <div className="inc-title-cell">
                          <span className="inc-title-main">{inc.title || '—'}</span>
                          {inc.description && (
                            <span className="inc-title-desc">
                              {inc.description.length > 60 ? inc.description.slice(0, 60) + '…' : inc.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="inc-td">
                        <span className="inc-category">{inc.category?.name || '—'}</span>
                      </td>
                      <td className="inc-td">
                        <PriorityBadge priority={inc.priority} />
                      </td>
                      <td className="inc-td">
                        <div className="inc-user-cell">
                          <div className="inc-user-avatar">
                            {(inc.raisedBy?.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="inc-user-info">
                            <div className="inc-user-name">{inc.raisedBy?.name || '—'}</div>
                            <div className="inc-user-email">{inc.raisedBy?.mail || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="inc-td">
                        {inc.assignmentGroup?.groupName ? (
                          <div className="inc-group-cell">
                            <div className="inc-group-avatar">
                              {inc.assignmentGroup.groupName.charAt(0).toUpperCase()}
                            </div>
                            <div className="inc-group-info">
                              <div className="inc-group-name">{inc.assignmentGroup.groupName}</div>
                              <MemberTooltip members={inc.assignmentGroup.members} />
                            </div>
                          </div>
                        ) : (
                          <span className="inc-unassigned">Unassigned</span>
                        )}
                       </td>
                      <td className="inc-td">
                        <StatusBadge status={inc.status} />
                       </td>
                      <td className="inc-td">
                        <div className="inc-date-cell">
                          <span className="inc-date-main">{formatDate(inc.createdAt)}</span>
                          <span className="inc-date-rel">{formatRelative(inc.createdAt)}</span>
                        </div>
                       </td>
                      <td className="inc-td" onClick={e => e.stopPropagation()}>
                        <div className="inc-menu-wrapper">
                          {openMenuId === inc._id ? (
                            <div className="inc-menu-dropdown">
                              <button
                                className="inc-menu-item inc-menu-item-delete"
                                onClick={() => {
                                  setDeleteTarget(inc);
                                  setOpenMenuId(null);
                                }}
                                disabled={deleting}
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          ) : (
                            <button
                              className="inc-menu-btn"
                              onClick={() => setOpenMenuId(inc._id)}
                            >
                              ⋮
                            </button>
                          )}
                        </div>
                      </td>
                     </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="inc-pagination">
            <button
              className="inc-page-btn"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Prev
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`e-${i}`} className="inc-page-ellipsis">…</span>
                  ) : (
                    <button
                      key={p}
                      className={`inc-page-btn ${page === p ? 'inc-page-btn-active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  )
                )}
            </div>

            <button
              className="inc-page-btn"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}