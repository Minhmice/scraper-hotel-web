chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'downloadJson' && message.payload) {
    const blob = new Blob([JSON.stringify(message.payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `hotel_${Date.now()}.json`, saveAs: true }, () => {
      URL.revokeObjectURL(url);
    });
    sendResponse({ ok: true });
    return true;
  }
  if (message && message.type === 'appendDataset' && message.payload) {
    (async () => {
      try {
        const { dataset = [] } = await chrome.storage.local.get(['dataset']);
        const next = Array.isArray(dataset) ? dataset.slice() : [];
        next.push(message.payload);
        await chrome.storage.local.set({ dataset: next });
        const blob = new Blob([JSON.stringify(next, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename: 'data.json', saveAs: false }, () => {
          URL.revokeObjectURL(url);
        });
        sendResponse({ ok: true, count: next.length });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }
});

