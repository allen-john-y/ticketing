import React, { useState, useRef, useEffect } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import Login from './Login';
import Home from './Home';
import Requests from './Requests';
import Incidents from './Incidents'
import HrRequest from './HrRequest';
import CreateRequest from './CreateRequest';
import CreateIncident from './CreateIncident';
import OnboardingForm from './OnboardingForm';
import TicketDetails from './TicketDetails';
import IncidentDetails from './IncidentDetails';
import RequestDetails from './RequestDetails';
import Dashboard from './Dashboard';
import Settings from './SettingsPages/Settings';
import Offboarding from './OffboardingForm';
import OffboardingRequestDetails from './OffboardingRequestDetails';
import CreateKB from './SettingsPages/CreateKB';
import OnboardingRequestDetails from './OnboardingRequestDetails';
import CreateKBForm from './SettingsPages/CreateKBForm';
import CreateHrRequest from './SettingsPages/CreateHrRequest';
import Departments from './SettingsPages/Departments';
import OnboardingSettings from './SettingsPages/OnboardingSettings';
import OffboardingSettings from './SettingsPages/OffboardingSettings';
import KBListView from './KBListView';
import KBView from './KBView';
import SmartSearch from './SmartSearch';
import logo from './sandeza.jpg';

const HELP_DESK_GROUP_ID = process.env.REACT_APP_HELP_DESK_GROUP_ID;
const BACKEND = process.env.REACT_APP_BACKEND_URL;

/* ─────────────────────────── PROTECTED HR ROUTE ─────────────────────────── */
function ProtectedHrRoute({ children, hasAccess, loading }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !hasAccess) {
      navigate('/', { replace: true });
    }
  }, [loading, hasAccess, navigate]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '50vh',
        fontSize: '14px',
        color: '#64748b'
      }}>
        Checking access...
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '50vh',
        textAlign: 'center',
        padding: '20px'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ color: '#0f172a', marginBottom: '8px' }}>Access Denied</h2>
        <p style={{ color: '#64748b' }}>You don't have permission to access HR requests.</p>
      </div>
    );
  }

  return children;
}

/* ─────────────────────────── NAV CONTEXT ─────────────────────────── */
const NavContext = React.createContext({ navExpanded: false });

