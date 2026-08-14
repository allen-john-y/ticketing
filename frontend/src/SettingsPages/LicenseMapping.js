// LicenseMapping.js - Settings page: link each Microsoft 365 license (SKU) to
// the Azure AD security group that grants it.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/* ─────────────────────────── CONFIRMATION MODAL ─────────────────────────── */
function ConfirmationModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', confirmColor = '#ef4444' }) {
  if (!isOpen) return null;

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>{title}</h3>
          <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
        </div>
        <div style={modalStyles.body}>
          <p style={modalStyles.message}>{message}</p>
        </div>
        <div style={modalStyles.footer}>
          <button onClick={onClose} style={modalStyles.cancelBtn}>Cancel</button>
          <button onClick={onConfirm} style={{ ...modalStyles.confirmBtn, background: confirmColor }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  modal: {
    background: '#fff',
    borderRadius: '16px',
    maxWidth: '480px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #eef2f6',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    color: '#0f172a',
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    fontSize: '20px',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '8px',
    transition: 'background 0.15s',
  },
  body: {
    padding: '24px',
  },
  message: {
    margin: 0,
    fontSize: '14px',
    color: '#475569',
    lineHeight: '1.6',
  },
  footer: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    padding: '16px 24px',
    borderTop: '1px solid #eef2f6',
  },
  cancelBtn: {
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: '#475569',
    padding: '8px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  confirmBtn: {
    border: 'none',
    color: '#fff',
    padding: '8px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
};

