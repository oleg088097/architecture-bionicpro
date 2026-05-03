import React from 'react';
import ReportPage from './components/ReportPage';

/*
const keycloakConfig: KeycloakConfig = {
  url: process.env.REACT_APP_KEYCLOAK_URL,
  realm: process.env.REACT_APP_KEYCLOAK_REALM||"",
  clientId: process.env.REACT_APP_KEYCLOAK_CLIENT_ID||""
};

const initOptions: AuthClientInitOptions = {
  pkceMethod: "S256",
  flow: 'standard',
  onLoad: 'check-sso',
  checkLoginIframe: false
};

const keycloak = new Keycloak(keycloakConfig);

const App: React.FC = () => {
  return (
    <ReactKeycloakProvider authClient={keycloak} initOptions={initOptions}>
      <div className="App">
        <ReportPage />
      </div>
    </ReactKeycloakProvider>
  );
};
*/

const App: React.FC = () => {
  return (
      <div className="App">
        <ReportPage />
      </div>
  );
};
export default App;