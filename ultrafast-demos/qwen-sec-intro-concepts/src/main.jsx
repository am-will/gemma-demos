import React from "react";
import { createRoot } from "react-dom/client";
import { QwenSecChatReview } from "../../qwen-sec-chat-review/src/QwenSecChatReview.jsx";
import { BrandEndingDemo, LiveBrandEndingDemo } from "./BrandEndingDemo.jsx";
import { FanPromptIntro, IntroConcepts } from "./IntroConcepts.jsx";

const searchParams = new URLSearchParams(window.location.search);
const showVariants = searchParams.get("variants") === "1";
const showPopoutDemo = searchParams.get("popout") === "1";
const brandEndingVariant = searchParams.get("ending");
const showBrandEnding = brandEndingVariant === "1" || brandEndingVariant === "2";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {showBrandEnding
      ? <BrandEndingDemo variant={brandEndingVariant} />
      : showVariants
      ? <IntroConcepts />
      : showPopoutDemo
      ? <QwenSecChatReview skipDocumentScene PromptScene={FanPromptIntro} completionDemo />
      : <LiveBrandEndingDemo variant="2" PromptScene={FanPromptIntro} />}
  </React.StrictMode>
);
