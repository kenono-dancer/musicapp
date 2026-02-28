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
const modalSeekSlider = document.getElementById('modal-seek-slider');
const modalSeekMarkers = document.getElementById('modal-seek-markers');
const modalCurrentTime = document.getElementById('modal-current-time');
const modalDuration = document.getElementById('modal-duration');

// Defined globally in index.html for robustness, but also here for reference if needed
// window.openSettings = ...

// ─── State ────────────────────────────────────────────────────────────────────
let db;
let songs = [];
let currentSongIndex = -1;
let currentObjectURL = null;
let isDraggingSeek = false;
let playbackMode = 'all'; // 'all' | 'one' | 'single'
let longPressTimer = null;
let rewindInterval = null;
let isLongPressing = false;
let currentPlaylistId = null; // null = Main Library, >0 = Playlist ID

// ─── Phase Vocoder Audio Engine (SoundTouchJS) ─────────────────────────────
// iOS Safari's native <audio> time-stretching produces metallic noise when
// slowing down (rate < 1.0) and dynamically ignores preservesPitch toggles.
// We bypass the native playback engine and use SoundTouchJS (a Phase Vocoder).
//
// ─── Orthodox Native Audio Playback ──────────────────────────────────────────
// Reverted to pure HTML5 <audio> for 100% compliant iOS lock screen and 
// background audio support, discarding SoundTouchJS Worklets.
const mainAudio = new Audio();
// We allow iOS to handle background tasks naturally via MediaSession
mainAudio.setAttribute('playsinline', '');
document.body.appendChild(mainAudio);



/**
 * Safely update one or more fields on a song record in IndexedDB.
 * Reads the record fresh within the transaction to avoid iOS Safari's blob-
 * invalidation bug (blobs from getAll() become stale after the readonly
 * transaction closes — putting them back corrupts the stored audio).
 *
 * @param {number} songId  The song's primary key
 * @param {object} fields  Plain object of fields to merge, e.g. { order: 2 }
 */
function safeDbUpdate(songId, fields) {
    try {
        const tx = db.transaction(['songs'], 'readwrite');
        const store = tx.objectStore('songs');
        const req = store.get(songId);
        req.onsuccess = () => {
            if (req.result) {
                store.put(Object.assign(req.result, fields));
            }
        };
        tx.onerror = (e) => console.error('[DB] safeDbUpdate error:', e);
    } catch (e) {
        console.error('[DB] safeDbUpdate exception:', e);
    }
}

// Format Time
function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Initialize IndexedDB
// Initialize IndexedDB
const request = indexedDB.open('MusicPlayerDB', 3); // Increment to trigger upgrade

request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    }
    if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
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
    return new Promise((resolve) => {
        if (currentPlaylistId !== null) {
            // Load Playlist
            const transaction = db.transaction(['playlists', 'songs'], 'readonly');
            const playlistStore = transaction.objectStore('playlists');
            const songStore = transaction.objectStore('songs');

            const plReq = playlistStore.get(currentPlaylistId);
            plReq.onsuccess = () => {
                const playlist = plReq.result;
                if (!playlist) {
                    currentPlaylistId = null;
                    loadSongs().then(resolve);
                    return;
                }

                const allSongsReq = songStore.getAll();
                allSongsReq.onsuccess = () => {
                    const allSongs = allSongsReq.result;
                    songs = allSongs.filter(s => playlist.songIds.includes(s.id));
                    songs.sort((a, b) => playlist.songIds.indexOf(a.id) - playlist.songIds.indexOf(b.id));
                    renderSongList();
                    resolve();
                };
            };
        } else {
            // Load Library
            const transaction = db.transaction(['songs'], 'readonly');
            const store = transaction.objectStore('songs');
            const getAllReq = store.getAll();

            getAllReq.onsuccess = () => {
                songs = getAllReq.result;
                songs.sort((a, b) => {
                    const orderA = a.order !== undefined ? a.order : a.id;
                    const orderB = b.order !== undefined ? b.order : b.id;
                    return orderA - orderB;
                });

                songs.forEach((song, index) => {
                    if (song.order !== index) {
                        song.order = index;
                    }
                });

                renderSongList();
                resolve();
            };
        }
    });
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
        mainAudio.pause();
        mainAudio.src = '';
        currentTitle.textContent = 'Not Playing';
        currentSongIndex = -1;
        updatePlayPauseUI(false);
    } else if (idx < currentSongIndex) {
        currentSongIndex--;
    }

    const transaction = db.transaction(['songs', 'playlists'], 'readwrite');
    const songStore = transaction.objectStore('songs');
    const playlistStore = transaction.objectStore('playlists');

    // 1. Delete from Songs Store
    songStore.delete(id);

    // 2. Remove from all Playlists
    const playlistReq = playlistStore.openCursor();
    playlistReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const playlist = cursor.value;
            if (playlist.songIds.includes(id)) {
                playlist.songIds = playlist.songIds.filter(sid => sid !== id);
                cursor.update(playlist);
            }
            cursor.continue();
        }
    };

    transaction.oncomplete = () => loadSongs();
}

