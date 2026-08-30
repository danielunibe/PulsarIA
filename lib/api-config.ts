/**
 * REST API Base URL for all frontend fallback requests.
 *
 * The Axum backend listens on port 8080 by default (configurable via
 * PULSAR_API_PORT env var). All frontend components that fall back to
 * REST when Tauri IPC is unavailable should use this constant.
 */
export const REST_API_BASE = 'http://127.0.0.1:8080/api/v1';
