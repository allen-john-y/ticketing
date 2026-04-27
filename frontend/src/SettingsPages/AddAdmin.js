// AddAdmin.js - Fixed dropdown/action bar overlap
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const backendBase = process.env.REACT_APP_BACKEND_URL;
const HELP_DESK_GROUP_ID = process.env.REACT_APP_HELP_DESK_GROUP_ID;

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
  const [addLoading, setAddLoading]       = useState(false);
  const [addMessage, setAddMessage]       = useState(null);
  const [addError, setAddError]           = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
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
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=8`,
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

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:    #002060;
      --navy2:   #003090;
      --orange:  #e98404;
      --orange2: #f5a623;
      --white:   #ffffff;
      --bg:      #f5f7fa;
      --border:  #e2e8f0;
      --text:    #0f172a;
      --muted:   #64748b;
      --light:   #f8fafc;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .aa-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
      /* No overflow:hidden — let page scroll freely */
    }

    /* Hero */
    .aa-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .aa-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .aa-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .aa-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .aa-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .aa-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800; color: #ffffff;
      line-height: 1.15; margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .aa-hero h1 em { font-style: normal; color: var(--orange); }
    .aa-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content — extra bottom padding to clear the fixed action bar */
    .aa-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 160px;
    }

    .aa-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 24px;
      display: inline-flex; align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .aa-back-btn:hover { color: var(--orange); }

    /* Stats */
    .aa-stats-row {
      display: flex; gap: 24px;
      margin-bottom: 28px;
      animation: fadeUp 0.45s 0.05s ease both;
    }
    .aa-stat-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 24px 32px;
      display: flex; align-items: center; gap: 20px;
      flex: 1;
    }
    .aa-stat-icon {
      width: 48px; height: 48px; border-radius: 14px;
      background: rgba(0,32,96,0.08);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px;
    }
    .aa-stat-content { display: flex; flex-direction: column; }
    .aa-stat-value {
      font-family: 'Sora', sans-serif;
      font-size: 32px; font-weight: 800; color: var(--navy);
      line-height: 1; letter-spacing: -0.03em; margin-bottom: 4px;
    }
    .aa-stat-label {
      font-size: 12px; font-weight: 700;
      letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted);
    }

    /* ─── SEARCH CARD ─── overflow:visible so dropdown escapes it */
    .aa-search-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 24px;
      animation: fadeUp 0.45s 0.1s ease both;
      position: static;
      overflow: visible;
    }

    .aa-search-title {
      font-family: 'Sora', sans-serif;
      font-size: 16px; font-weight: 700; color: var(--navy);
      margin-bottom: 8px;
      display: flex; align-items: center; gap: 8px;
    }
    .aa-search-desc {
      font-size: 14px; color: var(--muted); margin-bottom: 24px;
    }

    /* Wrapper must also be overflow:visible */
    .aa-search-wrapper {
      position: relative;
      overflow: visible;
    }

    .aa-search-input {
      width: 100%;
      padding: 16px 20px;
      border: 1.5px solid var(--border);
      border-radius: 16px;
      font-size: 15px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
    }
    .aa-search-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .aa-search-input::placeholder { color: var(--muted); }

    .aa-searching {
      margin-top: 12px; font-size: 13px; color: var(--muted); font-weight: 500;
    }

    /* ─── DROPDOWN ─── z-index 9999 beats action bar (50) AND App header (200) */
    .aa-dropdown {
      position: absolute;
      top: calc(100% + 6px);
      left: 0; right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0,32,96,0.18), 0 2px 8px rgba(0,0,0,0.06);
      z-index: 9999;
      animation: slideDown 0.15s ease-out;
    }

    .aa-dropdown-item {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 20px;
      cursor: pointer;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    .aa-dropdown-item:first-child { border-radius: 16px 16px 0 0; }
    .aa-dropdown-item:last-child  { border-bottom: none; border-radius: 0 0 16px 16px; }
    .aa-dropdown-item:only-child  { border-radius: 16px; }
    .aa-dropdown-item:hover { background: var(--bg); }

    .aa-dropdown-avatar {
      width: 44px; height: 44px; border-radius: 12px;
      background: var(--navy);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; color: white; flex-shrink: 0;
    }
    .aa-dropdown-content { flex: 1; min-width: 0; }
    .aa-dropdown-name {
      font-size: 15px; font-weight: 600; color: var(--text);
      margin-bottom: 3px; display: flex; align-items: center; gap: 8px;
    }
    .aa-dropdown-email { font-size: 13px; color: var(--muted); }

    .aa-selected-badge {
      font-size: 11px; font-weight: 700;
      color: #10b981; background: #d1fae5;
      padding: 2px 8px; border-radius: 12px;
    }

    .aa-dropdown-empty {
      padding: 24px; text-align: center;
      color: var(--muted); font-size: 14px;
      border-radius: 16px;
    }

    /* Selected Users */
    .aa-results-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      margin-bottom: 24px;
      animation: fadeUp 0.45s 0.15s ease both;
    }
    .aa-results-header {
      padding: 20px 28px;
      background: var(--light);
      border-bottom: 1.5px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .aa-results-title {
      font-family: 'Sora', sans-serif;
      font-size: 14px; font-weight: 700; color: var(--navy);
      letter-spacing: 0.03em;
    }
    .aa-results-badge {
      padding: 4px 14px; background: var(--navy);
      border-radius: 20px; font-size: 12px; font-weight: 700; color: white;
    }
    .aa-user-grid {
      padding: 24px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .aa-user-card {
      display: flex; align-items: center; gap: 14px;
      padding: 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      transition: all 0.2s;
    }
    .aa-user-card:hover {
      border-color: var(--navy);
      box-shadow: 0 4px 12px rgba(0,32,96,0.08);
    }
    .aa-user-avatar {
      width: 48px; height: 48px; border-radius: 12px;
      background: var(--navy);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: 700; color: white; flex-shrink: 0;
    }
    .aa-user-info { flex: 1; min-width: 0; }
    .aa-user-name {
      font-size: 15px; font-weight: 700; color: var(--text);
      margin-bottom: 3px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .aa-user-email {
      font-size: 12px; color: var(--muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .aa-user-check { color: #10b981; flex-shrink: 0; }
    .aa-remove-btn {
      width: 32px; height: 32px; border-radius: 10px;
      background: var(--white); border: 1.5px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0; font-size: 14px; color: var(--muted);
      transition: all 0.2s;
    }
    .aa-remove-btn:hover {
      border-color: #ef4444; color: #ef4444; background: #fee2e2;
    }

    /* Messages */
    .aa-success-message {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 24px;
      background: #d1fae5; border: 1.5px solid #10b981;
      border-radius: 16px; color: #065f46;
      font-size: 14px; font-weight: 600;
      margin-bottom: 24px; animation: fadeUp 0.3s ease;
    }
    .aa-error-message {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 24px;
      background: #fee2e2; border: 1.5px solid #ef4444;
      border-radius: 16px; color: #991b1b;
      font-size: 14px; font-weight: 600;
      margin-bottom: 24px; animation: fadeUp 0.3s ease;
    }

    /* ─── ACTION BAR ───
       z-index: 50 — deliberately LOWER than dropdown (9999)
       so the dropdown floats above it when open. */
    .aa-action-bar {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 50;                  /* ← lower than dropdown */
      padding: 0 48px 28px;
      background: linear-gradient(to top, var(--bg) 0%, var(--bg) 55%, transparent 100%);
      pointer-events: none;
    }
    .aa-action-bar-inner {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      padding: 18px 28px;
      box-shadow: 0 8px 32px rgba(0,32,96,0.12);
      display: flex; align-items: center; justify-content: space-between;
      gap: 24px;
      max-width: 1320px; margin: 0 auto;
      pointer-events: auto;
    }

    .aa-selected-info {
      display: flex; align-items: center; gap: 10px;
      flex: 1; flex-wrap: wrap; font-size: 14px;
    }
    .aa-selected-label { color: var(--muted); font-weight: 600; flex-shrink: 0; }
    .aa-selected-name  { color: var(--text); font-weight: 700; }
    .aa-no-selection   { color: var(--muted); font-style: italic; }

    .aa-action-buttons { display: flex; gap: 12px; }

    .aa-btn-cancel {
      padding: 13px 28px;
      background: var(--white); border: 1.5px solid var(--border);
      border-radius: 14px; font-size: 15px; font-weight: 600;
      color: var(--muted); cursor: pointer;
      font-family: 'Sora', sans-serif; transition: all 0.2s;
    }
    .aa-btn-cancel:hover { border-color: var(--navy); color: var(--navy); }

    .aa-btn-add {
      padding: 13px 32px;
      background: var(--navy); border: none;
      border-radius: 14px; font-size: 15px; font-weight: 700;
      color: white; cursor: pointer;
      font-family: 'Sora', sans-serif; transition: all 0.3s;
      display: flex; align-items: center; gap: 10px;
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .aa-btn-add:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,32,96,0.25);
    }
    .aa-btn-add:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .aa-btn-spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white; border-radius: 50%;
      animation: spin 0.8s linear infinite; display: inline-block;
    }

    @media (max-width: 768px) {
      .aa-hero    { padding: 40px 24px; }
      .aa-content { padding: 24px 20px 160px; }
      .aa-stats-row { flex-direction: column; }
      .aa-user-grid { grid-template-columns: 1fr; }
      .aa-action-bar { padding: 0 16px 20px; }
      .aa-action-bar-inner { flex-direction: column; }
      .aa-action-buttons { width: 100%; }
      .aa-btn-cancel, .aa-btn-add { flex: 1; justify-content: center; }
    }
  `;

  return (
    <div className="aa-page">
      <style>{sharedCSS}</style>

      {/* Hero */}
      <div className="aa-hero">
        <div className="aa-hero-inner">
          <div className="aa-hero-eyebrow">
            <div className="aa-hero-eyebrow-line" />
            Admin Management
          </div>
          <h1>Add <em>Admin User</em></h1>
          <p className="aa-hero-sub">Grant administrator access by adding users to the Helpdesk_Admin group</p>
        </div>
      </div>

      {/* Content */}
      <div className="aa-content">
        <button className="aa-back-btn" onClick={() => navigate('/settings')}>
          ← Back to Settings
        </button>

        {/* Stats */}
        <div className="aa-stats-row">
          <div className="aa-stat-card">
            <div className="aa-stat-icon">🔍</div>
            <div className="aa-stat-content">
              <div className="aa-stat-value">{searchResults.length}</div>
              <div className="aa-stat-label">Search Results</div>
            </div>
          </div>
          <div className="aa-stat-card">
            <div className="aa-stat-icon">👤</div>
            <div className="aa-stat-content">
              <div className="aa-stat-value">{selectedUsers.length}</div>
              <div className="aa-stat-label">Selected Users</div>
            </div>
          </div>
        </div>

        {/* Search Card */}
        <div className="aa-search-card">
          <div className="aa-search-title">
            <span>🔍</span> Find User
          </div>
          <div className="aa-search-desc">
            Type 2 or more characters — results appear automatically. Select multiple users before adding.
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

            {searching && <div className="aa-searching">Searching…</div>}

            {/* Results dropdown — floats over everything */}
            {showDropdown && searchResults.length > 0 && (
              <div ref={dropdownRef} className="aa-dropdown">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="aa-dropdown-item"
                    onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                    onClick={() => selectUser(result)}
                    style={{ opacity: selectedUsers.find(u => u.id === result.id) ? 0.6 : 1 }}
                  >
                    <div className="aa-dropdown-avatar">
                      {result.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="aa-dropdown-content">
                      <div className="aa-dropdown-name">
                        {result.displayName}
                        {selectedUsers.find(u => u.id === result.id) && (
                          <span className="aa-selected-badge">Selected</span>
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
              <div ref={dropdownRef} className="aa-dropdown">
                <div className="aa-dropdown-empty">No users found for "{searchQuery}"</div>
              </div>
            )}
          </div>
        </div>

        {/* Selected Users */}
        {selectedUsers.length > 0 && (
          <div className="aa-results-card">
            <div className="aa-results-header">
              <span className="aa-results-title">👤 Selected Users</span>
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
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="aa-user-check">
                    <circle cx="9" cy="9" r="8" fill="#10b981" opacity="0.2"/>
                    <path d="M5 9l3 3 5-5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <button onClick={() => removeUser(u.id)} className="aa-remove-btn" title="Remove">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {addMessage && (
          <div className="aa-success-message">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" fill="#10b981" opacity="0.3"/>
              <path d="M5 10l3 3 5-5" stroke="#065f46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {addMessage}
          </div>
        )}
        {addError && (
          <div className="aa-error-message">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" fill="#ef4444" opacity="0.3"/>
              <path d="M7 7l6 6M13 7l-6 6" stroke="#991b1b" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {addError}
          </div>
        )}
      </div>

      {/* Action Bar — fixed bottom, z-index 50 (below dropdown 9999) */}
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
          <div className="aa-action-buttons">
            <button onClick={() => navigate('/settings')} className="aa-btn-cancel">
              Cancel
            </button>
            <button
              onClick={confirmAddUsers}
              disabled={addLoading || selectedUsers.length === 0}
              className="aa-btn-add"
            >
              {addLoading ? (
                <><span className="aa-btn-spinner" />Adding…</>
              ) : (
                `Add ${selectedUsers.length > 1 ? `${selectedUsers.length} Users` : 'as Admin'}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}