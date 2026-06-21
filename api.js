// ==========================================================================
// api.js
// Defines the global API_BASE constant used by all BELTON IPQC frontend
// pages (index.html, dispensing.html, laser.html, push_out_force.html,
// damper_install.html) to talk to the Node.js/Express backend (server.js).
//
// Backend default port: 3001 (see index.html "à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸§à¹ˆà¸² Server à¸à¸³à¸¥à¸±à¸‡à¸£à¸±à¸™à¸­à¸¢à¸¹à¹ˆà¸—à¸µà¹ˆ localhost:3001")
//
// Behaviour:
//   - If the frontend is served from the SAME host/port as the API
//     (e.g. Express also serves these static files on :3001), API_BASE
//     is just '' so requests go to the current origin (e.g. /api/...).
//   - If the frontend is opened directly as a file or from a different
//     port (e.g. Live Server on :5500), API_BASE falls back to
//     http://<hostname>:3001 so requests still reach the backend.
//
// To force a specific backend URL (e.g. on a shared/production server),
// just hardcode the value below, e.g.:
//     const API_BASE = 'http://192.168.1.50:3001';
// ==========================================================================

const API_BASE = (function () {
  try {
    const { protocol, hostname, port } = window.location;

    // Backend's own port
    const BACKEND_PORT = '3001';

    // Served directly by the backend (same port) -> use relative paths
    if (port === BACKEND_PORT) {
      return '';
    }

    // Opened via file:// or any other port/dev-server -> point at backend
    const host = hostname || 'localhost';
    return `${protocol === 'file:' ? 'http:' : protocol}//${host}:${BACKEND_PORT}`;
  } catch (e) {
    return 'http://localhost:3001';
  }
})();
const BACKEND_URL = API_BASE;

