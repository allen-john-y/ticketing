import React, { useState, useRef, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { Callout, DirectionalHint } from '@fluentui/react'; // Optional: for better styling
// Or we'll use pure CSS if you don't want Fluent UI

function Header({ logout }) {
  const { accounts, instance } = useMsal();
  const account = accounts[0];

  const [profileOpen, setProfileOpen] = useState(false);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const profileButtonRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileButtonRef.current && !profileButtonRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

  // Fetch extra user details from Microsoft Graph (optional but recommended)
  const userDetails = {
    name: account?.name || 'N/A',
    email: account?.username || 'N/A',
    department: account?.idTokenClaims?.department || 'Not set',
    employeeId: account?.idTokenClaims?.extension_EmployeeID || account?.idTokenClaims?.employeeId || 'Not available',
    mobile: account?.idTokenClaims?.mobilePhone || account?.idTokenClaims?.businessPhones?.[0] || 'Not provided',
  };

  const buttonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.95rem',
    whiteSpace: 'nowrap'
  };

  return (
    <header style={{
      background: 'white',
      padding: '1rem 2rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      position: 'relative'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '1.5rem' }}>🏢 SANDEZA INC</h1>
        <h2 style={{ color: '#7f8c8d', margin: 0, fontSize: '1rem' }}>IT Ticket Portal</h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Profile Dropdown Trigger */}
        <div ref={profileButtonRef} style={{ position: 'relative' }}>
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
            👤 {account?.name?.split(' ')[0] || 'User'}
          </button>

          {/* Small Dropdown */}
          {profileOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: '8px',
              background: 'white',
              border: '1px solid #ddd',
              borderRadius: '8px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
              width: '220px',
              zIndex: 100
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
                <p style={{ margin: '4px 0', fontWeight: '600', fontSize: '0.95rem' }}>
                  {account?.name}
                </p>
                <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#666' }}>
                  {account?.username}
                </p>
              </div>
              <button
                onClick={() => {
                  setFullProfileOpen(true);
                  setProfileOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  ':hover': { backgroundColor: '#f5f5f5' }
                }}
              >
                👀 View Full Profile
              </button>
              <button
                onClick={logout}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 16px',
                  background: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  borderRadius: '0 0 8px 8px'
                }}
              >
                🚪 Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Full Profile Modal */}
      {fullProfileOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 999,
              backdropFilter: 'blur(4px)'
            }}
            onClick={() => setFullProfileOpen(false)}
          />

          {/* Modal Card */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
              width: '420px',
              maxWidth: '90vw',
              zIndex: 1000,
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              background: '#3498db',
              color: 'white',
              padding: '1rem 1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem' }}>User Profile</h3>
              <button
                onClick={() => setFullProfileOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0 8px'
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: '#ddd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  backgroundColor: '#3498db',
                  color: 'white'
                }}>
                  {account?.name?.[0] || 'U'}
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '1.2rem' }}>{userDetails.name}</h4>
                  <p style={{ margin: 0, color: '#666' }}>{userDetails.email}</p>
                </div>
              </div>

              <div style={{ lineHeight: '1.8', fontSize: '0.95rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <strong>Department:</strong>
                  <span>{userDetails.department}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <strong>Employee ID:</strong>
                  <span>{userDetails.employeeId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <strong>Mobile Number:</strong>
                  <span>{userDetails.mobile}</span>
                </div>
              </div>

              <button
                onClick={() => setFullProfileOpen(false)}
                style={{
                  marginTop: '1.5rem',
                  width: '100%',
                  padding: '0.75rem',
                  background: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}