'use strict';
const field = document.getElementById('meeting');
const status = document.getElementById('status');
const openButton = document.getElementById('open');
const form = document.getElementById('settings');
const saveButton = form.querySelector('button[type="submit"]');
const player = 'http://127.0.0.1:18745/';
function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}
function meetingURL(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid Whale ON invitation link.'); }
  if (url.protocol !== 'https:' || !['whaleon.us', 'one.whaleon.naver.com'].includes(url.hostname) || url.username || url.password || url.port) {
    throw new Error('Use an HTTPS link from whaleon.us or one.whaleon.naver.com.');
  }
  return url.href;
}
async function save() {
  const url = meetingURL(field.value);
  await chrome.storage.local.set({meetingURL: url});
  field.value = url;
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
    message('Class opened in Whale. Join the meeting to relay video.');
  } catch (error) { message(error.message, true); }
});
document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(player); message('Player address copied.'); }
  catch { message('Copy the address shown above manually.', true); }
});
field.disabled = openButton.disabled = saveButton.disabled = true;
chrome.storage.local.get('meetingURL').then(saved => {
  field.value = saved.meetingURL || '';
}).catch(() => message('Could not load the saved link. Please enter it again.', true))
  .finally(() => { field.disabled = openButton.disabled = saveButton.disabled = false; });
