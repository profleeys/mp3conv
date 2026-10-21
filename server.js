const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');

// ─── 1. Determine FFMPEG & FFPROBE Paths ──────────────────────────────────────
function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  // Try system ffmpeg
  try {
    const cmd = process.platform === 'win32' ? 'where.exe ffmpeg' : 'which ffmpeg';
    const sysPath = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
    if (sysPath && fs.existsSync(sysPath)) return sysPath;
  } catch (e) {}

  // Fallback to @ffmpeg-installer
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer && installer.path && fs.existsSync(installer.path)) {
      return installer.path;
    }
  } catch (e) {}

  // Common Windows location
  if (process.platform === 'win32' && fs.existsSync('C:\\Tools\\ffmpeg\\bin\\ffmpeg.exe')) {
    return 'C:\\Tools\\ffmpeg\\bin\\ffmpeg.exe';
  }

  return 'ffmpeg';
}

function resolveFfprobe() {
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    return process.env.FFPROBE_PATH;
  }
  try {
    const cmd = process.platform === 'win32' ? 'where.exe ffprobe' : 'which ffprobe';
    const sysPath = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
    if (sysPath && fs.existsSync(sysPath)) return sysPath;
  } catch (e) {}

  try {
    const installer = require('@ffprobe-installer/ffprobe');
    if (installer && installer.path && fs.existsSync(installer.path)) {
      return installer.path;
    }
  } catch (e) {}

  if (process.platform === 'win32' && fs.existsSync('C:\\Tools\\ffmpeg\\bin\\ffprobe.exe')) {
    return 'C:\\Tools\\ffmpeg\\bin\\ffprobe.exe';
  }

  return 'ffprobe';
}

const FFMPEG_PATH = resolveFfmpeg();
const FFPROBE_PATH = resolveFfprobe();
console.log(`[FFmpeg] Using: ${FFMPEG_PATH}`);
console.log(`[FFprobe] Using: ${FFPROBE_PATH}`);
ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

// ─── 2. Determine yt-dlp Path ─────────────────────────────────────────────────
function resolveYtDlp() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }

  const isWin = process.platform === 'win32';
  const localBin = path.join(__dirname, 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(localBin)) return localBin;

  // System PATH
  try {
    const cmd = isWin ? 'where.exe yt-dlp' : 'which yt-dlp';
    const sysPath = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
    if (sysPath && fs.existsSync(sysPath)) return sysPath;
  } catch (e) {}

  // Common locations
  if (isWin && fs.existsSync('C:\\Tools\\yt-dlp\\yt-dlp.exe')) {
    return 'C:\\Tools\\yt-dlp\\yt-dlp.exe';
  }
  if (!isWin && fs.existsSync('/usr/local/bin/yt-dlp')) {
    return '/usr/local/bin/yt-dlp';
  }
  if (!isWin && fs.existsSync('/usr/bin/yt-dlp')) {
    return '/usr/bin/yt-dlp';
  }

  return isWin ? 'yt-dlp.exe' : 'yt-dlp';
}

let YTDLP_PATH = resolveYtDlp();
console.log(`[yt-dlp] Using: ${YTDLP_PATH}`);

// ─── 3. Directories & Express Setup ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const app = express();

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
[UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer storage
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// ─── Helper: Convert with FFmpeg ──────────────────────────────────────────────
function convertToMp3(inputPath, outputPath, startSec, endSec) {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioFrequency(44100);

    const hasStart = startSec != null && !isNaN(startSec) && startSec >= 0;
    const hasEnd = endSec != null && !isNaN(endSec) && endSec > 0;

    if (hasStart) {
      cmd = cmd.setStartTime(startSec);
    }
    if (hasEnd) {
      const dur = hasStart ? endSec - startSec : endSec;
      if (dur > 0) {
        cmd = cmd.setDuration(dur);
      }
    }

    cmd
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// ─── Helper: Probe duration ───────────────────────────────────────────────────
function probeDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = (metadata && metadata.format && metadata.format.duration) ? metadata.format.duration : 0;
      resolve(duration);
    });
  });
}

// ─── Route: Health Check for Render ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    ffmpeg: FFMPEG_PATH,
    ytdlp: YTDLP_PATH
  });
});

// ─── Route: Upload File ───────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未接收到任何檔案' });
    }

    let originalName = req.file.originalname;
    try {
      // Fix multer latin1 filename encoding for CJK characters
      originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    } catch (e) {}

    let duration = 0;
    try {
      duration = await probeDuration(req.file.path);
    } catch (probeErr) {
      console.warn('[Probe Warning]', probeErr.message);
    }

    res.json({
      fileId: path.basename(req.file.path),
      originalName,
      duration: Math.floor(duration)
    });
  } catch (err) {
    console.error('[Upload Error]', err);
    res.status(500).json({ error: '檔案處理失敗: ' + err.message });
  }
});

