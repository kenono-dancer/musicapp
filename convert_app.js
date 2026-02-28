const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

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

// 3. Complete rewrite of playSong
const startPlay = code.indexOf('async function playSong(index) {');
const endPlay = code.indexOf('function playNext() {');
if (startPlay !== -1 && endPlay !== -1) {
    const playBlock = `async function playSong(index) {
    if (index < 0 || index >= songs.length) return;

    const song = songs[index];
    currentSongIndex = index;

    if (currentObjectURL && !currentObjectURL.startsWith('audio/')) {
        URL.revokeObjectURL(currentObjectURL);
    }

    mainAudio.pause();
    
    let audioUrl = navigator.serviceWorker && navigator.serviceWorker.controller
        ? \`audio/\${song.id}\`
        : URL.createObjectURL(song.blob);
        
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        currentObjectURL = audioUrl;
    }

    // Set the native source
    mainAudio.src = audioUrl;
    
    // Apply speed and pitch settings
    const savedSpeed = song.speed !== undefined ? song.speed : parseFloat(speedSlider.value);
    const savedPitch = song.preservePitch !== undefined ? song.preservePitch : pitchToggle.checked;
    
    mainAudio.playbackRate = savedSpeed;
    mainAudio.preservesPitch = savedPitch;

    speedSlider.value = savedSpeed;
    speedValue.textContent = savedSpeed.toFixed(2);
    pitchToggle.checked = savedPitch;

    loadingOverlay.classList.remove('hidden');

    try {
        await mainAudio.play();
        loadingOverlay.classList.add('hidden');
        
        updatePlayPauseUI(true);
        currentTitle.textContent = song.name;
        modalSongTitle.textContent = song.name;
        
        renderSongList();
        generateSeekMarkers();

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.name,
                artist: 'My Music',
                album: 'Offline Player'
            });
            navigator.mediaSession.setActionHandler('play', () => {
                mainAudio.play();
                updatePlayPauseUI(true);
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                mainAudio.pause();
                updatePlayPauseUI(false);
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
            navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime !== undefined) {
                    mainAudio.currentTime = details.seekTime;
                }
            });
        }
    } catch (error) {
        loadingOverlay.classList.add('hidden');
        console.error("Error playing audio:", error);
        alert("Failed to play audio. The file might be corrupted or playback blocked.");
        updatePlayPauseUI(false);
    }
}

`;
    code = code.substring(0, startPlay) + playBlock + code.substring(endPlay);
}

// 4. Input controls rewrite
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

// 5. Native event progress loop
code = code.replace(
    /function updateProgress\(\) \{\n[\s\S]*?\n\}/g,
    `// Using native timeupdate event instead of updateProgress loop
let isSeeking = false;
mainAudio.addEventListener('timeupdate', () => {
    if (isSeeking) return; // Don't snap back while user is dragging
    const duration = mainAudio.duration || 0;
    const current = mainAudio.currentTime || 0;
    if (duration > 0) {
        const percent = (current / duration) * 100;
        seekSlider.value = percent;
        modalSeekSlider.value = percent;
        
        currentTimeEl.textContent = formatTime(current);
        modalCurrentTime.textContent = formatTime(current);
        
        // Native media session update
        if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
            navigator.mediaSession.setPositionState({
                duration: duration,
                playbackRate: mainAudio.playbackRate,
                position: current
            });
        }
    }
});

mainAudio.addEventListener('loadedmetadata', () => {
    const duration = mainAudio.duration || 0;
    durationEl.textContent = formatTime(duration);
    modalDuration.textContent = formatTime(duration);
});

mainAudio.addEventListener('ended', handleSongEnd);
`
);

// 6. UI event fixes (Sliders)
code = code.replace(
    /seekSlider\.addEventListener\('input', \(\) => \{\n[\s\S]*?\}\);\n\nseekSlider\.addEventListener\('change', \(\) => \{\n[\s\S]*?\}\);/g,
    `seekSlider.addEventListener('input', () => {
    isSeeking = true;
    const duration = mainAudio.duration || 0;
    const time = (seekSlider.value / 100) * duration;
    currentTimeEl.textContent = formatTime(time);
});

seekSlider.addEventListener('change', () => {
    isSeeking = false;
    const duration = mainAudio.duration || 0;
    const time = (seekSlider.value / 100) * duration;
    if (mainAudio.src) mainAudio.currentTime = time;
});`
);

code = code.replace(
    /modalSeekSlider\.addEventListener\('input', \(\) => \{\n[\s\S]*?\}\);\n\nmodalSeekSlider\.addEventListener\('change', \(\) => \{\n[\s\S]*?\}\);/g,
    `modalSeekSlider.addEventListener('input', () => {
    isSeeking = true;
    const duration = mainAudio.duration || 0;
    const time = (modalSeekSlider.value / 100) * duration;
    modalCurrentTime.textContent = formatTime(time);
});

modalSeekSlider.addEventListener('change', () => {
    isSeeking = false;
    const duration = mainAudio.duration || 0;
    const time = (modalSeekSlider.value / 100) * duration;
    if (mainAudio.src) mainAudio.currentTime = time;
});`
);

// 7. handleEnd and state UI
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

code = code.replace(
    /if \(modalSkipBackBtn\) \{\n    modalSkipBackBtn\.addEventListener\('click', \(\) => \{\n        if \(activePlayer\) \{\n            activePlayer\.seek\(0\);\n            lockScreenAudio\.currentTime = 0;\n        \}\n    \}\);\n\}/g,
    `if (modalSkipBackBtn) {
    modalSkipBackBtn.addEventListener('click', () => {
        if (mainAudio.src) mainAudio.currentTime = 0;
    });
}`
);

code = code.replace(
    /if \(modalSkipFwdBtn\) \{\n    modalSkipFwdBtn\.addEventListener\('click', \(\) => \{\n        playNext\(\);\n    \}\);\n\}/g,
    `if (modalSkipFwdBtn) {
    modalSkipFwdBtn.addEventListener('click', () => {
        playNext();
    });
}`
);

code = code.replace(
    /const skipTime = \(seconds\) => \{\n    if \(activePlayer\) \{\n        const newTime = Math\.max\(0, activePlayer\.currentTime \+ seconds\);\n        const percent = \(newTime \/ activePlayer\.duration\) \* 100;\n        activePlayer\.seek\(percent\);\n        lockScreenAudio\.currentTime = newTime;\n    \}\n\};/g,
    `const skipTime = (seconds) => {
    if (mainAudio.src) {
        mainAudio.currentTime = Math.max(0, Math.min(mainAudio.currentTime + seconds, mainAudio.duration || 0));
    }
};`
);

// Loop bounds checker
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

// Update marker interactions via DOM lookup
code = code.replace(/if \(activePlayer\) \{\n[\s\S]*?activePlayer\.seek\(percent\);\n[\s\S]*?lockScreenAudio\.currentTime = time;\n[\s\S]*?\}/g, 
"if (mainAudio.src) mainAudio.currentTime = time; \n");

fs.writeFileSync('app.js', code);
