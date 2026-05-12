// server.js (FULL UPDATED - WITH COMPLETE EMAIL NOTIFICATIONS)
// ---------------------- Imports -------------------------
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
const https = require("https");
const multer = require("multer");
const path = require("path");
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
      console.log("❌ Blocked by CORS:", cleanOrigin);
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

    subCategories: [
      {
        name: { type: String, required: true },
        description: { type: String, default: "" },
        distributionList: {
          id: { type: String },
          name: { type: String },
          mail: { type: String },
          mailNickname: { type: String },
        },
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

// ===================== EMAIL HELPER FUNCTIONS =====================

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
    <td>` : '';

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

const sendEmail = async (to, subject, bodyHtml) => {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    console.log("⚠️ [MAIL] No recipients provided, skipping");
    return false;
  }
  
  try {
    const addresses = Array.isArray(to) ? to : [to];
    const validAddresses = addresses.filter(addr => addr && addr.trim());
    
    if (validAddresses.length === 0) {
      console.log("⚠️ [MAIL] No valid email addresses");
      return false;
    }
    
    console.log(`\n📧 [MAIL] Preparing email...`);
    console.log("To:", validAddresses.join(", "));
    console.log("Subject:", subject);

    const token = await getGraphToken();

    const normalize = (addrList) => {
      const emails = Array.isArray(addrList) ? addrList : [addrList];
      return emails.filter(Boolean).map(addr => ({ emailAddress: { address: addr.trim() } }));
    };

    const mailBody = {
      message: {
        subject,
        body: { contentType: "HTML", content: bodyHtml.trim() },
        toRecipients: normalize(validAddresses),
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

    if (res.status === 202) {
      console.log(`✅ [MAIL] Email sent SUCCESSFULLY to: ${validAddresses.join(", ")}`);
      return true;
    } else {
      const errorText = await res.text();
      console.log("❌ [MAIL] Email FAILED:", res.status, errorText);
      return false;
    }
  } catch (err) {
    console.error("❌ [MAIL] Error sending email:", err.message);
    return false;
  }
};

// ===================== RECIPIENT COLLECTION HELPERS =====================

// Get DL Members from Category by category ID
const getDLMembersFromCategory = async (categoryId) => {
  try {
    if (!categoryId) return [];
    const category = await CategoryConfig.findById(categoryId);
    if (!category) return [];
    const members = category.dlGroupMembers || [];
    return members.map(m => m.email).filter(Boolean);
  } catch (err) {
    console.error("❌ Failed to get DL members from category:", err.message);
    return [];
  }
};

// Get Assignment Group Members from Category
const getAssignmentGroupMembersFromCategory = async (categoryId) => {
  try {
    if (!categoryId) return [];
    const category = await CategoryConfig.findById(categoryId);
    if (!category) return [];
    const assignmentGroups = category.assignmentGroups || [];
    const allMembers = [];
    for (const group of assignmentGroups) {
      if (group.members && Array.isArray(group.members)) {
        for (const member of group.members) {
          const email = member.mail || member.email;
          if (email && !allMembers.includes(email)) {
            allMembers.push(email);
          }
        }
      }
    }
    return allMembers;
  } catch (err) {
    console.error("❌ Failed to get assignment group members from category:", err.message);
    return [];
  }
};

// Get all recipients for an Incident
const getAllIncidentRecipients = async (incident) => {
  const recipients = new Set();
  
  // Requester
  if (incident.raisedBy?.mail) recipients.add(incident.raisedBy.mail);
  
  // Assigned Member
  if (incident.assignedMember?.memberEmail) recipients.add(incident.assignedMember.memberEmail);
  
  // Group Members (from assignmentGroup)
  if (incident.assignmentGroup?.members && Array.isArray(incident.assignmentGroup.members)) {
    for (const member of incident.assignmentGroup.members) {
      const email = member.email || member.mail;
      if (email) recipients.add(email);
    }
  }
  
  // DL Members (from category)
  const dlMembers = await getDLMembersFromCategory(incident.category?.id);
  for (const email of dlMembers) recipients.add(email);
  
  return Array.from(recipients).filter(Boolean);
};

// Get all recipients for a Request
const getAllRequestRecipients = async (request) => {
  const recipients = new Set();
  
  // Requester
  if (request.raisedBy?.mail) recipients.add(request.raisedBy.mail);
  
  // Assigned Member
  if (request.assignedMember?.memberEmail) recipients.add(request.assignedMember.memberEmail);
  
  // Group Members (from assignmentGroup)
  if (request.assignmentGroup?.members && Array.isArray(request.assignmentGroup.members)) {
    for (const member of request.assignmentGroup.members) {
      const email = member.email || member.mail;
      if (email) recipients.add(email);
    }
  }
  
  // DL Members (from service or category)
  if (request.service?.id) {
    try {
      const service = await Service.findById(request.service.id);
      if (service && service.dlGroupMembers) {
        for (const member of service.dlGroupMembers) {
          if (member.email) recipients.add(member.email);
        }
      }
    } catch (err) {
      console.error("Failed to get DL members from service:", err.message);
    }
  }
  
  return Array.from(recipients).filter(Boolean);
};

// Generate diff for Assignment Group updates
const getAssignmentGroupDiff = (oldGroup, newGroup) => {
  const changes = [];
  
  // Name change
  if (oldGroup.name !== newGroup.name) {
    changes.push(`• Group name changed from "${oldGroup.name}" to "${newGroup.name}"`);
  }
  
  // Description change
  if (oldGroup.description !== newGroup.description) {
    changes.push(`• Description was updated`);
  }
  
  // Members added/removed
  const oldMemberEmails = new Set((oldGroup.members || []).map(m => (m.email || m.mail || '').toLowerCase()));
  const newMemberEmails = new Set((newGroup.members || []).map(m => (m.email || m.mail || '').toLowerCase()));
  
  const addedMembers = [...newMemberEmails].filter(email => !oldMemberEmails.has(email));
  const removedMembers = [...oldMemberEmails].filter(email => !newMemberEmails.has(email));
  
  for (const email of addedMembers) {
    const member = (newGroup.members || []).find(m => (m.email || m.mail || '').toLowerCase() === email);
    changes.push(`• ${member?.name || email} was ADDED as a member`);
  }
  
  for (const email of removedMembers) {
    const member = (oldGroup.members || []).find(m => (m.email || m.mail || '').toLowerCase() === email);
    changes.push(`• ${member?.name || email} was REMOVED from members`);
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

const addUserToGroup = async (groupId, userObjectId, retries = 2) => {
  console.log(`🔵 [ADD TO GROUP] Attempting to add user ${userObjectId} to group ${groupId}`);
  if (!groupId || !userObjectId) throw new Error("groupId and userObjectId are required");

  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const token = await getAccessToken();
      const url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members/$ref`;
      const body = { "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userObjectId}` };

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        agent: new https.Agent({ rejectUnauthorized: false }),
      });

      if (res.status === 204 || res.status === 201) {
        console.log(`✅ [ADD TO GROUP] Successfully added user to group`);
        return true;
      }

      const responseText = await res.text();
      let errorData;
      try { errorData = JSON.parse(responseText); } catch (e) { errorData = { message: responseText }; }
      const errorMessage = (errorData?.error?.message || errorData?.message || '').toLowerCase();

      if (errorMessage.includes('already exists') || errorMessage.includes('already a member')) {
        console.log(`ℹ️ [ADD TO GROUP] User is already a member`);
        return true;
      }

      lastError = new Error(`Add to group failed: ${errorMessage}`);
      if (attempt < retries + 1) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    } catch (err) {
      lastError = err;
      if (attempt < retries + 1) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  throw lastError;
};

const getUserByUpn = async (upn) => {
  console.log(`🔍 [GET USER] Looking up user: ${upn}`);
  if (!upn) throw new Error('UPN is required');

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

// -------- Admin Notifications (KEEP AS IS) --------
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
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    const targetHtml = buildHtmlEmail({
      title: `You were added as Helpdesk Admin`,
      subtitle: `You have been granted admin rights`,
      statusColor: "#0ea5e9",
      fields: [
        { label: "Added By", value: actorName },
        { label: "When (IST)", value: nowIST },
      ],
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    if (actorMail) await sendEmail(actorMail, `Admin Added — ${targetName} added to Helpdesk_Admin`, actorHtml);
    if (targetMail) await sendEmail(targetMail, `You were added as Helpdesk Admin`, targetHtml);

    return res.json({ message: "Notification attempted" });
  } catch (err) {
    console.error("❌ notify-admin-added error:", err);
    return res.status(500).json({ message: "Failed to send notifications", error: err.message });
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
      ],
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    if (actorMail) await sendEmail(actorMail, `Admin Removed — ${targetName} removed from Helpdesk_Admin`, actorHtml);
    if (targetMail) await sendEmail(targetMail, `You were removed from Helpdesk Admins`, targetHtml);

    return res.json({ message: "Notification attempted" });
  } catch (err) {
    console.error("❌ notify-admin-removed error:", err);
    return res.status(500).json({ message: "Failed to send notifications", error: err.message });
  }
});

// ===================== CATEGORY MANAGEMENT =====================

