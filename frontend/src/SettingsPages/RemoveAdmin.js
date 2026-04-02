import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const backendBase = process.env.REACT_APP_BACKEND_URL;
const HELP_DESK_GROUP_ID = process.env.REACT_APP_HELP_DESK_GROUP_ID;

export default function RemoveAdmin() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();

  const [groupMembers, setGroupMembers]   = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeMessage, setRemoveMessage] = useState(null);
  const [removeError, setRemoveError]     = useState(null);

  const acquireTokenForAdmin = async () => {
    if (!accounts || !accounts[0]) throw new Error('No signed-in account');
    try {
      const resp = await instance.acquireTokenSilent({
        scopes: ['Group.ReadWrite.All', 'User.Read.All'],
        account: accounts[0],
      });
      return resp.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        const resp = await instance.acquireTokenPopup({ 
          scopes: ['Group.ReadWrite.All', 'User.Read.All'], 
          account: accounts[0] 
        });
        return resp.accessToken;
      }
      throw err;
    }
  };

  useEffect(() => {
    const fetchMembers = async () => {
      setMembersLoading(true);
      setRemoveError(null);
      
      try {
        const token = await acquireTokenForAdmin();
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members?$select=id,displayName,mail,userPrincipalName&$top=200`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`);
        
        const j = await res.json();
        setGroupMembers((Array.isArray(j.value) ? j.value : []).map(m => ({
          id: m.id,
          displayName: m.displayName || m.userPrincipalName || m.mail || '(no name)',
          mail: m.mail || '',
          userPrincipalName: m.userPrincipalName || '',
        })));
      } catch (err) {
        console.error('Fetch members error:', err);
        setRemoveError(err.message || 'Failed to load members');
      } finally {
        setMembersLoading(false);
      }
    };
    
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmRemoveUser = async () => {
    if (!selectedMember) { 
      setRemoveError('Select a user to remove.'); 
      return; 
    }
    
    setRemoveLoading(true);
    setRemoveMessage(null);
    setRemoveError(null);
    
    try {
      const token = await acquireTokenForAdmin();
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members/${selectedMember.id}/$ref`,
        { 
          method: 'DELETE', 
          headers: { Authorization: `Bearer ${token}` } 
        }
      );
      
      if (res.ok || res.status === 204) {
        setRemoveMessage(`${selectedMember.displayName} has been removed from Helpdesk_Admin`);
        
        // Fire and forget notification
        fetch(`${backendBase}/api/notify-admin-removed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actor: { 
              id: accounts?.[0]?.homeAccountId || '', 
              name: accounts?.[0]?.name || '', 
              mail: accounts?.[0]?.username || '' 
            },
            target: { 
              id: selectedMember.id, 
              name: selectedMember.displayName, 
              mail: selectedMember.mail || selectedMember.userPrincipalName 
            },
          }),
        }).catch(() => {});
        
        setGroupMembers(prev => prev.filter(m => m.id !== selectedMember.id));
        setSelectedMember(null);
      } else {
        const text = await res.text();
        setRemoveError(`Remove failed: ${res.status} ${text}`);
      }
    } catch (err) {
      console.error('Remove user error:', err);
      setRemoveError(err.message || 'Remove failed');
    } finally {
      setRemoveLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Header with navigation */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <button onClick={() => navigate('/settings')} style={styles.backButton}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginRight: '4px' }}>
              <path d="M12 16L6 10L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Settings
          </button>
          <div style={styles.headerTitle}>
            <h1 style={styles.title}>Remove Admin User</h1>
            <p style={styles.subtitle}>
              Manage administrator access by removing users from the Helpdesk_Admin group
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.content}>
        {/* Stats card */}
        <div style={styles.statsCard}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Total Admins</span>
            <span style={styles.statValue}>{groupMembers.length}</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Selected</span>
            <span style={styles.statValue}>{selectedMember ? 1 : 0}</span>
          </div>
        </div>

        {/* Users list card */}
        <div style={styles.listCard}>
          <div style={styles.listHeader}>
            <h2 style={styles.listTitle}>Administrators</h2>
            <span style={styles.listBadge}>{groupMembers.length} users</span>
          </div>

          {membersLoading ? (
            <div style={styles.loadingState}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Loading administrators...</p>
            </div>
          ) : removeError ? (
            <div style={styles.errorState}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p style={styles.errorText}>{removeError}</p>
              <button 
                onClick={() => window.location.reload()} 
                style={styles.retryButton}
              >
                Retry
              </button>
            </div>
          ) : groupMembers.length === 0 ? (
            <div style={styles.emptyState}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <p style={styles.emptyText}>No administrators found</p>
            </div>
          ) : (
            <div style={styles.userGrid}>
              {groupMembers.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMember(m)}
                  style={{
                    ...styles.userCard,
                    ...(selectedMember?.id === m.id ? styles.userCardSelected : {}),
                    ...(selectedMember?.id === m.id ? styles.userCardDangerSelected : {})
                  }}
                >
                  <div style={styles.userAvatar}>
                    {m.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div style={styles.userInfo}>
                    <div style={styles.userName}>{m.displayName}</div>
                    <div style={styles.userEmail}>{m.mail || m.userPrincipalName}</div>
                  </div>
                  {selectedMember?.id === m.id && (
                    <div style={styles.selectedBadge}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" fill="#ef4444" stroke="white" strokeWidth="2"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        {removeMessage && (
          <div style={styles.successMessage}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path d="M6 10L9 13L14 7" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>{removeMessage}</span>
          </div>
        )}

        {/* Action bar */}
        <div style={styles.actionBar}>
          <div style={styles.actionBarContent}>
            <div style={styles.selectedInfo}>
              {selectedMember ? (
                <>
                  <span style={styles.selectedLabel}>Selected:</span>
                  <span style={styles.selectedName}>{selectedMember.displayName}</span>
                </>
              ) : (
                <span style={styles.noSelection}>No user selected</span>
              )}
            </div>
            <div style={styles.actionButtons}>
              <button
                onClick={() => navigate('/settings')}
                style={styles.cancelButton}
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveUser}
                disabled={removeLoading || !selectedMember}
                style={{
                  ...styles.removeButton,
                  ...(removeLoading || !selectedMember ? styles.removeButtonDisabled : {})
                }}
              >
                {removeLoading ? (
                  <>
                    <span style={styles.buttonSpinner}></span>
                    Removing...
                  </>
                ) : (
                  'Remove Admin Access'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f3f4f6',
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  header: {
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '1.5rem 2rem',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.5rem 1rem',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#4b5563',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '1.5rem',
  },
  headerTitle: {
    maxWidth: '800px',
  },
  title: {
    fontSize: '2rem',
    fontWeight: '600',
    color: '#111827',
    margin: '0 0 0.5rem 0',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#6b7280',
    margin: 0,
    lineHeight: '1.6',
  },
  content: {
    maxWidth: '1200px',
    margin: '2rem auto',
    padding: '0 2rem',
  },
  statsCard: {
    background: 'white',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    padding: '1.5rem 2rem',
    marginBottom: '2rem',
    display: 'flex',
    alignItems: 'center',
    gap: '2rem',
  },
  statItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
  },
  statLabel: {
    fontSize: '0.875rem',
    color: '#6b7280',
    fontWeight: '500',
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#111827',
  },
  statDivider: {
    width: '1px',
    height: '2rem',
    background: '#e5e7eb',
  },
  listCard: {
    background: 'white',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
    marginBottom: '2rem',
  },
  listHeader: {
    padding: '1.5rem 2rem',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#fafafa',
  },
  listTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#111827',
    margin: 0,
  },
  listBadge: {
    padding: '0.25rem 0.75rem',
    background: '#f3f4f6',
    borderRadius: '100px',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#4b5563',
  },
  userGrid: {
    padding: '1.5rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1rem',
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative',
  },
  userCardSelected: {
    background: '#fef2f2',
    borderColor: '#ef4444',
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(239,68,68,0.1)',
  },
  userCardDangerSelected: {
    borderLeft: '4px solid #ef4444',
  },
  userAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: '600',
    color: '#4b5563',
    border: '1px solid #e5e7eb',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#111827',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userEmail: {
    fontSize: '12px',
    color: '#6b7280',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  selectedBadge: {
    marginLeft: 'auto',
  },
  loadingState: {
    padding: '4rem 2rem',
    textAlign: 'center',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #f3f4f6',
    borderTop: '3px solid #111827',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 1rem',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: '14px',
    margin: 0,
  },
  errorState: {
    padding: '4rem 2rem',
    textAlign: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '14px',
    margin: '1rem 0',
  },
  retryButton: {
    padding: '0.5rem 1rem',
    background: '#ef4444',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  emptyState: {
    padding: '4rem 2rem',
    textAlign: 'center',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: '14px',
    margin: '1rem 0 0',
  },
  successMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem 1.5rem',
    background: '#d1fae5',
    border: '1px solid #a7f3d0',
    borderRadius: '10px',
    color: '#065f46',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '2rem',
  },
  actionBar: {
    position: 'sticky',
    bottom: '2rem',
    zIndex: 20,
  },
  actionBarContent: {
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '1rem 1.5rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backdropFilter: 'blur(8px)',
    background: 'rgba(255,255,255,0.95)',
  },
  selectedInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  selectedLabel: {
    fontSize: '14px',
    color: '#6b7280',
    fontWeight: '500',
  },
  selectedName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#111827',
  },
  noSelection: {
    fontSize: '14px',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  actionButtons: {
    display: 'flex',
    gap: '1rem',
  },
  cancelButton: {
    padding: '0.625rem 1.25rem',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#4b5563',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  removeButton: {
    padding: '0.625rem 1.5rem',
    background: '#ef4444',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  removeButtonDisabled: {
    background: '#fca5a5',
    cursor: 'not-allowed',
  },
  buttonSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

// Add keyframes animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);