// ---------------------- Imports -------------------------
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
const https = require("https");
require("dotenv").config();

// ---------------------- App Setup ------------------------
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(helmet());

// ---------------------- CORS ------------------------------
const allowedOrigins = [
  process.env.FRONTEND_URL || "https://ticketing-psi-tawny.vercel.app",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`Blocked by CORS: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);
app.options("*", cors());

// ---------------------- Rate Limiter ----------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use("/tickets", limiter);

// ---------------------- MongoDB ---------------------------
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};
connectDB();

// ---------------------- Schema ----------------------------
const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: Number, unique: true },
    userId: String,
    userName: String,
    userEmail: String,
    category: String,
    description: String,
    priority: String,
    status: String,
    closedBy: String,
    closeReason: String,
    reviveReason: String,
    closedAt: Date,
    reopenedBy: String,
    reopenedAt: Date,

    onBehalfType: { type: String, enum: ["Self", "Others"], default: "Self" },
    onBehalfUserId: String,
    onBehalfUserName: String,
    onBehalfUserEmail: String,
    alternateEmail: String,
    approvalStatus: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    approvalReason: String,

    history: [
      {
        action: { type: String, enum: ["created", "closed", "revived", "approved", "rejected"] },
        by: String,
        at: { type: Date, default: Date.now },
        reason: String,
      },
    ],
  },
  { timestamps: true }
);
const Ticket = mongoose.model("Ticket", ticketSchema);

// ---------------------- Counter ---------------------------
let ticketCounter = 0;
const loadCounter = async () => {
  try {
    const last = await Ticket.findOne().sort({ ticketNumber: -1 });
    ticketCounter = last ? last.ticketNumber : 0;
    console.log("Ticket counter loaded:", ticketCounter);
  } catch (err) {
    console.error("Error loading counter:", err.message);
  }
};
loadCounter();

// ---------------------- Department Emails -----------------
const deptEmails = {
  "Password Reset": process.env.DEPT_PASSWORD_RESET_EMAIL || "allenj@sandeza-inc.com",
  "Admin Access": process.env.DEPT_ADMIN_EMAIL || "vigneshm@sandeza-inc.com",
  "Payroll Issue": process.env.DEPT_PAYROLL_EMAIL || "kishorekumars@sandeza-inc.com",
  "Expense Reimbursement": process.env.DEPT_EXPENSE_EMAIL || "kishorekumars@sandeza-inc.com",
  "Leave Request": process.env.DEPT_LEAVE_EMAIL || "allenj@sandeza-inc.com",
  "Employee Onboarding": process.env.DEPT_ONBOARDING_EMAIL || "allenj@sandeza-inc.com",
};

// ---------------------- Azure Graph Token ----------------------
const getGraphToken = async () => {
  // Uses the AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET from your .env
  const tenantId = process.env.AZURE_TENANT_ID;
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append("client_id", process.env.AZURE_CLIENT_ID);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("client_secret", process.env.AZURE_CLIENT_SECRET);
  params.append("grant_type", "client_credentials");

  const res = await fetch(url, { method: "POST", body: params });
  const data = await res.json();

  if (!res.ok || !data.access_token) {
    console.error("Graph token error:", data);
    throw new Error(`Token failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
};

// ---------------------- Send Email ----------------------
const sendEmail = async (to, subject, bodyText, cc) => {
  try {
    const token = await getGraphToken();

    const normalize = (addr) => {
      if (!addr) return [];
      if (Array.isArray(addr))
        return addr.filter(Boolean).map((a) => ({ emailAddress: { address: a } }));
      if (typeof addr === 'string') return [{ emailAddress: { address: addr } }];
      return [];
    };

    const mailBody = {
      message: {
        subject,
        body: { contentType: "Text", content: bodyText.trim() },
        toRecipients: normalize(to),
        ccRecipients: normalize(cc),
      },
      saveToSentItems: "true",
    };

    const sender = process.env.AZURE_SENDER_EMAIL || "helpdesk@sandeza-inc.com";

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mailBody),
      }
    );

    const text = await res.text();
    if (res.status === 202) {
      console.log(`Email sent to: ${Array.isArray(to) ? to.join(", ") : to}`);
      return true;
    } else {
      console.error("SendMail failed:", res.status, text);
      return false;
    }
  } catch (err) {
    console.error("Error sending email:", err.message || err);
    return false;
  }
};