function moveSong(index, direction, event) {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= songs.length) return;

    // Swap in array
    const temp = songs[index];
    songs[index] = songs[newIndex];
    songs[newIndex] = temp;

    // Update currentSongIndex tracking
    if (currentSongIndex === index) {
        currentSongIndex = newIndex;
    } else if (currentSongIndex === newIndex) {
        currentSongIndex = index;
    }

    // Update order values
    songs[index].order = index;
    songs[newIndex].order = newIndex;

    renderSongList();

    // Persist new order; safeDbUpdate reads each record fresh to avoid iOS blob corruption
    safeDbUpdate(songs[index].id, { order: index });
    safeDbUpdate(songs[newIndex].id, { order: newIndex });
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
            li.setAttribute('data-index', index);

            const isFirst = index === 0;
            const isLast = index === songs.length - 1;
            const isPlaylistView = currentPlaylistId !== null;
            const capturedPlaylistId = currentPlaylistId;
            const capturedSongId = song.id;
            const capturedIndex = index;

            li.innerHTML = `
                <div class="song-item-info">
                    <div class="song-name">
                        ${song.name}
                        ${(song.speed && song.speed !== 1.0) ? `<span class="speed-badge">${song.speed.toFixed(2)}x</span>` : ''}
                    </div>
                </div>
                <div class="song-actions">
                    <button class="add-to-playlist-btn" title="Add to Playlist">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                    </button>
                    <button class="reorder-btn move-up" ${isFirst ? 'disabled' : ''}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>
                    </button>
                    <button class="reorder-btn move-down" ${isLast ? 'disabled' : ''}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                    </button>
                    <button class="delete-btn" title="${isPlaylistView ? 'Remove from Playlist' : 'Delete Song'}">
                        ${isPlaylistView
                    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
                    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'}
                    </button>
                </div>
            `;

            // Direct event listeners on each button (most reliable for iOS Safari PWA)
            const upBtn = li.querySelector('.move-up');
            const downBtn = li.querySelector('.move-down');
            const delBtn = li.querySelector('.delete-btn');
            const plBtn = li.querySelector('.add-to-playlist-btn');

            if (plBtn) {
                plBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openAddToPlaylistModal(capturedSongId, e);
                });
            }
            if (upBtn && !isFirst) {
                upBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    isPlaylistView ? movePlaylistSong(capturedIndex, -1) : moveSong(capturedIndex, -1);
                });
            }
            if (downBtn && !isLast) {
                downBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    isPlaylistView ? movePlaylistSong(capturedIndex, 1) : moveSong(capturedIndex, 1);
                });
            }
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    isPlaylistView ? handleRemoveFromPlaylist(capturedPlaylistId, capturedSongId, e) : deleteSong(capturedSongId, e);
                });
            }

            // Click the row (not active buttons) to play
            // Note: use button:not([disabled]) so tapping a disabled reorder button still plays the song
            li.addEventListener('click', (e) => {
                if (e.target.closest('button:not([disabled])')) return;
                playSong(capturedIndex);
            });

            songList.appendChild(li);
        });

        requestAnimationFrame(adjustLibraryHeight);
    }
}

// Note: Button actions are handled by inline onclick attributes in renderSongList()
// The li click handler is added per-item in renderSongList for song playback

// (touchstart stopPropagation removed — it was interfering with iOS button touch events)

// Dynamic Library Height Adjustment to prevent overlap
function adjustLibraryHeight() {
    // Only adjust if player bar is visible
    if (playerBar.classList.contains('hidden')) {
        document.querySelector('main').style.height = 'auto';
        document.querySelector('main').style.maxHeight = 'none';
        document.querySelector('main').style.flex = '1';
        return;
    }

    const playerRect = playerBar.getBoundingClientRect();
    const mainRect = document.querySelector('main').getBoundingClientRect();
    const versionFooterHeight = 40; // Approximate height of version footer if taking space, or safety margin

    // Calculate available height: Top of player bar - Top of main content
    // We add a safety buffer (e.g. 10px) to ensure no touch overlap
    const availableHeight = playerRect.top - mainRect.top - 10;

    if (availableHeight > 0) {
        document.querySelector('main').style.flex = 'none';
        document.querySelector('main').style.height = `${availableHeight}px`;
        // Ensure overflow is handled by CSS (already set to overflow-y: auto)
    }
}

// Listen for resize to re-calculate
window.addEventListener('resize', adjustLibraryHeight);
window.addEventListener('orientationchange', () => {
    setTimeout(adjustLibraryHeight, 200); // Wait for layout to settle
});


// ─── Playback Functions ──────────────────────────────────────────────────────

