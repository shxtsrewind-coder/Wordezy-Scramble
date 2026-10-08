import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Fade out the inline boot loader once React has painted its first frame.
requestAnimationFrame(() => {
  const loader = document.getElementById("initial-loader");
  if (loader) {
    loader.classList.add("is-hidden");
    setTimeout(() => loader.remove(), 300);
  }
});
