import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';

/* ─────────────────────────────────────────────────────────────────────
   CATALOG OF SERVICES  — add / edit entries here freely
   Each entry: { id, label, category, keywords[] }
   When clicked → navigate to /create-request?service=<id>
──────────────────────────────────────────────────────────────────────*/
const SERVICE_CATALOG = [
  { id: 'password-reset',       label: 'Password Reset',              category: 'Account',  keywords: ['password', 'reset', 'forgot', 'locked', 'unlock', 'credentials'] },
  { id: 'new-account',          label: 'New User Account',            category: 'Account',  keywords: ['new account', 'create user', 'onboarding', 'new employee', 'access'] },
  { id: 'software-install',     label: 'Software Installation',       category: 'Software', keywords: ['install', 'software', 'application', 'app', 'license'] },
  { id: 'hardware-request',     label: 'Hardware Request',            category: 'Hardware', keywords: ['laptop', 'desktop', 'monitor', 'keyboard', 'mouse', 'hardware', 'equipment'] },
  { id: 'vpn-access',           label: 'VPN Access',                  category: 'Network',  keywords: ['vpn', 'remote', 'access', 'connect'] },
  { id: 'email-issue',          label: 'Email / Outlook Issue',       category: 'Email',    keywords: ['email', 'outlook', 'mail', 'inbox', 'calendar'] },
  { id: 'printer-setup',        label: 'Printer Setup',               category: 'Hardware', keywords: ['printer', 'print', 'scanner', 'scan'] },
  { id: 'file-access',          label: 'File / Share Access',         category: 'Storage',  keywords: ['file', 'share', 'folder', 'drive', 'permission', 'onedrive', 'sharepoint'] },
  { id: 'phone-setup',          label: 'Phone / Mobile Setup',        category: 'Hardware', keywords: ['phone', 'mobile', 'iphone', 'android', 'teams phone'] },
  { id: 'it-support',           label: 'General IT Support',          category: 'Support',  keywords: ['support', 'help', 'issue', 'problem', 'not working'] },
  { id: 'mfa-setup',            label: 'MFA / Authenticator Setup',   category: 'Security', keywords: ['mfa', 'two factor', '2fa', 'authenticator', 'multi factor'] },
  { id: 'teams-issue',          label: 'Microsoft Teams Issue',       category: 'Software', keywords: ['teams', 'meeting', 'call', 'video', 'conference'] },
];

/* ─────────────────────────────────────────────────────────────────────
   FIELD MAP — adjust these to match your exact SharePoint column names.
   These are the internal names (not display names).
──────────────────────────────────────────────────────────────────────*/
const INC_FIELDS = {
  title:       'Title',           // Incident title / subject
  number:      'IncidentNumber',  // e.g. INC-0042
  status:      'Status',
  priority:    'Priority',
  description: 'Description',     // Long text description
  category:    'Category',
  assignedTo:  'AssignedTo',      // Person field (may be object)
  requester:   'Requester',       // Who raised it
};

const REQ_FIELDS = {
  title:       'Title',
  number:      'RequestNumber',   // e.g. REQ-0017
  status:      'Status',
  category:    'Category',
  description: 'Description',
  assignedTo:  'AssignedTo',
  requester:   'Requester',
  service:     'ServiceName',     // Service/type of request
};