async function playSong(index) {
    if (index < 0 || index >= songs.length) return;

    const song = songs[index];
    currentSongIndex = index;

    if (currentObjectURL && !currentObjectURL.startsWith('audio/')) {
        URL.revokeObjectURL(currentObjectURL);
    }

    mainAudio.pause();

    // Cycle 3: Precise MIME Type Inference instead of generic audio/mpeg
    let ext = (song.name || '').split('.').pop().toLowerCase();
    const mimeMap = {
        'mp3': 'audio/mpeg',
        'm4a': 'audio/mp4', 'm4r': 'audio/mp4', 'aac': 'audio/aac',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',
        'webm': 'audio/webm'
    };

    // Fallback to song.blob.type only if it exists and is not generic "application/octet-stream"
    let safeType = song.blob.type;
    if (!safeType || safeType === 'application/octet-stream' || safeType === '') {
        safeType = mimeMap[ext] || 'audio/mpeg';
    }

    const safeBlob = new Blob([song.blob], { type: safeType });

    // Cycle 1: Bypass Service Worker to avoid iOS Safari Range Request bugs on `<audio>`
    let audioUrl = URL.createObjectURL(safeBlob);
    currentObjectURL = audioUrl;

    // Set the native source
    mainAudio.src = audioUrl;
    mainAudio.load(); // Force iOS to process the new source immediately

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
        console.warn("Playback failed. Attempting immediate Base64 recovery...", error);

        // Cycle 4: Gesture-Safe Fallback
        // Some iOS versions block Blob URLs. Base64 Data URIs work, but the FileReader is ASYNC.
        // Async gaps = Gesture Loss. 
        // We will try to load it and play. If NotAllowedError occurs, we'll show a "Tap to Play" overlay.

        const reader = new FileReader();
        reader.onloadend = async () => {
            mainAudio.src = reader.result;
            mainAudio.load();
            mainAudio.playbackRate = savedSpeed;
            mainAudio.preservesPitch = savedPitch;

            try {
                await mainAudio.play();
                loadingOverlay.classList.add('hidden');
                updatePlayPauseUI(true);
                currentTitle.textContent = song.name;
                modalSongTitle.textContent = song.name;
                renderSongList();
                generateSeekMarkers();
            } catch (fallbackError) {
                loadingOverlay.classList.add('hidden');
                console.error("Fallback play failed:", fallbackError);

                if (fallbackError.name === 'NotAllowedError') {
                    // Gesture lost. Provide a manual trigger.
                    const retry = confirm("iOS blocked automatic playback for this format. Tap OK to retry playing manually.");
                    if (retry) {
                        mainAudio.play().then(() => {
                            updatePlayPauseUI(true);
                            renderSongList();
                        }).catch(e => alert("Manual play failed: " + e.message));
                    }
                } else {
                    alert("Failed to play: " + ext.toUpperCase() + " format may be unsupported.");
                }
                updatePlayPauseUI(false);
            }
        };
        reader.readAsDataURL(safeBlob);
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

let speedUpdateFrame = null;

function updateSpeed(saveToDB = true) {
    const speed = parseFloat(speedSlider.value);

    // UI updates instantly for responsive feel
    speedValue.textContent = speed.toFixed(2);

    if (saveToDB && currentSongIndex !== -1) {
        songs[currentSongIndex].speed = speed;
        safeDbUpdate(songs[currentSongIndex].id, { speed });
    }

    // Debounce the actual audio engine update
    if (speedUpdateFrame) cancelAnimationFrame(speedUpdateFrame);
    speedUpdateFrame = requestAnimationFrame(() => {
        const shouldPreserve = pitchToggle.checked;
        if (mainAudio.src) {
            mainAudio.playbackRate = speed;
            mainAudio.preservesPitch = shouldPreserve;
        }
    });
}

// Separate function to re-render list only on drag end (change event)
function updateSpeedAndRender() {
    updateSpeed(true);
    renderSongList();
}

function updatePitchPreservation(saveToDB = true) {
    const preserve = pitchToggle.checked;

    if (mainAudio.src) {
        mainAudio.playbackRate = parseFloat(speedSlider.value);
        mainAudio.preservesPitch = preserve;
    }

    if (saveToDB && currentSongIndex !== -1) {
        songs[currentSongIndex].preservePitch = preserve;
        safeDbUpdate(songs[currentSongIndex].id, { preservePitch: preserve });
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
    const modalPlaybackModeIcon = document.getElementById('modal-playback-mode-icon');
    const modalPlaybackModeLabel = document.getElementById('modal-playback-mode-label');

    if (playbackMode === 'all') {
        playbackModeBtn.innerHTML = ICON_LOOP_ALL;
        playbackModeBtn.style.color = 'var(--primary-color)';
        playbackModeBtn.style.opacity = '1';
        if (modalPlaybackModeIcon) {
            modalPlaybackModeIcon.innerHTML = ICON_LOOP_ALL;
            modalPlaybackModeIcon.style.color = 'var(--primary-color)';
        }
        if (modalPlaybackModeLabel) modalPlaybackModeLabel.textContent = 'Loop All';
    } else if (playbackMode === 'one') {
        playbackModeBtn.innerHTML = ICON_LOOP_ONE;
        playbackModeBtn.style.color = 'var(--primary-color)';
        playbackModeBtn.style.opacity = '1';
        if (modalPlaybackModeIcon) {
            modalPlaybackModeIcon.innerHTML = ICON_LOOP_ONE;
            modalPlaybackModeIcon.style.color = 'var(--primary-color)';
        }
        if (modalPlaybackModeLabel) modalPlaybackModeLabel.textContent = 'Loop One';
    } else {
        // Single
        playbackModeBtn.innerHTML = ICON_SINGLE;
        playbackModeBtn.style.color = 'var(--text-secondary)';
        playbackModeBtn.style.opacity = '0.7';
        if (modalPlaybackModeIcon) {
            modalPlaybackModeIcon.innerHTML = ICON_SINGLE;
            modalPlaybackModeIcon.style.color = 'var(--text-secondary)';
        }
        if (modalPlaybackModeLabel) modalPlaybackModeLabel.textContent = 'Stop After';
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
addMusicBtn.addEventListener('click', () => {
    console.log('Add Music Clicked');
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    loadingOverlay.classList.remove('hidden');
    let loadedCount = 0;
    const total = files.length;
    loadingOverlay.querySelector('p').textContent = `Loading 0/${total}...`;

    try {
        // Process sequentially to maintain order and not freeze UI too much
        for (const file of files) {
            try {
                await saveSong(file);
                loadedCount++;
                loadingOverlay.querySelector('p').textContent = `Loading ${loadedCount}/${total}...`;
            } catch (err) {
                console.error('Failed to save song:', file.name, err);
                // Continue loading other files even if one fails
            }
        }
        await loadSongs(); // Reload list once
    } catch (error) {
        console.error('Batch import failed:', error);
        alert('Failed to import some files.');
    } finally {
        loadingOverlay.classList.add('hidden');
        fileInput.value = ''; // Reset
    }
});

playPauseBtn.addEventListener('click', togglePlayPause);
modalPlayPauseBtn.addEventListener('click', togglePlayPause);

// Smart Back Button
// Smart Back Button -> Now Strict Restart
skipBackBtn.addEventListener('click', (e) => {
    // If we just finished a long press, ignore the click (mouseup triggers click)
    if (isLongPressing) {
        e.preventDefault();
        return;
    }

    if (mainAudio.src) {
        mainAudio.currentTime = 0;
        updatePlayPauseUI(true);
    } // If repeating one, just seek back
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
        if (mainAudio.src) mainAudio.playbackRate = 2.0;
    }, 500); // Wait 500ms to consider it a hold
}

function stopFastForward() {
    clearTimeout(longPressTimer);
    if (mainAudio.src && mainAudio.playbackRate === 2.0) {
        // We only explicitly check for the FWD state here to restore
        const speed = parseFloat(speedSlider.value);
        mainAudio.playbackRate = speed;
        mainAudio.preservesPitch = pitchToggle.checked;
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
            if (mainAudio.src) {
                const newTime = Math.max(0, mainAudio.currentTime - 0.2);
                mainAudio.currentTime = newTime;
            }
        }, 50);
    }, 500);
}

