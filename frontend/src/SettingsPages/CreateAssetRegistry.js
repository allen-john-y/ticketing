// src/SettingsPages/CreateAssetRegistry.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const CATEGORIES = ['Hardware', 'Peripheral', 'Networking', 'Furniture', 'Software', 'Other'];

let rowIdCounter = 1;
const newRow = () => ({ rowId: rowIdCounter++, serialNumber: '', assetTag: '' });

function CreateAssetRegistry() {
  const navigate = useNavigate();

  // Asset types (catalog)
  const [assetTypes, setAssetTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [showNewTypeForm, setShowNewTypeForm] = useState(false);
  const [newType, setNewType] = useState({ name: '', category: 'Hardware', warrantyMonths: '' });
  const [savingType, setSavingType] = useState(false);

  // Shared batch details
  const [batch, setBatch] = useState({
    brand: '',
    model: '',
    purchaseDate: '',
    warrantyExpiry: '',
    location: '',
    notes: '',
  });

  // Bulk rows
  const [rows, setRows] = useState([newRow(), newRow(), newRow()]);
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchAssetTypes();
  }, []);

  const fetchAssetTypes = async () => {
    setLoadingTypes(true);
    try {
      const res = await axios.get(`${BACKEND}/api/asset-types`);
      const data = res.data || [];
      setAssetTypes(data);
      if (data.length > 0) setSelectedTypeId(data[0].id || data[0]._id);
    } catch (err) {
      console.error('Error fetching asset types:', err);
      setAssetTypes([]);
    } finally {
      setLoadingTypes(false);
    }
  };

  const selectedType = assetTypes.find(t => (t.id || t._id) === selectedTypeId);

  const tagPrefix = (typeName) => {
    if (!typeName) return 'AST';
    return typeName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'AST';
  };

  // ── Asset type creation ──────────────────────────────────────────
  const handleCreateType = async () => {
    if (!newType.name.trim()) {
      setError('Type name is required.');
      return;
    }
    setSavingType(true);
    setError('');
    try {
      const res = await axios.post(`${BACKEND}/api/asset-types`, {
        name: newType.name.trim(),
        category: newType.category,
        warrantyMonths: newType.warrantyMonths ? Number(newType.warrantyMonths) : null,
      });
      const created = res.data;
      const updated = [...assetTypes, created];
      setAssetTypes(updated);
      setSelectedTypeId(created.id || created._id);
      setNewType({ name: '', category: 'Hardware', warrantyMonths: '' });
      setShowNewTypeForm(false);
    } catch (err) {
      console.error('Error creating asset type:', err);
      setError('Could not create asset type. Please try again.');
    } finally {
      setSavingType(false);
    }
  };

  // ── Row management ───────────────────────────────────────────────
  const addRow = () => setRows(prev => [...prev, newRow()]);
  const addRows = (count) => setRows(prev => [...prev, ...Array.from({ length: count }, newRow)]);
  const removeRow = (rowId) => setRows(prev => prev.filter(r => r.rowId !== rowId));
  const updateRow = (rowId, field, value) => {
    setRows(prev => prev.map(r => (r.rowId === rowId ? { ...r, [field]: value } : r)));
  };

  const applySuggestedTags = () => {
    const prefix = tagPrefix(selectedType?.name);
    setRows(prev =>
      prev.map((r, idx) => ({
        ...r,
        assetTag: r.assetTag || `${prefix}-${String(idx + 1).padStart(4, '0')}`,
      }))
    );
  };

  const handlePasteImport = () => {
    const serials = pasteText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    if (serials.length === 0) return;
    const prefix = tagPrefix(selectedType?.name);
    const existingCount = rows.filter(r => r.serialNumber.trim()).length;
    const newRows = serials.map((s, idx) => ({
      rowId: rowIdCounter++,
      serialNumber: s,
      assetTag: `${prefix}-${String(existingCount + idx + 1).padStart(4, '0')}`,
    }));
    // replace empty rows first, then append
    setRows(prev => {
      const nonEmpty = prev.filter(r => r.serialNumber.trim());
      return [...nonEmpty, ...newRows];
    });
    setPasteText('');
    setShowPaste(false);
  };

  const validRows = rows.filter(r => r.serialNumber.trim());

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('');
    setSuccessMsg('');

    if (!selectedType) {
      setError('Please select or create an asset type.');
      return;
    }
    if (validRows.length === 0) {
      setError('Add at least one serial number.');
      return;
    }
    const serials = validRows.map(r => r.serialNumber.trim().toLowerCase());
    const hasDupes = new Set(serials).size !== serials.length;
    if (hasDupes) {
      setError('Duplicate serial numbers found in this batch.');
      return;
    }

    setSubmitting(true);
    try {
      const items = validRows.map((r, idx) => ({
        name: selectedType.name,
        type: selectedType.name,
        brand: batch.brand,
        model: batch.model,
        serialNumber: r.serialNumber.trim(),
        assetTag: r.assetTag.trim() || `${tagPrefix(selectedType.name)}-${String(idx + 1).padStart(4, '0')}`,
        purchaseDate: batch.purchaseDate || null,
        warrantyExpiry: batch.warrantyExpiry || null,
        location: batch.location,
        notes: batch.notes,
        status: 'Unassigned',
        health: 'Healthy',
        assignedTo: null,
        issues: [],
      }));

      await axios.post(`${BACKEND}/api/assets/bulk`, { items });

      setSuccessMsg(`${items.length} asset${items.length > 1 ? 's' : ''} added to inventory.`);
      setTimeout(() => navigate('/asset-registry'), 900);
    } catch (err) {
      console.error('Error bulk-adding assets:', err);
      setError('Could not save assets. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-asset-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');

        .create-asset-page {
          padding: 32px 40px;
          font-family: 'Inter', sans-serif;
          background: #f8fafc;
          min-height: calc(100vh - 68px);
        }

        .cap-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }

        .cap-header-left h1 {
          font-family: 'Sora', sans-serif;
          font-size: 26px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .cap-header-left p {
          color: #64748b;
          font-size: 14px;
        }

        .cap-back-btn {
          padding: 9px 18px;
          background: white;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13px;
          color: #334155;
          cursor: pointer;
        }

        .cap-back-btn:hover { border-color: #002060; color: #002060; }

        .cap-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 20px;
        }

        .cap-card h2 {
          font-family: 'Sora', sans-serif;
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .cap-card .cap-hint {
          font-size: 13px;
          color: #64748b;
          margin-bottom: 18px;
        }

        .cap-row {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .cap-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          min-width: 180px;
        }

        .cap-field label {
          font-size: 12px;
          font-weight: 600;
          color: #475569;
        }

        .cap-field input,
        .cap-field select,
        .cap-field textarea {
          padding: 10px 14px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          color: #0f172a;
        }

        .cap-field input:focus,
        .cap-field select:focus,
        .cap-field textarea:focus {
          outline: none;
          border-color: #002060;
          box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
        }

        .cap-link-btn {
          background: none;
          border: none;
          color: #002060;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          padding: 0;
        }

        .cap-link-btn:hover { text-decoration: underline; }

        .cap-new-type-box {
          margin-top: 12px;
          padding: 16px;
          background: #f8fafc;
          border: 1.5px dashed #cbd5e1;
          border-radius: 12px;
        }

        .cap-small-btn {
          padding: 8px 16px;
          border-radius: 8px;
          border: 1.5px solid #e2e8f0;
          background: white;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }

        .cap-small-btn:hover { border-color: #002060; color: #002060; }

        .cap-primary-btn {
          padding: 9px 20px;
          border-radius: 10px;
          border: none;
          background: #002060;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .cap-primary-btn:hover { background: #003090; }
        .cap-primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .cap-table-wrap {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
        }

        .cap-table-wrap table { width: 100%; border-collapse: collapse; }

        .cap-table-wrap th {
          text-align: left;
          padding: 10px 14px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          background: #f8fafc;
          border-bottom: 1.5px solid #e2e8f0;
        }

        .cap-table-wrap td {
          padding: 8px 10px;
          border-bottom: 1px solid #eef2f6;
        }

        .cap-table-wrap tr:last-child td { border-bottom: none; }

        .cap-table-wrap input {
          width: 100%;
          padding: 7px 10px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
        }

        .cap-table-wrap input:focus {
          outline: none;
          border-color: #002060;
        }

        .cap-remove-btn {
          background: none;
          border: none;
          color: #dc2626;
          cursor: pointer;
          font-size: 16px;
          padding: 4px 8px;
        }

        .cap-toolbar {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }

        .cap-count-pill {
          padding: 4px 12px;
          border-radius: 20px;
          background: rgba(0,32,96,0.08);
          color: #002060;
          font-size: 12px;
          font-weight: 700;
        }

        .cap-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          align-items: center;
          margin-top: 8px;
        }

        .cap-alert {
          padding: 12px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 20px;
        }

        .cap-alert.error {
          background: rgba(220,38,38,0.08);
          color: #dc2626;
          border: 1px solid rgba(220,38,38,0.2);
        }

        .cap-alert.success {
          background: rgba(22,163,74,0.08);
          color: #16a34a;
          border: 1px solid rgba(22,163,74,0.2);
        }

        .cap-paste-box {
          margin-top: 10px;
          padding: 14px;
          background: #f8fafc;
          border: 1.5px dashed #cbd5e1;
          border-radius: 12px;
        }

        .cap-paste-box textarea {
          width: 100%;
          min-height: 100px;
          resize: vertical;
        }
      `}</style>

      {/* Header */}
      <div className="cap-header">
        <div className="cap-header-left">
          <h1>Add assets to registry</h1>
          <p>Register a new asset type or add physical items to inventory in bulk</p>
        </div>
        <button className="cap-back-btn" onClick={() => navigate('/asset-registry')}>
          ← Back to registry
        </button>
      </div>

      {error && <div className="cap-alert error">{error}</div>}
      {successMsg && <div className="cap-alert success">{successMsg}</div>}

      {/* Asset type */}
      <div className="cap-card">
        <h2>1. Asset type</h2>
        <div className="cap-hint">Choose the category this batch belongs to, e.g. Monitor, Laptop, Keyboard.</div>

        {loadingTypes ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading asset types…</div>
        ) : (
          <>
            <div className="cap-row">
              <div className="cap-field" style={{ maxWidth: 320 }}>
                <label>Existing type</label>
                <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}>
                  {assetTypes.length === 0 && <option value="">No types yet</option>}
                  {assetTypes.map(t => (
                    <option key={t.id || t._id} value={t.id || t._id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 10 }}>
                <button className="cap-link-btn" onClick={() => setShowNewTypeForm(s => !s)}>
                  {showNewTypeForm ? 'Cancel' : '+ New asset type'}
                </button>
              </div>
            </div>

            {showNewTypeForm && (
              <div className="cap-new-type-box">
                <div className="cap-row">
                  <div className="cap-field">
                    <label>Type name</label>
                    <input
                      type="text"
                      placeholder="e.g. Computer Monitor"
                      value={newType.name}
                      onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                    />
                  </div>
                  <div className="cap-field">
                    <label>Category</label>
                    <select
                      value={newType.category}
                      onChange={(e) => setNewType({ ...newType, category: e.target.value })}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="cap-field">
                    <label>Default warranty (months)</label>
                    <input
                      type="number"
                      placeholder="e.g. 24"
                      value={newType.warrantyMonths}
                      onChange={(e) => setNewType({ ...newType, warrantyMonths: e.target.value })}
                    />
                  </div>
                </div>
                <button className="cap-primary-btn" onClick={handleCreateType} disabled={savingType}>
                  {savingType ? 'Saving…' : 'Save asset type'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Shared batch details */}
      <div className="cap-card">
        <h2>2. Batch details</h2>
        <div className="cap-hint">These apply to every item in this batch — leave blank if not applicable.</div>
        <div className="cap-row">
          <div className="cap-field">
            <label>Brand</label>
            <input type="text" placeholder="e.g. Dell" value={batch.brand}
              onChange={(e) => setBatch({ ...batch, brand: e.target.value })} />
          </div>
          <div className="cap-field">
            <label>Model</label>
            <input type="text" placeholder="e.g. P2422H" value={batch.model}
              onChange={(e) => setBatch({ ...batch, model: e.target.value })} />
          </div>
          <div className="cap-field">
            <label>Location</label>
            <input type="text" placeholder="e.g. Chennai Office - IT Store" value={batch.location}
              onChange={(e) => setBatch({ ...batch, location: e.target.value })} />
          </div>
        </div>
        <div className="cap-row">
          <div className="cap-field">
            <label>Purchase date</label>
            <input type="date" value={batch.purchaseDate}
              onChange={(e) => setBatch({ ...batch, purchaseDate: e.target.value })} />
          </div>
          <div className="cap-field">
            <label>Warranty expiry</label>
            <input type="date" value={batch.warrantyExpiry}
              onChange={(e) => setBatch({ ...batch, warrantyExpiry: e.target.value })} />
          </div>
          <div className="cap-field" style={{ flex: 2 }}>
            <label>Notes</label>
            <input type="text" placeholder="Optional" value={batch.notes}
              onChange={(e) => setBatch({ ...batch, notes: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Bulk serial numbers */}
      <div className="cap-card">
        <h2>3. Serial numbers</h2>
        <div className="cap-hint">Add one row per physical unit. Asset tags are suggested automatically but editable.</div>

        <div className="cap-toolbar">
          <button className="cap-small-btn" onClick={addRow}>+ Add row</button>
          <button className="cap-small-btn" onClick={() => addRows(5)}>+ Add 5 rows</button>
          <button className="cap-small-btn" onClick={applySuggestedTags}>Auto-fill asset tags</button>
          <button className="cap-link-btn" onClick={() => setShowPaste(s => !s)}>
            {showPaste ? 'Cancel paste' : 'Paste serial numbers'}
          </button>
          <span className="cap-count-pill">{validRows.length} item{validRows.length !== 1 ? 's' : ''}</span>
        </div>

        {showPaste && (
          <div className="cap-paste-box">
            <div className="cap-field" style={{ marginBottom: 10 }}>
              <label>One serial number per line</label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'SN12345\nSN12346\nSN12347'}
              />
            </div>
            <button className="cap-primary-btn" onClick={handlePasteImport}>Import list</button>
          </div>
        )}

        <div className="cap-table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Serial number</th>
                <th style={{ width: '45%' }}>Asset tag</th>
                <th style={{ width: '10%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rowId}>
                  <td>
                    <input
                      type="text"
                      placeholder="e.g. SN-8842DX"
                      value={r.serialNumber}
                      onChange={(e) => updateRow(r.rowId, 'serialNumber', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="Auto-suggested"
                      value={r.assetTag}
                      onChange={(e) => updateRow(r.rowId, 'assetTag', e.target.value)}
                    />
                  </td>
                  <td>
                    <button className="cap-remove-btn" onClick={() => removeRow(r.rowId)} title="Remove row">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cap-footer">
        <button className="cap-back-btn" onClick={() => navigate('/asset-registry')}>Cancel</button>
        <button className="cap-primary-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : `Add ${validRows.length || ''} asset${validRows.length !== 1 ? 's' : ''} to inventory`}
        </button>
      </div>
    </div>
  );
}

export default CreateAssetRegistry;