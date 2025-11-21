// server.js
// Updated server with improved /users/search and stricter validation for Password Reset

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
const https = require("https");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(helmet());

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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use("/tickets", limiter);

// MongoDB
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

// Schema
const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: Number, unique: true },
    userId: String,
    userName: String,
    userEmail: String,
    category: String,
    description: String,
    priority: String,
    status: String, // Open, Pending Approval, Closed
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

const deptEmails = {
  "Password Reset": process.env.DEPT_PASSWORD_RESET_EMAIL || "allenj@sandeza-inc.com",
  "Admin Access": process.env.DEPT_ADMIN_EMAIL || "vigneshm@sandeza-inc.com",
  "Payroll Issue": process.env.DEPT_PAYROLL_EMAIL || "kishorekumars@sandeza-inc.com",
  "Expense Reimbursement": process.env.DEPT_EXPENSE_EMAIL || "kishorekumars@sandeza-inc.com",
  "Leave Request": process.env.DEPT_LEAVE_EMAIL || "allenj@sandeza-inc.com",
  "Employee Onboarding": process.env.DEPT_ONBOARDING_EMAIL || "allenj@sandeza-inc.com",
};

// Graph token
const getGraphToken = async () => {
  console.log("🔵 [MAIL] Getting Microsoft Graph token...");
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
    console.log("❌ [MAIL] Token FAILED:", data);
    throw new Error(`Token failed: ${JSON.stringify(data)}`);
  }

  console.log("✅ [MAIL] Token received");
  return data.access_token;
};

// sendEmail (unchanged)
const sendEmail = async (to, subject, bodyText, cc) => {
  try {
    console.log(`\n📧 [MAIL] Preparing email...`);
    console.log("To:", to);
    console.log("CC:", cc);
    console.log("Subject:", subject);

    const token = await getGraphToken();
    console.log("🔵 [MAIL] Sending email via Microsoft Graph...");

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

    const responseText = await res.text();

    console.log("🔍 [MAIL] Graph Response Status:", res.status);
    console.log("🔍 [MAIL] Graph Response Body:", responseText);

    if (res.status === 202) {
      console.log(`✅ [MAIL] Email sent SUCCESSFULLY to: ${Array.isArray(to) ? to.join(", ") : to}`);
      return true;
    } else {
      console.log("❌ [MAIL] Email FAILED");
      return false;
    }
  } catch (err) {
    console.error("❌ [MAIL] Error sending email:", err.message);
    return false;
  }
};

// Azure reset
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
  if (!res.ok) throw new Error(`Azure reset failed: ${await res.text()}`);
  return newPassword;
};

// helpers
const nowISTString = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
const portalUrl = process.env.FRONTEND_URL || "https://ticketing-psi-tawny.vercel.app";
const companyName = process.env.COMPANY_NAME || "Sandeza";
const supportSignature = `Regards,
${companyName} Helpdesk Team
${portalUrl}
This message contains confidential information intended for the recipient only. Do not share the temporary password.`;

// Health
app.get("/", (req, res) => res.send(`${companyName} Helpdesk API Running`));

/*
  /users/search
  - Uses app-only token (client_credentials).
  - IMPORTANT: your Azure AD app must have Application permission User.Read.All or Directory.Read.All
    and admin consent must be granted for app-only directory reads to work.
  - This endpoint always returns an ARRAY (possibly empty).
*/
app.get("/users/search", async (req, res) => {
  try {
    let q = (req.query.query || "").trim();
    if (!q) return res.json([]);

    // Escape single quotes for OData filter/search
    q = q.replace(/'/g, "''");

    const token = await getGraphToken();

    // Try using $search first (more flexible). Graph requires "ConsistencyLevel: eventual" for $search.
    // Note: $search support requires the tenant to allow indexing and app permissions.
    const encodedSearch = encodeURIComponent(`displayName:${q} OR mail:${q} OR userPrincipalName:${q}`);
    const searchUrl = `https://graph.microsoft.com/v1.0/users?$search="${encodeURIComponent(`displayName:${q} OR mail:${q} OR userPrincipalName:${q}`)}"&$select=id,displayName,mail,userPrincipalName&$top=25`;

    try {
      const resp = await fetch(`https://graph.microsoft.com/v1.0/users?$search="${encodeURIComponent(`displayName:${q} OR mail:${q} OR userPrincipalName:${q}`)}"&$select=id,displayName,mail,userPrincipalName&$top=25`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "ConsistencyLevel": "eventual",
          "Content-Type": "application/json"
        }
      });

      const text = await resp.text();
      if (!resp.ok) {
        console.warn("Graph $search failed, will try fallback:", resp.status, text);
        // fallthrough to fallback below
      } else {
        let data;
        try { data = JSON.parse(text); } catch (err) { data = null; }
        if (data && Array.isArray(data.value)) {
          return res.json(data.value);
        }
      }
    } catch (searchErr) {
      console.warn("Graph $search error (will fallback):", searchErr.message || searchErr);
      // continue to fallback
    }

    // Fallback: use $filter with startswith on displayName, mail, userPrincipalName
    // Note: startswith may be sufficient; if contains is required, ensure Graph supports it in your tenant.
    const filter = `startswith(displayName,'${q}') or startswith(mail,'${q}') or startswith(userPrincipalName,'${q}')`;
    const url = `https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName&$filter=${encodeURIComponent(filter)}&$top=25`;
    const resp2 = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text2 = await resp2.text();
    if (!resp2.ok) {
      console.error("Graph fallback search failed", resp2.status, text2);
      return res.status(500).json([]);
    }
    let data2;
    try { data2 = JSON.parse(text2); } catch (err) { data2 = null; }
    const values = data2 && Array.isArray(data2.value) ? data2.value : [];
    return res.json(values);
  } catch (err) {
    console.error("User search error:", err.message);
    res.status(500).json([]);
  }
});

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