function stopRewind() {
    clearTimeout(longPressTimer);
    clearInterval(rewindInterval);
    if (rewindInterval) {
        rewindInterval = null; // Clear before return
        // prevent click
        setTimeout(() => { isLongPressing = false; }, 50);
        return true; // Was long press
    } else {
        isLongPressing = false;
        return false; // Was short press
    }
}

function handleBackTouchEnd(e) {
    if (e) e.preventDefault();
    const wasLongPress = stopRewind();
    if (!wasLongPress) {
        // Always restart
        if (mainAudio.src) mainAudio.currentTime = 0;
    }
}

// Attach Long Press Events
// Mobile needs touchstart/touchend, Desktop mousedown/mouseup

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

let timeUpdateFrame = null;

function skipSeconds(seconds) {
    if (mainAudio.src) {
        const current = mainAudio.currentTime;
        const duration = mainAudio.duration;
        let newTime = current + seconds;

        if (newTime < 0) newTime = 0;
        if (newTime >= duration) {
            handleSongEnd();
            return;
        }

        const percentage = (newTime / duration) * 100;
        mainAudio.currentTime = newTime;
    }
}

// ─── Native Progress Polling (Replacement for loopTimeUpdate) ───────────────
mainAudio.addEventListener('timeupdate', () => {
    const duration = mainAudio.duration || 0;
    const current = mainAudio.currentTime || 0;

    if (duration > 0 && !isDraggingSeek) {
        const percent = (current / duration) * 100;
        const validPercent = isNaN(percent) ? 0 : percent;

        seekSlider.value = validPercent;
        currentTimeEl.textContent = formatTime(current);
        modalSeekSlider.value = validPercent;
        modalCurrentTime.textContent = formatTime(current);
        durationEl.textContent = formatTime(duration);

        // Update markers & MediaSession
        updateSeekMarkers();
        if (Math.floor(current) !== Math.floor(mainAudio._lastMediaSessionUpdate || 0)) {
            if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
                navigator.mediaSession.setPositionState({
                    duration: duration,
                    playbackRate: mainAudio.playbackRate,
                    position: current
                });
            }
            mainAudio._lastMediaSessionUpdate = current;
        }
    }
});

mainAudio.addEventListener('ended', handleSongEnd);
mainAudio.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(mainAudio.duration);
    modalDuration.textContent = formatTime(mainAudio.duration);
});

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
});

// Modal Controls logic
const modalSkipBackBtn = document.getElementById('modal-skip-back-btn');
const modalSkipFwdBtn = document.getElementById('modal-skip-fwd-btn');

if (modalSkipBackBtn) {
    modalSkipBackBtn.addEventListener('click', () => {
        if (mainAudio.src) mainAudio.currentTime = 0;
    });
}
if (modalSkipFwdBtn) {
    modalSkipFwdBtn.addEventListener('click', () => {
        playNext();
    });
}

// First modal seek slider listeners (desktop)
modalSeekSlider.addEventListener('input', () => {
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
});

// Update Seek Markers (Modal - Update Text)
function updateSeekMarkers() {
    const duration = mainAudio.duration || 0;
    if (isNaN(duration) || duration === 0) return;

    const m25 = document.getElementById('marker-25');
    const m50 = document.getElementById('marker-50');
    const m75 = document.getElementById('marker-75');

    // Only update if elements exist (in player bar)
    if (m25) m25.textContent = formatTime(duration * 0.25);
    if (m50) m50.textContent = formatTime(duration * 0.50);
    if (m75) m75.textContent = formatTime(duration * 0.75);
}


// Delegate Data Skip Buttons (Global)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-skip]');
    if (btn) {
        e.stopPropagation(); // Prevent list click
        const skip = parseFloat(btn.dataset.skip);
        if (!isNaN(skip)) {
            skipSeconds(skip);
        }
    }
});


