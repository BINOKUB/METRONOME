/* ==========================================
   METRO-ZEN - PRECISION ENGINE
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
    // On utilise requestAnimationFrame pour synchroniser le visuel avec l'audio (à peu près)
    // Note: Pour une synchro parfaite visuelle/audio, c'est plus complexe, 
    // mais pour un métronome simple, setTimeout synchronisé suffit.
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // 2. Choix du son (Synthèse pure, pas de fichiers MP3 !)
    if (soundType === 'click') {
        // Son Digital (Bip)
        if (beatNumber === 0) {
            osc.frequency.value = 1500; // Aigu pour le 1er temps
            gainNode.gain.value = 1;
        } else {
            osc.frequency.value = 800; // Grave pour les autres
            gainNode.gain.value = 0.6;
        }
        osc.type = 'square';
        
        // Enveloppe très courte (Percussif)
        gainNode.gain.setValueAtTime(gainNode.gain.value, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    } else if (soundType === 'wood') {
        // Son "Woodblock" synthétique (Onde sinus qui chute)
        osc.frequency.setValueAtTime(beatNumber === 0 ? 1200 : 800, time);
        osc.frequency.exponentialRampToValueAtTime(beatNumber === 0 ? 800 : 500, time + 0.05);
        
        osc.type = 'sine';
        gainNode.gain.setValueAtTime(1, time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    }

    osc.start(time);
    osc.stop(time + 0.1);

    // Trigger LED Visual
    // On calcule le délai exact pour que la LED s'allume PILE quand le son sort
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
    // Hack pour réveiller l'AudioContext sur navigateur mobile
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

// 1. Play / Stop
playBtn.addEventListener('click', () => {
    if (isPlaying) stopMetronome();
    else startMetronome();
});

// 2. Settings Change
timeSigSelect.addEventListener('change', (e) => timeSignature = parseInt(e.target.value));
soundSelect.addEventListener('change', (e) => soundType = e.target.value);

// 3. Visual LED
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

// 4. TAP TEMPO (Algo Intelligent)
let tapTimes = [];
tapBtn.addEventListener('click', () => {
    const now = Date.now();
    
    // Reset si trop long entre deux taps (2 secondes)
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
        tapTimes = [];
    }
    
    tapTimes.push(now);
    
    // On garde seulement les 4 derniers taps pour la moyenne
    if (tapTimes.length > 4) tapTimes.shift();

    if (tapTimes.length > 1) {
        let intervals = [];
        for (let i = 1; i < tapTimes.length; i++) {
            intervals.push(tapTimes[i] - tapTimes[i-1]);
        }
        let avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        let newBpm = Math.round(60000 / avgInterval);
        
        // Limites de sécurité
        if (newBpm < 30) newBpm = 30;
        if (newBpm > 300) newBpm = 300;
        
        updateBpm(newBpm);
        
        // Animation feedback sur le bouton TAP
        tapBtn.style.borderColor = "var(--accent-color)";
        tapBtn.style.color = "var(--accent-color)";
        setTimeout(() => {
            tapBtn.style.borderColor = "#444";
            tapBtn.style.color = "#888";
        }, 200);
    }
});

// 5. DRAG BPM (Glisser la souris sur le chiffre)
let isDragging = false;
let startY = 0;
let startBpm = 0;

bpmDisplay.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    startBpm = bpm;
    document.body.style.cursor = "ns-resize";
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = startY - e.clientY; // Vers le haut = positif
    let newBpm = startBpm + Math.floor(delta / 2); // /2 pour moins de sensibilité
    
    if (newBpm < 30) newBpm = 30;
    if (newBpm > 300) newBpm = 300;
    
    updateBpm(newBpm);
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.cursor = "default";
});

// Fonction utilitaire pour mettre à jour partout
function updateBpm(val) {
    bpm = val;
    bpmDisplay.innerText = val;
}
