import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.0/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(0, 10, 10).normalize();
scene.add(directionalLight);

const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();
const chompSound = new THREE.Audio(listener);
const eatGhostSound = new THREE.Audio(listener);
const deathSound = new THREE.Audio(listener);
const powerSound = new THREE.Audio(listener);
const winSound = new THREE.Audio(listener);

audioLoader.load('chomp.wav', (buffer) => { chompSound.setBuffer(buffer); chompSound.setLoop(false); chompSound.setVolume(0.5); });
audioLoader.load('eatghost.wav', (buffer) => { eatGhostSound.setBuffer(buffer); eatGhostSound.setLoop(false); eatGhostSound.setVolume(0.5); });
audioLoader.load('death.wav', (buffer) => { deathSound.setBuffer(buffer); deathSound.setLoop(false); deathSound.setVolume(0.5); });
audioLoader.load('power.mp3', (buffer) => { powerSound.setBuffer(buffer); powerSound.setLoop(false); powerSound.setVolume(0.5); });
audioLoader.load('win.mp3', (buffer) => { winSound.setBuffer(buffer); winSound.setLoop(false); winSound.setVolume(0.5); });

const loader = new GLTFLoader();
let pacman;
let pacmanMixer;
const clock = new THREE.Clock();
let powerMode = false;
let powerModeEnd = 0;
let pacmanOriginalMaterials = [];
let ghostsOriginalMaterials = [];
let ghosts = [];
let ghostMixers = [];
let scaredGhostColor = 0x0000ff;
let poweredPacmanColor = 0xff0000;
let blinky;
const clockClyde = { timer: 0, chasing: true };

loader.load('pacman.glb', function (gltf) {
    pacman = gltf.scene;
    pacman.scale.set(0.009, 0.009, 0.009);
    pacman.position.set(0, 0.5, -1);
    scene.add(pacman);
    if (gltf.animations && gltf.animations.length > 0) {
        pacmanMixer = new THREE.AnimationMixer(pacman);
        gltf.animations.forEach((clip) => {
            pacmanMixer.clipAction(clip).play();
        });
    }
    pacman.traverse((child) => {
        if (child.isMesh && child.material) {
            pacmanOriginalMaterials.push(child.material.clone());
        }
    });
});

const ghostFiles = ['red_ghost.glb', 'pink_ghost.glb', 'blue_ghost.glb', 'yellow_ghost.glb'];
const ghostTypes = ['blinky', 'pinky', 'inky', 'clyde'];
const ghostPositions = [
    { x: 5, z: -5 },
    { x: -5, z: -5 },
    { x: 5, z: 5 },
    { x: -5, z: 5 }
];

ghostFiles.forEach((file, i) => {
    loader.load(file, (gltf) => {
        const ghost = gltf.scene;
        ghost.scale.set(0.8, 0.8, 0.8);
        ghost.position.set(ghostPositions[i].x, 0.5, ghostPositions[i].z);
        ghost.type = ghostTypes[i];
        scene.add(ghost);
        let ghostMixer;
        if (gltf.animations && gltf.animations.length > 0) {
            ghostMixer = new THREE.AnimationMixer(ghost);
            gltf.animations.forEach((clip) => {
                ghostMixer.clipAction(clip).play();
            });
        }
        ghostMixers.push(ghostMixer);
        ghost.path = [];
        ghost.pathIndex = 0;
        ghost.recalculatePath = true;
        ghost.lastPathCalculation = 0;
        const ghostMats = [];
        ghost.traverse((child) => {
            if (child.isMesh && child.material) {
                ghostMats.push(child.material.clone());
            }
        });
        ghostsOriginalMaterials.push(ghostMats);
        ghosts.push(ghost);
        if (ghost.type === 'blinky') {
            blinky = ghost;
        }
    });
});

const map = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#G####.#####.##.#####.####G#",
    "#.####.#####.##.#####.####.#",
    "#O........................O#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.##### ## #####.######",
    "######.#####    #####.######",
    "######.##          ##.######",
    "######.## ######## ##.######",
    "######.## ######## ##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#.####.#####.##.#####.####.#",
    "#G..##................##..G#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#.##########.##.##########.#",
    "#O........................O#",
    "############################"
];

