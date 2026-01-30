/* ==========================================
   METRO-ZEN - PRECISION ENGINE (V1.1 Mobile)
   Powered by Web Audio API
   ========================================== */

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isPlaying = false;
let bpm = 120;
let currentBeat = 0;
let nextNoteTime = 0.0;
let timerID;
let timeSignature = 4; // 4/4 par défaut
let soundType = 'click'; // 'click' ou 'wood'

// Lookahead (Système de prévision pour précision parfaite)
const lookahead = 25.0; // En ms
const scheduleAheadTime = 0.1; // En secondes

// DOM Elements
const bpmDisplay = document.getElementById('bpm-val');
const playBtn = document.getElementById('btn-play');
const tapBtn = document.getElementById('btn-tap');
const led = document.getElementById('beat-led');
const timeSigSelect = document.getElementById('time-sig');
const soundSelect = document.getElementById('sound-type');

/* ==========================================
   AUDIO ENGINE (SYNTHÈSE)
   ========================================== */

function nextNote() {
    const secondsPerBeat = 60.0 / bpm;
    nextNoteTime += secondsPerBeat;
    currentBeat++;
    if (currentBeat >= timeSignature) {
        currentBeat = 0;
    }
}

function scheduleNote(beatNumber, time) {
    // 1. Visuel (Flash)
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // 2. Choix du son
    if (soundType === 'click') {
        // Son Digital (Bip)
        if (beatNumber === 0) {
            osc.frequency.value = 1500; 
            gainNode.gain.value = 1;
        } else {
            osc.frequency.value = 800; 
            gainNode.gain.value = 0.6;
        }
        osc.type = 'square';
        
        gainNode.gain.setValueAtTime(gainNode.gain.value, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    } else if (soundType === 'wood') {
        // Son "Woodblock"
        osc.frequency.setValueAtTime(beatNumber === 0 ? 1200 : 800, time);
        osc.frequency.exponentialRampToValueAtTime(beatNumber === 0 ? 800 : 500, time + 0.05);
        
        osc.type = 'sine';
        gainNode.gain.setValueAtTime(1, time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    }

    osc.start(time);
    osc.stop(time + 0.1);

    // Trigger LED Visual
    let timeToDraw = (time - audioCtx.currentTime) * 1000;
    if(timeToDraw < 0) timeToDraw = 0;
    
    setTimeout(() => {
        animateLed(beatNumber === 0);
    }, timeToDraw);
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
        scheduleNote(currentBeat, nextNoteTime);
        nextNote();
    }
    timerID = window.setTimeout(scheduler, lookahead);
}

function startMetronome() {
    // Hack pour réveiller l'AudioContext sur mobile
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    currentBeat = 0;
    nextNoteTime = audioCtx.currentTime + 0.05;
    scheduler();
    isPlaying = true;
    playBtn.innerText = "◼";
    playBtn.style.background = "#ff4757"; // Rouge
    playBtn.style.color = "white";
}

function stopMetronome() {
    window.clearTimeout(timerID);
    isPlaying = false;
    playBtn.innerText = "▶";
    playBtn.style.background = "#e0e0e0"; // Blanc
    playBtn.style.color = "#121214";
}

/* ==========================================
   UI & INTERACTIONS
   ========================================== */

playBtn.addEventListener('click', () => {
    if (isPlaying) stopMetronome();
    else startMetronome();
});

timeSigSelect.addEventListener('change', (e) => timeSignature = parseInt(e.target.value));
soundSelect.addEventListener('change', (e) => soundType = e.target.value);

function animateLed(isAccent) {
    led.style.background = isAccent ? "var(--accent-color)" : "#666";
    led.style.boxShadow = isAccent ? "var(--accent-glow)" : "none";
    led.style.transform = isAccent ? "scale(1.2)" : "scale(1.0)";
    
    setTimeout(() => {
        led.style.background = "#333";
        led.style.boxShadow = "none";
        led.style.transform = "scale(1)";
    }, 100);
}

// TAP TEMPO
let tapTimes = [];
tapBtn.addEventListener('click', () => {
    const now = Date.now();
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) tapTimes = [];
    tapTimes.push(now);
    if (tapTimes.length > 4) tapTimes.shift();

    if (tapTimes.length > 1) {
        let intervals = [];
        for (let i = 1; i < tapTimes.length; i++) {
            intervals.push(tapTimes[i] - tapTimes[i-1]);
        }
        let avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        let newBpm = Math.round(60000 / avgInterval);
        
        if (newBpm < 30) newBpm = 30;
        if (newBpm > 300) newBpm = 300;
        
        updateBpm(newBpm);
        
        tapBtn.style.borderColor = "var(--accent-color)";
        tapBtn.style.color = "var(--accent-color)";
        setTimeout(() => {
            tapBtn.style.borderColor = "#444";
            tapBtn.style.color = "#888";
        }, 200);
    }
});

// ==========================================
// DRAG BPM (SOURIS + TACTILE MOBILE)
// ==========================================

let isDragging = false;
let startY = 0;
let startBpm = 0;

// 1. SOURIS (PC)
bpmDisplay.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    startBpm = bpm;
    document.body.style.cursor = "ns-resize";
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const delta = startY - e.clientY; 
    let newBpm = startBpm + Math.floor(delta / 2);
    
    if (newBpm < 30) newBpm = 30;
    if (newBpm > 300) newBpm = 300;
    updateBpm(newBpm);
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.cursor = "default";
});

// 2. TACTILE (MOBILE) - La partie magique ✨
bpmDisplay.addEventListener('touchstart', (e) => {
    // On empêche le scroll de la page quand on touche le chiffre
    e.preventDefault(); 
    isDragging = true;
    startY = e.touches[0].clientY; // On prend le 1er doigt
    startBpm = bpm;
}, { passive: false });

bpmDisplay.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault(); // Bloque le scroll page
    
    const currentY = e.touches[0].clientY;
    const delta = startY - currentY; 
    
    // Sensibilité ajustée pour mobile (delta / 3 pour être plus précis)
    let newBpm = startBpm + Math.floor(delta / 2);
    
    if (newBpm < 30) newBpm = 30;
    if (newBpm > 300) newBpm = 300;
    updateBpm(newBpm);
}, { passive: false });

bpmDisplay.addEventListener('touchend', () => {
    isDragging = false;
});


function updateBpm(val) {
    bpm = val;
    bpmDisplay.innerText = val;
}