// Create Ticket. Validates required fields for Password Reset on-behalf flow.
app.post("/tickets", async (req, res) => {
  try {
    const {
      category,
      description,
      priority,
      userId,
      userName,
      userEmail,
      onBehalfType,
      onBehalfUserId,
      onBehalfUserName,
      onBehalfUserEmail,
      alternateEmail,
    } = req.body;

    if (!deptEmails[category]) return res.status(400).json({ error: "Invalid category" });

    // If Password Reset, enforce on-behalf selection and alternateEmail mandatory
    if (category === "Password Reset") {
      if (!onBehalfType) return res.status(400).json({ message: "onBehalfType is required for Password Reset" });

      // If Others, onBehalfUserId must be provided (selected from Azure AD)
      if (onBehalfType === "Others" && !(onBehalfUserId && typeof onBehalfUserId === "string")) {
        return res.status(400).json({ message: "onBehalfUserId (Azure AD user id) is required when On behalf of is Others" });
      }

      // alternateEmail mandatory (per your request)
      if (!alternateEmail || !alternateEmail.trim()) {
        return res.status(400).json({ message: "alternateEmail is required for Password Reset" });
      }
    }

    ticketCounter++;
    const ticketNumber = ticketCounter;

    // default status handling
    let status = "Open";
    let approvalStatus = "Pending";
    if (!(category === "Password Reset")) {
      approvalStatus = "Approved";
    } else {
      // if password reset and onBehalfType is Self, we'll auto-approve (and reset)
      if (category === "Password Reset" && onBehalfType === "Self") {
        approvalStatus = "Approved";
      } else {
        // Others -> pending
        approvalStatus = "Pending";
        status = "Pending Approval";
      }
    }

    const ticket = await Ticket.create({
      ticketNumber,
      userId,
      userName,
      userEmail,
      category,
      description,
      priority,
      status,
      onBehalfType: onBehalfType || "Self",
      onBehalfUserId: onBehalfUserId || (onBehalfType === "Self" ? userId : undefined),
      onBehalfUserName: onBehalfUserName || (onBehalfType === "Self" ? userName : undefined),
      onBehalfUserEmail: onBehalfUserEmail || (onBehalfType === "Self" ? userEmail : undefined),
      alternateEmail: alternateEmail || undefined,
      approvalStatus,
      history: [{
        action: "created",
        by: userName,
        at: new Date(),
        reason: null
      }],
    });

    const nowIST = nowISTString();
    const itHead = process.env.IT_HEAD_EMAIL;

    // emails (same as before but with clearer messages)
    const creatorBody = `
Dear ${userName},

Your ticket has been created successfully.

Ticket Number : ${ticketNumber}
Category      : ${category}
Priority      : ${priority}
Description   : ${description}
Requested On  : ${nowIST}

${category === "Password Reset" && onBehalfType === "Others" ? "Status: Awaiting administrative approval." : (category === "Password Reset" ? "Status: Reset in progress or queued." : "Status: Open.")}

${supportSignature}
`.trim();

    await sendEmail(userEmail, `[${companyName} Helpdesk] Ticket #${ticketNumber} Created`, creatorBody, itHead);

    const adminRecipients = deptEmails[category];
    const adminBody = `
Hello,

A new ticket has been created and requires your attention.

Ticket Number : ${ticketNumber}
Category      : ${category}
Priority      : ${priority}
Created By    : ${userName} (${userEmail})
On Behalf Of  : ${ticket.onBehalfUserName || '—'} (${ticket.onBehalfUserEmail || '—'})
Alternate Mail: ${ticket.alternateEmail || '—'}
Description   : ${description}
Requested On  : ${nowIST}

${category === "Password Reset" && onBehalfType === "Others" ? `Action required: This password reset request is awaiting your approval. Approve or reject here: ${portalUrl}/ticket/${ticket._id}` : 'No action required.'}

${supportSignature}
`.trim();

    await sendEmail(adminRecipients, `[${companyName} Helpdesk] [TICKET #${ticketNumber}] ${category}`, adminBody, itHead);

    // If Others -> notify on-behalf user and alt email about pending approval
    if (category === "Password Reset" && onBehalfType === "Others") {
      const onBehalfBody = `
Dear ${ticket.onBehalfUserName || 'User'},

A password reset request has been created on your behalf.

Ticket Number : ${ticketNumber}
Requested By  : ${userName} (${userEmail})
Alternate Mail: ${ticket.alternateEmail || '—'}
Description   : ${description}
Requested On  : ${nowIST}

This request is currently awaiting administrative approval. You will receive another email with a temporary password once the administrator approves the request.

${supportSignature}
`.trim();

      if (ticket.onBehalfUserEmail) {
        await sendEmail(ticket.onBehalfUserEmail, `[${companyName} Helpdesk] Password Reset Requested - Ticket #${ticketNumber}`, onBehalfBody, [userEmail, ticket.alternateEmail].filter(Boolean));
      }

      if (ticket.alternateEmail) {
        await sendEmail(ticket.alternateEmail, `[${companyName} Helpdesk] Password Reset Requested - Ticket #${ticketNumber}`, onBehalfBody, [userEmail]);
      }
    }

    // If self -> attempt reset immediately
    let returnedPassword = null;
    if (category === "Password Reset" && onBehalfType === "Self") {
      try {
        const targetUserId = ticket.onBehalfUserId || userId;
        const newPassword = await resetAzurePassword(targetUserId);

        ticket.status = "Closed";
        ticket.closedBy = "IT Automation System";
        ticket.closedAt = new Date();
        ticket.approvalStatus = "Approved";
        ticket.history.push({
          action: "approved",
          by: "IT Automation System",
          at: new Date(),
          reason: "Auto-approved and password reset for self"
        });
        ticket.history.push({
          action: "closed",
          by: "IT Automation System",
          at: new Date(),
          reason: "Auto-closed after password reset"
        });
        await ticket.save();

        const passwordBody = `
Dear ${ticket.onBehalfUserName || userName},

Your password has been reset successfully.

Ticket Number     : ${ticketNumber}
Temporary Password: ${newPassword}
Note              : You will be required to change your password at next sign-in.

Requested On      : ${nowIST}

${supportSignature}
`.trim();

        await sendEmail(ticket.onBehalfUserEmail || userEmail, `[${companyName} Helpdesk] Password Reset Completed - Ticket #${ticketNumber}`, passwordBody, [itHead]);
        await sendEmail(deptEmails[category], `[${companyName} Helpdesk] Password Reset Completed - Ticket #${ticketNumber}`, `Password reset completed for ${ticket.onBehalfUserName} (${ticket.onBehalfUserEmail || userEmail}).\n\nTemporary password: ${newPassword}\n\nTime: ${nowIST}\n\n${supportSignature}`, itHead);

        if (ticket.alternateEmail) {
          await sendEmail(ticket.alternateEmail, `[${companyName} Helpdesk] Password Reset Completed - Ticket #${ticketNumber}`, passwordBody, [userEmail]);
        }

        returnedPassword = newPassword;
      } catch (err) {
        console.error("Password reset failed:", err.message);
        ticket.history.push({
          action: "closed",
          by: "IT Automation System",
          at: new Date(),
          reason: `Auto-reset failed: ${err.message}`
        });
        await ticket.save();
      }
    }

    const responsePayload = ticket.toObject();
    if (returnedPassword) responsePayload.newPassword = returnedPassword;

    res.status(201).json(responsePayload);
  } catch (err) {
    console.error("Error creating ticket:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin approve/reject endpoints remain unchanged (they expect the ticket.onBehalfUserId to exist for Others)
// Approve:
app.put("/tickets/:id/approve", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (!(ticket.category === "Password Reset")) return res.status(400).json({ message: "Only password reset tickets can be approved via this endpoint" });
    if (ticket.approvalStatus !== "Pending") return res.status(400).json({ message: "Ticket is not pending approval" });

    try {
      const targetUserId = ticket.onBehalfUserId;
      if (!targetUserId) return res.status(400).json({ message: "No target user specified for password reset" });

      const newPassword = await resetAzurePassword(targetUserId);

      ticket.approvalStatus = "Approved";
      ticket.status = "Closed";
      ticket.closedBy = "Admin";
      ticket.closedAt = new Date();
      ticket.history.push({
        action: "approved",
        by: "Admin",
        at: new Date(),
        reason: "Approved password reset"
      });
      ticket.history.push({
        action: "closed",
        by: "Admin",
        at: new Date(),
        reason: "Closed after approval and password reset"
      });
      await ticket.save();

      const nowIST = nowISTString();
      const subject = `[${companyName} Helpdesk] Password Reset Approved - Ticket #${ticket.ticketNumber}`;
      const body = `
Dear ${ticket.onBehalfUserName || 'User'},

Your password reset request (Ticket #${ticket.ticketNumber}) has been approved by the administrator.

Temporary password: ${newPassword}

Please sign in and change your password immediately.

Ticket Details:
Ticket #: ${ticket.ticketNumber}
Requested by: ${ticket.userName} (${ticket.userEmail})
Approved on: ${nowIST}

${supportSignature}
`.trim();

      const recipients = [ticket.onBehalfUserEmail, ticket.userEmail].filter(Boolean);
      const cc = ticket.alternateEmail ? [ticket.alternateEmail] : undefined;

      await sendEmail(recipients, subject, body, cc);
      await sendEmail(deptEmails[ticket.category], `[${companyName} Helpdesk] Password Reset Completed - Ticket #${ticket.ticketNumber}`, `Password reset completed for ${ticket.onBehalfUserName} (${ticket.onBehalfUserEmail}).\n\nTicket: ${ticket.ticketNumber}\nTime: ${nowIST}\n\n${supportSignature}`, process.env.IT_HEAD_EMAIL);

      res.json({ message: "Approved and password reset. Emails sent." });
    } catch (err) {
      console.error("Approve/reset error:", err.message);
      return res.status(500).json({ message: "Failed to reset password during approval", error: err.message });
    }
  } catch (err) {
    console.error("Approve endpoint error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Reject:
app.put("/tickets/:id/reject", async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (ticket.approvalStatus !== "Pending") return res.status(400).json({ message: "Ticket is not pending approval" });

    ticket.approvalStatus = "Rejected";
    ticket.status = "Closed";
    ticket.approvalReason = reason.trim();
    ticket.closedBy = "Admin";
    ticket.closedAt = new Date();
    ticket.history.push({
      action: "rejected",
      by: "Admin",
      at: new Date(),
      reason: reason.trim()
    });
    ticket.history.push({
      action: "closed",
      by: "Admin",
      at: new Date(),
      reason: `Rejected: ${reason.trim()}`
    });
    await ticket.save();

    const nowIST = nowISTString();
    const subject = `[${companyName} Helpdesk] Password Reset Rejected - Ticket #${ticket.ticketNumber}`;
    const body = `
Dear ${ticket.onBehalfUserName || 'User'},

Your password reset request (Ticket #${ticket.ticketNumber}) has been reviewed by the administrator and was rejected.

Reason for rejection:
${reason.trim()}

Ticket Details:
Ticket #: ${ticket.ticketNumber}
Requested by: ${ticket.userName} (${ticket.userEmail})
Reviewed on: ${nowIST}

If you believe this is an error or require more information, please contact the helpdesk.

${supportSignature}
`.trim();

    const recipients = [ticket.onBehalfUserEmail, ticket.userEmail].filter(Boolean);
    const cc = ticket.alternateEmail ? [ticket.alternateEmail] : undefined;

    await sendEmail(recipients, subject, body, cc);
    await sendEmail(deptEmails[ticket.category], `[${companyName} Helpdesk] Password Reset Rejected - Ticket #${ticket.ticketNumber}`, `Password reset request for ${ticket.onBehalfUserName} (${ticket.onBehalfUserEmail}) was rejected.\n\nReason: ${reason.trim()}\n\nTicket: ${ticket.ticketNumber}\nTime: ${nowIST}\n\n${supportSignature}`, process.env.IT_HEAD_EMAIL);

    res.json({ message: "Ticket rejected and notifications sent." });
  } catch (err) {
    console.error("Reject endpoint error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Existing close & revive endpoints unchanged (kept here for completeness)...

app.put("/tickets/:id/close", async (req, res) => {
  try {
    const { closedBy, closeReason } = req.body;

    if (!closeReason || closeReason.trim() === "") {
      return res.status(400).json({ message: "Close reason is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.status === "Closed") {
      return res.status(400).json({ message: "Ticket is already closed" });
    }

    const now = new Date();

    ticket.history.push({
      action: "closed",
      by: closedBy?.trim() || "IT Head",
      at: now,
      reason: closeReason.trim()
    });

    ticket.status = "Closed";
    ticket.closedBy = closedBy?.trim() || "IT Head";
    ticket.closeReason = closeReason.trim();
    ticket.closedAt = now;

    await ticket.save();

    const nowIST = nowISTString();
    const itHead = process.env.IT_HEAD_EMAIL;

    const emailBody = `
TICKET #${ticket.ticketNumber} HAS BEEN CLOSED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Category       : ${ticket.category}
Priority       : ${ticket.priority}
Created by     : ${ticket.userName} (${ticket.userEmail})
Ticket Number  : #${ticket.ticketNumber}

Closed by      : ${ticket.closedBy}
Closed on      : ${nowIST}

Reason for closing:
${ticket.closeReason}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This ticket is now officially closed.
${supportSignature}
    `.trim();

    await sendEmail(ticket.userEmail, `[${companyName} Helpdesk] [TICKET #${ticket.ticketNumber}] Closed`, emailBody, itHead);
    await sendEmail(deptEmails[ticket.category], `[${companyName} Helpdesk] [CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, emailBody, itHead);

    console.log(`Ticket #${ticket.ticketNumber} closed by ${ticket.closedBy}`);

    res.json({
      message: "Ticket closed successfully",
      ticket: {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        closedBy: ticket.closedBy,
        closeReason: ticket.closeReason,
        closedAt: ticket.closedAt,
        history: ticket.history
      },
    });
  } catch (err) {
    console.error("Close ticket error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.put("/tickets/:id/revive", async (req, res) => {
  try {
    const { revivedBy, reviveReason } = req.body;

    if (!reviveReason || reviveReason.trim() === "") {
      return res.status(400).json({ message: "Revive reason is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status !== "Closed") {
      return res.status(400).json({ message: "Only closed tickets can be revived" });
    }

    const now = new Date();

    ticket.history.push({
      action: "revived",
      by: revivedBy?.trim() || "Unknown User",
      at: now,
      reason: reviveReason.trim()
    });

    ticket.status = "Open";
    ticket.reopenedBy = revivedBy?.trim() || "Unknown User";
    ticket.reopenedAt = now;
    ticket.reviveReason = reviveReason.trim();

    await ticket.save();

    const nowIST = nowISTString();

    const dept = deptEmails[ticket.category] || "helpdesk@sandeza-inc.com";
    const itHead = process.env.IT_HEAD_EMAIL;

    const emailBody = `
TICKET #${ticket.ticketNumber} HAS BEEN REVIVED (Reopened)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Category       : ${ticket.category}
Priority       : ${ticket.priority}
Created by     : ${ticket.userName} (${ticket.userEmail})
Ticket Number  : #${ticket.ticketNumber}

Revived by     : ${ticket.reopenedBy}
Revived on     : ${nowIST}

Reason for reviving:
${ticket.reviveReason}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This ticket is now OPEN again and requires attention.
${supportSignature}
    `.trim();

    await sendEmail(ticket.userEmail, `[${companyName} Helpdesk] [TICKET #${ticket.ticketNumber}] Revived`, emailBody, itHead);
    await sendEmail(dept, `[${companyName} Helpdesk] [REVIVED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, emailBody, itHead);

    console.log(`Ticket #${ticket.ticketNumber} revived by ${ticket.reopenedBy}`);

    res.json({
      message: "Ticket revived successfully",
      ticket: {
        _id: ticket._id,
        status: "Open",
        reopenedBy: ticket.reopenedBy,
        reviveReason: ticket.reviveReason,
        reopenedAt: ticket.reopenedAt,
        history: ticket.history
      },
    });
  } catch (err) {
    console.error("Revive ticket error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT} (On-behalf flow enabled)`)
);