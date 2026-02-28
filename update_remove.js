const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// 1. Remove the playUIFeedback function definition
code = code.replace(/function playUIFeedback\(\) \{[\s\S]*?\}\n/g, '');

// 2. Remove the call to playUIFeedback()
code = code.replace(/loadingOverlay\.classList\.remove\('hidden'\);\s*playUIFeedback\(\);/g, "loadingOverlay.classList.remove('hidden');");

fs.writeFileSync('app.js', code);

let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/APP_VERSION = '2\.96\.\d+'/, "APP_VERSION = '2.96.9'");
fs.writeFileSync('index.html', html);
