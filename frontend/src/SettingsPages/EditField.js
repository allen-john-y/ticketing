/**
 * EditField.js — "Edit Request" page
 * Shows configured DL groups from DB.
 * Click one → see its sub-categories as accordion cards.
 * Expand a card → edit inline → Save → PUT whole subCategories array.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import {
  useAzureToken,
  SubCategoryForm,
  SubCategoryBadges,
  dbSubToForm,
  formSubToDb,
  PageHeader,
  AlertBanner,
  SavingOverlay,
} from './CategoryFormCombined';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

// ═══════════════════════════════════════════════════════════════════
export default function EditField() {
  const navigate     = useNavigate();
  const { accounts } = useMsal();
  const acquireToken = useAzureToken();

  // ── view: 'list' | 'subcats' ────────────────────────────────────
  const [view, setView]                   = useState('list');
  const [categories, setCategories]       = useState([]);
  const [listLoading, setListLoading]     = useState(false);
  const [listError, setListError]         = useState(null);

  // ── Selected category ───────────────────────────────────────────
  const [selectedCat, setSelectedCat]     = useState(null);
  const [dlMembers, setDlMembers]         = useState([]);

  // ── Subcategory edit state
  // Map: subId → { open: bool, formData, saving, error, success }
  const [subStates, setSubStates]         = useState({});

  // ─── Load categories from backend ──────────────────────────────
  const loadCategories = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch(`${BACKEND}/api/categories`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setCategories(await res.json());
    } catch (e) {
      setListError(e.message);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // ─── Select a category ─────────────────────────────────────────
  const handleSelectCategory = async (cat) => {
    setSelectedCat(cat);
    setSubStates({});
    setView('subcats');

    // Load DL members from Azure for the approver count
    try {
      const token = await acquireToken();
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${cat.distributionList.id}/members?$select=id,displayName,mail,userPrincipalName`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) { const d = await res.json(); setDlMembers(d.value || []); }
      else setDlMembers([]);
    } catch { setDlMembers([]); }
  };

  // ─── Toggle open/close a subcategory card ──────────────────────
  const toggleSub = (subId) => {
    setSubStates(prev => {
      const cur = prev[subId] || {};
      if (!cur.formData) {
        // First open: initialise form data from DB
        const dbSub = selectedCat.subCategories.find(s => subId_(s) === subId);
        return { ...prev, [subId]: { ...cur, open: true, formData: dbSubToForm(dbSub), error: null, success: null } };
      }
      return { ...prev, [subId]: { ...cur, open: !cur.open, error: null, success: null } };
    });
  };

  const setSubField = (subId, patch) => {
    setSubStates(prev => ({
      ...prev,
      [subId]: { ...prev[subId], ...patch },
    }));
  };

  // ─── Save one subcategory ───────────────────────────────────────
  const saveSubCategory = async (subId) => {
    const state = subStates[subId];
    if (!state?.formData) return;

    setSubField(subId, { saving: true, error: null, success: null });

    try {
      // Build new subCategories array with this one updated
      const updatedSubs = selectedCat.subCategories.map(s => {
        if (subId_(s) === subId) {
          return { _id: s._id, ...formSubToDb(state.formData) };
        }
        return s;
      });

      const updatedBy = {
        id:   accounts?.[0]?.homeAccountId || accounts?.[0]?.localAccountId || '',
        name: accounts?.[0]?.name          || accounts?.[0]?.username        || '',
        mail: accounts?.[0]?.username      || '',
      };

      const res = await fetch(`${BACKEND}/api/categories/${selectedCat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distributionList: selectedCat.distributionList,
          subCategories:    updatedSubs,
          dlGroupMembers:   selectedCat.dlGroupMembers  || [],
          dlGroupOwners:    selectedCat.dlGroupOwners   || [],
          updatedBy,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Save failed (${res.status})`);
      }

      const saved = await res.json();
      const newSubs = saved.subCategories || updatedSubs;

      // Update local state
      setSelectedCat(prev => ({ ...prev, subCategories: newSubs }));
      setCategories(prev => prev.map(c =>
        c.id === selectedCat.id ? { ...c, subCategories: newSubs } : c
      ));

      setSubField(subId, { saving: false, success: 'Saved!', open: false });

      // Auto-clear success after 3s
      setTimeout(() => {
        setSubStates(prev => {
          if (prev[subId]?.success) return { ...prev, [subId]: { ...prev[subId], success: null } };
          return prev;
        });
      }, 3000);

    } catch (e) {
      setSubField(subId, { saving: false, error: e.message });
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // VIEW: Category list
  // ═══════════════════════════════════════════════════════════════
  if (view === 'list') {
    return (
      <div className="cfc-page">
        <PageHeader
          onBack={() => navigate('/settings')}
          backLabel="Settings"
          title="Edit Request"
          subtitle="Select a category to view and edit its sub-categories"
        />

        <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>
          {listLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 13, padding: '1rem 0' }}>
              <div className="cfc-spinner" style={{ width: 18, height: 18 }} />
              Loading categories…
            </div>
          )}

          {listError && <AlertBanner type="error" message={listError} onDismiss={() => setListError(null)} />}

          {!listLoading && !listError && categories.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <div style={{ fontSize: 40, marginBottom: '0.75rem' }}>📭</div>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 1rem' }}>No categories configured yet.</p>
              <button className="cfc-btn-primary" onClick={() => navigate('/settings/add-field')}>
                Create First Category
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {categories.map(cat => (
              <div
                key={cat.id}
                className="cfc-dl-card"
                onClick={() => handleSelectCategory(cat)}
                style={{ animation: 'cfc-in .2s ease' }}
              >
                <div style={sh.dlIcon}>👥</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 3 }}>
                    {cat.distributionList?.name || cat.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: "'DM Mono',monospace" }}>
                    {cat.distributionList?.mail || '—'}
                  </div>
                </div>
                <div style={sh.countBadge}>
                  <span style={sh.countNum}>{cat.subCategories?.length || 0}</span>
                  <span style={sh.countLabel}>sub-cats</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: '#9ca3af', flexShrink: 0 }}>
                  <path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VIEW: Subcategory accordion
  // ═══════════════════════════════════════════════════════════════
  const subCats = selectedCat?.subCategories || [];

  return (
    <div className="cfc-page">
      <PageHeader
        onBack={() => { setView('list'); setSelectedCat(null); setSubStates({}); }}
        backLabel="All Categories"
        title={selectedCat?.distributionList?.name || selectedCat?.name || ''}
        subtitle={`${selectedCat?.distributionList?.mail || ''} · ${subCats.length} sub-categor${subCats.length === 1 ? 'y' : 'ies'}`}
      />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>

        {subCats.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <p style={{ fontSize: 14, color: '#6b7280' }}>This category has no sub-categories.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {subCats.map(sub => {
            const subId = subId_(sub);
            const state = subStates[subId] || {};
            const isOpen = !!state.open;

            return (
              <div key={subId} className={`cfc-sub-card${isOpen ? ' open' : ''}`} style={{ animation: 'cfc-in .18s ease' }}>

                {/* ── Header ── */}
                <div className="cfc-sub-header" onClick={() => toggleSub(subId)}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                    background: state.success ? '#dcfce7' : isOpen ? '#f0f4ff' : '#f3f4f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    color: state.success ? '#15803d' : isOpen ? '#002060' : '#9ca3af',
                    transition: 'all .2s',
                  }}>
                    {state.success ? '✓' : '✎'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{sub.name}</div>
                    {sub.description && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sub.description}
                      </div>
                    )}
                    {!isOpen && <SubCategoryBadges sub={state.formData ? formSubToDb(state.formData) : sub} />}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    {state.success && (
                      <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>Saved ✓</span>
                    )}
                    {state.saving && (
                      <div className="cfc-spinner" style={{ width: 16, height: 16 }} />
                    )}
                    <span style={{
                      color: '#9ca3af', fontSize: 13,
                      transition: 'transform .2s',
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                    }}>▼</span>
                  </div>
                </div>

                {/* ── Body (inline edit) ── */}
                {isOpen && (
                  <div className="cfc-sub-body">
                    {state.error && (
                      <AlertBanner type="error" message={state.error} onDismiss={() => setSubField(subId, { error: null })} />
                    )}

                    <SubCategoryForm
                      value={state.formData || dbSubToForm(sub)}
                      onChange={formData => setSubField(subId, { formData, success: null })}
                      dlMemberCount={dlMembers.length}
                      acquireToken={acquireToken}
                      onSave={() => saveSubCategory(subId)}
                      onCancel={() => setSubField(subId, { open: false, error: null })}
                      saveLabel="Save Changes"
                      saving={!!state.saving}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Info note */}
        {subCats.length > 0 && (
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: '1.5rem', textAlign: 'center' }}>
            Click a card to expand and edit. Changes are saved per sub-category.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Helper: stable string ID from a sub-category doc ─────────────
function subId_(sub) {
  return (sub._id || sub.id || '').toString();
}

// ─── Styles ───────────────────────────────────────────────────────
const sh = {
  dlIcon: {
    width: 40, height: 40, borderRadius: 9, background: '#dbeafe', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19,
  },
  countBadge: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: '#f9f8f6', border: '1.5px solid #e5e2da',
    borderRadius: 8, padding: '0.35rem 0.85rem', minWidth: 52,
  },
  countNum:   { fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.2 },
  countLabel: { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
};