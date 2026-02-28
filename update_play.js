const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace playSong
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

    try {
        await mainAudio.play();
        
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
        console.error("Error playing audio:", error);
        alert("Failed to play audio. The file might be corrupted.");
        updatePlayPauseUI(false);
    }
}

`;
    code = code.substring(0, startPlay) + playBlock + code.substring(endPlay);
}

fs.writeFileSync('app.js', code);
