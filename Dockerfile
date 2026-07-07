# ============================================================
#  p2k-music.ca — production image (zero npm dependencies)
#  Build:  docker build -t p2k-music .
#  Run:    docker run -p 8123:8123 -v p2k-data:/data --env-file server/.env p2k-music
# ============================================================
FROM node:22-alpine

WORKDIR /app
COPY . .

# SQLite + runtime state live on the mounted volume, never in the container layer.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8123 \
    DATA_DIR=/data

RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8123

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8123/api/health || exit 1

CMD ["node", "server/server.js"]
