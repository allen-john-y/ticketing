// server.js (FULL UPDATED - WITH CATEGORY NOTIFICATIONS)
// ---------------------- Imports -------------------------
const express = require("express");
const router = express.Router();
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
const { exec } = require("child_process");
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
["/api/requests", "/api/incidents"].forEach(route => {
  app.use(route, limiter);
});

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


// -------- Category Config Schema --------
const categoryConfigSchema = new mongoose.Schema(
  {
    categoryName: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["NORMAL", "PASSWORD_RESET", "ADMIN_ACCESS"], default: "NORMAL" },
    
    distributionList: {
      id: { type: String, required: true },
      name: { type: String },
      mail: { type: String },
      mailNickname: { type: String },
    },

    // ── Sub-categories ────────────────────────────────────────────
    subCategories: [
      {
        name: { type: String, required: true },
        description: { type: String, default: "" },
        
        // ✅ ADD THESE - Per sub-category DL
        distributionList: {
          id: { type: String },
          name: { type: String },
          mail: { type: String },
          mailNickname: { type: String },
        },
        
        // ✅ ADD THESE - Per sub-category Assignment Groups
        assignmentGroups: [
          {
            name: { type: String },
            members: [
              {
                id: { type: String },
                name: { type: String },
                mail: { type: String },
              },
            ],
          },
        ],
        
        // ✅ ADD THESE - Per sub-category DL members/owners
        dlGroupMembers: [{ id: String, email: String, displayName: String }],
        dlGroupOwners: [{ id: String, email: String, displayName: String }],
        
        onBehalf: {
          enabled: { type: Boolean, default: false },
          required: { type: Boolean, default: false },
        },
        attachments: {
          enabled: { type: Boolean, default: false },
          required: { type: Boolean, default: false },
        },
        approval: {
          requireApproval: { type: Boolean, default: false },
          reportingManager: { type: Boolean, default: false },
          requireAll: { type: Boolean, default: false },
          otherApprovers: [{ id: String, email: String, name: String }],
        },
      },
    ],

    // These stay at category level for backward compatibility
    assignmentGroups: [
      {
        name: { type: String, required: true },
        members: [{ id: { type: String }, name: { type: String }, mail: { type: String } }],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    dlGroupMembers: [{ id: String, email: String, displayName: String }],
    dlGroupOwners: [{ id: String, email: String, displayName: String }],
    cc: [{ id: String, email: String, name: String }],
    createdBy: { id: String, name: String, mail: String },
    updatedBy: { id: String, name: String, mail: String },
  },
  { timestamps: true }
);
 
// Unique on categoryName only — DL uniqueness dropped
categoryConfigSchema.index({ categoryName: 1 }, { unique: true });
 
const CategoryConfig = mongoose.model("CategoryConfig", categoryConfigSchema);

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
// Helper: Fetch group members from Azure AD
const fetchGroupMembers = async (groupId) => {
  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,mail,displayName`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    
    if (data.value && data.value.length > 0) {
      return data.value.map(member => ({
        id: member.id,
        name: member.displayName || '',
        email: member.mail || member.userPrincipalName || ''
      }));
    }
    return [];
  } catch (err) {
    console.error('❌ Failed to fetch group members:', err.message);
    return [];
  }
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
// ===================== CATEGORY MANAGEMENT =====================

// -------- GET /api/categories --------
app.get("/api/categories", async (req, res) => {
  try {
    // optional ?dlId=xxx filter
    const filter = req.query.dlId
      ? { "distributionList.id": req.query.dlId }
      : {};
 
    const categories = await CategoryConfig.find(filter).sort({ createdAt: -1 });
 
    const transformed = categories.map(cat => ({
      id:               cat._id.toString(),
      categoryName:     cat.categoryName,
      name:             cat.name,
      type:             cat.type,
      distributionList: cat.distributionList || {},
      subCategories:    cat.subCategories    || [],
      assignmentGroups: cat.assignmentGroups || [],
      cc:               cat.cc               || [],
      dlGroupMembers:   cat.dlGroupMembers   || [],
      dlGroupOwners:    cat.dlGroupOwners    || [],
      createdBy:        cat.createdBy        || {},
      updatedBy:        cat.updatedBy        || {},
      createdAt:        cat.createdAt,
      updatedAt:        cat.updatedAt,
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
    const {
      categoryName,
      distributionList,
      subCategories,
      assignmentGroups = [],
      dlGroupMembers,
      dlGroupOwners,
      createdBy,
      existingCategoryId,
      isEditMode
    } = req.body;
 
    console.log("📥 [CREATE CATEGORY]", categoryName);

    if (isEditMode && existingCategoryId) {
      const existing = await CategoryConfig.findById(existingCategoryId);

      if (!existing) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Add only NEW subcategories
      const existingNames = new Set(
          (existing.subCategories || []).map(s => s.name.toLowerCase().trim())
        );

        const newSubs = subCategories.filter(sc => {
          const name = sc.name?.toLowerCase().trim();
          return name && !existingNames.has(name);
        });

      existing.subCategories = [
        ...(existing.subCategories || []),
        ...newSubs
      ];

      existing.assignmentGroups = [
        ...(existing.assignmentGroups || []),
        ...(assignmentGroups || [])
      ];

      await existing.save();

      return res.json({
        message: "Category updated successfully",
        category: existing
      });
    }
 
    // ── Validation ──────────────────────────────────────────────
    if (!categoryName || !categoryName.trim())
      return res.status(400).json({ message: "Category name is required" });
 
    if (!distributionList?.id)
      return res.status(400).json({ message: "Distribution List ID is required" });
 
    if (!subCategories || subCategories.length === 0)
      return res.status(400).json({ message: "At least one sub-category is required" });
 
    // Unique categoryName check
    const nameExists = await CategoryConfig.findOne({
      categoryName: { $regex: new RegExp(`^${categoryName.trim()}$`, "i") },
    });
    if (nameExists)
      return res.status(400).json({ message: `Category "${categoryName.trim()}" already exists` });
 
    // Sub-category duplicate check within request
    const subNames = subCategories.map(sc =>
      (typeof sc === "string" ? sc : sc.name).toLowerCase().trim()
    );
    const dupsInReq = subNames.filter((n, i) => subNames.indexOf(n) !== i);
    if (dupsInReq.length)
      return res.status(400).json({ message: `Duplicate sub-category names: ${[...new Set(dupsInReq)].join(", ")}` });
 
    const finalSubs = subCategories.map(sc =>
      typeof sc === "string" ? { name: sc } : sc
    );
 
    // Validate assignment groups
    const finalGroups = (Array.isArray(assignmentGroups) ? assignmentGroups : []).map(g => ({
      name:    g.name?.trim() || "Unnamed Group",
      members: Array.isArray(g.members) ? g.members : [],
    }));
 
    // ── Create ───────────────────────────────────────────────────
    const category = await CategoryConfig.create({
      categoryName:    categoryName.trim(),
      name:            categoryName.trim(),
      type:            "NORMAL",
      distributionList: {
        id:           distributionList.id,
        name:         distributionList.name         || "",
        mail:         distributionList.mail         || "",
        mailNickname: distributionList.mailNickname || "",
      },
      subCategories:    finalSubs,
      assignmentGroups: finalGroups,
      cc:               [],
      dlGroupMembers:   Array.isArray(dlGroupMembers) ? dlGroupMembers : [],
      dlGroupOwners:    Array.isArray(dlGroupOwners)  ? dlGroupOwners  : [],
      createdBy:        createdBy || {},
    });
 
    console.log("✅ [CREATE CATEGORY] Saved:", categoryName.trim());
 
    res.status(201).json({
      id:               category._id.toString(),
      categoryName:     category.categoryName,
      name:             category.name,
      distributionList: category.distributionList,
      subCategories:    category.subCategories,
      assignmentGroups: category.assignmentGroups,
      dlGroupMembers:   category.dlGroupMembers,
      dlGroupOwners:    category.dlGroupOwners,
      createdAt:        category.createdAt,
    });
 
    // ── Background email notifications (unchanged logic) ─────────
    setImmediate(async () => {
      try {
        const prodUrl  = process.env.PROD_URL;
        const dlName   = distributionList.name || categoryName.trim();
        const nowIST   = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const subList  = subCatSummaryText(finalSubs);
 
        const memberEmails   = pluckEmails(dlGroupMembers);
        const ownerEmails    = pluckEmails(dlGroupOwners);
        const otherApprovers = collectOtherApprovers(finalSubs);
        const creatorEmail   = createdBy?.mail || "";
 
        const commonFields = [
          { label: "Category Name",     value: categoryName.trim() },
          { label: "Distribution List", value: dlName },
          { label: "DL Email",          value: distributionList.mail || "—" },
          { label: "Sub-Categories",    value: finalSubs.length },
          { label: "Created By",        value: createdBy?.name || createdBy?.mail || "Admin" },
          { label: "Created At (IST)",  value: nowIST },
        ];
 
        // 1. Creator
        if (creatorEmail) {
          const html = buildHtmlEmail({
            title:       `✅ Category Created: ${categoryName.trim()}`,
            subtitle:    `You successfully created a new helpdesk category`,
            statusColor: "#002060",
            fields:      commonFields,
            description: `Sub-categories configured:\n\n${subList}`,
            actionLink:  `${prodUrl}/settings`,
            actionText:  "View Settings",
          });
          await sendEmail(creatorEmail, `[CATEGORY CREATED] ${categoryName.trim()} — Configuration Confirmed`, html);
        }
 
        // 2. DL Members
        if (memberEmails.length > 0) {
          const html = buildHtmlEmail({
            title:       `📋 New Category Created: ${categoryName.trim()}`,
            subtitle:    `A new helpdesk category has been set up for your distribution list`,
            statusColor: "#0369a1",
            fields:      [...commonFields, { label: "Your Role", value: "DL Group Member" }],
            description: `You are a member of the "${dlName}" distribution list.\n\nSub-categories now available:\n\n${subList}\n\nTickets submitted under these categories will be routed to your group.`,
            actionLink:  prodUrl,
            actionText:  "Open Helpdesk",
          });
          await sendEmail(memberEmails, `[CATEGORY CREATED] ${categoryName.trim()} — New Helpdesk Category for Your Group`, html);
        }
 
        // 3. DL Owners (skip those already in members)
        const ownerOnlyEmails = ownerEmails.filter(e => !memberEmails.includes(e));
        if (ownerOnlyEmails.length > 0) {
          const html = buildHtmlEmail({
            title:       `📋 New Category Created: ${categoryName.trim()}`,
            subtitle:    `A new helpdesk category has been configured under your distribution list`,
            statusColor: "#059669",
            fields:      [...commonFields, { label: "Your Role", value: "DL Group Owner" }],
            description: `As an owner of "${dlName}", a new helpdesk category has been created.\n\nSub-categories:\n\n${subList}`,
            actionLink:  `${prodUrl}/settings`,
            actionText:  "View Settings",
          });
          await sendEmail(ownerOnlyEmails, `[CATEGORY CREATED] ${categoryName.trim()} — Category Created Under Your Group`, html);
        }
 
        // 4. Other Approvers
        for (const approver of otherApprovers) {
          const theirSubs = finalSubs
            .filter(s => s.approval?.otherApprovers?.some(a => (a.email || "").toLowerCase() === approver.email))
            .map(s => s.name);
          const html = buildHtmlEmail({
            title:       `🔔 You are an Approver for: ${categoryName.trim()}`,
            subtitle:    `You have been designated as an approver for helpdesk tickets`,
            statusColor: "#7c3aed",
            fields: [
              { label: "Category",          value: categoryName.trim() },
              { label: "Distribution List", value: dlName },
              { label: "Your Role",         value: "Custom Approver" },
              { label: "Sub-Categories",    value: theirSubs.join(", ") },
              { label: "Assigned By",       value: createdBy?.name || "Admin" },
              { label: "Assigned At (IST)", value: nowIST },
            ],
            description: `You have been added as a custom approver for:\n\n${theirSubs.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nUnder the "${categoryName.trim()}" category.`,
            actionLink:  prodUrl,
            actionText:  "Open Helpdesk",
          });
          await sendEmail(approver.email, `[APPROVER ASSIGNED] ${categoryName.trim()} — You are a Designated Approver`, html);
        }
 
        console.log(`✅ [CATEGORY] All CREATE notifications sent for: ${categoryName.trim()}`);
      } catch (mailErr) {
        console.error("❌ [CATEGORY] CREATE notification error:", mailErr.message);
      }
    });
 
  } catch (err) {
    console.error("❌ [CREATE CATEGORY] Error:", err);
    // Handle mongoose duplicate key error
    if (err.code === 11000) {
      return res.status(400).json({ message: "A category with this name already exists" });
    }
    return res.status(500).json({ message: "Failed to create category", error: err.message });
  }
});

// -------- DELETE /api/categories/:id --------
app.delete("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const category = await CategoryConfig.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    
    const categoryName = category.categoryName;
    await CategoryConfig.findByIdAndDelete(id);
    
    console.log("✅ [DELETE CATEGORY] Deleted:", categoryName);
    
    res.json({ 
      message: "Category deleted successfully", 
      categoryName: categoryName 
    });
    
  } catch (err) {
    console.error("❌ [DELETE CATEGORY] Error:", err);
    res.status(500).json({ message: "Failed to delete category", error: err.message });
  }
});

// -------- PUT /api/categories/:id --------
app.put("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      categoryName,
      distributionList,
      subCategories,
      assignmentGroups,
      dlGroupMembers,
      dlGroupOwners,
      updatedBy,
    } = req.body;
 
    if (!categoryName?.trim())
      return res.status(400).json({ message: "Category name is required" });
 
    const oldCategory = await CategoryConfig.findById(id);
    if (!oldCategory)
      return res.status(404).json({ message: "Category not found" });
 
    // ❌ COMPLETELY REMOVED - No DL change authorization check
    // const mainDLChanged = distributionList?.id && oldCategory.distributionList?.id !== distributionList.id;
    // if (mainDLChanged) { ... }
 
    // ── categoryName uniqueness (allow keeping same name) ────────
    const nameConflict = await CategoryConfig.findOne({
      categoryName: { $regex: new RegExp(`^${categoryName.trim()}$`, "i") },
      _id: { $ne: id },
    });
    if (nameConflict)
      return res.status(400).json({ message: `Category name "${categoryName.trim()}" is already taken` });
 
    // ── Process sub-categories ───────────────────────────────────
    const finalSubs = (subCategories || []).map(sc => {
      if (typeof sc === "string") return { name: sc };
      
      return {
        name: sc.name,
        description: sc.description || "",
        distributionList: sc.distributionList || null,
        assignmentGroups: Array.isArray(sc.assignmentGroups) ? sc.assignmentGroups : [],
        dlGroupMembers: Array.isArray(sc.dlGroupMembers) ? sc.dlGroupMembers : [],
        dlGroupOwners: Array.isArray(sc.dlGroupOwners) ? sc.dlGroupOwners : [],
        onBehalf: {
          enabled: sc.onBehalf?.enabled || false,
          required: sc.onBehalf?.required || false,
        },
        attachments: {
          enabled: sc.attachments?.enabled || false,
          required: sc.attachments?.required || false,
        },
        approval: {
          requireApproval: sc.approval?.requireApproval || false,
          reportingManager: sc.approval?.reportingManager || false,
          requireAll: sc.approval?.requireAll || false,
          otherApprovers: Array.isArray(sc.approval?.otherApprovers) ? sc.approval.otherApprovers : [],
        },
      };
    });
 
    // ── Assignment groups ────────────────────────────────────────
    const finalGroups = (Array.isArray(assignmentGroups) ? assignmentGroups : []).map(g => ({
      name:      g.name?.trim() || "Unnamed Group",
      members:   Array.isArray(g.members) ? g.members : [],
      createdAt: g.createdAt || new Date(),
    }));
 
    // ── Build update object ─────────────────────────────────────
    const updateData = {
      categoryName: categoryName.trim(),
      name: categoryName.trim(),
      subCategories: finalSubs,
      assignmentGroups: finalGroups,
      cc: [],
      dlGroupMembers: Array.isArray(dlGroupMembers) ? dlGroupMembers : [],
      dlGroupOwners: Array.isArray(dlGroupOwners) ? dlGroupOwners : [],
      updatedBy: updatedBy || {},
    };
    
    if (distributionList?.id) {
      updateData.distributionList = {
        id: distributionList.id,
        name: distributionList.name || "",
        mail: distributionList.mail || "",
        mailNickname: distributionList.mailNickname || "",
      };
    }
 
    // ── Save ─────────────────────────────────────────────────────
    const updated = await CategoryConfig.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
 
    console.log("✅ [UPDATE CATEGORY] Saved:", categoryName.trim());
 
    res.json({
      id: updated._id.toString(),
      categoryName: updated.categoryName,
      name: updated.name,
      distributionList: updated.distributionList,
      subCategories: updated.subCategories,
      assignmentGroups: updated.assignmentGroups,
      dlGroupMembers: updated.dlGroupMembers,
      dlGroupOwners: updated.dlGroupOwners,
      updatedAt: updated.updatedAt,
    });
 
    // ── Background email notifications ───────────────────────────
    setImmediate(async () => {
      try {
        const prodUrl      = process.env.PROD_URL;
        const dlName       = distributionList?.name || categoryName.trim();
        const nowIST       = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const memberEmails = pluckEmails(dlGroupMembers);
        const ownerEmails  = pluckEmails(dlGroupOwners);
        const otherApprovers = collectOtherApprovers(finalSubs);
        const updaterEmail = updatedBy?.mail || "";
 
        const changeLines = diffSubCategories(oldCategory.subCategories || [], finalSubs);
        const changeText  = changeLines.length > 0 ? changeLines.join("\n") : "Minor configuration updates were made.";
        const newSubList  = subCatSummaryText(finalSubs);
 
        const commonFields = [
          { label: "Category Name",     value: categoryName.trim() },
          { label: "Distribution List", value: dlName },
          { label: "DL Email",          value: distributionList?.mail || "—" },
          { label: "Updated By",        value: updatedBy?.name || updatedBy?.mail || "Admin" },
          { label: "Updated At (IST)",  value: nowIST },
          { label: "Sub-Categories",    value: finalSubs.length },
        ];
 
        // 1. Updater
        if (updaterEmail) {
          const html = buildHtmlEmail({
            title:       `✅ Category Updated: ${categoryName.trim()}`,
            subtitle:    `Your changes have been saved`,
            statusColor: "#002060",
            fields:      commonFields,
            description: `What changed:\n\n${changeText}\n\nCurrent sub-category configuration:\n\n${newSubList}`,
            actionLink:  `${prodUrl}/settings`,
            actionText:  "View Settings",
          });
          await sendEmail(updaterEmail, `[CATEGORY UPDATED] ${categoryName.trim()} — Changes Saved`, html);
        }
 
        // 2. DL Members
        if (memberEmails.length > 0) {
          const html = buildHtmlEmail({
            title:       `🔄 Category Updated: ${categoryName.trim()}`,
            subtitle:    `The helpdesk category for your distribution list has been updated`,
            statusColor: "#0369a1",
            fields:      [...commonFields, { label: "Your Role", value: "DL Group Member" }],
            description: `What changed:\n\n${changeText}\n\n---\n\nCurrent sub-category configuration:\n\n${newSubList}`,
            actionLink:  prodUrl,
            actionText:  "Open Helpdesk",
          });
          await sendEmail(memberEmails, `[CATEGORY UPDATED] ${categoryName.trim()} — Configuration Changes`, html);
        }
 
        // 3. DL Owners (skip those already in members)
        const ownerOnlyEmails = ownerEmails.filter(e => !memberEmails.includes(e));
        if (ownerOnlyEmails.length > 0) {
          const html = buildHtmlEmail({
            title:       `🔄 Category Updated: ${categoryName.trim()}`,
            subtitle:    `A category under your distribution list has been updated`,
            statusColor: "#059669",
            fields:      [...commonFields, { label: "Your Role", value: "DL Group Owner" }],
            description: `The category "${categoryName.trim()}" was updated.\n\nWhat changed:\n\n${changeText}\n\nCurrent sub-categories:\n\n${newSubList}`,
            actionLink:  `${prodUrl}/settings`,
            actionText:  "View Settings",
          });
          await sendEmail(ownerOnlyEmails, `[CATEGORY UPDATED] ${categoryName.trim()} — Changes to Your Group's Category`, html);
        }
 
        // 4. Other Approvers
        const oldApproverEmails = new Set(collectOtherApprovers(oldCategory.subCategories || []).map(a => a.email));
        for (const approver of otherApprovers) {
          const theirSubs = finalSubs
            .filter(s => s.approval?.otherApprovers?.some(a => (a.email || "").toLowerCase() === approver.email))
            .map(s => s.name);
          const isNew = !oldApproverEmails.has(approver.email);
          const html = buildHtmlEmail({
            title:       `🔄 Category Updated: ${categoryName.trim()}`,
            subtitle:    isNew ? `You have been added as an approver` : `A category you approve for has been updated`,
            statusColor: "#7c3aed",
            fields: [
              { label: "Category",          value: categoryName.trim() },
              { label: "Distribution List", value: dlName },
              { label: "Your Role",         value: "Custom Approver" },
              { label: "Sub-Categories",    value: theirSubs.join(", ") },
              { label: "Updated By",        value: updatedBy?.name || "Admin" },
              { label: "Updated At (IST)",  value: nowIST },
            ],
            description: `${isNew ? `You have been newly added as an approver for: ${theirSubs.join(", ")}` : `You remain a designated approver for: ${theirSubs.join(", ")}`}\n\nWhat changed:\n\n${changeText}`,
            actionLink:  prodUrl,
            actionText:  "Open Helpdesk",
          });
          await sendEmail(approver.email, `[CATEGORY UPDATED] ${categoryName.trim()} — Approver Notification`, html);
        }
 
        console.log(`✅ [CATEGORY] All UPDATE notifications sent for: ${categoryName.trim()}`);
      } catch (mailErr) {
        console.error("❌ [CATEGORY] UPDATE notification error:", mailErr.message);
      }
    });
 
  } catch (err) {
    console.error("❌ [UPDATE CATEGORY] Error:", err.message);
    if (err.code === 11000)
      return res.status(400).json({ message: "A category with this name already exists" });
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
// ===================== PASSWORD RESET APPROVAL ROUTES =====================

// POST /api/requests/:id/approve — Handles BOTH Password Reset AND Admin Access
app.post("/api/requests/:id/approve", async (req, res) => {
  try {
    const { actorEmail, actorName, actorId, note } = req.body;

    if (!actorEmail) {
      return res.status(400).json({ message: "Actor email is required" });
    }

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    // Detect request type
    const isPasswordReset = request.service?.name?.toLowerCase().includes("password reset");
    const isAdminAccess = request.service?.name?.toLowerCase().includes("admin access") ||
                          request.service?.name?.toLowerCase().includes("device admin");

    if (!isPasswordReset && !isAdminAccess) {
      return res.status(400).json({ message: "This action is only valid for password reset or admin access requests" });
    }

    const actorEmailLower = (actorEmail || '').toLowerCase();
    const actorIdLower = (actorId || '').toLowerCase();
    const assignedEmail = (request.assignedMember?.memberEmail || '').toLowerCase();
    const assignedMemberId = (request.assignedMember?.memberId || '').toLowerCase();

    const isAssignedMember =
      (assignedEmail && actorEmailLower === assignedEmail) ||
      (assignedMemberId && actorIdLower === assignedMemberId);

    // Get group members — use stored members first, fallback to live DB lookup
    let groupMembers = request.assignmentGroup?.members || [];
    if (groupMembers.length === 0 && request.assignmentGroup?.groupId) {
      try {
        const fullGroup = await AssignmentGroup.findById(request.assignmentGroup.groupId).catch(() => null)
          || await AssignmentGroup.findOne({ name: request.assignmentGroup.groupName });
        if (fullGroup) groupMembers = fullGroup.members || [];
      } catch (e) {
        console.error('⚠️ [APPROVE] Group lookup failed:', e.message);
      }
    }

    const isInGroup = groupMembers.some(member => {
      const memberEmail = (member.email || member.mail || '').toLowerCase();
      const memberId = (member.id || member.memberId || '').toLowerCase();
      return memberEmail === actorEmailLower || memberId === actorIdLower;
    });

    const isAuthorized = isAssignedMember || isInGroup;

    console.log('🔍 [APPROVE] Authorization check:', {
      actorEmail: actorEmailLower,
      actorId: actorIdLower,
      isAssignedMember,
      isInGroup,
      isAuthorized,
      groupMembersCount: groupMembers.length
    });

    if (!isAuthorized) {
      return res.status(403).json({
        message: "Only group members can approve this request",
        debug: { actorEmail: actorEmailLower, isInGroup, isAssignedMember, groupMembersCount: groupMembers.length }
      });
    }

    // ============================================================
    // CASE 1: PASSWORD RESET
    // ============================================================
    if (isPasswordReset) {
      const targetEmail = request.onBehalf?.enabled && request.onBehalf?.user?.mail
        ? request.onBehalf.user.mail
        : request.raisedBy.mail;

      if (!targetEmail) {
        return res.status(400).json({ message: "Cannot determine target user for password reset" });
      }

      let tempPassword;
      try {
        tempPassword = await resetAzurePassword(targetEmail);
      } catch (azureErr) {
        console.error("❌ Azure reset failed:", azureErr.message);
        return res.status(500).json({ message: "Azure password reset failed", error: azureErr.message });
      }

      request.history = request.history || [];
      request.history.push({
        action: 'approved',
        by: actorName || actorEmail,
        at: new Date(),
        notes: `Password reset approved by ${actorName || actorEmail}. Temporary password sent to ${targetEmail}`
      });

      request.status = "resolved";
      request.resolvedAt = new Date();
      request.updatedBy = { id: actorId || "", name: actorName || actorEmail, mail: actorEmail };
      request.notes = note || `Password reset approved by ${actorName || actorEmail}.`;

      request.history.push({
        action: 'resolved',
        by: actorName || actorEmail,
        at: new Date(),
        notes: `Request resolved after password reset approval`
      });

      await request.save();
      console.log(`✅ [APPROVE] Password reset approved for ${targetEmail} by ${actorEmail}`);

      res.json({
        message: "Password reset approved successfully",
        requestNumber: request.requestNumber,
        targetEmail,
        tempPassword,
      });

      setImmediate(async () => {
        try {
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          const prodUrl = process.env.PROD_URL;

          const targetHtml = buildHtmlEmail({
            title: `🔑 Your Password Has Been Reset`,
            subtitle: `Your temporary password is ready`,
            statusColor: "#002060",
            fields: [
              { label: "Request No.", value: request.requestNumber },
              { label: "Temporary Password", value: `<strong style="font-size:16px;">${tempPassword}</strong>` },
            ],
            description: `Your password has been reset. You will be required to change it on your next sign-in.`,
            actionLink: "https://myaccount.microsoft.com",
            actionText: "Sign In & Change Password",
          });
          await sendEmail(targetEmail, `[PASSWORD RESET] ${request.requestNumber} — Your Temporary Password`, targetHtml);

          await sendEmail(actorEmail, `[PASSWORD RESET] ${request.requestNumber} — Approved by You`,
            buildHtmlEmail({
              title: `✅ Password Reset Approved`,
              subtitle: `Request ${request.requestNumber}`,
              statusColor: "#059669",
              fields: [
                { label: "Reset For", value: targetEmail },
                { label: "Approved At", value: nowIST },
              ],
              actionLink: `${prodUrl}/requests/${request._id}`,
              actionText: "View Request",
            })
          );
        } catch (mailErr) {
          console.error("❌ Email error:", mailErr.message);
        }
      });
    }

    // ============================================================
    // CASE 2: ADMIN ACCESS
    // ============================================================
    else if (isAdminAccess) {
      const targetEmail = request.raisedBy?.mail;
      const targetName = request.raisedBy?.name || targetEmail;

      if (!targetEmail) {
        return res.status(400).json({ message: "Cannot determine target user for admin access" });
      }

      let userObjectId;
      try {
        const userData = await getUserByUpn(targetEmail);
        userObjectId = userData.id;
        console.log(`✅ Found user: ${targetName} (${userObjectId})`);
      } catch (userErr) {
        console.error("❌ Failed to get user from Azure:", userErr.message);
        return res.status(500).json({ message: "Failed to verify user in Azure AD", error: userErr.message });
      }

      const groupId = process.env.AZURE_DEVICE_ADMIN_GROUP_ID;
      if (!groupId) {
        return res.status(500).json({ message: "Device Admin Group ID not configured" });
      }

      try {
        await addUserToGroup(groupId, userObjectId);
        console.log(`✅ User ${targetEmail} added to Device Admin Group`);
      } catch (groupErr) {
        console.error("❌ Failed to add user to group:", groupErr.message);
        return res.status(500).json({ message: "Failed to add user to admin group", error: groupErr.message });
      }

      request.history = request.history || [];
      request.history.push({
        action: 'approved',
        by: actorName || actorEmail,
        at: new Date(),
        notes: `Admin access approved by ${actorName || actorEmail}. User added to Device Admin Group.`
      });

      request.status = "resolved";
      request.resolvedAt = new Date();
      request.updatedBy = { id: actorId || "", name: actorName || actorEmail, mail: actorEmail };
      request.notes = note || `Admin access approved by ${actorName || actorEmail}. User added to Device Admin Group.`;

      request.history.push({
        action: 'resolved',
        by: actorName || actorEmail,
        at: new Date(),
        notes: `Request resolved after admin access granted`
      });

      await request.save();
      console.log(`✅ [APPROVE] Admin access approved for ${targetEmail} by ${actorEmail}`);

      res.json({
        message: "Admin access approved successfully",
        requestNumber: request.requestNumber,
        targetEmail,
        groupId,
      });

      setImmediate(async () => {
        try {
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          const prodUrl = process.env.PROD_URL;

          const requesterHtml = buildHtmlEmail({
            title: `✅ Admin Access Granted`,
            subtitle: `Your request ${request.requestNumber} has been approved`,
            statusColor: "#16a34a",
            fields: [
              { label: "Request No.", value: request.requestNumber },
              { label: "Access Type", value: "Device Administrator" },
              { label: "Approved By", value: actorName || actorEmail },
              { label: "Approved At", value: nowIST },
            ],
            description: `You have been granted Device Administrator access. You now have administrative privileges on Azure AD joined devices.`,
            actionLink: `${prodUrl}/requests/${request._id}`,
            actionText: "View Request",
          });
          await sendEmail(targetEmail, `[ADMIN ACCESS] ${request.requestNumber} — Access Granted`, requesterHtml);

          const approverHtml = buildHtmlEmail({
            title: `✅ Admin Access Approved`,
            subtitle: `Request ${request.requestNumber}`,
            statusColor: "#059669",
            fields: [
              { label: "Request No.", value: request.requestNumber },
              { label: "User Granted Access", value: `${targetName} (${targetEmail})` },
              { label: "Approved At", value: nowIST },
            ],
            description: `You have successfully granted Device Admin access to ${targetName}.`,
            actionLink: `${prodUrl}/requests/${request._id}`,
            actionText: "View Request",
          });
          await sendEmail(actorEmail, `[ADMIN ACCESS] ${request.requestNumber} — Approved by You`, approverHtml);
        } catch (mailErr) {
          console.error("❌ Email error:", mailErr.message);
        }
      });
    }

  } catch (err) {
    console.error("❌ [APPROVE] Error:", err);
    res.status(500).json({ message: "Approval failed", error: err.message });
  }
});


// POST /api/requests/:id/reject — Handles BOTH Password Reset AND Admin Access
app.post("/api/requests/:id/reject", async (req, res) => {
  try {
    const { actorEmail, actorName, actorId, reason, note } = req.body;

    if (!actorEmail) {
      return res.status(400).json({ message: "Actor email is required" });
    }

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const isPasswordReset = request.service?.name?.toLowerCase().includes("password reset");
    const isAdminAccess = request.service?.name?.toLowerCase().includes("admin access") ||
                          request.service?.name?.toLowerCase().includes("device admin");

    if (!isPasswordReset && !isAdminAccess) {
      return res.status(400).json({ message: "This action is only valid for password reset or admin access requests" });
    }

    const actorEmailLower = (actorEmail || '').toLowerCase();
    const actorIdLower = (actorId || '').toLowerCase();
    const assignedEmail = (request.assignedMember?.memberEmail || '').toLowerCase();
    const assignedMemberId = (request.assignedMember?.memberId || '').toLowerCase();

    const isAssignedMember =
      (assignedEmail && actorEmailLower === assignedEmail) ||
      (assignedMemberId && actorIdLower === assignedMemberId);

    // Get group members — use stored members first, fallback to live DB lookup
    let groupMembers = request.assignmentGroup?.members || [];
    if (groupMembers.length === 0 && request.assignmentGroup?.groupId) {
      try {
        const fullGroup = await AssignmentGroup.findById(request.assignmentGroup.groupId).catch(() => null)
          || await AssignmentGroup.findOne({ name: request.assignmentGroup.groupName });
        if (fullGroup) groupMembers = fullGroup.members || [];
      } catch (e) {
        console.error('⚠️ [REJECT] Group lookup failed:', e.message);
      }
    }

    const isInGroup = groupMembers.some(member => {
      const memberEmail = (member.email || member.mail || '').toLowerCase();
      const memberId = (member.id || member.memberId || '').toLowerCase();
      return memberEmail === actorEmailLower || memberId === actorIdLower;
    });

    const isAuthorized = isAssignedMember || isInGroup;

    console.log('🔍 [REJECT] Authorization check:', {
      actorEmail: actorEmailLower,
      actorId: actorIdLower,
      isAssignedMember,
      isInGroup,
      isAuthorized,
      groupMembersCount: groupMembers.length
    });

    if (!isAuthorized) {
      return res.status(403).json({ message: "Only group members can reject this request" });
    }

    const requestType = isPasswordReset ? "password reset" : "admin access";

    request.history = request.history || [];
    request.history.push({
      action: 'cancelled',
      by: actorName || actorEmail,
      at: new Date(),
      reason: reason,
      notes: `${requestType} rejected by ${actorName || actorEmail}. Reason: ${reason || 'No reason provided'}`
    });

    request.status = "cancelled";
    request.updatedBy = { id: actorId || "", name: actorName || actorEmail, mail: actorEmail };
    request.notes = note || (reason ? `Rejected. Reason: ${reason}` : `Rejected by ${actorName || actorEmail}`);

    await request.save();
    console.log(`✅ [REJECT] ${requestType} rejected for ${request.requestNumber} by ${actorEmail}`);

    res.json({
      message: `${requestType} request rejected`,
      requestNumber: request.requestNumber,
    });

    setImmediate(async () => {
      try {
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const prodUrl = process.env.PROD_URL;
        const requesterEmail = request.raisedBy.mail;

        const title = isPasswordReset
          ? `❌ Password Reset Request Rejected`
          : `❌ Admin Access Request Rejected`;

        const subject = isPasswordReset
          ? `[PASSWORD RESET] ${request.requestNumber} — Request Rejected`
          : `[ADMIN ACCESS] ${request.requestNumber} — Request Rejected`;

        if (requesterEmail) {
          const html = buildHtmlEmail({
            title: title,
            subtitle: `Your request ${request.requestNumber} has been rejected`,
            statusColor: "#dc2626",
            fields: [
              { label: "Request No.", value: request.requestNumber },
              { label: "Request Type", value: isPasswordReset ? "Password Reset" : "Admin Access" },
              { label: "Rejected By", value: actorName || actorEmail },
              { label: "Rejected At", value: nowIST },
              ...(reason ? [{ label: "Reason", value: reason }] : []),
            ],
            description: reason || `Your ${requestType} request was rejected. Please contact IT support if you need further assistance.`,
            actionLink: `${prodUrl}/requests/${request._id}`,
            actionText: "View Request",
          });
          await sendEmail(requesterEmail, subject, html);
        }

        await sendEmail(actorEmail, `${subject} — Rejected by You`,
          buildHtmlEmail({
            title: `${isPasswordReset ? 'Password Reset' : 'Admin Access'} Rejected`,
            subtitle: `Request ${request.requestNumber}`,
            statusColor: "#6b7280",
            fields: [
              { label: "Requested By", value: request.raisedBy?.name || request.raisedBy?.mail },
              { label: "Request Type", value: isPasswordReset ? "Password Reset" : "Admin Access" },
              ...(reason ? [{ label: "Reason Given", value: reason }] : []),
            ],
            actionLink: `${prodUrl}/requests/${request._id}`,
            actionText: "View Request",
          })
        );
      } catch (mailErr) {
        console.error("❌ Email error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error("❌ [REJECT] Error:", err);
    res.status(500).json({ message: "Rejection failed", error: err.message });
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


// -------- CREATE DISTRIBUTION LIST --------
app.post("/api/dl/create-dl", async (req, res) => {
  try {
    const { name, email, members = [], owners = [] } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email required" });
    }

    console.log("📥 Creating DL:", name, email);

    // 🔒 sanitize
    const safeName = name.replace(/[^a-zA-Z0-9-_ ]/g, "");
    const safeEmail = email.replace(/[^a-zA-Z0-9@._-]/g, "");

    // 🧠 Build PowerShell script
    let psScript = `
    $env:PSModulePath = "C:\\Users\\AllenJohn\\Documents\\WindowsPowerShell\\Modules;C:\\Program Files\\WindowsPowerShell\\Modules;" + $env:PSModulePath;
Import-Module ExchangeOnlineManagement;

Connect-ExchangeOnline -AppId '${process.env.AZURE_CLIENT_ID}' -CertificateThumbprint '${process.env.CERT_THUMBPRINT}' -Organization '${process.env.TENANT_DOMAIN}';

$dl = Get-DistributionGroup -Identity '${safeEmail}' -ErrorAction SilentlyContinue;
if ($dl) {
  Write-Output "EXISTS";
  exit;
}

New-DistributionGroup -Name '${safeName}' -PrimarySmtpAddress '${safeEmail}';
`;

    // ✅ Add Members
    members.forEach(m => {
      if (m.mail) {
        psScript += `
Add-DistributionGroupMember -Identity '${safeEmail}' -Member '${m.mail}';
`;
      }
    });

    // ✅ Add Owners
    owners.forEach(o => {
      if (o.mail) {
        psScript += `
Set-DistributionGroup -Identity '${safeEmail}' -ManagedBy @{Add='${o.mail}'};
`;
      }
    });

    // ✅ Disconnect AFTER everything
    psScript += `
Disconnect-ExchangeOnline -Confirm:$false;
`;

    // 🔥 Encode script
    const encoded = Buffer.from(psScript, "utf16le").toString("base64");

    // 🔥 Execute using Windows PowerShell
    exec(
      `C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -EncodedCommand ${encoded}`,
      (error, stdout, stderr) => {
        console.log("🟢 STDOUT:", stdout);
        console.log("🔴 STDERR:", stderr);

        if (error) {
          console.error("❌ DL Error:", error);
          return res.status(500).json({
            error: stderr || "DL creation failed"
          });
        }

        if (stdout.includes("EXISTS")) {
          return res.status(400).json({
            error: "Distribution list already exists"
          });
        }

        console.log("✅ DL Created Successfully");

        res.json({
          message: "DL Created Successfully",
          output: stdout
        });
      }
    );

  } catch (err) {
    console.error("❌ DL Route Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const serviceSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
 
    // Linked category
    category: {
      id:   { type: String },
      name: { type: String },
    },
 
    // Distribution List (who gets notified when a request is raised)
    distributionList: {
      id:           { type: String },
      name:         { type: String },
      mail:         { type: String },
      mailNickname: { type: String },
    },
 
    // Assignment group selected
    assignmentGroup: {
      groupId:   { type: String },
      groupName: { type: String },
      members: [           // ← ADD THIS
    {
      id:       { type: String },
      name:     { type: String },
      email:    { type: String },
      isManual: { type: Boolean }
    }
  ]
    },
 
    // The specific member assigned to handle requests for this service
    assignedMember: {
      memberId:    { type: String },
      memberName:  { type: String },
      memberEmail: { type: String },
    },
 
    // DL members snapshot (for email dispatch)
    dlGroupMembers: [{ id: String, email: String, displayName: String }],
 
    createdBy: { id: String, name: String, mail: String },
  },
  { timestamps: true }
);
 
const Service = mongoose.model('Service', serviceSchema);
 
 
// ─────────────────────────────────────────────────────────────────────
// GET /api/services — list all services
// ─────────────────────────────────────────────────────────────────────
app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: -1 });
    res.json(services);
  } catch (err) {
    console.error('❌ Get services error:', err);
    res.status(500).json({ message: 'Failed to fetch services' });
  }
});
 
 // ─────────────────────────────────────────────────────────────────────
// POST /api/services — create a new service (improved validation + logging)
// ─────────────────────────────────────────────────────────────────────
app.post('/api/services', async (req, res) => {
  try {
    const {
      serviceName,
      category,
      distributionList,
      assignmentGroup,
      dlGroupMembers = [],
      createdBy,
    } = req.body;

    console.log('⬇️ POST /api/services payload:', JSON.stringify(req.body, null, 2));

    // ── Validation ────────────────────────────────────────────────
    if (!serviceName?.trim()) {
      return res.status(400).json({ message: 'Service name is required' });
    }

    if (!category?.name) {
      return res.status(400).json({ message: 'Category is required' });
    }

    if (!distributionList?.id) {
      return res.status(400).json({ message: 'Distribution List is required' });
    }

    // ❌ REMOVED: assignedMember validation (no longer needed)

    // ── Save ──────────────────────────────────────────────────────
    const service = await Service.create({
      serviceName: serviceName.trim(),
      category,
      distributionList,
      assignmentGroup, // ✅ now contains members
      dlGroupMembers: Array.isArray(dlGroupMembers) ? dlGroupMembers : [],
      createdBy: createdBy || {},
    });

    console.log('✅ [CREATE SERVICE] Saved:', serviceName.trim());
    res.status(201).json(service);

    // ── Background Email Logic ─────────────────────────────────────
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        const commonFields = [
          { label: 'Service Name', value: serviceName.trim() },
          { label: 'Category', value: category.name },
          { label: 'Distribution List', value: distributionList.name || '—' },
          { label: 'Assignment Group', value: assignmentGroup?.groupName || '—' },
          { label: 'Created By', value: createdBy?.name || createdBy?.mail || 'Admin' },
          { label: 'Created At (IST)', value: nowIST },
        ];

        // ✅ Creator Email
        if (createdBy?.mail) {
          const html = buildHtmlEmail({
            title: `✅ Service Created: ${serviceName.trim()}`,
            subtitle: 'New service configured successfully',
            statusColor: '#002060',
            fields: commonFields,
            description: `The service "${serviceName.trim()}" has been set up.`,
            actionLink: `${prodUrl}/settings`,
            actionText: 'View Settings',
          });

          await sendEmail(
            createdBy.mail,
            `[SERVICE CREATED] ${serviceName.trim()} — Configured Successfully`,
            html
          );
        }

        // ✅ DL Members Email
        const dlEmails = [
          ...new Set((dlGroupMembers || []).map(m => m.email).filter(Boolean))
        ];

        if (dlEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `📋 New Service: ${serviceName.trim()}`,
            subtitle: `A new service has been set up for your distribution list`,
            statusColor: '#0369a1',
            fields: [...commonFields, { label: 'Your Role', value: 'DL Group Member' }],
            description: `The service "${serviceName.trim()}" is now active.`,
            actionLink: prodUrl,
            actionText: 'Open Helpdesk',
          });

          await sendEmail(
            dlEmails,
            `[SERVICE CREATED] ${serviceName.trim()} — New Service for Your Group`,
            html
          );
        }

        // ✅ NEW: Assignment Group Members Email
        const agMembers = assignmentGroup?.members || [];

        const agEmails = [
          ...new Set(
            agMembers
              .map(m => m.email || m.mail || m.id || "")
              .filter(Boolean)
          )
        ];

        if (agEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `📢 New Service Assigned to Your Group`,
            subtitle: `${serviceName.trim()} has been assigned to your group`,
            statusColor: '#7c3aed',
            fields: [...commonFields, { label: 'Your Role', value: 'Assignment Group Member' }],
            description: `This service is assigned to your group. All members are notified.`,
            actionLink: prodUrl,
            actionText: 'Open Helpdesk',
          });

          await sendEmail(
            agEmails,
            `[GROUP ASSIGNED] ${serviceName.trim()} — Action Required`,
            html
          );
        }

        console.log(`✅ [SERVICE] All CREATE notifications sent for: ${serviceName.trim()}`);

      } catch (mailErr) {
        console.error('❌ [SERVICE] CREATE notification error:', mailErr.message);
      }
    });

  } catch (err) {
    console.error('❌ [CREATE SERVICE] Error:', err);
    return res.status(500).json({ message: 'Failed to create service', error: err.message });
  }
});
// ===================== NEW SCHEMAS =====================
// -------- Request Schema --------

const requestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, unique: true },

    service: {
      id:          { type: String, required: true },
      name:        { type: String, required: true },
      categoryName:{ type: String },
    },

    assignmentGroup: {
      groupId:   { type: String },
      groupName: { type: String },
    },

    assignedMember: {
      memberId:    { type: String },
      memberName:  { type: String },
      memberEmail: { type: String },
    },

    raisedBy: {
      id:   { type: String, required: true },
      name: { type: String },
      mail: { type: String, required: true },
    },

    onBehalf: {
      enabled: { type: Boolean, default: false },
      user: {
        id:   { type: String },
        name: { type: String },
        mail: { type: String },
      },
    },

    description: { type: String, default: "" },

    attachments: [
      {
        id:       { type: String },
        driveId:  { type: String },
        fileName: { type: String },
        fileType: { type: String },
        url:      { type: String },
      },
    ],

    approval: {
      required:  { type: Boolean, default: false },
      status:    { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
      approvers: [{ id: String, name: String, email: String }],
      approvedBy:{ id: String, name: String, email: String },
      approvedAt:{ type: Date },
      comments:  { type: String },
    },

    status: {
      type: String,
      enum: ["open", "in_progress", "pending_approval", "resolved", "closed", "cancelled"],
      default: "open",
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    resolvedAt:  { type: Date },
    closedAt:    { type: Date },
    notes:       { type: String },

    updatedBy: { id: String, name: String, mail: String },

    // ✅ HISTORY ARRAY - Track all events
    history: [
      {
        action:    { type: String },
        by:        { type: String },
        at:        { type: Date, default: Date.now },
        newStatus: { type: String },
        oldStatus: { type: String },
        reason:    { type: String },
        notes:     { type: String },
      }
    ],
  },
  { timestamps: true }
);

