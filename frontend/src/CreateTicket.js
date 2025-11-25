import React, { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

/*
  CreateTicket.js
  - Verify-by-email flow: calls backend GET /users/verify?email=<email>
  - Requires REACT_APP_API_BASE in frontend env (example: REACT_APP_API_BASE=https://your-backend.example.com)
  - Alternate email is mandatory for Password Reset tickets.
  - Shows raw /users/verify JSON response for debugging.
*/

function PasswordPopup({ password, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.passwordBox}>
        <h2 style={{ marginBottom: "1rem" }}>🎉 Password Reset Complete</h2>
        <p><strong>Temporary password:</strong></p>
        <p style={styles.passwordText}>{password}</p>
        <button onClick={handleCopy} style={styles.copyButton}>Copy Password</button>
        {copied && <p style={{ color: "green", marginTop: "0.5rem" }}>Copied!</p>}
        <button onClick={onClose} style={styles.modalCloseButton}>✖</button>
      </div>
    </div>
  );
}

export default function CreateTicket() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const API_BASE = process.env.REACT_APP_API_BASE || "";

  // Form state
  const [formData, setFormData] = useState({ category: "", description: "", priority: "Medium" });

  // On-behalf and verify
  const [onBehalfType, setOnBehalfType] = useState(null); // null | "Self" | "Others"
  const [onBehalfEmailInput, setOnBehalfEmailInput] = useState("");
  const [onBehalfUser, setOnBehalfUser] = useState(null); // normalized user { id, displayName, mail, userPrincipalName }
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState("");
  const [verifyRaw, setVerifyRaw] = useState(null); // raw server response for debugging

  // Alternate email (mandatory for password reset)
  const [alternateEmail, setAlternateEmail] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", message: "", type: "info" });
  const [createdTicketId, setCreatedTicketId] = useState(null);

  // Password popup
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);

  // Signed-in user display
  const [displayName, setDisplayName] = useState(accounts?.[0]?.name || "");
  const [displayEmail, setDisplayEmail] = useState(accounts?.[0]?.username || "");

  // Fetch /me to show nicer header info (best-effort)
  useEffect(() => {
    let mounted = true;
    const fetchMe = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResp = await instance.acquireTokenSilent({ scopes: ["User.Read"], account: accounts[0] });
        const resp = await axios.get("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokenResp.accessToken}` },
        });
        if (!mounted) return;
        setDisplayName(resp.data.displayName || accounts[0]?.name || "");
        const email =
          (resp.data.mail && resp.data.mail.trim()) ||
          (resp.data.userPrincipalName && resp.data.userPrincipalName.trim()) ||
          accounts[0]?.username ||
          "";
        setDisplayEmail(email);
      } catch (err) {
        console.debug("Could not fetch /me:", err?.message || err);
      }
    };
    fetchMe();
    return () => { mounted = false; };
  }, [instance, accounts]);

  // Previously we cleared on-behalf state when leaving Password Reset.
  // Change: Only clear fields that are specific to the verify/password-reset flow.
  // Keep onBehalfType/onBehalfUser so "On behalf" can be used for other categories as well.
  useEffect(() => {
    if (formData.category !== "Password Reset") {
      // clear verify/alternate-email fields that only apply to Password Reset
      setAlternateEmail("");
      setVerifyMessage("");
      setVerifyRaw(null);
      setVerifyLoading(false);
      // keep onBehalfType/onBehalfUser/onBehalfEmailInput intact so other categories can use them
    }
  }, [formData.category]);

  // Verify exact email against backend /users/verify
  const verifyEmail = async (email) => {
    setVerifyLoading(true);
    setVerifyMessage("");
    setVerifyRaw(null);
    setOnBehalfUser(null);
    const safe = (email || "").trim();
    if (!safe) {
      setVerifyMessage("Please enter an email to verify.");
      setVerifyLoading(false);
      return;
    }

    try {
      const resp = await axios.get(`${API_BASE}/users/verify`, { params: { email: safe } });
      // Save raw response for debugging in UI
      setVerifyRaw(resp.data || null);

      // Normalize with fallbacks
      const u = resp.data || {};
      const id = u.id || u.objectId || "";
      const display = u.displayName || u.userPrincipalName || u.mail || id || "Unknown user";
      const mail = u.mail || u.userPrincipalName || "";

      const normalized = { id, displayName: display, mail, userPrincipalName: u.userPrincipalName || "" };
      setOnBehalfUser(normalized);
      setVerifyMessage(`Verified: ${display}`);
    } catch (err) {
      console.error("/users/verify error:", err?.response?.data || err.message || err);
      const status = err?.response?.status;
      if (status === 404) setVerifyMessage("User not found in Azure AD.");
      else if (status === 401 || status === 403) setVerifyMessage("Azure permission or token error (401/403). Check server logs.");
      else setVerifyMessage("Verification failed. See console or server logs.");
      setOnBehalfUser(null);
      setVerifyRaw(err?.response?.data || null);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleVerifyClick = async (e) => {
    e && e.preventDefault();
    await verifyEmail(onBehalfEmailInput);
  };

  // Submit ticket
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCreatedTicketId(null);
    setShowPasswordPopup(false);
    setNewPassword("");

    try {
      // Validation for Password Reset flow
      if (formData.category === "Password Reset") {
        if (!onBehalfType) {
          setModal({ open: true, title: "Missing", message: 'Choose "On behalf of" (Self or Others).', type: "error" });
          setLoading(false);
          return;
        }
        if (onBehalfType === "Others" && !onBehalfUser) {
          setModal({ open: true, title: "Missing", message: "Please verify the target user's email using Verify.", type: "error" });
          setLoading(false);
          return;
        }
        if (!alternateEmail || !alternateEmail.trim()) {
          setModal({ open: true, title: "Alternate email required", message: "Provide an alternate email to receive the temporary password.", type: "error" });
          setLoading(false);
          return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(alternateEmail.trim())) {
          setModal({ open: true, title: "Invalid email", message: "Alternate email is not valid.", type: "error" });
          setLoading(false);
          return;
        }
      }

      // Acquire token to authenticate to backend (optional; backend may not require)
      let tokenAccess = null;
      if (accounts && accounts[0]) {
        try {
          const t = await instance.acquireTokenSilent({ scopes: ["User.Read"], account: accounts[0] });
          tokenAccess = t?.accessToken;
        } catch (err) {
          console.debug("acquireTokenSilent failed (optional):", err?.message || err);
        }
      }

      // Refresh creator details
      let latestName = displayName;
      let latestEmail = displayEmail;
      if (tokenAccess) {
        try {
          const meResp = await axios.get("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${tokenAccess}` } });
          latestName = meResp.data.displayName || latestName || accounts?.[0]?.name || "";
          latestEmail = (meResp.data.mail && meResp.data.mail.trim()) || (meResp.data.userPrincipalName && meResp.data.userPrincipalName.trim()) || latestEmail || accounts?.[0]?.username || "";
        } catch (err) {
          // ignore
        }
      }

      // Build payload
      const payload = {
        category: formData.category,
        description: formData.description,
        priority: formData.priority,
        userId: accounts?.[0]?.localAccountId,
        userName: latestName || accounts?.[0]?.username,
        userEmail: latestEmail,
        status: "Open",
      };

      if (onBehalfType) {
        payload.onBehalfType = onBehalfType;
        payload.onBehalfUserId = onBehalfType === "Others" ? onBehalfUser?.id : accounts?.[0]?.localAccountId;
        payload.onBehalfUserName = onBehalfType === "Others" ? onBehalfUser?.displayName : latestName;
        payload.onBehalfUserEmail = onBehalfType === "Others" ? onBehalfUser?.mail : latestEmail;
      }

      // Only set alternateEmail when present (and server checks its requirement for Password Reset)
      if (alternateEmail && alternateEmail.trim()) payload.alternateEmail = alternateEmail.trim();

      const headers = {};
      if (tokenAccess) headers.Authorization = `Bearer ${tokenAccess}`;

      // POST to backend - ensure REACT_APP_API_BASE points to your backend URL
      const resp = await axios.post(`${API_BASE}/tickets`, payload, { headers });
      const ticket = resp.data;
      if (ticket?._id) setCreatedTicketId(ticket._id);

      // If backend returned newPassword (self auto-reset), show popup
      if (resp.data?.newPassword) {
        setNewPassword(resp.data.newPassword);
        setShowPasswordPopup(true);
      }

      // Success modal
      if (formData.category === "Password Reset" && onBehalfType === "Others") {
        setModal({ open: true, title: "Ticket Created - Pending Approval", message: `Ticket created and awaiting admin approval. Ticket #: ${ticket?.ticketNumber || "—"}`, type: "success" });
      } else {
        setModal({ open: true, title: "Ticket Created", message: "Ticket created successfully!", type: "success" });
      }
    } catch (err) {
      console.error("create ticket error:", err?.response?.data || err.message || err);
      const message = err?.response?.data?.message || err?.response?.data?.error || err.message || "Failed to create ticket.";
      setModal({ open: true, title: "Failed", message: `⚠️ ${message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    const wasSuccess = modal.type === "success";
    setModal({ open: false, title: "", message: "", type: "info" });
    if (wasSuccess) navigate("/", { state: { refresh: true } });
  };

  const initials = (displayName || displayEmail || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div style={styles.pageWrap}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1f2937" }}>{displayName || displayEmail || "Unknown User"}</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>{displayEmail || "—"}</div>
          </div>
          <div style={{ marginLeft: 12, textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Status</div>
            <div style={{ fontWeight: 700, color: "#10b981" }}>Signed in</div>
          </div>
        </div>

        <h1 style={{ textAlign: "center", margin: "18px 0 8px" }}>Create New Ticket</h1>

        <form onSubmit={handleSubmit}>
          <div style={styles.gridRow}>
            <div style={styles.field}>
              <label style={styles.label}>Category *</label>
              <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} required style={styles.select}>
                <option value="">Select Category</option>
                <option value="Password Reset">🔑 Password Reset</option>
                <option value="Admin Access">👨‍💼 Admin Access</option>
                <option value="Payroll Issue">💰 Payroll Issue</option>
                <option value="Expense Reimbursement">💳 Expense Reimbursement</option>
                <option value="Leave Request">📅 Leave Request</option>
                <option value="Employee Onboarding">👋 Employee Onboarding</option>
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Priority *</label>
              <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} required style={styles.select}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          {/* Show On-behalf controls for any selected category.
              Password Reset keeps its extra validations (alternateEmail required) in handleSubmit.
          */}
          {formData.category && (
            <div style={styles.field}>
              <label style={styles.label}>On behalf of *</label>
              <select value={onBehalfType || ""} onChange={(e) => { const val = e.target.value || null; setOnBehalfType(val); setOnBehalfUser(null); setOnBehalfEmailInput(""); setVerifyMessage(""); setVerifyRaw(null); }} required style={styles.select}>
                <option value="" disabled>-- choose --</option>
                <option value="Self">Self</option>
                <option value="Others">Others</option>
              </select>

              {onBehalfType === "Others" && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ ...styles.label, marginBottom: 6 }}>Enter exact email (userPrincipalName or mail) to verify</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={onBehalfEmailInput} onChange={(e) => setOnBehalfEmailInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleVerifyClick(e); } }} placeholder="user@yourdomain.com" style={{ ...styles.input, flex: 1 }} autoComplete="off" />
                    <button onClick={handleVerifyClick} type="button" style={styles.primarySmallButton} disabled={verifyLoading}>{verifyLoading ? "Verifying..." : "Verify"}</button>
                  </div>

                  {verifyMessage && (
                    <div style={{
                      marginTop: 8,
                      color: onBehalfUser ? "green" : "crimson",
                      fontWeight: "bold"
                    }}>
                      {verifyMessage}
                    </div>
                  )}

                  {/* Raw JSON response for debugging */}
                  {verifyRaw && <pre style={{ marginTop: 8, background: "#f3f4f6", padding: 8, borderRadius: 6, fontSize: 12, maxHeight: 160, overflow: "auto" }}>{JSON.stringify(verifyRaw, null, 2)}</pre>}

                  {onBehalfUser && (
                    <div style={{ marginTop: 10, padding: 10, background: "#f8fafc", borderRadius: 8 }}>
                      <div style={{ fontWeight: 700 }}>{onBehalfUser.displayName}</div>
                      <div style={{ fontSize: 13, color: "#6b7280" }}>{onBehalfUser.mail}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Only show alternate email input for Password Reset (mandatory there) */}
              {formData.category === "Password Reset" && (
                <div style={{ marginTop: 12 }}>
                  <label style={styles.label}>Alternate email to receive temporary password (mandatory)</label>
                  <input value={alternateEmail} onChange={(e) => setAlternateEmail(e.target.value)} placeholder="someone@example.com" style={styles.input} type="email" required />
                </div>
              )}
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Description *</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required rows="5" style={styles.textarea} placeholder="Describe your issue..." />
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button type="submit" style={{ ...styles.primaryButton, flex: 1 }} 
              disabled={
                loading ||
                (
                  formData.category === "Password Reset" &&
                  onBehalfType === "Others" &&
                  !onBehalfUser
                )
              }
            >
              {loading ? "Creating..." : "Create Ticket"}
            </button>
            <button type="button" onClick={() => navigate("/")} style={{ ...styles.ghostButton }}>Cancel</button>
          </div>
        </form>
      </div>

      {modal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3 style={{ marginBottom: 12 }}>{modal.title}</h3>
            <p style={{ marginBottom: 20 }}>{modal.message}</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <button onClick={handleCloseModal} style={{ padding: "10px 18px", background: modal.type === "success" ? "#27ae60" : "#e74c3c", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>OK</button>
              {modal.type === "success" && createdTicketId && <button onClick={() => navigate(`/ticket/${createdTicketId}`)} style={{ padding: "10px 18px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>View Ticket</button>}
            </div>
          </div>
        </div>
      )}

      {showPasswordPopup && <PasswordPopup password={newPassword} onClose={() => setShowPasswordPopup(false)} />}
    </div>
  );
}

/* --- styles --- */
const styles = {
  pageWrap: { padding: "2rem", maxWidth: 820, margin: "0 auto", boxSizing: "border-box" },
  card: { background: "white", padding: "1.25rem 1.5rem", borderRadius: 12, boxShadow: "0 6px 30px rgba(2,6,23,0.08)", boxSizing: "border-box", overflow: "hidden" },
  headerRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 },
  avatar: { width: 56, height: 56, borderRadius: 10, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#4338ca", fontSize: 18 },
  gridRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start", marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { display: "block", marginBottom: 6, fontSize: 13, color: "#374151", fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", border: "1px solid #e6e9ee", borderRadius: 8, background: "#fafafa", boxSizing: "border-box" },
  select: { width: "100%", padding: "10px 12px", border: "1px solid #e6e9ee", borderRadius: 8, background: "white", boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 140, maxHeight: 300, padding: "12px", border: "1px solid #e6e9ee", borderRadius: 8, background: "white", resize: "vertical", overflow: "auto", boxSizing: "border-box" },
  primaryButton: { background: "#2563eb", color: "white", padding: "12px 18px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 },
  primarySmallButton: { background: "#2563eb", color: "white", padding: "8px 12px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 },
  ghostButton: { background: "#f3f4f6", color: "#374151", padding: "12px 18px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  modalOverlay: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 10000 },
  modalBox: { background: "white", padding: "28px", borderRadius: "10px", width: "420px", textAlign: "center", boxShadow: "0 6px 24px rgba(2,6,23,0.12)" },
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 },
  passwordBox: { background: "white", padding: "2rem", borderRadius: "10px", textAlign: "center", width: "400px", boxShadow: "0 8px 30px rgba(2,6,23,0.12)", position: "relative" },
  passwordText: { fontFamily: "monospace", fontSize: "1.1rem", background: "#f1f1f1", padding: "10px", borderRadius: "6px" },
  copyButton: { marginTop: "1rem", background: "#3498db", color: "white", padding: "8px 16px", border: "none", borderRadius: "6px", cursor: "pointer" },
  modalCloseButton: { position: "absolute", top: "10px", right: "10px", background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer" }
};