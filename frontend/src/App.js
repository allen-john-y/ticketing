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

  // Unified button style
  const buttonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.95rem',
    whiteSpace: 'nowrap'
  };

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

  return (
    <header style={{
      background: 'white',
      padding: '1rem 2rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <img src={logo} alt="Sandeza logo" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />
        <div>
          <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.25rem' }}>🏢</span>
            <span>SANDEZA INC</span>
          </h1>
          <h2 style={{ color: '#7f8c8d', margin: 0, fontSize: '0.9rem' }}>IT Ticket Portal</h2>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Profile Button */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setProfileOpen(prev => !prev)}
            style={{
              ...buttonStyle,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#3498db',
              color: 'white'
            }}
          >
            👤 View Profile
          </button>

          {profileOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              marginTop: '6px',
              background: 'white',
              border: '1px solid #ccc',
              borderRadius: '8px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
              padding: '16px',
              width: '260px',
              zIndex: 10
            }}>
              <p style={{ margin: '6px 0', fontWeight: '600', fontSize: '0.95rem' }}>Name: {accounts[0]?.name}</p>
              <p style={{ margin: '6px 0', fontSize: '0.95rem'}}>Email: {accounts[0]?.username}</p>
              <button
                onClick={() => { openFullProfile(); setProfileOpen(false); }}
                style={{
                  ...buttonStyle,
                  marginTop: '10px',
                  width: '100%',
                  background: '#3498db',
                  color: 'white'
                }}
              >
                View Full Profile
              </button>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button onClick={logout} style={{
          ...buttonStyle,
          background: '#e74c3c',
          color: 'white'
        }}>
          🚪 Logout
        </button>
      </div>

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
    </header>
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