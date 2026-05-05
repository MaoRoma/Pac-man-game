const canvas = document.getElementById("canvas");
const canvasContext = canvas.getContext("2d");
const pacmanFrames = document.getElementById("animation");
const ghostFrames = document.getElementById("ghosts");
const scoreEl = document.getElementById("scoreValue");
const livesDotsEl = document.getElementById("livesDots");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlayMsgEl = document.getElementById("overlayMsg");
const screenHome = document.getElementById("screen-home");
const screenLevels = document.getElementById("screen-levels");
const screenGame = document.getElementById("screen-game");
const levelTitleEl = document.getElementById("levelTitle");
const gamePanelEl = document.querySelector(".game-panel");

canvasContext.imageSmoothingEnabled = true;

var gameAnimTick = 0;

const createRect = (x, y, width, height, color) => {
    canvasContext.fillStyle = color;
    canvasContext.fillRect(x, y, width, height);
};

const DIRECTION_RIGHT = 4;
const DIRECTION_UP = 3;
const DIRECTION_LEFT = 2;
const DIRECTION_BOTTOM = 1;

let map = [];
let initialMapSnapshot = [];
let lives = 3;
let ghostCount = 4;
let ghostImageLocations = [
    { x: 0, y: 0 },
    { x: 176, y: 0 },
    { x: 0, y: 121 },
    { x: 176, y: 121 },
];

let fps = 30;
let pacman;
let oneBlockSize = 20;
let score = 0;
let ghosts = [];
let wallSpaceWidth = oneBlockSize / 1.6;
let wallOffset = (oneBlockSize - wallSpaceWidth) / 2;
let wallInnerColor = "#1a1512";

let gameState = "menu";
let lastHudScore = -1;
let lastHudLives = -1;
let randomTargetsForGhosts = [];
let pacSpawn = { row: 1, col: 1 };
let ghostSpawn = { row: 10, col: 9 };
let currentLevelIndex = 0;
let gameInterval = null;
let transitionCounter = 0;
let eatParticles = [];
let screenShake = 0;
let currentVisualStyle = null;

function findPacSpawn(m) {
    for (let r = 1; r < m.length - 1; r++) {
        for (let c = 1; c < m[0].length - 1; c++) {
            if (m[r][c] === 2 || m[r][c] === 0) {
                return { row: r, col: c };
            }
        }
    }
    return { row: 1, col: 1 };
}

function findGhostSpawn(m, pr, pc) {
    const gr = Math.floor(m.length / 2);
    const gc = Math.floor(m[0].length / 2);
    const q = [[gr, gc]];
    const seen = new Set([`${gr},${gc}`]);
    while (q.length) {
        const [r, c] = q.shift();
        if (
            r >= 1 &&
            c >= 1 &&
            r < m.length - 1 &&
            c < m[0].length - 1 &&
            (m[r][c] === 2 || m[r][c] === 0) &&
            (r !== pr || c !== pc)
        ) {
            return { row: r, col: c };
        }
        for (const [dr, dc] of [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
        ]) {
            const nr = r + dr;
            const nc = c + dc;
            const k = `${nr},${nc}`;
            if (
                nr < 0 ||
                nc < 0 ||
                nr >= m.length ||
                nc >= m[0].length ||
                seen.has(k)
            )
                continue;
            seen.add(k);
            q.push([nr, nc]);
        }
    }
    return { row: gr, col: gc };
}

const rebuildGhostTargets = () => {
    if (!map.length || !map[0]) return;
    randomTargetsForGhosts = [
        { x: 1 * oneBlockSize, y: 1 * oneBlockSize },
        { x: 1 * oneBlockSize, y: (map.length - 2) * oneBlockSize },
        { x: (map[0].length - 2) * oneBlockSize, y: oneBlockSize },
        {
            x: (map[0].length - 2) * oneBlockSize,
            y: (map.length - 2) * oneBlockSize,
        },
    ];
};

