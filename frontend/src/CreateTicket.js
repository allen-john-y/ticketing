import React, { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_BASE || ""; // set this in Vercel to your backend URL (no trailing slash)

function PasswordPopup({ password, onClose }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
  };
  return (
    <div style={styles.overlay}>
      <div style={styles.passwordBox}>
        <h2 style={{ marginBottom: "1rem" }}>🎉 Password Reset</h2>
        <p><strong>Your new password:</strong></p>
        <p style={styles.passwordText}>{password}</p>
        <button onClick={handleCopy} style={styles.copyButton}>Copy Password</button>
        {copied && <p style={{ color: "green", marginTop: "0.5rem" }}>Copied!</p>}
        <button onClick={onClose} style={styles.modalCloseButton}>✖</button>
      </div>
    </div>
  );
}

function CreateTicket() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    category: "",
    description: "",
    priority: "Medium",
    onBehalf: "Self",
    onBehalfEmail: "",
    deliveryEmail: "",
    onBehalfDeliveryEmail: "",
  });

  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", message: "", type: "info" });
  const [createdTicketId, setCreatedTicketId] = useState(null);

  // Use MSAL account info directly for display name/email
  const displayName = accounts?.[0]?.name || "User";
  const displayEmail = (accounts?.[0]?.username || "").trim();

  const [verifyStatus, setVerifyStatus] = useState("idle");
  const [verifiedName, setVerifiedName] = useState("");
  const [verifyError, setVerifyError] = useState("");

  // Verify other user via backend /verify-user
  const handleVerifyOther = async () => {
    const email = formData.onBehalfEmail?.trim();
    setVerifyError("");
    setVerifiedName("");
    setVerifyStatus("idle");

    if (!email) {
      setVerifyError("Please enter the target user's company email to verify.");
      return;
    }

    setVerifyStatus("verifying");

    try {
      const tokenResp = await instance.acquireTokenSilent({
        scopes: ["User.Read"],
        account: accounts[0],
      });

      const res = await axios.post(
        `${API_BASE}/verify-user`,
        { email },
        { headers: { Authorization: `Bearer ${tokenResp.accessToken}` } }
      );

      if (res.data?.exists) {
        setVerifyStatus("verified");
        setVerifiedName(res.data.displayName || email);
        setFormData((prev) => ({ ...prev, onBehalfEmail: res.data.mail || email }));
      } else {
        setVerifyStatus("notfound");
        setVerifyError("User not found in Azure AD.");
      }
    } catch (err) {
      setVerifyStatus("error");
      // detailed error for debugging, but show generic to user
      console.error("verify-other error:", err.response?.data || err.message);
      setVerifyError("Verification failed. Please check the email or try again.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validation to match server rules
    if (formData.category === "Password Reset") {
      if (!formData.onBehalf || (formData.onBehalf !== "Self" && formData.onBehalf !== "Other")) {
        setModal({ open: true, title: "Validation Error", message: "Select Self or Other", type: "error" });
        setLoading(false);
        return;
      }
      if (formData.onBehalf === "Self") {
        if (!formData.deliveryEmail?.trim()) {
          setModal({ open: true, title: "Validation Error", message: "Please provide an alternate delivery email for Self.", type: "error" });
          setLoading(false);
          return;
        }
      } else {
        if (!formData.onBehalfEmail?.trim()) {
          setModal({ open: true, title: "Validation Error", message: "Please verify affected person's company email first.", type: "error" });
          setLoading(false);
          return;
        }
        if (!formData.onBehalfDeliveryEmail?.trim()) {
          setModal({ open: true, title: "Validation Error", message: "Please provide affected person's alternate delivery email.", type: "error" });
          setLoading(false);
          return;
        }
        if (!formData.deliveryEmail?.trim()) {
          setModal({ open: true, title: "Validation Error", message: "Please provide your (requestor) alternate delivery email.", type: "error" });
          setLoading(false);
          return;
        }
      }
    }

    try {
      const tokenResp = await instance.acquireTokenSilent({
        scopes: ["User.Read"],
        account: accounts[0],
      });

      const ticketData = {
        category: formData.category,
        description: formData.description,
        priority: formData.priority,
        onBehalf: formData.onBehalf,
        onBehalfEmail: formData.onBehalf === "Other" ? formData.onBehalfEmail : "",
        deliveryEmail: formData.deliveryEmail,
        onBehalfDeliveryEmail: formData.onBehalf === "Other" ? formData.onBehalfDeliveryEmail : "",
        userId: accounts[0]?.localAccountId,
        userName: displayName,
        userEmail: displayEmail,
      };

      const response = await axios.post(
        `${API_BASE}/tickets`,
        ticketData,
        { headers: { Authorization: `Bearer ${tokenResp.accessToken}` } }
      );

      setCreatedTicketId(response.data._id);
      setModal({ open: true, title: "Ticket Created", message: "Your request is pending approval.", type: "success" });
      // server will NOT return the password in prod; keep popup only for testing envs that send it
      if (response.data.newPassword || response.data.password) {
        setNewPassword(response.data.newPassword || response.data.password);
        setShowPasswordPopup(true);
      }
    } catch (error) {
      console.error("create ticket error:", error.response?.data || error.message);
      setModal({ open: true, title: "Failed ❌", message: `⚠ ${error.response?.data?.message || error.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    const success = modal.type === "success";
    setModal({ open: false, title: "", message: "" });
    if (success) navigate("/");
  };

  const handleViewTicket = () => {
    if (createdTicketId) navigate(`/ticket/${createdTicketId}`);
  };

  const initials = (displayName || "U").split(" ").map(s => s[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div style={styles.pageWrap}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={styles.userName}>{displayName || "Unknown User"}</div>
            <div style={styles.userEmail}>{displayEmail || "—"}</div>
          </div>
          <div style={{ textAlign: "right", marginLeft: 12 }}>
            <div style={styles.statusLabel}>Status</div>
            <div style={styles.signedIn}>Signed in</div>
          </div>
        </div>

        <h1 style={styles.title}>Create New Request</h1>

        <form onSubmit={handleSubmit}>
          <div style={styles.gridRow}>
            <div>
              <label style={styles.label}>Category *</label>
              <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} style={styles.select} required>
                <option value="">Select Category</option>
                <option value="Password Reset">🔑 Password Reset</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>Priority *</label>
              <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} style={styles.select} required>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div>
            <label style={styles.label}>Description *</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the issue..." rows="5" style={styles.textarea} required />
          </div>

          {formData.category === "Password Reset" && (
            <>
              <div style={{ marginTop: 12 }}>
                <label style={styles.label}>Request For *</label>
                <div style={{ display: "flex", gap: 12 }}>
                  <label>
                    <input type="radio" name="onBehalf" value="Self" checked={formData.onBehalf === "Self"} onChange={() => setFormData({ ...formData, onBehalf: "Self" })} /> Self (my own account)
                  </label>

                  <label>
                    <input type="radio" name="onBehalf" value="Other" checked={formData.onBehalf === "Other"} onChange={() => setFormData({ ...formData, onBehalf: "Other" })} /> Other (someone else)
                  </label>
                </div>
              </div>

              {formData.onBehalf === "Self" && (
                <div style={{ marginTop: 12 }}>
                  <label style={styles.label}>Alternate delivery email (where password should be sent) *</label>
                  <input value={formData.deliveryEmail} onChange={(e) => setFormData({ ...formData, deliveryEmail: e.target.value })} placeholder="your.alternate@domain.com" style={styles.input} required />
                </div>
              )}

              {formData.onBehalf === "Other" && (
                <>
                  <div style={{ marginTop: 12 }}>
                    <label style={styles.label}>Affected person's company email *</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={formData.onBehalfEmail} onChange={(e) => setFormData({ ...formData, onBehalfEmail: e.target.value })} placeholder="affected.user@company.com" style={{ ...styles.input, flex: 1 }} />
                      <button type="button" onClick={handleVerifyOther} style={styles.ghostButton}>
                        {verifyStatus === "verifying" ? "Verifying..." : "Verify"}
                      </button>
                    </div>
                    {verifyStatus === "verified" && <div style={{ color: "green", marginTop: 6 }}>Verified: {verifiedName}</div>}
                    {verifyStatus === "notfound" && <div style={{ color: "orange", marginTop: 6 }}>{verifyError}</div>}
                    {verifyStatus === "error" && <div style={{ color: "red", marginTop: 6 }}>{verifyError}</div>}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={styles.label}>Affected person's alternate delivery email *</label>
                    <input value={formData.onBehalfDeliveryEmail} onChange={(e) => setFormData({ ...formData, onBehalfDeliveryEmail: e.target.value })} placeholder="affected.alternate@domain.com" style={styles.input} />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={styles.label}>Your (requestor) alternate delivery email *</label>
                    <input value={formData.deliveryEmail} onChange={(e) => setFormData({ ...formData, deliveryEmail: e.target.value })} placeholder="your.alternate@domain.com" style={styles.input} />
                  </div>
                </>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <button type="submit" style={styles.primaryButton} disabled={loading}>{loading ? "Submitting..." : "Submit"}</button>
            <button type="button" onClick={() => navigate("/")} style={styles.ghostButton}>Cancel</button>
          </div>
        </form>
      </div>

      {createdTicketId && <button onClick={handleViewTicket} style={styles.viewButton}>View Request</button>}

      {modal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3>{modal.title}</h3>
            <p>{modal.message}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={handleCloseModal} style={styles.okButton}>OK</button>
              {modal.type === "success" && <button onClick={handleViewTicket} style={styles.viewButton}>View Ticket</button>}
            </div>
          </div>
        </div>
      )}

      {showPasswordPopup && <PasswordPopup password={newPassword} onClose={() => setShowPasswordPopup(false)} />}
    </div>
  );
}

// Styles kept the same
const styles = {
  pageWrap: { padding: "2rem", maxWidth: 820, margin: "0 auto", boxSizing: "border-box" },
  card: { background: "white", padding: "1.25rem 1.5rem", borderRadius: 12, boxShadow: "0 6px 30px rgba(2,6,23,0.08)" },
  headerRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 },
  avatar: { width: 56, height: 56, borderRadius: 10, background: "#eef2ff", display: "flex", justifyContent: "center", alignItems: "center", fontWeight: 700, fontSize: 18, color: "#4338ca" },
  gridRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  label: { marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#374151" },
  input: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #e6e9ee" },
  select: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #e6e9ee", background: "white" },
  textarea: { width: "100%", minHeight: 140, borderRadius: 8, padding: 12, border: "1px solid #e6e9ee", resize: "vertical" },
  primaryButton: { background: "#2563eb", color: "white", padding: "12px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, flex: 1 },
  ghostButton: { background: "#f3f4f6", padding: "12px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600 },
  viewButton: { marginTop: 12, background: "#2563eb", color: "white", padding: 12, borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", justifyContent: "center", alignItems: "center" },
  modalBox: { background: "white", padding: 28, borderRadius: 10, width: 380, textAlign: "center", boxShadow: "0 6px 24px rgba(2,6,23,0.12)" },
  okButton: { background: "#27ae60", color: "white", padding: "10px 18px", borderRadius: 6, border: "none", cursor: "pointer" },
  signedIn: { fontWeight: 700, color: "#10b981" },
  statusLabel: { fontSize: 12, color: "#6b7280" },
  userName: { fontSize: 18, fontWeight: 700 },
  userEmail: { fontSize: 13, color: "#6b7280" },
  title: { textAlign: "center", margin: "18px 0 8px", fontSize: 22, fontWeight: 700 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" },
  passwordBox: { background: "white", padding: 28, borderRadius: 8, width: 420, textAlign: "center" },
  passwordText: { fontFamily: "monospace", fontSize: 18, marginTop: 8 },
  copyButton: { marginTop: 8, padding: "8px 10px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer" },
  modalCloseButton: { marginTop: 10, background: "#f3f4f6", border: "none", padding: 8, borderRadius: 6, cursor: "pointer" },
};

export default CreateTicket;