// ─── Route: Fetch YouTube Info ────────────────────────────────────────────────
app.post('/api/youtube-info', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: '請提供有效的 YouTube 連結' });
  }

  try {
    const info = await new Promise((resolve, reject) => {
      const proc = spawn(YTDLP_PATH, [
        '--dump-single-json',
        '--no-playlist',
        '--no-check-certificates',
        '--force-ipv4',
        '--extractor-args', 'youtube:player_client=ios,android,web',
        url
      ]);

      const stdoutChunks = [];
      const stderrChunks = [];

      proc.stdout.on('data', d => stdoutChunks.push(d));
      proc.stderr.on('data', d => stderrChunks.push(d));

      proc.on('close', code => {
        if (code !== 0) {
          const errMsg = Buffer.concat(stderrChunks).toString() || `yt-dlp exited with code ${code}`;
          return reject(new Error(errMsg));
        }
        try {
          const raw = Buffer.concat(stdoutChunks).toString();
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } catch (e) {
          reject(new Error('無法解析 YouTube 影片資訊：' + e.message));
        }
      });

      proc.on('error', err => reject(err));
    });

    res.json({
      title: info.title || 'YouTube 影片',
      duration: Math.floor(info.duration || 0),
      thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[0].url : ''),
      uploader: info.uploader || info.channel || '',
      id: info.id || '',
      url
    });
  } catch (err) {
    console.error('[YouTube Info Error]', err);
    res.status(500).json({
      error: '無法取得 YouTube 影片資訊，請確認網址正確或 YouTube 是否限制訪問。\n' + err.message
    });
  }
});

// ─── Route: Convert & Download MP3 ────────────────────────────────────────────
app.post('/api/convert', async (req, res) => {
  const { type, fileId, url, startSec, endSec, title } = req.body;

  if (type !== 'file' && type !== 'youtube') {
    return res.status(400).json({ error: '無效的來源類型 (必須為 file 或 youtube)' });
  }

  const jobId = uuidv4();
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp3`);
  let tempAudioPath = null;

  try {
    if (type === 'file') {
      if (!fileId) return res.status(400).json({ error: '缺少檔案識別碼 (fileId)' });
      const inputPath = path.join(UPLOAD_DIR, path.basename(fileId));
      if (!fs.existsSync(inputPath)) {
        return res.status(404).json({ error: '找不到伺服器上的來源檔案' });
      }

      await convertToMp3(inputPath, outputPath, startSec, endSec);
    } else {
      // YouTube conversion
      if (!url) return res.status(400).json({ error: '缺少 YouTube 網址' });

      const templatePath = path.join(UPLOAD_DIR, `${jobId}.%(ext)s`);

      await new Promise((resolve, reject) => {
        const proc = spawn(YTDLP_PATH, [
          url,
          '-f', 'bestaudio/best',
          '-o', templatePath,
          '--no-playlist',
          '--no-check-certificates',
          '--force-ipv4',
          '--extractor-args', 'youtube:player_client=ios,android,web'
        ]);

        const errChunks = [];
        proc.stderr.on('data', d => errChunks.push(d));

        proc.on('close', code => {
          if (code !== 0) {
            const errStr = Buffer.concat(errChunks).toString();
            return reject(new Error(errStr || `yt-dlp exited with code ${code}`));
          }
          resolve();
        });

        proc.on('error', reject);
      });

      // Find the downloaded audio file
      const matchingFiles = fs.readdirSync(UPLOAD_DIR).filter(f => f.startsWith(jobId));
      if (!matchingFiles.length) {
        throw new Error('yt-dlp 下載未產生任何音訊檔案');
      }
      tempAudioPath = path.join(UPLOAD_DIR, matchingFiles[0]);

      await convertToMp3(tempAudioPath, outputPath, startSec, endSec);

      // Clean up temporary downloaded audio
      fs.unlink(tempAudioPath, () => {});
      tempAudioPath = null;
    }

    // Stream MP3 back to browser
    const cleanTitle = (title || 'audio')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim() || 'converted_audio';

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(cleanTitle)}.mp3`);
    res.setHeader('Content-Type', 'audio/mpeg');

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);

    stream.on('end', () => {
      // Remove output file after download starts/completes
      fs.unlink(outputPath, () => {});
    });

    stream.on('error', (err) => {
      console.error('[Stream Error]', err);
      if (fs.existsSync(outputPath)) fs.unlink(outputPath, () => {});
    });

  } catch (err) {
    console.error('[Convert Error]', err);
    if (tempAudioPath && fs.existsSync(tempAudioPath)) fs.unlink(tempAudioPath, () => {});
    if (fs.existsSync(outputPath)) fs.unlink(outputPath, () => {});
    res.status(500).json({ error: '轉換失敗: ' + err.message });
  }
});

// ─── Periodic Cleanup: remove files older than 20 mins ────────────────────────
setInterval(() => {
  const maxAgeMs = 20 * 60 * 1000;
  [UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
    fs.readdir(dir, (err, files) => {
      if (err) return;
      const now = Date.now();
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        fs.stat(fullPath, (sErr, stat) => {
          if (!sErr && (now - stat.mtimeMs > maxAgeMs)) {
            fs.unlink(fullPath, () => {});
          }
        });
      });
    });
  });
}, 10 * 60 * 1000);

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MP3 Converter 服務已啟動: http://0.0.0.0:${PORT}`);
});

