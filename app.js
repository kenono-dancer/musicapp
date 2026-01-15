// DOM Elements
const fileInput = document.getElementById('file-input');
const addMusicBtn = document.getElementById('add-music-btn');
const songList = document.getElementById('song-list');
const emptyState = document.getElementById('empty-state');
const playerBar = document.getElementById('player-bar');
const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const currentTitle = document.getElementById('current-title');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const seekSlider = document.getElementById('seek-slider');
const skipBackBtn = document.getElementById('skip-back-btn');
const skipFwdBtn = document.getElementById('skip-fwd-btn');

const expandControlsBtn = document.getElementById('expand-controls-btn');
const playerModal = document.getElementById('player-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalSongTitle = document.getElementById('modal-song-title');
const speedSlider = document.getElementById('speed-slider');
const speedValue = document.getElementById('speed-value');
const resetSpeedBtn = document.getElementById('reset-speed-btn');
const pitchToggle = document.getElementById('pitch-toggle');

// State
let db;
let audio = new Audio();
let songs = [];
let currentSongIndex = -1;
let isDraggingSeek = false;

// Format Time
function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Initialize IndexedDB
const request = indexedDB.open('MusicPlayerDB', 1);

request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    }
};

request.onsuccess = (e) => {
    db = e.target.result;
    loadSongs();
};

request.onerror = (e) => {
    console.error('DB Error', e);
};

// Functions
function loadSongs() {
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
        songs = getAllReq.result;
        renderSongList();
    };
}

function saveSong(file) {
    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const song = {
        name: file.name,
        blob: file,
        dateAdded: new Date()
    };
    store.add(song);
    transaction.oncomplete = () => loadSongs();
}

function deleteSong(id, event) {
    event.stopPropagation();
    if (!confirm('Delete this song?')) return;
    
    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    store.delete(id);
    transaction.oncomplete = () => loadSongs();
}

function renderSongList() {
    songList.innerHTML = '';
    if (songs.length === 0) {
        emptyState.classList.remove('hidden');
        playerBar.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        playerBar.classList.remove('hidden');
        
        songs.forEach((song, index) => {
            const li = document.createElement('li');
            li.className = `song-item ${index === currentSongIndex ? 'active' : ''}`;
            li.innerHTML = `
                <div class="song-item-info">
                    <div class="song-name">${song.name}</div>
                </div>
                <button class="delete-btn" onclick="deleteSong(${song.id}, event)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            `;
            li.onclick = () => playSong(index);
            songList.appendChild(li);
        });
    }
}

function playSong(index) {
    if (index < 0 || index >= songs.length) return;
    
    currentSongIndex = index;
    const song = songs[index];
    const url = URL.createObjectURL(song.blob);
    
    audio.src = url;
    audio.play()
        .then(() => updatePlayPauseUI(true))
        .catch(e => console.error("Playback failed", e));
        
    currentTitle.textContent = song.name;
    modalSongTitle.textContent = song.name;
    
    // Apply current settings
    updateSpeed();
    updatePitchPreservation();
    
    renderSongList(); // Retrieve active state
    
    // Setup metadata
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.name,
            artist: 'My Music',
            album: 'Offline Player'
        });
        
        navigator.mediaSession.setActionHandler('play', () => { audio.play(); });
        navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); });
        navigator.mediaSession.setActionHandler('previoustrack', () => { playPrev(); });
        navigator.mediaSession.setActionHandler('nexttrack', () => { playNext(); });
    }
}

function togglePlayPause() {
    if (audio.paused) {
        if (currentSongIndex === -1 && songs.length > 0) playSong(0);
        else audio.play();
    } else {
        audio.pause();
    }
}

function updatePlayPauseUI(isPlaying) {
    if (isPlaying) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
    } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    }
}

function playNext() {
    let nextIndex = currentSongIndex + 1;
    if (nextIndex >= songs.length) nextIndex = 0;
    playSong(nextIndex);
}

function playPrev() {
    let prevIndex = currentSongIndex - 1;
    if (prevIndex < 0) prevIndex = songs.length - 1;
    playSong(prevIndex);
}

function updateSpeed() {
    const speed = parseFloat(speedSlider.value);
    audio.playbackRate = speed;
    speedValue.textContent = speed.toFixed(2);
}

function updatePitchPreservation() {
    // preservesPitch logic
    // In standard HTML5 Audio, playbackRate usually DOES preserve pitch (time stretch).
    // To change pitch with speed (vinyl effect), we must set preservesPitch = false.
    // However, browser support varies. 
    // 'preservesPitch' (standard), 'mozPreservesPitch' (Firefox), 'webkitPreservesPitch' (Safari/Chrome legacy)
    
    const preserve = pitchToggle.checked;
    
    if (audio.preservesPitch !== undefined) {
        audio.preservesPitch = preserve;
    } else if (audio.mozPreservesPitch !== undefined) {
        audio.mozPreservesPitch = preserve;
    } else if (audio.webkitPreservesPitch !== undefined) {
        audio.webkitPreservesPitch = preserve;
    } else {
        console.warn("preservesPitch not supported in this browser");
    }
}

// Event Listeners
addMusicBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => saveSong(file));
    fileInput.value = ''; // Reset
});

playPauseBtn.addEventListener('click', togglePlayPause);
skipFwdBtn.addEventListener('click', playNext);
skipBackBtn.addEventListener('click', playPrev);

audio.addEventListener('play', () => updatePlayPauseUI(true));
audio.addEventListener('pause', () => updatePlayPauseUI(false));
audio.addEventListener('ended', playNext);

audio.addEventListener('timeupdate', () => {
    if (!isDraggingSeek) {
        const percent = (audio.currentTime / audio.duration) * 100;
        seekSlider.value = isNaN(percent) ? 0 : percent;
        currentTimeEl.textContent = formatTime(audio.currentTime);
    }
    durationEl.textContent = formatTime(audio.duration);
});

seekSlider.addEventListener('input', () => {
    isDraggingSeek = true;
    const time = (seekSlider.value / 100) * audio.duration;
    currentTimeEl.textContent = formatTime(time);
});

seekSlider.addEventListener('change', () => {
    isDraggingSeek = false;
    const time = (seekSlider.value / 100) * audio.duration;
    audio.currentTime = time;
});

// Modal & Settings
expandControlsBtn.addEventListener('click', () => {
    playerModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
    playerModal.classList.add('hidden');
});

speedSlider.addEventListener('input', updateSpeed);
resetSpeedBtn.addEventListener('click', () => {
    speedSlider.value = 1.0;
    updateSpeed();
});

pitchToggle.addEventListener('change', updatePitchPreservation);

// Mobile: Prevent Pull-to-Refresh
document.body.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });
document.getElementById('library-view').addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: true });
document.querySelector('.modal-content').addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: true });

// Expose delete function to global scope
window.deleteSong = deleteSong;

// Apply initial polyfills for pitch if needed
// (Most modern browsers support preservesPitch or default to preserving it)
