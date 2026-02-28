const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

function replaceAll(str, find, replace) {
    return str.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
}

// 1. Delete redundant variables
code = code.replace("let streamAudio = document.getElementById('stream-audio');\n", "");

// 2. Fix the delete song logic
const deleteBlockOld = `    if (idx === currentSongIndex) {
        streamAudio.pause();
        streamAudio.srcObject = null; // Clear the stream
        lockScreenAudio.pause();
        lockScreenAudio.currentTime = 0;
        if (activePlayer) activePlayer.destroy();
        activePlayer = null;
        currentTitle.textContent = 'Not Playing';`;

const deleteBlockNew = `    if (idx === currentSongIndex) {
        mainAudio.pause();
        mainAudio.src = '';
        currentTitle.textContent = 'Not Playing';`;

code = code.replace(deleteBlockOld, deleteBlockNew);

fs.writeFileSync('app.js', code);
