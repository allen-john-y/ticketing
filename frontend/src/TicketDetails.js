import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

// CATEGORY HEAD EMAIL MAP
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
  const [authority, setAuthority] = useState('basic'); // 'admin' or 'basic'
  const [loading, setLoading] = useState(false);

  // Close Ticket states
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeError, setCloseError] = useState('');

  // Revive Ticket states
  const [showReviveReasonInput, setShowReviveReasonInput] = useState(false);
  const [reviveReason, setReviveReason] = useState('');
  const [reviveError, setReviveError] = useState('');

  // confirm modals
  const [confirmCloseModal, setConfirmCloseModal] = useState(false);
  const [confirmReviveModal, setConfirmReviveModal] = useState(false);

  // Approval states
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isCategoryHead, setIsCategoryHead] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');

  // Password popup after approval (Password Reset only)
  const [returnedPassword, setReturnedPassword] = useState('');
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  const backendBase = "https://ticketing-production-5334.up.railway.app";

  // fetch authority (group membership)
  useEffect(() => {
    const fetchAuthority = async () => {
      if (!accounts?.[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });

        const groupsRes = await axios.get("https://graph.microsoft.com/v1.0/me/memberOf", {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });

        const groups = (groupsRes.data?.value || []).map(g => g.displayName);
        const isAdmin = groups.includes('GS_Fortingate_VPN');
        setAuthority(isAdmin ? 'admin' : 'basic');
      } catch (err) {
        console.error("Authority error:", err);
      }
    };

    fetchAuthority();
  }, [accounts, instance]);

  // fetchTicket function reused by actions to refresh UI
  const fetchTicket = useCallback(async () => {
    try {
      const res = await axios.get(`${backendBase}/tickets/${id}`);
      setTicket(res.data);

      // category head detection (email match)
      const loggedEmail = (accounts?.[0]?.username || accounts?.[0]?.upn || "").toLowerCase().trim();
      const headEmail = (deptEmails[res.data.category] || "").toLowerCase().trim();

      if (loggedEmail && headEmail && loggedEmail === headEmail) {
        setIsCategoryHead(true);

        // only auto-open approval modal when category is Password Reset and ticket is Pending/Open
        if (res.data.category === "Password Reset" && (res.data.status === "Pending" || res.data.status === "Open")) {
          setShowApprovalModal(true);
        } else {
          setShowApprovalModal(false);
        }
      } else {
        setIsCategoryHead(false);
        setShowApprovalModal(false);
      }
    } catch (err) {
      console.error("Fetch ticket error:", err);
    }
  }, [id, accounts]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };

  const needsApprovalBanner =
    isCategoryHead &&
    ticket &&
    ticket.category === "Password Reset" &&
    ticket.status === "Pending" &&
    !showApprovalModal;

  // ------- APPROVE -------
  const handleApprove = async () => {
    try {
      setApproveLoading(true);
      const res = await axios.post(`${backendBase}/tickets/${id}/approve`, {
        approvedBy: accounts?.[0]?.name || accounts?.[0]?.username,
        note: adminNote
      });

      if (res?.data?.newPassword) {
        setReturnedPassword(res.data.newPassword);
        setShowPasswordPopup(true);
      }

      // refresh ticket state (will reflect closed/approved)
      await fetchTicket();
      setShowApprovalModal(false);
      setAdminNote('');
    } catch (err) {
      console.error("Approve error:", err);
      alert("Approval failed: " + (err?.response?.data?.message || err?.message));
    } finally {
      setApproveLoading(false);
    }
  };

  // ------- REJECT -------
  const handleReject = async () => {
    try {
      setRejectLoading(true);
      await axios.post(`${backendBase}/tickets/${id}/reject`, {
        rejectedBy: accounts?.[0]?.name || accounts?.[0]?.username,
        reason: adminNote
      });

      await fetchTicket();
      setShowApprovalModal(false);
      setAdminNote('');
    } catch (err) {
      console.error("Reject error:", err);
      alert("Rejection failed: " + (err?.response?.data?.message || err?.message));
    } finally {
      setRejectLoading(false);
    }
  };

  // ------- CLOSE -------
  const handleSubmitCloseReason = () => {
    if (!closeReason.trim()) {
      setCloseError("Please provide a reason for closing this ticket.");
      return;
    }
    setCloseError('');
    setShowReasonInput(false);
    setConfirmCloseModal(true);
  };

  const confirmCloseTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/close`, {
        closeReason: closeReason.trim(),
        closedBy: accounts?.[0]?.name || accounts?.[0]?.username
      });

      setConfirmCloseModal(false);
      setCloseReason('');
      await fetchTicket();
    } catch (err) {
      console.error("Close error:", err);
      setCloseError("Failed to close ticket.");
    } finally {
      setLoading(false);
    }
  };

  // ------- REVIVE -------
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
        revivedBy: accounts?.[0]?.name || accounts?.[0]?.username,
        reviveReason: reviveReason.trim()
      });

      setConfirmReviveModal(false);
      setReviveReason('');
      await fetchTicket();
    } catch (err) {
      console.error("Revive error:", err);
      setReviveError("Failed to revive ticket.");
    } finally {
      setLoading(false);
    }
  };

  // copy password helper
  const copyToClipboard = (text) => {
    try {
      navigator.clipboard.writeText(text);
      alert('Copied to clipboard');
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  if (!ticket) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading ticket...</p>;

  // status style
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

  return (
    <>
      <style>{`
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display:flex; justify-content:center; align-items:center; z-index:9999; }
        .modal-box { background:white; padding:22px; border-radius:12px; width:90%; max-width:760px; box-shadow:0 12px 40px rgba(0,0,0,0.25); }
        .reason-input { width:100%; padding:12px; border-radius:10px; border:1px solid #e2e8f0; min-height:80px; }
        .error-text { color:#dc2626; margin-top:6px; }
      `}</style>

      {/* Back */}
      <div style={{ padding: '1rem', maxWidth: 920, margin: '0 auto' }}>
        <button onClick={() => navigate('/')} style={{
          padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer'
        }}>Back to Tickets</button>
      </div>

      {/* Main Card */}
      <div style={{
        padding: '2rem', maxWidth: 920, margin: '0 auto', display:'flex', gap:20
      }}>
        <div style={{
          flex: 1, background:'#fff', borderRadius:12, padding:18, boxShadow:'0 8px 30px rgba(2,6,23,0.06)'
        }}>
          <h2 style={{ margin: 0 }}>{ticket.category}</h2>
          <div style={{ marginTop: 8, display:'flex', gap:8, alignItems:'center' }}>
            <div style={{
              padding:'6px 10px', borderRadius:999, fontWeight:700,
              background: ticket.priority === 'High' ? '#fff1f2' :
                          ticket.priority === 'Medium' ? '#fff7ed' : '#f0fdf4',
              color: ticket.priority === 'High' ? '#991b1b' :
                     ticket.priority === 'Medium' ? '#b45309' : '#166534'
            }}>{ticket.priority}</div>

            <div style={{ padding:'6px 10px', borderRadius:999, fontWeight:700, display:'inline-flex', alignItems:'center', gap:8, ...statusColorStyles }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:
                ticket.status === "Closed" ? "#dc2626" :
                ticket.status === "Approved" ? "#16a34a" :
                ticket.status === "Pending" ? "#f59e0b" : "#0ea5e9" }} />
              {ticket.status}
            </div>
          </div>

          <p style={{ marginTop: 12 }}><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
          <p><strong>Created By:</strong> {ticket.userName} ({ticket.userEmail})</p>

          {needsApprovalBanner && (
            <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", padding: 12, borderRadius:10, marginTop:16 }}>
              <strong>⏳ Waiting for Your Approval</strong>
              <div style={{ marginTop:10 }}>
                <button onClick={() => setShowApprovalModal(true)} style={{ background:'#d97706', color:'#fff', padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer' }}>
                  Review Ticket
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 18, background:'#f8fafc', padding:14, borderRadius:10 }}>
            <strong>Description:</strong>
            <div style={{ marginTop:8, whiteSpace:'pre-wrap' }}>{ticket.description}</div>
          </div>
        </div>

        {/* Right column: admin actions */}
        <div style={{ width: 260, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'#fff', padding:12, borderRadius:12, boxShadow:'0 6px 20px rgba(2,6,23,0.04)' }}>
            <div style={{ fontSize:12, color:'#64748b' }}>Created</div>
            <div style={{ fontWeight:800 }}>{formatDate(ticket.createdAt)}</div>
            <div style={{ marginTop:8, fontSize:12, color:'#64748b' }}>Created by</div>
            <div style={{ fontWeight:700 }}>{ticket.userName}</div>
            <a href={`mailto:${ticket.userEmail}`} style={{ color:'#2563eb', textDecoration:'none', fontSize:13 }}>{ticket.userEmail}</a>
          </div>

          {/* Admin controls (visible to authority === 'admin') */}
          {authority === 'admin' && ticket.status !== 'Closed' && (
            <button onClick={() => setShowReasonInput(true)} style={{
              width:'100%', background:'#dc2626', color:'#fff', padding:'12px', borderRadius:10, border:'none', cursor:'pointer', fontWeight:700
            }}>
              Close Ticket
            </button>
          )}

          {authority === 'admin' && ticket.status === 'Closed' && (
            <button onClick={() => setShowReviveReasonInput(true)} style={{
              width:'100%', background:'#16a34a', color:'#fff', padding:'12px', borderRadius:10, border:'none', cursor:'pointer', fontWeight:700
            }}>
              Revive Ticket
            </button>
          )}

          {/* If category head (and pending password reset) show quick approve action too */}
          {isCategoryHead && ticket.category === "Password Reset" && (ticket.status === 'Pending' || ticket.status === 'Open') && (
            <button onClick={() => setShowApprovalModal(true)} style={{
              width:'100%', background:'#f59e0b', color:'#fff', padding:'12px', borderRadius:10, border:'none', cursor:'pointer', fontWeight:700
            }}>
              Review & Take Action
            </button>
          )}
        </div>
      </div>

      {/* History */}
      <div style={{ maxWidth:920, margin:'1.5rem auto', padding:'0 1rem' }}>
        <h3>Ticket History</h3>
        {(ticket.history || []).map((event, i) => (
          <div key={i} style={{ background:'#f1f5f9', padding:12, borderRadius:8, marginBottom:10 }}>
            <strong style={{ textTransform:'capitalize' }}>{event.action}</strong>
            <div style={{ fontSize:13, color:'#475569' }}>{formatDate(event.at)} by <strong>{event.by}</strong></div>
            {event.reason && <div style={{ marginTop:8, padding:8, background:'#e2e8f0', borderRadius:6 }}><strong>Reason:</strong> {event.reason}</div>}
          </div>
        ))}
      </div>

      {/* ---------------- Approval Modal (Password Reset only) ---------------- */}
      {showApprovalModal && ticket.category === "Password Reset" && isCategoryHead && (
        <div className="overlay">
          <div className="modal-box">
            <h2>Approval Required</h2>
            <p>Review ticket details below.</p>

            <div style={{ background:'#f8fafc', padding:12, borderRadius:8, marginTop:8 }}>
              <p><strong>Ticket #</strong> {ticket.ticketNumber}</p>
              <p><strong>User</strong> {ticket.userName} ({ticket.userEmail})</p>
              <p><strong>On Behalf</strong> {ticket.onBehalf}</p>
              {ticket.onBehalfEmail && <p><strong>On Behalf Email</strong> {ticket.onBehalfEmail}</p>}
              <p><strong>Delivery Email</strong> {ticket.deliveryEmail || '—'}</p>
              <p><strong>Description</strong></p>
              <div style={{ background:'#e2e8f0', padding:8, borderRadius:6, whiteSpace:'pre-wrap' }}>{ticket.description}</div>
            </div>

            <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} className="reason-input" placeholder="Optional note to requester..." style={{ marginTop:12 }} />

            <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'center' }}>
              <button onClick={handleApprove} disabled={approveLoading} style={{ background:'#16a34a', color:'#fff', padding:'10px 16px', borderRadius:8 }}>
                {approveLoading ? 'Approving...' : 'Approve'}
              </button>
              <button onClick={handleReject} disabled={rejectLoading} style={{ background:'#dc2626', color:'#fff', padding:'10px 16px', borderRadius:8 }}>
                {rejectLoading ? 'Rejecting...' : 'Reject'}
              </button>
              <button onClick={() => { setShowApprovalModal(false); setAdminNote(''); }} style={{ background:'#64748b', color:'#fff', padding:'10px 16px', borderRadius:8 }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Password popup ---------------- */}
      {showPasswordPopup && (
        <div className="overlay">
          <div className="modal-box" style={{ maxWidth:560 }}>
            <h2>Password Reset Successful</h2>
            <p>Temporary password (copy and deliver to the requester / alternative email):</p>
            <div style={{ background:'#f1f5f9', padding:12, borderRadius:6, fontFamily:'monospace', fontSize:18, margin:'12px 0' }}>{returnedPassword}</div>

            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button onClick={() => copyToClipboard(returnedPassword)} style={{ background:'#2563eb', color:'#fff', padding:'8px 14px', borderRadius:8 }}>Copy</button>
              <button onClick={async () => { setShowPasswordPopup(false); await fetchTicket(); }} style={{ background:'#10b981', color:'#fff', padding:'8px 14px', borderRadius:8 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Close Reason Modal ---------------- */}
      {showReasonInput && (
        <div className="overlay" onClick={() => setShowReasonInput(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Close Ticket #{ticket.ticketNumber}</h3>
            <p>Please provide a reason for closing this ticket.</p>
            <textarea className="reason-input" value={closeReason} onChange={(e) => setCloseReason(e.target.value)} />
            {closeError && <div className="error-text">{closeError}</div>}
            <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'center' }}>
              <button onClick={handleSubmitCloseReason} style={{ background:'#dc2626', color:'#fff', padding:'8px 14px', borderRadius:8 }}>Continue</button>
              <button onClick={() => { setShowReasonInput(false); setCloseReason(''); setCloseError(''); }} style={{ background:'#64748b', color:'#fff', padding:'8px 14px', borderRadius:8 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Confirm Close ---------------- */}
      {confirmCloseModal && (
        <div className="overlay" onClick={() => setConfirmCloseModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Confirm Close</h3>
            <p>This will close the ticket permanently. Are you sure?</p>
            <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'center' }}>
              <button onClick={confirmCloseTicket} disabled={loading} style={{ background:'#dc2626', color:'#fff', padding:'8px 14px', borderRadius:8 }}>{loading ? 'Closing...' : 'Yes, Close'}</button>
              <button onClick={() => setConfirmCloseModal(false)} style={{ background:'#64748b', color:'#fff', padding:'8px 14px', borderRadius:8 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Revive Reason Modal ---------------- */}
      {showReviveReasonInput && (
        <div className="overlay" onClick={() => setShowReviveReasonInput(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Revive Ticket #{ticket.ticketNumber}</h3>
            <p>Please explain why this ticket needs to be reopened.</p>
            <textarea className="reason-input" value={reviveReason} onChange={(e) => setReviveReason(e.target.value)} />
            {reviveError && <div className="error-text">{reviveError}</div>}
            <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'center' }}>
              <button onClick={handleSubmitReviveReason} style={{ background:'#16a34a', color:'#fff', padding:'8px 14px', borderRadius:8 }}>Continue</button>
              <button onClick={() => { setShowReviveReasonInput(false); setReviveReason(''); setReviveError(''); }} style={{ background:'#64748b', color:'#fff', padding:'8px 14px', borderRadius:8 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Confirm Revive ---------------- */}
      {confirmReviveModal && (
        <div className="overlay" onClick={() => setConfirmReviveModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Confirm Revive</h3>
            <p>This will reopen the ticket. Proceed?</p>
            <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'center' }}>
              <button onClick={confirmReviveTicket} disabled={loading} style={{ background:'#16a34a', color:'#fff', padding:'8px 14px', borderRadius:8 }}>{loading ? 'Reviving...' : 'Yes, Revive'}</button>
              <button onClick={() => setConfirmReviveModal(false)} style={{ background:'#64748b', color:'#fff', padding:'8px 14px', borderRadius:8 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;
