import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log("🚀 main.tsx executing");
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Remove the static pre-React splash from index.html once the app takes over
document.getElementById('pre-splash')?.remove();
