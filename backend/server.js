// server.js (FULL UPDATED)
// ---------------------- PART 1 ----------------------
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
    reopenReason: String,
    closedAt: Date,
    reopenedBy: String,
    reopenedAt: Date,

    // new fields to support "on behalf" password reset flow
    onBehalf: { type: String }, // 'Self' or 'Other'
    onBehalfEmail: { type: String }, // when onBehalf === 'Other'
    deliveryEmail: { type: String },

    history: [
      {
        action: { type: String, enum: ["created", "closed", "reopend", "approved", "rejected"] },
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
  "Password Reset": "allenj@sandeza-inc.com",
  "Admin Access": "vigneshm@sandeza-inc.com",
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

// returns a small HTML block for a labelled field
const htmlField = (label, value) => {
  return `<tr><td style="padding:6px 0; font-weight:600; color:#0f172a; width:160px;">${label}</td><td style="padding:6px 0; color:#374151;">${value || '—'}</td></tr>`;
};

// build professional HTML email with header color
const buildHtmlEmail = ({ title, subtitle, statusColor = '#0369a1', fields = [], description = '', actionLink = '', actionText = '' }) => {
  // sanitize simple use (you may improve escaping if needed)
  const fieldsHtml = fields.map(f => htmlField(f.label, f.value)).join("\n");
  const actionButton = actionLink ? `
    <tr>
      <td colspan="2" style="padding-top:16px; text-align:center;">
        <a href="${actionLink}" style="display:inline-block; background:${statusColor}; color:white; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:700;">${actionText || 'Open Ticket'}</a>
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

// ---------------------- Send Email (now sends HTML) ----------------------
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

// ---------------------- Routes ----------------------------

// Health Check
app.get("/", (req, res) => res.send("Sandeza Helpdesk API Running"));

// ---------------------- NEW: Verify User endpoint ----------------------
// POST /verify-user
// body: { email: "target@company.com" }
// returns: { exists: true/false, displayName?: string, mail?: string }
app.post("/verify-user", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: "Email is required" });
    }

    const token = await getGraphToken();

    // Query Graph for user by UPN (email). If not found, Graph returns 404.
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
// ---------------------- END PART 1 ----------------------
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

// Create Ticket (ensure this uses status: "Pending" only for Password Reset and accepts deliveryEmail/onBehalfEmail)
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

    // Defensive validation: If Password Reset + Self -> deliveryEmail (alternative) is required
    if (category === "Password Reset" && (onBehalf === "Self" || !onBehalf) ) {
      if (!deliveryEmail || !deliveryEmail.trim()) {
        return res.status(400).json({ message: "Alternative delivery email is required for self password reset." });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(deliveryEmail.trim())) {
        return res.status(400).json({ message: "Alternative delivery email is not valid." });
      }
    }

    // If Password Reset + Other -> ensure onBehalfEmail present (frontend verifies existence)
    if (category === "Password Reset" && onBehalf === "Other") {
      if (!onBehalfEmail || !onBehalfEmail.trim()) {
        return res.status(400).json({ message: "On-behalf email is required for other password reset." });
      }
      // deliveryEmail still required
      if (!deliveryEmail || !deliveryEmail.trim()) {
        return res.status(400).json({ message: "Delivery email is required when requesting for other user." });
      }
    }

    // Decide initial status based on category
    const initialStatus = category === "Password Reset" ? "Pending" : "Open";

    ticketCounter++;
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

    // ---------- SEND CREATOR EMAIL (HTML) ----------
    const creatorTitle = `Ticket #${ticketCounter} Created`;
    const creatorSubtitle = initialStatus === "Pending" ? "Your ticket is pending department approval" : "Your ticket has been created";
    const creatorFields = [
      { label: "Ticket No", value: ticketCounter },
      { label: "Category", value: category },
      { label: "Priority", value: priority },
      { label: "Created At", value: nowIST },
    ];
    const creatorHtml = buildHtmlEmail({
      title: creatorTitle,
      subtitle: creatorSubtitle,
      statusColor: "#0ea5e9", // blue for created
      fields: creatorFields,
      description: description,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(
      userEmail,
      `Ticket #${ticketCounter} Created`,
      creatorHtml,
      itHead
    );

    // ---------- SEND DEPARTMENT HEAD EMAIL (HTML) FOR ALL CATEGORIES ----------
    // Previously dept notification was only sent for Pending (Password Reset). Now send for all.
    const deptTitle = `New Ticket #${ticketCounter} — ${category}`;
    const deptSubtitle = `Action required: please review the ticket${initialStatus === "Pending" ? ' (approval required)' : ''}.`;
    const deptFields = [
      { label: "Ticket No", value: ticketCounter },
      { label: "Created By", value: `${userName} (${userEmail})` },
      { label: "Category", value: category },
      { label: "Priority", value: priority },
      { label: "Delivery Email", value: ticket.deliveryEmail || '—' },
      { label: "Status", value: initialStatus }
    ];
    const deptHtml = buildHtmlEmail({
      title: deptTitle,
      subtitle: deptSubtitle,
      statusColor: initialStatus === "Pending" ? "#f59e0b" : "#0ea5e9", // amber if pending else blue
      fields: deptFields,
      description: description,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: initialStatus === "Pending" ? "Approve / Reject" : "Open Ticket"
    });

    // send to category head (always) — use deptEmails mapping
    await sendEmail(
      deptEmails[category],
      `[TICKET #${ticketCounter}] ${category} - Action Required`,
      deptHtml,
      itHead
    );

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Error creating ticket:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});
// ---------------------- END PART 2 ----------------------
// ---------------------- PART 3 ----------------------

// Approve endpoint
app.post("/tickets/:id/approve", async (req, res) => {
  try {
    const { approvedBy, note } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.status === "Closed") {
      return res.status(400).json({ message: "Ticket is already closed" });
    }

    // SAFETY: Only allow approve flow for Password Reset category
    if (ticket.category !== "Password Reset") {
      return res.status(400).json({ message: "Approval is only allowed for Password Reset tickets." });
    }

    // Determine which user to reset: if onBehalfEmail provided use it, else try userId then userEmail
    const userIdentifier = ticket.onBehalfEmail || ticket.userId || ticket.userEmail;
    if (!userIdentifier) {
      return res.status(400).json({ message: "No user identifier available to reset password" });
    }

    // Perform Azure password reset
    let newPassword;
    try {
      newPassword = await resetAzurePassword(userIdentifier);
    } catch (err) {
      console.error("Password reset failed during approve:", err.message);
      return res.status(500).json({ message: "Password reset failed", error: err.message });
    }

    // Update ticket history and close it
    const now = new Date();

    ticket.history.push({
      action: "approved",
      by: approvedBy || "Department Head",
      at: now,
      reason: note || "Approved and password reset performed",
    });

    // Mark closed and add close history entry
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

    const itHead = process.env.IT_HEAD_EMAIL;

    // Build HTML bodies
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
      statusColor: "#16a34a", // green for approved
      fields: userFields,
      description: `The new temporary password has appreoved aand resetted sucessfullty, Please sign in and change your password immediately.`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    // Notify requestor primary email (HTML)
    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userHtml, itHead);

    // Notify deliveryEmail if provided and different
    if (ticket.deliveryEmail && ticket.deliveryEmail.trim() && ticket.deliveryEmail.trim() !== ticket.userEmail.trim()) {
      await sendEmail(ticket.deliveryEmail.trim(), `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userHtml, itHead);
    }

    // Notify department (confirmation)
    const deptTitle = `Ticket #${ticket.ticketNumber} — Closed`;
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
      description: `Password restted successfully for user: ${ticket.onBehalfEmail || ticket.userEmail}`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "Open Ticket"
    });

    await sendEmail(deptEmails[ticket.category], `[CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, deptHtml, itHead);

    console.log(`Ticket #${ticket.ticketNumber} approved by ${ticket.closedBy} and auto-closed.`);

    res.json({
      message: "Ticket approved and password reset performed sucessfully.",
      ticket: {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        closedBy: ticket.closedBy,
        closeReason: ticket.closeReason,
        closedAt: ticket.closedAt,
        history: ticket.history,
      },
      newPassword,
    });
  } catch (err) {
    console.error("Approve error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Reject endpoint (keeps behavior: closes and notifies)
app.post("/tickets/:id/reject", async (req, res) => {
  try {
    const { rejectedBy, reason } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.status === "Closed") {
      return res.status(400).json({ message: "Ticket is already closed" });
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

    // Build HTML user notification (rejected)
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
      statusColor: "#dc2626", // red for rejected
      fields: userFields,
      description: `Reason:\n${reason || 'No reason provided.'}\n\nIf you believe this is in error, please contact the department or raise a new ticket.`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Request Rejected`, userHtml, itHead);

    // Notify department (confirmation)
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

    await sendEmail(deptEmails[ticket.category], `[CLOSED] Ticket #${ticket.ticketNumber} - Rejected`, deptHtml, itHead);

    console.log(`Ticket #${ticket.ticketNumber} rejected by ${ticket.closedBy} and closed.`);

    res.json({
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
    });
  } catch (err) {
    console.error("Reject error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// ---------------------- END PART 3 ----------------------
// ---------------------- PART 4 ----------------------

// Close Ticket (manual close - unchanged but kept tidy)
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

    // HTML email for closed
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
    await sendEmail(deptEmails[ticket.category], `[CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, emailHtml, itHead);

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

// reopen Ticket
app.put("/tickets/:id/reopen", async (req, res) => {
  try {
    const { reopendBy, reopenReason } = req.body;

    if (!reopenReason || reopenReason.trim() === "") {
      return res.status(400).json({ message: "reopen reason is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status !== "Closed") {
      return res.status(400).json({ message: "Only closed tickets can be reopend" });
    }

    const now = new Date();

    ticket.history.push({
      action: "reopend",
      by: reopendBy?.trim() || "Unknown User",
      at: now,
      reason: reopenReason.trim(),
    });

    ticket.status = "Open";
    ticket.reopenedBy = reopendBy?.trim() || "Unknown User";
    ticket.reopenedAt = now;
    ticket.reopenReason = reopenReason.trim();

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
      title: `Ticket #${ticket.ticketNumber} — reopend (Reopened)`,
      subtitle: "This ticket has been reopened and requires attention",
      statusColor: "#16a34a",
      fields: [
        { label: "Category", value: ticket.category },
        { label: "Priority", value: ticket.priority },
        { label: "Created By", value: `${ticket.userName} (${ticket.userEmail})` },
        { label: "Ticket Number", value: `#${ticket.ticketNumber}` },
        { label: "reopend By", value: ticket.reopenedBy },
        { label: "reopend On", value: nowIST }
      ],
      description: `Reason for reviving:\n${ticket.reopenReason}`,
      actionLink: `${process.env.PROD_URL || "https://ticketing-psi-tawny.vercel.app"}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] reopend`, emailHtml, itHead);
    await sendEmail(dept, `[reopenD] Ticket #${ticket.ticketNumber} - ${ticket.category}`, emailHtml, itHead);

    console.log(`Ticket #${ticket.ticketNumber} reopend by ${ticket.reopenedBy}`);

    res.json({
      message: "Ticket reopend successfully",
      ticket: {
        _id: ticket._id,
        status: "Open",
        reopenedBy: ticket.reopenedBy,
        reopenReason: ticket.reopenReason,
        reopenedAt: ticket.reopenedAt,
        history: ticket.history,
      },
    });
  } catch (err) {
    console.error("reopen ticket error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT} (Full History Enabled)`)
);
// ---------------------- END PART 4 ----------------------
