import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

// ⭐ CATEGORY HEAD EMAIL MAP (same as backend deptEmails)
const deptEmails = {
  "Password Reset": "allenj@sandeza-inc.com",
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

  // Revive states
  const [showReviveReasonInput, setShowReviveReasonInput] = useState(false);
  const [reviveReason, setReviveReason] = useState('');
  const [reviveError, setReviveError] = useState('');

  const [confirmModal, setConfirmModal] = useState(false);
  const [confirmReviveModal, setConfirmReviveModal] = useState(false);

  // ⭐ NEW STATES FOR CATEGORY HEAD APPROVAL
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isCategoryHead, setIsCategoryHead] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [returnedPassword, setReturnedPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  const backendBase = "https://ticketing-production-5334.up.railway.app";

  // Detect logged-in user's email + admin group
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
        const isAdmin = groups.includes('GS_Fortingate_VPN');
        setAuthority(isAdmin ? 'admin' : 'basic');
      } catch (err) {
        console.error(err);
      }
    };
    fetchAuthority();
  }, [accounts, instance]);

  // Fetch ticket + CHECK CATEGORY HEAD
  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await axios.get(`${backendBase}/tickets/${id}`);
        setTicket(res.data);

        // ⭐ CATEGORY HEAD CHECK ⭐
        if (accounts[0]) {
          const loggedEmail = accounts[0].username.toLowerCase().trim();
          const headEmail = deptEmails[res.data.category]?.toLowerCase().trim();

          if (loggedEmail === headEmail) {
            setIsCategoryHead(true);

            // Show modal ONLY if ticket still needs approval
            if (res.data.status !== "Closed" &&
                res.data.status !== "Approved" &&
                res.data.status !== "Rejected") {
              setShowApprovalModal(true);
            }
          }
        }

      } catch (err) {
        console.error(err);
      }
    };

    fetchTicket();
  }, [id, accounts]);

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

  // ⭐ APPROVE Handler
  const handleApprove = async () => {
    try {
      setApproveLoading(true);

      const res = await axios.post(`${backendBase}/tickets/${id}/approve`, {
        approvedBy: accounts[0]?.name || accounts[0]?.username,
        note: adminNote
      });

      // If backend returned password → show in popup
      if (res.data?.newPassword) {
        setReturnedPassword(res.data.newPassword);
        setShowPasswordPopup(true);
      }

      setShowApprovalModal(false);
      navigate("/", { state: { refresh: true } });

    } catch (err) {
      alert("Approval failed: " + err.message);
    }
    setApproveLoading(false);
  };

  // ⭐ REJECT Handler
  const handleReject = async () => {
    try {
      setRejectLoading(true);

      await axios.post(`${backendBase}/tickets/${id}/reject`, {
        rejectedBy: accounts[0]?.name || accounts[0]?.username,
        reason: adminNote
      });

      setShowApprovalModal(false);
      navigate("/", { state: { refresh: true } });

    } catch (err) {
      alert("Rejection failed: " + err.message);
    }
    setRejectLoading(false);
  };

  // CLOSE / REVIVE — existing logic (kept same)
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
      setCloseReason('');
      navigate('/', { state: { refresh: true } });
    } catch (err) {
      setCloseError("Failed to close ticket. Please try again.");
    }
    setLoading(false);
  };

  const cancelClose = () => {
    setShowReasonInput(false);
    setConfirmModal(false);
    setCloseReason('');
    setCloseError('');
  };

  const handleSubmitReviveReason = () => {
    if (!reviveReason.trim()) {
      setReviveError("Please provide a reason for reviving this ticket.");
      return;
    }
    setReviveError('');
    setShowReviveReasonInput(false);
    setConfirmReviveModal(true);
  };

  const confirmReviveTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/revive`, {
        revivedBy: accounts[0]?.name || accounts[0]?.username || "User",
        reviveReason: reviveReason.trim()
      });
      setConfirmReviveModal(false);
      setReviveReason('');
      navigate('/', { state: { refresh: true } });
    } catch (err) {
      setReviveError("Failed to revive ticket. Please try again.");
    }
    setLoading(false);
  };

  const cancelRevive = () => {
    setShowReviveReasonInput(false);
    setConfirmReviveModal(false);
    setReviveReason('');
    setReviveError('');
  };

  //  SHOW LOADER UNTIL TICKET LOADED
  if (!ticket) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading ticket...</p>;

  const historyEvents = ticket.history && ticket.history.length > 0
    ? ticket.history
    : [
        { action: "created", by: ticket.userName, at: ticket.createdAt, reason: null },
        ...(ticket.closedAt ? [{ action: "closed", by: ticket.closedBy || "Unknown", at: ticket.closedAt, reason: ticket.closeReason }] : []),
        ...(ticket.reopenedAt ? [{ action: "revived", by: ticket.reopenedBy || "Unknown", at: ticket.reopenedAt, reason: ticket.reviveReason }] : [])
      ];

  return (
    <>
      {/* ---------- STYLES ---------- */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); } to { transform: scale(1); } }
        .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; 
          background: rgba(0,0,0,0.65); display: flex; justify-content: center; 
          align-items: center; z-index: 9999; animation: fadeIn 0.3s; }
        .modal-box { background: white; padding: 30px; border-radius: 16px; width: 90%; 
          max-width: 460px; text-align: center; 
          box-shadow: 0 15px 50px rgba(0,0,0,0.25); animation: zoomIn 0.3s; }
        .reason-input { width: 433px; padding: 14px; margin: 12px 0; 
          border: 2px solid #e2e8f0; border-radius: 12px; font-size: 15px; }
      `}</style>

      <div style={{ padding: "1rem", maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => navigate('/')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
          borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
          fontWeight: 600, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', fontSize: '15px'
        }}>Back to Tickets</button>
      </div>

      {/* MAIN TICKET CARD (UNCHANGED) */}
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
      }}>
        {/* Header */}
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
            }}>
              {ticket.userName ? ticket.userName.split(' ').map(n => n[0]).slice(0,2).join('') : 'U'}
            </div>

            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: '1.65rem', color: '#0f172a', fontWeight: 800 }}>
                {ticket.category}
              </h1>

              {/* Ticket Number */}
              <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: '#eef2ff',
                  color: '#3730a3',
                  fontWeight: 800,
                  fontSize: 13,
                }}>
                  <span style={{ fontSize: 12 }}>Ticket #</span><br />
                  <span style={{ fontSize: 20 }}>{ticket.ticketNumber}</span>
                </div>

                {/* Priority */}
                <span style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: ticket.priority === 'High' ? '#fee2e2' :
                             ticket.priority === 'Medium' ? '#fef3c7' : '#dcfce7',
                  color: ticket.priority === 'High' ? '#b91c1c' :
                         ticket.priority === 'Medium' ? '#92400e' : '#166534',
                  fontWeight: 700,
                }}>
                  {ticket.priority}
                </span>

                {/* Status */}
                <span style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: ticket.status === 'Closed' ? '#fee2e2' : '#dcfce7',
                  color: ticket.status === 'Closed' ? '#b91c1c' : '#166534',
                  fontWeight: 700,
                }}>
                  {ticket.status}
                </span>
              </div>
            </div>
          </div>

          {/* Right meta */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#64748b', fontSize: 13 }}>Created by</div>
            <div style={{ fontWeight: 800 }}>{ticket.userName}</div>
            <a href={`mailto:${ticket.userEmail}`} style={{ color: '#2563eb', fontSize: 13 }}>
              {ticket.userEmail}
            </a>
          </div>
        </div>

        {/* Description */}
        <div style={{
          marginTop: 4,
          background: '#f8fafc',
          padding: 20,
          borderRadius: 14,
          border: '1px solid #edf2f7',
          color: '#334155',
          lineHeight: 1.7,
        }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>Description</strong>
          <div style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
        </div>
      </div>

      {/* HISTORY SECTION (unchanged) */}
      <div style={{ maxWidth: '720px', margin: '3rem auto', padding: '0 1rem' }}>
        <h2 style={{ fontSize: '1.9rem', textAlign: 'center' }}>Ticket History</h2>
        <div>

          {historyEvents.map((event, i) => (
            <div key={i} style={{ marginBottom: 20, padding: 20, background: '#f1f5f9', borderRadius: 12 }}>
              <strong>{event.action.toUpperCase()}</strong>
              <br />
              {formatDate(event.at)} by {event.by}
              {event.reason && (
                <div style={{ marginTop: 10, padding: 10, background: '#e2e8f0', borderRadius: 8 }}>
                  Reason: {event.reason}
                </div>
              )}
            </div>
          ))}

        </div>
      </div>

      {/* ⭐⭐⭐ CATEGORY HEAD APPROVAL MODAL ⭐⭐⭐ */}
      {showApprovalModal && isCategoryHead && (
  <div className="overlay">
    <div className="modal-box" style={{ maxHeight: "90vh", overflowY: "auto" }}>

      <h2 style={{ marginBottom: 10, fontWeight: 800 }}>Approval Required</h2>
      <p style={{ color: "#475569", marginBottom: 20 }}>
        You are the <strong>Category Head</strong> for <strong>{ticket.category}</strong>.
        Review the ticket details before taking action.
      </p>

      {/* ⭐ TICKET DETAILS BOX ⭐ */}
      <div style={{
        background: "#f8fafc",
        padding: 18,
        borderRadius: 12,
        textAlign: "left",
        marginBottom: 20,
        border: "1px solid #e2e8f0"
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 700 }}>
          Ticket Summary
        </h3>

        <p><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
        <p><strong>Created By:</strong> {ticket.userName} ({ticket.userEmail})</p>
        <p><strong>Category:</strong> {ticket.category}</p>
        <p><strong>Priority:</strong> {ticket.priority}</p>
        <p><strong>On Behalf:</strong> {ticket.onBehalf || "Self"}</p>
        {ticket.onBehalfEmail && (
          <p><strong>On Behalf Email:</strong> {ticket.onBehalfEmail}</p>
        )}
        <p><strong>Created On:</strong> {formatDate(ticket.createdAt)}</p>

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

      {/* ⭐ ADMIN NOTE INPUT ⭐ */}
      <textarea
        className="reason-input"
        placeholder="Optional note to requester..."
        value={adminNote}
        onChange={(e) => setAdminNote(e.target.value)}
        rows={4}
        style={{ width: "100%", marginBottom: 10 }}
      />

      {/* ⭐ ACTION BUTTONS ⭐ */}
      <div style={{ display: "flex", gap: 16, marginTop: 10, justifyContent: "center" }}>
        <button
          onClick={handleApprove}
          disabled={approveLoading}
          style={{
            padding: "12px 22px",
            background: "#16a34a",
            color: "white",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer",
            minWidth: 120
          }}
        >
          {approveLoading ? "Approving..." : "Approve"}
        </button>

        <button
          onClick={handleReject}
          disabled={rejectLoading}
          style={{
            padding: "12px 22px",
            background: "#dc2626",
            color: "white",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer",
            minWidth: 120
          }}
        >
          {rejectLoading ? "Rejecting..." : "Reject"}
        </button>
      </div>
    </div>
  </div>
)}


      {/* ⭐⭐⭐ PASSWORD POPUP FOR CATEGORY HEAD ⭐⭐⭐ */}
      {showPasswordPopup && (
        <div className="overlay">
          <div className="modal-box">
            <h2>Password Reset Successful</h2>
            <p>The new password is:</p>
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

            <button
              style={{ marginTop: 20, padding: "12px 20px", background: "#2563eb", color: "white", borderRadius: 12 }}
              onClick={() => setShowPasswordPopup(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* EXISTING CLOSE/REVIVE MODALS — unchanged */}
      {showReasonInput && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Close Ticket #{ticket.ticketNumber}</h3>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Reason..."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              autoFocus
            />
            {closeError && <div className="error-text">{closeError}</div>}
            <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={handleSubmitReason} style={{ padding: '14px 28px', background: '#dc2626', color: 'white', borderRadius: 12 }}>
                Continue
              </button>
              <button onClick={cancelClose} style={{ padding: '14px 28px', background: '#64748b', color: 'white', borderRadius: 12 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box">
            <h3 style={{ color: "#dc2626" }}>Confirm Close?</h3>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button onClick={confirmCloseTicket} disabled={loading} style={{ padding: '12px 24px', background: '#dc2626', color: 'white', borderRadius: 12 }}>
                {loading ? 'Closing...' : 'Yes'}
              </button>
              <button onClick={cancelClose} style={{ padding: '12px 24px', background: '#64748b', color: 'white', borderRadius: 12 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showReviveReasonInput && (
        <div className="overlay" onClick={cancelRevive}>
          <div className="modal-box">
            <h3>Revive Ticket #{ticket.ticketNumber}</h3>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Reason..."
              value={reviveReason}
              onChange={(e) => setReviveReason(e.target.value)}
              autoFocus
            />
            {reviveError && <div className="error-text">{reviveError}</div>}
            <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={handleSubmitReviveReason} style={{ padding: '14px 28px', background: '#16a34a', color: 'white', borderRadius: 12 }}>
                Continue
              </button>
              <button onClick={cancelRevive} style={{ padding: '14px 28px', background: '#64748b', color: 'white', borderRadius: 12 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmReviveModal && (
        <div className="overlay">
          <div className="modal-box">
            <h3 style={{ color: "#16a34a" }}>Confirm Revive?</h3>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button onClick={confirmReviveTicket} disabled={loading} style={{ padding: '12px 24px', background: '#16a34a', color: 'white', borderRadius: 12 }}>
                {loading ? 'Reviving...' : 'Yes'}
              </button>
              <button onClick={cancelRevive} style={{ padding: '12px 24px', background: '#64748b', color: 'white', borderRadius: 12 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;
