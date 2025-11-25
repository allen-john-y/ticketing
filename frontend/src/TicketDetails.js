import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

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

  const [authority, setAuthority] = useState("basic");

  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeError, setCloseError] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);

  const [showReviveReasonInput, setShowReviveReasonInput] = useState(false);
  const [reviveReason, setReviveReason] = useState('');
  const [reviveError, setReviveError] = useState('');
  const [confirmReviveModal, setConfirmReviveModal] = useState(false);

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [isCategoryHead, setIsCategoryHead] = useState(false);

  const [returnedPassword, setReturnedPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  const backendBase = "https://ticketing-production-5334.up.railway.app";

  useEffect(() => {
    const fetchAuthority = async () => {
      if (!accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ["User.Read", "GroupMember.Read.All"],
          account: accounts[0]
        });

        const groupsRes = await axios.get(
          "https://graph.microsoft.com/v1.0/me/memberOf",
          { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` } }
        );

        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes("GS_Fortingate_VPN");
        setAuthority(isAdmin ? "admin" : "basic");

      } catch (err) {
        console.error("Authority error:", err);
      }
    };
    fetchAuthority();
  }, [accounts, instance]);

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await axios.get(`${backendBase}/tickets/${id}`);
        setTicket(res.data);

        const logged = (accounts[0]?.username || "").toLowerCase().trim();
        const head = (deptEmails[res.data.category] || "").toLowerCase().trim();

        if (logged === head) {
          setIsCategoryHead(true);
          if (res.data.category === "Password Reset" && res.data.status === "Pending") {
            setShowApprovalModal(true);
          }
        }

      } catch (err) { console.error("Ticket fetch error:", err); }
    };

    fetchTicket();
  }, [id, accounts]);

  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    });
  };

  const needsApprovalBanner =
    isCategoryHead &&
    ticket &&
    ticket.category === "Password Reset" &&
    ticket.status === "Pending" &&
    !showApprovalModal;

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
      alert("Approval failed: " + (err.response?.data?.message || err.message));
    } finally {
      setApproveLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setRejectLoading(true);
      await axios.post(`${backendBase}/tickets/${id}/reject`, {
        rejectedBy: accounts[0]?.name || accounts[0]?.username,
        reason: adminNote
      });
      setShowApprovalModal(false);

    } catch (err) {
      alert("Rejection failed: " + (err.response?.data?.message || err.message));
    } finally {
      setRejectLoading(false);
    }
  };

  const handleSubmitReason = () => {
    if (!closeReason.trim()) return setCloseError("Reason required.");
    setCloseError('');
    setConfirmModal(true);
    setShowReasonInput(false);
  };

  const confirmCloseTicket = async () => {
    try {
      await axios.put(`${backendBase}/tickets/${id}/close`, {
        closeReason: closeReason.trim(),
        closedBy: accounts[0]?.name || accounts[0]?.username
      });
      setConfirmModal(false);
      navigate(0);
    } catch (err) {
      setCloseError("Close failed.");
    }
  };

  const handleSubmitReviveReason = () => {
    if (!reviveReason.trim()) return setReviveError("Reason required.");
    setReviveError('');
    setConfirmReviveModal(true);
    setShowReviveReasonInput(false);
  };

  const confirmReviveTicket = async () => {
    try {
      await axios.put(`${backendBase}/tickets/${id}/revive`, {
        revivedBy:
          accounts[0]?.name ||
          accounts[0]?.username ||
          "User",
        reviveReason: reviveReason.trim()
      });
      setConfirmReviveModal(false);
      navigate(0);
    } catch (err) {
      setReviveError("Revive failed.");
    }
  };

  if (!ticket)
    return <p style={{ textAlign: "center", padding: "2rem" }}>Loading...</p>;

  const isCreator =
    accounts?.[0]?.username?.toLowerCase() === ticket.userEmail?.toLowerCase();

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

  const historyEvents = ticket.history || [];

  return (
    <>
      <style>
        {`
        .overlay {
          position: fixed; top:0; left:0; width:100vw; height:100vh;
          background: rgba(0,0,0,0.55);
          display:flex; justify-content:center; align-items:center;
          z-index:10000;
        }
        .modal-box {
          background:white; padding:24px; border-radius:12px;
          max-width:450px; width:90%;
        }
      `}
      </style>

      <div style={{ padding: "1rem", maxWidth: 720, margin: "0 auto" }}>
        <button
          onClick={() => navigate('/')}
          style={{ padding: "10px 18px", borderRadius: 10 }}
        >
          Back
        </button>
      </div>

      <div style={{
        padding: "2rem",
        maxWidth: 720,
        margin: "0 auto",
        background: "#fff",
        borderRadius: 16,
        borderLeft: `8px solid ${
          ticket.status === "Closed" ? "#dc2626" : "#16a34a"
        }`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
      }}>
        <h2>{ticket.category}</h2>

        <p><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
        <p><strong>Created By:</strong> {ticket.userName} ({ticket.userEmail})</p>

        {needsApprovalBanner && (
          <div style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            padding: "12px",
            borderRadius: 10,
            marginTop: 10
          }}>
            <h3>⏳ Waiting for Your Approval</h3>
            <button
              onClick={() => setShowApprovalModal(true)}
              style={{
                background: "#d97706", color: "white",
                padding: "10px 20px", borderRadius: 8
              }}
            >
              Review Ticket
            </button>
          </div>
        )}

        <div style={{
          marginTop: 20,
          padding: 20,
          background: "#f8fafc",
          borderRadius: 12
        }}>
          <strong>Description:</strong>
          <p style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
            {ticket.description}
          </p>
        </div>

        {/* CLOSE BUTTON = ONLY ADMIN */}
        {ticket.status !== "Closed" && authority === "admin" && (
          <button
            onClick={() => setShowReasonInput(true)}
            style={{
              marginTop: 20,
              background: "#dc2626",
              color: "white",
              padding: "12px",
              width: "100%",
              borderRadius: 10
            }}
          >
            Close Ticket
          </button>
        )}

        {/* REVIVE = CREATOR OR ADMIN */}
        {ticket.status === "Closed" && (authority === "admin" || isCreator) && (
          <button
            onClick={() => setShowReviveReasonInput(true)}
            style={{
              marginTop: 20,
              background: "#16a34a",
              color: "white",
              padding: "12px",
              width: "100%",
              borderRadius: 10
            }}
          >
            Revive Ticket
          </button>
        )}

      </div>

      <div style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
        <h2 style={{ textAlign: "center" }}>Ticket History</h2>

        {historyEvents.map((ev, i) => (
          <div key={i} style={{
            padding: 16,
            background: "#f1f5f9",
            borderRadius: 10,
            marginBottom: 12
          }}>
            <strong>{ev.action}</strong>
            <p>{formatDate(ev.at)} by {ev.by}</p>
            {ev.reason && (
              <div style={{ background: "#e2e8f0", padding: 10, borderRadius: 8 }}>
                <strong>Reason:</strong> {ev.reason}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* APPROVAL MODAL */}
      {showApprovalModal && (
        <div className="overlay">
          <div className="modal-box">
            <h2>Approval Needed</h2>
            <p>You are the Category Head. Review this Password Reset request.</p>

            <p><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
            <p><strong>User:</strong> {ticket.userName} ({ticket.userEmail})</p>
            <p><strong>On Behalf:</strong> {ticket.onBehalf}</p>
            {ticket.onBehalfEmail && <p><strong>Email:</strong> {ticket.onBehalfEmail}</p>}
            <p><strong>Delivery Email:</strong> {ticket.deliveryEmail}</p>

            <textarea
              placeholder="Optional note..."
              rows={4}
              value={adminNote}
              onChange={e => setAdminNote(e.target.value)}
              style={{ width: "100%", marginTop: 10 }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={handleApprove}
                disabled={approveLoading}
                style={{ flex: 1, background: "#16a34a", color: "white", padding: 10 }}
              >
                {approveLoading ? "Approving..." : "Approve"}
              </button>

              <button
                onClick={handleReject}
                disabled={rejectLoading}
                style={{ flex: 1, background: "#dc2626", color: "white", padding: 10 }}
              >
                {rejectLoading ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASSWORD POPUP */}
      {showPasswordPopup && (
        <div className="overlay">
          <div className="modal-box">
            <h2>Password Reset Done</h2>
            <p>Temporary Password:</p>

            <div style={{
              padding: 10,
              background: "#f1f5f9",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 18,
              marginBottom: 12
            }}>
              {returnedPassword}
            </div>

            <button
              onClick={() => navigator.clipboard.writeText(returnedPassword)}
              style={{ background: "#2563eb", color: "white", padding: 10, marginRight: 10 }}
            >
              Copy
            </button>

            <button
              onClick={() => setShowPasswordPopup(false)}
              style={{ background: "#16a34a", color: "white", padding: 10 }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* CLOSE MODAL */}
      {showReasonInput && (
        <div className="overlay">
          <div className="modal-box">
            <h3>Close Ticket</h3>
            <textarea
              placeholder="Reason..."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              style={{ width: "100%", marginTop: 10 }}
              rows={4}
            />
            {closeError && <p style={{ color: "red" }}>{closeError}</p>}
            <button
              onClick={handleSubmitReason}
              style={{ marginTop: 10, background: "#dc2626", color: "#fff", padding: 10 }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="overlay">
          <div className="modal-box">
            <h3>Confirm Close?</h3>
            <button
              onClick={confirmCloseTicket}
              style={{ background: "#dc2626", color: "#fff", padding: 10, width: "100%" }}
            >
              Close Ticket
            </button>
            <button
              onClick={() => setConfirmModal(false)}
              style={{ marginTop: 10, padding: 10, width: "100%" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* REVIVE MODAL */}
      {showReviveReasonInput && (
        <div className="overlay">
          <div className="modal-box">
            <h3>Revive Ticket</h3>
            <textarea
              placeholder="Reason..."
              value={reviveReason}
              onChange={(e) => setReviveReason(e.target.value)}
              style={{ width: "100%", marginTop: 10 }}
              rows={4}
            />
            {reviveError && <p style={{ color: "red" }}>{reviveError}</p>}
            <button
              onClick={handleSubmitReviveReason}
              style={{ marginTop: 10, background: "#16a34a", color: "#fff", padding: 10 }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {confirmReviveModal && (
        <div className="overlay">
          <div className="modal-box">
            <h3>Confirm Revive?</h3>

            <button
              onClick={confirmReviveTicket}
              style={{ background: "#16a34a", color: "#fff", padding: 10, width: "100%" }}
            >
              Revive Ticket
            </button>

            <button
              onClick={() => setConfirmReviveModal(false)}
              style={{ marginTop: 10, padding: 10, width: "100%" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;
