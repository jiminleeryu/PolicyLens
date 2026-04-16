import { buildPolicyPrompt } from "../utils/promptBuilder";
import type { AnalysisResult, AnalyzePolicyMessage } from "../types";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
const CACHE_SCHEMA_VERSION = "v3";
const DEBUG_LOGS_ENABLED = import.meta.env.VITE_DEBUG_POLICYLENS === "true";
const MAX_OPENAI_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1500;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

interface CachedAnalysis {
  result: AnalysisResult;
  timestamp: number;
}

interface PolicyContext {
  pageUrl?: string;
  pageTitle?: string;
  policySignalDetected?: boolean;
}

interface OpenAIRequestError extends Error {
  status?: number;
  retryAfterMs?: number;
}

const inFlightByDomain = new Map<string, Promise<AnalysisResult>>();
const rateLimitCooldownByDomain = new Map<string, number>();

const debugLog = (label: string, details?: unknown): void => {
  if (!DEBUG_LOGS_ENABLED) {
    return;
  }

  if (details === undefined) {
    console.log(`[PolicyLens][sw] ${label}`);
    return;
  }

  console.log(`[PolicyLens][sw] ${label}`, details);
};

const isAnalyzeMessage = (msg: unknown): msg is AnalyzePolicyMessage => {
  return Boolean(msg && typeof msg === "object" && (msg as AnalyzePolicyMessage).type === "ANALYZE_POLICY");
};

const getDomainFromSender = (sender: chrome.runtime.MessageSender): string | null => {
  const url = sender.tab?.url;
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

const getCacheKey = (domain: string): string => `analysis:${CACHE_SCHEMA_VERSION}:${domain}`;

const getCachedAnalysis = async (domain: string): Promise<AnalysisResult | null> => {
  const key = getCacheKey(domain);
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key] as CachedAnalysis | undefined;

  if (!cached) {
    debugLog("cache miss", { domain, key });
    return null;
  }

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    debugLog("cache expired", { domain, key });
    await chrome.storage.local.remove(key);
    return null;
  }

  debugLog("cache hit", {
    domain,
    key,
    outOfScope: cached.result.out_of_scope,
    sectionsCount: cached.result.sections.length
  });

  return cached.result;
};

const setCachedAnalysis = async (domain: string, result: AnalysisResult): Promise<void> => {
  const key = getCacheKey(domain);
  const payload: CachedAnalysis = {
    result,
    timestamp: Date.now()
  };

  await chrome.storage.local.set({ [key]: payload });
  debugLog("cache stored", {
    domain,
    key,
    outOfScope: result.out_of_scope,
    sectionsCount: result.sections.length
  });
};

const extractTextFromOpenAIResponse = (data: unknown): string => {
  if (!data || typeof data !== "object") {
    return "";
  }

  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const firstChoice = choices[0] as { message?: { content?: string } };
  const content = firstChoice?.message?.content;

  return typeof content === "string" ? content : "";
};

const parseAnalysisPayload = (raw: string): AnalysisResult => {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { out_of_scope: true, sections: [], sensitive_flags: [], nonsensitive_flags: [] };
  }

  const parsed = JSON.parse(trimmed) as Partial<AnalysisResult>;

  if (parsed.out_of_scope === true) {
    return { out_of_scope: true, sections: [], sensitive_flags: [], nonsensitive_flags: [] };
  }

  return {
    out_of_scope: false,
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    sensitive_flags: Array.isArray(parsed.sensitive_flags) ? parsed.sensitive_flags : [],
    nonsensitive_flags: Array.isArray(parsed.nonsensitive_flags) ? parsed.nonsensitive_flags : []
  };
};

const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const parseRetryAfterMs = (headerValue: string | null): number | undefined => {
  if (!headerValue) {
    return undefined;
  }

  const asSeconds = Number(headerValue);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.floor(asSeconds * 1000);
  }

  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 0;
  }

  return undefined;
};

const buildRateLimitedAnalysis = (retryAfterMs?: number): AnalysisResult => {
  const waitSeconds = Math.max(1, Math.ceil((retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS) / 1000));

  return {
    out_of_scope: false,
    sections: [
      {
        title: "Rate Limit Notice",
        short_summary: `The analysis API is rate-limited right now. Please retry in about ${waitSeconds} seconds.`,
        full_summary:
          "PolicyLens reached the current API request limit. To reduce repeat failures, requests are now throttled and retried automatically. Please wait briefly and run the analysis again.",
        sensitivity: "medium",
        flags: ["temporary API rate limit"]
      }
    ],
    sensitive_flags: [],
    nonsensitive_flags: []
  };
};

const looksLikePolicyPage = (context: PolicyContext, text: string): boolean => {
  const url = (context.pageUrl ?? "").toLowerCase();
  const title = (context.pageTitle ?? "").toLowerCase();
  const corpus = `${url} ${title} ${text.slice(0, 800).toLowerCase()}`;
  const hints = ["privacy", "policy", "data collection", "personal information", "cookies"];
  return context.policySignalDetected === true || hints.some((hint) => corpus.includes(hint));
};

const buildUserContent = (text: string, context: PolicyContext, stricterInScopeHint: boolean): string => {
  const contextBlock = [
    `Page URL: ${context.pageUrl ?? "unknown"}`,
    `Page title: ${context.pageTitle ?? "unknown"}`,
    `Policy signal detected in page scan: ${context.policySignalDetected ? "yes" : "no"}`
  ].join("\n");

  const inScopeHint = stricterInScopeHint
    ? "High-confidence hint: this source appears to be a privacy policy page. Treat as in-scope unless clearly unrelated."
    : "";

  return `${contextBlock}\n${inScopeHint}\n\nDocument text:\n${text}`;
};

