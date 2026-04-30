// src/SettingsPages/CreateKBForm.js - Create new article form with rich text editor
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// ─── Reusable Modal Shell ─────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: '20px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
        width: '100%', maxWidth: '480px', margin: '0 20px',
        animation: 'modalUp 0.2s ease', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1.5px solid #e2e8f0', background: '#f8fafc',
        }}>
          <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: '16px', color: '#002060' }}>
            {title}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px',
            color: '#64748b', lineHeight: 1, width: '32px', height: '32px',
            borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Link Modal ───────────────────────────────────────────────────────────────
function LinkModal({ onClose, onApply }) {
  const [url, setUrl] = useState('https://');
  const [label, setLabel] = useState('');

  return (
    <Modal title="🔗 Insert Link" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={mLabelStyle}>Link Text (optional)</label>
          <input style={mInputStyle} type="text" placeholder="e.g., Click here"
            value={label} onChange={(e) => setLabel(e.target.value)} />
          <div style={mHintStyle}>Leave blank to wrap your selected text</div>
        </div>
        <div>
          <label style={mLabelStyle}>URL <span style={{ color: '#ef4444' }}>*</span></label>
          <input
            autoFocus style={mInputStyle} type="text" placeholder="https://example.com"
            value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onApply(url, label); if (e.key === 'Escape') onClose(); }}
            onFocus={(e) => (e.target.style.borderColor = '#002060')}
            onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
          />
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button style={mCancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...mPrimaryBtn, opacity: (!url || url === 'https://') ? 0.5 : 1 }}
            onClick={() => onApply(url, label)} disabled={!url || url === 'https://'}>
            Insert Link
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Image Modal ──────────────────────────────────────────────────────────────
function ImageModal({ onClose, onApply }) {
  const [tab, setTab] = useState('upload');
  const [url, setUrl] = useState('https://');
  const [preview, setPreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <Modal title="🖼️ Insert Image" onClose={onClose}>
      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: '20px', background: '#f1f5f9', borderRadius: '10px', padding: '4px', gap: '0' }}>
        {['upload', 'url'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px', border: 'none', borderRadius: '7px', cursor: 'pointer',
            fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: '13px',
            background: tab === t ? '#fff' : 'transparent',
            color: tab === t ? '#002060' : '#64748b',
            boxShadow: tab === t ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.2s',
          }}>
            {t === 'upload' ? '📁 Upload from Device' : '🔗 From URL'}
          </button>
        ))}
      </div>

      {tab === 'upload' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragOver ? '#002060' : '#cbd5e1'}`,
              borderRadius: '12px', padding: '32px 20px', textAlign: 'center',
              cursor: 'pointer', background: dragOver ? 'rgba(0,32,96,0.04)' : '#f8fafc',
              transition: 'all 0.2s',
            }}
          >
            {preview ? (
              <img src={preview} alt="preview" style={{ maxHeight: '180px', maxWidth: '100%', borderRadius: '8px', objectFit: 'contain' }} />
            ) : (
              <>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>📁</div>
                <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: '14px', color: '#002060', marginBottom: '4px' }}>
                  Click to browse or drag & drop
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>PNG, JPG, GIF, WEBP supported</div>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])} />
          {preview && (
            <button style={{ ...mCancelBtn, alignSelf: 'flex-start', fontSize: '12px', padding: '6px 12px' }}
              onClick={() => { setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              ✕ Remove
            </button>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button style={mCancelBtn} onClick={onClose}>Cancel</button>
            <button style={{ ...mPrimaryBtn, opacity: !preview ? 0.5 : 1 }}
              onClick={() => preview && onApply(preview)} disabled={!preview}>
              Insert Image
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={mLabelStyle}>Image URL <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              autoFocus style={mInputStyle} type="text" placeholder="https://example.com/image.jpg"
              value={url} onChange={(e) => setUrl(e.target.value)}
              onFocus={(e) => (e.target.style.borderColor = '#002060')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>
          {url && url !== 'https://' && (
            <img src={url} alt="preview" onError={(e) => (e.target.style.display = 'none')}
              style={{ maxHeight: '140px', maxWidth: '100%', borderRadius: '8px', objectFit: 'contain', background: '#f1f5f9' }} />
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button style={mCancelBtn} onClick={onClose}>Cancel</button>
            <button style={{ ...mPrimaryBtn, opacity: (!url || url === 'https://') ? 0.5 : 1 }}
              onClick={() => onApply(url)} disabled={!url || url === 'https://'}>
              Insert Image
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel = 'Confirm', confirmColor = '#ef4444', onClose, onConfirm }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6, marginBottom: '24px' }}>{message}</p>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button style={mCancelBtn} onClick={onClose}>Cancel</button>
        <button style={{ ...mPrimaryBtn, background: confirmColor }} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

// ─── Shared Modal Styles ──────────────────────────────────────────────────────
const mLabelStyle = {
  display: 'block', fontFamily: "'Sora', sans-serif",
  fontSize: '12px', fontWeight: 700, color: '#002060',
  marginBottom: '8px', letterSpacing: '0.02em',
};
const mHintStyle = { fontSize: '11px', color: '#94a3b8', marginTop: '5px' };
const mInputStyle = {
  width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
  borderRadius: '10px', fontSize: '14px', fontFamily: "'Lato', sans-serif",
  color: '#0f172a', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
};
const mCancelBtn = {
  padding: '10px 20px', borderRadius: '10px', border: '1.5px solid #e2e8f0',
  background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 700,
  fontFamily: "'Sora', sans-serif", cursor: 'pointer',
};
const mPrimaryBtn = {
  padding: '10px 20px', borderRadius: '10px', border: 'none',
  background: '#002060', color: '#fff', fontSize: '13px', fontWeight: 700,
  fontFamily: "'Sora', sans-serif", cursor: 'pointer', transition: 'opacity 0.2s',
};

// ─── Toolbar Styles ───────────────────────────────────────────────────────────
const toolbarBtnStyle = {
  padding: '6px 12px', background: '#ffffff', border: '1px solid #e2e8f0',
  borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
  transition: 'all 0.2s', fontFamily: "'DM Sans', sans-serif",
};
const selectStyle = {
  padding: '6px 12px', background: '#ffffff', border: '1px solid #e2e8f0',
  borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontFamily: "'DM Sans', sans-serif",
};
const colorPickerStyle = {
  width: '32px', height: '32px', padding: '4px', border: '1px solid #e2e8f0',
  borderRadius: '6px', cursor: 'pointer', background: '#ffffff',
};
const dividerStyle = { width: '1px', height: '28px', background: '#e2e8f0', margin: '0 4px' };

// ─── Rich Text Toolbar ────────────────────────────────────────────────────────
function RichTextToolbar({ editorRef }) {
  const [linkPopover, setLinkPopover] = useState({ visible: false, x: 0, y: 0 });
  const [linkUrl, setLinkUrl] = useState('https://');
  const [savedRange, setSavedRange] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const popoverRef = useRef(null);

  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  // If text is selected → show inline popover; else → open full modal
  const handleLinkClick = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      setSavedRange(selection.getRangeAt(0).cloneRange());
    }
    if (selection && !selection.isCollapsed) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setLinkUrl('https://');
      setLinkPopover({ visible: true, x: rect.left + window.scrollX, y: rect.bottom + window.scrollY + 8 });
    } else {
      setShowLinkModal(true);
    }
  };

  const applyInlineLink = () => {
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    if (linkUrl && linkUrl !== 'https://') {
      document.execCommand('createLink', false, linkUrl);
      editorRef.current?.querySelectorAll('a').forEach(a => {
        if (a.href === linkUrl) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      });
    }
    setLinkPopover({ visible: false, x: 0, y: 0 });
    setSavedRange(null);
    editorRef.current?.focus();
  };

  const removeInlineLink = () => {
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
      document.execCommand('unlink', false, null);
    }
    setLinkPopover({ visible: false, x: 0, y: 0 });
    setSavedRange(null);
    editorRef.current?.focus();
  };

  const applyLinkFromModal = (url, label) => {
    setShowLinkModal(false);
    if (!url || url === 'https://') return;
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    if (label && label.trim()) {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = label.trim();
      if (savedRange) { savedRange.deleteContents(); savedRange.insertNode(a); }
    } else {
      document.execCommand('createLink', false, url);
      editorRef.current?.querySelectorAll('a').forEach(a => {
        if (a.href === url) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      });
    }
    setSavedRange(null);
    editorRef.current?.focus();
  };

  const applyImageFromModal = (src) => {
    setShowImageModal(false);
    if (!src) return;
    editorRef.current?.focus();
    document.execCommand('insertImage', false, src);
    editorRef.current?.focus();
  };

  // Close inline popover on outside click
  useEffect(() => {
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setLinkPopover({ visible: false, x: 0, y: 0 });
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setFormat = (format) => { document.execCommand('formatBlock', false, format); editorRef.current?.focus(); };

  return (
    <>
      {showLinkModal && <LinkModal onClose={() => setShowLinkModal(false)} onApply={applyLinkFromModal} />}
      {showImageModal && <ImageModal onClose={() => setShowImageModal(false)} onApply={applyImageFromModal} />}

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '8px 12px',
        background: '#ffffff', border: '1px solid #e2e8f0', borderBottom: 'none',
        borderRadius: '12px 12px 0 0',
      }}>
        <select onChange={(e) => setFormat(e.target.value)} style={selectStyle} defaultValue="p">
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="pre">Preformatted</option>
        </select>
        <div style={dividerStyle} />

        <button type="button" onClick={() => execCommand('bold')} title="Bold" style={toolbarBtnStyle}><b>B</b></button>
        <button type="button" onClick={() => execCommand('italic')} title="Italic" style={toolbarBtnStyle}><i>I</i></button>
        <button type="button" onClick={() => execCommand('underline')} title="Underline" style={toolbarBtnStyle}><u>U</u></button>
        <button type="button" onClick={() => execCommand('strikeThrough')} title="Strikethrough" style={toolbarBtnStyle}><s>S</s></button>
        <div style={dividerStyle} />

        <input type="color" title="Text Color" onChange={(e) => execCommand('foreColor', e.target.value)} style={colorPickerStyle} defaultValue="#000000" />
        <input type="color" title="Background Color" onChange={(e) => execCommand('backColor', e.target.value)} style={colorPickerStyle} defaultValue="#ffff00" />
        <div style={dividerStyle} />

        <button type="button" onClick={() => execCommand('insertUnorderedList')} title="Bullet List" style={toolbarBtnStyle}>• List</button>
        <button type="button" onClick={() => execCommand('insertOrderedList')} title="Numbered List" style={toolbarBtnStyle}>1. List</button>
        <div style={dividerStyle} />

        <button type="button" onClick={() => execCommand('justifyLeft')} title="Align Left" style={toolbarBtnStyle}>⬅️</button>
        <button type="button" onClick={() => execCommand('justifyCenter')} title="Align Center" style={toolbarBtnStyle}>⬌</button>
        <button type="button" onClick={() => execCommand('justifyRight')} title="Align Right" style={toolbarBtnStyle}>➡️</button>
        <button type="button" onClick={() => execCommand('justifyFull')} title="Justify" style={toolbarBtnStyle}>☰</button>
        <div style={dividerStyle} />

        <button type="button" onClick={handleLinkClick} title="Insert Link" style={toolbarBtnStyle}>🔗 Link</button>
        <button type="button" onClick={() => setShowImageModal(true)} title="Insert Image" style={toolbarBtnStyle}>🖼️ Image</button>
        <div style={dividerStyle} />

        <button type="button" onClick={() => execCommand('undo')} title="Undo" style={toolbarBtnStyle}>↩️</button>
        <button type="button" onClick={() => execCommand('redo')} title="Redo" style={toolbarBtnStyle}>↪️</button>
        <div style={dividerStyle} />

        <button type="button" onClick={() => execCommand('removeFormat')} title="Remove Format" style={toolbarBtnStyle}>✕ Clear</button>
      </div>

      {/* Inline Link Popover (text pre-selected) */}
      {linkPopover.visible && (
        <div ref={popoverRef} style={{
          position: 'fixed', top: linkPopover.y, left: linkPopover.x, zIndex: 99999,
          background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)', padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: '8px', minWidth: '320px',
          animation: 'slideDown 0.15s ease-out',
        }}>
          <span style={{ fontSize: '16px', color: '#64748b', flexShrink: 0 }}>🔗</span>
          <input
            autoFocus type="text" value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyInlineLink(); if (e.key === 'Escape') setLinkPopover({ visible: false, x: 0, y: 0 }); }}
            placeholder="Paste URL or type to search"
            style={{ flex: 1, border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', outline: 'none', color: '#0f172a' }}
            onFocus={(e) => (e.target.style.borderColor = '#002060')}
            onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
          />
          <button type="button" onClick={applyInlineLink} title="Apply" style={{ width: '32px', height: '32px', background: '#1d6fdf', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>↵</button>
          <button type="button" onClick={removeInlineLink} title="Remove Link" style={{ width: '32px', height: '32px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function CreateKBForm() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();
  const location = useLocation();
  const editorRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const editArticle = location.state?.editArticle;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [categories, setCategories] = useState([]);
  const [assignmentGroups, setAssignmentGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [articleId, setArticleId] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });
  const [wordCount, setWordCount] = useState(0);
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', onConfirm: null });

  // Scope
  const [scope, setScope] = useState('everyone');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [categoriesRes, groupsRes] = await Promise.all([
          axios.get(`${BACKEND}/api/categories`),
          axios.get(`${BACKEND}/api/assignment-groups`)
        ]);
        setCategories(categoriesRes.data || []);
        setAssignmentGroups(groupsRes.data || []);
      } catch (err) {
        showToast('Failed to load categories or groups', 'error');
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchGraph = async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]); setShowDropdown(false); setSearching(false); return;
    }
    setSearching(true); setShowDropdown(true);
    try {
      const token = await instance.acquireTokenSilent({ scopes: ['User.Read.All', 'Group.Read.All'], account: accounts[0] });
      const results = [];
      const userFilter = `startswith(displayName,'${query}') or startswith(mail,'${query}') or startswith(userPrincipalName,'${query}')`;
      const userRes = await fetch(`https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(userFilter)}&$select=id,displayName,mail,userPrincipalName&$top=8`, { headers: { Authorization: `Bearer ${token.accessToken}` } });
      const userData = await userRes.json();
      results.push(...(userData.value || []).map(u => ({ id: u.id, name: u.displayName || u.mail || '(no name)', email: u.mail || u.userPrincipalName || '', type: 'user' })));
      const groupFilter = `startswith(displayName,'${query}')`;
      const groupRes = await fetch(`https://graph.microsoft.com/v1.0/groups?$filter=${encodeURIComponent(groupFilter)}&$select=id,displayName&$top=8`, { headers: { Authorization: `Bearer ${token.accessToken}` } });
      const groupData = await groupRes.json();
      results.push(...(groupData.value || []).map(g => ({ id: g.id, name: g.displayName, email: '', type: 'group' })));
      setSearchResults(results);
    } catch (err) { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const fetchGroupMembers = async (groupId, groupName) => {
    try {
      const token = await instance.acquireTokenSilent({ scopes: ['Group.Read.All', 'User.Read.All'], account: accounts[0] });
      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,mail,userPrincipalName`, { headers: { Authorization: `Bearer ${token.accessToken}` } });
      const data = await res.json();
      const members = (data.value || []).map(m => ({ id: m.id, name: m.displayName || m.mail || '(no name)', email: m.mail || m.userPrincipalName || '', type: 'user' }));
      setSelectedUsers(prev => { const filtered = prev.filter(u => !members.some(m => m.id === u.id)); return [...filtered, ...members]; });
      showToast(`Added ${members.length} members from "${groupName}"`, 'success');
    } catch (err) { showToast('Failed to fetch group members', 'error'); }
  };

  const handleSearch = (value) => { setSearchQuery(value); searchGraph(value); };

  const selectItem = (item) => {
    setShowDropdown(false); setSearchQuery(''); setSearchResults([]);
    if (item.type === 'user') {
      if (!selectedUsers.find(u => u.id === item.id)) {
        setSelectedUsers(prev => [...prev, { id: item.id, name: item.name, email: item.email, type: 'user' }]);
        showToast(`Added "${item.name}"`, 'success');
      } else { showToast('User already selected', 'error'); }
    } else if (item.type === 'group') { fetchGroupMembers(item.id, item.name); }
  };

  const removeUser = (userId) => setSelectedUsers(prev => prev.filter(u => u.id !== userId));

  useEffect(() => {
    if (editArticle) {
      setIsEditMode(true); setArticleId(editArticle._id);
      setTitle(editArticle.title || ''); setDescription(editArticle.description || '');
      setContent(editArticle.content || ''); setSelectedCategory(editArticle.category || null);
      setSelectedGroup(editArticle.assignmentGroup || null);
      if (editArticle.scope) {
        setScope(editArticle.scope.type || 'everyone');
        if (editArticle.scope.type === 'other' && editArticle.scope.users) setSelectedUsers(editArticle.scope.users);
      }
    }
  }, [editArticle]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.contentEditable = 'true';
      editorRef.current.innerHTML = (isEditMode && content) ? content : '';
      const update = () => {
        const text = editorRef.current.innerText || '';
        setWordCount(text.trim().split(/\s+/).filter(w => w.length > 0).length);
        setContent(editorRef.current.innerHTML);
      };
      editorRef.current.addEventListener('input', update);
      update();
      return () => editorRef.current?.removeEventListener('input', update);
    }
  }, [isEditMode]);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3500);
  };

  const handleCancel = () => {
    setConfirmModal({
      open: true,
      title: '↩ Leave Page?',
      message: 'You have unsaved changes. Are you sure you want to go back? All progress will be lost.',
      onConfirm: () => navigate('/settings/create-kb'),
    });
  };

  const saveArticle = async (status) => {
    if (!title.trim()) { showToast('Please enter an article title', 'error'); return; }
    const articleContent = editorRef.current?.innerHTML || '';
    if (!articleContent || articleContent === '<br>' || articleContent === '<div><br></div>') {
      showToast('Please add some content to the article', 'error'); return;
    }
    if (!selectedCategory) { showToast('Please select a category', 'error'); return; }
    if (!selectedGroup) { showToast('Please select an assignment group', 'error'); return; }
    if (scope === 'other' && selectedUsers.length === 0) {
      showToast('Please select at least one user/group for restricted access', 'error'); return;
    }
    setLoading(true);
    try {
      const payload = {
        title: title.trim(), description: description.trim(), content: articleContent,
        category: { id: selectedCategory.id || selectedCategory._id, name: selectedCategory.categoryName || selectedCategory.name },
        assignmentGroup: { groupId: selectedGroup._id, groupName: selectedGroup.name },
        status,
        scope: { type: scope, users: scope === 'other' ? selectedUsers : [] },
        createdBy: { id: accounts[0]?.localAccountId || '', name: accounts[0]?.name || '', email: accounts[0]?.username || '' },
        updatedBy: { id: accounts[0]?.localAccountId || '', name: accounts[0]?.name || '', email: accounts[0]?.username || '' },
        tags: [],
      };
      let url = `${BACKEND}/api/kb/articles`;
      let method = 'post';
      if (isEditMode && articleId) { url = `${BACKEND}/api/kb/articles/${articleId}`; method = 'put'; }
      await axios({ method, url, data: payload });
      showToast(`Article ${status === 'published' ? 'published' : 'saved as draft'} successfully!`, 'success');
      setTimeout(() => navigate('/settings/create-kb'), 1500);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save article', 'error');
    } finally { setLoading(false); }
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --navy: #002060; --navy2: #003090; --orange: #e98404; --white: #ffffff; --bg: #f5f7fa; --border: #e2e8f0; --text: #0f172a; --muted: #64748b; --light: #f8fafc; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes modalUp { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

    .kb-form-page { min-height: 100vh; width: 100%; background: var(--bg); font-family: 'Lato', sans-serif; color: var(--text); }
    .kb-form-hero { background: var(--navy); position: relative; overflow: hidden; padding: 48px 48px 44px; }
    .kb-form-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%); pointer-events: none; }
    .kb-form-hero-inner { position: relative; z-index: 2; max-width: 1200px; margin: 0 auto; animation: fadeUp 0.55s ease both; }
    .kb-form-hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--orange); margin-bottom: 14px; }
    .kb-form-hero-eyebrow-line { width: 28px; height: 2px; background: var(--orange); border-radius: 2px; }
    .kb-form-hero h1 { font-family: 'Sora', sans-serif; font-size: clamp(28px, 3vw, 36px); font-weight: 800; color: #ffffff; line-height: 1.15; margin-bottom: 8px; letter-spacing: -0.02em; }
    .kb-form-hero h1 em { font-style: normal; color: var(--orange); }
    .kb-form-hero-sub { font-size: 15px; color: rgba(255,255,255,0.62); font-weight: 400; line-height: 1.6; }
    .kb-form-content { max-width: 1200px; margin: 0 auto; padding: 32px 48px 56px; }
    .kb-form-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 24px; overflow: hidden; animation: fadeUp 0.4s ease both; }
    .kb-form-header { padding: 28px 32px; border-bottom: 1.5px solid var(--border); background: var(--light); }
    .kb-form-header h2 { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 700; color: var(--navy); margin-bottom: 4px; }
    .kb-form-header p { font-size: 14px; color: var(--muted); }
    .kb-form-body { padding: 32px; }
    .kb-form-group { margin-bottom: 28px; }
    .kb-label { display: block; font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 10px; letter-spacing: 0.02em; }
    .kb-label .required { color: #ef4444; margin-left: 4px; }
    .kb-input, .kb-textarea { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; transition: all 0.2s; }
    .kb-input:focus, .kb-textarea:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 3px rgba(0,32,96,0.08); }
    .kb-textarea { resize: vertical; min-height: 80px; }
    .kb-select { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; cursor: pointer; }
    .kb-select:focus { outline: none; border-color: var(--navy); }
    .kb-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .rich-editor-container { border: 1.5px solid var(--border); border-radius: 12px; overflow: visible; background: var(--white); }
    .rich-editor-content { min-height: 400px; padding: 16px; background: var(--white); font-size: 14px; line-height: 1.6; outline: none; overflow-y: auto; border-radius: 0; }
    .rich-editor-content:focus { outline: none; }
    .rich-editor-content img { max-width: 100%; height: auto; border-radius: 6px; }
    .rich-editor-content h1, .rich-editor-content h2, .rich-editor-content h3 { margin: 16px 0 8px; }
    .rich-editor-content p { margin-bottom: 12px; }
    .rich-editor-content ul, .rich-editor-content ol { margin: 8px 0 12px 24px; }
    .rich-editor-content a { color: #1d6fdf; text-decoration: underline; }
    .kb-actions { display: flex; justify-content: flex-end; gap: 16px; margin-top: 32px; padding-top: 24px; border-top: 1.5px solid var(--border); }
    .kb-btn { padding: 12px 28px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s; border: none; }
    .kb-btn-draft { background: var(--white); border: 1.5px solid var(--border); color: var(--muted); }
    .kb-btn-draft:hover { border-color: var(--navy); color: var(--navy); }
    .kb-btn-publish { background: var(--navy); color: white; box-shadow: 0 4px 12px rgba(0,32,96,0.2); }
    .kb-btn-publish:hover:not(:disabled) { background: var(--navy2); transform: translateY(-2px); }
    .kb-btn-cancel { background: var(--white); border: 1.5px solid var(--border); color: var(--muted); }
    .kb-btn-cancel:hover { border-color: #ef4444; color: #ef4444; }
    .kb-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .editor-footer { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; border-radius: 0 0 10px 10px; }
    .auto-save { display: flex; align-items: center; gap: 6px; }
    .scope-container { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 16px; }
    .radio-group { display: flex; gap: 24px; margin-bottom: 16px; }
    .radio-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text); }
    .radio-label input[type="radio"] { width: 16px; height: 16px; cursor: pointer; accent-color: var(--navy); }
    .user-search-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
    .search-wrapper { position: relative; overflow: visible; }
    .user-search-input { width: 100%; padding: 12px 16px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; background: var(--white); }
    .user-search-input:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 3px rgba(0,32,96,0.08); }
    .search-dropdown { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--white); border: 1.5px solid var(--border); border-radius: 16px; box-shadow: 0 12px 40px rgba(0,32,96,0.18); z-index: 9999; max-height: 300px; overflow-y: auto; animation: slideDown 0.15s ease-out; }
    .dropdown-item { display: flex; align-items: center; gap: 14px; padding: 14px 20px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s; }
    .dropdown-item:hover { background: var(--bg); }
    .item-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
    .item-icon.user { background: rgba(0,32,96,0.1); }
    .item-icon.group { background: rgba(233,132,4,0.1); }
    .item-info { flex: 1; }
    .item-name { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 3px; }
    .item-email, .item-type { font-size: 11px; color: var(--muted); }
    .item-type { margin-top: 2px; text-transform: uppercase; font-weight: 700; }
    .dropdown-empty { padding: 24px; text-align: center; color: var(--muted); font-size: 14px; }
    .searching-indicator { margin-top: 12px; font-size: 12px; color: var(--muted); text-align: center; }
    .selected-users { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; max-height: 200px; overflow-y: auto; }
    .user-tag { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; background: #e8f0fe; border-radius: 20px; font-size: 12px; color: var(--navy); }
    .remove-user { cursor: pointer; font-weight: bold; color: #ef4444; margin-left: 4px; }
    .user-count-badge { margin-top: 12px; font-size: 12px; color: var(--muted); font-weight: 500; }
    .kb-toast { position: fixed; bottom: 32px; right: 32px; z-index: 10000; padding: 14px 24px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); font-size: 14px; font-weight: 600; animation: slideIn 0.3s ease; font-family: 'Sora', sans-serif; }
    .kb-toast-success { background: #10b981; color: white; }
    .kb-toast-error { background: #ef4444; color: white; }
    .kb-back-btn { background: none; border: none; font-size: 14px; font-weight: 600; color: var(--navy); cursor: pointer; margin-bottom: 20px; display: inline-flex; align-items: center; gap: 6px; font-family: 'Sora', sans-serif; }
    .kb-back-btn:hover { color: var(--orange); }
    @media (max-width: 768px) {
      .kb-form-hero { padding: 32px 24px; }
      .kb-form-content { padding: 20px; }
      .kb-row { grid-template-columns: 1fr; }
      .kb-actions { flex-wrap: wrap; }
      .kb-btn { flex: 1; text-align: center; }
      .radio-group { flex-direction: column; gap: 12px; }
    }
  `;

  return (
    <div className="kb-form-page">
      <style>{sharedCSS}</style>

      {confirmModal.open && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel="Yes, Leave"
          confirmColor="#ef4444"
          onClose={() => setConfirmModal(p => ({ ...p, open: false }))}
          onConfirm={() => { setConfirmModal(p => ({ ...p, open: false })); confirmModal.onConfirm?.(); }}
        />
      )}

      <div className="kb-form-hero">
        <div className="kb-form-hero-inner">
          <div className="kb-form-hero-eyebrow">
            <div className="kb-form-hero-eyebrow-line" />
            Knowledge Base
          </div>
          <h1>{isEditMode ? 'Edit' : 'Create'} <em>Article</em></h1>
          <p className="kb-form-hero-sub">Write and publish helpful documentation for your team</p>
        </div>
      </div>

      <div className="kb-form-content">
        <button className="kb-back-btn" onClick={handleCancel}>← Back to Articles List</button>

        <div className="kb-form-card">
          <div className="kb-form-header">
            <h2>{isEditMode ? 'Edit Knowledge Article' : 'Create New Knowledge Article'}</h2>
            <p>Fill in the details below to {isEditMode ? 'update the' : 'create a new'} knowledge base article</p>
          </div>

          <div className="kb-form-body">
            {/* Title */}
            <div className="kb-form-group">
              <label className="kb-label">Article Title <span className="required">*</span></label>
              <input className="kb-input" type="text" placeholder="e.g., How to Reset Password in Azure AD" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            {/* Category + Group */}
            <div className="kb-row">
              <div className="kb-form-group">
                <label className="kb-label">Category <span className="required">*</span></label>
                <select className="kb-select" value={selectedCategory?._id || selectedCategory?.id || ''}
                  onChange={(e) => { const cat = categories.find(c => (c._id || c.id) === e.target.value); setSelectedCategory(cat || null); }}>
                  <option value="">Select a category...</option>
                  {categories.map(cat => <option key={cat._id || cat.id} value={cat._id || cat.id}>{cat.categoryName || cat.name}</option>)}
                </select>
              </div>
              <div className="kb-form-group">
                <label className="kb-label">Assignment Group <span className="required">*</span></label>
                <select className="kb-select" value={selectedGroup?._id || ''}
                  onChange={(e) => { const group = assignmentGroups.find(g => g._id === e.target.value); setSelectedGroup(group || null); }}>
                  <option value="">Select an assignment group...</option>
                  {assignmentGroups.map(group => <option key={group._id} value={group._id}>{group.name}</option>)}
                </select>
              </div>
            </div>

            {/* Description */}
            <div className="kb-form-group">
              <label className="kb-label">Short Description</label>
              <textarea className="kb-textarea" placeholder="Brief summary of the article (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            {/* Scope */}
            <div className="kb-form-group">
              <label className="kb-label">Who can view this article? <span className="required">*</span></label>
              <div className="scope-container">
                <div className="radio-group">
                  <label className="radio-label">
                    <input type="radio" name="scope" value="everyone" checked={scope === 'everyone'} onChange={() => setScope('everyone')} />
                    Everyone (All users can view)
                  </label>
                  <label className="radio-label">
                    <input type="radio" name="scope" value="other" checked={scope === 'other'} onChange={() => setScope('other')} />
                    Specific Users/Groups Only
                  </label>
                </div>
                {scope === 'other' && (
                  <div className="user-search-section">
                    <div className="search-wrapper">
                      <input ref={inputRef} className="user-search-input" type="text"
                        placeholder="Search users or groups by name or email..."
                        value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
                        onFocus={() => searchQuery.trim().length >= 2 && setShowDropdown(true)} autoComplete="off" />
                      {searching && <div className="searching-indicator">Searching...</div>}
                      {showDropdown && searchResults.length > 0 && (
                        <div ref={dropdownRef} className="search-dropdown">
                          {searchResults.map((item, idx) => (
                            <div key={`${item.type}-${item.id}-${idx}`} className="dropdown-item"
                              onMouseDown={(e) => e.preventDefault()} onClick={() => selectItem(item)}>
                              <div className={`item-icon ${item.type}`}>{item.type === 'user' ? '👤' : '👥'}</div>
                              <div className="item-info">
                                <div className="item-name">{item.name}</div>
                                {item.email && <div className="item-email">{item.email}</div>}
                                <div className="item-type">{item.type}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {showDropdown && !searching && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
                        <div className="search-dropdown">
                          <div className="dropdown-empty">No users or groups found for "{searchQuery}"</div>
                        </div>
                      )}
                    </div>
                    {selectedUsers.length > 0 && (
                      <>
                        <div className="user-count-badge">📌 {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected</div>
                        <div className="selected-users">
                          {selectedUsers.map(user => (
                            <div key={user.id} className="user-tag">
                              <span>{user.name} {user.email && `(${user.email})`}</span>
                              <span className="remove-user" onClick={() => removeUser(user.id)}>✕</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                {scope === 'everyone' ? '✓ This article will be visible to all users' : '🔒 Only selected users will have access. Adding a group includes all its members.'}
              </div>
            </div>

            {/* Rich Text Editor */}
            <div className="kb-form-group">
              <label className="kb-label">Content <span className="required">*</span></label>
              <div className="rich-editor-container">
                <RichTextToolbar editorRef={editorRef} />
                <div ref={editorRef} className="rich-editor-content" contentEditable="true" />
                <div className="editor-footer">
                  <div className="auto-save"><span>📝</span><span>Draft auto-saves in your browser</span></div>
                  <div>Word count: {wordCount}</div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                💡 Select text → click 🔗 Link to insert a link &nbsp;·&nbsp; Click 🖼️ Image to upload from your device or use a URL
              </div>
            </div>

            {/* Actions */}
            <div className="kb-actions">
              <button className="kb-btn kb-btn-cancel" onClick={handleCancel}>Cancel</button>
              <button className="kb-btn kb-btn-draft" onClick={() => saveArticle('draft')} disabled={loading}>
                {loading ? 'Saving...' : '💾 Save as Draft'}
              </button>
              <button className="kb-btn kb-btn-publish" onClick={() => saveArticle('published')} disabled={loading}>
                {loading ? 'Publishing...' : '📢 Publish'}
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '16px' }}>
              {loading ? 'Processing...' : 'Drafts are only visible to admins. Published articles are visible based on the scope above.'}
            </div>
          </div>
        </div>
      </div>

      {toast.open && (
        <div className={`kb-toast kb-toast-${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default CreateKBForm;