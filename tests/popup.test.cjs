const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');
async function harness(saved = {}, failSave = false) {
  const elements = {};
  function element(id) {
    return elements[id] ||= {value: '', textContent: '', classList: {toggle() {}}, handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; }, querySelector() { return element('save'); }};
  }
  const stored = {...saved}, tabs = [], copied = [];
  vm.runInNewContext(code, {URL, document: {getElementById: element},
    chrome: {storage: {local: {get: async () => stored, set: async data => { if (failSave) throw new Error("Storage unavailable"); Object.assign(stored, data); }}},
      tabs: {create: async data => tabs.push(data.url)}},
    navigator: {clipboard: {writeText: async text => copied.push(text)}}});
  await new Promise(resolve => setImmediate(resolve));
  return {elements, stored, tabs, copied};
}
test('popup restores, saves, and opens the chosen class link', async () => {
  const h = await harness({meetingURL: 'https://whaleon.us/o/old'});
  assert.equal(h.elements.meeting.value, 'https://whaleon.us/o/old');
  h.elements.meeting.value = ' https://whaleon.us/o/new ';
  await h.elements.settings.handlers.submit({preventDefault() {}});
  assert.equal(h.stored.meetingURL, 'https://whaleon.us/o/new');
  await h.elements.open.handlers.click();
  assert.deepEqual(h.tabs, ['https://whaleon.us/o/new']);
  await h.elements.copy.handlers.click();
  assert.deepEqual(h.copied, ['http://127.0.0.1:18745/']);
});
test('popup rejects unrelated, insecure, and credential-bearing links', async () => {
  for (const value of ['javascript:alert(1)', 'https://whaleon.us.evil.test/', 'http://whaleon.us/', 'https://user@whaleon.us/', 'https://whaleon.us:123/']) {
    const h = await harness();
    h.elements.meeting.value = value;
    await h.elements.open.handlers.click();
    assert.equal(h.tabs.length, 0);
    assert.equal(h.stored.meetingURL, undefined);
    assert.ok(h.elements.status.textContent);
  }
});
test('Meet links and custom relay ports route to the Meet player', async () => {
  const h = await harness({meetingURL:'https://meet.google.com/abc-defg-hij', relayPort:18747});
  await h.elements.open.handlers.click();
  assert.deepEqual(h.tabs, ['https://meet.google.com/abc-defg-hij']);
  await h.elements.copy.handlers.click();
  assert.equal(h.copied[0], 'http://127.0.0.1:18747/?source=meet');
  await h.elements.capture.handlers.click();
  assert.equal(h.tabs[1], 'http://127.0.0.1:18747/capture');
});

test('changing then copying a port saves it without a class link', async () => {
  const h = await harness({relayPort:18745});
  h.elements['relay-port'].value = '18749';
  h.elements['relay-port'].handlers.input();
  await h.elements.copy.handlers.click();
  assert.equal(h.stored.relayPort, 18749);
  assert.deepEqual(h.copied, ['http://127.0.0.1:18749/']);
  assert.equal(h.elements['recording-options'].src, 'http://127.0.0.1:18749/recording-settings?embed=1');
  assert.equal(h.stored.meetingURL, undefined);
});
test('port change applies independently and rejects invalid ports', async () => {
  const h = await harness({relayPort:18745});
  h.elements['relay-port'].value = '18747';
  await h.elements['relay-port'].handlers.change();
  assert.equal(h.stored.relayPort, 18747);
  assert.match(h.elements.status.textContent, /port saved/);
  h.elements['relay-port'].value = '99999';
  await h.elements['relay-port'].handlers.change();
  await h.elements.copy.handlers.click();
  assert.equal(h.stored.relayPort, 18747);
  assert.equal(h.copied.length, 0);
  assert.match(h.elements.status.textContent, /Could not/);
});

test('failed port persistence does not copy an unapplied address', async () => {
  const h = await harness({relayPort:18745}, true);
  h.elements['relay-port'].value = '18749';
  await h.elements.copy.handlers.click();
  assert.equal(h.stored.relayPort, 18745);
  assert.equal(h.copied.length, 0);
  assert.match(h.elements.status.textContent, /Storage unavailable/);
});
