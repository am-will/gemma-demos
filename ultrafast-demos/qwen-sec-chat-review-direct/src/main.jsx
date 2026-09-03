import React from "react";
import { createRoot } from "react-dom/client";
import { QwenSecChatReview } from "../../qwen-sec-chat-review/src/QwenSecChatReview.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QwenSecChatReview skipDocumentScene />
  </React.StrictMode>
);