// Modal & Settings
expandControlsBtn.addEventListener('click', () => {
    playerModal.classList.remove('hidden');
    generateSeekMarkers(); // Ensure markers are tailored to modal if we dynamic gen them
});

// Re-generate markers for modal to ensure new layout logic?
// Actually generateSeekMarkers in current code targets `modalSeekMarkers` div.
// We updated HTML to have id="modal-seek-markers" inside .seek-container.
// We should check generateSeekMarkers implementation.

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

speedSlider.addEventListener('input', () => updateSpeed(false)); // UI only during drag
speedSlider.addEventListener('change', () => updateSpeedAndRender()); // Save + re-render on drag end
resetSpeedBtn.addEventListener('click', () => {
    speedSlider.value = 1.0;
    updateSpeed();
});

pitchToggle.addEventListener('click', () => updatePitchPreservation(true));
pitchToggle.addEventListener('change', () => updatePitchPreservation(true));
playbackModeBtn.addEventListener('click', togglePlaybackMode);
const modalPlaybackModeBtnEl = document.getElementById('modal-playback-mode-toggle');
if (modalPlaybackModeBtnEl) {
    modalPlaybackModeBtnEl.addEventListener('click', togglePlaybackMode);
}

// Mobile: Prevent Pull-to-Refresh
document.body.addEventListener('touchmove', function (e) {
    // Allow range sliders to work
    if (e.target.closest('input[type="range"]')) return;
    // Allow scrollable areas (library, modals) to scroll normally
    if (e.target.closest('#library-view') || e.target.closest('.modal-content') || e.target.closest('.playlist-list')) return;
    e.preventDefault();
}, { passive: false });

