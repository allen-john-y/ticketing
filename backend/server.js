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
const fs = require('fs');

// ---------------------- App Setup ------------------------
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: '25mb' }));
// Add this after the app initialization section
app.use('/static', express.static(__dirname));
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


// Logo URL for emails (served via HTTP for better Outlook compatibility)
const LOGO_URL = `${process.env.PROD_URL || 'http://localhost:5000'}/static/sandeza.jpg`;
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


// ===================== ONBOARDING =====================
// NOTE: Onboarding requests are NOT a separate collection. Per the agreed
// architecture, an onboarding request IS a normal Request document (same
// collection used by Laptop/Hardware/etc, same RequestDetails-compatible
// shape: requestNumber, service, raisedBy, approval, status, history), just
// with `service.categoryName === 'Onboarding'` and an extra `onboarding`
// sub-object holding the employee-specific fields. See the `requestSchema`
// definition further down this file for the actual field list, and the
// "ONBOARDING ROUTES" section below for submit/approve/reject.
const onboardingSettingsSchema = new mongoose.Schema({
  approvers: [{
  id: String,
  displayName: String,
  mail: String,
}],
selectedGroups: [String], // Group IDs from Azure AD
approvalRule: { type: String, enum: ['any', 'all'], default: 'any' },
autoAddReportingManager: { type: Boolean, default: false },
welcomeEmailSubject: { type: String, default: 'Welcome to the Team!' },
welcomeEmailBody: { type: String, default: '' },
updatedBy: { id: String, name: String, email: String },
updatedAt: { type: Date, default: Date.now },
});

const OnboardingSettings = mongoose.model('OnboardingSettings', onboardingSettingsSchema);

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

// ===================== ADMIN CHECK HELPER =====================
const checkIfUserIsAdmin = async (email) => {
  try {
    if (!email) return false;
    
    const helpDeskGroupId = process.env.AZURE_DEVICE_ADMIN_GROUP_ID;
    if (!helpDeskGroupId) {
      console.warn('⚠️ [ADMIN CHECK] HELP_DESK_GROUP_ID not set in .env');
      return false;
    }

    // Get Azure AD token
    const token = await getAccessToken();

    // ✅ Use checkMemberGroups instead of filtering /groups/{id}/members —
    // Graph rejects $filter on that members collection with
    // "Request_UnsupportedQuery". checkMemberGroups is the supported way to
    // test membership, and it correctly resolves transitive/dynamic groups too.
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/checkMemberGroups`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groupIds: [helpDeskGroupId] }),
      }
    );

    if (!res.ok) {
      console.error(`❌ [ADMIN CHECK] Failed to check group membership:`, await res.text());
      return false;
    }

    const data = await res.json();
    const isAdmin = Array.isArray(data.value) && data.value.includes(helpDeskGroupId);
    
    console.log(`🔍 [ADMIN CHECK] User ${email} is ${isAdmin ? '' : 'NOT '}an admin`);
    return isAdmin;

  } catch (err) {
    console.error('❌ [ADMIN CHECK] Error:', err.message);
    return false;
  }
};

// ===================== AZURE AD USER CREATION =====================

const createAzureUser = async (userData) => {
  console.log(`🔵 [CREATE USER] Creating user: ${userData.userPrincipalName}`);
  
  const token = await getAccessToken();
  
  // Standard user creation payload - only fields supported by POST /users
  const userPayload = {
    accountEnabled: true,
    displayName: userData.displayName,
    mailNickname: userData.emailPrefix.split('@')[0],
    userPrincipalName: userData.userPrincipalName,
    passwordProfile: {
      forceChangePasswordNextSignIn: true,
      password: userData.initialPassword || generateTempPassword(),
    },
    givenName: userData.firstName,
    surname: userData.lastName,
    jobTitle: userData.jobTitle || '',
    department: userData.department || '',
    mobilePhone: userData.phoneNumber || '',
    preferredLanguage: 'en-US',
  };

  // ✅ Only include employeeId (this IS supported in POST)
  if (userData.employeeId) userPayload.employeeId = userData.employeeId;

  console.log('🔎 [CREATE USER] Payload being sent to Graph:', JSON.stringify(userPayload, null, 2));

  // Step 1: Create the user
  const url = `https://graph.microsoft.com/v1.0/users`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userPayload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('❌ [CREATE USER] Failed:', errorText);
    throw new Error(`Azure user creation failed: ${errorText}`);
  }

  const data = await res.json();
  console.log(`✅ [CREATE USER] Created: ${data.userPrincipalName} (${data.id})`);

  // Step 2: Update extended properties (only if they exist)
  const extendedProperties = {};
  
  // These fields need to be set via PATCH after creation
  if (userData.employeeType) extendedProperties.employeeType = userData.employeeType;
  if (userData.officeLocation) extendedProperties.officeLocation = userData.officeLocation;
  if (userData.streetAddress) extendedProperties.streetAddress = userData.streetAddress;
  if (userData.city) extendedProperties.city = userData.city;
  if (userData.state) extendedProperties.state = userData.state;

  if (Object.keys(extendedProperties).length > 0) {
    console.log('🔎 [CREATE USER] Updating extended properties:', JSON.stringify(extendedProperties, null, 2));
    
    try {
      const patchUrl = `https://graph.microsoft.com/v1.0/users/${data.id}`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(extendedProperties),
      });

      if (!patchRes.ok) {
        const errorText = await patchRes.text();
        console.warn('⚠️ [CREATE USER] Extended properties update failed:', errorText);
        // Note: We don't throw here because the user was created successfully
        data.extendedPropertiesUpdated = false;
        data.extendedPropertiesError = errorText;
      } else {
        console.log('✅ [CREATE USER] Extended properties updated successfully');
        data.extendedPropertiesUpdated = true;
      }
    } catch (patchErr) {
      console.warn('⚠️ [CREATE USER] Extended properties update error:', patchErr.message);
      data.extendedPropertiesUpdated = false;
      data.extendedPropertiesError = patchErr.message;
    }
  }

  // Step 3: Set the manager if provided
  const managerId = userData.managerId;
  const managerEmail = userData.managerEmail;

  if (managerId || managerEmail) {
    try {
      let resolvedManagerId = managerId;

      if (!resolvedManagerId && managerEmail) {
        console.log(`🔵 [CREATE USER] Looking up manager by email: ${managerEmail}`);
        const managerUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(managerEmail)}?$select=id`;
        const managerRes = await fetch(managerUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (managerRes.ok) {
          const managerData = await managerRes.json();
          resolvedManagerId = managerData.id;
        } else {
          console.warn(`⚠️ [CREATE USER] Could not find manager user: ${managerEmail}`);
        }
      }

      if (resolvedManagerId) {
        console.log(`🔵 [CREATE USER] Setting manager to id: ${resolvedManagerId}`);
        const setManagerUrl = `https://graph.microsoft.com/v1.0/users/${data.id}/manager/$ref`;
        const setManagerRes = await fetch(setManagerUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            '@odata.id': `https://graph.microsoft.com/v1.0/users/${resolvedManagerId}`
          }),
        });

        if (setManagerRes.status === 204 || setManagerRes.status === 201) {
          console.log('✅ [CREATE USER] Manager set successfully');
          data.managerSet = true;
        } else {
          const errorText = await setManagerRes.text();
          console.warn(`⚠️ [CREATE USER] Could not set manager (status: ${setManagerRes.status}):`, errorText);
          data.managerSet = false;
        }
      }
    } catch (managerErr) {
      console.warn(`⚠️ [CREATE USER] Error setting manager:`, managerErr.message);
      data.managerSet = false;
    }
  } else {
    console.log('ℹ️ [CREATE USER] No manager id/email provided, skipping manager assignment');
    data.managerSet = false;
  }

  return data;
};

const generateTempPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password + 'A1!'; // Ensure complexity
};

