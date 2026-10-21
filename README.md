# 🎵 MP3 音訊轉換與區間擷取工具 (MP3 Converter & Trimmer)

一個可以上傳多種影音檔案或輸入 YouTube 網址，將其轉檔為 MP3 並支援「自訂時間區間擷取」的 Web 應用程式。專為部署到 **Render.com** 設計，亦可在本機直接執行。

---

## ✨ 核心功能

1. 📂 **本地影音上傳**：
   - 支援 MP4, MP3, WAV, M4A, FLAC, MKV, MOV, WEBM, WMA 等格式（上限 500 MB）。
   - 內建瀏覽器端即時音訊試聽播放器。
2. ▶️ **YouTube 網址下載**：
   - 支援貼上 YouTube 影片/音樂連結，一鍵解析標題、長度、縮圖並支援內嵌預覽。
3. ✂️ **區間擷取 (剪輯功能)**：
   - 自由開關「區間擷取」功能。
   - 支援視覺化波形滑桿拖曳選取開始/結束時間。
   - 支援手動輸入精確時間（`分:秒` 或 `時:分:秒`）。
   - 上傳本地音檔時，可邊聽邊按「設為當前播放位置為開始/結束點」。
4. 🚀 **高品質 MP3 輸出**：
   - 透過 FFmpeg 轉碼為 192kbps、44.1kHz 立體聲 MP3。
   - 保留原中文/多國語言檔名，轉換完成自動觸發瀏覽器下載。
5. 🧹 **自動暫存清理**：
   - 伺服器每 10 分鐘自動清理超過 20 分鐘的暫存檔案，不佔用伺服器儲存空間。

---

## 🖥️ 本機測試與執行

### 前置需求
- **Node.js**（v18 以上，已相容 Node 20 / 22 / 24）
- **yt-dlp**（用於 YouTube 下載功能）：
  - 若為 Windows，確認 `yt-dlp.exe` 已在 PATH 中（或放入專案的 `bin/` 目錄中）。
  - 若已在 `C:\Tools\yt-dlp\yt-dlp.exe`，系統會自動辨識。

### 啟動步驟
```bash
# 1. 切換至專案目錄
cd mp3_download

# 2. 安裝套件
npm install

# 3. 啟動伺服器
node server.js
```
啟動後打開瀏覽器訪問：**http://localhost:3000**

---

## ☁️ 部署到 Render.com 完整教學

因為本應用程式需要 `FFmpeg` 與 `yt-dlp`，使用 **Docker 部署** 是 Render 上最穩定且免手動配置的方式（Render 免費方案即可使用 Docker）：

### 步驟 1：將專案推送到 GitHub
1. 在 GitHub 上建立一個新的儲存庫（Repository），例如 `mp3-converter`。
2. 在本地專案資料夾執行：
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Render deployment"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/<你的儲存庫>.git
   git push -u origin main
   ```

### 步驟 2：在 Render 建立 Web Service
1. 登入 [Render.com](https://render.com)。
2. 點擊右上角 **「New +」** → 選擇 **「Web Service」**。
3. 選擇 **「Build and deploy from a Git repository」**，連接你剛才推上去的 GitHub 儲存庫。
4. Render 會自動偵測到專案中的 `Dockerfile`：
   - **Name**：自行輸入服務名稱（例如 `my-mp3-converter`）
   - **Region**：建議選 **Singapore**（距離台灣最近，速度最快）
   - **Environment**：`Docker`（Render 會自動辨識）
   - **Instance Type**：`Free`
5. 點擊 **「Deploy Web Service」**。

> 💡 **自動構建**：Render 會使用 `Dockerfile` 自動安裝 Debian Linux、最新版 FFmpeg、Python3、最新版 yt-dlp 以及 Node.js 依賴，約 2~3 分鐘後即可產生專屬的網址（例如 `https://my-mp3-converter.onrender.com`）！

---

## 📁 專案目錄結構

```text
mp3_download/
├── public/
│   └── index.html       # 響應式現代前端介面（深色主題、時間軸滑桿、試聽預覽）
├── Dockerfile           # Render 容器化構建檔（含 ffmpeg, python3, yt-dlp）
├── .dockerignore        # Docker 忽略清單
├── render.yaml          # Render 藍圖配置檔
├── server.js            # Express 後端 API（檔案處理、FFmpeg 剪輯轉碼、yt-dlp 下載）
├── package.json         # 專案相依性配置
└── README.md            # 專案說明文件
```