requestSchema.pre("save", async function (next) {
  if (!this.requestNumber) {
    const count = await mongoose.model("Request").countDocuments();
    this.requestNumber = `REQ-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

const Request = mongoose.model("Request", requestSchema);
module.exports = Request;


// -------- Incident Schema --------

const messageSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
  },
  sender: {
    id: String,
    name: String,
    email: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  readBy: [{
    type: String, // User IDs who have read this message
  }],
  deleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: Date,
  deletedBy: String,
});

const incidentSchema = new mongoose.Schema(
  {
    incidentNumber: { type: String, unique: true }, // e.g. INC-0001

    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true },

    category: {
      id:   { type: String },
      name: { type: String },
    },

    assignmentGroup: {
      groupId:   { type: String },
      groupName: { type: String },
    },

    assignedMember: {
      memberId:    { type: String },
      memberName:  { type: String },
      memberEmail: { type: String },
    },

    raisedBy: {
      id:   { type: String, required: true },
      name: { type: String },
      mail: { type: String, required: true },
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed", "cancelled"],
      default: "open",
    },

    // Attachments (SharePoint refs)
    attachments: [
      {
        id:       { type: String },
        driveId:  { type: String },
        fileName: { type: String },
        fileType: { type: String },
        url:      { type: String },
      },
    ],

    resolvedAt: { type: Date },
    closedAt:   { type: Date },
    notes:      { type: String },

    updatedBy: { id: String, name: String, mail: String },
  },
  { timestamps: true }
);

incidentSchema.pre("save", async function (next) {
  if (!this.incidentNumber) {
    const count = await Incident.countDocuments();
    this.incidentNumber = `INC-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

const Incident = mongoose.model("Incident", incidentSchema);


// ===================== REQUEST ROUTES =====================

// GET /api/requests — all requests (admin view)
app.get("/api/requests", async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error("❌ Get requests error:", err);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

// GET /api/requests/mine — current user's requests
app.get("/api/requests/mine", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email is required" });
    const requests = await Request.find({ "raisedBy.mail": email }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error("❌ Get my requests error:", err);
    res.status(500).json({ message: "Failed to fetch your requests" });
  }
});

// GET /api/requests/:id — single request
app.get("/api/requests/:id", async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const doc = request.toObject();

    // If members are missing (old requests), live-fetch from AssignmentGroup
    if (
      doc.assignmentGroup?.groupId &&
      (!doc.assignmentGroup.members || doc.assignmentGroup.members.length === 0)
    ) {
      try {
        const fullGroup = await AssignmentGroup.findById(doc.assignmentGroup.groupId).catch(() => null)
  || await AssignmentGroup.findOne({ name: doc.assignmentGroup.groupName });
        if (fullGroup) {
          doc.assignmentGroup.members = fullGroup.members || [];
          console.log(`✅ [GET REQUEST] Enriched with ${doc.assignmentGroup.members.length} members from DB`);
        }
      } catch (e) {
        console.error("⚠️ [GET REQUEST] Could not enrich assignment group members:", e.message);
      }
    }

    res.json(doc);
  } catch (err) {
    console.error("❌ Get request error:", err);
    res.status(500).json({ message: "Failed to fetch request" });
  }
});


// POST /api/requests — Create new request
app.post("/api/requests", async (req, res) => {
  try {
    const {
      service,
      assignmentGroup,
      assignedMember,
      raisedBy,
      onBehalf,
      description,
      attachments,
      approval,
      priority,
    } = req.body;

    if (!service?.id)   return res.status(400).json({ message: "Service is required" });
    if (!raisedBy?.mail) return res.status(400).json({ message: "Requester info is required" });

    // ✅ FIX: Fetch the full assignment group from database to get members
    let finalAssignmentGroup = assignmentGroup || {};
    
    if (finalAssignmentGroup?.groupId) {
      try {
        console.log(`🔍 [CREATE REQUEST] Fetching assignment group: ${finalAssignmentGroup.groupId}`);
        
        // Fetch the assignment group from your AssignmentGroup collection
        const fullGroup = await AssignmentGroup.findById(finalAssignmentGroup.groupId).catch(() => null) || await AssignmentGroup.findOne({ name: finalAssignmentGroup.groupName });
        
        if (fullGroup) {
          // ✅ COPY ALL MEMBERS from the assignment group
          finalAssignmentGroup = {
            groupId: fullGroup._id.toString(),
            groupName: fullGroup.name,
            members: fullGroup.members || []  // ← THIS IS WHAT YOU NEED!
          };
          console.log(`✅ [CREATE REQUEST] Copied ${finalAssignmentGroup.members.length} members from group "${fullGroup.name}"`);
          console.log(`   Members:`, finalAssignmentGroup.members.map(m => ({ name: m.name, email: m.email })));
        } else {
          console.log(`⚠️ [CREATE REQUEST] Assignment group not found: ${finalAssignmentGroup.groupId}`);
        }
      } catch (err) {
        console.error(`❌ [CREATE REQUEST] Error fetching assignment group:`, err.message);
      }
    }

    // Auto-assign a member from the group members
    let finalAssignedMember = assignedMember || {};
    
    if ((!finalAssignedMember.memberEmail || !finalAssignedMember.memberId) && finalAssignmentGroup?.members?.length > 0) {
      const firstMember = finalAssignmentGroup.members[0];
      const memberEmail = firstMember.email || firstMember.mail || '';
      const memberId = firstMember.id || '';
      const memberName = firstMember.name || firstMember.displayName || memberEmail || '';
      
      finalAssignedMember = {
        memberId: memberId,
        memberName: memberName,
        memberEmail: memberEmail
      };
      console.log(`✅ [CREATE REQUEST] Auto-assigned member: ${memberName} (${memberEmail})`);
    }

    // Determine initial status
    const initialStatus = approval?.required ? "pending_approval" : "open";

    const request = new Request({
      service,
      assignmentGroup: finalAssignmentGroup,  // ← NOW INCLUDES MEMBERS!
      assignedMember: finalAssignedMember,
      raisedBy,
      onBehalf: onBehalf || { enabled: false },
      description: description || "",
      attachments: Array.isArray(attachments) ? attachments : [],
      approval: approval || { required: false },
      priority: priority || "medium",
      status: initialStatus,
      
      history: [
        {
          action: 'created',
          by: raisedBy?.name || raisedBy?.mail || 'System',
          at: new Date(),
          notes: `Request created by ${raisedBy?.name || raisedBy?.mail}`
        }
      ]
    });

    await request.save();
    
    console.log("✅ [CREATE REQUEST] Saved:", request.requestNumber);
    console.log("   Group members count:", request.assignmentGroup?.members?.length || 0);

    res.status(201).json(request);

    // ... rest of your email notification code ...

  } catch (err) {
    console.error("❌ [CREATE REQUEST] Error:", err);
    res.status(500).json({ message: "Failed to create request", error: err.message });
  }
});

app.patch("/api/requests/:id", async (req, res) => {
  try {
    const { status, assignedMember, assignmentGroup, notes, updatedBy, priority } = req.body;

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    // Track old values for history
    const oldStatus = request.status;
    const oldPriority = request.priority;

    // Update fields
    if (status)          request.status = status;
    if (priority)        request.priority = priority;
    if (assignedMember)  request.assignedMember = assignedMember;
    if (assignmentGroup) request.assignmentGroup = assignmentGroup;
    if (notes)           request.notes = notes;
    if (updatedBy)       request.updatedBy = updatedBy;

    // Set timestamps
    if (status === "resolved") request.resolvedAt = new Date();
    if (status === "closed")   request.closedAt = new Date();

    // ✅ Add history for status change (for ALL requests)
    if (status && status !== oldStatus) {
      request.history = request.history || [];
      request.history.push({
        action: 'status_updated',
        by: updatedBy?.name || updatedBy?.mail || 'System',
        at: new Date(),
        oldStatus: oldStatus,
        newStatus: status,
        notes: notes || `Status changed from ${oldStatus} to ${status} by ${updatedBy?.name || 'Admin'}`
      });
    }

    // ✅ Add special history for resolved
    if (status === 'resolved' && oldStatus !== 'resolved') {
      request.history.push({
        action: 'resolved',
        by: updatedBy?.name || updatedBy?.mail || 'System',
        at: new Date(),
        notes: notes || 'Request marked as resolved'
      });
    }

    // ✅ Add special history for closed
    if (status === 'closed' && oldStatus !== 'closed') {
      request.history.push({
        action: 'closed',
        by: updatedBy?.name || updatedBy?.mail || 'System',
        at: new Date(),
        notes: notes || 'Request closed'
      });
    }

    await request.save();
    console.log("✅ [UPDATE REQUEST]", request.requestNumber, "→", status || "updated");

    res.json(request);

    // Send email notification (background)
    if (status && status !== oldStatus) {
      setImmediate(async () => {
        try {
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          const statusColors = {
            open: "#0369a1", in_progress: "#d97706", pending_approval: "#7c3aed",
            resolved: "#16a34a", closed: "#6b7280", cancelled: "#dc2626",
          };

          if (request.raisedBy?.mail) {
            const html = buildHtmlEmail({
              title: `Request ${request.requestNumber} — Status Updated`,
              subtitle: `Your request status has changed to ${status.replace(/_/g, " ").toUpperCase()}`,
              statusColor: statusColors[status] || "#002060",
              fields: [
                { label: "Request No.", value: request.requestNumber },
                { label: "Service", value: request.service?.name },
                { label: "New Status", value: status.replace(/_/g, " ").toUpperCase() },
                { label: "Updated By", value: updatedBy?.name || "Admin" },
                { label: "Updated At", value: nowIST },
              ],
              description: notes || "",
              actionLink: `${prodUrl}/requests/${request._id}`,
              actionText: "View Request",
            });
            await sendEmail(request.raisedBy.mail, `[REQUEST] ${request.requestNumber} — Status: ${status.toUpperCase()}`, html);
          }
        } catch (mailErr) {
          console.error("❌ [UPDATE] Email error:", mailErr.message);
        }
      });
    }

  } catch (err) {
    console.error("❌ [UPDATE REQUEST] Error:", err);
    res.status(500).json({ message: "Failed to update request" });
  }
});


// ===================== INCIDENT ROUTES =====================

// GET /api/incidents — all incidents (admin)
app.get("/api/incidents", async (req, res) => {
  try {
    const incidents = await Incident.find().sort({ createdAt: -1 });
    res.json(incidents);
  } catch (err) {
    console.error("❌ Get incidents error:", err);
    res.status(500).json({ message: "Failed to fetch incidents" });
  }
});

// GET /api/incidents/mine — current user's incidents
app.get("/api/incidents/mine", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email is required" });
    const incidents = await Incident.find({ "raisedBy.mail": email }).sort({ createdAt: -1 });
    res.json(incidents);
  } catch (err) {
    console.error("❌ Get my incidents error:", err);
    res.status(500).json({ message: "Failed to fetch your incidents" });
  }
});