// Add user to multiple groups
// `groups` is expected as an array of { id, name } objects (as stored on the
// Onboarding document). For backward compatibility, plain strings are also
// accepted and treated as a group displayName that needs to be looked up.
const addUserToGroups = async (userId, groups) => {
  console.log(`🔵 [ADD TO GROUPS] Adding user ${userId} to groups:`, groups?.map(g => g?.name || g));

  const token = await getAccessToken();
  const results = [];

  // Only fetch the full group list if we have legacy string entries that
  // need a displayName -> id lookup. Objects with an id skip this entirely.
  const needsLookup = (groups || []).some(g => typeof g === 'string' || !g?.id);
  let allGroups = [];
  if (needsLookup) {
    try {
      const url = `https://graph.microsoft.com/v1.0/groups?$select=id,displayName&$top=100`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        allGroups = data.value || [];
      }
    } catch (err) {
      console.error('❌ [ADD TO GROUPS] Failed to fetch groups:', err.message);
    }
  }

  for (const entry of (groups || [])) {
    const isLegacyString = typeof entry === 'string';
    let groupId = isLegacyString ? null : entry?.id;
    let groupName = isLegacyString ? entry : (entry?.name || entry?.id);

    if (!groupId) {
      const match = allGroups.find(g => g.displayName.toLowerCase() === (groupName || '').toLowerCase());
      if (!match) {
        console.log(`⚠️ [ADD TO GROUPS] Group not found: ${groupName}`);
        results.push({ group: groupName, success: false, error: 'Group not found' });
        continue;
      }
      groupId = match.id;
    }

    try {
      const url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members/$ref`;
      const body = {
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.status === 204 || res.status === 201) {
        console.log(`✅ [ADD TO GROUPS] Added to: ${groupName}`);
        results.push({ group: groupName, success: true });
      } else {
        const errorText = await res.text();
        console.log(`⚠️ [ADD TO GROUPS] Failed for ${groupName}:`, errorText);
        results.push({ group: groupName, success: false, error: errorText });
      }
    } catch (err) {
      console.error(`❌ [ADD TO GROUPS] Error for ${groupName}:`, err.message);
      results.push({ group: groupName, success: false, error: err.message });
    }
  }

  return results;
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

// A dedicated, higher-polish template for the "Welcome to the Team" email new
// hires receive. Distinct from buildHtmlEmail (which is the plain
// notification/ticket template) because this one is meant to make a strong
// first impression: gradient hero, avatar initials, a proper credentials
// card, and a getting-started checklist instead of a generic field table.
//
// LOGO_URL must be a publicly reachable absolute URL — email clients fetch
// images over HTTP, they cannot read a path out of the React app's src/
// folder (that file gets bundled/hashed by webpack and was never served at
// a stable URL to begin with). The backend serves the logo itself via the
// dedicated /static/sandeza.jpg route above, so this points at this same
// server.

const buildWelcomeEmail = ({
  firstName = '',
  lastName = '',
  jobTitle = '',
  department = '',
  email = '',
  password = '',
  groups = '',
  messageBody = '',
  signInLink = 'https://outlook.office.com',
}) => {
  const fullName = `${firstName} ${lastName}`.trim() || 'there';

  const messageHtml = (messageBody || '')
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 14px; color:#334155; font-size:15px; line-height:1.7; white-space:pre-wrap;">${p}</p>`)
    .join('');

  const detailRow = (label, value) => value ? `
    <tr>
      <td style="padding:10px 0; border-bottom:1px solid #eef2f7; color:#64748b; font-size:13px; font-weight:600; width:150px; vertical-align:top;">${label}</td>
      <td style="padding:10px 0; border-bottom:1px solid #eef2f7; color:#0f172a; font-size:14px; font-weight:600; vertical-align:top;">${value}</td>
    </tr>` : '';

  // NOTE: still uses border-radius:50% for the checkmark bullets — Outlook
  // desktop will render these as plain squares instead of circles. Not
  // fixed here since it wasn't reported as an issue, but the same
  // "no CSS shape support in Outlook" limitation applies to these too.
  const checklistItem = (text) => `
    <tr>
      <td style="padding:6px 0; vertical-align:top; width:26px;">
        <div style="width:20px; height:20px; border-radius:50%; background:#ecfdf5; color:#16a34a; font-size:12px; font-weight:800; text-align:center; line-height:20px;">✓</div>
      </td>
      <td style="padding:6px 0 6px 10px; color:#334155; font-size:14px; line-height:1.5;">${text}</td>
    </tr>`;

  return `
  <html>
  <body style="font-family: Inter, Roboto, Arial, sans-serif; color:#0f172a; margin:0; padding:0; background:#eef2f7;">
    <table role="presentation" width="100%" style="background:#eef2f7; padding:36px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(2,6,23,0.12);">

            <!-- Hero -->
            <!--
              Outlook desktop (Windows) renders HTML email with Word's engine,
              not a browser engine — it does not understand CSS
              'linear-gradient()'. Gmail/Apple Mail/etc use a real rendering
              engine so the gradient shows fine there, which is why this only
              breaks in Outlook specifically.

              Fix: 'bgcolor' is a plain HTML attribute (not CSS), which Word's
              engine DOES understand, so it's used here as a solid-color
              fallback. The MSO conditional VML block on top of it recreates
              an actual gradient for Outlook using VML, which Word's engine
              also understands. Non-Outlook clients ignore both the
              conditional comment and the bgcolor attribute (the CSS gradient
              simply wins), so nothing changes for Gmail/Apple Mail/etc.
            -->
            <tr>
              <td bgcolor="#002060" style="background:linear-gradient(135deg,#002060 0%,#0a3d9e 55%,#7c3aed 100%); padding:0;">
                <!--[if mso]>
                <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
                <v:fill type="gradient" angle="135" color="#002060" color2="#7c3aed" />
                <v:textbox inset="0,0,0,0">
                <![endif]-->
                <div style="padding:40px 32px 32px; text-align:center;">
                  <img src="${LOGO_URL}" alt="Sandeza" width="72" style="display:block; margin:0 auto 18px; max-width:72px; height:auto; border:0;" />
                  <div style="color:#c7d2fe; font-size:13px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px;">Welcome to Sandeza</div>
                  <h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:800;">🎉 Welcome , ${firstName} ${lastName}!</h1>
                  <p style="margin:10px 0 0; color:#e0e7ff; font-size:14.5px;">We're thrilled to have you join the team${jobTitle ? ` as ${jobTitle}` : ''}${department ? ` in ${department}` : ''}.</p>
                </div>
                <!--[if mso]>
                </v:textbox>
                </v:rect>
                <![endif]-->
              </td>
            </tr>

            <!-- Message -->
            <tr>
              <td style="padding:32px 32px 8px;">
                ${messageHtml || `<p style="margin:0 0 14px; color:#334155; font-size:15px; line-height:1.7;">Dear ${fullName}, welcome to the team! Your account has been created and is ready to go.</p>`}
              </td>
            </tr>

            <!-- Credentials card -->
            <tr>
              <td style="padding:8px 32px 0;">
                <table role="presentation" width="100%" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <div style="font-size:12px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#7c3aed; margin-bottom:14px;">🔐 Your Account Details</div>
                      <table role="presentation" width="100%">
                        ${detailRow('Full Name', fullName)}
                        ${detailRow('Work Email', email)}
                        ${detailRow('Password', `<span style="font-family:'Courier New',monospace; background:#fef3c7; padding:4px 10px; border-radius:6px; letter-spacing:0.5px;">${password}</span>`)}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:26px 32px 6px; text-align:center;">
                <a href="${signInLink}" style="display:inline-block; background:#002060; color:#ffffff; padding:14px 36px; border-radius:10px; text-decoration:none; font-weight:800; font-size:15px; box-shadow:0 10px 20px rgba(0,32,96,0.25);">Sign In to Your Account →</a>
                <div style="margin-top:10px; color:#94a3b8; font-size:12.5px;">You'll be asked to set a new password on first sign-in.</div>
              </td>
            </tr>

            <!-- Checklist -->
            <tr>
              <td style="padding:28px 32px 8px;">
                <div style="font-size:12px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#64748b; margin-bottom:12px;">Getting Started Checklist</div>
                <table role="presentation" width="100%">
                  ${checklistItem(`Sign in at <strong>outlook.office.com</strong> with your work email and temporary password`)}
                  ${checklistItem(`Set a new, strong password when prompted`)}
                  ${checklistItem(`Set up multi-factor authentication (MFA) using the Microsoft Authenticator app`)}
                  ${checklistItem(`Explore your email and Microsoft 365 apps`)}
                  ${checklistItem(`Reach out to IT Support any time you need a hand`)}
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px 8px;">
                <p style="margin:0; color:#94a3b8; font-size:12.5px; text-align:center;">This is an auto-generated email. Please do not reply directly to this message.</p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px; background:#0f172a; font-size:12px; color:#94a3b8; text-align:center;">
                Sandeza Helpdesk · IT Support · We're glad you're here 💙
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
    const validAddresses = addresses.filter(addr => {
      if (!addr || typeof addr !== "string") return false;

      const clean = addr.trim().toLowerCase();

      // reject UUIDs / IDs
      if (!clean.includes("@")) return false;

      // basic email validation
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
    });
    
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
        toRecipients: normalize([...new Set(validAddresses)]),
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

  if (request.raisedBy?.mail) recipients.add(request.raisedBy.mail);
  if (request.assignedMember?.memberEmail) recipients.add(request.assignedMember.memberEmail);

  const groupId = request.assignmentGroup?.groupId;
  const groupName = request.assignmentGroup?.groupName;
  if (groupId || groupName) {
    try {
      const fullGroup = groupId
        ? await AssignmentGroup.findById(groupId)
        : await AssignmentGroup.findOne({ name: groupName });

      // ✅ ADD THIS
      console.log(`🔍 [RECIPIENTS] Group found: ${fullGroup?.name}, members:`, JSON.stringify(fullGroup?.members));

      if (fullGroup?.members) {
        for (const m of fullGroup.members) {
          const email = m.email || m.mail;
          // ✅ ADD THIS
          console.log(`🔍 [RECIPIENTS] Member: ${m.name}, email field: "${m.email}", mail field: "${m.mail}", resolved: "${email}"`);
          if (email) recipients.add(email);
        }
      }
    } catch (err) {
      console.error("Failed live group lookup, falling back to snapshot:", err.message);
      for (const m of (request.assignmentGroup?.members || [])) {
        const email = m.email || m.mail;
        if (email) recipients.add(email);
      }
    }
  }

  // ✅ ADD THIS
  console.log(`🔍 [RECIPIENTS] Final list (${recipients.size}):`, Array.from(recipients));

  if (request.service?.id) {
    try {
      const service = await Service.findById(request.service.id);
      if (service?.dlGroupMembers) {
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
  const newPassword = Math.random().toString(15).slice(-10) + "A1!";
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
  
  // ✅ ADDED: Top-level fields for onboarding to display in list views
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  userPrincipalName: { type: String, default: '' },
  emailPrefix: { type: String, default: '' },
  jobTitle: { type: String, default: '' },
  department: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
  personalEmail: { type: String, default: '' },
  workLocation: { type: String, default: 'remote' },
  startDate: Date,
  gender: { type: String, default: '' },
  reportingTo: {
    id: { type: String, default: '' },
    name: { type: String, default: '' },
    email: { type: String, default: '' }
  },
  
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
  status: { type: String, enum: ["open", "in_progress", "pending_approval", "resolved","rejected","closed", "cancelled", "processing", "completed", "failed"], default: "open" },
  priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  pwOnBehalf: { type: String, enum: ['Self', 'Other'], default: 'Self' },
  pwTargetEmail: { type: String, default: '' },
  pwDeliveryEmail: { type: String, default: '' },
  resolvedAt: Date,
  closedAt: Date,
  notes: String,
  updatedBy: { id: String, name: String, mail: String },
  history: [{ action: String, by: String, at: Date, newStatus: String, oldStatus: String, reason: String, notes: String }],

  // ✅ Top-level approval-tracking fields used by the onboarding approve/reject
  // flow (previously written by the code but missing from the schema, so
  // Mongoose's strict mode silently dropped them before save).
  approvers: [{ id: String, name: String, email: String, mail: String, hasApproved: { type: Boolean, default: false }, approvedAt: Date }],
  approver1: { type: String, default: '' },
  approver2: { type: String, default: '' },
  approvalType: { type: String, enum: ['either', 'both'], default: 'either' },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { id: String, name: String, email: String },
  approvedAt: Date,
  rejectionReason: String,
  createdBy: { id: String, name: String, email: String },
  createdByName: { type: String, default: '' },
  createdByEmail: { type: String, default: '' },

  // ===== ONBOARDING-SPECIFIC DATA =====
  // Only populated when service.categoryName === 'Onboarding'. Kept as a
  // sub-object (rather than a separate collection) so onboarding requests
  // are real Request documents: they show up in the normal requests list,
  // get REQ/HRQ numbering from the same sequence logic, and render through
  // the same RequestDetails-style card.
  onboarding: {
    firstName: String,
    lastName: String,
    emailPrefix: String,
    jobTitle: String,
    department: String,
    employeeId: String,
    phoneNumber: { type: String, default: '' },
    startDate: Date,
    workLocation: { type: String, enum: ['remote', 'hybrid', 'office'], default: 'remote' },
    additionalNotes: { type: String, default: '' },
    personalEmail: String, // Personal email entered in the form (welcome mail destination)
    userPrincipalName: String,
    displayName: String,
    initialPassword: String,
    selectedGroups: [{ id: String, name: String }], // Azure AD group id + display name
    approvalRule: { type: String, enum: ['any', 'all'], default: 'any' },
    azureUserId: String,
    azureUserCreated: { type: Boolean, default: false },
    groupsAdded: [String],
    rejectionReason: String,
    gender: String,
    reportingTo: {
      id: String,
      name: String,
      email: String
    },
    approvers: [{ id: String, name: String, email: String, mail: String, hasApproved: { type: Boolean, default: false }, approvedAt: Date }],
  },
}, { timestamps: true });

requestSchema.pre("save", async function (next) {
  if (this.isNew) {
    this.requestNumber = undefined;
  }
  if (!this.requestNumber) {
    // Onboarding requests get an "HRQ-" prefix; everything else keeps "REQ-".
    const isOnboarding = this.service?.categoryName === 'Onboarding';
    const prefix = isOnboarding ? 'HRQ' : 'REQ';
    const RequestModel = mongoose.model("Request");
    let attempt = 0;
    while (attempt < 5) {
      const last = await RequestModel
        .findOne({ requestNumber: { $regex: new RegExp(`^${prefix}-\\d+$`) } })
        .sort({ requestNumber: -1 })
        .collation({ locale: "en_US", numericOrdering: true })
        .select("requestNumber")
        .lean();
      const lastNum = last?.requestNumber ? parseInt(last.requestNumber.replace(`${prefix}-`, ''), 10) : 0;
      const candidate = `${prefix}-${String(lastNum + 1).padStart(4, "0")}`;
      const exists = await RequestModel.exists({ requestNumber: candidate });
      if (!exists) {
        this.requestNumber = candidate;
        break;
      }
      attempt++;
    }
    if (!this.requestNumber) {
      // Extremely unlikely fallback to avoid ever failing a save
      this.requestNumber = `${prefix}-${Date.now()}`;
    }
  }
  next();
});

const Request = mongoose.model("Request", requestSchema);

// ===================== HR REQUEST SCHEMA (dedicated collection) =====================
// HR/Onboarding requests get their own collection ("hrrequests") instead of
// living inside the shared "requests" collection. Same field shape as
// requestSchema (cloned below) so all existing onboarding logic keeps working.
const hrRequestDocSchema = new mongoose.Schema(requestSchema.obj, { 
  timestamps: true,
  strict: false  // ✅ Allow saving onboarding fields even if not in schema
});

hrRequestDocSchema.pre("save", async function (next) {
  if (this.isNew) {
    this.requestNumber = undefined;
  }
  if (!this.requestNumber) {
    const prefix = 'HRQ';
    const HrRequestModel = mongoose.model("HrRequest");
    const OffboardingModel = mongoose.model("OffboardingRequest");
    let attempt = 0;
    while (attempt < 5) {
      // Check HrRequest collection
      const lastHr = await HrRequestModel
        .findOne({ requestNumber: { $regex: new RegExp(`^${prefix}-\\d+$`) } })
        .sort({ requestNumber: -1 })
        .collation({ locale: "en_US", numericOrdering: true })
        .select("requestNumber")
        .lean();
      
      // Check OffboardingRequest collection
      const lastOffboarding = await OffboardingModel
        .findOne({ requestNumber: { $regex: new RegExp(`^${prefix}-\\d+$`) } })
        .sort({ requestNumber: -1 })
        .collation({ locale: "en_US", numericOrdering: true })
        .select("requestNumber")
        .lean();
      
      let highestNum = 0;
      if (lastHr?.requestNumber) {
        const num = parseInt(lastHr.requestNumber.replace(`${prefix}-`, ''), 10);
        if (num > highestNum) highestNum = num;
      }
      if (lastOffboarding?.requestNumber) {
        const num = parseInt(lastOffboarding.requestNumber.replace(`${prefix}-`, ''), 10);
        if (num > highestNum) highestNum = num;
      }
      
      const candidate = `${prefix}-${String(highestNum + 1).padStart(4, "0")}`;
      
      // Check if candidate exists in EITHER collection
      const existsInHr = await HrRequestModel.exists({ requestNumber: candidate });
      const existsInOffboarding = await OffboardingModel.exists({ requestNumber: candidate });
      
      if (!existsInHr && !existsInOffboarding) {
        this.requestNumber = candidate;
        break;
      }
      attempt++;
    }
    if (!this.requestNumber) {
      this.requestNumber = `${prefix}-${Date.now()}`;
    }
  }
  next();
});

const HrRequest = mongoose.model("HrRequest", hrRequestDocSchema, "hrrequests");

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

// POST /api/check-admin - Check if user is an admin
app.post('/api/check-admin', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const isAdmin = await checkIfUserIsAdmin(email);
    return res.json({ isAdmin });
  } catch (err) {
    console.error('❌ [CHECK-ADMIN] Error:', err.message);
    return res.status(500).json({ error: 'Failed to check admin status' });
  }
});

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

// POST /api/requests - CREATE with AUTO-APPROVAL for admins
app.post("/api/requests", async (req, res) => {
  try {
    const {
      service, assignmentGroup, assignedMember, raisedBy, onBehalf,
      description, attachments, approval, priority,
      pwOnBehalf, pwTargetEmail, pwTargetName, pwDeliveryEmail
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

    // ✅ CHECK IF REQUESTER IS AN ADMIN (from Azure AD Helpdesk_Admin group)
    const isAdmin = await checkIfUserIsAdmin(raisedBy.mail);
    
    // ✅ Check if this is a password reset or admin access request
    const isPasswordReset = service?.name?.toLowerCase().includes("password reset");
    const isAdminAccess = service?.name?.toLowerCase().includes("admin access") || 
                          service?.name?.toLowerCase().includes("device admin");
    
    // ✅ AUTO-APPROVE if admin and (password reset OR admin access)
    const isAutoApproved = isAdmin && (isPasswordReset || isAdminAccess);

    // Determine initial status
    let initialStatus = "open";
    if (approval?.required && !isAutoApproved) {
      initialStatus = "pending_approval";
    } else if (isAutoApproved) {
      initialStatus = "processing";
    }

    const request = new Request({
      service,
      assignmentGroup: finalAssignmentGroup,
      assignedMember: finalAssignedMember,
      raisedBy,
      onBehalf: onBehalf || { enabled: false },
      description: description || "",
      attachments: Array.isArray(attachments) ? attachments : [],
      approval: {
        required: approval?.required || false,
        status: isAutoApproved ? 'approved' : (approval?.status || 'pending'),
        approvedBy: isAutoApproved ? { id: raisedBy.id, name: raisedBy.name, email: raisedBy.mail } : null,
        approvedAt: isAutoApproved ? new Date() : null,
      },
      priority: priority || "medium",
      pwOnBehalf: pwOnBehalf || 'Self',
      pwTargetName: pwTargetName || '',
      pwTargetEmail: pwTargetEmail || '',
      pwDeliveryEmail: pwDeliveryEmail || '',
      status: initialStatus,
      history: [{ 
        action: isAutoApproved ? 'auto_approved' : 'created', 
        by: raisedBy?.name || raisedBy?.mail || 'System', 
        at: new Date(),
        notes: isAutoApproved ? 'Auto-approved by admin' : 'Request created'
      }]
    });

    await request.save();
    console.log("✅ [CREATE REQUEST] Saved:", request.requestNumber);
    if (isAutoApproved) {
      console.log(`🔄 [AUTO-APPROVE] ${isPasswordReset ? 'Password reset' : 'Admin access'} auto-approved for admin: ${raisedBy.mail}`);
    }
    res.status(201).json(request);

    // ==========================================
    // IF AUTO-APPROVED, PROCESS IMMEDIATELY
    // ==========================================
    if (isAutoApproved) {
      setImmediate(async () => {
        try {
          if (isPasswordReset) {
            // Auto-approve password reset
            const targetEmail = (pwOnBehalf === 'Other' && pwTargetEmail?.trim())
              ? pwTargetEmail.trim()
              : raisedBy.mail;

            if (targetEmail) {
              const tempPassword = await resetAzurePassword(targetEmail);
              
              // Update request status
              request.status = "resolved";
              request.resolvedAt = new Date();
              request.history.push({
                action: 'resolved',
                by: 'System (Auto-Approved)',
                at: new Date(),
                notes: `Password reset auto-approved by admin. Temporary password sent to ${pwDeliveryEmail || targetEmail}.`
              });
              await request.save();

              // Send password to delivery email
              const deliveryEmail = pwDeliveryEmail?.trim() || targetEmail;
              const passwordHtml = buildHtmlEmail({
                title: `🔑 Your Temporary Password (Auto-Approved)`,
                subtitle: `Password reset for ${targetEmail} has been auto-approved by admin`,
                statusColor: "#16a34a",
                fields: [
                  { label: "Request No.", value: request.requestNumber },
                  { label: "Account", value: targetEmail },
                  { label: "Temporary Password", value: `<strong style="font-size:16px; background:#fef3c7; padding:4px 8px; border-radius:4px;">${tempPassword}</strong>` },
                  { label: "Auto-Approved By", value: raisedBy?.name || raisedBy?.mail },
                  { label: "Approved At", value: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) },
                ],
                description: `This password reset was auto-approved by admin. Please sign in using this temporary password.`,
                actionLink: `https://outlook.office.com`,
                actionText: "Sign In",
              });
              await sendEmail(deliveryEmail, `[PASSWORD RESET] Your temporary password — ${request.requestNumber}`, passwordHtml);

              // Notify requester (admin) that it was auto-approved
              if (raisedBy.mail && raisedBy.mail !== deliveryEmail) {
                const notifyHtml = buildHtmlEmail({
                  title: `✅ Password Reset Auto-Approved: ${request.requestNumber}`,
                  subtitle: `The password reset was auto-approved by admin`,
                  statusColor: "#16a34a",
                  fields: [
                    { label: "Request No.", value: request.requestNumber },
                    { label: "Action", value: "AUTO-APPROVED" },
                    { label: "Reset For", value: targetEmail },
                    { label: "Delivery Email", value: deliveryEmail },
                    { label: "Auto-Approved By", value: raisedBy?.name || raisedBy?.mail },
                    { label: "Approved At", value: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) },
                  ],
                  description: `The password reset was auto-approved because you are an admin.`,
                  actionLink: `${process.env.PROD_URL}/requests/${request._id}`,
                  actionText: "View Request",
                });
                await sendEmail(raisedBy.mail, `[PASSWORD RESET] ${request.requestNumber} — Auto-Approved`, notifyHtml);
              }
            }
          } 
          else if (isAdminAccess) {
            // Auto-approve admin access
            const targetEmail = raisedBy?.mail;
            if (targetEmail) {
              let userObjectId;
              try {
                const userData = await getUserByUpn(targetEmail);
                userObjectId = userData.id;
              } catch (userErr) {
                console.error('❌ Failed to verify user:', userErr.message);
                return;
              }

              const groupId = process.env.AZURE_DEVICE_ADMIN_GROUP_ID;
              if (groupId) {
                try {
                  await addUserToGroup(groupId, userObjectId);
                  
                  // Update request status
                  request.status = "resolved";
                  request.resolvedAt = new Date();
                  request.history.push({
                    action: 'resolved',
                    by: 'System (Auto-Approved)',
                    at: new Date(),
                    notes: `Admin access auto-approved by admin. User added to Device Admin Group.`
                  });
                  await request.save();

                  // Notify requester (admin) that it was auto-approved
                  const notifyHtml = buildHtmlEmail({
                    title: `👑 Admin Access Auto-Approved: ${request.requestNumber}`,
                    subtitle: `Admin access was auto-approved by admin`,
                    statusColor: "#16a34a",
                    fields: [
                      { label: "Request No.", value: request.requestNumber },
                      { label: "Action", value: "AUTO-APPROVED" },
                      { label: "User Granted Access", value: `${raisedBy?.name || ''} (${targetEmail})` },
                      { label: "Auto-Approved By", value: raisedBy?.name || raisedBy?.mail },
                      { label: "Approved At", value: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) },
                    ],
                    description: `Admin access was auto-approved because you are an admin.`,
                    actionLink: `${process.env.PROD_URL}/requests/${request._id}`,
                    actionText: "View Request",
                  });
                  await sendEmail(raisedBy.mail, `[ADMIN ACCESS] ${request.requestNumber} — Auto-Approved`, notifyHtml);

                } catch (groupErr) {
                  console.error('❌ Failed to add to admin group:', groupErr.message);
                }
              }
            }
          }
        } catch (err) {
          console.error(`❌ [AUTO-APPROVE] Processing error:`, err.message);
          request.status = "failed";
          request.history.push({
            action: 'failed',
            by: 'System',
            at: new Date(),
            notes: `Auto-approval processing failed: ${err.message}`
          });
          await request.save();
        }
      });
    }

    // ==========================================
    // SEND EMAIL NOTIFICATIONS (for both auto and manual)
    // ==========================================
    setImmediate(async () => {
      try {
        const allRecipients = await getAllRequestRecipients(request);
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

        let title = `📋 New Request: ${request.requestNumber}`;
        let subtitle = `${service?.name || 'Request'} has been submitted`;

        if (isPasswordReset) {
          title = isAutoApproved ? `🔑 Password Reset Auto-Approved: ${request.requestNumber}` : `🔑 Password Reset Request: ${request.requestNumber}`;
        }
        if (isAdminAccess) {
          title = isAutoApproved ? `👑 Admin Access Auto-Approved: ${request.requestNumber}` : `👑 Admin Access Request: ${request.requestNumber}`;
        }

        const fields = [
          { label: "Request No.", value: request.requestNumber },
          { label: "Service", value: service?.name || "—" },
          { label: "Requested By", value: `${raisedBy?.name || raisedBy?.mail}` },
          { label: "Status", value: isAutoApproved ? 'AUTO-APPROVED' : initialStatus.toUpperCase() },
          { label: "Priority", value: priority || "medium" },
          { label: "Submitted At", value: nowIST },
        ];

        if (isPasswordReset && pwOnBehalf === 'Other' && pwTargetEmail) {
          fields.push({ label: "Reset For", value: pwTargetEmail });
        }
        if (isPasswordReset && pwDeliveryEmail) {
          fields.push({ label: "Delivery Email", value: pwDeliveryEmail });
        }
        if (isAutoApproved) {
          fields.push({ label: "Auto-Approved By", value: raisedBy?.name || raisedBy?.mail });
        }

        const html = buildHtmlEmail({
          title,
          subtitle,
          statusColor: isAutoApproved ? "#16a34a" : (isPasswordReset ? "#d97706" : (isAdminAccess ? "#7c3aed" : "#0369a1")),
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
    const {
      status,
      assignedMember,
      assignmentGroup,
      originalAssignmentGroupId,
      originalGroupMembers,
      notes,
      updatedBy,
      priority,
    } = req.body;

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const oldStatus = request.status;
    const oldPriority = request.priority;

    if (status) request.status = status;
    if (priority) request.priority = priority;

    // Handle assignedMember — allow explicit null to unassign
    if (Object.prototype.hasOwnProperty.call(req.body, "assignedMember")) {
      request.assignedMember = assignedMember ?? null;
    }

    // Handle assignmentGroup reassignment
    if (assignmentGroup) {
      request.assignmentGroup = assignmentGroup;
    }

    // Persist original group info for view-only access logic
    if (originalAssignmentGroupId) {
      request.originalAssignmentGroupId = originalAssignmentGroupId;
    }
    if (originalGroupMembers) {
      request.originalGroupMembers = originalGroupMembers;
    }

    if (notes) request.notes = notes;
    if (updatedBy) request.updatedBy = updatedBy;

    if (status === "resolved") request.resolvedAt = new Date();
    if (status === "closed") request.closedAt = new Date();

    request.history = request.history || [];

    // Status change history
    if (status && status !== oldStatus) {
      request.history.push({
        action: "status_updated",
        by: updatedBy?.name || updatedBy?.mail || "System",
        at: new Date(),
        oldStatus,
        newStatus: status,
        notes: notes || `Status changed from ${oldStatus} to ${status}`,
      });
    }
    if (status === "resolved" && oldStatus !== "resolved") {
      request.history.push({ action: "resolved", by: updatedBy?.name || "System", at: new Date() });
    }
    if (status === "closed" && oldStatus !== "closed") {
      request.history.push({ action: "closed", by: updatedBy?.name || "System", at: new Date() });
    }

    // Assignment history
    if (Object.prototype.hasOwnProperty.call(req.body, "assignedMember")) {
      if (!assignedMember) {
        // Unassign
        request.history.push({
          action: "assigned",
          by: updatedBy?.name || updatedBy?.mail || "System",
          at: new Date(),
          notes: notes || `Assignment removed by ${updatedBy?.name || "System"}`,
        });
      } else {
        // Assign to member
        request.history.push({
          action: "assigned",
          by: updatedBy?.name || updatedBy?.mail || "System",
          at: new Date(),
          notes: notes || `Assigned to ${assignedMember.memberName || assignedMember.memberEmail || "a member"}`,
        });
      }
    }

    // Group reassignment history
    if (assignmentGroup) {
      request.history.push({
        action: "assigned",
        by: updatedBy?.name || updatedBy?.mail || "System",
        at: new Date(),
        notes: notes || `Reassigned to group "${assignmentGroup.groupName || assignmentGroup.name}"`,
      });
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
            open: "#0369a1",
            in_progress: "#d97706",
            pending_approval: "#7c3aed",
            resolved: "#16a34a",
            closed: "#6b7280",
            cancelled: "#dc2626",
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

          await sendEmail(
            allRecipients,
            `[REQUEST] ${request.requestNumber} — Status: ${status.toUpperCase()}`,
            html
          );
          console.log(`✅ [REQUEST] STATUS UPDATE notifications sent to ${allRecipients.length} recipients`);
        } catch (mailErr) {
          console.error("❌ [REQUEST] Status notification error:", mailErr.message);
        }
      });
    }

    // Send assignment notification (fire-and-forget)
    if (Object.prototype.hasOwnProperty.call(req.body, "assignedMember") && assignedMember?.memberEmail) {
      setImmediate(async () => {
        try {
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          const html = buildHtmlEmail({
            title: `Request ${request.requestNumber} — Assigned to You`,
            subtitle: `You have been assigned to this request`,
            statusColor: "#002060",
            fields: [
              { label: "Request No.", value: request.requestNumber },
              { label: "Service", value: request.service?.name },
              { label: "Assigned By", value: updatedBy?.name || "Admin" },
              { label: "Assigned At", value: nowIST },
            ],
            description: notes || "",
            actionLink: `${prodUrl}/requests/${request._id}`,
            actionText: "View Request",
          });
          await sendEmail(
            [assignedMember.memberEmail],
            `[REQUEST] ${request.requestNumber} — Assigned to You`,
            html
          );
          console.log(`✅ [REQUEST] Assignment notification sent to ${assignedMember.memberEmail}`);
        } catch (mailErr) {
          console.error("❌ [REQUEST] Assignment notification error:", mailErr.message);
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

// PATCH /api/incidents/:id - UPDATE STATUS with FULL email notifications (FIXED)
app.patch("/api/incidents/:id", async (req, res) => {
  try {
    const { status, assignedMember, assignmentGroup, notes, updatedBy, priority } = req.body;

    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: "Incident not found" });

    console.log("📥 [PATCH] Received update:", { status, assignedMember, assignmentGroup, notes, updatedBy, priority });

    if (status) incident.status = status;
    if (priority) incident.priority = priority;
    
    // ✅ FIX: Handle assignedMember properly - including null
    if (assignedMember !== undefined) {
      // If assignedMember is null, remove it
      if (assignedMember === null) {
        incident.assignedMember = null;
        console.log("🔍 [PATCH] Setting assignedMember to null");
      } else {
        incident.assignedMember = assignedMember;
        console.log("🔍 [PATCH] Setting assignedMember to:", assignedMember);
      }
    }
    
    if (assignmentGroup) incident.assignmentGroup = assignmentGroup;
    if (notes) incident.notes = notes;
    if (updatedBy) incident.updatedBy = updatedBy;

    if (status === "resolved") incident.resolvedAt = new Date();
    if (status === "closed") incident.closedAt = new Date();

    await incident.save();
    console.log("✅ [UPDATE INCIDENT]", incident.incidentNumber, "→", status || "updated");
    console.log("📤 [PATCH] Updated incident assignedMember:", incident.assignedMember);
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
            actionLink: `https://outlook.office.com`,
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

        // ✅ FIXED: Always include the person who rejected
        if (actorEmail && !allRecipients.map(e => e.toLowerCase()).includes(actorEmail.toLowerCase())) {
          allRecipients.push(actorEmail);
        }
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

    const fetchPromises = ids.map((id, i) => (async () => {
      try {
        const driveId = driveIds.length > i ? driveIds[i] : null;
        const fetched = await Promise.race([fetchItemStream(token, id, driveId), new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${id}`)), 15000))]);
        let filename = id.slice(-10);
        const dispMatch = /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(fetched.contentDisposition || '');
        if (dispMatch && dispMatch[1]) { try { filename = decodeURIComponent(dispMatch[1]); } catch (e) { filename = dispMatch[1]; } }
        archive.append(fetched.stream, { name: filename });
      } catch (err) { console.warn(`⚠️ Skip ${id}:`, err.message); }
    })());
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

// GET /api/kb/articles/my - Get articles created by a specific user
app.get('/api/kb/articles/my', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find articles where createdBy.email matches (case-insensitive)
    const articles = await KBArticle.find({
      $or: [
        { 'createdBy.email': { $regex: new RegExp(`^${email}$`, 'i') } },
        { 'createdBy.mail': { $regex: new RegExp(`^${email}$`, 'i') } }
      ]
    }).sort({ createdAt: -1 });

    res.json(articles);
  } catch (err) {
    console.error('❌ Get my KB articles error:', err);
    res.status(500).json({ message: 'Failed to fetch articles' });
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

// GET /api/requests/search?q=:query
app.get('/api/requests/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  
  const results = await Request.find({
    $or: [
      { requestNumber: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { 'service.name': { $regex: q, $options: 'i' } }
    ]
  }).limit(20);
  
  res.json(results);
});

// GET /api/incidents/search?q=:query
app.get('/api/incidents/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  
  const results = await Incident.find({
    $or: [
      { incidentNumber: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { 'service.name': { $regex: q, $options: 'i' } }
    ]
  }).limit(20);
  
  res.json(results);
});

// GET /api/services/search?q=:query
app.get('/api/services/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  
  const results = await Service.find({
    name: { $regex: q, $options: 'i' }
  }).limit(10);
  
  res.json(results);
});
// ===================== ONBOARDING ROUTES =====================

// GET /api/onboarding — list, filtered to Onboarding-category Request docs.
// Powers the dedicated Onboarding.js list page (separate from /api/requests,
// which shows everything).
app.get("/api/onboarding", async (req, res) => {
  try {
    const requests = await HrRequest.find({ 'service.categoryName': 'Onboarding' }).sort({ createdAt: -1 });
    
    // Transform the data to ensure all fields are available at top level
    const transformedRequests = requests.map(req => {
      const onboardingData = req.onboarding || {};
      return {
        ...req.toObject(),
        // Ensure top-level fields are populated from onboarding if missing
        firstName: req.firstName || onboardingData.firstName || '',
        lastName: req.lastName || onboardingData.lastName || '',
        userPrincipalName: req.userPrincipalName || onboardingData.userPrincipalName || '',
        emailPrefix: req.emailPrefix || onboardingData.emailPrefix || '',
        jobTitle: req.jobTitle || onboardingData.jobTitle || '',
        department: req.department || onboardingData.department || '',
        employeeId: req.employeeId || onboardingData.employeeId || '',
        phoneNumber: req.phoneNumber || onboardingData.phoneNumber || '',
        personalEmail: req.personalEmail || onboardingData.personalEmail || '',
        workLocation: req.workLocation || onboardingData.workLocation || 'remote',
        startDate: req.startDate || onboardingData.startDate || null,
        gender: req.gender || onboardingData.gender || '',
        employeeType: req.employeeType || onboardingData.employeeType || '',
        officeLocation: req.officeLocation || onboardingData.officeLocation || '',
        contactInfo: req.contactInfo || onboardingData.contactInfo || { street: '', city: '', state: '' },
        creationType: req.creationType || onboardingData.creationType || 'Through Support Portal',
        reportingTo: req.reportingTo || onboardingData.reportingTo || { id: '', name: '', email: '' },
      };
    });
    
    res.json(transformedRequests);
  } catch (err) {
    console.error("❌ Get onboarding requests error:", err);
    res.status(500).json({ message: "Failed to fetch onboarding requests" });
  }
});

// GET /api/onboarding/my - Get onboarding requests created by a specific user
app.get('/api/onboarding/my', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const requests = await HrRequest.find({ 
      'service.categoryName': 'Onboarding',
      'createdByEmail': { $regex: new RegExp(`^${email}$`, 'i') }
    }).sort({ createdAt: -1 });
    
    res.json(requests);
  } catch (err) {
    console.error('❌ Get my onboarding requests error:', err);
    res.status(500).json({ message: 'Failed to fetch onboarding requests' });
  }
});

// GET /api/onboarding/settings  (must be registered BEFORE /api/onboarding/:id)
app.get('/api/onboarding/settings', async (req, res) => {
  try {
    let settings = await OnboardingSettings.findOne();
    if (!settings) {
      settings = new OnboardingSettings({
        approvers: [],
        selectedGroups: [],
        approvalRule: 'any',
        autoAddReportingManager: false,
        welcomeEmailSubject: 'Welcome to the Team!',
        welcomeEmailBody: `Dear {firstName},

We're so glad you're joining us! Your Sandeza account is all set up and ready to go — everything you need to get started is right below.

If you have any questions along the way, IT Support is always just a message away.

Best regards,
IT Team`,
      });
      await settings.save();
    }
    res.json(settings);
  } catch (err) {
    console.error('❌ Get onboarding settings error:', err);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

// POST /api/onboarding/settings
app.post('/api/onboarding/settings', async (req, res) => {
  try {
    const {
      approvers,
      selectedGroups,
      approvalRule,
      autoAddReportingManager,
      welcomeEmailSubject,
      welcomeEmailBody,
      updatedBy,
    } = req.body;

    // ✅ Fetch old settings to detect changes
    const oldSettings = await OnboardingSettings.findOne();
    
    const settings = await OnboardingSettings.findOneAndUpdate(
      {},
      {
        approvers: approvers || [],
        selectedGroups: selectedGroups || [],
        approvalRule: approvalRule || 'any',
        autoAddReportingManager: autoAddReportingManager || false,
        welcomeEmailSubject: welcomeEmailSubject || 'Welcome to the Team!',
        welcomeEmailBody: welcomeEmailBody || '',
        updatedBy: updatedBy || {},
        updatedAt: new Date(),
      },
      { new: true, upsert: true }
    );

    console.log('✅ [ONBOARDING SETTINGS] Updated');
    res.json(settings);

    // ✅ Send email notification to updater
    setImmediate(async () => {
      try {
        const actorEmail = updatedBy?.email || updatedBy?.mail;
        const actorName = updatedBy?.name || 'Admin';
        
        if (actorEmail) {
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          // Build change description
          const changes = [];
          
          // Check approvers changes
          if (oldSettings) {
            const oldApprovers = oldSettings.approvers || [];
            const newApprovers = approvers || [];
            
            const oldApproverEmails = new Set(oldApprovers.map(a => a.mail?.toLowerCase()));
            const newApproverEmails = new Set(newApprovers.map(a => a.mail?.toLowerCase()));
            
            const added = newApprovers.filter(a => !oldApproverEmails.has(a.mail?.toLowerCase()));
            const removed = oldApprovers.filter(a => !newApproverEmails.has(a.mail?.toLowerCase()));
            
            if (added.length > 0) {
              changes.push(`• Added approvers: ${added.map(a => a.displayName || a.mail).join(', ')}`);
            }
            if (removed.length > 0) {
              changes.push(`• Removed approvers: ${removed.map(a => a.displayName || a.mail).join(', ')}`);
            }
            
            // Check approval rule
            if (oldSettings.approvalRule !== approvalRule) {
              changes.push(`• Approval rule changed from "${oldSettings.approvalRule}" to "${approvalRule}"`);
            }
            
            // Check autoAddReportingManager
            if (oldSettings.autoAddReportingManager !== autoAddReportingManager) {
              changes.push(`• Auto-add Reporting Manager: ${autoAddReportingManager ? 'Enabled' : 'Disabled'}`);
            }
            
            // Check welcome email subject/body
            if (oldSettings.welcomeEmailSubject !== welcomeEmailSubject) {
              changes.push(`• Welcome email subject was updated`);
            }
            if (oldSettings.welcomeEmailBody !== welcomeEmailBody) {
              changes.push(`• Welcome email body was updated`);
            }
          }
          
          const html = buildHtmlEmail({
            title: `✅ HR Settings Updated`,
            subtitle: `Onboarding settings updated successfully`,
            statusColor: "#16a34a",
            fields: [
              { label: "Action", value: "UPDATED" },
              { label: "Approval Rule", value: approvalRule === 'all' ? 'All Approvers' : 'Any Approver' },
              { label: "Total Approvers", value: (approvers || []).length.toString() },
              { label: "Auto-Add Reporting Manager", value: autoAddReportingManager ? 'Yes' : 'No' },
              { label: "Performed By", value: actorName },
              { label: "Performed At (IST)", value: nowIST },
            ],
            description: `HR/Onboarding settings have been updated successfully.\n\nChanges made:\n${changes.length > 0 ? changes.join('\n') : '• Settings were updated'}`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          
          await sendEmail(actorEmail, `[HR SETTINGS] Updated`, html);
          console.log(`✅ [HR SETTINGS] Update notification sent to ${actorEmail}`);
        }
      } catch (mailErr) {
        console.error("❌ [HR SETTINGS] Update notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error('❌ Update onboarding settings error:', err);
    res.status(500).json({ message: 'Failed to update settings', error: err.message });
  }
});

// POST /api/onboarding/submit - CREATE onboarding request
app.post("/api/onboarding/submit", async (req, res) => {
  try {
    console.log('🔍 [BACKEND] FULL REQUEST BODY:', JSON.stringify(req.body, null, 2));
    
    const {
      firstName, lastName, emailPrefix, jobTitle, department, employeeId,
      phoneNumber, startDate, workLocation, additionalNotes,
      selectedGroups,
      createdBy, createdByName, createdByEmail,
      initialPassword,
      reportingTo,
      otherEmail,
      gender,
      employeeType,
      officeLocation,
      contactInfo,
      creationType
    } = req.body;

    console.log('🔍 [BACKEND] Individual fields:');
    console.log('  employeeType:', employeeType);
    console.log('  officeLocation:', officeLocation);
    console.log('  contactInfo:', contactInfo);
    console.log('  gender:', gender);
    console.log('  reportingTo:', reportingTo);

    // Validation
    if (!firstName || !lastName || !emailPrefix || !jobTitle || !department || !employeeId) {
      return res.status(400).json({ message: "All required fields must be filled" });
    }
    if (!selectedGroups || selectedGroups.length === 0) {
      return res.status(400).json({ message: "At least one Azure AD group must be selected" });
    }
    if (!otherEmail || !otherEmail.trim()) {
      return res.status(400).json({ message: "Personal email is required to send welcome credentials" });
    }

    // ✅ GET APPROVERS FROM SETTINGS
    const settings = await OnboardingSettings.findOne();
    let approvers = [];
    let approvalRule = 'any';
    let autoAddReportingManager = false;

    if (settings) {
      approvers = settings.approvers || [];
      approvalRule = settings.approvalRule || 'any';
      autoAddReportingManager = settings.autoAddReportingManager || false;
    }

    // ✅ Add reporting manager as approver if enabled
    let finalApprovers = [...approvers];
    if (autoAddReportingManager && reportingTo?.email) {
      const exists = finalApprovers.some(a => a.mail?.toLowerCase() === reportingTo.email?.toLowerCase());
      if (!exists) {
        finalApprovers.push({
          id: reportingTo.id || '',
          displayName: reportingTo.name || '',
          mail: reportingTo.email || '',
        });
      }
    }

    if (finalApprovers.length === 0) {
      return res.status(400).json({ 
        message: "No approvers configured. Please contact admin to set up onboarding approvers." 
      });
    }

    const displayName = `${firstName} ${lastName}`;
    const userPrincipalName = `${emailPrefix}@${process.env.TENANT_DOMAIN || 'yourcompany.com'}`;

    // Check if user already exists in Azure AD
    try {
      await getUserByUpn(userPrincipalName);
      return res.status(400).json({ 
        message: `User ${userPrincipalName} already exists in Azure AD` 
      });
    } catch (err) {
      // User doesn't exist - good to proceed
      if (!err.message.includes('not found')) {
        console.error('⚠️ [ONBOARDING] Error checking user:', err.message);
      }
    }

    // ✅ FETCH GROUP NAMES FROM AZURE AD
    let groupNamesWithDetails = [];
    try {
      const token = await getAccessToken();
      const url = `https://graph.microsoft.com/v1.0/groups?$select=id,displayName&$top=100`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const allGroups = data.value || [];
        
        groupNamesWithDetails = selectedGroups.map(groupId => {
          const group = allGroups.find(g => g.id === groupId);
          return {
            id: group?.id || groupId,
            name: group?.displayName || groupId
          };
        });
        console.log('✅ [ONBOARDING] Group names fetched:', groupNamesWithDetails.map(g => g.name).join(', '));
      } else {
        groupNamesWithDetails = selectedGroups.map(id => ({ id, name: id }));
      }
    } catch (err) {
      console.error('⚠️ [ONBOARDING] Failed to fetch group details:', err.message);
      groupNamesWithDetails = selectedGroups.map(id => ({ id, name: id }));
    }

    // Generate password if not provided
    const tempPassword = initialPassword || generateTempPassword();

    // ✅ Get group names for display in email
    const groupNamesForEmail = groupNamesWithDetails.map(g => g.name).join(', ');

    // ✅ Get first two approvers for backward compatibility
    const approver1 = finalApprovers.length > 0 ? finalApprovers[0].mail : '';
    const approver2 = finalApprovers.length > 1 ? finalApprovers[1].mail : '';

    // ✅ BUILD THE ONBOARDING OBJECT EXPLICITLY
    const onboardingData = {
      firstName: firstName || '',
      lastName: lastName || '',
      emailPrefix: emailPrefix || '',
      jobTitle: jobTitle || '',
      department: department || '',
      employeeId: employeeId || '',
      phoneNumber: phoneNumber || '',
      startDate: startDate || null,
      workLocation: workLocation || 'remote',
      additionalNotes: additionalNotes || '',
      userPrincipalName: userPrincipalName || '',
      displayName: displayName || '',
      personalEmail: otherEmail?.trim() || '',
      initialPassword: tempPassword || '',
      selectedGroups: groupNamesWithDetails || [],
      approvalRule: approvalRule || 'any',
      approvers: finalApprovers.map(a => ({ 
        id: a.id || '', 
        name: a.displayName || '', 
        email: a.mail || '',
        mail: a.mail || '' 
      })),
      gender: gender || '',
      employeeType: employeeType || '',
      officeLocation: officeLocation || '',
      contactInfo: {
        street: contactInfo?.street || '',
        city: contactInfo?.city || '',
        state: contactInfo?.state || '',
      },
      creationType: creationType || 'Through Support Portal',
      reportingTo: {
        id: reportingTo?.id || '',
        name: reportingTo?.name || '',
        email: reportingTo?.email || ''
      },
    };

    console.log('🔍 [ONBOARDING] Onboarding data being saved:', JSON.stringify({
      employeeType: onboardingData.employeeType,
      officeLocation: onboardingData.officeLocation,
      contactInfo: onboardingData.contactInfo,
    }, null, 2));

    const request = new HrRequest({
      service: { id: 'onboarding', name: 'Employee Onboarding', categoryName: 'Onboarding' },
      
      // ✅ Top-level fields for list view
      firstName: firstName,
      lastName: lastName,
      userPrincipalName: userPrincipalName,
      emailPrefix: emailPrefix,
      jobTitle: jobTitle,
      department: department,
      employeeId: employeeId,
      phoneNumber: phoneNumber || '',
      personalEmail: otherEmail.trim(),
      workLocation: workLocation || 'remote',
      startDate: startDate || null,
      gender: gender || '',
      employeeType: employeeType || '',
      officeLocation: officeLocation || '',
      contactInfo: {
        street: contactInfo?.street || '',
        city: contactInfo?.city || '',
        state: contactInfo?.state || '',
      },
      creationType: creationType || 'Through Support Portal',
      reportingTo: {
        id: reportingTo?.id || '',
        name: reportingTo?.name || '',
        email: reportingTo?.email || ''
      },
      
      raisedBy: {
        id: createdBy || '',
        name: createdByName || 'System',
        mail: createdByEmail || '',
      },
      description: additionalNotes || '',
      approval: {
        required: true,
        status: 'pending',
        approvers: finalApprovers.map(a => ({ id: a.id || '', name: a.displayName || '', email: a.mail || '' })),
      },
      status: 'pending_approval',
      approvers: finalApprovers.map(a => ({ 
        id: a.id || '', 
        name: a.displayName || '', 
        email: a.mail || '',
        mail: a.mail || '' 
      })),
      approver1: approver1,
      approver2: approver2,
      approvalType: approvalRule === 'all' ? 'both' : 'either',
      createdBy: { 
        id: createdBy || '', 
        name: createdByName || 'System', 
        email: createdByEmail || '' 
      },
      createdByName: createdByName || 'System',
      createdByEmail: createdByEmail || '',
      
      // ✅ Use the explicitly built onboarding object
      onboarding: onboardingData,
      
      history: [{
        action: 'created',
        by: createdByName || 'System',
        at: new Date(),
        notes: 'Onboarding request created'
      }]
    });

    await request.save();
    console.log(`✅ [ONBOARDING] Created: ${request.requestNumber} for ${displayName}`);

    // ✅ Verify the onboarding data was saved
    const savedRequest = await HrRequest.findById(request._id).lean();
    console.log('🔍 [ONBOARDING] Verified saved onboarding data:', JSON.stringify({
      employeeType: savedRequest?.onboarding?.employeeType,
      officeLocation: savedRequest?.onboarding?.officeLocation,
      contactInfo: savedRequest?.onboarding?.contactInfo,
    }, null, 2));

    res.status(201).json({
      success: true,
      requestNumber: request.requestNumber,
      requestId: request._id,
      message: 'Onboarding request submitted for approval'
    });

    // Send email notifications to approvers
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        
        const approverEmails = finalApprovers.map(a => a.mail).filter(Boolean);
        
        const recipients = new Set();
        if (createdByEmail) recipients.add(createdByEmail);
        approverEmails.forEach(email => recipients.add(email));

        const fields = [
          { label: "Request No.", value: request.requestNumber },
          { label: "Employee", value: `${firstName} ${lastName}` },
          { label: "Email", value: userPrincipalName },
          { label: "Job Title", value: jobTitle },
          { label: "Department", value: department },
          { label: "Employee ID", value: employeeId },
          { label: "Groups", value: groupNamesForEmail || '—' },
          { label: "Approval Rule", value: approvalRule === 'all' ? 'All Approvers' : 'Any Approver' },
          { label: "Submitted By", value: createdByName || 'System' },
          { label: "Submitted At", value: nowIST },
        ];

        const approverHtml = buildHtmlEmail({
          title: `👤 New Onboarding Request: ${request.requestNumber}`,
          subtitle: `Please review and approve this onboarding request`,
          statusColor: "#002060",
          fields,
          description: additionalNotes || 'No additional notes provided.',
          actionLink: `${prodUrl}/hr-request/${request._id}`,
          actionText: "Review Request",
        });

        await sendEmail([...recipients], `[ONBOARDING] ${request.requestNumber} - Awaiting Approval`, approverHtml);

        if (createdByEmail) {
          const confirmHtml = buildHtmlEmail({
            title: `✅ Onboarding Request Submitted: ${request.requestNumber}`,
            subtitle: `Your request has been submitted for approval`,
            statusColor: "#16a34a",
            fields: [
              { label: "Request No.", value: request.requestNumber },
              { label: "Employee", value: `${firstName} ${lastName}` },
              { label: "Status", value: "PENDING APPROVAL" },
              { label: "Submitted At", value: nowIST },
            ],
            description: `Your onboarding request has been submitted. You will be notified once approved.`,
            actionLink: `${prodUrl}/hr-request/${request._id}`,
            actionText: "View Status",
          });
          await sendEmail(createdByEmail, `[ONBOARDING] ${request.requestNumber} - Submitted`, confirmHtml);
        }

        console.log(`✅ [ONBOARDING] CREATE notifications sent to ${recipients.size} recipients`);
      } catch (mailErr) {
        console.error("❌ [ONBOARDING] Notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error("❌ [ONBOARDING] Submit error:", err);
    res.status(500).json({ message: "Failed to submit onboarding request", error: err.message });
  }
});

// GET /api/onboarding/:id  (must come AFTER /settings and /submit)
app.get("/api/onboarding/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid onboarding request id" });
    }

    const request = await HrRequest.findById(id);
    if (!request) return res.status(404).json({ message: "Onboarding request not found" });
    
    if (request.service?.categoryName !== 'Onboarding') {
      return res.status(400).json({ message: "Not an onboarding request" });
    }
    
    const onboardingData = request.onboarding || {};
    
    // ✅ Get approvers from request.approvers or onboarding.approvers
    let approvers = request.approvers || onboardingData.approvers || [];
    
    // ✅ If no approvers array exists, build from approver1/approver2 (for old requests)
    if (approvers.length === 0) {
      if (request.approver1) {
        approvers.push({ 
          id: '', 
          name: request.approver1, 
          email: request.approver1,
          mail: request.approver1
        });
      }
      if (request.approver2) {
        approvers.push({ 
          id: '', 
          name: request.approver2, 
          email: request.approver2,
          mail: request.approver2
        });
      }
    }
    
    const responseData = {
      _id: request._id,
      requestNumber: request.requestNumber,
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      history: request.history || [],
      // Onboarding specific fields
      firstName: onboardingData.firstName || '',
      lastName: onboardingData.lastName || '',
      emailPrefix: onboardingData.emailPrefix || '',
      jobTitle: onboardingData.jobTitle || '',
      department: onboardingData.department || '',
      employeeId: onboardingData.employeeId || '',
      phoneNumber: onboardingData.phoneNumber || '',
      startDate: onboardingData.startDate || '',
      workLocation: onboardingData.workLocation || 'remote',
      additionalNotes: onboardingData.additionalNotes || '',
      userPrincipalName: onboardingData.userPrincipalName || '',
      displayName: onboardingData.displayName || `${onboardingData.firstName || ''} ${onboardingData.lastName || ''}`,
      personalEmail: onboardingData.personalEmail || '',
      initialPassword: onboardingData.initialPassword || '',
      selectedGroups: onboardingData.selectedGroups || [],
      approvalRule: onboardingData.approvalRule || 'any',
      azureUserId: onboardingData.azureUserId || '',
      azureUserCreated: onboardingData.azureUserCreated || false,
      groupsAdded: onboardingData.groupsAdded || [],
      rejectionReason: onboardingData.rejectionReason || '',
      reportingTo: request.reportingTo || onboardingData.reportingTo || { id: '', name: '', email: '' },
      employeeType: onboardingData.employeeType || '',
      officeLocation: onboardingData.officeLocation || '',
      contactInfo: onboardingData.contactInfo || { street: '', city: '', state: '' },
      creationType: onboardingData.creationType || 'Through Support Portal',
      managerSet: onboardingData.managerSet || false,
      // ✅ Return ALL approvers
      approvers: approvers,
      approver1: request.approver1 || '',
      approver2: request.approver2 || '',
      approvalType: request.approvalType || 'either',
      approvedBy: request.approvedBy || null,
      approvedAt: request.approvedAt || null,
      createdBy: request.createdBy || null,
      createdByName: request.createdByName || '',
      createdByEmail: request.createdByEmail || '',
    };
    
    console.log('✅ [ONBOARDING] Approvers returned:', approvers.map(a => a.email || a.mail));
    res.json(responseData);
  } catch (err) {
    console.error("❌ Get onboarding request error:", err);
    res.status(500).json({ message: "Failed to fetch onboarding request" });
  }
});

// POST /api/onboarding/:id/approve - APPROVE onboarding with complete notifications
app.post("/api/onboarding/:id/approve", async (req, res) => {
  try {
    const { actorEmail, actorName, actorId, note } = req.body;
    if (!actorEmail) return res.status(400).json({ message: "Actor email is required" });

    const request = await HrRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Onboarding request not found" });

    // ✅ Check if it's an onboarding request
    if (request.service?.categoryName !== 'Onboarding') {
      return res.status(400).json({ message: "Not an onboarding request" });
    }

    // ✅ Get onboarding data from BOTH top-level and sub-document
    const onboardingFromSub = request.onboarding ? request.onboarding.toObject() : {};
    
    const onboardingData = {
      // Top-level fields (these are the ones that have data)
      firstName: request.firstName || onboardingFromSub.firstName,
      lastName: request.lastName || onboardingFromSub.lastName,
      emailPrefix: request.emailPrefix || onboardingFromSub.emailPrefix,
      userPrincipalName: request.userPrincipalName || onboardingFromSub.userPrincipalName,
      jobTitle: request.jobTitle || onboardingFromSub.jobTitle,
      department: request.department || onboardingFromSub.department,
      employeeId: request.employeeId || onboardingFromSub.employeeId,
      phoneNumber: request.phoneNumber || onboardingFromSub.phoneNumber,
      initialPassword: onboardingFromSub.initialPassword,
      displayName: onboardingFromSub.displayName || `${request.firstName || onboardingFromSub.firstName} ${request.lastName || onboardingFromSub.lastName}`,
      
      // Extended fields - from top level (these are where the data actually is)
      employeeType: request.employeeType || onboardingFromSub.employeeType || '',
      officeLocation: request.officeLocation || onboardingFromSub.officeLocation || '',
      contactInfo: request.contactInfo || onboardingFromSub.contactInfo || { street: '', city: '', state: '' },
      reportingTo: request.reportingTo || onboardingFromSub.reportingTo || { id: '', name: '', email: '' },
      personalEmail: request.personalEmail || onboardingFromSub.personalEmail,
      selectedGroups: onboardingFromSub.selectedGroups || [],
      approvalRule: onboardingFromSub.approvalRule || request.approvalType || 'any',
      gender: request.gender || onboardingFromSub.gender || '',
      workLocation: request.workLocation || onboardingFromSub.workLocation || 'remote',
      creationType: request.creationType || onboardingFromSub.creationType || 'Through Support Portal',
    };

    console.log('🔍 [APPROVE] Combined onboarding data:', JSON.stringify({
      employeeType: onboardingData.employeeType,
      officeLocation: onboardingData.officeLocation,
      contactInfo: onboardingData.contactInfo,
      reportingTo: onboardingData.reportingTo,
    }, null, 2));

    // ✅ Get approvers list (from request or onboarding)
    let approvers = request.approvers || onboardingData.approvers || [];
    
    // If no approvers array, build from approver1/approver2 (backward compatibility)
    if (approvers.length === 0) {
      if (request.approver1) {
        approvers.push({ 
          id: '', 
          name: request.approver1, 
          email: request.approver1,
          mail: request.approver1,
          hasApproved: false
        });
      }
      if (request.approver2) {
        approvers.push({ 
          id: '', 
          name: request.approver2, 
          email: request.approver2,
          mail: request.approver2,
          hasApproved: false
        });
      }
    }

    // ✅ Check if user is authorized to approve
    const actorEmailLower = actorEmail.toLowerCase();
    const isApprover = approvers.some(a => 
      a?.email?.toLowerCase() === actorEmailLower || 
      a?.mail?.toLowerCase() === actorEmailLower
    );
    const isCreator = request.createdByEmail?.toLowerCase() === actorEmailLower;

    if (!isApprover && !isCreator) {
      return res.status(403).json({ message: "You are not authorized to approve this request" });
    }

    // Check if already approved or completed
    if (request.status === 'completed' || request.status === 'approved') {
      return res.status(400).json({ message: "This request has already been approved" });
    }

    if (request.status === 'rejected') {
      return res.status(400).json({ message: "This request has been rejected and cannot be approved" });
    }

    // ✅ Find the approver who is approving
    const approvingApprover = approvers.find(a => 
      a?.email?.toLowerCase() === actorEmailLower || 
      a?.mail?.toLowerCase() === actorEmailLower
    );

    // ✅ Mark this approver as having approved
    if (approvingApprover) {
      approvingApprover.hasApproved = true;
      approvingApprover.approvedAt = new Date();
    }

    // ✅ Get the approval rule
    const approvalRule = onboardingData.approvalRule || request.approvalType || 'any';
    const isBothRule = approvalRule === 'all' || approvalRule === 'both';

    // ✅ Count how many approvers have approved
    const approvedApprovers = approvers.filter(a => a.hasApproved === true);
    const totalApprovers = approvers.length;
    const remainingApprovers = approvers.filter(a => a.hasApproved !== true);
    const isFullyApproved = isBothRule 
      ? approvedApprovers.length === totalApprovers  // ALL must approve
      : approvedApprovers.length >= 1;               // ANY one can approve

    // ✅ Get the actor's display name
    const actorDisplayName = approvingApprover?.name || actorName || actorEmail;

    // ✅ Prepare notification data
    const requesterEmail = request.createdByEmail || request.raisedBy?.mail;
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const prodUrl = process.env.PROD_URL;

    // ==========================================
    // UPDATE REQUEST STATUS
    // ==========================================
    
    if (isFullyApproved) {
      // ✅ FULLY APPROVED - Start user creation
      request.approvalStatus = 'approved';
      request.status = 'processing';
      request.approvedBy = { id: actorId || '', name: actorDisplayName, email: actorEmail };
      request.approvedAt = new Date();
      
    } else {
      // ✅ PARTIALLY APPROVED - Keep pending
      request.approvalStatus = 'pending';
      request.status = 'pending_approval';
      // Don't set approvedBy yet (only set when fully approved)
    }

    // ✅ Save the updated approvers list
    request.approvers = approvers;
    request.onboarding = {
      ...onboardingFromSub,
      ...onboardingData,
      reportingTo: onboardingData.reportingTo || { id: '', name: '', email: '' },
      approvers: approvers,
      approvalStatus: request.approvalStatus
    };

    // Add history entry
    request.history = request.history || [];
    request.history.push({
      action: 'approved',
      by: actorDisplayName,
      at: new Date(),
      notes: note || `${actorDisplayName} approved the request${!isFullyApproved ? ` (${remainingApprovers.length} more approval${remainingApprovers.length > 1 ? 's' : ''} needed)` : ' (Fully Approved)'}`
    });

    await request.save();
    console.log(`✅ [ONBOARDING] ${isFullyApproved ? 'FULLY' : 'PARTIALLY'} Approved: ${request.requestNumber} by ${actorDisplayName}`);

    // ✅ Send notifications only AFTER the save above succeeded, so a mid-request
    // failure (e.g. schema validation) can never trigger a "fully approved" email
    // while the DB status is left stuck at pending_approval.
    setImmediate(async () => {
      try {
        if (isFullyApproved) {
          // ==========================================
          // CASE: FULLY APPROVED - All approvers done
          // ==========================================
          
          // Get all approver names
          const approverNames = approvedApprovers.map(a => a.name || a.email).join(' and ');
          
          // 1. NOTIFY REQUESTER: "Fully approved by X and Y"
          if (requesterEmail) {
            const requesterHtml = buildHtmlEmail({
              title: `✅ Onboarding Request Fully Approved: ${request.requestNumber}`,
              subtitle: `All approvers have approved this request`,
              statusColor: "#16a34a",
              fields: [
                { label: "Request No.", value: request.requestNumber },
                { label: "Employee", value: `${onboardingData.firstName} ${onboardingData.lastName}` },
                { label: "Approved By", value: approverNames },
                { label: "Approved At", value: nowIST },
                { label: "Status", value: "FULLY APPROVED - Processing" },
              ],
              description: `Your onboarding request has been fully approved by ${approverNames}. The user account is being created.`,
              actionLink: `${prodUrl}/hr-request/${request._id}`,
              actionText: "View Details",
            });
            await sendEmail(requesterEmail, `[ONBOARDING] ${request.requestNumber} - Fully Approved`, requesterHtml);
          }

          // 2. NOTIFY OTHER APPROVERS: request is decided, no action needed from them
          //    (relevant under an 'any' rule, where only one approval was required)
          const otherApprovers = approvers.filter(a => {
            const aEmail = (a.email || a.mail || '').toLowerCase();
            return aEmail && aEmail !== actorEmailLower;
          });
          for (const other of otherApprovers) {
            const otherEmail = other.email || other.mail;
            if (otherEmail) {
              const otherHtml = buildHtmlEmail({
                title: `✅ Onboarding Request Fully Approved: ${request.requestNumber}`,
                subtitle: `${actorDisplayName} approved this request — no action needed from you`,
                statusColor: "#16a34a",
                fields: [
                  { label: "Request No.", value: request.requestNumber },
                  { label: "Employee", value: `${onboardingData.firstName} ${onboardingData.lastName}` },
                  { label: "Approved By", value: approverNames },
                  { label: "Approved At", value: nowIST },
                  { label: "Status", value: "FULLY APPROVED - Processing" },
                ],
                description: `${actorDisplayName} has approved this onboarding request and it has moved forward. No further action is needed from you.`,
                actionLink: `${prodUrl}/hr-request/${request._id}`,
                actionText: "View Details",
              });
              await sendEmail(otherEmail, `[ONBOARDING] ${request.requestNumber} - Fully Approved`, otherHtml);
            }
          }

          // 3. NOTIFY REPORTING MANAGER (if one was set on the request)
          const managerEmail = onboardingData.reportingTo?.email;
          if (managerEmail) {
            const managerHtml = buildHtmlEmail({
              title: `✅ Onboarding Approved for Your New Team Member: ${request.requestNumber}`,
              subtitle: `The onboarding request for your direct report has been approved`,
              statusColor: "#16a34a",
              fields: [
                { label: "Request No.", value: request.requestNumber },
                { label: "Employee", value: `${onboardingData.firstName} ${onboardingData.lastName}` },
                { label: "Job Title", value: onboardingData.jobTitle || 'N/A' },
                { label: "Department", value: onboardingData.department || 'N/A' },
                { label: "Approved By", value: approverNames },
                { label: "Status", value: "FULLY APPROVED - Processing" },
              ],
              description: `The onboarding request for ${onboardingData.firstName} ${onboardingData.lastName}, who will report to you, has been approved. Their account is being created.`,
              actionLink: `${prodUrl}/hr-request/${request._id}`,
              actionText: "View Details",
            });
            await sendEmail(managerEmail, `[ONBOARDING] ${request.requestNumber} - Approved for Your New Team Member`, managerHtml);
          }

          console.log(`✅ [ONBOARDING] FULL APPROVAL notifications sent to requester, ${otherApprovers.length} other approver(s)${managerEmail ? ', and reporting manager' : ''}`);

        } else {
          // ==========================================
          // CASE: PARTIALLY APPROVED - Waiting for others
          // ==========================================
          
          // Get names of approved approvers
          const approvedNames = approvedApprovers.map(a => a.name || a.email).join(' and ');

          // 1. NOTIFY REQUESTER: "Approved by X"
          if (requesterEmail) {
            const requesterHtml = buildHtmlEmail({
              title: `📋 Onboarding Request Partially Approved: ${request.requestNumber}`,
              subtitle: `One approver has approved, waiting for others`,
              statusColor: "#d97706",
              fields: [
                { label: "Request No.", value: request.requestNumber },
                { label: "Employee", value: `${onboardingData.firstName} ${onboardingData.lastName}` },
                { label: "Approved By", value: approvedNames },
                { label: "Approved At", value: nowIST },
                { label: "Status", value: `WAITING FOR ${remainingApprovers.length} MORE APPROVER${remainingApprovers.length > 1 ? 'S' : ''}` },
                { label: "Remaining Approvers", value: remainingApprovers.map(a => a.name || a.email).join(', ') },
              ],
              description: `Your onboarding request has been approved by ${approvedNames}. Waiting for approval from: ${remainingApprovers.map(a => a.name || a.email).join(', ')}`,
              actionLink: `${prodUrl}/hr-request/${request._id}`,
              actionText: "View Details",
            });
            await sendEmail(requesterEmail, `[ONBOARDING] ${request.requestNumber} - Partially Approved`, requesterHtml);
          }

          // 2. NOTIFY REMAINING APPROVERS: "X has approved, waiting for your approval"
          for (const remaining of remainingApprovers) {
            const remainingEmail = remaining.email || remaining.mail;
            if (remainingEmail) {
              const remainingHtml = buildHtmlEmail({
                title: `⏳ Onboarding Request Awaiting Your Approval: ${request.requestNumber}`,
                subtitle: `${actorDisplayName} has approved, waiting for your approval`,
                statusColor: "#7c3aed",
                fields: [
                  { label: "Request No.", value: request.requestNumber },
                  { label: "Employee", value: `${onboardingData.firstName} ${onboardingData.lastName}` },
                  { label: "Approved By", value: approvedNames },
                  { label: "Approved At", value: nowIST },
                  { label: "Your Role", value: "Pending Approver" },
                ],
                description: `${actorDisplayName} has approved this onboarding request. Please review and approve it so the user account can be created.`,
                actionLink: `${prodUrl}/hr-request/${request._id}`,
                actionText: "Review & Approve",
              });
              await sendEmail(remainingEmail, `[ONBOARDING] ${request.requestNumber} - Awaiting Your Approval`, remainingHtml);
            }
          }

          console.log(`✅ [ONBOARDING] PARTIAL APPROVAL notifications sent to requester + ${remainingApprovers.length} remaining approvers`);
        }
      } catch (mailErr) {
        console.error("❌ [ONBOARDING] Approval notification error:", mailErr.message);
      }
    });

    // ==========================================
    // IF FULLY APPROVED - Create Azure User
    // ==========================================
    
    if (isFullyApproved) {
      try {
        // 1. Create Azure AD user — employeeId/employeeType/officeLocation/address
        // fields and the manager are now all set inside createAzureUser() itself,
        // in a single Graph call, instead of a separate follow-up PATCH.
        const userData = {
          firstName: onboardingData.firstName,
          lastName: onboardingData.lastName,
          displayName: onboardingData.displayName || `${onboardingData.firstName} ${onboardingData.lastName}`,
          emailPrefix: onboardingData.emailPrefix,
          userPrincipalName: onboardingData.userPrincipalName,
          jobTitle: onboardingData.jobTitle,
          department: onboardingData.department,
          phoneNumber: onboardingData.phoneNumber,
          initialPassword: onboardingData.initialPassword,
          employeeId: onboardingData.employeeId,
          employeeType: onboardingData.employeeType,
          officeLocation: onboardingData.officeLocation,
          streetAddress: onboardingData.contactInfo?.street,
          city: onboardingData.contactInfo?.city,
          state: onboardingData.contactInfo?.state,
          // ✅ reportingTo.id is the manager's Azure AD object id, captured when
          // the manager was picked from the AD-search dropdown on the form.
          managerId: onboardingData.reportingTo?.id,
        };

        console.log('🔎 [ONBOARDING] Extended fields received for this request:', {
          employeeId: onboardingData.employeeId || '(empty)',
          employeeType: onboardingData.employeeType || '(empty)',
          officeLocation: onboardingData.officeLocation || '(empty)',
          street: onboardingData.contactInfo?.street || '(empty)',
          city: onboardingData.contactInfo?.city || '(empty)',
          state: onboardingData.contactInfo?.state || '(empty)',
          managerId: onboardingData.reportingTo?.id || '(empty)',
        });

        const azureUser = await createAzureUser(userData);

        // Store azure user id in onboarding data
        onboardingData.azureUserId = azureUser.id;
        onboardingData.azureUserCreated = true;
        onboardingData.managerSet = azureUser.managerSet || false;

        // 2. Add user to groups
        const groupResults = await addUserToGroups(azureUser.id, onboardingData.selectedGroups || []);
        onboardingData.groupsAdded = groupResults.filter(g => g.success).map(g => g.group);
        
        // Check if all groups were added successfully
        const failedGroups = groupResults.filter(g => !g.success);
        if (failedGroups.length > 0) {
          console.warn(`⚠️ [ONBOARDING] Some groups failed:`, failedGroups);
          request.history.push({
            action: 'warning',
            by: 'System',
            at: new Date(),
            notes: `Some groups could not be added: ${failedGroups.map(g => g.group).join(', ')}`
          });
        }

        request.status = 'completed';
        request.history.push({
          action: 'completed',
          by: 'System',
          at: new Date(),
          notes: `User ${azureUser.userPrincipalName} created and added to groups`
        });

        // Save the updated onboarding data back to the request
        request.onboarding = onboardingData;
        await request.save();
        
        console.log(`✅ [ONBOARDING] Completed: ${request.requestNumber} for ${onboardingData.displayName}`);

        res.json({
          success: true,
          message: "Onboarding request fully approved and user created",
          requestNumber: request.requestNumber,
          userPrincipalName: onboardingData.userPrincipalName,
          password: onboardingData.initialPassword
        });

        // Send welcome email to user
        setImmediate(async () => {
          try {
            const groupNamesJoined = (onboardingData.selectedGroups || []).map(g => g?.name || g).join(', ');

            // Use the welcome message configured in Onboarding Settings
            const settings = await OnboardingSettings.findOne();
            const subjectTemplate = settings?.welcomeEmailSubject || 'Welcome to the Team!';
            const bodyTemplate = settings?.welcomeEmailBody ||
              `Dear {firstName},\n\nWelcome to the team! Your account has been created.\n\nEmail: {email}\nTemporary Password: {password}`;

            const fillPlaceholders = (text) => text
              .replace(/{firstName}/g, onboardingData.firstName || '')
              .replace(/{lastName}/g, onboardingData.lastName || '')
              .replace(/{email}/g, onboardingData.userPrincipalName || '')
              .replace(/{password}/g, onboardingData.initialPassword || '')
              .replace(/{jobTitle}/g, onboardingData.jobTitle || '')
              .replace(/{department}/g, onboardingData.department || '')
              .replace(/{groups}/g, groupNamesJoined)
              .replace(/https?:\/\/portal\.office\.com/gi, 'https://outlook.office.com');

            const welcomeSubject = fillPlaceholders(subjectTemplate);
            const welcomeBody = fillPlaceholders(bodyTemplate);

            const welcomeHtml = buildWelcomeEmail({
              firstName: onboardingData.firstName,
              lastName: onboardingData.lastName,
              jobTitle: onboardingData.jobTitle,
              department: onboardingData.department,
              email: onboardingData.userPrincipalName,
              password: onboardingData.initialPassword,
              groups: groupNamesJoined,
              messageBody: welcomeBody,
              signInLink: "https://outlook.office.com",
            });

            const welcomeDestination = onboardingData.personalEmail || onboardingData.userPrincipalName;
            await sendEmail(welcomeDestination, `🎉 ${welcomeSubject}`, welcomeHtml);
            
            // Also notify requester that account is created (if different from welcome destination)
            if (requesterEmail && requesterEmail !== welcomeDestination) {
              const notifyHtml = buildHtmlEmail({
                title: `✅ User Account Created: ${request.requestNumber}`,
                subtitle: `The onboarding request has been fully processed`,
                statusColor: "#16a34a",
                fields: [
                  { label: "Request No.", value: request.requestNumber },
                  { label: "Employee", value: `${onboardingData.firstName} ${onboardingData.lastName}` },
                  { label: "Email", value: onboardingData.userPrincipalName },
                  { label: "Status", value: "COMPLETED" },
                  { label: "Completed At", value: nowIST },
                ],
                actionLink: `${prodUrl}/hr-request/${request._id}`,
                actionText: "View Details",
              });
              await sendEmail(requesterEmail, `[ONBOARDING] ${request.requestNumber} - Account Created`, notifyHtml);
            }

            // Also notify the reporting manager that the account is live
            const managerEmailForCompletion = onboardingData.reportingTo?.email;
            if (managerEmailForCompletion) {
              const managerCompleteHtml = buildHtmlEmail({
                title: `🎉 Account Created for Your New Team Member: ${request.requestNumber}`,
                subtitle: `${onboardingData.firstName} ${onboardingData.lastName}'s account is ready`,
                statusColor: "#16a34a",
                fields: [
                  { label: "Request No.", value: request.requestNumber },
                  { label: "Employee", value: `${onboardingData.firstName} ${onboardingData.lastName}` },
                  { label: "Job Title", value: onboardingData.jobTitle || 'N/A' },
                  { label: "Department", value: onboardingData.department || 'N/A' },
                  { label: "Email", value: onboardingData.userPrincipalName },
                  { label: "Status", value: "COMPLETED" },
                  { label: "Completed At", value: nowIST },
                ],
                description: `${onboardingData.firstName} ${onboardingData.lastName}'s account has been created and is ready to use. They report to you.`,
                actionLink: `${prodUrl}/hr-request/${request._id}`,
                actionText: "View Details",
              });
              await sendEmail(managerEmailForCompletion, `[ONBOARDING] ${request.requestNumber} - Your New Team Member's Account is Ready`, managerCompleteHtml);
            }
            
            console.log(`✅ [ONBOARDING] Welcome email sent to ${welcomeDestination}`);
          } catch (mailErr) {
            console.error("❌ [ONBOARDING] Welcome email error:", mailErr.message);
          }
        });

      } catch (azureErr) {
        console.error('❌ [ONBOARDING] Azure creation failed:', azureErr.message);
        request.status = 'failed';
        request.history.push({
          action: 'failed',
          by: 'System',
          at: new Date(),
          notes: `Azure user creation failed: ${azureErr.message}`
        });
        request.onboarding = onboardingData;
        await request.save();
        
        // Notify admin about failure
        setImmediate(async () => {
          try {
            const adminEmail = process.env.ADMIN_EMAIL || 'admin@yourcompany.com';
            const failHtml = buildHtmlEmail({
              title: `❌ Onboarding Failed: ${request.requestNumber}`,
              subtitle: `User creation failed`,
              statusColor: "#dc2626",
              fields: [
                { label: "Request No.", value: request.requestNumber },
                { label: "Employee", value: `${onboardingData.firstName} ${onboardingData.lastName}` },
                { label: "Error", value: azureErr.message },
              ],
              actionLink: `${prodUrl}/hr-request/${request._id}`,
              actionText: "View Details",
            });
            await sendEmail(adminEmail, `[ONBOARDING] ${request.requestNumber} - FAILED`, failHtml);
          } catch (mailErr) {
            console.error("❌ [ONBOARDING] Failure notification error:", mailErr.message);
          }
        });

        return res.status(500).json({ 
          success: false, 
          message: "User creation failed", 
          error: azureErr.message 
        });
      }
    } else {
      // ✅ PARTIALLY APPROVED - Just return success
      res.json({
        success: true,
        message: `Onboarding request partially approved by ${actorDisplayName}`,
        requestNumber: request.requestNumber,
        remainingApprovers: remainingApprovers.map(a => a.name || a.email),
        approvalStatus: 'pending'
      });
    }

  } catch (err) {
    console.error("❌ [ONBOARDING] Approve error:", err);
    res.status(500).json({ message: "Approval failed", error: err.message });
  }
});

// POST /api/onboarding/:id/reject - REJECT onboarding
app.post("/api/onboarding/:id/reject", async (req, res) => {
  try {
    const { actorEmail, actorName, actorId, reason, note } = req.body;
    if (!actorEmail) return res.status(400).json({ message: "Actor email is required" });

    const request = await HrRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Onboarding request not found" });

    // ✅ Check if it's an onboarding request
    if (request.service?.categoryName !== 'Onboarding') {
      return res.status(400).json({ message: "Not an onboarding request" });
    }

    // ✅ Check if user is authorized to reject (check all approvers)
    const isApprover = (request.approvers || []).some(a => 
      a?.email?.toLowerCase() === actorEmail.toLowerCase() || 
      a?.mail?.toLowerCase() === actorEmail.toLowerCase()
    );
    const isApprover1 = request.approver1?.toLowerCase() === actorEmail.toLowerCase();
    const isApprover2 = request.approver2?.toLowerCase() === actorEmail.toLowerCase();
    const isCreator = request.createdByEmail?.toLowerCase() === actorEmail.toLowerCase();

    if (!isApprover && !isApprover1 && !isApprover2 && !isCreator) {
      return res.status(403).json({ message: "You are not authorized to reject this request" });
    }

    if (request.status === 'completed') {
      return res.status(400).json({ message: "This request has already been completed" });
    }

    request.status = 'rejected';
    request.approvalStatus = 'rejected';
    request.rejectionReason = reason || note || 'No reason provided';
    
    request.history = request.history || [];
    request.history.push({
      action: 'rejected',
      by: actorName || actorEmail,
      at: new Date(),
      notes: reason || note || `Rejected by ${actorName || actorEmail}`
    });

    await request.save();
    console.log(`✅ [ONBOARDING] Rejected: ${request.requestNumber}`);

    // Send rejection notification
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const recipients = new Set();
        if (request.approver1) recipients.add(request.approver1);
        if (request.approver2) recipients.add(request.approver2);
        if (request.createdByEmail) recipients.add(request.createdByEmail);
        if (actorEmail) recipients.add(actorEmail);

        const rejectHtml = buildHtmlEmail({
          title: `❌ Onboarding Request Rejected: ${request.requestNumber}`,
          subtitle: `The onboarding request has been rejected`,
          statusColor: "#dc2626",
          fields: [
            { label: "Request No.", value: request.requestNumber },
            { label: "Employee", value: `${request.onboarding?.firstName || ''} ${request.onboarding?.lastName || ''}` },
            { label: "Rejected By", value: actorName || actorEmail },
            { label: "Rejected At", value: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) },
          ],
          description: reason || note || 'No reason provided.',
          actionLink: `${prodUrl}/hr-request/${request._id}`,
          actionText: "View Details",
        });

        await sendEmail([...recipients], `[ONBOARDING] ${request.requestNumber} - Rejected`, rejectHtml);
        console.log(`✅ [ONBOARDING] REJECT notifications sent`);
      } catch (mailErr) {
        console.error("❌ [ONBOARDING] Reject notification error:", mailErr.message);
      }
    });

    res.json({ 
      success: true, 
      message: "Onboarding request rejected", 
      requestNumber: request.requestNumber 
    });

  } catch (err) {
    console.error("❌ [ONBOARDING] Reject error:", err);
    res.status(500).json({ message: "Rejection failed", error: err.message });
  }
});

