async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const state = { data: null };

document.getElementById('scrape').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_BOOKING' });
    if (res?.ok) {
      state.data = res.data;
      document.getElementById('output').textContent = JSON.stringify(res.data, null, 2);
      document.getElementById('download').disabled = false;
      document.getElementById('copy').disabled = false;
    } else {
      document.getElementById('output').textContent = JSON.stringify(res?.error || 'Unknown error', null, 2);
    }
  } catch (err) {
    document.getElementById('output').textContent = String(err);
  }
});

document.getElementById('download').addEventListener('click', () => {
  if (!state.data) return;
  chrome.runtime.sendMessage({ type: 'downloadJson', payload: state.data });
});

document.getElementById('copy').addEventListener('click', async () => {
  if (!state.data) return;
  await navigator.clipboard.writeText(JSON.stringify(state.data, null, 2));
});


