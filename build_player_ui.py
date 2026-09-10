"""Embed shared controls in both players, including legacy servers with no asset routes."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
css = (ROOT / 'player-ui.css').read_text()
js = (ROOT / 'player-ui.js').read_text()
for name in ('relay.html', 'auto-player.html'):
    path = ROOT / name
    html = path.read_text()
    if '<style id="relay-ui-style">' in html:
        html = html.split('<style id="relay-ui-style">')[0]
    else:
        html = html.rsplit('</html>', 1)[0]
    path.write_text(html + '<style id="relay-ui-style">' + css + '</style><script>' + js
                    + '\ninstallRelayUI(video,()=>audios);</script></html>\n')
