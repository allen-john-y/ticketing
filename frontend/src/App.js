import React, { useState, useRef, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
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
  const { accounts } = useMsal();
  const [profileOpen, setProfileOpen] = useState(false);
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
            onClick={() => setProfileOpen(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1rem',
              borderRadius: '5px',
              border: 'none',
              background: '#3498db',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '500',
              whiteSpace: 'nowrap',
            }}
          >
            👤 {accounts[0]?.name || accounts[0]?.username}
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
              padding: '12px',
              width: '220px',
              zIndex: 10
            }}>
              <p style={{ margin: '4px 0', fontWeight: '600' }}>Name: {accounts[0]?.name || accounts[0]?.username}</p>
              <p style={{ margin: '4px 0' }}>Email: {accounts[0]?.username}</p>
              <button style={{
                marginTop: '8px',
                width: '100%',
                padding: '6px 0',
                background: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600'
              }}>
                View Full Profile
              </button>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button onClick={logout} style={{
          background: '#e74c3c', color: 'white', border: 'none', padding: '0.5rem 1rem',
          borderRadius: '5px', cursor: 'pointer', fontWeight: '500'
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
        scopes: ['User.Read', 'GroupMember.Read.All'],
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