/* ─────────────────────────── LEFT NAVBAR ─────────────────────────── */
function LeftNav({ isAdmin, hasHrAccess, onExpandChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [hovered, setHovered]   = useState(false);
  const [pinned, setPinned]     = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef  = useRef(null);
  const navRef   = useRef(null);
  const hoverTimer = useRef(null);

  const expanded = hovered || pinned;

  useEffect(() => {
    onExpandChange && onExpandChange(expanded);
  }, [expanded, onExpandChange]);

  useEffect(() => {
    const handler = (e) => {
      if (plusRef.current && !plusRef.current.contains(e.target)) setPlusOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMouseEnter = () => {
    clearTimeout(hoverTimer.current);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimer.current = setTimeout(() => setHovered(false), 200);
    setPlusOpen(false);
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navItems = [
    {
      id: 'incidents',
      label: 'Incidents',
      path: '/incidents',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
      color: '#ef4444',
      activeColor: 'rgba(239,68,68,0.15)',
    },
    {
      id: 'requests',
      label: 'Requests',
      path: '/requests',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
      color: '#3b82f6',
      activeColor: 'rgba(59,130,246,0.15)',
    },
    // ✅ Conditionally show HR Request based on hasHrAccess
    ...(hasHrAccess ? [{
      id: 'onboarding',
      label: 'HR Request',
      path: '/hr-request',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
          <path d="M16 7a4 4 0 0 1-8 0"/>
        </svg>
      ),
      color: '#e98404',
      activeColor: 'rgba(233,132,4,0.15)',
    }] : []),
    {
      id: 'kb',
      label: 'Knowledge Base',
      path: '/kb',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
        </svg>
      ),
      color: '#8b5cf6',
      activeColor: 'rgba(139,92,246,0.15)',
    },
    ...(isAdmin ? [{
      id: 'settings',
      label: 'Settings',
      path: '/settings',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      ),
      color: '#e98404',
      activeColor: 'rgba(233,132,4,0.15)',
    }] : []),
  ];

  return (
    <>
      <style>{`
        .left-nav {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          width: 64px;
          background: #002060;
          z-index: 200;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
          box-shadow: 2px 0 12px rgba(0,0,0,0.18);
        }
        .left-nav.expanded {
          width: 220px;
        }

        .nav-logo-area {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 13px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          min-height: 68px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .nav-logo-area:hover .nav-logo-img {
          box-shadow: 0 0 0 2px rgba(233,132,4,0.6);
        }
        .nav-logo-img {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
          transition: box-shadow 0.2s;
        }
        .nav-logo-text {
          display: flex;
          flex-direction: column;
          white-space: nowrap;
          overflow: hidden;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .left-nav.expanded .nav-logo-text {
          opacity: 1;
          transition: opacity 0.2s 0.1s;
        }
        .nav-logo-title {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 0.04em;
          line-height: 1.2;
        }
        .nav-logo-sub {
          font-size: 10px;
          color: #e98404;
          font-weight: 500;
          margin-top: 2px;
        }

        .nav-body {
          flex: 1;
          padding: 12px 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .nav-plus-wrapper {
          position: relative;
          margin: 0 8px 8px 8px;
        }
        .nav-plus-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 4px 10px 8px;
          border: none;
          background: rgba(233,132,4,0.15);
          border-radius: 8px;
          cursor: pointer;
          color: #e98404;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 600;
          transition: background 0.15s;
          white-space: nowrap;
          overflow: hidden;
        }
        .nav-plus-btn:hover {
          background: rgba(233,132,4,0.25);
        }
        .nav-plus-icon {
          width: 30px;
          height: 30px;
          border-radius: 6px;
          background: #e98404;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: white;
          font-size: 18px;
          line-height: 1;
          transition: transform 0.2s;
        }
        .nav-plus-btn:hover .nav-plus-icon {
          transform: rotate(90deg);
        }
        .nav-plus-label {
          opacity: 0;
          transition: opacity 0.15s;
          font-weight: 600;
        }
        .left-nav.expanded .nav-plus-label {
          opacity: 1;
          transition: opacity 0.2s 0.1s;
        }

        .nav-plus-dropdown {
          position: absolute;
          left: calc(100% + 8px);
          top: 0;
          background: white;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          border: 1px solid #d9d5cc;
          overflow: hidden;
          z-index: 300;
          min-width: 180px;
          animation: dropIn 0.15s ease;
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .left-nav.expanded .nav-plus-dropdown {
          left: 0;
          top: calc(100% + 6px);
        }
        .nav-plus-dropdown-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border: none;
          background: white;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #111827;
          text-align: left;
          transition: background 0.12s;
        }
        .nav-plus-dropdown-item:hover {
          background: #f9f8f6;
        }
        .nav-plus-dropdown-item + .nav-plus-dropdown-item {
          border-top: 1px solid #f0ede9;
        }
        .dropdown-item-icon {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 14px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 8px 10px 13px;
          margin: 0 8px;
          border-radius: 8px;
          cursor: pointer;
          color: rgba(255,255,255,0.65);
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
          overflow: hidden;
          border: none;
          background: transparent;
          text-align: left;
          width: calc(100% - 16px);
        }
        .nav-item:hover {
          background: rgba(255,255,255,0.08);
          color: white;
        }
        .nav-item.active {
          color: white;
        }
        .nav-item-icon-wrap {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .nav-item-label {
          opacity: 0;
          transition: opacity 0.15s;
          flex: 1;
        }
        .left-nav.expanded .nav-item-label {
          opacity: 1;
          transition: opacity 0.2s 0.1s;
        }
        .nav-active-bar {
          width: 3px;
          height: 20px;
          border-radius: 2px;
          background: currentColor;
          flex-shrink: 0;
          margin-left: auto;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .nav-item.active .nav-active-bar {
          opacity: 1;
        }

        .nav-divider {
          height: 1px;
          background: rgba(255,255,255,0.08);
          margin: 8px 16px;
          flex-shrink: 0;
        }

        .nav-pin-inline {
          margin-left: auto;
          flex-shrink: 0;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: none;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.35);
          transition: background 0.15s, color 0.15s;
          opacity: 0;
          pointer-events: none;
        }
        .left-nav.expanded .nav-pin-inline {
          opacity: 1;
          pointer-events: auto;
          transition: opacity 0.2s 0.1s, background 0.15s, color 0.15s;
        }
        .nav-pin-inline:hover {
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.8);
        }
        .nav-pin-inline.pinned {
          color: #e98404;
        }

        .nav-item-tooltip {
          position: fixed;
          left: 72px;
          background: #1e3a6e;
          color: white;
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          pointer-events: none;
          white-space: nowrap;
          z-index: 9999;
          font-family: 'DM Sans', sans-serif;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .nav-item-tooltip::before {
          content: '';
          position: absolute;
          left: -4px;
          top: 50%;
          transform: translateY(-50%);
          border: 4px solid transparent;
          border-right-color: #1e3a6e;
          border-left: none;
        }
      `}</style>

      <nav
        ref={navRef}
        className={`left-nav${expanded ? ' expanded' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="nav-logo-area" onClick={() => navigate('/')}>
          <img src={logo} alt="Sandeza" className="nav-logo-img" />
          <div className="nav-logo-text">
            <span className="nav-logo-title">SANDEZA INC</span>
            <span className="nav-logo-sub">IT Ticket Portal</span>
          </div>
          <button
            className={`nav-pin-inline${pinned ? ' pinned' : ''}`}
            onClick={(e) => { e.stopPropagation(); setPinned(prev => !prev); }}
            title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          >
            {pinned ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22"/>
                <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
              </svg>
            )}
          </button>
        </div>

        <div className="nav-body">
          <div className="nav-plus-wrapper" ref={plusRef}>
            <button
              className="nav-plus-btn"
              onClick={() => setPlusOpen(prev => !prev)}
            >
              <span className="nav-plus-icon">+</span>
              <span className="nav-plus-label">Create New</span>
            </button>

            {plusOpen && (
              <div className="nav-plus-dropdown">
                <button
                  className="nav-plus-dropdown-item"
                  onClick={() => { setPlusOpen(false); navigate('/create-incident'); }}
                >
                  <span className="dropdown-item-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>🚨</span>
                  New Incident
                </button>
                <button
                  className="nav-plus-dropdown-item"
                  onClick={() => { setPlusOpen(false); navigate('/create-request'); }}
                >
                  <span className="dropdown-item-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>📋</span>
                  New Request
                </button>
              </div>
            )}
          </div>

          <div className="nav-divider" />

          {navItems.map(item => (
            <NavItemWithTooltip
              key={item.id}
              item={item}
              expanded={expanded}
              active={isActive(item.path)}
              onClick={() => navigate(item.path)}
            />
          ))}
        </div>

      </nav>
    </>
  );
}

function NavItemWithTooltip({ item, expanded, active, onClick }) {
  const [tooltipPos, setTooltipPos] = useState(null);
  const itemRef = useRef(null);

  const handleMouseEnter = () => {
    if (!expanded && itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      setTooltipPos(rect.top + rect.height / 2);
    }
  };
  const handleMouseLeave = () => setTooltipPos(null);

  return (
    <>
      <button
        ref={itemRef}
        className={`nav-item${active ? ' active' : ''}`}
        style={active ? { background: item.activeColor || 'rgba(255,255,255,0.1)', color: item.color || 'white' } : {}}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span className="nav-item-icon-wrap" style={active ? { color: item.color } : {}}>
          {item.icon}
        </span>
        <span className="nav-item-label">{item.label}</span>
        <span className="nav-active-bar" />
      </button>
      {tooltipPos !== null && !expanded && (
        <div className="nav-item-tooltip" style={{ top: tooltipPos - 14 }}>
          {item.label}
        </div>
      )}
    </>
  );
}

/* ─────────────────────────── PROFILE MODAL COMPONENT ─────────────────────────── */
function ProfileModal({ isOpen, onClose, profileData, profilePhoto, initials, loading, error, account }) {
  const [activeTab, setActiveTab] = useState('work');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        .pm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(6px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: pmFadeIn 0.2s ease;
        }

        .pm-container {
          background: #ffffff;
          border-radius: 28px;
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          flex-direction: column;
          animation: pmScaleUp 0.25s cubic-bezier(0.34, 1.2, 0.64, 1);
        }

        @keyframes pmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes pmScaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .pm-header {
          background: linear-gradient(135deg, #002060 0%, #1a3a6e 50%, #0e4a8a 100%);
          padding: 28px 28px 0 28px;
          position: relative;
          color: white;
        }

        .pm-close-btn {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: rgba(255, 255, 255, 0.8);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: all 0.2s;
        }

        .pm-close-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          color: white;
          transform: rotate(90deg);
        }

        .pm-profile-summary {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 28px;
        }

        .pm-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 3px solid rgba(255, 255, 255, 0.3);
          background: #1e3a6e;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          font-weight: 700;
          color: white;
          overflow: hidden;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
        }

        .pm-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .pm-meta-name {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.3px;
          margin-bottom: 4px;
        }

        .pm-meta-email {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
          word-break: break-all;
        }

        .pm-tabs {
          display: flex;
          gap: 28px;
          margin-top: 8px;
        }

        .pm-tab {
          padding: 10px 0;
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.6);
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: inherit;
          position: relative;
          transition: color 0.2s;
        }

        .pm-tab:hover {
          color: white;
        }

        .pm-tab.active {
          color: #e98404;
        }

        .pm-tab.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 3px;
          background: #e98404;
          border-radius: 4px 4px 0 0;
        }

        .pm-body {
          padding: 28px;
          overflow-y: auto;
          flex: 1;
          background: #fafafc;
        }

        .pm-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .pm-full-width {
          grid-column: span 2;
        }

        .pm-field {
          background: #ffffff;
          border: 1px solid #edf2f7;
          border-radius: 16px;
          padding: 16px;
          display: flex;
          gap: 14px;
          align-items: flex-start;
          transition: all 0.2s;
        }

        .pm-field:hover {
          border-color: #e2e8f0;
          transform: translateY(-1px);
          box-shadow: 0 6px 12px -6px rgba(0, 0, 0, 0.05);
        }

        .pm-field-icon {
          width: 40px;
          height: 40px;
          background: rgba(233, 132, 4, 0.1);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #e98404;
          flex-shrink: 0;
        }

        .pm-field-content {
          flex: 1;
        }

        .pm-field-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #94a3b8;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .pm-field-value {
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
          word-break: break-word;
        }

        .pm-field-value.mono {
          font-family: 'DM Mono', monospace;
          font-size: 13px;
          background: #f1f5f9;
          padding: 2px 8px;
          border-radius: 8px;
          display: inline-block;
        }

        .pm-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        .pm-badge-dept {
          background: rgba(0, 32, 96, 0.08);
          color: #002060;
        }

        .pm-badge-role {
          background: rgba(233, 132, 4, 0.1);
          color: #b86b00;
        }

        .pm-badge-auth {
          background: #dcfce7;
          color: #16a34a;
        }

        .pm-skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.2s infinite;
          border-radius: 16px;
          height: 80px;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .pm-error {
          background: #fef2f2;
          border-left: 4px solid #dc2626;
          padding: 14px 18px;
          border-radius: 14px;
          margin-bottom: 16px;
        }

        .pm-error-text {
          color: #991b1b;
          font-size: 13px;
          font-weight: 500;
        }

        .pm-body::-webkit-scrollbar {
          width: 6px;
        }
        .pm-body::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }
        .pm-body::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }

        @media (max-width: 500px) {
          .pm-grid {
            grid-template-columns: 1fr;
          }
          .pm-full-width {
            grid-column: span 1;
          }
          .pm-profile-summary {
            flex-direction: column;
            text-align: center;
            gap: 12px;
          }
          .pm-tabs {
            justify-content: center;
          }
        }
      `}</style>

      <div className="pm-overlay" onClick={onClose}>
        <div className="pm-container" onClick={(e) => e.stopPropagation()}>
          
          <div className="pm-header">
            <button className="pm-close-btn" onClick={onClose}>✕</button>
            
            <div className="pm-profile-summary">
              <div className="pm-avatar">
                {profilePhoto ? (
                  <img src={profilePhoto} alt="Profile" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div>
                <div className="pm-meta-name">{account?.name || 'Unknown User'}</div>
                <div className="pm-meta-email">{account?.username || ''}</div>
              </div>
            </div>

            <div className="pm-tabs">
              <button 
                className={`pm-tab ${activeTab === 'work' ? 'active' : ''}`}
                onClick={() => setActiveTab('work')}
              >
                Work
              </button>
              <button 
                className={`pm-tab ${activeTab === 'contact' ? 'active' : ''}`}
                onClick={() => setActiveTab('contact')}
              >
                Contact
              </button>
              <button 
                className={`pm-tab ${activeTab === 'system' ? 'active' : ''}`}
                onClick={() => setActiveTab('system')}
              >
                System
              </button>
            </div>
          </div>

          <div className="pm-body">
            {loading && (
              <div className="pm-grid">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="pm-skeleton" />
                ))}
              </div>
            )}

            {error && (
              <div className="pm-error">
                <div className="pm-error-text">⚠️ {error}</div>
              </div>
            )}

            {!loading && !error && profileData && (
              <div className="pm-grid">
                {activeTab === 'work' && (
                  <>
                    <div className="pm-field">
                      <div className="pm-field-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                        </svg>
                      </div>
                      <div className="pm-field-content">
                        <div className="pm-field-label">Job Title</div>
                        <div className="pm-field-value">{profileData.jobTitle || 'Not specified'}</div>
                      </div>
                    </div>

                    <div className="pm-field">
                      <div className="pm-field-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      </div>
                      <div className="pm-field-content">
                        <div className="pm-field-label">Department</div>
                        <div className="pm-field-value">
                          <span className="pm-badge pm-badge-dept">{profileData.department || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pm-field pm-full-width">
                      <div className="pm-field-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                      </div>
                      <div className="pm-field-content">
                        <div className="pm-field-label">Reporting Manager</div>
                        <div className="pm-field-value">{profileData.manager || '—'}</div>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'contact' && (
                  <>
                    <div className="pm-field pm-full-width">
                      <div className="pm-field-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                      </div>
                      <div className="pm-field-content">
                        <div className="pm-field-label">Email Address</div>
                        <div className="pm-field-value mono">{profileData.email || 'N/A'}</div>
                      </div>
                    </div>

                    <div className="pm-field">
                      <div className="pm-field-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                      </div>
                      <div className="pm-field-content">
                        <div className="pm-field-label">Mobile</div>
                        <div className="pm-field-value mono">{profileData.mobilePhone || 'Not provided'}</div>
                      </div>
                    </div>

                    <div className="pm-field">
                      <div className="pm-field-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                      </div>
                      <div className="pm-field-content">
                        <div className="pm-field-label">Location</div>
                        <div className="pm-field-value">{profileData.state || 'Not specified'}</div>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'system' && (
                  <>
                    <div className="pm-field">
                      <div className="pm-field-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </div>
                      <div className="pm-field-content">
                        <div className="pm-field-label">Employee ID</div>
                        <div className="pm-field-value mono">{profileData.employeeId || 'Not assigned'}</div>
                      </div>
                    </div>

                    <div className="pm-field">
                      <div className="pm-field-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                      </div>
                      <div className="pm-field-content">
                        <div className="pm-field-label">Status</div>
                        <div className="pm-field-value">
                          <span className="pm-badge pm-badge-auth">✓ Authenticated</span>
                        </div>
                      </div>
                    </div>

                    <div className="pm-field pm-full-width">
                      <div className="pm-field-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3"/>
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                      </div>
                      <div className="pm-field-content">
                        <div className="pm-field-label">Security</div>
                        <div className="pm-field-value">Azure AD Protected</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── HEADER ─────────────────────────── */
function Header({ logout }) {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();
  const profileRef = useRef(null);

  const [profileOpen, setProfileOpen]         = useState(false);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [profileData, setProfileData]         = useState(null);
  const [loadingProfile, setLoadingProfile]   = useState(false);
  const [profileError, setProfileError]       = useState(null);
  const [profilePhoto, setProfilePhoto]       = useState(null);
  const [isAdmin, setIsAdmin]                 = useState(false);
  const [hasHrAccess, setHasHrAccess]         = useState(false);
  const [loadingHrAccess, setLoadingHrAccess] = useState(true);
  const [navExpanded, setNavExpanded]         = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications] = useState([]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
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
          binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize));
        }
        const b64 = btoa(binary);
        const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
        setProfilePhoto(`data:${contentType};base64,${b64}`);
      } catch {}
    };
    fetchPhotoSilently();
  }, [accounts, instance]);

  // ─── Check Admin Status ───
  useEffect(() => {
    let cancelled = false;
    const checkMembership = async () => {
      if (!accounts || !accounts[0]) { setIsAdmin(false); return; }
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
        const fallback = await fetch(
          'https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName',
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (fallback.ok) {
          const j = await fallback.json();
          const found = Array.isArray(j.value) && j.value.some(g => g.id === HELP_DESK_GROUP_ID);
          if (!cancelled) setIsAdmin(!!found);
        } else {
          if (!cancelled) setIsAdmin(false);
        }
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          instance.acquireTokenPopup({ scopes: ['GroupMember.Read.All'], account: accounts[0] });
        } else {
          if (!cancelled) setIsAdmin(false);
        }
      }
    };
    checkMembership();
    return () => { cancelled = true; };
  }, [accounts, instance]);

  // ─── Check HR Access ───
  useEffect(() => {
    let cancelled = false;
    const checkHrAccess = async () => {
      if (!accounts || !accounts[0]) {
        setHasHrAccess(false);
        setLoadingHrAccess(false);
        return;
      }
      try {
        const email = accounts[0].username;
        const res = await fetch(`${BACKEND}/api/hr-access/check?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (!cancelled) {
          setHasHrAccess(!!data.hasAccess);
        }
      } catch (err) {
        console.error('Error checking HR access:', err);
        if (!cancelled) setHasHrAccess(false);
      } finally {
        if (!cancelled) setLoadingHrAccess(false);
      }
    };
    checkHrAccess();
    return () => { cancelled = true; };
  }, [accounts]);

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
        { headers: { Authorization: `Bearer ${token}`, 'ConsistencyLevel': 'eventual' } }
      );
      if (!graphRes.ok) throw new Error(`Graph ${graphRes.status}`);
      const data = await graphRes.json();
      setProfileData({
        name:          data.displayName || '',
        email:         data.mail || data.userPrincipalName || '',
        department:    data.department || '',
        employeeId:    data.employeeId || '',
        mobilePhone:   data.mobilePhone || '',
        streetAddress: data.streetAddress || '',
        state:         data.state || '',
        postalCode:    data.postalCode || '',
        jobTitle:      data.jobTitle || '',
        manager:       data.manager ? data.manager.displayName || '' : '',
      });
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

  const unreadCount = notifications.filter(n => !n.read).length;

  const initials = (accounts?.[0]?.name || accounts?.[0]?.username || 'U')
    .split(' ')
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join('');

  // Don't render navigation until HR access check is complete
  if (loadingHrAccess) {
    return (
      <div className="app-root">
        <div className="app-container">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '100vh',
            fontSize: '14px',
            color: '#64748b'
          }}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .app-root {
          min-height: 100vh;
          background: #f4f4f0;
          font-family: 'DM Sans', sans-serif;
          color: #111827;
        }

        .app-container {
          display: flex;
          min-height: 100vh;
        }

        .main-wrapper {
          flex: 1;
          min-height: 100vh;
          background: #f4f4f0;
          margin-left: 64px;
          transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .main-wrapper.nav-open {
          margin-left: 220px;
        }

        .app-header {
          background: #ffffff;
          padding: 0 2rem;
          height: 68px;
          border-bottom: 1px solid #eef2f6;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        }

        .header-left {
          width: 40px;
        }

        .header-center {
          flex: 1;
          display: flex;
          justify-content: center;
          max-width: 600px;
          margin: 0 auto;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .notif-btn {
          position: relative;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #5c6b7e;
          transition: all 0.2s;
        }

        .notif-btn:hover {
          background: #f5f7fb;
          color: #e98404;
        }

        .notif-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          background: #ef4444;
          color: white;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 10px;
          line-height: 1;
        }

        .notif-dropdown {
          position: absolute;
          top: 50px;
          right: 0;
          width: 340px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
          border: 1px solid #eef2f6;
          z-index: 200;
          overflow: hidden;
          animation: notifSlide 0.2s ease;
        }

        @keyframes notifSlide {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .notif-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          border-bottom: 1px solid #f0f2f5;
        }

        .notif-header h4 {
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
        }

        .notif-list {
          max-height: 360px;
          overflow-y: auto;
        }

        .notif-empty {
          padding: 48px 32px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .notif-empty-icon {
          font-size: 48px;
          opacity: 0.5;
        }

        .notif-empty-text {
          color: #9ca3af;
          font-size: 14px;
          font-weight: 500;
        }

        .notif-empty-sub {
          color: #cbd5e1;
          font-size: 12px;
        }

        .profile-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 12px 6px 8px;
          border-radius: 40px;
          border: 1px solid #e9edf2;
          background: white;
          color: #111827;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'DM Sans', sans-serif;
        }

        .profile-btn:hover {
          background: #fafbfc;
          border-color: #d1d8e0;
        }

        .profile-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
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
          line-height: 1.3;
        }

        .profile-name {
          font-size: 13px;
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
          top: 50px;
          margin-top: 8px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
          padding: 1rem;
          width: 280px;
          z-index: 200;
          border: 1px solid #eef2f6;
        }

        .profile-dropdown-header {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #f0f2f5;
        }

        .profile-dropdown-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          color: #374151;
          overflow: hidden;
          font-size: 14px;
        }

        .profile-dropdown-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
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
          border-radius: 10px;
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
          background: #f0f2f5;
        }

        .btn-logout {
          background: #ef4444;
          color: white;
        }

        .btn-logout:hover {
          background: #dc2626;
        }

        .admin-badge {
          padding: 4px 10px;
          background: rgba(0, 32, 96, 0.08);
          border: 1px solid rgba(0, 32, 96, 0.15);
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          color: #002060;
          letter-spacing: 0.04em;
        }

        .page-content {
          padding: 0;
        }

        @media (max-width: 768px) {
          .header-center {
            display: none;
          }
          .profile-info {
            display: none;
          }
          .profile-btn {
            padding: 6px 8px;
          }
        }
      `}</style>

      <div className="app-root">
        <div className="app-container">

          <LeftNav isAdmin={isAdmin} hasHrAccess={hasHrAccess} onExpandChange={setNavExpanded} />

          <div className={`main-wrapper${navExpanded ? ' nav-open' : ''}`}>
            <header className="app-header">
              <div className="header-left" />

              <div className="header-center">
                <SmartSearch />
              </div>

              <div className="header-right">
                {isAdmin && <span className="admin-badge">ADMIN</span>}

                <div style={{ position: 'relative' }}>
                  <button
                    className="notif-btn"
                    onClick={() => setNotificationsOpen(!notificationsOpen)}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {unreadCount > 0 && (
                      <span className="notif-badge">{unreadCount}</span>
                    )}
                  </button>

                  {notificationsOpen && (
                    <div className="notif-dropdown">
                      <div className="notif-header">
                        <h4>Notifications</h4>
                      </div>
                      <div className="notif-list">
                        <div className="notif-empty">
                          <div className="notif-empty-icon">🔔</div>
                          <div className="notif-empty-text">No notifications yet</div>
                          <div className="notif-empty-sub">We'll notify you when something arrives</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div ref={profileRef} style={{ position: 'relative' }}>
                  <button onClick={() => setProfileOpen(prev => !prev)} className="profile-btn">
                    <div className="profile-avatar">
                      {profilePhoto
                        ? <img src={profilePhoto} alt="profile" />
                        : <span>{initials}</span>
                      }
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
                          {profilePhoto
                            ? <img src={profilePhoto} alt="profile" />
                            : <span>{initials}</span>
                          }
                        </div>
                        <div>
                          <div className="profile-dropdown-name">{accounts?.[0]?.name || 'Unknown'}</div>
                          <div className="profile-dropdown-email">{accounts?.[0]?.username}</div>
                        </div>
                      </div>
                      <div className="profile-actions">
                        <button
                          onClick={() => { openFullProfile(); setProfileOpen(false); }}
                          className="profile-action-btn btn-view-profile"
                        >
                          View Full Profile
                        </button>
                        <button onClick={logout} className="profile-action-btn btn-logout">
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            <div className="page-content">
              <Routes>
                <Route path="/" element={<Home />} />
                
                {/* ✅ Protected HR Routes */}
                <Route 
                  path="/hr-request" 
                  element={
                    <ProtectedHrRoute hasAccess={hasHrAccess} loading={loadingHrAccess}>
                      <HrRequest />
                    </ProtectedHrRoute>
                  } 
                />
                <Route 
                  path="/hr-request/:id" 
                  element={
                    <ProtectedHrRoute hasAccess={hasHrAccess} loading={loadingHrAccess}>
                      <OnboardingRequestDetails />
                    </ProtectedHrRoute>
                  } 
                />
                <Route 
                  path="/onboarding/form" 
                  element={
                    <ProtectedHrRoute hasAccess={hasHrAccess} loading={loadingHrAccess}>
                      <OnboardingForm />
                    </ProtectedHrRoute>
                  } 
                />
                
                <Route path="/requests" element={<Requests />} />
                <Route path="/incidents" element={<Incidents />} />
                <Route path="/create-request" element={<CreateRequest />} />
                <Route path="/create-request/:type" element={<CreateRequest />} />
                <Route path="/create-incident" element={<CreateIncident />} />
                <Route path="/incidents/:id" element={<IncidentDetails />} />
                <Route path="/requests/:id" element={<RequestDetails />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/settings/*" element={<Settings isAdmin={isAdmin} />} />
                <Route path="/settings/create-kb" element={<CreateKB />} />
                <Route path="/offboarding/form" element={<Offboarding />} />
                <Route path="/offboarding-request/:id" element={<OffboardingRequestDetails />} />
                <Route path="/settings/create-kb/new" element={<CreateKBForm />} />
                {isAdmin && <Route path="/settings/departments" element={<Departments />} />}
                {isAdmin && <Route path="/settings/onboarding-settings" element={<OnboardingSettings />} />}
                {isAdmin && <Route path="/settings/offboarding-settings" element={<OffboardingSettings />} />}
                <Route path="/kb" element={<KBListView />} />
                <Route path="/settings/hr-request-settings" element={<CreateHrRequest />} />
                <Route path="/kb/:id" element={<KBView />} />
              </Routes>
            </div>
          </div>
        </div>

        <ProfileModal
          isOpen={fullProfileOpen}
          onClose={() => setFullProfileOpen(false)}
          profileData={profileData}
          profilePhoto={profilePhoto}
          initials={initials}
          loading={loadingProfile}
          error={profileError}
          account={accounts?.[0]}
        />
      </div>
    </>
  );
}

/* ─────────────────────────── APP ─────────────────────────── */
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