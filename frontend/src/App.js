import React, { useState, useRef, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import axios from 'axios';
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
  const [smallMenuOpen, setSmallMenuOpen] = useState(false);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setSmallMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchFullProfile = async () => {
    try {
      if (!accounts[0]) return;
      const response = await instance.acquireTokenSilent({
        account: accounts[0],
        scopes: ['User.Read.All']
      });
      const token = response.accessToken;

      const res = await axios.get(`https://graph.microsoft.com/v1.0/me?$select=id,displayName,jobTitle,department,mobilePhone,mail`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUserInfo(res.data);
      setFullProfileOpen(true);
      setSmallMenuOpen(false);
    } catch (error) {
      console.error('Error fetching full profile:', error);
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
    <>
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
              onClick={() => setSmallMenuOpen(prev => !prev)}
              style={{
                ...buttonStyle,
                background: '#3498db',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              👤 View Profile
            </button>

            {/* Small Menu */}
            {smallMenuOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                marginTop: '6px',
                background: 'white',
                border: '1px solid #ccc',
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                padding: '16px',
                width: '240px',
                zIndex: 10
              }}>
                <p style={{ margin: '6px 0', fontWeight: '600' }}>Name: {accounts[0]?.name}</p>
                <p style={{ margin: '6px 0' }}>Email: {accounts[0]?.username}</p>

                <button
                  onClick={fetchFullProfile}
                  style={{
                    marginTop: '10px',
                    width: '100%',
                    padding: '8px 0',
                    background: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '0.95rem'
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
      </header>

      {/* Full Profile Modal */}
      {fullProfileOpen && userInfo && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '8px',
            width: '360px',
            position: 'relative'
          }}>
            <button
              onClick={() => setFullProfileOpen(false)}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'transparent',
                border: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                fontWeight: '600'
              }}>✖</button>

            <h2 style={{ marginBottom: '12px' }}>Full Profile</h2>
            <p><b>Full Name:</b> {userInfo.displayName}</p>
            <p><b>Email:</b> {userInfo.mail}</p>
            <p><b>Mobile Phone:</b> {userInfo.mobilePhone || 'N/A'}</p>
            <p><b>Job Title:</b> {userInfo.jobTitle || 'N/A'}</p>
            <p><b>Department:</b> {userInfo.department || 'N/A'}</p>
            <p><b>Employee ID:</b> {userInfo.id}</p>
          </div>
        </div>
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
        scopes: ['User.Read', 'User.Read.All', 'GroupMember.Read.All'],
        prompt: 'select_account'
      });

      const accounts = instance.getAllAccounts();
      if (accounts.length > 0) instance.setActiveAccount(accounts[0]);
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