// Fix sliders on mobile - Explicit isolation
// Custom Seek Logic for Mobile (Tap/Drag Anywhere)
function handleSeekTouch(e) {
    const duration = mainAudio.duration || 0;
    if (!duration) return;

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

    const time = (percent / 100) * duration;
    if (mainAudio.src) mainAudio.currentTime = time;
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

// Modal Seek Slider logic with Tap-to-Seek support
function handleModalSeekTouch(e) {
    const duration = mainAudio.duration || 0;
    if (!duration) return;

    // Prevent default to stop scrolling/native behavior
    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    const rect = modalSeekSlider.getBoundingClientRect();
    let x = touch.clientX - rect.left;

    // Clamp
    if (x < 0) x = 0;
    if (x > rect.width) x = rect.width;

    const percent = (x / rect.width) * 100;

    // Update State
    isDraggingSeek = true;
    modalSeekSlider.value = percent;

    const time = (percent / 100) * duration;
    if (mainAudio.src) {
        mainAudio.currentTime = time;
        // lockScreenAudio.currentTime = time; // No longer sync lockScreenAudio currentTime
    }
    modalCurrentTime.textContent = formatTime(time);
}

// Attach Touch Listeners for Tap-to-Seek (duplicate input listener removed)
modalSeekSlider.addEventListener('touchstart', handleModalSeekTouch, { passive: false });
modalSeekSlider.addEventListener('touchmove', handleModalSeekTouch, { passive: false });
modalSeekSlider.addEventListener('touchend', () => {
    isDraggingSeek = false;
}, { passive: false });

// Skip Time
window.skipTime = function (seconds) {
    if (mainAudio.src) {
        const newTime = Math.max(0, mainAudio.currentTime + seconds);
        mainAudio.currentTime = newTime;
    }
};

// Attack Skip Listeners
document.querySelectorAll('button[data-skip]').forEach(button => {
    button.addEventListener('click', (e) => {
        // Stop propagation to prevent potential conflicts with other handlers (though none expected on buttons)
        e.stopPropagation();
        const skipAmount = parseFloat(button.dataset.skip);
        window.skipTime(skipAmount);
    });
});

// Force Update
// Force Update
window.forceUpdate = async function () {
    const btn = document.querySelector('button[onclick="forceUpdate()"]');
    if (btn) {
        btn.textContent = 'Updating...';
        btn.disabled = true;
    }

    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                // Unregister the service worker
                await registration.unregister();
            }
        }

        if ('caches' in window) {
            // Delete all PWA/Browser caches
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }

    } catch (error) {
        console.error('Update cleanup failed:', error);
        alert('Update cleanup failed: ' + error);
    } finally {
        // Force hard reload (bypassing cache) instead of just appending a query parameter
        // The query parameter approach can sometimes still load from disk cache
        window.location.href = window.location.pathname + "?t=" + Date.now();
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

// Playlist DOM Elements
const openPlaylistsBtn = document.getElementById('open-playlists-btn');
const playlistManagerModal = document.getElementById('playlist-manager-modal');
const closePlaylistManagerBtn = document.getElementById('close-playlist-manager-btn');
const newPlaylistNameInput = document.getElementById('new-playlist-name');
const createPlaylistBtn = document.getElementById('create-playlist-btn');
const playlistList = document.getElementById('playlist-list');
const addToPlaylistModal = document.getElementById('add-to-playlist-modal');
const closeAddToPlaylistBtn = document.getElementById('close-add-to-playlist-btn');
const selectPlaylistList = document.getElementById('select-playlist-list');

let songToAddId = null; // Track which song to add

// Event Listeners (Playlist)
openPlaylistsBtn.addEventListener('click', () => {
    openPlaylistManager();
});

closePlaylistManagerBtn.addEventListener('click', () => {
    playlistManagerModal.classList.add('hidden');
});

createPlaylistBtn.addEventListener('click', async () => {
    const name = newPlaylistNameInput.value.trim();
    if (name) {
        await createPlaylist(name);
        newPlaylistNameInput.value = '';
        renderPlaylistManagerList();
    }
});

closeAddToPlaylistBtn.addEventListener('click', () => {
    addToPlaylistModal.classList.add('hidden');
});

function openPlaylistManager() {
    playlistManagerModal.classList.remove('hidden');
    renderPlaylistManagerList();
}

async function renderPlaylistManagerList() {
    playlistList.innerHTML = '';
    const playlists = await getPlaylists();

    // Add "Library" option
    const libLi = document.createElement('li');
    libLi.className = 'playlist-item';
    libLi.innerHTML = `
        <span class="playlist-item-name">My Music (Library)</span>
        <span class="playlist-item-count">All</span>
    `;
    libLi.style.borderLeft = currentPlaylistId === null ? '4px solid var(--primary-color)' : 'none';
    libLi.onclick = () => {
        currentPlaylistId = null;
        document.querySelector('header h1').textContent = 'My Music';
        loadSongs();
        playlistManagerModal.classList.add('hidden');
    };
    playlistList.appendChild(libLi);

    playlists.forEach(pl => {
        const li = document.createElement('li');
        li.className = 'playlist-item';
        li.innerHTML = `
            <span class="playlist-item-name">${pl.name}</span>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="playlist-item-count">${pl.songIds.length} songs</span>
                <div style="display: flex;">
                    <button class="delete-btn" style="padding: 6px; margin-right: 4px;" onclick="handleRenamePlaylist(${pl.id}, '${pl.name.replace(/'/g, "\\'")}', event)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="delete-btn" style="padding: 6px;" onclick="handleDeletePlaylist(${pl.id}, event)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;
        li.style.borderLeft = currentPlaylistId === pl.id ? '4px solid var(--primary-color)' : 'none';

        li.onclick = (e) => {
            if (e.target.closest('button')) return; // Ignore delete
            currentPlaylistId = pl.id;
            document.querySelector('header h1').textContent = pl.name;
            loadSongs();
            playlistManagerModal.classList.add('hidden');
        };
        playlistList.appendChild(li);
    });
}

async function handleDeletePlaylist(id, event) {
    event.stopPropagation();
    if (confirm('Delete this playlist?')) {
        await deletePlaylist(id);
        renderPlaylistManagerList();
    }
}

// Manual Token Elements
const toggleManualTokenBtn = document.getElementById('toggle-manual-token-btn');
const cloudManualTokenInput = document.getElementById('cloud-manual-token');

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
if (cloudAccessToken) {
    cloudConnectBtn.textContent = 'Disconnect';
    cloudConnectBtn.style.backgroundColor = '#dc3545'; // Red
    cloudSyncBtn.disabled = false;
    cloudStatusMsg.textContent = 'Ready to sync';
} else {
    cloudConnectBtn.textContent = 'Connect';
    cloudConnectBtn.style.backgroundColor = '#0061FE';
    cloudSyncBtn.disabled = true;
    cloudStatusMsg.textContent = 'Not connected';
}

// Ensure UI matches state
cloudServiceSelect.value = cloudService;
cloudFolderPathInput.value = cloudFolderPath;
updateServiceInstructions();

// Listeners
cloudServiceSelect.addEventListener('change', () => {
    cloudService = cloudServiceSelect.value;
    localStorage.setItem('cloud_service', cloudService);
    // When switching services, check if we have token for THAT service
    cloudAccessToken = getAccessToken();
    if (cloudAccessToken) {
        cloudConnectBtn.textContent = 'Disconnect';
        cloudConnectBtn.style.backgroundColor = '#dc3545';
        cloudSyncBtn.disabled = false;
        cloudStatusMsg.textContent = 'Ready to sync';
    } else {
        cloudConnectBtn.textContent = 'Connect';
        cloudConnectBtn.style.backgroundColor = '#0061FE';
        cloudSyncBtn.disabled = true;
        cloudStatusMsg.textContent = 'Not connected';
    }
    updateServiceInstructions();
});

function updateServiceInstructions() {
    if (cloudService === 'dropbox') {
        serviceInstructionEl.textContent = 'Connects to your Dropbox. Requires popup auth.';
    } else if (cloudService === 'gdrive') {
        serviceInstructionEl.textContent = 'Connects to Google Drive. Requires popup auth.';
    } else {
        serviceInstructionEl.textContent = 'Sync manually by copying files to Files app.';
    }
}

cloudFolderPathInput.addEventListener('change', () => {
    cloudFolderPath = cloudFolderPathInput.value;
    localStorage.setItem('cloud_folder_path', cloudFolderPath);
});

cloudConnectBtn.addEventListener('click', () => {
    if (cloudAccessToken) {
        // Disconnect
        clearAccessToken();
        cloudAccessToken = null;
        cloudConnectBtn.textContent = 'Connect';
        cloudConnectBtn.style.backgroundColor = '#0061FE';
        cloudSyncBtn.disabled = true;
        cloudStatusMsg.textContent = 'Disconnected';
    } else {
        // Connect
        if (cloudService === 'dropbox') initiateDropboxAuth();
        else if (cloudService === 'gdrive') initiateGoogleDriveAuth();
    }
});

cloudSyncBtn.addEventListener('click', async () => {
    if (!cloudAccessToken) return;
    cloudSyncBtn.disabled = true;
    cloudSyncBtn.textContent = 'Syncing...';

    try {
        if (cloudService === 'dropbox') await syncDropbox();
        else if (cloudService === 'gdrive') await syncGoogleDrive();
        cloudStatusMsg.textContent = 'Sync Complete!';
    } catch (err) {
        console.error(err);
        cloudStatusMsg.textContent = 'Sync Error: ' + err.message;
    } finally {
        cloudSyncBtn.disabled = false;
        cloudSyncBtn.textContent = 'Sync';
    }
});

// Dropbox Auth Flow
function initiateDropboxAuth() {
    const redirectUri = window.location.origin + window.location.pathname;
    // This expects app to be served on https or localhost
    // Dropbox requires exact redirect URI match in app console

    // Construct auth URL
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token`;

    // Redirect user (simplest flow, no popup issues)
    window.location.href = authUrl;
}

// Google Drive Auth Flow
function initiateGoogleDriveAuth() {
    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(GOOGLE_SCOPES)}`;
    window.location.href = authUrl;
}

// Handle Redirect Back (Check for token in hash)
function handleAuthRedirect() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        if (token) {
            setAccessToken(token);
            cloudAccessToken = token;

            // Allow UI to update before cleaning URL
            setTimeout(() => {
                cloudConnectBtn.textContent = 'Disconnect';
                cloudConnectBtn.style.backgroundColor = '#dc3545';
                cloudSyncBtn.disabled = false;
                cloudStatusMsg.textContent = 'Connected! Ready to sync.';

                // Clear hash
                history.replaceState('', document.title, window.location.pathname + window.location.search);

                // Open settings again
                settingsView.classList.remove('hidden');
            }, 500);
        }
    }
}

handleAuthRedirect();

// Sync Logic (Dropbox)
async function syncDropbox() {
    if (!cloudAccessToken) throw new Error("No token");

    // 1. List folder
    const listUrl = 'https://api.dropboxapi.com/2/files/list_folder';
    // Path should valid, Dropbox usage: "" for root or "/Music"
    let pathArg = cloudFolderPath;
    if (pathArg === '/') pathArg = ""; // Dropbox root is empty string

    const response = await fetch(listUrl, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + cloudAccessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            path: pathArg,
            recursive: false
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error('Dropbox List Error: ' + errText);
    }

    const data = await response.json();
    const entries = data.entries.filter(e => e['.tag'] === 'file');

    // Filter audio files
    const audioFiles = entries.filter(e => e.name.match(/\.(mp3|wav|m4a|aac|ogg)$/i));

    if (audioFiles.length === 0) throw new Error("No audio files found in folder.");

    cloudStatusMsg.textContent = `Found ${audioFiles.length} songs. Downloading...`;

    let addedCount = 0;
    for (const fileMeta of audioFiles) {
        // Check if exists in DB by name? (Optional optimization)
        // For now, simple download
        cloudStatusMsg.textContent = `Downloading ${fileMeta.name}...`;

        try {
            // 2. Download content
            // content-download endpoint
            const downloadUrl = 'https://content.dropboxapi.com/2/files/download';
            const dlResp = await fetch(downloadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + cloudAccessToken,
                    'Dropbox-API-Arg': JSON.stringify({ path: fileMeta.path_lower })
                }
            });

            if (!dlResp.ok) continue; // Skip fail

            const blob = await dlResp.blob();
            // Create File object
            const file = new File([blob], fileMeta.name, { type: blob.type || 'audio/mpeg' });

            await saveSong(file);
            addedCount++;
        } catch (e) {
            console.error(e);
        }
    }

    loadSongs(); // Refresh list
    cloudStatusMsg.textContent = `Synced ${addedCount} songs.`;
}


// Sync Logic (Google Drive)
async function syncGoogleDrive() {
    // 1. List files in folder
    // Need folder ID if path is used, or search.
    // Simplifying: Search for audio files in root or specific folder name is hard without ID.
    // Strategy: Search for mimeType contains audio

    let query = "mimeType contains 'audio/' and trashed = false";

    // If folder path given, resolving it to ID is complex (requires recursion).
    // For MVP, if path is root, just search. If not, warn user.
    if (cloudFolderPath !== '/' && cloudFolderPath !== '') {
        // Try to find folder ID? Too complex for this snippet.
        // Fallback: Just search all audio.
        cloudStatusMsg.textContent = "Searching all Drive (Folder filtering not fully supported yet)...";
    }

    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=50`;

    const response = await fetch(listUrl, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + cloudAccessToken
        }
    });

    if (!response.ok) throw new Error("GDrive List Error");

    const data = await response.json();
    const files = data.files || [];

    if (files.length === 0) throw new Error("No songs found");

    let addedCount = 0;
    for (const fileMeta of files) {
        cloudStatusMsg.textContent = `Downloading ${fileMeta.name}...`;

        const dlUrl = `https://www.googleapis.com/drive/v3/files/${fileMeta.id}?alt=media`;
        const dlResp = await fetch(dlUrl, {
            headers: { 'Authorization': 'Bearer ' + cloudAccessToken }
        });

        if (dlResp.ok) {
            const blob = await dlResp.blob();
            const file = new File([blob], fileMeta.name, { type: fileMeta.mimeType });
            await saveSong(file);
            addedCount++;
        }
    }

    loadSongs();
    cloudStatusMsg.textContent = `Synced ${addedCount} songs.`;
}

