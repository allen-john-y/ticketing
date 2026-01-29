const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const axios = require("axios");

/**
 * Get an app-only access token for Microsoft Graph (client credentials)
 */
async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append("client_id", process.env.AZURE_CLIENT_ID);
  params.append("client_secret", process.env.AZURE_CLIENT_SECRET);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");

  const response = await axios.post(url, params);
  return response.data.access_token;
}

/**
 * Resolve the SharePoint site id (site collection) using site host + site name
 */
async function getSiteId(token) {
  const siteHost = process.env.SHAREPOINT_SITE;       // e.g. sandezasystems.sharepoint.com
  const siteName = process.env.SHAREPOINT_SITE_NAME; // e.g. Ticketing

  if (!siteHost || !siteName) {
    throw new Error("Missing SHAREPOINT_SITE or SHAREPOINT_SITE_NAME env vars");
  }

  const res = await axios.get(
    `https://graph.microsoft.com/v1.0/sites/${siteHost}:/sites/${siteName}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data.id;
}

/**
 * Uploads a Buffer to SharePoint site drive under the configured folder.
 * - Small files (<=4MB): uses single PUT to /content
 * - Large files: uses an upload session (chunked)
 *
 * Returns: { id, fileName, fileType, fileUrl }
 */
async function uploadToSharePoint(file) {
  try {
    if (!file || !file.buffer) throw new Error("Invalid file parameter");

    const token = await getAccessToken();
    const siteId = await getSiteId(token);

    const client = Client.init({
      authProvider: (done) => done(null, token),
    });

    const originalName = file.originalname || "upload";
    // use a timestamp prefix to avoid name collisions
    const fileName = `${Date.now()}-${originalName}`;
    const folder = process.env.SHAREPOINT_FOLDER || ""; // e.g. "Helpdesk/Attachments"

    // normalize path: ensure folder does not have leading/trailing slashes
    const folderPath = folder.replace(/^\/+|\/+$/g, "");
    const remotePath = folderPath ? `${folderPath}/${fileName}` : `${fileName}`;

    const size = file.size || (file.buffer && file.buffer.length) || 0;

    // For small files (<= 4MB) we can PUT directly
    const SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024; // 4 MB

    if (size <= SIMPLE_UPLOAD_MAX) {
      const uploadPath = `/sites/${siteId}/drive/root:/${remotePath}:/content`;
      const result = await client.api(uploadPath).put(file.buffer);

      return {
        id: result.id,
        fileName: originalName,
        fileType: file.mimetype || result.file?.mimeType || "application/octet-stream",
        fileUrl: result.webUrl || result["@microsoft.graph.downloadUrl"] || null
      };
    }

    // Large file: create upload session and upload in chunks
    // Create upload session
    const sessionResp = await client
      .api(`/sites/${siteId}/drive/root:/${remotePath}:/createUploadSession`)
      .post({
        item: {
          "@microsoft.graph.conflictBehavior": "rename",
          name: fileName
        }
      });

    const uploadUrl = sessionResp.uploadUrl;
    if (!uploadUrl) throw new Error("Failed to create upload session");

    // Upload in chunks
    const chunkSize = 5 * 1024 * 1024; // 5 MB chunks (must be multiple of 320 KB ideally)
    const buffer = file.buffer;
    const bufferLength = buffer.length;
    let offset = 0;
    let chunkIndex = 0;

    while (offset < bufferLength) {
      const chunkEnd = Math.min(offset + chunkSize, bufferLength) - 1;
      const chunk = buffer.slice(offset, chunkEnd + 1);

      const start = offset;
      const end = chunkEnd;
      const contentLength = end - start + 1;
      const contentRange = `bytes ${start}-${end}/${bufferLength}`;

      // PUT chunk to uploadUrl
      const headers = {
        "Content-Length": contentLength,
        "Content-Range": contentRange,
      };

      const resp = await axios.put(uploadUrl, chunk, { headers });

      // If upload completed, Graph returns 201/200 and the driveItem in resp.data
      if (resp.status === 201 || resp.status === 200) {
        const item = resp.data;
        return {
          id: item.id,
          fileName: originalName,
          fileType: file.mimetype || item.file?.mimeType || "application/octet-stream",
          fileUrl: item.webUrl || item["@microsoft.graph.downloadUrl"] || null
        };
      }

      // Otherwise continue uploading next chunk
      offset = end + 1;
      chunkIndex++;
    }

    // If loop finishes without server returning item, attempt to get item by listing path
    const metadata = await client.api(`/sites/${siteId}/drive/root:/${remotePath}`).get();
    return {
      id: metadata.id,
      fileName: originalName,
      fileType: file.mimetype || metadata.file?.mimeType || "application/octet-stream",
      fileUrl: metadata.webUrl || metadata["@microsoft.graph.downloadUrl"] || null
    };
  } catch (err) {
    console.error("SharePoint upload error:", err?.response?.data || err?.message || err);
    throw err;
  }
}

module.exports = { uploadToSharePoint };