const callChatGPT = async (text: string, context: PolicyContext): Promise<AnalysisResult> => {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing VITE_OPENAI_API_KEY in .env.");
  }

  debugLog("callChatGPT start", {
    textLength: text.length,
    textPreview: text.slice(0, 180),
    pageUrl: context.pageUrl,
    pageTitle: context.pageTitle,
    policySignalDetected: context.policySignalDetected
  });

  const prompt = buildPolicyPrompt(text);

  const runRequest = async (stricterInScopeHint: boolean): Promise<AnalysisResult> => {
    let attempt = 0;

    while (true) {
      debugLog("openai request", { stricterInScopeHint, attempt });

      const response = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 2000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: buildUserContent(text, context, stricterInScopeHint) }
          ]
        })
      });

      if (response.ok) {
        const data = (await response.json()) as unknown;
        const modelText = extractTextFromOpenAIResponse(data);
        debugLog("openai response raw", {
          stricterInScopeHint,
          rawLength: modelText.length,
          rawPreview: modelText.slice(0, 220)
        });

        const parsed = parseAnalysisPayload(modelText);
        debugLog("openai response parsed", {
          stricterInScopeHint,
          outOfScope: parsed.out_of_scope,
          sectionsCount: parsed.sections.length,
          sensitiveFlagsCount: parsed.sensitive_flags.length,
          nonsensitiveFlagsCount: parsed.nonsensitive_flags.length
        });

        return parsed;
      }

      const errText = await response.text();
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const isRateLimited = response.status === 429;

      if (isRateLimited && attempt < MAX_OPENAI_RETRIES) {
        const backoffMs = retryAfterMs ?? BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        debugLog("openai rate-limited, retrying", { attempt, backoffMs });
        attempt += 1;
        await wait(backoffMs);
        continue;
      }

      const error = new Error(`OpenAI API error: ${response.status} ${errText}`) as OpenAIRequestError;
      error.status = response.status;
      error.retryAfterMs = retryAfterMs;
      throw error;
    }
  };

  const firstPass = await runRequest(false);
  if (!firstPass.out_of_scope) {
    return firstPass;
  }

  if (looksLikePolicyPage(context, text) && text.trim().length > 400) {
    debugLog("retrying out_of_scope result with stricter in-scope hint");
    const secondPass = await runRequest(true);
    return secondPass;
  }

  return firstPass;
};

const sendAnalysisToTab = (tabId: number, payload: AnalysisResult): void => {
  chrome.tabs.sendMessage(tabId, {
    type: "ANALYSIS_RESULT",
    payload
  });
};

chrome.runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender) => {
  if (!isAnalyzeMessage(message)) {
    return;
  }

  const tabId = sender.tab?.id;
  const domain = getDomainFromSender(sender);

  if (!tabId || !domain) {
    sendAnalysisToTab(tabId ?? 0, {
      out_of_scope: true,
      sections: [],
      sensitive_flags: [],
      nonsensitive_flags: []
    });
    return;
  }

  void (async () => {
    try {
      debugLog("ANALYZE_POLICY received", {
        tabId,
        domain,
        textLength: message.text.length,
        textPreview: message.text.slice(0, 180),
        pageUrl: message.pageUrl ?? sender.tab?.url,
        pageTitle: message.pageTitle,
        policySignalDetected: message.policySignalDetected
      });

      const cached = await getCachedAnalysis(domain);
      if (cached) {
        sendAnalysisToTab(tabId, cached);
        return;
      }

      const cooldownUntil = rateLimitCooldownByDomain.get(domain) ?? 0;
      if (Date.now() < cooldownUntil) {
        const retryAfterMs = cooldownUntil - Date.now();
        debugLog("domain cooldown active", { domain, retryAfterMs });
        sendAnalysisToTab(tabId, buildRateLimitedAnalysis(retryAfterMs));
        return;
      }

      const inFlight = inFlightByDomain.get(domain);
      if (inFlight) {
        debugLog("joining in-flight request", { domain });
        const sharedResult = await inFlight;
        sendAnalysisToTab(tabId, sharedResult);
        return;
      }

      const analysisPromise = callChatGPT(message.text, {
        pageUrl: message.pageUrl ?? sender.tab?.url,
        pageTitle: message.pageTitle,
        policySignalDetected: message.policySignalDetected
      });

      inFlightByDomain.set(domain, analysisPromise);

      const result = await analysisPromise;
      await setCachedAnalysis(domain, result);
      debugLog("sending ANALYSIS_RESULT", {
        tabId,
        outOfScope: result.out_of_scope,
        sectionsCount: result.sections.length
      });
      sendAnalysisToTab(tabId, result);
    } catch (error) {
      console.error("PolicyLens analysis error", error);

      const typedError = error as OpenAIRequestError;
      if (typedError.status === 429) {
        const retryAfterMs = typedError.retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS;
        rateLimitCooldownByDomain.set(domain, Date.now() + retryAfterMs);
        debugLog("set domain cooldown after 429", { domain, retryAfterMs });
        sendAnalysisToTab(tabId, buildRateLimitedAnalysis(retryAfterMs));
        return;
      }

      sendAnalysisToTab(tabId, {
        out_of_scope: true,
        sections: [],
        sensitive_flags: [],
        nonsensitive_flags: []
      });
    } finally {
      inFlightByDomain.delete(domain);
    }
  })();
});
