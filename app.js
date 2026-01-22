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
const loadingOverlay = document.getElementById('loading-overlay');
const playbackModeBtn = document.getElementById('playback-mode-toggle');
const settingsView = document.getElementById('settings-view');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const modalPlayPauseBtn = document.getElementById('modal-play-pause-btn');
const modalPlayIcon = document.getElementById('modal-play-icon');
const modalPauseIcon = document.getElementById('modal-pause-icon');

// Defined globally in index.html for robustness, but also here for reference if needed
// window.openSettings = ...

// State
let db;
let audio = new Audio();
let songs = [];
let currentSongIndex = -1;
let isDraggingSeek = false;
let playbackMode = 'all'; // 'all' (Loop All), 'one' (Loop One), 'single' (Stop)
let lastBackPressTime = 0;
let longPressTimer = null;
let rewindInterval = null;
let isLongPressing = false;

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

// Request Persistent Storage
if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(granted => {
        console.log(granted ? 'Storage persistence granted' : 'Storage persistence denied');
        if (granted) {
            // Optional: Notify user or just log it
            console.log('Your library is safe from auto-eviction.');
        }
    });

    navigator.storage.estimate().then(estimate => {
        console.log(`Using ${estimate.usage} / ${estimate.quota} bytes.`);
    });
}

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
            order: songs.length, // Append to end
            speed: 1.0, // Default speed
            preservePitch: true // Default pitch
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
                    <div class="song-name">
                        ${song.name}
                        ${(song.speed && song.speed !== 1.0) ? `<span class="speed-badge">${song.speed.toFixed(2)}x</span>` : ''}
                    </div>
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
    // Apply current settings
    // Load per-song settings or default
    const savedSpeed = song.speed !== undefined ? song.speed : 1.0;
    const savedPitch = song.preservePitch !== undefined ? song.preservePitch : true;

    // Apply to Audio
    audio.playbackRate = savedSpeed;
    if (audio.preservesPitch !== undefined) audio.preservesPitch = savedPitch;
    else if (audio.mozPreservesPitch !== undefined) audio.mozPreservesPitch = savedPitch;
    else if (audio.webkitPreservesPitch !== undefined) audio.webkitPreservesPitch = savedPitch;

    // Update UI controls to match
    speedSlider.value = savedSpeed;
    speedValue.textContent = savedSpeed.toFixed(2);
    pitchToggle.checked = savedPitch;

    updateSpeed(false); // Update UI text only, speed already set
    updatePitchPreservation(false); // Update UI/Audio property

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

    // Sync Modal Buttons
    if (isPlaying) {
        modalPlayIcon.classList.add('hidden');
        modalPauseIcon.classList.remove('hidden');
    } else {
        modalPlayIcon.classList.remove('hidden');
        modalPauseIcon.classList.add('hidden');
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

function updateSpeed(saveToDB = true) {
    const speed = parseFloat(speedSlider.value);
    audio.playbackRate = speed;
    speedValue.textContent = speed.toFixed(2);

    if (saveToDB && currentSongIndex !== -1) {
        const song = songs[currentSongIndex];
        song.speed = speed;

        // Save to DB
        const transaction = db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        store.put(song);

        // Update list badge logic immediately (optional, or wait for render)
        // renderSongList(); // Might be heavy to re-render whole list on slider drag. 
        // Better: update visible badge only? 
        // For now, let's re-render on 'change' (drag end) instead of input?
        // Or just re-render. List is small.
        renderSongList();
    }
}

function updatePitchPreservation(saveToDB = true) {
    const preserve = pitchToggle.checked;

    if (audio.preservesPitch !== undefined) {
        audio.preservesPitch = preserve;
    } else if (audio.mozPreservesPitch !== undefined) {
        audio.mozPreservesPitch = preserve;
    } else if (audio.webkitPreservesPitch !== undefined) {
        audio.webkitPreservesPitch = preserve;
    }

    if (saveToDB && currentSongIndex !== -1) {
        const song = songs[currentSongIndex];
        song.preservePitch = preserve;

        const transaction = db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        store.put(song);
    }
}

// Playback Mode Logic

// Icons
const ICON_LOOP_ALL = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
</svg>`;

const ICON_LOOP_ONE = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    <text x="10" y="15" font-size="8" fill="currentColor" font-weight="bold" stroke="none">1</text>
</svg>`;

const ICON_SINGLE = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M5 12h14" />
    <path d="M13 18l6-6" />
    <path d="M13 6l6 6" />
    <path d="M21 6v12" />
</svg>`;
// Arrow right to bar (Skip/Stop icon like)

function updatePlaybackModeIcon() {
    if (playbackMode === 'all') {
        playbackModeBtn.innerHTML = ICON_LOOP_ALL;
        playbackModeBtn.style.color = 'var(--primary-color)';
        playbackModeBtn.style.opacity = '1';
    } else if (playbackMode === 'one') {
        playbackModeBtn.innerHTML = ICON_LOOP_ONE;
        playbackModeBtn.style.color = 'var(--primary-color)';
        playbackModeBtn.style.opacity = '1';
    } else {
        // Single
        playbackModeBtn.innerHTML = ICON_SINGLE;
        playbackModeBtn.style.color = 'var(--text-secondary)';
        playbackModeBtn.style.opacity = '0.7';
    }
}

function togglePlaybackMode() {
    // Cycle: all -> one -> single -> all
    if (playbackMode === 'all') {
        playbackMode = 'one';
        // toast('Loop One');
    } else if (playbackMode === 'one') {
        playbackMode = 'single';
        // toast('Single (Play Once)');
    } else {
        playbackMode = 'all';
        // toast('Loop All');
    }
    updatePlaybackModeIcon();
}

// Initial Icon
updatePlaybackModeIcon();

// Event Listeners
addMusicBtn.addEventListener('click', () => fileInput.click());

// fileInput listener remains below...

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
modalPlayPauseBtn.addEventListener('click', togglePlayPause);

// Smart Back Button
// Smart Back Button -> Now Strict Restart
skipBackBtn.addEventListener('click', (e) => {
    // If we just finished a long press, ignore the click (mouseup triggers click)
    if (isLongPressing) {
        isLongPressing = false;
        return;
    }

    // Always restart current song
    audio.currentTime = 0;
});

// Skip Forward Button (Standard Click)
skipFwdBtn.addEventListener('click', (e) => {
    if (isLongPressing) {
        isLongPressing = false;
        return;
    }
    playNext();
});

// Long Press Logic
function startFastForward() {
    isLongPressing = true;
    longPressTimer = setTimeout(() => {
        audio.playbackRate = 2.0;
    }, 500); // Wait 500ms to consider it a hold
}

function stopFastForward() {
    clearTimeout(longPressTimer);
    if (audio.playbackRate === 2.0) {
        // Restore speed
        const speed = parseFloat(speedSlider.value);
        audio.playbackRate = speed;
        // Prevent next 'click' from firing seek (if any)
        setTimeout(() => { isLongPressing = false; }, 50);
        return true; // Was long press
    } else {
        isLongPressing = false;
        return false; // Was short press
    }
}

function handleFwdTouchEnd(e) {
    if (e) e.preventDefault(); // Prevent ghost click
    const wasLongPress = stopFastForward();
    if (!wasLongPress) {
        playNext();
    }
}

function startRewind() {
    isLongPressing = true;
    longPressTimer = setTimeout(() => {
        rewindInterval = setInterval(() => {
            audio.currentTime = Math.max(0, audio.currentTime - 0.2); // 0.2s back every 50ms = 4x speed approx
        }, 50);
    }, 500);
}

function stopRewind() {
    clearTimeout(longPressTimer);
    clearInterval(rewindInterval);
    if (rewindInterval) {
        // prevent click
        setTimeout(() => { isLongPressing = false; }, 50);
        return true; // Was long press
    } else {
        isLongPressing = false;
        return false; // Was short press
    }
    rewindInterval = null;
}

function handleBackTouchEnd(e) {
    if (e) e.preventDefault();
    const wasLongPress = stopRewind();
    if (!wasLongPress) {
        // Always restart
        audio.currentTime = 0;
    }
}

// Attach Long Press Events
// Mobile needs touchstart/touchend, Desktop mousedown/mouseup

// Forward
// Forward
skipFwdBtn.addEventListener('mousedown', startFastForward);
skipFwdBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startFastForward(); });
skipFwdBtn.addEventListener('mouseup', stopFastForward);
skipFwdBtn.addEventListener('touchend', handleFwdTouchEnd); // Specific handler for touch
skipFwdBtn.addEventListener('mouseleave', stopFastForward);

// Back
skipBackBtn.addEventListener('mousedown', startRewind);
skipBackBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRewind(); });
skipBackBtn.addEventListener('mouseup', stopRewind);
skipBackBtn.addEventListener('touchend', handleBackTouchEnd); // Specific handler for touch
skipBackBtn.addEventListener('mouseleave', stopRewind);

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
    audio.currentTime = time; // Enable scrubbing
});

seekSlider.addEventListener('change', () => {
    isDraggingSeek = false;
});

// Modal & Settings
expandControlsBtn.addEventListener('click', () => {
    playerModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
    playerModal.classList.add('hidden');
});

// Settings Modal
// Settings Modal
// NOTE: window.openSettings is now defined in index.html to ensure it works even if app.js crashes.
// window.openSettings = function () {
//     settingsView.classList.remove('hidden');
// };

closeSettingsBtn.addEventListener('click', () => {
    settingsView.classList.add('hidden');
});

speedSlider.addEventListener('input', () => updateSpeed(true));
resetSpeedBtn.addEventListener('click', () => {
    speedSlider.value = 1.0;
    updateSpeed();
});

pitchToggle.addEventListener('change', () => updatePitchPreservation(true));
playbackModeBtn.addEventListener('click', togglePlaybackMode);

// Mobile: Prevent Pull-to-Refresh
document.body.addEventListener('touchmove', function (e) {
    // Allow range sliders to work - Fallback check
    if (e.target.closest('input[type="range"]')) return;
    e.preventDefault();
}, { passive: false });
document.getElementById('library-view').addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
document.querySelector('.modal-content').addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });

// Fix sliders on mobile - Explicit isolation
// Custom Seek Logic for Mobile (Tap/Drag Anywhere)
function handleSeekTouch(e) {
    if (!audio.duration) return;

    // Prevent default to stop scrolling/native behavior
    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    const rect = seekSlider.getBoundingClientRect();
    let x = touch.clientX - rect.left;

    // Clamp
    if (x < 0) x = 0;
    if (x > rect.width) x = rect.width;

    const percent = (x / rect.width) * 100;

    // Update State
    isDraggingSeek = true;
    seekSlider.value = percent;

    const time = (percent / 100) * audio.duration;
    audio.currentTime = time;
    currentTimeEl.textContent = formatTime(time);
}

seekSlider.addEventListener('touchstart', handleSeekTouch, { passive: false });
seekSlider.addEventListener('touchmove', handleSeekTouch, { passive: false });
seekSlider.addEventListener('touchend', () => {
    isDraggingSeek = false;
    // Ensure final position is set logic if needed, but touchmove handles it live
}, { passive: false });

// Speed Slider just needs stopProp
speedSlider.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
speedSlider.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });

// Skip Time
window.skipTime = function (seconds) {
    if (audio.src) {
        audio.currentTime += seconds;
    }
};

// Force Update
// Force Update
window.forceUpdate = async function () {
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
        }
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
    } catch (error) {
        console.error('Update cleanup failed:', error);
    } finally {
        window.location.reload(true);
    }
};

// Cloud Sync (Dropbox) Logic
const cloudServiceSelect = document.getElementById('cloud-service-select');
const cloudFolderPathInput = document.getElementById('cloud-folder-path');
const cloudConnectBtn = document.getElementById('cloud-connect-btn');
const cloudSyncBtn = document.getElementById('cloud-sync-btn');
const cloudStatusMsg = document.getElementById('cloud-status-msg');
const serviceInstructionEl = document.getElementById('service-instruction');

const DROPBOX_CLIENT_ID = 'nagv63g1i31287s';
const GOOGLE_CLIENT_ID = '630507478394-0t48nkg5ni575t3p4u5ib74joa678640.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let cloudService = localStorage.getItem('cloud_service') || 'dropbox';
let cloudFolderPath = localStorage.getItem('cloud_folder_path') || '/';

// Token Management
function getAccessToken() {
    if (cloudService === 'dropbox') return localStorage.getItem('dropbox_access_token');
    if (cloudService === 'gdrive') return localStorage.getItem('gdrive_access_token');
    return null;
}

function setAccessToken(token) {
    if (cloudService === 'dropbox') localStorage.setItem('dropbox_access_token', token);
    if (cloudService === 'gdrive') localStorage.setItem('gdrive_access_token', token);
}

function clearAccessToken() {
    if (cloudService === 'dropbox') localStorage.removeItem('dropbox_access_token');
    if (cloudService === 'gdrive') localStorage.removeItem('gdrive_access_token');
}

let cloudAccessToken = getAccessToken(); // Current Session Token

// Initialize UI
cloudServiceSelect.value = cloudService;
if (cloudService === 'ios-files') {
    cloudFolderPathInput.parentElement.classList.add('hidden'); // Folder path irrelevant for manual picker
} else {
    cloudFolderPathInput.parentElement.classList.remove('hidden');
}

// Restore inputs
if (cloudFolderPath) cloudFolderPathInput.value = cloudFolderPath;
updateCloudUI();

// Service Switch Listener
cloudServiceSelect.addEventListener('change', () => {
    cloudService = cloudServiceSelect.value;
    localStorage.setItem('cloud_service', cloudService);

    // Update active token
    cloudAccessToken = getAccessToken();

    if (cloudService === 'ios-files') {
        cloudFolderPathInput.parentElement.classList.add('hidden');
    } else {
        cloudFolderPathInput.parentElement.classList.remove('hidden');
    }
    updateCloudUI();
});

// Simplified Connect Listener
// DISCONNECT ACTION
// Main button duplicate listener removal (Consolidate logic)
// The previous listener lines 678-702 seemed to be a duplicate or older version?
// We already have the main listener starting around line 704.
// Removing this block to avoid double-binding confusion if it exists.

cloudConnectBtn.addEventListener('click', () => {
    // DISCONNECT ACTION
    if (cloudAccessToken) {
        if (!confirm(`Disconnect from ${cloudService}?`)) return;
        cloudAccessToken = null;
        clearAccessToken();
        updateCloudUI();
        setCloudStatus('Disconnected.', 'info');
        return;
    }



    // CHECK GOOGLE
    if (cloudService === 'gdrive') {
        const key = GOOGLE_CLIENT_ID;
        const redirectUri = window.location.href.split('#')[0].split('?')[0];
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${key}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(GOOGLE_SCOPES)}`;
        window.location.href = authUrl;
        return;
    }

    // CHECK DROPBOX
    // Redirect to Dropbox Auth
    const key = DROPBOX_CLIENT_ID;
    const redirectUri = window.location.href.split('#')[0].split('?')[0];
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${key}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=files.metadata.read files.content.read`;
    window.location.href = authUrl;
});

cloudSyncBtn.addEventListener('click', async () => {

    // iOS Files Special Handling
    if (cloudService === 'ios-files') {
        // Trigger file input
        fileInput.click();
        return;
    }

    if (!cloudAccessToken && cloudService !== 'ios-files') return;

    // Save path preference
    const path = cloudFolderPathInput.value.trim();
    localStorage.setItem('cloud_folder_path', path);
    cloudFolderPath = path;

    try {
        setCloudStatus('Checking files...', 'loading');
        cloudSyncBtn.disabled = true;

        if (cloudService === 'dropbox') {
            await syncDropboxFiles();
        } else if (cloudService === 'gdrive') {
            await syncGoogleDriveFiles();
        }

        cloudSyncBtn.disabled = false;
        setCloudStatus('Sync complete!', 'success');
        setTimeout(() => setCloudStatus(''), 5000);
    } catch (e) {
        console.error('Sync error:', e);
        setCloudStatus('Sync failed: ' + (e.message || e), 'error');
        cloudSyncBtn.disabled = false;

        // Clear token on auth/permission errors to allow reconnection
        const errStr = (e.message || '').toString();
        // Check for 401, expired_access_token, or other auth failures
        if (e.status === 401 || errStr.includes('expired_access_token') || errStr.includes('invalid_access_token')) {
            alert('Session expired. Please Connect again.');
            cloudAccessToken = null;
            clearAccessToken();
            updateCloudUI();
        }
    }
});


function updateCloudUI() {
    // Update Instructions based on service
    if (cloudService === 'dropbox') {
        serviceInstructionEl.textContent = 'Dropboxに接続して音楽ファイルを同期します。\n下の「Folder Path」に読み込みたいフォルダのパスを入力してください（例: /Music）。\n空白の場合はルートフォルダを検索します。';
    } else if (cloudService === 'gdrive') {
        serviceInstructionEl.textContent = 'Googleドライブから音楽を同期します。\n認証時に警告が出る場合は「詳細→安全でないページへ移動」を選んでください。\n下の「Folder Path」には、ドライブ内の【フォルダ名】を正確に入力してください。';
    } else if (cloudService === 'ios-files') {
        serviceInstructionEl.textContent = 'iPhone/iPadの「ファイル」アプリから音楽を手動で読み込みます。\n「Import Files」ボタンを押して、ファイルを選択してください。';
    }

    if (cloudService === 'ios-files') {
        cloudConnectBtn.classList.add('hidden'); // No connect button needed
        cloudSyncBtn.textContent = 'Import Files';
        cloudSyncBtn.disabled = false;
        cloudSyncBtn.style.background = '#007AFF'; // iOS Blue
        return;
    } else {
        cloudConnectBtn.classList.remove('hidden');
        cloudSyncBtn.textContent = 'Sync';
    }

    if (cloudAccessToken) {
        cloudConnectBtn.textContent = 'Disconnect';
        cloudConnectBtn.classList.remove('primary');
        cloudConnectBtn.style.background = '#d9534f'; // Red for disconnect
        cloudConnectBtn.disabled = false;
        cloudSyncBtn.disabled = false;
        cloudSyncBtn.style.background = '#28a745';
    } else {
        if (cloudService === 'dropbox') {
            cloudConnectBtn.textContent = 'Connect Dropbox';
            cloudConnectBtn.style.background = '#0061FE';
        } else {
            cloudConnectBtn.textContent = 'Connect Google';
            cloudConnectBtn.style.background = '#4285F4';
        }
        cloudConnectBtn.classList.remove('primary');
        cloudConnectBtn.disabled = false;
        cloudSyncBtn.disabled = true;
    }
}

function setCloudStatus(msg, type = 'info') {
    cloudStatusMsg.textContent = msg;
    cloudStatusMsg.style.color = type === 'error' ? '#ff4444' : (type === 'success' ? '#00C851' : '#aaa');
}

// Handle Auth Callback
function checkAuthCallback() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        if (token) {
            cloudAccessToken = token;
            setAccessToken(token); // Saves to correct service based on cloudService
            window.location.hash = '';

            // Clean up old generic token if exists (migration)
            localStorage.removeItem('cloud_access_token');

            updateCloudUI();
            setCloudStatus(`Connected to ${cloudService === 'gdrive' ? 'Google Drive' : 'Dropbox'}!`, 'success');
        }
    }
}

// Run on load
checkAuthCallback();

// Dropbox API Helpers
async function syncDropboxFiles() {
    const FILES_LIST_URL = 'https://api.dropboxapi.com/2/files/list_folder';
    const DOWNLOAD_URL = 'https://content.dropboxapi.com/2/files/download';

    let hasMore = true;
    let cursor = null;
    let remoteFiles = [];

    // Normalize path: "/" -> ""
    let dropboxPath = cloudFolderPath;
    if (dropboxPath === '/') dropboxPath = '';
    // Ensure no trailing slash if not empty
    if (dropboxPath.length > 1 && dropboxPath.endsWith('/')) {
        dropboxPath = dropboxPath.slice(0, -1);
    }

    // Step 1: List all files
    setCloudStatus(`Listing files in ${dropboxPath || 'root'}...`);
    while (hasMore) {
        const headers = {
            'Authorization': `Bearer ${cloudAccessToken}`,
            'Content-Type': 'application/json'
        };
        const body = {
            path: dropboxPath,
            recursive: false,
            include_media_info: false
        };
        if (cursor) body.cursor = cursor;

        const response = await fetch(cursor ? `${FILES_LIST_URL}/continue` : FILES_LIST_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(cursor ? { cursor } : body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMsg;
            try {
                const errJson = JSON.parse(errorText);
                errorMsg = errJson.error_summary;
            } catch (e) {
                // Not JSON, use text directly (e.g. "Error in call to API function...")
                errorMsg = errorText;
            }
            throw new Error(errorMsg || 'Failed to list files');
        }

        const data = await response.json();
        const entries = data.entries.filter(e => e['.tag'] === 'file' && isMusicFile(e.name));
        remoteFiles = remoteFiles.concat(entries);

        hasMore = data.has_more;
        cursor = data.cursor;
    }

    if (remoteFiles.length === 0) {
        setCloudStatus('No music files found in this folder.');
        return;
    }

    // Step 2: Compare with local IDB
    const existingSongNames = new Set(songs.map(s => s.name));
    const newFiles = remoteFiles.filter(f => !existingSongNames.has(f.name));

    if (newFiles.length === 0) {
        setCloudStatus('All files are up to date.', 'success');
        return;
    }

    // Step 3: Download new files
    let downloadedCount = 0;
    for (const file of newFiles) {
        setCloudStatus(`Downloading ${file.name} (${downloadedCount + 1}/${newFiles.length})...`);

        const dlResponse = await fetch(DOWNLOAD_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${cloudAccessToken}`,
                'Dropbox-API-Arg': jsonToHeaderSafe({ path: file.path_lower })
            }
        });

        if (!dlResponse.ok) {
            console.error(`Failed to download ${file.name}`);
            continue;
        }

        const blob = await dlResponse.blob();
        const fileObj = new File([blob], file.name, { type: blob.type || 'audio/mpeg' });

        // Save using current logic
        await saveSong(fileObj);
        downloadedCount++;
    }

    // Refresh list
    loadSongs();
}

