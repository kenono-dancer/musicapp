const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace the top audio engine setup
const startTop = code.indexOf('// ─── Proper iOS Background Routing ──────────');
const endTop = code.indexOf('    async _initWorklet() {');
if (startTop !== -1 && endTop !== -1) {
    const endTopBlock = code.indexOf('\n    }', endTop) + 6;
    code = code.substring(0, startTop) + `// ─── Orthodox Native Audio Playback ──────────────────────────────────────────
// Reverted to pure HTML5 <audio> for 100% compliant iOS lock screen and 
// background audio support, discarding SoundTouchJS Worklets.
const mainAudio = new Audio();
// We allow iOS to handle background tasks naturally via MediaSession
mainAudio.setAttribute('playsinline', '');
document.body.appendChild(mainAudio);\n\n` + code.substring(code.indexOf('class SoundTouchPlayer', startTop));
}

fs.writeFileSync('app.js', code);
