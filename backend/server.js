// server.js (FULL UPDATED WITH DYNAMIC CATEGORIES)
// ---------------------- PART 1 ----------------------
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
  process.env.CORS_ORIGIN?.trim()
];

app.use(
  cors({
    origin: function (origin, callback) {

      // allow server-to-server / curl / render health checks
      if (!origin) return callback(null, true);

      // normalize (remove trailing slash)
      const cleanOrigin = origin.replace(/\/$/, '');

      const allowed = allowedOrigins
        .filter(Boolean)
        .map(o => o.replace(/\/$/, ''));

      if (allowed.includes(cleanOrigin)) {
        return callback(null, true);
      }

      console.log("❌ Blocked by CORS:", cleanOrigin, "Allowed:", allowed);

      // ❗IMPORTANT: do NOT throw error here
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
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};
connectDB();

//--------------------ticket-Schema----------------------------
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

    // on behalf flow
    onBehalf: { type: String },
    onBehalfEmail: { type: String },
    deliveryEmail: { type: String },
    approvalRequired: { type: Boolean, default: false },

    // Dynamic subcategory (from category config)
    subCategory: { type: String },

    // Legacy Operational & Finance sub query (keep for backward compatibility)
    subQuery: { type: String },
    otherSubQueryText: { type: String },

    // Legacy single attachment
    attachment: {
      fileName: { type: String },
      fileType: { type: String },
      fileUrl: { type: String }
    },

    // New: attachments array
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
          enum: ['created', 'closed', 'revived', 'approved', 'rejected'],
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

// ---------------------- CATEGORY CONFIG SCHEMA ----------------------
const categoryConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },

    // ✅ keep categoryName because your APIs and indexes already use it
    categoryName: { type: String, required: true, unique: true },

    // ✅ special category marker (Password Reset, later Admin Access, etc.)
    type: {
      type: String,
      enum: ["NORMAL", "PASSWORD_RESET","ADMIN_ACCESS"],
      default: "NORMAL"
    },

    features: {

      approvalRequired: { type: Boolean, default: false }, 

      onBehalf: {
        enabled: { type: Boolean, default: false },
        options: [{ type: String }],
        required: { type: Boolean, default: false }
      },
      subCategories: {
        enabled: { type: Boolean, default: false },
        list: [{ type: String }],
        required: { type: Boolean, default: false }
      },
      attachments: {
        enabled: { type: Boolean, default: false },
        required: { type: Boolean, default: false }
      }
    },

    categoryHeads: [
      {
        email: { type: String },
        name: { type: String }
      }
    ],

    cc: [
      {
        email: { type: String },
        name: { type: String }
      }
    ],

    createdBy: {
      id: String,
      name: String,
      mail: String
    }
  },
  { timestamps: true }
);

const CategoryConfig = mongoose.model(
  "CategoryConfig",
  categoryConfigSchema
);


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

// const addUserToDirectoryRole = async (roleId, userObjectId) => {
//   const token = await getAccessToken();

//   const url = `https://graph.microsoft.com/v1.0/directoryRoles/${roleId}/members/$ref`;

//   const body = {
//     "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userObjectId}`
//   };

//   const res = await fetch(url, {
//     method: "POST",
//     headers: {
//       Authorization: `Bearer ${token}`,
//       "Content-Type": "application/json"
//     },
//     body: JSON.stringify(body)
//   });

//   if (res.status !== 204) {
//     const text = await res.text();
//     throw new Error(`Add to directory role failed: ${res.status} ${text}`);
//   }

//   return true;
// };

// =====================================================
// IMPROVED addUserToGroup FUNCTION
// Replace the existing addUserToGroup function with this version
// =====================================================

const AZURE_DEVICE_ADMIN_GROUP_ID = process.env.AZURE_DEVICE_ADMIN_GROUP_ID;


const addUserToGroup = async (groupId, userObjectId, retries = 2) => {
  console.log(`🔵 [ADD TO GROUP] Attempting to add user ${userObjectId} to group ${groupId}`);
  
  if (!groupId || !userObjectId) {
    throw new Error("groupId and userObjectId are required");
  }

  let lastError;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      console.log(`🔵 [ADD TO GROUP] Attempt ${attempt}/${retries + 1}`);
      
      const token = await getAccessToken();
      const url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members/$ref`;

      const body = {
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userObjectId}`
      };

      console.log(`🔵 [ADD TO GROUP] POST ${url}`);
      console.log(`🔵 [ADD TO GROUP] Body:`, JSON.stringify(body));

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        agent: new https.Agent({ rejectUnauthorized: false }),
      });

      console.log(`🔵 [ADD TO GROUP] Response status: ${res.status}`);

      // Success cases
      if (res.status === 204 || res.status === 201) {
        console.log(`✅ [ADD TO GROUP] Successfully added user to group`);
        return true;
      }

      // Get error details
      const responseText = await res.text();
      console.log(`🔍 [ADD TO GROUP] Response body:`, responseText);

      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { message: responseText };
      }

      // Check if user is already a member (this is OK)
      const errorMessage = (errorData?.error?.message || errorData?.message || '').toLowerCase();
      const errorCode = errorData?.error?.code || '';

      console.log(`🔍 [ADD TO GROUP] Error code: ${errorCode}`);
      console.log(`🔍 [ADD TO GROUP] Error message: ${errorMessage}`);

      if (
        errorMessage.includes('already exists') ||
        errorMessage.includes('already a member') ||
        errorMessage.includes('one or more added object references already exist') ||
        errorCode === 'Request_ResourceNotFound'
      ) {
        console.log(`ℹ️ [ADD TO GROUP] User is already a member - treating as success`);
        return true;
      }

      // For other errors, throw and potentially retry
      lastError = new Error(
        `Add to group failed (${res.status}): ${errorMessage || responseText}`
      );

      // Don't retry on 400 errors (bad request) or 404 (not found)
      if (res.status === 400 || res.status === 404) {
        console.error(`❌ [ADD TO GROUP] Non-retryable error (${res.status})`);
        throw lastError;
      }

      // Retry on 5xx errors or timeouts
      if (attempt < retries + 1) {
        const waitTime = attempt * 1000; // 1s, 2s backoff
        console.log(`⏳ [ADD TO GROUP] Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

    } catch (err) {
      console.error(`❌ [ADD TO GROUP] Attempt ${attempt} failed:`, err.message);
      lastError = err;

      // Don't retry on network errors if it's the last attempt
      if (attempt < retries + 1) {
        const waitTime = attempt * 1000;
        console.log(`⏳ [ADD TO GROUP] Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // All attempts failed
  console.error(`❌ [ADD TO GROUP] All ${retries + 1} attempts failed`);
  throw lastError || new Error('Add to group failed after all retries');
};


// =====================================================
// IMPROVED getUserByUpn FUNCTION (with better logging)
// =====================================================

const getUserByUpn = async (upn) => {
  console.log(`🔍 [GET USER] Looking up user: ${upn}`);
  
  if (!upn) {
    throw new Error('UPN is required');
  }

  try {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}?$select=id,mail,displayName,userPrincipalName`;

    console.log(`🔵 [GET USER] GET ${url}`);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      agent: new https.Agent({ rejectUnauthorized: false }),
    });

    console.log(`🔵 [GET USER] Response status: ${res.status}`);

    if (res.status === 404) {
      throw new Error(`User not found: ${upn}`);
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ [GET USER] Graph lookup failed:`, text);
      throw new Error(`Graph lookup failed: ${text}`);
    }

    const data = await res.json();

    const result = {
      id: data.id,
      mail: data.mail || data.userPrincipalName,
      displayName: data.displayName || null
    };

    console.log(`✅ [GET USER] User found:`, result);
    return result;

  } catch (err) {
    console.error(`❌ [GET USER] Error:`, err.message);
    throw err;
  }
};