const resizeCanvasForMap = () => {
    canvas.width = map[0].length * oneBlockSize;
    canvas.height = map.length * oneBlockSize;
};

const dotsRemaining = () => {
    for (let i = 0; i < map.length; i++) {
        for (let j = 0; j < map[0].length; j++) {
            if (map[i][j] === 2 || map[i][j] === 4) return true;
        }
    }
    return false;
};

const syncHud = () => {
    lastHudScore = score;
    lastHudLives = lives;
    scoreEl.textContent = String(score);
    livesDotsEl.innerHTML = "";
    for (let i = 0; i < lives; i++) {
        const pip = document.createElement("span");
        pip.className = "life-pip";
        pip.setAttribute("aria-hidden", "true");
        livesDotsEl.appendChild(pip);
    }
};

const syncHudIfNeeded = () => {
    if (score !== lastHudScore || lives !== lastHudLives) {
        syncHud();
    }
};

const hideOverlay = () => {
    overlayEl.classList.remove("visible", "win", "lose", "transition");
};

const showOverlay = (kind, title, msg) => {
    overlayEl.classList.remove("win", "lose", "transition");
    overlayEl.classList.add("visible", kind);
    overlayTitleEl.textContent = title;
    overlayMsgEl.textContent = msg;
};

const showTransitionOverlay = (title, msg) => {
    overlayEl.classList.remove("win", "lose");
    overlayEl.classList.add("visible", "transition");
    overlayTitleEl.textContent = title;
    overlayMsgEl.textContent = msg;
};

const applyLevelGrid = (grid) => {
    map = grid.map((row) => row.slice());
    initialMapSnapshot = map.map((row) => row.slice());
    pacSpawn = findPacSpawn(map);
    ghostSpawn = findGhostSpawn(map, pacSpawn.row, pacSpawn.col);
    rebuildGhostTargets();
    wallSpaceWidth = oneBlockSize / 1.6;
    wallOffset = (oneBlockSize - wallSpaceWidth) / 2;
    currentVisualStyle = getLevelVisualStyle(currentLevelIndex);
    wallInnerColor = currentVisualStyle.inner;
    resizeCanvasForMap();
};

const createNewPacman = () => {
    pacman = new Pacman(
        pacSpawn.col * oneBlockSize,
        pacSpawn.row * oneBlockSize,
        oneBlockSize,
        oneBlockSize,
        oneBlockSize / 5
    );
};

let createGhosts = () => {
    ghosts = [];
    let numGhosts = Math.min(6, 3 + Math.floor((currentLevelIndex + 1) / 2));
    const offsets = [
        { dc: 0, dr: 0 },
        { dc: -1, dr: 0 },
        { dc: 1, dr: 0 },
        { dc: 0, dr: 1 },
        { dc: -1, dr: 1 },
        { dc: 1, dr: 1 },
    ];
    for (let i = 0; i < numGhosts; i++) {
        const offset = offsets[i];
        let newGhost = new Ghost(
            (ghostSpawn.col + offset.dc) * oneBlockSize,
            (ghostSpawn.row + offset.dr) * oneBlockSize,
            oneBlockSize,
            oneBlockSize,
            pacman.speed / 2,
            ghostImageLocations[i % 4].x,
            ghostImageLocations[i % 4].y,
            124,
            116,
            6 + i
        );
        newGhost.randomTargetIndex = i % 4;
        ghosts.push(newGhost);
    }
};

const stopGameLoop = () => {
    if (gameInterval !== null) {
        clearInterval(gameInterval);
        gameInterval = null;
    }
};

const startGameLoop = () => {
    stopGameLoop();
    gameInterval = setInterval(gameLoop, 1000 / fps);
};