// GET /api/categories
app.get("/api/categories", async (req, res) => {
  try {
    const filter = req.query.dlId ? { "distributionList.id": req.query.dlId } : {};
    const categories = await CategoryConfig.find(filter).sort({ createdAt: -1 });
    const transformed = categories.map(cat => ({
      id: cat._id.toString(),
      categoryName: cat.categoryName,
      name: cat.name,
      type: cat.type,
      distributionList: cat.distributionList || {},
      subCategories: cat.subCategories || [],
      assignmentGroups: cat.assignmentGroups || [],
      cc: cat.cc || [],
      dlGroupMembers: cat.dlGroupMembers || [],
      dlGroupOwners: cat.dlGroupOwners || [],
      createdBy: cat.createdBy || {},
      updatedBy: cat.updatedBy || {},
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
    }));
    res.json(transformed);
  } catch (err) {
    console.error("❌ Get categories error:", err);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

// POST /api/categories (with Assignment Group Members notification)
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
      if (!existing) return res.status(404).json({ message: "Category not found" });

      const existingNames = new Set((existing.subCategories || []).map(s => s.name.toLowerCase().trim()));
      const newSubs = subCategories.filter(sc => {
        const name = sc.name?.toLowerCase().trim();
        return name && !existingNames.has(name);
      });

      existing.subCategories = [...(existing.subCategories || []), ...newSubs];
      existing.assignmentGroups = [...(existing.assignmentGroups || []), ...(assignmentGroups || [])];
      await existing.save();

      return res.json({ message: "Category updated successfully", category: existing });
    }
 
    if (!categoryName?.trim()) return res.status(400).json({ message: "Category name is required" });
    if (!distributionList?.id) return res.status(400).json({ message: "Distribution List ID is required" });
    if (!subCategories?.length) return res.status(400).json({ message: "At least one sub-category is required" });

    const nameExists = await CategoryConfig.findOne({ categoryName: { $regex: new RegExp(`^${categoryName.trim()}$`, "i") } });
    if (nameExists) return res.status(400).json({ message: `Category "${categoryName.trim()}" already exists` });

    const finalSubs = subCategories.map(sc => typeof sc === "string" ? { name: sc } : sc);
    const finalGroups = (Array.isArray(assignmentGroups) ? assignmentGroups : []).map(g => ({
      name: g.name?.trim() || "Unnamed Group",
      members: Array.isArray(g.members) ? g.members : [],
    }));

    const category = await CategoryConfig.create({
      categoryName: categoryName.trim(),
      name: categoryName.trim(),
      type: "NORMAL",
      distributionList: {
        id: distributionList.id,
        name: distributionList.name || "",
        mail: distributionList.mail || "",
        mailNickname: distributionList.mailNickname || "",
      },
      subCategories: finalSubs,
      assignmentGroups: finalGroups,
      cc: [],
      dlGroupMembers: Array.isArray(dlGroupMembers) ? dlGroupMembers : [],
      dlGroupOwners: Array.isArray(dlGroupOwners) ? dlGroupOwners : [],
      createdBy: createdBy || {},
    });

    console.log("✅ [CREATE CATEGORY] Saved:", categoryName.trim());
    res.status(201).json(category);

    // Background email notifications
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const dlName = distributionList.name || categoryName.trim();
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const subList = finalSubs.map((s, i) => `${i + 1}. ${s.name}`).join("\n");

        const memberEmails = pluckEmails(dlGroupMembers);
        const ownerEmails = pluckEmails(dlGroupOwners);
        const creatorEmail = createdBy?.mail || "";
        
        // Get Assignment Group Members
        const assignmentGroupEmails = [];
        for (const group of finalGroups) {
          if (group.members) {
            for (const member of group.members) {
              const email = member.mail || member.email;
              if (email && !assignmentGroupEmails.includes(email)) {
                assignmentGroupEmails.push(email);
              }
            }
          }
        }

        const commonFields = [
          { label: "Category Name", value: categoryName.trim() },
          { label: "Distribution List", value: dlName },
          { label: "Created By", value: createdBy?.name || "Admin" },
          { label: "Created At (IST)", value: nowIST },
        ];

        // Creator
        if (creatorEmail) {
          const html = buildHtmlEmail({
            title: `✅ Category Created: ${categoryName.trim()}`,
            subtitle: `You successfully created a new category`,
            statusColor: "#002060",
            fields: commonFields,
            description: `Sub-categories:\n\n${subList}`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          await sendEmail(creatorEmail, `[CATEGORY CREATED] ${categoryName.trim()}`, html);
        }

        // DL Members
        if (memberEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `📋 New Category Created: ${categoryName.trim()}`,
            subtitle: `A new category has been set up for your DL`,
            statusColor: "#0369a1",
            fields: [...commonFields, { label: "Your Role", value: "DL Group Member" }],
            description: `Sub-categories:\n\n${subList}`,
            actionLink: prodUrl,
            actionText: "Open Helpdesk",
          });
          await sendEmail(memberEmails, `[CATEGORY CREATED] ${categoryName.trim()}`, html);
        }

        // DL Owners
        const ownerOnlyEmails = ownerEmails.filter(e => !memberEmails.includes(e));
        if (ownerOnlyEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `📋 New Category Created: ${categoryName.trim()}`,
            subtitle: `A new category has been configured under your DL`,
            statusColor: "#059669",
            fields: [...commonFields, { label: "Your Role", value: "DL Group Owner" }],
            description: `Sub-categories:\n\n${subList}`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          await sendEmail(ownerOnlyEmails, `[CATEGORY CREATED] ${categoryName.trim()}`, html);
        }

        // ✅ NEW: Assignment Group Members
        if (assignmentGroupEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `🔧 New Category Created: ${categoryName.trim()}`,
            subtitle: `A new category has been assigned to your group`,
            statusColor: "#7c3aed",
            fields: [...commonFields, { label: "Your Role", value: "Assignment Group Member" }],
            description: `Your group will handle tickets for this category.\n\nSub-categories:\n\n${subList}`,
            actionLink: prodUrl,
            actionText: "Open Helpdesk",
          });
          await sendEmail(assignmentGroupEmails, `[CATEGORY ASSIGNED] ${categoryName.trim()}`, html);
        }

        console.log(`✅ [CATEGORY] All CREATE notifications sent for: ${categoryName.trim()}`);
      } catch (mailErr) {
        console.error("❌ [CATEGORY] CREATE notification error:", mailErr.message);
      }
    });
  } catch (err) {
    console.error("❌ [CREATE CATEGORY] Error:", err);
    if (err.code === 11000) return res.status(400).json({ message: "Category with this name already exists" });
    return res.status(500).json({ message: "Failed to create category", error: err.message });
  }
});

// Helper function for pluckEmails
const pluckEmails = (arr = []) => [...new Set(arr.map(x => (x.email || x.mail || '')).filter(Boolean))];

// DELETE /api/categories/:id
app.delete("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const category = await CategoryConfig.findById(id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    
    const categoryName = category.categoryName;
    await CategoryConfig.findByIdAndDelete(id);
    
    console.log("✅ [DELETE CATEGORY] Deleted:", categoryName);
    res.json({ message: "Category deleted successfully", categoryName });
  } catch (err) {
    console.error("❌ [DELETE CATEGORY] Error:", err);
    res.status(500).json({ message: "Failed to delete category", error: err.message });
  }
});

