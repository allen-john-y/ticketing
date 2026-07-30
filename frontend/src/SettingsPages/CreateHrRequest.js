// src/SettingsPages/CreateHrRequest.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';
import onboardingImg from './onboarding.png';
import offboardingImg from './offboarding.png';
import hrImg from './HR.png';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// ✅ Request types that use a dedicated image instead of an emoji.
const NAME_ICON_MAP = {
  onboarding: onboardingImg,
  offboarding: offboardingImg,
};

const getNameIcon = (name = '') => NAME_ICON_MAP[name.trim().toLowerCase()] || null;

// ✅ All standard emojis
const getAllEmojis = () => {
  const emojis = [
    '👤', '👥', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍🏫', '👨‍🏫', '👩‍🏫',
    '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🧑‍🔧', '👨‍🔧', '👩‍🔧', '🧑‍🔬', '👨‍🔬',
    '👩‍🔬', '🧑‍🎓', '👨‍🎓', '👩‍🎓', '🧑‍💼', '👨‍💼', '👩‍💼',
    '💼', '📋', '📊', '📈', '📉', '📑', '📄', '📃', '📁', '📂',
    '📅', '📆', '📌', '📍', '📎', '📏', '📐', '✏️', '📝', '📖',
    '📚', '📕', '📗', '📘', '📙', '📔', '📒', '📓', '📰', '🗂️',
    '🗃️', '🗄️', '📇', '📋', '📌', '📍', '✂️', '📎', '🖇️',
    '💻', '🖥️', '⌨️', '🖱️', '🖨️', '📱', '📲', '📞', '📟', '📠',
    '🔒', '🔓', '🔐', '🔑', '🛡️', '🖌️', '🖍️', '📀', '💾', '💿',
    '🖲️', '🖥️', '🖨️', '🖱️', '⌨️', '🕹️', '📡', '📶', '📳', '📴',
    '🤖', '⚙️', '🔧', '🔨', '🛠️', '🧰', '🧲', '💡', '🔦', '🔭',
    '🔬', '🧪', '🧫', '🧬', '🔮', '🪄', '🪬',
    '💰', '💳', '💵', '💶', '💷', '💴', '🪙', '💸', '🏦', '🏧',
    '💹', '📊', '📈', '📉', '🧾', '💎', '🧮',
    '📧', '📨', '📩', '📤', '📥', '📦', '📫', '📪', '📬', '📭',
    '📮', '✉️', '📝', '💬', '💭', '🗨️', '🗯️', '💌', '📯', '📢',
    '📣', '🔊', '🔉', '🔈', '🔇', '📻', '📺', '🎙️', '🎚️', '🎛️',
    '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪',
    '🏫', '🏬', '🏭', '🏯', '🏰', '🌆', '🌇', '🌃', '🌉', '🌁',
    '✈️', '🚀', '🛸', '🚁', '🚂', '🚄', '🚅', '🚇', '🚉', '🚊',
    '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖',
    '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🏎️', '🏍️', '🛵', '🚲',
    '🛴', '🛹', '🛼', '🛰️', '🛬', '🛫', '🛩️', '🛳️', '⛵', '🚤',
    '🛶', '🚢', '🎢', '🎠', '🎡', '🎪', '🎭', '🎨', '🎬', '🎤',
    '🍕', '🍔', '🌮', '🌯', '🥗', '🥘', '🍝', '🍜', '🍲', '🍛',
    '🍣', '🥩', '🥓', '🥪', '🥙', '🧆', '🌭', '🧇', '🥞', '🧈',
    '🍳', '🥚', '🍞', '🥐', '🥖', '🥨', '🧀', '🥛', '☕', '🫖',
    '🍵', '🧃', '🥤', '🧋', '🧊', '🍶', '🍾', '🍷', '🍸', '🍹',
    '🍺', '🍻', '🥂', '🥃', '🥤', '🧃', '🧋', '🧊', '🍦', '🍧',
    '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭',
    '🍮', '🍯', '🧂', '🌶️', '🧄', '🧅', '🍄', '🥜', '🌰', '🫘',
    '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
    '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '⛳', '🏹', '🎣',
    '🥊', '🥋', '🎽', '🛹', '🛼', '⛸️', '🎿', '🏂', '🏋️', '🤼',
    '🤸', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣',
    '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎗️',
    '🌍', '🌎', '🌏', '🌐', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖',
    '🌗', '🌘', '🌙', '🌚', '🌛', '🌜', '☀️', '🌤️', '⛅', '🌥️',
    '🌦️', '🌧️', '⛈️', '🌨️', '🌩️', '⛄', '☃️', '🌲', '🌳', '🌴',
    '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🪴', '🌱',
    '🌸', '🌺', '🌻', '🌹', '🥀', '🌷', '💐', '🌼', '🌞', '🌈',
    '🦋', '🐛', '🐝', '🐞', '🦟', '🪰', '🪲', '🪳', '🦗', '🐜',
    '🐌', '🐚', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅',
    '🐆', '🐘', '🦏', '🦛', '🐫', '🐪', '🦒', '🐄', '🐃', '🐂',
    '🐏', '🐑', '🐐', '🦌', '🐕', '🦮', '🐕‍🦺', '🐩', '🐈', '🐈‍⬛',
    '🐓', '🦃', '🦆', '🦢', '🦉', '🦤', '🐧', '🐦', '🐤', '🐣',
    '🐥', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋',
    '🐞', '🐜', '🪰', '🪲', '🪳', '🪟', '🪠',
    '🎉', '🎊', '🎈', '🎁', '🎀', '🎃', '🎄', '🎅', '🧑‍🎄', '🦌',
    '🦃', '⛄', '🎆', '🎇', '✨', '🎋', '🎍', '🎎', '🎏', '🎐',
    '🎑', '🎒', '🎓', '🎖️', '🎗️', '🎙️', '🎚️', '🎛️', '🎞️', '🎟️',
    '🎠', '🎡', '🎢', '🎣', '🎤', '🎥', '🎦', '🎧', '🎨', '🎩',
    '🎪', '🎫', '🎬', '🎭', '🎮', '🎯', '🎰', '🎱', '🎲', '🎳',
    '🎴', '🎵', '🎶', '🎷', '🎸', '🎹', '🎺', '🎻', '🥁', '🪘',
    '🎼', '🎧', '🎤', '🎫', '🎖️', '🏅', '🎗️', '🎞️', '🎟️',
    '🔄', '⏰', '⏱️', '⏲️', '⏳', '⏩', '⏪', '⏫', '⏬', '▶️',
    '⏸️', '⏹️', '⏺️', '⏏️', '🎦', '🔀', '🔁', '🔂', '🔄', '🔃',
    '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫', '⚪', '🟥', '🟧',
    '🟨', '🟩', '🟦', '🟪', '🟫', '⬛', '⬜', '◼️', '◻️', '◾',
    '◽', '▪️', '▫️', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠',
  ];
  return [...new Set(emojis)];
};