const mapGroup = new THREE.Group();
const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
const pelletGeometry = new THREE.SphereGeometry(0.2, 16, 16);
const pelletMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
const superPelletGeometry = new THREE.SphereGeometry(0.3, 16, 16);
const superPelletMaterial = new THREE.MeshPhongMaterial({ color: 0xff00ff });
const pellets = [];
const superPellets = [];
const pelletMap = [];
for (let z = 0; z < map.length; z++) {
    pelletMap[z] = [];
    for (let x = 0; x < map[z].length; x++) {
        if (map[z][x] === '#') {
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            wall.position.set(x - map[z].length / 2, 0.5, z - map.length / 2);
            mapGroup.add(wall);
            pelletMap[z][x] = false;
        } else if (map[z][x] === '.') {
            const pellet = new THREE.Mesh(pelletGeometry, pelletMaterial);
            pellet.position.set(x - map[z].length / 2, 0.3, z - map.length / 2);
            scene.add(pellet);
            pellets.push(pellet);
            pelletMap[z][x] = 'pellet';
        } else if (map[z][x] === 'O') {
            const superPellet = new THREE.Mesh(superPelletGeometry, superPelletMaterial);
            superPellet.position.set(x - map[z].length / 2, 0.3, z - map.length / 2);
            scene.add(superPellet);
            superPellets.push(superPellet);
            pelletMap[z][x] = 'super';
        } else {
            pelletMap[z][x] = false;
        }
    }
}
scene.add(mapGroup);

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

camera.position.set(0, 15, 20);
camera.lookAt(0, 0, 0);
let score = 0;
let lives = 3;
document.getElementById('score').innerText = `Score: ${score}`;
document.getElementById('lives').innerText = `Lives: ${lives}`;
const pacSpeed = 0.2;
let pacDirection = new THREE.Vector3(0, 0, 0);

function getMapPosition(pos) {
    return {
        x: Math.round(pos.x + map[0].length / 2),
        z: Math.round(pos.z + map.length / 2)
    };
}

function findPath(start, end, grid) {
    const cols = grid[0].length;
    const rows = grid.length;
    const openSet = [];
    const closedSet = [];
    const startNode = { x: start.x, z: start.z, g: 0, h: 0, f: 0, parent: null };
    const endNode = { x: end.x, z: end.z };
    openSet.push(startNode);
    while (openSet.length > 0) {
        let lowestIndex = 0;
        for (let i = 1; i < openSet.length; i++) {
            if (openSet[i].f < openSet[lowestIndex].f) {
                lowestIndex = i;
            }
        }
        const current = openSet[lowestIndex];
        if (current.x === endNode.x && current.z === endNode.z) {
            const path = [];
            let temp = current;
            while (temp) {
                path.push({ x: temp.x, z: temp.z });
                temp = temp.parent;
            }
            return path.reverse();
        }
        openSet.splice(lowestIndex, 1);
        closedSet.push(current);
        const neighbors = [
            { x: current.x + 1, z: current.z },
            { x: current.x - 1, z: current.z },
            { x: current.x, z: current.z + 1 },
            { x: current.x, z: current.z - 1 }
        ];
        neighbors.forEach(neighbor => {
            if (neighbor.x < 0 || neighbor.x >= cols || neighbor.z < 0 || neighbor.z >= rows) {
                return;
            }
            if (grid[neighbor.z][neighbor.x] === false) {
                return;
            }
            if (closedSet.find(n => n.x === neighbor.x && n.z === neighbor.z)) {
                return;
            }
            const tentative_g = current.g + 1;
            let neighborNode = openSet.find(n => n.x === neighbor.x && n.z === neighbor.z);
            if (!neighborNode) {
                neighborNode = {
                    x: neighbor.x,
                    z: neighbor.z,
                    g: tentative_g,
                    h: Math.abs(neighbor.x - endNode.x) + Math.abs(neighbor.z - endNode.z),
                    f: 0,
                    parent: current
                };
                neighborNode.f = neighborNode.g + neighborNode.h;
                openSet.push(neighborNode);
            } else if (tentative_g < neighborNode.g) {
                neighborNode.g = tentative_g;
                neighborNode.f = neighborNode.g + neighborNode.h;
                neighborNode.parent = current;
            }
        });
    }
    return [];
}

function getGridMap() {
    const grid = [];
    for (let z = 0; z < map.length; z++) {
        grid[z] = [];
        for (let x = 0; x < map[z].length; x++) {
            grid[z][x] = map[z][x] !== '#';
        }
    }
    return grid;
}
const gridMap = getGridMap();

function enterPowerMode() {
    powerMode = true;
    powerModeEnd = Date.now() + 10000;
    if (pacman && pacmanOriginalMaterials.length > 0) {
        pacman.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.color.set(poweredPacmanColor);
            }
        });
    }
    ghosts.forEach((ghost, i) => {
        ghost.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.color.set(scaredGhostColor);
            }
        });
    });
    if (!powerSound.isPlaying) powerSound.play();
}

function exitPowerMode() {
    powerMode = false;
    if (pacman && pacmanOriginalMaterials.length > 0) {
        let matIndex = 0;
        pacman.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = pacmanOriginalMaterials[matIndex++].clone();
            }
        });
    }
    ghosts.forEach((ghost, i) => {
        let matIndex = 0;
        ghost.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = ghostsOriginalMaterials[i][matIndex++].clone();
            }
        });
    });
}