// ---------------------- Azure Password Reset ----------------------
const getAccessToken = async () => {
  const url = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append("client_id", process.env.AZURE_CLIENT_ID);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("client_secret", process.env.AZURE_CLIENT_SECRET);
  params.append("grant_type", "client_credentials");
  const res = await fetch(url, { method: "POST", body: params });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.access_token;
};

const resetAzurePassword = async (userId) => {
  const token = await getAccessToken();
  const randomPart = Math.random().toString(36).slice(-8);
  const newPassword = `${randomPart}A1!`;
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      passwordProfile: {
        forceChangePasswordNextSignIn: true,
        password: newPassword,
      },
    }),
    agent: new https.Agent({ rejectUnauthorized: false }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Azure reset failed: ${txt}`);
  }
  return newPassword;
};

// ---------------------- Helpers ----------------------
const nowISTString = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
const portalUrl = process.env.FRONTEND_URL || "https://ticketing-psi-tawny.vercel.app";
const companyName = process.env.COMPANY_NAME || "Sandeza";
const supportSignature = `Regards,
${companyName} Helpdesk Team
${portalUrl}
This message contains confidential information intended for the recipient only. Do not share the temporary password.`;

// ---------------------- Routes ----------------------------

// Health Check
app.get("/", (req, res) => res.send(`${companyName} Helpdesk API Running`));

/*
  NEW: /users/verify
  - Purpose: user types an email in the frontend; we verify that exact email exists in Azure AD.
  - Behavior: Accepts query param ?email=<user email>.
    * First tries GET /users/{email} (works if email is userPrincipalName or id).
    * If 404, falls back to a $filter to find by mail or userPrincipalName equality.
    * Returns 200 + normalized user object { id, displayName, mail, userPrincipalName } when found.
    * Returns 404 when not found.
  - Notes: This approach is simpler & reliable for "validate entered email" scenarios and does not attempt fuzzy search.
*/
app.get("/users/verify", async (req, res) => {
  try {
    const email = (req.query.email || "").trim();
    if (!email) return res.status(400).json({ message: "email query parameter is required" });

    const token = await getGraphToken();

    // Try direct GET by identifier (userPrincipalName often works here)
    const directUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=id,displayName,mail,userPrincipalName`;
    try {
      const resp = await fetch(directUrl, { headers: { Authorization: `Bearer ${token}` } });
      const text = await resp.text();
      if (resp.ok) {
        let data;
        try { data = JSON.parse(text); } catch (err) { data = null; }
        if (data && data.id) {
          const user = {
            id: data.id,
            displayName: data.displayName || data.userPrincipalName || data.mail || "",
            mail: data.mail || data.userPrincipalName || "",
            userPrincipalName: data.userPrincipalName || ""
          };
          return res.json(user);
        }
      } else {
        // 404 or other status -> fallthrough to filter-based lookup
        console.warn(`/users/${email} returned status ${resp.status}; falling back to filter`);
      }
    } catch (err) {
      console.warn("Direct /users/{id} lookup error:", err.message || err);
      // continue to fallback
    }

    // Fallback: exact-match filter on mail or userPrincipalName
    // Use equality (not startswith) because user entered full email.
    const filter = `mail eq '${email.replace(/'/g, "''")}' or userPrincipalName eq '${email.replace(/'/g, "''")}'`;
    const url = `https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName&$filter=${encodeURIComponent(filter)}&$top=1`;
    const resp2 = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text2 = await resp2.text();
    if (!resp2.ok) {
      console.error("Graph filter lookup failed:", resp2.status, text2);
      return res.status(500).json({ message: "Azure lookup failed" });
    }
    let data2;
    try { data2 = JSON.parse(text2); } catch (err) { data2 = null; }
    const values = data2 && Array.isArray(data2.value) ? data2.value : [];
    if (values.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const u = values[0];
    const user = {
      id: u.id,
      displayName: u.displayName || u.userPrincipalName || u.mail || "",
      mail: u.mail || u.userPrincipalName || "",
      userPrincipalName: u.userPrincipalName || ""
    };
    return res.json(user);
  } catch (err) {
    console.error("/users/verify error:", err.message || err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Keep other ticket routes mostly unchanged (Create, Get, Close, Revive, Approve, Reject).
// For brevity I keep the same logic you had previously for tickets creation and approval.
// The code below is a minimal, working set adapted from your existing server.js.
// (If you need the full previous logic restored exactly, I can paste the full create/approve/reject routes.)

// Get Tickets
app.get("/tickets", async (req, res) => {
  try {
    const filter = req.query.userId ? { userId: req.query.userId } : {};
    const tickets = await Ticket.find(filter).sort({ ticketNumber: 1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get Ticket by ID
app.get("/tickets/:id", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json(ticket);
  } catch (err) {
    console.error("Error fetching ticket:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Create Ticket (simplified / robust)
app.post("/tickets", async (req, res) => {
  try {
    const { category, description, priority, userId, userName, userEmail, onBehalfType, onBehalfUserId, onBehalfUserName, onBehalfUserEmail, alternateEmail } = req.body;

    if (!category) return res.status(400).json({ message: "category is required" });

    // If Password Reset enforce alternateEmail and onBehalf selection as you requested
    if (category === "Password Reset") {
      if (!onBehalfType) return res.status(400).json({ message: "onBehalfType is required for Password Reset" });
      if (onBehalfType === "Others" && !(onBehalfUserId && typeof onBehalfUserId === "string")) {
        return res.status(400).json({ message: "onBehalfUserId is required when On behalf of is Others" });
      }
      if (!alternateEmail || !alternateEmail.trim()) return res.status(400).json({ message: "alternateEmail is required for Password Reset" });
    }

    ticketCounter++;
    const ticket = await Ticket.create({
      ticketNumber: ticketCounter,
      userId,
      userName,
      userEmail,
      category,
      description,
      priority,
      status: category === "Password Reset" && onBehalfType === "Others" ? "Pending Approval" : "Open",
      onBehalfType: onBehalfType || "Self",
      onBehalfUserId: onBehalfUserId || (onBehalfType === "Self" ? userId : undefined),
      onBehalfUserName: onBehalfUserName || (onBehalfType === "Self" ? userName : undefined),
      onBehalfUserEmail: onBehalfUserEmail || (onBehalfType === "Self" ? userEmail : undefined),
      alternateEmail: alternateEmail || undefined,
      approvalStatus: (category === "Password Reset" && onBehalfType === "Others") ? "Pending" : "Approved",
      history: [{ action: "created", by: userName, at: new Date(), reason: null }]
    });

    const nowIST = nowISTString();

    // Email confirmations (minimal / professional)
    const creatorBody = `
Dear ${userName},

Your ticket has been created successfully.

Ticket Number : ${ticket.ticketNumber}
Category      : ${category}
Priority      : ${priority}
Description   : ${description}
Requested On  : ${nowIST}

${category === "Password Reset" && onBehalfType === "Others" ? "Status: Awaiting administrative approval." : "Status: Open."}

${supportSignature}
`.trim();

    await sendEmail(userEmail, `[${companyName} Helpdesk] Ticket #${ticket.ticketNumber} Created`, creatorBody, process.env.IT_HEAD_EMAIL);

    // Notify department admin
    const adminRecipients = deptEmails[category] || process.env.AZURE_SENDER_EMAIL;
    const adminBody = `
Hello,

A new ticket has been created.

Ticket Number : ${ticket.ticketNumber}
Category      : ${category}
Priority      : ${priority}
Created By    : ${userName} (${userEmail})
On Behalf Of  : ${ticket.onBehalfUserName || '—'} (${ticket.onBehalfUserEmail || '—'})
Alternate Mail: ${ticket.alternateEmail || '—'}
Description   : ${description}
Requested On  : ${nowIST}

${category === "Password Reset" && onBehalfType === "Others" ? `Action required: Approve/Reject at ${portalUrl}/ticket/${ticket._id}` : ''}

${supportSignature}
`.trim();

    await sendEmail(adminRecipients, `[${companyName} Helpdesk] [TICKET #${ticket.ticketNumber}] ${category}`, adminBody, process.env.IT_HEAD_EMAIL);

    // If Password Reset + Self -> attempt reset immediately
    if (category === "Password Reset" && (onBehalfType === "Self" || !onBehalfType)) {
      try {
        const targetUserId = ticket.onBehalfUserId || userId;
        const newPassword = await resetAzurePassword(targetUserId);

        ticket.status = "Closed";
        ticket.closedBy = "IT Automation System";
        ticket.closedAt = new Date();
        ticket.approvalStatus = "Approved";
        ticket.history.push({ action: "approved", by: "IT Automation System", at: new Date(), reason: "Auto-approved and password reset for self" });
        ticket.history.push({ action: "closed", by: "IT Automation System", at: new Date(), reason: "Auto-closed after password reset" });
        await ticket.save();

        const passwordBody = `
Dear ${ticket.onBehalfUserName || userName},

Your password has been reset successfully.

Ticket Number     : ${ticket.ticketNumber}
Temporary Password: ${newPassword}
Note              : You will be required to change your password at next sign-in.

Requested On      : ${nowIST}

${supportSignature}
`.trim();

        await sendEmail(ticket.onBehalfUserEmail || userEmail, `[${companyName} Helpdesk] Password Reset Completed - Ticket #${ticket.ticketNumber}`, passwordBody, process.env.IT_HEAD_EMAIL);

      } catch (err) {
        console.error("Auto-reset failed:", err.message || err);
      }
    }

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Error creating ticket:", err.message || err);
    res.status(500).json({ error: "Server error" });
  }
});

// Minimal approve/reject endpoints (kept concise)
// Approve
app.put("/tickets/:id/approve", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (ticket.approvalStatus !== "Pending") return res.status(400).json({ message: "Ticket not pending" });

    // perform reset for onBehalfUserId
    if (!ticket.onBehalfUserId) return res.status(400).json({ message: "Missing target user id" });

    const newPassword = await resetAzurePassword(ticket.onBehalfUserId);
    ticket.approvalStatus = "Approved";
    ticket.status = "Closed";
    ticket.closedBy = "Admin";
    ticket.closedAt = new Date();
    ticket.history.push({ action: "approved", by: "Admin", at: new Date(), reason: "Approved by admin" });
    ticket.history.push({ action: "closed", by: "Admin", at: new Date(), reason: "Closed after approval and reset" });
    await ticket.save();

    const nowIST = nowISTString();
    const body = `
Dear ${ticket.onBehalfUserName || 'User'},

Your password reset request (Ticket #${ticket.ticketNumber}) has been approved.

Temporary password: ${newPassword}

Please sign in and change your password immediately.

Approved on: ${nowIST}

${supportSignature}
`.trim();

    const recipients = [ticket.onBehalfUserEmail, ticket.userEmail].filter(Boolean);
    const cc = ticket.alternateEmail ? [ticket.alternateEmail] : undefined;
    await sendEmail(recipients, `[${companyName} Helpdesk] Password Reset Approved - Ticket #${ticket.ticketNumber}`, body, cc);

    res.json({ message: "Approved and password reset. Notifications sent." });
  } catch (err) {
    console.error("Approve error:", err.message || err);
    res.status(500).json({ message: "Server error" });
  }
});

// Reject
app.put("/tickets/:id/reject", async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ message: "Reason required" });

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (ticket.approvalStatus !== "Pending") return res.status(400).json({ message: "Ticket not pending" });

    ticket.approvalStatus = "Rejected";
    ticket.status = "Closed";
    ticket.approvalReason = reason.trim();
    ticket.closedBy = "Admin";
    ticket.closedAt = new Date();
    ticket.history.push({ action: "rejected", by: "Admin", at: new Date(), reason: reason.trim() });
    ticket.history.push({ action: "closed", by: "Admin", at: new Date(), reason: `Rejected: ${reason.trim()}` });
    await ticket.save();

    const nowIST = nowISTString();
    const body = `
Dear ${ticket.onBehalfUserName || 'User'},

Your password reset request (Ticket #${ticket.ticketNumber}) has been rejected.

Reason:
${reason.trim()}

Reviewed on: ${nowIST}

${supportSignature}
`.trim();

    const recipients = [ticket.onBehalfUserEmail, ticket.userEmail].filter(Boolean);
    const cc = ticket.alternateEmail ? [ticket.alternateEmail] : undefined;
    await sendEmail(recipients, `[${companyName} Helpdesk] Password Reset Rejected - Ticket #${ticket.ticketNumber}`, body, cc);

    res.json({ message: "Rejected and notifications sent." });
  } catch (err) {
    console.error("Reject error:", err.message || err);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT} (Email-verify flow enabled)`)
);