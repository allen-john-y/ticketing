/**
 * AddField.js — "Add Request" page
 * Step 1: Select a DL group
 * Step 2: Build sub-categories with name/desc/attachments/on-behalf/approval
 * Publishes to POST /api/categories
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import {
  useAzureToken,
  useUserSearch,
  SubCategoryForm,
  SubCategoryBadges,
  defaultSubCategory,
  formSubToDb,
  StepBar,
  PageHeader,
  AlertBanner,
  SavingOverlay,
} from './CategoryFormCombined';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const STEPS = [
  { id: 1, label: 'Select DL' },
  { id: 2, label: 'Sub-Categories' },
];

// ─── Unique frontend ID ───────────────────────────────────────────
const uid = () => `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ═══════════════════════════════════════════════════════════════════
export default function AddField() {
  const navigate    = useNavigate();
  const { accounts } = useMsal();
  const acquireToken = useAzureToken();

  const [step, setStep]             = useState(1);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(null);

  // ── Step 1: DL selection ────────────────────────────────────────
  const [allDLs, setAllDLs]         = useState([]);
  const [dlLoading, setDlLoading]   = useState(false);
  const [selectedDL, setSelectedDL] = useState(null);
  const [dlMembers, setDlMembers]   = useState([]);
  const [dlOwners, setDlOwners]     = useState([]);
  const dlSearch = useUserSearch(acquireToken); // re-using hook, but for DL name search
  const [dlSearchQuery, setDlSearchQuery] = useState('');
  const dlSearchTimer = useRef(null);

  // ── Step 2: Sub-categories ──────────────────────────────────────
  // Each: { fid, data: SubCategoryForm value, open: bool, saved: bool }
  const [subCards, setSubCards] = useState([]);

  // ── Load all DL groups on mount ─────────────────────────────────
const loadDLs = useCallback(async () => {
  setDlLoading(true);
  setError(null);

  try {
    const token = await acquireToken();

    const query = new URLSearchParams({
      $filter: "mailEnabled eq true and securityEnabled eq false",
      $select: "id,displayName,mail,mailNickname,description,groupTypes",
      $top: "200"
    });

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph error ${res.status}: ${text}`);
    }

    const { value = [] } = await res.json();

    // ✅ Safe DL filtering
    const dls = value.filter(
      g => !g.groupTypes || g.groupTypes.length === 0
    );

    setAllDLs(dls);
  } catch (e) {
    setError(`Could not load distribution lists. ${e.message}`);
  } finally {
    setDlLoading(false);
  }
}, [acquireToken]);

  useEffect(() => { loadDLs(); }, [loadDLs]);

  // ── DL search filter ────────────────────────────────────────────
  const filteredDLs = dlSearchQuery.trim().length < 1
    ? allDLs
    : allDLs.filter(d =>
        d.displayName?.toLowerCase().includes(dlSearchQuery.toLowerCase()) ||
        d.mail?.toLowerCase().includes(dlSearchQuery.toLowerCase())
      );

  // ── Select a DL, fetch its members ─────────────────────────────
  const handleSelectDL = async (dl) => {
    if (selectedDL?.id === dl.id) return;
    setSelectedDL(dl);
    setDlMembers([]);
    setDlOwners([]);
    try {
      const token = await acquireToken();
      const [mRes, oRes] = await Promise.all([
        fetch(`https://graph.microsoft.com/v1.0/groups/${dl.id}/members?$select=id,displayName,mail,userPrincipalName`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`https://graph.microsoft.com/v1.0/groups/${dl.id}/owners?$select=id,displayName,mail,userPrincipalName`,  { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (mRes.ok) { const d = await mRes.json(); setDlMembers(d.value || []); }
      if (oRes.ok) { const d = await oRes.json(); setDlOwners(d.value  || []); }
    } catch (e) {
      console.warn('Could not load DL members:', e.message);
    }
  };

  // ── Step 2 helpers ──────────────────────────────────────────────
  const addSubCard = () => {
    const fid = uid();
    setSubCards(prev => [
      ...prev,
      { fid, data: defaultSubCategory(), open: true, saved: false },
    ]);
  };

  const updateCard = (fid, patch) => {
    setSubCards(prev => prev.map(c => c.fid === fid ? { ...c, ...patch } : c));
  };

  const removeCard = (fid) => {
    setSubCards(prev => prev.filter(c => c.fid !== fid));
  };

  const toggleCard = (fid) => {
    setSubCards(prev => prev.map(c => c.fid === fid ? { ...c, open: !c.open } : c));
  };

  // Mark a card as "confirmed" and collapse it
  const confirmCard = (fid) => {
    updateCard(fid, { open: false, saved: true });
  };

  // ── Publish ─────────────────────────────────────────────────────
  const canPublish = selectedDL && subCards.length > 0 && subCards.every(c => c.saved);

  const publish = async () => {
    setError(null);
    setSaving(true);
    try {
      const createdBy = {
        id:   accounts?.[0]?.homeAccountId || accounts?.[0]?.localAccountId || '',
        name: accounts?.[0]?.name          || accounts?.[0]?.username || '',
        mail: accounts?.[0]?.username      || '',
      };

      const payload = {
        name:             selectedDL.displayName,
        categoryName:     selectedDL.displayName,
        distributionList: {
          id:           selectedDL.id,
          name:         selectedDL.displayName,
          mail:         selectedDL.mail         || '',
          mailNickname: selectedDL.mailNickname || '',
        },
        subCategories: subCards.map(c => formSubToDb(c.data)),
        dlGroupMembers: dlMembers.map(m => ({ id: m.id, email: m.mail || m.userPrincipalName, displayName: m.displayName })),
        dlGroupOwners:  dlOwners.map(o  => ({ id: o.id, email: o.mail || o.userPrincipalName, displayName: o.displayName })),
        createdBy,
      };

      const res = await fetch(`${BACKEND}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Save failed (${res.status})`);
      }

      setSuccess('Category created successfully!');
      setTimeout(() => navigate('/settings'), 1600);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="cfc-page">
      {saving && <SavingOverlay />}

      <PageHeader
        onBack={() => navigate('/settings')}
        backLabel="Settings"
        title="Add Request"
        subtitle="Configure a new ticket category for your helpdesk"
      />

      {/* Step bar */}
      <StepBar steps={STEPS} current={step} />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>
        <AlertBanner type="error"   message={error}   onDismiss={() => setError(null)} />
        <AlertBanner type="success" message={success} />

        {/* ─────────────────────────────────────────────────────── */}
        {/* STEP 1 — DL Selection                                   */}
        {/* ─────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ animation: 'cfc-in .2s ease' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={sh.title}>Which distribution list is this for?</h2>
              <p  style={sh.sub}>Select the DL group that will receive tickets in this category.</p>
            </div>

            {/* Search */}
            <div style={{ marginBottom: '1.25rem' }}>
              <input
                className="cfc-search-input"
                value={dlSearchQuery}
                onChange={e => setDlSearchQuery(e.target.value)}
                placeholder="🔍  Search by name or email…"
                style={{ maxWidth: 420 }}
              />
            </div>

            {dlLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 13, padding: '1rem 0' }}>
                <div className="cfc-spinner" style={{ width: 18, height: 18 }} />
                Loading distribution lists…
              </div>
            )}

            {!dlLoading && filteredDLs.length === 0 && (
              <div style={sh.empty}>No distribution lists found{dlSearchQuery ? ` for "${dlSearchQuery}"` : ''}.</div>
            )}

            {/* DL cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
              {filteredDLs.map(dl => (
                <div
                  key={dl.id}
                  className={`cfc-dl-card${selectedDL?.id === dl.id ? ' active' : ''}`}
                  onClick={() => handleSelectDL(dl)}
                >
                  <div style={sh.dlIcon}>👥</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {dl.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: "'DM Mono',monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {dl.mail || '—'}
                    </div>
                  </div>
                  {selectedDL?.id === dl.id && (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#002060', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M1.5 5.5L4 8L9.5 2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Selected DL info */}
            {selectedDL && (
              <div style={sh.selectedInfo}>
                <span style={{ fontWeight: 600, color: '#002060' }}>Selected:</span> {selectedDL.displayName}
                <span style={{ color: '#9ca3af', marginLeft: 8, fontSize: 12 }}>{dlMembers.length} members · {dlOwners.length} owners</span>
              </div>
            )}

            {/* Continue */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                className="cfc-btn-primary"
                onClick={() => setStep(2)}
                disabled={!selectedDL}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────── */}
        {/* STEP 2 — Sub-Categories                                 */}
        {/* ─────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ animation: 'cfc-in .2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={sh.title}>Sub-Categories</h2>
                <p  style={sh.sub}>
                  Adding sub-categories for <strong style={{ color: '#002060' }}>{selectedDL?.displayName}</strong>
                </p>
              </div>
              <button className="cfc-btn-primary" onClick={addSubCard}>
                + Add Sub-Category
              </button>
            </div>

            {subCards.length === 0 && (
              <div style={sh.emptyBox}>
                <div style={{ fontSize: 36, marginBottom: '0.75rem' }}>📂</div>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 14, fontWeight: 500 }}>No sub-categories yet</p>
                <p style={{ margin: '0.3rem 0 0', color: '#9ca3af', fontSize: 13 }}>Click "Add Sub-Category" to get started</p>
              </div>
            )}

            {/* Sub-category accordion cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {subCards.map((card, idx) => (
                <div key={card.fid} className={`cfc-sub-card${card.open ? ' open' : ''}`}>
                  {/* Header */}
                  <div className="cfc-sub-header" onClick={() => toggleCard(card.fid)}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: card.saved ? '#dcfce7' : '#f0f4ff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                      color: card.saved ? '#15803d' : '#002060',
                    }}>
                      {card.saved ? '✓' : idx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                        {card.data.name.trim() || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Untitled sub-category</span>}
                      </div>
                      {!card.open && <SubCategoryBadges sub={card.data} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        className="cfc-btn-danger"
                        style={{ padding: '3px 10px', fontSize: 11 }}
                        onClick={e => { e.stopPropagation(); removeCard(card.fid); }}
                      >
                        Remove
                      </button>
                      <span style={{ color: '#9ca3af', fontSize: 14, transition: 'transform .2s', transform: card.open ? 'rotate(180deg)' : 'none' }}>▼</span>
                    </div>
                  </div>

                  {/* Body */}
                  {card.open && (
                    <div className="cfc-sub-body">
                      <SubCategoryForm
                        value={card.data}
                        onChange={data => updateCard(card.fid, { data, saved: false })}
                        dlMemberCount={dlMembers.length}
                        acquireToken={acquireToken}
                        onSave={() => {
                          if (!card.data.name.trim()) return;
                          confirmCard(card.fid);
                        }}
                        onCancel={card.saved ? () => toggleCard(card.fid) : undefined}
                        saveLabel="Confirm ✓"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pending notice */}
            {subCards.some(c => !c.saved) && subCards.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 12, color: '#a16207', background: '#fefce8', border: '1.5px solid #fde047', borderRadius: 8, padding: '0.6rem 0.9rem', marginBottom: '1rem' }}>
                ⚠️ Please confirm all sub-categories before publishing.
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.25rem', borderTop: '1.5px solid #e5e2da' }}>
              <button className="cfc-btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button
                className="cfc-btn-primary"
                onClick={publish}
                disabled={!canPublish || saving}
                style={{ background: '#059669' }}
              >
                {saving ? 'Publishing…' : '✅ Publish Category'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Local style tokens ───────────────────────────────────────────
const sh = {
  title: { fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 0.25rem', letterSpacing: '-0.01em' },
  sub:   { fontSize: 13, color: '#6b7280', margin: 0 },
  empty: { fontSize: 13, color: '#9ca3af', padding: '1.5rem 0' },
  emptyBox: {
    padding: '3rem 1rem', textAlign: 'center',
    background: 'white', borderRadius: 12,
    border: '2px dashed #e2e8f0',
  },
  selectedInfo: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '0.55rem 1rem', background: '#f0f4ff',
    border: '1.5px solid #c7d2fe', borderRadius: 8,
    fontSize: 13, color: '#111827',
  },
  dlIcon: {
    width: 38, height: 38, borderRadius: 9, background: '#dbeafe',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, flexShrink: 0,
  },
};