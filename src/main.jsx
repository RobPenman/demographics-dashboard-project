import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../app.jsx'; // This imports your main application component
import './index.css'; // This imports the necessary Tailwind CSS directives

// Find the root element and create the React root
// Then render the main App component inside React.StrictMode
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);