// DELETE /api/onboarding/:id
app.delete("/api/onboarding/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid onboarding request id" });
    }
    
    const request = await HrRequest.findById(id);
    if (!request) return res.status(404).json({ message: "Onboarding request not found" });
    
    // ✅ Check if it's actually an onboarding request
    if (request.service?.categoryName !== 'Onboarding') {
      return res.status(400).json({ message: "Not an onboarding request" });
    }
    
    const requestNumber = request.requestNumber;
    await HrRequest.findByIdAndDelete(id);
    
    console.log(`✅ [ONBOARDING] Deleted: ${requestNumber}`);
    res.json({ message: "Onboarding request deleted successfully", requestNumber });
  } catch (err) {
    console.error("❌ [ONBOARDING] Delete error:", err);
    res.status(500).json({ message: "Failed to delete onboarding request", error: err.message });
  }
});
// ===================== OFFBOARDING SETTINGS SCHEMA =====================
// Backs the OffboardingSettings.js admin page. Singleton document (like
// OnboardingSettings above) — itTeam/hrTeam are the people who can approve
// stage 2 / stage 3 of every offboarding request. Nothing offboarding-related
// is read from a config file or .env; it all lives here in Mongo and is
// editable from the Settings UI.
// ===================== OFFBOARDING SETTINGS SCHEMA =====================
const offboardingSettingsSchema = new mongoose.Schema({
  reportingManager: {
    id: { type: String, default: '' },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
  },
  itTeam: [{
    id: String,
    displayName: String,
    mail: String,
  }],
  hrTeam: [{
    id: String,
    displayName: String,
    mail: String,
  }],
  offboardingEmailSubject: { type: String, default: 'Offboarding Process: {firstName} {lastName}' },
  offboardingEmailBody: { type: String, default: '' },
  updatedBy: { id: String, name: String, email: String },
  updatedAt: { type: Date, default: Date.now },
});

