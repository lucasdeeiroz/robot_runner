import "./i18n/config";
// import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SettingsProvider } from "@/lib/settings";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>,
);