// PUT /api/categories/:id (with Assignment Group Members notification)
app.put("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryName, distributionList, subCategories, assignmentGroups, dlGroupMembers, dlGroupOwners, updatedBy } = req.body;
 
    if (!categoryName?.trim()) return res.status(400).json({ message: "Category name is required" });
 
    const oldCategory = await CategoryConfig.findById(id);
    if (!oldCategory) return res.status(404).json({ message: "Category not found" });
 
    const nameConflict = await CategoryConfig.findOne({
      categoryName: { $regex: new RegExp(`^${categoryName.trim()}$`, "i") },
      _id: { $ne: id },
    });
    if (nameConflict) return res.status(400).json({ message: `Category name "${categoryName.trim()}" is already taken` });
 
    const finalSubs = (subCategories || []).map(sc => {
      if (typeof sc === "string") return { name: sc };
      return {
        name: sc.name,
        description: sc.description || "",
        distributionList: sc.distributionList || null,
        assignmentGroups: Array.isArray(sc.assignmentGroups) ? sc.assignmentGroups : [],
        dlGroupMembers: Array.isArray(sc.dlGroupMembers) ? sc.dlGroupMembers : [],
        dlGroupOwners: Array.isArray(sc.dlGroupOwners) ? sc.dlGroupOwners : [],
        onBehalf: { enabled: sc.onBehalf?.enabled || false, required: sc.onBehalf?.required || false },
        attachments: { enabled: sc.attachments?.enabled || false, required: sc.attachments?.required || false },
        approval: {
          requireApproval: sc.approval?.requireApproval || false,
          reportingManager: sc.approval?.reportingManager || false,
          requireAll: sc.approval?.requireAll || false,
          otherApprovers: Array.isArray(sc.approval?.otherApprovers) ? sc.approval.otherApprovers : [],
        },
      };
    });
 
    const finalGroups = (Array.isArray(assignmentGroups) ? assignmentGroups : []).map(g => ({
      name: g.name?.trim() || "Unnamed Group",
      members: Array.isArray(g.members) ? g.members : [],
      createdAt: g.createdAt || new Date(),
    }));
 
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
 
    const updated = await CategoryConfig.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    console.log("✅ [UPDATE CATEGORY] Saved:", categoryName.trim());
    res.json(updated);
 
    // Background email notifications with Assignment Group Members
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const dlName = distributionList?.name || categoryName.trim();
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const memberEmails = pluckEmails(dlGroupMembers);
        const ownerEmails = pluckEmails(dlGroupOwners);
        const updaterEmail = updatedBy?.mail || "";
        
        // Get Assignment Group Members from NEW groups
        const assignmentGroupEmails = [];
        for (const group of finalGroups) {
          if (group.members) {
            for (const member of group.members) {
              const email = member.mail || member.email;
              if (email && !assignmentGroupEmails.includes(email)) {
                assignmentGroupEmails.push(email);
              }
            }
          }
        }
 
        const changeLines = diffSubCategories(oldCategory.subCategories || [], finalSubs);
        const changeText = changeLines.length > 0 ? changeLines.join("\n") : "Minor configuration updates were made.";
        const newSubList = finalSubs.map((s, i) => `${i + 1}. ${s.name}`).join("\n");
 
        const commonFields = [
          { label: "Category Name", value: categoryName.trim() },
          { label: "Distribution List", value: dlName },
          { label: "Updated By", value: updatedBy?.name || "Admin" },
          { label: "Updated At (IST)", value: nowIST },
        ];
 
        // Updater
        if (updaterEmail) {
          const html = buildHtmlEmail({
            title: `✅ Category Updated: ${categoryName.trim()}`,
            subtitle: `Your changes have been saved`,
            statusColor: "#002060",
            fields: commonFields,
            description: `What changed:\n\n${changeText}\n\nCurrent sub-categories:\n\n${newSubList}`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          await sendEmail(updaterEmail, `[CATEGORY UPDATED] ${categoryName.trim()}`, html);
        }
 
        // DL Members
        if (memberEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `🔄 Category Updated: ${categoryName.trim()}`,
            subtitle: `The category for your DL has been updated`,
            statusColor: "#0369a1",
            fields: [...commonFields, { label: "Your Role", value: "DL Group Member" }],
            description: `What changed:\n\n${changeText}\n\nCurrent sub-categories:\n\n${newSubList}`,
            actionLink: prodUrl,
            actionText: "Open Helpdesk",
          });
          await sendEmail(memberEmails, `[CATEGORY UPDATED] ${categoryName.trim()}`, html);
        }
 
        // DL Owners
        const ownerOnlyEmails = ownerEmails.filter(e => !memberEmails.includes(e));
        if (ownerOnlyEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `🔄 Category Updated: ${categoryName.trim()}`,
            subtitle: `A category under your DL has been updated`,
            statusColor: "#059669",
            fields: [...commonFields, { label: "Your Role", value: "DL Group Owner" }],
            description: `What changed:\n\n${changeText}\n\nCurrent sub-categories:\n\n${newSubList}`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          await sendEmail(ownerOnlyEmails, `[CATEGORY UPDATED] ${categoryName.trim()}`, html);
        }
 
        // ✅ NEW: Assignment Group Members
        if (assignmentGroupEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `🔄 Category Updated: ${categoryName.trim()}`,
            subtitle: `A category assigned to your group has been updated`,
            statusColor: "#7c3aed",
            fields: [...commonFields, { label: "Your Role", value: "Assignment Group Member" }],
            description: `What changed:\n\n${changeText}\n\nCurrent sub-categories:\n\n${newSubList}`,
            actionLink: prodUrl,
            actionText: "Open Helpdesk",
          });
          await sendEmail(assignmentGroupEmails, `[CATEGORY UPDATED] ${categoryName.trim()} - Group Notification`, html);
        }
 
        console.log(`✅ [CATEGORY] All UPDATE notifications sent for: ${categoryName.trim()}`);
      } catch (mailErr) {
        console.error("❌ [CATEGORY] UPDATE notification error:", mailErr.message);
      }
    });
  } catch (err) {
    console.error("❌ [UPDATE CATEGORY] Error:", err.message);
    if (err.code === 11000) return res.status(400).json({ message: "Category with this name already exists" });
    return res.status(500).json({ message: "Failed to update category" });
  }
});

// Helper for diffSubCategories
const diffSubCategories = (oldSubs = [], newSubs = []) => {
  const changes = [];
  const oldByName = Object.fromEntries(oldSubs.map(s => [s.name.toLowerCase(), s]));
  const newByName = Object.fromEntries(newSubs.map(s => [s.name.toLowerCase(), s]));

  for (const sub of newSubs) {
    if (!oldByName[sub.name.toLowerCase()])
      changes.push(`+ Sub-category added: "${sub.name}"`);
  }
  for (const sub of oldSubs) {
    if (!newByName[sub.name.toLowerCase()])
      changes.push(`- Sub-category removed: "${sub.name}"`);
  }
  return changes;
};

// ===================== SERVICE SCHEMA =====================
const serviceSchema = new mongoose.Schema({
  serviceName: { type: String, required: true, trim: true },
  category: { id: String, name: String },
  distributionList: { id: String, name: String, mail: String, mailNickname: String },
  assignmentGroup: { groupId: String, groupName: String, members: [{ id: String, name: String, email: String, isManual: Boolean }] },
  assignedMember: { memberId: String, memberName: String, memberEmail: String },
  dlGroupMembers: [{ id: String, email: String, displayName: String }],
  createdBy: { id: String, name: String, mail: String },
}, { timestamps: true });

const Service = mongoose.model('Service', serviceSchema);

// ===================== SERVICE ROUTES =====================

app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: -1 });
    res.json(services);
  } catch (err) {
    console.error('❌ Get services error:', err);
    res.status(500).json({ message: 'Failed to fetch services' });
  }
});

app.post('/api/services', async (req, res) => {
  try {
    const { serviceName, category, distributionList, assignmentGroup, dlGroupMembers = [], createdBy } = req.body;

    if (!serviceName?.trim()) return res.status(400).json({ message: 'Service name is required' });
    if (!category?.name) return res.status(400).json({ message: 'Category is required' });
    if (!distributionList?.id) return res.status(400).json({ message: 'Distribution List is required' });

    const service = await Service.create({
      serviceName: serviceName.trim(),
      category,
      distributionList,
      assignmentGroup,
      dlGroupMembers: Array.isArray(dlGroupMembers) ? dlGroupMembers : [],
      createdBy: createdBy || {},
    });

    console.log('✅ [CREATE SERVICE] Saved:', serviceName.trim());
    res.status(201).json(service);

    // Email notifications (keep as is)
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const commonFields = [
          { label: 'Service Name', value: serviceName.trim() },
          { label: 'Category', value: category.name },
          { label: 'Created By', value: createdBy?.name || 'Admin' },
          { label: 'Created At (IST)', value: nowIST },
        ];

        if (createdBy?.mail) {
          const html = buildHtmlEmail({
            title: `✅ Service Created: ${serviceName.trim()}`,
            statusColor: '#002060',
            fields: commonFields,
            actionLink: `${prodUrl}/settings`,
            actionText: 'View Settings',
          });
          await sendEmail(createdBy.mail, `[SERVICE CREATED] ${serviceName.trim()}`, html);
        }

        const dlEmails = [...new Set((dlGroupMembers || []).map(m => m.email).filter(Boolean))];
        if (dlEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `📋 New Service: ${serviceName.trim()}`,
            statusColor: '#0369a1',
            fields: [...commonFields, { label: 'Your Role', value: 'DL Group Member' }],
            actionLink: prodUrl,
            actionText: 'Open Helpdesk',
          });
          await sendEmail(dlEmails, `[SERVICE CREATED] ${serviceName.trim()}`, html);
        }

        const agEmails = [...new Set((assignmentGroup?.members || []).map(m => m.email || m.mail).filter(Boolean))];
        if (agEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `📢 New Service Assigned to Your Group`,
            subtitle: `${serviceName.trim()} has been assigned to your group`,
            statusColor: '#7c3aed',
            fields: [...commonFields, { label: 'Your Role', value: 'Assignment Group Member' }],
            actionLink: prodUrl,
            actionText: 'Open Helpdesk',
          });
          await sendEmail(agEmails, `[GROUP ASSIGNED] ${serviceName.trim()}`, html);
        }
      } catch (mailErr) {
        console.error('❌ [SERVICE] Notification error:', mailErr.message);
      }
    });
  } catch (err) {
    console.error('❌ [CREATE SERVICE] Error:', err);
    return res.status(500).json({ message: 'Failed to create service', error: err.message });
  }
});

// DELETE /api/requests/:id
app.delete("/api/requests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const request = await Request.findById(id);
    
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const requestNumber = request.requestNumber;
    const requestName = request.service?.name || "Unknown Service";
    
    await Request.findByIdAndDelete(id);
    
    console.log(`✅ [DELETE REQUEST] Deleted: ${requestNumber}`);
    res.json({ 
      message: "Request deleted successfully", 
      requestNumber,
      requestName
    });
  } catch (err) {
    console.error("❌ [DELETE REQUEST] Error:", err);
    res.status(500).json({ 
      message: "Failed to delete request", 
      error: err.message 
    });
  }
});

// DELETE /api/incidents/:id
app.delete("/api/incidents/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const incident = await Incident.findById(id);
    
    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    const incidentNumber = incident.incidentNumber;
    const incidentTitle = incident.title || "Unknown Incident";
    
    await Incident.findByIdAndDelete(id);
    
    console.log(`✅ [DELETE INCIDENT] Deleted: ${incidentNumber}`);
    res.json({ 
      message: "Incident deleted successfully", 
      incidentNumber,
      incidentTitle
    });
  } catch (err) {
    console.error("❌ [DELETE INCIDENT] Error:", err);
    res.status(500).json({ 
      message: "Failed to delete incident", 
      error: err.message 
    });
  }
});