const OffboardingSettings = mongoose.model('OffboardingSettings', offboardingSettingsSchema);

// GET /api/offboarding/settings
app.get('/api/offboarding/settings', async (req, res) => {
  try {
    let settings = await OffboardingSettings.findOne();
    if (!settings) {
      settings = new OffboardingSettings({
        reportingManager: { id: '', name: '', email: '' },
        itTeam: [],
        hrTeam: [],
        offboardingEmailSubject: 'Offboarding Process: {firstName} {lastName}',
        offboardingEmailBody: `Dear {firstName},

This email confirms that your offboarding process has been initiated.

Please complete the following before your last day:
1. Return all company assets (laptop, phone, access cards)
2. Complete the exit interview with HR
3. Transfer all pending work to your team
4. Submit your final timesheet

Your last working day: {exitDate}

If you have any questions, please contact:
- IT Team: for asset return and access removal
- HR Team: for exit interview and final settlement

Best regards,
IT & HR Team`,
      });
      await settings.save();
    }
    res.json(settings);
  } catch (err) {
    console.error('❌ Get offboarding settings error:', err);
    res.status(500).json({ message: 'Failed to fetch settings', error: err.message });
  }
});

// POST /api/offboarding/settings
app.post('/api/offboarding/settings', async (req, res) => {
  try {
    console.log('📥 [OFFBOARDING SETTINGS] Received body:', JSON.stringify(req.body, null, 2));
    
    const {
      reportingManager,
      itTeam,
      hrTeam,
      offboardingEmailSubject,
      offboardingEmailBody,
      updatedBy,
    } = req.body;

    console.log('📥 [OFFBOARDING SETTINGS] itTeam count:', itTeam?.length || 0);
    console.log('📥 [OFFBOARDING SETTINGS] hrTeam count:', hrTeam?.length || 0);

    // Validate input
    if (!itTeam && !hrTeam) {
      return res.status(400).json({ message: 'At least IT Team or HR Team is required' });
    }

    const settings = await OffboardingSettings.findOneAndUpdate(
      {},
      {
        reportingManager: reportingManager || { id: '', name: '', email: '' },
        itTeam: itTeam || [],
        hrTeam: hrTeam || [],
        offboardingEmailSubject: offboardingEmailSubject || 'Offboarding Process: {firstName} {lastName}',
        offboardingEmailBody: offboardingEmailBody || '',
        updatedBy: updatedBy || {},
        updatedAt: new Date(),
      },
      { new: true, upsert: true }
    );

    console.log('✅ [OFFBOARDING SETTINGS] Updated successfully');
    console.log('📤 [OFFBOARDING SETTINGS] Saved itTeam:', settings.itTeam?.length || 0);
    console.log('📤 [OFFBOARDING SETTINGS] Saved hrTeam:', settings.hrTeam?.length || 0);
    
    res.json(settings);
  } catch (err) {
    console.error('❌ [OFFBOARDING SETTINGS] Update error:', err);
    res.status(500).json({ 
      message: 'Failed to save offboarding settings', 
      error: err.message 
    });
  }
});

