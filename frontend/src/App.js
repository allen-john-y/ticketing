import React, { useState, useRef, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Login from './Login';
import Home from './Home';
import CreateTicket from './CreateTicket';
import TicketDetails from './TicketDetails';
import Dashboard from './Dashboard';

// Existing MSAL configuration
const pca = new PublicClientApplication({
  auth: {
    clientId: '6541d73a-dbbd-4f74-9465-38a0eb03ec6b',
    authority: 'https://login.microsoftonline.com/11909ab3-5ecc-48e0-b898-acf7203a1ad7',
    redirectUri: 'https://ticketing-psi-tawny.vercel.app/',
  },
  cache: { cacheLocation: 'localStorage' },
});

// --- NEW COMPONENT FOR FULL PROFILE MODAL ---
function FullProfileModal({ accounts, onClose, isOpen }) {
  if (!isOpen) return null;

  const profile = accounts[0];

  // Note: Department, Employee ID, and Mobile Number are placeholders
  // because the current MSAL scopes/logic do not fetch this data.
  const profileDetails = [
    { label: 'Name', value: profile?.name || 'N/A' },
    { label: 'Email', value: profile?.username || 'N/A' },
    { label: 'Department', value: 'IT Support (Placeholder)' },
    { label: 'Employee ID', value: 'EID9001 (Placeholder)' },
    { label: 'Mobile Number', value: '+1-555-123-4567 (Placeholder)' },
  ];

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  };

  const contentStyle = {
    backgroundColor: 'white',
    padding: '30px',
    borderRadius: '10px',
    width: '400px',
    maxWidth: '90%',
    position: 'relative',
    boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
  };

  const closeButtonStyle = {
    position: 'absolute',
    top: '10px',
    right: '10px',
    background: 'none',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#333',
  };

  const detailStyle = {
    marginBottom: '15px',
    paddingBottom: '8px',
    borderBottom: '1px solid #eee',
  };

  const labelStyle = {
    fontWeight: '600',
    color: '#3498db',
    fontSize: '0.9rem',
    display: 'block',
    marginBottom: '2px',
  };

  const valueStyle = {
    fontSize: '1.05rem',
    color: '#2c3e50',
    margin: 0,
  };

  return (
    <div style={modalStyle}>
      <div style={contentStyle}>
        <button onClick={onClose} style={closeButtonStyle}>
          &times;
        </button>
        <h3 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px', marginTop: 0, color: '#2c3e50' }}>
          Full Profile Details
        </h3>
        {profileDetails.map((detail) => (
          <div key={detail.label} style={detailStyle}>
            <span style={labelStyle}>{detail.label}:</span>
            <p style={valueStyle}>{detail.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
// ---------------------------------------------------


function Header({ logout }) {
  const { accounts } = useMsal();
  const [profileOpen, setProfileOpen] = useState(false);
  // NEW STATE: To control the full profile modal visibility
  const [isModalOpen, setIsModalOpen] = useState(false); 
  const profileRef = useRef(null);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Logic unchanged
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Unified button style (unchanged)
  const buttonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.95rem',
    whiteSpace: 'nowrap'
  };

  // NEW FUNCTION: To open the full profile modal
  const openModal = () => {
    setProfileOpen(false); // Close the dropdown first
    setIsModalOpen(true);
  }

  // NEW FUNCTION: To close the full profile modal
  const closeModal = () => {
    setIsModalOpen(false);
  }

  return (
    <>
      <header style={{
        background: 'white',
        padding: '1rem 2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
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
                  onClick={openModal} // LOGIC ADDED HERE TO OPEN MODAL
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
      </header>

      {/* NEW MODAL RENDER */}
      <FullProfileModal accounts={accounts} onClose={closeModal} isOpen={isModalOpen} />
    </>
  );
}

// AppContent and App components remain unchanged in their core logic
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