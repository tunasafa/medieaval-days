// Background music player using licensed local audio assets.
(function () {
    const DEFAULT_PLAYLIST = [
        {
            title: "The Old Tower Inn",
            artist: "RandomMind",
            url: "assets/music/the-old-tower-inn.mp3"
        },
        {
            title: "The Bard's Tale",
            artist: "RandomMind",
            url: "assets/music/the-bards-tale.mp3"
        }
    ];

    let playlist = DEFAULT_PLAYLIST.slice();
    let trackIndex = 0;
    let bgAudio = null;
    let isPlaying = false;

    function getMusicButton() {
        return document.getElementById("btn-music");
    }

    function updateButton() {
        const btn = getMusicButton();
        if (!btn) return;
        btn.textContent = isPlaying ? "Music: On" : "Music: Off";
        const track = playlist[trackIndex];
        btn.title = isPlaying && track
            ? `Playing: ${track.title} - ${track.artist}`
            : "Toggle background music";
    }

    function createAudio() {
        if (bgAudio) return bgAudio;

        bgAudio = new Audio();
        bgAudio.preload = "auto";
        bgAudio.volume = 0.28;

        bgAudio.addEventListener("ended", () => {
            if (!isPlaying || playlist.length === 0) return;
            trackIndex = (trackIndex + 1) % playlist.length;
            loadCurrentTrack();
            playCurrentTrack();
        });

        bgAudio.addEventListener("error", () => {
            isPlaying = false;
            updateButton();
            console.warn("Background music failed to load:", bgAudio.currentSrc);
        });

        return bgAudio;
    }

    function loadCurrentTrack() {
        const track = playlist[trackIndex];
        if (!track) return;
        const audio = createAudio();
        if (!audio.src.endsWith(track.url)) {
            audio.src = track.url;
            audio.load();
        }
        updateButton();
    }

    async function playCurrentTrack() {
        const audio = createAudio();
        try {
            await audio.play();
            isPlaying = true;
        } catch (_) {
            isPlaying = false;
        }
        updateButton();
    }

    function startMusic() {
        if (playlist.length === 0) return;
        loadCurrentTrack();
        playCurrentTrack();
    }

    function stopMusic() {
        if (bgAudio) {
            try {
                bgAudio.pause();
                bgAudio.currentTime = 0;
            } catch (_) {}
        }
        isPlaying = false;
        updateButton();
    }

    function toggleMusic() {
        if (isPlaying) {
            stopMusic();
        } else {
            startMusic();
        }
    }

    function bindUI() {
        const btn = getMusicButton();
        if (btn) btn.addEventListener("click", toggleMusic);
        updateButton();
    }

    window.setMusicPlaylist = function (urls = []) {
        if (!Array.isArray(urls) || urls.length === 0) {
            playlist = DEFAULT_PLAYLIST.slice();
        } else {
            playlist = urls.map((url, index) => ({
                title: `Track ${index + 1}`,
                artist: "External",
                url
            }));
        }
        trackIndex = 0;
        if (isPlaying) {
            loadCurrentTrack();
            playCurrentTrack();
        }
    };

    document.addEventListener("DOMContentLoaded", bindUI);
})();