// ===================== OFFBOARDING REQUEST SCHEMA =====================
// One document per employee (even when submitted as part of a multi-select
// batch) so each person's approval chain and Azure action are independent.
const offboardingStageSchema = new mongoose.Schema({
  stage: { type: Number, required: true },              // 1, 2, 3
  role: { type: String, enum: ['manager', 'it', 'hr'], required: true },
  label: { type: String, required: true },
  // Whoever is allowed to act on this stage — for "manager" this is just the
  // one reporting manager; for "it"/"hr" this is the itTeam/hrTeam list from
  // OffboardingSettings at the time the request was created (any one of them
  // approving is enough).
  approvers: [{ id: String, name: String, email: String }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  actedByEmail: { type: String, default: '' },
  actedByName: { type: String, default: '' },
  actedAt: { type: Date, default: null },
  comment: { type: String, default: '' },
}, { _id: false });

const offboardingRequestSchema = new mongoose.Schema({
  requestNumber: { type: String, unique: true },

  targetUser: {
    id: String,               // Azure AD object id — used for disable/delete
    name: String,
    email: String,
    reportingManagerName: { type: String, default: 'N/A' },
    reportingManagerEmail: { type: String, default: '' },
    licenseAssigned: String,
    phoneNumber: String,
    officeLocation: String,
  },

  actionType: { type: String, enum: ['disable', 'delete'], required: true },
  scheduleType: { type: String, enum: ['immediate', 'scheduled'], required: true },
  scheduledAt: { type: Date, default: null },

  // pending_approval -> (stage by stage) -> approved_awaiting_schedule (if scheduled)
  // -> completed, OR failed / rejected at any point.
  status: {
    type: String,
    enum: ['pending_approval', 'cancelled', 'completed', 'rejected', 'failed'],
    default: 'pending_approval',
  },
  currentStage: { type: Number, default: 1 },
  stages: [offboardingStageSchema],

  createdBy: String,
  createdByName: String,
  createdByEmail: String,

  executedAt: { type: Date, default: null },
  executionError: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },

  history: [{
    action: String,
    by: String,
    at: { type: Date, default: Date.now },
    notes: String,
  }],
}, { timestamps: true });

