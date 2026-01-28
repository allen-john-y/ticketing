import React, { useState, useRef, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Login from './Login';
import Home from './Home';
import CreateTicket from './CreateTicket';
import TicketDetails from './TicketDetails';
import Dashboard from './Dashboard';
import logo from './sandeza.jpg';
import gearIcon from './GearIcon.jpg';

const pca = new PublicClientApplication({
  auth: {
    clientId: '6541d73a-dbbd-4f74-9465-38a0eb03ec6b',
    authority: 'https://login.microsoftonline.com/11909ab3-5ecc-48e0-b898-acf7203a1ad7',
    redirectUri: 'https://ticketing-psi-tawny.vercel.app/',
  },
  cache: { cacheLocation: 'localStorage' },
});

function Header({ logout }) {
  const { accounts, instance } = useMsal();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profilePhoto, setProfilePhoto] = useState(null);

  // New: admin + settings state
  const [isAdmin, setIsAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchPhotoSilently = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read'],
          account: accounts[0]
        });

        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });

        if (!photoRes.ok) return;

        const arrayBuffer = await photoRes.arrayBuffer();
        const u8 = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < u8.length; i += chunkSize) {
          const slice = u8.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, slice);
        }
        const b64 = btoa(binary);
        const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
        setProfilePhoto(`data:${contentType};base64,${b64}`);
      } catch (err) {}
    };

    fetchPhotoSilently();
  }, [accounts, instance]);

  // New: check if account is member of Helpdesk_Admin
  useEffect(() => {
    let cancelled = false;

    const checkAdminMembership = async () => {
      if (!accounts || !accounts[0]) {
        setIsAdmin(false);
        return;
      }

      try {
        // Acquire token for group membership read
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['GroupMember.Read.All'],
          account: accounts[0],
        });

        const token = tokenResponse.accessToken;

        // 1) find the Helpdesk_Admin group id
        const groupRes = await fetch(
          "https://graph.microsoft.com/v1.0/groups?$filter=displayName eq 'Helpdesk_Admin'&$select=id,displayName",
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!groupRes.ok) {
          // can't read groups - fallback to false (or handle as needed)
          console.warn('Could not query groups:', groupRes.status);
          if (!cancelled) setIsAdmin(false);
          return;
        }

        const groupJson = await groupRes.json();
        const group = Array.isArray(groupJson.value) && groupJson.value[0];
        if (!group || !group.id) {
          if (!cancelled) setIsAdmin(false);
          return;
        }

        const groupId = group.id;

        // 2) use checkMemberGroups to verify membership
        const checkRes = await fetch('https://graph.microsoft.com/v1.0/me/checkMemberGroups', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: [groupId] }),
        });

        if (checkRes.ok) {
          const checkJson = await checkRes.json();
          const isMember = Array.isArray(checkJson.value) && checkJson.value.includes(groupId);
          if (!cancelled) setIsAdmin(!!isMember);
          return;
        }

        // Fallback: get /me/memberOf and check for the displayName or id match
        const memberOfRes = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (memberOfRes.ok) {
          const moJson = await memberOfRes.json();
          const found = Array.isArray(moJson.value) && moJson.value.some(g =>
            (g.displayName && g.displayName === 'Helpdesk_Admin') || (g.id && g.id === groupId)
          );
          if (!cancelled) setIsAdmin(!!found);
        } else {
          if (!cancelled) setIsAdmin(false);
        }
      } catch (err) {
        // If interaction required, redirect to acquire consent/interactive token for this scope
        if (err instanceof InteractionRequiredAuthError) {
          instance.acquireTokenRedirect({
            scopes: ['GroupMember.Read.All'],
            account: accounts[0],
          });
        } else {
          console.error('Error checking admin membership', err);
          if (!cancelled) setIsAdmin(false);
        }
      }
    };

    checkAdminMembership();

    return () => { cancelled = true; };
  }, [accounts, instance]);

  const fetchFullProfile = async () => {
    if (!accounts || !accounts[0]) return;
    setLoadingProfile(true);
    setProfileError(null);

    try {
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read', 'User.ReadBasic.All'],
        account: accounts[0],
      });

      const token = response.accessToken;
      const graphRes = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department,employeeId,mobilePhone,streetAddress,state,postalCode,jobTitle',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!graphRes.ok) throw new Error(`Graph ${graphRes.status}`);

      const data = await graphRes.json();

      setProfileData({
        name: data.displayName || '',
        email: data.mail || data.userPrincipalName || '',
        department: data.department || '',
        employeeId: data.employeeId || '',
        mobilePhone: data.mobilePhone || '',
        streetAddress: data.streetAddress || '',
        state: data.state || '',
        postalCode: data.postalCode || '',
        jobTitle: data.jobTitle || '',
      });

      try {
        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (photoRes.ok) {
          const arrayBuffer = await photoRes.arrayBuffer();
          const u8 = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < u8.length; i += chunkSize) {
            const slice = u8.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, slice);
          }
          const b64 = btoa(binary);
          const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
          setProfilePhoto(`data:${contentType};base64,${b64}`);
        }
      } catch {}
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        instance.acquireTokenRedirect({
          scopes: ['User.Read', 'User.ReadBasic.All'],
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

  const closeFullProfile = () => {
    setFullProfileOpen(false);
    setProfileError(null);
  };

  const initials = (accounts?.[0]?.name || accounts?.[0]?.username || 'U')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <header
        style={{
          background: 'white',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        {/* LEFT LOGO BLOCK */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src={logo}
            alt="Sandeza logo"
            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1
                style={{
                  color: '#0f172a',
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  letterSpacing: 0.2,
                }}
              >
                SANDEZA INC
              </h1>
            </div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>IT Ticket Portal</div>
          </div>
        </div>

        {/* ⭐⭐⭐ CENTER TITLE (ADDED) ⭐⭐⭐ */}
        <div
          style={{
            position: 'absolute',        // stays centered always
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            animation: 'floatGlow 3s ease-in-out infinite',   // floating animation
          }}
        >
          <div
            style={{
              fontSize: '1.15rem',
              fontWeight: 900,
              letterSpacing: '0.5px',
              color: '#0f172a',
              textShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            SANDEZA HELPDESK
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              marginTop: 2,
              fontWeight: 600,
              color: '#64748b',
              letterSpacing: '0.3px',
            }}
          >
            Empowering Support • Every Step
          </div>
        </div>
        {/* ⭐⭐⭐ END CENTER TITLE ⭐⭐⭐ */}

        {/* RIGHT PROFILE BLOCK */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* New: settings gear shown only for admins */}
            {isAdmin && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setSettingsOpen(s => !s)}
                  aria-label="Settings"
                  title="Settings"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid rgba(15,23,42,0.06)',
                    background: settingsOpen ? '#eef2ff' : 'linear-gradient(180deg,#ffffff,#fbfdff)',
                    cursor: 'pointer',
                    boxShadow: '0 6px 18px rgba(2,6,23,0.04)',
                    color: '#374151',
                  }}
                >
                  {/* simple gear svg */}
                  <img src={gearIcon}
                  alt="Settings"
                  style={{ width: 18, height: 18, objectFit: 'contain' }}
                  />

                </button>

                {settingsOpen && (
                  <div
                    role="menu"
                    aria-label="Admin settings"
                    style={{
                      position: 'absolute',
                      right: 0,
                      marginTop: 8,
                      background: 'white',
                      border: '1px solid rgba(15,23,42,0.06)',
                      borderRadius: 8,
                      boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                      padding: 10,
                      width: 220,
                      zIndex: 60,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Admin Settings</div>
                    <button
                      onClick={() => {
                        // TODO: wire up actual admin page or actions
                        // For now, just close and log
                        setSettingsOpen(false);
                        console.log('Open admin settings (implement navigation)');
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#0f172a',
                        fontWeight: 700,
                      }}
                    >
                      Manage Helpdesk
                    </button>
                    <button
                      onClick={() => {
                        setSettingsOpen(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#6b7280',
                      }}
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}

            <div ref={profileRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setProfileOpen(prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(15,23,42,0.06)',
                  background: 'linear-gradient(180deg,#ffffff,#fbfdff)',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(2,6,23,0.06)',
                }}
                aria-haspopup="true"
                aria-expanded={profileOpen}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#eef2ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    color: '#3730a3',
                    fontSize: 14,
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  {profilePhoto ? (
                    <img
                      src={profilePhoto}
                      alt="profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {accounts?.[0]?.name || accounts?.[0]?.username}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    {accounts?.[0]?.username}
                  </span>
                </div>

                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M6 8l4 4 4-4"
                    stroke="#374151"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {profileOpen && (
                <div
                  role="menu"
                  aria-label="Profile menu"
                  style={{
                    position: 'absolute',
                    right: 0,
                    marginTop: 10,
                    background: 'white',
                    border: '1px solid rgba(15,23,42,0.06)',
                    borderRadius: 10,
                    boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                    padding: 12,
                    width: 300,
                    zIndex: 60,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: '#eef2ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        color: '#3730a3',
                        overflow: 'hidden',
                      }}
                    >
                      {profilePhoto ? (
                        <img
                          src={profilePhoto}
                          alt="profile"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <span style={{ fontSize: 18 }}>{initials}</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>
                        {accounts?.[0]?.name || 'Unknown'}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>
                        {accounts?.[0]?.username}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={() => {
                        openFullProfile();
                        setProfileOpen(false);
                      }}
                      style={{
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 700,
                        color: '#2563eb',
                      }}
                    >
                      View Full Profile
                    </button>

                    <button
                      onClick={logout}
                      style={{
                        textAlign: 'left',
                        background: '#d91515ff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        color: 'white',
                        fontWeight: 700,
                      }}
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* FULL PROFILE MODAL – unchanged */}
      {fullProfileOpen && (
        <>
          <div
            onClick={closeFullProfile}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 50,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '20px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: '420px',
              zIndex: 60,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0 }}>Full Profile</h3>
              <button
                onClick={closeFullProfile}
                aria-label="Close profile"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                }}
              >
                ✖
              </button>
            </div>

            {/* Photo */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  background: '#eef2ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  color: '#3730a3',
                  overflow: 'hidden',
                }}
              >
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt="profile"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <span style={{ fontSize: 20 }}>{initials}</span>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>
                  {accounts?.[0]?.name || ''}
                </div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>
                  {accounts?.[0]?.username || ''}
                </div>
              </div>
            </div>

            {loadingProfile && <p>Loading profile…</p>}

            {profileError && (
              <div style={{ color: 'crimson', marginBottom: '8px' }}>
                <p style={{ margin: 0 }}>Error loading profile:</p>
                <small>{profileError}</small>
              </div>
            )}

            {profileData && (
              <div style={{ display: 'grid', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Name</div>
                  <div style={{ fontWeight: 600 }}>{profileData.name || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Email</div>
                  <div style={{ fontWeight: 600 }}>{profileData.email || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Department</div>
                  <div style={{ fontWeight: 600 }}>{profileData.department || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Job Title</div>
                  <div style={{ fontWeight: 600 }}>{profileData.jobTitle || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Employee ID</div>
                  <div style={{ fontWeight: 600 }}>{profileData.employeeId || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Mobile</div>
                  <div style={{ fontWeight: 600 }}>{profileData.mobilePhone || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Street Address</div>
                  <div style={{ fontWeight: 600 }}>{profileData.streetAddress || '—'}</div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>State</div>
                    <div style={{ fontWeight: 600 }}>{profileData.state || '—'}</div>
                  </div>
                  <div style={{ width: '120px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Pincode</div>
                    <div style={{ fontWeight: 600 }}>{profileData.postalCode || '—'}</div>
                  </div>
                </div>
              </div>
            )}

            {!loadingProfile && !profileData && !profileError && (
              <div style={{ textAlign: 'center' }}>
                <small>No profile data available.</small>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function AppContent() {
  const { instance } = useMsal();

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: '/' });
  };

  const handleLogin = async () => {
    try {
      await instance.loginRedirect({
        scopes: ['User.Read', 'User.ReadBasic.All', 'GroupMember.Read.All'],
        prompt: 'select_account'
      });
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <Router>
      <AuthenticatedTemplate>
        <Header logout={handleLogout} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateTicket />} />
          <Route path="/ticket/:id" element={<TicketDetails />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <Login login={handleLogin} />
      </UnauthenticatedTemplate>
    </Router>
  );
}

function App() {
  return (
    <MsalProvider instance={pca}>
      <AppContent />
    </MsalProvider>
  );
}

export default App;

/* ⭐⭐⭐ GLOBAL ANIMATION (ADDED) ⭐⭐⭐ */
<style>
{`
@keyframes floatGlow {
  0% { transform: translateX(-50%) translateY(0); opacity: 0.95; }
  50% { transform: translateX(-50%) translateY(-3px); opacity: 1; }
  100% { transform: translateX(-50%) translateY(0); opacity: 0.95; }
}
`}
</style>