// ---------------------- UPLOAD (NEW) ----------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const { uploadToSharePoint } = require("./utils/sharepointUpload");

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const result = await uploadToSharePoint(req.file);

    return res.json({
      id: result.id,
      driveId: result.driveId || null,
      fileName: result.fileName,
      fileType: result.fileType,
      url: result.fileUrl
    });
  } catch (err) {
    console.error('SharePoint upload error:', err);
    return res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

// ---------------------- Routes ----------------------------
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

// ---------------------- ADMIN NOTIFICATION ROUTES ----------------------
app.post("/api/notify-admin-added", async (req, res) => {
  try {
    const { actor, target } = req.body || {};
    if (!actor || !target) return res.status(400).json({ message: "actor and target are required" });
    
    const actorName = actor.name || actor.mail || "Unknown";
    const actorMail = actor.mail || null;
    const targetName = target.name || target.mail || "Unknown";
    const targetMail = target.mail || null;
    const itHead = process.env.IT_HEAD_EMAIL;

    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const actorTitle = `Admin Added — ${targetName} added to Helpdesk_Admin`;
    const actorFields = [
      { label: "Action", value: "Add Admin" },
      { label: "Performed By", value: actorName },
      { label: "Added User", value: `${targetName} (${targetMail || '—'})` },
      { label: "When (IST)", value: nowIST },
    ];
    const actorHtml = buildHtmlEmail({
      title: actorTitle,
      subtitle: "Adding new admin completed successfully",
      statusColor: "#16a34a",
      fields: actorFields,
      description: `You have successfully added ${targetName} as a Helpdesk Admin.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    const targetTitle = `You were added as Helpdesk Admin`;
    const targetFields = [
      { label: "Added By", value: actorName },
      { label: "When (IST)", value: nowIST },
      { label: "Group", value: "Helpdesk_Admin" },
    ];
    const targetHtml = buildHtmlEmail({
      title: targetTitle,
      subtitle: `You have been granted admin rights in Helpdesk`,
      statusColor: "#0ea5e9",
      fields: targetFields,
      description: `You are added as new admin in Helpdesk portal by ${actorName}. If this was unexpected, please contact your IT department.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    const actorSend = actorMail ? await sendEmail(actorMail, actorTitle, actorHtml, itHead) : false;
    const targetSend = targetMail ? await sendEmail(targetMail, targetTitle, targetHtml, itHead) : false;

    return res.json({
      message: "Notification attempted",
      actorNotified: !!actorSend,
      targetNotified: !!targetSend,
    });
  } catch (err) {
    console.error("notify-admin-added error:", err);
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
    const itHead = process.env.IT_HEAD_EMAIL;

    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const actorTitle = `Admin Removed — ${targetName} removed from Helpdesk_Admin`;
    const actorFields = [
      { label: "Action", value: "Remove Admin" },
      { label: "Performed By", value: actorName },
      { label: "Removed User", value: `${targetName} (${targetMail || '—'})` },
      { label: "When (IST)", value: nowIST },
    ];
    const actorHtml = buildHtmlEmail({
      title: actorTitle,
      subtitle: "Admin removal completed successfully",
      statusColor: "#16a34a",
      fields: actorFields,
      description: `You have successfully removed ${targetName} from Helpdesk Admins.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    const targetTitle = `You were removed from Helpdesk Admins`;
    const targetFields = [
      { label: "Removed By", value: actorName },
      { label: "When (IST)", value: nowIST },
      { label: "Group", value: "Helpdesk_Admin" },
    ];
    const targetHtml = buildHtmlEmail({
      title: targetTitle,
      subtitle: `Your admin rights were revoked`,
      statusColor: "#dc2626",
      fields: targetFields,
      description: `You are removed from admin in Helpdesk portal by ${actorName}. If this was unexpected, please contact your IT department.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    const actorSend = actorMail ? await sendEmail(actorMail, actorTitle, actorHtml, itHead) : false;
    const targetSend = targetMail ? await sendEmail(targetMail, targetTitle, targetHtml, itHead) : false;

    return res.json({
      message: "Notification attempted",
      actorNotified: !!actorSend,
      targetNotified: !!targetSend,
    });
  } catch (err) {
    console.error("notify-admin-removed error:", err);
    return res.status(500).json({ message: "Failed to send admin-removed notifications", error: err.message });
  }
});

// ===================== CATEGORY MANAGEMENT API =====================

// GET /api/categories - List all categories
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await CategoryConfig.find().sort({ createdAt: -1 });
    
    // Transform to match frontend expectations
    const transformed = categories.map(cat => ({
      id: cat._id.toString(),
      name: cat.name,
      type: cat.type,
      features: cat.features || {},
      categoryHeads: cat.categoryHeads || [],
      cc: cat.cc || [],
      createdBy: cat.createdBy || {},
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt
    }));

    
    res.json(transformed);
  } catch (err) {
    console.error("Get categories error:", err);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

// POST /api/categories - Create new category
app.post("/api/categories", async (req, res) => {
  try {
    const {
  name,
  categoryName,
  features,
  categoryHeads,
  cc,
  createdBy
} = req.body;


    console.log("📥 [CREATE CATEGORY] Received payload:", JSON.stringify(req.body, null, 2));

    // Validate required fields
    const finalName = (name || categoryName || "").trim();

if (!finalName) {
  return res.status(400).json({ message: "Category name is required" });
}

const normalizedName = finalName;


    // Check if category already exists (case-insensitive)
    const nameRegex = new RegExp(
      "^" + normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
      "i"
    );

    const existing = await CategoryConfig.findOne({
      $or: [
        { name: nameRegex },
        { categoryName: nameRegex }
      ]
    });


    if (existing) {
      return res.status(400).json({ message: "Category with this name already exists" });
    }

    // Ensure "Other" is always present in subcategories if enabled
    let finalFeatures = features || {};
    if (finalFeatures.subCategories?.enabled) {
      const subList = finalFeatures.subCategories.list || [];
      if (!subList.some(s => s.toLowerCase() === "other")) {
        subList.push("Other");
      }
      finalFeatures.subCategories.list = subList;
    }

    // Create category
    const categoryType =
      normalizedName.toLowerCase() === "password reset"
        ? "PASSWORD_RESET"
        : normalizedName.toLowerCase() === "admin access"
        ? "ADMIN_ACCESS"
        : "NORMAL";

    const category = await CategoryConfig.create({
      name: normalizedName,
      categoryName: normalizedName,
      type: categoryType,   // ✅ THIS IS THE FIX
      features: finalFeatures,
      categoryHeads: Array.isArray(categoryHeads) ? categoryHeads : [],
      cc: Array.isArray(cc) ? cc : [],
      createdBy: createdBy || {}
    });



    console.log("✅ [CREATE CATEGORY] Category created:", category._id);

    // ============ EMAIL NOTIFICATIONS ============
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const itHead = process.env.IT_HEAD_EMAIL;

    // Get all helpdesk admins
    const admins = process.env.HELPDESK_ADMINS_EMAILS
      ? process.env.HELPDESK_ADMINS_EMAILS.split(",").map(e => e.trim())
      : [];

    // Prepare email fields
    const emailFields = [
      { label: "Category Name", value: normalizedName },
      { label: "Created By", value: `${createdBy?.name || "Unknown"} (${createdBy?.mail || "—"})` },
      { label: "On Behalf Enabled", value: finalFeatures.onBehalf?.enabled ? "Yes" : "No" },
      { label: "Sub-Categories Enabled", value: finalFeatures.subCategories?.enabled ? "Yes" : "No" },
      { label: "Attachments Enabled", value: finalFeatures.attachments?.enabled ? "Yes" : "No" },
      { label: "Created At (IST)", value: nowIST }
    ];

    if (finalFeatures.subCategories?.enabled && finalFeatures.subCategories.list?.length) {
      emailFields.push({
        label: "Sub-Categories",
        value: finalFeatures.subCategories.list.join(", ")
      });
    }

    if (finalFeatures.onBehalf?.enabled && finalFeatures.onBehalf.options?.length) {
      emailFields.push({
        label: "On Behalf Options",
        value: finalFeatures.onBehalf.options.join(", ")
      });
    }

    const title = `New Category Created: ${normalizedName}`;
    const emailHtml = buildHtmlEmail({
      title,
      subtitle: "A new ticket category has been created in the Helpdesk system",
      statusColor: "#16a34a",
      fields: emailFields,
      description: `Category "${normalizedName}" has been successfully created and is now available for ticket creation.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    // 1. Notify all helpdesk admins
    if (admins.length) {
      console.log("📧 [CATEGORY] Notifying admins:", admins);
      await sendEmail(
        admins,
        `[HELPDESK] New Category: ${normalizedName}`,
        emailHtml,
        itHead
      );
    }

    // 2. Notify category heads
    const headEmails = (categoryHeads || [])
      .map(h => h.email)
      .filter(Boolean);

    if (headEmails.length) {
      const headEmailHtml = buildHtmlEmail({
        title: `You are assigned as Category Head: ${normalizedName}`,
        subtitle: "You will receive notifications for tickets in this category",
        statusColor: "#0ea5e9",
        fields: emailFields,
        description: `You have been assigned as a Category Head for "${normalizedName}". You will receive email notifications for ticket approvals and actions.`,
        actionLink: process.env.PROD_URL,
        actionText: "Open Helpdesk"
      });

      const ccEmails = (cc || []).map(c => c.email).filter(Boolean);
      const ccList = [...new Set([...ccEmails, itHead].filter(Boolean))];

      console.log("📧 [CATEGORY] Notifying category heads:", headEmails);
      await sendEmail(
        headEmails,
        `[HELPDESK] Assigned as Category Head: ${normalizedName}`,
        headEmailHtml,
        ccList
      );
    }

    // 3. Notify CC recipients
    const ccEmails = (cc || []).map(c => c.email).filter(Boolean);
    if (ccEmails.length) {
      const ccEmailHtml = buildHtmlEmail({
        title: `New Category Created: ${normalizedName}`,
        subtitle: "You are CC'd for notifications in this category",
        statusColor: "#0ea5e9",
        fields: emailFields,
        description: `A new category "${normalizedName}" has been created. You are listed as a CC recipient and will receive notifications for ticket actions.`,
        actionLink: process.env.PROD_URL,
        actionText: "Open Helpdesk"
      });

      console.log("📧 [CATEGORY] Notifying CC recipients:", ccEmails);
      await sendEmail(
        ccEmails,
        `[HELPDESK] New Category (CC): ${normalizedName}`,
        ccEmailHtml,
        itHead
      );
    }

    console.log("✅ [CATEGORY] All notifications sent successfully");

    // Return success response
    return res.status(201).json({
      id: category._id.toString(),
      name: category.name,
      features: category.features,
      categoryHeads: category.categoryHeads,
      cc: category.cc,
      createdBy: category.createdBy,
      createdAt: category.createdAt
    });

  } catch (err) {
    console.error("❌ [CREATE CATEGORY] Error:", err);
    return res.status(500).json({ 
      message: "Failed to create category", 
      error: err.message 
    });
  }
});

app.put("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      categoryName,
      features,
      categoryHeads,
      cc,
      updatedBy   // <-- send this from App.js { name, mail }
    } = req.body;

    const finalName = (name || categoryName || "").trim();
    if (!finalName) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const oldCategory = await CategoryConfig.findById(id);
    if (!oldCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    // ensure "Other"
    let finalFeatures = features || {};
    if (finalFeatures.subCategories?.enabled) {
      const list = finalFeatures.subCategories.list || [];
      if (!list.some(v => v.toLowerCase() === "other")) list.push("Other");
      finalFeatures.subCategories.list = list;
    }

    const newHeads = Array.isArray(categoryHeads) ? categoryHeads : [];
    const newCc = Array.isArray(cc) ? cc : [];

    const updated = await CategoryConfig.findByIdAndUpdate(
      id,
      {
        name: finalName,
        categoryName: finalName,
        features: finalFeatures,
        categoryHeads: newHeads,
        cc: newCc
      },
      { new: true }
    );

// -------------------- build human readable changes --------------------

    const changes = [];

    // helpers
    const emails = arr => (arr || []).map(x => x.email).filter(Boolean);

    const oldHeads = emails(oldCategory.categoryHeads);
    const newHeadsArr = emails(newHeads);

    const oldCc = emails(oldCategory.cc);
    const newCcArr = emails(newCc);

    // heads added / removed
    const addedHeads = newHeadsArr.filter(e => !oldHeads.includes(e));
    const removedHeads = oldHeads.filter(e => !newHeadsArr.includes(e));

    if (addedHeads.length)
      changes.push(`Category head added: ${addedHeads.join(", ")}`);

    if (removedHeads.length)
      changes.push(`Category head removed: ${removedHeads.join(", ")}`);

    // cc added / removed
    const addedCc = newCcArr.filter(e => !oldCc.includes(e));
    const removedCc = oldCc.filter(e => !newCcArr.includes(e));

    if (addedCc.length)
      changes.push(`CC added: ${addedCc.join(", ")}`);

    if (removedCc.length)
      changes.push(`CC removed: ${removedCc.join(", ")}`);

    // feature changes
    const oldF = oldCategory.features || {};
    const newF = finalFeatures || {};

    if (!!oldF.onBehalf?.enabled !== !!newF.onBehalf?.enabled)
      changes.push(`On behalf ${newF.onBehalf?.enabled ? "enabled" : "disabled"}`);

    if (!!oldF.onBehalf?.required !== !!newF.onBehalf?.required)
      changes.push(`On behalf required ${newF.onBehalf?.required ? "enabled" : "disabled"}`);

    if (!!oldF.subCategories?.enabled !== !!newF.subCategories?.enabled)
      changes.push(`Sub category ${newF.subCategories?.enabled ? "enabled" : "disabled"}`);

    if (!!oldF.subCategories?.required !== !!newF.subCategories?.required)
      changes.push(`Sub category required ${newF.subCategories?.required ? "enabled" : "disabled"}`);

    if (!!oldF.attachments?.enabled !== !!newF.attachments?.enabled)
      changes.push(`Attachments ${newF.attachments?.enabled ? "enabled" : "disabled"}`);

    if (!!oldF.attachments?.required !== !!newF.attachments?.required)
      changes.push(`Attachments required ${newF.attachments?.required ? "enabled" : "disabled"}`);

    // category name
    if (oldCategory.name !== finalName)
      changes.push(`Category name changed to "${finalName}"`);

    // -------------------- notify (old heads + old cc + editor) --------------------

    const notifyTo = [
      ...(oldCategory.categoryHeads || []).map(h => h.email),
      ...(oldCategory.cc || []).map(c => c.email),
      updatedBy?.mail
    ].filter(Boolean);

    const uniqueNotifyTo = [...new Set(notifyTo)];

    if (uniqueNotifyTo.length && changes.length) {

      const changedBy =
        updatedBy?.name
          ? `${updatedBy.name} (${updatedBy.mail || ""})`
          : "Admin";

      const fields = changes.map((c, i) => ({
        label: `Change ${i + 1}`,
        value: c
      }));

      const html = buildHtmlEmail({
        title: `Category updated: ${oldCategory.name}`,
        subtitle: `${changedBy} updated the category`,
        statusColor: "#0ea5e9",
        fields,
        description: "The following updates were made:",
        actionLink:
          (process.env.PROD_URL),
        actionText: "Open Helpdesk"
      });

      const itHead = process.env.IT_HEAD_EMAIL;

      await sendEmail(
        uniqueNotifyTo,
        `[HELPDESK] Category updated: ${oldCategory.name}`,
        html,
        itHead
      );
    }

    // -------------------- response --------------------

    res.json({
      id: updated._id.toString(),
      name: updated.name,
      features: updated.features,
      categoryHeads: updated.categoryHeads,
      cc: updated.cc,
      createdBy: updated.createdBy,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    });

  } catch (err) {
    console.error("Update category error:", err.message);
    res.status(500).json({ message: "Failed to update category" });
  }
});


// DELETE /api/categories/:id - Remove category
app.delete("/api/categories/:id", async (req, res) => {
  try {
    const categoryId = req.params.id;

    console.log("🗑️ [DELETE CATEGORY] Attempting to delete:", categoryId);

    // Find the category first
    const category = await CategoryConfig.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const categoryName = category.name;

    // Delete the category
    await CategoryConfig.findByIdAndDelete(categoryId);

    console.log("✅ [DELETE CATEGORY] Category deleted:", categoryName);

    // ============ EMAIL NOTIFICATIONS ============
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const itHead = process.env.IT_HEAD_EMAIL;

    // Get all helpdesk admins
    const admins = process.env.HELPDESK_ADMINS_EMAILS
      ? process.env.HELPDESK_ADMINS_EMAILS.split(",").map(e => e.trim())
      : [];

    const title = `Category Deleted: ${categoryName}`;
    const emailFields = [
      { label: "Category Name", value: categoryName },
      { label: "Deleted At (IST)", value: nowIST },
      { label: "Action", value: "Category Removed" }
    ];

    const emailHtml = buildHtmlEmail({
      title,
      subtitle: "A category has been removed from the Helpdesk system",
      statusColor: "#dc2626",
      fields: emailFields,
      description: `The category "${categoryName}" has been permanently deleted and is no longer available for ticket creation.`,
      actionLink: process.env.PROD_URL,
      actionText: "Open Helpdesk"
    });

    // Notify all admins
    if (admins.length) {
      console.log("📧 [DELETE CATEGORY] Notifying admins:", admins);
      await sendEmail(
        admins,
        `[HELPDESK] Category Deleted: ${categoryName}`,
        emailHtml,
        itHead
      );
    }

    // Notify category heads and CC
    const headEmails = (category.categoryHeads || []).map(h => h.email).filter(Boolean);
    const ccEmails = (category.cc || []).map(c => c.email).filter(Boolean);
    const allNotifyEmails = [...new Set([...headEmails, ...ccEmails])];

    if (allNotifyEmails.length) {
      console.log("📧 [DELETE CATEGORY] Notifying heads/CC:", allNotifyEmails);
      await sendEmail(
        allNotifyEmails,
        `[HELPDESK] Category Deleted: ${categoryName}`,
        emailHtml,
        itHead
      );
    }

    console.log("✅ [DELETE CATEGORY] All notifications sent");

    return res.json({ 
      message: "Category deleted successfully",
      categoryName 
    });

  } catch (err) {
    console.error("❌ [DELETE CATEGORY] Error:", err);
    return res.status(500).json({ 
      message: "Failed to delete category", 
      error: err.message 
    });
  }
});

// POST /api/notify-category-added - Notify about new category (optional, alternative to inline notifications)
app.post("/api/notify-category-added", async (req, res) => {
  try {
    const { actor, category } = req.body || {};
    
    if (!category) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const actorName = actor?.name || actor?.mail || "Admin";
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const itHead = process.env.IT_HEAD_EMAIL;

    const admins = process.env.HELPDESK_ADMINS_EMAILS
      ? process.env.HELPDESK_ADMINS_EMAILS.split(",").map(e => e.trim())
      : [];

    const title = `New Category Added: ${category}`;
    const fields = [
      { label: "Category", value: category },
      { label: "Added By", value: actorName },
      { label: "Added At (IST)", value: nowIST }
    ];

    const html = buildHtmlEmail({
      title,
      subtitle: "A new category is now available",
      statusColor: "#16a34a",
      fields,
      description: `${actorName} has created a new category "${category}" in the Helpdesk system.`,
      actionLink: process.env.PROD_URL,
      actionText: "View Categories"
    });

    if (admins.length) {
      await sendEmail(
        admins,
        `[HELPDESK] New Category: ${category}`,
        html,
        itHead
      );
    }

    return res.json({ message: "Category notification sent" });
  } catch (err) {
    console.error("notify-category-added error:", err);
    return res.status(500).json({ message: "Failed to send notification" });
  }
});

// ===================== END CATEGORY MANAGEMENT =====================

// ---------------------- TICKET ROUTES ----------------------

// Helper: Get category heads for a ticket
const getCategoryHeads = async (categoryName) => {
  try {
    const config = await CategoryConfig.findOne({
      name: { $regex: new RegExp("^" + categoryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }
    });

    if (!config) return [];

    return (config.categoryHeads || [])
      .map(h => h.email)
      .filter(Boolean);

  } catch (err) {
    console.error("Error getting category heads:", err);
    return [];
  }
};

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

    const heads = await getCategoryHeads(ticket.category);

    const obj = ticket.toObject();
    obj.categoryHeads = heads.map(h => (h || '').toLowerCase().trim());
    res.json(obj);
  } catch (err) {
    console.error("Error fetching ticket:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Create Ticket
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
      subCategory,
      subQuery,
      otherSubQueryText,
      attachments
    } = req.body;

    console.log("📥 [CREATE TICKET] Category:", category);

    // ----------------------------------------------------
    // Load category config (ONLY DB, no legacy)
    // ----------------------------------------------------
    const categoryConfig = await CategoryConfig.findOne({
      name: {
        $regex: new RegExp(
          "^" + category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          "i"
        )
      }
    });

    if (!categoryConfig) {
      return res.status(400).json({ message: "Invalid category" });
    }

    // ----------------------------------------------------
    // Dynamic validation
    // ----------------------------------------------------
    if (
      categoryConfig.features?.subCategories?.enabled &&
      categoryConfig.features.subCategories.required &&
      !subCategory
    ) {
      return res
        .status(400)
        .json({ message: "Sub-category is required for this category" });
    }

    if (
      categoryConfig.features?.attachments?.enabled &&
      categoryConfig.features.attachments.required &&
      (!attachments || attachments.length === 0)
    ) {
      return res
        .status(400)
        .json({ message: "Attachments are required for this category" });
    }

    // ----------------------------------------------------
    // Password Reset validation (keep your special logic)
    // ----------------------------------------------------
    if (category === "Password Reset" && (onBehalf === "Self" || !onBehalf)) {
      if (!deliveryEmail || !deliveryEmail.trim()) {
        return res.status(400).json({
          message: "Alternative delivery email is required for self password reset."
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(deliveryEmail.trim())) {
        return res.status(400).json({
          message: "Alternative delivery email is not valid."
        });
      }
    }

    if (category === "Password Reset" && onBehalf === "Other") {
      if (!onBehalfEmail || !onBehalfEmail.trim()) {
        return res.status(400).json({
          message: "On-behalf email is required for other password reset."
        });
      }

      if (!deliveryEmail || !deliveryEmail.trim()) {
        return res.status(400).json({
          message: "Delivery email is required when requesting for other user."
        });
      }
    }

    // ----------------------------------------------------
    // Initial status
    // ----------------------------------------------------
    let initialStatus = "Open";

    if (categoryConfig?.features?.approvalRequired === true) {
      initialStatus = "Waiting for approval";
    }

    if (
        category === "Password Reset" ||
        category === "Admin Access"
      ) {
        initialStatus = "Waiting for approval";
      }

    ticketCounter++;

    const ticketPayload = {
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
      subCategory: subCategory || "",
      subQuery: subQuery || "",
      otherSubQueryText: otherSubQueryText || "",
      history: [
        {
          action: "created",
          by: userName,
          at: new Date(),
          reason: null
        }
      ]
    };

    // ----------------------------------------------------
    // Attachments
    // ----------------------------------------------------
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      ticketPayload.attachments = attachments.map((a) => ({
        fileName: a.fileName || a.file_name || a.name || "",
        fileType: a.fileType || a.file_type || a.type || "",
        fileUrl: a.url || a.fileUrl || a.path || null,
        id: a.id || a.fileId || null,
        driveId: a.driveId || null
      }));

      if (!ticketPayload.attachment && ticketPayload.attachments.length > 0) {
        const first = ticketPayload.attachments[0];
        ticketPayload.attachment = {
          fileName: first.fileName,
          fileType: first.fileType,
          fileUrl: first.fileUrl
        };
      }
    }

    const ticket = await Ticket.create(ticketPayload);

    console.log("✅ [CREATE TICKET] Ticket created:", ticket.ticketNumber);

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata"
    });

    const itHead = process.env.IT_HEAD_EMAIL;

    // ----------------------------------------------------
    // Creator mail
    // ----------------------------------------------------
    const creatorHtml = buildHtmlEmail({
      title: `Ticket #${ticketCounter} Created`,
      subtitle:
        initialStatus === "Waiting for approval"
          ? "Your ticket is waiting for department approval"
          : "Your ticket has been created",
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

    await sendEmail(userEmail, `Ticket #${ticketCounter} Created`, creatorHtml, itHead);

    // ----------------------------------------------------
    // Department mail
    // ----------------------------------------------------
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
      statusColor:
        initialStatus === "Waiting for approval" ? "#f59e0b" : "#0ea5e9",
      fields: deptFields,
      description,
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText:
        initialStatus === "Waiting for approval" ? "Approve / Reject" : "Open Ticket"
    });

    // ----------------------------------------------------
    // Recipients (ONLY from CategoryConfig)
    // ----------------------------------------------------
    const deptTo = (categoryConfig.categoryHeads || [])
      .map(h => h.email)
      .filter(Boolean);

    const deptCcList = (categoryConfig.cc || [])
      .map(c => c.email)
      .filter(Boolean);

    if (itHead) deptCcList.push(itHead);

    if (deptTo.length) {
      await sendEmail(
        deptTo,
        `[TICKET #${ticketCounter}] ${category} - Action Required`,
        deptHtml,
        deptCcList.length ? deptCcList : itHead
      );
    }

    res.status(201).json(ticket);

  } catch (err) {
    console.error("Error creating ticket:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- APPROVE / REJECT / CLOSE / REVIVE ----------------------
// =====================================================
// FIXED ADMIN ACCESS APPROVAL ENDPOINT
// Replace the existing /tickets/:id/approve endpoint with this version
// =====================================================

app.post("/tickets/:id/approve", async (req, res) => {
  try {
    const { approvedBy, note } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status === "Closed") {
      return res.status(400).json({ message: "Ticket is already closed" });
    }

    const itHead = process.env.IT_HEAD_EMAIL;
    const now = new Date();

    /* =====================================================
       PASSWORD RESET
    ===================================================== */
    if (ticket.category === "Password Reset") {
      const userIdentifier = ticket.onBehalfEmail || ticket.userId || ticket.userEmail;

      if (!userIdentifier) {
        return res.status(400).json({
          message: "No user identifier available for approval action"
        });
      }

      let newPassword;
      try {
        newPassword = await resetAzurePassword(userIdentifier);
      } catch (err) {
        console.error("❌ Password reset failed during approve:", err.message);
        return res.status(500).json({
          message: "Password reset failed",
          error: err.message
        });
      }

      ticket.history.push({
        action: "approved",
        by: approvedBy || "Department Head",
        at: now,
        reason: note || "Approved and password reset performed"
      });

      ticket.status = "Closed";
      ticket.closedBy = approvedBy || "Department Head";
      ticket.closeReason = note
        ? `Approved: ${note}`
        : "Approved by Department Head";
      ticket.closedAt = now;

      ticket.history.push({
        action: "closed",
        by: ticket.closedBy,
        at: now,
        reason: ticket.closeReason
      });

      await ticket.save();

      const nowIST = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata"
      });

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
          {
            label: "Affected User",
            value: ticket.onBehalfEmail || ticket.userEmail
          }
        ],
        description:
          "The new temporary password has been generated and applied successfully.",
        actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
        actionText: "View Ticket"
      });

      await sendEmail(
        ticket.userEmail,
        `[TICKET #${ticket.ticketNumber}] Password Reset Approved`,
        userHtml,
        itHead
      );

      if (
        ticket.deliveryEmail &&
        ticket.deliveryEmail.trim() &&
        ticket.deliveryEmail.trim() !== ticket.userEmail.trim()
      ) {
        await sendEmail(
          ticket.deliveryEmail.trim(),
          `[TICKET #${ticket.ticketNumber}] Password Reset Approved`,
          userHtml,
          itHead
        );
      }

      return res.status(200).json({
        message: "Password reset approved successfully",
        ticket
      });
    }

    /* =====================================================
       ADMIN ACCESS - FIXED VERSION
    ===================================================== */
    else if (ticket.category === "Admin Access") {
      console.log("🔵 [ADMIN ACCESS] Starting approval process...");
      
      const targetUpn = ticket.onBehalfEmail || ticket.userEmail;

      if (!targetUpn) {
        console.error("❌ [ADMIN ACCESS] No target user found");
        return res.status(400).json({ 
          message: "No target user found for Admin Access",
          details: { onBehalfEmail: ticket.onBehalfEmail, userEmail: ticket.userEmail }
        });
      }

      console.log("🔵 [ADMIN ACCESS] Target user:", targetUpn);
      console.log("🔵 [ADMIN ACCESS] Group ID:", AZURE_DEVICE_ADMIN_GROUP_ID);

      // Validate GROUP_ID exists
      if (!AZURE_DEVICE_ADMIN_GROUP_ID) {
        console.error("❌ [ADMIN ACCESS] AZURE_DEVICE_ADMIN_GROUP_ID not configured");
        return res.status(500).json({
          message: "Server configuration error: Admin group ID not configured",
          error: "AZURE_DEVICE_ADMIN_GROUP_ID is missing from environment variables"
        });
      }

      // Step 1: Lookup user
      let user;
      try {
        console.log("🔍 [ADMIN ACCESS] Looking up user in Azure AD...");
        user = await getUserByUpn(targetUpn);
        console.log("✅ [ADMIN ACCESS] User found:", {
          id: user.id,
          displayName: user.displayName,
          mail: user.mail
        });
      } catch (err) {
        console.error("❌ [ADMIN ACCESS] User lookup failed:", err.message);
        return res.status(404).json({
          message: "User not found in Azure AD",
          error: err.message,
          target: targetUpn
        });
      }

      // Step 2: Check if user is already in the group (optional but recommended)
      try {
        console.log("🔍 [ADMIN ACCESS] Checking existing group membership...");
        const token = await getAccessToken();
        const checkUrl = `https://graph.microsoft.com/v1.0/groups/${AZURE_DEVICE_ADMIN_GROUP_ID}/members`;
        const checkRes = await fetch(checkUrl, {
          headers: { Authorization: `Bearer ${token}` },
          agent: new https.Agent({ rejectUnauthorized: false })
        });

        if (checkRes.ok) {
          const members = await checkRes.json();
          const alreadyMember = members.value?.some(m => m.id === user.id);
          
          if (alreadyMember) {
            console.log("⚠️ [ADMIN ACCESS] User is already a member of the group");
            // Still proceed with closing the ticket, but note this in the reason
          }
        }
      } catch (err) {
        console.warn("⚠️ [ADMIN ACCESS] Could not check existing membership:", err.message);
        // Continue anyway - this is not critical
      }

      // Step 3: Add to group
      try {
        console.log("🔵 [ADMIN ACCESS] Adding user to admin group...");
        await addUserToGroup(AZURE_DEVICE_ADMIN_GROUP_ID, user.id);
        console.log("✅ [ADMIN ACCESS] Successfully added user to admin group");
      } catch (err) {
        console.error("❌ [ADMIN ACCESS] Failed to add user to group:", err.message);
        
        // Check if it's a "already exists" error (code: Request_ResourceNotFound or similar)
        const errorMessage = err.message?.toLowerCase() || '';
        const isAlreadyMember = 
          errorMessage.includes('already exists') || 
          errorMessage.includes('already a member') ||
          errorMessage.includes('one or more added object references already exist');

        if (!isAlreadyMember) {
          // Real error - return failure
          return res.status(500).json({
            message: "Failed to add user to admin group",
            error: err.message,
            details: { 
              userId: user.id, 
              groupId: AZURE_DEVICE_ADMIN_GROUP_ID, 
              target: targetUpn 
            }
          });
        } else {
          console.log("ℹ️ [ADMIN ACCESS] User was already in the group - continuing");
        }
      }

      // Step 4: Update ticket history and close
      console.log("🔵 [ADMIN ACCESS] Updating ticket...");
      
      ticket.history.push({
        action: "approved",
        by: approvedBy || "Department Head",
        at: now,
        reason: note || "Admin access approved and group assigned"
      });

      ticket.status = "Closed";
      ticket.closedBy = approvedBy || "Department Head";
      ticket.closeReason = note ? `Approved: ${note}` : "Admin access approved and granted";
      ticket.closedAt = now;

      ticket.history.push({
        action: "closed",
        by: ticket.closedBy,
        at: now,
        reason: ticket.closeReason
      });

      // Step 5: Save ticket BEFORE sending response
      try {
        await ticket.save();
        console.log("✅ [ADMIN ACCESS] Ticket saved successfully:", ticket._id);
      } catch (err) {
        console.error("❌ [ADMIN ACCESS] Failed to save ticket:", err.message);
        return res.status(500).json({ 
          message: "Failed to save ticket after approval", 
          error: err.message 
        });
      }

      // Step 6: Send response to client immediately
      console.log("✅ [ADMIN ACCESS] Sending success response to client");
      res.status(200).json({ 
        message: "Admin access approved successfully", 
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

      // Step 7: Send notifications in background (non-blocking)
      console.log("🔵 [ADMIN ACCESS] Starting background notifications...");
      
      setImmediate(async () => {
        try {
          const nowIST = new Date().toLocaleString("en-IN", { 
            timeZone: "Asia/Kolkata" 
          });

          // User notification
          try {
            console.log("📧 [ADMIN ACCESS] Sending user notification...");
            
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
                { label: "Target User", value: `${user.displayName || targetUpn}` }
              ],
              description: note || "You have been added to the Device Admin group successfully. Your new permissions will be active within a few minutes.",
              actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
              actionText: "View Ticket"
            });

            await sendEmail(
              ticket.userEmail, 
              `[TICKET #${ticket.ticketNumber}] Admin Access Approved`, 
              userHtml, 
              itHead
            );
            
            console.log("✅ [ADMIN ACCESS] User notification sent to:", ticket.userEmail);
          } catch (e) {
            console.error("❌ [ADMIN ACCESS] User notification failed:", e.message);
          }

          // Department notification
          try {
            console.log("📧 [ADMIN ACCESS] Sending department notification...");
            
            const catCfg = await CategoryConfig.findOne({
              name: {
                $regex: new RegExp(
                  "^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", 
                  "i"
                )
              }
            });

            const deptTo = (catCfg?.categoryHeads || [])
              .map(h => h.email)
              .filter(Boolean);
              
            const deptCcList = (catCfg?.cc || [])
              .map(c => c.email)
              .filter(Boolean);
              
            if (itHead) deptCcList.push(itHead);

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

              await sendEmail(
                deptTo, 
                `[CLOSED] Ticket #${ticket.ticketNumber} - Admin Access Granted`, 
                deptHtml, 
                deptCcList
              );
              
              console.log("✅ [ADMIN ACCESS] Department notification sent to:", deptTo.join(", "));
            } else {
              console.log("⚠️ [ADMIN ACCESS] No department heads configured for notifications");
            }
          } catch (e) {
            console.error("❌ [ADMIN ACCESS] Department notification failed:", e.message);
          }

          console.log("✅ [ADMIN ACCESS] Background notification task completed");
          
        } catch (e) {
          console.error("❌ [ADMIN ACCESS] Background notification task failed:", e.message);
        }
      });

      // Done - response already sent above
      return;
    }

    /* =====================================================
       OTHER CATEGORIES
    ===================================================== */
    else {
      console.log("❌ Approval not supported for category:", ticket.category);
      return res.status(400).json({
        message: `Approval not supported for category: ${ticket.category}`
      });
    }

  } catch (error) {
    console.error("❌ [APPROVE] Fatal error:", error);
    
    // Make sure we always send a response
    if (!res.headersSent) {
      return res.status(500).json({
        message: "Internal server error during approval",
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// Reject endpoint (keep existing)
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
      by: rejectedBy,
      at: now,
      reason: reason || "Rejected by Department Head",
    });

    ticket.status = "Closed";
    ticket.closedBy = rejectedBy;
    ticket.closeReason = reason ? `Rejected: ${reason}` : "Reason not specified";
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
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Request Rejected`, userHtml, itHead);

    const deptHtml = buildHtmlEmail({
      title: `Ticket #${ticket.ticketNumber} — Rejected and Closed`,
      subtitle: `${ticket.closedBy} rejected the request`,
      statusColor: "#dc2626",
      fields: [
        { label: "Ticket No", value: ticket.ticketNumber },
        { label: "Rejected By", value: ticket.closedBy },
        { label: "Rejected On", value: nowIST },
      ],
      description: `The ticket has been rejected`,
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "Open Ticket"
    });

    const catCfg = await CategoryConfig.findOne({
      name: {
        $regex: new RegExp(
          "^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          "i"
        )
      }
    });

    const deptTo = (catCfg?.categoryHeads || [])
      .map(h => h.email)
      .filter(Boolean);

    const deptCcList = (catCfg?.cc || [])
      .map(c => c.email)
      .filter(Boolean);

    if (itHead) deptCcList.push(itHead);

    if (deptTo.length) {
      await sendEmail(
        deptTo,
        `[CLOSED] Ticket #${ticket.ticketNumber} - Rejected`,
        deptHtml,
        deptCcList
      );
    }


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

// Close Ticket (keep existing)
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
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Closed`, emailHtml, itHead);

   const catCfg = await CategoryConfig.findOne({
      name: {
        $regex: new RegExp(
          "^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          "i"
        )
      }
    });

    const deptTo = (catCfg?.categoryHeads || [])
      .map(h => h.email)
      .filter(Boolean);

    const deptCcList = (catCfg?.cc || [])
      .map(c => c.email)
      .filter(Boolean);

    if (itHead) deptCcList.push(itHead);

    if (deptTo.length) {
      await sendEmail(
        deptTo,
        `[CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`,
        emailHtml,
        deptCcList
      );
    }


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

// Revive Ticket (keep existing)
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
      actionLink: `${process.env.PROD_URL}/ticket/${ticket._id}`,
      actionText: "View Ticket"
    });

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Revived`, emailHtml, itHead);
    const catCfg = await CategoryConfig.findOne({
      name: {
        $regex: new RegExp(
          "^" + ticket.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          "i"
        )
      }
    });

    const deptTo = (catCfg?.categoryHeads || [])
      .map(h => h.email)
      .filter(Boolean);

    const deptCcList = (catCfg?.cc || [])
      .map(c => c.email)
      .filter(Boolean);

    if (itHead) deptCcList.push(itHead);

    if (deptTo.length) {
      await sendEmail(
        deptTo,
        `[REVIVED] Ticket #${ticket.ticketNumber} - ${ticket.category}`,
        emailHtml,
        deptCcList
      );
    }

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

// ---------------------- DOWNLOAD ATTACHMENT (ROBUST PROXY + ZIP) ----------------------
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
      console.warn('Could not resolve site id (skip site-drive attempt):', e.message || e);
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
      return {
        stream: resp.data,
        contentType: resp.headers['content-type'],
        contentDisposition: resp.headers['content-disposition'],
        used: att.label
      };
    } catch (err) {
      const errMsg = err?.response?.data ? JSON.stringify(err.response.data) : err.message || err;
      console.warn(`Attempt failed for ${att.label}:`, errMsg);
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

    const driveIds = (req.query.driveIds || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const token = await getAccessToken();

    const zipName = `attachments-${Date.now()}.zip`;

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Transfer-Encoding': 'chunked'
    });

    const archive = archiver('zip', { zlib: { level: 1 } });

    archive.on('warning', (err) => {
      console.warn('Archive warning:', err);
    });

    archive.on('error', (err) => {
      console.error('Archiver fatal error:', err);
      try { archive.abort(); } catch(e){}
      if (!res.headersSent) {
        res.status(500).send('ZIP creation failed');
      }
    });

    res.on('close', () => {
      try { archive.abort(); } catch(e){}
    });

    archive.pipe(res);

    const limit = pLimit(2);

    const fetchPromises = ids.map((id, i) =>
      limit(async () => {
        try {
          const driveId = driveIds.length > i ? driveIds[i] : null;

          const fetched = await Promise.race([
            fetchItemStream(token, id, driveId),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout: ${id}`)), 15000)
            )
          ]);

          let filename = id.slice(-10);

          const dispMatch =
            /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i
              .exec(fetched.contentDisposition || '');

          if (dispMatch && dispMatch[1]) {
            try {
              filename = decodeURIComponent(dispMatch[1]);
            } catch (e) {
              filename = dispMatch[1];
            }
          }

          archive.append(fetched.stream, { name: filename });

        } catch (err) {
          console.warn(`Skip ${id}:`, err.message);
        }
      })
    );

    await Promise.all(fetchPromises);
    await archive.finalize();

  } catch (err) {
    console.error('ZIP endpoint error:', err);
    if (!res.headersSent) {
      res.status(500).send('Download failed');
    }
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
      if (ct.startsWith('image/')) {
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileId)}"`);
      } else if (ct === 'application/pdf') {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileId)}"`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileId)}"`);
      }
    }

    fetched.stream.pipe(res);
  } catch (err) {
    console.error('Attachment proxy error:', err?.response?.data || err?.message || err);
    if (!res.headersSent) res.status(500).send('Download failed');
  }
});

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Server running on port ${PORT}`)
);