// ==========================================
// Playlist Logic
// ==========================================

function createPlaylist(name) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['playlists'], 'readwrite');
        const store = transaction.objectStore('playlists');
        const playlist = {
            name: name,
            songIds: [],
            dateCreated: new Date()
        };
        const req = store.add(playlist);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function getPlaylists() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['playlists'], 'readonly');
        const store = transaction.objectStore('playlists');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function deletePlaylist(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['playlists'], 'readwrite');
        const store = transaction.objectStore('playlists');
        const req = store.delete(id);
        req.onsuccess = () => {
            if (currentPlaylistId === id) {
                currentPlaylistId = null; // Go back to library
                loadSongs();
            }
            resolve();
        };
        req.onerror = () => reject(req.error);
    });
}

function addToPlaylist(playlistId, songId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['playlists'], 'readwrite');
        const store = transaction.objectStore('playlists');
        const req = store.get(playlistId);

        req.onsuccess = () => {
            const playlist = req.result;
            if (!playlist) return reject('Playlist not found');

            if (!playlist.songIds.includes(songId)) {
                playlist.songIds.push(songId);
                store.put(playlist).onsuccess = () => resolve();
            } else {
                resolve(); // Already in playlist
            }
        };
        req.onerror = () => reject(req.error);
    });
}

