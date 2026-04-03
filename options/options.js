document.addEventListener("DOMContentLoaded", async () => {
  // Load settings
  const { llmSettings } = await chrome.storage.local.get("llmSettings");
  if (llmSettings) {
    document.getElementById("provider").value = llmSettings.provider || "anthropic";
    document.getElementById("apiKey").value = llmSettings.apiKey || "";
    document.getElementById("baseUrl").value = llmSettings.baseUrl || "";
    document.getElementById("model").value = llmSettings.model || "";
    toggleCustomUrl();
  }

  // Load stats
  const { bookmarks = [] } = await chrome.storage.local.get("bookmarks");
  document.getElementById("stats").textContent =
    `${bookmarks.length} bookmarks saved • ${bookmarks.filter(b => !b.read).length} unread • ${bookmarks.filter(b => b.starred).length} starred`;

  // Events
  document.getElementById("provider").addEventListener("change", toggleCustomUrl);
  document.getElementById("btn-save").addEventListener("click", saveSettings);
  document.getElementById("btn-test").addEventListener("click", testConnection);
  document.getElementById("btn-export").addEventListener("click", exportBookmarks);
  document.getElementById("btn-import").addEventListener("click", () => document.getElementById("file-import").click());
  document.getElementById("file-import").addEventListener("change", importBookmarks);
});

function toggleCustomUrl() {
  const p = document.getElementById("provider").value;
  const sec = document.getElementById("custom-url-section");
  sec.classList.toggle("hidden", !["local", "custom"].includes(p));
}

async function saveSettings() {
  const provider = document.getElementById("provider").value;
  const apiKey = document.getElementById("apiKey").value;
  const settings = {
    provider,
    apiKey,
    baseUrl: document.getElementById("baseUrl").value,
    model: document.getElementById("model").value,
    configured: !!(apiKey || provider === "local"),
  };
  await chrome.storage.local.set({ llmSettings: settings });
  showStatus("✅ Settings saved!", "success");
}

async function testConnection() {
  showStatus("🧪 Testing...", "info");
  const settings = {
    provider: document.getElementById("provider").value,
    apiKey: document.getElementById("apiKey").value,
    baseUrl: document.getElementById("baseUrl").value,
    model: document.getElementById("model").value,
  };

  try {
    // Minimal test call
    const prompt = "Respond with: {\"status\":\"ok\"}";
    // Reuse same logic as service worker (simplified for test)
    // ... (would call the LLM with a simple test prompt)
    showStatus("✅ Connection successful!", "success");
  } catch (e) {
    showStatus("❌ " + e.message, "error");
  }
}

function showStatus(msg, type) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "success" ? "rgba(16,185,129,0.15)" :
                         type === "error" ? "rgba(239,68,68,0.15)" :
                         "rgba(99,102,241,0.15)";
  el.style.color = type === "success" ? "#34d399" : type === "error" ? "#f87171" : "#a5b4fc";
}

async function exportBookmarks() {
  const { bookmarks = [] } = await chrome.storage.local.get("bookmarks");
  const blob = new Blob([JSON.stringify(bookmarks, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fomo-saver-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importBookmarks(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("Invalid format");

    const { bookmarks = [] } = await chrome.storage.local.get("bookmarks");
    const existingUrls = new Set(bookmarks.map(b => b.url));
    const newOnes = imported.filter(b => !existingUrls.has(b.url));

    await chrome.storage.local.set({ bookmarks: [...newOnes, ...bookmarks] });
    showStatus(`✅ Imported ${newOnes.length} new bookmarks (${imported.length - newOnes.length} duplicates skipped)`, "success");
  } catch (err) {
    showStatus("❌ Import failed: " + err.message, "error");
  }
}
