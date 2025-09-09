async function getActiveTab() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	return tab;
}

function setStatus(text) {
	document.getElementById('status').textContent = text;
}

function download(filename, text) {
	const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	URL.revokeObjectURL(url);
	a.remove();
}

async function ensureContentScript(tabId) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			files: ['content/agoda.js']
		});
	} catch (e) {
		// ignore if already injected by manifest
	}
}

async function scrapeCurrentTab() {
	const tab = await getActiveTab();
	if (!tab || !tab.id) {
		setStatus('No active tab.');
		return;
	}
	setStatus('Scraping...');
	try {
		await ensureContentScript(tab.id);
		const res = await chrome.tabs.sendMessage(tab.id, { type: 'AGODA_SCRAPE_REQUEST' });
		if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Unknown error');
		const obj = res.data;
		const json = JSON.stringify(obj, null, 2);
		document.getElementById('output').value = json;
		setStatus('Done.');
	} catch (err) {
		setStatus('Error: ' + String(err && err.message || err));
	}
}

document.getElementById('scrape').addEventListener('click', scrapeCurrentTab);
document.getElementById('copy').addEventListener('click', async () => {
	const txt = document.getElementById('output').value;
	try {
		await navigator.clipboard.writeText(txt);
		setStatus('Copied to clipboard.');
	} catch (e) {
		setStatus('Copy failed: ' + String(e && e.message || e));
	}
});
document.getElementById('download').addEventListener('click', () => {
	const txt = document.getElementById('output').value;
	const name = 'agoda_hotel_' + Date.now() + '.json';
	download(name, txt);
});