function removeFromPlaylist(playlistId, songId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['playlists'], 'readwrite');
        const store = transaction.objectStore('playlists');
        const req = store.get(playlistId);

        req.onsuccess = () => {
            const playlist = req.result;
            if (!playlist) return reject('Playlist not found');

            playlist.songIds = playlist.songIds.filter(id => id !== songId);
            const putReq = store.put(playlist);

            putReq.onsuccess = () => {
                // If we are currently viewing this playlist, refresh logic might be needed
                // But for now just resolve
                resolve();
            };
        };
        req.onerror = () => reject(req.error);
    });
}

async function handleRemoveFromPlaylist(playlistId, songId, event) {
    event.stopPropagation();
    if (confirm('Remove from this playlist?')) {
        await removeFromPlaylist(playlistId, songId);
        loadSongs(); // Reload playlist view
    }
}

function openAddToPlaylistModal(songId, event) {
    event.stopPropagation();
    songToAddId = songId;
    addToPlaylistModal.classList.remove('hidden');
    renderAddToPlaylistList();
}

async function renderAddToPlaylistList() {
    selectPlaylistList.innerHTML = '';

    // Add "Create New" option
    const createLi = document.createElement('li');
    createLi.className = 'playlist-item';
    createLi.style.background = 'rgba(0, 97, 254, 0.1)';
    createLi.style.justifyContent = 'center';
    createLi.innerHTML = `
        <span style="color: var(--primary-color); font-weight: 600;">+ Create New & Add</span>
    `;
    createLi.onclick = async () => {
        const name = prompt('New Playlist Name:');
        if (name && name.trim()) {
            const newId = await createPlaylist(name.trim());
            await addToPlaylist(newId, songToAddId);
            addToPlaylistModal.classList.add('hidden');
            songToAddId = null;
            alert(`Created "${name}" and added song.`);
        }
    };
    selectPlaylistList.appendChild(createLi);

    const playlists = await getPlaylists();
    playlists.forEach(pl => {
        const li = document.createElement('li');
        li.className = 'playlist-item';
        li.innerHTML = `
            <span class="playlist-item-name">${pl.name}</span>
            <span class="playlist-item-count">${pl.songIds.length} songs</span>
        `;
        li.onclick = async () => {
            await addToPlaylist(pl.id, songToAddId);
            addToPlaylistModal.classList.add('hidden');
            songToAddId = null;
            // Simple toast feedback
            alert(`Added to ${pl.name}`);
        };
        selectPlaylistList.appendChild(li);
    });
}

function handleRenamePlaylist(id, currentName, event) {
    event.stopPropagation();
    const newName = prompt('Enter new playlist name:', currentName);
    if (newName && newName.trim() !== '') {
        const transaction = db.transaction(['playlists'], 'readwrite');
        const store = transaction.objectStore('playlists');
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result;
            data.name = newName.trim();
            store.put(data).onsuccess = () => {
                renderPlaylistManagerList();
            };
        };
    }
}

function movePlaylistSong(index, direction, event) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= songs.length) return;

    // Swap in local songs array immediately for instant UI update
    const temp = songs[index];
    songs[index] = songs[newIndex];
    songs[newIndex] = temp;

    // Update currentSongIndex tracking
    if (currentSongIndex === index) currentSongIndex = newIndex;
    else if (currentSongIndex === newIndex) currentSongIndex = index;

    // Update UI immediately — don't wait for DB
    renderSongList();

    // Save updated playlist order to DB in background
    try {
        const transaction = db.transaction(['playlists'], 'readwrite');
        const store = transaction.objectStore('playlists');
        const req = store.get(currentPlaylistId);
        req.onsuccess = () => {
            const playlist = req.result;
            if (!playlist) return;
            // Swap songIds to match the new songs order
            const idTemp = playlist.songIds[index];
            playlist.songIds[index] = playlist.songIds[newIndex];
            playlist.songIds[newIndex] = idTemp;
            store.put(playlist);
        };
        transaction.onerror = (e) => console.error('movePlaylistSong DB error', e);
    } catch (e) {
        console.error('movePlaylistSong DB exception', e);
    }
}