const ALL_EMOJIS = getAllEmojis();

export default function CreateHrRequest() {
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const currentUser = accounts[0] || {};

  // ─── HR Request Types State ───
  const [hrRequests, setHrRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    emoji: '📋',
    name: '',
    description: '',
  });

  // ─── HR Access Management State ───
  const [hrAccessUsers, setHrAccessUsers] = useState([]);
  const [accessLoading, setAccessLoading] = useState(false);
  
  // Batch selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // ─── UI State ───
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showEmojiModal, setShowEmojiModal] = useState(false);
  const [activeTab, setActiveTab] = useState('types');

  const formTopRef = useRef(null);

  // ─── Fetch Data ───
  useEffect(() => {
    fetchHrRequests();
    fetchHrAccessUsers();
  }, []);

  // Click outside handler for dropdown
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  // ─── HR Request Types CRUD ───
  const fetchHrRequests = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/hr-requests`);
      setHrRequests(res.data || []);
    } catch (err) {
      console.error('Error fetching HR requests:', err);
      showToast('Failed to load HR request types', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEmojiSelect = (emoji) => {
    setFormData(prev => ({ ...prev, emoji }));
    setShowEmojiModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    if (!formData.emoji) {
      showToast('Please choose an icon', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        name: formData.name.trim(),
        description: formData.description.trim() || '',
        createdBy: {
          id: currentUser.localAccountId || '',
          name: currentUser.name || '',
          email: currentUser.username || '',
        },
      };

      if (editingId) {
        await axios.put(`${BACKEND}/api/hr-requests/${editingId}`, payload);
        showToast('HR request type updated', 'success');
      } else {
        await axios.post(`${BACKEND}/api/hr-requests`, payload);
        showToast('HR request type added', 'success');
      }

      resetForm();
      fetchHrRequests();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to save';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ emoji: '📋', name: '', description: '' });
    setEditingId(null);
    setShowEmojiModal(false);
  };

  const handleEdit = (item) => {
    setFormData({
      emoji: item.emoji || '📋',
      name: item.name || '',
      description: item.description || '',
    });
    setEditingId(item._id);
    setActiveTab('types');
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${BACKEND}/api/hr-requests/${deleteTarget._id}`);
      showToast(`"${deleteTarget.name}" deleted`, 'success');
      setShowDeleteModal(false);
      setDeleteTarget(null);
      fetchHrRequests();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to delete';
      showToast(msg, 'error');
    }
  };

  const openDeleteModal = (item) => {
    setDeleteTarget(item);
    setShowDeleteModal(true);
  };

  const getUsedEmojis = () => {
    const used = new Set();
    hrRequests.forEach(item => {
      if (item.emoji) {
        if (editingId && item._id === editingId) return;
        used.add(item.emoji);
      }
    });
    return used;
  };

  const getAvailableEmojis = () => {
    const usedEmojis = getUsedEmojis();
    return ALL_EMOJIS.filter(emoji => !usedEmojis.has(emoji));
  };

  const availableEmojis = getAvailableEmojis();

  // ─── HR Access Management ───
  const fetchHrAccessUsers = async () => {
    setAccessLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/hr-access`);
      setHrAccessUsers(res.data || []);
    } catch (err) {
      console.error('Error fetching HR access users:', err);
    } finally {
      setAccessLoading(false);
    }
  };

  // ─── LIVE SEARCH: Search Azure AD users ───
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
      
      // Get emails of already selected users
      const selectedEmails = new Set(selectedUsers.map(u => u.mail.toLowerCase()));
      // Get emails of already granted users
      const existingEmails = new Set(hrAccessUsers.map(u => u.email.toLowerCase()));
      
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

  // ─── Click on dropdown row → add user to selection ───
  const selectUser = (user) => {
    // Check if already selected
    if (selectedUsers.some(u => u.mail.toLowerCase() === user.mail.toLowerCase())) {
      showToast(`"${user.displayName}" is already in the selection list`, 'error');
      return;
    }
    // Check if already has access
    if (hrAccessUsers.some(u => u.email.toLowerCase() === user.mail.toLowerCase())) {
      showToast(`"${user.displayName}" already has HR access`, 'error');
      return;
    }
    setSelectedUsers(prev => [...prev, user]);
    setSearchQuery(''); // Clear search
    setSearchResults([]); // Clear results
    setShowDropdown(false);
    // Focus back on input
    inputRef.current?.focus();
  };

  // ─── Remove user from selection list ───
  const removeUserFromSelection = (userMail) => {
    setSelectedUsers(prev => prev.filter(u => u.mail.toLowerCase() !== userMail.toLowerCase()));
  };

  // ─── Grant access to ALL selected users ───
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
              id: currentUser.localAccountId || '',
              name: currentUser.name || '',
              email: currentUser.username || '',
            },
          };
          await axios.post(`${BACKEND}/api/hr-access`, payload);
          successCount++;
        } catch (err) {
          failedCount++;
          failedUsers.push(user.mail);
          console.error(`Failed to add ${user.mail}:`, err.message);
        }
      }

      if (successCount > 0 && failedCount === 0) {
        showToast(`✅ HR access granted to ${successCount} user${successCount > 1 ? 's' : ''}!`, 'success');
      } else if (successCount > 0 && failedCount > 0) {
        showToast(`⚠️ Granted to ${successCount}, failed for ${failedCount}: ${failedUsers.join(', ')}`, 'error');
      } else {
        showToast(`❌ Failed to grant access to all ${failedCount} users`, 'error');
      }

      setSelectedUsers([]);
      fetchHrAccessUsers();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to grant access';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Remove access for a user ───
  const handleRemoveAccess = async (id, email) => {
    if (!window.confirm(`Remove HR access for "${email}"?`)) return;
    try {
      await axios.delete(`${BACKEND}/api/hr-access/${id}`);
      showToast(`HR access removed for "${email}"`, 'success');
      fetchHrAccessUsers();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to remove user';
      showToast(msg, 'error');
    }
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; }

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e6e9ef;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
      --green: #10b981;
      --red: #ef4444;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideIn {
      from { transform: translateX(110%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleUp {
      from { transform: scale(0.92); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .hrq-page {
      min-height: 70vh;
      width: 100%;
      max-width: 1080px;
      margin: 0 auto;
      padding: 40px 24px 64px;
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    .hrq-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 28px;
      animation: fadeUp 0.4s ease both;
    }
    .hrq-header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .hrq-header-icon {
      width: 52px;
      height: 52px;
      flex-shrink: 0;
      border-radius: 14px;
      background: rgba(0,32,96,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 16px rgba(0,32,96,0.12);
      overflow: hidden;
      padding: 6px;
    }
    .hrq-header-icon-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 10px;
    }
    .hrq-eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--orange);
      margin-bottom: 4px;
    }
    .hrq-header h1 {
      font-family: 'Sora', sans-serif;
      font-size: 22px;
      font-weight: 800;
      color: var(--navy);
      margin: 0;
      letter-spacing: -0.01em;
    }
    .hrq-header-sub {
      font-size: 13.5px;
      color: var(--muted);
      margin-top: 3px;
    }
    .hrq-header-right {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .hrq-count-badge {
      background: rgba(0,32,96,0.06);
      color: var(--navy);
      padding: 8px 16px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 700;
      font-family: 'Sora', sans-serif;
      white-space: nowrap;
    }
    .hrq-back-btn {
      padding: 10px 18px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13.5px;
      font-weight: 700;
      color: var(--navy);
      font-family: 'Sora', sans-serif;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hrq-back-btn:hover {
      border-color: var(--navy);
      background: rgba(0,32,96,0.03);
    }

    /* ─── Tabs ─── */
    .hrq-tabs {
      display: flex;
      gap: 0;
      border-bottom: 2px solid var(--border);
      margin-bottom: 24px;
    }
    .hrq-tab-btn {
      padding: 12px 24px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      border-bottom: 3px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hrq-tab-btn:hover {
      color: var(--text);
    }
    .hrq-tab-btn.active {
      color: var(--navy);
      border-bottom-color: var(--navy);
    }
    .hrq-tab-btn .badge {
      background: var(--bg);
      color: var(--muted);
      font-size: 11px;
      padding: 1px 8px;
      border-radius: 12px;
      font-weight: 700;
    }
    .hrq-tab-btn.active .badge {
      background: rgba(0,32,96,0.08);
      color: var(--navy);
    }

    .hrq-card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 26px 28px;
      margin-bottom: 20px;
      box-shadow: 0 1px 2px rgba(15,23,42,0.03);
      animation: fadeUp 0.45s ease both;
    }
    .hrq-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .hrq-card-title-count {
      font-size: 12.5px;
      color: var(--muted);
      font-weight: 500;
      font-family: 'Lato', sans-serif;
    }

    .hrq-form-row {
      display: grid;
      grid-template-columns: 88px 1fr 1fr;
      gap: 14px;
      align-items: flex-start;
    }
    .hrq-form-group {
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .hrq-form-label {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 7px;
      font-family: 'Sora', sans-serif;
    }
    .hrq-form-label .required {
      color: var(--orange);
      margin-left: 3px;
    }
    .hrq-form-input {
      padding: 12px 15px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      transition: all 0.15s;
      width: 100%;
      background: var(--white);
      color: var(--text);
      height: 46px;
    }
    .hrq-form-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.07);
    }

    .hrq-emoji-trigger {
      width: 100%;
      height: 46px;
      border-radius: 12px;
      border: 1.5px solid var(--border);
      background: var(--light);
      font-size: 22px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    .hrq-emoji-trigger:hover {
      border-color: var(--navy);
      background: var(--white);
    }

    .hrq-form-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid var(--border);
    }

    .hrq-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.15s;
      white-space: nowrap;
      min-height: 44px;
    }
    .hrq-btn-primary {
      background: var(--navy);
      color: white;
    }
    .hrq-btn-primary:hover:not(:disabled) {
      background: var(--navy2);
      box-shadow: 0 4px 14px rgba(0,32,96,0.22);
    }
    .hrq-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .hrq-btn-secondary {
      background: var(--white);
      color: var(--text);
      border: 1.5px solid var(--border);
    }
    .hrq-btn-secondary:hover {
      border-color: var(--navy);
      color: var(--navy);
    }
    .hrq-btn-success {
      background: var(--green);
      color: white;
    }
    .hrq-btn-success:hover:not(:disabled) {
      background: #059669;
    }
    .hrq-btn-danger {
      background: var(--red);
      color: white;
    }
    .hrq-btn-danger:hover:not(:disabled) {
      background: #dc2626;
    }
    .hrq-btn-sm {
      padding: 6px 14px;
      min-height: 32px;
      font-size: 12px;
    }

    .hrq-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 14px;
    }
    .hrq-tile {
      background: var(--light);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px 18px;
      transition: all 0.18s;
      position: relative;
    }
    .hrq-tile:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 26px rgba(0,32,96,0.09);
      border-color: rgba(0,32,96,0.18);
      background: var(--white);
    }
    .hrq-tile-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 14px;
    }
    .hrq-tile-emoji {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(0,32,96,0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      flex-shrink: 0;
      overflow: hidden;
    }
    .hrq-tile-icon-img {
      width: 26px;
      height: 26px;
      object-fit: contain;
    }
    .hrq-tile-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .hrq-tile:hover .hrq-tile-actions {
      opacity: 1;
    }
    .hrq-tile-icon-btn {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: none;
      background: var(--white);
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      box-shadow: 0 1px 3px rgba(15,23,42,0.08);
    }
    .hrq-tile-icon-btn.edit:hover {
      background: rgba(0,32,96,0.1);
    }
    .hrq-tile-icon-btn.delete:hover {
      background: rgba(239,68,68,0.1);
    }
    .hrq-tile-name {
      font-family: 'Sora', sans-serif;
      font-size: 14.5px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
      line-height: 1.3;
    }
    .hrq-tile-desc {
      font-size: 12.5px;
      color: var(--muted);
      line-height: 1.5;
    }

    .hrq-empty {
      text-align: center;
      padding: 56px 20px;
      color: var(--muted);
    }
    .hrq-empty-icon {
      font-size: 40px;
      margin-bottom: 14px;
      opacity: 0.7;
    }
    .hrq-empty h4 {
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 6px;
      font-family: 'Sora', sans-serif;
    }
    .hrq-empty p {
      font-size: 13.5px;
    }
    .hrq-loading {
      text-align: center;
      padding: 56px 20px;
    }
    .hrq-spinner {
      width: 34px;
      height: 34px;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      border-radius: 50%;
      margin: 0 auto 14px;
      animation: spin 0.8s linear infinite;
    }

    /* ─── User Search Dropdown ─── */
    .hrq-user-search-wrapper {
      position: relative;
    }
    .hrq-user-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      margin-top: 8px;
      max-height: 280px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
    }
    .hrq-user-dropdown::-webkit-scrollbar {
      width: 4px;
    }
    .hrq-user-dropdown::-webkit-scrollbar-track {
      background: var(--bg);
      border-radius: 4px;
    }
    .hrq-user-dropdown::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 4px;
    }
    .hrq-dd-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1.5px solid var(--border);
      transition: background 0.15s;
    }
    .hrq-dd-item:last-child {
      border-bottom: none;
    }
    .hrq-dd-item:hover {
      background: var(--bg);
    }
    .hrq-dd-avatar {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--navy);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .hrq-dd-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
    }
    .hrq-dd-email {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }
    .hrq-dd-empty {
      padding: 20px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }

    /* ─── Selected Users List ─── */
    .hrq-selected-users {
      margin-top: 16px;
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
    }
    .hrq-selected-header {
      padding: 12px 16px;
      background: var(--light);
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      font-weight: 700;
      color: var(--navy);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .hrq-selected-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    .hrq-selected-item:last-child {
      border-bottom: none;
    }
    .hrq-selected-item:hover {
      background: var(--bg);
    }
    .hrq-selected-item-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .hrq-selected-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(16,185,129,0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #059669;
      font-weight: 700;
      font-size: 13px;
    }
    .hrq-selected-name {
      font-weight: 600;
      color: var(--text);
      font-size: 14px;
    }
    .hrq-selected-email {
      font-size: 12px;
      color: var(--muted);
    }
    .hrq-selected-remove {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 16px;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.15s;
    }
    .hrq-selected-remove:hover {
      background: rgba(239,68,68,0.1);
      color: var(--red);
    }

    .hrq-grant-section {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }

    /* ─── Access List ─── */
    .hrq-access-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
    }
    .hrq-access-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--light);
      border-radius: 12px;
      border: 1px solid var(--border);
      transition: all 0.15s;
    }
    .hrq-access-item:hover {
      border-color: rgba(0,32,96,0.15);
    }
    .hrq-access-item-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .hrq-access-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(0,32,96,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: var(--navy);
      flex-shrink: 0;
    }
    .hrq-access-email {
      font-weight: 600;
      color: var(--text);
      font-size: 14px;
    }
    .hrq-access-name {
      font-size: 13px;
      color: var(--muted);
    }
    .hrq-access-meta {
      font-size: 11px;
      color: var(--muted);
    }

    /* ─── EMOJI MODAL ─── */
    .hrq-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15,23,42,0.55);
      backdrop-filter: blur(6px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fadeIn 0.2s ease;
    }
    .hrq-modal {
      background: var(--white);
      border-radius: 20px;
      padding: 32px 34px 28px;
      max-width: 560px;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 60px rgba(0,0,0,0.25);
      animation: scaleUp 0.2s ease;
    }
    .hrq-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      flex-shrink: 0;
    }
    .hrq-modal-header h3 {
      font-family: 'Sora', sans-serif;
      font-size: 17px;
      font-weight: 700;
      color: var(--text);
      margin: 0;
    }
    .hrq-modal-close {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      border: none;
      background: var(--bg);
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      color: var(--muted);
    }
    .hrq-modal-close:hover {
      background: var(--border);
      color: var(--text);
    }

    .hrq-modal-emoji-grid-wrap {
      flex: 1;
      overflow-y: auto;
      padding-right: 4px;
    }
    .hrq-modal-emoji-grid-wrap::-webkit-scrollbar {
      width: 4px;
    }
    .hrq-modal-emoji-grid-wrap::-webkit-scrollbar-track {
      background: var(--bg);
      border-radius: 4px;
    }
    .hrq-modal-emoji-grid-wrap::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 4px;
    }

    .hrq-emoji-grid {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 4px;
    }
    .hrq-emoji-opt {
      width: 100%;
      aspect-ratio: 1/1;
      border-radius: 10px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s;
    }
    .hrq-emoji-opt:hover {
      background: var(--bg);
      transform: scale(1.12);
    }
    .hrq-emoji-opt.selected {
      background: rgba(0,32,96,0.08);
      box-shadow: 0 0 0 2px var(--navy) inset;
    }
    .hrq-emoji-opt.used {
      opacity: 0.2;
      cursor: not-allowed;
      pointer-events: none;
    }

    .hrq-modal-footer {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .hrq-modal-footer .emoji-count {
      font-size: 12px;
      color: var(--muted);
    }
    .hrq-modal-footer .hrq-btn {
      min-height: 38px;
      padding: 8px 22px;
      font-size: 13px;
    }

    /* ─── DELETE MODAL ─── */
    .hrq-modal-delete .hrq-modal {
      max-width: 400px;
      max-height: none;
    }
    .hrq-modal-delete .hrq-modal-icon {
      font-size: 42px;
      text-align: center;
      margin-bottom: 14px;
    }
    .hrq-modal-delete h3 {
      font-family: 'Sora', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      text-align: center;
      margin-bottom: 8px;
    }
    .hrq-modal-delete p {
      color: var(--muted);
      text-align: center;
      font-size: 14px;
      margin-bottom: 22px;
      line-height: 1.6;
    }
    .hrq-modal-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    .hrq-modal-btn {
      padding: 11px 26px;
      border: none;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.15s;
      min-width: 96px;
    }
    .hrq-modal-btn.cancel {
      background: var(--bg);
      color: var(--text);
      border: 1.5px solid var(--border);
    }
    .hrq-modal-btn.cancel:hover {
      background: var(--border);
    }
    .hrq-modal-btn.confirm {
      background: var(--red);
      color: white;
    }
    .hrq-modal-btn.confirm:hover {
      background: #dc2626;
    }

    /* ─── TOAST ─── */
    .hrq-toast {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 99999;
      padding: 14px 24px;
      border-radius: 13px;
      box-shadow: 0 10px 32px rgba(0,0,0,0.18);
      font-size: 14px;
      font-weight: 700;
      animation: slideIn 0.3s ease;
      font-family: 'Sora', sans-serif;
    }
    .hrq-toast.success { background: var(--green); color: white; }
    .hrq-toast.error { background: var(--red); color: white; }

    @media (max-width: 720px) {
      .hrq-page { padding: 24px 16px 48px; }
      .hrq-header { flex-direction: column; align-items: stretch; }
      .hrq-header-right { justify-content: space-between; }
      .hrq-form-row { grid-template-columns: 1fr; }
      .hrq-form-actions { flex-direction: column-reverse; }
      .hrq-btn { width: 100%; }
      .hrq-grid { grid-template-columns: 1fr 1fr; }
      .hrq-tile-actions { opacity: 1; }
      .hrq-modal { padding: 24px 20px; max-width: 100%; }
      .hrq-emoji-grid { grid-template-columns: repeat(8, 1fr); gap: 4px; }
      .hrq-emoji-opt { font-size: 20px; }
      .hrq-tabs { overflow-x: auto; }
      .hrq-tab-btn { padding: 10px 14px; font-size: 13px; white-space: nowrap; }
      .hrq-selected-item { flex-wrap: wrap; gap: 8px; }
    }
    @media (max-width: 480px) {
      .hrq-grid { grid-template-columns: 1fr; }
      .hrq-emoji-grid { grid-template-columns: repeat(6, 1fr); }
      .hrq-emoji-opt { font-size: 18px; }
    }
  `;

  return (
    <div className="hrq-page" ref={formTopRef}>
      <style>{sharedCSS}</style>

      {/* Header */}
      <div className="hrq-header">
        <div className="hrq-header-left">
          <div className="hrq-header-icon">
            <img src={hrImg} alt="HR Request" className="hrq-header-icon-img" />
          </div>
          <div>
            <div className="hrq-eyebrow">Settings</div>
            <h1>HR Request Management</h1>
            <div className="hrq-header-sub">Manage request types and user access</div>
          </div>
        </div>
        <div className="hrq-header-right">
          <span className="hrq-count-badge">{hrRequests.length} type{hrRequests.length === 1 ? '' : 's'}</span>
          <button className="hrq-back-btn" onClick={() => navigate('/settings')}>
            ← Back
          </button>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="hrq-tabs">
        <button
          className={`hrq-tab-btn ${activeTab === 'types' ? 'active' : ''}`}
          onClick={() => setActiveTab('types')}
        >
          📋 Request Types
          <span className="badge">{hrRequests.length}</span>
        </button>
        <button
          className={`hrq-tab-btn ${activeTab === 'access' ? 'active' : ''}`}
          onClick={() => setActiveTab('access')}
        >
          👥 User Access
          <span className="badge">{hrAccessUsers.length}</span>
        </button>
      </div>

      {/* ─── TAB: Request Types ─── */}
      {activeTab === 'types' && (
        <>
          <div className="hrq-card">
            <div className="hrq-card-title">
              {editingId ? '✏️ Edit request type' : '➕ Add a request type'}
            </div>
            <form onSubmit={handleSubmit}>
              <div className="hrq-form-row">
                <div className="hrq-form-group">
                  <label className="hrq-form-label">Icon <span className="required">*</span></label>
                  <button
                    type="button"
                    className="hrq-emoji-trigger"
                    onClick={() => setShowEmojiModal(true)}
                  >
                    {getNameIcon(formData.name) ? (
                      <img
                        src={getNameIcon(formData.name)}
                        alt={formData.name}
                        className="hrq-tile-icon-img"
                      />
                    ) : (
                      formData.emoji || '📋'
                    )}
                  </button>
                </div>

                <div className="hrq-form-group">
                  <label className="hrq-form-label">Name <span className="required">*</span></label>
                  <input
                    className="hrq-form-input"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Leave Request"
                  />
                </div>

                <div className="hrq-form-group">
                  <label className="hrq-form-label">Description</label>
                  <input
                    className="hrq-form-input"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Brief description..."
                  />
                </div>
              </div>

              <div className="hrq-form-actions">
                {editingId && (
                  <button type="button" className="hrq-btn hrq-btn-secondary" onClick={resetForm}>
                    Cancel
                  </button>
                )}
                <button type="submit" className="hrq-btn hrq-btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : (editingId ? 'Save changes' : 'Add type')}
                </button>
              </div>
            </form>
          </div>

          <div className="hrq-card">
            <div className="hrq-card-title">
              All request types
              <span className="hrq-card-title-count">{hrRequests.length} total</span>
            </div>

            {loading ? (
              <div className="hrq-loading">
                <div className="hrq-spinner" />
                <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Loading...</p>
              </div>
            ) : hrRequests.length === 0 ? (
              <div className="hrq-empty">
                <div className="hrq-empty-icon">📋</div>
                <h4>No request types yet</h4>
                <p>Add your first HR request type using the form above.</p>
              </div>
            ) : (
              <div className="hrq-grid">
                {hrRequests.map(item => (
                  <div key={item._id} className="hrq-tile">
                    <div className="hrq-tile-top">
                      <div className="hrq-tile-emoji">
                        {getNameIcon(item.name) ? (
                          <img
                            src={getNameIcon(item.name)}
                            alt={item.name}
                            className="hrq-tile-icon-img"
                          />
                        ) : (
                          item.emoji || '📋'
                        )}
                      </div>
                      <div className="hrq-tile-actions">
                        <button
                          className="hrq-tile-icon-btn edit"
                          title="Edit"
                          onClick={() => handleEdit(item)}
                        >
                          ✏️
                        </button>
                        <button
                          className="hrq-tile-icon-btn delete"
                          title="Delete"
                          onClick={() => openDeleteModal(item)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <div className="hrq-tile-name">{item.name}</div>
                    <div className="hrq-tile-desc">{item.description || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── TAB: User Access ─── */}
      {activeTab === 'access' && (
        <div className="hrq-card">
          <div className="hrq-card-title">
            👥 Users with HR Access
            <span className="hrq-card-title-count">{hrAccessUsers.length} user{hrAccessUsers.length === 1 ? '' : 's'}</span>
          </div>

          {/* ─── Live Search for Users ─── */}
          <div className="hrq-form-group">
            <label className="hrq-form-label">Search users to add</label>
            <div className="hrq-user-search-wrapper">
              <input
                ref={inputRef}
                className="hrq-form-input"
                placeholder="Search by name or email (min 2 characters)..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchQuery.length >= 2 && searchResults.length > 0 && setShowDropdown(true)}
                autoComplete="off"
              />
              {searching && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                  ⏳ Searching Azure AD...
                </div>
              )}
              {showDropdown && searchResults.length > 0 && (
              <div ref={dropdownRef} className="hrq-user-dropdown">
                {searchResults.map(user => (
                  <div 
                    key={user.id} 
                    className="hrq-dd-item"
                    onClick={() => selectUser(user)}
                  >
                    <div className="hrq-dd-avatar">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="hrq-dd-name">{user.displayName}</div>
                      <div className="hrq-dd-email">{user.mail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

          {/* ─── Selected Users List ─── */}
          {selectedUsers.length > 0 && (
            <>
              <div className="hrq-selected-users">
                <div className="hrq-selected-header">
                  <span>📌 Selected Users ({selectedUsers.length})</span>
                  <button
                    className="hrq-btn hrq-btn-sm hrq-btn-secondary"
                    onClick={() => setSelectedUsers([])}
                    style={{ padding: '4px 12px', minHeight: '28px', fontSize: '11px' }}
                  >
                    Clear All
                  </button>
                </div>
                {selectedUsers.map((user, index) => (
                  <div key={index} className="hrq-selected-item">
                    <div className="hrq-selected-item-left">
                      <div className="hrq-selected-avatar">
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="hrq-selected-name">{user.displayName}</div>
                        <div className="hrq-selected-email">{user.mail}</div>
                      </div>
                    </div>
                    <button
                      className="hrq-selected-remove"
                      onClick={() => removeUserFromSelection(user.mail)}
                      title="Remove from selection"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* ─── Grant Access Button ─── */}
              <div className="hrq-grant-section">
                <button
                  className="hrq-btn hrq-btn-success"
                  onClick={handleGrantAccess}
                  disabled={submitting || selectedUsers.length === 0}
                  style={{ minWidth: '220px' }}
                >
                  {submitting ? (
                    '⏳ Granting...'
                  ) : (
                    `✅ Grant Access to All Selected (${selectedUsers.length})`
                  )}
                </button>
              </div>
            </>
          )}

          {/* ─── Already Have Access List ─── */}
          <div style={{ marginTop: selectedUsers.length > 0 ? '28px' : '16px' }}>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: '700', 
              color: 'var(--muted)',
              marginBottom: '12px',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '8px'
            }}>
              Users with HR Access
            </div>

            {accessLoading ? (
              <div className="hrq-loading" style={{ padding: '20px' }}>
                <div className="hrq-spinner" style={{ width: '24px', height: '24px' }} />
              </div>
            ) : hrAccessUsers.length === 0 ? (
              <div className="hrq-empty" style={{ padding: '32px 20px' }}>
                <div className="hrq-empty-icon">👥</div>
                <h4>No users have HR access</h4>
                <p>Search and add users above to grant them access to the HR Request tab.</p>
              </div>
            ) : (
              <div className="hrq-access-list">
                {hrAccessUsers.map(user => (
                  <div key={user._id} className="hrq-access-item">
                    <div className="hrq-access-item-left">
                      <div className="hrq-access-avatar">
                        {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="hrq-access-email">{user.email}</div>
                        <div className="hrq-access-name">{user.name || '—'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="hrq-access-meta">
                        Added {user.addedAt ? new Date(user.addedAt).toLocaleDateString() : '—'}
                      </span>
                      <button
                        className="hrq-btn hrq-btn-danger hrq-btn-sm"
                        onClick={() => handleRemoveAccess(user._id, user.email)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── EMOJI PICKER MODAL ─── */}
      {showEmojiModal && (
        <div className="hrq-modal-overlay" onClick={() => setShowEmojiModal(false)}>
          <div className="hrq-modal" onClick={e => e.stopPropagation()}>
            <div className="hrq-modal-header">
              <h3>Choose an icon</h3>
              <button className="hrq-modal-close" onClick={() => setShowEmojiModal(false)}>
                ✕
              </button>
            </div>

            <div className="hrq-modal-emoji-grid-wrap">
              <div className="hrq-emoji-grid">
                {ALL_EMOJIS.map(emoji => {
                  const isUsed = !availableEmojis.includes(emoji) && emoji !== formData.emoji;
                  const isSelected = formData.emoji === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={`hrq-emoji-opt ${isSelected ? 'selected' : ''} ${isUsed ? 'used' : ''}`}
                      onClick={() => {
                        if (!isUsed) {
                          handleEmojiSelect(emoji);
                        }
                      }}
                      title={isUsed ? 'Already used by another request type' : ''}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hrq-modal-footer">
              <span className="emoji-count">
                {availableEmojis.length} available • {ALL_EMOJIS.length - availableEmojis.length} used
              </span>
              <button
                type="button"
                className="hrq-btn hrq-btn-secondary"
                onClick={() => setShowEmojiModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── DELETE CONFIRMATION MODAL ─── */}
      {showDeleteModal && deleteTarget && (
        <div className="hrq-modal-overlay hrq-modal-delete" onClick={() => setShowDeleteModal(false)}>
          <div className="hrq-modal" onClick={e => e.stopPropagation()}>
            <div className="hrq-modal-icon">⚠️</div>
            <h3>Delete request type</h3>
            <p>
              Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>?
              <br />
              <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>
                This action cannot be undone.
              </span>
            </p>
            <div className="hrq-modal-actions">
              <button className="hrq-modal-btn cancel" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="hrq-modal-btn confirm" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.open && (
        <div className={`hrq-toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}