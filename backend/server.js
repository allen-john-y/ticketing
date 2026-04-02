// server.js (FULL UPDATED - WITH CATEGORY NOTIFICATIONS)
// ---------------------- Imports -------------------------
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
const https = require("https");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const archiver = require("archiver");
require("dotenv").config();

// ---------------------- App Setup ------------------------
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: '25mb' }));

// ---------------------- CORS ------------------------------
const allowedOrigins = [
  process.env.CORS_ORIGIN?.trim(),
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, '');
      const allowed = allowedOrigins
        .filter(Boolean)
        .map(o => o.replace(/\/$/, ''));
      if (allowed.includes(cleanOrigin)) {
        return callback(null, true);
      }
      console.log("❌ Blocked by CORS:", cleanOrigin, "Allowed:", allowed);
      return callback(null, false);
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
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};
connectDB();

// ===================== SCHEMAS =====================

// -------- Ticket Schema --------
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
    onBehalf: { type: String },
    onBehalfEmail: { type: String },
    deliveryEmail: { type: String },
    approvalRequired: { type: Boolean, default: false },
    subCategory: { type: String },
    subQuery: { type: String },
    otherSubQueryText: { type: String },
    attachment: {
      fileName: { type: String },
      fileType: { type: String },
      fileUrl: { type: String }
    },
    approvers: [
      {
        type: String
      }
    ],
    attachments: [
      {
        fileName: { type: String },
        fileType: { type: String },
        fileUrl: { type: String },
        id: { type: String },
        driveId: { type: String }
      }
    ],
    history: [
      {
        action: {
          type: String,
          enum: ['created', 'closed', 'revived', 'approved', 'rejected', 'status_updated'],
        },
        by: String,
        at: { type: Date, default: Date.now },
        reason: String,
        attachment: {
          fileName: { type: String },
          fileType: { type: String },
          fileUrl: { type: String }
        }
      },
    ],
  },
  { timestamps: true }
);

const Ticket = mongoose.model('Ticket', ticketSchema);

// -------- Category Config Schema --------
const categoryConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    categoryName: { type: String, required: true },
    type: {
      type: String,
      enum: ["NORMAL", "PASSWORD_RESET", "ADMIN_ACCESS"],
      default: "NORMAL"
    },
    distributionList: {
      id: { type: String, required: true, unique: true },
      name: { type: String },
      mail: { type: String },
      mailNickname: { type: String }
    },
    subCategories: [
      {
        name: { type: String, required: true },
        description: { type: String, default: '' }, // ✅ added
        onBehalf: {
          enabled: { type: Boolean, default: false },
          required: { type: Boolean, default: false }
        },
        attachments: {
          enabled: { type: Boolean, default: false },
          required: { type: Boolean, default: false }
        },
        approval: {
          requireApproval: { type: Boolean, default: false },
          reportingManager: { type: Boolean, default: false },
          otherApprovers: [
            {
              id: { type: String },
              email: { type: String },
              name: { type: String }
            }
          ],
          requireAll: { type: Boolean, default: false }
        }
      }
    ],
    cc: [
      { id: String, email: String, name: String }
    ],
    dlGroupMembers: [
      { id: String, email: String, displayName: String }
    ],
    dlGroupOwners: [
      { id: String, email: String, displayName: String }
    ],
    createdBy: { id: String, name: String, mail: String },
    updatedBy: { id: String, name: String, mail: String }
  },
  { timestamps: true }
);

categoryConfigSchema.index({ "distributionList.id": 1 }, { unique: true });

const CategoryConfig = mongoose.model("CategoryConfig", categoryConfigSchema);

// ---------------------- Counter ---------------------------
let ticketCounter = 0;
const loadCounter = async () => {
  try {
    const last = await Ticket.findOne().sort({ ticketNumber: -1 });
    ticketCounter = last ? last.ticketNumber : 0;
    console.log("✅ Ticket counter loaded:", ticketCounter);
  } catch (err) {
    console.error("❌ Error loading counter:", err.message);
  }
};
loadCounter();

// ===================== AZURE HELPERS =====================

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

// ===================== EMAIL HELPERS =====================

const htmlField = (label, value) => {
  return `<tr><td style="padding:6px 0; font-weight:600; color:#0f172a; width:160px;">${label}</td><td style="padding:6px 0; color:#374151;">${value || '—'}</td></tr>`;
};

const buildHtmlEmail = ({ title, subtitle, statusColor = '#0369a1', fields = [], description = '', actionLink = '', actionText = '' }) => {
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

const sendEmail = async (to, subject, bodyHtml, cc) => {
  try {
    console.log(`\n📧 [MAIL] Preparing email...`);
    console.log("To:", to);
    console.log("CC:", cc);
    console.log("Subject:", subject);

    const token = await getGraphToken();

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

    const sender = process.env.AZURE_SENDER_EMAIL;

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

    await res.text();
    console.log("🔍 [MAIL] Graph Response Status:", res.status);

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

// ===================== CATEGORY NOTIFICATION HELPERS =====================

// Collect all unique other-approvers across all subcategories
const collectOtherApprovers = (subCategories = []) => {
  const seen = new Set();
  const result = [];
  for (const sub of subCategories) {
    for (const approver of sub.approval?.otherApprovers || []) {
      const email = (approver.email || '').toLowerCase().trim();
      if (email && !seen.has(email)) {
        seen.add(email);
        result.push({ email, name: approver.name || email });
      }
    }
  }
  return result;
};

// Get unique emails from dlGroupMembers or dlGroupOwners arrays
const pluckEmails = (arr = []) =>
  [...new Set(arr.map(x => (x.email || '')).filter(Boolean))];

// Human-readable subcategory feature summary for email body
const subCatSummaryText = (subCategories = []) => {
  return subCategories.map((sub, i) => {
    const features = [];
    if (sub.onBehalf?.enabled)
      features.push(`On-Behalf${sub.onBehalf.required ? ' (required)' : ''}`);
    if (sub.attachments?.enabled)
      features.push(`Attachments${sub.attachments.required ? ' (required)' : ''}`);
    if (sub.approval?.requireApproval) {
      const who = sub.approval.reportingManager ? 'Reporting Manager'
        : sub.approval.requireAll              ? 'DL Group Members'
        : sub.approval.otherApprovers?.length  ? `Custom (${sub.approval.otherApprovers.length} approver${sub.approval.otherApprovers.length > 1 ? 's' : ''})`
        : 'Not configured';
      features.push(`Approval → ${who}`);
    }
    const featureLine = features.length
      ? `  Features: ${features.join(', ')}`
      : '  No optional features';
    return `${i + 1}. ${sub.name}\n${featureLine}`;
  }).join('\n\n');
};

// Diff two subcategory arrays — returns array of human-readable change strings
const diffSubCategories = (oldSubs = [], newSubs = []) => {
  const changes = [];
  const oldByName = Object.fromEntries(oldSubs.map(s => [s.name.toLowerCase(), s]));
  const newByName = Object.fromEntries(newSubs.map(s => [s.name.toLowerCase(), s]));

  // Added
  for (const sub of newSubs) {
    if (!oldByName[sub.name.toLowerCase()])
      changes.push(`+ Sub-category added: "${sub.name}"`);
  }

  // Removed
  for (const sub of oldSubs) {
    if (!newByName[sub.name.toLowerCase()])
      changes.push(`- Sub-category removed: "${sub.name}"`);
  }

  // Modified
  for (const newSub of newSubs) {
    const oldSub = oldByName[newSub.name.toLowerCase()];
    if (!oldSub) continue;

    const subChanges = [];

    // Attachments
    const oA = oldSub.attachments || {}, nA = newSub.attachments || {};
    if (oA.enabled !== nA.enabled)
      subChanges.push(nA.enabled ? 'Attachments enabled' : 'Attachments disabled');
    else if (nA.enabled && oA.required !== nA.required)
      subChanges.push(nA.required ? 'Attachments set to required' : 'Attachments set to optional');

    // On-Behalf
    const oO = oldSub.onBehalf || {}, nO = newSub.onBehalf || {};
    if (oO.enabled !== nO.enabled)
      subChanges.push(nO.enabled ? 'On-Behalf enabled' : 'On-Behalf disabled');
    else if (nO.enabled && oO.required !== nO.required)
      subChanges.push(nO.required ? 'On-Behalf set to required' : 'On-Behalf set to optional');

    // Approval
    const oAp = oldSub.approval || {}, nAp = newSub.approval || {};
    if (oAp.requireApproval !== nAp.requireApproval)
      subChanges.push(nAp.requireApproval ? 'Approval requirement enabled' : 'Approval requirement removed');
    if (nAp.requireApproval && oAp.requireApproval) {
      if (oAp.reportingManager !== nAp.reportingManager)
        subChanges.push(nAp.reportingManager ? 'Reporting Manager approval added' : 'Reporting Manager approval removed');
      if (oAp.requireAll !== nAp.requireAll)
        subChanges.push(nAp.requireAll ? 'DL Members approval added' : 'DL Members approval removed');
      const oldCount = (oAp.otherApprovers || []).length;
      const newCount = (nAp.otherApprovers || []).length;
      if (oldCount !== newCount)
        subChanges.push(`Custom approvers changed (${oldCount} → ${newCount})`);
    }

    if (subChanges.length > 0) {
      changes.push(`✎ "${newSub.name}" changed:`);
      subChanges.forEach(c => changes.push(`   • ${c}`));
    }
  }

  return changes;
};

// ===================== AZURE AD HELPERS =====================

const resetAzurePassword = async (userIdentifier) => {
  const token = await getAccessToken();
  const newPassword = Math.random().toString(36).slice(-10) + "A1!";
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userIdentifier)}`,
    {
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
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Azure reset failed: ${body}`);
  }

  return newPassword;
};

