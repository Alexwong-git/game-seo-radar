FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3002 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/radar.sqlite

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates sqlite3 tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY . .

RUN mkdir -p /app/data /app/logs /app/backups \
  && chmod +x /app/scripts/*.sh

EXPOSE 3002

CMD ["npm", "run", "start"]