function getPinkyTarget() {
    const pm = getMapPosition(pacman.position);
    let target = { x: pm.x, z: pm.z };
    switch (pacDirection.x + pacDirection.z) {
        case -1:
            target = { x: pm.x, z: pm.z - 4 };
            break;
        case 1:
            target = { x: pm.x, z: pm.z + 4 };
            break;
        case -1:
            target = { x: pm.x - 4, z: pm.z };
            break;
        case 1:
            target = { x: pm.x + 4, z: pm.z };
            break;
    }
    target.x = THREE.MathUtils.clamp(target.x, 0, map[0].length - 1);
    target.z = THREE.MathUtils.clamp(target.z, 0, map.length - 1);
    return target;
}

function getInkyTarget(ghost) {
    if (!blinky || !pacman) return { x: 0, z: 0 };
    const pm = getMapPosition(pacman.position);
    const bm = getMapPosition(blinky.position);
    const target = {
        x: pm.x + (pm.x - bm.x),
        z: pm.z + (pm.z - bm.z)
    };
    target.x = THREE.MathUtils.clamp(target.x, 0, map[0].length - 1);
    target.z = THREE.MathUtils.clamp(target.z, 0, map.length - 1);
    return target;
}

function getClydeTarget(ghost) {
    const pm = getMapPosition(pacman.position);
    const gm = getMapPosition(ghost.position);
    const distance = Math.sqrt(Math.pow(pm.x - gm.x, 2) + Math.pow(pm.z - gm.z, 2));
    if (distance > 8 || !clockClyde.chasing) {
        return { x: 0, z: map.length - 1 };
    } else {
        return pm;
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (pacmanMixer) pacmanMixer.update(delta);
    for (let i = 0; i < ghostMixers.length; i++) {
        if (ghostMixers[i]) ghostMixers[i].update(delta);
    }
    if (Date.now() > powerModeEnd && powerMode) {
        exitPowerMode();
    }
    if (pacman) {
        let moveX = 0;
        let moveZ = 0;
        let direction = null;
        if (keys['ArrowUp'] || keys['w'] || keys['W']) {
            moveZ -= pacSpeed;
            pacDirection.set(0, 0, -1);
            direction = 'up';
        }
        if (keys['ArrowDown'] || keys['s'] || keys['S']) {
            moveZ += pacSpeed;
            pacDirection.set(0, 0, 1);
            direction = 'down';
        }
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
            moveX -= pacSpeed;
            pacDirection.set(-1, 0, 0);
            direction = 'left';
        }
        if (keys['ArrowRight'] || keys['d'] || keys['D']) {
            moveX += pacSpeed;
            pacDirection.set(1, 0, 0);
            direction = 'right';
        }
        pacman.position.x += moveX;
        pacman.position.z += moveZ;
        const pacMapPos = getMapPosition(pacman.position);
        if (map[pacMapPos.z] && map[pacMapPos.z][pacMapPos.x] === '#') {
            pacman.position.x -= moveX;
            pacman.position.z -= moveZ;
        } else {
            if (pelletMap[pacMapPos.z] && pelletMap[pacMapPos.z][pacMapPos.x] === 'pellet') {
                pelletMap[pacMapPos.z][pacMapPos.x] = false;
                const pelletIndex = pellets.findIndex(p =>
                    Math.abs(p.position.x - (pacMapPos.x - map[0].length / 2)) < 0.3 &&
                    Math.abs(p.position.z - (pacMapPos.z - map.length / 2)) < 0.3
                );
                if (pelletIndex !== -1) {
                    scene.remove(pellets[pelletIndex]);
                    pellets.splice(pelletIndex, 1);
                    score += 10;
                    document.getElementById('score').innerText = `Score: ${score}`;
                    if (!chompSound.isPlaying) chompSound.play();
                    if (pellets.length === 0 && superPellets.length === 0) {
                        if (!winSound.isPlaying) winSound.play();
                        alert(`You Win! Final Score: ${score}`);
                        window.location.reload();
                    }
                }
            } else if (pelletMap[pacMapPos.z] && pelletMap[pacMapPos.z][pacMapPos.x] === 'super') {
                pelletMap[pacMapPos.z][pacMapPos.x] = false;
                const spIndex = superPellets.findIndex(p =>
                    Math.abs(p.position.x - (pacMapPos.x - map[0].length / 2)) < 0.3 &&
                    Math.abs(p.position.z - (pacMapPos.z - map.length / 2)) < 0.3
                );
                if (spIndex !== -1) {
                    scene.remove(superPellets[spIndex]);
                    superPellets.splice(spIndex, 1);
                    score += 50;
                    document.getElementById('score').innerText = `Score: ${score}`;
                    if (!chompSound.isPlaying) chompSound.play();
                    enterPowerMode();
                    if (pellets.length === 0 && superPellets.length === 0) {
                        if (!winSound.isPlaying) winSound.play();
                        alert(`You Win! Final Score: ${score}`);
                        window.location.reload();
                    }
                }
            }
        }
        camera.position.x += (pacman.position.x - camera.position.x) * 0.05;
        camera.position.y += (15 - camera.position.y) * 0.05;
        camera.position.z += (pacman.position.z + 15 - camera.position.z) * 0.05;
        camera.lookAt(pacman.position);
        if (direction) {
            switch (direction) {
                case 'up':
                    pacman.rotation.y = Math.PI;
                    break;
                case 'down':
                    pacman.rotation.y = 0;
                    break;
                case 'left':
                    pacman.rotation.y = -Math.PI / 2;
                    break;
                case 'right':
                    pacman.rotation.y = Math.PI / 2;
                    break;
            }
        }
    }

    ghosts.forEach((ghost, index) => {
        const currentTime = Date.now();
        if (ghost.recalculatePath || currentTime - ghost.lastPathCalculation > 2000) {
            const ghostMapPos = getMapPosition(ghost.position);
            let targetPos;
            if (ghost.type === 'blinky') {
                targetPos = getMapPosition(pacman.position);
            } else if (ghost.type === 'pinky') {
                targetPos = getPinkyTarget();
            } else if (ghost.type === 'inky') {
                targetPos = getInkyTarget(ghost);
            } else if (ghost.type === 'clyde') {
                targetPos = getClydeTarget(ghost);
                clockClyde.timer += delta;
                if (clockClyde.timer > 10) {
                    clockClyde.chasing = !clockClyde.chasing;
                    clockClyde.timer = 0;
                }
            }
            targetPos.x = THREE.MathUtils.clamp(targetPos.x, 0, map[0].length - 1);
            targetPos.z = THREE.MathUtils.clamp(targetPos.z, 0, map.length - 1);
            ghost.path = findPath(ghostMapPos, targetPos, gridMap);
            ghost.pathIndex = 0;
            ghost.recalculatePath = false;
            ghost.lastPathCalculation = currentTime;
        }
        if (ghost.path && ghost.pathIndex < ghost.path.length) {
            const target = ghost.path[ghost.pathIndex];
            const targetPosition = {
                x: target.x - map[0].length / 2,
                z: target.z - map.length / 2
            };
            const direction = new THREE.Vector3(
                targetPosition.x - ghost.position.x,
                0,
                targetPosition.z - ghost.position.z
            );
            const distance = direction.length();
            if (distance < 0.1) {
                ghost.pathIndex++;
                if (ghost.pathIndex >= ghost.path.length) {
                    ghost.recalculatePath = true;
                }
            } else {
                direction.normalize();
                ghost.position.x += direction.x * 0.05;
                ghost.position.z += direction.z * 0.05;
                if (Math.abs(direction.x) > Math.abs(direction.z)) {
                    if (direction.x > 0) ghost.rotation.y = Math.PI / 2;
                    else ghost.rotation.y = -Math.PI / 2;
                } else {
                    if (direction.z > 0) ghost.rotation.y = 0;
                    else ghost.rotation.y = Math.PI;
                }
            }
        } else {
            ghost.recalculatePath = true;
        }
        if (pacman) {
            const distanceToPac = ghost.position.distanceTo(pacman.position);
            if (distanceToPac < 1) {
                if (powerMode) {
                    score += 200;
                    document.getElementById('score').innerText = `Score: ${score}`;
                    if (!eatGhostSound.isPlaying) eatGhostSound.play();
                    ghost.position.set(ghostPositions[index].x, 0.5, ghostPositions[index].z);
                    ghost.recalculatePath = true;
                } else {
                    lives -= 1;
                    document.getElementById('lives').innerText = `Lives: ${lives}`;
                    if (lives <= 0) {
                        if (!deathSound.isPlaying) deathSound.play();
                        alert(`Game Over! Final Score: ${score}`);
                        window.location.reload();
                    } else {
                        pacman.position.set(0, 0.5, -1);
                        ghosts.forEach((g, i) => {
                            g.position.set(ghostPositions[i].x, 0.5, ghostPositions[i].z);
                            g.recalculatePath = true;
                        });
                    }
                }
            }
        }
    });

    ghosts.forEach((ghost, index) => {
        ghosts.forEach((otherGhost, otherIndex) => {
            if (index !== otherIndex) {
                const distance = ghost.position.distanceTo(otherGhost.position);
                if (distance < 1.5) {
                    const repelDirection = new THREE.Vector3().subVectors(ghost.position, otherGhost.position).normalize();
                    ghost.position.addScaledVector(repelDirection, 0.02);
                }
            }
        });
    });

    renderer.render(scene, camera);
}
animate();
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
