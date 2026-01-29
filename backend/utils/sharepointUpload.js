const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const axios = require("axios");

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

async function getSiteId(token) {
  const siteHost = process.env.SHAREPOINT_SITE;
  const siteName = process.env.SHAREPOINT_SITE_NAME;

  const res = await axios.get(
    `https://graph.microsoft.com/v1.0/sites/${siteHost}:/sites/${siteName}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data.id;
}

async function uploadToSharePoint(file) {
  const token = await getAccessToken();
  const siteId = await getSiteId(token);

  const client = Client.init({
    authProvider: (done) => done(null, token),
  });

  const fileName = `${Date.now()}-${file.originalname}`;
  const folder = process.env.SHAREPOINT_FOLDER;

  const uploadPath = `/sites/${siteId}/drive/root:/${folder}/${fileName}:/content`;
  const result = await client.api(uploadPath).put(file.buffer);

  // 🔥 Create permanent download link (no expiry, no token issue)
  const linkResponse = await client
    .api(`/sites/${siteId}/drive/items/${result.id}/createLink`)
    .post({
      type: "download",
      scope: "organization"
    });

  return {
    id: result.id,
    fileName: file.originalname,
    fileType: file.mimetype,
    fileUrl: linkResponse.link.webUrl
  };
}

module.exports = { uploadToSharePoint };
