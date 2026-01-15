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
let playbackMode = 'all'; // 'all' (Loop All), 'one' (Loop One), 'single' (Stop)

// UI Refs
const loadingOverlay = document.getElementById('loading-overlay');
const playbackModeBtn = document.getElementById('playback-mode-btn');

// Format Time
function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Initialize IndexedDB
const request = indexedDB.open('MusicPlayerDB', 2); // Increment to trigger upgrade if needed (though schema same)

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
        // Sort by 'order' if exists, otherwise by id
        songs.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : a.id;
            const orderB = b.order !== undefined ? b.order : b.id;
            return orderA - orderB;
        });

        // Normalize orders
        songs.forEach((song, index) => {
            if (song.order !== index) {
                song.order = index;
                // We could update DB here to be clean, but lazy update is fine
            }
        });

        renderSongList();
    };
}

function saveSong(file) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        const song = {
            name: file.name,
            blob: file,
            dateAdded: new Date(),
            order: songs.length // Append to end
        };
        const req = store.add(song);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function deleteSong(id, event) {
    event.stopPropagation();
    if (!confirm('Delete this song?')) return;

    // Check if deleting currently playing song
    const idx = songs.findIndex(s => s.id === id);
    if (idx === currentSongIndex) {
        audio.pause();
        audio.src = '';
        currentTitle.textContent = 'Not Playing';
        currentSongIndex = -1;
        updatePlayPauseUI(false);
    } else if (idx < currentSongIndex) {
        currentSongIndex--;
    }

    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    store.delete(id);
    transaction.oncomplete = () => loadSongs();
}

function moveSong(index, direction, event) {
    event.stopPropagation();
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= songs.length) return;

    // Swap in array
    const temp = songs[index];
    songs[index] = songs[newIndex];
    songs[newIndex] = temp;

    // Update IDs for tracking playing song logic
    if (currentSongIndex === index) currentSongIndex = newIndex;
    else if (currentSongIndex === newIndex) currentSongIndex = index;

    // Update 'order' in DB
    const s1 = songs[index];
    const s2 = songs[newIndex];

    s1.order = index;
    s2.order = newIndex;

    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    store.put(s1);
    store.put(s2);

    transaction.oncomplete = () => {
        renderSongList();
    };
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

            const isFirst = index === 0;
            const isLast = index === songs.length - 1;

            li.innerHTML = `
                <div class="song-item-info">
                    <div class="song-name">${song.name}</div>
                </div>
                <div class="song-actions">
                    <button class="reorder-btn" onclick="moveSong(${index}, -1, event)" ${isFirst ? 'disabled' : ''}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>
                    </button>
                    <button class="reorder-btn" onclick="moveSong(${index}, 1, event)" ${isLast ? 'disabled' : ''}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                    </button>
                    <button class="delete-btn" onclick="deleteSong(${song.id}, event)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            `;
            li.onclick = (e) => {
                // Ignore clicks on buttons
                if (e.target.closest('button')) return;
                playSong(index);
            };
            songList.appendChild(li);
        });
    }
}

function playSong(index) {
    if (index < 0 || index >= songs.length) return;

    currentSongIndex = index;
    const song = songs[index];

    // Revoke previous object URL to avoid leaks? 
    // Usually browser handles it, but good practice if we were creating many.
    // For simplicity, we just create new one.
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

function handleSongEnd() {
    if (playbackMode === 'one') {
        // Loop One
        audio.currentTime = 0;
        audio.play();
    } else if (playbackMode === 'single') {
        // Stop (Single)
        updatePlayPauseUI(false);
    } else {
        // Loop All (default)
        playNext();
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
    const preserve = pitchToggle.checked;

    if (audio.preservesPitch !== undefined) {
        audio.preservesPitch = preserve;
    } else if (audio.mozPreservesPitch !== undefined) {
        audio.mozPreservesPitch = preserve;
    } else if (audio.webkitPreservesPitch !== undefined) {
        audio.webkitPreservesPitch = preserve;
    }
}

// Playback Mode Logic
function togglePlaybackMode() {
    // Cycle: all -> one -> single -> all
    if (playbackMode === 'all') {
        playbackMode = 'one';
        playbackModeBtn.textContent = 'Loop One 🔂';
    } else if (playbackMode === 'one') {
        playbackMode = 'single';
        playbackModeBtn.textContent = 'Stop (Single) 🛑';
    } else {
        playbackMode = 'all';
        playbackModeBtn.textContent = 'Loop All 🔁';
    }
}

// Event Listeners
addMusicBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    loadingOverlay.classList.remove('hidden');
    let loadedCount = 0;
    const total = files.length;
    loadingOverlay.querySelector('p').textContent = `Loading 0/${total}...`;

    // Process sequentially to maintain order and not freeze UI too much
    for (const file of files) {
        await saveSong(file);
        loadedCount++;
        loadingOverlay.querySelector('p').textContent = `Loading ${loadedCount}/${total}...`;
    }

    loadSongs(); // Reload list once
    loadingOverlay.classList.add('hidden');
    fileInput.value = ''; // Reset
});

playPauseBtn.addEventListener('click', togglePlayPause);
skipFwdBtn.addEventListener('click', playNext);
skipBackBtn.addEventListener('click', playPrev);

audio.addEventListener('play', () => updatePlayPauseUI(true));
audio.addEventListener('pause', () => updatePlayPauseUI(false));
audio.addEventListener('ended', handleSongEnd);

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
playbackModeBtn.addEventListener('click', togglePlaybackMode);

// Mobile: Prevent Pull-to-Refresh
document.body.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
document.getElementById('library-view').addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
document.querySelector('.modal-content').addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });

// Skip Time
window.skipTime = function (seconds) {
    if (audio.src) {
        audio.currentTime += seconds;
    }
};

// Force Update
window.forceUpdate = function () {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
            for (let registration of registrations) {
                registration.unregister();
            }
            window.location.reload(true);
        });
    } else {
        window.location.reload(true);
    }
};
