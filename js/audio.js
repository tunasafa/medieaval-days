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

// ZzFX - Zuper Zmall Zeound Zynth - Micro Edition
class AudioManager {
    constructor() {
        this.enabled = true;
        this.ctx = null;
        this.zzfxV = .3; // volume
        this.zzfx = (...t) => {
            if(!this.enabled || !this.ctx) return;
            let e = this.ctx.createBufferSource(), f = this.ctx.createBuffer(t.length, t[0].length, 44100);
            t.map((d, i) => f.getChannelData(i).set(d)); e.buffer = f; e.connect(this.ctx.destination); e.start(); return e;
        };
        this.zzfxG = (q=1,k=.05,c=220,e=0,t=0,m=.1,r=0,F=1,v=0,z=0,w=0,A=0,l=0,B=0,x=0,A2=0,d=0,y=1,m2=0,C=0)=>{
            let zzfxR=44100;
            let b=2*Math.PI,p=v*=500*b/zzfxR/zzfxR,c2=(c*=(1+2*k*Math.random()-k)*b/zzfxR),d2=0,e2=0,f=0,g=0,h=0,n=1,j=0,k2=0,l2=0,p2=0,q2=0,r2=0,s=0,u=0,V=0,W=0;
            e=zzfxR*e+9;m*=zzfxR;r*=zzfxR;t*=zzfxR;c2*=1;y*=zzfxR;A*=zzfxR;l*=zzfxR;d*=zzfxR;F*=zzfxR;
            let D=[];
            for(let E=0;E<e+m+r;E++){
                let G=E<e?E/e:E<e+m?1:1-(E-(e+m))/r;
                d2+=c2+=p;e2+=d2;
                let H=Math.sin(e2);
                if(z) H += (Math.random()*2-1)*z;
                D[E]=H*G*q * this.zzfxV;
            }
            return [D];
        };
        this.init();
    }
    init() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } catch(e) {}
        document.addEventListener('click', (e) => {
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();

            // Play sound for UI clicks
            const isClickable = e.target.closest('button, .building, .card, .unit-card, .menu-option');
            if (isClickable && this.enabled) {
                this.play('click');
            }
        });
    }
    play(name) {
        if (!this.enabled || !this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const g = this.zzfxG;
        switch(name) {
            case 'click': this.zzfx(...g(1, 0, 800, .01, 0, 0, .05, 0, 0, 0)); break;
            case 'build': this.zzfx(...g(1, .1, 150, .05, 0, .1, .2, 0, 0, 1.5)); break;
            case 'gather': this.zzfx(...g(0.3, .05, 400, .01, 0, 0, .1, 0, 0, 0.2)); break;
            case 'sword': this.zzfx(...g(0.8, .1, 200, .01, 0, .05, .1, 0, 0, 0.5)); break;
            case 'arrow': this.zzfx(...g(0.5, .1, 600, .01, 0, .1, .2, 0, -5, 0.2)); break;
            case 'impact': this.zzfx(...g(0.6, .1, 100, .01, 0, .05, .2, 0, 0, 1.0)); break;
            case 'catapult': this.zzfx(...g(1.5, .1, 50, .1, 0, .2, .5, 0, -2, 2.0)); break;
            case 'death': this.zzfx(...g(0.7, .1, 120, .05, 0, .1, .3, 0, -5, 0.8)); break;
            case 'alert': this.zzfx(...g(1.2, 0, 400, .1, 0, .2, .4, 0, 0, 0)); break;
        }
    }

    // Backward compatibility wrappers for existing code calls
    buildingPlace() { this.play('build'); }
    resourceDeposit() { this.play('gather'); }
    siegeFire() { this.play('catapult'); }
    arrowFire() { this.play('arrow'); }
    swordHit() { this.play('sword'); }
    unitTrained() { this.play('click'); }
    unitDeath() { this.play('death'); }
    enemyAlert() { this.play('alert'); }
}
window.SFX = new AudioManager();
