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

async function uploadToSharePoint(file) {
  const token = await getAccessToken();

  const client = Client.init({
    authProvider: (done) => done(null, token),
  });

  const fileName = `${Date.now()}-${file.originalname}`;
  const folder = process.env.SHAREPOINT_FOLDER;

  const uploadPath = `/me/drive/root:/${folder}/${fileName}:/content`;

  const result = await client.api(uploadPath).put(file.buffer);

  return {
    id: result.id,
    fileName: file.originalname,
    fileType: file.mimetype,
    fileUrl: result.webUrl
  };
}

module.exports = { uploadToSharePoint };