app.get('/api/services/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
  } catch (err) {
    console.error("❌ Get service error:", err);
    res.status(500).json({ message: "Failed to fetch service" });
  }
});

app.put('/api/services/:id', async (req, res) => {
  try {
    const { serviceName, category, distributionList, assignmentGroup, assignedMember, dlGroupMembers } = req.body;
    if (!serviceName?.trim()) return res.status(400).json({ message: "Service name is required" });

    const updated = await Service.findByIdAndUpdate(req.params.id, {
      serviceName: serviceName.trim(),
      category,
      distributionList,
      assignmentGroup,
      assignedMember,
      dlGroupMembers: Array.isArray(dlGroupMembers) ? dlGroupMembers : [],
    }, { new: true });

    if (!updated) return res.status(404).json({ message: "Service not found" });
    console.log("✅ [UPDATE SERVICE] Saved:", serviceName.trim());
    res.json(updated);
  } catch (err) {
    console.error("❌ [UPDATE SERVICE] Error:", err);
    res.status(500).json({ message: "Failed to update service" });
  }
});

app.delete('/api/services/:id', async (req, res) => {
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

// ===================== REQUEST SCHEMA =====================
const requestSchema = new mongoose.Schema({
  requestNumber: { type: String, unique: true },
  service: { id: String, name: String, categoryName: String },
  assignmentGroup: { groupId: String, groupName: String, members: [{ id: String, name: String, email: String }] },
  assignedMember: {
    memberId: String,
    memberName: String,
    memberEmail: String
  },
  raisedBy: { id: String, name: String, mail: { type: String, required: true } },
  onBehalf: {
    enabled: { type: Boolean, default: false },
    user: { id: String, name: String, mail: String }
  },
  description: { type: String, default: "" },
  attachments: [{ id: String, driveId: String, fileName: String, fileType: String, url: String }],
  approval: {
    required: { type: Boolean, default: false },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    approvers: [{ id: String, name: String, email: String }],
    approvedBy: { id: String, name: String, email: String },
    approvedAt: Date,
    comments: String,
  },
  status: { type: String, enum: ["open", "in_progress", "pending_approval", "resolved", "closed", "cancelled"], default: "open" },
  priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  pwOnBehalf: { type: String, enum: ['Self', 'Other'], default: 'Self' },
  pwTargetEmail: { type: String, default: '' },
  pwDeliveryEmail: { type: String, default: '' },
  resolvedAt: Date,
  closedAt: Date,
  notes: String,
  updatedBy: { id: String, name: String, mail: String },
  history: [{ action: String, by: String, at: Date, newStatus: String, oldStatus: String, reason: String, notes: String }],
}, { timestamps: true });

requestSchema.pre("save", async function (next) {
  if (!this.requestNumber) {
    const count = await mongoose.model("Request").countDocuments();
    this.requestNumber = `REQ-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

const Request = mongoose.model("Request", requestSchema);

// ===================== INCIDENT SCHEMA =====================
const incidentSchema = new mongoose.Schema({
  incidentNumber: { type: String, unique: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category: { id: String, name: String },
  assignmentGroup: {
    groupId: { type: String, required: true },
    groupName: { type: String, required: true },
    members: [{ id: String, name: String, email: String }]
  },
  // ✅ FIXED: assignedMember as sub-document (not nested type)
  assignedMember: {
    memberId: String,
    memberName: String,
    memberEmail: String
  },
  raisedBy: { id: String, name: String, mail: { type: String, required: true } },
  priority: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
  status: { type: String, enum: ["open", "in_progress", "resolved", "closed", "cancelled"], default: "open" },
  attachments: [{ id: String, driveId: String, fileName: String, fileType: String, url: String }],
  messages: [{
    message: String,
    sender: { id: String, name: String, email: String },
    createdAt: { type: Date, default: Date.now },
    readBy: [String]
  }],
  resolvedAt: Date,
  closedAt: Date,
  notes: String,
  updatedBy: { id: String, name: String, mail: String },
}, { timestamps: true });

incidentSchema.pre("save", async function (next) {
  if (!this.incidentNumber) {
    const count = await mongoose.model("Incident").countDocuments();
    this.incidentNumber = `INC-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

const Incident = mongoose.model("Incident", incidentSchema);

// ===================== ASSIGNMENT GROUP SCHEMA =====================
const assignmentGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String },
  members: [{ id: String, name: String, email: String, isManual: { type: Boolean, default: false } }],
  manualMembers: [{ id: String, name: String, email: String }],
  distributionList: { id: String, name: String, mail: String, members: [{ id: String, name: String, email: String }] },
  createdBy: { id: String, name: String, email: String }
}, { timestamps: true });

const AssignmentGroup = mongoose.model('AssignmentGroup', assignmentGroupSchema);

// ===================== ASSIGNMENT GROUP ROUTES (WITH EMAILS) =====================

// GET /api/assignment-groups
app.get('/api/assignment-groups', async (req, res) => {
  try {
    const groups = await AssignmentGroup.find().sort({ createdAt: -1 });
    res.json(groups);
  } catch (err) {
    console.error('❌ Get assignment groups error:', err);
    res.status(500).json({ message: 'Failed to fetch assignment groups' });
  }
});

// GET /api/assignment-groups/:id
app.get('/api/assignment-groups/:id', async (req, res) => {
  try {
    const group = await AssignmentGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Assignment group not found' });
    res.json(group);
  } catch (err) {
    console.error('❌ Get assignment group error:', err);
    res.status(500).json({ message: 'Failed to fetch assignment group' });
  }
});

// POST /api/assignment-groups - CREATE with notifications
app.post('/api/assignment-groups', async (req, res) => {
  try {
    const { name, description, members, distributionList, manualMembers, createdBy } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Group name is required' });
    if (!members || members.length === 0) return res.status(400).json({ message: 'At least one member is required' });

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

    // Send notifications to all group members and creator
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const creatorEmail = createdBy?.email || createdBy?.mail || "";
        
        // Get all group member emails
        const memberEmails = (members || []).map(m => m.email || m.mail).filter(Boolean);
        
        const commonFields = [
          { label: "Group Name", value: name.trim() },
          { label: "Description", value: description || "—" },
          { label: "Total Members", value: members.length.toString() },
          { label: "Created By", value: createdBy?.name || "Admin" },
          { label: "Created At (IST)", value: nowIST },
        ];

        // Notify all group members
        if (memberEmails.length > 0) {
          const memberNames = members.map(m => `• ${m.name} (${m.email || m.mail})`).join("\n");
          const html = buildHtmlEmail({
            title: `🔧 You were added to Assignment Group: ${name.trim()}`,
            subtitle: `You are now a member of this group`,
            statusColor: "#7c3aed",
            fields: commonFields,
            description: `Group members:\n\n${memberNames}\n\nAs a member, you will receive notifications for incidents/requests assigned to this group.`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Groups",
          });
          await sendEmail(memberEmails, `[ASSIGNMENT GROUP] Added to ${name.trim()}`, html);
        }

        // Notify creator
        if (creatorEmail && !memberEmails.includes(creatorEmail)) {
          const html = buildHtmlEmail({
            title: `✅ Assignment Group Created: ${name.trim()}`,
            subtitle: `You successfully created a new assignment group`,
            statusColor: "#002060",
            fields: commonFields,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Groups",
          });
          await sendEmail(creatorEmail, `[ASSIGNMENT GROUP] Created: ${name.trim()}`, html);
        }

        console.log(`✅ [ASSIGNMENT GROUP] CREATE notifications sent for: ${name}`);
      } catch (mailErr) {
        console.error("❌ [ASSIGNMENT GROUP] CREATE notification error:", mailErr.message);
      }
    });
  } catch (err) {
    console.error('❌ Create assignment group error:', err);
    res.status(500).json({ message: 'Failed to create assignment group', error: err.message });
  }
});

// PUT /api/assignment-groups/:id - UPDATE with diff notifications
app.put('/api/assignment-groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, members, distributionList, manualMembers, updatedBy } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Group name is required' });
    if (!members || members.length === 0) return res.status(400).json({ message: 'At least one member is required' });

    const oldGroup = await AssignmentGroup.findById(id);
    if (!oldGroup) return res.status(404).json({ message: 'Assignment group not found' });

    const changes = getAssignmentGroupDiff(oldGroup, { name, description, members });

    const group = await AssignmentGroup.findByIdAndUpdate(id, {
      name: name.trim(),
      description: description || '',
      members,
      manualMembers: manualMembers || [],
      distributionList: distributionList || null
    }, { new: true, runValidators: true });

    console.log(`✅ Assignment group updated: ${name}`);
    res.json(group);

    // Send notifications to all group members and updater with specific changes
    setImmediate(async () => {
      try {
        if (changes.length === 0) {
          console.log(`ℹ️ [ASSIGNMENT GROUP] No significant changes, skipping notifications`);
          return;
        }

        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const updaterEmail = updatedBy?.email || updatedBy?.mail || "";
        
        // Get all current member emails
        const memberEmails = (members || []).map(m => m.email || m.mail).filter(Boolean);
        
        const changeDescription = changes.join("\n");
        
        const commonFields = [
          { label: "Group Name", value: name.trim() },
          { label: "Updated By", value: updatedBy?.name || "Admin" },
          { label: "Updated At (IST)", value: nowIST },
          { label: "Total Members", value: members.length.toString() },
        ];

        // Notify all group members
        if (memberEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `🔄 Assignment Group Updated: ${name.trim()}`,
            subtitle: `Changes were made to your group`,
            statusColor: "#7c3aed",
            fields: commonFields,
            description: `What changed:\n\n${changeDescription}`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Groups",
          });
          await sendEmail(memberEmails, `[ASSIGNMENT GROUP] Updated: ${name.trim()}`, html);
        }

        // Notify updater (creator/admin)
        if (updaterEmail && !memberEmails.includes(updaterEmail)) {
          const html = buildHtmlEmail({
            title: `✅ Assignment Group Updated: ${name.trim()}`,
            subtitle: `Your changes have been saved`,
            statusColor: "#002060",
            fields: commonFields,
            description: `What changed:\n\n${changeDescription}`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Groups",
          });
          await sendEmail(updaterEmail, `[ASSIGNMENT GROUP] Updated: ${name.trim()}`, html);
        }

        console.log(`✅ [ASSIGNMENT GROUP] UPDATE notifications sent for: ${name}`);
      } catch (mailErr) {
        console.error("❌ [ASSIGNMENT GROUP] UPDATE notification error:", mailErr.message);
      }
    });
  } catch (err) {
    console.error('❌ Update assignment group error:', err);
    res.status(500).json({ message: 'Failed to update assignment group', error: err.message });
  }
});

