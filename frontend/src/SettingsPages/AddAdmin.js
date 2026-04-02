import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const backendBase = process.env.REACT_APP_BACKEND_URL;
const HELP_DESK_GROUP_ID = process.env.REACT_APP_HELP_DESK_GROUP_ID;

if (!document.getElementById('addadmin-styles')) {
  const s = document.createElement('style');
  s.id = 'addadmin-styles';
  s.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    .aa-dropdown-row { background: rgba(31, 41, 55, 0.8); transition: background 0.12s; }
    .aa-dropdown-row:hover { background: rgba(59, 130, 246, 0.15); }
  `;
  document.head.appendChild(s);
}

export default function AddAdmin() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);

  const [selectedUsers, setSelectedUsers] = useState([]);

  const [addLoading, setAddLoading] = useState(false);
  const [addMessage, setAddMessage] = useState(null);
  const [addError, setAddError]     = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const acquireToken = async () => {
    if (!accounts?.[0]) throw new Error('No signed-in account');
    try {
      return (await instance.acquireTokenSilent({
        scopes: ['Group.ReadWrite.All', 'User.Read.All'],
        account: accounts[0],
      })).accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        return (await instance.acquireTokenPopup({
          scopes: ['Group.ReadWrite.All', 'User.Read.All'],
          account: accounts[0],
        })).accessToken;
      }
      throw err;
    }
  };

  const handleSearch = async (text) => {
    if (!text || text.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setShowDropdown(true);
    try {
      const token = await instance.acquireTokenSilent({
        scopes: ['User.Read.All'],
        account: accounts[0],
      });
      const q = text.trim().replace(/'/g, "''");
      const filter = `startswith(mail,'${q}') or startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')`;
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=5`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      const data = await res.json();
      setSearchResults((data.value || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.mail || '(no name)',
        mail: u.mail || u.userPrincipalName || '',
        userPrincipalName: u.userPrincipalName || '',
      })));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const updateQuery = (value) => {
    setSearchQuery(value);
    setAddError(null);
    handleSearch(value);
  };

  const selectUser = (result) => {
    setShowDropdown(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedUsers(prev =>
      prev.find(u => u.id === result.id) ? prev : [...prev, result]
    );
    setAddError(null);
  };

  const removeUser = (id) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== id));
  };

  const confirmAddUsers = async () => {
    if (selectedUsers.length === 0) {
      setAddError('Search and select at least one user first.');
      return;
    }
    setAddLoading(true);
    setAddMessage(null);
    setAddError(null);

    let token;
    try { token = await acquireToken(); }
    catch (err) { setAddError(err.message); setAddLoading(false); return; }

    const added = [];
    const failed = [];

    for (const u of selectedUsers) {
      try {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members/$ref`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${u.id}`,
            }),
          }
        );
        if (res.ok || res.status === 204) {
          added.push(u);
          fetch(`${backendBase}/api/notify-admin-added`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              actor: { id: accounts?.[0]?.homeAccountId || '', name: accounts?.[0]?.name || '', mail: accounts?.[0]?.username || '' },
              target: { id: u.id, name: u.displayName, mail: u.mail || u.userPrincipalName },
            }),
          }).catch(() => {});
        } else {
          const t = await res.text();
          failed.push(`${u.displayName} (${res.status})`);
        }
      } catch (err) {
        failed.push(`${u.displayName}: ${err.message}`);
      }
    }

    if (added.length > 0) {
      setAddMessage(`Successfully added: ${added.map(u => u.displayName).join(', ')}`);
      setSelectedUsers(prev => prev.filter(u => !added.find(a => a.id === u.id)));
    }
    if (failed.length > 0) {
      setAddError(`Failed to add: ${failed.join(', ')}`);
    }

    setAddLoading(false);
  };

  return (
    <div style={st.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }

        /* ── Header ── */
        .aa-header {
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1.5rem 2rem;
          position: sticky;
          top: 0;
          z-index: 10;
          backdrop-filter: blur(10px);
        }

        .aa-header-inner {
          max-width: 1200px;
          margin: 0 auto;
        }

        .aa-back-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: #e5e7eb;
          cursor: pointer;
          margin-bottom: 1rem;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }

        .aa-back-button:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #f3f4f6;
          transform: translateY(-1px);
        }

        .aa-title {
          font-size: 24px;
          font-weight: 700;
          color: #f3f4f6;
          margin: 0 0 4px;
          letter-spacing: -0.02em;
        }

        .aa-subtitle {
          font-size: 13px;
          color: #d1d5db;
          margin: 0;
          line-height: 1.6;
        }

        /* ── Content ── */
        .aa-content {
          max-width: 1200px;
          margin: 2rem auto;
          padding: 0 2rem;
        }

        /* ── Cards ── */
        .aa-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          backdrop-filter: blur(10px);
          margin-bottom: 1.5rem;
        }

        /* ── Stats Card ── */
        .aa-stats-card {
          padding: 1.5rem 2rem;
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .aa-stat-item {
          display: flex;
          align-items: baseline;
          gap: 10px;
        }

        .aa-stat-label {
          font-size: 12px;
          color: #9ca3af;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .aa-stat-value {
          font-size: 28px;
          font-weight: 700;
          color: #60a5fa;
          font-family: 'Inter', monospace;
        }

        .aa-stat-divider {
          width: 1px;
          height: 2rem;
          background: rgba(255, 255, 255, 0.1);
        }

        /* ── Search Card ── */
        .aa-search-card {
          padding: 1.5rem 2rem;
        }

        .aa-search-header {
          margin-bottom: 1.5rem;
        }

        .aa-search-title {
          font-size: 15px;
          font-weight: 700;
          color: #f3f4f6;
          margin: 0 0 6px;
        }

        .aa-search-desc {
          font-size: 12px;
          color: #d1d5db;
          margin: 0;
          line-height: 1.6;
        }

        .aa-search-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          color: #f3f4f6;
          outline: none;
          transition: all 0.2s;
        }

        .aa-search-input:focus {
          border-color: #3b82f6;
          background: rgba(255, 255, 255, 0.12);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .aa-search-input::placeholder {
          color: #6b7280;
        }

        .aa-searching {
          margin-top: 8px;
          font-size: 11px;
          color: #d1d5db;
          font-weight: 500;
        }

        /* ── Dropdown ── */
        .aa-search-wrapper {
          position: relative;
        }

        .aa-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #1f2937;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          margin-top: 6px;
          max-height: 320px;
          overflow-y: auto;
          z-index: 9999;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
          animation: slideDown 0.15s ease-out;
        }

        .aa-dropdown::-webkit-scrollbar {
          width: 6px;
        }

        .aa-dropdown::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }

        .aa-dropdown::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 3px;
        }

        .aa-dropdown::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        .aa-dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          cursor: pointer;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          transition: background 0.12s;
        }

        .aa-dropdown-item:last-child {
          border-bottom: none;
        }

        .aa-dropdown-item:hover {
          background: rgba(59, 130, 246, 0.2);
        }

        .aa-dropdown-avatar {
          width: 36px;
          height: 36px;
          border-radius: 6px;
          background: rgba(59, 130, 246, 0.25);
          border: 1px solid rgba(59, 130, 246, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          color: #93c5fd;
          flex-shrink: 0;
        }

        .aa-dropdown-content {
          flex: 1;
          min-width: 0;
        }

        .aa-dropdown-name {
          font-size: 13px;
          font-weight: 600;
          color: #f3f4f6;
          margin-bottom: 2px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .aa-dropdown-email {
          font-size: 11px;
          color: #d1d5db;
        }

        .aa-selected-badge {
          font-size: 10px;
          color: #86efac;
          font-weight: 600;
        }

        .aa-dropdown-empty {
          padding: 1rem;
          text-align: center;
          color: #d1d5db;
          font-size: 13px;
        }

        /* ── Results Card ── */
        .aa-results-card {
          overflow: hidden;
        }

        .aa-results-header {
          padding: 1.25rem 1.75rem;
          background: rgba(255, 255, 255, 0.08);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .aa-results-title {
          font-size: 14px;
          font-weight: 700;
          color: #f3f4f6;
          margin: 0;
        }

        .aa-results-badge {
          padding: 4px 10px;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
          color: #93c5fd;
        }

        /* ── User Grid ── */
        .aa-user-grid {
          padding: 1.5rem;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }

        .aa-user-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 1rem;
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 10px;
          position: relative;
          transition: all 0.2s;
        }

        .aa-user-card:hover {
          background: rgba(59, 130, 246, 0.12);
          border-color: #3b82f6;
        }

        .aa-user-avatar {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: rgba(59, 130, 246, 0.25);
          border: 1px solid rgba(59, 130, 246, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          color: #93c5fd;
          flex-shrink: 0;
        }

        .aa-user-info {
          flex: 1;
          min-width: 0;
        }

        .aa-user-name {
          font-size: 13px;
          font-weight: 700;
          color: #f3f4f6;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .aa-user-email {
          font-size: 11px;
          color: #d1d5db;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .aa-user-check {
          color: #86efac;
          flex-shrink: 0;
        }

        .aa-remove-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          font-size: 11px;
          color: #f87171;
          font-weight: 700;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .aa-remove-btn:hover {
          background: rgba(239, 68, 68, 0.3);
        }

        /* ── Messages ── */
        .aa-success-message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 1rem 1.5rem;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.35);
          border-radius: 10px;
          color: #86efac;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 1.5rem;
        }

        .aa-error-message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 1rem 1.5rem;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-radius: 10px;
          color: #f87171;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 1.5rem;
        }

        /* ── Action Bar ── */
        .aa-action-bar {
          position: sticky;
          bottom: 2rem;
          z-index: 20;
        }

        .aa-action-bar-inner {
          background: rgba(31, 41, 55, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1rem 1.5rem;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1.5rem;
        }

        .aa-selected-info {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 1;
          flex-wrap: wrap;
          font-size: 13px;
        }

        .aa-selected-label {
          color: #d1d5db;
          font-weight: 600;
          flex-shrink: 0;
        }

        .aa-selected-name {
          color: #f3f4f6;
          font-weight: 700;
        }

        .aa-no-selection {
          color: #6b7280;
          font-style: italic;
        }

        .aa-cancel-btn {
          padding: 9px 18px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #e5e7eb;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .aa-cancel-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #f3f4f6;
        }

        .aa-add-btn {
          padding: 9px 20px;
          background: #3b82f6;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .aa-add-btn:hover:not(:disabled) {
          background: #2563eb;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
        }

        .aa-add-btn:disabled {
          background: #6b7280;
          cursor: not-allowed;
          box-shadow: none;
        }

        .aa-btn-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .aa-content {
            padding: 0 1rem;
          }

          .aa-header {
            padding: 1rem;
          }

          .aa-user-grid {
            grid-template-columns: 1fr;
          }

          .aa-action-bar-inner {
            flex-direction: column;
            gap: 1rem;
          }

          .aa-selected-info {
            width: 100%;
            justify-content: center;
          }

          .aa-add-btn,
          .aa-cancel-btn {
            width: 100%;
            justify-content: center;
          }
        }

        @media (max-width: 640px) {
          .aa-title {
            font-size: 20px;
          }

          .aa-stats-card {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }

          .aa-stat-divider {
            display: none;
          }
        }
      `}</style>

      {/* Header */}
      <div className="aa-header">
        <div className="aa-header-inner">
          <button onClick={() => navigate('/settings')} className="aa-back-button">
            ← Back to Settings
          </button>
          <h1 className="aa-title">Add Admin User</h1>
          <p className="aa-subtitle">Grant administrator access by adding users to the Helpdesk_Admin group</p>
        </div>
      </div>

      <div className="aa-content">
        {/* Stats */}
        <div className="aa-card aa-stats-card">
          <div className="aa-stat-item">
            <span className="aa-stat-label">Search Results</span>
            <span className="aa-stat-value">{searchResults.length}</span>
          </div>
          <div className="aa-stat-divider" />
          <div className="aa-stat-item">
            <span className="aa-stat-label">Selected</span>
            <span className="aa-stat-value">{selectedUsers.length}</span>
          </div>
        </div>

        {/* Search Card */}
        <div className="aa-card aa-search-card">
          <div className="aa-search-header">
            <h2 className="aa-search-title">🔍 Find User</h2>
            <p className="aa-search-desc">Type 2 or more characters — results appear automatically. Select multiple users before adding.</p>
          </div>

          <div className="aa-search-wrapper">
            <input
              ref={inputRef}
              className="aa-search-input"
              value={searchQuery}
              onChange={(e) => updateQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setShowDropdown(true)}
              placeholder="Type name or email to search..."
              autoComplete="off"
            />

            {searching && <div className="aa-searching">Searching...</div>}

            {/* Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div ref={dropdownRef} className="aa-dropdown">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="aa-dropdown-row aa-dropdown-item"
                    onClick={() => selectUser(result)}
                    style={{ opacity: selectedUsers.find(u => u.id === result.id) ? 0.5 : 1 }}
                  >
                    <div className="aa-dropdown-avatar">
                      {result.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="aa-dropdown-content">
                      <div className="aa-dropdown-name">
                        {result.displayName}
                        {selectedUsers.find(u => u.id === result.id) && (
                          <span className="aa-selected-badge">✓</span>
                        )}
                      </div>
                      <div className="aa-dropdown-email">{result.mail || result.userPrincipalName}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No results */}
            {showDropdown && !searching && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
              <div ref={dropdownRef} className="aa-dropdown aa-dropdown-empty">
                No users found for "{searchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* Selected Users */}
        {selectedUsers.length > 0 && (
          <div className="aa-card aa-results-card">
            <div className="aa-results-header">
              <h2 className="aa-results-title">👤 Selected Users</h2>
              <span className="aa-results-badge">{selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="aa-user-grid">
              {selectedUsers.map(u => (
                <div key={u.id} className="aa-user-card">
                  <div className="aa-user-avatar">
                    {u.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="aa-user-info">
                    <div className="aa-user-name">{u.displayName}</div>
                    <div className="aa-user-email">{u.mail || u.userPrincipalName}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="aa-user-check">
                    <circle cx="8" cy="8" r="7" fill="#86efac" opacity="0.3"/>
                    <path d="M4 8l3 3 5-5" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <button
                    onClick={() => removeUser(u.id)}
                    className="aa-remove-btn"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {addMessage && (
          <div className="aa-success-message">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="8" fill="#86efac" opacity="0.4"/>
              <path d="M4 9l3 3 5-5" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {addMessage}
          </div>
        )}

        {addError && (
          <div className="aa-error-message">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="8" fill="#f87171" opacity="0.4"/>
              <path d="M6 6l6 6M12 6l-6 6" stroke="#f87171" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {addError}
          </div>
        )}

        {/* Action Bar */}
        <div className="aa-action-bar">
          <div className="aa-action-bar-inner">
            <div className="aa-selected-info">
              {selectedUsers.length > 0 ? (
                <>
                  <span className="aa-selected-label">Ready to add:</span>
                  <span className="aa-selected-name">
                    {selectedUsers.map(u => u.displayName).join(', ')}
                  </span>
                </>
              ) : (
                <span className="aa-no-selection">No users selected</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => navigate('/settings')} className="aa-cancel-btn">
                Cancel
              </button>
              <button
                onClick={confirmAddUsers}
                disabled={addLoading || selectedUsers.length === 0}
                className="aa-add-btn"
              >
                {addLoading ? (
                  <>
                    <span className="aa-btn-spinner" />
                    Adding…
                  </>
                ) : (
                  `Add ${selectedUsers.length > 1 ? `${selectedUsers.length} Users` : 'as Admin'}`
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const st = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1a1f35 100%)',
    fontFamily: "'Inter', sans-serif",
    color: '#f3f4f6',
  },
};