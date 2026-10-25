import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createBrowserServices } from './app/create-services';
import { registerServiceWorker } from './app/pwa';
import './index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found.');
}

registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <App services={createBrowserServices()} />
  </StrictMode>,
);
