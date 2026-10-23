import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { EndpointProvider } from "./context/EndpointContext.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EndpointProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </EndpointProvider>
  </React.StrictMode>,
);
