'use strict';
const field = document.getElementById('meeting');
const status = document.getElementById('status');
const openButton = document.getElementById('open');
const form = document.getElementById('settings');
const saveButton = form.querySelector('button[type="submit"]');
const portField = document.getElementById('relay-port');
const captureButton = document.getElementById('capture');
function baseURL() {
  const port = Number(portField.value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a server port between 1024 and 65535.');
  return `http://127.0.0.1:${port}/`;
}
function playerURL() {
  let meet = false;
  try { meet = new URL(field.value).hostname === 'meet.google.com'; } catch {}
  return baseURL() + (meet ? '?source=meet' : '');
}
function refreshAddress() { try { document.getElementById('player-address').textContent = playerURL(); } catch {} }
portField.addEventListener('input', refreshAddress);
function refreshRecordingSettings(){try{document.getElementById('recording-options').src=baseURL()+'recording-settings?embed=1';}catch{}}
portField.addEventListener('change', refreshRecordingSettings);
field.addEventListener('input', refreshAddress);
function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}
function meetingURL(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid Whale ON or Google Meet invitation link.'); }
  if (url.protocol !== 'https:' || !['whaleon.us', 'one.whaleon.naver.com', 'meet.google.com'].includes(url.hostname) || url.username || url.password || url.port) {
    throw new Error('Use an HTTPS link from whaleon.us one.whaleon.naver.com, or meet.google.com.');
  }
  return url.href;
}
async function save() {
  const url = meetingURL(field.value);
  baseURL();
  await chrome.storage.local.set({meetingURL: url, relayPort: Number(portField.value)});
  field.value = url; refreshAddress();
  return url;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  try { await save(); message('Class link saved in this browser.'); }
  catch (error) { message(error.message, true); }
});
openButton.addEventListener('click', async () => {
  try {
    const url = await save();
    await chrome.tabs.create({url});
    message('Class opened. For Meet, join the call, then open the tab relay below.');
  } catch (error) { message(error.message, true); }
});
document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(playerURL()); message('Player address copied.'); }
  catch { message('Copy the address shown above manually.', true); }
});
captureButton.addEventListener('click', async () => {
  try {
    const url = baseURL() + 'capture';
    await chrome.storage.local.set({relayPort:Number(portField.value)});
    await chrome.tabs.create({url});
  } catch (error) { message(error.message, true); }
});
field.disabled = openButton.disabled = saveButton.disabled = captureButton.disabled = portField.disabled = true;
chrome.storage.local.get(['meetingURL', 'relayPort']).then(saved => {
  field.value = saved.meetingURL || '';
  portField.value = saved.relayPort || 18745; refreshAddress(); refreshRecordingSettings();
}).catch(() => message('Could not load the saved link. Please enter it again.', true))
  .finally(() => { field.disabled = openButton.disabled = saveButton.disabled = captureButton.disabled = portField.disabled = false; });
