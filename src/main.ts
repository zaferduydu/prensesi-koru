import * as THREE from 'three';
import { Hands, type Results as HandResults } from '@mediapipe/hands';
import { FaceMesh, type Results as FaceResults } from '@mediapipe/face_mesh';


// Sahne, kamera ve renderer
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;

// Oyun Nesneleri
let player: THREE.Mesh; // Turuncu kare (kullanıcı kontrolü)
let player2: THREE.Mesh; // Yeni oyuncu (örneğin mavi)

let princess: THREE.Mesh; // Yeşil kare (hedef)
let princessTarget = new THREE.Vector3(); // Yeni hedef konum
const princessSpeed = 0.02; // Hareket hızı
const princessChangeInterval = 3000; // ms cinsinden
let lastPrincessChangeTime = 0;


const enemies: THREE.Mesh[] = []; // Kırmızı kareler (düşmanlar)
const enemyImagePaths = ['/enemies/stego.png', '/enemies/tha.png', '/enemies/trex.png']; // Düşman görselleri

// Boyutlar (Three.js birimleri cinsinden, CSS pikselleriyle eşleşecek şekilde ayarlanabilir)
const playerSize = 1;
const princessSize = 1.2;
const enemySize = 1;


let hands: Hands;
let faceMesh: FaceMesh;
// Video elementi ve MediaPipe Hands
let videoElement: HTMLVideoElement;
let textureLoader: THREE.TextureLoader; // Doku yükleyiciyi

// Oyun Durumu
let score = 0;
let scoreDisplayElement: HTMLElement | null;
let gameOver = false;
const enemySpeed = 0.03;
const enemySpawnInterval = 500; // Milisaniye cinsinden düşman üretme aralığı
let lastEnemySpawnTime = 0;

let cameraReady = false;
let gameStarted = false;


function init() {
	videoElement = document.getElementById('video') as HTMLVideoElement;
	if (!videoElement) {
		console.error('Video element not found!');
		return;
	}

	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
	camera.position.z = 5;

	const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
	if (!canvas) {
		console.error('Canvas element not found!');
		return;
	}
	renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setClearColor(0x000000, 0);

	// Oyuncu (Turuncu Kare)
	const playerGeometry = new THREE.BoxGeometry(playerSize, playerSize, 0);
	textureLoader = new THREE.TextureLoader(); // Doku yükleyiciyi burada başlat
	const playerTexture = textureLoader.load('/fire.png'); // /public klasöründeki görsel
	const playerMaterial = new THREE.MeshBasicMaterial({ map: playerTexture, transparent: true }); // Turuncu
	player = new THREE.Mesh(playerGeometry, playerMaterial);
	scene.add(player);

	// Oyuncu 2 (player2)
	const player2Geometry = new THREE.BoxGeometry(playerSize, playerSize, 0);
	const player2Texture = textureLoader.load('/ice.png'); // Farklı bir görsel olsun
	const player2Material = new THREE.MeshBasicMaterial({ map: player2Texture, transparent: true });
	player2 = new THREE.Mesh(player2Geometry, player2Material);
	scene.add(player2);

	// Prenses (Görsel)
	const princessGeometry = new THREE.BoxGeometry(princessSize, princessSize, 0);
	textureLoader = new THREE.TextureLoader();
	const princessTexture = textureLoader.load('/princess.png');
	const princessMaterial = new THREE.MeshBasicMaterial({ map: princessTexture, transparent: true });
	princess = new THREE.Mesh(princessGeometry, princessMaterial);
	princess.position.set(0, 0, 0); // Ekranın ortası
	scene.add(princess);

	// MediaPipe Hands kurulumu
	hands = new Hands({
		locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
	});

	hands.setOptions({
		maxNumHands: 2,
		modelComplexity: 1,
		minDetectionConfidence: 0.5,
		minTrackingConfidence: 0.5
	});
	hands.onResults(onHandResults);


	faceMesh = new FaceMesh({
		locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
	});

	faceMesh.setOptions({
		maxNumFaces: 1,
		minDetectionConfidence: 0.5,
		minTrackingConfidence: 0.5
	});

	faceMesh.onResults(onFaceResults);


	if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
		navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
			.then((stream) => {
				videoElement.srcObject = stream;
				videoElement.onloadedmetadata = () => {
					videoElement.play();
					cameraReady = true;
					sendToMediaPipe();

					showLoadingMessage();
					showStartButton();
				};
			})
			.catch((err) => console.error('Error accessing camera: ', err));
	} else {
		console.error('getUserMedia not supported');
	}

	scoreDisplayElement = document.getElementById('scoreDisplay');
	updateScoreDisplay();

	window.addEventListener('resize', onWindowResize, false);
	animate();
}

