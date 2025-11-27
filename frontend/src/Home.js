import React, { useState, useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import logo from './sandeza.jpg';

function Toast({ open, type = 'info', message = '' }) {
  const bg = type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#002060';
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', top: 20, left: '50%',
        transform: open ? 'translate(-50%,0)' : 'translate(-50%,-10px)',
        background: bg, color: 'white', padding: '10px 18px', borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)', opacity: open ? 1 : 0,
        pointerEvents: 'none', transition: 'opacity 0.3s, transform 0.3s', zIndex: 10001,
        fontFamily: 'Open Sans, sans-serif'
      }}
    >
      <div style={{ fontWeight:600 }}>{message}</div>
    </div>
  );
}

function Home() {
  const { accounts, instance } = useMsal();
  const location = useLocation();

  const [tickets, setTickets] = useState([]);
  const [authority, setAuthority] = useState('basic');
  const [userName, setUserName] = useState('User');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMyTickets, setMyTickets] = useState(false);

  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedCategories,setSelectedCategories] = useState([]);
  const [selectedUsers,setSelectedUsers] = useState([]);
  const [appliedCategories,setAppliedCategories] = useState([]);
  const [appliedUsers,setAppliedUsers] = useState([]);

  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top:0, left:0, width:260 });
  const [searchTerm,setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const categoryBtnRef = useRef(null);
  const userBtnRef = useRef(null);
  const [profilePhoto,setProfilePhoto] = useState(null);

  useEffect(() => {
    if (location.state?.refresh) {
      setRefreshKey(prev => prev + 1);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    const fetchData = async () => {
      if (!accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes:['User.Read','GroupMember.Read.All'], account:accounts[0]
        });

        const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers:{ Authorization:`Bearer ${tokenResponse.accessToken}` }
        });
        setUserName(userRes.data.displayName || 'User');

        // photo fetch (silent fallback)
        try {
          const photoRes = await axios.get('https://graph.microsoft.com/v1.0/me/photo/$value', {
            headers:{ Authorization:`Bearer ${tokenResponse.accessToken}` }, responseType:'arraybuffer'
          });
          const u8 = new Uint8Array(photoRes.data);
          let binary='';
          const chunk=0x8000;
          for (let i=0;i<u8.length;i+=chunk) {
            binary+=String.fromCharCode.apply(null, u8.subarray(i, i+chunk));
          }
          const b64=btoa(binary);
          const typeHeader = photoRes.headers['content-type'] || 'image/jpeg';
          setProfilePhoto(`data:${typeHeader};base64,${b64}`);
        } catch {}

        // tickets fetch
        const backendBase = "https://ticketing-production-5334.up.railway.app";
        const endpoint = `${backendBase}/tickets`;
        const ticketsRes = await axios.get(endpoint);
        const allTickets = ticketsRes.data.reverse();
        setTickets(allTickets);

        setCategories([...new Set(allTickets.map(t=>t.category).filter(Boolean))]);
        setUsers([...new Set(allTickets.map(t=>t.userName).filter(Boolean))]);

      } catch (err) {
        console.error('Fetch error:', err);
      }
    };
    fetchData();
  }, [accounts, instance, refreshKey]);

  // preserve filter mapping + dropdown dismissal logic
  const openTickets = tickets.filter(t => t.status !== 'Closed');
  const closedTickets = tickets.filter(t => t.status === 'Closed');

  const handleSelect = (type, value) => {
    if (type === 'category') {
      setSelectedCategories(prev => prev.includes(value) ? prev.filter(c=>c!==value) : [...prev,value]);
    } else {
      setSelectedUsers(prev => prev.includes(value) ? prev.filter(u=>u!==value) : [...prev,value]);
    }
  };

  const openDropdown = (type) => {
    const ref = type === 'category' ? categoryBtnRef.current : userBtnRef.current;
    if (ref) {
      const rect = ref.getBoundingClientRect();
      setDropdownPos({ top:rect.bottom + window.scrollY + 6, left:rect.left + window.scrollX, width:Math.max(260,rect.width) });
    }
    setDropdownOpen(prev => prev === type ? null : type);
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

  const applyFilters = () => {
    setAppliedCategories(selectedCategories);
    setAppliedUsers(selectedUsers);
    setDropdownOpen(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
  };

  const avatarInitials = (userName || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <>
      {/* Fonts injected - professional brand fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="sandbox:/fonts.googleapis.com/css2?family=Red+Hat+Display:wght@700;900&family=Open+Sans:wght@400;600;800&display=swap" />

      <div style={{ minHeight:"100vh", background:"#f8fafc" }}>
        <div style={{ padding:'2rem', maxWidth:1200, margin:'0 auto', fontFamily:'Open Sans, sans-serif' }}>

          {/* WELCOME BAR */}
          <div className="welcome" style={{
            display:'flex', gap:16, alignItems:'center',
            padding:18, borderRadius:12, boxShadow:'0 6px 24px rgba(2,6,23,0.06)', marginBottom:20,
            background:'white', borderLeft:`6px solid ${authority==='admin'?'#e98404':'#002060'}`
          }}>
            {/* AVATAR (photo or initials) */}
            <div className="avatar" style={{
              width:64, height:64, borderRadius:12, background:'#e0e7ff',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontWeight:800, fontSize:20, color:'#002060', overflow:'hidden'
            }}>
              {profilePhoto ? <img src={profilePhoto} alt={`${userName} profile`} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : avatarInitials}
            </div>

            {/* TITLE + KPIs */}
            <div style={{ flex:1 }}>
              <h2 style={{
                margin:0, fontSize:22, fontWeight:900,
                fontFamily:'Red Hat Display, sans-serif', color:'#002060'
              }}>
                Welcome back, <span style={{ color:'#e98404' }}>{userName}</span>
              </h2>

              {authority === 'admin' && (
                <div style={{ marginTop:10 }}>
                  <label style={{ fontSize:14, fontWeight:600, color:'#374151' }}>
                    <input type="checkbox" checked={showMyTickets} onChange={()=>setMyTickets(prev=>!prev)} style={{ marginRight:8 }} />
                    Show only my tickets
                  </label>
                </div>
              )}

              <div style={{ display:'flex', gap:12, marginTop:12, flexWrap:'wrap' }}>
                <div style={{ background:"#dcfce7", padding:"6px 14px", borderRadius:8, fontWeight:700, fontSize:14, borderLeft:"3px solid #16a34a", boxShadow:"0 2px 6px rgba(0,0,0,0.05)" }}>
                  <span style={{ color:'#166534', fontFamily:'Red Hat Display, sans-serif', fontWeight:900, marginRight:6 }}>{openTickets.length}</span> Open
                </div>
                <div style={{ background:"#fee2e2", padding:"6px 14px", borderRadius:8, fontWeight:700, fontSize:14, borderLeft:"3px solid #dc2626", boxShadow:"0 2px 6px rgba(0,0,0,0.05)" }}>
                  <span style={{ color:'#b91c1c', fontFamily:'Red Hat Display, sans-serif', fontWeight:900, marginRight:6 }}>{closedTickets.length}</span> Closed
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div style={{ display:'flex', gap:12 }}>
              <Link to="/create" style={{ textDecoration:'none' }}>
                <button style={{
                  background:"#e98404", color:"white", border:"none",
                  padding:"12px 22px", borderRadius:8, fontSize:16, fontWeight:700,
                  fontFamily:'Open Sans, sans-serif', cursor:'pointer',
                  boxShadow:'0 4px 12px rgba(233,132,4,0.22)'
                }}>＋ Create Ticket</button>
              </Link>

              <Link to="/dashboard" style={{ textDecoration:'none' }}>
                <button style={{
                  background:"#002060", color:"white", border:"none",
                  padding:"12px 22px", borderRadius:8, fontSize:16, fontWeight:700,
                  fontFamily:'Open Sans, sans-serif', cursor:'pointer',
                  boxShadow:'0 4px 12px rgba(0,32,96,0.18)'
                }}>☰ Dashboard</button>
              </Link>
            </div>
          </div>


          {/* SEARCH */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:20 }}>
            <div style={{ width:'100%', maxWidth:760 }}>
              <div style={{ background:'white', borderRadius:999, padding:6, boxShadow:'0 4px 16px rgba(0,0,0,0.05)' }}>
                <div style={{ display:'flex', alignItems:'center', padding:'10px 16px' }}>
                  <input
                    placeholder="Search tickets…"
                    value={searchTerm}
                    onChange={e=>setSearchTerm(e.target.value)}
                    style={{ flex:1, border:'none', outline:'none', fontSize:15, fontFamily:'Open Sans, sans-serif' }}
                  />
                </div>
              </div>
            </div>
          </div>


          {/* FILTER BUTTONS */}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginBottom:14 }}>
            <button
              ref={categoryBtnRef}
              onClick={()=>openDropdown('category')}
              style={{
                background:'#e98404', color:'white', padding:'10px 16px',
                border:'none', borderRadius:8, fontSize:14, cursor:'pointer',
                fontFamily:'Open Sans, sans-serif', fontWeight:700
              }}
            >
              Filter by Category ▾
            </button>

            {authority === 'admin' && (
              <button
                ref={userBtnRef}
                onClick={()=>openDropdown('user')}
                style={{
                  background:'#002060', color:'white', padding:'10px 16px',
                  border:'none', borderRadius:8, fontSize:14, cursor:'pointer',
                  fontFamily:'Open Sans, sans-serif', fontWeight:700
                }}
              >
                Filter by User ▾
              </button>
            )}
          </div>


          {/* DROPDOWN (ANCHOR) */}
          {dropdownOpen && (
            <div
              ref={dropdownRef}
              style={{
                position:'fixed',
                top:dropdownPos.top,
                left:dropdownPos.left,
                width:dropdownPos.width,
                background:'white',
                padding:14,
                borderRadius:8,
                boxShadow:'0 10px 32px rgba(0,0,0,0.1)',
                zIndex:9999
              }}
            >
              {(dropdownOpen === 'category' ? categories : users).map(item => (
                <label key={item} style={{ display:'flex', gap:8, fontSize:14, padding:'6px 0', fontWeight:600, fontFamily:'Open Sans, sans-serif' }}>
                  <input type="checkbox" checked={dropdownOpen==='category'?selectedCategories.includes(item):selectedUsers.includes(item)} onChange={()=>handleSelect(dropdownOpen,item)} />
                  {item}
                </label>
              ))}

              <div style={{ display:'flex', justifyContent:'center', gap:12, marginTop:14 }}>
                <button onClick={applyFilters} style={{ background:'#e98404', color:'white', border:'none', padding:'8px 14px', borderRadius:6, cursor:'pointer', fontWeight:700, fontFamily:'Open Sans, sans-serif' }}>
                  Apply
                </button>
                <button onClick={()=>setDropdownOpen(null)} style={{ background:'#94a3b8', color:'white', border:'none', padding:'8px 14px', borderRadius:6, cursor:'pointer', fontWeight:600, fontFamily:'Open Sans, sans-serif' }}>
                  Close
                </button>
              </div>
            </div>
          )}


          {/* TICKET LIST */}
          <h2 style={{ color:'#002060', fontFamily:'Red Hat Display, sans-serif', fontWeight:900, marginBottom:18 }}>
            {authority==='admin'
              ? showMyTickets
                ? `My Open Tickets (${openTickets.length})`
                : `All Open Tickets (${openTickets.length})`
              : `Your Open Tickets (${openTickets.length})`
            }
          </h2>

          {openTickets.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'#374151', fontFamily:'Open Sans, sans-serif', fontWeight:600, background:'white', borderRadius:12, boxShadow:'0 6px 20px rgba(0,0,0,0.04)' }}>
              No tickets found.
            </div>
          ) : (
            <div style={{ display:'grid', gap:16 }}>
              {openTickets.map(t => (
                <Link key={t._id} to={`/ticket/${t._id}`} style={{ textDecoration:'none' }}>
                  <div style={{
                    background:'white', padding:20, borderRadius:10, borderLeft:`4px solid ${t.status==='Pending'?'#f59e0b':t.status==='Approved'?'#16a34a':t.status==='Closed'?'#dc2626':'#0ea5e9'}`,
                    boxShadow:'0 6px 20px rgba(0,0,0,0.04)', transition:'background 0.2s'
                  }}>
                    <h3 style={{ margin:0, color:'#002060', fontFamily:'Red Hat Display, sans-serif', fontWeight:800 }}>
                      #{t.ticketNumber} — {t.category}
                    </h3>
                    <p style={{ margin:'6px 0', color:'#374151', fontSize:14, fontFamily:'Open Sans, sans-serif' }}>
                      {t.description}
                    </p>

                    {authority==='admin' && (
                      <div style={{ marginTop:10, background:'#f8fafc', padding:10, borderRadius:8, fontSize:13, color:'#374151', fontFamily:'Open Sans, sans-serif' }}>
                        <strong style={{ color:'#002060' }}>Created by:</strong> {t.userName} ({t.userEmail})<br />
                        {t.onBehalfEmail && t.onBehalf === "Other" && (<><strong style={{ color:'#e98404' }}>On behalf:</strong> {t.onBehalfEmail}<br /></>)}
                        <strong>Created On:</strong> {formatDate(t.createdAt)}
                      </div>
                    )}

                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:12, fontSize:13, fontWeight:600, fontFamily:'Open Sans, sans-serif' }}>
                      <span style={{ color:'#6b7280' }}>Priority: {t.priority}</span>
                      <span style={{ color: t.status === 'Approved' ? '#16a34a' : t.status === 'Pending' ? '#d97706' : '#dc2626' }}>{t.status}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  );
}

export default Home;
