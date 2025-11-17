import React, { useState, useEffect } from 'react';
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
import axios from 'axios';

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

  const [user, setUser] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);

  // fetch user profile + photo
  useEffect(() => {
    const loadProfile = async () => {
      if (!accounts[0]) return;

      let token;
      try {
        const res = await instance.acquireTokenSilent({
          scopes: ['User.Read'],
          account: accounts[0]
        });
        token = res.accessToken;
      } catch {
        return;
      }

      // user basic info
      const userRes = await axios.get("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(userRes.data);

      // photo
      try {
        const photoRes = await axios.get(
          "https://graph.microsoft.com/v1.0/me/photo/$value",
          {
            headers: { Authorization: `Bearer ${token}` },
            responseType: "blob",
          }
        );
        setPhoto(URL.createObjectURL(photoRes.data));
      } catch {
        setPhoto(null);
      }
    };

    loadProfile();
  }, [accounts, instance]);

  return (
    <header
      style={{
        background: 'white',
        padding: '1rem 2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '1.5rem' }}>🏢 SANDEZA INC</h1>
        <h2 style={{ color: '#7f8c8d', margin: 0, fontSize: '1rem' }}>IT Ticket Portal</h2>
      </div>

      {/* RIGHT SIDE → PROFILE + LOGOUT */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        
        {/* PROFILE AREA */}
        <div
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setMenuOpen(prev => !prev)}
        >
          <img
            src={photo || "https://i.ibb.co/YbQ0T8f/default-avatar.png"}
            alt="profile"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid #3498db'
            }}
          />
          <span style={{ marginLeft: '0.5rem', color: '#2c3e50', fontWeight: '500' }}>
            View Profile ▾
          </span>
        </div>

        {/* LOGOUT BUTTON */}
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

      {/* DROPDOWN MENU */}
      {menuOpen && user && (
        <div
          style={{
            position: 'absolute',
            right: '2rem',
            top: '4.5rem',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '1rem',
            width: '240px',
            zIndex: 100
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <img
              src={photo || "https://i.ibb.co/YbQ0T8f/default-avatar.png"}
              alt="profile"
              style={{
                width: '70px',
                height: '70px',
                borderRadius: '50%',
                objectFit: 'cover',
                marginBottom: '0.5rem'
              }}
            />
            <h3 style={{ margin: '0', fontSize: '1.1rem' }}>{user.displayName}</h3>
            <p style={{ margin: '0.2rem 0', color: '#7f8c8d' }}>{user.userPrincipalName}</p>

            <button
              onClick={() => setFullProfileOpen(true)}
              style={{
                marginTop: '0.7rem',
                background: '#3498db',
                color: 'white',
                border: 'none',
                padding: '0.4rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              View Full Profile
            </button>
          </div>
        </div>
      )}

      {/* FULL PROFILE OVERLAY */}
      {fullProfileOpen && user && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              width: '450px',
              position: 'relative'
            }}
          >
            {/* CLOSE BUTTON */}
            <div
              onClick={() => setFullProfileOpen(false)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                cursor: 'pointer',
                fontSize: '1.5rem'
              }}
            >
              ❌
            </div>

            <div style={{ textAlign: 'center' }}>
              <img
                src={photo || "https://i.ibb.co/YbQ0T8f/default-avatar.png"}
                alt="avatar"
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  marginBottom: '1rem'
                }}
              />

              <h2>{user.displayName}</h2>
              <p><strong>Email:</strong> {user.mail || user.userPrincipalName}</p>
              <p><strong>Job Title:</strong> {user.jobTitle || "Not available"}</p>
              <p><strong>Department:</strong> {user.department || "Not available"}</p>
              <p><strong>Phone:</strong> {user.mobilePhone || "Not available"}</p>
            </div>
          </div>
        </div>
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
