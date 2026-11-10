// Konfigurasi & State
let myPeer;
let myStream;
let isHost = false;
let roomID = null;
const peers = {}; // Menyimpan koneksi media (video)
const dataConnections = []; // Menyimpan koneksi data (pesan/gambar)

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

// 1. Cek apakah di URL ada ?room=xxx
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');

if (roomParam) {
    // Sebagai Guest
    roomID = roomParam;
    initKamera(() => joinRoom(roomID));
} else {
    // Sebagai Host (belum bikin room)
    document.getElementById('btn-create-room').addEventListener('click', () => {
        roomID = 'ldr-' + Math.random().toString(36).substr(2, 6);
        initKamera(() => createRoom(roomID));
    });
}

// 2. Akses Kamera
function initKamera(onSuccess) {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
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
    video.className = 'w-48 h-64 md:w-64 md:h-80 object-cover bg-black rounded-lg shadow-md border-4 border-white';
    video.id = `video-${userId}`;
    
    // Mute video sendiri agar tidak echo
    if(userId === 'local') video.muted = true; 
    
    videoGrid.appendChild(video);
}

// 4. Logika Host (Membuat Room)
function createRoom(id) {
    isHost = true;
    myPeer = new Peer(id); // Daftarkan ID unik ke PeerJS Server

    myPeer.on('open', (id) => {
        lobbyPanel.classList.remove('hidden'); // Tampilkan lagi panel lobby sebentar
        document.getElementById('setup-controls').classList.add('hidden');
        inviteSection.classList.remove('hidden');
        
        // Buat link invite berdasarkan URL saat ini
        const link = window.location.href.split('?')[0] + '?room=' + id;
        inviteLink.value = link;
        btnSnap.classList.remove('hidden'); // Munculkan tombol jepret untuk host
    });

    // Menerima panggilan video dari Guest
    myPeer.on('call', (call) => {
        call.answer(myStream); // Jawab dengan kamera Host
        call.on('stream', (userVideoStream) => {
            if(!document.getElementById(`video-${call.peer}`)) {
                tampilkanVideo(userVideoStream, call.peer);
            }
        });
    });

    // Menerima koneksi data (untuk ngirim aba-aba & foto hasil)
    myPeer.on('connection', (conn) => {
        dataConnections.push(conn);
    });
}

// 5. Logika Guest (Join Room)
function joinRoom(id) {
    myPeer = new Peer();
    
    myPeer.on('open', () => {
        waitingMsg.classList.remove('hidden'); // Guest nunggu host ngeklik tombol

        // A. Panggil Host untuk tukeran video
        const call = myPeer.call(id, myStream);
        call.on('stream', (hostVideoStream) => {
            if(!document.getElementById(`video-${id}`)) {
                tampilkanVideo(hostVideoStream, id);
            }
        });

        // B. Buka jalur data untuk terima foto dari Host
        const conn = myPeer.connect(id);
        conn.on('data', (data) => {
            if(data.type === 'START_COUNTDOWN') {
                jalankanAnimasiCountdown();
            } else if (data.type === 'PHOTO_RESULT') {
                tampilkanHasilFoto(data.image);
            }
        });
    });
}

// 6. Tombol Jepret (Hanya Host)
btnSnap.addEventListener('click', () => {
    // Beritahu semua Guest kalau hitung mundur dimulai
    dataConnections.forEach(conn => conn.send({ type: 'START_COUNTDOWN' }));
    
    // Jalankan timer di layar Host sendiri
    jalankanAnimasiCountdown(() => {
        ambilFotoDanGabung(); // Ambil foto pas angka 0
    });
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

// 8. Image Processing (Stitching menggunakan Canvas) - Dijalankan Host
function ambilFotoDanGabung() {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    // Ambil semua elemen video yang sedang tayang di grid
    const videos = document.querySelectorAll('video');
    
    // Set ukuran photostrip (Gaya vertikal, panjang ke bawah)
    const padding = 20;
    const videoWidth = 400;
    const videoHeight = 300;
    
    canvas.width = videoWidth + (padding * 2);
    canvas.height = (videoHeight * videos.length) + (padding * (videos.length + 1)) + 80; // +80 untuk area teks bawah

    // Background Putih (Kertas Polaroid)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Loop semua video dan "cetak" ke canvas
    let currentY = padding;
    videos.forEach((vid) => {
        ctx.drawImage(vid, padding, currentY, videoWidth, videoHeight);
        
        // Kasih border/outline halus di tiap foto
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 2;
        ctx.strokeRect(padding, currentY, videoWidth, videoHeight);
        
        currentY += videoHeight + padding;
    });

    // Tambahkan teks di bagian bawah
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('LDR Photobooth 🤍', canvas.width / 2, canvas.height - 30);

    // Convert Canvas jadi Base64 Image
    const photoDataUrl = canvas.toDataURL('image/png');

    // Tampilkan di Host
    tampilkanHasilFoto(photoDataUrl);

    // Kirim gambar jadi ke semua Guest
    dataConnections.forEach(conn => {
        conn.send({ type: 'PHOTO_RESULT', image: photoDataUrl });
    });
}

// 9. Tampilkan Hasil Akhir
function tampilkanHasilFoto(imageUrl) {
    studioPanel.classList.add('hidden'); // Sembunyikan kamera
    resultPanel.classList.remove('hidden');
    
    finalImage.src = imageUrl;
    document.getElementById('btn-download').href = imageUrl;
}

// Utility: Copy Link
document.getElementById('btn-copy').addEventListener('click', () => {
    inviteLink.select();
    document.execCommand('copy');
    alert('Link disalin! Kirimkan ke pasangan/temanmu.');
});