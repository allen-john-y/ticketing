function Header({ logout }) {
  const { accounts } = useMsal();
  const account = accounts[0];

  const [profileOpen, setProfileOpen] = useState(false);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const buttonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.95rem',
    whiteSpace: 'nowrap'
  };

  // Try to get extra info from ID token claims (common Azure AD fields)
  const userInfo = {
    name: account?.name || 'Unknown',
    email: account?.username || 'N/A',
    department: account?.idTokenClaims?.department || 'Not set',
    employeeId: account?.idTokenClaims?.extension_EmployeeID || 
                account?.idTokenClaims?.employeeId || 
                'Not available',
    mobile: account?.idTokenClaims?.mobilePhone || 
            account?.idTokenClaims?.businessPhones?.[0] || 
            'Not provided'
  };

  return (
    <>
      <header style={{
        background: 'white',
        padding: '1rem 2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '1.5rem' }}>SANDEZA INC</h1>
          <h2 style={{ color: '#7f8c8d', margin: 0, fontSize: '1rem' }}>IT Ticket Portal</h2>
        </div>

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
              top: '100%',
              marginTop: '8px',
              background: 'white',
              border: '1px solid #ddd',
              borderRadius: '8px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
              width: '260px',
              zIndex: 1000
            }}>
              <div style={{ padding: '12px 16px' }}>
                <p style={{ margin: '4px 0', fontWeight: '600' }}>Name: {userInfo.name}</p>
                <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#555' }}>Email: {userInfo.email}</p>
              </div>
              <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #eee' }} />
              <button
                onClick={() => {
                  setFullProfileOpen(true);
                  setProfileOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                👀 View Full Profile
              </button>
              <button
                onClick={logout}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                🚪 Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Full Profile Modal - Only what you asked for */}
      {fullProfileOpen && (
        <>
          {/* Dark Backdrop */}
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 9999
            }}
            onClick={() => setFullProfileOpen(false)}
          />

          {/* Modal Box */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            borderRadius: '12px',
            width: '400px',
            maxWidth: '90vw',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            zIndex: 10000
          }}>
            <div style={{
              background: '#3498db',
              color: 'white',
              padding: '1rem 1.5rem',
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0 }}>Full Profile</h3>
              <button
                onClick={() => setFullProfileOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '28px',
                  cursor: 'pointer',
                  padding: '0 8px',
                  lineHeight: '1'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <p><strong>Name:</strong> {userInfo.name}</p>
              <p><strong>Email:</strong> {userInfo.email}</p>
              <p><strong>Department:</strong> {userInfo.department}</p>
              <p><strong>Employee ID:</strong> {userInfo.employeeId}</p>
              <p><strong>Mobile Number:</strong> {userInfo.mobile}</p>

              <button
                onClick={() => setFullProfileOpen(false)}
                style={{
                  marginTop: '20px',
                  width: '100%',
                  padding: '10px',
                  background: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}