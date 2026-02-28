const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace progress Update loop
code = code.replace(
    /function updateProgress\(\) \{\n[\s\S]*?\n\}/g,
    `// Using native timeupdate event instead of updateProgress loop
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

// We need to inject the `isSeeking` variable 
// and update the input/change listeners for the sliders
const isSeekingBlock = `
let isSeeking = false;
`;

// It's probably easier to just find the sliders and replace
code = code.replace(
    /seekSlider\.addEventListener\('input', \(\) => \{\n[\s\S]*?\}\);\n\nseekSlider\.addEventListener\('change', \(\) => \{\n[\s\S]*?\}\);/g,
    `let isSeeking = false;

seekSlider.addEventListener('input', () => {
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

fs.writeFileSync('app.js', code);
