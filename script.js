// Konfigurasi & State
let myPeer;
let myStream;
let isHost = false;
let roomID = null;
let isMirrored = true; // Default kamera depan biasanya mirror
const dataConnections = []; 

// DOM Elements
const lobbyPanel = document.getElementById('lobby-panel');
const inviteSection = document.getElementById('invite-section');
const inviteLink = document.getElementById('invite-link');
const studioPanel = document.getElementById('studio-panel');
const videoGrid = document.getElementById('video-grid');
const resultPanel = document.getElementById('result-panel');
const finalImage = document.getElementById('final-image');
const btnSnap = document.getElementById('btn-snap');
const countdownEl = document.getElementById('countdown');
const flashOverlay = document.getElementById('flash-overlay');
const waitingMsg = document.getElementById('waiting-msg');
const btnMirror = document.getElementById('btn-mirror');
const btnRetake = document.getElementById('btn-retake');

// --- FITUR MIRROR ---
btnMirror.addEventListener('click', () => {
    isMirrored = !isMirrored;
    btnMirror.innerText = isMirrored ? '🪞 Mirror: ON' : '🪞 Mirror: OFF';
    
    // Terapkan efek CSS mirror ke semua tag video di layar
    document.querySelectorAll('video').forEach(vid => {
        vid.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
    });
});

const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');

if (roomParam) {
    roomID = roomParam;
    initKamera(() => joinRoom(roomID));
} else {
    document.getElementById('btn-create-room').addEventListener('click', () => {
        roomID = 'ldr-' + Math.random().toString(36).substr(2, 6);
        initKamera(() => createRoom(roomID));
    });
}

// 2. Akses Kamera (Minta mode Landscape 16:9 atau 4:3)
function initKamera(onSuccess) {
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            width: { ideal: 1280 }, // Memaksa format landscape
            height: { ideal: 720 },
            facingMode: "user" 
        }, 
        audio: false 
    })
    .then(stream => {
        myStream = stream;
        tampilkanVideo(stream, 'local');
        lobbyPanel.classList.add('hidden');
        studioPanel.classList.remove('hidden');
        onSuccess();
    })
    .catch(err => alert("Gagal akses kamera. Pastikan browser memberi izin! Error: " + err));
}

// 3. Menampilkan Video ke Grid HTML
function tampilkanVideo(stream, userId) {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    
    // CSS Class diubah agar berukuran Landscape (Mendatar)
    video.className = 'w-[320px] h-[240px] md:w-[480px] md:h-[360px] object-cover bg-black rounded-lg shadow-md border-4 border-white';
    video.id = `video-${userId}`;
    
    // Terapkan status mirror awal
    video.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
    
    if(userId === 'local') video.muted = true; 
    
    videoGrid.appendChild(video);
}

// 4. Logika Host
function createRoom(id) {
    isHost = true;
    myPeer = new Peer(id, { host: '0.peerjs.com', port: 443, path: '/' }); 

    myPeer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        alert('Gagal terhubung ke server koneksi: ' + err.type);
    });

    myPeer.on('open', (id) => {
        lobbyPanel.classList.remove('hidden'); 
        document.getElementById('setup-controls').classList.add('hidden');
        inviteSection.classList.remove('hidden');
        
        const link = window.location.href.split('?')[0] + '?room=' + id;
        inviteLink.value = link;
        btnSnap.classList.remove('hidden'); 
        btnRetake.classList.remove('hidden'); // Munculkan tombol retake untuk host
    });

    myPeer.on('call', (call) => {
        call.answer(myStream); 
        call.on('stream', (userVideoStream) => {
            if(!document.getElementById(`video-${call.peer}`)) {
                tampilkanVideo(userVideoStream, call.peer);
            }
        });
    });

    myPeer.on('connection', (conn) => {
        dataConnections.push(conn);
    });
}

