import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useMsal } from '@azure/msal-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

/* ─────────────────────────── SMALL HELPERS ─────────────────────────── */

function initialsOf(name, mail) {
  const source = (name || mail || '').trim();
  if (!source) return '?';
  const parts = source.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─────────────────────────── SHARED STYLE SHEET ─────────────────────────── */
/* Mirrors the AssetRegistry.js design system: Sora + Inter, #002060 navy    */
/* accent, 16-20px card radii, soft slate borders, pill filters & badges.   */

const STYLE_SHEET = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');

  .license-registry {
    padding: 32px 40px;
    font-family: 'Inter', sans-serif;
    background: #f8fafc;
    min-height: calc(100vh - 68px);
  }

  /* Header */
  .lic-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .lic-header-left h1 {
    font-family: 'Sora', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px;
  }

  .lic-header-left p {
    color: #64748b;
    font-size: 14px;
    margin: 0;
  }

  .lic-header-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .lic-add-btn {
    padding: 10px 24px;
    background: #002060;
    color: white;
    border: none;
    border-radius: 12px;
    font-family: 'Sora', sans-serif;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .lic-add-btn:hover {
    background: #003090;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,32,96,0.2);
  }

  .lic-add-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .lic-add-btn.secondary {
    background: white;
    color: #475569;
    border: 1px solid #e2e8f0;
  }

  .lic-add-btn.secondary:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #475569;
    box-shadow: none;
    transform: none;
  }

  /* Stats grid */
  .lic-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .lic-stat-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px 24px;
    transition: all 0.2s;
  }

  .lic-stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.06);
  }

  .lic-stat-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    margin-bottom: 8px;
  }

  .lic-stat-value {
    font-family: 'Sora', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
  }

  .lic-stat-sub {
    font-size: 13px;
    color: #64748b;
    margin-top: 4px;
  }

  .lic-stat-card.primary .lic-stat-value { color: #002060; }
  .lic-stat-card.success .lic-stat-value { color: #16a34a; }
  .lic-stat-card.warning .lic-stat-value { color: #d97706; }
  .lic-stat-card.danger .lic-stat-value { color: #dc2626; }
  .lic-stat-card.info .lic-stat-value { color: #0ea5e9; }

  /* Filters */
  .lic-filters-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
    flex-wrap: wrap;
    align-items: center;
  }

  .lic-filters-bar input {
    padding: 10px 16px;
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    font-size: 14px;
    background: white;
    color: #0f172a;
    font-family: 'Inter', sans-serif;
    transition: border-color 0.2s;
    flex: 1;
    min-width: 220px;
  }

  .lic-filters-bar input:focus {
    outline: none;
    border-color: #002060;
    box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
  }

  .lic-filter-tags {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .lic-filter-tag {
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    border: 1.5px solid #e2e8f0;
    background: white;
    color: #64748b;
    font-family: 'Inter', sans-serif;
  }

  .lic-filter-tag:hover {
    border-color: #002060;
    color: #002060;
  }

  .lic-filter-tag.active {
    background: #002060;
    border-color: #002060;
    color: white;
  }

  /* License cards */
  .lic-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .lic-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px 22px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .lic-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.06);
    border-color: #bae6fd;
  }

  .lic-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .lic-card-name {
    font-size: 15px;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lic-card-sku {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 2px;
    font-family: monospace;
  }

  .lic-badge-unlinked {
    font-size: 10px;
    font-weight: 700;
    color: #b45309;
    background: #fef3c7;
    padding: 3px 10px;
    border-radius: 999px;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .lic-progress-track {
    height: 6px;
    border-radius: 999px;
    background: #f1f5f9;
    overflow: hidden;
    margin-bottom: 14px;
  }

  .lic-progress-fill {
    height: 100%;
    border-radius: 999px;
    transition: width .4s ease;
  }

  .lic-card-metrics {
    display: flex;
    justify-content: space-between;
  }

  .lic-metric-value {
    font-family: 'Sora', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
  }

  .lic-metric-label {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 500;
  }

  .lic-card-footer {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #f1f5f9;
    display: flex;
    justify-content: center;
  }

  .lic-card-footer-text {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Empty / loading / error states */
  .lic-state {
    text-align: center;
    padding: 60px 0;
    color: #94a3b8;
  }

  .lic-state-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  .lic-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e2e8f0;
    border-top-color: #002060;
    border-radius: 50%;
    margin: 0 auto 16px;
    animation: lic-spin 0.8s linear infinite;
  }

  .lic-spinner.small {
    width: 30px;
    height: 30px;
    margin-bottom: 12px;
  }

  @keyframes lic-spin { to { transform: rotate(360deg); } }

  .lic-error-banner {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
    padding: 16px 20px;
    color: #b91c1c;
    font-size: 13.5px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .lic-error-retry {
    margin-left: auto;
    border: 1px solid #fca5a5;
    background: #ffffff;
    color: #b91c1c;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
  }

  .lic-footer-count {
    margin-top: 16px;
    padding: 12px 0;
    font-size: 13px;
    color: #94a3b8;
    text-align: right;
    border-top: 1px solid #f1f5f9;
  }

  /* Modal shell (shared by confirmation, add/remove, send-report) */
  .lic-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: lic-fade-in 0.2s ease;
  }

  @keyframes lic-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes lic-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes lic-slide-in-right { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

  .lic-modal {
    background: #fff;
    border-radius: 20px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    animation: lic-slide-up 0.25s ease;
    overflow: hidden;
  }

  .lic-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1.5px solid #eef2f6;
    background: #fafbfc;
  }

  .lic-modal-title {
    margin: 0;
    font-family: 'Sora', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
  }

  .lic-modal-close {
    border: none;
    background: none;
    font-size: 20px;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background 0.15s;
  }

  .lic-modal-close:hover { background: #f1f5f9; color: #0f172a; }

  .lic-modal-body { padding: 24px; }

  .lic-modal-footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding: 16px 24px;
    border-top: 1px solid #eef2f6;
    background: #fafbfc;
  }

  .lic-cap-back-btn {
    padding: 9px 20px;
    background: white;
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    font-size: 13px;
    color: #334155;
    cursor: pointer;
  }

  .lic-cap-back-btn:hover { border-color: #002060; color: #002060; }
  .lic-cap-back-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .lic-primary-btn {
    border: none;
    color: #fff;
    padding: 9px 20px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    font-family: 'Sora', sans-serif;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
  }

  .lic-primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Confirmation modal (Assign / Remove license) */
  .lic-confirm-modal { max-width: 400px; }

  .lic-confirm-body {
    padding: 28px 28px 8px;
    text-align: center;
  }

  .lic-confirm-icon { font-size: 32px; margin-bottom: 10px; }

  .lic-confirm-text {
    margin: 0;
    font-size: 14px;
    color: #475569;
    line-height: 1.6;
  }

  /* Toast */
  .lic-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 10000;
    border-radius: 12px;
    padding: 16px 20px;
    max-width: 400px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    animation: lic-slide-up 0.3s ease;
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: 'Inter', sans-serif;
  }

  .lic-toast.success { background: #dcfce7; border: 1px solid #86efac; }
  .lic-toast.error { background: #fef2f2; border: 1px solid #fca5a5; }
  .lic-toast.info { background: #dbeafe; border: 1px solid #93c5fd; }

  .lic-toast-msg { margin: 0; font-size: 13px; flex: 1; }
  .lic-toast.success .lic-toast-msg { color: #166534; }
  .lic-toast.error .lic-toast-msg { color: #991b1b; }
  .lic-toast.info .lic-toast-msg { color: #1e40af; }

  .lic-toast-close {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 16px;
    padding: 0 4px;
  }
  .lic-toast.success .lic-toast-close { color: #166534; }
  .lic-toast.error .lic-toast-close { color: #991b1b; }
  .lic-toast.info .lic-toast-close { color: #1e40af; }

  /* Employee / user search (shared look with Asset Registry's assign flow) */
  .lic-employee-search-wrap { position: relative; margin-bottom: 16px; }

  .lic-employee-search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 14px;
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    outline: none;
    transition: border-color 0.2s;
    background: #fff;
  }

  .lic-employee-search-input:focus {
    border-color: #002060;
    box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
  }

  .lic-employee-hint {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 6px;
  }

  .lic-employee-results {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 20;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(15,23,42,0.15);
    max-height: 260px;
    overflow-y: auto;
  }

  .lic-employee-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    border-bottom: 1px solid #f1f5f9;
    transition: background 0.1s;
  }

  .lic-employee-row:last-child { border-bottom: none; }
  .lic-employee-row:hover { background: #f8fafc; }

  .lic-employee-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #002060;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }

  .lic-employee-name {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lic-employee-meta {
    font-size: 12px;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lic-employee-cta {
    font-size: 11px;
    color: #002060;
    font-weight: 600;
    flex-shrink: 0;
  }

  .lic-employee-empty {
    padding: 16px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
  }

  /* License detail slide-over */
  .lic-panel-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15,23,42,0.5);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: flex-end;
    z-index: 100;
    animation: lic-fade-in 0.2s ease;
  }

  .lic-panel {
    width: min(480px, 100%);
    height: 100%;
    background: #fff;
    box-shadow: -12px 0 30px rgba(15,23,42,0.2);
    display: flex;
    flex-direction: column;
    animation: lic-slide-in-right 0.25s ease;
  }

  .lic-panel-header {
    padding: 22px 24px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    background: #fafbfc;
  }

  .lic-panel-title {
    font-family: 'Sora', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
  }

  .lic-panel-sku {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 2px;
    font-family: monospace;
  }

  .lic-panel-link {
    font-size: 12px;
    color: #002060;
    margin-top: 6px;
    font-weight: 500;
  }

  .lic-panel-sub {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
  }

  .lic-panel-close {
    border: none;
    background: #f1f5f9;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    font-size: 16px;
    color: #475569;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .lic-panel-close:hover { background: #e2e8f0; }

  .lic-panel-body { padding: 20px 24px; flex: 1; overflow-y: auto; }

  .lic-warning-box {
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 13px;
    color: #92400e;
    line-height: 1.5;
  }

  .lic-user-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    border-bottom: 1px solid #f1f5f9;
    transition: background 0.15s;
  }

  .lic-user-row:hover { background: #f8fafc; }

  .lic-user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #002060;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }

  .lic-user-name {
    font-size: 13.5px;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lic-user-mail {
    font-size: 12px;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lic-row-action-btn {
    border: 1.5px solid #fecaca;
    background: #ffffff;
    color: #ef4444;
    border-radius: 8px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
    font-family: 'Inter', sans-serif;
  }

  .lic-row-action-btn:hover { background: #fef2f2; border-color: #fca5a5; }
  .lic-row-action-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Send Report modal */
  .lic-report-modal { max-width: 620px; max-height: 85vh; display: flex; flex-direction: column; }
  .lic-report-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
  .lic-report-section { margin-bottom: 18px; }

  .lic-report-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 6px;
    font-family: 'Sora', sans-serif;
  }

  .lic-report-required { color: #ef4444; }

  .lic-chip-box {
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    padding: 8px 10px;
    transition: border-color 0.2s;
  }

  .lic-chip-box:focus-within {
    border-color: #002060;
    box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
  }

  .lic-chip-list { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }

  .lic-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 4px 12px;
    background: rgba(0,32,96,0.08);
    color: #002060;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .lic-chip-remove {
    border: none;
    background: none;
    color: #002060;
    cursor: pointer;
    font-size: 12px;
    padding: 0 2px;
  }

  .lic-chip-input {
    flex: 1;
    min-width: 120px;
    border: none;
    outline: none;
    padding: 4px;
    font-size: 13px;
    background: transparent;
    font-family: inherit;
  }

  .lic-report-helper { font-size: 11px; color: #94a3b8; margin-top: 4px; }

  .lic-report-search {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1.5px solid #e2e8f0;
    font-size: 13px;
    outline: none;
    font-family: inherit;
    background: #fafbfc;
    margin-bottom: 8px;
    transition: border-color 0.2s;
  }

  .lic-report-search:focus { border-color: #002060; }

  .lic-checkbox-group {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 6px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f1f5f9;
  }

  .lic-license-grid-select {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    max-height: 160px;
    overflow-y: auto;
    padding: 4px 2px;
  }

  .lic-checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: #0f172a;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .lic-checkbox-label:hover { background: #f8fafc; }

  .lic-checkbox {
    width: 15px;
    height: 15px;
    accent-color: #002060;
    cursor: pointer;
    flex-shrink: 0;
  }

  .lic-no-results {
    grid-column: span 2;
    text-align: center;
    padding: 20px 0;
    color: #94a3b8;
    font-size: 13px;
  }

  .lic-column-group { display: flex; gap: 20px; flex-wrap: wrap; padding-top: 4px; }

  @media (max-width: 640px) {
    .license-registry { padding: 20px; }
    .lic-license-grid-select { grid-template-columns: 1fr; }
  }
`;

function StyleSheet() {
  return <style>{STYLE_SHEET}</style>;
}

/* ─────────────────────────── CONFIRMATION MODAL ─────────────────────────── */
function ConfirmationModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', confirmColor = '#0891b2', loading = false }) {
  if (!isOpen) return null;

  return (
    <div className="lic-modal-overlay" onClick={onClose}>
      <div className="lic-modal lic-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lic-modal-header">
          <h3 className="lic-modal-title">{title}</h3>
          <button onClick={onClose} className="lic-modal-close">✕</button>
        </div>
        <div className="lic-confirm-body">
          <p className="lic-confirm-text">{message}</p>
        </div>
        <div className="lic-modal-footer">
          <button onClick={onClose} className="lic-cap-back-btn" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="lic-primary-btn"
            style={{ background: loading ? '#94a3b8' : confirmColor, cursor: loading ? 'default' : 'pointer' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── TOAST NOTIFICATION ─────────────────────────── */
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  return (
    <div className={`lic-toast ${type}`}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <p className="lic-toast-msg">{message}</p>
      <button onClick={onClose} className="lic-toast-close">✕</button>
    </div>
  );
}

/* ─────────────────────────── LICENSE CARD ─────────────────────────── */

function LicenseCard({ license, onOpen }) {
  const pct = license.total > 0 ? Math.min(100, Math.round((license.assigned / license.total) * 100)) : 0;
  const barColor = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a';
  const available = license.total - license.assigned;

  return (
    <div className="lic-card" onClick={() => onOpen(license)}>
      <div className="lic-card-top">
        <div style={{ minWidth: 0 }}>
          <div className="lic-card-name">{license.displayName}</div>
          <div className="lic-card-sku">{license.skuPartNumber}</div>
        </div>
        {!license.mapped && <span className="lic-badge-unlinked">Unlinked</span>}
      </div>

      <div className="lic-progress-track">
        <div className="lic-progress-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>

      <div className="lic-card-metrics">
        <div>
          <div className="lic-metric-value">{license.total}</div>
          <div className="lic-metric-label">Total</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="lic-metric-value" style={{ color: '#002060' }}>{license.assigned}</div>
          <div className="lic-metric-label">Assigned</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="lic-metric-value" style={{ color: available === 0 ? '#dc2626' : '#16a34a' }}>{available}</div>
          <div className="lic-metric-label">Available</div>
        </div>
      </div>

      <div className="lic-card-footer">
        <span className="lic-card-footer-text">
          👥 {license.assigned} users
          <span style={{ color: '#94a3b8', fontSize: '11px' }}>({pct}% used)</span>
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────── ADD USER SEARCH BOX ─────────────────────────── */

function AddUserBox({ onAddClick, existingUserIds = new Set() }) {
  const { instance, accounts } = useMsal();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

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

  const searchAzureAD = async (text) => {
    if (!text || text.trim().length < 2) {
      setResults([]);
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

      const q = text.trim().replace(/'/g, "''");
      const filter = `startswith(displayName,'${q}') or startswith(mail,'${q}') or startswith(userPrincipalName,'${q}')`;
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=8`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      const data = await res.json();

      const filteredResults = (data.value || [])
        .filter(u => !existingUserIds.has(u.id))
        .map(u => ({
          id: u.id,
          displayName: u.displayName || u.mail || '(no name)',
          mail: u.mail || u.userPrincipalName || '',
          userPrincipalName: u.userPrincipalName || '',
        }));

      setResults(filteredResults);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = (value) => {
    setQuery(value);
    searchAzureAD(value);
  };

  const selectUser = (user) => {
    setShowDropdown(false);
    setQuery('');
    setResults([]);
    onAddClick(user);
  };

  return (
    <div ref={dropdownRef} className="lic-employee-search-wrap">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => query.trim().length >= 2 && results.length > 0 && setShowDropdown(true)}
        placeholder="Search Azure AD by name or email…"
        className="lic-employee-search-input"
      />

      {searching && <div className="lic-employee-hint">Searching directory…</div>}

      {showDropdown && results.length > 0 && (
        <div className="lic-employee-results">
          {results.map((user) => (
            <div
              key={user.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectUser(user)}
              className="lic-employee-row"
            >
              <div className="lic-employee-avatar">{user.displayName.charAt(0).toUpperCase()}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="lic-employee-name">{user.displayName}</div>
                <div className="lic-employee-meta">{user.mail || user.userPrincipalName}</div>
              </div>
              <span className="lic-employee-cta">Add →</span>
            </div>
          ))}
        </div>
      )}

      {showDropdown && !searching && results.length === 0 && query.trim().length >= 2 && (
        <div className="lic-employee-results">
          <div className="lic-employee-empty">No users found for "{query}"</div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── SEND REPORT MODAL ─────────────────────────── */

function SendReportModal({ isOpen, onClose, licenses, onSend, sending }) {
  const { instance, accounts } = useMsal();
  const [recipients, setRecipients] = useState([]);
  const [emailInput, setEmailInput] = useState('');
  const [recipientResults, setRecipientResults] = useState([]);
  const [searchingRecipients, setSearchingRecipients] = useState(false);
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
  const [selectedLicenses, setSelectedLicenses] = useState(new Set());
  const [includeTotal, setIncludeTotal] = useState(true);
  const [includeAssigned, setIncludeAssigned] = useState(true);
  const [includeAvailable, setIncludeAvailable] = useState(true);
  const [licenseSearch, setLicenseSearch] = useState('');
  const inputRef = useRef(null);
  const recipientDropdownRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
  if (isOpen) {
    setSelectedLicenses(new Set());
    setLicenseSearch('');
    setRecipientResults([]);
    setShowRecipientDropdown(false);
    setRecipients([]);        // ← Add this
    setEmailInput('');        // ← Add this
    // Also reset the column checkboxes if you want
    setIncludeTotal(true);
    setIncludeAssigned(true);
    setIncludeAvailable(true);
  }
}, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close the recipient dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (recipientDropdownRef.current && !recipientDropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowRecipientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredLicenses = licenses.filter(license => {
    const search = licenseSearch.toLowerCase().trim();
    if (!search) return true;
    return license.displayName.toLowerCase().includes(search) ||
           license.skuPartNumber.toLowerCase().includes(search);
  });

  const addRecipientEmail = (email) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      alert('Please enter a valid email address');
      return;
    }
    if (recipients.includes(trimmed)) {
      alert('This email is already added');
      return;
    }
    setRecipients([...recipients, trimmed]);
    setEmailInput('');
    setRecipientResults([]);
    setShowRecipientDropdown(false);
  };

  // Same Azure AD lookup pattern as AddAdmin.js — search-as-you-type, pick from a dropdown
  const searchRecipients = async (text) => {
    if (!text || text.trim().length < 2) {
      setRecipientResults([]);
      setShowRecipientDropdown(false);
      setSearchingRecipients(false);
      return;
    }
    setSearchingRecipients(true);
    setShowRecipientDropdown(true);
    try {
      const token = await instance.acquireTokenSilent({
        scopes: ['User.Read.All'],
        account: accounts[0],
      });
      const q = text.trim().replace(/'/g, "''");
      const filter = `startswith(mail,'${q}') or startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')`;
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=8`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      const data = await res.json();
      const mapped = (data.value || [])
        .map(u => ({
          id: u.id,
          displayName: u.displayName || u.mail || '(no name)',
          mail: u.mail || u.userPrincipalName || '',
        }))
        .filter(u => u.mail && !recipients.includes(u.mail));
      setRecipientResults(mapped);
    } catch (err) {
      console.error('Recipient search failed:', err);
      setRecipientResults([]);
    } finally {
      setSearchingRecipients(false);
    }
  };

  const updateEmailInput = (value) => {
    setEmailInput(value);
    searchRecipients(value);
  };

  const selectRecipientUser = (user) => {
    if (!user.mail) return;
    addRecipientEmail(user.mail);
  };

  const handleRemoveRecipient = (email) => {
    setRecipients(recipients.filter(r => r !== email));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // If exactly one directory match is showing, Enter picks it; otherwise treat input as a raw email.
      if (recipientResults.length === 1) {
        selectRecipientUser(recipientResults[0]);
      } else {
        addRecipientEmail(emailInput);
      }
    }
    if (e.key === 'Backspace' && !emailInput && recipients.length > 0) {
      setRecipients(recipients.slice(0, -1));
    }
    if (e.key === 'Escape') {
      setShowRecipientDropdown(false);
    }
  };

  const toggleLicense = (skuId) => {
    const newSet = new Set(selectedLicenses);
    if (newSet.has(skuId)) newSet.delete(skuId);
    else newSet.add(skuId);
    setSelectedLicenses(newSet);
  };

  const toggleSelectAllLicenses = () => {
    if (selectedLicenses.size === licenses.length) {
      setSelectedLicenses(new Set());
    } else {
      setSelectedLicenses(new Set(licenses.map(l => l.skuId)));
    }
  };

  const areAllFilteredSelected = filteredLicenses.every(l => selectedLicenses.has(l.skuId));

  const toggleSelectAllFiltered = () => {
    const newSet = new Set(selectedLicenses);
    if (areAllFilteredSelected) {
      filteredLicenses.forEach(l => newSet.delete(l.skuId));
    } else {
      filteredLicenses.forEach(l => newSet.add(l.skuId));
    }
    setSelectedLicenses(newSet);
  };

  const handleSend = () => {
    if (recipients.length === 0) {
      alert('Please add at least one recipient');
      return;
    }
    if (selectedLicenses.size === 0) {
      alert('Please select at least one license');
      return;
    }
    if (!includeTotal && !includeAssigned && !includeAvailable) {
      alert('Please select at least one column to include');
      return;
    }

    const selectedLicenseData = licenses.filter(l => selectedLicenses.has(l.skuId));

    onSend({
      recipients,
      licenses: selectedLicenseData,
      columns: { total: includeTotal, assigned: includeAssigned, available: includeAvailable },
    });
  };

  if (!isOpen) return null;

  const disabledSend = sending || recipients.length === 0 || selectedLicenses.size === 0;

  return (
    <div className="lic-modal-overlay" onClick={onClose}>
      <div className="lic-modal lic-report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lic-modal-header">
          <h3 className="lic-modal-title">📊 Send License Report</h3>
          <button onClick={onClose} className="lic-modal-close">✕</button>
        </div>

        <div className="lic-report-body">
          {/* Recipients */}
          <div className="lic-report-section">
            <label className="lic-report-label">
              Send To <span className="lic-report-required">*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <div className="lic-chip-box">
                <div className="lic-chip-list">
                  {recipients.map((email) => (
                    <span key={email} className="lic-chip">
                      {email}
                      <button onClick={() => handleRemoveRecipient(email)} className="lic-chip-remove">✕</button>
                    </span>
                  ))}
                  <input
                    ref={inputRef}
                    type="text"
                    value={emailInput}
                    onChange={(e) => updateEmailInput(e.target.value)}
                    onFocus={() => emailInput.trim().length >= 2 && setShowRecipientDropdown(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={recipients.length === 0 ? "Search by name or email..." : "Add another..."}
                    className="lic-chip-input"
                    autoComplete="off"
                  />
                </div>
              </div>

              {showRecipientDropdown && (
                <div ref={recipientDropdownRef} className="lic-employee-results">
                  {searchingRecipients && <div className="lic-employee-empty">Searching directory…</div>}

                  {!searchingRecipients && recipientResults.map((user) => (
                    <div
                      key={user.id}
                      className="lic-employee-row"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectRecipientUser(user)}
                    >
                      <div className="lic-employee-avatar">{user.displayName.charAt(0).toUpperCase()}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="lic-employee-name">{user.displayName}</div>
                        <div className="lic-employee-meta">{user.mail}</div>
                      </div>
                      <span className="lic-employee-cta">Add →</span>
                    </div>
                  ))}

                  {!searchingRecipients && emailInput.trim().length >= 2 && recipientResults.length === 0 && (
                    <div className="lic-employee-empty">
                      No directory match for "{emailInput.trim()}" — press Enter to add it as a plain email.
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="lic-report-helper">Type a name or email to search the directory, or press Enter to add any address</div>
          </div>

          {/* Licenses */}
          <div className="lic-report-section">
            <label className="lic-report-label">Select Licenses</label>

            <input
              ref={searchRef}
              type="text"
              value={licenseSearch}
              onChange={(e) => setLicenseSearch(e.target.value)}
              placeholder="🔍 Search licenses by name..."
              className="lic-report-search"
            />

            <div className="lic-checkbox-group">
              <label className="lic-checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedLicenses.size === licenses.length && licenses.length > 0}
                  onChange={toggleSelectAllLicenses}
                  className="lic-checkbox"
                />
                Select All ({licenses.length})
              </label>
              {licenseSearch && (
                <label className="lic-checkbox-label" style={{ color: '#002060' }}>
                  <input
                    type="checkbox"
                    checked={areAllFilteredSelected && filteredLicenses.length > 0}
                    onChange={toggleSelectAllFiltered}
                    className="lic-checkbox"
                  />
                  Select All Filtered ({filteredLicenses.length} shown)
                </label>
              )}
            </div>

            <div className="lic-license-grid-select">
              {filteredLicenses.length === 0 ? (
                <div className="lic-no-results">
                  {licenseSearch ? 'No licenses match your search' : 'No licenses available'}
                </div>
              ) : (
                filteredLicenses.map((license) => (
                  <label key={license.skuId} className="lic-checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedLicenses.has(license.skuId)}
                      onChange={() => toggleLicense(license.skuId)}
                      className="lic-checkbox"
                    />
                    <span style={{ fontWeight: 500 }}>{license.displayName}</span>
                  </label>
                ))
              )}
            </div>
            <div className="lic-report-helper">
              {selectedLicenses.size} of {licenses.length} licenses selected
              {licenseSearch && ` (showing ${filteredLicenses.length})`}
            </div>
          </div>

          {/* Columns */}
          <div className="lic-report-section">
            <label className="lic-report-label">Include Columns</label>
            <div className="lic-column-group">
              <label className="lic-checkbox-label">
                <input type="checkbox" checked={includeTotal} onChange={() => setIncludeTotal(!includeTotal)} className="lic-checkbox" />
                Total
              </label>
              <label className="lic-checkbox-label">
                <input type="checkbox" checked={includeAssigned} onChange={() => setIncludeAssigned(!includeAssigned)} className="lic-checkbox" />
                Assigned
              </label>
              <label className="lic-checkbox-label">
                <input type="checkbox" checked={includeAvailable} onChange={() => setIncludeAvailable(!includeAvailable)} className="lic-checkbox" />
                Available
              </label>
            </div>
          </div>
        </div>

        <div className="lic-modal-footer">
          <button onClick={onClose} className="lic-cap-back-btn">Cancel</button>
          <button
            onClick={handleSend}
            disabled={disabledSend}
            className="lic-primary-btn"
            style={{ background: '#002060', opacity: disabledSend ? 0.6 : 1, cursor: disabledSend ? 'default' : 'pointer' }}
          >
            {sending ? '⏳ Sending...' : `📧 Send to ${recipients.length} Recipient${recipients.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── LICENSE DETAIL PANEL ─────────────────────────── */

function LicenseDetailPanel({ license, adminEmail, onClose, onLicensesChanged }) {
  const [users, setUsers] = useState([]);
  const [groupName, setGroupName] = useState(license.groupName);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(null);
  const [showAddConfirm, setShowAddConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/api/licenses/${encodeURIComponent(license.skuId)}/users`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to load assigned users');
        setUsers([]);
        return;
      }
      setUsers(data.users || []);
      setGroupName(data.groupName);
    } catch (err) {
      console.error('Failed to load license users:', err);
      setError('Failed to load assigned users');
    } finally {
      setLoading(false);
    }
  }, [license.skuId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleAdd = async (user) => {
    setAddingId(user.id);
    setShowAddConfirm(null);
    try {
      const res = await fetch(`${BACKEND}/api/licenses/${encodeURIComponent(license.skuId)}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, adminEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ message: data.message || 'Failed to assign license', type: 'error' });
        return;
      }
      setToast({ message: `✅ ${user.displayName} was added to ${license.displayName}`, type: 'success' });
      await loadUsers();
      onLicensesChanged && onLicensesChanged();
    } catch (err) {
      console.error('Assign failed:', err);
      setToast({ message: 'Failed to assign license', type: 'error' });
    } finally {
      setAddingId(null);
    }
  };

  const handleRemove = async (user) => {
    setRemovingId(user.id);
    setShowRemoveConfirm(null);
    try {
      const res = await fetch(
        `${BACKEND}/api/licenses/${encodeURIComponent(license.skuId)}/users/${encodeURIComponent(user.id)}?adminEmail=${encodeURIComponent(adminEmail || '')}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) {
        setToast({ message: data.message || 'Failed to remove license', type: 'error' });
        return;
      }
      setToast({ message: `✅ ${user.displayName} was removed from ${license.displayName}`, type: 'success' });
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      onLicensesChanged && onLicensesChanged();
    } catch (err) {
      console.error('Remove failed:', err);
      setToast({ message: 'Failed to remove license', type: 'error' });
    } finally {
      setRemovingId(null);
    }
  };

  const existingUserIds = new Set(users.map((u) => u.id));

  return (
    <>
      <div className="lic-panel-overlay" onClick={onClose}>
        <div className="lic-panel" onClick={(e) => e.stopPropagation()}>
          <div className="lic-panel-header">
            <div>
              <div className="lic-panel-title">{license.displayName}</div>
              <div className="lic-panel-sku">{license.skuPartNumber}</div>
              {groupName && <div className="lic-panel-link">🔗 Linked to: <strong>{groupName}</strong></div>}
              <div className="lic-panel-sub">
                {license.assigned} of {license.total} assigned · {license.total - license.assigned} available
              </div>
            </div>
            <button onClick={onClose} className="lic-panel-close">✕</button>
          </div>

          <div className="lic-panel-body">
            {!license.mapped ? (
              <div className="lic-warning-box">
                ⚠️ This license isn't linked to a security group yet, so users can't be
                managed here. Set up the mapping from Settings → License Mappings first.
              </div>
            ) : (
              <>
                <AddUserBox onAddClick={(user) => setShowAddConfirm(user)} existingUserIds={existingUserIds} />

                {loading && (
                  <div className="lic-state">
                    <div className="lic-spinner small" />
                    Loading assigned users...
                  </div>
                )}
                {error && <div className="lic-error-banner">{error}</div>}

                {!loading && !error && users.length === 0 && (
                  <div className="lic-state">
                    <div className="lic-state-icon" style={{ fontSize: '40px' }}>👤</div>
                    <div style={{ fontSize: '14px' }}>No one is assigned this license yet.</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>Search above to add users.</div>
                  </div>
                )}

                {!loading && !error && users.map((u) => (
                  <div key={u.id} className="lic-user-row">
                    <div className="lic-user-avatar">{initialsOf(u.displayName, u.mail)}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="lic-user-name">{u.displayName}</div>
                      <div className="lic-user-mail">{u.mail}</div>
                    </div>
                    <button
                      onClick={() => setShowRemoveConfirm(u)}
                      disabled={removingId === u.id}
                      className="lic-row-action-btn"
                    >
                      {removingId === u.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={!!showAddConfirm}
        onClose={() => setShowAddConfirm(null)}
        onConfirm={() => handleAdd(showAddConfirm)}
        title="Assign License"
        message={`Assign "${license.displayName}" license to "${showAddConfirm?.displayName}" (${showAddConfirm?.mail})?`}
        confirmText="Assign"
        confirmColor="#002060"
        loading={addingId === showAddConfirm?.id}
      />

      <ConfirmationModal
        isOpen={!!showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(null)}
        onConfirm={() => handleRemove(showRemoveConfirm)}
        title="Remove License"
        message={`Remove "${license.displayName}" license from "${showRemoveConfirm?.displayName}" (${showRemoveConfirm?.mail})?`}
        confirmText="Remove"
        confirmColor="#dc2626"
        loading={removingId === showRemoveConfirm?.id}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

/* ─────────────────────────── MAIN PAGE ─────────────────────────── */

export default function LicenseRegistry() {
  const { accounts } = useMsal();
  const adminEmail = accounts?.[0]?.username;

  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showReportModal, setShowReportModal] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [toast, setToast] = useState(null);

  const loadLicenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/api/licenses`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to load licenses');
        setLicenses([]);
        return;
      }
      setLicenses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load licenses:', err);
      setError('Failed to load licenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLicenses(); }, [loadLicenses]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSendReport = async (reportData) => {
    setSendingReport(true);
    try {
      const res = await fetch(`${BACKEND}/api/license-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: reportData.recipients,
          licenses: reportData.licenses.map(l => ({
            skuId: l.skuId,
            skuPartNumber: l.skuPartNumber,
            displayName: l.displayName,
            total: l.total,
            assigned: l.assigned,
            available: l.available,
          })),
          columns: reportData.columns,
          sentBy: adminEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || 'Failed to send report', 'error');
        return;
      }

      showToast(`✅ Report sent to ${reportData.recipients.length} recipient(s)`, 'success');
      setShowReportModal(false);
    } catch (err) {
      console.error('Error sending report:', err);
      showToast('Failed to send report', 'error');
    } finally {
      setSendingReport(false);
    }
  };

  const stats = {
    totalSkus: licenses.length,
    totalSeats: licenses.reduce((sum, l) => sum + (l.total || 0), 0),
    totalAssigned: licenses.reduce((sum, l) => sum + (l.assigned || 0), 0),
    unlinked: licenses.filter(l => !l.mapped).length,
  };
  const totalAvailable = stats.totalSeats - stats.totalAssigned;

  const bySearch = licenses.filter((l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (l.displayName || '').toLowerCase().includes(q) ||
           (l.skuPartNumber || '').toLowerCase().includes(q);
  });

  const filtered = bySearch.filter((l) => {
    const available = l.total - l.assigned;
    if (filterStatus === 'unlinked') return !l.mapped;
    if (filterStatus === 'linked') return !!l.mapped;
    if (filterStatus === 'full') return available <= 0;
    if (filterStatus === 'available') return available > 0;
    return true;
  });

  const selectedLive = selected ? licenses.find((l) => l.skuId === selected.skuId) || selected : null;

  return (
    <div className="license-registry">
      <StyleSheet />

      {/* Header */}
      <div className="lic-header">
        <div className="lic-header-left">
          <h1>📋 License Registry</h1>
          <p>Licenses are assigned via security groups — open a license to see who's using it, and add or remove people.</p>
        </div>
        <div className="lic-header-actions">
          <button className="lic-add-btn" onClick={() => setShowReportModal(true)}>
            📊 Send Report
          </button>
          <button className="lic-add-btn secondary" onClick={loadLicenses}>
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="lic-filters-bar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Filter licenses by name or SKU..."
        />
        <div className="lic-filter-tags">
          <button className={`lic-filter-tag ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>All</button>
          <button className={`lic-filter-tag ${filterStatus === 'linked' ? 'active' : ''}`} onClick={() => setFilterStatus('linked')}>Linked</button>
          <button className={`lic-filter-tag ${filterStatus === 'unlinked' ? 'active' : ''}`} onClick={() => setFilterStatus('unlinked')}>Unlinked</button>
          <button className={`lic-filter-tag ${filterStatus === 'available' ? 'active' : ''}`} onClick={() => setFilterStatus('available')}>Available</button>
          <button className={`lic-filter-tag ${filterStatus === 'full' ? 'active' : ''}`} onClick={() => setFilterStatus('full')}>Full</button>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="lic-state">
          <div className="lic-spinner" />
          <div style={{ fontSize: '14px' }}>Loading licenses...</div>
        </div>
      )}

      {!loading && error && (
        <div className="lic-error-banner">
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <span>{error}</span>
          <button onClick={loadLicenses} className="lic-error-retry">Retry</button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="lic-state">
          <div className="lic-state-icon">🔍</div>
          <div style={{ fontSize: '14px' }}>
            {licenses.length === 0 ? 'No licenses found in this tenant.' : 'No licenses match your filters.'}
          </div>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="lic-grid">
            {filtered.map((l) => (
              <LicenseCard key={l.skuId} license={l} onOpen={setSelected} />
            ))}
          </div>
          <div className="lic-footer-count">
            Showing {filtered.length} of {licenses.length} licenses
          </div>
        </>
      )}

      {selectedLive && (
        <LicenseDetailPanel
          license={selectedLive}
          adminEmail={adminEmail}
          onClose={() => setSelected(null)}
          onLicensesChanged={loadLicenses}
        />
      )}

      <SendReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        licenses={licenses}
        onSend={handleSendReport}
        sending={sendingReport}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}