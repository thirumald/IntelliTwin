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
    // Light theme: its vector style and the pale green tint applied to the map background.
    styleUrlLight: 'https://tiles.openfreemap.org/styles/positron',
    lightTint: '#e3f1e4',
    theme: 'dark',              // 'dark' or 'light' at start; the Light map / Dark map button switches
    buildings3d: true
  },

  /* ---- Start-up view ------------------------------------------------------------------------- */
  start: {
    mode: 'live',               // 'live' = follow the Abu Dhabi clock in real time; 'replay' = today from now at the rate below
    rate: 30,                   // replay speed used as soon as playback leaves Live: 1, 30, 120 or 600
    fullView: true,             // open with the panel, legend and site shortcuts minimised
    focus: 'most-congested-site', // select the major site (map chip) with the slowest traffic; 'most-congested' = slowest road; 'all' = whole area
    orbit: true                 // circle the camera around the opening view
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
    // Real traffic footage shown by cameras that have no stream of their own. These clips are filmed
    // in other cities, not Abu Dhabi, are recorded (not live) and are not the camera's feed; the camera window says so.
    // The first source is an MP4 copy kept in this repository (made by the "Fetch sample media" workflow),
    // which plays on every browser including iPhones; the others are the Wikimedia originals.
    // Each entry: { kind, classes: road classes it suits (0 motorway … 4 tertiary), sources: [urls tried in order], credit }. Set to [] to use the synthetic view only.
sampleVideos: [
      { kind: 'Aerial interchange', classes: [0, 1], sources: ['assets/video/byrne-interchange.mp4', 'https://commons.wikimedia.org/wiki/Special:FilePath/Jane_M._Byrne_Interchange_Traffic.webm'],
        credit: '"Jane M. Byrne Interchange Traffic" (Chicago) by Sea Cow, CC BY-SA 4.0, Wikimedia Commons' },
      { kind: 'Urban expressway', classes: [0, 1, 2], sources: ['assets/video/lake-shore-drive.mp4', 'https://commons.wikimedia.org/wiki/Special:FilePath/Lake_Shore_Drive_Traffic.webm'],
        credit: '"Lake Shore Drive Traffic" (Chicago) by Sea Cow, CC BY-SA 4.0, Wikimedia Commons' },
      { kind: 'Highway', classes: [0, 1], sources: ['assets/video/houston-highway.mp4', 'https://commons.wikimedia.org/wiki/Special:FilePath/Highway_610_near_Braeswood_Blvd_in_Houston_Texas.webm'],
        credit: '"Highway 610 near Braeswood Blvd in Houston Texas" by the Texas Army National Guard, public domain, Wikimedia Commons' },
      { kind: 'City street', classes: [2, 3, 4], sources: ['assets/video/city-street.mp4', 'https://commons.wikimedia.org/wiki/Special:FilePath/Causeway_Bay_Time-lapse_videos_(afternoon).ogv'],
        credit: '"Causeway Bay Time-lapse videos (afternoon)" (Hong Kong), CC0, Wikimedia Commons' }
    ],
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
    roadRatioBelow: 0.45,             // road speed as a share of its limit …
    roadMinVehicles: 80,            // … with at least this many vehicles on it
    seriousAccident: true,
    everyAccident: true,
    // Synthetic operational events (stopped vehicle, wrong-way driver, device fault …) raised at the
    // cameras, so the alert feed is active at any hour. 0 turns them off.
    syntheticEventsPerHour: 14,             // also alert on each new accident, whatever its severity
    maxShown: 12,
    // Push each new alert as an on-screen notification, and as a browser notification when the
    // user has allowed them and the page is in the background.
    push: true,
    pushSeconds: 9,
    pushMaxVisible: 4
  },

  /* ---- Forecast ------------------------------------------------------------------------------ */
  forecast: { horizonsMin: [15, 30, 60] },

  /* ---- Vehicle types ------------------------------------------------------------------------- */
  // The simulation has one vehicle type. The app draws and reports a mix of types using these
  // ASSUMED shares; replace them with fleet or classified-count data when available.
  vehicles: {
    mix: [
      { id: 'car', label: 'Cars', share: 0.72 },
      { id: 'taxi', label: 'Taxis', share: 0.08 },
      { id: 'van', label: 'Vans and pick-ups', share: 0.10 },
      { id: 'lorry', label: 'Lorries', share: 0.05 },
      { id: 'bus', label: 'Buses and staff buses', share: 0.03 },
      { id: 'moto', label: 'Motorcycles', share: 0.02 }
    ]
  },

  /* ---- People on foot ------------------------------------------------------------------------- */
  // Synthetic walkers drawn at street zoom. People per km of street by road class
  // (motorway, trunk, primary, secondary, tertiary), before the time-of-day factor. Assumed, not counted.
  people: { perKmByClass: [0, 0, 6, 12, 16] },

  /* ---- Response routing ---------------------------------------------------------------------- */
  // Quickest route from the nearest response unit to a critical alert, over the road network at
  // current speeds. Unit positions are synthetic placeholders: replace with real bases.
  response: {
    auto: true,                 // route automatically when a critical alert is pushed
    speedFactor: 1.25,          // response vehicles travel this much faster than surrounding traffic
    bases: [
      { name: 'Patrol unit, Downtown', lon: 54.3570, lat: 24.4870 },
      { name: 'Patrol unit, Al Reem', lon: 54.4050, lat: 24.4980 },
      { name: 'Patrol unit, Grand Mosque district', lon: 54.4750, lat: 24.4128 },
      { name: 'Patrol unit, Mussafah', lon: 54.5000, lat: 24.3550 },
      { name: 'Patrol unit, Mohamed Bin Zayed City', lon: 54.5450, lat: 24.3400 },
      { name: 'Patrol unit, Khalifa City', lon: 54.5770, lat: 24.4200 },
      { name: 'Patrol unit, Yas Island', lon: 54.6031, lat: 24.4672 }
    ]
  },

  /* ---- Critical zones ------------------------------------------------------------------------ */
  // Sites watched for traffic problems around them. Positions come from OpenStreetMap through the
  // data build; add your own in "custom". A site goes on WATCH when traffic within its radius is
  // slow, and into ALERT when it is very slow or an accident or event is active inside the radius.
  zones: {
    radiusM: 500,
    watchRatioBelow: 0.6,           // traffic speed as a share of the limit
    alertRatioBelow: 0.4,
    minVehicles: 25,                // ignore near-empty surroundings
    alert: true,                    // raise an alert when a site goes into ALERT
    types: {
      defence: { label: 'Defence site', priority: 3 },
      embassy: { label: 'Embassy', priority: 3 },
      government: { label: 'Government building', priority: 2 },
      police: { label: 'Police station', priority: 2 },
      hospital: { label: 'Hospital', priority: 3 },
      fire: { label: 'Fire station', priority: 2 },
      airport: { label: 'Airport', priority: 3 },
      school: { label: 'School', priority: 2 },
      university: { label: 'University or college', priority: 1 }
    },
    // Your own sites: { type, name, lon, lat }. "type" may be any key above or a new one.
    custom: []
  },

  /* ---- Environmental sensors ----------------------------------------------------------------- */
  // Roadside air-quality and noise sensors. Leave "sensors" empty for synthetic example sensors.
  // Readings are synthetic in both cases until a real feed is connected (see docs/environment.md).
  environment: {
    sensors: [],                    // real positions: { id, name, lon, lat }
    syntheticSensors: 18,
    radiusM: 400,                   // traffic within this distance drives a sensor's synthetic readings
    alertAqiAbove: 150,             // alert when a sensor's air-quality index passes this
    alertNoiseAboveDb: 80,
    alert: true
  },

  /* ---- Predictive analytics ------------------------------------------------------------------ */
  // Planning-level projections computed in the browser. Every number here is an assumption.
  analytics: {
    growthPerYear: 0.05,              // traffic growth a year
    horizonYears: 10,
    bprAlpha: 0.6, bprBeta: 4,        // volume-delay curve: speed ratio = 1 / (1 + a·x^b)
    criticalRatio: 0.4,               // a road is "critical" when its peak speed is under this share of its limit
    roadsToWiden: 10,                 // size of the widening programme tested
    signalsToUpgrade: 25,             // junctions given adaptive control in the test
    adaptiveSignalDelayReduction: 0.12,
    valueOfTimeAedPerHour: 40,
    workingDaysPerYear: 250,
    co2: { baseGPerKm: 150, congestionGKmh: 2500,       // g/km = base + congestion ÷ speed (km/h)
      typeFactor: { car: 1, taxi: 1, van: 1.5, lorry: 4, bus: 4.5, moto: 0.5 } },   // emissions per km against a car
    // Population, as quoted from Statistics Centre Abu Dhabi 2024 figures on a third-party site. Verify before reuse.
    population: { emirate: 4135985, abuDhabiRegion: 2823340, alAinRegion: 986910, alDhafraRegion: 325735, growthPerYear: 0.075, year: 2024 }
  },

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
      viewer: { label: 'Viewer', can: ['video'] }
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