const restartCurrentLevel = () => {
    if (!initialMapSnapshot.length) return;
    map = initialMapSnapshot.map((row) => row.slice());
    score = 0;
    lives = 3;
    gameState = "playing";
    currentVisualStyle = getLevelVisualStyle(currentLevelIndex);
    wallInnerColor = currentVisualStyle.inner;
    hideOverlay();
    eatParticles = [];
    createNewPacman();
    createGhosts();
    syncHud();
};

const showScreen = (name) => {
    screenHome.classList.toggle("hidden", name !== "home");
    screenLevels.classList.toggle("hidden", name !== "levels");
    screenGame.classList.toggle("hidden", name !== "game");
};

document.getElementById("btnStart").addEventListener("click", () => {
    showScreen("levels");
});

document.getElementById("btnBackHome").addEventListener("click", () => {
    showScreen("home");
});

document.querySelectorAll("[data-level]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-level"), 10);
        startLevel(idx, false);
    });
});

document.getElementById("btnToLevels").addEventListener("click", () => {
    stopGameLoop();
    gameState = "menu";
    hideOverlay();
    eatParticles = [];
    showScreen("levels");
});

document.getElementById("btnToHome").addEventListener("click", () => {
    stopGameLoop();
    gameState = "menu";
    hideOverlay();
    eatParticles = [];
    showScreen("home");
});

function startLevel(index, continueRun) {
    const def = LEVELS[index];
    if (!def) return;
    currentLevelIndex = index;
    currentVisualStyle = getLevelVisualStyle(currentLevelIndex);
    wallInnerColor = currentVisualStyle.inner;
    levelTitleEl.textContent =
        def.titleKm + " · " + def.titleEn.split(" · ")[0];
    applyLevelGrid(def.build());
    if (!continueRun) {
        score = 0;
        lives = 3;
    } else {
        score += 50;
        syncHud();
    }
    gameState = "playing";
    hideOverlay();
    eatParticles = [];
    createNewPacman();
    createGhosts();
    syncHud();
    showScreen("game");
    startGameLoop();
    gameLoop();
}

function spawnEatParticles(px, py) {
    const cx = px + oneBlockSize / 2;
    const cy = py + oneBlockSize / 2;
    const st = currentVisualStyle || getLevelVisualStyle(0);
    for (let n = 0; n < 6; n++) {
        const a = (n / 6) * Math.PI * 2 + Math.random() * 0.5;
        eatParticles.push({
            x: cx,
            y: cy,
            vx: Math.cos(a) * (1.2 + Math.random()),
            vy: Math.sin(a) * (1.2 + Math.random()),
            life: 14,
            color: st.dotMid,
        });
    }
}

let gameLoop = () => {
    update();
    draw();
};

let restartPacmanAndGhosts = () => {
    createNewPacman();
    createGhosts();
};

let onGhostCollision = () => {
    if (gameState !== "playing") return;
    screenShake = 14;
    lives--;
    syncHud();
    if (lives <= 0) {
        gameState = "gameover";
        showOverlay(
            "lose",
            "ចប់ហ្គេម",
            "Press R to try again, or Levels to choose another map."
        );
        return;
    }
    restartPacmanAndGhosts();
};