// DELETE /api/assignment-groups/:id - DELETE with notifications
app.delete('/api/assignment-groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const group = await AssignmentGroup.findById(id);
    if (!group) return res.status(404).json({ message: 'Assignment group not found' });

    const groupName = group.name;
    const memberEmails = (group.members || []).map(m => m.email || m.mail).filter(Boolean);
    const deletedBy = req.body.deletedBy || {};

    await AssignmentGroup.findByIdAndDelete(id);

    console.log(`✅ Assignment group deleted: ${groupName}`);
    res.json({ message: 'Assignment group deleted successfully', group: groupName });

    // Send notifications to all group members
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const deleterEmail = deletedBy?.email || deletedBy?.mail || "";
        
        const commonFields = [
          { label: "Group Name", value: groupName },
          { label: "Deleted By", value: deletedBy?.name || "Admin" },
          { label: "Deleted At (IST)", value: nowIST },
        ];

        // Notify all group members
        if (memberEmails.length > 0) {
          const html = buildHtmlEmail({
            title: `🗑️ Assignment Group Deleted: ${groupName}`,
            subtitle: `Your group has been removed`,
            statusColor: "#dc2626",
            fields: commonFields,
            description: `The assignment group "${groupName}" has been deleted. You will no longer receive group notifications.`,
            actionLink: prodUrl,
            actionText: "Open Helpdesk",
          });
          await sendEmail(memberEmails, `[ASSIGNMENT GROUP] Deleted: ${groupName}`, html);
        }

        // Notify deleter
        if (deleterEmail && !memberEmails.includes(deleterEmail)) {
          const html = buildHtmlEmail({
            title: `✅ Assignment Group Deleted: ${groupName}`,
            subtitle: `You successfully deleted the group`,
            statusColor: "#002060",
            fields: commonFields,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Groups",
          });
          await sendEmail(deleterEmail, `[ASSIGNMENT GROUP] Deleted: ${groupName}`, html);
        }

        console.log(`✅ [ASSIGNMENT GROUP] DELETE notifications sent for: ${groupName}`);
      } catch (mailErr) {
        console.error("❌ [ASSIGNMENT GROUP] DELETE notification error:", mailErr.message);
      }
    });
  } catch (err) {
    console.error('❌ Delete assignment group error:', err);
    res.status(500).json({ message: 'Failed to delete assignment group', error: err.message });
  }
});

// ===================== REQUEST ROUTES =====================

// GET /api/requests
app.get("/api/requests", async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error("❌ Get requests error:", err);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

// GET /api/requests/mine
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

// GET /api/requests/:id
app.get("/api/requests/:id", async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json(request);
  } catch (err) {
    console.error("❌ Get request error:", err);
    res.status(500).json({ message: "Failed to fetch request" });
  }
});

// POST /api/requests - CREATE with FULL email notifications
app.post("/api/requests", async (req, res) => {
  try {
    const {
      service, assignmentGroup, assignedMember, raisedBy, onBehalf,
      description, attachments, approval, priority,
      pwOnBehalf, pwTargetEmail, pwDeliveryEmail
    } = req.body;

    if (!service?.id) return res.status(400).json({ message: "Service is required" });
    if (!raisedBy?.mail) return res.status(400).json({ message: "Requester info is required" });

    let finalAssignmentGroup = assignmentGroup || {};

    if (finalAssignmentGroup?.groupId) {
      try {
        const fullGroup = await AssignmentGroup.findById(finalAssignmentGroup.groupId).catch(() => null) ||
          await AssignmentGroup.findOne({ name: finalAssignmentGroup.groupName });
        if (fullGroup) {
          finalAssignmentGroup = {
            groupId: fullGroup._id.toString(),
            groupName: fullGroup.name,
            members: fullGroup.members || []
          };
        }
      } catch (err) {
        console.error(`❌ [CREATE REQUEST] Error fetching assignment group:`, err.message);
      }
    }

    let finalAssignedMember = assignedMember || {};
    if ((!finalAssignedMember.memberEmail || !finalAssignedMember.memberId) && finalAssignmentGroup?.members?.length > 0) {
      const firstMember = finalAssignmentGroup.members[0];
      finalAssignedMember = {
        memberId: firstMember.id || '',
        memberName: firstMember.name || '',
        memberEmail: firstMember.email || firstMember.mail || ''
      };
    }

    const initialStatus = approval?.required ? "pending_approval" : "open";

    const request = new Request({
      service,
      assignmentGroup: finalAssignmentGroup,
      assignedMember: finalAssignedMember,
      raisedBy,
      onBehalf: onBehalf || { enabled: false },
      description: description || "",
      attachments: Array.isArray(attachments) ? attachments : [],
      approval: approval || { required: false },
      priority: priority || "medium",
      pwOnBehalf: pwOnBehalf || 'Self',
      pwTargetEmail: pwTargetEmail || '',
      pwDeliveryEmail: pwDeliveryEmail || '',
      status: initialStatus,
      history: [{ action: 'created', by: raisedBy?.name || raisedBy?.mail || 'System', at: new Date() }]
    });

    await request.save();
    console.log("✅ [CREATE REQUEST] Saved:", request.requestNumber);
    res.status(201).json(request);

    setImmediate(async () => {
      try {
        const allRecipients = await getAllRequestRecipients(request);
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

        const isPasswordReset = service?.name?.toLowerCase().includes("password reset");
        const isAdminAccess = service?.name?.toLowerCase().includes("admin access") || service?.name?.toLowerCase().includes("device admin");

        let title = `📋 New Request: ${request.requestNumber}`;
        let subtitle = `${service?.name || 'Request'} has been submitted`;

        if (isPasswordReset) title = `🔑 Password Reset Request: ${request.requestNumber}`;
        if (isAdminAccess) title = `👑 Admin Access Request: ${request.requestNumber}`;

        const fields = [
          { label: "Request No.", value: request.requestNumber },
          { label: "Service", value: service?.name || "—" },
          { label: "Requested By", value: `${raisedBy?.name || raisedBy?.mail}` },
          { label: "Status", value: initialStatus.toUpperCase() },
          { label: "Priority", value: priority || "medium" },
          { label: "Submitted At", value: nowIST },
        ];

        if (isPasswordReset && pwOnBehalf === 'Other' && pwTargetEmail) {
          fields.push({ label: "Reset For", value: pwTargetEmail });
        }
        if (isPasswordReset && pwDeliveryEmail) {
          fields.push({ label: "Delivery Email", value: pwDeliveryEmail });
        }
        if (request.assignedMember?.memberName) {
          fields.push({ label: "Assigned To", value: request.assignedMember.memberName });
        }

        const html = buildHtmlEmail({
          title,
          subtitle,
          statusColor: isPasswordReset ? "#d97706" : (isAdminAccess ? "#7c3aed" : "#0369a1"),
          fields,
          description: description || "No description provided",
          actionLink: `${prodUrl}/requests/${request._id}`,
          actionText: "View Request",
        });

        await sendEmail(allRecipients, `${title}`, html);
        console.log(`✅ [REQUEST] CREATE notifications sent to ${allRecipients.length} recipients`);
      } catch (mailErr) {
        console.error("❌ [REQUEST] CREATE notification error:", mailErr.message);
      }
    });
  } catch (err) {
    console.error("❌ [CREATE REQUEST] Error:", err);
    res.status(500).json({ message: "Failed to create request", error: err.message });
  }
});

