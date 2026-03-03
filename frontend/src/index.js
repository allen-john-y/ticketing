import React from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import App from './App';

const pca = new PublicClientApplication({
  auth: {
    clientId: process.env.REACT_APP_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/' + process.env.REACT_APP_TENANT_ID,
    redirectUri: process.env.REACT_APP_FRONTEND_URL,
  },
  cache: { cacheLocation: 'localStorage' },
});

const root = createRoot(document.getElementById('root'));
root.render(
  <MsalProvider instance={pca}>
    <App />
  </MsalProvider>
);