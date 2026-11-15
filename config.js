/* IntelliTwin configuration.
 *
 * Edit this file to connect real systems. Every value has a working default, so the app runs
 * without changes. Anything left as null uses the built-in synthetic data, and the app labels
 * that data as synthetic on screen. See docs/configuration.md.
 *
 * This file is served to every visitor. Never put passwords, API keys or tokens in it.
 */
window.INTELLITWIN_CONFIG = {
  /* ---- Base map ---------------------------------------------------------------------------- */
  map: {
    // MapLibre style URL for the vector base map. Use a licensed or self-hosted style in production.
    styleUrl: 'https://tiles.openfreemap.org/styles/dark',
    // Raster tiles used if the vector style cannot be loaded.
    rasterTiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    rasterAttribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    buildings3d: true
  },

  /* ---- Time ---------------------------------------------------------------------------------- */
  time: {
    timeZone: 'Asia/Dubai',
    weekendDays: [6, 0],        // Saturday and Sunday (0 = Sunday)
    shortDay: 5                 // Friday: shorter working day
  },

  /* ---- Feeds --------------------------------------------------------------------------------- */
  feeds: {
    // Live and historical traffic. 'synthetic' builds a 24-hour day from the simulated traffic states.
    // A real feed is an integration point, not implemented yet: see docs/configuration.md.
    traffic: 'synthetic',
    // URL returning accidents as JSON: [{ "time": "08:15", "lon": 54.37, "lat": 24.47, "road": "…",
    // "severity": "Damage only", "durationMin": 30 }]. null = illustrative accidents.
    accidentsUrl: null
  },

  /* ---- Field devices ------------------------------------------------------------------------- */
  devices: {
    // Leave a list empty to have the app place synthetic devices on the busiest roads.
    // CCTV camera: { id, name, lon, lat, stream }. "stream" may be an .mp4/.webm file, an HLS .m3u8
    // playlist, or "iframe:https://…" for an embeddable player. Without a stream the camera shows a
    // synthetic view drawn from the simulated traffic at that location.
    cameras: [],
    syntheticCameras: 40,
    syntheticDetectors: 80,
    syntheticSigns: 15,
    // Script that adds HLS playback to browsers without native support (for example a hosted hls.js).
    hlsScript: null,
    signalCycleSeconds: 90
  },

  /* ---- Alerts -------------------------------------------------------------------------------- */
  alerts: {
    networkSpeedBelowKmh: 40,        // network average speed
    roadRatioBelow: 0.3,             // road speed as a share of its limit …
    roadMinVehicles: 150,            // … with at least this many vehicles on it
    seriousAccident: true,
    maxShown: 12
  },

  /* ---- Forecast ------------------------------------------------------------------------------ */
  forecast: { horizonsMin: [15, 30, 60] },

  /* ---- What-if closure (estimated in the browser, not re-simulated) --------------------------- */
  closure: { radiusM: 1500, speedLoss: 0.4, extraVehicles: 0.3 },

  /* ---- Sign-in ------------------------------------------------------------------------------- */
  // Demo sign-in only: the role is chosen in the browser, so it is NOT a security control.
  // Put the app behind real authentication (SSO or a reverse proxy) for anything beyond a demo.
  auth: {
    enabled: true,
    roles: {
      admin: { label: 'Administrator', can: ['whatif', 'export', 'audit', 'settings', 'video'] },
      operator: { label: 'Operator', can: ['whatif', 'export', 'video'] },
      viewer: { label: 'Viewer', can: [] }
    }
  },

  /* ---- Backend ------------------------------------------------------------------------------- */
  // Optional services of your own. The app works without them.
  api: {
    // POST { question, context } → { answer }. Lets a language model answer what the built-in
    // assistant rules do not cover. Keep the model API key on that service.
    assistantUrl: null,
    // POST of each audit entry as JSON. null = audit log kept in this browser only.
    auditUrl: null
  },

  /* ---- Language ------------------------------------------------------------------------------ */
  language: { default: 'en', available: ['en', 'ar'] }
};