// ---- Atomic requestNumber counter (prefix "OFB"), same pattern as REQ/HRQ:
// findOneAndUpdate + $inc on a dedicated counters collection is a single
// atomic Mongo operation, so two simultaneous submits can never collide.

offboardingRequestSchema.pre("save", async function (next) {
  if (this.isNew) {
    this.requestNumber = undefined;
  }
  if (!this.requestNumber) {
    const prefix = 'HRQ';
    const HrRequestModel = mongoose.model("HrRequest");
    const OffboardingModel = mongoose.model("OffboardingRequest");
    let attempt = 0;
    while (attempt < 5) {
      // Check HrRequest collection
      const lastHr = await HrRequestModel
        .findOne({ requestNumber: { $regex: new RegExp(`^${prefix}-\\d+$`) } })
        .sort({ requestNumber: -1 })
        .collation({ locale: "en_US", numericOrdering: true })
        .select("requestNumber")
        .lean();
      
      // Check OffboardingRequest collection
      const lastOffboarding = await OffboardingModel
        .findOne({ requestNumber: { $regex: new RegExp(`^${prefix}-\\d+$`) } })
        .sort({ requestNumber: -1 })
        .collation({ locale: "en_US", numericOrdering: true })
        .select("requestNumber")
        .lean();
      
      let highestNum = 0;
      if (lastHr?.requestNumber) {
        const num = parseInt(lastHr.requestNumber.replace(`${prefix}-`, ''), 10);
        if (num > highestNum) highestNum = num;
      }
      if (lastOffboarding?.requestNumber) {
        const num = parseInt(lastOffboarding.requestNumber.replace(`${prefix}-`, ''), 10);
        if (num > highestNum) highestNum = num;
      }
      
      const candidate = `${prefix}-${String(highestNum + 1).padStart(4, "0")}`;
      
      // Check if candidate exists in EITHER collection
      const existsInHr = await HrRequestModel.exists({ requestNumber: candidate });
      const existsInOffboarding = await OffboardingModel.exists({ requestNumber: candidate });
      
      if (!existsInHr && !existsInOffboarding) {
        this.requestNumber = candidate;
        break;
      }
      attempt++;
    }
    if (!this.requestNumber) {
      this.requestNumber = `${prefix}-${Date.now()}`;
    }
  }
  next();
});

const OffboardingRequest = mongoose.model("OffboardingRequest", offboardingRequestSchema);

// ===================== OFFBOARDING: AZURE ACTIONS =====================

const disableAzureUser = async (azureUserId) => {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(azureUserId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ accountEnabled: false }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Azure disable failed: ${errorText}`);
  }
  return true;
};

const deleteAzureUser = async (azureUserId) => {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(azureUserId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const errorText = await res.text();
    throw new Error(`Azure delete failed: ${errorText}`);
  }
  return true;
};

// ===================== OFFBOARDING: HELPERS =====================

// Builds the stage list for a request, pulling itTeam/hrTeam straight from
// the OffboardingSettings document passed in (fetched once per submit call).
const buildOffboardingStages = (actionType, targetUser, offboardingSettings) => {
  const itApprovers = (offboardingSettings?.itTeam || []).map(m => ({ 
    id: m.id, 
    name: m.displayName, 
    email: m.mail 
  }));
  const hrApprovers = (offboardingSettings?.hrTeam || []).map(m => ({ 
    id: m.id, 
    name: m.displayName, 
    email: m.mail 
  }));

  const stages = [];

  // Reporting Manager Approval — only added when the employee actually has
  // a reporting manager on file. Previously this stage was always created
  // (with an empty approvers list when there was no manager), which left
  // the request stuck forever since nobody could ever approve an
  // approver-less stage. Now, if there's no manager, we skip this stage
  // entirely and the request starts directly at IT Team Approval.
  if (targetUser.reportingManagerEmail) {
    stages.push({
      stage: stages.length + 1,
      role: 'manager',
      label: 'Reporting Manager Approval',
      approvers: [{ id: '', name: targetUser.reportingManagerName || '', email: targetUser.reportingManagerEmail }],
      status: 'pending',
    });
  }

  stages.push({
    stage: stages.length + 1,
    role: 'it',
    label: 'IT Team Approval',
    approvers: itApprovers,
    status: 'pending',
  });

  if (actionType === 'delete') {
    stages.push({
      stage: stages.length + 1,
      role: 'hr',
      label: 'HR Approval',
      approvers: hrApprovers,
      status: 'pending',
    });
  }

  // stage numbers are always assigned by array position (1-based) above, so
  // they stay contiguous (1, 2[, 3]) no matter which stages were included —
  // this matters because request.currentStage is used both as a 1-based
  // index into `stages` and compared directly against `stages.length`.
  return stages;
};

// ✅ UPDATED: Check if actor is authorized for a stage
// - If approver is a user (individual email), do exact match
// - If approver is a group (distribution list), check if actor is a member
const isAuthorizedForStage = async (stage, actorEmail, actorId = null) => {
  const email = (actorEmail || '').toLowerCase().trim();
  if (!email) return false;

  const approvers = stage.approvers || [];
  
  for (const approver of approvers) {
    const approverEmail = (approver.email || '').toLowerCase().trim();
    if (!approverEmail) continue;

    // Always try a direct match first — this covers individual-user
    // approvers (e.g. the reporting manager) regardless of whether their
    // address happens to contain '@' (every real email does, so this must
    // run unconditionally rather than only for non-'@' values).
    if (approverEmail === email) return true;

    // Otherwise, check if this approver is actually a group (distribution
    // list / AAD group) and whether the actor is a member of it.
    try {
      const token = await getAccessToken();
      
      // First, check if the approver email is a group
      const groupRes = await fetch(
        `https://graph.microsoft.com/v1.0/groups?$filter=mail eq '${encodeURIComponent(approverEmail)}'&$select=id,displayName,mail`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (!groupRes.ok) continue;
      
      const groupData = await groupRes.json();
      const group = (groupData.value || [])[0];
      
      if (!group || !group.id) continue;

      // Check if the actor is a member of this group using checkMemberGroups
      const checkRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/checkMemberGroups`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ groupIds: [group.id] })
        }
      );
      
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (Array.isArray(checkData.value) && checkData.value.includes(group.id)) {
          return true;
        }
      }
    } catch (err) {
      console.error(`❌ [OFFBOARDING] Error checking group membership for ${approverEmail}:`, err.message);
    }
  }

  return false;
};

// ✅ NEW: Helper to check if a user is a member of any of the groups in approvers list
const isUserInApproverGroups = async (email, approvers) => {
  if (!email || !approvers || approvers.length === 0) return false;
  
  try {
    const token = await getAccessToken();
    
    // Get all group IDs from approvers that look like groups (have @ in email)
    const groupEmails = approvers
      .map(a => a.email)
      .filter(e => e && e.includes('@'));
    
    if (groupEmails.length === 0) return false;
    
    // Fetch group IDs for these emails
    const groupIds = [];
    for (const groupEmail of groupEmails) {
      const groupRes = await fetch(
        `https://graph.microsoft.com/v1.0/groups?$filter=mail eq '${encodeURIComponent(groupEmail)}'&$select=id`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (groupRes.ok) {
        const data = await groupRes.json();
        const group = (data.value || [])[0];
        if (group && group.id) {
          groupIds.push(group.id);
        }
      }
    }
    
    if (groupIds.length === 0) return false;
    
    // Check if user is a member of any of these groups
    const checkRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/checkMemberGroups`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ groupIds })
      }
    );
    
    if (checkRes.ok) {
      const data = await checkRes.json();
      return Array.isArray(data.value) && data.value.some(id => groupIds.includes(id));
    }
  } catch (err) {
    console.error('❌ [OFFBOARDING] Error checking group membership:', err.message);
  }
  
  return false;
};

const prodUrlForOffboarding = () => process.env.PROD_URL || '';

const sendOffboardingStageEmail = async (request) => {
  const stage = request.stages[request.currentStage - 1];
  if (!stage) return;
  const recipients = (stage.approvers || []).map(a => a.email).filter(Boolean);
  if (recipients.length === 0) {
    console.warn(`⚠️ [OFFBOARDING] ${request.requestNumber}: stage ${stage.stage} (${stage.label}) has no approvers configured — email not sent. Check Offboarding Settings.`);
    return;
  }
  const actionLabel = request.actionType === 'delete' ? 'Delete' : 'Disable';
  const html = buildHtmlEmail({
    title: `📋 Offboarding Approval Needed: ${request.requestNumber}`,
    subtitle: `${stage.label} — Stage ${stage.stage}`,
    statusColor: '#e98404',
    fields: [
      { label: "Request No.", value: request.requestNumber },
      { label: "Employee", value: `${request.targetUser.name} (${request.targetUser.email})` },
      { label: "Action", value: actionLabel },
      { label: "Schedule", value: request.scheduleType === 'scheduled' ? `Scheduled for ${new Date(request.scheduledAt).toLocaleString()}` : 'Immediate' },
      { label: "Requested By", value: request.createdByName || request.createdByEmail },
    ],
    description: `Please review and approve or reject this ${actionLabel.toLowerCase()} request for ${request.targetUser.name}.`,
    actionLink: `${prodUrlForOffboarding()}/offboarding-request/${request._id}`,
    actionText: 'Review Request',
  });
  await sendEmail(recipients, `[OFFBOARDING] ${request.requestNumber} - Approval Needed (Stage ${stage.stage})`, html);
};

const sendOffboardingStatusEmail = async (request, subject, subtitle, description) => {
  const html = buildHtmlEmail({
    title: `Offboarding ${request.requestNumber}`,
    subtitle,
    statusColor: request.status === 'failed' || request.status === 'rejected' ? '#ef4444' : '#10b981',
    fields: [
      { label: "Request No.", value: request.requestNumber },
      { label: "Employee", value: `${request.targetUser.name} (${request.targetUser.email})` },
      { label: "Action", value: request.actionType === 'delete' ? 'Delete' : 'Disable' },
      { label: "Status", value: request.status },
    ],
    description,
    actionLink: `${prodUrlForOffboarding()}/offboarding-request/${request._id}`,
    actionText: 'View Request',
  });
  if (request.createdByEmail) {
    await sendEmail(request.createdByEmail, subject, html);
  }
};

// Runs the actual Azure action once all stages are approved AND (for
// scheduled requests) the scheduled time has arrived. Never runs early.
const executeOffboardingAction = async (request) => {
  try {
    if (request.actionType === 'disable') {
      await disableAzureUser(request.targetUser.id);
    } else {
      await deleteAzureUser(request.targetUser.id);
    }
    request.status = 'completed';
    request.executedAt = new Date();
    request.history.push({ action: 'executed', by: 'system', at: new Date(), notes: `${request.actionType} completed in Azure AD` });
    await request.save();
    console.log(`✅ [OFFBOARDING] ${request.requestNumber}: ${request.actionType} executed for ${request.targetUser.email}`);
    await sendOffboardingStatusEmail(
      request,
      `[OFFBOARDING] ${request.requestNumber} - Completed`,
      `${request.actionType === 'delete' ? 'Account deleted' : 'Account disabled'}`,
      `${request.targetUser.name}'s Azure account has been ${request.actionType === 'delete' ? 'deleted' : 'disabled'}.`
    );
  } catch (err) {
    request.status = 'failed';
    request.executionError = err.message;
    request.history.push({ action: 'execution_failed', by: 'system', at: new Date(), notes: err.message });
    await request.save();
    console.error(`❌ [OFFBOARDING] ${request.requestNumber}: execution failed:`, err.message);
    await sendOffboardingStatusEmail(
      request,
      `[OFFBOARDING] ${request.requestNumber} - Action FAILED`,
      'Manual action required',
      `Automatic ${request.actionType} failed for ${request.targetUser.name}: ${err.message}`
    );
  }
};
// ===================== OFFBOARDING ROUTES =====================

// POST /api/offboarding/submit - opens one request per selected employee
app.post("/api/offboarding/submit", async (req, res) => {
  try {
    const {
      selectedUsers, actionType, scheduleType, scheduledAt,
      createdBy, createdByName, createdByEmail,
    } = req.body;

    if (!Array.isArray(selectedUsers) || selectedUsers.length === 0) {
      return res.status(400).json({ message: "No employees selected" });
    }
    if (!['disable', 'delete'].includes(actionType)) {
      return res.status(400).json({ message: "actionType must be 'disable' or 'delete'" });
    }
    if (!['immediate', 'scheduled'].includes(scheduleType)) {
      return res.status(400).json({ message: "scheduleType must be 'immediate' or 'scheduled'" });
    }
    let scheduledDate = null;
    if (scheduleType === 'scheduled') {
      scheduledDate = new Date(scheduledAt);
      if (!scheduledAt || isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ message: "A valid scheduledAt date/time is required for scheduled requests" });
      }
      if (scheduledDate.getTime() <= Date.now()) {
        return res.status(400).json({ message: "scheduledAt must be in the future" });
      }
    }

    // Read IT/HR approvers from the OffboardingSettings page (DB), once, for
    // this whole batch — NOT from a config file or env var.
    const offboardingSettings = await OffboardingSettings.findOne().lean();
    if (!offboardingSettings || (offboardingSettings.itTeam || []).length === 0) {
      console.warn('⚠️ [OFFBOARDING] No IT team configured in Offboarding Settings — stage 2 will have no approvers.');
    }
    if (actionType === 'delete' && (!offboardingSettings || (offboardingSettings.hrTeam || []).length === 0)) {
      console.warn('⚠️ [OFFBOARDING] No HR team configured in Offboarding Settings — stage 3 will have no approvers.');
    }

    const created = [];
    for (const u of selectedUsers) {
      const targetUser = {
        id: u.id,
        name: u.name,
        email: u.email,
        reportingManagerName: u.reportingManager || 'N/A',
        reportingManagerEmail: u.reportingManagerEmail || '',
        licenseAssigned: u.licenseAssigned,
        phoneNumber: u.phoneNumber,
        officeLocation: u.officeLocation,
      };

      const request = new OffboardingRequest({
        targetUser,
        actionType,
        scheduleType,
        scheduledAt: scheduledDate,
        status: 'pending_approval',
        currentStage: 1,
        stages: buildOffboardingStages(actionType, targetUser, offboardingSettings),
        createdBy,
        createdByName,
        createdByEmail,
        history: [{ action: 'created', by: createdByName || createdByEmail, at: new Date(), notes: `Offboarding (${actionType}, ${scheduleType}) submitted` }],
      });

      await request.save();
      created.push(request);
      console.log(`✅ [OFFBOARDING] Created ${request.requestNumber} for ${targetUser.email}`);
    }

    res.json({
      message: `Offboarding request${created.length > 1 ? 's' : ''} submitted for ${created.length} employee(s)`,
      requests: created.map(r => ({ id: r._id, requestNumber: r.requestNumber, employee: r.targetUser.email })),
    });

    // Fire stage-1 emails after responding, so a slow mail send doesn't hold up the request.
    // Note: stage 1 isn't always "Reporting Manager Approval" anymore — when
    // an employee has no reporting manager on file, buildOffboardingStages()
    // skips that stage, so stage 1 is IT Team Approval instead. We always
    // just email whoever is actually at stage 1; sendOffboardingStageEmail
    // already warns (and no-ops) if that stage has no approvers configured.
    setImmediate(async () => {
      for (const request of created) {
        try {
          await sendOffboardingStageEmail(request);
        } catch (err) {
          console.error(`❌ [OFFBOARDING] Failed to send stage-1 email for ${request.requestNumber}:`, err.message);
        }
      }
    });
  } catch (err) {
    console.error("❌ [OFFBOARDING] Submit error:", err);
    res.status(500).json({ message: "Failed to submit offboarding request", error: err.message });
  }
});

