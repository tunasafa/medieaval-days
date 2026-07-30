// Background music player using licensed local audio assets.
(function () {
    const DEFAULT_PLAYLIST = [
        { title: "The Old Tower Inn", artist: "RandomMind", url: "assets/music/the-old-tower-inn.mp3" },
        { title: "The Bard's Tale", artist: "RandomMind", url: "assets/music/the-bards-tale.mp3" },
        { title: "King's Feast", artist: "RandomMind", url: "assets/music/Kings_Feast.mp3" },
        { title: "Rejoicing", artist: "RandomMind", url: "assets/music/Rejoicing.mp3" },
        { title: "Market Day", artist: "RandomMind", url: "assets/music/Market_Day.mp3" },
        { title: "Exploration", artist: "RandomMind", url: "assets/music/Exploration.mp3" },
        { title: "Minstrel Dance", artist: "RandomMind", url: "assets/music/Minstrel_Dance.mp3" },
        { title: "Lament for a Warrior's Soul", artist: "RandomMind", url: "assets/music/Lament_for_a_Warriors_Soul.mp3" },
        { title: "Castle", artist: "Gumichan01", url: "assets/music/Castle.mp3" },
        { title: "Battle Theme", artist: "Wolfgang_", url: "assets/music/Battle.mp3" }
    ];

    let playlist = [];
    let trackIndex = 0;
    let bgAudio = null;
    let isPlaying = false;

    // Fisher-Yates shuffle
    function shuffleArray(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }

    function initPlaylist() {
        playlist = shuffleArray(DEFAULT_PLAYLIST.slice());
        trackIndex = 0;
    }

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

            // Re-shuffle when we finish the playlist
            if (trackIndex === 0) initPlaylist();

            loadCurrentTrack();
            playCurrentTrack();
        });

        bgAudio.addEventListener("error", () => {
            console.warn("Background music failed to load:", bgAudio.currentSrc);
            // Skip to next track on error
            if (isPlaying && playlist.length > 0) {
                trackIndex = (trackIndex + 1) % playlist.length;
                loadCurrentTrack();
                playCurrentTrack();
            }
        });

        return bgAudio;
    }

    function loadCurrentTrack() {
        if (playlist.length === 0) return;
        const track = playlist[trackIndex];
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
        if (playlist.length === 0) initPlaylist();
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
        initPlaylist();
        updateButton();

        // Start randomly on first interaction
        const startOnInteraction = () => {
            if (!isPlaying && bgAudio === null) {
                startMusic();
            }
            document.removeEventListener("click", startOnInteraction);
            document.removeEventListener("keydown", startOnInteraction);
        };
        document.addEventListener("click", startOnInteraction);
        document.addEventListener("keydown", startOnInteraction);
    }

    window.setMusicPlaylist = function (urls = []) {
        if (!Array.isArray(urls) || urls.length === 0) {
            initPlaylist();
        } else {
            playlist = shuffleArray(urls.map((url, index) => ({
                title: `Track ${index + 1}`,
                artist: "External",
                url
            })));
            trackIndex = 0;
        }
        if (isPlaying) {
            loadCurrentTrack();
            playCurrentTrack();
        }
    };

    document.addEventListener("DOMContentLoaded", bindUI);
})();