// GET /api/incidents/:id — single incident
app.get("/api/incidents/:id", async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: "Incident not found" });
    res.json(incident);
  } catch (err) {
    console.error("❌ Get incident error:", err);
    res.status(500).json({ message: "Failed to fetch incident" });
  }
});

// POST /api/incidents — user raises an incident
app.post("/api/incidents", async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      assignmentGroup,
      assignedMember,
      raisedBy,
      priority,
      attachments,
    } = req.body;

    if (!title?.trim())   return res.status(400).json({ message: "Title is required" });
    if (!description?.trim()) return res.status(400).json({ message: "Description is required" });
    if (!raisedBy?.mail)  return res.status(400).json({ message: "Requester info is required" });

    const incident = new Incident({
      title:           title.trim(),
      description:     description.trim(),
      category:        category        || {},
      assignmentGroup: assignmentGroup || {},
      assignedMember:  assignedMember  || {},
      raisedBy,
      priority:    priority || "medium",
      attachments: Array.isArray(attachments) ? attachments : [],
      status: "open",
    });

    await incident.save();
    console.log("✅ [CREATE INCIDENT] Saved:", incident.incidentNumber);

    res.status(201).json(incident);

    // Background email
    setImmediate(async () => {
      try {
        const nowIST  = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const prodUrl = process.env.PROD_URL;

        const priorityColors = {
          low:      "#16a34a",
          medium:   "#0369a1",
          high:     "#d97706",
          critical: "#dc2626",
        };

        // Notify requester
        if (raisedBy?.mail) {
          const html = buildHtmlEmail({
            title:       `✅ Incident Raised: ${incident.incidentNumber}`,
            subtitle:    `Your incident has been logged`,
            statusColor: priorityColors[priority] || "#0369a1",
            fields: [
              { label: "Incident No.", value: incident.incidentNumber },
              { label: "Title",        value: title.trim() },
              { label: "Category",     value: category?.name || "—" },
              { label: "Priority",     value: priority || "medium" },
              { label: "Status",       value: "Open" },
              { label: "Raised At",    value: nowIST },
            ],
            description: description.trim(),
            actionLink:  `${prodUrl}/incidents/${incident._id}`,
            actionText:  "View Incident",
          });
          await sendEmail(raisedBy.mail, `[INCIDENT] ${incident.incidentNumber} — Logged Successfully`, html);
        }

        // Notify assigned member
        if (assignedMember?.memberEmail) {
          const html = buildHtmlEmail({
            title:       `🚨 Incident Assigned: ${incident.incidentNumber}`,
            subtitle:    `A new incident has been assigned to you`,
            statusColor: priorityColors[priority] || "#0369a1",
            fields: [
              { label: "Incident No.", value: incident.incidentNumber },
              { label: "Title",        value: title.trim() },
              { label: "Priority",     value: priority || "medium" },
              { label: "Raised By",    value: `${raisedBy.name} (${raisedBy.mail})` },
              { label: "Raised At",    value: nowIST },
            ],
            description: description.trim(),
            actionLink:  `${prodUrl}/incidents/${incident._id}`,
            actionText:  "View Incident",
          });
          await sendEmail(assignedMember.memberEmail, `[INCIDENT ASSIGNED] ${incident.incidentNumber} — Action Required`, html);
        }

        console.log(`✅ [INCIDENT] Notifications sent for: ${incident.incidentNumber}`);
      } catch (mailErr) {
        console.error("❌ [INCIDENT] Notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error("❌ [CREATE INCIDENT] Error:", err);
    res.status(500).json({ message: "Failed to raise incident", error: err.message });
  }
});

// PATCH /api/incidents/:id — admin updates status / assignment
app.patch("/api/incidents/:id", async (req, res) => {
  try {
    const { status, assignedMember, assignmentGroup, notes, updatedBy, priority } = req.body;

    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: "Incident not found" });

    if (status)          incident.status          = status;
    if (priority)        incident.priority        = priority;
    if (assignedMember)  incident.assignedMember  = assignedMember;
    if (assignmentGroup) incident.assignmentGroup = assignmentGroup;
    if (notes)           incident.notes           = notes;
    if (updatedBy)       incident.updatedBy       = updatedBy;

    if (status === "resolved") incident.resolvedAt = new Date();
    if (status === "closed")   incident.closedAt   = new Date();

    await incident.save();
    console.log("✅ [UPDATE INCIDENT]", incident.incidentNumber, "→", status);

    res.json(incident);

    // Notify requester of status change
    setImmediate(async () => {
      try {
        if (!status) return;
        const nowIST  = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const prodUrl = process.env.PROD_URL;

        const statusColors = {
          open:        "#0369a1",
          in_progress: "#d97706",
          resolved:    "#16a34a",
          closed:      "#6b7280",
          cancelled:   "#dc2626",
        };

        if (incident.raisedBy?.mail) {
          const html = buildHtmlEmail({
            title:       `Incident ${incident.incidentNumber} — Status Updated`,
            subtitle:    `Your incident status has changed`,
            statusColor: statusColors[status] || "#002060",
            fields: [
              { label: "Incident No.", value: incident.incidentNumber },
              { label: "Title",        value: incident.title },
              { label: "New Status",   value: status.replace(/_/g, " ").toUpperCase() },
              { label: "Updated By",   value: updatedBy?.name || "Admin" },
              { label: "Updated At",   value: nowIST },
            ],
            description: notes || "",
            actionLink:  `${prodUrl}/incidents/${incident._id}`,
            actionText:  "View Incident",
          });
          await sendEmail(incident.raisedBy.mail, `[INCIDENT] ${incident.incidentNumber} — Status: ${status.toUpperCase()}`, html);
        }
      } catch (mailErr) {
        console.error("❌ [INCIDENT] Status notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error("❌ [UPDATE INCIDENT] Error:", err);
    res.status(500).json({ message: "Failed to update incident" });
  }
});


// ===================== EXTENDED SERVICE ROUTES =====================

// GET /api/services/:id — single service
app.get("/api/services/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
  } catch (err) {
    console.error("❌ Get service error:", err);
    res.status(500).json({ message: "Failed to fetch service" });
  }
});

// PUT /api/services/:id — edit a service
app.put("/api/services/:id", async (req, res) => {
  try {
    const {
      serviceName,
      category,
      distributionList,
      assignmentGroup,
      assignedMember,
      dlGroupMembers,
    } = req.body;

    if (!serviceName?.trim())
      return res.status(400).json({ message: "Service name is required" });

    const updated = await Service.findByIdAndUpdate(
      req.params.id,
      {
        serviceName:     serviceName.trim(),
        category,
        distributionList,
        assignmentGroup,
        assignedMember,
        dlGroupMembers: Array.isArray(dlGroupMembers) ? dlGroupMembers : [],
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Service not found" });

    console.log("✅ [UPDATE SERVICE] Saved:", serviceName.trim());
    res.json(updated);
  } catch (err) {
    console.error("❌ [UPDATE SERVICE] Error:", err);
    res.status(500).json({ message: "Failed to update service" });
  }
});

// DELETE /api/services/:id — delete a service
app.delete("/api/services/:id", async (req, res) => {
  try {
    const deleted = await Service.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Service not found" });
    console.log("✅ [DELETE SERVICE] Deleted:", deleted.serviceName);
    res.json({ message: "Service deleted successfully" });
  } catch (err) {
    console.error("❌ [DELETE SERVICE] Error:", err);
    res.status(500).json({ message: "Failed to delete service" });
  }
});

// =====================================================================
// ASSIGNMENT GROUP SCHEMA
// =====================================================================
const assignmentGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    members: [{
      id: { type: String },
      name: { type: String },
      email: { type: String },
      isManual: { type: Boolean, default: false }
    }],
    manualMembers: [{
      id: { type: String },
      name: { type: String },
      email: { type: String }
    }],
    distributionList: {
      id: { type: String },
      name: { type: String },
      mail: { type: String },
      members: [{ id: String, name: String, email: String }]
    },
    createdBy: {
      id: { type: String },
      name: { type: String },
      email: { type: String }
    }
  },
  { timestamps: true }
);

const AssignmentGroup = mongoose.model('AssignmentGroup', assignmentGroupSchema);

// =====================================================================
// ASSIGNMENT GROUP ROUTES
// =====================================================================

// GET /api/assignment-groups - Get all assignment groups
app.get('/api/assignment-groups', async (req, res) => {
  try {
    const groups = await AssignmentGroup.find().sort({ createdAt: -1 });
    res.json(groups);
  } catch (err) {
    console.error('❌ Get assignment groups error:', err);
    res.status(500).json({ message: 'Failed to fetch assignment groups' });
  }
});

// GET /api/assignment-groups/:id - Get single assignment group
app.get('/api/assignment-groups/:id', async (req, res) => {
  try {
    const group = await AssignmentGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Assignment group not found' });
    }
    res.json(group);
  } catch (err) {
    console.error('❌ Get assignment group error:', err);
    res.status(500).json({ message: 'Failed to fetch assignment group' });
  }
});

