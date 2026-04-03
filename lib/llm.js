// Shared LLM caller — used by popup, background, and options

const LLM_PROVIDERS = [
  { id: "anthropic", name: "Anthropic (Claude)", placeholder: "sk-ant-...", baseUrl: "https://api.anthropic.com/v1/messages" },
  { id: "openai", name: "OpenAI (GPT)", placeholder: "sk-...", baseUrl: "https://api.openai.com/v1/chat/completions" },
  { id: "google", name: "Google (Gemini)", placeholder: "AIza...", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models/" },
  { id: "groq", name: "Groq", placeholder: "gsk_...", baseUrl: "https://api.groq.com/openai/v1/chat/completions" },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", baseUrl: "https://openrouter.ai/api/v1/chat/completions" },
  { id: "local", name: "Local LLM (Ollama/LM Studio)", placeholder: "not required", baseUrl: "http://localhost:11434/v1/chat/completions" },
  { id: "custom", name: "Custom OpenAI-compatible", placeholder: "your-api-key", baseUrl: "" },
];

const AI_PROMPT = `You are a bookmark assistant. Given a URL, page title, and optional page excerpt, provide:
1. A concise summary (2-3 sentences max)
2. A category from: Tech, Design, Business, Learning, News, Tools, Other
3. 3-5 relevant tags (single words, lowercase)

Respond ONLY in JSON: {"summary":"...","category":"...","tags":["tag1","tag2"]}`;

async function callLLM(settings, url, title, excerpt = "") {
  const { provider, apiKey, baseUrl, model } = settings;
  const userMsg = `URL: ${url}\nTitle: ${title}${excerpt ? `\nExcerpt: ${excerpt.slice(0, 500)}` : ""}`;

  if (provider === "anthropic") {
    const res = await fetch(baseUrl || "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: AI_PROMPT + "\n\n" + userMsg }]
      }),
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return JSON.parse(d.content[0].text);
  }

  if (provider === "google") {
    const m = model || "gemini-2.0-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: AI_PROMPT + "\n\n" + userMsg }] }],
          generationConfig: { maxOutputTokens: 300 }
        }),
      }
    );
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return JSON.parse(d.candidates[0].content.parts[0].text);
  }

  // OpenAI-compatible: openai, groq, openrouter, local, custom
  const urls = {
    openai: "https://api.openai.com/v1/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    local: baseUrl || "http://localhost:11434/v1/chat/completions",
    custom: baseUrl,
  };
  const models = {
    openai: "gpt-4o-mini",
    groq: "llama-3.3-70b-versatile",
    openrouter: "meta-llama/llama-3.3-70b-instruct",
    local: model || "llama3",
    custom: model || "default",
  };

  const headers = { "Content-Type": "application/json" };
  if (apiKey && provider !== "local") headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(urls[provider] || baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model || models[provider],
      messages: [
        { role: "system", content: AI_PROMPT },
        { role: "user", content: userMsg }
      ],
      max_tokens: 300
    }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error?.message || JSON.stringify(d.error));
  return JSON.parse(d.choices[0].message.content);
}
