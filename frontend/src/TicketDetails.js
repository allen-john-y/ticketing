import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

// ⭐ CATEGORY HEAD EMAIL MAP
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

  // Close Ticket states
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeError, setCloseError] = useState('');

  // Revive Ticket states
  const [showReviveReasonInput, setShowReviveReasonInput] = useState(false);
  const [reviveReason, setReviveReason] = useState('');
  const [reviveError, setReviveError] = useState('');

  const [confirmModal, setConfirmModal] = useState(false);
  const [confirmReviveModal, setConfirmReviveModal] = useState(false);

  const backendBase = "https://ticketing-production-5334.up.railway.app";

  // ⭐ Approval states
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isCategoryHead, setIsCategoryHead] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');

  // Password popup after approval (Password Reset only)
  const [returnedPassword, setReturnedPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  // ------------------ FETCH USER AUTHORITY ------------------
  useEffect(() => {
    const fetchAuthority = async () => {
      if (!accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });

        const groupsRes = await axios.get("https://graph.microsoft.com/v1.0/me/memberOf", {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });

        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('GS_Fortingate_VPN');
        setAuthority(isAdmin ? 'admin' : 'basic');

      } catch (err) {
        console.error("Authority error:", err);
      }
    };

    fetchAuthority();
  }, [accounts, instance]);

  // ------------------ FETCH TICKET ------------------
  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await axios.get(`${backendBase}/tickets/${id}`);
        setTicket(res.data);

        const loggedEmail = (accounts[0]?.username || accounts[0]?.upn || "").toLowerCase().trim();
        const headEmail = (deptEmails[res.data.category] || "").toLowerCase().trim();

        // CATEGORY HEAD condition
        if (loggedEmail === headEmail) {
          setIsCategoryHead(true);

          // Show approval ONLY for Password Reset
          if (
            res.data.category === "Password Reset" &&
            (res.data.status === "Pending" || res.data.status === "Open")
          ) {
            setShowApprovalModal(true);
          }
        }

      } catch (err) {
        console.error("Fetch ticket error:", err);
      }
    };

    fetchTicket();
  }, [id, accounts]);

  // ------------------ Helper ------------------
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

  const needsApprovalBanner =
    isCategoryHead &&
    ticket &&
    ticket.category === "Password Reset" &&
    ticket.status === "Pending" &&
    !showApprovalModal;

  // ------------------ Approve Handler ------------------
  const handleApprove = async () => {
    try {
      setApproveLoading(true);

      const res = await axios.post(`${backendBase}/tickets/${id}/approve`, {
        approvedBy: accounts[0]?.name || accounts[0]?.username,
        note: adminNote
      });

      if (res.data.newPassword) {
        setReturnedPassword(res.data.newPassword);
        setShowPasswordPopup(true);
      }

      setShowApprovalModal(false);

    } catch (err) {
      console.error("Approve error:", err);
      alert("Approval failed: " + (err.response?.data?.message || err.message));
    } finally {
      setApproveLoading(false);
    }
  };

  // ------------------ Reject Handler ------------------
  const handleReject = async () => {
    try {
      setRejectLoading(true);

      await axios.post(`${backendBase}/tickets/${id}/reject`, {
        rejectedBy: accounts[0]?.name || accounts[0]?.username,
        reason: adminNote
      });

      setShowApprovalModal(false);

    } catch (err) {
      console.error("Reject error:", err);
      alert("Rejection failed: " + (err.response?.data?.message || err.message));
    } finally {
      setRejectLoading(false);
    }
  };

  // ------------------ CLOSE TICKET ------------------
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
      navigate(0);

    } catch (err) {
      setCloseError("Failed to close ticket.");
    }
    setLoading(false);
  };

  // ------------------ REVIVE TICKET ------------------
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
        revivedBy: accounts[0]?.name || accounts[0]?.username,
        reviveReason: reviveReason.trim()
      });

      setConfirmReviveModal(false);
      navigate(0);

    } catch (err) {
      setReviveError("Failed to revive ticket.");
    }
    setLoading(false);
  };

  if (!ticket) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading ticket...</p>;

  // --------------- Status Colors ---------------
  const statusColorStyles = {
    background:
      ticket.status === "Closed" ? "#fee2e2" :
      ticket.status === "Approved" ? "#dcfce7" :
      ticket.status === "Pending" ? "#fef3c7" :
      "#e0f2fe",
    color:
      ticket.status === "Closed" ? "#b91c1c" :
      ticket.status === "Approved" ? "#166534" :
      ticket.status === "Pending" ? "#92400e" :
      "#0369a1"
  };

  // --------------- History ---------------
  const historyEvents = ticket.history && ticket.history.length > 0 ? ticket.history : [];

  return (
    <>
      {/* Back Button */}
      <div style={{ padding: '1rem', maxWidth: 720, margin: '0 auto' }}>
        <button onClick={() => navigate('/')} style={{
          padding: '10px 18px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          background: '#fff',
          cursor: 'pointer',
          fontWeight: 600
        }}>
          Back
        </button>
      </div>

      {/* Main Card */}
      <div style={{
        padding: '2rem',
        maxWidth: '720px',
        margin: '0 auto',
        background: '#ffffff',
        borderRadius: '16px',
        borderLeft: `8px solid ${ticket.status === "Closed" ? "#dc2626" : "#16a34a"}`,
        boxShadow: '0 12px 40px rgba(2,6,23,0.08)',
      }}>

        {/* Header */}
        <h2 style={{ margin: 0 }}>{ticket.category}</h2>

        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <span style={{
            padding: '6px 10px', borderRadius: 999, fontWeight: 700,
            background: ticket.priority === 'High' ? '#fff1f2' :
                        ticket.priority === 'Medium' ? '#fff7ed' : '#f0fdf4',
            color: ticket.priority === 'High' ? '#991b1b' :
                   ticket.priority === 'Medium' ? '#b45309' : '#166534'
          }}>
            {ticket.priority}
          </span>

          <span style={{
            padding: '6px 10px', borderRadius: 999, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            ...statusColorStyles
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: ticket.status === "Closed" ? "#dc2626" :
                          ticket.status === "Approved" ? "#16a34a" :
                          ticket.status === "Pending" ? "#f59e0b" :
                          "#0ea5e9"
            }} />
            {ticket.status}
          </span>
        </div>

        <p><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
        <p><strong>Created By:</strong> {ticket.userName} ({ticket.userEmail})</p>

        {/* Banner for Category Head */}
        {needsApprovalBanner && (
          <div style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            padding: "15px",
            borderRadius: 12,
            marginTop: 20,
            textAlign: "center"
          }}>
            <h3 style={{ margin: 0 }}>⏳ Waiting for Your Approval</h3>
            <button
              onClick={() => setShowApprovalModal(true)}
              style={{
                marginTop: 10,
                background: "#d97706",
                color: "white",
                padding: "10px 22px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 700
              }}
            >
              Review Ticket
            </button>
          </div>
        )}

        {/* Description */}
        <div style={{
          marginTop: 20,
          padding: 20,
          background: "#f8fafc",
          borderRadius: 14
        }}>
          <strong>Description:</strong>
          <p style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
        </div>

      </div>

      {/* Ticket History */}
      <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <h2 style={{ textAlign: 'center' }}>Ticket History</h2>

        {historyEvents.map((event, index) => (
          <div key={index} style={{
            padding: 16, background: '#f1f5f9',
            borderRadius: 10, marginBottom: 12
          }}>
            <strong style={{ textTransform: 'capitalize' }}>{event.action}</strong>
            <p>{formatDate(event.at)} by <strong>{event.by}</strong></p>
            {event.reason && (
              <div style={{ padding: 10, background: '#e2e8f0', borderRadius: 8 }}>
                <strong>Reason:</strong> {event.reason}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ----------------- APPROVAL MODAL ----------------- */}
      {showApprovalModal && ticket.category === "Password Reset" && isCategoryHead && (
        <div className="overlay">
          <div className="modal-box" style={{ maxWidth: "700px" }}>
            <h2>Approval Required</h2>
            <p>You are the Category Head for Password Reset. Review ticket details.</p>

            <div style={{
              background: "#f8fafc",
              padding: 16,
              borderRadius: 10,
              marginBottom: 20
            }}>
              <p><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
              <p><strong>User:</strong> {ticket.userName} ({ticket.userEmail})</p>
              <p><strong>On Behalf:</strong> {ticket.onBehalf}</p>
              {ticket.onBehalfEmail && (
                <p><strong>On Behalf Email:</strong> {ticket.onBehalfEmail}</p>
              )}
              <p><strong>Delivery Email:</strong> {ticket.deliveryEmail}</p>
              <p><strong>Description:</strong></p>
              <div style={{ background: "#e2e8f0", padding: 10, borderRadius: 8, whiteSpace: "pre-wrap" }}>
                {ticket.description}
              </div>
            </div>

            <textarea
              placeholder="Optional note..."
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={4}
              style={{
                width: "100%", padding: 12,
                borderRadius: 10, border: "1px solid #d1d5db"
              }}
            />

            <div style={{ marginTop: 20, display: "flex", gap: 12, justifyContent: 'center' }}>
              <button
                onClick={handleApprove}
                disabled={approveLoading}
                style={{
                  background: "#16a34a",
                  color: "white",
                  padding: "12px 22px",
                  borderRadius: 10,
                  cursor: "pointer"
                }}
              >
                {approveLoading ? "Approving..." : "Approve"}
              </button>

              <button
                onClick={handleReject}
                disabled={rejectLoading}
                style={{
                  background: "#dc2626",
                  color: "white",
                  padding: "12px 22px",
                  borderRadius: 10,
                  cursor: "pointer"
                }}
              >
                {rejectLoading ? "Rejecting..." : "Reject"}
              </button>

              <button
                onClick={() => { setShowApprovalModal(false); setAdminNote(''); }}
                style={{
                  background: "#64748b",
                  color: "white",
                  padding: "12px 22px",
                  borderRadius: 10,
                  cursor: "pointer"
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- PASSWORD POPUP ----------------- */}
      {showPasswordPopup && (
        <div className="overlay">
          <div className="modal-box" style={{ maxWidth: 500 }}>
            <h2>Password Reset Successful</h2>
            <p>This is the new password. Please copy and share as needed.</p>

            <div style={{
              padding: 16, background: "#f1f5f9",
              borderRadius: 8, fontFamily: "monospace",
              fontSize: 18, marginBottom: 16
            }}>
              {returnedPassword}
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(returnedPassword);
                alert("Password copied!");
              }}
              style={{
                background: "#2563eb",
                color: "white",
                padding: "10px 20px",
                borderRadius: 10,
                cursor: "pointer",
                marginRight: 10
              }}
            >
              Copy
            </button>

            <button
              onClick={() => {
                setShowPasswordPopup(false);
                navigate(0);
              }}
              style={{
                background: "#10b981",
                color: "white",
                padding: "10px 20px",
                borderRadius: 10,
                cursor: "pointer"
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;
