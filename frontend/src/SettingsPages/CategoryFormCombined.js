/**
 * CategoryFormCombined.js - Redesigned to match Home.js styling
 * Shared utilities + reusable SubCategoryForm used by AddField.js and EditField.js.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

// ─── Inject CSS once ──────────────────────────────────────────────
if (!document.getElementById('cfc-styles')) {
  const s = document.createElement('style');
  s.id = 'cfc-styles';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --orange2: #f5a623;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
    }

    @keyframes cfc-in   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes cfc-spin { to{transform:rotate(360deg)} }
    @keyframes cfc-pop  { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }

    .cfc-page {
      min-height:100vh; background:var(--bg);
      font-family:'Lato',sans-serif; color:var(--text);
    }

    /* ===== Modal ===== */
    .cfc-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }

    .cfc-modal-box {
      width: 480px;
      max-width: 92%;
      background: var(--white);
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 25px 60px rgba(0,32,96,0.15);
      animation: cfc-pop 0.25s ease;
      border: 1.5px solid var(--border);
    }

    /* DL cards */
    .cfc-dl-card {
      background:var(--white); border:1.5px solid var(--border); border-radius:14px;
      padding:16px 20px; cursor:pointer;
      display:flex; align-items:center; gap:16px;
      transition:border-color .15s, box-shadow .15s, transform .12s;
    }
    .cfc-dl-card:hover  { border-color:var(--navy); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,32,96,.10); }
    .cfc-dl-card.active { border-color:var(--navy); background:rgba(0,32,96,.04); box-shadow:0 0 0 3px rgba(0,32,96,.08); transform:none; }

    /* Subcategory accordion */
    .cfc-sub-card { background:var(--white); border:1.5px solid var(--border); border-radius:14px; overflow:hidden; transition:border-color .15s,box-shadow .15s; }
    .cfc-sub-card.open { border-color:var(--navy); box-shadow:0 4px 16px rgba(0,32,96,.08); }
    .cfc-sub-header { display:flex; align-items:center; gap:16px; padding:16px 20px; cursor:pointer; user-select:none; transition:background .12s; }
    .cfc-sub-card.open .cfc-sub-header, .cfc-sub-header:hover { background:var(--light); }
    .cfc-sub-body { padding:20px; border-top:1.5px solid var(--border); animation:cfc-in .18s ease; }

    /* Toggle row */
    .cfc-toggle-row { display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:10px; background:var(--bg); margin-bottom:8px; cursor:pointer; transition:background .12s; }
    .cfc-toggle-row:hover,.cfc-toggle-row.active { background:rgba(0,32,96,.04); }

    /* Azure search dropdown */
    .cfc-dropdown {
      position:absolute; top:calc(100% + 5px); left:0; right:0;
      background:var(--white); border:1.5px solid var(--border);
      border-radius:14px; z-index:9999; max-height:280px; overflow-y:auto;
      box-shadow:0 12px 40px rgba(0,32,96,.15); animation:cfc-pop .14s ease;
    }
    .cfc-dropdown-item { display:flex; align-items:center; gap:12px; padding:12px 16px; cursor:pointer; border-bottom:1px solid var(--border); transition:background .1s; }
    .cfc-dropdown-item:last-child { border-bottom:none; }
    .cfc-dropdown-item:hover { background:var(--bg); }
    .cfc-dropdown-avatar { width:36px; height:36px; border-radius:10px; flex-shrink:0; background:var(--navy); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:white; }
    .cfc-dropdown-name  { font-size:14px; font-weight:600; color:var(--text); display:flex; align-items:center; gap:8px; }
    .cfc-dropdown-email { font-size:12px; color:var(--muted); margin-top:2px; }

    /* Search input */
    .cfc-search-input { width:100%; padding:12px 16px; border-radius:12px; border:1.5px solid var(--border); font-size:14px; font-family:'Lato',sans-serif; color:var(--text); outline:none; background:var(--white); transition:border-color .15s,box-shadow .15s; box-sizing:border-box; }
    .cfc-search-input:focus { border-color:var(--navy); box-shadow:0 0 0 4px rgba(0,32,96,.08); }
    .cfc-search-input::placeholder { color:var(--muted); }

    /* Textarea - FIXED */
    .cfc-textarea {
      width: 100%;
      padding: 12px 16px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      color: var(--text);
      resize: vertical;
      outline: none;
      box-sizing: border-box;
      line-height: 1.6;
      min-height: 80px;
      background: var(--white);
      transition: border-color .15s, box-shadow .15s;
    }
    .cfc-textarea:focus {
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0, 32, 96, 0.08);
    }
    .cfc-textarea::placeholder {
      color: var(--muted);
    }

    /* Approver chip */
    .cfc-chip { display:inline-flex; align-items:center; gap:6px; padding:5px 14px 5px 12px; background:rgba(0,32,96,.08); border-radius:20px; font-size:12px; font-weight:500; color:var(--navy); border:1.5px solid var(--border); }
    .cfc-chip button { background:none; border:none; cursor:pointer; color:var(--muted); font-size:14px; line-height:1; padding:0; font-weight:700; }
    .cfc-chip button:hover { color:#ef4444; }

    /* Badges */
    .cfc-badge { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; }
    .cfc-badge-blue   { background:#dbeafe; color:#1e40af; }
    .cfc-badge-purple { background:#f3e8ff; color:#6b21a8; }
    .cfc-badge-green  { background:#d1fae5; color:#065f46; }

    /* Buttons */
    .cfc-btn-primary   { padding:12px 24px; background:var(--navy); color:white; border:none; border-radius:12px; font-size:14px; font-weight:700; cursor:pointer; font-family:'Sora',sans-serif; transition:background .15s,box-shadow .15s,transform .15s; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 12px rgba(0,32,96,.2); }
    .cfc-btn-primary:hover:not(:disabled)  { background:var(--navy2); transform:translateY(-2px); box-shadow:0 8px 20px rgba(0,32,96,.25); }
    .cfc-btn-primary:disabled              { background:#cbd5e1; cursor:not-allowed; box-shadow:none; transform:none; }
    .cfc-btn-secondary { padding:12px 24px; background:var(--white); color:var(--muted); border:1.5px solid var(--border); border-radius:12px; font-size:14px; font-weight:600; cursor:pointer; font-family:'Sora',sans-serif; transition:all .12s; }
    .cfc-btn-secondary:hover { border-color:var(--navy); color:var(--navy); }
    .cfc-btn-ghost     { padding:8px 16px; background:transparent; color:var(--muted); border:1.5px solid var(--border); border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; font-family:'Sora',sans-serif; transition:all .12s; }
    .cfc-btn-ghost:hover { border-color:var(--navy); color:var(--navy); background:var(--white); }
    .cfc-btn-danger    { padding:8px 16px; background:#fee2e2; color:#991b1b; border:1.5px solid #fecaca; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; font-family:'Sora',sans-serif; transition:all .12s; }
    .cfc-btn-danger:hover { background:#fecaca; border-color:#ef4444; }

    /* Spinner */
    .cfc-spinner { border-radius:50%; border:2.5px solid var(--border); border-top-color:var(--navy); animation:cfc-spin .7s linear infinite; flex-shrink:0; }

    /* Step bar */
    .cfc-step-bar   { display:flex; align-items:center; padding:0 32px; background:var(--white); border-bottom:1.5px solid var(--border); }
    .cfc-step-item  { display:flex; flex-direction:column; align-items:center; gap:6px; padding:16px 0; min-width:90px; }
    .cfc-step-circle{ width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; transition:all .25s; font-family:'Sora',sans-serif; }
    .cfc-step-label { font-size:12px; font-weight:600; transition:color .25s; white-space:nowrap; font-family:'Sora',sans-serif; }
    .cfc-step-line  { flex:1; height:2px; margin-bottom:16px; transition:background .25s; }

    /* Saving overlay */
    .cfc-overlay { position:fixed; inset:0; background:rgba(245,247,250,.85); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(2px); }
    .cfc-overlay-box { background:var(--white); border-radius:16px; padding:24px 32px; box-shadow:0 12px 40px rgba(0,32,96,.15); display:flex; align-items:center; gap:16px; font-size:15px; font-weight:500; color:var(--text); border:1.5px solid var(--border); font-family:'Sora',sans-serif; }
  `;
  document.head.appendChild(s);
}

// ─── Token hook ────────────────────────────────────────────────────
export function useAzureToken() {
  const { accounts, instance } = useMsal();
  return useCallback(async () => {
    if (!accounts?.[0]) throw new Error('No signed-in account');
    try {
      return (await instance.acquireTokenSilent({
        scopes: ['Group.ReadWrite.All', 'User.Read.All', 'Directory.Read.All'],
        account: accounts[0],
      })).accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        return (await instance.acquireTokenPopup({
          scopes: ['Group.ReadWrite.All', 'User.Read.All', 'Directory.Read.All'],
          account: accounts[0],
        })).accessToken;
      }
      throw err;
    }
  }, [accounts, instance]);
}

// ─── Azure user search hook ────────────────────────────────────────
export function useUserSearch(acquireToken) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const dropRef  = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = useCallback(async (text) => {
    if (!text || text.trim().length < 2) { setResults([]); setShowDrop(false); return; }
    setSearching(true); setShowDrop(true);
    try {
      const token = await acquireToken();
      const q = text.trim().replace(/'/g, "''");
      const filter = `startswith(mail,'${q}') or startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')`;
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=6`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setResults((data.value || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.mail || '?',
        mail: u.mail || u.userPrincipalName || '',
      })));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, [acquireToken]);

  const handleChange = (val) => {
    setQuery(val);
    clearTimeout(timerRef.current);
    if (val.trim().length >= 2) { timerRef.current = setTimeout(() => search(val), 280); setShowDrop(true); }
    else { setResults([]); setShowDrop(false); }
  };

  const clear = () => { setQuery(''); setResults([]); setShowDrop(false); };

  return { query, setQuery: handleChange, results, searching, showDrop, setShowDrop, dropRef, clear };
}

// ─── Reusable user search dropdown ────────────────────────────────
export function UserSearchDropdown({ hook, selected = [], onSelect, placeholder = 'Search by name or email…' }) {
  const { query, setQuery, results, searching, showDrop, dropRef } = hook;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          className="cfc-search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {searching && (
          <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
            <div className="cfc-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
          </div>
        )}
      </div>
      {showDrop && (
        <div ref={dropRef} className="cfc-dropdown">
          {results.length === 0 && !searching && (
            <div style={{ padding: '14px 16px', color: '#64748b', fontSize: 13 }}>No users found</div>
          )}
          {results.map(u => {
            const already = selected.find(s => s.id === u.id);
            return (
              <div key={u.id} className="cfc-dropdown-item" onClick={() => { onSelect(u); hook.clear(); }}>
                <div className="cfc-dropdown-avatar">{u.displayName.charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div className="cfc-dropdown-name">
                    {u.displayName}
                    {already && <span style={{ color: '#10b981', fontSize: 11, fontWeight: 600 }}>✓ Added</span>}
                  </div>
                  <div className="cfc-dropdown-email">{u.mail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Default sub-category value ────────────────────────────────────
export function defaultSubCategory(overrides = {}) {
  return {
    name: '',
    description: '',
    attachments: { enabled: false, required: false },
    onBehalf:    { enabled: false, required: false },
    approval: {
      requireApproval:  false,
      reportingManager: false,
      dlMembers:        false,
      otherMode:        false,
      otherApprovers:   [],
    },
    ...overrides,
  };
}

// ─── DB → form ─────────────────────────────────────────────────────
export function dbSubToForm(dbSub) {
  const ap = dbSub.approval || {};
  return {
    name:        dbSub.name        || '',
    description: dbSub.description || '',
    attachments: dbSub.attachments || { enabled: false, required: false },
    onBehalf:    dbSub.onBehalf    || { enabled: false, required: false },
    approval: {
      requireApproval:  ap.requireApproval  || false,
      reportingManager: ap.reportingManager || false,
      dlMembers:        ap.requireAll        || false,
      otherMode:        (ap.otherApprovers?.length > 0) || false,
      otherApprovers:   (ap.otherApprovers || []).map(a => ({ id: a.id, name: a.name, mail: a.email })),
    },
  };
}

// ─── form → DB payload ─────────────────────────────────────────────
export function formSubToDb(f) {
  return {
    name:        f.name.trim(),
    description: f.description?.trim() || '',
    attachments: f.attachments,
    onBehalf:    f.onBehalf,
    approval: {
      requireApproval:  f.approval.requireApproval,
      reportingManager: f.approval.requireApproval && f.approval.reportingManager,
      requireAll:       f.approval.requireApproval && f.approval.dlMembers,
      otherApprovers:
        f.approval.requireApproval && (f.approval.otherMode || f.approval.otherApprovers.length > 0)
          ? f.approval.otherApprovers.map(a => ({ id: a.id, email: a.mail, name: a.name }))
          : [],
    },
  };
}

// ─── SubCategoryForm (fully controlled) ───────────────────────────
export function SubCategoryForm({
  value,
  onChange,
  dlMemberCount = 0,
  acquireToken,
  onSave,
  onCancel,
  saveLabel = 'Save',
  saving = false,
}) {
  const approverSearch = useUserSearch(acquireToken);
  const set    = (patch) => onChange({ ...value, ...patch });
  const setAp  = (patch) => set({ approval: { ...value.approval, ...patch } });

  const addApprover    = (u) => { if (!value.approval.otherApprovers.find(a => a.id === u.id)) setAp({ otherApprovers: [...value.approval.otherApprovers, { id: u.id, mail: u.mail, name: u.displayName }] }); };
  const removeApprover = (id) => setAp({ otherApprovers: value.approval.otherApprovers.filter(a => a.id !== id) });

  const canSave =
    value.name.trim().length > 0 &&
    (!value.approval.requireApproval ||
      value.approval.reportingManager ||
      value.approval.dlMembers ||
      value.approval.otherApprovers.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Name */}
      <div>
        <label style={fl.label}>Name <span style={{ color: '#ef4444' }}>*</span></label>
        <input
          className="cfc-search-input"
          style={{ marginTop: 6 }}
          value={value.name}
          onChange={e => set({ name: e.target.value })}
          placeholder="e.g. Hardware Request, Software Issue"
          autoFocus
        />
      </div>

      {/* Description */}
      <div>
        <label style={fl.label}>
          Description{' '}
          <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}>(optional)</span>
        </label>
        <textarea
          className="cfc-textarea"
          value={value.description}
          onChange={e => set({ description: e.target.value })}
          placeholder="Brief explanation of when to use this sub-category"
          rows={3}
          style={{ marginTop: 6 }}
        />
      </div>

      {/* Attachments */}
      {/* <ToggleBlock
        icon="📎" label="File Attachments"
        desc="Let users attach files when submitting"
        checked={value.attachments.enabled}
        onToggle={v => set({ attachments: { enabled: v, required: v ? value.attachments.required : false } })}
      >
        <RequiredRow
          checked={value.attachments.required}
          onChange={v => set({ attachments: { ...value.attachments, required: v } })}
        />
      </ToggleBlock> */}

      {/* On-Behalf */}
      {/* <ToggleBlock
        icon="👤" label="On-Behalf Submission"
        desc="Allow submitting on behalf of another person"
        checked={value.onBehalf.enabled}
        onToggle={v => set({ onBehalf: { enabled: v, required: v ? value.onBehalf.required : false } })}
      >
        <RequiredRow
          checked={value.onBehalf.required}
          onChange={v => set({ onBehalf: { ...value.onBehalf, required: v } })}
        />
      </ToggleBlock>

      {/* Approval */}
      {/* <ToggleBlock
        icon="✅" label="Require Approval"
        desc="Ticket must be approved before processing"
        checked={value.approval.requireApproval}
        onToggle={v => set({
          approval: {
            requireApproval: v,
            reportingManager: false,
            dlMembers: false,
            otherMode: false,
            otherApprovers: [],
          },
        })}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 4px', fontWeight: 600 }}>
            Who approves? <span style={{ color: '#ef4444' }}>*</span> (pick at least one)
          </p>

          <ApprovalOption
            checked={value.approval.reportingManager}
            onChange={v => setAp({ reportingManager: v })}
            label="👔 Reporting Manager"
            desc="The submitter's direct manager"
          />

          <ApprovalOption
            checked={value.approval.dlMembers}
            onChange={v => setAp({ dlMembers: v })}
            label={`👥 DL Group Members (${dlMemberCount})`}
            desc="Any member of this distribution list"
          />

          <ApprovalOption
            checked={value.approval.otherMode || value.approval.otherApprovers.length > 0}
            onChange={v => setAp({ otherMode: v, otherApprovers: v ? value.approval.otherApprovers : [] })}
            label="🔍 Other People"
            desc="Search and add specific approvers"
          />

          {(value.approval.otherMode || value.approval.otherApprovers.length > 0) && (
            <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <UserSearchDropdown
                hook={approverSearch}
                selected={value.approval.otherApprovers}
                onSelect={addApprover}
                placeholder="Search approvers by name or email…"
              />
              {value.approval.otherApprovers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {value.approval.otherApprovers.map(a => (
                    <span key={a.id} className="cfc-chip">
                      {a.name}
                      <button onClick={() => removeApprover(a.id)}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ToggleBlock>

      {/* Action buttons */}
      <div style={{
        display: 'flex', gap: '12px', justifyContent: 'flex-end',
        paddingTop: '16px', borderTop: '1.5px solid var(--border)',
      }}>
        {onCancel && (
          <button className="cfc-btn-secondary" onClick={onCancel}>Cancel</button>
        )}
        <button
          className="cfc-btn-primary"
          onClick={onSave}
          disabled={!canSave || saving}
        >
          {saving
            ? <><div className="cfc-spinner" style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: 'white' }} /> Saving…</>
            : saveLabel
          }
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────
function ToggleBlock({ icon, label, desc, checked, onToggle, children }) {
  return (
    <div style={{
      borderRadius: 12,
      border: `1.5px solid ${checked ? '#002060' : '#e2e8f0'}`,
      background: checked ? '#f8fafc' : '#ffffff',
      transition: 'all .15s',
    }}>
      <div
        className={`cfc-toggle-row${checked ? ' active' : ''}`}
        style={{ margin: 0, borderRadius: checked ? '10px 10px 0 0' : 10 }}
        onClick={() => onToggle(!checked)}
      >
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', fontFamily: "'Sora',sans-serif" }}>{label}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{desc}</div>
        </div>
        {/* Pill toggle */}
        <div style={{
          width: 44, height: 24, borderRadius: 12, flexShrink: 0,
          background: checked ? '#002060' : '#cbd5e1',
          position: 'relative', transition: 'background .2s',
        }}>
          <div style={{
            position: 'absolute', top: 3, left: checked ? 23 : 3,
            width: 18, height: 18, borderRadius: '50%', background: 'white',
            transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }} />
        </div>
      </div>
      {checked && children && (
        <div style={{ padding: '4px 16px 16px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function RequiredRow({ checked, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      cursor: 'pointer', fontSize: 13, color: '#0f172a',
      userSelect: 'none', marginTop: '4px',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#002060' }}
      />
      Make this <strong>required</strong>
    </label>
  );
}

function ApprovalOption({ checked, onChange, label, desc }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      cursor: 'pointer', padding: '10px 14px', borderRadius: 10,
      background: checked ? 'rgba(0,32,96,.04)' : '#f8fafc',
      border: `1.5px solid ${checked ? '#002060' : '#e2e8f0'}`,
      transition: 'all .15s', userSelect: 'none',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#002060', flexShrink: 0 }}
      />
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{label}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{desc}</div>
      </div>
    </label>
  );
}

const fl = {
  label: { 
    fontSize: 13, 
    fontWeight: 700, 
    color: '#002060', 
    display: 'block',
    fontFamily: "'Sora',sans-serif",
    letterSpacing: '0.02em',
  },
};

// ─── Shared UI pieces ──────────────────────────────────────────────
export function StepBar({ steps, current }) {
  return (
    <div className="cfc-step-bar">
      {steps.map((step, i) => {
        const done   = current > step.id;
        const active = current === step.id;
        return (
          <React.Fragment key={step.id}>
            <div className="cfc-step-item">
              <div className="cfc-step-circle" style={{
                background: done ? '#10b981' : active ? '#002060' : '#f3f4f6',
                color:      done ? 'white'   : active ? 'white'   : '#9ca3af',
                border:     `2px solid ${done ? '#10b981' : active ? '#002060' : '#e2e8f0'}`,
              }}>
                {done
                  ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : step.id
                }
              </div>
              <span className="cfc-step-label" style={{ color: done ? '#10b981' : active ? '#002060' : '#9ca3af' }}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="cfc-step-line" style={{ background: done ? '#10b981' : '#e2e8f0' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function PageHeader({ onBack, backLabel = 'Back', title, subtitle }) {
  return (
    <div style={{ background: 'white', borderBottom: '1.5px solid #e2e8f0', padding: '18px 32px' }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#64748b', fontFamily: "'Sora',sans-serif", padding: 0, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
        >
          ← {backLabel}
        </button>
      )}
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#002060', margin: '0 0 4px', letterSpacing: '-0.02em', fontFamily: "'Sora',sans-serif" }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>{subtitle}</p>}
    </div>
  );
}

export function AlertBanner({ type = 'success', message, onDismiss }) {
  if (!message) return null;
  const t = {
    success: { bg: '#d1fae5', border: '#10b981', color: '#065f46', icon: '✓' },
    error:   { bg: '#fee2e2', border: '#ef4444', color: '#991b1b', icon: '✕' },
  }[type];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '14px 18px', background: t.bg,
      border: `1.5px solid ${t.border}`, borderRadius: 14,
      color: t.color, fontSize: 14, fontWeight: 500, marginBottom: '20px',
      fontFamily: "'Sora',sans-serif",
    }}>
      <span style={{ fontWeight: 700, fontSize: 16 }}>{t.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.color, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
      )}
    </div>
  );
}

export function SavingOverlay({ text = 'Saving…' }) {
  return (
    <div className="cfc-overlay">
      <div className="cfc-overlay-box">
        <div className="cfc-spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        {text}
      </div>
    </div>
  );
}

export function SubCategoryBadges({ sub }) {
  const badges = [];
  if (sub.attachments?.enabled)
    badges.push(<span key="att" className="cfc-badge cfc-badge-blue">📎 Attachments{sub.attachments.required ? ' ✱' : ''}</span>);
  if (sub.onBehalf?.enabled)
    badges.push(<span key="ob" className="cfc-badge cfc-badge-purple">👤 On-Behalf{sub.onBehalf.required ? ' ✱' : ''}</span>);
  if (sub.approval?.requireApproval) {
    const who = sub.approval.reportingManager ? 'Manager'
      : sub.approval.requireAll ? 'DL Members'
      : `Custom (${sub.approval.otherApprovers?.length || 0})`;
    badges.push(<span key="ap" className="cfc-badge cfc-badge-green">✅ {who} Approval</span>);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
      {badges.length > 0 ? badges : <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>No optional features</span>}
    </div>
  );
}