// PATCH /api/requests/:id - UPDATE STATUS with FULL email notifications
app.patch("/api/requests/:id", async (req, res) => {
  try {
    const { status, assignedMember, assignmentGroup, notes, updatedBy, priority } = req.body;

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const oldStatus = request.status;
    const oldPriority = request.priority;

    if (status) request.status = status;
    if (priority) request.priority = priority;
    if (assignedMember) request.assignedMember = assignedMember;
    if (assignmentGroup) request.assignmentGroup = assignmentGroup;
    if (notes) request.notes = notes;
    if (updatedBy) request.updatedBy = updatedBy;

    if (status === "resolved") request.resolvedAt = new Date();
    if (status === "closed") request.closedAt = new Date();

    if (status && status !== oldStatus) {
      request.history = request.history || [];
      request.history.push({
        action: 'status_updated',
        by: updatedBy?.name || updatedBy?.mail || 'System',
        at: new Date(),
        oldStatus,
        newStatus: status,
        notes: notes || `Status changed from ${oldStatus} to ${status}`
      });
    }

    if (status === 'resolved' && oldStatus !== 'resolved') {
      request.history.push({ action: 'resolved', by: updatedBy?.name || 'System', at: new Date() });
    }
    if (status === 'closed' && oldStatus !== 'closed') {
      request.history.push({ action: 'closed', by: updatedBy?.name || 'System', at: new Date() });
    }

    await request.save();
    console.log("✅ [UPDATE REQUEST]", request.requestNumber, "→", status || "updated");
    res.json(request);

    // Send status update notifications to ALL recipients
    if (status && status !== oldStatus) {
      setImmediate(async () => {
        try {
          const allRecipients = await getAllRequestRecipients(request);
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          const statusColors = {
            open: "#0369a1", in_progress: "#d97706", pending_approval: "#7c3aed",
            resolved: "#16a34a", closed: "#6b7280", cancelled: "#dc2626",
          };
          
          const html = buildHtmlEmail({
            title: `Request ${request.requestNumber} — Status Updated`,
            subtitle: `Status changed to ${status.replace(/_/g, " ").toUpperCase()}`,
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
          
          await sendEmail(allRecipients, `[REQUEST] ${request.requestNumber} — Status: ${status.toUpperCase()}`, html);
          console.log(`✅ [REQUEST] STATUS UPDATE notifications sent to ${allRecipients.length} recipients`);
        } catch (mailErr) {
          console.error("❌ [REQUEST] Status notification error:", mailErr.message);
        }
      });
    }
  } catch (err) {
    console.error("❌ [UPDATE REQUEST] Error:", err);
    res.status(500).json({ message: "Failed to update request" });
  }
});

// ===================== INCIDENT ROUTES =====================

// GET /api/incidents
app.get("/api/incidents", async (req, res) => {
  try {
    const incidents = await Incident.find().sort({ createdAt: -1 });
    res.json(incidents);
  } catch (err) {
    console.error("❌ Get incidents error:", err);
    res.status(500).json({ message: "Failed to fetch incidents" });
  }
});

// GET /api/incidents/mine
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

// GET /api/incidents/:id
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

// POST /api/incidents - CREATE with FULL email notifications
app.post("/api/incidents", async (req, res) => {
  try {
    const { title, description, category, assignmentGroup, assignedMember, raisedBy, priority, attachments } = req.body;

    if (!title?.trim()) return res.status(400).json({ message: "Title is required" });
    if (!description?.trim()) return res.status(400).json({ message: "Description is required" });
    if (!raisedBy?.mail) return res.status(400).json({ message: "Requester info is required" });

    const incident = new Incident({
      title: title.trim(),
      description: description.trim(),
      category: category || {},
      assignmentGroup: assignmentGroup || {},
      assignedMember: assignedMember || {},
      raisedBy,
      priority: priority || "medium",
      attachments: Array.isArray(attachments) ? attachments : [],
      status: "open",
    });

    await incident.save();
    console.log("✅ [CREATE INCIDENT] Saved:", incident.incidentNumber);
    res.status(201).json(incident);

    // Send email notifications to ALL recipients
    setImmediate(async () => {
      try {
        const allRecipients = await getAllIncidentRecipients(incident);
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        
        const priorityColors = {
          low: "#16a34a", medium: "#0369a1", high: "#d97706", critical: "#dc2626",
        };
        
        const fields = [
          { label: "Incident No.", value: incident.incidentNumber },
          { label: "Title", value: title.trim() },
          { label: "Category", value: category?.name || "—" },
          { label: "Priority", value: priority || "medium" },
          { label: "Status", value: "Open" },
          { label: "Raised By", value: `${raisedBy?.name || raisedBy?.mail}` },
          { label: "Raised At", value: nowIST },
        ];
        
        if (incident.assignedMember?.memberName) {
          fields.push({ label: "Assigned To", value: incident.assignedMember.memberName });
        }
        
        const html = buildHtmlEmail({
          title: `🚨 Incident Raised: ${incident.incidentNumber}`,
          subtitle: `A new incident has been logged`,
          statusColor: priorityColors[priority] || "#0369a1",
          fields,
          description: description.trim(),
          actionLink: `${prodUrl}/incidents/${incident._id}`,
          actionText: "View Incident",
        });
        
        await sendEmail(allRecipients, `[INCIDENT] ${incident.incidentNumber} — Logged`, html);
        console.log(`✅ [INCIDENT] CREATE notifications sent to ${allRecipients.length} recipients`);
      } catch (mailErr) {
        console.error("❌ [INCIDENT] Notification error:", mailErr.message);
      }
    });
  } catch (err) {
    console.error("❌ [CREATE INCIDENT] Error:", err);
    res.status(500).json({ message: "Failed to raise incident", error: err.message });
  }
});

// PATCH /api/incidents/:id - UPDATE STATUS with FULL email notifications
app.patch("/api/incidents/:id", async (req, res) => {
  try {
    const { status, assignedMember, assignmentGroup, notes, updatedBy, priority } = req.body;

    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: "Incident not found" });

    if (status) incident.status = status;
    if (priority) incident.priority = priority;
    if (assignedMember) incident.assignedMember = assignedMember;
    if (assignmentGroup) incident.assignmentGroup = assignmentGroup;
    if (notes) incident.notes = notes;
    if (updatedBy) incident.updatedBy = updatedBy;

    if (status === "resolved") incident.resolvedAt = new Date();
    if (status === "closed") incident.closedAt = new Date();

    await incident.save();
    console.log("✅ [UPDATE INCIDENT]", incident.incidentNumber, "→", status);
    res.json(incident);

    // Send status update notifications to ALL recipients
    if (status) {
      setImmediate(async () => {
        try {
          const allRecipients = await getAllIncidentRecipients(incident);
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          const statusColors = {
            open: "#0369a1", in_progress: "#d97706", resolved: "#16a34a",
            closed: "#6b7280", cancelled: "#dc2626",
          };
          
          const html = buildHtmlEmail({
            title: `Incident ${incident.incidentNumber} — Status Updated`,
            subtitle: `Status changed to ${status.replace(/_/g, " ").toUpperCase()}`,
            statusColor: statusColors[status] || "#002060",
            fields: [
              { label: "Incident No.", value: incident.incidentNumber },
              { label: "Title", value: incident.title },
              { label: "New Status", value: status.replace(/_/g, " ").toUpperCase() },
              { label: "Updated By", value: updatedBy?.name || "Admin" },
              { label: "Updated At", value: nowIST },
            ],
            description: notes || "",
            actionLink: `${prodUrl}/incidents/${incident._id}`,
            actionText: "View Incident",
          });
          
          await sendEmail(allRecipients, `[INCIDENT] ${incident.incidentNumber} — Status: ${status.toUpperCase()}`, html);
          console.log(`✅ [INCIDENT] STATUS UPDATE notifications sent to ${allRecipients.length} recipients`);
        } catch (mailErr) {
          console.error("❌ [INCIDENT] Status notification error:", mailErr.message);
        }
      });
    }
  } catch (err) {
    console.error("❌ [UPDATE INCIDENT] Error:", err);
    res.status(500).json({ message: "Failed to update incident" });
  }
});

// ===================== APPROVAL/REJECTION ROUTES =====================

