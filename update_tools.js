const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace play/pause logic
code = code.replace(
    /function togglePlayPause\(\) \{\n[\s\S]*?\}\n/g,
    `function togglePlayPause() {
    if (currentSongIndex === -1 && songs.length > 0) {
        playSong(0);
        return;
    }
    if (!mainAudio.src) return;

    if (mainAudio.paused) {
        mainAudio.play();
        updatePlayPauseUI(true);
    } else {
        mainAudio.pause();
        updatePlayPauseUI(false);
    }
}
`
);

// Replace Speed change
code = code.replace(
    /speedSlider\.addEventListener\('input', \(e\) => \{\n[\s\S]*?\}\);\n/g,
    `speedSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    speedValue.textContent = val.toFixed(2);
    if (mainAudio.src) {
        mainAudio.playbackRate = val;
    }
    if (currentSongIndex !== -1) {
        songs[currentSongIndex].speed = val;
        saveSongProperties(songs[currentSongIndex].id, val, pitchToggle.checked);
    }
});
`
);

// Replace Pitch change
code = code.replace(
    /pitchToggle\.addEventListener\('change', \(e\) => \{\n[\s\S]*?\}\);\n/g,
    `pitchToggle.addEventListener('change', (e) => {
    const val = e.target.checked;
    if (mainAudio.src) {
        mainAudio.preservesPitch = val;
    }
    if (currentSongIndex !== -1) {
        songs[currentSongIndex].preservePitch = val;
        saveSongProperties(songs[currentSongIndex].id, speedSlider.value, val);
    }
});
`
);

fs.writeFileSync('app.js', code);