const AZURE_DEVICE_ADMIN_GROUP_ID = process.env.AZURE_DEVICE_ADMIN_GROUP_ID;

const addUserToGroup = async (groupId, userObjectId, retries = 2) => {
  console.log(`🔵 [ADD TO GROUP] Attempting to add user ${userObjectId} to group ${groupId}`);
  if (!groupId || !userObjectId) throw new Error("groupId and userObjectId are required");

  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      console.log(`🔵 [ADD TO GROUP] Attempt ${attempt}/${retries + 1}`);
      const token = await getAccessToken();
      const url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members/$ref`;
      const body = { "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userObjectId}` };

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        agent: new https.Agent({ rejectUnauthorized: false }),
      });

      console.log(`🔵 [ADD TO GROUP] Response status: ${res.status}`);

      if (res.status === 204 || res.status === 201) {
        console.log(`✅ [ADD TO GROUP] Successfully added user to group`);
        return true;
      }

      const responseText = await res.text();
      let errorData;
      try { errorData = JSON.parse(responseText); } catch (e) { errorData = { message: responseText }; }
      const errorMessage = (errorData?.error?.message || errorData?.message || '').toLowerCase();

      if (errorMessage.includes('already exists') || errorMessage.includes('already a member') || errorMessage.includes('one or more added object references already exist')) {
        console.log(`ℹ️ [ADD TO GROUP] User is already a member - treating as success`);
        return true;
      }

      lastError = new Error(`Add to group failed (${res.status}): ${errorMessage || responseText}`);
      if (res.status === 400 || res.status === 404) throw lastError;

      if (attempt < retries + 1) {
        const waitTime = attempt * 1000;
        console.log(`⏳ [ADD TO GROUP] Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (err) {
      console.error(`❌ [ADD TO GROUP] Attempt ${attempt} failed:`, err.message);
      lastError = err;
      if (attempt < retries + 1) {
        const waitTime = attempt * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(`❌ [ADD TO GROUP] All ${retries + 1} attempts failed`);
  throw lastError || new Error('Add to group failed after all retries');
};

const getUserByUpn = async (upn) => {
  console.log(`🔍 [GET USER] Looking up user: ${upn}`);
  if (!upn) throw new Error('UPN is required');

  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}?$select=id,mail,displayName,userPrincipalName`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      agent: new https.Agent({ rejectUnauthorized: false }),
    });

    if (res.status === 404) throw new Error(`User not found: ${upn}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph lookup failed: ${text}`);
    }

    const data = await res.json();
    return { id: data.id, mail: data.mail || data.userPrincipalName, displayName: data.displayName || null };
  } catch (err) {
    console.error(`❌ [GET USER] Error:`, err.message);
    throw err;
  }
};
const getManagerEmail = async (userEmail) => {
  try {
    const token = await getAccessToken();

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/manager?$select=mail,userPrincipalName,displayName`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!res.ok) {
      console.log("⚠️ Manager not found for:", userEmail);
      return null;
    }

    const data = await res.json();

    return data.mail || data.userPrincipalName || null;

  } catch (err) {
    console.error("❌ Error fetching manager:", err.message);
    return null;
  }
};

// ===================== UPLOAD HANDLER =====================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const { uploadToSharePoint } = require("./utils/sharepointUpload");

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const result = await uploadToSharePoint(req.file);
    return res.json({
      id: result.id,
      driveId: result.driveId || null,
      fileName: result.fileName,
      fileType: result.fileType,
      url: result.fileUrl
    });
  } catch (err) {
    console.error('❌ SharePoint upload error:', err);
    return res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

// ===================== MAIN ROUTES =====================

app.get("/", (req, res) => res.send("✅ Sandeza Helpdesk API Running"));

// -------- Verify User --------
app.post("/verify-user", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string')
      return res.status(400).json({ message: "Email is required" });

    const token = await getGraphToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=displayName,mail,userPrincipalName`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (resp.status === 404) return res.json({ exists: false });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('❌ Graph verify error:', resp.status, text);
      return res.status(500).json({ message: 'Graph lookup failed' });
    }

    const data = await resp.json();
    return res.json({
      exists: true,
      displayName: data.displayName || null,
      mail: data.mail || data.userPrincipalName || email
    });
  } catch (err) {
    console.error('❌ Verify-user error:', err);
    return res.status(500).json({ message: 'Server error during verification' });
  }
});

