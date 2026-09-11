// Isolated world: expose only the validated local port to the page-world relay.
(() => {
  let revision = 0;
  const publish = value => {
    const port = Number(value ?? 18745);
    if (Number.isInteger(port) && port >= 1024 && port <= 65535)
      window.dispatchEvent(new CustomEvent('whale-relay-config', {detail:String(port)}));
  };
  async function refresh() {
    const current = ++revision;
    const saved = await chrome.storage.local.get('relayPort');
    if (current === revision) publish(saved.relayPort);
  }
  window.addEventListener('whale-relay-ready', () => refresh().catch(() => {}));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.relayPort) {
      revision++;
      publish(changes.relayPort.newValue);
    }
  });
  refresh().catch(() => {});
})();
