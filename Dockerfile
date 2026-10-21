FROM node:20-bookworm-slim

# 安裝 ffmpeg, python3 與 curl (yt-dlp 執行依賴 python3 與 ffmpeg)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        curl \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# 安裝最新版 yt-dlp 執行檔
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# 複製依賴宣告並安裝
COPY package*.json ./
RUN npm install --omit=dev

# 複製應用程式程式碼
COPY . .

# 建立暫存目錄
RUN mkdir -p uploads outputs

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]

