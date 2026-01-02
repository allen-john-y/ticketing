// ---------------------- server.js (UPDATED: tokenized one-click approve/reject + admin group add) ----------------------
// ---------------------- PART 1 ----------------------
// ---------------------- Imports -------------------------
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
const https = require("https");
const crypto = require("crypto");
require("dotenv").config();

// ---------------------- App Setup ------------------------
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(helmet());

// ---------------------- CORS ------------------------------
const allowedOrigins = [
  "https://ticketing-psi-tawny.vercel.app",
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
const emailActionTokenSchema = new mongoose.Schema({
  token: String,
  action: { type: String, enum: ["approve", "reject"] },
  recipient: String, // email of approver this token is intended for
  createdAt: { type: Date, default: Date.now },
  expiresAt: Date,
  used: { type: Boolean, default: false },
});

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

    // new fields to support "on behalf" flow
    onBehalf: { type: String }, // 'Self' or 'Other'
    onBehalfEmail: { type: String }, // when onBehalf === 'Other'
    deliveryEmail: { type: String },

    emailActionTokens: [emailActionTokenSchema],

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
// Primary = Kodhan, Secondary = Allen (applies to Password Reset and Admin Access)
const passwordResetPrimary = process.env.PASSWORD_RESET_PRIMARY || "kodhan@sandeza-inc.com";
const passwordResetSecondary = process.env.PASSWORD_RESET_SECONDARY || "allenj@sandeza-inc.com";
const adminAccessPrimary = process.env.ADMIN_ACCESS_PRIMARY || passwordResetPrimary;

const deptEmails = {
  "Password Reset": passwordResetPrimary,
  "Admin Access": adminAccessPrimary,
  "Payroll Issue": "kishorekumars@sandeza-inc.com",
  "Expense Reimbursement": "kishorekumars@sandeza-inc.com",
  "Leave Request": "allenj@sandeza-inc.com",
  "Employee Onboarding": "allenj@sandeza-inc.com",
};

// ---------------------- Azure Graph Token ----------------------
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

// ---------------------- HTML EMAIL TEMPLATE HELPERS ----------------------
const htmlField = (label, value) => {
  return `<tr><td style="padding:6px 0; font-weight:600; color:#0f172a; width:160px;">${label}</td><td style="padding:6px 0; color:#374151;">${value || '—'}</td></tr>`;
};
const buildHtmlEmail = ({ title, subtitle, statusColor = '#0369a1', fields = [], description = '', actions = [], actionLink = '', actionText = '' }) => {
  const fieldsHtml = fields.map(f => htmlField(f.label, f.value)).join("\n");
  const actionButton = actionLink ? `
    <tr>
      <td colspan="2" style="padding-top:16px; text-align:center;">
        <a href="${actionLink}" style="display:inline-block; background:${statusColor}; color:white; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:700;">${actionText || 'Open Ticket'}</a>
      </td>
    </tr>` : '';

  const extraActions = (actions || []).map(a => `<a href="${a.link}" style="display:inline-block; background:${a.color || statusColor}; color:white; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:700; margin:6px;">${a.text}</a>`).join(" ");

  const extraActionsRow = extraActions ? `
    <tr>
      <td colspan="2" style="padding-top:16px; text-align:center;">
        ${extraActions}
      </td>
    </tr>` : '';

  return `
  <html>
  <body style="font-family: Inter, Roboto, Arial, sans-serif; color:#0f172a; margin:0; padding:0;">
    <table role="presentation" width="100%" style="background:#f8fafc; padding:30px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" style="background:white; border-radius:8px; overflow:hidden; box-shadow:0 6px 24px rgba(2,6,23,0.08);">
            <tr style="background:${statusColor}; color:white;">
              <td style="padding:18px 24px;">
                <h1 style="margin:0; font-size:20px; font-weight:800;">${title}</h1>
                ${subtitle ? `<div style="opacity:0.95; margin-top:6px;">${subtitle}</div>` : ''}
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px;">
                <table role="presentation" width="100%">
                  ${fieldsHtml}
                </table>

                ${description ? `<div style="margin-top:16px; padding:12px; background:#f1f5f9; border-radius:8px; color:#374151; white-space:pre-wrap;">${description}</div>` : ''}

                <table role="presentation" width="100%" style="margin-top:8px;">
                  ${actionButton}
                  ${extraActionsRow}
                </table>

                <p style="margin:18px 0 0; color:#6b7280; font-size:13px;">This is an auto-generated email. Do not reply.</p>
              </td>
            </tr>

            <tr>
              <td style="padding:12px 24px; background:#f8fafc; font-size:12px; color:#9ca3af; text-align:center;">
                Sandeza Helpdesk · IT Support
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};

// ---------------------- Send Email (HTML) ----------------------
const sendEmail = async (to, subject, bodyHtml, cc) => {
  try {
    console.log(`\n📧 [MAIL] Preparing email...`);
    console.log("To:", to);
    console.log("CC:", cc);
    console.log("Subject:", subject);

    const token = await getGraphToken();
    console.log("🔵 [MAIL] Sending email via Microsoft Graph (HTML)...");

    const normalize = (addr) => {
      if (!addr) return [];
      if (Array.isArray(addr))
        return addr.map((a) => ({ emailAddress: { address: a } }));
      return [{ emailAddress: { address: addr } }];
    };

    const mailBody = {
      message: {
        subject,
        body: { contentType: "HTML", content: bodyHtml.trim() },
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

// ---------------------- Azure Helpers (Reset + Group) ----------------------
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

const resetAzurePassword = async (userIdentifier) => {
  const token = await getAccessToken();
  const newPassword = Math.random().toString(36).slice(-10) + "A1!";
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userIdentifier)}`, {
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
    const body = await res.text();
    throw new Error(`Azure reset failed: ${body}`);
  }
  return newPassword;
};

// Find Azure AD user object id by UPN/email
const getUserByUpn = async (upn) => {
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}?$select=id,mail,displayName,userPrincipalName`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    agent: new https.Agent({ rejectUnauthorized: false }),
  });
  if (res.status === 404) {
    throw new Error(`User not found: ${upn}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph lookup failed: ${text}`);
  }
  const data = await res.json();
  return { id: data.id, mail: data.mail || data.userPrincipalName, displayName: data.displayName || null };
};

// Add a user (objectId) to group (groupId)
const AZURE_DEVICE_ADMIN_GROUP_ID = process.env.AZURE_DEVICE_ADMIN_GROUP_ID || "2f32b157-63cd-4486-8136-120c39e030a9";
const addUserToGroup = async (groupId, userObjectId) => {
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members/$ref`;
  const body = { "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userObjectId}` };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    agent: new https.Agent({ rejectUnauthorized: false }),
  });
  if (res.status !== 204 && res.status !== 201) {
    const text = await res.text();
    throw new Error(`Add to group failed: ${res.status} ${text}`);
  }
  return true;
};