async function sendToMediaPipe() {
	if (gameOver) return;
	if (!videoElement.videoWidth) {
		requestAnimationFrame(sendToMediaPipe);
	}
	// Önce eller
	await hands.send({ image: videoElement });

	// Sonra yüz (isteğe bağlı - ağız açma efektin için)
	await faceMesh.send({ image: videoElement });

	requestAnimationFrame(sendToMediaPipe);
}

function onHandResults(results: HandResults) {
	if (gameOver) return;


	if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
		results.multiHandLandmarks.forEach((landmarks, index) => {
			const handPoint = landmarks[9]; // orta parmak kökü
			const handedness = results.multiHandedness?.[index]?.label; // "Left" veya "Right"

			if (handPoint) {
				const screenX = (1 - handPoint.x) * window.innerWidth;
				const screenY = handPoint.y * window.innerHeight;
				const mouseX = (screenX / window.innerWidth) * 2 - 1;
				const mouseY = -(screenY / window.innerHeight) * 2 + 1;

				const vector = new THREE.Vector3(mouseX, mouseY, 0.5);
				vector.unproject(camera);
				const dir = vector.sub(camera.position).normalize();
				const distance = -camera.position.z / dir.z;
				const pos = camera.position.clone().add(dir.multiplyScalar(distance));

				if (handedness === 'Right') {
					player.position.set(pos.x, pos.y, 0); // Sağ el player1
				} else if (handedness === 'Left') {
					player2.position.set(pos.x, pos.y, 0); // Sol el player2
				}
			}
		});
	}
}

function onFaceResults(results: FaceResults) {
	if (gameOver) return;

	if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
		const landmarks = results.multiFaceLandmarks[0];
		const upperLip = landmarks[13];
		const lowerLip = landmarks[14];

		const mouthOpen = Math.abs(upperLip.y - lowerLip.y) > 0.05;

		if (mouthOpen) {
			destroyAllEnemies(); // ağız açıksa düşmanları yok et
		}
	}
}

function destroyAllEnemies() {
	enemies.forEach(enemy => scene.remove(enemy));
	enemies.length = 0;
	score += 100; // bonus skor
	updateScoreDisplay();
}


function spawnEnemy() {
	if (gameOver) return;

	const enemyGeometry = new THREE.BoxGeometry(enemySize, enemySize, 0);
	const randomImagePath = enemyImagePaths[Math.floor(Math.random() * enemyImagePaths.length)];
	const enemyTexture = textureLoader.load(randomImagePath);
	const enemyMaterial = new THREE.MeshBasicMaterial({ map: enemyTexture, transparent: true, alphaTest: 0.5 }); // Şeffaflık için transparent: true ve alphaTest
	const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);

	// Rastgele kenar seç (0: üst, 1: alt, 2: sol, 3: sağ)
	const edge = Math.floor(Math.random() * 4);
	const worldHalfWidth = (window.innerWidth / window.innerHeight) * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
	const worldHalfHeight = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

	switch (edge) {
		case 0: // Üst
			enemy.position.set(THREE.MathUtils.randFloat(-worldHalfWidth, worldHalfWidth), worldHalfHeight + enemySize, 0);
			break;
		case 1: // Alt
			enemy.position.set(THREE.MathUtils.randFloat(-worldHalfWidth, worldHalfWidth), -worldHalfHeight - enemySize, 0);
			break;
		case 2: // Sol
			enemy.position.set(-worldHalfWidth - enemySize, THREE.MathUtils.randFloat(-worldHalfHeight, worldHalfHeight), 0);
			break;
		case 3: // Sağ
			enemy.position.set(worldHalfWidth + enemySize, THREE.MathUtils.randFloat(-worldHalfHeight, worldHalfHeight), 0);
			break;
	}
	enemies.push(enemy);
	scene.add(enemy);
}

