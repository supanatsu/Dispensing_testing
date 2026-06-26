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

// ==========================================================================
// Config DB Sync
// Hydrate localStorage from MySQL synchronously so that when scripts load, 
// they immediately get the latest config, satisfying the requirement to persist.
// ==========================================================================
(function syncLocalStorageWithDB() {
  try {
    const xhr = new XMLHttpRequest();
    // Synchronous request to guarantee local storage is hydrated before other scripts run
    // Using BACKEND_URL fallback if API_BASE is empty for file:// execution
    const fetchUrl = (API_BASE || 'http://localhost:3001') + '/api/system/config';
    xhr.open('GET', fetchUrl, false);
    xhr.send(null);
    if (xhr.status === 200) {
      const dbConfigs = JSON.parse(xhr.responseText);
      for (const [key, value] of Object.entries(dbConfigs)) {
        if (value && value !== 'undefined') {
          if (localStorage.getItem(key) !== value) {
            localStorage.setItem(key, value);
          }
        }
      }
      console.log('Configs synced from DB synchronously successfully.');
    }
  } catch (err) {
    console.warn('Failed to sync configs from DB on load:', err);
  }

  // Intercept localStorage.setItem to also save configs back to MySQL
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key, value) {
    originalSetItem.apply(this, arguments);

    // Sync config and alert keys automatically
    const syncKeys = [
      'belton_ipqc_dispensing_merged',
      'belton_laser_config_v1',
      'belton_pof_config_v1',
      'belton_damper_config_v1',
      'belton_pof_v4_config',
      'belton_damper_v2_config',
      'LASER_CONFIG'
    ];
    if (syncKeys.includes(key) || key.includes('config') || key.includes('cfg')) {
      // Don't block the UI thread for saving
      const postUrl = (API_BASE || 'http://localhost:3001') + '/api/system/config';
      try {
        fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value })
        }).catch(err => console.warn('Failed to save config to DB:', err));
      } catch (e) {
        console.warn('Fetch failed for config save:', e);
      }
    }
  };
})();