/* ─────────────────────────────────────────────────────────────────────
   fetchTickets — searches ALL meaningful fields.
   Strategy:
     1. Try SharePoint $search (full-text, covers ALL columns at once).
     2. If that returns nothing or fails, fall back to a wide $filter
        that checks title + number + description + category + requester.
──────────────────────────────────────────────────────────────────────*/
async function fetchTickets(instance, accounts, query) {
  if (!query || query.length < 2) return { incidents: [], requests: [] };

  const SITE_URL = process.env.REACT_APP_SHAREPOINT_SITE_URL || '';
  const INC_LIST = process.env.REACT_APP_INCIDENTS_LIST_ID   || '';
  const REQ_LIST = process.env.REACT_APP_REQUESTS_LIST_ID    || '';

  if (!SITE_URL || !INC_LIST || !REQ_LIST) {
    // No env vars set — demo/dev mode, return empty gracefully
    return { incidents: [], requests: [] };
  }

  try {
    const tokenResponse = await instance.acquireTokenSilent({
      scopes: ['https://graph.microsoft.com/.default'],
      account: accounts[0],
    });
    const token   = tokenResponse.accessToken;
    const headers = {
      Authorization:    `Bearer ${token}`,
      'Content-Type':   'application/json',
      'ConsistencyLevel': 'eventual',   // needed for $search on list items
    };
    const baseUrl = `https://graph.microsoft.com/v1.0/sites/${SITE_URL}/lists`;

    // ── Helper: escape single quotes for OData $filter ──
    const esc = (s) => s.replace(/'/g, "''");
    const q   = esc(query.trim());

    /* ────────────────────────────────────────────────────────────────
       BUILD REQUESTS
       $search hits every text column (title, description, any field).
       We request all useful fields in $expand so the result is rich.
    ─────────────────────────────────────────────────────────────────*/
    const incFieldList = Object.values(INC_FIELDS).join(',');
    const reqFieldList = Object.values(REQ_FIELDS).join(',');

    // Try $search first (most thorough — searches description, comments, all text)
    const incSearchUrl = `${baseUrl}/${INC_LIST}/items?$search="${q}"&$expand=fields($select=${incFieldList})&$top=8`;
    const reqSearchUrl = `${baseUrl}/${REQ_LIST}/items?$search="${q}"&$expand=fields($select=${reqFieldList})&$top=8`;

    const [incSearchRes, reqSearchRes] = await Promise.all([
      fetch(incSearchUrl, { headers }),
      fetch(reqSearchUrl, { headers }),
    ]);

    let incItems = [];
    let reqItems = [];

    if (incSearchRes.ok) {
      const d = await incSearchRes.json();
      incItems = d.value || [];
    }
    if (reqSearchRes.ok) {
      const d = await reqSearchRes.json();
      reqItems = d.value || [];
    }

    /* ────────────────────────────────────────────────────────────────
       FALLBACK: if $search returned nothing, use wide $filter across
       the most important text fields individually.
       OData doesn't support contains() on SP, so we use substringof
       or just startswith — but SP Online supports substringof in
       legacy REST. Via Graph we use: fields/Title ne null trick with
       a broad OR of startswith checks.
       For description we can't filter-search on Graph easily, so we
       fetch the last 50 items and filter client-side as a last resort.
    ─────────────────────────────────────────────────────────────────*/
    if (incItems.length === 0) {
      const filterInc =
        `startswith(fields/${INC_FIELDS.title},'${q}')` +
        ` or startswith(fields/${INC_FIELDS.number},'${q}')` +
        ` or startswith(fields/${INC_FIELDS.category},'${q}')` +
        ` or startswith(fields/${INC_FIELDS.priority},'${q}')`;

      const fbIncRes = await fetch(
        `${baseUrl}/${INC_LIST}/items?$expand=fields($select=${incFieldList})&$filter=${encodeURIComponent(filterInc)}&$top=8`,
        { headers }
      );
      if (fbIncRes.ok) {
        const d = await fbIncRes.json();
        incItems = d.value || [];
      }

      // Client-side fallback: fetch recent 100 and text-search locally
      if (incItems.length === 0) {
        const allRes = await fetch(
          `${baseUrl}/${INC_LIST}/items?$expand=fields($select=${incFieldList})&$top=100&$orderby=createdDateTime desc`,
          { headers }
        );
        if (allRes.ok) {
          const d  = await allRes.json();
          const ql = query.toLowerCase();
          incItems = (d.value || []).filter(item => {
            const f = item.fields || {};
            return (
              (f[INC_FIELDS.title]       || '').toLowerCase().includes(ql) ||
              (f[INC_FIELDS.number]      || '').toLowerCase().includes(ql) ||
              (f[INC_FIELDS.description] || '').toLowerCase().includes(ql) ||
              (f[INC_FIELDS.category]    || '').toLowerCase().includes(ql) ||
              (f[INC_FIELDS.priority]    || '').toLowerCase().includes(ql) ||
              (f[INC_FIELDS.requester]   || '').toLowerCase().includes(ql) ||
              // AssignedTo may be an object with displayName
              (typeof f[INC_FIELDS.assignedTo] === 'string'
                ? f[INC_FIELDS.assignedTo]
                : f[INC_FIELDS.assignedTo]?.displayName || ''
              ).toLowerCase().includes(ql)
            );
          }).slice(0, 8);
        }
      }
    }

    if (reqItems.length === 0) {
      const filterReq =
        `startswith(fields/${REQ_FIELDS.title},'${q}')` +
        ` or startswith(fields/${REQ_FIELDS.number},'${q}')` +
        ` or startswith(fields/${REQ_FIELDS.category},'${q}')` +
        ` or startswith(fields/${REQ_FIELDS.service},'${q}')`;

      const fbReqRes = await fetch(
        `${baseUrl}/${REQ_LIST}/items?$expand=fields($select=${reqFieldList})&$filter=${encodeURIComponent(filterReq)}&$top=8`,
        { headers }
      );
      if (fbReqRes.ok) {
        const d = await fbReqRes.json();
        reqItems = d.value || [];
      }

      if (reqItems.length === 0) {
        const allRes = await fetch(
          `${baseUrl}/${REQ_LIST}/items?$expand=fields($select=${reqFieldList})&$top=100&$orderby=createdDateTime desc`,
          { headers }
        );
        if (allRes.ok) {
          const d  = await allRes.json();
          const ql = query.toLowerCase();
          reqItems = (d.value || []).filter(item => {
            const f = item.fields || {};
            return (
              (f[REQ_FIELDS.title]       || '').toLowerCase().includes(ql) ||
              (f[REQ_FIELDS.number]      || '').toLowerCase().includes(ql) ||
              (f[REQ_FIELDS.description] || '').toLowerCase().includes(ql) ||
              (f[REQ_FIELDS.category]    || '').toLowerCase().includes(ql) ||
              (f[REQ_FIELDS.service]     || '').toLowerCase().includes(ql) ||
              (f[REQ_FIELDS.requester]   || '').toLowerCase().includes(ql) ||
              (typeof f[REQ_FIELDS.assignedTo] === 'string'
                ? f[REQ_FIELDS.assignedTo]
                : f[REQ_FIELDS.assignedTo]?.displayName || ''
              ).toLowerCase().includes(ql)
            );
          }).slice(0, 8);
        }
      }
    }

    /* ── Normalise results into clean objects ── */
    const incidents = incItems.map(i => {
      const f = i.fields || {};
      return {
        id:          i.id,
        title:       f[INC_FIELDS.title]       || 'Untitled',
        number:      f[INC_FIELDS.number]       || `INC-${i.id}`,
        status:      f[INC_FIELDS.status]       || 'Open',
        priority:    f[INC_FIELDS.priority]     || '',
        category:    f[INC_FIELDS.category]     || '',
        description: f[INC_FIELDS.description]  || '',
      };
    });

    const requests = reqItems.map(r => {
      const f = r.fields || {};
      return {
        id:          r.id,
        title:       f[REQ_FIELDS.title]        || 'Untitled',
        number:      f[REQ_FIELDS.number]        || `REQ-${r.id}`,
        status:      f[REQ_FIELDS.status]        || 'Open',
        category:    f[REQ_FIELDS.category]      || f[REQ_FIELDS.service] || '',
        description: f[REQ_FIELDS.description]   || '',
      };
    });

    return { incidents, requests };

  } catch (err) {
    console.warn('SmartSearch fetchTickets error:', err);
    return { incidents: [], requests: [] };
  }
}

/* ─────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
──────────────────────────────────────────────────────────────────────*/
export default function SmartSearch() {
  const navigate             = useNavigate();
  const { instance, accounts } = useMsal();

  const [query,    setQuery]    = useState('');
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [results,  setResults]  = useState({ incidents: [], requests: [], services: [] });
  const [cursor,   setCursor]   = useState(-1);   // keyboard nav index

  const inputRef    = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  /* ── Match services locally ── */
  const matchServices = useCallback((q) => {
    if (!q || q.length < 2) return [];
    const lower = q.toLowerCase();
    return SERVICE_CATALOG.filter(s =>
      s.label.toLowerCase().includes(lower) ||
      s.keywords.some(k => k.includes(lower))
    ).slice(0, 4);
  }, []);

  /* ── Debounced search ── */
  useEffect(() => {
    if (!query.trim()) {
      setResults({ incidents: [], requests: [], services: [] });
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setOpen(true);
      const [ticketData] = await Promise.all([
        fetchTickets(instance, accounts, query.trim()),
      ]);
      setResults({
        incidents: ticketData.incidents,
        requests:  ticketData.requests,
        services:  matchServices(query),
      });
      setCursor(-1);
      setLoading(false);
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [query, instance, accounts, matchServices]);

  /* ── Close on outside click ── */
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current    && !inputRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Keyboard shortcut: ⌘/Ctrl+K ── */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /* ── Build flat list for keyboard nav ── */
  const allItems = [
    ...results.incidents.map(i => ({ type: 'incident', data: i })),
    ...results.requests.map(r  => ({ type: 'request',  data: r })),
    ...results.services.map(s  => ({ type: 'service',  data: s })),
  ];

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, allItems.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, -1)); }
    if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault();
      handleSelect(allItems[cursor]);
    }
  };

  const handleSelect = (item) => {
    setOpen(false);
    setQuery('');
    if (item.type === 'incident') navigate(`/incidents/${item.data.id}`);
    if (item.type === 'request')  navigate(`/requests/${item.data.id}`);
    if (item.type === 'service')  navigate(`/create-request?service=${item.data.id}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const hasResults =
    results.incidents.length > 0 ||
    results.requests.length  > 0 ||
    results.services.length  > 0;

  let flatIndex = 0; // rolling index for cursor highlight

  return (
    <>
      <style>{`
        .ss-wrap {
          width: 100%;
          position: relative;
        }
        .ss-form { width: 100%; }

        .ss-input-box {
          display: flex;
          align-items: center;
          background: #f5f7fb;
          border-radius: 12px;
          border: 1.5px solid #e9edf2;
          transition: all 0.2s ease;
          padding: 0 14px;
          height: 44px;
          gap: 10px;
        }
        .ss-input-box:focus-within {
          background: #ffffff;
          border-color: #e98404;
          box-shadow: 0 0 0 3px rgba(233,132,4,0.12);
        }
        .ss-icon { color: #9ca3af; display: flex; align-items: center; flex-shrink: 0; }
        .ss-icon-spin { animation: ss-spin 0.7s linear infinite; }
        @keyframes ss-spin { to { transform: rotate(360deg); } }

        .ss-input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          color: #1f2937;
          outline: none;
          min-width: 0;
        }
        .ss-input::placeholder { color: #9ca3af; }

        .ss-kbd {
          font-size: 11px;
          color: #b0b8c4;
          background: #eef1f6;
          padding: 3px 7px;
          border-radius: 6px;
          font-family: monospace;
          flex-shrink: 0;
          letter-spacing: 0.02em;
        }

        /* ── DROPDOWN ── */
        .ss-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 16px 40px -8px rgba(0,0,0,0.15), 0 4px 12px -4px rgba(0,0,0,0.06);
          border: 1px solid #edf1f6;
          z-index: 9999;
          overflow: hidden;
          animation: ss-drop 0.18s cubic-bezier(0.34,1.1,0.64,1);
        }
        @keyframes ss-drop {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }

        .ss-section { padding: 8px 0 4px; }
        .ss-section + .ss-section { border-top: 1px solid #f3f4f6; }

        .ss-section-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #94a3b8;
          padding: 4px 16px 6px;
        }

        .ss-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 16px;
          cursor: pointer;
          transition: background 0.1s;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          font-family: 'DM Sans', sans-serif;
        }
        .ss-item:hover,
        .ss-item.ss-cursor {
          background: #f8f9fb;
        }
        .ss-item.ss-cursor .ss-item-icon { opacity: 1; }

        .ss-item-icon {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 16px;
        }

        .ss-item-body { flex: 1; min-width: 0; }
        .ss-item-title {
          font-size: 13px;
          font-weight: 600;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ss-item-sub {
          font-size: 11px;
          color: #6b7280;
          margin-top: 1px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .ss-badge {
          display: inline-flex;
          align-items: center;
          padding: 1px 7px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
        }

        .ss-item-arrow {
          color: #d1d5db;
          flex-shrink: 0;
          transition: transform 0.15s, color 0.15s;
        }
        .ss-item:hover .ss-item-arrow,
        .ss-item.ss-cursor .ss-item-arrow {
          color: #e98404;
          transform: translateX(2px);
        }

        .ss-empty {
          padding: 32px 20px;
          text-align: center;
          color: #9ca3af;
          font-size: 13px;
        }
        .ss-empty-icon { font-size: 32px; display: block; margin-bottom: 8px; }

        .ss-footer {
          border-top: 1px solid #f3f4f6;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #9ca3af;
          background: #fcfdfe;
        }
        .ss-footer-hint { display: flex; gap: 10px; align-items: center; }
        .ss-footer-key {
          background: #eef1f6;
          border-radius: 5px;
          padding: 2px 6px;
          font-family: monospace;
          font-size: 10px;
          color: #6b7280;
        }

        /* status badge colors */
        .badge-open     { background: #dcfce7; color: #15803d; }
        .badge-pending  { background: #fef9c3; color: #a16207; }
        .badge-closed   { background: #f3f4f6; color: #6b7280; }
        .badge-progress { background: #dbeafe; color: #1d4ed8; }

        /* service category pill */
        .ss-cat {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 8px;
          background: rgba(0,32,96,0.07);
          color: #002060;
        }

        /* description snippet under the title */
        .ss-item-desc {
          display: block;
          font-size: 11px;
          color: #9ca3af;
          margin-top: 3px;
          line-height: 1.4;
          font-weight: 400;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
      `}</style>

      <div className="ss-wrap">
        <form className="ss-form" onSubmit={handleSubmit}>
          <div className="ss-input-box">
            <span className="ss-icon">
              {loading ? (
                <svg className="ss-icon-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              )}
            </span>
            <input
              ref={inputRef}
              type="text"
              className="ss-input"
              placeholder="Search tickets, incidents, services…"
              value={query}
              onChange={e => { setQuery(e.target.value); }}
              onFocus={() => query.trim() && setOpen(true)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            <span className="ss-kbd">⌘K</span>
          </div>
        </form>

        {open && (
          <div className="ss-dropdown" ref={dropdownRef}>

            {/* ── LOADING ── */}
            {loading && (
              <div className="ss-empty">
                <span className="ss-empty-icon">🔍</span>
                Searching…
              </div>
            )}

            {/* ── NO RESULTS ── */}
            {!loading && !hasResults && query.length >= 2 && (
              <div className="ss-empty">
                <span className="ss-empty-icon">😕</span>
                No results for <strong>"{query}"</strong>
              </div>
            )}

            {/* ── INCIDENTS ── */}
            {!loading && results.incidents.length > 0 && (
              <div className="ss-section">
                <div className="ss-section-title">Incidents</div>
                {results.incidents.map(inc => {
                  const idx = flatIndex++;
                  const statusClass =
                    inc.status === 'Open'        ? 'badge-open'    :
                    inc.status === 'In Progress' ? 'badge-progress':
                    inc.status === 'Pending'     ? 'badge-pending' : 'badge-closed';
                  const snippet = inc.description
                    ? inc.description.replace(/<[^>]+>/g, '').slice(0, 72) + (inc.description.length > 72 ? '…' : '')
                    : null;
                  return (
                    <button
                      key={inc.id}
                      className={`ss-item${cursor === idx ? ' ss-cursor' : ''}`}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => handleSelect({ type: 'incident', data: inc })}
                    >
                      <span className="ss-item-icon" style={{ background: '#fef2f2' }}>🚨</span>
                      <span className="ss-item-body">
                        <span className="ss-item-title">{inc.title}</span>
                        <span className="ss-item-sub">
                          <span>{inc.number}</span>
                          <span className={`ss-badge ${statusClass}`}>{inc.status}</span>
                          {inc.priority && <span className="ss-badge" style={{ background: '#fef3c7', color: '#92400e' }}>{inc.priority}</span>}
                          {inc.category && <span className="ss-cat">{inc.category}</span>}
                        </span>
                        {snippet && <span className="ss-item-desc">{snippet}</span>}
                      </span>
                      <svg className="ss-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── REQUESTS ── */}
            {!loading && results.requests.length > 0 && (
              <div className="ss-section">
                <div className="ss-section-title">Requests</div>
                {results.requests.map(req => {
                  const idx = flatIndex++;
                  const statusClass =
                    req.status === 'Open'        ? 'badge-open'    :
                    req.status === 'In Progress' ? 'badge-progress':
                    req.status === 'Pending'     ? 'badge-pending' : 'badge-closed';
                  const snippet = req.description
                    ? req.description.replace(/<[^>]+>/g, '').slice(0, 72) + (req.description.length > 72 ? '…' : '')
                    : null;
                  return (
                    <button
                      key={req.id}
                      className={`ss-item${cursor === idx ? ' ss-cursor' : ''}`}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => handleSelect({ type: 'request', data: req })}
                    >
                      <span className="ss-item-icon" style={{ background: '#eff6ff' }}>📋</span>
                      <span className="ss-item-body">
                        <span className="ss-item-title">{req.title}</span>
                        <span className="ss-item-sub">
                          <span>{req.number}</span>
                          <span className={`ss-badge ${statusClass}`}>{req.status}</span>
                          {req.category && <span className="ss-cat">{req.category}</span>}
                        </span>
                        {snippet && <span className="ss-item-desc">{snippet}</span>}
                      </span>
                      <svg className="ss-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── SERVICES ── */}
            {!loading && results.services.length > 0 && (
              <div className="ss-section">
                <div className="ss-section-title">Create a Request for…</div>
                {results.services.map(svc => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={svc.id}
                      className={`ss-item${cursor === idx ? ' ss-cursor' : ''}`}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => handleSelect({ type: 'service', data: svc })}
                    >
                      <span className="ss-item-icon" style={{ background: 'rgba(233,132,4,0.1)' }}>⚡</span>
                      <span className="ss-item-body">
                        <span className="ss-item-title">{svc.label}</span>
                        <span className="ss-item-sub">
                          <span>New Request</span>
                          <span className="ss-cat">{svc.category}</span>
                        </span>
                      </span>
                      <svg className="ss-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── FOOTER ── */}
            {hasResults && (
              <div className="ss-footer">
                <span className="ss-footer-hint">
                  <span className="ss-footer-key">↑↓</span> navigate
                  <span className="ss-footer-key">↵</span> select
                  <span className="ss-footer-key">Esc</span> close
                </span>
                <span>Press Enter to see all results</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}