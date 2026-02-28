const fs = require('fs');

let code = fs.readFileSync('app.js', 'utf8');

// 1. Remove the dummy oscillator from unlockAudioContext
code = code.replace(/    const osc = audioCtx\.createOscillator\(\);\s+const gain = audioCtx\.createGain\(\);\s+gain\.gain\.value = 0;\s+osc\.connect\(gain\);\s+gain\.connect\(audioCtx\.destination\);\s+osc\.start\(0\);\s+osc\.stop\(0\);/g, '');

// 2. Add a playUIFeedback function
const feedbackCode = `
function playUIFeedback() {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Soft, pleasant "click/tick" sound
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);
    
    // Very low volume, imperceptible but provides feedback
    gain.gain.setValueAtTime(0.03, audioCtx.currentTime); 
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}
`;

if (!code.includes('function playUIFeedback')) {
    code = code.replace(/async function playSong\(index\) \{/, feedbackCode + '\nasync function playSong(index) {');
}

// 3. Insert playUIFeedback() inside playSong
if (!code.includes('playUIFeedback();')) {
    code = code.replace(/loadingOverlay\.classList\.remove\('hidden'\);/, "loadingOverlay.classList.remove('hidden');\n    playUIFeedback();");
}

fs.writeFileSync('app.js', code);

let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/APP_VERSION = '2\.96\.\d+'/, "APP_VERSION = '2.96.8'");
fs.writeFileSync('index.html', html);
