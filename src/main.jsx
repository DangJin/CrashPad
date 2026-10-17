import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

const TrafficApp = lazy(() => import('./traffic/TrafficApp.jsx'));
const NetworkApp = lazy(() => import('./traffic/network/NetworkApp.jsx'));
function Modules() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => { const change = () => setHash(location.hash); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  return hash.startsWith('#/traffic') ? <Suspense fallback={<p role="status" style={{ padding: 28 }}>正在打开车流实验室…</p>}>{hash.startsWith('#/traffic/legacy') ? <TrafficApp /> : <NetworkApp />}</Suspense> : <App />;
}
createRoot(document.getElementById('app')).render(<React.StrictMode><Modules /></React.StrictMode>);
