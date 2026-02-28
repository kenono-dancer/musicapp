const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace any trailing variables
code = code.replace(/lockScreenAudio\.pause\(\);\n/g, "");
code = code.replace(/lockScreenAudio\.src = '';\n/g, "");
code = code.replace(/if \(activePlayer\) activePlayer\.destroy\(\);\n/g, "");
code = code.replace(/activePlayer = null;\n/g, "");

// Replace the init of those properties
code = code.replace(/let activePlayer = null;\n/g, "");
code = code.replace(/let audioCtx = null;\n/g, "");
code = code.replace(/let mediaStreamDestination = null;\n/g, "");

// Ensure updateProgress replacement fully eradicated activePlayer references in intervals
code = code.replace(/const duration = activePlayer \? activePlayer\.duration : 0;/g, "const duration = mainAudio.duration || 0;");
code = code.replace(/if \(activePlayer\) /g, "if (mainAudio.src) ");
code = code.replace(/activePlayer\.seek/g, "mainAudio.currentTime = ");

code = code.replace(/let loopStartPercent = null;/g, `let loopStartPercent = null;
let loopEndPercent = null;

// Native loop checker
mainAudio.addEventListener('timeupdate', () => {
    if (loopStartPercent !== null && loopEndPercent !== null) {
        const duration = mainAudio.duration || 0;
        const startSec = (loopStartPercent / 100) * duration;
        const endSec = (loopEndPercent / 100) * duration;
        if (mainAudio.currentTime >= endSec) {
            mainAudio.currentTime = startSec;
        }
    }
});`);

fs.writeFileSync('app.js', code);