// -------- Admin Notifications --------
app.post("/api/notify-admin-added", async (req, res) => {
  try {
    const { actor, target } = req.body || {};
    if (!actor || !target) return res.status(400).json({ message: "actor and target are required" });

    const actorName = actor.name || actor.mail || "Unknown";
    const actorMail = actor.mail || null;
    const targetName = target.name || target.mail || "Unknown";
    const targetMail = target.mail || null;
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const actorHtml = buildHtmlEmail({
      title: `Admin Added — ${targetName} added to Helpdesk_Admin`,
      subtitle: "Adding new admin completed successfully",
      statusColor: "#16a34a",
      fields: [
        { label: "Action", value: "Add Admin" },
        { label: "Performed By", value: actorName },
        { label: "Added User", value: `${targetName} (${targetMail || '—'})` },
        { label: "When (IST)", value: nowIST },
      ],
      description: `You have successfully added ${targetName} as a Helpdesk Admin.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    const targetHtml = buildHtmlEmail({
      title: `You were added as Helpdesk Admin`,
      subtitle: `You have been granted admin rights in Helpdesk`,
      statusColor: "#0ea5e9",
      fields: [
        { label: "Added By", value: actorName },
        { label: "When (IST)", value: nowIST },
        { label: "Group", value: "Helpdesk_Admin" },
      ],
      description: `You are added as new admin in Helpdesk portal by ${actorName}. If this was unexpected, please contact your IT department.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    const actorSend = actorMail ? await sendEmail(actorMail, `Admin Added — ${targetName} added to Helpdesk_Admin`, actorHtml) : false;
    const targetSend = targetMail ? await sendEmail(targetMail, `You were added as Helpdesk Admin`, targetHtml) : false;

    return res.json({ message: "Notification attempted", actorNotified: !!actorSend, targetNotified: !!targetSend });
  } catch (err) {
    console.error("❌ notify-admin-added error:", err);
    return res.status(500).json({ message: "Failed to send admin-added notifications", error: err.message });
  }
});

app.post("/api/notify-admin-removed", async (req, res) => {
  try {
    const { actor, target } = req.body || {};
    if (!actor || !target) return res.status(400).json({ message: "actor and target are required" });

    const actorName = actor.name || actor.mail || "Unknown";
    const actorMail = actor.mail || null;
    const targetName = target.name || target.mail || "Unknown";
    const targetMail = target.mail || null;
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const actorHtml = buildHtmlEmail({
      title: `Admin Removed — ${targetName} removed from Helpdesk_Admin`,
      subtitle: "Admin removal completed successfully",
      statusColor: "#16a34a",
      fields: [
        { label: "Action", value: "Remove Admin" },
        { label: "Performed By", value: actorName },
        { label: "Removed User", value: `${targetName} (${targetMail || '—'})` },
        { label: "When (IST)", value: nowIST },
      ],
      description: `You have successfully removed ${targetName} from Helpdesk Admins.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    const targetHtml = buildHtmlEmail({
      title: `You were removed from Helpdesk Admins`,
      subtitle: `Your admin rights were revoked`,
      statusColor: "#dc2626",
      fields: [
        { label: "Removed By", value: actorName },
        { label: "When (IST)", value: nowIST },
        { label: "Group", value: "Helpdesk_Admin" },
      ],
      description: `You are removed from admin in Helpdesk portal by ${actorName}. If this was unexpected, please contact your IT department.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    const actorSend = actorMail ? await sendEmail(actorMail, `Admin Removed — ${targetName} removed from Helpdesk_Admin`, actorHtml) : false;
    const targetSend = targetMail ? await sendEmail(targetMail, `You were removed from Helpdesk Admins`, targetHtml,) : false;

    return res.json({ message: "Notification attempted", actorNotified: !!actorSend, targetNotified: !!targetSend });
  } catch (err) {
    console.error("❌ notify-admin-removed error:", err);
    return res.status(500).json({ message: "Failed to send admin-removed notifications", error: err.message });
  }
});

// -------- PUT /tickets/:id/status --------
app.put("/tickets/:id/status", async (req, res) => {
  try {
    const { status, note, updatedBy, updatedByEmail } = req.body;
    const VALID_STATUSES = ["Open","In Progress","Waiting for approval","Approved","Rejected","On Hold","Resolved","Closed"];

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const previousStatus = ticket.status;
    if (previousStatus === status) return res.status(400).json({ message: `Ticket is already in "${status}" status` });

    const now = new Date();
    const adminName = updatedBy || "Admin";

    ticket.history.push({
      action: "status_updated",
      by: adminName,
      at: now,
      reason: note
        ? `Status changed from "${previousStatus}" to "${status}". Note: ${note}`
        : `Status changed from "${previousStatus}" to "${status}"`,
      newStatus: status,
      previousStatus: previousStatus,
    });

    ticket.status = status;
    if (status === "Closed") {
      ticket.closedBy = adminName;
      ticket.closeReason = note || `Closed by admin (${adminName})`;
      ticket.closedAt = now;
    }

    await ticket.save();
    console.log(`✅ [STATUS UPDATE] Ticket #${ticket.ticketNumber} → "${status}" by ${adminName}`);

    res.json({
      message: "Status updated successfully",
      ticket: { _id: ticket._id, ticketNumber: ticket.ticketNumber, status: ticket.status, history: ticket.history },
    });

    setImmediate(async () => {
      try {
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

        const catCfg = await CategoryConfig.findOne({
          name: { $regex: new RegExp("^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") },
        });

        const deptTo = (catCfg?.dlGroupMembers || []).map(h => h.email).filter(Boolean);
        const ccEmails = (catCfg?.cc || []).map(c => c.email).filter(Boolean);

        const statusColor = {
          "Open": "#3b82f6", "In Progress": "#8b5cf6", "Waiting for approval": "#f59e0b",
          "Approved": "#10b981", "Rejected": "#ef4444", "On Hold": "#6b7280",
          "Resolved": "#059669", "Closed": "#dc2626",
        }[status] || "#0ea5e9";

        const commonFields = [
          { label: "Ticket No", value: `#${ticket.ticketNumber}` },
          { label: "Category", value: ticket.category },
          { label: "Previous Status", value: previousStatus },
          { label: "New Status", value: status },
          { label: "Updated By", value: adminName },
          { label: "Updated At (IST)", value: nowIST },
        ];
        if (ticket.subCategory) commonFields.splice(2, 0, { label: "Sub-Category", value: ticket.subCategory });

        const submitterHtml = buildHtmlEmail({
          title: `Ticket #${ticket.ticketNumber} — Status Updated`,
          subtitle: `Your ticket status has changed to "${status}"`,
          statusColor,
          fields: commonFields,
          description: note ? `Admin note:\n${note}` : `Your ticket status has been updated.`,
          actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
          actionText: "View Ticket",
        });

        await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Status Updated → ${status}`, submitterHtml, ccEmails.length ? ccEmails : null);

        if (deptTo.length > 0) {
          const deptHtml = buildHtmlEmail({
            title: `Ticket #${ticket.ticketNumber} — Status Changed to "${status}"`,
            subtitle: `Updated by ${adminName}`,
            statusColor,
            fields: [...commonFields, { label: "Submitted By", value: `${ticket.userName} (${ticket.userEmail})` }],
            description: note ? `Admin note:\n${note}` : `The ticket status has been updated by ${adminName}.`,
            actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
            actionText: "Open Ticket",
          });
          await sendEmail(deptTo, `[STATUS] Ticket #${ticket.ticketNumber} → ${status}`, deptHtml, ccEmails.length ? ccEmails : null);
        }
      } catch (mailErr) {
        console.error("❌ [STATUS UPDATE] Notification error:", mailErr.message);
      }
    });
  } catch (err) {
    console.error("❌ [STATUS UPDATE] Error:", err.message);
    if (!res.headersSent) res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ===================== CATEGORY MANAGEMENT =====================

// -------- GET /api/categories --------
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await CategoryConfig.find().sort({ createdAt: -1 });
    const transformed = categories.map(cat => ({
      id: cat._id.toString(),
      name: cat.name,
      type: cat.type,
      distributionList: cat.distributionList || {},
      subCategories: cat.subCategories || [],
      cc: cat.cc || [],
      dlGroupMembers: cat.dlGroupMembers || [],
      dlGroupOwners: cat.dlGroupOwners || [],
      createdBy: cat.createdBy || {},
      updatedBy: cat.updatedBy || {},
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt
    }));
    res.json(transformed);
  } catch (err) {
    console.error("❌ Get categories error:", err);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

// -------- POST /api/categories --------
app.post("/api/categories", async (req, res) => {
  try {
    const { distributionList, subCategories, dlGroupMembers, dlGroupOwners, createdBy } = req.body;

    console.log("📥 [CREATE CATEGORY] Received for DL:", distributionList?.name);

    if (!distributionList?.id)
      return res.status(400).json({ message: "Distribution List ID is required" });

    if (!subCategories || subCategories.length === 0)
      return res.status(400).json({ message: "At least one sub-category is required" });

    const existing = await CategoryConfig.findOne({ "distributionList.id": distributionList.id });

// Normalize incoming subcategory names
const newNames = subCategories.map(sc =>
  (typeof sc === 'string' ? sc : sc.name).toLowerCase().trim()
);

// ❌ Check duplicates within request itself
const requestDuplicates = newNames.filter((n, i) => newNames.indexOf(n) !== i);
if (requestDuplicates.length > 0) {
  return res.status(400).json({
    message: `Duplicate sub-category names: ${[...new Set(requestDuplicates)].join(", ")}`
  });
}

// Convert to object format
const finalSubCategories = subCategories.map(sc =>
  typeof sc === 'string' ? { name: sc } : sc
);

if (existing) {
  // 🔥 Check duplicates against existing DB
  const existingNames = existing.subCategories.map(sc =>
    sc.name.toLowerCase().trim()
  );

  const duplicates = newNames.filter(n => existingNames.includes(n));

  if (duplicates.length > 0) {
    return res.status(400).json({
      message: `Sub-category already exists: ${[...new Set(duplicates)].join(", ")}`
    });
  }

  // ✅ Merge new subcategories
  existing.subCategories.push(...finalSubCategories);
  existing.updatedBy = createdBy || {};

  await existing.save();

  return res.status(200).json({
    message: "Sub-categories added successfully",
    data: existing
  });
}

    const category = await CategoryConfig.create({
      name: distributionList.name,
      categoryName: distributionList.name,
      type: "NORMAL",
      distributionList: {
        id: distributionList.id,
        name: distributionList.name,
        mail: distributionList.mail,
        mailNickname: distributionList.mailNickname
      },
      subCategories: finalSubCategories,
      cc: [],
      dlGroupMembers: Array.isArray(dlGroupMembers) ? dlGroupMembers : [],
      dlGroupOwners: Array.isArray(dlGroupOwners) ? dlGroupOwners : [],
      createdBy: createdBy || {}
    });

    console.log("✅ [CREATE CATEGORY] Saved to DB:", distributionList.name);

    // ✅ Respond immediately, send all emails in background
    res.status(201).json({
      id: category._id.toString(),
      name: category.name,
      distributionList: category.distributionList,
      subCategories: category.subCategories,
      dlGroupMembers: category.dlGroupMembers,
      dlGroupOwners: category.dlGroupOwners,
      createdAt: category.createdAt
    });

    // ===================== EMAIL NOTIFICATIONS (background) =====================
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const dlName = distributionList.name;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const subList = subCatSummaryText(finalSubCategories);

        const memberEmails = pluckEmails(dlGroupMembers);
        const ownerEmails  = pluckEmails(dlGroupOwners);
        const otherApprovers = collectOtherApprovers(finalSubCategories);
        const creatorEmail = createdBy?.mail || '';

        const commonFields = [
          { label: "Distribution List", value: dlName },
          { label: "DL Email",          value: distributionList.mail || '—' },
          { label: "Sub-Categories",    value: finalSubCategories.length },
          { label: "Created By",        value: createdBy?.name || createdBy?.mail || 'Admin' },
          { label: "Created At (IST)",  value: nowIST },
        ];

        // 1. Creator
        if (creatorEmail) {
          const html = buildHtmlEmail({
            title: `✅ Category Created: ${dlName}`,
            subtitle: `You successfully created a new helpdesk category`,
            statusColor: '#002060',
            fields: commonFields,
            description: `Sub-categories configured:\n\n${subList}`,
            actionLink: `${prodUrl}/settings`,
            actionText: 'View Settings',
          });
          await sendEmail(creatorEmail, `[CATEGORY CREATED] ${dlName} — Configuration Confirmed`, html);
          console.log(`📧 [CATEGORY] Creator notified → ${creatorEmail}`);
        }

        // 2. DL Members
        if (memberEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `📋 New Category Created: ${dlName}`,
            subtitle: `A new helpdesk category has been set up for your distribution list`,
            statusColor: '#0369a1',
            fields: [...commonFields, { label: "Your Role", value: "DL Group Member" }],
            description: `You are a member of the "${dlName}" distribution list.\n\nSub-categories now available:\n\n${subList}\n\nTickets submitted under these categories will be routed to your group.`,
            actionLink: prodUrl,
            actionText: 'Open Helpdesk',
          });
          await sendEmail(memberEmails, `[CATEGORY CREATED] ${dlName} — New Helpdesk Category for Your Group`, html);
          console.log(`📧 [CATEGORY] DL Members notified → ${memberEmails.join(', ')}`);
        }

        // 3. DL Owners (skip those already in members to avoid duplicate emails)
        const ownerOnlyEmails = ownerEmails.filter(e => !memberEmails.includes(e));
        if (ownerOnlyEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `📋 New Category Created: ${dlName}`,
            subtitle: `A new helpdesk category has been configured under your distribution list`,
            statusColor: '#059669',
            fields: [...commonFields, { label: "Your Role", value: "DL Group Owner" }],
            description: `As an owner of "${dlName}", a new helpdesk category has been created under your group.\n\nSub-categories:\n\n${subList}`,
            actionLink: `${prodUrl}/settings`,
            actionText: 'View Settings',
          });
          await sendEmail(ownerOnlyEmails, `[CATEGORY CREATED] ${dlName} — Category Created Under Your Group`, html);
          console.log(`📧 [CATEGORY] DL Owners notified → ${ownerOnlyEmails.join(', ')}`);
        }

        // 4. Other Approvers (one email per unique approver, lists all subcategories they're on)
        for (const approver of otherApprovers) {
          const theirSubs = finalSubCategories
            .filter(s => s.approval?.otherApprovers?.some(a => (a.email || '').toLowerCase() === approver.email))
            .map(s => s.name);

          const html = buildHtmlEmail({
            title: `🔔 You are an Approver for: ${dlName}`,
            subtitle: `You have been designated as an approver for helpdesk tickets`,
            statusColor: '#7c3aed',
            fields: [
              { label: "Distribution List", value: dlName },
              { label: "Your Role",         value: "Custom Approver" },
              { label: "Sub-Categories",    value: theirSubs.join(', ') },
              { label: "Assigned By",       value: createdBy?.name || 'Admin' },
              { label: "Assigned At (IST)", value: nowIST },
            ],
            description: `You have been added as a custom approver for:\n\n${theirSubs.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nUnder the "${dlName}" category. You will receive a notification whenever a ticket requiring approval is submitted.`,
            actionLink: prodUrl,
            actionText: 'Open Helpdesk',
          });
          await sendEmail(approver.email, `[APPROVER ASSIGNED] ${dlName} — You are a Designated Approver`, html);
          console.log(`📧 [CATEGORY] Approver notified → ${approver.email}`);
        }

        console.log(`✅ [CATEGORY] All CREATE notifications sent for: ${dlName}`);
      } catch (mailErr) {
        console.error("❌ [CATEGORY] CREATE notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error("❌ [CREATE CATEGORY] Error:", err);
    return res.status(500).json({ message: "Failed to create category", error: err.message });
  }
});

// -------- PUT /api/categories/:id --------
app.put("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { distributionList, subCategories, dlGroupMembers, dlGroupOwners, updatedBy } = req.body;

    if (!distributionList?.id)
      return res.status(400).json({ message: "Distribution List ID is required" });

    const oldCategory = await CategoryConfig.findById(id);
    if (!oldCategory)
      return res.status(404).json({ message: "Category not found" });

    const subCatNames = subCategories.map(sc =>
      (typeof sc === 'string' ? sc : sc.name).toLowerCase().trim()
    );
    const duplicates = subCatNames.filter((n, i) => subCatNames.indexOf(n) !== i);
    if (duplicates.length > 0) {
      return res.status(400).json({
        message: `Duplicate sub-category names: ${[...new Set(duplicates)].join(", ")} not allowed`
      });
    }

    // ✅ No "Other" auto-append
    const finalSubCategories = subCategories.map(sc =>
      typeof sc === 'string' ? { name: sc } : sc
    );

    const updated = await CategoryConfig.findByIdAndUpdate(
      id,
      {
        name: distributionList.name,
        categoryName: distributionList.name,
        distributionList: {
          id: distributionList.id,
          name: distributionList.name,
          mail: distributionList.mail,
          mailNickname: distributionList.mailNickname
        },
        subCategories: finalSubCategories,
        categoryHeads: [],
        cc: [],
        dlGroupMembers: Array.isArray(dlGroupMembers) ? dlGroupMembers : [],
        dlGroupOwners: Array.isArray(dlGroupOwners) ? dlGroupOwners : [],
        updatedBy: updatedBy || {}
      },
      { new: true }
    );

    console.log("✅ [UPDATE CATEGORY] Saved to DB:", distributionList.name);

    // ✅ Respond immediately
    res.json({
      id: updated._id.toString(),
      name: updated.name,
      distributionList: updated.distributionList,
      subCategories: updated.subCategories,
      dlGroupMembers: updated.dlGroupMembers,
      dlGroupOwners: updated.dlGroupOwners,
      updatedAt: updated.updatedAt
    });

    // ===================== EMAIL NOTIFICATIONS (background) =====================
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const dlName = distributionList.name;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

        const memberEmails  = pluckEmails(dlGroupMembers);
        const updaterEmail  = updatedBy?.mail || '';

        // Compute diff between old and new subcategories
        const changeLines = diffSubCategories(oldCategory.subCategories || [], finalSubCategories);
        const changeText  = changeLines.length > 0
          ? changeLines.join('\n')
          : 'Minor configuration updates were made.';

        const newSubList = subCatSummaryText(finalSubCategories);

        const commonFields = [
          { label: "Distribution List", value: dlName },
          { label: "DL Email",          value: distributionList.mail || '—' },
          { label: "Updated By",        value: updatedBy?.name || updatedBy?.mail || 'Admin' },
          { label: "Updated At (IST)",  value: nowIST },
          { label: "Sub-Categories",    value: finalSubCategories.length },
        ];

        // 1. Updater
        if (updaterEmail) {
          const html = buildHtmlEmail({
            title: `✅ Category Updated: ${dlName}`,
            subtitle: `Your changes have been saved`,
            statusColor: '#002060',
            fields: commonFields,
            description: `What changed:\n\n${changeText}\n\nCurrent sub-category configuration:\n\n${newSubList}`,
            actionLink: `${prodUrl}/settings`,
            actionText: 'View Settings',
          });

          await sendEmail(
            updaterEmail,
            `[CATEGORY UPDATED] ${dlName} — Changes Saved`,
            html
          );
        }

        // 2. DL Members
        if (memberEmails.length > 0) {
              const html = buildHtmlEmail({
                title: `🔄 Category Updated: ${dlName}`,
                subtitle: `The helpdesk category for your distribution list has been updated`,
                statusColor: '#0369a1',
                fields: [...commonFields, { label: "Your Role", value: "DL Group Member" }],

                // 🔥 FIXED FORMATTING (NO PARAGRAPH ISSUE)
                description: `
            What changed:

            ${changeText}

            ------------------------

            Current sub-category configuration:

            ${newSubList}
                `,

                actionLink: prodUrl,
                actionText: 'Open Helpdesk',
              });

              await sendEmail(
                memberEmails,
                `[CATEGORY UPDATED] ${dlName} — Configuration Changes`,
                html
              );
            }

        // 3. DL Owners (skip those already in members)
        const ownerOnlyEmails = ownerEmails.filter(e => !memberEmails.includes(e));
        if (ownerOnlyEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `🔄 Category Updated: ${dlName}`,
            subtitle: `A category under your distribution list has been updated`,
            statusColor: '#059669',
            fields: [...commonFields, { label: "Your Role", value: "DL Group Owner" }],
            description: `The category "${dlName}" was updated by ${updatedBy?.name || 'an admin'}.\n\nWhat changed:\n\n${changeText}\n\nCurrent sub-categories:\n\n${newSubList}`,
            actionLink: `${prodUrl}/settings`,
            actionText: 'View Settings',
          });
          await sendEmail(ownerOnlyEmails, `[CATEGORY UPDATED] ${dlName} — Changes to Your Group's Category`, html);
          console.log(`📧 [CATEGORY] DL Owners notified → ${ownerOnlyEmails.join(', ')}`);
        }

        // 4. Other Approvers
        const oldApproverEmails = new Set(collectOtherApprovers(oldCategory.subCategories || []).map(a => a.email));

        for (const approver of otherApprovers) {
          const theirSubs = finalSubCategories
            .filter(s => s.approval?.otherApprovers?.some(a => (a.email || '').toLowerCase() === approver.email))
            .map(s => s.name);

          const isNew = !oldApproverEmails.has(approver.email);
          const html = buildHtmlEmail({
            title: `🔄 Category Updated: ${dlName}`,
            subtitle: isNew
              ? `You have been added as an approver`
              : `A category you approve for has been updated`,
            statusColor: '#7c3aed',
            fields: [
              { label: "Distribution List", value: dlName },
              { label: "Your Role",         value: "Custom Approver" },
              { label: "Sub-Categories",    value: theirSubs.join(', ') },
              { label: "Updated By",        value: updatedBy?.name || 'Admin' },
              { label: "Updated At (IST)",  value: nowIST },
            ],
            description: `${isNew ? `You have been newly added as an approver for: ${theirSubs.join(', ')}` : `You remain a designated approver for: ${theirSubs.join(', ')}`}\n\nWhat changed in this category:\n\n${changeText}`,
            actionLink: prodUrl,
            actionText: 'Open Helpdesk',
          });
          await sendEmail(approver.email, `[CATEGORY UPDATED] ${dlName} — Approver Notification`, html);
          console.log(`📧 [CATEGORY] Approver notified → ${approver.email}`);
        }

        console.log(`✅ [CATEGORY] All UPDATE notifications sent for: ${dlName}`);
      } catch (mailErr) {
        console.error("❌ [CATEGORY] UPDATE notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error("❌ [UPDATE CATEGORY] Error:", err.message);
    return res.status(500).json({ message: "Failed to update category" });
  }
});