// GET /api/offboarding - list all offboarding requests
app.get("/api/offboarding", async (req, res) => {
  try {
    const requests = await OffboardingRequest.find().sort({ createdAt: -1 }).lean();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch offboarding requests", error: err.message });
  }
});
app.delete("/api/offboarding/:id", async (req, res) => {
  try {
    const request = await OffboardingRequest.findByIdAndDelete(req.params.id);

    if (!request) {
      return res.status(404).json({
        message: "Offboarding request not found"
      });
    }

    res.json({
      message: "Offboarding request deleted successfully"
    });
  } catch (err) {
    console.error("Delete offboarding error:", err);
    res.status(500).json({
      message: "Failed to delete offboarding request",
      error: err.message
    });
  }
});
// GET /api/offboarding/:id
app.get("/api/offboarding/:id", async (req, res) => {
  try {
    const request = await OffboardingRequest.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ message: "Offboarding request not found" });
    res.json(request);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch offboarding request", error: err.message });
  }
});

// POST /api/offboarding/:id/remind - Send reminder to current stage approvers
app.post("/api/offboarding/:id/remind", async (req, res) => {
  try {
    const { actorEmail, actorName } = req.body;
    
    // Validate actor
    if (!actorEmail) {
      return res.status(400).json({ message: "Actor email is required" });
    }

    const request = await OffboardingRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Offboarding request not found" });
    }

    // ✅ Check if the actor is the CREATOR of the request
    const creatorEmail = (request.createdByEmail || "").toLowerCase().trim();
    const actorEmailLower = actorEmail.toLowerCase().trim();
    
    if (creatorEmail !== actorEmailLower) {
      return res.status(403).json({ 
        message: "Only the request creator can send reminders" 
      });
    }

    // ✅ Check if request is still pending approval
    if (request.status !== 'pending_approval') {
      return res.status(400).json({ 
        message: `Cannot send reminder. Request status is "${request.status}", not pending approval.` 
      });
    }

    // ✅ Get current stage
    const stageIdx = request.currentStage - 1;
    const stage = request.stages[stageIdx];
    if (!stage) {
      return res.status(400).json({ message: "No current stage found" });
    }

    // ✅ Check if stage has approvers
    const recipients = (stage.approvers || []).map(a => a.email).filter(Boolean);
    if (recipients.length === 0) {
      return res.status(400).json({ 
        message: `Stage ${stage.stage} (${stage.label}) has no approvers configured. Cannot send reminder.` 
      });
    }

    // ✅ Send the reminder email using existing function
    await sendOffboardingStageEmail(request);

    // ✅ Add history entry
    request.history = request.history || [];
    request.history.push({
      action: 'reminder_sent',
      by: actorName || actorEmail,
      at: new Date(),
      notes: `Reminder sent to ${stage.label} approvers (Stage ${stage.stage})`
    });
    await request.save();

    console.log(`✅ [OFFBOARDING] Reminder sent for ${request.requestNumber} (Stage ${stage.stage}) by ${actorEmail}`);

    res.json({
      success: true,
      message: `Reminder sent to ${stage.label} approvers`,
      requestNumber: request.requestNumber,
      stage: stage.stage,
      recipientsCount: recipients.length
    });

  } catch (err) {
    console.error("❌ [OFFBOARDING] Reminder error:", err);
    res.status(500).json({ 
      message: "Failed to send reminder", 
      error: err.message 
    });
  }
});

// POST /api/offboarding/:id/cancel-schedule
app.post("/api/offboarding/:id/cancel-schedule", async (req, res) => {
  try {
    const { actorEmail, actorName, reason } = req.body;
    
    // Validate actor
    if (!actorEmail) {
      return res.status(400).json({ message: "Actor email is required" });
    }
    
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "Cancellation reason is required" });
    }

    const request = await OffboardingRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Offboarding request not found" });
    }

    // ✅ Check if the actor is the CREATOR of the request
    const creatorEmail = (request.createdByEmail || "").toLowerCase().trim();
    const actorEmailLower = actorEmail.toLowerCase().trim();
    
    if (creatorEmail !== actorEmailLower) {
      return res.status(403).json({ 
        message: "Only the request creator can cancel the schedule" 
      });
    }

    // ✅ Check if request is in approved_awaiting_schedule status
    if (request.status !== 'approved_awaiting_schedule') {
      return res.status(400).json({ 
        message: `Cannot cancel schedule. Request status is "${request.status}", not awaiting schedule.` 
      });
    }

    // ✅ Check if it's a scheduled request
    if (request.scheduleType !== 'scheduled') {
      return res.status(400).json({ 
        message: "Cannot cancel schedule for immediate requests" 
      });
    }

    // ✅ Store the stages and details before modifying
    const stages = request.stages || [];
    const currentStageIdx = request.currentStage - 1;
    const currentStage = stages[currentStageIdx] || null;
    
    // Collect all approvers who have already approved (completed stages)
    const approvedApprovers = [];
    const approvedStageLabels = [];
    
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (stage.status === 'approved') {
        for (const approver of (stage.approvers || [])) {
          const email = approver.email || approver.mail;
          if (email && !approvedApprovers.includes(email)) {
            approvedApprovers.push(email);
          }
        }
        approvedStageLabels.push(`Stage ${stage.stage} (${stage.label})`);
      }
    }
    
    // Collect current stage approvers (pending stage)
    const currentApprovers = [];
    if (currentStage && currentStage.status === 'pending') {
      for (const approver of (currentStage.approvers || [])) {
        const email = approver.email || approver.mail;
        if (email && !currentApprovers.includes(email)) {
          currentApprovers.push(email);
        }
      }
    }
    
    // ✅ Update request status to cancelled
    request.status = 'cancelled';
    request.cancelledReason = reason.trim();
    request.history = request.history || [];
    request.history.push({
      action: 'schedule_cancelled',
      by: actorName || actorEmail,
      at: new Date(),
      notes: `Schedule cancelled by ${actorName || actorEmail}. Reason: ${reason.trim()}`
    });
    
    await request.save();
    
    console.log(`✅ [OFFBOARDING] ${request.requestNumber} schedule cancelled by ${actorEmail}`);
    
    // ✅ Send email notifications
    setImmediate(async () => {
      try {
        const prodUrl = process.env.PROD_URL;
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const actionLabel = request.actionType === 'delete' ? 'Delete' : 'Disable';
        
        // Build the list of recipients (deduplicated)
        const allRecipients = new Set();
        
        // 1. Creator always gets notified
        if (request.createdByEmail) {
          allRecipients.add(request.createdByEmail);
        }
        
        // 2. Approved stage approvers
        for (const email of approvedApprovers) {
          allRecipients.add(email);
        }
        
        // 3. Current stage approvers
        for (const email of currentApprovers) {
          allRecipients.add(email);
        }
        
        // Remove duplicates and filter
        const recipientList = [...allRecipients].filter(Boolean);
        
        if (recipientList.length === 0) {
          console.log(`⚠️ [OFFBOARDING] No recipients for cancellation notification`);
          return;
        }
        
        // Build the email content
        const stageInfo = [];
        if (approvedStageLabels.length > 0) {
          stageInfo.push(`✅ Approved Stages: ${approvedStageLabels.join(', ')}`);
        }
        if (currentStage) {
          stageInfo.push(`⏳ Pending Stage: Stage ${currentStage.stage} (${currentStage.label})`);
        }
        
        const emailFields = [
          { label: "Request No.", value: request.requestNumber },
          { label: "Employee", value: `${request.targetUser.name} (${request.targetUser.email})` },
          { label: "Action", value: actionLabel },
          { label: "Original Schedule", value: request.scheduledAt ? new Date(request.scheduledAt).toLocaleString() : 'N/A' },
          { label: "Cancelled By", value: actorName || actorEmail },
          { label: "Cancelled At", value: nowIST },
          { label: "Cancellation Reason", value: reason.trim() },
        ];
        
        const description = `The offboarding schedule for ${request.targetUser.name} has been cancelled.\n\n` +
          `Status: ${request.status.toUpperCase()}\n` +
          `${stageInfo.join('\n')}\n\n` +
          `The ${actionLabel.toLowerCase()} action will NOT be executed.`;
        
        // Determine who gets what message
        const isCreator = (email) => email.toLowerCase() === creatorEmail;
        const isApprovedApprover = (email) => approvedApprovers.some(e => e.toLowerCase() === email.toLowerCase());
        const isCurrentApprover = (email) => currentApprovers.some(e => e.toLowerCase() === email.toLowerCase());
        
        // Send emails individually so we can customize the message
        for (const recipient of recipientList) {
          let customSubtitle = '';
          let customDescription = description;
          
          if (isCreator(recipient)) {
            customSubtitle = `You cancelled the scheduled offboarding for ${request.targetUser.name}`;
          } else if (isApprovedApprover(recipient)) {
            customSubtitle = `The offboarding you approved has been cancelled`;
            customDescription += `\n\nYou previously approved this request. The schedule has been cancelled by the requester.`;
          } else if (isCurrentApprover(recipient)) {
            customSubtitle = `The offboarding request awaiting your approval has been cancelled`;
            customDescription += `\n\nNo further action is needed from you. The request has been cancelled by the requester.`;
          } else {
            customSubtitle = `Offboarding request cancelled`;
          }
          
          const html = buildHtmlEmail({
            title: `🚫 Offboarding Schedule Cancelled: ${request.requestNumber}`,
            subtitle: customSubtitle,
            statusColor: "#6b7280",
            fields: emailFields,
            description: customDescription,
            actionLink: `${prodUrl}/offboarding-request/${request._id}`,
            actionText: "View Request",
          });
          
          await sendEmail(
            [recipient],
            `[OFFBOARDING] ${request.requestNumber} - Schedule Cancelled`,
            html
          );
        }
        
        console.log(`✅ [OFFBOARDING] Cancellation notifications sent to ${recipientList.length} recipients`);
        
      } catch (mailErr) {
        console.error("❌ [OFFBOARDING] Cancellation notification error:", mailErr.message);
      }
    });
    
    res.json({
      success: true,
      message: "Schedule cancelled successfully",
      requestNumber: request.requestNumber,
      status: request.status,
      notifiedRecipients: {
        creator: request.createdByEmail ? 1 : 0,
        approvedApprovers: approvedApprovers.length,
        currentApprovers: currentApprovers.length,
        total: [...new Set([request.createdByEmail, ...approvedApprovers, ...currentApprovers].filter(Boolean))].length
      }
    });
    
  } catch (err) {
    console.error("❌ [OFFBOARDING] Cancel schedule error:", err);
    res.status(500).json({ 
      message: "Failed to cancel schedule", 
      error: err.message 
    });
  }
});

// GET /api/offboarding/:id/can-act?email=...
// Tells the frontend whether the given user is authorized to act on the
// request's CURRENT stage — using the exact same isAuthorizedForStage()
// logic the approve/reject routes enforce server-side, including AAD group
// membership resolution the frontend has no way to do on its own.
//
// NOTE: `email` is taken from the query string here because the rest of
// this API currently trusts client-supplied actorEmail on approve/reject
// too. If/when these routes sit behind validated Azure AD auth middleware,
// this should read the email from the verified token instead of the query
// string, the same way approve/reject should.
app.get("/api/offboarding/:id/can-act", async (req, res) => {
  try {
    const email = (req.query.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ message: "email is required" });

    const request = await OffboardingRequest.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ message: "Offboarding request not found" });

    const stageIdx = request.currentStage - 1;
    const stage = request.stages[stageIdx];
    if (!stage) return res.json({ canAct: false });

    const canAct = request.status === 'pending_approval'
      && await isAuthorizedForStage(stage, email);

    res.json({ canAct, stage: stage.stage, stageLabel: stage.label });
  } catch (err) {
    console.error("❌ [OFFBOARDING] can-act check error:", err);
    res.status(500).json({ message: "Failed to check authorization", error: err.message });
  }
});

// POST /api/offboarding/:id/approve
app.post("/api/offboarding/:id/approve", async (req, res) => {
  try {
    const { actorEmail, actorName, actorId, comment } = req.body;
    const request = await OffboardingRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Offboarding request not found" });
    if (request.status !== 'pending_approval') {
      return res.status(400).json({ message: `Request is not pending approval (current status: ${request.status})` });
    }

    const stageIdx = request.currentStage - 1;
    const stage = request.stages[stageIdx];
    if (!stage) return res.status(400).json({ message: "No current stage found on this request" });

    if (!(await isAuthorizedForStage(stage, actorEmail))) {
      return res.status(403).json({ message: `Only the ${stage.label} approver can approve this stage` });
    }

    stage.status = 'approved';
    stage.actedByEmail = actorEmail || '';
    stage.actedByName = actorName || actorEmail || '';
    stage.actedAt = new Date();
    stage.comment = comment || '';
    request.history.push({ action: 'stage_approved', by: actorName || actorEmail, at: new Date(), notes: `Stage ${stage.stage} (${stage.label}) approved` });

    const isLastStage = request.currentStage >= request.stages.length;

    if (!isLastStage) {
      request.currentStage += 1;
      await request.save();
      res.json({ message: `Stage ${stage.stage} approved. Moved to stage ${request.currentStage}.`, requestNumber: request.requestNumber, status: request.status });

      setImmediate(async () => {
        try { await sendOffboardingStageEmail(request); }
        catch (err) { console.error(`❌ [OFFBOARDING] Failed to send stage email for ${request.requestNumber}:`, err.message); }
      });
      return;
    }

    // All stages approved.
    if (request.scheduleType === 'immediate') {
      await request.save();
      res.json({ message: `All stages approved. Executing ${request.actionType} now.`, requestNumber: request.requestNumber });
      setImmediate(() => executeOffboardingAction(request));
    } else {
      // Scheduled: do NOT act now, no matter how early approvals finished.
      // The background scheduler below will execute it once scheduledAt arrives.
      request.status = 'approved_awaiting_schedule';
      request.history.push({ action: 'all_stages_approved', by: 'system', at: new Date(), notes: `All approvals complete. Waiting for scheduled time: ${request.scheduledAt}` });
      await request.save();
      res.json({ message: `All stages approved. ${request.actionType} will run at the scheduled time.`, requestNumber: request.requestNumber, scheduledAt: request.scheduledAt });
      setImmediate(async () => {
        try {
          await sendOffboardingStatusEmail(
            request,
            `[OFFBOARDING] ${request.requestNumber} - Approved, Scheduled`,
            'All approvals complete',
            `All approvals are complete for ${request.targetUser.name}. The ${request.actionType} action is scheduled for ${new Date(request.scheduledAt).toLocaleString()}.`
          );
        } catch (err) {
          console.error(`❌ [OFFBOARDING] Failed to send schedule-confirmation email for ${request.requestNumber}:`, err.message);
        }
      });
    }
  } catch (err) {
    console.error("❌ [OFFBOARDING] Approve error:", err);
    res.status(500).json({ message: "Failed to approve offboarding request", error: err.message });
  }
});

// POST /api/offboarding/:id/reject
app.post("/api/offboarding/:id/reject", async (req, res) => {
  try {
    const { actorEmail, actorName, reason } = req.body;
    const request = await OffboardingRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Offboarding request not found" });
    if (request.status !== 'pending_approval') {
      return res.status(400).json({ message: `Request is not pending approval (current status: ${request.status})` });
    }

    const stageIdx = request.currentStage - 1;
    const stage = request.stages[stageIdx];
    if (!stage) return res.status(400).json({ message: "No current stage found on this request" });

    if (!(await isAuthorizedForStage(stage, actorEmail))) {
      return res.status(403).json({ message: `Only the ${stage.label} approver can reject this stage` });
    }

    stage.status = 'rejected';
    stage.actedByEmail = actorEmail || '';
    stage.actedByName = actorName || actorEmail || '';
    stage.actedAt = new Date();
    stage.comment = reason || '';

    request.status = 'rejected';
    request.rejectionReason = reason || '';
    request.history.push({ action: 'rejected', by: actorName || actorEmail, at: new Date(), notes: `Stage ${stage.stage} (${stage.label}) rejected: ${reason || 'no reason given'}` });
    await request.save();

    console.log(`❌ [OFFBOARDING] ${request.requestNumber} rejected at stage ${stage.stage} by ${actorEmail}`);
    res.json({ message: "Offboarding request rejected", requestNumber: request.requestNumber });

    setImmediate(async () => {
      try {
        await sendOffboardingStatusEmail(
          request,
          `[OFFBOARDING] ${request.requestNumber} - Rejected`,
          `Rejected at ${stage.label}`,
          `${request.targetUser.name}'s ${request.actionType} request was rejected at stage ${stage.stage} (${stage.label})${reason ? `: ${reason}` : '.'}`
        );
      } catch (err) {
        console.error(`❌ [OFFBOARDING] Failed to send rejection email for ${request.requestNumber}:`, err.message);
      }
    });
  } catch (err) {
    console.error("❌ [OFFBOARDING] Reject error:", err);
    res.status(500).json({ message: "Failed to reject offboarding request", error: err.message });
  }
});

// ===================== OFFBOARDING SCHEDULER =====================
// Polls for requests that are fully approved and scheduled, and whose
// scheduled time has arrived. Requests still stuck in pending_approval are
// never touched here, no matter how late scheduledAt is — unapproved
// requests just stay pending until someone approves or rejects them.
const OFFBOARDING_SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

const runScheduledOffboardingActions = async () => {
  try {
    const due = await OffboardingRequest.find({
      status: 'approved_awaiting_schedule',
      scheduledAt: { $lte: new Date() },
    });
    if (due.length === 0) return;
    console.log(`🔵 [OFFBOARDING SCHEDULER] ${due.length} request(s) due for execution`);
    for (const request of due) {
      await executeOffboardingAction(request);
    }
  } catch (err) {
    console.error("❌ [OFFBOARDING SCHEDULER] Error:", err.message);
  }
};