/* ─────────────────────────── GROUP SEARCH PICKER ─────────────────────────── */
function GroupPicker({ value, onChange, disabled, placeholder = 'Search security groups...' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const debouncedQuery = useDebouncedValue(query, 350);

  useEffect(() => {
    if (value) {
      setQuery(value.displayName || '');
    }
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setTimeout(() => setOpen(false), 200);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`${BACKEND}/api/azure-groups/search?q=${encodeURIComponent(debouncedQuery.trim())}`);
        const data = await res.json();
        if (!cancelled) setResults(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Group search failed:', err);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  if (value && !open) {
    return (
      <div ref={boxRef} style={{ position: 'relative' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid #bae6fd',
          background: '#f0f9ff',
          minHeight: '48px',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '13.5px',
              fontWeight: 600,
              color: '#0f172a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {value.displayName}
            </div>
            <div style={{ fontSize: '11.5px', color: '#0891b2', marginTop: '2px' }}>
              Security group linked
            </div>
          </div>
          {!disabled && (
            <button
              onClick={() => {
                setOpen(true);
                setQuery(value.displayName || '');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#0891b2',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                flexShrink: 0,
                marginLeft: '12px',
                padding: '4px 8px',
                borderRadius: '6px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#e0f2fe'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Change
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={query}
        disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          fontSize: '13.5px',
          outline: 'none',
          transition: 'border-color 0.2s',
          minHeight: '48px',
        }}
        onFocus={(e) => e.target.style.borderColor = '#0891b2'}
        onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
      />

      {open && query.trim().length >= 2 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 30,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(15,23,42,0.15)',
          maxHeight: '260px',
          overflowY: 'auto',
        }}>
          {searching && (
            <div style={{ padding: '14px 16px', fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid #e2e8f0', borderTopColor: '#0891b2', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Searching...
            </div>
          )}
          {!searching && results.length === 0 && (
            <div style={{ padding: '14px 16px', fontSize: '13px', color: '#94a3b8' }}>
              No security groups found. Try a different search.
            </div>
          )}
          {!searching && results.map((g) => (
            <div
              key={g.id}
              onClick={() => {
                onChange(g);
                setQuery(g.displayName || '');
                setResults([]);
                setOpen(false);
              }}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                borderBottom: '1px solid #f1f5f9',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{g.displayName}</div>
              {g.mail && <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>{g.mail}</div>}
              {g.description && <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>{g.description}</div>}
            </div>
          ))}
        </div>
      )}
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────── MAPPING ROW ─────────────────────────── */
function MappingRow({ license, adminIdentity, onSaved }) {
  const [group, setGroup] = useState(
    license.mapped ? { id: license.groupId, displayName: license.groupName } : null
  );
  const [customName, setCustomName] = useState(license.displayName || license.skuPartNumber || '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dirty, setDirty] = useState(false);
  
  const [showUnlinkModal, setShowUnlinkModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [pendingGroupChange, setPendingGroupChange] = useState(null);

  const handleSave = async () => {
    if (!group) return;
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND}/api/license-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: license.skuId,
          skuPartNumber: license.skuPartNumber,
          displayName: customName.trim() || license.skuPartNumber || '',
          groupId: group.id,
          groupName: group.displayName,
          updatedBy: adminIdentity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to save mapping');
        return;
      }
      setDirty(false);
      onSaved && onSaved();
    } catch (err) {
      console.error('Save mapping failed:', err);
      alert('Failed to save mapping');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!license.mappingId) return;
    setRemoving(true);
    try {
      const res = await fetch(
        `${BACKEND}/api/license-mappings/${encodeURIComponent(license.mappingId)}?adminEmail=${encodeURIComponent(adminIdentity.email || '')}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to unlink');
        return;
      }
      setGroup(null);
      setDirty(false);
      onSaved && onSaved();
    } catch (err) {
      console.error('Unlink failed:', err);
      alert('Failed to unlink');
    } finally {
      setRemoving(false);
      setShowUnlinkModal(false);
    }
  };

  const handleGroupChange = (newGroup) => {
    if (newGroup) {
      setPendingGroupChange(newGroup);
      setShowChangeModal(true);
    }
  };

  const confirmGroupChange = () => {
    if (pendingGroupChange) {
      setGroup(pendingGroupChange);
      setDirty(true);
      setPendingGroupChange(null);
      setShowChangeModal(false);
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.3fr 1fr auto',
      gap: '16px',
      alignItems: 'center',
      padding: '16px 20px',
      borderBottom: '1px solid #f1f5f9',
      transition: 'background 0.15s',
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = '#fafbfc'}
    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ minWidth: 0 }}>
        <input
          value={customName}
          onChange={(e) => { setCustomName(e.target.value); setDirty(true); }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: 'none',
            background: 'transparent',
            fontSize: '14.5px',
            fontWeight: 600,
            color: '#0f172a',
            padding: '2px 0',
            outline: 'none',
          }}
        />
        <div style={{ 
          fontSize: '11.5px', 
          color: '#94a3b8', 
          marginTop: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontFamily: 'monospace', fontSize: '11px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
            {license.skuPartNumber}
          </span>
          <span>·</span>
          <span>
            <strong style={{ color: '#3b82f6' }}>{license.assigned || 0}</strong>
            {' / '}
            <strong>{license.total || 0}</strong>
            {' assigned'}
          </span>
          {!license.mapped && (
            <span style={{
              background: '#fef3c7',
              color: '#d97706',
              padding: '2px 10px',
              borderRadius: '12px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              Unlinked
            </span>
          )}
        </div>
      </div>

      <GroupPicker 
        value={group} 
        onChange={handleGroupChange} 
        disabled={saving} 
      />

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        {license.mapped && !dirty && (
          <button
            onClick={() => setShowUnlinkModal(true)}
            disabled={removing}
            style={{
              border: '1px solid #fecaca',
              background: '#fff',
              color: '#ef4444',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: removing ? 'default' : 'pointer',
              opacity: removing ? 0.6 : 1,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { if (!removing) { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fca5a5'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fecaca'; }}
          >
            {removing ? 'Unlinking…' : 'Unlink'}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!group || saving || (!dirty && license.mapped)}
          style={{
            border: 'none',
            background: (!group || (!dirty && license.mapped)) ? '#e2e8f0' : '#0891b2',
            color: (!group || (!dirty && license.mapped)) ? '#94a3b8' : '#fff',
            borderRadius: '8px',
            padding: '8px ' + (license.mapped ? '18px' : '20px'),
            fontSize: '12.5px',
            fontWeight: 700,
            cursor: (!group || saving || (!dirty && license.mapped)) ? 'default' : 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            if (group && (dirty || !license.mapped) && !saving) {
              e.currentTarget.style.background = '#0e7490';
            }
          }}
          onMouseLeave={(e) => {
            if (group && (dirty || !license.mapped) && !saving) {
              e.currentTarget.style.background = '#0891b2';
            }
          }}
        >
          {saving ? 'Saving…' : license.mapped ? (dirty ? 'Update' : '✓ Linked') : 'Link'}
        </button>
      </div>

      <ConfirmationModal
        isOpen={showUnlinkModal}
        onClose={() => setShowUnlinkModal(false)}
        onConfirm={handleUnlink}
        title="Unlink License"
        message={`Are you sure you want to unlink "${license.displayName || license.skuPartNumber}" from "${group?.displayName}"?\n\nLicense Registry won't be able to manage this license until it's re-linked.`}
        confirmText="Yes, Unlink"
        confirmColor="#ef4444"
      />

      <ConfirmationModal
        isOpen={showChangeModal}
        onClose={() => {
          setShowChangeModal(false);
          setPendingGroupChange(null);
        }}
        onConfirm={confirmGroupChange}
        title="Change Security Group"
        message={`Change the security group for "${license.displayName || license.skuPartNumber}" from "${group?.displayName}" to "${pendingGroupChange?.displayName}"?`}
        confirmText="Yes, Change"
        confirmColor="#0891b2"
      />
    </div>
  );
}

/* ─────────────────────────── MAIN PAGE ─────────────────────────── */
export default function LicenseMapping() {
  const navigate = useNavigate();
  const { accounts, instance } = useMsal();
  const account = accounts?.[0];
  const adminIdentity = {
    id: account?.localAccountId || '',
    name: account?.name || '',
    email: account?.username || '',
  };

  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('mapping');

  // ─── License Access Users ───
  const [licenseAccessUsers, setLicenseAccessUsers] = useState([]);
  const [accessLoading, setAccessLoading] = useState(false);
  
  // Batch selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });
  const [submitting, setSubmitting] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [licRes, mapRes, accessRes] = await Promise.all([
        fetch(`${BACKEND}/api/licenses`),
        fetch(`${BACKEND}/api/license-mappings`),
        fetch(`${BACKEND}/api/license-access`),
      ]);
      
      if (!licRes.ok) {
        const licData = await licRes.json();
        setError(licData.message || 'Failed to load licenses');
        setLoading(false);
        return;
      }
      
      const licData = await licRes.json();
      const mapData = await mapRes.json();
      const accessData = await accessRes.json();
      
      const mappingBySkuId = {};
      (Array.isArray(mapData) ? mapData : []).forEach((m) => {
        mappingBySkuId[m.skuId] = m;
      });

      const merged = (Array.isArray(licData) ? licData : []).map((l) => {
        const mapping = mappingBySkuId[l.skuId];
        return { 
          ...l, 
          mappingId: mapping?._id || null,
          mapped: !!mapping,
          groupId: mapping?.groupId || null,
          groupName: mapping?.groupName || null,
          displayName: mapping?.displayName || l.displayName || l.skuPartNumber || '',
        };
      });
      
      setLicenses(merged);
      setLicenseAccessUsers(accessData || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load license mapping data:', err);
      setError('Failed to load license data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = licenses.filter((l) => {
    if (filter === 'linked' && !l.mapped) return false;
    if (filter === 'unlinked' && l.mapped) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (l.displayName || '').toLowerCase().includes(q) || 
           (l.skuPartNumber || '').toLowerCase().includes(q);
  });

  const linkedCount = licenses.filter((l) => l.mapped).length;
  const totalCount = licenses.length;

  // ─── License Access Management ───
  const searchAzureAD = async (query) => {
    if (!query || query.trim().length < 2) {
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

      const q = query.trim().replace(/'/g, "''");
      const filter = `startswith(displayName,'${q}') or startswith(mail,'${q}') or startswith(userPrincipalName,'${q}')`;
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=10`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      const data = await res.json();
      
      const selectedEmails = new Set(selectedUsers.map(u => u.mail.toLowerCase()));
      const existingEmails = new Set(licenseAccessUsers.map(u => u.email.toLowerCase()));
      
      const results = (data.value || [])
        .filter(u => {
          const email = (u.mail || u.userPrincipalName || '').toLowerCase();
          return !existingEmails.has(email) && !selectedEmails.has(email);
        })
        .map(u => ({
          id: u.id,
          displayName: u.displayName || u.mail || '(no name)',
          mail: u.mail || u.userPrincipalName || '',
        }));
      
      setSearchResults(results);
    } catch (err) {
      console.error('Error searching users:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    searchAzureAD(value);
  };

  const selectUser = (user) => {
    if (selectedUsers.some(u => u.mail.toLowerCase() === user.mail.toLowerCase())) {
      showToast(`"${user.displayName}" is already in the selection list`, 'error');
      return;
    }
    if (licenseAccessUsers.some(u => u.email.toLowerCase() === user.mail.toLowerCase())) {
      showToast(`"${user.displayName}" already has License Registry access`, 'error');
      return;
    }
    setSelectedUsers(prev => [...prev, user]);
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeUserFromSelection = (userMail) => {
    setSelectedUsers(prev => prev.filter(u => u.mail.toLowerCase() !== userMail.toLowerCase()));
  };

  const handleGrantAccess = async () => {
    if (selectedUsers.length === 0) {
      showToast('No users selected to grant access', 'error');
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    let failedCount = 0;
    const failedUsers = [];

    try {
      for (const user of selectedUsers) {
        try {
          const payload = {
            email: user.mail,
            name: user.displayName,
            addedBy: {
              id: adminIdentity.id || '',
              name: adminIdentity.name || '',
              email: adminIdentity.email || '',
            },
          };
          const res = await fetch(`${BACKEND}/api/license-access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            successCount++;
          } else {
            const data = await res.json();
            failedCount++;
            failedUsers.push(user.mail);
            console.error(`Failed to add ${user.mail}:`, data.message);
          }
        } catch (err) {
          failedCount++;
          failedUsers.push(user.mail);
          console.error(`Failed to add ${user.mail}:`, err.message);
        }
      }

      if (successCount > 0 && failedCount === 0) {
        showToast(`✅ License Registry access granted to ${successCount} user${successCount > 1 ? 's' : ''}!`, 'success');
      } else if (successCount > 0 && failedCount > 0) {
        showToast(`⚠️ Granted to ${successCount}, failed for ${failedCount}: ${failedUsers.join(', ')}`, 'error');
      } else {
        showToast(`❌ Failed to grant access to all ${failedCount} users`, 'error');
      }

      setSelectedUsers([]);
      load();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to grant access';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveAccess = async (id, email) => {
    if (!window.confirm(`Remove License Registry access for "${email}"?`)) return;
    try {
      const res = await fetch(`${BACKEND}/api/license-access/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`License Registry access removed for "${email}"`, 'success');
        load();
      } else {
        const data = await res.json();
        showToast(data.message || 'Failed to remove user', 'error');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to remove user';
      showToast(msg, 'error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', fontFamily: "'DM Sans', 'Lato', sans-serif" }}>
      {/* Header */}
      <div style={{ 
        background: '#002060', 
        padding: '32px 32px 28px', 
        position: 'relative', 
        overflow: 'hidden' 
      }}>
        <div style={{ 
          position: 'absolute', 
          right: -80, 
          top: -80, 
          width: 400, 
          height: 400, 
          borderRadius: '50%', 
          background: 'radial-gradient(circle, rgba(8,145,178,0.15) 0%, transparent 70%)' 
        }} />
        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto' }}>
          <button
            onClick={() => navigate('/settings')}
            style={{
              border: 'none',
              background: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.85)',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '12.5px',
              cursor: 'pointer',
              marginBottom: '16px',
              transition: 'background 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            ← Back to Settings
          </button>
          <h1 style={{ 
            fontSize: '26px', 
            fontWeight: 800, 
            color: '#fff', 
            margin: 0,
            letterSpacing: '-0.5px',
          }}>
            License Mapping
          </h1>
          <p style={{ 
            fontSize: '14px', 
            color: 'rgba(255,255,255,0.7)', 
            margin: '6px 0 0',
            maxWidth: '600px',
          }}>
            Link each Microsoft 365 license to the security group that grants it. 
            Adding a user to that group automatically assigns the license.
          </p>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px 0' }}>
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: '2px solid #e6e9ef',
          marginBottom: '24px',
        }}>
          <button
            onClick={() => setActiveTab('mapping')}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: "'Sora', sans-serif",
              fontSize: '14px',
              fontWeight: 600,
              color: activeTab === 'mapping' ? '#002060' : '#64748b',
              borderBottom: '3px solid ' + (activeTab === 'mapping' ? '#002060' : 'transparent'),
              marginBottom: '-2px',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => { if (activeTab !== 'mapping') e.currentTarget.style.color = '#0f172a'; }}
            onMouseLeave={(e) => { if (activeTab !== 'mapping') e.currentTarget.style.color = '#64748b'; }}
          >
            📋 License Mapping
            <span style={{
              background: activeTab === 'mapping' ? 'rgba(0,32,96,0.08)' : '#f5f7fa',
              color: activeTab === 'mapping' ? '#002060' : '#64748b',
              fontSize: '11px',
              padding: '1px 8px',
              borderRadius: '12px',
              fontWeight: 700,
            }}>
              {totalCount}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('access')}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: "'Sora', sans-serif",
              fontSize: '14px',
              fontWeight: 600,
              color: activeTab === 'access' ? '#002060' : '#64748b',
              borderBottom: '3px solid ' + (activeTab === 'access' ? '#002060' : 'transparent'),
              marginBottom: '-2px',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => { if (activeTab !== 'access') e.currentTarget.style.color = '#0f172a'; }}
            onMouseLeave={(e) => { if (activeTab !== 'access') e.currentTarget.style.color = '#64748b'; }}
          >
            👥 User Access
            <span style={{
              background: activeTab === 'access' ? 'rgba(0,32,96,0.08)' : '#f5f7fa',
              color: activeTab === 'access' ? '#002060' : '#64748b',
              fontSize: '11px',
              padding: '1px 8px',
              borderRadius: '12px',
              fontWeight: 700,
            }}>
              {licenseAccessUsers.length}
            </span>
          </button>
        </div>
      </div>

      {/* ─── TAB: License Mapping ─── */}
      {activeTab === 'mapping' && (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px 40px' }}>
          {/* Stats & Filters */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: '12px', 
            marginBottom: '20px' 
          }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search licenses..."
                style={{
                  width: '240px',
                  boxSizing: 'border-box',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#fff',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#0891b2'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
              {['all', 'linked', 'unlinked'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    border: '1px solid #e2e8f0',
                    background: filter === f ? '#0891b2' : '#fff',
                    color: filter === f ? '#fff' : '#475569',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    if (filter !== f) {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (filter !== f) {
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }
                  }}
                >
                  {f} {f === 'all' && `(${totalCount})`}
                  {f === 'linked' && `(${linkedCount})`}
                  {f === 'unlinked' && `(${totalCount - linkedCount})`}
                </button>
              ))}
            </div>
            {!loading && !error && totalCount > 0 && (
              <div style={{ 
                fontSize: '13px', 
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ 
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: linkedCount === totalCount ? '#10b981' : '#f59e0b',
                }} />
                <strong style={{ color: '#0f172a' }}>{linkedCount}</strong>
                of <strong style={{ color: '#0f172a' }}>{totalCount}</strong> licenses linked
              </div>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <div style={{ 
              background: '#fff', 
              border: '1px solid #e2e8f0', 
              borderRadius: '14px', 
              padding: '60px',
              textAlign: 'center',
            }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                border: '3px solid #e2e8f0', 
                borderTopColor: '#0891b2', 
                borderRadius: '50%',
                margin: '0 auto 16px',
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>Loading license mappings...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div style={{ 
              background: '#fef2f2', 
              border: '1px solid #fecaca', 
              borderRadius: '12px', 
              padding: '16px 20px', 
              color: '#b91c1c', 
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <span>{error}</span>
              <button
                onClick={load}
                style={{
                  marginLeft: 'auto',
                  border: '1px solid #fca5a5',
                  background: '#fff',
                  color: '#b91c1c',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* License List */}
          {!loading && !error && (
            <div style={{ 
              background: '#fff', 
              border: '1px solid #e2e8f0', 
              borderRadius: '14px', 
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.3fr 1fr auto',
                gap: '16px',
                padding: '12px 20px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                <div>License</div>
                <div>Security Group</div>
                <div style={{ textAlign: 'right' }}>Action</div>
              </div>

              {/* Rows */}
              {filtered.length === 0 && (
                <div style={{ 
                  padding: '48px 20px', 
                  textAlign: 'center', 
                  color: '#94a3b8', 
                  fontSize: '13.5px' 
                }}>
                  {search ? 'No licenses match your search.' : 'No licenses found.'}
                </div>
              )}

              {filtered.map((l) => (
                <MappingRow 
                  key={l.skuId || l.id} 
                  license={l} 
                  adminIdentity={adminIdentity} 
                  onSaved={load} 
                />
              ))}

              {/* Footer */}
              {filtered.length > 0 && (
                <div style={{
                  padding: '10px 20px',
                  background: '#fafbfc',
                  borderTop: '1px solid #f1f5f9',
                  fontSize: '12px',
                  color: '#94a3b8',
                  textAlign: 'right',
                }}>
                  Showing {filtered.length} of {licenses.length} licenses
                  {lastUpdated && (
                    <span style={{ marginLeft: '16px' }}>
                      Last updated: {lastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: User Access ─── */}
      {activeTab === 'access' && (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px 40px' }}>
          <div style={{ 
            background: '#fff', 
            border: '1px solid #e2e8f0', 
            borderRadius: '14px', 
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: 700,
                color: '#0f172a',
                margin: 0,
                fontFamily: "'Sora', sans-serif",
              }}>
                👥 Users with License Registry Access
              </h3>
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                {licenseAccessUsers.length} user{licenseAccessUsers.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* ─── Live Search for Users ─── */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ 
                fontSize: '12px', 
                fontWeight: 600, 
                color: '#64748b',
                display: 'block',
                marginBottom: '6px',
              }}>
                Search users to add
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '13px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    background: '#fff',
                  }}
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchQuery.length >= 2 && searchResults.length > 0 && setShowDropdown(true)}
                  autoComplete="off"
                />
                {searching && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                    ⏳ Searching Azure AD...
                  </div>
                )}
                {showDropdown && searchResults.length > 0 && (
                  <div ref={dropdownRef} style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    zIndex: 100,
                  }}>
                    {searchResults.map(user => (
                      <div 
                        key={user.id} 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background 0.15s',
                        }}
                        onClick={() => selectUser(user)}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: '#002060',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                            {user.displayName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {user.mail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ─── Selected Users List ─── */}
            {selectedUsers.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#0f172a',
                }}>
                  <span>📌 Selected ({selectedUsers.length})</span>
                  <button
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                    onClick={() => setSelectedUsers([])}
                  >
                    Clear All
                  </button>
                </div>
                {selectedUsers.map((user, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                        {user.displayName}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {user.mail}
                      </span>
                    </div>
                    <button
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                      onClick={() => removeUserFromSelection(user.mail)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '10px',
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onClick={handleGrantAccess}
                  disabled={submitting || selectedUsers.length === 0}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
                >
                  {submitting ? '⏳ Granting...' : `✅ Grant Access (${selectedUsers.length})`}
                </button>
              </div>
            )}

            {/* ─── Already Have Access List ─── */}
            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#64748b',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid #f1f5f9',
              }}>
                Users with Access
              </div>

              {accessLoading ? (
                <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
                  Loading...
                </div>
              ) : licenseAccessUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '6px' }}>👤</div>
                  <div>No users have access</div>
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>Search above to add users</div>
                </div>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {licenseAccessUsers.map(user => (
                    <div key={user._id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 4px',
                      borderBottom: '1px solid #f1f5f9',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                          {user.name || user.email}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {user.email}
                        </div>
                      </div>
                      <button
                        style={{
                          border: '1px solid #fecaca',
                          background: '#fff',
                          color: '#ef4444',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          flexShrink: 0,
                        }}
                        onClick={() => handleRemoveAccess(user._id, user.email)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fecaca'; }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.open && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          fontSize: '13px',
          fontWeight: 600,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#fff',
          animation: 'slideIn 0.3s ease',
        }}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.message}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from { transform: translateX(110%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}