function updateEnemies() {
	if (gameOver) return;

	for (let i = enemies.length - 1; i >= 0; i--) {
		const enemy = enemies[i];
		const direction = new THREE.Vector3().subVectors(princess.position, enemy.position).normalize();
		enemy.position.add(direction.multiplyScalar(enemySpeed));

		// Düşman prensese ulaştı mı?
		if (enemy.position.distanceTo(princess.position) < (princessSize / 2 + enemySize / 2) * 0.8) { // *0.8 çarpışmayı biraz daha kolaylaştırır
			gameOver = true;
			displayGameOverMessage();
			return; // Oyun bitti, diğer düşmanları kontrol etmeye gerek yok
		}

		// Oyuncu düşmanı yok etti mi?
		if (player.position.distanceTo(enemy.position) < (playerSize / 2 + enemySize / 2) * 0.8) {
			scene.remove(enemy);
			enemies.splice(i, 1);
			score += 50;
			updateScoreDisplay(); // Skoru ekranda göster
		}

		if (player2.position.distanceTo(enemy.position) < (playerSize / 2 + enemySize / 2) * 0.8) {
			scene.remove(enemy);
			enemies.splice(i, 1);
			score += 50;
			updateScoreDisplay();
		}
	}
}

function displayGameOverMessage() {
	const messageDiv = document.createElement('div');
	messageDiv.id = 'gameOverMessage';
	messageDiv.style.position = 'absolute';
	messageDiv.style.top = '50%';
	messageDiv.style.left = '50%';
	messageDiv.style.transform = 'translate(-50%, -50%)';
	messageDiv.style.color = 'white';
	messageDiv.style.fontSize = '24px';
	messageDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
	messageDiv.style.padding = '20px';
	messageDiv.style.borderRadius = '10px';
	messageDiv.style.textAlign = 'center';
	messageDiv.innerHTML = 'Prensesi koruyamadın! <br> Tekrar oynamak ister misin?';

	const restartButton = document.createElement('button');
	restartButton.innerText = 'Tekrar Oyna';
	restartButton.style.marginTop = '10px';
	restartButton.style.padding = '10px 20px';
	restartButton.style.fontSize = '18px';
	restartButton.style.cursor = 'pointer';
	restartButton.onclick = () => window.location.reload(); // Sayfayı yeniden yükleyerek oyunu başlat

	messageDiv.appendChild(restartButton);
	document.getElementById('app')?.appendChild(messageDiv);
}

function updateScoreDisplay() {
	if (scoreDisplayElement) {
		scoreDisplayElement.innerText = `Skor: ${score}`;
	}
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
	requestAnimationFrame(animate);

	if (!gameOver && cameraReady && gameStarted) {
		const currentTime = Date.now();

		// Prensesin hedefini değiştir
		if (currentTime - lastPrincessChangeTime > princessChangeInterval) {
			princessTarget = getRandomPositionInView();
			lastPrincessChangeTime = currentTime;
		}
		// Prensesin konumunu güncelle
		const direction = new THREE.Vector3().subVectors(princessTarget, princess.position).normalize();
		const distance = princess.position.distanceTo(princessTarget);
		if (distance > 0.05) {
			princess.position.add(direction.multiplyScalar(princessSpeed));
		}

		if (currentTime - lastEnemySpawnTime > enemySpawnInterval) {
			spawnEnemy();
			lastEnemySpawnTime = currentTime;
		}
		updateEnemies();
	}

	renderer.render(scene, camera);
}

function getRandomPositionInView(): THREE.Vector3 {
	const halfW = (window.innerWidth / window.innerHeight) * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
	const halfH = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

	const x = THREE.MathUtils.randFloat(-halfW + princessSize, halfW - princessSize);
	const y = THREE.MathUtils.randFloat(-halfH + princessSize, halfH - princessSize);

	return new THREE.Vector3(x, y, 0);
}

function showLoadingMessage() {
	const loadingDiv = document.createElement('div');
	loadingDiv.id = 'loadingMessage';
	loadingDiv.innerText = 'Kamera başlatılıyor...';
	loadingDiv.style.position = 'absolute';
	loadingDiv.style.top = '50%';
	loadingDiv.style.left = '50%';
	loadingDiv.style.transform = 'translate(-50%, -50%)';
	loadingDiv.style.color = 'white';
	loadingDiv.style.fontSize = '24px';
	document.body.appendChild(loadingDiv);
}

function showStartButton() {
	const button = document.createElement('button');
	button.id = 'startButton';
	button.innerText = 'Oyunu Başlat';
	button.style.position = 'absolute';
	button.style.top = '60%';
	button.style.left = '50%';
	button.style.transform = 'translate(-50%, -50%)';
	button.style.padding = '15px 30px';
	button.style.fontSize = '20px';
	button.style.cursor = 'pointer';

	button.onclick = () => {
		gameStarted = true;
		lastEnemySpawnTime = Date.now();
		button.remove();
		document.getElementById('loadingMessage')?.remove();
	};

	document.body.appendChild(button);
}



init();