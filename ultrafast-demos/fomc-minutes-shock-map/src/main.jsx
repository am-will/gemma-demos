import React from "react";
import { createRoot } from "react-dom/client";
import { FomcShockMap } from "./FomcShockMap.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FomcShockMap />
  </React.StrictMode>
);