// 5. Logika Guest
function joinRoom(id) {
    myPeer = new Peer({ host: '0.peerjs.com', port: 443, path: '/' });

    myPeer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        alert('Gagal bergabung ke room: ' + err.type);
    });
    
    myPeer.on('open', () => {
        waitingMsg.classList.remove('hidden'); 

        const call = myPeer.call(id, myStream);
        call.on('stream', (hostVideoStream) => {
            if(!document.getElementById(`video-${id}`)) {
                tampilkanVideo(hostVideoStream, id);
            }
        });

        const conn = myPeer.connect(id);
        conn.on('data', (data) => {
            if(data.type === 'START_COUNTDOWN') {
                jalankanAnimasiCountdown();
            } else if (data.type === 'PHOTO_RESULT') {
                tampilkanHasilFoto(data.image);
            } else if (data.type === 'RETAKE_PHOTO') {
                resetKeStudio();
            }
        });
    });
}

// 6. Tombol Jepret
btnSnap.addEventListener('click', () => {
    dataConnections.forEach(conn => conn.send({ type: 'START_COUNTDOWN' }));
    jalankanAnimasiCountdown(() => { ambilFotoDanGabung(); });
});

// 7. Animasi Hitung Mundur
function jalankanAnimasiCountdown(onComplete = null) {
    countdownEl.classList.remove('hidden');
    let count = 3;
    countdownEl.innerText = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.innerText = count;
        } else {
            clearInterval(interval);
            countdownEl.classList.add('hidden');
            efekFlash();
            if (onComplete) onComplete();
        }
    }, 1000);
}

function efekFlash() {
    flashOverlay.classList.remove('hidden');
    flashOverlay.classList.add('flash');
    setTimeout(() => {
        flashOverlay.classList.remove('flash');
        flashOverlay.classList.add('hidden');
    }, 500);
}

// 8. Image Processing (Stitching menggunakan Canvas untuk Landscape)
function ambilFotoDanGabung() {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    const videos = document.querySelectorAll('video');
    
    const padding = 20;
    // Ukuran disesuaikan untuk Landscape
    const videoWidth = 480;
    const videoHeight = 360; 
    
    canvas.width = videoWidth + (padding * 2);
    canvas.height = (videoHeight * videos.length) + (padding * (videos.length + 1)) + 80;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let currentY = padding;
    videos.forEach((vid) => {
        
        // Logika untuk membalik gambar (Mirror) saat dirender ke hasil Canvas
        if (isMirrored) {
            ctx.save(); // Simpan state canvas saat ini
            ctx.translate(padding + videoWidth, currentY); // Geser titik sumbu ke sisi kanan foto
            ctx.scale(-1, 1); // Balik sumbu X (Horizontal)
            ctx.drawImage(vid, 0, 0, videoWidth, videoHeight); // Gambar video yang sudah dibalik
            ctx.restore(); // Kembalikan sumbu canvas ke normal
        } else {
            // Gambar normal tanpa dibalik
            ctx.drawImage(vid, padding, currentY, videoWidth, videoHeight);
        }
        
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 2;
        ctx.strokeRect(padding, currentY, videoWidth, videoHeight);
        
        currentY += videoHeight + padding;
    });

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('LDR Photobooth 🤍', canvas.width / 2, canvas.height - 30);

    const photoDataUrl = canvas.toDataURL('image/png');
    tampilkanHasilFoto(photoDataUrl);

    dataConnections.forEach(conn => {
        conn.send({ type: 'PHOTO_RESULT', image: photoDataUrl });
    });
}

// 9. Tampilkan Hasil Akhir
function tampilkanHasilFoto(imageUrl) {
    studioPanel.classList.add('hidden'); 
    resultPanel.classList.remove('hidden');
    
    finalImage.src = imageUrl;
    document.getElementById('btn-download').href = imageUrl;
}

// 10. Fitur Foto Ulang (Retake)
btnRetake.addEventListener('click', () => {
    resetKeStudio();
    // Beritahu guest untuk kembali ke layar studio
    dataConnections.forEach(conn => {
        conn.send({ type: 'RETAKE_PHOTO' });
    });
});

function resetKeStudio() {
    resultPanel.classList.add('hidden');
    studioPanel.classList.remove('hidden');
}

// Utility: Copy Link
document.getElementById('btn-copy').addEventListener('click', () => {
    inviteLink.select();
    document.execCommand('copy');
    alert('Link disalin! Kirimkan ke pasangan/temanmu.');
});