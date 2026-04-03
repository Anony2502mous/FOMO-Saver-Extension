// Extract page metadata for richer bookmark info
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EXTRACT_PAGE_INFO") {
    const meta = (name) => {
      const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      return el?.content || "";
    };

    sendResponse({
      title: document.title,
      url: window.location.href,
      description: meta("og:description") || meta("description"),
      image: meta("og:image"),
      excerpt: document.body?.innerText?.slice(0, 800) || "",
    });
  }
  return true;
});