let update = () => {
    if (gameState === "level_transition") {
        transitionCounter--;
        if (transitionCounter <= 0) {
            hideOverlay();
            if (currentLevelIndex < LEVELS.length - 1) {
                startLevel(currentLevelIndex + 1, true);
            }
        }
        return;
    }

    if (gameState !== "playing") return;
    if (!map.length || !pacman) return;

    gameAnimTick++;
    if (screenShake > 0) screenShake--;

    const scoreBefore = score;
    pacman.tickAnimation();
    pacman.moveProcess();
    pacman.eat();
    if (score > scoreBefore) {
        spawnEatParticles(pacman.x, pacman.y);
    }

    if (!dotsRemaining()) {
        if (currentLevelIndex < LEVELS.length - 1) {
            gameState = "level_transition";
            transitionCounter = Math.ceil(fps * 1.6);
            const next = LEVELS[currentLevelIndex + 1];
            showTransitionOverlay(
                "✦ ផ្លូវបើក! ✦",
                "Level " +
                (currentLevelIndex + 2) +
                " — " +
                next.titleEn +
                " · Get ready…"
            );
            if (gamePanelEl) {
                gamePanelEl.classList.remove("level-pulse");
                void gamePanelEl.offsetWidth;
                gamePanelEl.classList.add("level-pulse");
            }
        } else {
            gameState = "won";
            showOverlay(
                "win",
                "ជ័យធំ!",
                "All eleven paths cleared! Legend of the maze. Press R to replay Inferno, or Levels."
            );
        }
        syncHudIfNeeded();
        return;
    }

    updateGhosts();
    if (pacman.checkGhostCollision(ghosts)) {
        onGhostCollision();
    }
    syncHudIfNeeded();

    for (let i = eatParticles.length - 1; i >= 0; i--) {
        const p = eatParticles[i];
        p.life--;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.92;
        p.vy *= 0.92;
        if (p.life <= 0) eatParticles.splice(i, 1);
    }
};

const drawPlayfieldBackground = () => {
    const st = currentVisualStyle || getLevelVisualStyle(0);
    const w = map[0].length * oneBlockSize;
    const h = map.length * oneBlockSize;
    const pulse = 1 + 0.04 * Math.sin(gameAnimTick * 0.06);
    const g = canvasContext.createRadialGradient(
        w * 0.5,
        h * 0.32,
        0,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.9 * pulse
    );
    g.addColorStop(0, st.bg0);
    g.addColorStop(0.45, st.bg1);
    g.addColorStop(1, st.bg2);
    canvasContext.fillStyle = g;
    canvasContext.fillRect(0, 0, w, h);
};

let drawFoods = () => {
    const st = currentVisualStyle || getLevelVisualStyle(0);
    const baseR = oneBlockSize / 7;
    for (let i = 0; i < map.length; i++) {
        for (let j = 0; j < map[0].length; j++) {
            if (map[i][j] === 2 || map[i][j] === 4) {
                const isSpeed = map[i][j] === 4;
                const cx = j * oneBlockSize + oneBlockSize / 2;
                const cy = i * oneBlockSize + oneBlockSize / 2;
                const pulse =
                    1 +
                    (isSpeed ? 0.35 : 0.22) *
                    Math.sin(gameAnimTick * (isSpeed ? 0.25 : 0.14) + j * 0.4 + i * 0.35);
                const r = baseR * pulse * (isSpeed ? 1.8 : 1);
                canvasContext.save();
                canvasContext.shadowColor = isSpeed ? "rgba(0, 255, 255, 0.9)" : st.dotGlow;
                canvasContext.shadowBlur = (isSpeed ? 12 : 8) + pulse * 4;
                const dotGrad = canvasContext.createRadialGradient(
                    cx - r * 0.3,
                    cy - r * 0.3,
                    0,
                    cx,
                    cy,
                    r * 1.2
                );
                dotGrad.addColorStop(0, isSpeed ? "#ffffff" : st.dotHi);
                dotGrad.addColorStop(0.5, isSpeed ? "#00ffff" : st.dotMid);
                dotGrad.addColorStop(1, isSpeed ? "#0066ff" : st.dotLo);
                canvasContext.beginPath();
                canvasContext.arc(cx, cy, r, 0, Math.PI * 2);
                canvasContext.fillStyle = dotGrad;
                canvasContext.fill();
                canvasContext.restore();
            }
        }
    }
};

