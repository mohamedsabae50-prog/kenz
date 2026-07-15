const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const pauseOverlay = document.getElementById('pauseOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const actionButton = document.getElementById('actionButton');
const statsSummary = document.getElementById('statsSummary');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const livesContainer = document.getElementById('livesContainer');

const ui = {
    level: document.getElementById('levelDisplay'),
    score: document.getElementById('scoreDisplay'),
    target: document.getElementById('targetDisplay'),
    time: document.getElementById('timeDisplay')
};

if (ui.target) ui.target.innerText = '0/0';

const GRAVITY = 0.6;
const JUMP_FORCE = -14; 
const ACCELERATION = 1.0;
const FRICTION = 0.82;
const MAX_SPEED = 7;
const DASH_SPEED = 24; 

const images = {
    player1: new Image(), player2: new Image(), player3: new Image(), monkey: new Image(), strawberry: new Image(),
    background: new Image(), banana: new Image(), worm: new Image(),
    shield: new Image(), speed: new Image(), ground: new Image(), flag: new Image(),
    heart: new Image()
};

images.heart.src = 'heart.png';
images.player1.src = 'player1.png'; images.player2.src = 'player2.png'; images.player3.src = 'player3.png'; images.monkey.src = 'monkey.png';
images.strawberry.src = 'strawberry.png'; images.background.src = 'background.png'; images.banana.src = 'banana.png';
images.worm.src = 'worm.png'; images.shield.src = 'shield.png'; images.speed.src = 'speed.png';
images.ground.src = 'ground.png'; images.flag.src = 'flag.png';

let currentPlayerImage = images.player1;

let player = { x: 100, y: 100, width: 60, height: 100, vx: 0, vy: 0, facing: 1, dashCooldown: 0, hasShield: false, speedBoostTimer: 0, isGrounded: false, jumpCount: 0, jumpLock: false };
let monkey = { x: 50, y: 100, width: 45, height: 55, vx: 0, vy: 0, floatOffsetY: 0, floatTime: 0, isSuper: false, superTimer: 0 };

let platforms = []; let strawberries = []; let particles = []; let ambientParticles = []; let enemies = [];
let waterZones = []; 
let banana = null; let shieldItem = null; let speedItem = null; let goal = null; let heartItem = null;
let cameraX = 0; let cameraY = 0; let levelWidth = 2000; let levelDeathY = 2000;

let audioCtx = null;
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playSound(type) {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination); const now = audioCtx.currentTime;
    if (type === 'collect') { osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); }
    else if (type === 'damage') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(180, now); osc.frequency.linearRampToValueAtTime(60, now + 0.25); gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25); osc.start(now); osc.stop(now + 0.25); }
    else if (type === 'powerup') { osc.type = 'triangle'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.4); gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4); osc.start(now); osc.stop(now + 0.4); }
    else if (type === 'levelup') { osc.type = 'square'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.08); osc.frequency.setValueAtTime(1046.50, now + 0.24); gain.gain.setValueAtTime(0.12, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35); osc.start(now); osc.stop(now + 0.35); }
    else if (type === 'gameover') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(250, now); osc.frequency.linearRampToValueAtTime(100, now + 0.6); gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6); osc.start(now); osc.stop(now + 0.6); }
    else if (type === 'jump') { osc.type = 'sine'; osc.frequency.setValueAtTime(300, now); osc.frequency.linearRampToValueAtTime(600, now + 0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); }
    else if (type === 'dash') { osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.15); gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
}

let gameState = 'START', level = 1, score = 0, totalScore = 0, timeLeft = 40, lives = 3, lastTime = 0, timerInterval, shakeTimer = 0, invulnerableTimer = 0;
let requiredStrawberries = 0; let collectedStrawberries = 0;
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, p: false, Escape: false, ' ': false, Shift: false };

