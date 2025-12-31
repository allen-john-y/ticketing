import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

// CATEGORY HEAD EMAIL MAP (mirrors backend deptEmails)
// Note: values can be a string or an array of strings.
const deptEmails = {
  "Password Reset": ["vigneshm@sandeza-inc.com", "allenj@sandeza-inc.com"],
  "Admin Access": "vigneshm@sandeza-inc.com",
  "Payroll Issue": "kishorekumars@sandeza-inc.com",
  "Expense Reimbursement": "kishorekumars@sandeza-inc.com",
  "Leave Request": "allenj@sandeza-inc.com",
  "Employee Onboarding": "allenj@sandeza-inc.com",
};

function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts, instance } = useMsal();
  const [ticket, setTicket] = useState(null);
  const [authority, setAuthority] = useState('basic');
  const [loading, setLoading] = useState(false);

  // Close states
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeError, setCloseError] = useState('');

  // reopen states
  const [showreopenReasonInput, setShowreopenReasonInput] = useState(false);
  const [reopenReason, setreopenReason] = useState('');
  const [reopenError, setreopenError] = useState('');

  const [confirmModal, setConfirmModal] = useState(false);
  const [confirmreopenModal, setConfirmreopenModal] = useState(false);

  const backendBase = "https://ticketing-hn59.onrender.com";

  // NEW: Category head / approval states
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isCategoryHead, setIsCategoryHead] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [returnedPassword, setReturnedPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  // fetch authority (admin group)
  useEffect(() => {
    const fetchAuthority = async () => {
      if (!accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });
        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('Helpdesk_Admin');
        setAuthority(isAdmin ? 'admin' : 'basic');
      } catch (err) {
        console.error('Authority error:', err);
      }
    };
    fetchAuthority();
  }, [accounts, instance]);

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await axios.get(`${backendBase}/tickets/${id}`);
        setTicket(res.data);

        // CATEGORY HEAD CHECK - robust: support string or array and multiple MSAL email fields
        if (accounts[0] && res.data) {
          // Extract logged user email from common MSAL fields
          const acct = accounts[0] || {};
          const possibleEmails = [
            acct.username,
            acct.upn,
            acct.preferred_username,
            acct.email,
            acct.name,
            acct.homeAccountId
          ].filter(Boolean);

          // Normalize logged email (take the first reasonable-looking email)
          const loggedEmail = (possibleEmails.find(e => typeof e === 'string') || '')
            .toLowerCase()
            .trim();

          // Get head entry from mapping and normalize into an array
          const headEntry = deptEmails[res.data.category];
          const headList = Array.isArray(headEntry) ? headEntry : (headEntry ? [headEntry] : []);
          const normalizedHeadList = headList.map(h => (h || '').toLowerCase().trim()).filter(Boolean);

          // Debugging helpful info (remove in production if you want)
          console.debug('Logged email:', loggedEmail, 'Category heads:', normalizedHeadList, 'Ticket status:', res.data.status);

          if (loggedEmail && normalizedHeadList.includes(loggedEmail)) {
            setIsCategoryHead(true);

            const status = (res.data.status || '').toString();
            if (res.data.category === "Password Reset" && (status === "Waiting for approval" || status === "Open")) {
              setShowApprovalModal(true);
            }
          } else {
            setIsCategoryHead(false);
            setShowApprovalModal(false);
          }
        }

      } catch (err) {
        console.error('Error fetching ticket:', err);
      }
    };
    fetchTicket();
  }, [id, accounts, instance]);

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Derived: show inline "Waiting for Approval" banner
  const needsApprovalBanner = isCategoryHead && ticket && (ticket.status === 'Waiting for approval' || ticket.status === 'Open') && !showApprovalModal && ticket.category === "Password Reset";

  const copyToClipboard = (text) => {
    try {
      navigator.clipboard.writeText(text);
      alert('Password copied to clipboard');
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const handleApprove = async () => {
    setApproveLoading(true);
    try {
      if (!ticket || ticket.category !== "Password Reset") {
        alert("Approve is only for Password Reset tickets.");
        setShowApprovalModal(false);
        setApproveLoading(false);
        return;
      }

      const res = await axios.post(`${backendBase}/tickets/${id}/approve`, {
        approvedBy: accounts[0]?.name || accounts[0]?.username,
        note: adminNote
      });

      setShowApprovalModal(false);

      if (res.data?.newPassword) {
        setReturnedPassword(res.data.newPassword);
        setShowPasswordPopup(true);
      } else {
        setTimeout(() => {
          navigate("/", { state: { refresh: true } });
        }, 200);
      }

    } catch (err) {
      console.error("Approve error:", err);
      alert("Approval failed: " + (err?.response?.data?.message || err.message || 'Unknown error'));
    } finally {
      setApproveLoading(false);
      setAdminNote('');
    }
  };

  const handleReject = async () => {
    setRejectLoading(true);
    try {
      if (!ticket) throw new Error('Ticket missing');

      await axios.post(`${backendBase}/tickets/${id}/reject`, {
        rejectedBy: accounts[0]?.name || accounts[0]?.username,
        reason: adminNote
      });

      setShowApprovalModal(false);
      setAdminNote('');

      setTimeout(() => {
        navigate("/", { state: { refresh: true } });
      }, 200);

    } catch (err) {
      console.error("Reject error:", err);
      alert("Rejection failed: " + (err?.response?.data?.message || err.message || 'Unknown error'));
    } finally {
      setRejectLoading(false);
    }
  };

  const handleSubmitReason = () => {
    if (!closeReason.trim()) {
      setCloseError("Please provide a reason for closing this ticket.");
      return;
    }
    setCloseError('');
    setShowReasonInput(false);
    setConfirmModal(true);
  };

  const confirmCloseTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/close`, {
        closeReason: closeReason.trim(),
        closedBy: accounts[0]?.name || accounts[0]?.username
      });

      setConfirmModal(false);
      setShowReasonInput(false);
      setCloseReason('');
      setCloseError('');

      setTimeout(() => {
        navigate('/', { state: { refresh: true } });
      }, 200);

    } catch (err) {
      setCloseError("Failed to close ticket. Please try again.");
      console.error("Close error:", err);
    } finally {
      setLoading(false);
    }
  };

  const cancelClose = () => {
    setShowReasonInput(false);
    setConfirmModal(false);
    setCloseReason('');
    setCloseError('');
  };

  const handleSubmitreopenReason = () => {
    if (!reopenReason.trim()) {
      setreopenError("Please provide a reason for reviving this ticket.");
      return;
    }
    setreopenError('');
    setShowreopenReasonInput(false);
    setConfirmreopenModal(true);
  };

  // call correct backend endpoint (/revive) and send expected field names (revivedBy, reviveReason)
  const confirmreopenTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/revive`, {
        revivedBy: accounts[0]?.name || accounts[0]?.username || "User",
        reviveReason: reopenReason.trim()
      });

      setConfirmreopenModal(false);
      setShowreopenReasonInput(false);
      setreopenReason('');
      setreopenError('');

      setTimeout(() => {
        navigate('/', { state: { refresh: true } });
      }, 200);

    } catch (err) {
      setreopenError("Failed to reopen ticket. Please try again.");
      console.error("reopen error:", err);
    } finally {
      setLoading(false);
    }
  };

  const cancelreopen = () => {
    setShowreopenReasonInput(false);
    setConfirmreopenModal(false);
    setreopenReason('');
    setreopenError('');
  };

  if (!ticket) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading ticket...</p>;

  const statusColorStyles = {
    background:
      ticket.status === "Closed" ? "#fee2e2" :
      ticket.status === "Approved" ? "#dcfce7" :
      ticket.status === "Waiting for approval" ? "#fef3c7" :
      "#e0f2fe",
    color:
      ticket.status === "Closed" ? "#b91c1c" :
      ticket.status === "Approved" ? "#166534" :
      ticket.status === "Waiting for approval" ? "#92400e" :
      "#0369a1"
  };

  const historyEvents = ticket.history && ticket.history.length > 0
    ? ticket.history
    : [
        { action: "created", by: ticket.userName, at: ticket.createdAt, reason: null },
        ...(ticket.closedAt ? [{ action: "closed", by: ticket.closedBy || "Unknown", at: ticket.closedAt, reason: ticket.closeReason }] : []),
        ...(ticket.reopenedAt ? [{ action: "reopend", by: ticket.reopenedBy || "Unknown", at: ticket.reopenedAt, reason: ticket.reopenReason }] : [])
      ];

  const loggedEmail = (accounts[0]?.username || accounts[0]?.upn || '').toLowerCase().trim();
  const isCreator = ticket.userEmail && (loggedEmail === ticket.userEmail.toLowerCase().trim());

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); } to { transform: scale(1); } }
        .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.65); display: flex; justify-content: center; align-items: center; z-index: 9999; animation: fadeIn 0.3s; }
        .modal-box { background: white; padding: 30px; border-radius: 16px; width: 90%; max-width: 760px; text-align: center; box-shadow: 0 15px 50px rgba(0,0,0,0.25); animation: zoomIn 0.3s; }
        .reason-input { width: 80%; padding: 12px; margin: 12px 0; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 15px; }
        .error-text { color: #dc2626; font-size: 14px; margin-top: 8px; font-weight: 500; }
      `}</style>

      {/* BACK BUTTON */}
      <div style={{ padding: "1rem", maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => navigate('/')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
          borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
          fontWeight: 600, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', fontSize: '15px'
        }}>Back to Tickets</button>
      </div>

      {/* MAIN CARD */}
      <div style={{
        padding: '2.5rem',
        maxWidth: '720px',
        margin: '0 auto',
        background: '#ffffff',
        borderRadius: '16px',
        borderLeft: `8px solid ${ticket.status === "Closed" ? "#dc2626" : "#16a34a"}`,
        boxShadow: '0 12px 40px rgba(2,6,23,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        position: 'relative'
      }}>

        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: 1 }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: 'linear-gradient(135deg,#4f46e5 0%, #06b6d4 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '20px',
              boxShadow: '0 8px 30px rgba(79,70,229,0.12)'
            }}>
              {ticket.userName ? ticket.userName.split(' ').map(n => n[0]).slice(0,2).join('') : 'U'}
            </div>

            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: '1.65rem', color: '#0f172a', fontWeight: 800 }}>
                {ticket.category}
              </h1>

              <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: 'linear-gradient(90deg, #eef2ff 0%, #f0f9ff 100%)',
                  color: '#3730a3',
                  fontWeight: 800,
                  fontSize: 13,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  boxShadow: '0 6px 18px rgba(99,102,241,0.08)'
                }}>
                  <span style={{ fontSize: 12, color: '#4b5563', fontWeight: 700 }}>Ticket #</span>
                  <span style={{ fontSize: 20, marginTop: 4, letterSpacing: '0.6px' }}>{ticket.ticketNumber}</span>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: ticket.priority === 'High' ? '#fff1f2' : ticket.priority === 'Medium' ? '#fff7ed' : '#f0fdf4',
                    color: ticket.priority === 'High' ? '#991b1b' : ticket.priority === 'Medium' ? '#b45309' : '#166534',
                    fontWeight: 700,
                    fontSize: 13,
                    boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.02)'
                  }}>{ticket.priority}</span>

                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 13,
                    ...statusColorStyles
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ticket.status === 'Closed' ? '#dc2626' : (ticket.status === 'Approved' ? '#16a34a' : (ticket.status === 'Waiting for approval' ? '#f59e0b' : '#06b6d4')) }} />
                    {ticket.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#64748b', fontSize: 13 }}>Created by</div>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>{ticket.userName}</div>
              <a href={`mailto:${ticket.userEmail}`} style={{ color: '#2563eb', fontSize: 13, textDecoration: 'none' }}>{ticket.userEmail}</a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 8 }}>
              {authority === 'admin' && ticket.status !== 'Closed' && (
                <button onClick={() => setShowReasonInput(true)} style={{
                  width: '100%', background: '#dc2626', color: 'white', padding: '12px 14px',
                  border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, fontSize: '15px',
                  boxShadow: '0 8px 24px rgba(220,38,38,0.18)'
                }}>Close Ticket</button>
              )}

              {ticket.status === 'Closed' && (
                <button onClick={() => setShowreopenReasonInput(true)} style={{
                  width: '100%', background: '#16a34a', color: 'white', padding: '12px 14px',
                  border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, fontSize: '15px',
                  boxShadow: '0 8px 24px rgba(16,185,129,0.12)'
                }}>reopen Ticket</button>
              )}
            </div>
          </div>
        </div>

        {/* Waiting for approval banner */}
        {needsApprovalBanner && (
          <div style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            padding: "15px",
            borderRadius: 12,
            marginBottom: 20,
            textAlign: "center",
            boxShadow: "0 3px 10px rgba(0,0,0,0.06)"
          }}>
            <h3 style={{ margin: 0, color: "#92400e", fontWeight: 800 }}>
              Waiting for Your Approval
            </h3>
            <p style={{ color: "#92400e", marginTop: 6 }}>
              This ticket requires action from <strong>Category Head ({ticket.category})</strong>.
            </p>

            <button
              onClick={() => setShowApprovalModal(true)}
              style={{
                marginTop: 10,
                background: "#d97706",
                color: "white",
                borderRadius: 10,
                padding: "10px 22px",
                border: "none",
                cursor: "pointer",
                fontWeight: 700
              }}
            >
              Review & Take Action
            </button>
          </div>
        )}

        {/* Description block */}
        <div style={{
          marginTop: 4,
          background: '#f8fafc',
          padding: 20,
          borderRadius: 14,
          display: 'block',
          border: '1px solid #edf2f7',
          color: '#334155',
          lineHeight: 1.7,
          fontSize: 15
        }}>
          <strong style={{ display: 'block', marginBottom: 8, fontSize: 15 }}>Description</strong>
          <div style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
        </div>
      </div>

      {/* FULL HISTORY TIMELINE - UPDATED TO SHOW "ON BEHALF OF" */}
      <div style={{ maxWidth: '720px', margin: '3rem auto', padding: '0 1rem' }}>
        <h2 style={{ fontSize: '1.9rem', color: '#1e293b', marginBottom: '2.5rem', textAlign: 'center', fontWeight: 700 }}>
          Ticket History
        </h2>
        <div>
          {historyEvents.map((event, index) => {
            const isCreatedEvent = event.action === 'created';
            const createdByDifferentPerson = isCreatedEvent && event.by !== ticket.userName;
            const showOnBehalf = isCreatedEvent && (ticket.onBehalf || createdByDifferentPerson);

            return (
              <div
                key={index}
                style={{
                  marginBottom: 20,
                  padding: 20,
                  background:
                    event.action === 'closed'
                      ? '#fff1f2'
                      : event.action === 'created'
                      ? '#fefce8'
                      : '#f1f5f9',
                  borderRadius: 12,
                  borderLeft: event.action === 'created' ? '4px solid #facc15' : 'none'
                }}
              >
                <strong style={{ display: 'block', marginBottom: 8, textTransform: 'capitalize', fontSize: '1.1rem' }}>
                  {event.action === 'created' ? 'Ticket Created' :
                   event.action === 'closed' ? 'Ticket Closed' :
                   event.action === 'reopend' ? 'Ticket reopend' : event.action}
                </strong>

                <small style={{ color: '#475569', fontWeight: 600, display: 'block', marginBottom: 10 }}>
                  {formatDate(event.at)} by <strong>{event.by || "Unknown"}</strong>
                  {showOnBehalf && (
                    <>
                      {' '}on behalf of{' '}
                      <strong style={{ color: '#dc2626' }}>
                        {ticket.onBehalf || ticket.userName}
                        {ticket.onBehalfEmail ? ` (${ticket.onBehalfEmail})` : ''}
                      </strong>
                    </>
                  )}
                </small>

                {event.reason && (
                  <div style={{ marginTop: 12, padding: 12, background: '#e2e8f0', borderRadius: 8 }}>
                    <strong>Reason:</strong> {event.reason}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ marginTop: 12, padding: 20, background: ticket.status === "Closed" ? '#fee2e2' : '#f0fdf4', borderRadius: 12 }}>
            <strong style={{ fontSize: '1.2rem', color: ticket.status === "Closed" ? '#b91c1c' : '#166534' }}>
              Current Status: {ticket.status}
            </strong>
          </div>
        </div>
      </div>

      {/* ALL MODALS BELOW ARE UNCHANGED */}
      {showApprovalModal && isCategoryHead && ticket.category === "Password Reset" && (
        <div className="overlay">
          <div className="modal-box" style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: 10, fontWeight: 800 }}>Approval Required</h2>
            <p style={{ color: "#475569", marginBottom: 20 }}>
              You are the <strong>Category Head</strong> for <strong>{ticket.category}</strong>.<br />
              Review the ticket details below before taking action.
            </p>

            <div style={{
              background: "#f8fafc",
              padding: 18,
              borderRadius: 12,
              textAlign: "left",
              marginBottom: 16,
              border: "1px solid #e2e8f0"
            }}>
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 700 }}>Ticket Summary</h3>
              <p style={{ margin: '6px 0' }}><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
              <p style={{ margin: '6px 0' }}><strong>Created By:</strong> {ticket.userName} ({ticket.userEmail})</p>
              <p style={{ margin: '6px 0' }}><strong>Category:</strong> {ticket.category}</p>
              <p style={{ margin: '6px 0' }}><strong>Priority:</strong> {ticket.priority}</p>
              <p style={{ margin: '6px 0' }}><strong>On Behalf:</strong> {ticket.onBehalf || "Self"}</p>
              {ticket.onBehalfEmail && <p style={{ margin: '6px 0' }}><strong>On Behalf Email:</strong> {ticket.onBehalfEmail}</p>}
              {ticket.deliveryEmail && <p style={{ margin: '6px 0' }}><strong>Delivery Email:</strong> {ticket.deliveryEmail}</p>}
              <p style={{ margin: '6px 0' }}><strong>Created On:</strong> {formatDate(ticket.createdAt)}</p>

              <div style={{ marginTop: 12 }}>
                <strong>Description:</strong>
                <div style={{
                  background: "#e2e8f0",
                  padding: 10,
                  borderRadius: 8,
                  marginTop: 6,
                  whiteSpace: "pre-wrap"
                }}>
                  {ticket.description}
                </div>
              </div>
            </div>

            <textarea
              className="reason-input"
              placeholder="Optional note to requester..."
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={4}
              style={{ width: "100%", marginBottom: 10 }}
            />

            <div style={{ display: "flex", gap: 12, marginTop: 10, justifyContent: "center" }}>
              <button onClick={handleApprove} disabled={approveLoading} style={{
                padding: "12px 22px", background: "#16a34a", color: "white", borderRadius: 12, fontWeight: 700, cursor: "pointer", minWidth: 120
              }}>
                {approveLoading ? "Approving..." : "Approve"}
              </button>
              <button onClick={handleReject} disabled={rejectLoading} style={{
                padding: "12px 22px", background: "#dc2626", color: "white", borderRadius: 12, fontWeight: 700, cursor: "pointer", minWidth: 120
              }}>
                {rejectLoading ? "Rejecting..." : "Reject"}
              </button>
              <button onClick={() => { setShowApprovalModal(false); setAdminNote(''); }} style={{
                padding: "12px 22px", background: "#64748b", color: "white", borderRadius: 12, fontWeight: 700, cursor: "pointer"
              }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {showPasswordPopup && (
        <div className="overlay">
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <h2>Password Reset Successful</h2>
            <p>The new temporary password generated for the target account is shown below. Please copy it and share as needed.</p>
            <div style={{
              padding: "12px",
              background: "#f1f5f9",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 18,
              marginTop: 10
            }}>
              {returnedPassword}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 18 }}>
              <button onClick={() => copyToClipboard(returnedPassword)} style={{ padding: "10px 18px", background: "#2563eb", color: 'white', borderRadius: 10 }}>
                Copy
              </button>
              <button onClick={() => { setShowPasswordPopup(false); navigate('/', { state: { refresh: true } }); }} style={{ padding: "10px 18px", background: "#10b981", color: 'white', borderRadius: 10 }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showReasonInput && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>
              Close Ticket #{ticket.ticketNumber}
            </h3>
            <p style={{ color: '#475569', marginBottom: 20 }}>Please provide a reason for closing this ticket.</p>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Explain why this ticket is being closed..."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              autoFocus
            />
            {closeError && <div className="error-text">{closeError}</div>}
            <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={handleSubmitReason} style={{ padding: '14px 28px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
                Continue to Close
              </button>
              <button onClick={cancelClose} style={{ padding: '14px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#dc2626', fontSize: '1.6rem', fontWeight: 700 }}>Permanently Close Ticket?</h3>
            <p style={{ color: '#475569', marginBottom: 30, fontSize: '15px' }}>Are you sure?</p>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button onClick={confirmCloseTicket} disabled={loading} style={{ padding: '16px 36px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
                {loading ? 'Closing...' : 'Yes, Close It'}
              </button>
              <button onClick={cancelClose} style={{ padding: '16px 36px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showreopenReasonInput && (
        <div className="overlay" onClick={cancelreopen}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>
              reopen Ticket #{ticket.ticketNumber}
            </h3>
            <p style={{ color: '#475569', marginBottom: 20 }}>Please explain why this ticket needs to be reopened.</p>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Why is this ticket being reopend?"
              value={reopenReason}
              onChange={(e) => setreopenReason(e.target.value)}
              autoFocus
            />
            {reopenError && <div className="error-text">{reopenError}</div>}
            <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={handleSubmitreopenReason} style={{ padding: '14px 28px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
                Continue to reopen
              </button>
              <button onClick={cancelreopen} style={{ padding: '14px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmreopenModal && (
        <div className="overlay" onClick={cancelreopen}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#16a34a', fontSize: '1.6rem', fontWeight: 700 }}>reopen This Ticket?</h3>
            <p style={{ color: '#475569', marginBottom: 30, fontSize: '15px' }}>The ticket will be reopened and require attention.</p>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button onClick={confirmreopenTicket} disabled={loading} style={{ padding: '16px 36px', background: '#16a34a', color: 'white', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
                {loading ? 'Reviving...' : 'Yes, reopen It'}
              </button>
              <button onClick={cancelreopen} style={{ padding: '16px 36px', background: '#64748b', color: 'white', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;