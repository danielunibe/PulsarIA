# Pulsaria — Frontend Web Dockerfile
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy package manifests and production artifacts
COPY package*.json ./
COPY out ./out
COPY server.js ./server.js

# Install lightweight dependencies for healthcheck
RUN apk add --no-cache curl wget

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=10s \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
