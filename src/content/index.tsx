import React from "react";
import { createRoot, type Root } from "react-dom/client";
import sidebarCss from "../sidebar/sidebar.css?inline";
import { Sidebar } from "../sidebar";
import { extractPageText } from "../utils/extractPageText";
import type { AnalysisResult, AnalysisResultMessage } from "../types";

const POLICY_KEYWORDS = ["privacy policy", "data collection", "personal information", "cookies"];
const SIGNAL_RETRY_ATTEMPTS = 20;
const SIGNAL_RETRY_MS = 500;
const EXTRACTION_RETRY_ATTEMPTS = 8;
const EXTRACTION_RETRY_MS = 400;
const DEBUG_LOGS_ENABLED = import.meta.env.VITE_DEBUG_POLICYLENS === "true";

let sidebarHost: HTMLDivElement | null = null;
let sidebarRoot: Root | null = null;
let sidebarShadow: ShadowRoot | null = null;
let currentAnalysis: AnalysisResult | null = null;
let isLoading = false;

const debugLog = (label: string, details?: unknown): void => {
  if (!DEBUG_LOGS_ENABLED) {
    return;
  }

  if (details === undefined) {
    console.log(`[PolicyLens][content] ${label}`);
    return;
  }

  console.log(`[PolicyLens][content] ${label}`, details);
};

const hasPolicySignals = (): boolean => {
  const title = document.title.toLowerCase();
  const bodyText = document.body?.innerText?.toLowerCase() ?? "";
  const corpus = `${title} ${bodyText}`;

  return POLICY_KEYWORDS.some((keyword) => corpus.includes(keyword));
};

const ensureSidebarMounted = (): void => {
  if (sidebarHost && sidebarRoot) {
    return;
  }

  sidebarHost = document.createElement("div");
  sidebarHost.id = "policylens-host";
  sidebarHost.style.position = "fixed";
  sidebarHost.style.top = "0";
  sidebarHost.style.right = "0";
  sidebarHost.style.height = "100vh";
  sidebarHost.style.width = "420px";
  sidebarHost.style.zIndex = "2147483646";

  const mountContainer = document.createElement("div");

  // Closed shadow root isolates extension UI styles from host page CSS.
  sidebarShadow = sidebarHost.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = sidebarCss;
  sidebarShadow.appendChild(styleEl);
  sidebarShadow.appendChild(mountContainer);

  document.documentElement.appendChild(sidebarHost);
  sidebarRoot = createRoot(mountContainer);
};

const renderSidebar = (): void => {
  if (!sidebarRoot) {
    return;
  }

  sidebarRoot.render(
    <Sidebar
      analysis={currentAnalysis}
      loading={isLoading}
      onClose={() => {
        if (sidebarHost) {
          sidebarHost.remove();
        }
        sidebarHost = null;
        sidebarRoot = null;
        sidebarShadow = null;
      }}
    />
  );
};

const requestAnalysis = (): void => {
  isLoading = true;
  renderSidebar();
  debugLog("analysis requested");

  let attempt = 0;

  const sendWhenReady = (): void => {
    const pageText = extractPageText();
    debugLog("extraction attempt", {
      attempt,
      textLength: pageText.length,
      preview: pageText.slice(0, 180)
    });

    if (pageText.length > 120 || attempt >= EXTRACTION_RETRY_ATTEMPTS) {
      const payload = {
        type: "ANALYZE_POLICY",
        text: pageText,
        pageUrl: window.location.href,
        pageTitle: document.title,
        policySignalDetected: hasPolicySignals()
      };

      debugLog("sending ANALYZE_POLICY", {
        pageUrl: payload.pageUrl,
        pageTitle: payload.pageTitle,
        policySignalDetected: payload.policySignalDetected,
        textLength: payload.text.length
      });

      chrome.runtime.sendMessage(payload);
      return;
    }

    attempt += 1;
    window.setTimeout(sendWhenReady, EXTRACTION_RETRY_MS);
  };

  sendWhenReady();
};

const createTriggerButton = (): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.ariaLabel = "Open PolicyLens";
  button.textContent = "PolicyLens";
  button.style.position = "fixed";
  button.style.bottom = "24px";
  button.style.right = "24px";
  button.style.zIndex = "2147483647";
  button.style.background = "#0f766e";
  button.style.color = "#ffffff";
  button.style.border = "none";
  button.style.borderRadius = "999px";
  button.style.padding = "10px 16px";
  button.style.fontSize = "14px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.25)";

  button.addEventListener("click", () => {
    if (isLoading) {
      debugLog("click ignored because analysis is already in progress");
      return;
    }

    ensureSidebarMounted();
    renderSidebar();
    requestAnalysis();
  });

  return button;
};

chrome.runtime.onMessage.addListener((message: unknown) => {
  const resultMessage = message as AnalysisResultMessage;

  if (resultMessage?.type !== "ANALYSIS_RESULT") {
    return;
  }

  debugLog("received ANALYSIS_RESULT", {
    outOfScope: resultMessage.payload.out_of_scope,
    sectionsCount: resultMessage.payload.sections.length,
    sensitiveFlagsCount: resultMessage.payload.sensitive_flags.length,
    nonsensitiveFlagsCount: resultMessage.payload.nonsensitive_flags.length
  });

  currentAnalysis = resultMessage.payload;
  isLoading = false;
  renderSidebar();
});

const init = (): void => {
  debugLog("content script init", { url: window.location.href, title: document.title });
  let attempt = 0;

  const tryInjectTrigger = (): void => {
    if (document.getElementById("policylens-trigger")) {
      return;
    }

    const detected = hasPolicySignals();
    debugLog("policy signal check", { attempt, detected });

    if (detected) {
      const trigger = createTriggerButton();
      trigger.id = "policylens-trigger";
      document.documentElement.appendChild(trigger);
      debugLog("trigger injected");
      return;
    }

    if (attempt >= SIGNAL_RETRY_ATTEMPTS) {
      return;
    }

    attempt += 1;
    window.setTimeout(tryInjectTrigger, SIGNAL_RETRY_MS);
  };

  tryInjectTrigger();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