// POST /api/assignment-groups - Create assignment group
app.post('/api/assignment-groups', async (req, res) => {
  try {
    const { name, description, members, distributionList, manualMembers, createdBy } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    if (!members || members.length === 0) {
      return res.status(400).json({ message: 'At least one member is required' });
    }

    const group = await AssignmentGroup.create({
      name: name.trim(),
      description: description || '',
      members,
      manualMembers: manualMembers || [],
      distributionList: distributionList || null,
      createdBy: createdBy || {}
    });

    console.log(`✅ Assignment group created: ${name}`);
    res.status(201).json(group);
  } catch (err) {
    console.error('❌ Create assignment group error:', err);
    res.status(500).json({ message: 'Failed to create assignment group', error: err.message });
  }
});

// PUT /api/assignment-groups/:id - Update assignment group
app.put('/api/assignment-groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, members, distributionList, manualMembers } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    if (!members || members.length === 0) {
      return res.status(400).json({ message: 'At least one member is required' });
    }

    const group = await AssignmentGroup.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        description: description || '',
        members,
        manualMembers: manualMembers || [],
        distributionList: distributionList || null
      },
      { new: true, runValidators: true }
    );

    if (!group) {
      return res.status(404).json({ message: 'Assignment group not found' });
    }

    console.log(`✅ Assignment group updated: ${name}`);
    res.json(group);
  } catch (err) {
    console.error('❌ Update assignment group error:', err);
    res.status(500).json({ message: 'Failed to update assignment group', error: err.message });
  }
});

