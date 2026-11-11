import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import '../shared/styles/components.css';
import './admin.css';
import App from './App.jsx';

document.body.classList.add('admin');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
