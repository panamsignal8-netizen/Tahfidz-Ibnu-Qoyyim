const express = require('express');
const router = express.Router();
const { dbPromise } = require('../database');
const multer = require('multer');
const path = require('path');

// Middleware: Check if user is siswa
const isSiswa = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'siswa') {
    return res.status(403).json({ error: 'Akses ditolak. Hanya siswa yang dapat akses.' });
  }
  next();
};

// Multer for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads/audio'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// GET: Data diri siswa
router.get('/profile', isSiswa, async (req, res) => {
  try {
    const siswa = await dbPromise.get(
      'SELECT u.id, u.username, u.nama, u.email, k.nama as kelas FROM users u LEFT JOIN kelas k ON u.kelas_id = k.id WHERE u.id = ?',
      [req.session.user.id]
    );

    res.json(siswa);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Daftar surah
router.get('/surah', isSiswa, async (req, res) => {
  try {
    const surah = await dbPromise.all(
      'SELECT id, no_surah, nama_surah, jumlah_ayat, tempat_turun FROM surah ORDER BY no_surah'
    );

    res.json(surah);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Setor hafalan (upload audio)
router.post('/hafalan', isSiswa, upload.single('audio'), async (req, res) => {
  try {
    const { surah_id, dari_ayat, sampai_ayat } = req.body;

    if (!surah_id || !dari_ayat || !sampai_ayat || !req.file) {
      return res.status(400).json({ error: 'Semua field harus diisi dan file audio harus dilampirkan' });
    }

    const audioPath = `/uploads/audio/${req.file.filename}`;

    await dbPromise.run(
      `INSERT INTO hafalan (siswa_id, surah_id, dari_ayat, sampai_ayat, audio_path, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.user.id, surah_id, dari_ayat, sampai_ayat, audioPath, 'menunggu_periksa']
    );

    res.json({ success: true, message: 'Hafalan berhasil disetor', audio_path: audioPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Riwayat hafalan siswa
router.get('/hafalan', isSiswa, async (req, res) => {
  try {
    const hafalan = await dbPromise.all(
      `SELECT h.id, s.nama_surah, h.dari_ayat, h.sampai_ayat, h.status, h.tanggal_setor, h.nilai_guru, h.catatan_guru
       FROM hafalan h
       JOIN surah s ON h.surah_id = s.id
       WHERE h.siswa_id = ?
       ORDER BY h.tanggal_setor DESC`,
      [req.session.user.id]
    );

    res.json(hafalan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Absensi siswa
router.get('/absensi', isSiswa, async (req, res) => {
  try {
    const absensi = await dbPromise.all(
      `SELECT tanggal, status FROM absensi WHERE siswa_id = ? ORDER BY tanggal DESC LIMIT 30`,
      [req.session.user.id]
    );

    res.json(absensi);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Absen dengan barcode/QR code
router.post('/absensi', isSiswa, async (req, res) => {
  try {
    const { kode_barcode } = req.body;

    if (!kode_barcode) {
      return res.status(400).json({ error: 'Kode barcode harus diisi' });
    }

    // Verifikasi kode barcode (bisa disesuaikan dengan logika bisnis)
    const siswa = await dbPromise.get(
      'SELECT kelas_id FROM users WHERE id = ?',
      [req.session.user.id]
    );

    if (!siswa.kelas_id) {
      return res.status(400).json({ error: 'Siswa belum ditugaskan ke kelas' });
    }

    // Check if already absent today
    const hari_ini = new Date().toISOString().split('T')[0];
    const sudahAbsen = await dbPromise.get(
      'SELECT id FROM absensi WHERE siswa_id = ? AND DATE(tanggal) = ?',
      [req.session.user.id, hari_ini]
    );

    if (sudahAbsen) {
      return res.status(400).json({ error: 'Anda sudah absen hari ini' });
    }

    await dbPromise.run(
      `INSERT INTO absensi (siswa_id, kelas_id, tanggal, status)
       VALUES (?, ?, CURRENT_DATE, ?)`,
      [req.session.user.id, siswa.kelas_id, 'hadir']
    );

    res.json({ success: true, message: 'Absensi berhasil dicatat' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Progress hafalan siswa
router.get('/progress', isSiswa, async (req, res) => {
  try {
    const totalHafalan = await dbPromise.get(
      'SELECT COUNT(*) as total FROM hafalan WHERE siswa_id = ?',
      [req.session.user.id]
    );

    const hafalanLulus = await dbPromise.get(
      'SELECT COUNT(*) as total FROM hafalan WHERE siswa_id = ? AND status = ?',
      [req.session.user.id, 'lulus']
    );

    const nilaiRata = await dbPromise.get(
      'SELECT AVG(nilai_guru) as rata_rata FROM hafalan WHERE siswa_id = ? AND nilai_guru IS NOT NULL',
      [req.session.user.id]
    );

    res.json({
      total_hafalan: totalHafalan.total,
      hafalan_lulus: hafalanLulus.total,
      rata_rata_nilai: nilaiRata.rata_rata || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Nilai siswa
router.get('/nilai', isSiswa, async (req, res) => {
  try {
    const nilai = await dbPromise.get(
      'SELECT nilai_hafalan, nilai_ujian, nilai_akhir, semester FROM nilai WHERE siswa_id = ?',
      [req.session.user.id]
    );

    res.json(nilai || { nilai_hafalan: 0, nilai_ujian: 0, nilai_akhir: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Ikut ujian (upload audio jawaban)
router.post('/ujian/:ujian_id', isSiswa, upload.single('audio'), async (req, res) => {
  try {
    const ujian_id = req.params.ujian_id;

    if (!req.file) {
      return res.status(400).json({ error: 'File audio harus dilampirkan' });
    }

    const audioPath = `/uploads/audio/${req.file.filename}`;

    await dbPromise.run(
      `INSERT INTO hasil_ujian (ujian_id, siswa_id, audio_path, status)
       VALUES (?, ?, ?, ?)`,
      [ujian_id, req.session.user.id, audioPath, 'belum_dinilai']
    );

    res.json({ success: true, message: 'Jawaban ujian berhasil dikirim' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
