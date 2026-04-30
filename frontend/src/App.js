import React, { useState, useRef, useEffect } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import Login from './Login';
import Home from './Home';
import Requests from './Requests';
import Incidents from './Incidents'
import CreateRequest from './CreateRequest';
import CreateIncident from './CreateIncident';
import TicketDetails from './TicketDetails';
import IncidentDetails from './IncidentDetails';
import RequestDetails from './RequestDetails';
import Dashboard from './Dashboard';
import Settings from './SettingsPages/Settings';
import CreateKB from './SettingsPages/CreateKB';
import CreateKBForm from './SettingsPages/CreateKBForm';
import KBListView from './KBListView';
import KBView from './KBView';
import logo from './sandeza.jpg';
import gearIcon from './GearIcon.jpg';

const HELP_DESK_GROUP_ID = process.env.REACT_APP_HELP_DESK_GROUP_ID;

function Header({ logout }) {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const location = useLocation();

  const [profileOpen, setProfileOpen]         = useState(false);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [profileData, setProfileData]         = useState(null);
  const [loadingProfile, setLoadingProfile]   = useState(false);
  const [profileError, setProfileError]       = useState(null);
  const [profilePhoto, setProfilePhoto]       = useState(null);
  const [isAdmin, setIsAdmin]                 = useState(false);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch profile photo silently
  useEffect(() => {
    const fetchPhotoSilently = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read'],
          account: accounts[0],
        });
        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
        });
        if (!photoRes.ok) return;
        const arrayBuffer = await photoRes.arrayBuffer();
        const u8 = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < u8.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize));
        }
        const b64 = btoa(binary);
        const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
        setProfilePhoto(`data:${contentType};base64,${b64}`);
      } catch {
        // silent fail
      }
    };
    fetchPhotoSilently();
  }, [accounts, instance]);

  // Check admin group membership
  useEffect(() => {
    let cancelled = false;
    const checkMembership = async () => {
      if (!accounts || !accounts[0]) {
        setIsAdmin(false);
        return;
      }
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['GroupMember.Read.All'],
          account: accounts[0],
        });
        const token = tokenResponse.accessToken;

        const res = await fetch('https://graph.microsoft.com/v1.0/me/checkMemberGroups', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: [HELP_DESK_GROUP_ID] }),
        });

        if (res.ok) {
          const json = await res.json();
          const member = Array.isArray(json.value) && json.value.includes(HELP_DESK_GROUP_ID);
          if (!cancelled) setIsAdmin(!!member);
          return;
        }

        const fallback = await fetch(
          'https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName',
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (fallback.ok) {
          const j = await fallback.json();
          const found = Array.isArray(j.value) && j.value.some(g => g.id === HELP_DESK_GROUP_ID);
          if (!cancelled) setIsAdmin(!!found);
        } else {
          if (!cancelled) setIsAdmin(false);
        }
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          instance.acquireTokenPopup({
            scopes: ['GroupMember.Read.All'],
            account: accounts[0],
          });
        } else {
          if (!cancelled) setIsAdmin(false);
        }
      }
    };
    checkMembership();
    return () => { cancelled = true; };
  }, [accounts, instance]);

  // Full profile fetch
  const fetchFullProfile = async () => {
    if (!accounts || !accounts[0]) return;
    setLoadingProfile(true);
    setProfileError(null);
    try {
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read', 'User.ReadBasic.All', 'User.Read.All'],
        account: accounts[0],
      });
      const token = response.accessToken;

      const graphRes = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department,employeeId,mobilePhone,streetAddress,state,postalCode,jobTitle,manager&$expand=manager($select=displayName)',
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'ConsistencyLevel': 'eventual',
          },
        }
      );
      if (!graphRes.ok) throw new Error(`Graph ${graphRes.status}`);
      const data = await graphRes.json();

      setProfileData({
        name:          data.displayName || '',
        email:         data.mail || data.userPrincipalName || '',
        department:    data.department || '',
        employeeId:    data.employeeId || '',
        mobilePhone:   data.mobilePhone || '',
        streetAddress: data.streetAddress || '',
        state:         data.state || '',
        postalCode:    data.postalCode || '',
        jobTitle:      data.jobTitle || '',
        manager:       data.manager ? data.manager.displayName || '' : '',
      });

      try {
        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (photoRes.ok) {
          const arrayBuffer = await photoRes.arrayBuffer();
          const u8 = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < u8.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize));
          }
          setProfilePhoto(`data:image/jpeg;base64,${btoa(binary)}`);
        }
      } catch {}
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        instance.acquireTokenPopup({
          scopes: ['User.Read', 'User.ReadBasic.All', 'User.Read.All'],
          account: accounts[0],
        });
      } else {
        setProfileError(err.message);
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  const openFullProfile = () => {
    setFullProfileOpen(true);
    setProfileData(null);
    fetchFullProfile();
  };

  // Generate initials from first and last name
  const initials = (accounts?.[0]?.name || accounts?.[0]?.username || 'U')
    .split(' ')
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join('');

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .app-root {
          min-height: 100vh;
          background: #f4f4f0;
          font-family: 'DM Sans', sans-serif;
          color: #111827;
        }

        .app-container { display: flex; min-height: 100vh; }

        .main-wrapper {
          flex: 1;
          width: 100%;
          min-height: 100vh;
          background: #f4f4f0;
        }

        .app-header {
          background: #002060;
          padding: 1rem 2rem;
          border-bottom: 1px solid #d9d5cc;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-left { display: flex; align-items: center; gap: 1rem; }

        .logo-img {
          width: 40px; height: 40px; border-radius: 6px;
          object-fit: cover; cursor: pointer;
        }

        .company-info { cursor: pointer; }
        .company-info h1 {
          margin: 0; font-size: 1.1rem; font-weight: 600;
          color: white; letter-spacing: -0.02em;
        }
        .company-subtitle { color: white; font-size: 11px; margin-top: 2px; font-weight: 500; }

        .header-right { display: flex; align-items: center; gap: 0.75rem; }

        /* Action Buttons Container */
        .header-actions {
          display: flex;
          gap: 0.75rem;
          margin-right: 0.5rem;
          flex-wrap: wrap;
        }

        /* Action Buttons Styling */
        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        /* New Incident Button */
        .btn-new-incident {
          background: white;
          color: #dc2626;
          border: 2px solid #dc2626;
        }

        .btn-new-incident:hover {
          background: #fef2f2;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(220, 38, 38, 0.15);
        }

        .btn-new-incident:active {
          transform: translateY(0);
        }

        /* New Request Button - Service Request */
        .btn-new-request {
          background: white;
          color: #3b82f6;
          border: 2px solid #3b82f6;
        }

        .btn-new-request:hover {
          background: #eff6ff;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
        }

        .btn-new-request:active {
          transform: translateY(0);
        }

        /* New Ticket Button - Legacy/Create */
        .btn-new-ticket {
          background: white;
          color: #e98404;
          border: 2px solid #e98404;
        }

        .btn-new-ticket:hover {
          background: #fff7ed;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(233, 132, 4, 0.15);
        }

        .btn-new-ticket:active {
          transform: translateY(0);
        }

        /* All Tickets Button */
        .btn-all-tickets {
          background: white;
          color: #e98404;
          border: 2px solid #e98404;
        }

        .btn-all-tickets:hover {
          background: #fff7ed;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(233, 132, 4, 0.15);
        }

        .btn-all-tickets:active {
          transform: translateY(0);
        }

        /* All Requests Button */
        .btn-all-requests {
          background: white;
          color: #3b82f6;
          border: 2px solid #3b82f6;
        }

        .btn-all-requests:hover {
          background: #eff6ff;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
        }

        .btn-all-requests:active {
          transform: translateY(0);
        }

        /* All Incidents Button */
        .btn-all-incidents {
          background: white;
          color: #dc2626;
          border: 2px solid #dc2626;
        }

        .btn-all-incidents:hover {
          background: #fef2f2;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(220, 38, 38, 0.15);
        }

        .btn-all-incidents:active {
          transform: translateY(0);
        }

        /* KB Articles Button */
        .btn-kb {
          background: white;
          color: #8b5cf6;
          border: 2px solid #8b5cf6;
        }

        .btn-kb:hover {
          background: #f5f3ff;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.15);
        }

        .btn-kb:active {
          transform: translateY(0);
        }

        /* Indicator Dot */
        .btn-indicator {
          width: 8px;
          height: 8px;
          background: currentColor;
          border-radius: 50%;
          display: inline-block;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.2);
          }
        }

        .settings-btn {
          width: 38px; height: 38px; border-radius: 6px;
          border: 1px solid #d9d5cc; background: white; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: all 0.15s;
        }
        .settings-btn:hover { background: #f9f8f6; transform: translateY(-1px); }
        .settings-btn img { width: 18px; height: 18px; opacity: 0.7; }

        .profile-btn {
          display: flex; align-items: center; gap: 8px; padding: 6px 12px;
          border-radius: 6px; border: 1px solid #d9d5cc; background: white;
          color: #111827; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif;
        }
        .profile-btn:hover { background: #f9f8f6; transform: translateY(-1px); }

        .profile-avatar {
          width: 28px; height: 28px; border-radius: 4px; background: #e5e7eb;
          display: flex; align-items: center; justify-content: center;
          font-weight: 600; font-size: 11px; overflow: hidden; color: #374151;
        }
        .profile-avatar img { width: 100%; height: 100%; object-fit: cover; }

        .profile-info { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; }
        .profile-name  { font-size: 12px; font-weight: 600; color: #111827; }
        .profile-email { font-size: 10px; color: #6b7280; }

        .profile-dropdown {
          position: absolute; right: 0; margin-top: 8px; background: white;
          border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          padding: 1rem; width: 280px; z-index: 60; border: 1px solid #d9d5cc;
        }

        .profile-dropdown-header {
          display: flex; gap: 12px; align-items: center;
          margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #d9d5cc;
        }

        .profile-dropdown-avatar {
          width: 48px; height: 48px; border-radius: 6px; background: #e5e7eb;
          display: flex; align-items: center; justify-content: center;
          font-weight: 600; color: #374151; overflow: hidden; font-size: 14px;
        }
        .profile-dropdown-avatar img { width: 100%; height: 100%; object-fit: cover; }

        .profile-dropdown-name  { font-weight: 600; font-size: 14px; margin-bottom: 2px; color: #111827; }
        .profile-dropdown-email { font-size: 12px; color: #6b7280; }
        .profile-actions { display: flex; flex-direction: column; gap: 8px; }

        .profile-action-btn {
          width: 100%; text-align: left; padding: 0.6rem 0.75rem; border-radius: 4px;
          border: none; font-weight: 500; cursor: pointer; transition: all 0.15s;
          font-size: 13px; font-family: 'DM Sans', sans-serif;
        }
        .btn-view-profile { background: #f9f8f6; color: #111827; }
        .btn-view-profile:hover { background: #e5e7eb; }
        .btn-logout { background: #ef4444; color: white; }
        .btn-logout:hover { background: #dc2626; }

        /* Shared modal styles */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          z-index: 9999; backdrop-filter: blur(3px); animation: fadeIn 0.15s;
        }

        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .modal {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          background: white; border-radius: 10px; padding: 1.75rem;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 10000;
          max-height: 90vh; overflow-y: auto; animation: slideUp 0.2s; border: 1px solid #d9d5cc;
        }
        .modal-small { width: 500px; max-width: 90vw; }
        .modal-large { width: 800px; max-width: 95vw; }

        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 1.25rem; padding-bottom: 1rem; border-bottom: 1px solid #d9d5cc;
        }
        .modal-title { margin: 0; font-size: 1.2rem; font-weight: 600; color: #111827; letter-spacing: -0.02em; }
        .modal-close {
          background: transparent; border: none; font-size: 1.2rem; color: #9ca3af;
          cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center;
          justify-content: center; border-radius: 4px; transition: all 0.15s;
        }
        .modal-close:hover { background: #f9f8f6; color: #374151; }

        .page-content { padding: 0; }

        @media (max-width: 768px) {
          .main-wrapper { width: 100%; }
          .modal-small, .modal-large { width: 95vw; padding: 1.25rem; }
          .header-actions {
            gap: 0.5rem;
          }
          .action-btn {
            padding: 6px 12px;
            font-size: 12px;
          }
          .action-btn span {
            display: none;
          }
        }
      `}</style>

      <div className="app-root">
        <div className="app-container">
          <div className="main-wrapper">

            {/* Header */}
            <header className="app-header">
              <div className="header-left">
                <img
                  src={logo}
                  alt="Sandeza logo"
                  className="logo-img"
                  onClick={() => navigate('/')}
                />
                <div className="company-info" onClick={() => navigate('/')}>
                  <h1>SANDEZA INC</h1>
                  <div className="company-subtitle">IT Ticket Portal</div>
                </div>
              </div>

              <div className="header-right">
                {/* Action Buttons with Indicators */}
                <div className="header-actions">
                  {/* New Incident */}
                  <button
                    onClick={() => navigate('/create-incident')}
                    className="action-btn btn-new-incident"
                  >
                    {location.pathname === '/create-incident' && (
                      <span className="btn-indicator"></span>
                    )}
                    <span>🚨 New Incident</span>
                  </button>

                  {/* New Service Request */}
                  <button
                    onClick={() => navigate('/create-request')}
                    className="action-btn btn-new-request"
                  >
                    {location.pathname === '/create-request' && (
                      <span className="btn-indicator"></span>
                    )}
                    <span>📋 New Request</span>
                  </button>

                  {/* All Requests - NEW */}
                  <button
                    onClick={() => navigate('/requests')}
                    className="action-btn btn-all-requests"
                  >
                    {location.pathname === '/requests' && (
                      <span className="btn-indicator"></span>
                    )}
                    <span>📋 All Requests</span>
                  </button>

                  {/* All Incidents - NEW */}
                  <button
                    onClick={() => navigate('/incidents')}
                    className="action-btn btn-all-incidents"
                  >
                    {location.pathname === '/incidents' && (
                      <span className="btn-indicator"></span>
                    )}
                    <span>🚨 All Incidents</span>
                  </button>

                  {/* KB Articles */}
                  <button
                    onClick={() => navigate('/kb')}
                    className="action-btn btn-kb"
                  >
                    {location.pathname === '/kb' && (
                      <span className="btn-indicator"></span>
                    )}
                    <span>📚 Knowledge Base</span>
                  </button>

                  {/* Create KB Article button removed - moved to Settings page */}
                </div>

                {/* Gear icon — navigates to /settings page */}
                {isAdmin && (
                  <button
                    onClick={() => navigate('/settings')}
                    className="settings-btn"
                    aria-label="Admin settings"
                  >
                    <img src={gearIcon} alt="Settings" />
                  </button>
                )}

                {/* Profile button */}
                <div ref={profileRef} style={{ position: 'relative' }}>
                  <button onClick={() => setProfileOpen(prev => !prev)} className="profile-btn">
                    <div className="profile-avatar">
                      {profilePhoto
                        ? <img src={profilePhoto} alt="profile" />
                        : <span>{initials}</span>
                      }
                    </div>
                    <div className="profile-info">
                      <span className="profile-name">{accounts?.[0]?.name || accounts?.[0]?.username}</span>
                      <span className="profile-email">{accounts?.[0]?.username}</span>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {profileOpen && (
                    <div className="profile-dropdown">
                      <div className="profile-dropdown-header">
                        <div className="profile-dropdown-avatar">
                          {profilePhoto
                            ? <img src={profilePhoto} alt="profile" />
                            : <span>{initials}</span>
                          }
                        </div>
                        <div>
                          <div className="profile-dropdown-name">{accounts?.[0]?.name || 'Unknown'}</div>
                          <div className="profile-dropdown-email">{accounts?.[0]?.username}</div>
                        </div>
                      </div>

                      <div className="profile-actions">
                        <button
                          onClick={() => { openFullProfile(); setProfileOpen(false); }}
                          className="profile-action-btn btn-view-profile"
                        >
                           View Full Profile
                        </button>
                        <button onClick={logout} className="profile-action-btn btn-logout">
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Page routes */}
            <div className="page-content">
              <Routes>
                <Route path="/"                 element={<Home />} />
                <Route path="/requests"         element={<Requests />} />
                <Route path="/incidents"        element={<Incidents />} />
                <Route path="/create-request"   element={<CreateRequest />} />
                <Route path="/create-incident"  element={<CreateIncident />} />
                <Route path="/incidents/:id"    element={<IncidentDetails />} />
                <Route path="/requests/:id"     element={<RequestDetails />} />
                <Route path="/dashboard"        element={<Dashboard />} />
                <Route path="/settings/*"       element={<Settings />} />
                <Route path="/settings/create-kb" element={<CreateKB />} />
                <Route path="/settings/create-kb/new" element={<CreateKBForm />} />
                <Route path="/kb"               element={<KBListView />} />
                <Route path="/kb/:id"           element={<KBView />} />
              </Routes>
            </div>
          </div>
        </div>

        {/* Full Profile modal */}
        {fullProfileOpen && (
          <>
            <div className="modal-overlay" onClick={() => setFullProfileOpen(false)} />
            <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Full Profile</h3>
                <button onClick={() => setFullProfileOpen(false)} className="modal-close">✕</button>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', padding: '1rem', background: '#f9f8f6', borderRadius: '8px' }}>
                <div style={{
                  width: '60px', height: '60px', borderRadius: '6px', background: '#e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: '600', color: '#374151', overflow: 'hidden', fontSize: '16px',
                }}>
                  {profilePhoto
                    ? <img src={profilePhoto} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span>{initials}</span>
                  }
                </div>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{accounts?.[0]?.name || ''}</div>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>{accounts?.[0]?.username || ''}</div>
                </div>
              </div>

              {loadingProfile && (
                <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>Loading profile...</p>
              )}
              {profileError && (
                <div className="message message-error">Error loading profile: {profileError}</div>
              )}
              {profileData && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {Object.entries({
                    'Name':              profileData.name,
                    'Email':             profileData.email,
                    'Department':        profileData.department,
                    'Job Title':         profileData.jobTitle,
                    'Reporting Manager': profileData.manager,
                    'Employee ID':       profileData.employeeId,
                    'Mobile':            profileData.mobilePhone,
                    'Address':           profileData.streetAddress,
                    'State':             profileData.state,
                    'Pincode':           profileData.postalCode,
                  }).map(([label, value]) => value && (
                    <div key={label}>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px', fontWeight: '500' }}>{label}</div>
                      <div style={{ fontWeight: '500', color: '#111827', fontSize: '13px' }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function AppContent() {
  const { instance } = useMsal();

  const handleLogout = () => {
    instance.logoutPopup({ postLogoutRedirectUri: '/' });
  };

  const handleLogin = async () => {
    try {
      await instance.loginPopup({
        scopes: ['User.Read', 'User.ReadBasic.All', 'GroupMember.Read.All'],
        prompt: 'select_account',
      });
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <Router>
      <AuthenticatedTemplate>
        <Header logout={handleLogout} />
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <Login login={handleLogin} />
      </UnauthenticatedTemplate>
    </Router>
  );
}

function App() {
  return <AppContent />;
}

export default App;