// DELETE /api/assignment-groups/:id - Delete assignment group
app.delete('/api/assignment-groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const group = await AssignmentGroup.findByIdAndDelete(id);

    if (!group) {
      return res.status(404).json({ message: 'Assignment group not found' });
    }

    console.log(`✅ Assignment group deleted: ${group.name}`);
    res.json({ message: 'Assignment group deleted successfully', group: group.name });
  } catch (err) {
    console.error('❌ Delete assignment group error:', err);
    res.status(500).json({ message: 'Failed to delete assignment group', error: err.message });
  }
});

// ===================== INCIDENT MESSAGE ROUTES =====================

// ===================== INCIDENT MESSAGE ROUTES =====================

// GET /api/incidents/:id/messages - Fetch all messages for an incident
app.get('/api/incidents/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    
    const incident = await Incident.findById(id);
    if (!incident) {
      return res.status(404).json({ message: 'Incident not found' });
    }
    
    const messages = incident.messages || [];
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    res.json(messages);
    
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// POST /api/incidents/:id/messages - Send a new message
app.post('/api/incidents/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { message, sender } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }
    
    if (!sender || !sender.email) {
      return res.status(400).json({ message: 'Sender information is required' });
    }
    
    const incident = await Incident.findById(id);
    if (!incident) {
      return res.status(404).json({ message: 'Incident not found' });
    }
    
    // BOTH raised person AND assigned person can chat
    const raisedEmail = incident.raisedBy?.mail?.toLowerCase();
    const assignedEmail = incident.assignedMember?.memberEmail?.toLowerCase();
    const senderEmail = sender.email.toLowerCase();
    
    if (senderEmail !== raisedEmail && senderEmail !== assignedEmail) {
      return res.status(403).json({ 
        message: 'Only the person who raised this incident and the assigned person can chat' 
      });
    }
    
    const newMessage = {
      message: message.trim(),
      sender: {
        id: sender.id || '',
        name: sender.name || 'Unknown',
        email: sender.email,
      },
      createdAt: new Date(),
    };
    
    if (!incident.messages) {
      incident.messages = [];
    }
    
    incident.messages.push(newMessage);
    await incident.save();
    
    res.status(201).json(newMessage);
    
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// ===================== KB ARTICLE SCHEMA =====================
const kbArticleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    content: { type: String, required: true }, // HTML content from rich text editor
    
    // Category from CategoryConfig
    category: {
      id: { type: String },
      name: { type: String }
    },
    
    // Assignment Group from AssignmentGroup collection
    assignmentGroup: {
      groupId: { type: String },
      groupName: { type: String }
    },
    
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft"
    },
    
    createdBy: {
      id: { type: String },
      name: { type: String },
      email: { type: String }
    },
    
    updatedBy: {
      id: { type: String },
      name: { type: String },
      email: { type: String }
    },
    
    viewCount: { type: Number, default: 0 },
    tags: [{ type: String }], // Optional: for search
  },
  { timestamps: true }
);

