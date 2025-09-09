async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const state = { data: null, loading: false };

function setLoading(isLoading) {
  state.loading = isLoading;
  const scrapeBtn = document.getElementById('scrape');
  scrapeBtn.classList.toggle('loading', isLoading);
  scrapeBtn.disabled = isLoading;
}

function showToast(message, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; el.textContent = ''; }, 1800);
}

document.getElementById('scrape').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  try {
    setLoading(true);
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_BOOKING' });
    if (res?.ok) {
      state.data = res.data;
      document.getElementById('output').textContent = JSON.stringify(res.data, null, 2);
      document.getElementById('download').disabled = false;
      document.getElementById('copy').disabled = false;
      const meta = document.getElementById('meta');
      meta.textContent = new URL(res.data.source).hostname;
      showToast('Scraped successfully');

      // Auto-append to dataset and export to data.json
      const r2 = await chrome.runtime.sendMessage({ type: 'appendDataset', payload: res.data });
      if (r2?.ok) {
        showToast(`Saved to data.json (${r2.count})`);
      } else if (r2?.error) {
        showToast('Save failed', 'error');
      }
    } else {
      document.getElementById('output').textContent = JSON.stringify(res?.error || 'Unknown error', null, 2);
      showToast('Scrape failed', 'error');
    }
  } catch (err) {
    document.getElementById('output').textContent = String(err);
    showToast('Error occurred', 'error');
  } finally {
    setLoading(false);
  }
});

document.getElementById('download').addEventListener('click', () => {
  if (!state.data) return;
  chrome.runtime.sendMessage({ type: 'downloadJson', payload: state.data });
  showToast('Downloading JSON');
});

document.getElementById('copy').addEventListener('click', async () => {
  if (!state.data) return;
  await navigator.clipboard.writeText(JSON.stringify(state.data, null, 2));
  showToast('Copied to clipboard');
});


