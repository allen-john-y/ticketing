import React, { useState, useRef, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes, useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import Login from './Login';
import Home from './Home';
import Tickets from './Tickets';
import CreateTicket from './CreateTicket';
import TicketDetails from './TicketDetails';
import Dashboard from './Dashboard';
import logo from './sandeza.jpg';
import gearIcon from './GearIcon.jpg';
import addUserIcon from './add-user.jpg';
import removeUserIcon from './remove-user.jpg';
import addFieldIcon from './add-field.jpg';
import editFieldIcon from './edit-field.jpg';
import removeFieldIcon from './remove-field.jpg';

const HELP_DESK_GROUP_ID = process.env.REACT_APP_HELP_DESK_GROUP_ID;
const backendBase = process.env.REACT_APP_BACKEND_URL;


function Header({ logout }) {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [requireApproval, setRequireApproval] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSearchUser, setSelectedSearchUser] = useState(null);
  const [addLoading, setAddLoading] = useState(false);
  const [addMessage, setAddMessage] = useState(null);
  const [addError, setAddError] = useState(null);

  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeMessage, setRemoveMessage] = useState(null);
  const [removeError, setRemoveError] = useState(null);

  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [removeFieldOpen, setRemoveFieldOpen] = useState(false);
  const [editFieldOpen, setEditFieldOpen] = useState(false);

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

  // New state variables for enhanced approval
  const [approvalReportingManager, setApprovalReportingManager] = useState(false);
  const [approvalOther, setApprovalOther] = useState(false);
  const [approvalOtherUsers, setApprovalOtherUsers] = useState([]);
  const [requireAllApprovals, setRequireAllApprovals] = useState(false);

  const [categoryHeads, setCategoryHeads] = useState([{ 
    email: '', name: '', searchQuery: '', searchResults: [], searching: false, showDropdown: false
  }]);

  const [ccEmails, setCcEmails] = useState([{ 
    email: '', name: '', searchQuery: '', searchResults: [], searching: false, showDropdown: false
  }]);

  const [availableCategories, setAvailableCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategoryToRemove, setSelectedCategoryToRemove] = useState(null);
  const [removeCategoryLoading, setRemoveCategoryLoading] = useState(false);
  const [removeCategoryError, setRemoveCategoryError] = useState(null);
  const [removeCategorySuccess, setRemoveCategorySuccess] = useState(null);

  const [editingCategory, setEditingCategory] = useState(null);
  const [categoriesForEdit, setCategoriesForEdit] = useState([]);
  const [editCategoriesLoading, setEditCategoriesLoading] = useState(false);

  const FIXED_OTHER = 'Other';

  const categoryHeadsRefs = useRef([]);
  const ccEmailsRefs = useRef([]);
  const approvalOtherRefs = useRef([]);

  const SIDEBAR_WIDTH_COLLAPSED = 80;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
      categoryHeadsRefs.current.forEach((ref, idx) => {
        if (ref && !ref.contains(e.target)) {
          setCategoryHeads(prev => prev.map((h, i) => i === idx ? { ...h, showDropdown: false } : h));
        }
      });
      ccEmailsRefs.current.forEach((ref, idx) => {
        if (ref && !ref.contains(e.target)) {
          setCcEmails(prev => prev.map((c, i) => i === idx ? { ...c, showDropdown: false } : c));
        }
      });
      approvalOtherRefs.current.forEach((ref, idx) => {
        if (ref && !ref.contains(e.target)) {
          setApprovalOtherUsers(prev => prev.map((u, i) => i === idx ? { ...u, showDropdown: false } : u));
        }
      });
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          instance.acquireTokenPopup({
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
        await instance.acquireTokenPopup({
          scopes: ['Group.ReadWrite.All', 'User.Read.All'],
          account: accounts[0],
        });
        throw new Error('Redirecting for consent');
      }
      throw err;
    }
  };

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

  const resetCategoryForm = () => {
    setCategoryName('');
    setEnableOnBehalf(false);
    setRequireOnBehalf(false);
    setEnableSubCategory(false);
    setSubCategories([]);
    setRequireSubCategory(false);
    setEnableAttachmentsForCategory(false);
    setRequireApproval(false);
    setApprovalReportingManager(false);
    setApprovalOther(false);
    setApprovalOtherUsers([]);
    setRequireAllApprovals(false);
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
    setSubCategories(prev => prev.map((s, i) => (i === idx ? value : s)));
  };

  const removeSubCategory = (idx) => {
    setSubCategories(prev => prev.filter((_, i) => i !== idx));
  };

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
      email: '', name: '', searchQuery: '', searchResults: [], searching: false, showDropdown: false
    }]);
  };

  const removeCategoryHead = (idx) => {
    setCategoryHeads(prev => prev.filter((_, i) => i !== idx));
    categoryHeadsRefs.current = categoryHeadsRefs.current.filter((_, i) => i !== idx);
  };

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
      email: '', name: '', searchQuery: '', searchResults: [], searching: false, showDropdown: false
    }]);
  };

  const removeCcEmail = (idx) => {
    setCcEmails(prev => prev.filter((_, i) => i !== idx));
    ccEmailsRefs.current = ccEmailsRefs.current.filter((_, i) => i !== idx);
  };

  // Approval Other Users Functions
  const handleApprovalOtherSearch = async (idx, searchText) => {
    if (!searchText || searchText.trim().length < 2) {
      setApprovalOtherUsers(prev => prev.map((u, i) => 
        i === idx ? { ...u, searchResults: [], showDropdown: false } : u
      ));
      return;
    }

    setApprovalOtherUsers(prev => prev.map((u, i) => 
      i === idx ? { ...u, searching: true, showDropdown: true } : u
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

      setApprovalOtherUsers(prev => prev.map((u, i) => 
        i === idx ? { ...u, searchResults: results, searching: false } : u
      ));
    } catch (err) {
      console.error('Error searching approval other users:', err);
      setApprovalOtherUsers(prev => prev.map((u, i) => 
        i === idx ? { ...u, searchResults: [], searching: false } : u
      ));
    }
  };

  const selectApprovalOtherUser = (idx, user) => {
    setApprovalOtherUsers(prev => prev.map((u, i) => 
      i === idx 
        ? { 
            email: user.mail, 
            name: user.displayName, 
            searchQuery: user.displayName,
            searchResults: [],
            searching: false,
            showDropdown: false,
            id: user.id
          } 
        : u
    ));
  };

  const updateApprovalOtherQuery = (idx, query) => {
    setApprovalOtherUsers(prev => prev.map((u, i) => 
      i === idx ? { ...u, searchQuery: query, email: '', name: '' } : u
    ));
    handleApprovalOtherSearch(idx, query);
  };

  const addApprovalOtherUser = () => {
    setApprovalOtherUsers(prev => [...prev, { 
      email: '', 
      name: '', 
      searchQuery: '', 
      searchResults: [], 
      searching: false, 
      showDropdown: false,
      id: null
    }]);
  };

  const removeApprovalOtherUser = (idx) => {
    setApprovalOtherUsers(prev => prev.filter((_, i) => i !== idx));
    approvalOtherRefs.current = approvalOtherRefs.current.filter((_, i) => i !== idx);
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
          approvalRequired: requireApproval,
          onBehalf: enableOnBehalf 
            ? { enabled: true, options: FIXED_ONBEHALF_OPTIONS, required: !!requireOnBehalf }
            : { enabled: false },
          subCategories: enableSubCategory
            ? {
                enabled: true,
                list: [
                  ...subCategories.map(s => s.trim()).filter(s => s && s !== FIXED_OTHER),
                  FIXED_OTHER
                ],
                required: !!requireSubCategory
              }
            : { enabled: false },
          attachments: enableAttachmentsForCategory 
            ? { enabled: true, required: !!requireAttachmentsForCategory } 
            : { enabled: false },
        },
        approvalConfig: requireApproval ? {
          reportingManager: approvalReportingManager,
          other: approvalOther ? {
            users: approvalOtherUsers
              .filter(u => u.email && u.email.trim())
              .map(u => ({ 
                email: u.email.trim(), 
                name: u.name || u.email.trim(),
                id: u.id
              })),
            requireAll: requireAllApprovals
          } : null
        } : null,
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
    
    setCategoryName(category.name || category.categoryName || '');
    setRequireApproval(!!category.features?.approvalRequired);
    
    // Load approval config
    if (category.approvalConfig) {
      setApprovalReportingManager(!!category.approvalConfig.reportingManager);
      setApprovalOther(!!category.approvalConfig.other);
      setRequireAllApprovals(!!category.approvalConfig.other?.requireAll);
      
      if (category.approvalConfig.other?.users) {
        setApprovalOtherUsers(category.approvalConfig.other.users.map(u => ({
          email: u.email || '',
          name: u.name || u.email || '',
          searchQuery: u.name || u.email || '',
          searchResults: [],
          searching: false,
          showDropdown: false,
          id: u.id
        })));
      } else {
        setApprovalOtherUsers([]);
      }
    } else {
      setApprovalReportingManager(false);
      setApprovalOther(false);
      setApprovalOtherUsers([]);
      setRequireAllApprovals(false);
    }
    
    const features = category.features || {};
    
    if (features.onBehalf && features.onBehalf.enabled) {
      setEnableOnBehalf(true);
      setRequireOnBehalf(!!features.onBehalf.required);
    } else {
      setEnableOnBehalf(false);
      setRequireOnBehalf(false);
    }
    
    if (features.subCategories && features.subCategories.enabled) {
      setEnableSubCategory(true);
      const list = features.subCategories.list || [];
      const filteredList = list.filter(s => s !== FIXED_OTHER);
      setSubCategories(filteredList);
      setRequireSubCategory(!!features.subCategories.required);
    } else {
      setEnableSubCategory(false);
      setSubCategories([]);
      setRequireSubCategory(false);
    }
    
    if (features.attachments && features.attachments.enabled) {
      setEnableAttachmentsForCategory(true);
      setRequireAttachmentsForCategory(!!features.attachments.required);
    } else {
      setEnableAttachmentsForCategory(false);
      setRequireAttachmentsForCategory(false);
    }
    
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
          approvalRequired: requireApproval,
          onBehalf: enableOnBehalf 
            ? { enabled: true, options: FIXED_ONBEHALF_OPTIONS, required: !!requireOnBehalf }
            : { enabled: false },
          subCategories: enableSubCategory
            ? {
                enabled: true,
                list: [
                  ...subCategories.map(s => s.trim()).filter(s => s && s !== FIXED_OTHER),
                  FIXED_OTHER
                ],
                required: !!requireSubCategory
              }
            : { enabled: false },
          attachments: enableAttachmentsForCategory 
            ? { enabled: true, required: !!requireAttachmentsForCategory } 
            : { enabled: false },
        },
        approvalConfig: requireApproval ? {
          reportingManager: approvalReportingManager,
          other: approvalOther ? {
            users: approvalOtherUsers
              .filter(u => u.email && u.email.trim())
              .map(u => ({ 
                email: u.email.trim(), 
                name: u.name || u.email.trim(),
                id: u.id
              })),
            requireAll: requireAllApprovals
          } : null
        } : null,
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
        instance.acquireTokenPopup({
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

  const isActiveRoute = (path) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        * { 
          box-sizing: border-box; 
          margin: 0; 
          padding: 0; 
        }

        .app-root {
          min-height: 100vh;
          background: #f4f4f0;
          font-family: 'DM Sans', sans-serif;
          color: #111827;
        }

        /* App Container */
        .app-container {
          display: flex;
          min-height: 100vh;
        }
        
        /* Vertical Sidebar - Collapsed (only icons) */
        .vertical-sidebar {
          position: fixed;
          left: 0;
          top: 0;
          height: 100vh;
          background: #002060;
          color: white;
          width: ${SIDEBAR_WIDTH_COLLAPSED}px;
          overflow: hidden;
          box-shadow: 2px 0 8px rgba(0,0,0,0.05);
          z-index: 1000;
        }
        
        .sidebar-content {
          padding: 1.5rem 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: ${SIDEBAR_WIDTH_COLLAPSED}px;
        }
        
        .sidebar-user {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 0 0.5rem;
          margin-bottom: 2rem;
          width: 100%;
        }
        
        .sidebar-avatar {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          background: #e98404;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          color: white;
          font-size: 16px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .sidebar-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0 0.5rem;
          width: 100%;
        }
        
        .sidebar-nav-item {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 0.75rem;
          border-radius: 6px;
          text-decoration: none;
          color: #9ca3af;
          transition: all 0.15s;
          cursor: pointer;
          border: none;
          background: none;
          width: 100%;
          position: relative;
          font-size: 20px;
        }
        
        .sidebar-nav-item:hover {
          background: #1f2937;
          color: white;
        }
        
        .sidebar-nav-item.active {
          background: #1f2937;
          color: white;
        }
        
        .sidebar-nav-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 25%;
          height: 50%;
          width: 3px;
          background: #f59e0b;
          border-radius: 0 2px 2px 0;
        }
        
        .sidebar-nav-icon {
          font-size: 20px;
          min-width: 20px;
          display: flex;
          justify-content: center;
        }
        
        /* Main Content Area */
        .main-wrapper {
          flex: 1;
          margin-left: ${SIDEBAR_WIDTH_COLLAPSED}px;
          width: calc(100% - ${SIDEBAR_WIDTH_COLLAPSED}px);
          min-height: 100vh;
          background: #f4f4f0;
        }
        
        /* App Header */
        .app-header {
          background: white;
          padding: 1rem 2rem;
          border-bottom: 1px solid #d9d5cc;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        
        .logo-img {
          width: 40px;
          height: 40px;
          border-radius: 6px;
          object-fit: cover;
          cursor: pointer;
          border: 1px solid #d9d5cc;
        }
        
        .company-info {
          cursor: pointer;
        }
        
        .company-info h1 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.02em;
        }
        
        .company-subtitle {
          color: #6b7280;
          font-size: 11px;
          margin-top: 2px;
          font-weight: 500;
        }
        
        .header-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .settings-btn {
          width: 38px;
          height: 38px;
          border-radius: 6px;
          border: 1px solid #d9d5cc;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        
        .settings-btn:hover {
          background: #f9f8f6;
          transform: translateY(-1px);
        }
        
        .settings-btn img {
          width: 18px;
          height: 18px;
          opacity: 0.7;
        }
        
        .settings-dropdown {
          position: absolute;
          right: 0;
          margin-top: 8px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          padding: 0.5rem;
          width: 240px;
          z-index: 60;
          border: 1px solid #d9d5cc;
        }
        
        .dropdown-title {
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.5rem;
          padding: 0.5rem;
          border-bottom: 1px solid #d9d5cc;
          font-size: 13px;
        }
        
        .dropdown-item {
          width: 100%;
          text-align: left;
          background: transparent;
          border: none;
          padding: 0.6rem 0.75rem;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          font-size: 13px;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #374151;
        }
        
        .dropdown-item:hover {
          background: #f9f8f6;
        }
        
        .dropdown-item img {
          width: 16px;
          height: 16px;
          opacity: 0.7;
        }
        
        .profile-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid #d9d5cc;
          background: white;
          color: #111827;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        
        .profile-btn:hover {
          background: #f9f8f6;
          transform: translateY(-1px);
        }
        
        .profile-avatar {
          width: 28px;
          height: 28px;
          border-radius: 4px;
          background: #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 12px;
          overflow: hidden;
          color: #374151;
        }
        
        .profile-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .profile-info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1.2;
        }
        
        .profile-name {
          font-size: 12px;
          font-weight: 600;
          color: #111827;
        }
        
        .profile-email {
          font-size: 10px;
          color: #6b7280;
        }
        
        .profile-dropdown {
          position: absolute;
          right: 0;
          margin-top: 8px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          padding: 1rem;
          width: 280px;
          z-index: 60;
          border: 1px solid #d9d5cc;
        }
        
        .profile-dropdown-header {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #d9d5cc;
        }
        
        .profile-dropdown-avatar {
          width: 48px;
          height: 48px;
          border-radius: 6px;
          background: #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          color: #374151;
          overflow: hidden;
        }
        
        .profile-dropdown-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .profile-dropdown-info {
          flex: 1;
        }
        
        .profile-dropdown-name {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 2px;
          color: #111827;
        }
        
        .profile-dropdown-email {
          font-size: 12px;
          color: #6b7280;
        }
        
        .profile-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .profile-action-btn {
          width: 100%;
          text-align: left;
          padding: 0.6rem 0.75rem;
          border-radius: 4px;
          border: none;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
        }
        
        .btn-view-profile {
          background: #f9f8f6;
          color: #111827;
        }
        
        .btn-view-profile:hover {
          background: #e5e7eb;
        }
        
        .btn-logout {
          background: #ef4444;
          color: white;
        }
        
        .btn-logout:hover {
          background: #dc2626;
        }
        
        /* Modal Styles - Matching Home/TicketDetails */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 9999;
          backdrop-filter: blur(3px);
          animation: fadeIn 0.15s;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        .modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border-radius: 10px;
          padding: 1.75rem;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          z-index: 10000;
          max-height: 90vh;
          overflow-y: auto;
          animation: slideUp 0.2s;
          border: 1px solid #d9d5cc;
        }
        
        .modal-small { width: 500px; max-width: 90vw; }
        .modal-large { width: 800px; max-width: 95vw; }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #d9d5cc;
        }
        
        .modal-title {
          margin: 0;
          font-size: 1.2rem;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.02em;
        }
        
        .modal-close {
          background: transparent;
          border: none;
          font-size: 1.2rem;
          color: #9ca3af;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.15s;
        }
        
        .modal-close:hover {
          background: #f9f8f6;
          color: #374151;
        }
        
        .modal-subtitle {
          font-size: 13px;
          color: #6b7280;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }
        
        .form-group {
          margin-bottom: 1.25rem;
        }
        
        .form-label {
          display: block;
          font-weight: 600;
          font-size: 12px;
          color: #374151;
          margin-bottom: 0.5rem;
          letter-spacing: 0.02em;
        }
        
        .form-input {
          width: 100%;
          padding: 0.6rem 0.75rem;
          border: 1px solid #d9d5cc;
          border-radius: 6px;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          background: #fafaf8;
          color: #111827;
          transition: all 0.15s;
        }
        
        .form-input:focus {
          outline: none;
          border-color: #111827;
          background: white;
          box-shadow: 0 0 0 3px rgba(17,24,39,0.07);
        }
        
        .btn {
          padding: 0.6rem 1.2rem;
          border-radius: 6px;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s;
          border: none;
          font-family: 'DM Sans', sans-serif;
        }
        
        .btn-primary {
          background: #111827;
          color: white;
        }
        
        .btn-primary:hover:not(:disabled) {
          background: #1f2937;
          transform: translateY(-1px);
        }
        
        .btn-primary:disabled {
          background: #d1d5db;
          cursor: not-allowed;
        }
        
        .btn-danger {
          background: #ef4444;
          color: white;
        }
        
        .btn-danger:hover:not(:disabled) {
          background: #dc2626;
          transform: translateY(-1px);
        }
        
        .btn-secondary {
          background: white;
          color: #374151;
          border: 1px solid #d9d5cc;
        }
        
        .btn-secondary:hover {
          background: #f9f8f6;
          transform: translateY(-1px);
        }
        
        .btn-success {
          background: #10b981;
          color: white;
        }
        
        .btn-success:hover:not(:disabled) {
          background: #059669;
          transform: translateY(-1px);
        }
        
        .message {
          padding: 0.75rem 1rem;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          margin-top: 1rem;
        }
        
        .message-success {
          background: #d1fae5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        
        .message-error {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        
        .user-list {
          max-height: 300px;
          overflow-y: auto;
          margin-bottom: 1rem;
          border: 1px solid #d9d5cc;
          border-radius: 6px;
          background: white;
        }
        
        .user-item {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #d9d5cc;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .user-item:last-child {
          border-bottom: none;
        }
        
        .user-item:hover {
          background: #f9f8f6;
        }
        
        .user-item.selected {
          background: #eff6ff;
          border-left: 3px solid #111827;
        }
        
        .user-item.danger-selected {
          background: #fee2e2;
          border-left: 3px solid #ef4444;
        }
        
        .user-name {
          font-weight: 600;
          font-size: 13px;
          margin-bottom: 2px;
          color: #111827;
        }
        
        .user-email {
          font-size: 11px;
          color: #6b7280;
        }
        
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1.5rem;
          padding-top: 1.25rem;
          border-top: 1px solid #d9d5cc;
        }
        
        /* Page content area */
        .page-content {
          padding: 0;
        }
        
        /* Tooltip */
        .sidebar-nav-item {
          position: relative;
        }
        
        .sidebar-nav-item:hover::after {
          content: attr(data-tooltip);
          position: absolute;
          left: 100%;
          top: 50%;
          transform: translateY(-50%);
          background: #002060;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          white-space: nowrap;
          margin-left: 8px;
          z-index: 1001;
          pointer-events: none;
          font-weight: 500;
          letter-spacing: 0.02em;
        }
        
        @media (max-width: 768px) {
          .vertical-sidebar {
            width: 0;
            display: none;
          }
          
          .main-wrapper {
            margin-left: 0;
            width: 100%;
          }
          
          .modal-small,
          .modal-large {
            width: 95vw;
            padding: 1.25rem;
          }
        }
      `}</style>

      <div className="app-root">
        <div className="app-container">
          {/* Persistent Vertical Sidebar - Collapsed (only icons) */}
          <div className="vertical-sidebar">
            <div className="sidebar-content">
              {/* User Avatar Only */}
              <div className="sidebar-user">
                <div className="sidebar-avatar">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="profile" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
              </div>

              {/* Navigation Items - Only Icons */}
              <div className="sidebar-nav">
                <Link 
                  to="/" 
                  className={`sidebar-nav-item ${isActiveRoute('/') ? 'active' : ''}`}
                  data-tooltip="Dashboard"
                >
                  <span className="sidebar-nav-icon">📊</span>
                </Link>
                
                <Link 
                  to="/create" 
                  className={`sidebar-nav-item ${isActiveRoute('/create') ? 'active' : ''}`}
                  data-tooltip="New Ticket"
                >
                  <span className="sidebar-nav-icon">+</span>
                </Link>
                
                <Link 
                  to="/tickets" 
                  className={`sidebar-nav-item ${isActiveRoute('/tickets') ? 'active' : ''}`}
                  data-tooltip="All Tickets"
                >
                  <span className="sidebar-nav-icon">🎫</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="main-wrapper">
            {/* App Header */}
            <header className="app-header">
              <div className="header-left">
                <img
                  src={logo}
                  alt="Sandeza logo"
                  className="logo-img"
                  onClick={() => navigate('/')}
                />

                <div
                  className="company-info"
                  onClick={() => navigate('/')}
                >
                  <h1>SANDEZA INC</h1>
                  <div className="company-subtitle">IT Ticket Portal</div>
                </div>
              </div>

              <div className="header-right">
                {isAdmin && (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setSettingsOpen(s => !s)}
                      className="settings-btn"
                      aria-label="Admin settings"
                    >
                      <img src={gearIcon} alt="Settings" />
                    </button>

                    {settingsOpen && (
                      <div className="settings-dropdown">
                        <div className="dropdown-title">Admin Settings</div>

                        <button
                          onClick={() => { openAddModal(); setSettingsOpen(false); }}
                          className="dropdown-item"
                        >
                          <img src={addUserIcon} alt="Add User" />
                          Add User
                        </button>

                        <button
                          onClick={() => { openRemoveModal(); setSettingsOpen(false); }}
                          className="dropdown-item"
                        >
                          <img src={removeUserIcon} alt="Remove User" />
                          Remove User
                        </button>

                        <button
                          onClick={() => { resetCategoryForm(); setAddFieldOpen(true); setSettingsOpen(false); }}
                          className="dropdown-item"
                        >
                          <img src={addFieldIcon} alt="Add Field" />
                          Add Field
                        </button>

                        <button
                          onClick={() => { openEditFieldModal(); setSettingsOpen(false); }}
                          className="dropdown-item"
                        >
                          <img src={editFieldIcon} alt="Edit Field" />
                          Edit Field
                        </button>

                        <button
                          onClick={() => { openRemoveFieldModal(); setSettingsOpen(false); }}
                          className="dropdown-item"
                        >
                          <img src={removeFieldIcon} alt="Remove Field" />
                          Remove Field
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div ref={profileRef} style={{ position: 'relative' }}>
                  <button onClick={() => setProfileOpen(prev => !prev)} className="profile-btn">
                    <div className="profile-avatar">
                      {profilePhoto ? (
                        <img src={profilePhoto} alt="profile" />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>

                    <div className="profile-info">
                      <span className="profile-name">{accounts?.[0]?.name || accounts?.[0]?.username}</span>
                      <span className="profile-email">{accounts?.[0]?.username}</span>
                    </div>

                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {profileOpen && (
                    <div className="profile-dropdown">
                      <div className="profile-dropdown-header">
                        <div className="profile-dropdown-avatar">
                          {profilePhoto ? (
                            <img src={profilePhoto} alt="profile" />
                          ) : (
                            <span style={{ fontSize: 16 }}>{initials}</span>
                          )}
                        </div>
                        <div className="profile-dropdown-info">
                          <div className="profile-dropdown-name">{accounts?.[0]?.name || 'Unknown'}</div>
                          <div className="profile-dropdown-email">{accounts?.[0]?.username}</div>
                        </div>
                      </div>

                      <div className="profile-actions">
                        <button onClick={() => { openFullProfile(); setProfileOpen(false); }} className="profile-action-btn btn-view-profile">
                          👤 View Full Profile
                        </button>

                        <button onClick={logout} className="profile-action-btn btn-logout">
                          🚪 Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Page Content - Routes will render here */}
            <div className="page-content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/create" element={<CreateTicket />} />
                <Route path="/ticket/:id" element={<TicketDetails />} />
                <Route path="/dashboard" element={<Dashboard />} />
              </Routes>
            </div>
          </div>
        </div>

        {/* Modals - All content preserved, just styled to match */}
        {addModalOpen && (
          <>
            <div className="modal-overlay" onClick={closeAddModal} />
            <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Add Admin User</h3>
                <button onClick={closeAddModal} className="modal-close">✕</button>
              </div>

              <div className="modal-subtitle">
                Search for users by email to add them to the Helpdesk_Admin group.
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by email..."
                  className="form-input"
                  onKeyDown={(e) => { if (e.key === 'Enter') performSearch(); }}
                  style={{ flex: 1 }}
                />
                <button onClick={performSearch} disabled={searchLoading} className="btn btn-primary">
                  {searchLoading ? 'Searching...' : 'Search'}
                </button>
              </div>

              <div className="user-list">
                {searchResults.length === 0 && !searchLoading && (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                    No results yet. Search for a user above.
                  </div>
                )}
                {searchResults.map(u => (
                  <div
                    key={u.id}
                    onClick={() => setSelectedSearchUser(u)}
                    className={`user-item ${selectedSearchUser?.id === u.id ? 'selected' : ''}`}
                  >
                    <div className="user-name">{u.displayName}</div>
                    <div className="user-email">{u.mail || u.userPrincipalName}</div>
                  </div>
                ))}
              </div>

              {addMessage && <div className="message message-success">{addMessage}</div>}
              {addError && <div className="message message-error">{addError}</div>}

              <div className="modal-footer">
                <button onClick={closeAddModal} className="btn btn-secondary">Cancel</button>
                <button
                  onClick={confirmAddUser}
                  disabled={addLoading || !selectedSearchUser}
                  className="btn btn-primary"
                >
                  {addLoading ? 'Adding...' : 'Add as Admin'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Remove User Modal */}
        {removeModalOpen && (
          <>
            <div className="modal-overlay" onClick={closeRemoveModal} />
            <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Remove Admin User</h3>
                <button onClick={closeRemoveModal} className="modal-close">✕</button>
              </div>

              <div className="modal-subtitle">
                Select a user to remove their admin rights from the Helpdesk_Admin group.
              </div>

              <div className="user-list">
                {membersLoading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>Loading members...</div>}
                {!membersLoading && groupMembers.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>No members found.</div>
                )}
                {groupMembers.map(m => (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMember(m)}
                    className={`user-item ${selectedMember?.id === m.id ? 'danger-selected' : ''}`}
                  >
                    <div className="user-name">{m.displayName}</div>
                    <div className="user-email">{m.mail || m.userPrincipalName}</div>
                  </div>
                ))}
              </div>

              {removeMessage && <div className="message message-success">{removeMessage}</div>}
              {removeError && <div className="message message-error">{removeError}</div>}

              <div className="modal-footer">
                <button onClick={closeRemoveModal} className="btn btn-secondary">Cancel</button>
                <button
                  onClick={confirmRemoveUser}
                  disabled={removeLoading || !selectedMember}
                  className="btn btn-danger"
                >
                  {removeLoading ? 'Removing...' : 'Remove Admin'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Add Field Modal */}
        {addFieldOpen && (
          <>
            <div className="modal-overlay" onClick={() => setAddFieldOpen(false)} />
            <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Add Category / Field</h3>
                <button onClick={() => setAddFieldOpen(false)} className="modal-close">✕</button>
              </div>

              <div className="modal-subtitle">
                Define a new category with custom fields. Users in Category Heads and CCs will be notified for ticket actions.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                <div className="form-group">
                  <label className="form-label">Category Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input 
                    value={categoryName} 
                    onChange={(e) => setCategoryName(e.target.value)} 
                    placeholder="e.g., HR, IT Support, Finance" 
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                  
                  <div>
                    <label className="form-label">Category Heads <span style={{ color: '#ef4444' }}>*</span></label>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Start typing to search and select users
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {categoryHeads.map((h, idx) => (
                        <div 
                          key={idx} 
                          ref={el => categoryHeadsRefs.current[idx] = el}
                          style={{ position: 'relative' }}
                        >
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              value={h.searchQuery}
                              onChange={(e) => updateCategoryHeadQuery(idx, e.target.value)}
                              placeholder="Type name or email..."
                              style={{ 
                                flex: 1, 
                                padding: '0.5rem 0.6rem', 
                                borderRadius: '6px', 
                                border: h.email ? '1px solid #10b981' : '1px solid #d9d5cc',
                                background: h.email ? '#ecfdf5' : '#fafaf8',
                                fontSize: '12px',
                                fontFamily: 'DM Sans, sans-serif'
                              }}
                            />
                            
                            {idx === categoryHeads.length - 1 ? (
                              <button
                                type="button"
                                onClick={addCategoryHead}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: '6px',
                                  background: '#f9f8f6',
                                  border: '1px solid #d9d5cc',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: '500'
                                }}
                              >
                                ＋
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => removeCategoryHead(idx)}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: '6px',
                                  background: '#fee2e2',
                                  border: '1px solid #fecaca',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                ✕
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
                              border: '1px solid #d9d5cc',
                              borderRadius: '6px',
                              marginTop: '4px',
                              maxHeight: '200px',
                              overflowY: 'auto',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              zIndex: 110
                            }}>
                              {h.searchResults.map((user, userIdx) => (
                                <div
                                  key={userIdx}
                                  onClick={() => selectCategoryHead(idx, user)}
                                  style={{
                                    padding: '0.6rem 0.75rem',
                                    cursor: 'pointer',
                                    borderBottom: userIdx < h.searchResults.length - 1 ? '1px solid #d9d5cc' : 'none',
                                    background: 'white',
                                    transition: 'background 0.15s',
                                    fontSize: '12px'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9f8f6'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                  <div style={{ fontWeight: '600', marginBottom: '2px' }}>{user.displayName}</div>
                                  <div style={{ fontSize: '10px', color: '#6b7280' }}>{user.mail}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {h.email && (
                            <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>✓</span>
                              <span>{h.name} ({h.email})</span>
                            </div>
                          )}

                          {h.searching && (
                            <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#6b7280' }}>
                              Searching...
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="form-label">CC Emails (Optional)</label>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Start typing to search and select users
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {ccEmails.map((c, idx) => (
                        <div 
                          key={idx}
                          ref={el => ccEmailsRefs.current[idx] = el}
                          style={{ position: 'relative' }}
                        >
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              value={c.searchQuery}
                              onChange={(e) => updateCcEmailQuery(idx, e.target.value)}
                              placeholder="Type name or email..."
                              style={{ 
                                flex: 1, 
                                padding: '0.5rem 0.6rem', 
                                borderRadius: '6px', 
                                border: c.email ? '1px solid #10b981' : '1px solid #d9d5cc',
                                background: c.email ? '#ecfdf5' : '#fafaf8',
                                fontSize: '12px',
                                fontFamily: 'DM Sans, sans-serif'
                              }}
                            />
                            
                            {idx === ccEmails.length - 1 ? (
                              <button 
                                type="button" 
                                onClick={addCcEmail} 
                                style={{ 
                                  padding: '0.5rem 0.75rem', 
                                  borderRadius: '6px', 
                                  background: '#f9f8f6', 
                                  border: '1px solid #d9d5cc',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: '500'
                                }}
                              >
                                ＋
                              </button>
                            ) : (
                              <button 
                                type="button" 
                                onClick={() => removeCcEmail(idx)} 
                                style={{ 
                                  padding: '0.5rem 0.75rem', 
                                  borderRadius: '6px', 
                                  background: '#fee2e2', 
                                  border: '1px solid #fecaca',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                ✕
                              </button>
                            )}

                          </div>

                          {c.showDropdown && c.searchResults.length > 0 && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              background: 'white',
                              border: '1px solid #d9d5cc',
                              borderRadius: '6px',
                              marginTop: '4px',
                              maxHeight: '200px',
                              overflowY: 'auto',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              zIndex: 110
                            }}>
                              {c.searchResults.map((user, userIdx) => (
                                <div
                                  key={userIdx}
                                  onClick={() => selectCcEmail(idx, user)}
                                  style={{
                                    padding: '0.6rem 0.75rem',
                                    cursor: 'pointer',
                                    borderBottom: userIdx < c.searchResults.length - 1 ? '1px solid #d9d5cc' : 'none',
                                    background: 'white',
                                    transition: 'background 0.15s',
                                    fontSize: '12px'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9f8f6'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                  <div style={{ fontWeight: '600', marginBottom: '2px' }}>{user.displayName}</div>
                                  <div style={{ fontSize: '10px', color: '#6b7280' }}>{user.mail}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {c.email && (
                            <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>✓</span>
                              <span>{c.name} ({c.email})</span>
                            </div>
                          )}

                          {c.searching && (
                            <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#6b7280' }}>
                              Searching...
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  
                  <div style={{ 
                    padding: '1rem', 
                    border: '1px solid #d9d5cc', 
                    borderRadius: '8px',
                    background: enableOnBehalf ? '#f0f9ff' : '#fafaf8'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ fontWeight: '600', fontSize: '12px' }}>On Behalf</label>
                      <input 
                        type="checkbox" 
                        checked={enableOnBehalf} 
                        onChange={(e) => setEnableOnBehalf(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Allow users to submit tickets for themselves or others
                    </div>

                    {enableOnBehalf && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="checkbox"
                            checked={requireOnBehalf}
                            onChange={(e) => setRequireOnBehalf(e.target.checked)}
                            style={{ width: '14px', height: '14px' }}
                          />
                          <span>Required field</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      padding: '1rem',
                      border: '1px solid #d9d5cc',
                      borderRadius: '8px',
                      background: enableSubCategory ? '#f0fdf4' : '#fafaf8'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ fontWeight: '600', fontSize: '12px' }}>Sub-Category</label>
                      <input
                        type="checkbox"
                        checked={enableSubCategory}
                        onChange={(e) => setEnableSubCategory(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </div>

                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Add subcategories for users to choose from
                    </div>

                    {enableSubCategory && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {subCategories.length === 0 && (
                            <button
                              type="button"
                              onClick={addSubCategory}
                              style={{
                                alignSelf: 'flex-start',
                                background: '#f9f8f6',
                                border: '1px solid #d9d5cc',
                                borderRadius: '4px',
                                padding: '0.25rem 0.75rem',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '500'
                              }}
                            >
                              + Add sub-category
                            </button>
                          )}

                          {subCategories.map((s, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <input
                                value={s}
                                onChange={(e) => updateSubCategory(idx, e.target.value)}
                                placeholder="e.g., Salary, Benefits"
                                style={{
                                  flex: 1,
                                  padding: '0.4rem 0.6rem',
                                  borderRadius: '4px',
                                  border: '1px solid #d9d5cc',
                                  fontSize: '11px',
                                  fontFamily: 'DM Sans, sans-serif',
                                  background: '#fafaf8'
                                }}
                              />
                              {idx === subCategories.length - 1 ? (
                                <button
                                  type="button"
                                  onClick={addSubCategory}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                                >
                                  ＋
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => removeSubCategory(idx)}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#ef4444' }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}

                          <div
                            style={{
                              padding: '0.4rem 0.6rem',
                              borderRadius: '4px',
                              border: '1px dashed #d9d5cc',
                              fontSize: '11px',
                              color: '#6b7280',
                              background: '#fafaf8'
                            }}
                          >
                            Other (fixed)
                          </div>
                        </div>

                        <div style={{ marginTop: '0.75rem' }}>
                          <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="checkbox"
                              checked={requireSubCategory}
                              onChange={(e) => setRequireSubCategory(e.target.checked)}
                              style={{ width: '14px', height: '14px' }}
                            />
                            <span>Required field</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ 
                    padding: '1rem', 
                    border: '1px solid #d9d5cc', 
                    borderRadius: '8px',
                    background: enableAttachmentsForCategory ? '#fef3f2' : '#fafaf8'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ fontWeight: '600', fontSize: '12px' }}>Attachments</label>
                      <input 
                        type="checkbox" 
                        checked={enableAttachmentsForCategory} 
                        onChange={(e) => setEnableAttachmentsForCategory(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Allow file attachments on tickets
                    </div>

                    {enableAttachmentsForCategory && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            type="checkbox" 
                            checked={requireAttachmentsForCategory} 
                            onChange={(e) => setRequireAttachmentsForCategory(e.target.checked)}
                            style={{ width: '14px', height: '14px' }}
                          /> 
                          <span>Required field</span>
                        </label>
                      </div>
                    )}
                  </div>

                </div>

                {/* Approval Required Section */}
                <div style={{
                  padding: '1rem',
                  border: '1px solid #d9d5cc',
                  borderRadius: '8px',
                  background: requireApproval ? '#fff7ed' : '#fafaf8'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <label style={{ fontWeight: '600', fontSize: '12px' }}>
                      Approval Required
                    </label>
                    <input
                      type="checkbox"
                      checked={requireApproval}
                      onChange={(e) => {
                        setRequireApproval(e.target.checked);
                        if (!e.target.checked) {
                          setApprovalReportingManager(false);
                          setApprovalOther(false);
                          setApprovalOtherUsers([]);
                          setRequireAllApprovals(false);
                        }
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </div>

                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.75rem' }}>
                    Configure who needs to approve tickets
                  </div>

                  {requireApproval && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      
                      {/* Reporting Manager Option */}
                      <div style={{ 
                        padding: '0.75rem', 
                        border: '1px solid #d9d5cc', 
                        borderRadius: '6px',
                        background: approvalReportingManager ? '#f0f9ff' : 'transparent'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <input
                            type="checkbox"
                            id="approvalReportingManager"
                            checked={approvalReportingManager}
                            onChange={(e) => setApprovalReportingManager(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <label htmlFor="approvalReportingManager" style={{ fontWeight: '500', fontSize: '12px', cursor: 'pointer' }}>
                            Reporting Manager
                          </label>
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginLeft: '24px' }}>
                          Ticket creator's manager will receive email to approve/reject
                        </div>
                      </div>

                      {/* Other Users Option */}
                      <div style={{ 
                        padding: '0.75rem', 
                        border: '1px solid #d9d5cc', 
                        borderRadius: '6px',
                        background: approvalOther ? '#fef3f2' : 'transparent'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <input
                            type="checkbox"
                            id="approvalOther"
                            checked={approvalOther}
                            onChange={(e) => {
                              setApprovalOther(e.target.checked);
                              if (e.target.checked && approvalOtherUsers.length === 0) {
                                setApprovalOtherUsers([{ 
                                  email: '', 
                                  name: '', 
                                  searchQuery: '', 
                                  searchResults: [], 
                                  searching: false, 
                                  showDropdown: false,
                                  id: null
                                }]);
                              }
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <label htmlFor="approvalOther" style={{ fontWeight: '500', fontSize: '12px', cursor: 'pointer' }}>
                            Other Approvers
                          </label>
                        </div>

                        {approvalOther && (
                          <div style={{ marginLeft: '24px' }}>
                            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.75rem' }}>
                              Search and select users who can approve tickets
                            </div>

                            {/* Other Approvers List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                              {approvalOtherUsers.map((user, idx) => (
                                <div 
                                  key={idx}
                                  ref={el => approvalOtherRefs.current[idx] = el}
                                  style={{ position: 'relative' }}
                                >
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                      value={user.searchQuery}
                                      onChange={(e) => updateApprovalOtherQuery(idx, e.target.value)}
                                      placeholder="Type name or email to search..."
                                      style={{ 
                                        flex: 1, 
                                        padding: '0.5rem 0.6rem', 
                                        borderRadius: '6px', 
                                        border: user.email ? '1px solid #10b981' : '1px solid #d9d5cc',
                                        background: user.email ? '#ecfdf5' : '#fafaf8',
                                        fontSize: '12px',
                                        fontFamily: 'DM Sans, sans-serif'
                                      }}
                                    />
                                    
                                    {idx === approvalOtherUsers.length - 1 ? (
                                      <button
                                        type="button"
                                        onClick={addApprovalOtherUser}
                                        style={{
                                          padding: '0.5rem 0.75rem',
                                          borderRadius: '6px',
                                          background: '#f9f8f6',
                                          border: '1px solid #d9d5cc',
                                          cursor: 'pointer',
                                          fontSize: '14px',
                                          fontWeight: '500'
                                        }}
                                      >
                                        ＋
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => removeApprovalOtherUser(idx)}
                                        style={{
                                          padding: '0.5rem 0.75rem',
                                          borderRadius: '6px',
                                          background: '#fee2e2',
                                          border: '1px solid #fecaca',
                                          cursor: 'pointer',
                                          fontSize: '12px'
                                        }}
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>

                                  {/* Search Results Dropdown */}
                                  {user.showDropdown && user.searchResults.length > 0 && (
                                    <div style={{
                                      position: 'absolute',
                                      top: '100%',
                                      left: 0,
                                      right: 0,
                                      background: 'white',
                                      border: '1px solid #d9d5cc',
                                      borderRadius: '6px',
                                      marginTop: '4px',
                                      maxHeight: '200px',
                                      overflowY: 'auto',
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                      zIndex: 110
                                    }}>
                                      {user.searchResults.map((result, resultIdx) => (
                                        <div
                                          key={resultIdx}
                                          onClick={() => selectApprovalOtherUser(idx, result)}
                                          style={{
                                            padding: '0.6rem 0.75rem',
                                            cursor: 'pointer',
                                            borderBottom: resultIdx < user.searchResults.length - 1 ? '1px solid #d9d5cc' : 'none',
                                            background: 'white',
                                            transition: 'background 0.15s',
                                            fontSize: '12px'
                                          }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = '#f9f8f6'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                        >
                                          <div style={{ fontWeight: '600', marginBottom: '2px' }}>{result.displayName}</div>
                                          <div style={{ fontSize: '10px', color: '#6b7280' }}>{result.mail}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Selected User Display */}
                                  {user.email && (
                                    <div style={{ 
                                      marginTop: '0.5rem', 
                                      fontSize: '10px', 
                                      color: '#059669', 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '4px' 
                                    }}>
                                      <span>✓</span>
                                      <span>{user.name} ({user.email})</span>
                                    </div>
                                  )}

                                  {user.searching && (
                                    <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#6b7280' }}>
                                      Searching...
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Require All Approvals Checkbox */}
                            {approvalOtherUsers.some(u => u.email) && (
                              <div style={{ 
                                marginTop: '0.5rem',
                                padding: '0.5rem',
                                background: '#f9f8f6',
                                borderRadius: '4px'
                              }}>
                                <label style={{ 
                                  fontSize: '11px', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  cursor: 'pointer'
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={requireAllApprovals}
                                    onChange={(e) => setRequireAllApprovals(e.target.checked)}
                                    style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                                  />
                                  <span>
                                    <strong>Require all approvers</strong> - All selected approvers must approve. 
                                    If unchecked, any single approver can approve.
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Info Message */}
                      <div style={{
                        fontSize: '11px',
                        padding: '0.5rem',
                        background: '#f3f4f6',
                        borderRadius: '4px',
                        color: '#4b5563'
                      }}>
                        <strong>Note:</strong> When approval is required, ticket status will be "Pending Approval" until all required approvals are received.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {categorySuccess && <div className="message message-success">{categorySuccess}</div>}
              {categoryError && <div className="message message-error">{categoryError}</div>}

              <div className="modal-footer">
                <button onClick={() => { resetCategoryForm(); setAddFieldOpen(false); }} className="btn btn-secondary">
                  Cancel
                </button>
                <button 
                  onClick={createCategory} 
                  disabled={categoryLoading || !categoryName.trim()} 
                  className="btn btn-primary"
                >
                  {categoryLoading ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Edit Field Modal */}
        {editFieldOpen && (
          <>
            <div className="modal-overlay" onClick={() => { setEditFieldOpen(false); resetCategoryForm(); }} />
            <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">
                  {editingCategory ? 'Edit Category' : 'Edit Field'}
                </h3>
                <button onClick={() => { setEditFieldOpen(false); resetCategoryForm(); }} className="modal-close">✕</button>
              </div>

              {!editingCategory ? (
                <>
                  <div className="modal-subtitle">
                    Select a category to edit its configuration.
                  </div>

                  <div style={{ maxHeight: '400px', overflow: 'auto', marginBottom: '1rem' }}>
                    {editCategoriesLoading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>Loading categories...</div>}
                    {!editCategoriesLoading && categoriesForEdit.length === 0 && (
                      <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>No categories found.</div>
                    )}
                    {categoriesForEdit.map(c => (
                      <div
                        key={c.id}
                        onClick={() => selectCategoryForEdit(c)}
                        style={{
                          padding: '1rem',
                          borderRadius: '8px',
                          marginBottom: '0.75rem',
                          background: 'white',
                          border: '1px solid #d9d5cc',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#8b5cf6';
                          e.currentTarget.style.background = '#faf5ff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#d9d5cc';
                          e.currentTarget.style.background = 'white';
                        }}
                      >
                        <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '0.5rem', color: '#111827' }}>
                          {c.name || c.categoryName}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                          {c.features?.onBehalf?.enabled && (
                            <span style={{ 
                              fontSize: '10px', 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              background: '#dbeafe', 
                              color: '#1e40af',
                              fontWeight: '500'
                            }}>
                              On Behalf {c.features.onBehalf.required ? '(Required)' : ''}
                            </span>
                          )}
                          {c.features?.subCategories?.enabled && (
                            <span style={{ 
                              fontSize: '10px', 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              background: '#dcfce7', 
                              color: '#166534',
                              fontWeight: '500'
                            }}>
                              Sub-Category {c.features.subCategories.required ? '(Required)' : ''}
                            </span>
                          )}
                          {c.features?.attachments?.enabled && (
                            <span style={{ 
                              fontSize: '10px', 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              background: '#fee2e2', 
                              color: '#991b1b',
                              fontWeight: '500'
                            }}>
                              Attachments {c.features.attachments.required ? '(Required)' : ''}
                            </span>
                          )}
                          {c.approvalConfig && (
                            <span style={{ 
                              fontSize: '10px', 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              background: '#fff7ed', 
                              color: '#9a3412',
                              fontWeight: '500'
                            }}>
                              Approval Required
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          <span style={{ fontWeight: '500' }}>Heads:</span> {c.categoryHeads?.length || 0} | 
                          <span style={{ fontWeight: '500', marginLeft: '0.5rem' }}>CCs:</span> {c.cc?.length || 0}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#6b7280', 
                    marginBottom: '1.25rem',
                    padding: '0.75rem 1rem',
                    background: '#f0fdf4',
                    borderRadius: '6px',
                    border: '1px solid #bbf7d0'
                  }}>
                    Editing: <strong>{editingCategory.name || editingCategory.categoryName}</strong>
                    <button
                      onClick={() => {
                        setEditingCategory(null);
                        resetCategoryForm();
                      }}
                      style={{
                        marginLeft: '0.75rem',
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'white',
                        border: '1px solid #d9d5cc',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      ← Back to list
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    <div className="form-group">
                      <label className="form-label">Category Name <span style={{ color: '#ef4444' }}>*</span></label>
                      <input 
                        value={categoryName} 
                        onChange={(e) => setCategoryName(e.target.value)} 
                        placeholder="Enter category name" 
                        className="form-input"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                      
                      <div>
                        <label className="form-label">Category Heads <span style={{ color: '#ef4444' }}>*</span></label>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                          Start typing to search
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {categoryHeads.map((h, idx) => (
                            <div 
                              key={idx} 
                              ref={el => categoryHeadsRefs.current[idx] = el}
                              style={{ position: 'relative' }}
                            >
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                  value={h.searchQuery}
                                  onChange={(e) => updateCategoryHeadQuery(idx, e.target.value)}
                                  placeholder="Type name or email..."
                                  style={{ 
                                    flex: 1, 
                                    padding: '0.5rem 0.6rem', 
                                    borderRadius: '6px', 
                                    border: h.email ? '1px solid #10b981' : '1px solid #d9d5cc',
                                    background: h.email ? '#ecfdf5' : '#fafaf8',
                                    fontSize: '12px',
                                    fontFamily: 'DM Sans, sans-serif'
                                  }}
                                />
                                {idx === categoryHeads.length - 1 ? (
                                  <button 
                                    type="button" 
                                    onClick={addCategoryHead} 
                                    style={{ 
                                      padding: '0.5rem 0.75rem', 
                                      borderRadius: '6px', 
                                      background: '#f9f8f6', 
                                      border: '1px solid #d9d5cc',
                                      cursor: 'pointer',
                                      fontSize: '14px',
                                      fontWeight: '500'
                                    }}
                                  >
                                    ＋
                                  </button>
                                ) : (
                                  <button 
                                    type="button" 
                                    onClick={() => removeCategoryHead(idx)} 
                                    style={{ 
                                      padding: '0.5rem 0.75rem', 
                                      borderRadius: '6px', 
                                      background: '#fee2e2', 
                                      border: '1px solid #fecaca',
                                      cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                  >
                                    ✕
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
                                  border: '1px solid #d9d5cc',
                                  borderRadius: '6px',
                                  marginTop: '4px',
                                  maxHeight: '200px',
                                  overflowY: 'auto',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                  zIndex: 110
                                }}>
                                  {h.searchResults.map((user, userIdx) => (
                                    <div
                                      key={userIdx}
                                      onClick={() => selectCategoryHead(idx, user)}
                                      style={{
                                        padding: '0.6rem 0.75rem',
                                        cursor: 'pointer',
                                        borderBottom: userIdx < h.searchResults.length - 1 ? '1px solid #d9d5cc' : 'none',
                                        background: 'white',
                                        transition: 'background 0.15s',
                                        fontSize: '12px'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9f8f6'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                    >
                                      <div style={{ fontWeight: '600', marginBottom: '2px' }}>{user.displayName}</div>
                                      <div style={{ fontSize: '10px', color: '#6b7280' }}>{user.mail}</div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {h.email && (
                                <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>✓</span>
                                  <span>{h.name} ({h.email})</span>
                                </div>
                              )}

                              {h.searching && (
                                <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#6b7280' }}>
                                  Searching...
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="form-label">CC Emails (Optional)</label>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                          Start typing to search
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {ccEmails.map((c, idx) => (
                            <div 
                              key={idx}
                              ref={el => ccEmailsRefs.current[idx] = el}
                              style={{ position: 'relative' }}
                            >
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                  value={c.searchQuery}
                                  onChange={(e) => updateCcEmailQuery(idx, e.target.value)}
                                  placeholder="Type name or email..."
                                  style={{ 
                                    flex: 1, 
                                    padding: '0.5rem 0.6rem', 
                                    borderRadius: '6px', 
                                    border: c.email ? '1px solid #10b981' : '1px solid #d9d5cc',
                                    background: c.email ? '#ecfdf5' : '#fafaf8',
                                    fontSize: '12px',
                                    fontFamily: 'DM Sans, sans-serif'
                                  }}
                                />
                                {idx === ccEmails.length - 1 ? (
                                  <button 
                                    type="button" 
                                    onClick={addCcEmail} 
                                    style={{ 
                                      padding: '0.5rem 0.75rem', 
                                      borderRadius: '6px', 
                                      background: '#f9f8f6', 
                                      border: '1px solid #d9d5cc',
                                      cursor: 'pointer',
                                      fontSize: '14px',
                                      fontWeight: '500'
                                    }}
                                  >
                                    ＋
                                  </button>
                                ) : (
                                  <button 
                                    type="button" 
                                    onClick={() => removeCcEmail(idx)} 
                                    style={{ 
                                      padding: '0.5rem 0.75rem', 
                                      borderRadius: '6px', 
                                      background: '#fee2e2', 
                                      border: '1px solid #fecaca',
                                      cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>

                              {c.showDropdown && c.searchResults.length > 0 && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  right: 0,
                                  background: 'white',
                                  border: '1px solid #d9d5cc',
                                  borderRadius: '6px',
                                  marginTop: '4px',
                                  maxHeight: '200px',
                                  overflowY: 'auto',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                  zIndex: 110
                                }}>
                                  {c.searchResults.map((user, userIdx) => (
                                    <div
                                      key={userIdx}
                                      onClick={() => selectCcEmail(idx, user)}
                                      style={{
                                        padding: '0.6rem 0.75rem',
                                        cursor: 'pointer',
                                        borderBottom: userIdx < c.searchResults.length - 1 ? '1px solid #d9d5cc' : 'none',
                                        background: 'white',
                                        transition: 'background 0.15s',
                                        fontSize: '12px'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9f8f6'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                    >
                                      <div style={{ fontWeight: '600', marginBottom: '2px' }}>{user.displayName}</div>
                                      <div style={{ fontSize: '10px', color: '#6b7280' }}>{user.mail}</div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {c.email && (
                                <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>✓</span>
                                  <span>{c.name} ({c.email})</span>
                                </div>
                              )}

                              {c.searching && (
                                <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#6b7280' }}>
                                  Searching...
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                      
                      <div style={{ 
                        padding: '1rem', 
                        border: '1px solid #d9d5cc', 
                        borderRadius: '8px',
                        background: enableOnBehalf ? '#f0f9ff' : '#fafaf8'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <label style={{ fontWeight: '600', fontSize: '12px' }}>On Behalf</label>
                          <input 
                            type="checkbox" 
                            checked={enableOnBehalf} 
                            onChange={(e) => setEnableOnBehalf(e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                          Submit tickets for self or others
                        </div>

                        {enableOnBehalf && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input
                                type="checkbox"
                                checked={requireOnBehalf}
                                onChange={(e) => setRequireOnBehalf(e.target.checked)}
                                style={{ width: '14px', height: '14px' }}
                              />
                              <span>Required field</span>
                            </label>
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          padding: '1rem',
                          border: '1px solid #d9d5cc',
                          borderRadius: '8px',
                          background: enableSubCategory ? '#f0fdf4' : '#fafaf8'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <label style={{ fontWeight: '600', fontSize: '12px' }}>Sub-Category</label>
                          <input
                            type="checkbox"
                            checked={enableSubCategory}
                            onChange={(e) => setEnableSubCategory(e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                        </div>

                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                          Add subcategories
                        </div>

                        {enableSubCategory && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {subCategories.length === 0 && (
                                <button
                                  type="button"
                                  onClick={addSubCategory}
                                  style={{
                                    alignSelf: 'flex-start',
                                    background: '#f9f8f6',
                                    border: '1px solid #d9d5cc',
                                    borderRadius: '4px',
                                    padding: '0.25rem 0.75rem',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: '500'
                                  }}
                                >
                                  + Add
                                </button>
                              )}

                              {subCategories.map((s, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <input
                                    value={s}
                                    onChange={(e) => updateSubCategory(idx, e.target.value)}
                                    placeholder="e.g., Salary"
                                    style={{
                                      flex: 1,
                                      padding: '0.4rem 0.6rem',
                                      borderRadius: '4px',
                                      border: '1px solid #d9d5cc',
                                      fontSize: '11px',
                                      fontFamily: 'DM Sans, sans-serif',
                                      background: '#fafaf8'
                                    }}
                                  />
                                  {idx === subCategories.length - 1 ? (
                                    <button
                                      type="button"
                                      onClick={addSubCategory}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                                    >
                                      ＋
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => removeSubCategory(idx)}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#ef4444' }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}

                              <div
                                style={{
                                  padding: '0.4rem 0.6rem',
                                  borderRadius: '4px',
                                  border: '1px dashed #d9d5cc',
                                  fontSize: '11px',
                                  color: '#6b7280',
                                  background: '#fafaf8'
                                }}
                              >
                                Other (fixed)
                              </div>
                            </div>

                            <div style={{ marginTop: '0.75rem' }}>
                              <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  type="checkbox"
                                  checked={requireSubCategory}
                                  onChange={(e) => setRequireSubCategory(e.target.checked)}
                                  style={{ width: '14px', height: '14px' }}
                                />
                                <span>Required field</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={{ 
                        padding: '1rem', 
                        border: '1px solid #d9d5cc', 
                        borderRadius: '8px',
                        background: enableAttachmentsForCategory ? '#fef3f2' : '#fafaf8'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <label style={{ fontWeight: '600', fontSize: '12px' }}>Attachments</label>
                          <input 
                            type="checkbox" 
                            checked={enableAttachmentsForCategory} 
                            onChange={(e) => setEnableAttachmentsForCategory(e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.5rem' }}>
                          Allow file attachments
                        </div>

                        {enableAttachmentsForCategory && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input 
                                type="checkbox" 
                                checked={requireAttachmentsForCategory} 
                                onChange={(e) => setRequireAttachmentsForCategory(e.target.checked)}
                                style={{ width: '14px', height: '14px' }}
                              /> 
                              <span>Required field</span>
                            </label>
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Approval Required Section in Edit Modal */}
                    <div style={{
                      padding: '1rem',
                      border: '1px solid #d9d5cc',
                      borderRadius: '8px',
                      background: requireApproval ? '#fff7ed' : '#fafaf8'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <label style={{ fontWeight: '600', fontSize: '12px' }}>
                          Approval Required
                        </label>
                        <input
                          type="checkbox"
                          checked={requireApproval}
                          onChange={(e) => {
                            setRequireApproval(e.target.checked);
                            if (!e.target.checked) {
                              setApprovalReportingManager(false);
                              setApprovalOther(false);
                              setApprovalOtherUsers([]);
                              setRequireAllApprovals(false);
                            }
                          }}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                      </div>

                      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.75rem' }}>
                        Configure who needs to approve tickets
                      </div>

                      {requireApproval && (
                        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          
                          {/* Reporting Manager Option */}
                          <div style={{ 
                            padding: '0.75rem', 
                            border: '1px solid #d9d5cc', 
                            borderRadius: '6px',
                            background: approvalReportingManager ? '#f0f9ff' : 'transparent'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <input
                                type="checkbox"
                                id="editApprovalReportingManager"
                                checked={approvalReportingManager}
                                onChange={(e) => setApprovalReportingManager(e.target.checked)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <label htmlFor="editApprovalReportingManager" style={{ fontWeight: '500', fontSize: '12px', cursor: 'pointer' }}>
                                Reporting Manager
                              </label>
                            </div>
                            <div style={{ fontSize: '11px', color: '#6b7280', marginLeft: '24px' }}>
                              Ticket creator's manager will receive email to approve/reject
                            </div>
                          </div>

                          {/* Other Users Option */}
                          <div style={{ 
                            padding: '0.75rem', 
                            border: '1px solid #d9d5cc', 
                            borderRadius: '6px',
                            background: approvalOther ? '#fef3f2' : 'transparent'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                              <input
                                type="checkbox"
                                id="editApprovalOther"
                                checked={approvalOther}
                                onChange={(e) => {
                                  setApprovalOther(e.target.checked);
                                  if (e.target.checked && approvalOtherUsers.length === 0) {
                                    setApprovalOtherUsers([{ 
                                      email: '', 
                                      name: '', 
                                      searchQuery: '', 
                                      searchResults: [], 
                                      searching: false, 
                                      showDropdown: false,
                                      id: null
                                    }]);
                                  }
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <label htmlFor="editApprovalOther" style={{ fontWeight: '500', fontSize: '12px', cursor: 'pointer' }}>
                                Other Approvers
                              </label>
                            </div>

                            {approvalOther && (
                              <div style={{ marginLeft: '24px' }}>
                                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.75rem' }}>
                                  Search and select users who can approve tickets
                                </div>

                                {/* Other Approvers List */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                  {approvalOtherUsers.map((user, idx) => (
                                    <div 
                                      key={idx}
                                      ref={el => approvalOtherRefs.current[idx] = el}
                                      style={{ position: 'relative' }}
                                    >
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                          value={user.searchQuery}
                                          onChange={(e) => updateApprovalOtherQuery(idx, e.target.value)}
                                          placeholder="Type name or email to search..."
                                          style={{ 
                                            flex: 1, 
                                            padding: '0.5rem 0.6rem', 
                                            borderRadius: '6px', 
                                            border: user.email ? '1px solid #10b981' : '1px solid #d9d5cc',
                                            background: user.email ? '#ecfdf5' : '#fafaf8',
                                            fontSize: '12px',
                                            fontFamily: 'DM Sans, sans-serif'
                                          }}
                                        />
                                        
                                        {idx === approvalOtherUsers.length - 1 ? (
                                          <button
                                            type="button"
                                            onClick={addApprovalOtherUser}
                                            style={{
                                              padding: '0.5rem 0.75rem',
                                              borderRadius: '6px',
                                              background: '#f9f8f6',
                                              border: '1px solid #d9d5cc',
                                              cursor: 'pointer',
                                              fontSize: '14px',
                                              fontWeight: '500'
                                            }}
                                          >
                                            ＋
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => removeApprovalOtherUser(idx)}
                                            style={{
                                              padding: '0.5rem 0.75rem',
                                              borderRadius: '6px',
                                              background: '#fee2e2',
                                              border: '1px solid #fecaca',
                                              cursor: 'pointer',
                                              fontSize: '12px'
                                            }}
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>

                                      {/* Search Results Dropdown */}
                                      {user.showDropdown && user.searchResults.length > 0 && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          right: 0,
                                          background: 'white',
                                          border: '1px solid #d9d5cc',
                                          borderRadius: '6px',
                                          marginTop: '4px',
                                          maxHeight: '200px',
                                          overflowY: 'auto',
                                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                          zIndex: 110
                                        }}>
                                          {user.searchResults.map((result, resultIdx) => (
                                            <div
                                              key={resultIdx}
                                              onClick={() => selectApprovalOtherUser(idx, result)}
                                              style={{
                                                padding: '0.6rem 0.75rem',
                                                cursor: 'pointer',
                                                borderBottom: resultIdx < user.searchResults.length - 1 ? '1px solid #d9d5cc' : 'none',
                                                background: 'white',
                                                transition: 'background 0.15s',
                                                fontSize: '12px'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.background = '#f9f8f6'}
                                              onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                            >
                                              <div style={{ fontWeight: '600', marginBottom: '2px' }}>{result.displayName}</div>
                                              <div style={{ fontSize: '10px', color: '#6b7280' }}>{result.mail}</div>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Selected User Display */}
                                      {user.email && (
                                        <div style={{ 
                                          marginTop: '0.5rem', 
                                          fontSize: '10px', 
                                          color: '#059669', 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          gap: '4px' 
                                        }}>
                                          <span>✓</span>
                                          <span>{user.name} ({user.email})</span>
                                        </div>
                                      )}

                                      {user.searching && (
                                        <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#6b7280' }}>
                                          Searching...
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {/* Require All Approvals Checkbox */}
                                {approvalOtherUsers.some(u => u.email) && (
                                  <div style={{ 
                                    marginTop: '0.5rem',
                                    padding: '0.5rem',
                                    background: '#f9f8f6',
                                    borderRadius: '4px'
                                  }}>
                                    <label style={{ 
                                      fontSize: '11px', 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '6px',
                                      cursor: 'pointer'
                                    }}>
                                      <input
                                        type="checkbox"
                                        checked={requireAllApprovals}
                                        onChange={(e) => setRequireAllApprovals(e.target.checked)}
                                        style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                                      />
                                      <span>
                                        <strong>Require all approvers</strong> - All selected approvers must approve. 
                                        If unchecked, any single approver can approve.
                                      </span>
                                    </label>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Info Message */}
                          <div style={{
                            fontSize: '11px',
                            padding: '0.5rem',
                            background: '#f3f4f6',
                            borderRadius: '4px',
                            color: '#4b5563'
                          }}>
                            <strong>Note:</strong> When approval is required, ticket status will be "Pending Approval" until all required approvals are received.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {categorySuccess && <div className="message message-success">{categorySuccess}</div>}
                  {categoryError && <div className="message message-error">{categoryError}</div>}

                  <div className="modal-footer">
                    <button 
                      onClick={() => { 
                        setEditingCategory(null); 
                        resetCategoryForm(); 
                      }} 
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={updateCategory} 
                      disabled={categoryLoading || !categoryName.trim()} 
                      className="btn btn-success"
                    >
                      {categoryLoading ? 'Updating...' : 'Update Category'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Remove Field Modal */}
        {removeFieldOpen && (
          <>
            <div className="modal-overlay" onClick={() => setRemoveFieldOpen(false)} />
            <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Remove Category</h3>
                <button onClick={() => setRemoveFieldOpen(false)} className="modal-close">✕</button>
              </div>

              <div className="modal-subtitle">
                Select a category to remove. This action may impact existing tickets.
              </div>

              <div className="user-list">
                {categoriesLoading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>Loading categories...</div>}
                {!categoriesLoading && availableCategories.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>No categories found.</div>
                )}
                {availableCategories.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCategoryToRemove(c)}
                    className={`user-item ${selectedCategoryToRemove?.id === c.id ? 'danger-selected' : ''}`}
                  >
                    <div className="user-name">{c.name || c.categoryName}</div>
                    <div className="user-email">{c.description || 'No description'}</div>
                  </div>
                ))}
              </div>

              {removeCategorySuccess && <div className="message message-success">{removeCategorySuccess}</div>}
              {removeCategoryError && <div className="message message-error">{removeCategoryError}</div>}

              <div className="modal-footer">
                <button onClick={() => setRemoveFieldOpen(false)} className="btn btn-secondary">Cancel</button>
                <button
                  onClick={confirmRemoveCategory}
                  disabled={removeCategoryLoading || !selectedCategoryToRemove}
                  className="btn btn-danger"
                >
                  {removeCategoryLoading ? 'Removing...' : 'Remove Category'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Full Profile Modal */}
        {fullProfileOpen && (
          <>
            <div className="modal-overlay" onClick={closeFullProfile} />
            <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Full Profile</h3>
                <button onClick={closeFullProfile} className="modal-close">✕</button>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', padding: '1rem', background: '#f9f8f6', borderRadius: '8px' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '6px',
                  background: '#e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600',
                  color: '#374151',
                  overflow: 'hidden'
                }}>
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '18px' }}>{initials}</span>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{accounts?.[0]?.name || ''}</div>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>{accounts?.[0]?.username || ''}</div>
                </div>
              </div>

              {loadingProfile && <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>Loading profile...</p>}

              {profileError && (
                <div className="message message-error">
                  Error loading profile: {profileError}
                </div>
              )}

              {profileData && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {Object.entries({
                    'Name': profileData.name,
                    'Email': profileData.email,
                    'Department': profileData.department,
                    'Job Title': profileData.jobTitle,
                    'Reporting Manager': profileData.manager,
                    'Employee ID': profileData.employeeId,
                    'Mobile': profileData.mobilePhone,
                    'Address': profileData.streetAddress,
                    'State': profileData.state,
                    'Pincode': profileData.postalCode
                  }).map(([label, value]) => value && (
                    <div key={label}>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px', fontWeight: '500' }}>{label}</div>
                      <div style={{ fontWeight: '500', color: '#111827', fontSize: '13px' }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function AppContent() {
  const { instance } = useMsal();

  const handleLogout = () => {
    instance.logoutPopup({ postLogoutRedirectUri: '/' });
  };

  const handleLogin = async () => {
    try {
      await instance.loginPopup({
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
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <Login login={handleLogin} />
      </UnauthenticatedTemplate>
    </Router>
  );
}

function App() {
  return <AppContent />;
}

export default App;