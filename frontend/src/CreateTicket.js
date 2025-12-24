// CreateTicket.js (UPDATED UI for Self / Other, verify and alternate email)
// Replace your existing CreateTicket.js with this version (adjust imports as needed)

import React, { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

// Password Popup Component (kept)
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

        <p>
          <strong>Your new password:</strong>
        </p>

        <p style={styles.passwordText}>{password}</p>

        <button onClick={handleCopy} style={styles.copyButton}>
          Copy Password
        </button>

        {copied && (
          <p style={{ color: "green", marginTop: "0.5rem" }}>Copied!</p>
        )}

        <button onClick={onClose} style={styles.modalCloseButton}>
          ✖
        </button>
      </div>
    </div>
  );
}

function CreateTicket() {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();

  // If your API is on a different origin or has a base path, set this via env var
  const API_BASE = process.env.REACT_APP_API_BASE || "";

  const [formData, setFormData] = useState({
    category: "",
    description: "",
    priority: "Medium",
    onBehalf: "Self", // Self or Other
    onBehalfEmail: "",
    deliveryEmail: "",
  });

  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);
  const [modal, setModal] = useState({
    open: false,
    title: "",
    message: "",
    type: "info",
  });

  const [createdTicketId, setCreatedTicketId] = useState(null);
  const [displayName, setDisplayName] = useState(accounts?.[0]?.name || "");
  const [displayEmail, setDisplayEmail] = useState(accounts?.[0]?.username || "");

  const [verifyStatus, setVerifyStatus] = useState("idle");
  const [verifiedName, setVerifiedName] = useState("");
  const [verifyError, setVerifyError] = useState("");

  useEffect(() => {
    let mounted = true;

    const fetchUser = async () => {
      if (!accounts || !accounts[0]) return;

      try {
        const tokenResp = await instance.acquireTokenSilent({
          scopes: ["User.Read"],
          account: accounts[0],
        });

        const resp = await axios.get(`${API_BASE}/graph-user-profile`, {
          headers: { Authorization: `Bearer ${tokenResp.accessToken}` },
        });

        if (!mounted) return;

        setDisplayName(resp.data.displayName || displayName || "User");
        setDisplayEmail(resp.data.mail?.trim() || displayEmail || "");
      } catch (err) {
        console.debug("Could not fetch user profile:", err.message);
      }
    };

    fetchUser();

    return () => {
      mounted = false;
    };
  }, [instance, accounts]);

  const handleVerifyOther = async () => {
    const email = formData.onBehalfEmail.trim();
    setVerifyError("");
    setVerifiedName("");
    setVerifyStatus("idle");

    if (!email) {
      setVerifyError("Please enter the target user's company email to verify.");
      return;
    }

    setVerifyStatus("verifying");

    try {
      const token = await instance.acquireTokenSilent({
        scopes: ["User.Read"],
        account: accounts[0],
      });

      const res = await axios.post(
        `${API_BASE}/verify-user`,
        { email },
        {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        }
      );

      if (res.data?.exists) {
        setVerifyStatus("verified");
        setVerifiedName(res.data.displayName || email);
        // set canonical email returned by backend
        setFormData((prev) => ({
          ...prev,
          onBehalfEmail: res.data.mail || email,
        }));
      } else {
        setVerifyStatus("notfound");
        setVerifyError("User not found in Azure AD.");
      }
    } catch (err) {
      setVerifyStatus("error");
      setVerifyError("Verification failed.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Frontend defensive checks that match server
    if (formData.category === "Password Reset" && formData.onBehalf === "Other") {
      if (!formData.onBehalfEmail) {
        setModal({
          open: true,
          title: "Validation Error",
          message: "Please verify the company email first.",
          type: "error",
        });
        setLoading(false);
        return;
      }
      if (!formData.deliveryEmail || !formData.deliveryEmail.trim()) {
        setModal({
          open: true,
          title: "Validation Error",
          message: "Please enter an alternate delivery email for the reset password.",
          type: "error",
        });
        setLoading(false);
        return;
      }
    }

    if (formData.category === "Password Reset" && formData.onBehalf === "Self") {
      if (!formData.deliveryEmail || !formData.deliveryEmail.trim()) {
        setModal({
          open: true,
          title: "Validation Error",
          message: "Please enter an alternate delivery email for the reset password.",
          type: "error",
        });
        setLoading(false);
        return;
      }
    }

    try {
      const token = await instance.acquireTokenSilent({
        scopes: ["User.Read"],
        account: accounts[0],
      });

      const ticketData = {
        ...formData,
        userId: accounts[0]?.localAccountId,
        userName: displayName,
        userEmail: displayEmail,
        status: "Pending",
      };

      const response = await axios.post(
        `${API_BASE}/tickets`,
        ticketData,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );

      setCreatedTicketId(response.data._id);

      setModal({
        open: true,
        title: "Ticket Created ✅",
        message: "Your request is pending approval.",
        type: "success",
      });

      if (response.data.password) {
        setNewPassword(response.data.password);
        setShowPasswordPopup(true);
      }
    } catch (error) {
      setModal({
        open: true,
        title: "Failed ❌",
        message: `⚠ ${error.message}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    const success = modal.type === "success";
    setModal({ open: false });

    if (success) navigate("/");
  };

  const handleViewTicket = () => {
    if (createdTicketId) navigate(`/ticket/${createdTicketId}`);
  };

  const initials = (displayName || "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div style={styles.pageWrap}>
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.headerRow}>
          <div style={styles.avatar}>{initials}</div>

          <div style={{ flex: 1 }}>
            <div style={styles.userName}>
              {displayName || "Unknown User"}
            </div>

            <div style={styles.userEmail}>{displayEmail || "—"}</div>
          </div>

          <div style={{ textAlign: "right", marginLeft: 12 }}>
            <div style={styles.statusLabel}>Status</div>
            <div style={styles.signedIn}>Signed in</div>
          </div>
        </div>

        {/* Form */}
        <h1 style={styles.title}>Create New Request</h1>

        <form onSubmit={handleSubmit}>

          {/* Row 1 */}
          <div style={styles.gridRow}>

            <div>
              <label style={styles.label}>Category *</label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                style={styles.select}
                required
              >
                <option value="">Select Category</option>
                <option value="Password Reset">🔑 Password Reset</option>
                <option value="Admin Access">👨‍💼 Admin Access</option>
                <option value="Payroll Issue">💰 Payroll Issue</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>Priority *</label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value })
                }
                style={styles.select}
                required
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

          </div>

          {/* Description */}
          <div>
            <label style={styles.label}>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Describe the issue..."
              rows="5"
              style={styles.textarea}
              required
            />
          </div>

          {/* Password Reset specific */}
          {formData.category === "Password Reset" && (
            <>
              <div style={{ marginTop: 12 }}>
                <label style={styles.label}>Requesting For</label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <label>
                    <input
                      type="radio"
                      name="onBehalf"
                      value="Self"
                      checked={formData.onBehalf === "Self"}
                      onChange={() => setFormData({ ...formData, onBehalf: "Self", onBehalfEmail: "" })}
                    />{" "}
                    Self
                  </label>

                  <label>
                    <input
                      type="radio"
                      name="onBehalf"
                      value="Other"
                      checked={formData.onBehalf === "Other"}
                      onChange={() => setFormData({ ...formData, onBehalf: "Other" })}
                    />{" "}
                    Other
                  </label>
                </div>
              </div>

              {formData.onBehalf === "Other" ? (
                <div style={{ marginTop: 12 }}>
                  <label style={styles.label}>Target user's company email</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="email"
                      placeholder="user@company.com"
                      value={formData.onBehalfEmail}
                      onChange={(e) => setFormData({ ...formData, onBehalfEmail: e.target.value })}
                      style={styles.input}
                    />
                    <button type="button" onClick={handleVerifyOther} style={styles.ghostButton}>
                      {verifyStatus === "verifying" ? "Verifying..." : "Verify"}
                    </button>
                  </div>

                  {verifyStatus === "verified" && (
                    <div style={{ marginTop: 8, color: "#065f46" }}>
                      Verified: {verifiedName}
                    </div>
                  )}
                  {verifyStatus === "notfound" && (
                    <div style={{ marginTop: 8, color: "#b91c1c" }}>{verifyError}</div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <label style={styles.label}>Alternate delivery email for password *</label>
                    <input
                      type="email"
                      placeholder="alternate@example.com"
                      value={formData.deliveryEmail}
                      onChange={(e) => setFormData({ ...formData, deliveryEmail: e.target.value })}
                      style={styles.input}
                      required={true}
                    />
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                      The temporary password will be sent to this alternate email after approval.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <label style={styles.label}>Alternate delivery email for password *</label>
                  <input
                    type="email"
                    placeholder="alternate@example.com"
                    value={formData.deliveryEmail}
                    onChange={(e) => setFormData({ ...formData, deliveryEmail: e.target.value })}
                    style={styles.input}
                    required={formData.category === "Password Reset"}
                  />
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    The temporary password will be sent to this alternate email after approval.
                  </div>
                </div>
              )}
            </>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <button
              type="submit"
              style={styles.primaryButton}
              disabled={loading}
            >
              {loading ? "Submitting..." : "Submit"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/")}
              style={styles.ghostButton}
            >
              Cancel
            </button>
          </div>

        </form>
      </div>

      {/* View Ticket Button */}
      {createdTicketId && (
        <button onClick={handleViewTicket} style={styles.viewButton}>
          View Request
        </button>
      )}

      {/* Modal */}
      {modal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3>{modal.title}</h3>
            <p>{modal.message}</p>

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={handleCloseModal} style={styles.okButton}>
                OK
              </button>

              {modal.type === "success" && <button onClick={handleViewTicket} style={styles.viewButton}>View Ticket</button>}
            </div>
          </div>
        </div>
      )}

      {/* Password Popup */}
      {showPasswordPopup && (
        <PasswordPopup
          password={newPassword}
          onClose={() => setShowPasswordPopup(false)}
        />
      )}
    </div>
  );
}

// ---- Styles (no changes, only formatted) ----
const styles = {
  pageWrap: {
    padding: "2rem",
    maxWidth: 820,
    margin: "0 auto",
    boxSizing: "border-box",
  },
  card: {
    background: "white",
    padding: "1.25rem 1.5rem",
    borderRadius: 12,
    boxShadow: "0 6px 30px rgba(2,6,23,0.08)",
  },
  headerRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 10,
    background: "#eef2ff",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: 700,
    fontSize: 18,
    color: "#4338ca",
  },
  gridRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 12,
  },
  label: { marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#374151" },
  input: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #e6e9ee" },
  select: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #e6e9ee", background: "white" },
  textarea: { width: "100%", minHeight: 140, borderRadius: 8, padding: 12, border: "1px solid #e6e9ee", resize: "vertical" },
  primaryButton: {
    background: "#2563eb",
    color: "white",
    padding: "12px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    flex: 1,
  },
  ghostButton: {
    background: "#f3f4f6",
    padding: "12px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
  },
  viewButton: { marginTop: 12, background: "#2563eb", color: "white", padding: 12, borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700 },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 10000,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    background: "white",
    padding: 28,
    borderRadius: 10,
    width: 380,
    textAlign: "center",
    boxShadow: "0 6px 24px rgba(2,6,23,0.12)",
  },
  okButton: { background: "#27ae60", color: "white", padding: "10px 18px", borderRadius: 6, border: "none", cursor: "pointer" },
  signedIn: { fontWeight: 700, color: "#10b981" },
  statusLabel: { fontSize: 12, color: "#6b7280" },
  userName: { fontSize: 18, fontWeight: 700 },
  userEmail: { fontSize: 13, color: "#6b7280" },
  title: { textAlign: "center", margin: "18px 0 8px", fontSize: 22, fontWeight: 700 },

  // password popup styles
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10001,
  },
  passwordBox: {
    background: "white",
    padding: 22,
    borderRadius: 10,
    width: 420,
    position: "relative",
    textAlign: "center",
  },
  passwordText: { fontSize: 18, marginTop: 8, fontWeight: 700, letterSpacing: 1 },
  copyButton: { marginTop: 12, padding: "8px 12px", background: "#111827", color: "white", borderRadius: 6, border: "none", cursor: "pointer" },
  modalCloseButton: { position: "absolute", top: 10, right: 10, border: "none", background: "transparent", cursor: "pointer" },
};

export default CreateTicket;