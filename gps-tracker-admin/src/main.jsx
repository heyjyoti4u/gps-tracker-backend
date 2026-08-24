import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'leaflet/dist/leaflet.css'; // Yeh line add karni hai

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)