const KBArticle = mongoose.model("KBArticle", kbArticleSchema);

// ===================== KB ARTICLE ROUTES =====================

// GET /api/kb/articles - Get all articles (filter by status, category, group)
app.get("/api/kb/articles", async (req, res) => {
  try {
    const { status, categoryId, groupId, search } = req.query;
    let filter = {};
    
    if (status) filter.status = status;
    if (categoryId) filter["category.id"] = categoryId;
    if (groupId) filter["assignmentGroup.groupId"] = groupId;
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } }
      ];
    }
    
    const articles = await KBArticle.find(filter).sort({ createdAt: -1 });
    res.json(articles);
  } catch (err) {
    console.error("❌ Get KB articles error:", err);
    res.status(500).json({ message: "Failed to fetch articles" });
  }
});

// GET /api/kb/articles/published - Get all published articles (for regular users)
app.get("/api/kb/articles/published", async (req, res) => {
  try {
    const { categoryId, groupId, search } = req.query;
    let filter = { status: "published" };
    
    if (categoryId) filter["category.id"] = categoryId;
    if (groupId) filter["assignmentGroup.groupId"] = groupId;
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } }
      ];
    }
    
    const articles = await KBArticle.find(filter).sort({ createdAt: -1 });
    res.json(articles);
  } catch (err) {
    console.error("❌ Get published KB articles error:", err);
    res.status(500).json({ message: "Failed to fetch published articles" });
  }
});

