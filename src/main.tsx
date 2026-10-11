// First, before any component: cascade layers rank in the order they are
// first named, and this file names them. A component stylesheet loaded ahead
// of it would rank its own layer below the base styles.
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { createRouter } from './app/router';
import { startSync } from './data/start';
import { SyncContext } from './data/useSync';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <SyncContext value={startSync()}>
      <RouterProvider router={createRouter()} />
    </SyncContext>
  </StrictMode>,
);
