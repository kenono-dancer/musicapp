const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace the modal seeking logic
// find "modalSeekSlider.addEventListener('input'"
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

fs.writeFileSync('app.js', code);
