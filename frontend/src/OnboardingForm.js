// src/OnboardingForm.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; // ✅ ADDED
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const COMPANY_DOMAIN = process.env.REACT_APP_COMPANY_DOMAIN || 'yourcompany.com';

function OnboardingForm() {
  const navigate = useNavigate(); // ✅ ADDED
  const { instance, accounts } = useMsal();
  const currentUser = accounts[0] || {};
  const currentUserName = currentUser.name || currentUser.username || 'User';

  const [formData, setFormData] = useState({
    employeeId: '',
    firstName: '',
    lastName: '',
    emailPrefix: '',
    jobTitle: '',
    department: '',
    employeeType: '',
    gender: '',
    workLocation: 'remote',
    officeLocation: '',
    otherEmail: '',
    phoneNumber: '',
    contactInfo: { street: '', city: '', state: '' },
    reportingTo: { id: '', name: '', email: '' },
    creationType: 'Through Support Portal',
  });

  const [departments, setDepartments] = useState([]);
  const [employeeTypes, setEmployeeTypes] = useState([]);
  const [loadingEmployeeTypes, setLoadingEmployeeTypes] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [loadingSettings, setLoadingSettings] = useState(false);

  const [reportingToSearchQuery, setReportingToSearchQuery] = useState('');
  const [reportingToResults, setReportingToResults] = useState([]);
  const [searchingReportingTo, setSearchingReportingTo] = useState(false);
  const [showReportingToDropdown, setShowReportingToDropdown] = useState(false);
  const reportingToDropdownRef = useRef(null);
  const reportingToInputRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });
  const [nextRequestNumber, setNextRequestNumber] = useState('HRQ-0001');
  const [verificationStatus, setVerificationStatus] = useState('idle');

  useEffect(() => {
    fetchNextRequestNumber();
  }, []);

  const fetchNextRequestNumber = async () => {
    try {
      const res = await axios.get(`${BACKEND}/api/onboarding`);
      const allRequests = res.data || [];
      let maxNumber = 0;
      allRequests.forEach(req => {
        if (req.requestNumber) {
          const num = parseInt(req.requestNumber.replace('HRQ-', '').replace('REQ-', ''));
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      });
      setNextRequestNumber(`HRQ-${String(maxNumber + 1).padStart(4, '0')}`);
    } catch (err) {
      console.error('Failed to fetch next number:', err);
      setNextRequestNumber(`HRQ-${Date.now().toString().slice(-4)}`);
    }
  };

  useEffect(() => {
    if (formData.firstName && formData.lastName) {
      const firstName = formData.firstName.charAt(0).toUpperCase() + formData.firstName.slice(1).toLowerCase();
      const lastNameInitial = formData.lastName.charAt(0).toUpperCase();
      const prefix = firstName + lastNameInitial;
      setFormData(prev => ({ ...prev, emailPrefix: prefix }));
    }
  }, [formData.firstName, formData.lastName]);

  useEffect(() => {
    const handler = (e) => {
      if (reportingToDropdownRef.current && !reportingToDropdownRef.current.contains(e.target) &&
          reportingToInputRef.current && !reportingToInputRef.current.contains(e.target)) {
        setShowReportingToDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    fetchDepartments();
    fetchEmployeeTypes();
    fetchOnboardingSettings();
  }, []);

  const fetchDepartments = async () => {
    try {
      const res = await axios.get(`${BACKEND}/api/departments`);
      const data = Array.isArray(res.data) ? res.data : [];
      const departmentNames = data
        .map((dept) => (typeof dept === 'string' ? dept : dept?.name))
        .filter(Boolean);
      setDepartments(departmentNames);
    } catch (err) {
      console.error('Failed to fetch departments:', err);
      setDepartments([]);
    }
  };

  const fetchEmployeeTypes = async () => {
    setLoadingEmployeeTypes(true);
    try {
      // Backed by the EmployeeType mongoose model — GET /api/employee-types
      // should return documents shaped like { _id, name, description }
      const res = await axios.get(`${BACKEND}/api/employee-types`);
      const data = Array.isArray(res.data) ? res.data : [];
      const typeNames = data
        .map((type) => (typeof type === 'string' ? type : type?.name))
        .filter(Boolean);
      setEmployeeTypes(typeNames);
    } catch (err) {
      console.error('Failed to fetch employee types:', err);
      setEmployeeTypes([]);
    } finally {
      setLoadingEmployeeTypes(false);
    }
  };

  const fetchOnboardingSettings = async () => {
    setLoadingSettings(true);
    try {
      const res = await axios.get(`${BACKEND}/api/onboarding/settings`);
      if (res.data && res.data.selectedGroups) {
        setSelectedGroups(res.data.selectedGroups);
        console.log('✅ Loaded groups from settings:', res.data.selectedGroups);
      }
    } catch (err) {
      console.error('Failed to fetch onboarding settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const handleBackToCatalog = () => {
    navigate('/hr-request');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'emailPrefix' && verificationStatus === 'available') {
      setVerificationStatus('idle');
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleContactInfoChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      contactInfo: {
        ...prev.contactInfo,
        [name]: value
      }
    }));
  };

  const searchReportingTo = async (query) => {
    if (!query || query.trim().length < 2) {
      setReportingToResults([]);
      setShowReportingToDropdown(false);
      setSearchingReportingTo(false);
      return;
    }
    setSearchingReportingTo(true);
    setShowReportingToDropdown(true);
    try {
      const token = await instance.acquireTokenSilent({ 
        scopes: ['User.Read.All'], 
        account: accounts[0] 
      });
      const q = query.trim().replace(/'/g, "''");
      const filter = `startswith(mail,'${q}') or startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')`;
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=5`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      const data = await res.json();
      setReportingToResults((data.value || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.mail || '(no name)',
        mail: u.mail || u.userPrincipalName || '',
      })));
    } catch (err) {
      console.error('Error searching users:', err);
      setReportingToResults([]);
    } finally {
      setSearchingReportingTo(false);
    }
  };

  const handleReportingToSearch = (value) => {
    setReportingToSearchQuery(value);
    searchReportingTo(value);
  };

  const selectReportingTo = (user) => {
    setFormData(prev => ({
      ...prev,
      reportingTo: { id: user.id, name: user.displayName, email: user.mail }
    }));
    setReportingToSearchQuery('');
    setReportingToResults([]);
    setShowReportingToDropdown(false);
  };

  const handleVerifyUser = async () => {
    if (!formData.emailPrefix) {
      showToast('Please enter email prefix first', 'error');
      return;
    }

    const email = `${formData.emailPrefix}@${COMPANY_DOMAIN}`;
    setVerificationStatus('verifying');
    
    try {
      const token = await instance.acquireTokenSilent({ 
        scopes: ['User.Read.All'], 
        account: accounts[0] 
      });
      
      const res = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}`,
        { 
          headers: { 
            Authorization: `Bearer ${token.accessToken}`,
            'ConsistencyLevel': 'eventual'
          } 
        }
      );
      
      if (res.data) {
        setVerificationStatus('exists');
        showToast(`❌ ${email} already exists in Azure AD`, 'error');
        setTimeout(() => setVerificationStatus('idle'), 3000);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setVerificationStatus('available');
        showToast(`✅ ${email} is available`, 'success');
      } else {
        console.error('Verification error:', err.response?.data || err.message);
        setVerificationStatus('error');
        const errorMsg = err.response?.data?.error?.message || err.message || 'Unknown error';
        showToast(`❌ Error: ${errorMsg}`, 'error');
        setTimeout(() => setVerificationStatus('idle'), 4000);
      }
    }
  };

  const getVerifyStatusText = () => {
    if (verificationStatus === 'idle') return `Click "Check" to verify email (@${COMPANY_DOMAIN})`;
    if (verificationStatus === 'verifying') return '⏳ Checking availability...';
    if (verificationStatus === 'available') return `✅ ${formData.emailPrefix}@${COMPANY_DOMAIN} is available!`;
    if (verificationStatus === 'exists') return `❌ ${formData.emailPrefix}@${COMPANY_DOMAIN} already exists`;
    if (verificationStatus === 'error') return '❌ Error checking availability';
    return '';
  };

  const getVerifyStatusStyle = () => {
    if (verificationStatus === 'available') return 'onb-verify-ok';
    if (verificationStatus === 'exists' || verificationStatus === 'error') return 'onb-verify-err';
    if (verificationStatus === 'verifying') return 'onb-verify-info';
    return 'onb-verify-idle';
  };

  const getVerifyButtonText = () => {
    if (verificationStatus === 'verifying') return 'Checking...';
    if (verificationStatus === 'available') return '✅ Verified';
    return 'Check';
  };

  const getVerifyButtonStyle = () => {
    if (verificationStatus === 'available') {
      return {
        background: '#10b981',
        color: 'white',
      };
    }
    if (verificationStatus === 'verifying') {
      return {
        opacity: '0.6',
        cursor: 'not-allowed',
      };
    }
    return {};
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.employeeId || !formData.firstName || !formData.lastName || 
        !formData.emailPrefix || !formData.jobTitle || !formData.department || 
        !formData.employeeType || !formData.gender || !formData.otherEmail ||
        !formData.contactInfo.street || !formData.contactInfo.city || !formData.contactInfo.state) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (formData.workLocation === 'office' && !formData.officeLocation) {
      showToast('Please enter the office location', 'error');
      return;
    }

    if (verificationStatus !== 'available') {
      showToast('Please verify the email prefix first', 'error');
      return;
    }

    if (selectedGroups.length === 0) {
      showToast('No groups configured in onboarding settings. Please contact admin.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const tempPassword = generatePassword();
      
      const payload = {
        ...formData,
        selectedGroups: selectedGroups,
        initialPassword: tempPassword,
        createdBy: currentUser.localAccountId || '',
        createdByName: currentUser.name || '',
        createdByEmail: currentUser.username || '',
        status: 'pending_approval',
        timestamp: new Date().toISOString(),
      };
      alert('🔍 Sending payload:\n' + JSON.stringify({
      employeeType: payload.employeeType,
      officeLocation: payload.officeLocation,
      street: payload.contactInfo?.street,
      city: payload.contactInfo?.city,
      state: payload.contactInfo?.state,
    }, null, 2));

      console.log('🔍 [ONBOARDING FORM] Sending payload:', JSON.stringify(payload, null, 2));

      const res = await axios.post(`${BACKEND}/api/onboarding/submit`, payload);
      
      showToast(`Onboarding request ${res.data.requestNumber} submitted for approval!`, 'success');
      
      // ✅ Redirect to the newly created onboarding details page
      const requestId = res?.data?.requestId || res?.data?._id;
      setTimeout(() => {
        if (requestId) {
          navigate(`/hr-request/${requestId}`);
        } else {
          navigate('/hr-request');
        }
      }, 1500); // Give user time to see the success toast
      
    } catch (err) {
      const errorMsg = err?.response?.data?.message || 'Failed to submit request';
      showToast(errorMsg, 'error');
      console.error('Submit error:', err?.response?.data || err.message);
      setSubmitting(false); // Only reset submitting on error
    }
    // Note: Don't reset submitting here - the redirect will unmount the component
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password + 'A1!';
  };

  const resetForm = () => {
    setFormData({
      employeeId: '',
      firstName: '',
      lastName: '',
      emailPrefix: '',
      jobTitle: '',
      department: '',
      employeeType: '',
      gender: '',
      workLocation: 'remote',
      officeLocation: '',
      otherEmail: '',
      phoneNumber: '',
      contactInfo: { street: '', city: '', state: '' },
      reportingTo: { id: '', name: '', email: '' },
      creationType: 'Through Support Portal',
    });
    setVerificationStatus('idle');
    setReportingToSearchQuery('');
    setReportingToResults([]);
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:   #002060;
      --navy2:  #003090;
      --orange: #e98404;
      --orange2:#f5a623;
      --white:  #ffffff;
      --bg:     #f5f7fa;
      --border: #e2e8f0;
      --text:   #0f172a;
      --muted:  #64748b;
      --light:  #f8fafc;
      --green:  #10b981;
      --red:    #ef4444;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .onb-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    .onb-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 0;
    }

    .onb-form-container {
      animation: fadeUp 0.4s ease both;
    }

    .onb-back-btn {
      background: none;
      border: none;
      font-size: 14px;
      font-weight: 600;
      color: var(--navy);
      cursor: pointer;
      padding: 0;
      margin: 24px 0 18px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .onb-back-btn:hover {
      color: var(--orange);
    }

    .onb-form-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 24px;
      overflow: hidden;
    }

    .onb-form-header {
      padding: 32px 36px;
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
    }
    .onb-request-number {
      font-family: 'Sora', sans-serif;
      font-size: 28px; font-weight: 800;
      color: var(--navy); letter-spacing: -0.02em;
    }
    .onb-new-badge {
      padding: 5px 14px; border-radius: 30px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
      background: var(--orange); color: white;
      margin-left: 16px;
    }
    .onb-form-title {
      font-size: 16px; font-weight: 500;
      color: var(--muted); margin-top: 8px;
    }

    .onb-service-banner {
      padding: 20px 36px;
      background: rgba(0,32,96,0.03);
      border-bottom: 1.5px solid var(--border);
      display: flex; align-items: center; gap: 16px;
    }
    .onb-service-icon {
      width: 52px; height: 52px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
      background: rgba(233,132,4,0.15);
    }
    .onb-service-name {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
    }
    .onb-service-type {
      font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
      padding: 4px 12px; border-radius: 30px;
      margin-top: 6px; display: inline-block;
      background: rgba(233,132,4,0.15);
      color: var(--orange);
    }

    .onb-form-body {
      padding: 36px;
      max-width: 900px;
    }

    .onb-form-group {
      margin-bottom: 28px;
    }
    .onb-form-label {
      display: block;
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 8px;
      letter-spacing: 0.02em;
    }
    .onb-form-label .required {
      color: var(--red);
      margin-left: 4px;
    }

    .onb-form-input,
    .onb-form-select,
    .onb-form-textarea {
      width: 100%;
      padding: 14px 18px;
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
    }
    .onb-form-input:focus,
    .onb-form-select:focus,
    .onb-form-textarea:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .onb-form-textarea {
      resize: vertical;
      min-height: 100px;
    }

    .onb-form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .onb-form-row-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
    }

    .onb-verify-btn {
      padding: 14px 24px;
      background: var(--navy);
      color: white;
      border: none;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      white-space: nowrap;
      transition: all 0.2s;
      min-width: 120px;
    }
    .onb-verify-btn:hover:not(:disabled) {
      background: var(--navy2);
    }
    .onb-verify-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .onb-verify-btn.verified {
      background: var(--green);
    }
    .onb-verify-btn.verified:hover {
      background: #059669;
    }

    .onb-verify-status {
      font-size: 13px; padding: 12px 16px; border-radius: 12px;
      margin-top: 12px;
    }
    .onb-verify-idle { background: var(--bg); color: var(--muted); border: 1.5px solid var(--border); }
    .onb-verify-info { background: rgba(0,32,96,0.05); color: var(--navy); border: 1.5px solid var(--navy); }
    .onb-verify-ok { background: rgba(16,185,129,0.08); color: #065f46; border: 1.5px solid var(--green); }
    .onb-verify-err { background: rgba(239,68,68,0.08); color: #991b1b; border: 1.5px solid var(--red); }

    .onb-radio-group {
      display: flex; gap: 24px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .onb-radio-label {
      display: flex; align-items: center; gap: 10px;
      font-size: 15px; color: var(--text); cursor: pointer;
    }
    .onb-radio {
      accent-color: var(--navy);
      width: 18px; height: 18px; cursor: pointer;
    }

    .onb-user-dropdown {
      position: absolute; top: 100%; left: 0; right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      margin-top: 8px;
      max-height: 280px; overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
    }
    .onb-dd-item {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 18px; cursor: pointer;
      border-bottom: 1.5px solid var(--border);
      transition: background 0.15s;
    }
    .onb-dd-item:hover { background: var(--bg); }
    .onb-dd-avatar {
      width: 40px; height: 40px; border-radius: 12px;
      background: var(--navy); color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700;
      flex-shrink: 0;
    }
    .onb-dd-name {
      font-size: 15px; font-weight: 600; color: var(--text);
    }
    .onb-dd-email {
      font-size: 12px; color: var(--muted); margin-top: 2px;
    }

    .onb-selected-user {
      margin-top: 12px; padding: 14px 18px;
      background: rgba(16,185,129,0.04);
      border: 1.5px solid var(--green);
      border-radius: 14px;
    }
    .onb-selected-label {
      font-size: 12px; color: #065f46; margin-bottom: 4px;
      font-weight: 700;
    }

    .onb-form-footer {
      display: flex; justify-content: flex-end; gap: 16px;
      padding: 28px 36px;
      border-top: 1.5px solid var(--border);
      background: var(--light);
    }

    .onb-btn-cancel {
      padding: 16px 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 15px; font-weight: 600;
      color: var(--muted); cursor: pointer;
      transition: all 0.2s;
      font-family: 'Sora', sans-serif;
    }
    .onb-btn-cancel:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .onb-btn-submit {
      padding: 16px 36px;
      background: var(--navy);
      border: none;
      border-radius: 14px;
      font-size: 15px; font-weight: 700;
      color: white; cursor: pointer;
      transition: all 0.3s;
      font-family: 'Sora', sans-serif;
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .onb-btn-submit:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,32,96,0.25);
    }
    .onb-btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .onb-toast {
      position: fixed; bottom: 32px; right: 32px; z-index: 10000;
      padding: 16px 28px; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      font-size: 15px; font-weight: 600;
      animation: slideIn 0.3s ease;
      font-family: 'Sora', sans-serif;
    }
    .onb-toast-success {
      background: var(--green); color: white;
    }
    .onb-toast-error {
      background: var(--red); color: white;
    }

    @media (max-width: 768px) {
      .onb-form-row { grid-template-columns: 1fr; }
      .onb-form-row-3 { grid-template-columns: 1fr; }
      .onb-radio-group { flex-direction: column; gap: 10px; }
      .onb-form-header { padding: 24px 20px; }
      .onb-form-body { padding: 24px; }
      .onb-form-footer { padding: 20px 24px; flex-direction: column; }
      .onb-btn-cancel, .onb-btn-submit { width: 100%; justify-content: center; }
      .onb-verify-btn { width: 100%; }
    }
  `;

  const isSubmitDisabled = submitting || 
    verificationStatus !== 'available' || 
    selectedGroups.length === 0 ||
    loadingSettings ||
    loadingEmployeeTypes;

  return (
    <div className="onb-page">
      <style>{sharedCSS}</style>

      <div className="onb-content onb-form-container">
        <button className="onb-back-btn" onClick={handleBackToCatalog}>
          ← Back to Catalog
        </button>

        <div className="onb-form-card">
          {/* Form Header */}
          <div className="onb-form-header">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <span className="onb-request-number">{nextRequestNumber}</span>
              <span className="onb-new-badge">NEW ONBOARDING</span>
            </div>
            <div className="onb-form-title">Requested by {currentUserName}</div>
          </div>

          {/* Service Banner */}
          <div className="onb-service-banner">
            <div className="onb-service-icon">👤</div>
            <div>
              <div className="onb-service-name">New Employee Onboarding</div>
              <span className="onb-service-type">ONBOARDING</span>
            </div>
          </div>

          {/* Form Body - Single Column */}
          <div className="onb-form-body">
            {/* Employee ID & Name */}
            <div className="onb-form-row">
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Employee ID <span className="required">*</span>
                </label>
                <input
                  className="onb-form-input"
                  name="employeeId"
                  value={formData.employeeId}
                  onChange={handleInputChange}
                  placeholder="e.g., EMP-001"
                />
              </div>
              <div className="onb-form-group">
                <label className="onb-form-label">
                  First Name <span className="required">*</span>
                </label>
                <input
                  className="onb-form-input"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  placeholder="e.g., John"
                />
              </div>
            </div>

            {/* Last Name & Email Prefix */}
            <div className="onb-form-row">
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Last Name <span className="required">*</span>
                </label>
                <input
                  className="onb-form-input"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  placeholder="e.g., Doe"
                />
              </div>
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Email Prefix <span className="required">*</span>
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    className="onb-form-input"
                    name="emailPrefix"
                    value={formData.emailPrefix}
                    onChange={handleInputChange}
                    placeholder="JohnD"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className={`onb-verify-btn ${verificationStatus === 'available' ? 'verified' : ''}`}
                    onClick={handleVerifyUser}
                    disabled={verificationStatus === 'verifying' || !formData.emailPrefix || verificationStatus === 'available'}
                    style={getVerifyButtonStyle()}
                  >
                    {getVerifyButtonText()}
                  </button>
                </div>
                <div className={`onb-verify-status ${getVerifyStatusStyle()}`}>
                  {getVerifyStatusText()}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  @{COMPANY_DOMAIN} (Auto-suggested as FirstName + LastNameInitial)
                </div>
              </div>
            </div>

            {/* Job Title & Department */}
            <div className="onb-form-row">
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Job Title <span className="required">*</span>
                </label>
                <input
                  className="onb-form-input"
                  name="jobTitle"
                  value={formData.jobTitle}
                  onChange={handleInputChange}
                  placeholder="e.g., Software Engineer"
                />
              </div>
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Department <span className="required">*</span>
                </label>
                <select
                  className="onb-form-select"
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                >
                  <option value="">Select Department</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Employee Type */}
            <div className="onb-form-row">
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Employee Type <span className="required">*</span>
                </label>
                <select
                  className="onb-form-select"
                  name="employeeType"
                  value={formData.employeeType}
                  onChange={handleInputChange}
                  disabled={loadingEmployeeTypes}
                >
                  <option value="">
                    {loadingEmployeeTypes ? 'Loading employee types...' : 'Select Employee Type'}
                  </option>
                  {employeeTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Gender & Work Location */}
            <div className="onb-form-row">
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Gender <span className="required">*</span>
                </label>
                <select
                  className="onb-form-select"
                  name="gender"
                  value={formData.gender}
                  onChange={handleInputChange}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Work Location <span className="required">*</span>
                </label>
                <div className="onb-radio-group">
                  <label className="onb-radio-label">
                    <input
                      type="radio"
                      className="onb-radio"
                      name="workLocation"
                      value="remote"
                      checked={formData.workLocation === 'remote'}
                      onChange={handleInputChange}
                    />
                    Remote
                  </label>
                  <label className="onb-radio-label">
                    <input
                      type="radio"
                      className="onb-radio"
                      name="workLocation"
                      value="hybrid"
                      checked={formData.workLocation === 'hybrid'}
                      onChange={handleInputChange}
                    />
                    Hybrid
                  </label>
                  <label className="onb-radio-label">
                    <input
                      type="radio"
                      className="onb-radio"
                      name="workLocation"
                      value="office"
                      checked={formData.workLocation === 'office'}
                      onChange={handleInputChange}
                    />
                    Office
                  </label>
                </div>
              </div>
            </div>

            {/* Office Location */}
            <div className="onb-form-row">
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Office Location {formData.workLocation === 'office' && <span className="required">*</span>}
                </label>
                <input
                  className="onb-form-input"
                  name="officeLocation"
                  value={formData.officeLocation}
                  onChange={handleInputChange}
                  placeholder="e.g., Chennai - Guindy Campus"
                />
              </div>
            </div>

            {/* Other Email & Phone */}
            <div className="onb-form-row">
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Other Email (Personal) <span className="required">*</span>
                </label>
                <input
                  className="onb-form-input"
                  type="email"
                  name="otherEmail"
                  value={formData.otherEmail}
                  onChange={handleInputChange}
                />
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  This email will receive the welcome notification
                </div>
              </div>
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Phone Number <span className="required">*</span>
                </label>
                <input
                  className="onb-form-input"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  placeholder="e.g., +1 234 567 8900"
                />
              </div>
            </div>

            {/* Contact Info: Street, City, State */}
            <div className="onb-form-row-3">
              <div className="onb-form-group">
                <label className="onb-form-label">
                  Street <span className="required">*</span>
                </label>
                <input
                  className="onb-form-input"
                  name="street"
                  value={formData.contactInfo.street}
                  onChange={handleContactInfoChange}
                  placeholder="e.g., 221B Baker Street"
                />
              </div>
              <div className="onb-form-group">
                <label className="onb-form-label">
                  City <span className="required">*</span>
                </label>
                <input
                  className="onb-form-input"
                  name="city"
                  value={formData.contactInfo.city}
                  onChange={handleContactInfoChange}
                  placeholder="e.g., Chennai"
                />
              </div>
              <div className="onb-form-group">
                <label className="onb-form-label">
                  State <span className="required">*</span>
                </label>
                <input
                  className="onb-form-input"
                  name="state"
                  value={formData.contactInfo.state}
                  onChange={handleContactInfoChange}
                  placeholder="e.g., Tamil Nadu"
                />
              </div>
            </div>

            {/* Creation Type - fixed, read-only */}
            <div className="onb-form-row">
              <div className="onb-form-group">
                <label className="onb-form-label">Creation Type</label>
                <input
                  className="onb-form-input"
                  name="creationType"
                  value={formData.creationType}
                  readOnly
                  disabled
                  style={{ background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' }}
                />
              </div>
            </div>

            {/* Reporting To - Search from Azure AD */}
            <div className="onb-form-group">
              <label className="onb-form-label">
                Reporting To <span className="required">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={reportingToInputRef}
                  className="onb-form-input"
                  placeholder="Search by name or email..."
                  value={formData.reportingTo.name ? `${formData.reportingTo.name} (${formData.reportingTo.email})` : reportingToSearchQuery}
                  onChange={e => {
                    if (formData.reportingTo.name) {
                      setFormData(prev => ({ ...prev, reportingTo: { id: '', name: '', email: '' } }));
                    }
                    handleReportingToSearch(e.target.value);
                  }}
                  onFocus={() => reportingToSearchQuery.length >= 2 && setShowReportingToDropdown(true)}
                  autoComplete="off"
                />
                {searchingReportingTo && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Searching...</div>
                )}
                {showReportingToDropdown && reportingToResults.length > 0 && (
                  <div ref={reportingToDropdownRef} className="onb-user-dropdown">
                    {reportingToResults.map(user => (
                      <div key={user.id} className="onb-dd-item" onClick={() => selectReportingTo(user)}>
                        <div className="onb-dd-avatar">{user.displayName.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="onb-dd-name">{user.displayName}</div>
                          <div className="onb-dd-email">{user.mail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {formData.reportingTo.name && (
                  <div className="onb-selected-user">
                    <div className="onb-selected-label">✓ Selected Manager</div>
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>{formData.reportingTo.name}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>{formData.reportingTo.email}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Form Footer */}
          <div className="onb-form-footer">
            <button className="onb-btn-cancel" onClick={resetForm}>
              Reset Form
            </button>
            <button
              className="onb-btn-submit"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
            >
              {submitting ? 'Submitting...' : 'Submit Onboarding Request'}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast.open && (
        <div className={`onb-toast ${toast.type === 'success' ? 'onb-toast-success' : 'onb-toast-error'}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default OnboardingForm;