// ---------------------- Routes ----------------------------

// Health Check
app.get("/", (req, res) => res.send("Sandeza Helpdesk API Running"));

// Verify User endpoint
app.post("/verify-user", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: "Email is required" });
    }

    const token = await getGraphToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=displayName,mail,userPrincipalName`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (resp.status === 404) {
      return res.json({ exists: false });
    }

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Graph verify error:', resp.status, text);
      return res.status(500).json({ message: 'Graph lookup failed' });
    }

    const data = await resp.json();
    const canonicalMail = data.mail || data.userPrincipalName || email;
    const displayName = data.displayName || null;

    return res.json({ exists: true, displayName, mail: canonicalMail });
  } catch (err) {
    console.error('Verify-user error:', err);
    return res.status(500).json({ message: 'Server error during verification' });
  }
});

// ---------------------- PART 2 ----------------------
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

// Get Ticket by ID (adds categoryHeads for frontend convenience)
app.get("/tickets/:id", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    // derive heads for the ticket category
    let heads = [];
    if (ticket.category === "Password Reset" || ticket.category === "Admin Access") {
      heads = [passwordResetPrimary, passwordResetSecondary].filter(Boolean);
    } else if (deptEmails[ticket.category]) {
      const entry = deptEmails[ticket.category];
      heads = Array.isArray(entry) ? entry : [entry];
    }

    const obj = ticket.toObject();
    obj.categoryHeads = heads.map(h => (h || '').toLowerCase().trim());
    res.json(obj);
  } catch (err) {
    console.error("Error fetching ticket:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------------------- Utility: token generation ----------------------
const genToken = () => crypto.randomBytes(24).toString("hex");
const TOKEN_EXPIRY_HOURS = Number(process.env.TOKEN_EXPIRY_HOURS || 48);
const API_BASE_URL = process.env.API_BASE_URL || "https://ticketing-hn59.onrender.com"; // set to your API base (https://api.example.com)

// Helper to display friendly recipient name
const shortNameFromEmail = (email) => {
  if (!email) return email;
  const l = email.toLowerCase();
  if (l.includes("kodhan")) return "Kodhan";
  if (l.includes("allen") || l.includes("allenj")) return "Allen";
  const parts = email.split("@")[0].split(/[._-]/).map(p => p[0]?.toUpperCase() + p.slice(1));
  return parts.join(" ");
};

// ---------------------- Create Ticket ----------------------
app.post("/tickets", async (req, res) => {
  try {
    const {
      category,
      description,
      priority,
      userId,
      userName,
      userEmail,
      onBehalf,
      onBehalfEmail,
      deliveryEmail,
    } = req.body;
    if (!deptEmails[category]) return res.status(400).json({ error: "Invalid category" });

    // Defensive validation: Password Reset
    if (category === "Password Reset" && (onBehalf === "Self" || !onBehalf) ) {
      if (!deliveryEmail || !deliveryEmail.trim()) {
        return res.status(400).json({ message: "Alternative delivery email is required for self password reset." });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(deliveryEmail.trim())) {
        return res.status(400).json({ message: "Alternative delivery email is not valid." });
      }
    }

    if (category === "Password Reset" && onBehalf === "Other") {
      if (!onBehalfEmail || !onBehalfEmail.trim()) {
        return res.status(400).json({ message: "On-behalf email is required for other password reset." });
      }
      if (!deliveryEmail || !deliveryEmail.trim()) {
        return res.status(400).json({ message: "Delivery email is required when requesting for other user." });
      }
    }

    // Admin Access - no strict validation here, frontend enforces device-admin block
    const approvalRequiredCategories = ["Password Reset", "Admin Access"];
    const initialStatus = approvalRequiredCategories.includes(category) ? "Waiting for approval" : "Open";

    ticketCounter++;

    // Build tokens only when approval required
    const tokens = [];
    if (approvalRequiredCategories.includes(category)) {
      // Heads for this category
      const heads = [passwordResetPrimary, passwordResetSecondary].filter(Boolean);
      for (const head of heads) {
        // create approve and reject tokens per head
        const approveToken = genToken();
        const rejectToken = genToken();
        const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 3600 * 1000);

        tokens.push({ token: approveToken, action: "approve", recipient: head, createdAt: new Date(), expiresAt, used: false });
        tokens.push({ token: rejectToken, action: "reject", recipient: head, createdAt: new Date(), expiresAt, used: false });
      }
    }

    const ticket = await Ticket.create({
      ticketNumber: ticketCounter,
      userId,
      userName,
      userEmail,
      category,
      description,
      priority,
      status: initialStatus,
      onBehalf: onBehalf || "Self",
      onBehalfEmail: onBehalfEmail || "",
      deliveryEmail: deliveryEmail || "",
      emailActionTokens: tokens,
      history: [
        {
          action: "created",
          by: userName,
          at: new Date(),
          reason: null,
        },
      ],
    });

    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const itHead = process.env.IT_HEAD_EMAIL;

    // Creator email
    const creatorHtml = buildHtmlEmail({
      title: `Ticket #${ticketCounter} Created`,
      subtitle: initialStatus === "Waiting for approval" ? "Your ticket is Waiting for approval department approval" : "Your ticket has been created",
      statusColor: "#0ea5e9",
      fields: [
        { label: "Ticket No", value: ticketCounter },
        { label: "Category", value: category },
        { label: "Priority", value: priority },
        { label: "Created At", value: nowIST },
      ],
      description: description,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(userEmail, `Ticket #${ticketCounter} Created`, creatorHtml, itHead);

    // Department notification (build per-head approve/reject buttons using tokens)
    const deptFields = [
      { label: "Ticket No", value: ticketCounter },
      { label: "Created By", value: `${userName} (${userEmail})` },
      { label: "Category", value: category },
      { label: "Priority", value: priority },
      { label: "Delivery Email", value: ticket.deliveryEmail || '—' },
      { label: "Status", value: initialStatus }
    ];

    const actions = [];
    if (approvalRequiredCategories.includes(category)) {
      for (const t of ticket.emailActionTokens) {
        // find friendly name
        const short = shortNameFromEmail(t.recipient);
        const label = `${t.action === "approve" ? "Approve" : "Reject"} — ${short}`;
        const link = `${API_BASE_URL}/tickets/action?token=${t.token}`;
        actions.push({ link, text: label, color: t.action === "approve" ? "#16a34a" : "#dc2626" });
      }
    }

    const deptHtml = buildHtmlEmail({
      title: `New Ticket #${ticketCounter} — ${category}`,
      subtitle: `Action required: please review the ticket${initialStatus === "Waiting for approval" ? ' (approval required)' : ''}.`,
      statusColor: initialStatus === "Waiting for approval" ? "#f59e0b" : "#0ea5e9",
      fields: deptFields,
      description: description,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: initialStatus === "Waiting for approval" ? "Approve / Reject" : "Open Ticket",
      actions
    });

    const deptTo = deptEmails[category];
    const deptCcList = [];
    if (category === "Password Reset" || category === "Admin Access") {
      if (passwordResetSecondary) deptCcList.push(passwordResetSecondary);
    }
    if (itHead) deptCcList.push(itHead);

    await sendEmail(deptTo, `[TICKET #${ticketCounter}] ${category} - Action Required`, deptHtml, deptCcList.length ? deptCcList : itHead);

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Error creating ticket:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- PART 3 ----------------------
// Helper: send notifications for "other heads" (both Password Reset and Admin Access)
const notifyOtherHeads = async ({ ticket, approverDisplay, nowIST, userObj }) => {
  try {
    const approverLower = (approverDisplay || "").toLowerCase();
    const approverEmailGuess = approverLower.includes("kodhan") ? passwordResetPrimary
      : approverLower.includes("allen") ? passwordResetSecondary
      : null;

    let notifyTargets = [];
    if (approverEmailGuess === passwordResetPrimary) notifyTargets = [passwordResetSecondary];
    else if (approverEmailGuess === passwordResetSecondary) notifyTargets = [passwordResetPrimary];
    else notifyTargets = [passwordResetPrimary, passwordResetSecondary];

    const ticketCreator = ticket.userName || ticket.userEmail;
    const affected = (ticket.onBehalfEmail && ticket.onBehalfEmail.trim()) ? ticket.onBehalfEmail : (userObj ? userObj.mail : ticket.userEmail);

    const otherFields = [
      { label: "Ticket No", value: ticket.ticketNumber },
      { label: "Category", value: ticket.category },
      { label: "Approved By", value: approverDisplay },
      { label: "Approved On", value: nowIST },
      { label: "Requested By", value: ticketCreator },
      { label: "Affected User", value: affected }
    ];

    const otherDesc = ticket.onBehalfEmail
      ? `${approverDisplay} has approved the ${ticket.category} request of ${ticketCreator} on behalf of ${ticket.onBehalfEmail}.`
      : `${approverDisplay} has approved the ${ticket.category} request of ${ticketCreator}.`;

    const otherHtml = buildHtmlEmail({
      title: `${ticket.category} Approved — Ticket #${ticket.ticketNumber}`,
      subtitle: `${approverDisplay} approved the request`,
      statusColor: "#0ea5e9",
      fields: otherFields,
      description: otherDesc,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    const itHead = process.env.IT_HEAD_EMAIL;
    for (const t of notifyTargets) {
      await sendEmail(t, `[TICKET #${ticket.ticketNumber}] ${ticket.category} Approved by ${approverDisplay}`, otherHtml, itHead);
    }
  } catch (err) {
    console.error("Error notifying other heads:", err.message);
  }
};

// Core function: perform approval (Password Reset or Admin Access)
const performApproval = async (ticket, approvedBy, note) => {
  const itHead = process.env.IT_HEAD_EMAIL;
  const now = new Date();

  const userIdentifier = ticket.onBehalfEmail || ticket.userId || ticket.userEmail;
  if (!userIdentifier) {
    throw new Error("No user identifier available for approval action");
  }

  if (ticket.status === "Closed") {
    throw new Error("Ticket is already closed");
  }

  if (ticket.category === "Password Reset") {
    // Password Reset flow
    let newPassword;
    try {
      newPassword = await resetAzurePassword(userIdentifier);
    } catch (err) {
      console.error("Password reset failed during approve:", err.message);
      throw new Error("Password reset failed: " + err.message);
    }

    ticket.history.push({
      action: "approved",
      by: approvedBy || "Department Head",
      at: now,
      reason: note || "Approved and password reset performed",
    });

    ticket.status = "Closed";
    ticket.closedBy = approvedBy || "Department Head";
    ticket.closeReason = note ? `Approved: ${note}` : "Approved by Department Head";
    ticket.closedAt = now;

    ticket.history.push({
      action: "closed",
      by: ticket.closedBy,
      at: now,
      reason: ticket.closeReason,
    });

    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // Notify requester and delivery
    const userTitle = `Password Reset Approved — Ticket #${ticket.ticketNumber}`;
    const userFields = [
      { label: "Ticket No", value: ticket.ticketNumber },
      { label: "Category", value: ticket.category },
      { label: "Approved By", value: ticket.closedBy },
      { label: "Approved On", value: nowIST },
      { label: "New Password", value: newPassword},
      { label: "Affected User", value: ticket.onBehalfEmail || ticket.userEmail }
    ];
    const userHtml = buildHtmlEmail({
      title: userTitle,
      subtitle: "Temporary password generated — change on next sign-in",
      statusColor: "#16a34a",
      fields: userFields,
      description: `The new temporary password has been generated and applied successfully. Please sign in and change your password immediately.`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userHtml, itHead);
    if (ticket.deliveryEmail && ticket.deliveryEmail.trim() && ticket.deliveryEmail.trim() !== ticket.userEmail.trim()) {
      await sendEmail(ticket.deliveryEmail.trim(), `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userHtml, itHead);
    }

    // Dept confirmation + notify other head(s)
    const deptTitle = `Ticket #${ticket.ticketNumber} — Approved and Closed`;
    const deptFields = [
      { label: "Ticket No", value: ticket.ticketNumber },
      { label: "Affected User", value: ticket.onBehalfEmail || ticket.userEmail },
      { label: "Closed By", value: ticket.closedBy },
      { label: "Closed On", value: nowIST },
    ];
    const deptHtml = buildHtmlEmail({
      title: deptTitle,
      subtitle: "Password reset performed and ticket closed",
      statusColor: "#16a34a",
      fields: deptFields,
      description: `Password reset performed successfully for user: ${ticket.onBehalfEmail || ticket.userEmail}`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "Open Ticket"
    });

    const deptTo = deptEmails[ticket.category];
    const deptCcList = [passwordResetSecondary];
    if (itHead) deptCcList.push(itHead);
    await sendEmail(deptTo, `[CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, deptHtml, deptCcList);

    // Notify other heads
    await notifyOtherHeads({ ticket, approverDisplay: ticket.closedBy, nowIST });

    return { message: "Ticket approved and password reset performed successfully.", ticket, newPassword };
  } else if (ticket.category === "Admin Access") {
    // Admin Access approval: add user to group then close ticket
    const groupId = AZURE_DEVICE_ADMIN_GROUP_ID;
    if (!groupId) {
      throw new Error("Device admin group not configured (AZURE_DEVICE_ADMIN_GROUP_ID missing)");
    }

    // Resolve user object id
    let userObj;
    try {
      userObj = await getUserByUpn(userIdentifier);
    } catch (err) {
      console.error("Admin approve: user lookup failed:", err.message);
      throw new Error("Failed to find user in Azure AD: " + err.message);
    }

    // Add to group
    try {
      await addUserToGroup(groupId, userObj.id);
    } catch (err) {
      console.error("Admin approve: add to group failed:", err.message);
      throw new Error("Failed to add user to device admin group: " + err.message);
    }

    // Update ticket history and close
    ticket.history.push({
      action: "approved",
      by: approvedBy || "Department Head",
      at: now,
      reason: note || "Approved and device admin access granted",
    });

    ticket.status = "Closed";
    ticket.closedBy = approvedBy || "Department Head";
    ticket.closeReason = note ? `Approved: ${note}` : "Approved by Department Head";
    ticket.closedAt = now;

    ticket.history.push({
      action: "closed",
      by: ticket.closedBy,
      at: now,
      reason: ticket.closeReason,
    });

    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // Notify requester
    const userTitle = `Admin Access Approved — Ticket #${ticket.ticketNumber}`;
    const userFields = [
      { label: "Ticket No", value: ticket.ticketNumber },
      { label: "Category", value: ticket.category },
      { label: "Approved By", value: ticket.closedBy },
      { label: "Approved On", value: nowIST },
      { label: "Added To Group", value: "GS_DeviceAdministrator" },
    ];
    const userHtml = buildHtmlEmail({
      title: userTitle,
      subtitle: "Admin access granted — you have been added to GS_DeviceAdministrator",
      statusColor: "#16a34a",
      fields: userFields,
      description: `Your account (${userObj.mail || userIdentifier}) has been added to the device administrator group. Please sign out and sign in again for group changes to take effect.`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Admin Access Approved`, userHtml, itHead);

    // Dept confirmation
    const deptTitle = `Ticket #${ticket.ticketNumber} — Admin Access Approved and Closed`;
    const deptFields = [
      { label: "Ticket No", value: ticket.ticketNumber },
      { label: "Affected User", value: userObj.mail || userIdentifier },
      { label: "Closed By", value: ticket.closedBy },
      { label: "Closed On", value: nowIST },
    ];
    const deptHtml = buildHtmlEmail({
      title: deptTitle,
      subtitle: "Admin access granted and ticket closed",
      statusColor: "#16a34a",
      fields: deptFields,
      description: `User ${userObj.mail || userIdentifier} was added to GS_DeviceAdministrator by ${ticket.closedBy}.`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "Open Ticket"
    });

    const deptTo = deptEmails[ticket.category];
    const deptCcList = [passwordResetSecondary];
    if (itHead) deptCcList.push(itHead);
    await sendEmail(deptTo, `[CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, deptHtml, deptCcList);

    // Notify other head(s)
    await notifyOtherHeads({ ticket, approverDisplay: ticket.closedBy, nowIST, userObj });

    console.log(`Ticket #${ticket.ticketNumber} (Admin Access) approved by ${ticket.closedBy} and auto-closed.`);

    return { message: "Admin access approved and user added to GS_DeviceAdministrator.", ticket };
  } else {
    throw new Error("Approval is only allowed for Password Reset or Admin Access tickets.");
  }
};

// Core function: perform rejection
const performRejection = async (ticket, rejectedBy, reason) => {
  if (ticket.status === "Closed") {
    throw new Error("Ticket is already closed");
  }

  const now = new Date();

  ticket.history.push({
    action: "rejected",
    by: rejectedBy || "Department Head",
    at: now,
    reason: reason || "Rejected by Department Head",
  });

  ticket.status = "Closed";
  ticket.closedBy = rejectedBy || "Department Head";
  ticket.closeReason = reason ? `Rejected: ${reason}` : "Rejected by Department Head";
  ticket.closedAt = now;

  ticket.history.push({
    action: "closed",
    by: ticket.closedBy,
    at: now,
    reason: ticket.closeReason,
  });

  await ticket.save();

  const nowIST = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const itHead = process.env.IT_HEAD_EMAIL;

  // Notify requester
  const userTitle = `Ticket #${ticket.ticketNumber} — Request Rejected`;
  const userFields = [
    { label: "Ticket No", value: ticket.ticketNumber },
    { label: "Category", value: ticket.category },
    { label: "Reviewed By", value: ticket.closedBy },
    { label: "Reviewed On", value: nowIST },
  ];
  const userHtml = buildHtmlEmail({
    title: userTitle,
    subtitle: "Your request has been reviewed and rejected",
    statusColor: "#dc2626",
    fields: userFields,
    description: `Reason:\n${reason || 'No reason provided.'}\n\nIf you believe this is in error, please contact the department or raise a new ticket.`,
    actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
    actionText: "View Ticket"
  });

  await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Request Rejected`, userHtml, itHead);

  // Dept notification
  const deptHtml = buildHtmlEmail({
    title: `Ticket #${ticket.ticketNumber} — Rejected and Closed`,
    subtitle: `${ticket.closedBy} rejected the request`,
    statusColor: "#dc2626",
    fields: [
      { label: "Ticket No", value: ticket.ticketNumber },
      { label: "Rejected By", value: ticket.closedBy },
      { label: "Rejected On", value: nowIST },
    ],
    description: `The ticket has been rejected'}`,
    actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
    actionText: "Open Ticket"
  });

  const deptTo = deptEmails[ticket.category];
  const deptCcList = [];
  if (ticket.category === "Password Reset" || ticket.category === "Admin Access") deptCcList.push(passwordResetSecondary);
  if (itHead) deptCcList.push(itHead);

  await sendEmail(deptTo, `[CLOSED] Ticket #${ticket.ticketNumber} - Rejected`, deptHtml, deptCcList.length ? deptCcList : itHead);

  console.log(`Ticket #${ticket.ticketNumber} rejected by ${ticket.closedBy} and closed.`);

  return {
    message: "Ticket rejected and closed",
    ticket: {
      _id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      closedBy: ticket.closedBy,
      closeReason: ticket.closeReason,
      closedAt: ticket.closedAt,
      history: ticket.history,
    },
  };
};

// POST approve (original)
app.post("/tickets/:id/approve", async (req, res) => {
  try {
    const { approvedBy, note } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    try {
      const result = await performApproval(ticket, approvedBy || "Department Head", note || "");
      res.json({ message: result.message, ticket: { _id: result.ticket._id, ticketNumber: result.ticket.ticketNumber, status: result.ticket.status, closedBy: result.ticket.closedBy, closeReason: result.ticket.closeReason, closedAt: result.ticket.closedAt, history: result.ticket.history }, newPassword: result.newPassword });
    } catch (err) {
      console.error("Approve error:", err.message);
      res.status(500).json({ message: "Approval failed", error: err.message });
    }
  } catch (err) {
    console.error("Approve endpoint error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// POST reject (original)
app.post("/tickets/:id/reject", async (req, res) => {
  try {
    const { rejectedBy, reason } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    try {
      const result = await performRejection(ticket, rejectedBy || "Department Head", reason || "");
      res.json(result);
    } catch (err) {
      console.error("Reject error:", err.message);
      res.status(500).json({ message: "Reject failed", error: err.message });
    }
  } catch (err) {
    console.error("Reject endpoint error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ---------------------- Tokenized QUICK ACTION endpoint ----------------------
// Accepts: GET /tickets/action?token=<token>
// Finds the ticket that has this token, validates expiry and used flag, then performs the action (approve/reject)
// Marks the token used after successful action.
app.get("/tickets/action", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send(`<html><body><h3>Missing token parameter.</h3></body></html>`);
    }

    // find ticket containing this token
    const ticket = await Ticket.findOne({ "emailActionTokens.token": token });
    if (!ticket) {
      return res.status(404).send(`<html><body><h3>Invalid or expired token (ticket not found).</h3></body></html>`);
    }

    // locate the token object
    const tokenObj = ticket.emailActionTokens.find(t => t.token === token);
    if (!tokenObj) {
      return res.status(404).send(`<html><body><h3>Invalid token.</h3></body></html>`);
    }

    if (tokenObj.used) {
      return res.status(400).send(`<html><body><h3>This action link has already been used.</h3></body></html>`);
    }

    if (tokenObj.expiresAt && new Date() > new Date(tokenObj.expiresAt)) {
      return res.status(400).send(`<html><body><h3>This action link has expired.</h3></body></html>`);
    }

    try {
      // perform the requested action
      if (tokenObj.action === "approve") {
        const result = await performApproval(ticket, tokenObj.recipient, `Approved via email link (${shortNameFromEmail(tokenObj.recipient)})`);
        // mark token used
        tokenObj.used = true;
        await ticket.save();
        return res.send(`<html><body><h3>Success</h3><p>${result.message}</p><p>Ticket #${ticket.ticketNumber} has been approved and closed.</p></body></html>`);
      } else if (tokenObj.action === "reject") {
        const result = await performRejection(ticket, tokenObj.recipient, `Rejected via email link (${shortNameFromEmail(tokenObj.recipient)})`);
        tokenObj.used = true;
        await ticket.save();
        return res.send(`<html><body><h3>Success</h3><p>${result.message}</p><p>Ticket #${ticket.ticketNumber} has been rejected and closed.</p></body></html>`);
      } else {
        return res.status(400).send(`<html><body><h3>Unknown action on token.</h3></body></html>`);
      }
    } catch (err) {
      console.error("Token action processing error:", err.message);
      return res.status(500).send(`<html><body><h3>Error performing action</h3><p>${err.message}</p></body></html>`);
    }
  } catch (err) {
    console.error("Action endpoint error:", err.message);
    res.status(500).send(`<html><body><h3>Server Error</h3><p>${err.message}</p></body></html>`);
  }
});

// ---------------------- PART 4 ----------------------
// Close Ticket
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
      reason: closeReason.trim(),
    });

    ticket.status = "Closed";
    ticket.closedBy = closedBy?.trim() || "IT Head";
    ticket.closeReason = closeReason.trim();
    ticket.closedAt = now;

    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const itHead = process.env.IT_HEAD_EMAIL;

    const emailHtml = buildHtmlEmail({
      title: `Ticket #${ticket.ticketNumber} — Closed`,
      subtitle: "This ticket has been closed",
      statusColor: "#dc2626",
      fields: [
        { label: "Category", value: ticket.category },
        { label: "Priority", value: ticket.priority },
        { label: "Created By", value: `${ticket.userName} (${ticket.userEmail})` },
        { label: "Ticket Number", value: `#${ticket.ticketNumber}` },
        { label: "Closed By", value: ticket.closedBy },
        { label: "Closed On", value: nowIST }
      ],
      description: `Reason for closing:\n${ticket.closeReason}`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Closed`, emailHtml, itHead);

    const deptTo = deptEmails[ticket.category];
    const deptCcList = [];
    if (ticket.category === "Password Reset" || ticket.category === "Admin Access") deptCcList.push(passwordResetSecondary);
    if (itHead) deptCcList.push(itHead);
    await sendEmail(deptTo, `[CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, emailHtml, deptCcList.length ? deptCcList : itHead);

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
        history: ticket.history,
      },
    });
  } catch (err) {
    console.error("Close ticket error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Revive Ticket
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
      reason: reviveReason.trim(),
    });

    ticket.status = "Open";
    ticket.reopenedBy = revivedBy?.trim() || "Unknown User";
    ticket.reopenedAt = now;
    ticket.reviveReason = reviveReason.trim();

    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const dept = deptEmails[ticket.category] || "helpdesk@sandeza-inc.com";
    const itHead = process.env.IT_HEAD_EMAIL;

    const emailHtml = buildHtmlEmail({
      title: `Ticket #${ticket.ticketNumber} — Revived (Reopened)`,
      subtitle: "This ticket has been reopened and requires attention",
      statusColor: "#16a34a",
      fields: [
        { label: "Category", value: ticket.category },
        { label: "Priority", value: ticket.priority },
        { label: "Created By", value: `${ticket.userName} (${ticket.userEmail})` },
        { label: "Ticket Number", value: `#${ticket.ticketNumber}` },
        { label: "Revived By", value: ticket.reopenedBy },
        { label: "Revived On", value: nowIST }
      ],
      description: `Reason for reviving:\n${ticket.reviveReason}`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Revived`, emailHtml, itHead);
    const deptCcList = [];
    if (ticket.category === "Password Reset" || ticket.category === "Admin Access") deptCcList.push(passwordResetSecondary);
    if (itHead) deptCcList.push(itHead);
    await sendEmail(dept, `[REVIVED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, emailHtml, deptCcList.length ? deptCcList : itHead);

    console.log(`Ticket #${ticket.ticketNumber} revived by ${ticket.reopenedBy}`);

    res.json({
      message: "Ticket revived successfully",
      ticket: {
        _id: ticket._id,
        status: "Open",
        reopenedBy: ticket.reopenedBy,
        reviveReason: ticket.reviveReason,
        reopenedAt: ticket.reopenedAt,
        history: ticket.history,
      },
    });
  } catch (err) {
    console.error("Revive ticket error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT} (Tokenized email-action links enabled)`)
);
// ---------------------- END PART 4 ----------------------