// POST /api/requests/:id/approve
app.post("/api/requests/:id/approve", async (req, res) => {
  try {
    const { actorEmail, actorName, actorId, note } = req.body;
    if (!actorEmail) return res.status(400).json({ message: "Actor email is required" });

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const isPasswordReset = request.service?.name?.toLowerCase().includes("password reset");
    const isAdminAccess = request.service?.name?.toLowerCase().includes("admin access") ||
                          request.service?.name?.toLowerCase().includes("device admin");

    if (!isPasswordReset && !isAdminAccess) {
      return res.status(400).json({ message: "This action is only valid for password reset or admin access requests" });
    }

    // Authorization check
    const actorEmailLower = (actorEmail || '').toLowerCase();
    const actorIdLower = (actorId || '').toLowerCase();
    const assignedEmail = (request.assignedMember?.memberEmail || '').toLowerCase();
    const assignedMemberId = (request.assignedMember?.memberId || '').toLowerCase();

    const isAssignedMember = (assignedEmail && actorEmailLower === assignedEmail) ||
                             (assignedMemberId && actorIdLower === assignedMemberId);

    let groupMembers = request.assignmentGroup?.members || [];
    const isInGroup = groupMembers.some(member => {
      const memberEmail = (member.email || member.mail || '').toLowerCase();
      const memberId = (member.id || '').toLowerCase();
      return memberEmail === actorEmailLower || memberId === actorIdLower;
    });

    if (!isAssignedMember && !isInGroup) {
      return res.status(403).json({ message: "Only group members can approve this request" });
    }

    let tempPassword = null;
    let targetEmail = null;

    if (isPasswordReset) {
      // ✅ FIXED: use pwTargetEmail stored on the request, not onBehalf
      targetEmail = (request.pwOnBehalf === 'Other' && request.pwTargetEmail?.trim())
        ? request.pwTargetEmail.trim()
        : request.raisedBy.mail;

      if (!targetEmail) {
        return res.status(400).json({ message: "Cannot determine target user for password reset" });
      }

      try {
        tempPassword = await resetAzurePassword(targetEmail);
      } catch (azureErr) {
        return res.status(500).json({ message: "Azure password reset failed", error: azureErr.message });
      }

      request.history = request.history || [];
      request.history.push({
        action: 'approved',
        by: actorName || actorEmail,
        at: new Date(),
        notes: `Password reset approved by ${actorName || actorEmail}. Temporary password sent to ${request.pwDeliveryEmail || targetEmail}.`
      });
      request.status = "resolved";
      request.resolvedAt = new Date();
      request.updatedBy = { id: actorId || "", name: actorName || actorEmail, mail: actorEmail };
      request.notes = note || `Password reset approved by ${actorName || actorEmail}.`;

      await request.save();
      console.log(`✅ [APPROVE] Password reset approved for ${targetEmail} by ${actorEmail}`);

      res.json({ message: "Password reset approved successfully", requestNumber: request.requestNumber, targetEmail, tempPassword });

      setImmediate(async () => {
        try {
          const deliveryEmail = request.pwDeliveryEmail?.trim() || targetEmail;
          
          // Send temp password ONLY to delivery email
          const passwordHtml = buildHtmlEmail({
            title: `🔑 Your Temporary Password`,
            subtitle: `Password reset for ${targetEmail} has been approved`,
            statusColor: "#16a34a",
            fields: [
              { label: "Request No.", value: request.requestNumber },
              { label: "Account", value: targetEmail },
              { label: "Temporary Password", value: `<strong style="font-size:16px; background:#fef3c7; padding:4px 8px; border-radius:4px;">${tempPassword}</strong>` },
              { label: "Approved By", value: actorName || actorEmail },
              { label: "Approved At", value: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) },
            ],
            description: `Please sign in using this temporary password. You will be required to change it on next sign-in.`,
            actionLink: `https://portal.office.com`,
            actionText: "Sign In",
          });
          await sendEmail(deliveryEmail, `[PASSWORD RESET] Your temporary password — ${request.requestNumber}`, passwordHtml);

          // Send approval notification (WITHOUT password) to all other recipients
          const allRecipients = await getAllRequestRecipients(request);
          const otherRecipients = allRecipients.filter(e => e.toLowerCase() !== deliveryEmail.toLowerCase());

          if (otherRecipients.length > 0) {
            const notifyHtml = buildHtmlEmail({
              title: `🔑 Password Reset Approved: ${request.requestNumber}`,
              subtitle: `Temporary password has been sent to delivery email`,
              statusColor: "#16a34a",
              fields: [
                { label: "Request No.", value: request.requestNumber },
                { label: "Action", value: "APPROVED" },
                { label: "Reset For", value: targetEmail },
                { label: "Delivery Email", value: deliveryEmail },
                { label: "Approved By", value: actorName || actorEmail },
                { label: "Approved At", value: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) },
              ],
              description: `The password has been reset and the temporary password has been sent to the delivery email.`,
              actionLink: `${process.env.PROD_URL}/requests/${request._id}`,
              actionText: "View Request",
            });
            await sendEmail(otherRecipients, `[PASSWORD RESET] ${request.requestNumber} — Approved`, notifyHtml);
          }

          console.log(`✅ [PASSWORD RESET] APPROVE notifications sent. Password delivered to: ${deliveryEmail}`);
        } catch (mailErr) {
          console.error("❌ [PASSWORD RESET] Email error:", mailErr.message);
        }
      });
    }
    else if (isAdminAccess) {
      targetEmail = request.raisedBy?.mail;
      if (!targetEmail) {
        return res.status(400).json({ message: "Cannot determine target user for admin access" });
      }

      let userObjectId;
      try {
        const userData = await getUserByUpn(targetEmail);
        userObjectId = userData.id;
      } catch (userErr) {
        return res.status(500).json({ message: "Failed to verify user in Azure AD", error: userErr.message });
      }

      const groupId = process.env.AZURE_DEVICE_ADMIN_GROUP_ID;
      if (!groupId) {
        return res.status(500).json({ message: "Device Admin Group ID not configured" });
      }

      try {
        await addUserToGroup(groupId, userObjectId);
      } catch (groupErr) {
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
      request.notes = note || `Admin access approved by ${actorName || actorEmail}.`;

      await request.save();
      console.log(`✅ [APPROVE] Admin access approved for ${targetEmail} by ${actorEmail}`);

      res.json({ message: "Admin access approved successfully", requestNumber: request.requestNumber, targetEmail, groupId });

      setImmediate(async () => {
        try {
          const allRecipients = await getAllRequestRecipients(request);
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

          const fields = [
            { label: "Request No.", value: request.requestNumber },
            { label: "Action", value: "APPROVED" },
            { label: "Approved By", value: actorName || actorEmail },
            { label: "Approved At", value: nowIST },
            { label: "User Granted Access", value: `${request.raisedBy?.name || ''} (${targetEmail})` },
          ];

          const html = buildHtmlEmail({
            title: `👑 Admin Access Approved: ${request.requestNumber}`,
            subtitle: `User has been granted Device Administrator access`,
            statusColor: "#16a34a",
            fields,
            description: `${request.raisedBy?.name || targetEmail} has been granted Device Administrator privileges.`,
            actionLink: `${prodUrl}/requests/${request._id}`,
            actionText: "View Request",
          });

          await sendEmail(allRecipients, `[ADMIN ACCESS] ${request.requestNumber} — Approved`, html);
          console.log(`✅ [ADMIN ACCESS] APPROVE notifications sent to ${allRecipients.length} recipients`);
        } catch (mailErr) {
          console.error("❌ [ADMIN ACCESS] Email error:", mailErr.message);
        }
      });
    }
  } catch (err) {
    console.error("❌ [APPROVE] Error:", err);
    res.status(500).json({ message: "Approval failed", error: err.message });
  }
});

