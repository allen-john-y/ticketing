import React, { useState, useRef, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import axios from 'axios'; // For Graph API calls
import Login from './Login';
import Home from './Home';
import CreateTicket from './CreateTicket';
import TicketDetails from './TicketDetails';
import Dashboard from './Dashboard';

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
  const [userInfo, setUserInfo] = useState(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUserInfo = async () => {
    try {
      const account = accounts[0];
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read.All']
      });

      const token = response.accessToken;
      const res = await axios.get(`https://graph.microsoft.com/v1.0/users/${account.username}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUserInfo(res.data);
      setProfileOpen(true);

    } catch (error) {
      console.error('Error fetching user info:', error);
    }
  };

  const buttonStyle = {
    padding: '0.6rem 1.2rem',
    borderRadius: '5px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.95rem',
    whiteSpace: 'nowrap',
  };

  return (
    <header style={{
      background: 'white', padding: '1rem 2rem', boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '1.5rem' }}>🏢 SANDEZA INC</h1>
        <h2 style={{ color: '#7f8c8d', margin: 0, fontSize: '1rem' }}>IT Ticket Portal</h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Profile Button */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            onClick={fetchUserInfo}
            style={{
              ...buttonStyle,
              background: '#3498db',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            👤 View Profile
          </button>

          {profileOpen && userInfo && (
            <div style={{
              position: 'absolute',
              right: 0,
              marginTop: '6px',
              background: 'white',
              border: '1px solid #ccc',
              borderRadius: '8px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
              padding: '16px',
              width: '300px',
              zIndex: 10
            }}>
              {/* Close button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setProfileOpen(false)} style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}>✖</button>
              </div>

              {/* User Info */}
              <p style={{ margin: '6px 0', fontWeight: '600' }}>Name: {userInfo.displayName}</p>
              <p style={{ margin: '6px 0' }}>Email: {userInfo.mail || userInfo.userPrincipalName}</p>
              <p style={{ margin: '6px 0' }}>Mobile: {userInfo.mobilePhone || 'N/A'}</p>
              <p style={{ margin: '6px 0' }}>Department: {userInfo.department || 'N/A'}</p>
              <p style={{ margin: '6px 0' }}>Employee ID: {userInfo.employeeId || 'N/A'}</p>
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
        scopes: ['User.Read', 'User.Read.All', 'GroupMember.Read.All'],
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
