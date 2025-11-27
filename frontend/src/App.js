import React, { useState, useRef, useEffect } from 'react';
import {
  MsalProvider,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal
} from '@azure/msal-react';
import {
  PublicClientApplication,
  InteractionRequiredAuthError
} from '@azure/msal-browser';
import {
  BrowserRouter as Router,
  Route,
  Routes
} from 'react-router-dom';
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
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profilePhoto, setProfilePhoto] = useState(null);

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
      {/* Font links just like Login.js */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@700;900&family=Open+Sans:wght@400;600;800&display=swap"
      />

      <header
        style={{
          background: 'white',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 40,
          fontFamily: 'Open Sans, sans-serif'
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
                  color: '#002060',
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 900,
                  fontFamily: 'Red Hat Display, sans-serif',
                  letterSpacing: 0.2,
                }}
              >
                SANDEZA INC
              </h1>
            </div>
            <div style={{ color: '#e98404', fontSize: 12, fontWeight: 700, fontFamily: 'Red Hat Display, sans-serif' }}>
              IT Ticket Portal
            </div>
          </div>
        </div>

        {/* ⭐⭐⭐ CENTER TITLE (BRANDED) ⭐⭐⭐ */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            animation: 'floatGlow 3s ease-in-out infinite',
            fontFamily: 'Red Hat Display, sans-serif',
          }}
        >
          <div
            style={{
              fontSize: '1.15rem',
              fontWeight: 900,
              letterSpacing: '0.5px',
              color: '#002060',
              textShadow: '0 2px 8px rgba(0,0,0,0.08)',
              fontFamily: 'Red Hat Display, sans-serif',
            }}
          >
            SANDEZA HELPDESK
          </div>
          <div
            style={{
              fontSize: '0.81rem',
              marginTop: 2,
              fontWeight: 700,
              color: '#e98404',
              letterSpacing: '0.3px',
              fontFamily: 'Open Sans, sans-serif',
            }}
          >
            Empowering Support • Every Step
          </div>
        </div>
        {/* ⭐⭐⭐ END CENTER TITLE ⭐⭐⭐ */}

        {/* RIGHT PROFILE BLOCK — unchanged, except font family */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                  fontFamily: 'Open Sans, sans-serif'
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
                    fontFamily: 'Red Hat Display, sans-serif'
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
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#002060', fontFamily: 'Red Hat Display, sans-serif' }}>
                    {accounts?.[0]?.name || accounts?.[0]?.username}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'Open Sans, sans-serif' }}>
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
                    fontFamily: 'Open Sans, sans-serif'
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
                        fontFamily: 'Red Hat Display, sans-serif'
                      }}
                    >
                      {profilePhoto ? (
                        <img
                          src={profilePhoto}
                          alt="profile"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block'
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 18 }}>{initials}</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#002060', fontFamily: 'Red Hat Display, sans-serif' }}>
                        {accounts?.[0]?.name || 'Unknown'}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 13, fontFamily: 'Open Sans, sans-serif' }}>
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
                        color: '#e98404',
                        fontFamily: 'Red Hat Display, sans-serif'
                      }}
                    >
                      View Full Profile
                    </button>

                    <button
                      onClick={logout}
                      style={{
                        textAlign: 'left',
                        background: '#002060',
                        border: 'none',
                        padding: '10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        color: 'white',
                        fontWeight: 700,
                        fontFamily: 'Open Sans, sans-serif'
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

      {/* FULL PROFILE MODAL – unchanged, add font family if you want */}
      {/* ... existing modal code unchanged ... */}
      {/* For brevity, omitted modal here. Keep your modal as-is. */}
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

  // Branded main container
  return (
    <Router>
      <AuthenticatedTemplate>
        <Header logout={handleLogout} />
        {/* Branded app main area */}
        <main
          style={{
            minHeight: '100vh',
            background: '#f6f8fa',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            margin: 0,
            padding: '40px 0',
            fontFamily: 'Open Sans, sans-serif'
          }}
        >
          <div
            style={{
              background: 'white',
              width: '100%',
              maxWidth: 1100,
              minHeight: 500,
              borderRadius: 18,
              boxShadow: '0 8px 48px rgba(0,32,96,0.22)',
              padding: '40px 32px 30px 32px',
              fontFamily: 'Open Sans, sans-serif'
            }}
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<CreateTicket />} />
              <Route path="/ticket/:id" element={<TicketDetails />} />
              <Route path="/dashboard" element={<Dashboard />} />
            </Routes>
          </div>
        </main>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        {/* Use Login.js branding directly */}
        <Login login={handleLogin} />
      </UnauthenticatedTemplate>
    </Router>
  );
}

function App() {
  return (
    <MsalProvider instance={pca}>
      {/* Global animation (for floating header center-title only!) */}
      <style>
        {`
        @keyframes floatGlow {
          0% { transform: translateX(-50%) translateY(0); opacity: 0.92; }
          50% { transform: translateX(-50%) translateY(-3px); opacity: 1; }
          100% { transform: translateX(-50%) translateY(0); opacity: 0.92; }
        }
      `}
      </style>
      <AppContent />
    </MsalProvider>
  );
}

export default App;