const startOffboardingScheduler = () => {
  // Run once shortly after startup (covers anything that came due while the
  // server was offline), then on a fixed interval after that.
  setTimeout(runScheduledOffboardingActions, 30 * 1000);
  setInterval(runScheduledOffboardingActions, OFFBOARDING_SCHEDULER_INTERVAL_MS);
  console.log(`✅ [OFFBOARDING SCHEDULER] Started (checking every ${OFFBOARDING_SCHEDULER_INTERVAL_MS / 60000} min)`);
};

// ===================== DEPARTMENT SCHEMA =====================
const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, default: '' },
  createdBy: { id: String, name: String, email: String },
}, { timestamps: true });

const Department = mongoose.model('Department', departmentSchema);

// ===================== DEPARTMENT ROUTES =====================

// GET /api/departments
app.get('/api/departments', async (req, res) => {
  try {
    const departments = await Department.find().sort({ name: 1 });
    res.json(departments);
  } catch (err) {
    console.error('❌ Get departments error:', err);
    res.status(500).json({ message: 'Failed to fetch departments' });
  }
});

// POST /api/departments
app.post('/api/departments', async (req, res) => {
  try {
    const { name, description, createdBy } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Department name is required' });
    }

    // Check for duplicate
    const existing = await Department.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
    });
    if (existing) {
      return res.status(400).json({ message: `Department "${name.trim()}" already exists` });
    }

    const department = new Department({
      name: name.trim(),
      description: description || '',
      createdBy: createdBy || {},
    });

    await department.save();
    console.log(`✅ [DEPARTMENT] Created: ${name.trim()}`);
    res.status(201).json(department);

    // ✅ Send email notification to creator
    setImmediate(async () => {
      try {
        const actorEmail = createdBy?.email || createdBy?.mail;
        const actorName = createdBy?.name || 'Admin';
        
        if (actorEmail) {
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          const html = buildHtmlEmail({
            title: `✅ Department Created: ${name.trim()}`,
            subtitle: `Department created successfully`,
            statusColor: "#16a34a",
            fields: [
              { label: "Action", value: "CREATED" },
              { label: "Department Name", value: name.trim() },
              { label: "Description", value: description || '—' },
              { label: "Performed By", value: actorName },
              { label: "Performed At (IST)", value: nowIST },
            ],
            description: `The department "${name.trim()}" has been created successfully.`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          
          await sendEmail(actorEmail, `[DEPARTMENT] Created: ${name.trim()}`, html);
          console.log(`✅ [DEPARTMENT] Creation notification sent to ${actorEmail}`);
        }
      } catch (mailErr) {
        console.error("❌ [DEPARTMENT] Creation notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error('❌ Create department error:', err);
    res.status(500).json({ message: 'Failed to create department', error: err.message });
  }
});

// PUT /api/departments/:id
app.put('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, updatedBy } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Department name is required' });
    }

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    const oldName = department.name;

    // Check for duplicate (excluding current)
    const existing = await Department.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      _id: { $ne: id }
    });
    if (existing) {
      return res.status(400).json({ message: `Department "${name.trim()}" already exists` });
    }

    department.name = name.trim();
    department.description = description || '';
    await department.save();

    console.log(`✅ [DEPARTMENT] Updated: ${name.trim()}`);
    res.json(department);

    // ✅ Send email notification to updater
    setImmediate(async () => {
      try {
        const actorEmail = updatedBy?.email || updatedBy?.mail;
        const actorName = updatedBy?.name || 'Admin';
        
        if (actorEmail) {
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          const changeDetails = [];
          if (oldName !== name.trim()) {
            changeDetails.push(`• Name changed from "${oldName}" to "${name.trim()}"`);
          }
          if (department.description !== description) {
            changeDetails.push(`• Description was updated`);
          }
          
          const html = buildHtmlEmail({
            title: `✅ Department Updated: ${name.trim()}`,
            subtitle: `Department updated successfully`,
            statusColor: "#16a34a",
            fields: [
              { label: "Action", value: "UPDATED" },
              { label: "Department Name", value: name.trim() },
              { label: "Performed By", value: actorName },
              { label: "Performed At (IST)", value: nowIST },
            ],
            description: `The department has been updated successfully.\n\nChanges made:\n${changeDetails.join('\n') || '• Minor updates were made'}`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          
          await sendEmail(actorEmail, `[DEPARTMENT] Updated: ${name.trim()}`, html);
          console.log(`✅ [DEPARTMENT] Update notification sent to ${actorEmail}`);
        }
      } catch (mailErr) {
        console.error("❌ [DEPARTMENT] Update notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error('❌ Update department error:', err);
    res.status(500).json({ message: 'Failed to update department', error: err.message });
  }
});

// DELETE /api/departments/:id
app.delete('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deletedBy } = req.body;
    
    const department = await Department.findById(id);
    
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    const deptName = department.name;
    await Department.findByIdAndDelete(id);
    
    console.log(`✅ [DEPARTMENT] Deleted: ${deptName}`);
    res.json({ message: `Department "${deptName}" deleted successfully` });

    // ✅ Send email notification to deleter
    setImmediate(async () => {
      try {
        const actorEmail = deletedBy?.email || deletedBy?.mail;
        const actorName = deletedBy?.name || 'Admin';
        
        if (actorEmail) {
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          const html = buildHtmlEmail({
            title: `✅ Department Deleted: ${deptName}`,
            subtitle: `Department deleted successfully`,
            statusColor: "#16a34a",
            fields: [
              { label: "Action", value: "DELETED" },
              { label: "Department Name", value: deptName },
              { label: "Performed By", value: actorName },
              { label: "Performed At (IST)", value: nowIST },
            ],
            description: `The department "${deptName}" has been deleted successfully.`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          
          await sendEmail(actorEmail, `[DEPARTMENT] Deleted: ${deptName}`, html);
          console.log(`✅ [DEPARTMENT] Deletion notification sent to ${actorEmail}`);
        }
      } catch (mailErr) {
        console.error("❌ [DEPARTMENT] Deletion notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error('❌ Delete department error:', err);
    res.status(500).json({ message: 'Failed to delete department', error: err.message });
  }
});

// ===================== EMPLOYEE TYPE SCHEMA =====================
const employeeTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, default: '' },
  createdBy: { id: String, name: String, email: String },
}, { timestamps: true });

const EmployeeType = mongoose.model('EmployeeType', employeeTypeSchema);

// ===================== EMPLOYEE TYPE ROUTES =====================

// GET /api/employee-types
app.get('/api/employee-types', async (req, res) => {
  try {
    const employeeTypes = await EmployeeType.find().sort({ name: 1 });
    res.json(employeeTypes);
  } catch (err) {
    console.error('❌ Get employee types error:', err);
    res.status(500).json({ message: 'Failed to fetch employee types' });
  }
});

// POST /api/employee-types
app.post('/api/employee-types', async (req, res) => {
  try {
    const { name, description, createdBy } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Employee type name is required' });
    }

    // Check for duplicate
    const existing = await EmployeeType.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
    });
    if (existing) {
      return res.status(400).json({ message: `Employee type "${name.trim()}" already exists` });
    }

    const employeeType = new EmployeeType({
      name: name.trim(),
      description: description || '',
      createdBy: createdBy || {},
    });

    await employeeType.save();
    console.log(`✅ [EMPLOYEE TYPE] Created: ${name.trim()}`);
    res.status(201).json(employeeType);

    // ✅ Send email notification to creator
    setImmediate(async () => {
      try {
        const actorEmail = createdBy?.email || createdBy?.mail;
        const actorName = createdBy?.name || 'Admin';
        
        if (actorEmail) {
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          const html = buildHtmlEmail({
            title: `✅ Employee Type Created: ${name.trim()}`,
            subtitle: `Employee type created successfully`,
            statusColor: "#16a34a",
            fields: [
              { label: "Action", value: "CREATED" },
              { label: "Employee Type Name", value: name.trim() },
              { label: "Description", value: description || '—' },
              { label: "Performed By", value: actorName },
              { label: "Performed At (IST)", value: nowIST },
            ],
            description: `The employee type "${name.trim()}" has been created successfully.`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          
          await sendEmail(actorEmail, `[EMPLOYEE TYPE] Created: ${name.trim()}`, html);
          console.log(`✅ [EMPLOYEE TYPE] Creation notification sent to ${actorEmail}`);
        }
      } catch (mailErr) {
        console.error("❌ [EMPLOYEE TYPE] Creation notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error('❌ Create employee type error:', err);
    res.status(500).json({ message: 'Failed to create employee type', error: err.message });
  }
});

// PUT /api/employee-types/:id
app.put('/api/employee-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, updatedBy } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Employee type name is required' });
    }

    const employeeType = await EmployeeType.findById(id);
    if (!employeeType) {
      return res.status(404).json({ message: 'Employee type not found' });
    }

    const oldName = employeeType.name;

    // Check for duplicate (excluding current)
    const existing = await EmployeeType.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      _id: { $ne: id }
    });
    if (existing) {
      return res.status(400).json({ message: `Employee type "${name.trim()}" already exists` });
    }

    employeeType.name = name.trim();
    employeeType.description = description || '';
    await employeeType.save();

    console.log(`✅ [EMPLOYEE TYPE] Updated: ${name.trim()}`);
    res.json(employeeType);

    // ✅ Send email notification to updater
    setImmediate(async () => {
      try {
        const actorEmail = updatedBy?.email || updatedBy?.mail;
        const actorName = updatedBy?.name || 'Admin';
        
        if (actorEmail) {
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          const changeDetails = [];
          if (oldName !== name.trim()) {
            changeDetails.push(`• Name changed from "${oldName}" to "${name.trim()}"`);
          }
          if (employeeType.description !== description) {
            changeDetails.push(`• Description was updated`);
          }
          
          const html = buildHtmlEmail({
            title: `✅ Employee Type Updated: ${name.trim()}`,
            subtitle: `Employee type updated successfully`,
            statusColor: "#16a34a",
            fields: [
              { label: "Action", value: "UPDATED" },
              { label: "Employee Type Name", value: name.trim() },
              { label: "Performed By", value: actorName },
              { label: "Performed At (IST)", value: nowIST },
            ],
            description: `The employee type has been updated successfully.\n\nChanges made:\n${changeDetails.join('\n') || '• Minor updates were made'}`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          
          await sendEmail(actorEmail, `[EMPLOYEE TYPE] Updated: ${name.trim()}`, html);
          console.log(`✅ [EMPLOYEE TYPE] Update notification sent to ${actorEmail}`);
        }
      } catch (mailErr) {
        console.error("❌ [EMPLOYEE TYPE] Update notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error('❌ Update employee type error:', err);
    res.status(500).json({ message: 'Failed to update employee type', error: err.message });
  }
});

// DELETE /api/employee-types/:id
app.delete('/api/employee-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deletedBy } = req.body;
    
    const employeeType = await EmployeeType.findById(id);
    
    if (!employeeType) {
      return res.status(404).json({ message: 'Employee type not found' });
    }

    const typeName = employeeType.name;
    await EmployeeType.findByIdAndDelete(id);
    
    console.log(`✅ [EMPLOYEE TYPE] Deleted: ${typeName}`);
    res.json({ message: `Employee type "${typeName}" deleted successfully` });

    // ✅ Send email notification to deleter
    setImmediate(async () => {
      try {
        const actorEmail = deletedBy?.email || deletedBy?.mail;
        const actorName = deletedBy?.name || 'Admin';
        
        if (actorEmail) {
          const prodUrl = process.env.PROD_URL;
          const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          
          const html = buildHtmlEmail({
            title: `✅ Employee Type Deleted: ${typeName}`,
            subtitle: `Employee type deleted successfully`,
            statusColor: "#16a34a",
            fields: [
              { label: "Action", value: "DELETED" },
              { label: "Employee Type Name", value: typeName },
              { label: "Performed By", value: actorName },
              { label: "Performed At (IST)", value: nowIST },
            ],
            description: `The employee type "${typeName}" has been deleted successfully.`,
            actionLink: `${prodUrl}/settings`,
            actionText: "View Settings",
          });
          
          await sendEmail(actorEmail, `[EMPLOYEE TYPE] Deleted: ${typeName}`, html);
          console.log(`✅ [EMPLOYEE TYPE] Deletion notification sent to ${actorEmail}`);
        }
      } catch (mailErr) {
        console.error("❌ [EMPLOYEE TYPE] Deletion notification error:", mailErr.message);
      }
    });

  } catch (err) {
    console.error('❌ Delete employee type error:', err);
    res.status(500).json({ message: 'Failed to delete employee type', error: err.message });
  }
});

// ===================== HR REQUEST TYPE SCHEMA =====================
const hrRequestSchema = new mongoose.Schema({
  emoji: { type: String, default: '📋' },
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, default: '' },
  createdBy: { id: String, name: String, email: String },
}, { timestamps: true });

const HrRequestType = mongoose.model('HrRequestType', hrRequestSchema);

// ===================== HR REQUEST TYPE ROUTES =====================

// GET /api/hr-requests
app.get('/api/hr-requests', async (req, res) => {
  try {
    const hrRequests = await HrRequestType.find().sort({ name: 1 });
    res.json(hrRequests);
  } catch (err) {
    console.error('❌ Get HR request types error:', err);
    res.status(500).json({ message: 'Failed to fetch HR request types' });
  }
});

// POST /api/hr-requests
app.post('/api/hr-requests', async (req, res) => {
  try {
    const { emoji, name, description, createdBy } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!emoji?.trim()) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    // Check for duplicate
    const existing = await HrRequestType.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });
    if (existing) {
      return res.status(400).json({ message: `"${name.trim()}" already exists` });
    }

    const hrRequest = new HrRequestType({
      emoji: emoji.trim(),
      name: name.trim(),
      description: description || '',
      createdBy: createdBy || {},
    });

    await hrRequest.save();
    console.log(`✅ [HR-REQUEST] Created: ${name.trim()}`);
    res.status(201).json(hrRequest);
  } catch (err) {
    console.error('❌ Create HR request type error:', err);
    res.status(500).json({ message: 'Failed to create HR request type', error: err.message });
  }
});

// PUT /api/hr-requests/:id
app.put('/api/hr-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji, name, description } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid HR request type id' });
    }
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!emoji?.trim()) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const hrRequest = await HrRequestType.findById(id);
    if (!hrRequest) {
      return res.status(404).json({ message: 'HR request type not found' });
    }

    // Check for duplicate (excluding current)
    const existing = await HrRequestType.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      _id: { $ne: id }
    });
    if (existing) {
      return res.status(400).json({ message: `"${name.trim()}" already exists` });
    }

    hrRequest.emoji = emoji.trim();
    hrRequest.name = name.trim();
    hrRequest.description = description || '';
    await hrRequest.save();

    console.log(`✅ [HR-REQUEST] Updated: ${name.trim()}`);
    res.json(hrRequest);
  } catch (err) {
    console.error('❌ Update HR request type error:', err);
    res.status(500).json({ message: 'Failed to update HR request type', error: err.message });
  }
});

// DELETE /api/hr-requests/:id
app.delete('/api/hr-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid HR request type id' });
    }

    const hrRequest = await HrRequestType.findById(id);
    if (!hrRequest) {
      return res.status(404).json({ message: 'HR request type not found' });
    }

    const name = hrRequest.name;
    await HrRequestType.findByIdAndDelete(id);

    console.log(`✅ [HR-REQUEST] Deleted: ${name}`);
    res.json({ message: `"${name}" deleted successfully` });
  } catch (err) {
    console.error('❌ Delete HR request type error:', err);
    res.status(500).json({ message: 'Failed to delete HR request type', error: err.message });
  }
});

// ===================== HR ACCESS SCHEMA =====================
const hrAccessSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, default: '' },
  addedBy: { 
    id: { type: String, default: '' },
    name: { type: String, default: '' },
    email: { type: String, default: '' }
  },
  addedAt: { type: Date, default: Date.now },
}, { timestamps: true });

const HrAccess = mongoose.model('HrAccess', hrAccessSchema);

// ===================== HR ACCESS ROUTES =====================

// GET /api/hr-access - List all users with HR access
app.get('/api/hr-access', async (req, res) => {
  try {
    const users = await HrAccess.find().sort({ addedAt: -1 });
    res.json(users);
  } catch (err) {
    console.error('❌ Get HR access users error:', err);
    res.status(500).json({ message: 'Failed to fetch HR access users', error: err.message });
  }
});

// GET /api/hr-access/check?email=user@domain.com - Check if user has HR access
app.get('/api/hr-access/check', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    const user = await HrAccess.findOne({ 
      email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } 
    });
    
    res.json({ 
      hasAccess: !!user,
      user: user ? { id: user._id, email: user.email, name: user.name } : null
    });
  } catch (err) {
    console.error('❌ Check HR access error:', err);
    res.status(500).json({ message: 'Failed to check HR access', error: err.message });
  }
});

// POST /api/hr-access - Add a user to HR access list
app.post('/api/hr-access', async (req, res) => {
  try {
    const { email, name, addedBy } = req.body;
    
    if (!email?.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    // Check if user already exists
    const existing = await HrAccess.findOne({ 
      email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } 
    });
    if (existing) {
      return res.status(400).json({ 
        message: `"${email.trim()}" already has HR access`,
        existing: existing
      });
    }
    
    const user = new HrAccess({
      email: email.trim().toLowerCase(),
      name: name || '',
      addedBy: addedBy || { id: '', name: '', email: '' },
    });
    
    await user.save();
    console.log(`✅ [HR ACCESS] Added: ${email.trim()}`);
    res.status(201).json({ 
      message: `HR access granted to "${email.trim()}"`,
      user: user 
    });
  } catch (err) {
    console.error('❌ Add HR access error:', err);
    res.status(500).json({ message: 'Failed to add HR access user', error: err.message });
  }
});

// DELETE /api/hr-access/:id - Remove a user from HR access list
app.delete('/api/hr-access/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    
    const user = await HrAccess.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const email = user.email;
    await HrAccess.findByIdAndDelete(id);
    
    console.log(`✅ [HR ACCESS] Removed: ${email}`);
    res.json({ 
      message: `HR access removed for "${email}"`,
      email: email 
    });
  } catch (err) {
    console.error('❌ Remove HR access error:', err);
    res.status(500).json({ message: 'Failed to remove HR access user', error: err.message });
  }
});

// DELETE /api/hr-access/email/:email - Remove a user by email
app.delete('/api/hr-access/email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    const user = await HrAccess.findOneAndDelete({ 
      email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } 
    });
    
    if (!user) {
      return res.status(404).json({ message: `User with email "${email}" not found` });
    }
    
    console.log(`✅ [HR ACCESS] Removed by email: ${email}`);
    res.json({ 
      message: `HR access removed for "${email}"`,
      email: email 
    });
  } catch (err) {
    console.error('❌ Remove HR access by email error:', err);
    res.status(500).json({ message: 'Failed to remove HR access user', error: err.message });
  }
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
  startOffboardingScheduler();
});