// GET /api/kb/articles/:id - Get single article
app.get("/api/kb/articles/:id", async (req, res) => {
  try {
    const article = await KBArticle.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }
    
    // Increment view count (don't await, do in background)
    article.viewCount += 1;
    article.save().catch(err => console.error("View count update error:", err));
    
    res.json(article);
  } catch (err) {
    console.error("❌ Get KB article error:", err);
    res.status(500).json({ message: "Failed to fetch article" });
  }
});

// POST /api/kb/articles - Create new article (draft or published)
app.post("/api/kb/articles", async (req, res) => {
  try {
    const {
      title,
      description,
      content,
      category,
      assignmentGroup,
      status,
      createdBy,
      tags
    } = req.body;
    
    if (!title?.trim()) {
      return res.status(400).json({ message: "Title is required" });
    }
    
    if (!content?.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }
    
    const article = new KBArticle({
      title: title.trim(),
      description: description || "",
      content,
      category: category || {},
      assignmentGroup: assignmentGroup || {},
      status: status === "published" ? "published" : "draft",
      createdBy: createdBy || {},
      updatedBy: createdBy || {},
      tags: tags || []
    });
    
    await article.save();
    
    console.log(`✅ [KB ARTICLE] ${status === "published" ? "Published" : "Saved as draft"}: ${title}`);
    
    res.status(201).json(article);
  } catch (err) {
    console.error("❌ Create KB article error:", err);
    res.status(500).json({ message: "Failed to create article", error: err.message });
  }
});

// PUT /api/kb/articles/:id - Update article
app.put("/api/kb/articles/:id", async (req, res) => {
  try {
    const {
      title,
      description,
      content,
      category,
      assignmentGroup,
      status,
      updatedBy,
      tags
    } = req.body;
    
    const article = await KBArticle.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }
    
    if (title) article.title = title.trim();
    if (description !== undefined) article.description = description;
    if (content) article.content = content;
    if (category) article.category = category;
    if (assignmentGroup) article.assignmentGroup = assignmentGroup;
    if (status) article.status = status;
    if (updatedBy) article.updatedBy = updatedBy;
    if (tags) article.tags = tags;
    
    await article.save();
    
    console.log(`✅ [KB ARTICLE] Updated: ${article.title} (Status: ${article.status})`);
    
    res.json(article);
  } catch (err) {
    console.error("❌ Update KB article error:", err);
    res.status(500).json({ message: "Failed to update article", error: err.message });
  }
});

// DELETE /api/kb/articles/:id - Delete article
app.delete("/api/kb/articles/:id", async (req, res) => {
  try {
    const article = await KBArticle.findByIdAndDelete(req.params.id);
    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }
    
    console.log(`✅ [KB ARTICLE] Deleted: ${article.title}`);
    res.json({ message: "Article deleted successfully" });
  } catch (err) {
    console.error("❌ Delete KB article error:", err);
    res.status(500).json({ message: "Failed to delete article", error: err.message });
  }
});

// GET /api/kb/articles/categories - Get all categories with article counts
app.get("/api/kb/articles/categories/stats", async (req, res) => {
  try {
    const stats = await KBArticle.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$category.name", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json(stats);
  } catch (err) {
    console.error("❌ Get category stats error:", err);
    res.status(500).json({ message: "Failed to fetch category stats" });
  }
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Server running on port ${PORT}`)
);