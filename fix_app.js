const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// The marker logic was deleted entirely by mistake due to greedy regex
// we need to put generateSeekMarkers() back safely if it's broken
// Actually let's just use standard replacements to remove the final bad variables
code = code.replace(/if \(activePlayer\) /g, "if (mainAudio && mainAudio.src) ");

// Remove the `updateMediaSessionPosition`
code = code.replace(/function updateMediaSessionPosition\(\) \{\n[\s\S]*?\}\n/g, "");

// Remove remaining `lockScreenAudio.currentTime = x`
code = code.replace(/lockScreenAudio\.currentTime = /g, "// lockScreenAudio.currentTime = ");

fs.writeFileSync('app.js', code);
