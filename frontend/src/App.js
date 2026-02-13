/* Updated App.js with Edit Field functionality
   - Shows all categories (hardcoded and created) in Edit Field modal
   - Allows editing category configuration including heads, CCs, and features
   - Real-time search for Category Heads and CC Emails using CreateTicket.js pattern
*/
import React, { useState, useRef, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import Login from './Login';
import Home from './Home';
import CreateTicket from './CreateTicket';
import TicketDetails from './TicketDetails';
import Dashboard from './Dashboard';
import logo from './sandeza.jpg';
import gearIcon from './GearIcon.jpg';

const HELP_DESK_GROUP_ID = '15c0ecc6-c32a-4b38-9f21-6f394d01d70a';
const backendBase = 'https://ticketing-hn59.onrender.com';

const pca = new PublicClientApplication({
  auth: {
    clientId: '6541d73a-dbbd-4f74-9465-38a0eb03ec6b',
    authority: 'https://login.microsoftonline.com/11909ab3-5ecc-48e0-b898-acf7203a1ad7',
    redirectUri: 'https://ticketing-psi-tawny.vercel.app/',
  },
  cache: { cacheLocation: 'localStorage' },
});

function Header({ logout }) {
  const { accounts, instance } = useMsal();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profilePhoto, setProfilePhoto] = useState(null);

  // admin states
  const [isAdmin, setIsAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Add user modal (existing)
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSearchUser, setSelectedSearchUser] = useState(null);
  const [addLoading, setAddLoading] = useState(false);
  const [addMessage, setAddMessage] = useState(null);
  const [addError, setAddError] = useState(null);

  // Remove user modal (existing)
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeMessage, setRemoveMessage] = useState(null);
  const [removeError, setRemoveError] = useState(null);

  // Add Field / Remove Field / Edit Field states
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [removeFieldOpen, setRemoveFieldOpen] = useState(false);
  const [editFieldOpen, setEditFieldOpen] = useState(false);

  // Category form state for Add/Edit Field
  const [categoryName, setCategoryName] = useState('');
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState(null);
  const [categorySuccess, setCategorySuccess] = useState(null);

  const [enableOnBehalf, setEnableOnBehalf] = useState(false);
  const FIXED_ONBEHALF_OPTIONS = ['Self', 'Other'];
  const [requireOnBehalf, setRequireOnBehalf] = useState(false);

  const [enableSubCategory, setEnableSubCategory] = useState(false);
  const [subCategories, setSubCategories] = useState([]);
  const [requireSubCategory, setRequireSubCategory] = useState(false);

  const [enableAttachmentsForCategory, setEnableAttachmentsForCategory] = useState(false);
  const [requireAttachmentsForCategory, setRequireAttachmentsForCategory] = useState(false);

  // Category Heads with search functionality
  const [categoryHeads, setCategoryHeads] = useState([{ 
    email: '', 
    name: '', 
    searchQuery: '',
    searchResults: [],
    searching: false,
    showDropdown: false
  }]);

  // CC Emails with search functionality
  const [ccEmails, setCcEmails] = useState([{ 
    email: '', 
    name: '', 
    searchQuery: '',
    searchResults: [],
    searching: false,
    showDropdown: false
  }]);

  const [availableCategories, setAvailableCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategoryToRemove, setSelectedCategoryToRemove] = useState(null);
  const [removeCategoryLoading, setRemoveCategoryLoading] = useState(false);
  const [removeCategoryError, setRemoveCategoryError] = useState(null);
  const [removeCategorySuccess, setRemoveCategorySuccess] = useState(null);

  // NEW: Edit Field states
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoriesForEdit, setCategoriesForEdit] = useState([]);
  const [editCategoriesLoading, setEditCategoriesLoading] = useState(false);

  const FIXED_OTHER = 'Other';

  // Refs for click outside detection
  const categoryHeadsRefs = useRef([]);
  const ccEmailsRefs = useRef([]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }

      // Close category heads dropdowns
      categoryHeadsRefs.current.forEach((ref, idx) => {
        if (ref && !ref.contains(e.target)) {
          setCategoryHeads(prev => prev.map((h, i) => 
            i === idx ? { ...h, showDropdown: false } : h
          ));
        }
      });

      // Close CC emails dropdowns
      ccEmailsRefs.current.forEach((ref, idx) => {
        if (ref && !ref.contains(e.target)) {
          setCcEmails(prev => prev.map((c, i) => 
            i === idx ? { ...c, showDropdown: false } : c
          ));
        }
      });
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // fetch small profile photo silently
  useEffect(() => {
    const fetchPhotoSilently = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read'],
          account: accounts[0],
        });

        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
        });

        if (!photoRes.ok) return;

        const arrayBuffer = await photoRes.arrayBuffer();
        const u8 = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < u8.length; i += chunkSize) {
          const slice = u8.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, slice);
        }
        const b64 = btoa(binary);
        const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
        setProfilePhoto(`data:${contentType};base64,${b64}`);
      } catch (err) {
        // silent fail
      }
    };

    fetchPhotoSilently();
  }, [accounts, instance]);

  // check whether current user belongs to Helpdesk_Admin
  useEffect(() => {
    let cancelled = false;
    const checkMembership = async () => {
      if (!accounts || !accounts[0]) {
        setIsAdmin(false);
        return;
      }
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['GroupMember.Read.All'],
          account: accounts[0],
        });
        const token = tokenResponse.accessToken;

        const res = await fetch('https://graph.microsoft.com/v1.0/me/checkMemberGroups', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: [HELP_DESK_GROUP_ID] }),
        });

        if (res.ok) {
          const json = await res.json();
          const member = Array.isArray(json.value) && json.value.includes(HELP_DESK_GROUP_ID);
          if (!cancelled) setIsAdmin(!!member);
          return;
        }

        const fallback = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fallback.ok) {
          const j = await fallback.json();
          const found = Array.isArray(j.value) && j.value.some(g => g.id === HELP_DESK_GROUP_ID);
          if (!cancelled) setIsAdmin(!!found);
        } else {
          if (!cancelled) setIsAdmin(false);
        }
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          instance.acquireTokenRedirect({
            scopes: ['GroupMember.Read.All'],
            account: accounts[0],
          });
        } else {
          console.error('membership check failed', err);
          if (!cancelled) setIsAdmin(false);
        }
      }
    };

    checkMembership();
    return () => { cancelled = true; };
  }, [accounts, instance]);

  const acquireTokenForAdmin = async () => {
    if (!accounts || !accounts[0]) throw new Error('No signed-in account');
    try {
      const resp = await instance.acquireTokenSilent({
        scopes: ['Group.ReadWrite.All', 'User.Read.All'],
        account: accounts[0],
      });
      return resp.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        await instance.acquireTokenRedirect({
          scopes: ['Group.ReadWrite.All', 'User.Read.All'],
          account: accounts[0],
        });
        throw new Error('Redirecting for consent');
      }
      throw err;
    }
  };

  // ---------------- Existing Add user / Remove user flows (unchanged) ----------------
  const openAddModal = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedSearchUser(null);
    setAddMessage(null);
    setAddError(null);
    setAddModalOpen(true);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedSearchUser(null);
    setAddMessage(null);
    setAddError(null);
    setAddLoading(false);
    setSearchLoading(false);
  };

  const performSearch = async () => {
    setSearchResults([]);
    setSearchLoading(true);
    setAddError(null);
    try {
      const token = await acquireTokenForAdmin();

      const q = (searchQuery || '').trim();
      if (!q) {
        setAddError('Enter email, UPN or name to search');
        setSearchLoading(false);
        return;
      }

      const tryExact = async (identifier) => {
        const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(identifier)}?$select=id,displayName,mail,userPrincipalName`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const j = await r.json();
          return [j];
        }
        return [];
      };

      let results = [];

      if (q.includes('@')) {
        results = await tryExact(q);
      }

      if (results.length === 0) {
        const safeQ = q.replace(/'/g, "''");
        const realFilter = `startswith(tolower(mail),'${safeQ.toLowerCase()}') or startswith(tolower(userPrincipalName),'${safeQ.toLowerCase()}') or startswith(tolower(displayName),'${safeQ.toLowerCase()}')`;

        const r = await fetch(`https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(realFilter)}&$select=id,displayName,mail,userPrincipalName&$top=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j.value)) results = j.value;
        }
      }

      const normalized = (results || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.userPrincipalName || u.mail || '(no name)',
        mail: u.mail || '',
        userPrincipalName: u.userPrincipalName || '',
      }));

      setSearchResults(normalized);
      if (normalized.length === 0) setAddError('No users found for that query.');
    } catch (err) {
      if (err.message && err.message.includes('Redirecting for consent')) {
        setAddError('Consent required. Redirecting to sign-in.');
      } else {
        console.error('search failed', err);
        setAddError(err.message || 'Search failed.');
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const confirmAddUser = async () => {
    if (!selectedSearchUser) {
      setAddError('Select a user to add.');
      return;
    }
    setAddLoading(true);
    setAddMessage(null);
    setAddError(null);
    try {
      const token = await acquireTokenForAdmin();

      const body = {
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${selectedSearchUser.id}`,
      };

      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members/$ref`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok || res.status === 204) {
        setAddMessage(`${selectedSearchUser.displayName} has been added to Helpdesk_Admin`);
        notifyServerAboutAdd(selectedSearchUser).catch(e => console.error('notify failed', e));
        setSelectedSearchUser(null);
        setSearchResults([]);
      } else {
        const text = await res.text();
        setAddError(`Add failed: ${res.status} ${text}`);
      }
    } catch (err) {
      console.error('add user failed', err);
      setAddError(err.message || 'Add failed');
    } finally {
      setAddLoading(false);
    }
  };

  const notifyServerAboutAdd = async (targetUser) => {
    try {
      const actor = {
        id: accounts?.[0]?.homeAccountId || '',
        name: accounts?.[0]?.name || accounts?.[0]?.username || '',
        mail: accounts?.[0]?.username || accounts?.[0]?.username || '',
      };
      await fetch(`${backendBase}/api/notify-admin-added`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor,
          target: {
            id: targetUser.id,
            name: targetUser.displayName,
            mail: targetUser.mail || targetUser.userPrincipalName,
          },
        }),
      });
    } catch (err) {
      console.error('notify server error', err);
    }
  };

  const openRemoveModal = async () => {
    setRemoveModalOpen(true);
    setMembersLoading(true);
    setGroupMembers([]);
    setSelectedMember(null);
    setRemoveMessage(null);
    setRemoveError(null);

    try {
      const token = await acquireTokenForAdmin();
      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members?$select=id,displayName,mail,userPrincipalName&$top=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch members: ${res.status}`);
      }
      const j = await res.json();
      const members = (Array.isArray(j.value) ? j.value : []).map(m => ({
        id: m.id,
        displayName: m.displayName || m.userPrincipalName || m.mail || '(no name)',
        mail: m.mail || '',
        userPrincipalName: m.userPrincipalName || '',
      }));
      setGroupMembers(members);
    } catch (err) {
      console.error('fetch members failed', err);
      setRemoveError(err.message || 'Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  };

  const closeRemoveModal = () => {
    setRemoveModalOpen(false);
    setGroupMembers([]);
    setSelectedMember(null);
    setRemoveMessage(null);
    setRemoveError(null);
    setMembersLoading(false);
    setRemoveLoading(false);
  };

  const confirmRemoveUser = async () => {
    if (!selectedMember) {
      setRemoveError('Select a user to remove.');
      return;
    }
    setRemoveLoading(true);
    setRemoveMessage(null);
    setRemoveError(null);
    try {
      const token = await acquireTokenForAdmin();

      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members/${selectedMember.id}/$ref`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok || res.status === 204) {
        setRemoveMessage(`${selectedMember.displayName} has been removed from Helpdesk_Admin`);
        notifyServerAboutRemove(selectedMember).catch(e => console.error('notify failed', e));
        setGroupMembers(prev => prev.filter(m => m.id !== selectedMember.id));
        setSelectedMember(null);
      } else {
        const text = await res.text();
        setRemoveError(`Remove failed: ${res.status} ${text}`);
      }
    } catch (err) {
      console.error('remove failed', err);
      setRemoveError(err.message || 'Remove failed');
    } finally {
      setRemoveLoading(false);
    }
  };

  const notifyServerAboutRemove = async (targetUser) => {
    try {
      const actor = {
        id: accounts?.[0]?.homeAccountId || '',
        name: accounts?.[0]?.name || accounts?.[0]?.username || '',
        mail: accounts?.[0]?.username || accounts?.[0]?.username || '',
      };
      await fetch(`${backendBase}/api/notify-admin-removed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor,
          target: {
            id: targetUser.id,
            name: targetUser.displayName,
            mail: targetUser.mail || targetUser.userPrincipalName,
          },
        }),
      });
    } catch (err) {
      console.error('notify server error', err);
    }
  };

  // ---------------- Category Add / Remove / Edit helpers ----------------

  const resetCategoryForm = () => {
    setCategoryName('');
    setEnableOnBehalf(false);
    setRequireOnBehalf(false);
    setEnableSubCategory(false);
    setSubCategories([]);
    setRequireSubCategory(false);
    setEnableAttachmentsForCategory(false);
    setRequireAttachmentsForCategory(false);
    setCategoryHeads([{ email: '', name: '', searchQuery: '', searchResults: [], searching: false, showDropdown: false }]);
    setCcEmails([{ email: '', name: '', searchQuery: '', searchResults: [], searching: false, showDropdown: false }]);
    setCategoryError(null);
    setCategorySuccess(null);
    setEditingCategory(null);
  };

  const addSubCategory = () => {
    setSubCategories(prev => [...prev, '']);
  };

  const updateSubCategory = (idx, value) => {
    setSubCategories(prev =>
      prev.map((s, i) => (i === idx ? value : s))
    );
  };

  const removeSubCategory = (idx) => {
    setSubCategories(prev =>
      prev.filter((_, i) => i !== idx)
    );
  };

  // Real-time search for Category Heads
  const handleCategoryHeadSearch = async (idx, searchText) => {
    if (!searchText || searchText.trim().length < 2) {
      setCategoryHeads(prev => prev.map((h, i) => 
        i === idx ? { ...h, searchResults: [], showDropdown: false } : h
      ));
      return;
    }

    setCategoryHeads(prev => prev.map((h, i) => 
      i === idx ? { ...h, searching: true, showDropdown: true } : h
    ));

    try {
      const token = await instance.acquireTokenSilent({ 
        scopes: ['User.Read.All'], 
        account: accounts[0] 
      });

      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/users?$filter=startswith(mail,'${searchText}') or startswith(displayName,'${searchText}') or startswith(userPrincipalName,'${searchText}')&$top=5`,
        {
          headers: { Authorization: `Bearer ${token.accessToken}` }
        }
      );

      const results = (response.data.value || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.mail || u.userPrincipalName || '(no name)',
        mail: u.mail || u.userPrincipalName || '',
        userPrincipalName: u.userPrincipalName || ''
      }));

      setCategoryHeads(prev => prev.map((h, i) => 
        i === idx ? { ...h, searchResults: results, searching: false } : h
      ));
    } catch (err) {
      console.error('Error searching category heads:', err);
      setCategoryHeads(prev => prev.map((h, i) => 
        i === idx ? { ...h, searchResults: [], searching: false } : h
      ));
    }
  };

  const selectCategoryHead = (idx, user) => {
    setCategoryHeads(prev => prev.map((h, i) => 
      i === idx 
        ? { 
            email: user.mail, 
            name: user.displayName, 
            searchQuery: user.displayName,
            searchResults: [],
            searching: false,
            showDropdown: false
          } 
        : h
    ));
  };

  const updateCategoryHeadQuery = (idx, query) => {
    setCategoryHeads(prev => prev.map((h, i) => 
      i === idx ? { ...h, searchQuery: query, email: '', name: '' } : h
    ));
    handleCategoryHeadSearch(idx, query);
  };

  const addCategoryHead = () => {
    setCategoryHeads(prev => [...prev, { 
      email: '', 
      name: '', 
      searchQuery: '',
      searchResults: [],
      searching: false,
      showDropdown: false
    }]);
  };

  const removeCategoryHead = (idx) => {
    setCategoryHeads(prev => prev.filter((_, i) => i !== idx));
    categoryHeadsRefs.current = categoryHeadsRefs.current.filter((_, i) => i !== idx);
  };

  // Real-time search for CC Emails
  const handleCcEmailSearch = async (idx, searchText) => {
    if (!searchText || searchText.trim().length < 2) {
      setCcEmails(prev => prev.map((c, i) => 
        i === idx ? { ...c, searchResults: [], showDropdown: false } : c
      ));
      return;
    }

    setCcEmails(prev => prev.map((c, i) => 
      i === idx ? { ...c, searching: true, showDropdown: true } : c
    ));

    try {
      const token = await instance.acquireTokenSilent({ 
        scopes: ['User.Read.All'], 
        account: accounts[0] 
      });

      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/users?$filter=startswith(mail,'${searchText}') or startswith(displayName,'${searchText}') or startswith(userPrincipalName,'${searchText}')&$top=5`,
        {
          headers: { Authorization: `Bearer ${token.accessToken}` }
        }
      );

      const results = (response.data.value || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.mail || u.userPrincipalName || '(no name)',
        mail: u.mail || u.userPrincipalName || '',
        userPrincipalName: u.userPrincipalName || ''
      }));

      setCcEmails(prev => prev.map((c, i) => 
        i === idx ? { ...c, searchResults: results, searching: false } : c
      ));
    } catch (err) {
      console.error('Error searching CC emails:', err);
      setCcEmails(prev => prev.map((c, i) => 
        i === idx ? { ...c, searchResults: [], searching: false } : c
      ));
    }
  };

  const selectCcEmail = (idx, user) => {
    setCcEmails(prev => prev.map((c, i) => 
      i === idx 
        ? { 
            email: user.mail, 
            name: user.displayName, 
            searchQuery: user.displayName,
            searchResults: [],
            searching: false,
            showDropdown: false
          } 
        : c
    ));
  };

  const updateCcEmailQuery = (idx, query) => {
    setCcEmails(prev => prev.map((c, i) => 
      i === idx ? { ...c, searchQuery: query, email: '', name: '' } : c
    ));
    handleCcEmailSearch(idx, query);
  };

  const addCcEmail = () => {
    setCcEmails(prev => [...prev, { 
      email: '', 
      name: '', 
      searchQuery: '',
      searchResults: [],
      searching: false,
      showDropdown: false
    }]);
  };

  const removeCcEmail = (idx) => {
    setCcEmails(prev => prev.filter((_, i) => i !== idx));
    ccEmailsRefs.current = ccEmailsRefs.current.filter((_, i) => i !== idx);
  };

  const createCategory = async () => {
    if (!categoryName || !categoryName.trim()) {
      setCategoryError('Category name is required');
      return;
    }

    const validHeads = categoryHeads.filter(h => h.email && h.email.trim());
    if (validHeads.length === 0) {
      setCategoryError('At least one Category Head is required');
      return;
    }

    setCategoryError(null);
    setCategoryLoading(true);
    setCategorySuccess(null);

    try {
      const token = await acquireTokenForAdmin();

      const payload = {
        name: categoryName.trim(),
        categoryName: categoryName.trim(),
        features: {
          onBehalf: enableOnBehalf 
            ? { enabled: true, options: FIXED_ONBEHALF_OPTIONS, required: !!requireOnBehalf }
            : { enabled: false },
          subCategories: enableSubCategory
            ? {
                enabled: true,
                list: [
                  ...subCategories
                    .map(s => s.trim())
                    .filter(s => s && s !== FIXED_OTHER),
                  FIXED_OTHER
                ],
                required: !!requireSubCategory
              }
            : { enabled: false },
          attachments: enableAttachmentsForCategory 
            ? { enabled: true, required: !!requireAttachmentsForCategory } 
            : { enabled: false },
        },
        categoryHeads: validHeads.map(h => ({ 
          email: h.email.trim(), 
          name: h.name || h.email.trim() 
        })),
        cc: ccEmails
          .filter(c => c.email && c.email.trim())
          .map(c => ({ 
            email: c.email.trim(), 
            name: c.name || c.email.trim() 
          })),
        createdBy: {
          id: accounts?.[0]?.homeAccountId || '',
          name: accounts?.[0]?.name || accounts?.[0]?.username || '',
          mail: accounts?.[0]?.username || '',
        },
      };

      const res = await fetch(`${backendBase}/api/categories`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Create failed ${res.status}`);
      }

      setCategorySuccess('Category created successfully');
      
      try {
        await fetch(`${backendBase}/api/notify-category-added`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actor: payload.createdBy,
            category: payload.categoryName,
          }),
        });
      } catch (notifyErr) {
        console.error('notify-category-added failed', notifyErr);
      }

      setTimeout(() => {
        resetCategoryForm();
        setAddFieldOpen(false);
      }, 900);
    } catch (err) {
      console.error('create category failed', err);
      setCategoryError(err.message || 'Failed to create category');
    } finally {
      setCategoryLoading(false);
    }
  };

  const openRemoveFieldModal = async () => {
    setRemoveFieldOpen(true);
    setCategoriesLoading(true);
    setAvailableCategories([]);
    setSelectedCategoryToRemove(null);
    setRemoveCategoryError(null);
    setRemoveCategorySuccess(null);

    try {
      const token = await acquireTokenForAdmin();
      const r = await fetch(`${backendBase}/api/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Failed to load categories ${r.status}`);
      const j = await r.json();
      setAvailableCategories(Array.isArray(j) ? j : []);
    } catch (err) {
      console.error('load categories failed', err);
      setRemoveCategoryError(err.message || 'Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  const confirmRemoveCategory = async () => {
    if (!selectedCategoryToRemove) {
      setRemoveCategoryError('Select a category to remove');
      return;
    }
    setRemoveCategoryLoading(true);
    setRemoveCategoryError(null);
    try {
      const token = await acquireTokenForAdmin();
      const r = await fetch(`${backendBase}/api/categories/${encodeURIComponent(selectedCategoryToRemove.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `Delete failed ${r.status}`);
      }
      setRemoveCategorySuccess('Category removed');
      setAvailableCategories(prev => prev.filter(c => c.id !== selectedCategoryToRemove.id));
      setSelectedCategoryToRemove(null);
    } catch (err) {
      console.error('delete category failed', err);
      setRemoveCategoryError(err.message || 'Failed to delete category');
    } finally {
      setRemoveCategoryLoading(false);
    }
  };

  // NEW: Edit Field functions
  const openEditFieldModal = async () => {
    setEditFieldOpen(true);
    setEditCategoriesLoading(true);
    setCategoriesForEdit([]);
    setEditingCategory(null);
    resetCategoryForm();

    try {
      const token = await acquireTokenForAdmin();
      const r = await fetch(`${backendBase}/api/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Failed to load categories ${r.status}`);
      const j = await r.json();
      setCategoriesForEdit(Array.isArray(j) ? j : []);
    } catch (err) {
      console.error('load categories for edit failed', err);
      setCategoryError(err.message || 'Failed to load categories');
    } finally {
      setEditCategoriesLoading(false);
    }
  };

  const selectCategoryForEdit = (category) => {
    setEditingCategory(category);
    
    // Populate form with category data
    setCategoryName(category.name || category.categoryName || '');
    
    // Features
    const features = category.features || {};
    
    // OnBehalf
    if (features.onBehalf && features.onBehalf.enabled) {
      setEnableOnBehalf(true);
      setRequireOnBehalf(!!features.onBehalf.required);
    } else {
      setEnableOnBehalf(false);
      setRequireOnBehalf(false);
    }
    
    // SubCategories
    if (features.subCategories && features.subCategories.enabled) {
      setEnableSubCategory(true);
      const list = features.subCategories.list || [];
      // Filter out 'Other' as it's fixed
      const filteredList = list.filter(s => s !== FIXED_OTHER);
      setSubCategories(filteredList);
      setRequireSubCategory(!!features.subCategories.required);
    } else {
      setEnableSubCategory(false);
      setSubCategories([]);
      setRequireSubCategory(false);
    }
    
    // Attachments
    if (features.attachments && features.attachments.enabled) {
      setEnableAttachmentsForCategory(true);
      setRequireAttachmentsForCategory(!!features.attachments.required);
    } else {
      setEnableAttachmentsForCategory(false);
      setRequireAttachmentsForCategory(false);
    }
    
    // Category Heads
    const heads = category.categoryHeads || [];
    if (heads.length > 0) {
      setCategoryHeads(heads.map(h => ({
        email: h.email || '',
        name: h.name || h.email || '',
        searchQuery: h.name || h.email || '',
        searchResults: [],
        searching: false,
        showDropdown: false
      })));
    } else {
      setCategoryHeads([{ email: '', name: '', searchQuery: '', searchResults: [], searching: false, showDropdown: false }]);
    }
    
    // CC Emails
    const ccs = category.cc || [];
    if (ccs.length > 0) {
      setCcEmails(ccs.map(c => ({
        email: c.email || '',
        name: c.name || c.email || '',
        searchQuery: c.name || c.email || '',
        searchResults: [],
        searching: false,
        showDropdown: false
      })));
    } else {
      setCcEmails([{ email: '', name: '', searchQuery: '', searchResults: [], searching: false, showDropdown: false }]);
    }
  };

  const updateCategory = async () => {
    if (!editingCategory) {
      setCategoryError('No category selected for editing');
      return;
    }

    if (!categoryName || !categoryName.trim()) {
      setCategoryError('Category name is required');
      return;
    }

    const validHeads = categoryHeads.filter(h => h.email && h.email.trim());
    if (validHeads.length === 0) {
      setCategoryError('At least one Category Head is required');
      return;
    }

    setCategoryError(null);
    setCategoryLoading(true);
    setCategorySuccess(null);

    try {
      const token = await acquireTokenForAdmin();

      const payload = {
        name: categoryName.trim(),
        categoryName: categoryName.trim(),
        features: {
          onBehalf: enableOnBehalf 
            ? { enabled: true, options: FIXED_ONBEHALF_OPTIONS, required: !!requireOnBehalf }
            : { enabled: false },
          subCategories: enableSubCategory
            ? {
                enabled: true,
                list: [
                  ...subCategories
                    .map(s => s.trim())
                    .filter(s => s && s !== FIXED_OTHER),
                  FIXED_OTHER
                ],
                required: !!requireSubCategory
              }
            : { enabled: false },
          attachments: enableAttachmentsForCategory 
            ? { enabled: true, required: !!requireAttachmentsForCategory } 
            : { enabled: false },
        },
        categoryHeads: validHeads.map(h => ({ 
          email: h.email.trim(), 
          name: h.name || h.email.trim() 
        })),
        cc: ccEmails
          .filter(c => c.email && c.email.trim())
          .map(c => ({ 
            email: c.email.trim(), 
            name: c.name || c.email.trim() 
          })),
        updatedBy: {
          id: accounts?.[0]?.homeAccountId || '',
          name: accounts?.[0]?.name || accounts?.[0]?.username || '',
          mail: accounts?.[0]?.username || '',
        },
      };

      const res = await fetch(`${backendBase}/api/categories/${encodeURIComponent(editingCategory.id)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Update failed ${res.status}`);
      }

      setCategorySuccess('Category updated successfully');
      
      // Update the local list
      setCategoriesForEdit(prev => prev.map(c => 
        c.id === editingCategory.id ? { ...c, ...payload } : c
      ));

      setTimeout(() => {
        resetCategoryForm();
        setEditingCategory(null);
      }, 900);
    } catch (err) {
      console.error('update category failed', err);
      setCategoryError(err.message || 'Failed to update category');
    } finally {
      setCategoryLoading(false);
    }
  };

  // ---------------- Profile functions (unchanged) ----------------
  const fetchFullProfile = async () => {
    if (!accounts || !accounts[0]) return;
    setLoadingProfile(true);
    setProfileError(null);

    try {
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read', 'User.ReadBasic.All', 'User.Read.All'],
        account: accounts[0],
      });

      const token = response.accessToken;
      
      const graphRes = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department,employeeId,mobilePhone,streetAddress,state,postalCode,jobTitle,manager&$expand=manager($select=displayName)',
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'ConsistencyLevel': 'eventual'
          } 
        }
      );

      if (!graphRes.ok) throw new Error(`Graph ${graphRes.status}`);

      const data = await graphRes.json();

      setProfileData({
        name: data.displayName || '',
        email: data.mail || data.userPrincipalName || '',
        department: data.department || '',
        employeeId: data.employeeId || '',
        mobilePhone: data.mobilePhone || '',
        streetAddress: data.streetAddress || '',
        state: data.state || '',
        postalCode: data.postalCode || '',
        jobTitle: data.jobTitle || '',
        manager: data.manager ? data.manager.displayName || '' : ''
      });

      try {
        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (photoRes.ok) {
          const arrayBuffer = await photoRes.arrayBuffer();
          const u8 = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < u8.length; i += chunkSize) {
            const slice = u8.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, slice);
          }
          const b64 = btoa(binary);
          const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
          setProfilePhoto(`data:${contentType};base64,${b64}`);
        }
      } catch {}

    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        instance.acquireTokenRedirect({
          scopes: ['User.Read', 'User.ReadBasic.All', 'User.Read.All'],
          account: accounts[0],
        });
      } else {
        setProfileError(err.message);
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  const openFullProfile = () => {
    setFullProfileOpen(true);
    setProfileData(null);
    fetchFullProfile();
  };

  const closeFullProfile = () => {
    setFullProfileOpen(false);
    setProfileError(null);
  };

  const initials = (accounts?.[0]?.name || accounts?.[0]?.username || 'U')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // ---------------- JSX ----------------
  return (
    <>
      <header
        style={{
          background: 'white',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        {/* LEFT LOGO BLOCK */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src={logo}
            alt="Sandeza logo"
            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1
                style={{
                  color: '#0f172a',
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  letterSpacing: 0.2,
                }}
              >
                SANDEZA INC
              </h1>
            </div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>IT Ticket Portal</div>
          </div>
        </div>

        {/* CENTER TITLE */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            animation: 'floatGlow 3s ease-in-out infinite',
          }}
        >
          <div
            style={{
              fontSize: '1.15rem',
              fontWeight: 900,
              letterSpacing: '0.5px',
              color: '#0f172a',
              textShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            SANDEZA HELPDESK
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              marginTop: 2,
              fontWeight: 600,
              color: '#64748b',
              letterSpacing: '0.3px',
            }}
          >
            Empowering Support • Every Step
          </div>
        </div>

        {/* RIGHT PROFILE + GEAR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdmin && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setSettingsOpen(s => !s)}
                  aria-label="Admin settings"
                  title="Admin settings"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid rgba(15,23,42,0.06)',
                    background: settingsOpen ? '#eef2ff' : 'linear-gradient(180deg,#ffffff,#fbfdff)',
                    cursor: 'pointer',
                    boxShadow: '0 6px 18px rgba(2,6,23,0.04)',
                    color: '#374151',
                  }}
                >
                  <img src={gearIcon} alt="Settings" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                </button>

                {settingsOpen && (
                  <div
                    role="menu"
                    aria-label="Admin settings"
                    style={{
                      position: 'absolute',
                      right: 0,
                      marginTop: 8,
                      background: 'white',
                      border: '1px solid rgba(15,23,42,0.06)',
                      borderRadius: 8,
                      boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                      padding: 10,
                      width: 260,
                      zIndex: 60,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Admin Settings</div>

                    <button
                      onClick={() => { openAddModal(); setSettingsOpen(false); }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#0b79bf',
                        fontWeight: 700,
                      }}
                    >
                      Add user
                    </button>

                    <button
                      onClick={() => { openRemoveModal(); setSettingsOpen(false); }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#ef4444',
                        fontWeight: 700,
                      }}
                    >
                      Remove user
                    </button>

                    <button
                      onClick={() => { resetCategoryForm(); setAddFieldOpen(true); setSettingsOpen(false); }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#0b79bf',
                        fontWeight: 700,
                      }}
                    >
                      Add field
                    </button>

                    {/* NEW: Edit Field Button */}
                    <button
                      onClick={() => { openEditFieldModal(); setSettingsOpen(false); }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#8b5cf6',
                        fontWeight: 700,
                      }}
                    >
                      Edit field
                    </button>

                    <button
                      onClick={() => { openRemoveFieldModal(); setSettingsOpen(false); }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#ef4444',
                        fontWeight: 700,
                      }}
                    >
                      Remove field
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                      <button
                        onClick={() => setSettingsOpen(false)}
                        style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PROFILE BUTTON */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setProfileOpen(prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(15,23,42,0.06)',
                  background: 'linear-gradient(180deg,#ffffff,#fbfdff)',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(2,6,23,0.06)',
                }}
                aria-haspopup="true"
                aria-expanded={profileOpen}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#eef2ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    color: '#3730a3',
                    fontSize: 14,
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  {profilePhoto ? (
                    <img
                      src={profilePhoto}
                      alt="profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {accounts?.[0]?.name || accounts?.[0]?.username}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    {accounts?.[0]?.username}
                  </span>
                </div>

                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M6 8l4 4 4-4"
                    stroke="#374151"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {profileOpen && (
                <div
                  role="menu"
                  aria-label="Profile menu"
                  style={{
                    position: 'absolute',
                    right: 0,
                    marginTop: 10,
                    background: 'white',
                    border: '1px solid rgba(15,23,42,0.06)',
                    borderRadius: 10,
                    boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                    padding: 12,
                    width: 300,
                    zIndex: 60,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: '#eef2ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        color: '#3730a3',
                        overflow: 'hidden',
                      }}
                    >
                      {profilePhoto ? (
                        <img
                          src={profilePhoto}
                          alt="profile"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <span style={{ fontSize: 18 }}>{initials}</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>
                        {accounts?.[0]?.name || 'Unknown'}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>
                        {accounts?.[0]?.username}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={() => {
                        openFullProfile();
                        setProfileOpen(false);
                      }}
                      style={{
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 700,
                        color: '#2563eb',
                      }}
                    >
                      View Full Profile
                    </button>

                    <button
                      onClick={logout}
                      style={{
                        textAlign: 'left',
                        background: '#d91515ff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        color: 'white',
                        fontWeight: 700,
                      }}
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Add User Modal (unchanged) */}
      {addModalOpen && (
        <>
          <div
            onClick={closeAddModal}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 90,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '18px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: '560px',
              zIndex: 100,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Add user to Helpdesk_Admin</h3>
              <button onClick={closeAddModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                ✖
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
              Search users by email.
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email"
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(15,23,42,0.08)',
                  outline: 'none',
                  flex: 1,
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') performSearch(); }}
              />
              <button
                onClick={performSearch}
                disabled={searchLoading}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: '#0b79bf',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {searchLoading ? 'Searching…' : 'Search'}
              </button>
            </div>

            <div style={{ maxHeight: 240, overflow: 'auto', marginBottom: 8 }}>
              {searchResults.length === 0 && !searchLoading && <div style={{ color: '#6b7280' }}>No results</div>}
              {searchResults.map(u => (
                <div
                  key={u.id}
                  onClick={() => setSelectedSearchUser(u)}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    marginBottom: 8,
                    background: selectedSearchUser?.id === u.id ? '#eef2ff' : '#fff',
                    border: '1px solid rgba(15,23,42,0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{u.displayName}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{u.mail || u.userPrincipalName}</div>
                  </div>
                </div>
              ))}
            </div>

            {addMessage && <div style={{ padding: 10, background: '#ecfdf5', color: '#065f46', borderRadius: 8 }}>{addMessage}</div>}
            {addError && <div style={{ padding: 10, background: '#fff1f2', color: '#9f1239', borderRadius: 8 }}>{addError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={closeAddModal} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={confirmAddUser}
                disabled={addLoading || !selectedSearchUser}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: addLoading ? '#9ec7df' : '#0b79bf',
                  color: 'white',
                  border: 'none',
                  cursor: addLoading ? 'default' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {addLoading ? 'Adding…' : 'Add as admin'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Remove User Modal (unchanged) */}
      {removeModalOpen && (
        <>
          <div
            onClick={closeRemoveModal}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 90,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '18px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: '560px',
              zIndex: 100,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Remove user from Admin rights</h3>
              <button onClick={closeRemoveModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                ✖
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
              Select an existing member to remove their admin rights.
            </div>

            <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 8 }}>
              {membersLoading && <div style={{ color: '#6b7280' }}>Loading members…</div>}
              {!membersLoading && groupMembers.length === 0 && <div style={{ color: '#6b7280' }}>No members found.</div>}
              {groupMembers.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMember(m)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 8,
                    background: selectedMember?.id === m.id ? '#fff1f2' : '#fff',
                    border: '1px solid rgba(15,23,42,0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{m.displayName}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{m.mail || m.userPrincipalName}</div>
                  </div>
                </div>
              ))}
            </div>

            {removeMessage && <div style={{ padding: 10, background: '#ecfdf5', color: '#065f46', borderRadius: 8 }}>{removeMessage}</div>}
            {removeError && <div style={{ padding: 10, background: '#fff1f2', color: '#9f1239', borderRadius: 8 }}>{removeError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={closeRemoveModal} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={confirmRemoveUser}
                disabled={removeLoading || !selectedMember}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: removeLoading ? '#f7a6a6' : '#ef4444',
                  color: 'white',
                  border: 'none',
                  cursor: removeLoading ? 'default' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {removeLoading ? 'Removing…' : 'Remove admin'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Field Modal - same as before */}
      {addFieldOpen && (
        <>
          <div
            onClick={() => setAddFieldOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 90,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '24px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: '800px',
              maxWidth: '90vw',
              zIndex: 100,
              maxHeight: '85vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Add Category / Field</h3>
              <button 
                onClick={() => setAddFieldOpen(false)} 
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  color: '#6b7280'
                }}
              >
                ✖
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
              Define a new category and required fields. Users in Category Heads and CCs will be notified for ticket actions.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              <div style={{ width: '100%' }}>
                <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>
                  Category Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input 
                  value={categoryName} 
                  onChange={(e) => setCategoryName(e.target.value)} 
                  placeholder="Enter category name (e.g., HR, IT Support, Finance)" 
                  style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    borderRadius: 8, 
                    border: '1px solid #e6e9ee',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }} 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                
                <div>
                  <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>
                    Category Heads <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                    Start typing to search and select users
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {categoryHeads.map((h, idx) => (
                      <div 
                        key={idx} 
                        ref={el => categoryHeadsRefs.current[idx] = el}
                        style={{ position: 'relative' }}
                      >
                        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                        <input
                          value={h.searchQuery}
                          onChange={(e) => updateCategoryHeadQuery(idx, e.target.value)}
                          placeholder="Type name or email..."
                          style={{ 
                            flex: 1, 
                            padding: '8px 10px', 
                            borderRadius: 6, 
                            border: h.email ? '1px solid #10b981' : '1px solid #e6e9ee',
                            fontSize: 13,
                            background: h.email ? '#ecfdf5' : 'white'
                          }}
                        />
                        
                        {/* ✅ FIXED: Show + for all items */}
                        <button 
                          type="button" 
                          onClick={addCategoryHead} 
                          style={{ 
                            padding: '8px 12px', 
                            borderRadius: 6, 
                            background: '#eef2ff', 
                            border: '1px solid #c7d2fe',
                            cursor: 'pointer',
                            fontSize: 16,
                            fontWeight: 600
                          }}
                        >
                          ＋
                        </button>
                        
                        {/* ✅ FIXED: Show × for all items except when it's the only one */}
                        {categoryHeads.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => removeCategoryHead(idx)} 
                            style={{ 
                              padding: '8px 12px', 
                              borderRadius: 6, 
                              background: '#fff1f2', 
                              border: '1px solid #fecaca',
                              cursor: 'pointer',
                              fontSize: 14
                            }}
                          >
                            ✖
                          </button>
                        )}
                      </div>

                        {h.showDropdown && h.searchResults.length > 0 && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'white',
                            border: '1px solid #e6e9ee',
                            borderRadius: 6,
                            marginTop: 4,
                            maxHeight: 200,
                            overflowY: 'auto',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            zIndex: 110
                          }}>
                            {h.searchResults.map((user, userIdx) => (
                              <div
                                key={userIdx}
                                onClick={() => selectCategoryHead(idx, user)}
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  borderBottom: userIdx < h.searchResults.length - 1 ? '1px solid #f3f4f6' : 'none',
                                  background: 'white',
                                  transition: 'background 0.15s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                              >
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{user.displayName}</div>
                                <div style={{ fontSize: 11, color: '#6b7280' }}>{user.mail}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {h.email && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>✓</span>
                            <span>{h.name} ({h.email})</span>
                          </div>
                        )}

                        {h.searching && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                            Searching...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>
                    CC Emails (Optional)
                  </label>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                    Start typing to search and select users
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ccEmails.map((c, idx) => (
                      <div 
                        key={idx}
                        ref={el => ccEmailsRefs.current[idx] = el}
                        style={{ position: 'relative' }}
                      >
                        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                          <input
                            value={c.searchQuery}
                            onChange={(e) => updateCcEmailQuery(idx, e.target.value)}
                            placeholder="Type name or email..."
                            style={{ 
                              flex: 1, 
                              padding: '8px 10px', 
                              borderRadius: 6, 
                              border: c.email ? '1px solid #10b981' : '1px solid #e6e9ee',
                              fontSize: 13,
                              background: c.email ? '#ecfdf5' : 'white'
                            }}
                          />
                          
                          {/* ✅ FIXED: Show + for all items */}
                          <button 
                            type="button" 
                            onClick={addCcEmail} 
                            style={{ 
                              padding: '8px 12px', 
                              borderRadius: 6, 
                              background: '#eef2ff', 
                              border: '1px solid #c7d2fe',
                              cursor: 'pointer',
                              fontSize: 16,
                              fontWeight: 600
                            }}
                          >
                            ＋
                          </button>
                          
                          {/* ✅ FIXED: Show × for all items (CC is optional, so we can remove all) */}
                          <button 
                            type="button" 
                            onClick={() => removeCcEmail(idx)} 
                            style={{ 
                              padding: '8px 12px', 
                              borderRadius: 6, 
                              background: '#fff1f2', 
                              border: '1px solid #fecaca',
                              cursor: 'pointer',
                              fontSize: 14
                            }}
                          >
                            ✖
                          </button>
                        </div>

                        {c.showDropdown && c.searchResults.length > 0 && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'white',
                            border: '1px solid #e6e9ee',
                            borderRadius: 6,
                            marginTop: 4,
                            maxHeight: 200,
                            overflowY: 'auto',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            zIndex: 110
                          }}>
                            {c.searchResults.map((user, userIdx) => (
                              <div
                                key={userIdx}
                                onClick={() => selectCcEmail(idx, user)}
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  borderBottom: userIdx < c.searchResults.length - 1 ? '1px solid #f3f4f6' : 'none',
                                  background: 'white',
                                  transition: 'background 0.15s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                              >
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{user.displayName}</div>
                                <div style={{ fontSize: 11, color: '#6b7280' }}>{user.mail}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {c.email && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>✓</span>
                            <span>{c.name} ({c.email})</span>
                          </div>
                        )}

                        {c.searching && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                            Searching...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 8 }}>
                
                <div style={{ 
                  padding: 16, 
                  border: '1px solid #e6e9ee', 
                  borderRadius: 8,
                  background: enableOnBehalf ? '#f0f9ff' : '#fafafa'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontWeight: 700, fontSize: 14 }}>On Behalf</label>
                    <input 
                      type="checkbox" 
                      checked={enableOnBehalf} 
                      onChange={(e) => setEnableOnBehalf(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                    Allow users to submit tickets for themselves or others
                  </div>

                  {enableOnBehalf && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        Options
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
                        • Self<br />
                        • Other
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={requireOnBehalf}
                            onChange={(e) => setRequireOnBehalf(e.target.checked)}
                            style={{ width: 14, height: 14 }}
                          />
                          <span>Required field</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: 16,
                    border: '1px solid #e6e9ee',
                    borderRadius: 8,
                    background: enableSubCategory ? '#f0fdf4' : '#fafafa'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontWeight: 700, fontSize: 14 }}>Sub-Category</label>
                    <input
                      type="checkbox"
                      checked={enableSubCategory}
                      onChange={(e) => setEnableSubCategory(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </div>

                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                    Add multiple subcategories for users to choose from
                  </div>

                  {enableSubCategory && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        Subcategories:
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {subCategories.length === 0 && (
                          <button
                            type="button"
                            onClick={addSubCategory}
                            style={{
                              alignSelf: 'flex-start',
                              background: '#eef2ff',
                              border: '1px solid #c7d2fe',
                              borderRadius: 6,
                              padding: '4px 10px',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            + Add sub-category
                          </button>
                        )}

                        {subCategories.map((s, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              value={s}
                              onChange={(e) => updateSubCategory(idx, e.target.value)}
                              placeholder="e.g., Salary, Benefits"
                              style={{
                                flex: 1,
                                padding: '6px 8px',
                                borderRadius: 4,
                                border: '1px solid #e6e9ee',
                                fontSize: 12
                              }}
                            />
                            {idx === subCategories.length - 1 ? (
                              <button
                                type="button"
                                onClick={addSubCategory}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}
                              >
                                ＋
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => removeSubCategory(idx)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: '#ef4444' }}
                              >
                                ✖
                              </button>
                            )}
                          </div>
                        ))}

                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: 4,
                            border: '1px dashed #cbd5e1',
                            fontSize: 12,
                            color: '#475569',
                            background: '#f8fafc'
                          }}
                        >
                          Other (fixed)
                        </div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={requireSubCategory}
                            onChange={(e) => setRequireSubCategory(e.target.checked)}
                            style={{ width: 14, height: 14 }}
                          />
                          <span>Required field</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ 
                  padding: 16, 
                  border: '1px solid #e6e9ee', 
                  borderRadius: 8,
                  background: enableAttachmentsForCategory ? '#fef3f2' : '#fafafa'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontWeight: 700, fontSize: 14 }}>Attachments</label>
                    <input 
                      type="checkbox" 
                      checked={enableAttachmentsForCategory} 
                      onChange={(e) => setEnableAttachmentsForCategory(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                    Allow file attachments on tickets in this category
                  </div>

                  {enableAttachmentsForCategory && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input 
                          type="checkbox" 
                          checked={requireAttachmentsForCategory} 
                          onChange={(e) => setRequireAttachmentsForCategory(e.target.checked)}
                          style={{ width: 14, height: 14 }}
                        /> 
                        <span>Required field</span>
                      </label>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {categorySuccess && (
              <div style={{ 
                marginTop: 16, 
                padding: '12px 16px', 
                background: '#ecfdf5', 
                color: '#065f46', 
                borderRadius: 8,
                border: '1px solid #a7f3d0',
                fontSize: 14,
                fontWeight: 600
              }}>
                ✓ {categorySuccess}
              </div>
            )}
            
            {categoryError && (
              <div style={{ 
                marginTop: 16, 
                padding: '12px 16px', 
                background: '#fff1f2', 
                color: '#9f1239', 
                borderRadius: 8,
                border: '1px solid #fecaca',
                fontSize: 14,
                fontWeight: 600
              }}>
                ✕ {categoryError}
              </div>
            )}

            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: 12, 
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid #e6e9ee'
            }}>
              <button 
                onClick={() => { resetCategoryForm(); setAddFieldOpen(false); }} 
                style={{ 
                  background: 'transparent', 
                  border: '1px solid #e6e9ee', 
                  color: '#6b7280', 
                  cursor: 'pointer',
                  padding: '10px 20px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                Cancel
              </button>
              <button 
                onClick={createCategory} 
                disabled={categoryLoading || !categoryName.trim()} 
                style={{ 
                  padding: '10px 24px', 
                  borderRadius: 8, 
                  background: categoryLoading || !categoryName.trim() ? '#9ec7df' : '#0b79bf', 
                  color: 'white', 
                  border: 'none', 
                  cursor: categoryLoading || !categoryName.trim() ? 'not-allowed' : 'pointer', 
                  fontWeight: 700,
                  fontSize: 14
                }}
              >
                {categoryLoading ? 'Creating Category…' : 'Create Category'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* NEW: Edit Field Modal */}
      {editFieldOpen && (
        <>
          <div
            onClick={() => { setEditFieldOpen(false); resetCategoryForm(); }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 90,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '24px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: editingCategory ? '800px' : '600px',
              maxWidth: '90vw',
              zIndex: 100,
              maxHeight: '85vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                {editingCategory ? 'Edit Category' : 'Edit Field'}
              </h3>
              <button 
                onClick={() => { setEditFieldOpen(false); resetCategoryForm(); }} 
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  color: '#6b7280'
                }}
              >
                ✖
              </button>
            </div>

            {!editingCategory && (
              <>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
                  Select a category to edit its configuration.
                </div>

                <div style={{ maxHeight: 400, overflow: 'auto', marginBottom: 16 }}>
                  {editCategoriesLoading && <div style={{ color: '#6b7280' }}>Loading categories…</div>}
                  {!editCategoriesLoading && categoriesForEdit.length === 0 && (
                    <div style={{ color: '#6b7280' }}>No categories found.</div>
		   )}
                  {categoriesForEdit.map(c => (
                    <div
                      key={c.id}
                      onClick={() => selectCategoryForEdit(c)}
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        marginBottom: 12,
                        background: '#fff',
                        border: '2px solid #e6e9ee',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#8b5cf6';
                        e.currentTarget.style.background = '#faf5ff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e6e9ee';
                        e.currentTarget.style.background = '#fff';
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#0f172a' }}>
                        {c.name || c.categoryName}
                      </div>
                      
                      {/* Show feature badges */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {c.features?.onBehalf?.enabled && (
                          <span style={{ 
                            fontSize: 11, 
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            background: '#dbeafe', 
                            color: '#1e40af',
                            fontWeight: 600
                          }}>
                            On Behalf {c.features.onBehalf.required ? '(Required)' : ''}
                          </span>
                        )}
                        {c.features?.subCategories?.enabled && (
                          <span style={{ 
                            fontSize: 11, 
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            background: '#dcfce7', 
                            color: '#166534',
                            fontWeight: 600
                          }}>
                            Sub-Category {c.features.subCategories.required ? '(Required)' : ''}
                          </span>
                        )}
                        {c.features?.attachments?.enabled && (
                          <span style={{ 
                            fontSize: 11, 
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            background: '#fee2e2', 
                            color: '#991b1b',
                            fontWeight: 600
                          }}>
                            Attachments {c.features.attachments.required ? '(Required)' : ''}
                          </span>
                        )}
                      </div>

                      {/* Show category heads count */}
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        <span style={{ fontWeight: 600 }}>Category Heads:</span> {c.categoryHeads?.length || 0}
                        {' '} | {' '}
                        <span style={{ fontWeight: 600 }}>CC Emails:</span> {c.cc?.length || 0}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Show edit form when category is selected */}
            {editingCategory && (
              <>
                <div style={{ 
                  fontSize: 13, 
                  color: '#6b7280', 
                  marginBottom: 20,
                  padding: 12,
                  background: '#f0fdf4',
                  borderRadius: 8,
                  border: '1px solid #bbf7d0'
                }}>
                  Editing: <strong>{editingCategory.name || editingCategory.categoryName}</strong>
                  <button
                    onClick={() => {
                      setEditingCategory(null);
                      resetCategoryForm();
                    }}
                    style={{
                      marginLeft: 12,
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: '#fff',
                      border: '1px solid #e6e9ee',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    ← Back to list
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  
                  {/* Category Name */}
                  <div style={{ width: '100%' }}>
                    <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>
                      Category Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input 
                      value={categoryName} 
                      onChange={(e) => setCategoryName(e.target.value)} 
                      placeholder="Enter category name" 
                      style={{ 
                        width: '100%', 
                        padding: '10px 12px', 
                        borderRadius: 8, 
                        border: '1px solid #e6e9ee',
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }} 
                    />
                  </div>

                  {/* Two Column Layout for Category Heads and CC Emails */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    
                    {/* Category Heads with Real-time Search */}
                    <div>
                      <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>
                        Category Heads <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                        Start typing to search and select users
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {categoryHeads.map((h, idx) => (
                          <div 
                            key={idx} 
                            ref={el => categoryHeadsRefs.current[idx] = el}
                            style={{ position: 'relative' }}
                          >
                            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                              <input
                                value={h.searchQuery}
                                onChange={(e) => updateCategoryHeadQuery(idx, e.target.value)}
                                placeholder="Type name or email..."
                                style={{ 
                                  flex: 1, 
                                  padding: '8px 10px', 
                                  borderRadius: 6, 
                                  border: h.email ? '1px solid #10b981' : '1px solid #e6e9ee',
                                  fontSize: 13,
                                  background: h.email ? '#ecfdf5' : 'white'
                                }}
                              />
                              {idx === categoryHeads.length - 1 ? (
                                <button 
                                  type="button" 
                                  onClick={addCategoryHead} 
                                  style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: 6, 
                                    background: '#eef2ff', 
                                    border: '1px solid #c7d2fe',
                                    cursor: 'pointer',
                                    fontSize: 16,
                                    fontWeight: 600
                                  }}
                                >
                                  ＋
                                </button>
                              ) : (
                                <button 
                                  type="button" 
                                  onClick={() => removeCategoryHead(idx)} 
                                  style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: 6, 
                                    background: '#fff1f2', 
                                    border: '1px solid #fecaca',
                                    cursor: 'pointer',
                                    fontSize: 14
                                  }}
                                >
                                  ✖
                                </button>
                              )}
                            </div>

                            {/* Dropdown for search results */}
                            {h.showDropdown && h.searchResults.length > 0 && (
                              <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                background: 'white',
                                border: '1px solid #e6e9ee',
                                borderRadius: 6,
                                marginTop: 4,
                                maxHeight: 200,
                                overflowY: 'auto',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                zIndex: 110
                              }}>
                                {h.searchResults.map((user, userIdx) => (
                                  <div
                                    key={userIdx}
                                    onClick={() => selectCategoryHead(idx, user)}
                                    style={{
                                      padding: '8px 12px',
                                      cursor: 'pointer',
                                      borderBottom: userIdx < h.searchResults.length - 1 ? '1px solid #f3f4f6' : 'none',
                                      background: 'white',
                                      transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                  >
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{user.displayName}</div>
                                    <div style={{ fontSize: 11, color: '#6b7280' }}>{user.mail}</div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Show selected user */}
                            {h.email && (
                              <div style={{ marginTop: 4, fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>✓</span>
                                <span>{h.name} ({h.email})</span>
                              </div>
                            )}

                            {/* Loading indicator */}
                            {h.searching && (
                              <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                                Searching...
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CC Emails with Real-time Search */}
                    <div>
                      <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>
                        CC Emails (Optional)
                      </label>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                        Start typing to search and select users
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {ccEmails.map((c, idx) => (
                          <div 
                            key={idx}
                            ref={el => ccEmailsRefs.current[idx] = el}
                            style={{ position: 'relative' }}
                          >
                            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                              <input
                                value={c.searchQuery}
                                onChange={(e) => updateCcEmailQuery(idx, e.target.value)}
                                placeholder="Type name or email..."
                                style={{ 
                                  flex: 1, 
                                  padding: '8px 10px', 
                                  borderRadius: 6, 
                                  border: c.email ? '1px solid #10b981' : '1px solid #e6e9ee',
                                  fontSize: 13,
                                  background: c.email ? '#ecfdf5' : 'white'
                                }}
                              />
                              {idx === ccEmails.length - 1 ? (
                                <button 
                                  type="button" 
                                  onClick={addCcEmail} 
                                  style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: 6, 
                                    background: '#eef2ff', 
                                    border: '1px solid #c7d2fe',
                                    cursor: 'pointer',
                                    fontSize: 16,
                                    fontWeight: 600
                                  }}
                                >
                                  ＋
                                </button>
                              ) : (
                                <button 
                                  type="button" 
                                  onClick={() => removeCcEmail(idx)} 
                                  style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: 6, 
                                    background: '#fff1f2', 
                                    border: '1px solid #fecaca',
                                    cursor: 'pointer',
                                    fontSize: 14
                                  }}
                                >
                                  ✖
                                </button>
                              )}
                            </div>

                            {/* Dropdown for search results */}
                            {c.showDropdown && c.searchResults.length > 0 && (
                              <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                background: 'white',
                                border: '1px solid #e6e9ee',
                                borderRadius: 6,
                                marginTop: 4,
                                maxHeight: 200,
                                overflowY: 'auto',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                zIndex: 110
                              }}>
                                {c.searchResults.map((user, userIdx) => (
                                  <div
                                    key={userIdx}
                                    onClick={() => selectCcEmail(idx, user)}
                                    style={{
                                      padding: '8px 12px',
                                      cursor: 'pointer',
                                      borderBottom: userIdx < c.searchResults.length - 1 ? '1px solid #f3f4f6' : 'none',
                                      background: 'white',
                                      transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                  >
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{user.displayName}</div>
                                    <div style={{ fontSize: 11, color: '#6b7280' }}>{user.mail}</div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Show selected user */}
                            {c.email && (
                              <div style={{ marginTop: 4, fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>✓</span>
                                <span>{c.name} ({c.email})</span>
                              </div>
                            )}

                            {/* Loading indicator */}
                            {c.searching && (
                              <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                                Searching...
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* Feature Toggles - Three Columns */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 8 }}>
                    
                    {/* On Behalf Feature */}
                    <div style={{ 
                      padding: 16, 
                      border: '1px solid #e6e9ee', 
                      borderRadius: 8,
                      background: enableOnBehalf ? '#f0f9ff' : '#fafafa'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ fontWeight: 700, fontSize: 14 }}>On Behalf</label>
                        <input 
                          type="checkbox" 
                          checked={enableOnBehalf} 
                          onChange={(e) => setEnableOnBehalf(e.target.checked)}
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                        Allow users to submit tickets for themselves or others
                      </div>

                      {enableOnBehalf && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                            Options
                          </div>
                          <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
                            • Self<br />
                            • Other
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={requireOnBehalf}
                                onChange={(e) => setRequireOnBehalf(e.target.checked)}
                                style={{ width: 14, height: 14 }}
                              />
                              <span>Required field</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sub-Category Feature */}
                    <div
                      style={{
                        padding: 16,
                        border: '1px solid #e6e9ee',
                        borderRadius: 8,
                        background: enableSubCategory ? '#f0fdf4' : '#fafafa'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ fontWeight: 700, fontSize: 14 }}>Sub-Category</label>
                        <input
                          type="checkbox"
                          checked={enableSubCategory}
                          onChange={(e) => setEnableSubCategory(e.target.checked)}
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                      </div>

                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                        Add multiple subcategories for users to choose from
                      </div>

                      {enableSubCategory && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                            Subcategories:
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {subCategories.length === 0 && (
                              <button
                                type="button"
                                onClick={addSubCategory}
                                style={{
                                  alignSelf: 'flex-start',
                                  background: '#eef2ff',
                                  border: '1px solid #c7d2fe',
                                  borderRadius: 6,
                                  padding: '4px 10px',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: 600
                                }}
                              >
                                + Add sub-category
                              </button>
                            )}

                            {subCategories.map((s, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input
                                  value={s}
                                  onChange={(e) => updateSubCategory(idx, e.target.value)}
                                  placeholder="e.g., Salary, Benefits"
                                  style={{
                                    flex: 1,
                                    padding: '6px 8px',
                                    borderRadius: 4,
                                    border: '1px solid #e6e9ee',
                                    fontSize: 12
                                  }}
                                />
                                {idx === subCategories.length - 1 ? (
                                  <button
                                    type="button"
                                    onClick={addSubCategory}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}
                                  >
                                    ＋
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => removeSubCategory(idx)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: '#ef4444' }}
                                  >
                                    ✖
                                  </button>
                                )}
                              </div>
                            ))}

                            <div
                              style={{
                                padding: '6px 8px',
                                borderRadius: 4,
                                border: '1px dashed #cbd5e1',
                                fontSize: 12,
                                color: '#475569',
                                background: '#f8fafc'
                              }}
                            >
                              Other (fixed)
                            </div>
                          </div>

                          <div style={{ marginTop: 10 }}>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={requireSubCategory}
                                onChange={(e) => setRequireSubCategory(e.target.checked)}
                                style={{ width: 14, height: 14 }}
                              />
                              <span>Required field</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Attachments Feature */}
                    <div style={{ 
                      padding: 16, 
                      border: '1px solid #e6e9ee', 
                      borderRadius: 8,
                      background: enableAttachmentsForCategory ? '#fef3f2' : '#fafafa'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ fontWeight: 700, fontSize: 14 }}>Attachments</label>
                        <input 
                          type="checkbox" 
                          checked={enableAttachmentsForCategory} 
                          onChange={(e) => setEnableAttachmentsForCategory(e.target.checked)}
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                        Allow file attachments on tickets in this category
                      </div>

                      {enableAttachmentsForCategory && (
                        <div style={{ marginTop: 12 }}>
                          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input 
                              type="checkbox" 
                              checked={requireAttachmentsForCategory} 
                              onChange={(e) => setRequireAttachmentsForCategory(e.target.checked)}
                              style={{ width: 14, height: 14 }}
                            /> 
                            <span>Required field</span>
                          </label>
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Success/Error Messages */}
                {categorySuccess && (
                  <div style={{ 
                    marginTop: 16, 
                    padding: '12px 16px', 
                    background: '#ecfdf5', 
                    color: '#065f46', 
                    borderRadius: 8,
                    border: '1px solid #a7f3d0',
                    fontSize: 14,
                    fontWeight: 600
                  }}>
                    ✓ {categorySuccess}
                  </div>
                )}
                
                {categoryError && (
                  <div style={{ 
                    marginTop: 16, 
                    padding: '12px 16px', 
                    background: '#fff1f2', 
                    color: '#9f1239', 
                    borderRadius: 8,
                    border: '1px solid #fecaca',
                    fontSize: 14,
                    fontWeight: 600
                  }}>
                    ✕ {categoryError}
                  </div>
                )}

                {/* Action Buttons for Edit */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'flex-end', 
                  gap: 12, 
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: '1px solid #e6e9ee'
                }}>
                  <button 
                    onClick={() => { 
                      setEditingCategory(null); 
                      resetCategoryForm(); 
                    }} 
                    style={{ 
                      background: 'transparent', 
                      border: '1px solid #e6e9ee', 
                      color: '#6b7280', 
                      cursor: 'pointer',
                      padding: '10px 20px',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 14
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={updateCategory} 
                    disabled={categoryLoading || !categoryName.trim()} 
                    style={{ 
                      padding: '10px 24px', 
                      borderRadius: 8, 
                      background: categoryLoading || !categoryName.trim() ? '#c4b5fd' : '#8b5cf6', 
                      color: 'white', 
                      border: 'none', 
                      cursor: categoryLoading || !categoryName.trim() ? 'not-allowed' : 'pointer', 
                      fontWeight: 700,
                      fontSize: 14
                    }}
                  >
                    {categoryLoading ? 'Updating Category…' : 'Update Category'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Remove Field Modal (unchanged) */}
      {removeFieldOpen && (
        <>
          <div
            onClick={() => setRemoveFieldOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 90,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '18px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: '560px',
              zIndex: 100,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Remove Category</h3>
              <button onClick={() => setRemoveFieldOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                ✖
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
              Select a category to remove. This operation is destructive and may impact existing tickets — confirm with your team.
            </div>

            <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 8 }}>
              {categoriesLoading && <div style={{ color: '#6b7280' }}>Loading categories…</div>}
              {!categoriesLoading && availableCategories.length === 0 && <div style={{ color: '#6b7280' }}>No categories found.</div>}
              {availableCategories.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCategoryToRemove(c)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 8,
                    background: selectedCategoryToRemove?.id === c.id ? '#fff1f2' : '#fff',
                    border: '1px solid rgba(15,23,42,0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{c.name || c.categoryName}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{c.description || ''}</div>
                  </div>
                </div>
              ))}
            </div>

            {removeCategorySuccess && <div style={{ padding: 10, background: '#ecfdf5', color: '#065f46', borderRadius: 8 }}>{removeCategorySuccess}</div>}
            {removeCategoryError && <div style={{ padding: 10, background: '#fff1f2', color: '#9f1239', borderRadius: 8 }}>{removeCategoryError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setRemoveFieldOpen(false)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={confirmRemoveCategory}
                disabled={removeCategoryLoading || !selectedCategoryToRemove}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: removeCategoryLoading ? '#f7a6a6' : '#ef4444',
                  color: 'white',
                  border: 'none',
                  cursor: removeCategoryLoading ? 'default' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {removeCategoryLoading ? 'Removing…' : 'Remove Category'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* FULL PROFILE MODAL (unchanged) */}
      {fullProfileOpen && (
        <>
          <div
            onClick={closeFullProfile}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 50,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '20px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: '420px',
              zIndex: 60,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0 }}>Full Profile</h3>
              <button
                onClick={closeFullProfile}
                aria-label="Close profile"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                }}
              >
                ✖
              </button>
            </div>

            {/* Photo */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  background: '#eef2ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  color: '#3730a3',
                  overflow: 'hidden',
                }}
              >
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt="profile"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <span style={{ fontSize: 20 }}>{initials}</span>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>
                  {accounts?.[0]?.name || ''}
                </div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>
                  {accounts?.[0]?.username || ''}
                </div>
              </div>
            </div>

            {loadingProfile && <p>Loading profile…</p>}

            {profileError && (
              <div style={{ color: 'crimson', marginBottom: '8px' }}>
                <p style={{ margin: 0 }}>Error loading profile:</p>
                <small>{profileError}</small>
              </div>
            )}

            {profileData && (
              <div style={{ display: 'grid', gap: '10px' }}>
              
                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Name</div>
                  <div style={{ fontWeight: 600 }}>{profileData.name || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Email</div>
                  <div style={{ fontWeight: 600 }}>{profileData.email || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Department</div>
                  <div style={{ fontWeight: 600 }}>{profileData.department || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Reporting Manager</div>
                  <div style={{ fontWeight: 600 }}>{profileData.manager || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Job Title</div>
                  <div style={{ fontWeight: 600 }}>{profileData.jobTitle || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Employee ID</div>
                  <div style={{ fontWeight: 600 }}>{profileData.employeeId || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Mobile</div>
                  <div style={{ fontWeight: 600 }}>{profileData.mobilePhone || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Street Address</div>
                  <div style={{ fontWeight: 600 }}>{profileData.streetAddress || '—'}</div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>State</div>
                    <div style={{ fontWeight: 600 }}>{profileData.state || '—'}</div>
                  </div>
                  <div style={{ width: '120px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Pincode</div>
                    <div style={{ fontWeight: 600 }}>{profileData.postalCode || '—'}</div>
                  </div>
                </div>
              </div>
            )}

            {!loadingProfile && !profileData && !profileError && (
              <div style={{ textAlign: 'center' }}>
                <small>No profile data available.</small>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function AppContent() {
  const { instance } = useMsal();

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: '/' });
  };

  const handleLogin = async () => {
    try {
      await instance.loginRedirect({
        scopes: ['User.Read', 'User.ReadBasic.All', 'GroupMember.Read.All'],
        prompt: 'select_account',
      });
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <Router>
      <AuthenticatedTemplate>
        <Header logout={handleLogout} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateTicket />} />
          <Route path="/ticket/:id" element={<TicketDetails />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <Login login={handleLogin} />
      </UnauthenticatedTemplate>
    </Router>
  );
}

function App() {
  return (
    <>
      <style>{`
        @keyframes floatGlow {
          0% { transform: translateX(-50%) translateY(0); opacity: 0.95; }
          50% { transform: translateX(-50%) translateY(-3px); opacity: 1; }
          100% { transform: translateX(-50%) translateY(0); opacity: 0.95; }
        }
      `}</style>

      <MsalProvider instance={pca}>
        <AppContent />
      </MsalProvider>
    </>
  );
}

export default App;