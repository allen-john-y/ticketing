import React, { useState, useRef, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import Login from './Login';
import Home from './Home';
import CreateTicket from './CreateTicket';
import TicketDetails from './TicketDetails';
import Dashboard from './Dashboard';
import logo from './sandeza.jpg';

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

  // full profile modal state
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // new: profile photo state (data URL)
  const [profilePhoto, setProfilePhoto] = useState(null);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch a lightweight profile photo from Graph silently on mount / when account changes.
  // This is intentionally silent: on interaction-required we skip fetching to avoid redirecting the user.
  useEffect(() => {
    const fetchPhotoSilently = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read'],
          account: accounts[0]
        });

        // Request the binary photo content
        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });

        if (!photoRes.ok) {
          // no photo or can't access — silently ignore
          return;
        }

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
      } catch (err) {
        // InteractionRequiredAuthError or other errors — do not change app flow, just skip the photo.
        // Do not log noise to console in production; keep minimal debugging if needed
        // console.debug('Profile photo not available', err);
      }
    };

    fetchPhotoSilently();
  }, [accounts, instance]);

  // Fetch user profile from Microsoft Graph
  const fetchFullProfile = async () => {
    if (!accounts || !accounts[0]) return;
    setLoadingProfile(true);
    setProfileError(null);

    try {
      // Acquire token for Microsoft Graph
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read', 'User.ReadBasic.All'],
        account: accounts[0],
      });

      const token = response.accessToken;
      const graphRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department,employeeId,mobilePhone,streetAddress,state,postalCode', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!graphRes.ok) {
        const txt = await graphRes.text();
        throw new Error(`Graph response ${graphRes.status}: ${txt}`);
      }

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
      });

      // Also attempt to fetch photo when opening full profile, and set if available.
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
      } catch (photoErr) {
        // ignore photo fetch errors here as well
      }
    } catch (err) {
      // If interaction required, fall back to redirect to get consent / login
      if (err instanceof InteractionRequiredAuthError || (err && err.errorCode === 'interaction_required')) {
        try {
          await instance.acquireTokenRedirect({
            scopes: ['User.Read', 'User.ReadBasic.All'],
            account: accounts[0],
          });
        } catch (e) {
          setProfileError('Interaction required to get profile. Redirecting to sign-in.');
          console.error(e);
        }
      } else {
        setProfileError(err.message || String(err));
        console.error('Failed to fetch profile:', err);
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  // open full profile and load data
  const openFullProfile = () => {
    setFullProfileOpen(true);
    setProfileData(null);
    fetchFullProfile();
  };

  // close full profile
  const closeFullProfile = () => {
    setFullProfileOpen(false);
    setProfileError(null);
  };

  // small helper for initials
  const initials = (accounts?.[0]?.name || accounts?.[0]?.username || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

  return (
    <>
      <header style={{
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
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={logo} alt="Sandeza logo" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ color: '#0f172a', margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: 0.2 }}>
                SANDEZA INC
              </h1>
            </div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>IT Ticket Portal</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* optional place for quick actions if needed in future */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

            {/* Profile / View button */}
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
                aria-label="View profile"
              >
                <div style={{
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
                  overflow: 'hidden'
                }}>
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{accounts?.[0]?.name || accounts?.[0]?.username}</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{accounts?.[0]?.username}</span>
                </div>

                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M6 8l4 4 4-4" stroke="#374151" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {profileOpen && (
                <div role="menu" aria-label="Profile menu" style={{
                  position: 'absolute',
                  right: 0,
                  marginTop: 10,
                  background: 'white',
                  border: '1px solid rgba(15,23,42,0.06)',
                  borderRadius: 10,
                  boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                  padding: 12,
                  width: 300,
                  zIndex: 60
                }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, background: '#eef2ff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#3730a3', overflow: 'hidden'
                    }}>
                      {profilePhoto ? (
                        <img src={profilePhoto} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <span style={{ fontSize: 18 }}>{initials}</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{accounts?.[0]?.name || 'Unknown'}</div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>{accounts?.[0]?.username}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={() => { openFullProfile(); setProfileOpen(false); }}
                      style={{
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 700,
                        color: '#2563eb'
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
                        fontWeight: 700
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

      {/* Full profile modal */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>Full Profile</h3>
              <button
                onClick={closeFullProfile}
                aria-label="Close profile"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.1rem',
                  cursor: 'pointer'
                }}
              >
                ✖
              </button>
            </div>

            {/* show photo here as well if available */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 12, background: '#eef2ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#3730a3', overflow: 'hidden'
              }}>
                {profilePhoto ? (
                  <img src={profilePhoto} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <span style={{ fontSize: 20 }}>{initials}</span>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{accounts?.[0]?.name || ''}</div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>{accounts?.[0]?.username || ''}</div>
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