// -------- Helper: Get Category Heads (DL MEMBERS) --------
const getCategoryHeads = async (categoryName) => {
  try {
    const config = await CategoryConfig.findOne({
      name: { $regex: new RegExp("^" + categoryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }
    });
    if (!config) return [];
    return (config.dlGroupMembers || []).map(m => m.email).filter(Boolean);
  } catch (err) {
    console.error("❌ Error getting DL members:", err);
    return [];
  }
};

// -------- GET /tickets --------
app.get("/tickets", async (req, res) => {
  try {
    const filter = req.query.userId ? { userId: req.query.userId } : {};
    const tickets = await Ticket.find(filter).sort({ ticketNumber: 1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: "❌ Server error" });
  }
});

// -------- GET /tickets/:id --------
app.get("/tickets/:id", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    const heads = await getCategoryHeads(ticket.category);
    const obj = ticket.toObject();
    obj.approvers = ticket.approvers || [];
    res.json(obj);
  } catch (err) {
    console.error("❌ Error fetching ticket:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// -------- POST /tickets --------
app.post("/tickets", async (req, res) => {
  try {
    const {
      category, description, priority, userId, userName, userEmail,
      onBehalf, onBehalfEmail, deliveryEmail, subCategory,
      subQuery, otherSubQueryText, attachments
    } = req.body;

    console.log("📥 [CREATE TICKET] Category:", category);

    const categoryConfig = await CategoryConfig.findOne({
      name: { $regex: new RegExp("^" + category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }
    });

    if (!categoryConfig) return res.status(400).json({ message: "Invalid category" });

    const selectedSub = categoryConfig.subCategories.find(
      sc => sc.name.toLowerCase() === subCategory?.toLowerCase()
    );

    if (!subCategory) return res.status(400).json({ message: "Sub-category is required" });
    if (!selectedSub) return res.status(400).json({ message: "Invalid sub-category selected" });

    if (selectedSub.attachments?.enabled && selectedSub.attachments.required && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: "Attachments are required for this sub-category" });
    }

    if (category === "Password Reset" && (onBehalf === "Self" || !onBehalf)) {
      if (!deliveryEmail || !deliveryEmail.trim())
        return res.status(400).json({ message: "Alternative delivery email is required for self password reset." });
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(deliveryEmail.trim()))
        return res.status(400).json({ message: "Alternative delivery email is not valid." });
    }

    if (category === "Password Reset" && onBehalf === "Other") {
      if (!onBehalfEmail || !onBehalfEmail.trim())
        return res.status(400).json({ message: "On-behalf email is required for other password reset." });
      if (!deliveryEmail || !deliveryEmail.trim())
        return res.status(400).json({ message: "Delivery email is required when requesting for other user." });
    }

    let initialStatus = "Open";
    if (selectedSub?.approval?.requireApproval) initialStatus = "Waiting for approval";
    if (categoryConfig.type === "PASSWORD_RESET" || categoryConfig.type === "ADMIN_ACCESS")
      initialStatus = "Waiting for approval";

    ticketCounter++;

    const ticketPayload = {
      ticketNumber: ticketCounter,
      userId, userName, userEmail, category, description, priority,
      status: initialStatus,
      onBehalf: onBehalf || "Self",
      onBehalfEmail: onBehalfEmail || "",
      deliveryEmail: deliveryEmail || "",
      subCategory: subCategory || "",
      subQuery: subQuery || "",
      otherSubQueryText: otherSubQueryText || "",
      history: [{ action: "created", by: userName, at: new Date(), reason: null }]
    };

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      ticketPayload.attachments = attachments.map(a => ({
        fileName: a.fileName || a.file_name || a.name || "",
        fileType: a.fileType || a.file_type || a.type || "",
        fileUrl: a.url || a.fileUrl || a.path || null,
        id: a.id || a.fileId || null,
        driveId: a.driveId || null
      }));
      if (!ticketPayload.attachment && ticketPayload.attachments.length > 0) {
        const first = ticketPayload.attachments[0];
        ticketPayload.attachment = { fileName: first.fileName, fileType: first.fileType, fileUrl: first.fileUrl };
      }
    }

    const ticket = await Ticket.create(ticketPayload);
    console.log("✅ [CREATE TICKET] Ticket created:", ticket.ticketNumber);

    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const creatorHtml = buildHtmlEmail({
      title: `Ticket #${ticketCounter} Created`,
      subtitle: initialStatus === "Waiting for approval" ? "Your ticket is waiting for department approval" : "Your ticket has been created",
      statusColor: "#0ea5e9",
      fields: [
        { label: "Ticket No", value: ticketCounter },
        { label: "Category", value: category },
        { label: "Priority", value: priority },
        { label: "Status", value: initialStatus },
        { label: "Created At", value: nowIST }
      ],
      description,
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });
    await sendEmail(userEmail, `Ticket #${ticketCounter} Created`, creatorHtml);

    const deptFields = [
      { label: "Ticket No", value: ticketCounter },
      { label: "Created By", value: `${userName} (${userEmail})` },
      { label: "Category", value: category },
      { label: "Priority", value: priority },
      { label: "Status", value: initialStatus }
    ];
    if (subCategory) deptFields.push({ label: "Sub-Category", value: subCategory });
    if (deliveryEmail) deptFields.push({ label: "Delivery Email", value: deliveryEmail });

    const deptHtml = buildHtmlEmail({
      title: `New Ticket #${ticketCounter} — ${category}`,
      subtitle: `Action required${initialStatus === "Waiting for approval" ? " (approval required)" : ""}`,
      statusColor: initialStatus === "Waiting for approval" ? "#f59e0b" : "#0ea5e9",
      fields: deptFields,
      description,
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: initialStatus === "Waiting for approval" ? "Approve / Reject" : "Open Ticket"
    });

    const deptTo = (categoryConfig.dlGroupMembers || []).map(h => h.email).filter(Boolean);
const deptCcList = (categoryConfig.cc || []).map(c => c.email).filter(Boolean);

// 🔥 CASE: APPROVAL REQUIRED
if (selectedSub?.approval?.requireApproval) {

  // ✅ 1. Notify DL members (just info)
  if (deptTo.length) {
    const infoHtml = buildHtmlEmail({
      title: `Ticket #${ticketCounter} Created`,
      subtitle: `Approval required for this ticket`,
      statusColor: "#f59e0b",
      fields: deptFields,
      description: `${userName} has created a ticket. ${userName}'s Reporting Manager's approval is required before processing.`,
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(deptTo, `[INFO] Ticket #${ticketCounter} - Approval Pending`, infoHtml, deptCcList);
  }

  // ✅ 2. Determine approvers
  let approvers = [];

  if (selectedSub.approval.reportingManager) {
  const managerEmail = await getManagerEmail(userEmail);

  if (managerEmail) {
    approvers.push(managerEmail);
  } else {
    console.log("⚠️ No manager found for user:", userEmail);
  }
}

  if (selectedSub.approval.otherApprovers?.length) {
    approvers.push(...selectedSub.approval.otherApprovers.map(a => a.email));
  }

  if (selectedSub.approval.requireAll) {
    approvers.push(...deptTo);
  }

  approvers = [...new Set(approvers)];
  ticket.approvers = approvers;
  await ticket.save();

  // ✅ 3. Send approval mail ONLY to approvers
  if (approvers.length) {
    const approvalHtml = buildHtmlEmail({
      title: `Approval Required — Ticket #${ticketCounter}`,
      subtitle: `Action required from your side`,
      statusColor: "#f59e0b",
      fields: deptFields,
      description: `This ticket requires your approval. Please review and take action.`,
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "Approve / Reject"
    });

    await sendEmail(approvers, `[APPROVAL] Ticket #${ticketCounter} - Action Required`, approvalHtml);
  }

} else {
  // ✅ NORMAL FLOW (no approval)
  if (deptTo.length) {
    await sendEmail(deptTo, `[TICKET #${ticketCounter}] ${category} - Action Required`, deptHtml, deptCcList);
  }
}

    res.status(201).json(ticket);
  } catch (err) {
    console.error("❌ Error creating ticket:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------- POST /tickets/:id/approve --------
app.post("/tickets/:id/approve", async (req, res) => {
  try {
    const { approvedBy, note } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    const categoryConfig = await CategoryConfig.findOne({
      name: { $regex: new RegExp("^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }
    });

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (ticket.status === "Closed") return res.status(400).json({ message: "Ticket is already closed" });
    const now = new Date();

    // -------- PASSWORD RESET --------
    if (categoryConfig.type === "PASSWORD_RESET") {
      const userIdentifier = ticket.onBehalfEmail || ticket.userId || ticket.userEmail;
      if (!userIdentifier) return res.status(400).json({ message: "No user identifier available for approval action" });

      let newPassword;
      try {
        newPassword = await resetAzurePassword(userIdentifier);
      } catch (err) {
        console.error("❌ Password reset failed during approve:", err.message);
        return res.status(500).json({ message: "Password reset failed", error: err.message });
      }

      ticket.history.push({ action: "approved", by: approvedBy || "Department Head", at: now, reason: note || "Approved and password reset performed" });
      ticket.status = "Closed";
      ticket.closedBy = approvedBy || "Department Head";
      ticket.closeReason = note ? `Approved: ${note}` : "Approved by Department Head";
      ticket.closedAt = now;
      ticket.history.push({ action: "closed", by: ticket.closedBy, at: now, reason: ticket.closeReason });
      await ticket.save();

      const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      const userHtml = buildHtmlEmail({
        title: `Password Reset Approved — Ticket #${ticket.ticketNumber}`,
        subtitle: "Temporary password generated — change on next sign-in",
        statusColor: "#16a34a",
        fields: [
          { label: "Ticket No", value: ticket.ticketNumber },
          { label: "Category", value: ticket.category },
          { label: "Approved By", value: ticket.closedBy },
          { label: "Approved On", value: nowIST },
          { label: "New Password", value: newPassword },
          { label: "Affected User", value: ticket.onBehalfEmail || ticket.userEmail }
        ],
        description: "The new temporary password has been generated and applied successfully.",
        actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
        actionText: "View Ticket"
      });

      await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userHtml);

      const catCfg = await CategoryConfig.findOne({ name: { $regex: new RegExp("^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") } });
      const deptTo = (catCfg?.dlGroupMembers || []).map(h => h.email).filter(Boolean);
      const deptCc = (catCfg?.cc || []).map(c => c.email).filter(Boolean);

      if (deptTo.length) {
        const deptHtml = buildHtmlEmail({
          title: `Password Reset Approved — Ticket #${ticket.ticketNumber}`,
          subtitle: "Password reset completed",
          statusColor: "#16a34a",
          fields: [
            { label: "Ticket No", value: ticket.ticketNumber },
            { label: "Approved By", value: ticket.closedBy },
            { label: "Affected User", value: ticket.onBehalfEmail || ticket.userEmail },
            { label: "Temporary Password", value: newPassword }
          ],
          description: note || "Password reset has been completed successfully.",
          actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
          actionText: "View Ticket"
        });
        await sendEmail(deptTo, `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, deptHtml, deptCc);
      }

      if (ticket.deliveryEmail && ticket.deliveryEmail.trim() && ticket.deliveryEmail.trim() !== ticket.userEmail.trim()) {
        await sendEmail(ticket.deliveryEmail.trim(), `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userHtml);
      }

      return res.status(200).json({ message: "Password reset approved successfully", ticket });
    }

    // -------- ADMIN ACCESS --------
    else if (categoryConfig.type === "ADMIN_ACCESS") {
      console.log("🔵 [ADMIN ACCESS] Starting approval process...");
      const targetUpn = ticket.onBehalfEmail || ticket.userEmail;
      if (!targetUpn) return res.status(400).json({ message: "No target user found for Admin Access" });
      if (!AZURE_DEVICE_ADMIN_GROUP_ID) return res.status(500).json({ message: "Server configuration error: Admin group ID not configured" });

      let user;
      try {
        user = await getUserByUpn(targetUpn);
      } catch (err) {
        return res.status(404).json({ message: "User not found in Azure AD", error: err.message, target: targetUpn });
      }

      try {
        await addUserToGroup(AZURE_DEVICE_ADMIN_GROUP_ID, user.id);
      } catch (err) {
        const errorMessage = err.message?.toLowerCase() || '';
        const isAlreadyMember = errorMessage.includes('already exists') || errorMessage.includes('already a member') || errorMessage.includes('one or more added object references already exist');
        if (!isAlreadyMember) {
          return res.status(500).json({ message: "Failed to add user to admin group", error: err.message });
        }
      }

      ticket.history.push({ action: "approved", by: approvedBy || "Department Head", at: now, reason: note || "Admin access approved and group assigned" });
      ticket.status = "Closed";
      ticket.closedBy = approvedBy || "Department Head";
      ticket.closeReason = note ? `Approved: ${note}` : "Admin access approved and granted";
      ticket.closedAt = now;
      ticket.history.push({ action: "closed", by: ticket.closedBy, at: now, reason: ticket.closeReason });

      try {
        await ticket.save();
      } catch (err) {
        return res.status(500).json({ message: "Failed to save ticket after approval", error: err.message });
      }

      res.status(200).json({
        message: "Admin access approved successfully",
        ticket: { _id: ticket._id, ticketNumber: ticket.ticketNumber, status: ticket.status, closedBy: ticket.closedBy, closeReason: ticket.closeReason, closedAt: ticket.closedAt, history: ticket.history }
      });

      setImmediate(async () => {
        try {
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          const userHtml = buildHtmlEmail({
            title: `Admin Access Approved — Ticket #${ticket.ticketNumber}`,
            subtitle: "Your admin access request has been granted",
            statusColor: "#16a34a",
            fields: [
              { label: "Ticket No", value: ticket.ticketNumber },
              { label: "Category", value: ticket.category },
              { label: "Approved By", value: ticket.closedBy },
              { label: "Approved On", value: nowIST },
              { label: "Access Level", value: "Device Admin Group" },
              { label: "Target User", value: user.displayName || targetUpn }
            ],
            description: note || "You have been added to the Device Admin group successfully.",
            actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
            actionText: "View Ticket"
          });
          await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Admin Access Approved`, userHtml);

          const catCfg = await CategoryConfig.findOne({ name: { $regex: new RegExp("^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") } });
          const deptTo = (catCfg?.dlGroupMembers || []).map(h => h.email).filter(Boolean);
          const deptCcList = (catCfg?.cc || []).map(c => c.email).filter(Boolean);
          

          if (deptTo.length > 0) {
            const deptHtml = buildHtmlEmail({
              title: `Ticket #${ticket.ticketNumber} — Admin Access Granted`,
              subtitle: "User successfully added to Device Admin group",
              statusColor: "#16a34a",
              fields: [
                { label: "Ticket No", value: ticket.ticketNumber },
                { label: "Target User", value: `${user.displayName || targetUpn} (${targetUpn})` },
                { label: "Requested By", value: `${ticket.userName} (${ticket.userEmail})` },
                { label: "Approved By", value: ticket.closedBy },
                { label: "Approved On", value: nowIST },
                { label: "Group", value: "Device Admin Group" }
              ],
              description: note || "Admin access has been approved and the user has been successfully added to the Device Admin group.",
              actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
              actionText: "View Ticket"
            });
            await sendEmail(deptTo, `[CLOSED] Ticket #${ticket.ticketNumber} - Admin Access Granted`, deptHtml, deptCcList);
          }
        } catch (e) {
          console.error("❌ [ADMIN ACCESS] Background notification failed:", e.message);
        }
      });

      return;
    }

    // -------- NORMAL APPROVAL --------
    else {
      const selectedSub = categoryConfig.subCategories.find(
        sc => sc.name.toLowerCase().trim() === ticket.subCategory?.toLowerCase().trim()
      );

      if (selectedSub?.approval?.requireApproval) {
        ticket.history.push({
          action: "approved",
          by: approvedBy || "Approver",
          at: now,
          reason: note || "Approved"
        });

        ticket.status = "Closed";
        ticket.closedBy = approvedBy || "Approver";
        ticket.closedAt = now;

        ticket.history.push({
          action: "closed",
          by: closedBy || closedByName,
          at: now,
          reason: note || "Approved"
        });

        await ticket.save();

        const catCfg = await CategoryConfig.findOne({
          name: { $regex: new RegExp("^" + ticket.category + "$", "i") }
        });

        // 🔥 CORRECT NOTIFICATION LIST
        const deptMembers = (catCfg?.dlGroupMembers || []).map(m => m.email);
        const deptOwners = (catCfg?.dlGroupOwners || []).map(o => o.email);
        const approvers = ticket.approvers || [];

        let notifyList = [
          ticket.userEmail,   // creator
          ...deptMembers,
          ...deptOwners,
          ...approvers
        ].filter(Boolean);

        // ✅ remove duplicates
        notifyList = [...new Set(notifyList)];

        const html = buildHtmlEmail({
          title: `Ticket #${ticket.ticketNumber} – Approved`,
          subtitle: "Your ticket has been approved and closed",
          statusColor: "#16a34a",
          fields: [
            { label: "Ticket No", value: ticket.ticketNumber },
            { label: "Category", value: ticket.category },
            { label: "Result", value: "Approved" },
            { label: "Approved By", value: ticket.closedBy },
            { label: "Affected User", value: ticket.onBehalfEmail || ticket.userEmail }
          ],
          description: note || "Your request has been approved.",
          actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
          actionText: "View Ticket"
        });

        // 🚀 SEND TO ALL CORRECT USERS
        await sendEmail(
          notifyList,
          `[APPROVED] Ticket #${ticket.ticketNumber} – ${ticket.category}`,
          html
        );

        return res.status(200).json({
          message: "Ticket approved successfully",
          ticket
        });
      }

      console.log("❌ Approval not supported for category:", ticket.category);
      return res.status(400).json({
        message: `Approval not supported for category: ${ticket.category}`
      });
    }
  } catch (error) {
    console.error("❌ [APPROVE] Fatal error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Internal server error during approval", error: error.message });
    }
  }
});

// -------- POST /tickets/:id/reject --------
app.post("/tickets/:id/reject", async (req, res) => {
  try {
    const { rejectedBy, reason } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (ticket.status === "Closed")
      return res.status(400).json({ message: "Ticket is already closed" });

    const now = new Date();

    // 🔹 Update ticket
    ticket.history.push({
      action: "rejected",
      by: rejectedBy,
      at: now,
      reason: reason || "Rejected"
    });

    ticket.status = "Closed";
    ticket.closedBy = rejectedBy;
    ticket.closeReason = reason
      ? `Rejected: ${reason}`
      : "Reason not specified";
    ticket.closedAt = now;

    ticket.history.push({
      action: "closed",
      by: ticket.closedBy,
      at: now,
      reason: ticket.closeReason
    });

    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    // 🔹 Get category config
    const catCfg = await CategoryConfig.findOne({
      name: {
        $regex: new RegExp(
          "^" +
            ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "$",
          "i"
        )
      }
    });

    // 🔥 CORRECT NOTIFICATION LIST
    const deptMembers = (catCfg?.dlGroupMembers || []).map(m => m.email);
    const deptOwners = (catCfg?.dlGroupOwners || []).map(o => o.email);
    const approvers = ticket.approvers || [];

    let notifyList = [
      ticket.userEmail,   // creator
      ...deptMembers,
      ...deptOwners,
      ...approvers
    ].filter(Boolean);

    // ✅ Remove duplicates
    notifyList = [...new Set(notifyList)];

    // 🔹 Email template
    const html = buildHtmlEmail({
      title: `Ticket #${ticket.ticketNumber} — Rejected`,
      subtitle: `${ticket.closedBy} rejected the request`,
      statusColor: "#dc2626",
      fields: [
        { label: "Ticket No", value: ticket.ticketNumber },
        { label: "Category", value: ticket.category },
        { label: "Rejected By", value: ticket.closedBy },
        { label: "Rejected On", value: nowIST }
      ],
      description: `Reason:\n${reason || "No reason provided."}`,
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    // 🚀 Send ONE email to all
    await sendEmail(
      notifyList,
      `[REJECTED] Ticket #${ticket.ticketNumber}`,
      html
    );

    console.log(
      `✅ Ticket #${ticket.ticketNumber} rejected by ${ticket.closedBy} and closed.`
    );

    res.json({
      message: "Ticket rejected and closed",
      ticket: {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        closedBy: ticket.closedBy,
        closeReason: ticket.closeReason,
        closedAt: ticket.closedAt,
        history: ticket.history
      }
    });

  } catch (err) {
    console.error("❌ Reject error:", err.message);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});

// -------- PUT /tickets/:id/close --------
app.put("/tickets/:id/close", async (req, res) => {
  try {
    const { closedBy, closedByName, closeReason } = req.body;

    if (!closeReason || closeReason.trim() === "") {
      return res.status(400).json({ message: "Close reason is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.status === "Closed") {
      return res.status(400).json({ message: "Ticket is already closed" });
    }

    const catCfg = await CategoryConfig.findOne({
      name: {
        $regex: new RegExp(
          "^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          "i"
        )
      }
    });

    const loggedUser = closedBy?.toLowerCase().trim();

    // 🔹 DL MEMBERS + OWNERS
    const deptMembers = (catCfg?.dlGroupMembers || []).map(m => m.email.toLowerCase());
    const deptOwners = (catCfg?.dlGroupOwners || []).map(o => o.email.toLowerCase());

    // 🔹 FIND SUBCATEGORY
    const selectedSub = catCfg?.subCategories?.find(
      sc => sc.name.toLowerCase() === ticket.subCategory?.toLowerCase()
    );

    // 🔹 BUILD APPROVERS
    let approvers = ticket.approvers || [];

    if (selectedSub?.approval?.requireApproval) {

      if (selectedSub.approval.reportingManager) {
        const managerEmail = await getManagerEmail(ticket.userEmail);
        if (managerEmail) approvers.push(managerEmail.toLowerCase());
      }

      if (selectedSub.approval.otherApprovers?.length) {
        approvers.push(...selectedSub.approval.otherApprovers.map(a => a.email.toLowerCase()));
      }

      if (selectedSub.approval.requireAll) {
        approvers.push(...deptMembers);
      }
    }

    approvers = [...new Set(approvers)];

    // 🚨 AUTHORIZATION
    if (![...approvers, ...deptMembers, ...deptOwners].includes(loggedUser)) {
      return res.status(403).json({
        message: "You are not authorized to close this ticket"
      });
    }

    // 🔹 CLOSE TICKET
    const now = new Date();

    ticket.history.push({
      action: "closed",
      by: closedBy,
      at: now,
      reason: closeReason
    });

    ticket.status = "Closed";
    ticket.closedBy = closedBy; // email
    ticket.closedByName = closedByName || closedBy; // name
    ticket.closeReason = closeReason;
    ticket.closedAt = now;

    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata"
    });

    // ✅ MAIN EMAIL (FIXED FORMAT + NAME)
    const emailHtml = buildHtmlEmail({
      title: `Ticket #${ticket.ticketNumber} — Closed`,
      subtitle: "Ticket closed manually",
      statusColor: "#dc2626",
      fields: [
        { label: "Ticket No", value: ticket.ticketNumber },
        { label: "Closed By", value: ticket.closedByName || ticket.closedBy },
        { label: "Closed On", value: nowIST }
      ],
      description: `
        <p>This ticket has been closed by <strong>${ticket.closedByName || ticket.closedBy}</strong>.</p>
        <p><strong>Reason:</strong></p>
        <p>${ticket.closeReason}</p>
      `,
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    // 🔹 NOTIFY ALL
    let notifyList = [
      ticket.userEmail,
      ...deptMembers,
      ...deptOwners,
      ...approvers
    ].filter(Boolean);

    notifyList = [...new Set(notifyList)];

    await sendEmail(
      notifyList,
      `[CLOSED] Ticket #${ticket.ticketNumber}`,
      emailHtml
    );

    // ✅ PERSONAL MAIL TO CLOSER (FIXED FORMAT)
    if (closedBy) {
      const personalHtml = buildHtmlEmail({
        title: `You closed Ticket #${ticket.ticketNumber}`,
        subtitle: "Confirmation of your action",
        statusColor: "#0369a1",
        fields: [
          { label: "Ticket No", value: ticket.ticketNumber },
          { label: "Closed By", value: ticket.closedByName || ticket.closedBy },
          { label: "Closed On", value: nowIST }
        ],
        description: `
          <p>You have successfully closed this ticket.</p>
          <p><strong>Reason:</strong></p>
          <p>${closeReason}</p>
        `,
        actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
        actionText: "View Ticket"
      });

      await sendEmail(
        closedBy,
        `[CONFIRMATION] You closed Ticket #${ticket.ticketNumber}`,
        personalHtml
      );
    }

    res.json({ message: "Ticket closed successfully", ticket });

  } catch (err) {
    console.error("❌ Close ticket error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// -------- PUT /tickets/:id/revive --------
app.put("/tickets/:id/revive", async (req, res) => {
  try {
    const { revivedBy, reviveReason } = req.body;

    if (!reviveReason || reviveReason.trim() === "") {
      return res.status(400).json({ message: "Revive reason is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.status !== "Closed") {
      return res.status(400).json({ message: "Only closed tickets can be revived" });
    }

    // ✅ ONLY CREATOR CAN REVIVE
    if (ticket.userEmail.toLowerCase() !== revivedBy.toLowerCase()) {
      return res.status(403).json({
        message: "Only ticket creator can revive this ticket"
      });
    }

    const catCfg = await CategoryConfig.findOne({
      name: {
        $regex: new RegExp(
          "^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          "i"
        )
      }
    });

    const now = new Date();
    console.log("🔍 REVIVE CHECK");
    console.log("Ticket User:", ticket.userEmail);
    console.log("Revived By:", revivedBy);

    ticket.history.push({
      action: "revived",
      by: revivedByName || revivedBy,
      at: now,
      reason: reviveReason
    });

    const selectedSub = catCfg?.subCategories?.find(
      sc => sc.name.toLowerCase() === ticket.subCategory?.toLowerCase()
    );

    // 🔹 STATUS DECISION
    if (selectedSub?.approval?.requireApproval) {
      ticket.status = "Waiting for approval";
    } else {
      ticket.status = "Open";
    }

    ticket.reopenedBy = revivedBy;
    ticket.reopenedAt = now;
    ticket.reviveReason = reviveReason;
    ticket.reopenedByName = revivedByName || revivedBy;

    // 🔥 DL MEMBERS + OWNERS (ALWAYS)
    const deptMembers = (catCfg?.dlGroupMembers || []).map(m => m.email);
    const deptOwners = (catCfg?.dlGroupOwners || []).map(o => o.email);

    // 🔥 APPROVERS (ONLY IF APPROVAL REQUIRED)
    let approvers = [];
    console.log("🔍 REVIVE CHECK");
    console.log("Ticket User:", ticket.userEmail);
    console.log("Revived By:", revivedBy);

    if (selectedSub?.approval?.requireApproval) {

      // ✅ Manager
      if (selectedSub.approval.reportingManager) {
        const managerEmail = await getManagerEmail(ticket.userEmail);
        if (managerEmail) approvers.push(managerEmail);
      }

      // ✅ Other Approvers
      if (selectedSub.approval.otherApprovers?.length) {
        approvers.push(...selectedSub.approval.otherApprovers.map(a => a.email));
      }

      // ✅ Require All (DL members also act as approvers)
      if (selectedSub.approval.requireAll) {
        approvers.push(...deptMembers);
      }
    }

    // ✅ remove duplicates
    approvers = [...new Set(approvers)];

    ticket.approvers = approvers;
    console.log("🔍 REVIVE CHECK");
    console.log("Ticket User:", ticket.userEmail);
    console.log("Revived By:", revivedBy);

    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata"
    });

    const emailHtml = buildHtmlEmail({
      title: `Ticket #${ticket.ticketNumber} — Revived`,
      subtitle: "Ticket reopened and requires action",
      statusColor: "#16a34a",
      fields: [
        { label: "Ticket No", value: ticket.ticketNumber },
        { label: "Revived By", value: ticket.reopenedByName || ticket.reopenedBy },
        { label: "Revived On", value: nowIST }
      ],
      description: `Reason:\n${reviveReason}`,
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    // 🔥 FINAL NOTIFY LIST
    let notifyList = [
      ticket.userEmail,   // ✅ creator
      ...deptMembers,     // ✅ DL members
      ...deptOwners,      // ✅ DL owners
      ...approvers        // ✅ only if approval required
    ].filter(Boolean);

    notifyList = [...new Set(notifyList)];

    await sendEmail(
      notifyList,
      `[REVIVED] Ticket #${ticket.ticketNumber}`,
      emailHtml
    );
    console.log("🔍 REVIVE CHECK");
    console.log("Ticket User:", ticket.userEmail);
    console.log("Revived By:", revivedBy);

    res.json({ message: "Ticket revived successfully", ticket });

  } catch (err) {
    console.error("❌ Revive ticket error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ===================== ATTACHMENT ROUTES =====================

async function fetchItemStream(token, itemId, driveId) {
  const attempts = [];

  if (driveId) {
    attempts.push({
      label: `drives/${driveId}/items/${itemId}`,
      url: `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`
    });
  }

  if (process.env.SHAREPOINT_SITE && process.env.SHAREPOINT_SITE_NAME) {
    try {
      const siteHost = process.env.SHAREPOINT_SITE;
      const siteName = process.env.SHAREPOINT_SITE_NAME;
      const siteRes = await axios.get(
        `https://graph.microsoft.com/v1.0/sites/${siteHost}:/sites/${siteName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const siteId = siteRes.data.id;
      attempts.push({
        label: `sites/${siteId}/drive/items/${itemId}`,
        url: `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/content`
      });
    } catch (e) {
      console.warn('⚠️ Could not resolve site id:', e.message || e);
    }
  }

  attempts.push({
    label: `drive/items/${itemId}`,
    url: `https://graph.microsoft.com/v1.0/drive/items/${itemId}/content`
  });

  for (const att of attempts) {
    try {
      const resp = await axios.get(att.url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'stream',
        validateStatus: status => status >= 200 && status < 400
      });
      return { stream: resp.data, contentType: resp.headers['content-type'], contentDisposition: resp.headers['content-disposition'], used: att.label };
    } catch (err) {
      const errMsg = err?.response?.data ? JSON.stringify(err.response.data) : err.message || err;
      console.warn(`⚠️ Attempt failed for ${att.label}:`, errMsg);
    }
  }

  throw new Error('All attempts to fetch item failed');
}

const pLimit = require('p-limit').default;

app.get("/attachments/zip", async (req, res) => {
  try {
    const idsQuery = req.query.ids;
    if (!idsQuery) return res.status(400).send('Missing ids');
    const ids = idsQuery.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.status(400).send('No ids provided');
    if (ids.length > 5) return res.status(400).send('Max 5 files');

    const driveIds = (req.query.driveIds || '').split(',').map(s => s.trim()).filter(Boolean);
    const token = await getAccessToken();
    const zipName = `attachments-${Date.now()}.zip`;

    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${zipName}"`, 'Transfer-Encoding': 'chunked' });

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('warning', (err) => { console.warn('⚠️ Archive warning:', err); });
    archive.on('error', (err) => { console.error('❌ Archiver fatal error:', err); try { archive.abort(); } catch(e){} if (!res.headersSent) res.status(500).send('ZIP creation failed'); });
    res.on('close', () => { try { archive.abort(); } catch(e){} });
    archive.pipe(res);

    const limit = pLimit(2);
    const fetchPromises = ids.map((id, i) =>
      limit(async () => {
        try {
          const driveId = driveIds.length > i ? driveIds[i] : null;
          const fetched = await Promise.race([
            fetchItemStream(token, id, driveId),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${id}`)), 15000))
          ]);
          let filename = id.slice(-10);
          const dispMatch = /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(fetched.contentDisposition || '');
          if (dispMatch && dispMatch[1]) { try { filename = decodeURIComponent(dispMatch[1]); } catch (e) { filename = dispMatch[1]; } }
          archive.append(fetched.stream, { name: filename });
        } catch (err) { console.warn(`⚠️ Skip ${id}:`, err.message); }
      })
    );

    await Promise.all(fetchPromises);
    await archive.finalize();
  } catch (err) {
    console.error('❌ ZIP endpoint error:', err);
    if (!res.headersSent) res.status(500).send('Download failed');
  }
});

app.get("/attachments/:fileId", async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const driveId = req.query.driveId || null;
    if (!fileId) return res.status(400).send('Missing file id');

    const token = await getAccessToken();
    const fetched = await fetchItemStream(token, fileId, driveId);

    if (fetched.contentType) res.setHeader('Content-Type', fetched.contentType);
    if (fetched.contentDisposition) {
      res.setHeader('Content-Disposition', fetched.contentDisposition);
    } else {
      const ct = (fetched.contentType || '').toLowerCase();
      if (ct.startsWith('image/')) res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileId)}"`);
      else res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileId)}"`);
    }

    fetched.stream.pipe(res);
  } catch (err) {
    console.error('❌ Attachment proxy error:', err?.response?.data || err?.message || err);
    if (!res.headersSent) res.status(500).send('Download failed');
  }
});

// ===================== DISTRIBUTION LIST CREATE =====================

app.post("/api/dl/create", async (req, res) => {
  try {
    const { name, mailNickname, description, members, owners } = req.body;
    if (!name || !mailNickname) return res.status(400).json({ message: "name and mailNickname are required" });

    console.log("🔵 [DL CREATE] Creating group:", name, mailNickname);
    const token = await getGraphToken();

    const createRes = await fetch("https://graph.microsoft.com/v1.0/groups", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: name,
        mailNickname: mailNickname.replace(/[^a-zA-Z0-9\-_]/g, ""),
        description: description || "",
        mailEnabled: true,
        securityEnabled: false,
        groupTypes: [],
        visibility: "Private",
        resourceProvisioningOptions: [],
      }),
    });

    const createText = await createRes.text();
    if (!createRes.ok) {
      let errMsg = `Graph API error (${createRes.status})`;
      try { const errData = JSON.parse(createText); errMsg = errData.error?.message || errMsg; } catch (e) {}
      console.error("❌ [DL CREATE] Failed:", errMsg);
      return res.status(400).json({ message: errMsg });
    }

    const createdGroup = JSON.parse(createText);
    const groupId = createdGroup.id;
    console.log("✅ [DL CREATE] Group created:", groupId);

    if (Array.isArray(members) && members.length > 0) {
      for (const member of members) {
        try {
          await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/members/$ref`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${member.id}` }),
          });
          console.log("✅ [DL CREATE] Member added:", member.displayName);
        } catch (e) { console.warn("⚠️ [DL CREATE] Member add failed:", member.displayName, e.message); }
      }
    }

    if (Array.isArray(owners) && owners.length > 0) {
      for (const owner of owners) {
        try {
          await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/owners/$ref`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${owner.id}` }),
          });
          console.log("✅ [DL CREATE] Owner added:", owner.displayName);
        } catch (e) { console.warn("⚠️ [DL CREATE] Owner add failed:", owner.displayName, e.message); }
      }
    }

    console.log("✅ [DL CREATE] Done:", createdGroup.displayName);
    return res.status(201).json({
      id: groupId,
      displayName: createdGroup.displayName,
      mail: createdGroup.mail || null,
      mailNickname: createdGroup.mailNickname || mailNickname,
      description: createdGroup.description || description || "",
      mailEnabled: true,
      securityEnabled: false,
      groupTypes: [],
    });
  } catch (err) {
    console.error("❌ [DL CREATE] Server error:", err.message);
    return res.status(500).json({ message: "Failed to create group", error: err.message });
  }
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Server running on port ${PORT}`)
);