import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css"; // ou app.css selon ton fichier Tailwind
import 'leaflet/dist/leaflet.css';
import "katex/dist/katex.min.css"; // obligatoire pour le style math

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
