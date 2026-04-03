// Context menu: right-click "Save to FOMO Saver"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "fomo-save-page",
    title: "💾 Save to FOMO Saver",
    contexts: ["page", "link"]
  });

  chrome.contextMenus.create({
    id: "fomo-save-selection",
    title: "💾 Save selection + link to FOMO Saver",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab.url;
  const title = tab.title || url;
  const selectedText = info.selectionText || "";

  const bookmark = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    url,
    title,
    notes: selectedText,
    category: "Other",
    tags: [],
    starred: false,
    read: false,
    createdAt: new Date().toISOString(),
  };

  // Save to storage
  const { bookmarks = [] } = await chrome.storage.local.get("bookmarks");
  bookmarks.unshift(bookmark);
  await chrome.storage.local.set({ bookmarks });

  // Try AI summary if configured
  try {
    const { llmSettings } = await chrome.storage.local.get("llmSettings");
    if (llmSettings?.configured) {
      const result = await callLLMFromWorker(llmSettings, url, title, selectedText);
      if (result) {
        const idx = bookmarks.findIndex(b => b.id === bookmark.id);
        if (idx !== -1) {
          if (result.summary) bookmarks[idx].notes = result.summary;
          if (result.category) bookmarks[idx].category = result.category;
          if (result.tags) bookmarks[idx].tags = result.tags;
          await chrome.storage.local.set({ bookmarks });
        }
      }
    }
  } catch (e) {
    console.log("AI summary skipped:", e.message);
  }

  // Show notification
  chrome.action.setBadgeText({ text: "✓", tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
  setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2000);
});

// Keyboard shortcut handler
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-current-page") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const bookmark = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      url: tab.url,
      title: tab.title || tab.url,
      notes: "",
      category: "Other",
      tags: [],
      starred: false,
      read: false,
      createdAt: new Date().toISOString(),
    };

    const { bookmarks = [] } = await chrome.storage.local.get("bookmarks");
    bookmarks.unshift(bookmark);
    await chrome.storage.local.set({ bookmarks });

    chrome.action.setBadgeText({ text: "✓", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2000);
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_BOOKMARKS") {
    chrome.storage.local.get("bookmarks", (data) => {
      sendResponse(data.bookmarks || []);
    });
    return true;
  }

  if (msg.type === "SAVE_BOOKMARK") {
    chrome.storage.local.get("bookmarks", (data) => {
      const bookmarks = data.bookmarks || [];
      bookmarks.unshift(msg.bookmark);
      chrome.storage.local.set({ bookmarks }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (msg.type === "UPDATE_BOOKMARKS") {
    chrome.storage.local.set({ bookmarks: msg.bookmarks }, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_PAGE_INFO") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({ url: tabs[0].url, title: tabs[0].title });
      }
    });
    return true;
  }
});

// Inline LLM caller for service worker (since we can't import modules easily)
async function callLLMFromWorker(settings, url, title, excerpt = "") {
  const { provider, apiKey, baseUrl, model } = settings;
  const prompt = `You are a bookmark assistant. Given a URL, page title, and optional excerpt, provide:
1. A concise summary (2-3 sentences max)
2. A category from: Tech, Design, Business, Learning, News, Tools, Other
3. 3-5 relevant tags (single words, lowercase)
Respond ONLY in JSON: {"summary":"...","category":"...","tags":["tag1","tag2"]}`;
  const userMsg = `URL: ${url}\nTitle: ${title}${excerpt ? `\nExcerpt: ${excerpt.slice(0, 500)}` : ""}`;

  let res, d;

  if (provider === "anthropic") {
    res = await fetch(baseUrl || "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || "claude-sonnet-4-20250514", max_tokens: 300, messages: [{ role: "user", content: prompt + "\n\n" + userMsg }] }),
    });
    d = await res.json();
    return JSON.parse(d.content[0].text);
  }

  if (provider === "google") {
    const m = model || "gemini-2.0-flash";
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt + "\n\n" + userMsg }] }] }),
    });
    d = await res.json();
    return JSON.parse(d.candidates[0].content.parts[0].text);
  }

  const urls = { openai: "https://api.openai.com/v1/chat/completions", groq: "https://api.groq.com/openai/v1/chat/completions", openrouter: "https://openrouter.ai/api/v1/chat/completions", local: baseUrl || "http://localhost:11434/v1/chat/completions", custom: baseUrl };
  const models = { openai: "gpt-4o-mini", groq: "llama-3.3-70b-versatile", openrouter: "meta-llama/llama-3.3-70b-instruct", local: model || "llama3", custom: model || "default" };
  const headers = { "Content-Type": "application/json" };
  if (apiKey && provider !== "local") headers["Authorization"] = `Bearer ${apiKey}`;

  res = await fetch(urls[provider] || baseUrl, {
    method: "POST", headers,
    body: JSON.stringify({ model: model || models[provider], messages: [{ role: "system", content: prompt }, { role: "user", content: userMsg }], max_tokens: 300 }),
  });
  d = await res.json();
  return JSON.parse(d.choices[0].message.content);
}
