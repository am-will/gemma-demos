import React from "react";
import { createRoot } from "react-dom/client";
import { DemoApp } from "../../shared/DemoApp.jsx";
import { scenario } from "./scenario.js";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DemoApp scenario={scenario} />
  </React.StrictMode>
);
