// Enhanced 8-bit medieval-style background music using WebAudio
// - Longer composition (~2 minutes) with proper medieval song structure
// - Multiple voices: melody, harmony, bass line, and light percussion
// - Uses authentic medieval modes and progressions

(function(){
	let audioCtx = null;
	let masterGain = null;
	let isPlaying = false;
	let nextNoteTime = 0;
	let currentStep = 0;
	let schedulerTimer = null;
	// Optional external track playback
	let useTrack = false;
	let trackPlaylist = [];
	let trackIndex = 0;
	let bgAudio = null;

	// Scale: D Dorian (medieval mode) - perfect for medieval atmosphere
	const DEGREE_ST = [0, 2, 3, 5, 7, 9, 10, 12];
	const D4 = 293.66; // Hz
	function freqFromDegree(octaveOffset, degreeIdx) {
		const semis = DEGREE_ST[degreeIdx % DEGREE_ST.length] + 12 * octaveOffset;
		return D4 * Math.pow(2, semis / 12);
	}

	// Timing - longer composition
	const STEPS_PER_BAR = 16; // 16th notes in a bar (4/4)
	const BARS = 64; // ~2 minutes at 110 bpm
	const TOTAL_STEPS = STEPS_PER_BAR * BARS;
	const TEMPO_BPM = 110; // Slightly slower for medieval feel
	const SEC_PER_16TH = (60 / TEMPO_BPM) / 4;

	// Seeded PRNG for deterministic composition
	function mulberry32(a){
		return function(){
			let t = a += 0x6D2B79F5;
			t = Math.imul(t ^ t >>> 15, t | 1);
			t ^= t + Math.imul(t ^ t >>> 7, t | 61);
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
	}
	const rand = mulberry32(0x12345);

	// Medieval melody patterns
	function createMelodyPhrase(startDegree, direction, length = 8) {
		const phrase = [];
		let currentDegree = startDegree;
		
		for (let i = 0; i < length; i++) {
			phrase.push(currentDegree);
			
			// Medieval melodic movement: steps and small leaps
			if (direction === 'up') {
				currentDegree += (rand() < 0.7) ? 1 : 2;
				if (currentDegree > 12) direction = 'down';
			} else if (direction === 'down') {
				currentDegree -= (rand() < 0.7) ? 1 : 2;
				if (currentDegree < 0) direction = 'up';
			} else { // wander
				currentDegree += (rand() < 0.5) ? -1 : 1;
				if (rand() < 0.3) currentDegree += (rand() < 0.5) ? -1 : 1;
			}
			
			// Keep in reasonable range
			currentDegree = Math.max(-2, Math.min(14, currentDegree));
		}
		return phrase;
	}

	// Create bass line (medieval organum style)
	function createBassLine(melodyDegrees) {
		return melodyDegrees.map(degree => {
			if (degree === null) return null;
			// Perfect fourth or fifth below
			return degree - (rand() < 0.6 ? 4 : 3);
		});
	}

	// Create the full composition
	function composeMusic() {
		const melody = new Array(TOTAL_STEPS).fill(null);
		const harmony = new Array(TOTAL_STEPS).fill(null);
		const bass = new Array(TOTAL_STEPS).fill(null);
		const percussion = new Array(TOTAL_STEPS).fill(0);

		// Song structure: AABA form (classic medieval ballad structure)
		const sections = [
			{ name: 'A', bars: 16, theme: 'main' },
			{ name: 'A', bars: 16, theme: 'main_var' },
			{ name: 'B', bars: 16, theme: 'contrasting' },
			{ name: 'A', bars: 16, theme: 'main_final' }
		];

		let currentBar = 0;

		sections.forEach(section => {
			for (let bar = 0; bar < section.bars; bar++) {
				const stepOffset = (currentBar + bar) * STEPS_PER_BAR;
				
				let melodyPhrase, harmonyPhrase, bassPhrase;
				
				if (section.theme === 'main') {
					// Main theme: ascending then descending
					if (bar % 4 < 2) {
						melodyPhrase = createMelodyPhrase(0, 'up', 8);
					} else {
						melodyPhrase = createMelodyPhrase(7, 'down', 8);
					}
				} else if (section.theme === 'main_var') {
					// Variation: inverted intervals
					if (bar % 4 < 2) {
						melodyPhrase = createMelodyPhrase(3, 'wander', 8);
					} else {
						melodyPhrase = createMelodyPhrase(5, 'down', 8);
					}
				} else if (section.theme === 'contrasting') {
					// B section: different modal center, more ornamented
					melodyPhrase = createMelodyPhrase(2, 'wander', 8);
					// Add ornaments
					for (let i = 1; i < melodyPhrase.length; i += 2) {
						if (rand() < 0.4) {
							melodyPhrase[i] = melodyPhrase[i-1] + (rand() < 0.5 ? 1 : -1);
						}
					}
				} else { // main_final
					// Final statement with cadential formula
					if (bar === section.bars - 2) {
						melodyPhrase = [6, 7, 8, 7, 6, 5, 4, 0]; // Strong cadence
					} else {
						melodyPhrase = createMelodyPhrase(0, bar % 2 === 0 ? 'up' : 'down', 8);
					}
				}

				// Create harmony (mostly thirds and fifths)
				harmonyPhrase = melodyPhrase.map(degree => {
					if (rand() < 0.6) {
						return degree + (rand() < 0.7 ? 2 : 4); // Third or fifth above
					}
					return null;
				});

				// Create bass line
				bassPhrase = melodyPhrase.map(degree => {
					if (rand() < 0.8) {
						return degree - (rand() < 0.5 ? 7 : 5); // Octave or sixth below
					}
					return null;
				});

				// Place notes in the step grid (8th note rhythm mainly)
				for (let i = 0; i < Math.min(8, melodyPhrase.length); i++) {
					const stepIdx = stepOffset + i * 2; // Every other 16th note
					
					if (melodyPhrase[i] !== null) {
						melody[stepIdx] = freqFromDegree(1, melodyPhrase[i]);
					}
					
					if (harmonyPhrase[i] !== null && rand() < 0.6) {
						harmony[stepIdx + 1] = freqFromDegree(1, harmonyPhrase[i]); // Offset rhythm
					}
					
					if (bassPhrase[i] !== null && i % 2 === 0) {
						bass[stepIdx] = freqFromDegree(-1, bassPhrase[i]); // Lower octave
					}
				}

				// Add percussion pattern
				for (let s = 0; s < STEPS_PER_BAR; s++) {
					const stepIdx = stepOffset + s;
					if (s % 4 === 0) percussion[stepIdx] = 2; // Strong beats
					else if (s % 4 === 2) percussion[stepIdx] = 1; // Weak beats
					else if (s % 8 === 6 && rand() < 0.3) percussion[stepIdx] = 1; // Syncopation
				}
			}
			currentBar += section.bars;
		});

		return { melody, harmony, bass, percussion };
	}

	// Generate the composition
	const composition = composeMusic();
	const MELODY = composition.melody;
	const HARMONY = composition.harmony;
	const BASS = composition.bass;
	const PERC = composition.percussion;

	// Drone patterns for medieval atmosphere
	function getDroneFrequencies(barIndex) {
		const cycle = Math.floor(barIndex / 4) % 4;
		switch(cycle) {
			case 0: return [freqFromDegree(-1, 0), freqFromDegree(0, 4)]; // D3 + A4
			case 1: return [freqFromDegree(-1, 0), freqFromDegree(0, 6)]; // D3 + C5
			case 2: return [freqFromDegree(-1, 3), freqFromDegree(0, 0)]; // G3 + D4
			default: return [freqFromDegree(-1, 0), freqFromDegree(0, 4)]; // Back to D3 + A4
		}
	}

	function initAudio() {
		if (audioCtx) return;
		const AudioContext = window.AudioContext || window.webkitAudioContext;
		audioCtx = new AudioContext();
		masterGain = audioCtx.createGain();
		masterGain.gain.value = 0.2;

		// Create a warm lowpass filter for medieval tone
		const filter = audioCtx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 1800;
		filter.Q.value = 2;
		
		masterGain.connect(filter);
		filter.connect(audioCtx.destination);
	}

	function playStep(time, step) {
		const stepInSong = step % TOTAL_STEPS;
		
		// Drone (sustained tones)
		if (step % STEPS_PER_BAR === 0) {
			const bar = Math.floor(stepInSong / STEPS_PER_BAR);
			const drones = getDroneFrequencies(bar);
			drones.forEach((freq, i) => {
				const osc = audioCtx.createOscillator();
				const g = audioCtx.createGain();
				osc.type = 'sawtooth';
				osc.frequency.value = freq;
				g.gain.value = 0.02 + i * 0.01; // Varied volumes
				osc.connect(g).connect(masterGain);
				osc.start(time);
				osc.stop(time + (STEPS_PER_BAR * SEC_PER_16TH) - 0.01);
			});
		}

		// Bass line
		const bassFreq = BASS[stepInSong];
		if (bassFreq) {
			const osc = audioCtx.createOscillator();
			const g = audioCtx.createGain();
			osc.type = 'square';
			osc.frequency.value = bassFreq;
			g.gain.setValueAtTime(0.0, time);
			g.gain.linearRampToValueAtTime(0.08, time + 0.01);
			g.gain.exponentialRampToValueAtTime(0.001, time + SEC_PER_16TH * 1.2);
			osc.connect(g).connect(masterGain);
			osc.start(time);
			osc.stop(time + SEC_PER_16TH * 1.5);
		}

		// Main melody
		const melodyFreq = MELODY[stepInSong];
		if (melodyFreq) {
			const osc = audioCtx.createOscillator();
			const g = audioCtx.createGain();
			osc.type = 'triangle';
			osc.frequency.value = melodyFreq;
			g.gain.setValueAtTime(0.0, time);
			g.gain.linearRampToValueAtTime(0.15, time + 0.008);
			g.gain.exponentialRampToValueAtTime(0.001, time + SEC_PER_16TH * 0.9);
			osc.connect(g).connect(masterGain);
			osc.start(time);
			osc.stop(time + SEC_PER_16TH);
		}

		// Harmony
		const harmonyFreq = HARMONY[stepInSong];
		if (harmonyFreq) {
			const osc = audioCtx.createOscillator();
			const g = audioCtx.createGain();
			osc.type = 'square';
			osc.frequency.value = harmonyFreq;
			g.gain.setValueAtTime(0.0, time);
			g.gain.linearRampToValueAtTime(0.06, time + 0.005);
			g.gain.exponentialRampToValueAtTime(0.001, time + SEC_PER_16TH * 0.8);
			osc.connect(g).connect(masterGain);
			osc.start(time);
			osc.stop(time + SEC_PER_16TH);
		}

		// Percussion (subtle medieval drums)
		const percLevel = PERC[stepInSong];
		if (percLevel > 0) {
			const noise = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.08, audioCtx.sampleRate);
			const data = noise.getChannelData(0);
			for (let i = 0; i < data.length; i++) {
				// Filtered noise for more drum-like sound
				data[i] = (Math.random() * 2 - 1) * Math.exp(-i / data.length * 8);
			}
			const src = audioCtx.createBufferSource();
			src.buffer = noise;
			const g = audioCtx.createGain();
			g.gain.setValueAtTime(percLevel === 2 ? 0.12 : 0.06, time);
			g.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
			src.connect(g).connect(masterGain);
			src.start(time);
		}
	}

	function scheduler() {
		const lookAhead = 0.1;
		const scheduleAhead = 0.2;
		while (nextNoteTime < audioCtx.currentTime + scheduleAhead) {
			playStep(nextNoteTime, currentStep);
			nextNoteTime += SEC_PER_16TH;
			currentStep = (currentStep + 1) % TOTAL_STEPS;
		}
		schedulerTimer = setTimeout(scheduler, lookAhead * 1000);
	}

	function startProceduralMusic() {
		initAudio();
		if (isPlaying) return;
		const resumeIfNeeded = async () => {
			try { if (audioCtx.state === 'suspended') await audioCtx.resume(); } catch(_) {}
		};
		resumeIfNeeded().then(() => {
			isPlaying = true;
			nextNoteTime = audioCtx.currentTime + 0.05;
			currentStep = 0;
			scheduler();
			const btn = document.getElementById('btn-music');
			if (btn) btn.textContent = 'Music: On';
		});
	}

	function startTrackMusic() {
		if (isPlaying) return;
		if (!trackPlaylist || trackPlaylist.length === 0) {
			return startProceduralMusic();
		}
		const url = trackPlaylist[trackIndex % trackPlaylist.length];
		try {
			if (bgAudio) {
				try { bgAudio.pause(); } catch(_) {}
			}
			bgAudio = new Audio(url);
			bgAudio.loop = true;
			bgAudio.volume = 0.6;
			bgAudio.addEventListener('ended', () => {
				trackIndex = (trackIndex + 1) % trackPlaylist.length;
			});
			bgAudio.play().then(() => {
				isPlaying = true;
				const btn = document.getElementById('btn-music');
				if (btn) btn.textContent = 'Music: On';
			}).catch(() => {
				// Autoplay blocked, user needs to click
			});
		} catch(_) {}
	}

	function startMusic() {
		if (useTrack) startTrackMusic();
		else startProceduralMusic();
	}

	function stopMusic() {
		isPlaying = false;
		if (schedulerTimer) clearTimeout(schedulerTimer);
		schedulerTimer = null;
		if (audioCtx && masterGain) {
			try {
				masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
				masterGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.05);
			} catch(_) {}
			setTimeout(() => {
				try { if (audioCtx && audioCtx.state !== 'closed') audioCtx.close(); } catch(_) {}
				audioCtx = null;
				masterGain = null;
			}, 200);
		}
		if (bgAudio) {
			try { bgAudio.pause(); } catch(_) {}
			bgAudio = null;
		}
	}

	function toggleMusic() {
		if (isPlaying) {
			stopMusic();
			isPlaying = false;
			const btn = document.getElementById('btn-music');
			if (btn) btn.textContent = 'Music: Off';
		} else {
			startMusic();
		}
	}

	function bindUI() {
		const btn = document.getElementById('btn-music');
		if (btn) btn.addEventListener('click', toggleMusic);
		
		const kickoff = async () => {
			document.removeEventListener('click', kickoff);
			document.removeEventListener('keydown', kickoff);
			document.removeEventListener('touchstart', kickoff);
			startMusic();
		};
		document.addEventListener('click', kickoff, { once: true });
		document.addEventListener('pointerdown', kickoff, { once: true });
		document.addEventListener('mousedown', kickoff, { once: true });
		document.addEventListener('keydown', kickoff, { once: true });
		document.addEventListener('touchstart', kickoff, { once: true });
	}

	window.addEventListener('DOMContentLoaded', bindUI);

	window.setMusicPlaylist = function(urls = []) {
		if (Array.isArray(urls) && urls.length > 0) {
			trackPlaylist = urls;
			useTrack = true;
		} else {
			useTrack = false;
			trackPlaylist = [];
		}
	};
})();