function jsonToHeaderSafe(obj) {
    return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, c =>
        '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4)
    );
}


// Google Drive API Implementation
async function syncGoogleDriveFiles() {
    // 1. Resolve Folder ID
    let folderId = 'root'; // Default
    let searchPath = cloudFolderPath;

    // Simple logic: if path is not / or empty, search for a folder with that exact name
    if (searchPath && searchPath !== '/' && searchPath !== '') {
        // Strip slashes
        const folderName = searchPath.replace(/^\/|\/$/g, '');
        const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
            headers: { 'Authorization': `Bearer ${cloudAccessToken}` }
        });

        if (!resp.ok) {
            if (resp.status === 401) throw new Error('expired_access_token');
            throw new Error(`GDrive Folder Search Failed: ${resp.status}`);
        }

        const data = await resp.json();
        if (data.files && data.files.length > 0) {
            folderId = data.files[0].id;
        } else {
            throw new Error(`Folder "${folderName}" not found in Google Drive.`);
        }
    }

    // 2. List Audio Files in Folder
    // mimeType contains 'audio/' OR name ends with .mp3/.wav etc.
    const query = `'${folderId}' in parents and (mimeType contains 'audio/' or name contains '.mp3' or name contains '.wav' or name contains '.m4a') and trashed = false`;

    let hasMore = true;
    let pageToken = null;
    let processedCount = 0;

    setCloudStatus('Searching files in Google Drive...');

    while (hasMore) {
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=100`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        const resp = await fetch(url, {
            headers: { 'Authorization': `Bearer ${cloudAccessToken}` }
        });

        if (!resp.ok) {
            if (resp.status === 401) throw new Error('expired_access_token');
            throw new Error(`GDrive List Failed: ${resp.status}`);
        }

        const data = await resp.json();
        const files = data.files || [];

        setCloudStatus(`Found ${files.length} potential songs...`);

        // Download Files
        for (const file of files) {
            try {
                // Check dupes (simple name check against existing songs)
                if (songs.some(s => s.name === file.name)) {
                    continue; // Skip existing
                }

                setCloudStatus(`Downloading ${file.name}...`);
                const dlUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
                const dlResp = await fetch(dlUrl, {
                    headers: { 'Authorization': `Bearer ${cloudAccessToken}` }
                });
                if (!dlResp.ok) continue;

                const blob = await dlResp.blob();
                // Create File object
                const fileObj = new File([blob], file.name, { type: file.mimeType });

                await saveSong(fileObj);
                processedCount++;
            } catch (err) {
                console.error('Failed to download', file.name, err);
            }
        }

        pageToken = data.nextPageToken;
        if (!pageToken) hasMore = false;
    }

    loadSongs(); // Refresh UI
    if (processedCount === 0) {
        setCloudStatus('No new music files found.');
    } else {
        setCloudStatus(`Imported ${processedCount} songs from Google Drive!`, 'success');
    }
}