// POST /api/requests/:id/reject
app.post("/api/requests/:id/reject", async (req, res) => {
  try {
    const { actorEmail, actorName, actorId, reason, note } = req.body;
    if (!actorEmail) return res.status(400).json({ message: "Actor email is required" });

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const isPasswordReset = request.service?.name?.toLowerCase().includes("password reset");
    const isAdminAccess = request.service?.name?.toLowerCase().includes("admin access") ||
                          request.service?.name?.toLowerCase().includes("device admin");

    if (!isPasswordReset && !isAdminAccess) {
      return res.status(400).json({ message: "This action is only valid for password reset or admin access requests" });
    }

    // Authorization check
    const actorEmailLower = (actorEmail || '').toLowerCase();
    const actorIdLower = (actorId || '').toLowerCase();
    const assignedEmail = (request.assignedMember?.memberEmail || '').toLowerCase();
    const assignedMemberId = (request.assignedMember?.memberId || '').toLowerCase();

    const isAssignedMember = (assignedEmail && actorEmailLower === assignedEmail) ||
                             (assignedMemberId && actorIdLower === assignedMemberId);

    let groupMembers = request.assignmentGroup?.members || [];
    const isInGroup = groupMembers.some(member => {
      const memberEmail = (member.email || member.mail || '').toLowerCase();
      const memberId = (member.id || '').toLowerCase();
      return memberEmail === actorEmailLower || memberId === actorIdLower;
    });

    if (!isAssignedMember && !isInGroup) {
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

    res.json({ message: `${requestType} request rejected`, requestNumber: request.requestNumber });

    // Send notifications to ALL recipients
    setImmediate(async () => {
      try {
        const allRecipients = await getAllRequestRecipients(request);
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        
        const title = isPasswordReset
          ? `❌ Password Reset Request Rejected: ${request.requestNumber}`
          : `❌ Admin Access Request Rejected: ${request.requestNumber}`;
        
        const fields = [
          { label: "Request No.", value: request.requestNumber },
          { label: "Action", value: "REJECTED" },
          { label: "Rejected By", value: actorName || actorEmail },
          { label: "Rejected At", value: nowIST },
        ];
        
        if (reason) fields.push({ label: "Reason", value: reason });
        
        const html = buildHtmlEmail({
          title,
          subtitle: `Request has been rejected`,
          statusColor: "#dc2626",
          fields,
          description: reason || `Your ${requestType} request was rejected. Please contact IT support if you need further assistance.`,
          actionLink: `${prodUrl}/requests/${request._id}`,
          actionText: "View Request",
        });
        
        await sendEmail(allRecipients, `${title}`, html);
        console.log(`✅ [REJECT] notifications sent to ${allRecipients.length} recipients`);
      } catch (mailErr) {
        console.error("❌ [REJECT] Email error:", mailErr.message);
      }
    });
  } catch (err) {
    console.error("❌ [REJECT] Error:", err);
    res.status(500).json({ message: "Rejection failed", error: err.message });
  }
});

// ===================== ATTACHMENT ROUTES =====================
// (Keep existing attachment routes - no changes needed)

async function fetchItemStream(token, itemId, driveId) {
  const attempts = [];
  if (driveId) {
    attempts.push({ label: `drives/${driveId}/items/${itemId}`, url: `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content` });
  }
  if (process.env.SHAREPOINT_SITE && process.env.SHAREPOINT_SITE_NAME) {
    try {
      const siteHost = process.env.SHAREPOINT_SITE;
      const siteName = process.env.SHAREPOINT_SITE_NAME;
      const siteRes = await axios.get(`https://graph.microsoft.com/v1.0/sites/${siteHost}:/sites/${siteName}`, { headers: { Authorization: `Bearer ${token}` } });
      const siteId = siteRes.data.id;
      attempts.push({ label: `sites/${siteId}/drive/items/${itemId}`, url: `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/content` });
    } catch (e) { console.warn('⚠️ Could not resolve site id:', e.message); }
  }
  attempts.push({ label: `drive/items/${itemId}`, url: `https://graph.microsoft.com/v1.0/drive/items/${itemId}/content` });

  for (const att of attempts) {
    try {
      const resp = await axios.get(att.url, { headers: { Authorization: `Bearer ${token}` }, responseType: 'stream', validateStatus: status => status >= 200 && status < 400 });
      return { stream: resp.data, contentType: resp.headers['content-type'], contentDisposition: resp.headers['content-disposition'], used: att.label };
    } catch (err) { console.warn(`⚠️ Attempt failed for ${att.label}:`, err.message); }
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
    archive.on('error', (err) => { console.error('❌ Archiver fatal error:', err); if (!res.headersSent) res.status(500).send('ZIP creation failed'); });
    res.on('close', () => { try { archive.abort(); } catch(e){} });
    archive.pipe(res);

    const limit = pLimit(2);
    const fetchPromises = ids.map((id, i) => limit(async () => {
      try {
        const driveId = driveIds.length > i ? driveIds[i] : null;
        const fetched = await Promise.race([fetchItemStream(token, id, driveId), new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${id}`)), 15000))]);
        let filename = id.slice(-10);
        const dispMatch = /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(fetched.contentDisposition || '');
        if (dispMatch && dispMatch[1]) { try { filename = decodeURIComponent(dispMatch[1]); } catch (e) { filename = dispMatch[1]; } }
        archive.append(fetched.stream, { name: filename });
      } catch (err) { console.warn(`⚠️ Skip ${id}:`, err.message); }
    }));
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
    if (fetched.contentDisposition) res.setHeader('Content-Disposition', fetched.contentDisposition);
    else {
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

// ===================== DL CREATE ROUTE =====================
app.post("/api/dl/create-dl", async (req, res) => {
  try {
    const { name, email, members = [], owners = [] } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email required" });

    const safeName = name.replace(/[^a-zA-Z0-9-_ ]/g, "");
    const safeEmail = email.replace(/[^a-zA-Z0-9@._-]/g, "");

    let psScript = `
    $env:PSModulePath = "C:\\Users\\AllenJohn\\Documents\\WindowsPowerShell\\Modules;C:\\Program Files\\WindowsPowerShell\\Modules;" + $env:PSModulePath;
Import-Module ExchangeOnlineManagement;
Connect-ExchangeOnline -AppId '${process.env.AZURE_CLIENT_ID}' -CertificateThumbprint '${process.env.CERT_THUMBPRINT}' -Organization '${process.env.TENANT_DOMAIN}';
$dl = Get-DistributionGroup -Identity '${safeEmail}' -ErrorAction SilentlyContinue;
if ($dl) { Write-Output "EXISTS"; exit; }
New-DistributionGroup -Name '${safeName}' -PrimarySmtpAddress '${safeEmail}';
`;
    members.forEach(m => { if (m.mail) psScript += `Add-DistributionGroupMember -Identity '${safeEmail}' -Member '${m.mail}';\n`; });
    owners.forEach(o => { if (o.mail) psScript += `Set-DistributionGroup -Identity '${safeEmail}' -ManagedBy @{Add='${o.mail}'};\n`; });
    psScript += `Disconnect-ExchangeOnline -Confirm:$false;\n`;

    const encoded = Buffer.from(psScript, "utf16le").toString("base64");
    exec(`C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -EncodedCommand ${encoded}`, (error, stdout, stderr) => {
      if (error) return res.status(500).json({ error: stderr || "DL creation failed" });
      if (stdout.includes("EXISTS")) return res.status(400).json({ error: "Distribution list already exists" });
      res.json({ message: "DL Created Successfully", output: stdout });
    });
  } catch (err) {
    console.error("❌ DL Route Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===================== KB ARTICLE SCHEMA & ROUTES =====================
const kbArticleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  content: { type: String, required: true },
  category: { id: String, name: String },
  assignmentGroup: { groupId: String, groupName: String },
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  createdBy: { id: String, name: String, email: String },
  updatedBy: { id: String, name: String, email: String },
  viewCount: { type: Number, default: 0 },
  tags: [{ type: String }],
}, { timestamps: true });

const KBArticle = mongoose.model("KBArticle", kbArticleSchema);

app.get("/api/kb/articles", async (req, res) => {
  try {
    const { status, categoryId, groupId, search } = req.query;
    let filter = {};
    if (status) filter.status = status;
    if (categoryId) filter["category.id"] = categoryId;
    if (groupId) filter["assignmentGroup.groupId"] = groupId;
    if (search) filter.$or = [{ title: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }, { content: { $regex: search, $options: "i" } }];
    const articles = await KBArticle.find(filter).sort({ createdAt: -1 });
    res.json(articles);
  } catch (err) {
    console.error("❌ Get KB articles error:", err);
    res.status(500).json({ message: "Failed to fetch articles" });
  }
});

app.get("/api/kb/articles/published", async (req, res) => {
  try {
    const { categoryId, groupId, search } = req.query;
    let filter = { status: "published" };
    if (categoryId) filter["category.id"] = categoryId;
    if (groupId) filter["assignmentGroup.groupId"] = groupId;
    if (search) filter.$or = [{ title: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }, { content: { $regex: search, $options: "i" } }];
    const articles = await KBArticle.find(filter).sort({ createdAt: -1 });
    res.json(articles);
  } catch (err) {
    console.error("❌ Get published KB articles error:", err);
    res.status(500).json({ message: "Failed to fetch published articles" });
  }
});

app.get("/api/kb/articles/:id", async (req, res) => {
  try {
    const article = await KBArticle.findById(req.params.id);
    if (!article) return res.status(404).json({ message: "Article not found" });

    // Only increment view count for published articles
    if (article.status === "published") {
      article.viewCount += 1;
      article.save().catch(err => console.error("View count error:", err));
    }

    res.json(article);
  } catch (err) {
    console.error("❌ Get KB article error:", err);
    res.status(500).json({ message: "Failed to fetch article" });
  }
});

app.post("/api/kb/articles", async (req, res) => {
  try {
    const { title, description, content, category, assignmentGroup, status, createdBy, tags } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: "Title is required" });
    if (!content?.trim()) return res.status(400).json({ message: "Content is required" });
    const article = new KBArticle({
      title: title.trim(), description: description || "", content, category: category || {},
      assignmentGroup: assignmentGroup || {}, status: status === "published" ? "published" : "draft",
      createdBy: createdBy || {}, updatedBy: createdBy || {}, tags: tags || []
    });
    await article.save();
    console.log(`✅ [KB ARTICLE] ${status === "published" ? "Published" : "Saved as draft"}: ${title}`);
    res.status(201).json(article);
  } catch (err) {
    console.error("❌ Create KB article error:", err);
    res.status(500).json({ message: "Failed to create article", error: err.message });
  }
});

app.put("/api/kb/articles/:id", async (req, res) => {
  try {
    const { title, description, content, category, assignmentGroup, status, updatedBy, tags } = req.body;
    const article = await KBArticle.findById(req.params.id);
    if (!article) return res.status(404).json({ message: "Article not found" });
    if (title) article.title = title.trim();
    if (description !== undefined) article.description = description;
    if (content) article.content = content;
    if (category) article.category = category;
    if (assignmentGroup) article.assignmentGroup = assignmentGroup;
    if (status) article.status = status;
    if (updatedBy) article.updatedBy = updatedBy;
    if (tags) article.tags = tags;
    await article.save();
    console.log(`✅ [KB ARTICLE] Updated: ${article.title}`);
    res.json(article);
  } catch (err) {
    console.error("❌ Update KB article error:", err);
    res.status(500).json({ message: "Failed to update article", error: err.message });
  }
});

app.delete("/api/kb/articles/:id", async (req, res) => {
  try {
    const article = await KBArticle.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ message: "Article not found" });
    console.log(`✅ [KB ARTICLE] Deleted: ${article.title}`);
    res.json({ message: "Article deleted successfully" });
  } catch (err) {
    console.error("❌ Delete KB article error:", err);
    res.status(500).json({ message: "Failed to delete article", error: err.message });
  }
});

app.get("/api/kb/articles/categories/stats", async (req, res) => {
  try {
    const stats = await KBArticle.aggregate([{ $match: { status: "published" } }, { $group: { _id: "$category.name", count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
    res.json(stats);
  } catch (err) {
    console.error("❌ Get category stats error:", err);
    res.status(500).json({ message: "Failed to fetch category stats" });
  }
});

// ===================== INCIDENT MESSAGE ROUTES =====================
app.get('/api/incidents/:id/messages', async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    const messages = incident.messages || [];
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    res.json(messages);
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

app.post('/api/incidents/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { message, sender } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'Message is required' });
    if (!sender?.email) return res.status(400).json({ message: 'Sender information is required' });

    const incident = await Incident.findById(id);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    const raisedEmail = incident.raisedBy?.mail?.toLowerCase();
    const assignedEmail = incident.assignedMember?.memberEmail?.toLowerCase();
    const senderEmail = sender.email.toLowerCase();

    if (senderEmail !== raisedEmail && senderEmail !== assignedEmail) {
      return res.status(403).json({ message: 'Only the requester and assigned person can chat' });
    }

    const newMessage = { message: message.trim(), sender: { id: sender.id || '', name: sender.name || 'Unknown', email: sender.email }, createdAt: new Date() };
    if (!incident.messages) incident.messages = [];
    incident.messages.push(newMessage);
    await incident.save();
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));