let drawWalls = () => {
    const st = currentVisualStyle || getLevelVisualStyle(0);
    const shimmer = 0.03 * Math.sin(gameAnimTick * 0.08);
    for (let i = 0; i < map.length; i++) {
        for (let j = 0; j < map[0].length; j++) {
            if (map[i][j] === 1) {
                const x = j * oneBlockSize;
                const y = i * oneBlockSize;
                const wallGrad = canvasContext.createLinearGradient(
                    x,
                    y,
                    x + oneBlockSize,
                    y + oneBlockSize
                );
                wallGrad.addColorStop(0, st.w0);
                wallGrad.addColorStop(0.35 + shimmer, st.w1);
                wallGrad.addColorStop(0.72, st.w2);
                wallGrad.addColorStop(1, st.w3);
                createRect(x, y, oneBlockSize, oneBlockSize, wallGrad);
                canvasContext.strokeStyle = st.stroke;
                canvasContext.lineWidth = 1;
                canvasContext.strokeRect(
                    x + 0.5,
                    y + 0.5,
                    oneBlockSize - 1,
                    oneBlockSize - 1
                );

                if (j > 0 && map[i][j - 1] === 1) {
                    createRect(
                        x,
                        y + wallOffset,
                        wallSpaceWidth + wallOffset,
                        wallSpaceWidth,
                        wallInnerColor
                    );
                }
                if (j < map[0].length - 1 && map[i][j + 1] === 1) {
                    createRect(
                        x + wallOffset,
                        y + wallOffset,
                        wallSpaceWidth + wallOffset,
                        wallSpaceWidth,
                        wallInnerColor
                    );
                }
                if (i < map.length - 1 && map[i + 1][j] === 1) {
                    createRect(
                        x + wallOffset,
                        y + wallOffset,
                        wallSpaceWidth,
                        wallSpaceWidth + wallOffset,
                        wallInnerColor
                    );
                }
                if (i > 0 && map[i - 1][j] === 1) {
                    createRect(
                        x + wallOffset,
                        y,
                        wallSpaceWidth,
                        wallSpaceWidth + wallOffset,
                        wallInnerColor
                    );
                }
            }
        }
    }
};

let drawParticles = () => {
    for (const p of eatParticles) {
        canvasContext.save();
        canvasContext.globalAlpha = Math.min(1, p.life / 14);
        canvasContext.fillStyle = p.color;
        canvasContext.beginPath();
        canvasContext.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        canvasContext.fill();
        canvasContext.restore();
    }
};

let draw = () => {
    if (!map.length || !map[0]) return;
    let sx = 0;
    let sy = 0;
    if (screenShake > 0) {
        const mag = (screenShake / 14) * 5;
        sx = (Math.random() - 0.5) * mag;
        sy = (Math.random() - 0.5) * mag;
    }
    canvasContext.setTransform(1, 0, 0, 1, 0, 0);
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    canvasContext.save();
    canvasContext.translate(sx, sy);
    drawPlayfieldBackground();
    drawWalls();
    drawFoods();
    if (ghosts.length) drawGhosts();
    if (pacman) pacman.draw();
    drawParticles();
    canvasContext.restore();
};

window.addEventListener("keydown", (event) => {
    const k = event.keyCode;
    const key = event.key.toLowerCase();

    if (key === "r" || k === 82) {
        if (
            screenGame &&
            !screenGame.classList.contains("hidden") &&
            (gameState === "won" || gameState === "gameover")
        ) {
            restartCurrentLevel();
        }
        return;
    }

    if (gameState !== "playing") return;

    if ([37, 38, 39, 40, 65, 87, 68, 83].includes(k)) {
        event.preventDefault();
    }

    setTimeout(() => {
        if (!pacman) return;
        if (k === 37 || k === 65) {
            pacman.nextDirection = DIRECTION_LEFT;
        } else if (k === 38 || k === 87) {
            pacman.nextDirection = DIRECTION_UP;
        } else if (k === 39 || k === 68) {
            pacman.nextDirection = DIRECTION_RIGHT;
        } else if (k === 40 || k === 83) {
            pacman.nextDirection = DIRECTION_BOTTOM;
        }
    }, 1);
});

showScreen("home");