class Particle {
    constructor(x, y, color, speedMulti = 1) { this.x = x; this.y = y; this.vx = (Math.random() - 0.5) * 12 * speedMulti; this.vy = (Math.random() - 0.5) * 12 * speedMulti; this.life = 1; this.color = color || (Math.random() > 0.5 ? '#ff4081' : '#fff'); this.size = Math.random() * 6 + 2; }
    update() { this.x += this.vx; this.y += this.vy; this.life -= 0.04; }
    draw(ctx) { ctx.globalAlpha = this.life; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
}
class AmbientParticle {
    constructor() { this.x = Math.random() * 2000; this.y = Math.random() * 2000; this.size = Math.random() * 3 + 1; this.speedY = -(Math.random() * 0.8 + 0.2); this.speedX = (Math.random() - 0.5) * 0.5; this.alpha = Math.random() * 0.5 + 0.2; }
    update() { 
        this.y += this.speedY; this.x += this.speedX; 
        if (this.y < cameraY) this.y = cameraY + canvas.height + 100; 
        if (this.y > cameraY + canvas.height + 100) this.y = cameraY;
        if (this.x < cameraX) this.x = cameraX + canvas.width + 100;
        if (this.x > cameraX + canvas.width + 100) this.x = cameraX;
    }
    draw(ctx) { ctx.globalAlpha = this.alpha; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
}
function initAmbient() { ambientParticles = []; for (let i = 0; i < 60; i++) ambientParticles.push(new AmbientParticle()); }
function drawHearts() { 
    livesContainer.innerHTML = ''; 
    let displayLives = Math.max(3, lives); 
    for (let i = 0; i < displayLives; i++) { 
        const heart = document.createElement('span'); 
        heart.className = i < lives ? 'heart' : 'heart lost'; 
        heart.innerHTML = '❤️'; 
        livesContainer.appendChild(heart); 
    } 
}
function spawnLevel() {
    platforms = []; strawberries = []; enemies = []; waterZones = [];
    banana = null; shieldItem = null; speedItem = null; goal = null;
    collectedStrawberries = 0;
    requiredStrawberries = Math.min(4 + level, 11);
    
    const playerChoices = [images.player1, images.player2, images.player3];
    currentPlayerImage = playerChoices[Math.floor(Math.random() * playerChoices.length)];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    
    let desiredLength = 2000 + (level * 1000) + (Math.random() * 500); 
    let currentX = 0; 
    let currentY = canvas.height - 200;
    
    platforms.push({ x: 0, y: currentY, width: 350, height: 40, hasStrawberry: false, isUpper: false });
    currentX = 350; 
    let previousPlatform = platforms[0];

    while (currentX < desiredLength) {
        let gap = 90 + Math.random() * 60 + Math.min(level * 4, 30);
        let widthMin = Math.max(80, 130 - level * 3);
        let widthMax = Math.max(120, 250 - level * 3);
        let platWidth = Math.random() * (widthMax - widthMin) + widthMin;
        
        let yShift = (Math.random() * 290) - 110; 
        currentY = clamp(previousPlatform.y + yShift, -800, canvas.height - 100); 

        let mainPlat = { x: currentX, y: currentY, width: platWidth, height: 40, hasStrawberry: false, isUpper: false };
        platforms.push(mainPlat);
        previousPlatform = mainPlat;

        if (Math.random() > 0.45) {
            platforms.push({ 
                x: currentX + (Math.random() * 40 - 20), 
                y: currentY - 180 - (Math.random() * 50), 
                width: platWidth * 0.8,
                height: 30, 
                hasStrawberry: false, 
                isUpper: true 
            });
        }

        if (Math.random() > 0.85 && currentX > 800) {
            currentX += 50;
            waterZones.push({ x: currentX, y: currentY - 80, width: 900, height: 800 });
            platforms.push({ x: currentX + 200, y: currentY + 50, width: 100, height: 30, hasStrawberry: false, isUpper: true });
            platforms.push({ x: currentX + 600, y: currentY + 200, width: 100, height: 30, hasStrawberry: false, isUpper: true });
            currentX += 950;
            currentY -= 150;
        } else {
            currentX += platWidth + gap;
        }
    }

    const finalPlatform = { x: currentX + 100, y: currentY, width: 600, height: 40, hasStrawberry: false, isUpper: false };
    platforms.push(finalPlatform);
    levelWidth = finalPlatform.x + finalPlatform.width;
    goal = { x: finalPlatform.x + finalPlatform.width - 250, y: finalPlatform.y - 150, width: 80, height: 150 };

    const safePlatforms = platforms.filter(p => p.width >= 90 && p !== platforms[0] && p !== finalPlatform);
    for (let i = 0; i < requiredStrawberries; i++) {
        const plat = safePlatforms[i % safePlatforms.length];
        if(plat) { plat.hasStrawberry = true; strawberries.push({ x: plat.x + plat.width / 2 - 20, y: plat.y - 60, width: 45, height: 50, pulse: Math.random() * Math.PI }); }
    }

    const wormPool = safePlatforms.filter(p => !p.hasStrawberry && !p.isUpper); 
    const wormCount = Math.min(3 + level * 2, 10);
    for (let i = 0; i < wormCount; i++) {
        if (wormPool.length === 0) break;
        const randomIndex = Math.floor(Math.random() * wormPool.length);
        const plat = wormPool[randomIndex];
        enemies.push({ type: 'worm', x: plat.x + plat.width / 2, y: plat.y - 35, vx: (Math.random() > 0.5 ? 1 : -1) * (1.8 + level * 0.3), vy: 0, width: 60, height: 35, pulse: Math.random() * Math.PI, facing: 1, plat: plat });
        wormPool.splice(randomIndex, 1);
    }

    if (lives < 3 || Math.random() > 0.5) {
        let availablePlats = safePlatforms.filter(p => !p.hasStrawberry); 
        if (availablePlats.length > 0) {
            let plat = availablePlats[Math.floor(Math.random() * availablePlats.length)];
            heartItem = { x: plat.x + plat.width / 2 - 15, y: plat.y - 50, width: 30, height: 30, pulse: 0 };
        }
    }
    if (ui.target) ui.target.innerText = `0/${requiredStrawberries}`;
    levelDeathY = -Infinity;
    platforms.forEach(p => { if (p.y > levelDeathY) levelDeathY = p.y; });
    levelDeathY += 500;
}
function spawnPowerup(type) {
    if(platforms.length === 0) return;
    let plat = platforms[Math.floor(Math.random() * platforms.length)];
    let item = { x: plat.x + plat.width/2 - 20, y: plat.y - 45, width: 40, height: 40, pulse: 0 };
    if (type === 'banana') banana = item;
    if (type === 'shield') shieldItem = item;
    if (type === 'speed') speedItem = item;
}
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

function checkCollision(r1, r2) { return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x && r1.y < r2.y + r2.height && r1.y + r1.height > r2.y; }

function update(deltaTime) {
    if (gameState !== 'PLAYING') return;
    if (invulnerableTimer > 0) invulnerableTimer -= deltaTime;
    if (player.dashCooldown > 0) player.dashCooldown -= deltaTime;
    if (player.speedBoostTimer > 0) player.speedBoostTimer -= deltaTime;

    let inWater = false;
    for (let w of waterZones) {
        if (player.x + player.width > w.x && player.x < w.x + w.width && player.y + player.height > w.y && player.y < w.y + w.height) {
            inWater = true; break;
        }
    }

    let currentAccel = player.speedBoostTimer > 0 ? ACCELERATION * 1.8 : ACCELERATION;
    let currentDash = player.speedBoostTimer > 0 ? DASH_SPEED * 1.4 : DASH_SPEED;
    let currentFriction = inWater ? 0.65 : FRICTION; 
    let currentGravity = inWater ? 0.2 : GRAVITY;    

    let moveX = 0;
    if (keys.ArrowLeft || keys.a) moveX -= 1;
    if (keys.ArrowRight || keys.d) moveX += 1;
    if (moveX > 0) player.facing = 1; else if (moveX < 0) player.facing = -1;

    player.vx += moveX * currentAccel; player.vx *= currentFriction; player.x += player.vx;

    if ((keys[' '] || keys.Shift) && player.dashCooldown <= 0) {
        player.vx = player.facing * currentDash; player.dashCooldown = 1500; playSound('dash');
        for (let p = 0; p < 15; p++) particles.push(new Particle(player.x + player.width/2, player.y + player.height/2, inWater ? '#00bcd4' : '#fff', 1.5));
    }

    for (let plat of platforms) {
        if (checkCollision(player, plat)) {
            if (player.vx > 0) player.x = plat.x - player.width;
            else if (player.vx < 0) player.x = plat.x + plat.width;
            player.vx = 0;
        }
    }

    let isJumpKeyPressed = keys.ArrowUp || keys.w || keys[' '];
    if (isJumpKeyPressed && !player.jumpLock) {
        if (inWater) { 
            player.vy = -6; playSound('jump');
            for (let p = 0; p < 5; p++) particles.push(new Particle(player.x + player.width/2, player.y + player.height, '#b3e5fc', 0.5));
        } else if (player.jumpCount < 2) { 
            player.vy = JUMP_FORCE; player.isGrounded = false; player.jumpCount++; playSound('jump');
            if (player.jumpCount === 2) { for (let p = 0; p < 10; p++) particles.push(new Particle(player.x + player.width/2, player.y + player.height, '#fff', 1.2)); }
        }
        player.jumpLock = true; 
    }
    if (!isJumpKeyPressed) { player.jumpLock = false; }

    player.vy += currentGravity; 
    let maxFallSpeed = inWater ? 5 : 20; 
    if(player.vy > maxFallSpeed) player.vy = maxFallSpeed; 
    player.y += player.vy; 
    player.isGrounded = false;

    for (let plat of platforms) {
        if (checkCollision(player, plat)) {
            if (player.vy > 0) { player.y = plat.y - player.height; player.vy = 0; player.isGrounded = true; player.jumpCount = 0; } 
            else if (player.vy < 0) { player.y = plat.y + plat.height; player.vy = 0; } 
        }
    }

    if (player.x < 0) player.x = 0;
    if (player.x > levelWidth - player.width) player.x = levelWidth - player.width;
    
    if (player.y > levelDeathY) { 
        lives--; drawHearts(); shakeTimer = 15; invulnerableTimer = 1500; playSound('damage');
        player.x = platforms[0].x + 50; player.y = platforms[0].y - 100; player.vx = 0; player.vy = 0; 
        if (lives <= 0) gameOver();
    }

    let targetCameraX = player.x - canvas.width / 3;
    let targetCameraY = player.y - (canvas.height / 2); 

    cameraX += (targetCameraX - cameraX) * 0.1;
    cameraY += (targetCameraY - cameraY) * 0.08; 

    if (cameraX < 0) cameraX = 0;
    if (cameraY > levelDeathY - canvas.height) { cameraY = levelDeathY - canvas.height; }

    if (player.speedBoostTimer > 0 && Math.abs(player.vx) > 2) particles.push(new Particle(player.x + player.width/2, player.y + player.height, '#ff9800', 0.5));
    if (inWater && Math.random() > 0.8) particles.push(new Particle(player.x + player.width/2, player.y + Math.random()*player.height, '#e1f5fe', 0.2));

    if (monkey.isSuper) { monkey.superTimer -= deltaTime; if (monkey.superTimer <= 0) monkey.isSuper = false; }
    let targetX = player.x - (player.facing * 55), targetY = player.y - 20;
    if (monkey.isSuper && strawberries.length > 0) {
        let nearest = strawberries[0], minDist = Infinity;
        strawberries.forEach(s => { let d = Math.hypot(s.x - monkey.x, s.y - monkey.y); if (d < minDist) { minDist = d; nearest = s; } });
        targetX = nearest.x; targetY = nearest.y;
    }
    monkey.vx = (targetX - monkey.x) * (monkey.isSuper ? 0.12 : 0.06); monkey.vy = (targetY - monkey.y) * (monkey.isSuper ? 0.12 : 0.06);
    monkey.x += monkey.vx; monkey.y += monkey.vy;
    monkey.floatTime += deltaTime * 0.006; monkey.floatOffsetY = Math.sin(monkey.floatTime) * 8;

    ambientParticles.forEach(p => { p.x += player.vx * 0.05; p.y += player.vy * 0.05; p.update(); });

    if (goal && checkCollision(player, goal)) {
        if (collectedStrawberries < requiredStrawberries) {
            player.vx = -4; player.vy = -6; shakeTimer = 4;
        } else {
            levelComplete();
        }
    }

    for (let i = strawberries.length - 1; i >= 0; i--) {
        strawberries[i].pulse += deltaTime * 0.012;
        if (checkCollision(player, strawberries[i]) || (monkey.isSuper && checkCollision(monkey, strawberries[i]))) {
            for (let p = 0; p < 12; p++) particles.push(new Particle(strawberries[i].x + 16, strawberries[i].y + 19));
            strawberries.splice(i, 1); collectedStrawberries++; totalScore += 10;
            if (ui.target) ui.target.innerText = `${collectedStrawberries}/${requiredStrawberries}`;
            ui.score.innerText = totalScore; playSound('collect');
        }
    }
    if (banana && checkCollision(player, banana)) { for (let p = 0; p < 20; p++) particles.push(new Particle(banana.x + 17, banana.y + 17, '#ffd700')); banana = null; monkey.isSuper = true; monkey.superTimer = 6000; playSound('powerup'); }
    if (shieldItem && checkCollision(player, shieldItem)) { for (let p = 0; p < 20; p++) particles.push(new Particle(shieldItem.x + 20, shieldItem.y + 20, '#00bcd4')); player.hasShield = true; shieldItem = null; playSound('powerup'); }
    if (speedItem && checkCollision(player, speedItem)) { for (let p = 0; p < 20; p++) particles.push(new Particle(speedItem.x + 20, speedItem.y + 20, '#ff9800')); player.speedBoostTimer = 6000; speedItem = null; playSound('powerup'); }
    if (heartItem) { 
        heartItem.pulse += deltaTime * 0.01; 
        if (checkCollision(player, heartItem)) { 
            for (let p = 0; p < 20; p++) particles.push(new Particle(heartItem.x + 15, heartItem.y + 15, '#ff3366')); 
            lives++; drawHearts(); heartItem = null; playSound('powerup'); 
        }
    }
    enemies.forEach(e => {
        e.pulse += deltaTime * 0.015; e.x += e.vx;
        if (e.x < e.plat.x || e.x + e.width > e.plat.x + e.plat.width) { e.vx *= -1; e.x += e.vx; } 
        e.facing = e.vx > 0 ? -1 : 1;

        if (invulnerableTimer <= 0 && checkCollision(player, e)) {
            if (player.hasShield) { player.hasShield = false; shakeTimer = 10; invulnerableTimer = 1500; playSound('damage'); for (let p = 0; p < 25; p++) particles.push(new Particle(player.x + player.width/2, player.y + player.height/2, '#00bcd4', 2)); } 
            else { lives--; drawHearts(); shakeTimer = 15; invulnerableTimer = 1500; playSound('damage'); if (lives <= 0) gameOver(); }
        }
    });

    for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(); if (particles[i].life <= 0) particles.splice(i, 1); }
    if (shakeTimer > 0) shakeTimer--;
}

function drawPlayerFallback(x, y, w, h, facing, isInvulnerable) {}
function drawMonkeyFallback(x, y, w, h, isSuper) {}
function drawStrawberryFallback(x, y, w, h) {}
function drawBananaFallback(x, y, w, h) {}
function drawShieldFallback(x, y, w, h) { ctx.save(); ctx.translate(x + w/2, y + h/2); ctx.fillStyle = '#00bcd4'; ctx.beginPath(); ctx.arc(0, 0, w/2, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, w/3, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
function drawSpeedFallback(x, y, w, h) { ctx.save(); ctx.translate(x + w/2, y + h/2); ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.moveTo(0, -h/2); ctx.lineTo(w/2, 0); ctx.lineTo(w/4, 0); ctx.lineTo(0, h/2); ctx.lineTo(-w/2, 0); ctx.lineTo(-w/4, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
function drawWormFallback(x, y, w, h, pulse) { ctx.save(); ctx.translate(x + w/2, y + h/2); let wriggle = Math.sin(pulse) * (h/3); ctx.fillStyle = '#8bc34a'; for(let i=0; i<4; i++) { ctx.beginPath(); ctx.arc((i * -w/4) + w/4, wriggle * (i%2===0?1:-1), h/2 - i*2, 0, Math.PI*2); ctx.fill(); ctx.stroke(); } ctx.fillStyle = '#d50000'; ctx.beginPath(); ctx.arc(w/4, -2 + wriggle, 3, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
function drawGroundFallback(x, y, w, h) { ctx.fillStyle = '#5d4037'; ctx.fillRect(x, y, w, 3000); ctx.fillStyle = '#4caf50'; ctx.fillRect(x, y, w, 15); }
function drawGoalFallback(x, y, w, h) { ctx.save(); ctx.fillStyle = '#bdbdbd'; ctx.fillRect(x + w/2 - 5, y, 10, h); ctx.fillStyle = '#e91e63'; ctx.beginPath(); ctx.moveTo(x + w/2, y); ctx.lineTo(x + w, y + 20); ctx.lineTo(x + w/2, y + 40); ctx.fill(); ctx.fillStyle = '#d7ccc8'; ctx.beginPath(); ctx.arc(x + w/2, y + h - 15, 20, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#ff1744'; ctx.beginPath(); ctx.arc(x + w/2 - 5, y + h - 20, 8, 0, Math.PI*2); ctx.arc(x + w/2 + 5, y + h - 22, 8, 0, Math.PI*2); ctx.arc(x + w/2, y + h - 25, 8, 0, Math.PI*2); ctx.fill(); ctx.restore(); }

function draw() {
    ctx.save();
    if (shakeTimer > 0) { ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10); }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (images.background.complete && images.background.naturalWidth > 0) {
        ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(26, 16, 37, 0.65)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#2a1a3a'); gradient.addColorStop(1, '#1a0a2a'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.translate(-cameraX, -cameraY);
    ambientParticles.forEach(p => p.draw(ctx));

    waterZones.forEach(w => {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.4)'; ctx.fillRect(w.x, w.y, w.width, w.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; ctx.fillRect(w.x, w.y, w.width, 15);
    });

    platforms.forEach(plat => {
        let drawHeight = plat.isUpper ? plat.height : 3000;
        if (images.ground.complete && images.ground.naturalWidth > 0) {
            let ptrn = ctx.createPattern(images.ground, 'repeat'); 
            ctx.fillStyle = ptrn;
            ctx.save(); ctx.translate(plat.x, plat.y); ctx.fillRect(0, 0, plat.width, drawHeight); ctx.restore();
        } else { 
            ctx.fillStyle = '#5d4037'; ctx.fillRect(plat.x, plat.y, plat.width, drawHeight); 
            ctx.fillStyle = '#4caf50'; ctx.fillRect(plat.x, plat.y, plat.width, 15); 
        }
    });

    if (goal) {
        if (images.flag.complete && images.flag.naturalWidth > 0) ctx.drawImage(images.flag, goal.x, goal.y, goal.width, goal.height);
        else drawGoalFallback(goal.x, goal.y, goal.width, goal.height);
    }

    strawberries.forEach(s => { let scale = 1 + Math.sin(s.pulse) * 0.08; ctx.save(); ctx.translate(s.x + s.width / 2, s.y + s.height / 2); ctx.scale(scale, scale); ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 18; if (images.strawberry.complete && images.strawberry.naturalWidth > 0) ctx.drawImage(images.strawberry, -s.width / 2, -s.height / 2, s.width, s.height); else drawStrawberryFallback(-s.width / 2, -s.height / 2, s.width, s.height); ctx.restore(); });
    if (banana) { let scale = 1 + Math.sin(banana.pulse) * 0.1; ctx.save(); ctx.translate(banana.x + banana.width / 2, banana.y + banana.height / 2); ctx.scale(scale, scale); if (images.banana.complete && images.banana.naturalWidth > 0) ctx.drawImage(images.banana, -banana.width / 2, -banana.height / 2, banana.width, banana.height); else drawBananaFallback(-banana.width / 2, -banana.height / 2, banana.width, banana.height); ctx.restore(); }
    if (shieldItem) { let scale = 1 + Math.sin(shieldItem.pulse) * 0.1; ctx.save(); ctx.translate(shieldItem.x + shieldItem.width / 2, shieldItem.y + shieldItem.height / 2); ctx.scale(scale, scale); ctx.shadowColor = '#00bcd4'; ctx.shadowBlur = 15; if (images.shield.complete && images.shield.naturalWidth > 0) ctx.drawImage(images.shield, -shieldItem.width / 2, -shieldItem.height / 2, shieldItem.width, shieldItem.height); else drawShieldFallback(-shieldItem.width / 2, -shieldItem.height / 2, shieldItem.width, shieldItem.height); ctx.restore(); }
    if (speedItem) { let scale = 1 + Math.sin(speedItem.pulse) * 0.1; ctx.save(); ctx.translate(speedItem.x + speedItem.width / 2, speedItem.y + speedItem.height / 2); ctx.scale(scale, scale); ctx.shadowColor = '#ff9800'; ctx.shadowBlur = 15; if (images.speed.complete && images.speed.naturalWidth > 0) ctx.drawImage(images.speed, -speedItem.width / 2, -speedItem.height / 2, speedItem.width, speedItem.height); else drawSpeedFallback(-speedItem.width / 2, -speedItem.height / 2, speedItem.width, speedItem.height); ctx.restore(); }
    if (heartItem) { let scale = 1 + Math.sin(heartItem.pulse) * 0.1; ctx.save(); ctx.translate(heartItem.x + heartItem.width / 2, heartItem.y + heartItem.height / 2); ctx.scale(scale, scale); ctx.shadowColor = '#ff3366'; ctx.shadowBlur = 15; if (images.heart.complete && images.heart.naturalWidth > 0) { ctx.drawImage(images.heart, -heartItem.width / 2, -heartItem.height / 2, heartItem.width, heartItem.height); } else { ctx.fillStyle = '#ff3366'; ctx.beginPath(); ctx.arc(0, 0, heartItem.width / 2, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
    
    enemies.forEach(e => { ctx.save(); ctx.translate(e.x + e.width / 2, e.y + e.height / 2); ctx.scale(e.facing, 1); let wriggleY = Math.sin(e.pulse) * 4; if (images.worm.complete && images.worm.naturalWidth > 0) ctx.drawImage(images.worm, -e.width / 2, -e.height / 2 + wriggleY, e.width, e.height); else drawWormFallback(-e.width / 2, -e.height / 2 + wriggleY, e.width, e.height, e.pulse); ctx.restore(); });

    particles.forEach(p => p.draw(ctx));

    ctx.save(); ctx.translate(monkey.x + monkey.width / 2, monkey.y + monkey.height / 2 + monkey.floatOffsetY); ctx.scale(player.facing, 1);
    if (images.monkey.complete && images.monkey.naturalWidth > 0) { if (monkey.isSuper) { ctx.shadowBlur = 20; ctx.shadowColor = '#ffd700'; } ctx.drawImage(images.monkey, -monkey.width / 2, -monkey.height / 2, monkey.width, monkey.height); } else drawMonkeyFallback(-monkey.width / 2, -monkey.height / 2, monkey.width, monkey.height, monkey.isSuper); ctx.restore();

    let isPlayerInvulnerable = invulnerableTimer > 0;
    ctx.save(); ctx.translate(player.x + player.width / 2, player.y + player.height / 2); ctx.scale(player.facing, 1);
    if (player.hasShield) { ctx.beginPath(); ctx.arc(0, 0, player.width * 0.7, 0, Math.PI * 2); ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 5; ctx.shadowBlur = 15; ctx.shadowColor = '#00bcd4'; ctx.stroke(); }
    if (isPlayerInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) ctx.globalAlpha = 0.3;
    if(player.dashCooldown <= 0) { ctx.shadowBlur = 15; ctx.shadowColor = '#ff4081'; }
    if (currentPlayerImage.complete && currentPlayerImage.naturalWidth > 0) ctx.drawImage(currentPlayerImage, -player.width / 2, -player.height / 2, player.width, player.height); else drawPlayerFallback(-player.width / 2, -player.height / 2, player.width, player.height, 1, false);
    ctx.restore();

    ctx.restore(); 
}

function gameLoop(timestamp) { let deltaTime = timestamp - lastTime; if (!deltaTime) deltaTime = 0; lastTime = timestamp; update(deltaTime); draw(); requestAnimationFrame(gameLoop); }

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (gameState === 'PLAYING') {
            timeLeft--; ui.time.innerText = timeLeft;
            if (timeLeft <= 0) gameOver();
            else {
                if (timeLeft % 10 === 0) spawnPowerup('banana');
                if (timeLeft % 13 === 0 && !shieldItem && !player.hasShield) spawnPowerup('shield');
                if (timeLeft % 17 === 0 && !speedItem && player.speedBoostTimer <= 0) spawnPowerup('speed');
            }
        }
    }, 1000);
}

function startGame() { overlay.classList.add('hidden'); gameState = 'PLAYING'; totalScore = 0; level = 1; timeLeft = 40; lives = 3; banana = null; shieldItem = null; speedItem = null; monkey.isSuper = false; player.dashCooldown = 0; player.hasShield = false; player.speedBoostTimer = 0; ui.score.innerText = totalScore; ui.level.innerText = level; ui.time.innerText = timeLeft; if (ui.target) ui.target.innerText = `0/0`; player.x = 100; player.y = 100; cameraX = 0; cameraY = 0; drawHearts(); spawnLevel(); startTimer(); }
function startNextLevel() { overlay.classList.add('hidden'); gameState = 'PLAYING'; banana = null; shieldItem = null; speedItem = null; monkey.isSuper = false; player.dashCooldown = 0; player.hasShield = false; player.speedBoostTimer = 0; ui.score.innerText = totalScore; ui.level.innerText = level; ui.time.innerText = timeLeft; if (ui.target) ui.target.innerText = `0/${requiredStrawberries}`; player.x = 100; player.y = 100; cameraX = 0; cameraY = 0; drawHearts(); spawnLevel(); startTimer(); }
function levelComplete() { gameState = 'LEVEL_UP'; level++; timeLeft += 25; clearInterval(timerInterval); playSound('levelup'); overlayTitle.innerText = `رائع! تم اجتياز المرحلة`; overlayTitle.style.color = '#4caf50'; overlayText.innerText = `استعد للمرحلة ${level}. الهدف إنك توصل لعلم النهاية حياً!`; actionButton.innerText = "التالي"; overlay.classList.remove('hidden'); }
function gameOver() { gameState = 'GAME_OVER'; clearInterval(timerInterval); let savedHighScore = localStorage.getItem('highScore') || 0; if (totalScore > savedHighScore) { localStorage.setItem('highScore', totalScore); savedHighScore = totalScore; } playSound('gameover'); highScoreDisplay.innerText = savedHighScore; statsSummary.style.display = 'block'; overlayTitle.innerText = "انتهت اللعبة!"; overlayTitle.style.color = '#f44336'; overlayText.innerText = `جمعت إجمالي نقاط: ${totalScore} ووصلت للمرحلة: ${level}`; actionButton.innerText = "حاول مجدداً"; overlay.classList.remove('hidden'); }
function togglePause() { if (gameState === 'PLAYING') { gameState = 'PAUSED'; pauseOverlay.classList.remove('hidden'); } else if (gameState === 'PAUSED') { gameState = 'PLAYING'; pauseOverlay.classList.add('hidden'); } }

actionButton.addEventListener('click', () => { initAudio(); actionButton.blur(); if (gameState === 'LEVEL_UP') { startNextLevel(); } else { startGame(); } });
window.addEventListener('keydown', e => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; if (e.key === 'p' || e.key === 'Escape') togglePause(); if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });

// دالة الموبايل: تشغيل أزرار اللمس المخفية
function setupTouchControls() {
    const touchBtns = [
        { id: 'btnLeft', key: 'ArrowLeft' },
        { id: 'btnRight', key: 'ArrowRight' },
        { id: 'btnJump', key: 'ArrowUp' },
        { id: 'btnDash', key: 'Shift' }
    ];

    touchBtns.forEach(btnInfo => {
        const btn = document.getElementById(btnInfo.id);
        if (!btn) return;
        
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault(); 
            keys[btnInfo.key] = true;
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault(); 
            keys[btnInfo.key] = false;
        }, { passive: false });

        btn.addEventListener('touchcancel', (e) => {
            e.preventDefault(); 
            keys[btnInfo.key] = false;
        }, { passive: false });
    });
}
setupTouchControls();

initAmbient(); drawHearts(); requestAnimationFrame(gameLoop);
