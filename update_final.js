const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace handleSongEnd
code = code.replace(
    /function handleSongEnd\(\) \{\n[\s\S]*?\}\n/g,
    `function handleSongEnd() {
    if (playbackMode === 'all') {
        playNext();
    } else if (playbackMode === 'one' && mainAudio.src) {
        mainAudio.currentTime = 0;
        mainAudio.play();
    } else if (playbackMode === 'single') {
        mainAudio.currentTime = 0;
        updatePlayPauseUI(false);
    }
}
`
);

// updatePlayPauseUI activePlayer.isPlaying -> !mainAudio.paused
code = code.replace(
    /function updatePlayPauseUI\(isPlaying\) \{\n[\s\S]*?\}\n/g,
    `function updatePlayPauseUI(isPlaying) {
    if (isPlaying) {
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        modalPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        modalPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
}
`
);

// Skip backward / forward modal buttons
code = code.replace(
    /if \(modalSkipBackBtn\) \{\n    modalSkipBackBtn\.addEventListener\('click', \(\) => \{\n        if \(activePlayer\) \{\n            activePlayer\.seek\(0\);\n            lockScreenAudio\.currentTime = 0;\n        \}\n    \}\);\n\}/g,
    `if (modalSkipBackBtn) {
    modalSkipBackBtn.addEventListener('click', () => {
        if (mainAudio.src) mainAudio.currentTime = 0;
    });
}`
);

// Next skip
code = code.replace(
    /if \(modalSkipFwdBtn\) \{\n    modalSkipFwdBtn\.addEventListener\('click', \(\) => \{\n        playNext\(\);\n    \}\);\n\}/g,
    `if (modalSkipFwdBtn) {
    modalSkipFwdBtn.addEventListener('click', () => {
        playNext();
    });
}`
);

// Skip +/- 15s keys
code = code.replace(
    /const skipTime = \(seconds\) => \{\n    if \(activePlayer\) \{\n        const newTime = Math\.max\(0, activePlayer\.currentTime \+ seconds\);\n        const percent = \(newTime \/ activePlayer\.duration\) \* 100;\n        activePlayer\.seek\(percent\);\n    \}\n\};/g,
    `const skipTime = (seconds) => {
    if (mainAudio.src) {
        mainAudio.currentTime = Math.max(0, Math.min(mainAudio.currentTime + seconds, mainAudio.duration || 0));
    }
};`
);

// Remove the explicit mute toggle button from the UI listeners to avoid lockScreenAudio references
code = code.replace(
    /const renderClickableMarkers =[\s\S]*?function generateSeekMarkers\(\)/g,
    `function generateSeekMarkers()`
);

fs.writeFileSync('app.js', code);
