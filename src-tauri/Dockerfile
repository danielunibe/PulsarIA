# ─────────────────────────────────────────────────────────────
# Dockerfile — Pulsaria Engine (Multi-Stage Build)
# Sprint 4, Fase 22
# ─────────────────────────────────────────────────────────────

# Etapa 1: Build (Rust toolchain completo)
FROM rust:1.77-slim-bookworm AS builder

WORKDIR /app

# Instalar dependencias del sistema (necesario para compilar ORT y redis-rs)
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libsqlite3-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Cache de dependencias primero (aprovecha Docker layer cache)
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo "fn main() {}" > src/main.rs
RUN cargo build --release --bin tiktok-processor 2>/dev/null || true
RUN rm -rf src

# Build real
COPY src/ ./src/
COPY build.rs ./
RUN cargo build --release --bin tiktok-processor

# ─────────────────────────────────────────────────────────────
# Etapa 2: Runtime mínimo (sin Rust toolchain)
FROM debian:bookworm-slim AS runtime

WORKDIR /app

# Solo las libs en runtime que necesita el binario
RUN apt-get update && apt-get install -y \
    libssl3 \
    libsqlite3-0 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de datos persistentes
RUN mkdir -p /app/data

# Copiar solo el binario compilado
COPY --from=builder /app/target/release/tiktok-processor /app/pulsar-engine

# Usuario no-root para seguridad
RUN useradd -ms /bin/bash pulsar
RUN chown -R pulsar:pulsar /app
USER pulsar

EXPOSE 8080 9091

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/health || exit 1

ENTRYPOINT ["/app/pulsar-engine"]
