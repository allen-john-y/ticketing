import React, { useState } from 'react';
import {
  MsalProvider,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal
} from '@azure/msal-react';
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
    redirectUri: 'https://ticketing-psi-tawny.vercel.app/'
  },
  cache: { cacheLocation: 'localStorage' }
});

function Header({ logout }) {
  const { accounts } = useMsal();
  const user = accounts[0];

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showFullProfile, setShowFullProfile] = useState(false);

  return (
    <>
      {/* HEADER */}
      <header
        style={{
          background: 'white',
          padding: '1rem 2rem',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '1.5rem' }}>
            🏢 SANDEZA INC
          </h1>
          <h2 style={{ color: '#7f8c8d', margin: 0, fontSize: '1rem' }}>
            IT Ticket Portal
          </h2>
        </div>

        {/* RIGHT SIDE — Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* VIEW PROFILE BUTTON */}
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{
              background: '#3498db',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            👤 View Profile
          </button>

          {/* LOGOUT */}
          <button
            onClick={logout}
            style={{
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            🚪 Logout
          </button>
        </div>
      </header>

      {/* SMALL PROFILE POPUP */}
      {showProfileMenu && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            right: '30px',
            background: 'white',
            padding: '1rem',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            width: '220px',
            zIndex: 999
          }}
        >
          <p style={{ margin: 0, fontWeight: 'bold', color: '#2c3e50' }}>
            {user?.name}
          </p>
          <p style={{ margin: '5px 0', color: '#34495e', fontSize: '0.9rem' }}>
            {user?.username}
          </p>

          <button
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '0.4rem',
              border: 'none',
              background: '#3498db',
              color: 'white',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
            onClick={() => {
              setShowFullProfile(true);
              setShowProfileMenu(false);
            }}
          >
            View Full Profile
          </button>
        </div>
      )}

      {/* FULL PROFILE MODAL */}
      {showFullProfile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              width: '400px',
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              position: 'relative'
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowFullProfile(false)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '15px',
                border: 'none',
                background: 'transparent',
                fontSize: '1.5rem',
                cursor: 'pointer'
              }}
            >
              ✖
            </button>

            <h2 style={{ color: '#2c3e50', marginBottom: '1rem' }}>
              User Profile
            </h2>

            <p>
              <strong>Name:</strong> {user?.name}
            </p>
            <p>
              <strong>Email:</strong> {user?.username}
            </p>
            <p>
              <strong>Azure ID:</strong> {user?.localAccountId}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function AppContent() {
  const { instance } = useMsal();

  const handleLogout = () =>
    instance.logoutRedirect({ postLogoutRedirectUri: '/' });

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
