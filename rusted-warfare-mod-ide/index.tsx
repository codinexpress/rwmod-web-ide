
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// global.d.ts provides ambient declarations and does not need to be imported directly.
// TypeScript will include it in the compilation context.

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);