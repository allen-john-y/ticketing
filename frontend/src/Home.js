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

  // =======================================
  // 🔥 TOAST SYSTEM
  // =======================================
  const [toasts, setToasts] = useState([]);

  const showToast = ({ type = "success", message }) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const closeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Trigger from navigation
  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      window.history.replaceState({}, "");
    }
    if (location.state?.refresh) {
      setRefreshKey(prev => prev + 1);
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  // =======================================
  // FETCH + GRAPH + BACKEND
  // =======================================
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
          console.error(err);
          return;
        }
      }

      try {
        const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        setUserName(userRes.data.displayName || 'User');

        // profile photo
        try {
          const photoRes = await axios.get(
            'https://graph.microsoft.com/v1.0/me/photo/$value',
            { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }, responseType: 'arraybuffer' }
          );

          const u8 = new Uint8Array(photoRes.data);
          let binary = '';
          for (let i = 0; i < u8.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          }
          const b64 = btoa(binary);
          setProfilePhoto(`data:${photoRes.headers['content-type'] || 'image/jpeg'};base64,${b64}`);
        } catch {}

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
        console.error('Error fetching:', err);
      }
    };

    fetchData();
  }, [accounts, instance, refreshKey]);

  // close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        !categoryBtnRef.current?.contains(e.target) &&
        !userBtnRef.current?.contains(e.target)
      ) {
        setDropdownOpen(null);
      }
    };

    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, []);

  // FILTER LOGIC (unchanged)
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
        (t.ticketNumber + "").includes(searchTerm) ||
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
      const u = appliedCategories.filter(c => c !== value);
      setAppliedCategories(u);
      setSelectedCategories(u);
    } else {
      const u = appliedUsers.filter(c => c !== value);
      setAppliedUsers(u);
      setSelectedUsers(u);
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
      setSelectedCategories(prev =>
        prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]
      );
    } else {
      setSelectedUsers(prev =>
        prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]
      );
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
        width: rect.width
      });
    }
  };

  const categoryColor = (cat) => {
    if (!cat) return '#3498db';
    let c = cat.toLowerCase();
    if (c.includes('admin')) return '#f39c12';
    if (c.includes('payroll') || c.includes('expense')) return '#27ae60';
    if (c.includes('leave') || c.includes('onboard')) return '#e74c3c';
    return '#3498db';
  };

  const initials = (userName || accounts?.[0]?.username || 'U')
    .split(' ')
    .map(s => s[0])
    .join('')
    .toUpperCase();

 return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>

      {/* ====================================================== */}
      {/* 🔥 TOAST CONTAINER */}
      {/* ====================================================== */}
      <div style={{
        position: 'fixed',
        top: '18px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '320px'
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              color: 'white',
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              animation: 'toastSlide 0.35s ease',
              background:
                t.type === 'success' ? '#16a34a' :
                t.type === 'info' ? '#f39c12' :
                '#dc2626',
              boxShadow: '0 6px 18px rgba(0,0,0,0.2)'
            }}
          >
            <span>{t.message}</span>
            <button
              onClick={() => closeToast(t.id)}
              style={{
                background: 'transparent',
                color: 'white',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                marginLeft: '10px'
              }}
            >
              ×
            </button>
          </div>
        ))}

        <style>{`
          @keyframes toastSlide {
            from {
              opacity:0;
              transform: translateX(35px);
            }
            to {
              opacity:1;
              transform: translateX(0);
            }
          }
          @media (max-width: 480px) {
            div[style*="position: fixed"] {
              right: 10px !important;
              top: 10px !important;
              max-width: 260px !important;
            }
          }
        `}</style>
      </div>

      {/* WELCOME SECTION */}
      <style>{`
        .welcome { display:flex; gap:16px; align-items:center; background:linear-gradient(180deg,#fff,#fbfdff); padding:18px; border-radius:12px; box-shadow:0 6px 24px rgba(2,6,23,0.06); margin-bottom:18px; }
        .avatar { width:64px; height:64px; border-radius:12px; background:linear-gradient(135deg,#eef2ff,#e9f5ff); display:flex; align-items:center; justify-content:center; font-weight:800; color:#3730a3; font-size:20px; overflow:hidden; box-shadow:0 4px 12px rgba(2,6,23,0.06); }
        .avatar img { width:100%; height:100%; object-fit:cover; }
        .welcome-left { flex:1; display:flex; gap:12px; align-items:center; }
        .welcome-title { font-size:20px; font-weight:800; color:#0f172a; margin:0; }
        .role-badge { padding:6px 12px; border-radius:999px; color:white; font-size:12px; font-weight:700; }
        .role-admin { background:linear-gradient(90deg,#16a34a,#60a5fa); }
        .role-user { background:linear-gradient(90deg,#94a3b8,#64748b); }
        .kpis { display:flex; gap:10px; margin-top:6px; flex-wrap:wrap; }
        .kpi { background:#f8fafc; padding:8px 12px; border-radius:10px; font-weight:700; color:#0f172a; display:flex; gap:10px; align-items:center; box-shadow:0 4px 12px rgba(2,6,23,0.03); }
        .actions { display:flex; gap:10px; }
        .btn { padding:10px 14px; border-radius:10px; cursor:pointer; border:none; font-weight:700; }
        .btn-create { background:linear-gradient(90deg,#2563eb,#60a5fa); color:white; }
        .btn-closed { background:linear-gradient(90deg,#7c3aed,#a78bfa); color:white; }

        @media(max-width:700px){
          .welcome { flex-direction:column; align-items:flex-start; }
          .actions { width:100%; justify-content:space-between; }
        }
      `}</style>

      <div className="welcome">
        <div className="avatar">
          {profilePhoto ? <img src={profilePhoto} alt="pf" /> : initials}
        </div>

        <div className="welcome-left">
          <div>
            <h2 className="welcome-title">
              Welcome back, <span style={{ color:'#2563eb' }}>{userName}</span>
            </h2>

            <span className={`role-badge ${authority === 'admin' ? 'role-admin' : 'role-user'}`}>
              {authority === 'admin' ? 'ADMIN' : 'USER'}
            </span>

            <div className="kpis">
              <div className="kpi"><b>{openTickets.length}</b> Open</div>
              <div className="kpi"><b>{closedTickets.length}</b> Closed</div>
            </div>

            {authority === 'admin' && (
              <label style={{ marginTop:10, display:'block', fontWeight:600 }}>
                <input
                  type="checkbox"
                  checked={showMyTickets}
                  onChange={() => setShowMyTickets(prev => !prev)}
                  style={{ marginRight:8 }}
                />
                Show only my tickets
              </label>
            )}
          </div>
        </div>

        <div className="actions">
          <Link to="/create"><button className="btn btn-create">Create Ticket</button></Link>
          <Link to="/dashboard"><button className="btn btn-closed">Closed Tickets</button></Link>
        </div>
      </div>

      {/* SEARCH */}
      <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
        <div style={{ width:'100%', maxWidth:760 }}>
          <input
            placeholder="Search tickets…"
            value={searchTerm}
            onChange={(e)=>setSearchTerm(e.target.value)}
            style={{
              width:'100%',
              padding:'12px 16px',
              borderRadius:999,
              border:'1px solid #d1d5db',
              fontSize:16
            }}
          />
        </div>
      </div>

      {/* FILTER BUTTONS */}
      <div style={{ display:'flex', gap:10 }}>
        <button ref={categoryBtnRef} onClick={()=>openDropdown('category')}
          style={{ padding:'10px 12px', borderRadius:8, border:'1px solid #ccc', background:'white' }}>
          Filter by Category ▾
        </button>

        {authority === 'admin' && (
          <button ref={userBtnRef} onClick={()=>openDropdown('user')}
            style={{ padding:'10px 12px', borderRadius:8, border:'1px solid #ccc', background:'white' }}>
            Filter by User ▾
          </button>
        )}
      </div>

      {/* FILTER DROPDOWN */}
      {dropdownOpen && (
        <div
          ref={dropdownRef}
          style={{
            position:'absolute',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            background:'white',
            border:'1px solid #ccc',
            padding:12,
            borderRadius:10,
            boxShadow:'0 12px 28px rgba(0,0,0,0.1)',
            zIndex:9999
          }}
        >
          {(dropdownOpen === 'category' ? categories : users).map(item => (
            <label key={item} style={{ display:'flex', gap:8, marginBottom:6 }}>
              <input
                type="checkbox"
                checked={
                  dropdownOpen === 'category'
                    ? selectedCategories.includes(item)
                    : selectedUsers.includes(item)
                }
                onChange={()=>handleSelect(dropdownOpen, item)}
              />
              {item}
            </label>
          ))}
          <br/>
          <button onClick={applyFilters} style={{ padding:'6px 10px', marginRight:6 }}>Apply</button>
          <button onClick={()=>setDropdownOpen(null)} style={{ padding:'6px 10px' }}>Close</button>
        </div>
      )}

      {/* APPLIED FILTERS */}
      {(appliedCategories.length>0 || appliedUsers.length>0) && (
        <div style={{ marginTop:12, display:'flex', gap:10, flexWrap:'wrap' }}>
          {appliedCategories.map(c=>(
            <span key={c} style={{ padding:'6px 10px', background:'#eef', borderRadius:20 }}>
              {c}
              <button onClick={()=>removeFilter('category',c)} style={{ marginLeft:6, color:'red', background:'none', border:'none' }}>×</button>
            </span>
          ))}
          {appliedUsers.map(u=>(
            <span key={u} style={{ padding:'6px 10px', background:'#eef', borderRadius:20 }}>
              {u}
              <button onClick={()=>removeFilter('user',u)} style={{ marginLeft:6, color:'red', background:'none', border:'none' }}>×</button>
            </span>
          ))}
          <button onClick={clearAllFilters} style={{ padding:'6px 12px', background:'red', color:'white', borderRadius:20 }}>Clear All</button>
        </div>
      )}

      {/* LIST TITLE */}
      <h2 style={{ marginTop:20 }}>
        {authority === 'admin'
          ? (showMyTickets ? `My Open Tickets (${openTickets.length})`
                          : `All Open Tickets (${openTickets.length})`)
          : `Your Open Tickets (${openTickets.length})`}
      </h2>

      {/* TICKETS LIST */}
      {openTickets.length === 0 ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#777' }}>
          <h3>No tickets found</h3>
        </div>
      ) : (
        <div style={{ display:'grid', gap:'1rem' }}>
          {openTickets.map(ticket => (
            <Link key={ticket._id} to={`/ticket/${ticket._id}`} style={{ textDecoration:'none' }}>
              <div
                style={{
                  background:'#f8f9fa',
                  padding:'1.3rem',
                  borderRadius:10,
                  borderLeft:`4px solid ${categoryColor(ticket.category)}`,
                  transition:'0.2s'
                }}
                onMouseEnter={e=>e.currentTarget.style.background='#eef7ff'}
                onMouseLeave={e=>e.currentTarget.style.background='#f8f9fa'}
              >
                <h3 style={{ margin:0 }}>#{ticket.ticketNumber} – {ticket.category}</h3>
                <p style={{ margin:'6px 0', color:'#444' }}>{ticket.description}</p>

                {authority === 'admin' && (
                  <>
                    <p style={{ margin:0 }}><b>Created by:</b> {ticket.userName}</p>
                    <p style={{ margin:0 }}><b>Email:</b> {ticket.userEmail}</p>
                  </>
                )}

                <div style={{ display:'flex', justifyContent:'space-between', marginTop:10 }}>
                  <span style={{ fontWeight:700, color:'#0f9' }}>Status: {ticket.status}</span>
                  <span>Priority: {ticket.priority}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Home;
