import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import App from './App.jsx';
import { applyTheme, getTheme } from './components/Layout.jsx';

applyTheme(getTheme());

// Un saludo para quien abra la consola 👀
console.log(
  '%c◎ Lost&Found Smart%c\n¿Buscando algo en la consola? Nosotros también buscamos cosas todo el día.\nHecho con cariño por el equipo de la USB Cali · 2026-2',
  'font: 700 20px system-ui; color: #4f82ff;',
  'font: 13px system-ui; color: #8797c2;'
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
