const CATEGORY_COLORS = {
  Tech: "#3b82f6", Design: "#a855f7", Business: "#f59e0b",
  Learning: "#10b981", News: "#ef4444", Tools: "#6366f1", Other: "#6b7280",
};

let currentPageInfo = { url: "", title: "" };
let bookmarks = [];

// Init
document.addEventListener("DOMContentLoaded", async () => {
  // Get current page info
  chrome.runtime.sendMessage({ type: "GET_PAGE_INFO" }, (info) => {
    if (info) {
      currentPageInfo = info;
      document.getElementById("page-title").textContent = info.title || "Untitled";
      document.getElementById("page-url").textContent = info.url;
    }
  });

  // Load bookmarks
  chrome.runtime.sendMessage({ type: "GET_BOOKMARKS" }, (data) => {
    bookmarks = data || [];
    renderRecent();
  });

  // Buttons
  document.getElementById("btn-save").addEventListener("click", saveBookmark);
  document.getElementById("btn-ai").addEventListener("click", aiAutoFill);
  document.getElementById("btn-search").addEventListener("click", toggleSearch);
  document.getElementById("btn-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById("search-input").addEventListener("input", handleSearch);
});

async function saveBookmark() {
  const tags = document.getElementById("tags").value
    .split(",").map(t => t.trim().toLowerCase()).filter(Boolean);

  const bookmark = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    url: currentPageInfo.url,
    title: currentPageInfo.title || currentPageInfo.url,
    notes: document.getElementById("notes").value.trim(),
    category: document.getElementById("category").value,
    tags,
    starred: false,
    read: false,
    createdAt: new Date().toISOString(),
  };

  chrome.runtime.sendMessage({ type: "SAVE_BOOKMARK", bookmark }, () => {
    bookmarks.unshift(bookmark);
    renderRecent();
    showStatus("✅ Saved!");

    // Reset form
    document.getElementById("notes").value = "";
    document.getElementById("tags").value = "";
    document.getElementById("category").value = "Other";
  });
}

async function aiAutoFill() {
  const btn = document.getElementById("btn-ai");
  btn.disabled = true;
  btn.textContent = "⏳";
  showStatus("🤖 AI analyzing page...");

  try {
    const { llmSettings } = await chrome.storage.local.get("llmSettings");
    if (!llmSettings?.configured) {
      showStatus("⚠️ Set up AI in Settings first");
      btn.disabled = false;
      btn.textContent = "🤖";
      return;
    }

    // Try to get page excerpt from content script
    let excerpt = "";
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE_INFO" });
      excerpt = response?.excerpt || response?.description || "";
    } catch {}

    const result = await callLLMPopup(llmSettings, currentPageInfo.url, currentPageInfo.title, excerpt);

    if (result.category) document.getElementById("category").value = result.category;
    if (result.tags) document.getElementById("tags").value = result.tags.join(", ");
    if (result.summary) document.getElementById("notes").value = result.summary;

    showStatus("✅ AI filled!");
  } catch (e) {
    showStatus("❌ " + (e.message || "AI failed"));
  }

  btn.disabled = false;
  btn.textContent = "🤖";
}

// Simplified LLM caller for popup
async function callLLMPopup(settings, url, title, excerpt = "") {
  const { provider, apiKey, baseUrl, model } = settings;
  const prompt = `You are a bookmark assistant. Given a URL, page title, and optional excerpt, provide:
1. A concise summary (2-3 sentences max)
2. A category from: Tech, Design, Business, Learning, News, Tools, Other
3. 3-5 relevant tags (single words, lowercase)
Respond ONLY in JSON: {"summary":"...","category":"...","tags":["tag1","tag2"]}`;
  const userMsg = `URL: ${url}\nTitle: ${title}${excerpt ? `\nExcerpt: ${excerpt.slice(0, 500)}` : ""}`;

  let res, d;

  if (provider === "anthropic") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || "claude-sonnet-4-20250514", max_tokens: 300, messages: [{ role: "user", content: prompt + "\n\n" + userMsg }] }),
    });
    d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return JSON.parse(d.content[0].text);
  }

  if (provider === "google") {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt + "\n\n" + userMsg }] }] }),
    });
    d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return JSON.parse(d.candidates[0].content.parts[0].text);
  }

  // OpenAI-compatible
  const urls = { openai: "https://api.openai.com/v1/chat/completions", groq: "https://api.groq.com/openai/v1/chat/completions", openrouter: "https://openrouter.ai/api/v1/chat/completions", local: baseUrl || "http://localhost:11434/v1/chat/completions", custom: baseUrl };
  const models = { openai: "gpt-4o-mini", groq: "llama-3.3-70b-versatile", openrouter: "meta-llama/llama-3.3-70b-instruct", local: model || "llama3", custom: model || "default" };
  const headers = { "Content-Type": "application/json" };
  if (apiKey && provider !== "local") headers["Authorization"] = `Bearer ${apiKey}`;

  res = await fetch(urls[provider] || baseUrl, {
    method: "POST", headers,
    body: JSON.stringify({ model: model || models[provider], messages: [{ role: "system", content: prompt }, { role: "user", content: userMsg }], max_tokens: 300 }),
  });
  d = await res.json();
  if (d.error) throw new Error(d.error?.message || "Request failed");
  return JSON.parse(d.choices[0].message.content);
}

function renderRecent() {
  const list = document.getElementById("recent-list");
  const recent = bookmarks.slice(0, 8);

  if (!recent.length) {
    list.innerHTML = '<div style="text-align:center;padding:16px;color:#64748b;font-size:12px;">No bookmarks yet. Save your first link!</div>';
    return;
  }

  list.innerHTML = recent.map(b => {
    const color = CATEGORY_COLORS[b.category] || "#6b7280";
    return `<a href="${b.url}" target="_blank" class="bookmark-item" style="border-left-color:${color}">
      <span class="bm-title">${b.starred ? "⭐ " : ""}${escapeHtml(b.title)}</span>
      <span class="bm-cat" style="background:${color}22;color:${color}">${b.category}</span>
      <span class="bm-time">${timeAgo(b.createdAt)}</span>
    </a>`;
  }).join("");
}

function toggleSearch() {
  const sec = document.getElementById("search-section");
  sec.classList.toggle("hidden");
  if (!sec.classList.contains("hidden")) {
    document.getElementById("search-input").focus();
  }
}

function handleSearch(e) {
  const q = e.target.value.toLowerCase();
  const results = document.getElementById("search-results");

  if (!q) { results.innerHTML = ""; return; }

  const matches = bookmarks.filter(b =>
    b.title.toLowerCase().includes(q) ||
    (b.notes || "").toLowerCase().includes(q) ||
    b.tags.some(t => t.includes(q)) ||
    b.url.toLowerCase().includes(q)
  ).slice(0, 6);

  results.innerHTML = matches.length
    ? matches.map(b => {
        const color = CATEGORY_COLORS[b.category] || "#6b7280";
        return `<a href="${b.url}" target="_blank" class="bookmark-item" style="border-left-color:${color}">
          <span class="bm-title">${escapeHtml(b.title)}</span>
          <span class="bm-cat" style="background:${color}22;color:${color}">${b.category}</span>
        </a>`;
      }).join("")
    : '<div style="padding:12px;text-align:center;color:#64748b;font-size:12px;">No matches found</div>';
}

function showStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2500);
}

function timeAgo(ds) {
  const diff = Math.floor((new Date() - new Date(ds)) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
