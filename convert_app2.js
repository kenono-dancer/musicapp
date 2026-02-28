const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace any trailing `activePlayer.isPlaying` checks
code = code.replace(/activePlayer && activePlayer\.isPlaying/g, "!mainAudio.paused");
code = code.replace(/!activePlayer\.isPlaying/g, "mainAudio.paused");

// Replace remaining activePlayer checks
code = code.replace(/if \(activePlayer\) \{\n[\s\S]*?activePlayer.seek\(0\);\n[\s\S]*?lockScreenAudio.currentTime = 0;\n[\s\S]*?\updatePlayPauseUI\(true\);\n[\s\S]*?\}/g, 
`if (mainAudio.src) {
    mainAudio.currentTime = 0;
    updatePlayPauseUI(true);
}`);

code = code.replace(/if \(activePlayer\) \{\n[\s\S]*?activePlayer.seek\(0\);\n[\s\S]*?lockScreenAudio.currentTime = 0;\n[\s\S]*?\}/g, 
`if (mainAudio.src) mainAudio.currentTime = 0;`);

code = code.replace(/if \(activePlayer\) /g, "if (mainAudio.src) ");

// Clean any remaining unused variables
code = code.replace(/lockScreenAudio\.pause\(\);\n/g, "");
code = code.replace(/lockScreenAudio\.currentTime = 0;\n/g, "");
code = code.replace(/if \(activePlayer\) activePlayer\.destroy\(\);\n/g, "");
code = code.replace(/activePlayer = null;\n/g, "");

fs.writeFileSync('app.js', code);
