// Based on unmute-ios-audio by Feross Aboukhadijeh (MIT)
const USER_ACTIVATION_EVENTS = [
    'auxclick', 'click', 'contextmenu', 'dblclick',
    'keydown', 'keyup', 'mousedown', 'mouseup', 'touchend'
];

function unmuteIOS(context) {
    const isIos = navigator.maxTouchPoints > 0 && /MacIntel|iPad|iPhone|iPod/.test(navigator.platform);
    if (!isIos) return;

    let htmlAudioState = 'blocked';
    let webAudioState = 'blocked';
    let audio;
    let source;

    const sampleRate = context.sampleRate || 44100;
    const silentAudioFile = createSilentAudioFile(sampleRate);

    USER_ACTIVATION_EVENTS.forEach(eventName => {
        window.addEventListener(eventName, handleUserActivation, { capture: true, passive: true });
    });

    function createSilentAudioFile(sampleRate) {
        const arrayBuffer = new ArrayBuffer(10);
        const dataView = new DataView(arrayBuffer);
        dataView.setUint32(0, sampleRate, true);
        dataView.setUint32(4, sampleRate, true);
        dataView.setUint16(8, 1, true);
        const missingCharacters = window.btoa(String.fromCharCode(...new Uint8Array(arrayBuffer))).slice(0, 13);
        return `data:audio/wav;base64,UklGRisAAABXQVZFZm10IBAAAAABAAEA${missingCharacters}AgAZGF0YQcAAACAgICAgICAAAA=`;
    }

    function handleUserActivation(e) {
        if (htmlAudioState === 'blocked') {
            htmlAudioState = 'pending';
            createHtmlAudio();
        }
        if (webAudioState === 'blocked') {
            webAudioState = 'pending';
            createWebAudio();
        }
    }

    function createHtmlAudio() {
        audio = document.createElement('audio');
        audio.setAttribute('x-webkit-airplay', 'deny');
        audio.preload = 'auto';
        audio.loop = true;
        audio.src = silentAudioFile;
        audio.load();

        audio.play().then(() => {
            htmlAudioState = 'allowed';
            maybeCleanup();
        }).catch(() => {
            htmlAudioState = 'blocked';
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            audio = null;
        });
    }

    function createWebAudio() {
        source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, 22050);
        source.connect(context.destination);
        source.start();

        if (context.state === 'running') {
            webAudioState = 'allowed';
            maybeCleanup();
        } else {
            webAudioState = 'blocked';
            source.disconnect(context.destination);
            source = null;
        }
    }

    function maybeCleanup() {
        if (htmlAudioState !== 'allowed' || webAudioState !== 'allowed') return;
        USER_ACTIVATION_EVENTS.forEach(eventName => {
            window.removeEventListener(eventName, handleUserActivation, { capture: true, passive: true });
        });
        console.log('[Audio] unmute-ios successfully unlocked WebAudio.');
    }

    // iOS 15+ bug fix: Re-resume AudioContext on visibilitychange
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' &&
            (context.state === 'interrupted' || context.state === 'suspended')) {
            context.resume();
        }
    });
}
