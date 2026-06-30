const fs = require('fs');
const path = require('path');

const distIndex = path.join(__dirname, '../dist/index.html');

const swScript = `
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js')
        .then(function (reg) {
          console.log('[PWA] SW registered, scope:', reg.scope);
        })
        .catch(function (err) {
          console.error('[PWA] SW registration failed:', err);
        });
    });
  }
</script>
`;

const manifestLink = `<link rel="manifest" href="/manifest.json" />`;

let html = fs.readFileSync(distIndex, 'utf8');

// Inject SW script
if (!html.includes('serviceWorker')) {
  html = html.replace('</body>', swScript + '</body>');
  console.log('[inject-pwa] SW script injected.');
} else {
  console.log('[inject-pwa] SW script already present, skipping.');
}

// Inject manifest link
if (!html.includes('manifest.json')) {
  html = html.replace('</head>', manifestLink + '</head>');
  console.log('[inject-pwa] Manifest link injected.');
} else {
  console.log('[inject-pwa] Manifest link already present, skipping.');
}

fs.writeFileSync(distIndex, html, 'utf8');
console.log('[inject-pwa] Done.');
