/**
 * CategoryFormCombined.js
 * Shared utilities + reusable SubCategoryForm used by AddField.js and EditField.js.
 * No CC. Clean rewrite.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

// ─── Inject CSS once ──────────────────────────────────────────────
if (!document.getElementById('cfc-styles')) {
  const s = document.createElement('style');
  s.id = 'cfc-styles';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap');

    @keyframes cfc-in   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes cfc-spin { to{transform:rotate(360deg)} }
    @keyframes cfc-pop  { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }

    .cfc-page {
      min-height:100vh; background:#f4f4f0;
      font-family:'DM Sans',sans-serif; color:#111827;
    }

    /* DL cards */
    .cfc-dl-card {
      background:white; border:1.5px solid #e5e2da; border-radius:12px;
      padding:1rem 1.25rem; cursor:pointer;
      display:flex; align-items:center; gap:1rem;
      transition:border-color .15s, box-shadow .15s, transform .12s;
    }
    .cfc-dl-card:hover  { border-color:#002060; transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,32,96,.10); }
    .cfc-dl-card.active { border-color:#002060; background:#f0f4ff; box-shadow:0 0 0 3px rgba(0,32,96,.10); transform:none; }

    /* Subcategory accordion */
    .cfc-sub-card { background:white; border:1.5px solid #e5e2da; border-radius:12px; overflow:hidden; transition:border-color .15s,box-shadow .15s; }
    .cfc-sub-card.open { border-color:#002060; box-shadow:0 4px 16px rgba(0,32,96,.10); }
    .cfc-sub-header { display:flex; align-items:center; gap:1rem; padding:1rem 1.25rem; cursor:pointer; user-select:none; transition:background .12s; }
    .cfc-sub-card.open .cfc-sub-header, .cfc-sub-header:hover { background:#f8f9ff; }
    .cfc-sub-body { padding:1.25rem; border-top:1.5px solid #e8eaf2; animation:cfc-in .18s ease; }

    /* Toggle row */
    .cfc-toggle-row { display:flex; align-items:center; gap:.75rem; padding:.7rem 1rem; border-radius:8px; background:#f9f8f6; margin-bottom:.5rem; cursor:pointer; transition:background .12s; }
    .cfc-toggle-row:hover,.cfc-toggle-row.active { background:#f0f4ff; }

    /* Azure search dropdown */
    .cfc-dropdown {
      position:absolute; top:calc(100% + 5px); left:0; right:0;
      background:#1e2433; border:1px solid rgba(255,255,255,.12); border-radius:10px;
      z-index:9999; max-height:280px; overflow-y:auto;
      box-shadow:0 16px 40px rgba(0,0,0,.45); animation:cfc-pop .14s ease;
    }
    .cfc-dropdown-item { display:flex; align-items:center; gap:10px; padding:10px 14px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,.05); transition:background .1s; }
    .cfc-dropdown-item:last-child { border-bottom:none; }
    .cfc-dropdown-item:hover { background:rgba(99,102,241,.2); }
    .cfc-dropdown-avatar { width:34px; height:34px; border-radius:7px; flex-shrink:0; background:rgba(99,102,241,.25); border:1px solid rgba(99,102,241,.4); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:#a5b4fc; }
    .cfc-dropdown-name  { font-size:13px; font-weight:600; color:#f1f5f9; display:flex; align-items:center; gap:6px; }
    .cfc-dropdown-email { font-size:11px; color:#94a3b8; margin-top:1px; }

    /* Search input */
    .cfc-search-input { width:100%; padding:9px 13px; border-radius:8px; border:1.5px solid #e2e8f0; font-size:13px; font-family:'DM Sans',sans-serif; color:#111827; outline:none; background:white; transition:border-color .15s,box-shadow .15s; box-sizing:border-box; }
    .cfc-search-input:focus { border-color:#002060; box-shadow:0 0 0 3px rgba(0,32,96,.08); }
    .cfc-search-input::placeholder { color:#9ca3af; }

    /* Approver chip */
    .cfc-chip { display:inline-flex; align-items:center; gap:5px; padding:3px 10px 3px 8px; background:#e0e7ff; border-radius:20px; font-size:12px; font-weight:500; color:#3730a3; }
    .cfc-chip button { background:none; border:none; cursor:pointer; color:#6366f1; font-size:13px; line-height:1; padding:0; font-weight:700; }
    .cfc-chip button:hover { color:#dc2626; }

    /* Badges */
    .cfc-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:500; }
    .cfc-badge-blue   { background:#dbeafe; color:#1d4ed8; }
    .cfc-badge-purple { background:#ede9fe; color:#6d28d9; }
    .cfc-badge-green  { background:#dcfce7; color:#15803d; }

    /* Buttons */
    .cfc-btn-primary   { padding:.6rem 1.4rem; background:#002060; color:white; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:background .15s,box-shadow .15s; display:inline-flex; align-items:center; gap:6px; }
    .cfc-btn-primary:hover:not(:disabled)  { background:#003080; box-shadow:0 4px 14px rgba(0,32,96,.28); }
    .cfc-btn-primary:disabled              { background:#c5ccd8; cursor:not-allowed; }
    .cfc-btn-secondary { padding:.6rem 1.25rem; background:white; color:#374151; border:1.5px solid #d9d5cc; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:'DM Sans',sans-serif; transition:background .12s; }
    .cfc-btn-secondary:hover { background:#f9f8f6; }
    .cfc-btn-ghost     { padding:.5rem .9rem; background:transparent; color:#6b7280; border:1.5px solid #e5e2da; border-radius:8px; font-size:12px; font-weight:500; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all .12s; }
    .cfc-btn-ghost:hover { background:#f9f8f6; color:#111827; border-color:#c5bfb5; }
    .cfc-btn-danger    { padding:.5rem 1rem; background:#fef2f2; color:#dc2626; border:1.5px solid #fecaca; border-radius:8px; font-size:12px; font-weight:500; cursor:pointer; font-family:'DM Sans',sans-serif; transition:background .12s; }
    .cfc-btn-danger:hover { background:#fee2e2; }

    /* Spinner */
    .cfc-spinner { border-radius:50%; border:2.5px solid #e5e7eb; border-top-color:#002060; animation:cfc-spin .7s linear infinite; flex-shrink:0; }

    /* Step bar */
    .cfc-step-bar   { display:flex; align-items:center; padding:0 2rem; background:white; border-bottom:1.5px solid #e5e2da; }
    .cfc-step-item  { display:flex; flex-direction:column; align-items:center; gap:5px; padding:1.1rem 0; min-width:90px; }
    .cfc-step-circle{ width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; transition:all .25s; }
    .cfc-step-label { font-size:11px; font-weight:500; transition:color .25s; white-space:nowrap; }
    .cfc-step-line  { flex:1; height:2px; margin-bottom:16px; transition:background .25s; }

    /* Saving overlay */
    .cfc-overlay { position:fixed; inset:0; background:rgba(255,255,255,.75); display:flex; align-items:center; justify-content:center; z-index:9999; }
    .cfc-overlay-box { background:white; border-radius:12px; padding:1.5rem 2rem; box-shadow:0 12px 40px rgba(0,0,0,.15); display:flex; align-items:center; gap:1rem; font-size:14px; font-weight:500; color:#111827; border:1.5px solid #e5e2da; }
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
          <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <div className="cfc-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          </div>
        )}
      </div>
      {showDrop && (
        <div ref={dropRef} className="cfc-dropdown">
          {results.length === 0 && !searching && (
            <div style={{ padding: '12px 14px', color: '#94a3b8', fontSize: 13 }}>No users found</div>
          )}
          {results.map(u => {
            const already = selected.find(s => s.id === u.id);
            return (
              <div key={u.id} className="cfc-dropdown-item" onClick={() => { onSelect(u); hook.clear(); }}>
                <div className="cfc-dropdown-avatar">{u.displayName.charAt(0).toUpperCase()}</div>
                <div>
                  <div className="cfc-dropdown-name">
                    {u.displayName}
                    {already && <span style={{ color: '#86efac', fontSize: 11 }}>✓ added</span>}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

      {/* Name */}
      <div>
        <label style={fl.label}>Name <span style={{ color: '#ef4444' }}>*</span></label>
        <input
          className="cfc-search-input"
          style={{ marginTop: 4 }}
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
          <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}>(optional)</span>
        </label>
        <textarea
          value={value.description}
          onChange={e => set({ description: e.target.value })}
          placeholder="Brief explanation of when to use this sub-category"
          rows={2}
          style={{ ...fl.textarea, marginTop: 4 }}
        />
      </div>

      {/* Attachments */}
      <ToggleBlock
        icon="📎" label="File Attachments"
        desc="Let users attach files when submitting"
        checked={value.attachments.enabled}
        onToggle={v => set({ attachments: { enabled: v, required: v ? value.attachments.required : false } })}
      >
        <RequiredRow
          checked={value.attachments.required}
          onChange={v => set({ attachments: { ...value.attachments, required: v } })}
        />
      </ToggleBlock>

      {/* On-Behalf */}
      <ToggleBlock
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
      <ToggleBlock
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.25rem' }}>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 .2rem', fontWeight: 600 }}>
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
            <div style={{ marginLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <UserSearchDropdown
                hook={approverSearch}
                selected={value.approval.otherApprovers}
                onSelect={addApprover}
                placeholder="Search approvers by name or email…"
              />
              {value.approval.otherApprovers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
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
        display: 'flex', gap: '0.6rem', justifyContent: 'flex-end',
        paddingTop: '0.75rem', borderTop: '1.5px solid #f3f4f6',
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
            ? <><div className="cfc-spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: 'white' }} /> Saving…</>
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
      borderRadius: 10,
      border: `1.5px solid ${checked ? '#c7d2fe' : '#e5e2da'}`,
      background: checked ? '#f8f9ff' : '#fafaf9',
      transition: 'all .15s',
    }}>
      <div
        className={`cfc-toggle-row${checked ? ' active' : ''}`}
        style={{ margin: 0, borderRadius: checked ? '8px 8px 0 0' : 8 }}
        onClick={() => onToggle(!checked)}
      >
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{desc}</div>
        </div>
        {/* Pill toggle */}
        <div style={{
          width: 38, height: 22, borderRadius: 11, flexShrink: 0,
          background: checked ? '#002060' : '#d1d5db',
          position: 'relative', transition: 'background .2s',
        }}>
          <div style={{
            position: 'absolute', top: 3, left: checked ? 19 : 3,
            width: 16, height: 16, borderRadius: '50%', background: 'white',
            transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }} />
        </div>
      </div>
      {checked && children && (
        <div style={{ padding: '0.1rem 1rem 0.85rem' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function RequiredRow({ checked, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      cursor: 'pointer', fontSize: 12, color: '#374151',
      userSelect: 'none', marginTop: '0.1rem',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#002060' }}
      />
      Make this <strong>required</strong>
    </label>
  );
}

function ApprovalOption({ checked, onChange, label, desc }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      cursor: 'pointer', padding: '0.55rem 0.85rem', borderRadius: 8,
      background: checked ? '#f0f4ff' : '#f9f8f6',
      border: `1.5px solid ${checked ? '#c7d2fe' : 'transparent'}`,
      transition: 'all .15s', userSelect: 'none',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#002060', flexShrink: 0 }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{desc}</div>
      </div>
    </label>
  );
}

const fl = {
  label:   { fontSize: 13, fontWeight: 600, color: '#374151', display: 'block' },
  textarea: {
    width: '100%', padding: '9px 13px',
    border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: '#111827',
    resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5,
    transition: 'border-color .15s',
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
                background: done ? '#059669' : active ? '#002060' : '#f3f4f6',
                color:      done ? 'white'   : active ? 'white'   : '#9ca3af',
                border:     `2px solid ${done ? '#059669' : active ? '#002060' : '#e5e7eb'}`,
              }}>
                {done
                  ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5L5 9.5L11 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : step.id
                }
              </div>
              <span className="cfc-step-label" style={{ color: done ? '#059669' : active ? '#002060' : '#9ca3af' }}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="cfc-step-line" style={{ background: done ? '#059669' : '#e5e7eb' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function PageHeader({ onBack, backLabel = 'Back', title, subtitle }) {
  return (
    <div style={{ background: 'white', borderBottom: '1.5px solid #d9d5cc', padding: '1.1rem 2rem' }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6b7280', fontFamily: "'DM Sans',sans-serif", padding: 0, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← {backLabel}
        </button>
      )}
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 0.2rem', letterSpacing: '-0.02em' }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{subtitle}</p>}
    </div>
  );
}

export function AlertBanner({ type = 'success', message, onDismiss }) {
  if (!message) return null;
  const t = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534', icon: '✓' },
    error:   { bg: '#fef2f2', border: '#fecaca', color: '#991b1b', icon: '✕' },
  }[type];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.65rem',
      padding: '0.7rem 1rem', background: t.bg,
      border: `1.5px solid ${t.border}`, borderRadius: 8,
      color: t.color, fontSize: 13, fontWeight: 500, marginBottom: '1.25rem',
    }}>
      <span style={{ fontWeight: 700 }}>{t.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.color, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
      )}
    </div>
  );
}

export function SavingOverlay({ text = 'Saving…' }) {
  return (
    <div className="cfc-overlay">
      <div className="cfc-overlay-box">
        <div className="cfc-spinner" style={{ width: 20, height: 20 }} />
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
      {badges.length > 0 ? badges : <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>No optional features</span>}
    </div>
  );
}