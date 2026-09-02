import React from "react";
import { createRoot } from "react-dom/client";
import { QwenLiveEarningsCompare } from "./QwenLiveEarningsCompare.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QwenLiveEarningsCompare />
  </React.StrictMode>
);
