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

// State
let db;
let audio = new Audio();
let songs = [];
let currentSongIndex = -1;
let isDraggingSeek = false;
let playbackMode = 'all'; // 'all' (Loop All), 'one' (Loop One), 'single' (Stop)

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

// Cloud Sync (Dropbox) Logic
const cloudServiceSelect = document.getElementById('cloud-service-select');
const cloudFolderPathInput = document.getElementById('cloud-folder-path');
const cloudAppKeyInput = document.getElementById('cloud-app-key');
const cloudConnectBtn = document.getElementById('cloud-connect-btn');
const cloudSyncBtn = document.getElementById('cloud-sync-btn');
const cloudStatusMsg = document.getElementById('cloud-status-msg');

// Manual Token Elements
const toggleManualTokenBtn = document.getElementById('toggle-manual-token-btn');
const cloudManualTokenInput = document.getElementById('cloud-manual-token');

let cloudAccessToken = localStorage.getItem('cloud_access_token');
let cloudAppKey = localStorage.getItem('cloud_app_key');
let cloudFolderPath = localStorage.getItem('cloud_folder_path') || '/';

// Restore inputs
if (cloudAppKey) cloudAppKeyInput.value = cloudAppKey;
if (cloudFolderPath) cloudFolderPathInput.value = cloudFolderPath;
updateCloudUI();

// Event Listeners
toggleManualTokenBtn.addEventListener('click', () => {
    cloudManualTokenInput.classList.toggle('hidden');
    if (cloudManualTokenInput.classList.contains('hidden')) {
        toggleManualTokenBtn.textContent = 'Or enter Access Token manually';
        cloudAppKeyInput.disabled = false;
        if (!cloudAccessToken) cloudConnectBtn.textContent = 'Connect';
    } else {
        toggleManualTokenBtn.textContent = 'Use App Key';
        cloudAppKeyInput.disabled = true;
        cloudConnectBtn.textContent = 'Save Token';
    }
});

cloudConnectBtn.addEventListener('click', () => {
    // Check if using Manual Token
    if (!cloudManualTokenInput.classList.contains('hidden')) {
        const token = cloudManualTokenInput.value.trim();
        if (!token) {
            alert('Please enter an Access Token');
            return;
        }
        cloudAccessToken = token;
        localStorage.setItem('cloud_access_token', token);
        updateCloudUI();
        setCloudStatus('Token saved manually!', 'success');
        // Reset UI state
        cloudManualTokenInput.classList.add('hidden');
        toggleManualTokenBtn.textContent = 'Or enter Access Token manually';
        return;
    }

    const key = cloudAppKeyInput.value.trim();
    if (!key) {
        alert('Please enter a Dropbox App Key');
        return;
    }
    localStorage.setItem('cloud_app_key', key);
    cloudAppKey = key;

    // Redirect to Dropbox Auth
    const redirectUri = window.location.href.split('#')[0].split('?')[0];
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${key}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = authUrl;
});

cloudSyncBtn.addEventListener('click', async () => {
    if (!cloudAccessToken) return;

    // Save path preference
    const path = cloudFolderPathInput.value.trim();
    localStorage.setItem('cloud_folder_path', path);
    cloudFolderPath = path;

    try {
        setCloudStatus('Checking files...', 'loading');
        cloudSyncBtn.disabled = true;
        await syncDropboxFiles();
        cloudSyncBtn.disabled = false;
        setCloudStatus('Sync complete!', 'success');
        setTimeout(() => setCloudStatus(''), 5000);
    } catch (e) {
        console.error('Sync error:', e);
        setCloudStatus('Sync failed: ' + (e.message || e), 'error');
        cloudSyncBtn.disabled = false;
        if (e.status === 401) {
            cloudAccessToken = null;
            localStorage.removeItem('cloud_access_token');
            updateCloudUI();
        }
    }
});

function updateCloudUI() {
    if (cloudAccessToken) {
        cloudConnectBtn.textContent = 'Connected';
        cloudConnectBtn.classList.remove('primary');
        cloudConnectBtn.disabled = true;
        cloudAppKeyInput.disabled = true;
        cloudSyncBtn.disabled = false;
    } else {
        cloudConnectBtn.textContent = 'Connect';
        cloudConnectBtn.disabled = false;
        cloudAppKeyInput.disabled = false;
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
            localStorage.setItem('cloud_access_token', token);
            window.location.hash = '';
            updateCloudUI();
            setCloudStatus('Connected to Dropbox!', 'success');
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
            const err = await response.json();
            throw new Error(err.error_summary || 'Failed to list files');
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

function isMusicFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(ext);
}
