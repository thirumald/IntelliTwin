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
    lightTint: '#cfe0d2',
    theme: 'dark',              // 'dark' or 'light' at start; the Light map / Dark map button switches
    buildings3d: true
  },

  /* ---- Start-up view ------------------------------------------------------------------------- */
  // Interface style: 'government' (standard: navy and gold), 'military' (olive and khaki), 'police' (blue and silver)
  // or 'enterprise' (compact, rounded).
  // Visitors can switch with the Style button in the status bar.
  // menu: 'minimised' (icons only, with a button to expand) or 'expanded'.
  ui: { style: 'government', menu: 'minimised' },

  // Check options: which map layers are switched on when the app opens. Each can still be changed on screen.
  layers: {
    vehicles: true, people: true, accidents: true, enforcementSites: true, buildings3d: false,
    cameras: true, detectors: false, messageSigns: true, signals: true, responseBases: true,
    railway: true, cycleTracks: true, criticalZones: true, environmentSensors: true,
    buses: true, taxis: true, shuttles: true, ships: true, aircraft: true
  },

  start: {
    mode: 'live',               // 'live' = start at the Abu Dhabi clock and play at the rate below; 'replay' = today from now, as Historical
    rate: 30,                   // playback speed, Live included: 1 (Live then stays locked to the clock), 30, 120 or 600
    fullView: true,             // open with the panel, legend and site shortcuts minimised
    focus: 'most-congested-site', // select the major site (map chip) with the slowest traffic; 'most-congested' = slowest road; 'all' = whole area
    orbit: true,                // circle the camera; it stays on until the Orbit button is unclicked
    selectionZoomBoost: 2,      // zoom levels added when a site, road or item is selected (0 = off)
    selectionMaxZoom: 17.5      // closest zoom a selection goes to
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
    pushSeconds: 8,                         // auto-close after this many seconds; 0 = stay until closed with ×
    pushPosition: 'top-right',              // 'top-right' or 'top-left' corner of the map
    pushMaxVisible: 3                       // most notifications on screen at once
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

  /* ---- Buses ---------------------------------------------------------------------------------- */
  // A SYNTHETIC bus network: no usable public timetable could be obtained. Each route runs between
  // two points along the quickest road path. Replace with real routes or a GTFS feed when available.
  buses: {
    scheduleKmh: 22,              // timetabled speed including stops
    stopSpacingM: 600,
    firstHour: 5.5, lastHour: 23.5,
    offPeakFactor: 1.5,           // headway outside 06:00–09:30 and 16:00–20:00, against the peak headway
    delayShare: 0.35,             // share of the route's extra traffic time that delays its buses
    onTimeWithinMin: 3,
    routes: [
      { id: '101', name: 'Downtown – Mussafah', from: [54.3570, 24.4870], to: [54.5000, 24.3550], headwayMin: 10 },
      { id: '102', name: 'Corniche – Yas Island', from: [54.3400, 24.4750], to: [54.6031, 24.4672], headwayMin: 15 },
      { id: '103', name: 'Al Reem Island – Airport', from: [54.4050, 24.4980], to: [54.6511, 24.4330], headwayMin: 20 },
      { id: '110', name: 'Downtown – Khalifa City', from: [54.3570, 24.4870], to: [54.5770, 24.4200], headwayMin: 12 },
      { id: '120', name: 'Mina Zayed – Mohamed Bin Zayed City', from: [54.3780, 24.5220], to: [54.5450, 24.3400], headwayMin: 15 },
      { id: '160', name: 'Saadiyat Island – ADNEC', from: [54.3983, 24.5338], to: [54.4370, 24.4180], headwayMin: 20 },
      { id: '170', name: 'Emirates Palace – Grand Mosque', from: [54.3170, 24.4615], to: [54.4750, 24.4128], headwayMin: 10 },
      { id: '200', name: 'Mussafah – Yas Island', from: [54.5000, 24.3550], to: [54.6031, 24.4672], headwayMin: 20 },
      { id: '210', name: 'Khalifa City – Masdar City', from: [54.5770, 24.4200], to: [54.6170, 24.4290], headwayMin: 15 },
      { id: '300', name: 'Downtown – Al Maryah Island', from: [54.3570, 24.4870], to: [54.3900, 24.5020], headwayMin: 8 }
    ]
  },

  /* ---- Taxis and on-demand shuttles (synthetic) ----------------------------------------------- */
  // Example fleets. Taxis move along corridors between the ranks; shuttles circulate inside their zones.
  taxis: {
    count: 260,                   // taxis drawn
    speedKmh: 32,
    hiredSharePeak: 0.7, hiredShareDay: 0.5, hiredShareNight: 0.25,   // share of taxis carrying a passenger
    bookingShare: 0.1,            // share driving to a booking
    ranks: [
      { name: 'Downtown', at: [54.3570, 24.4870], bays: 10 },
      { name: 'Corniche', at: [54.3400, 24.4750], bays: 8 },
      { name: 'Emirates Palace', at: [54.3170, 24.4615], bays: 8 },
      { name: 'Al Maryah Island', at: [54.3900, 24.5020], bays: 10 },
      { name: 'Al Reem Island', at: [54.4050, 24.4980], bays: 8 },
      { name: 'Grand Mosque', at: [54.4750, 24.4128], bays: 12 },
      { name: 'ADNEC', at: [54.4370, 24.4180], bays: 12 },
      { name: 'Mussafah', at: [54.5000, 24.3550], bays: 8 },
      { name: 'Khalifa City', at: [54.5770, 24.4200], bays: 6 },
      { name: 'Yas Island', at: [54.6031, 24.4672], bays: 12 },
      { name: 'Airport', at: [54.6511, 24.4330], bays: 20 }
    ]
  },
  shuttles: {
    seats: 12, speedKmh: 24,
    zones: [
      { name: 'Yas Island', at: [54.6031, 24.4672], radiusM: 2600, vehicles: 6, waitMin: 8 },
      { name: 'Saadiyat Island', at: [54.4330, 24.5400], radiusM: 2600, vehicles: 5, waitMin: 10 },
      { name: 'Khalifa City', at: [54.5770, 24.4200], radiusM: 2800, vehicles: 6, waitMin: 9 },
      { name: 'Al Reem Island', at: [54.4050, 24.4980], radiusM: 1500, vehicles: 4, waitMin: 6 }
    ]
  },

  /* ---- Ships and aircraft (synthetic) ----------------------------------------------------------- */
  // Example movements. The sea lanes and flight paths are approximate lines for demonstration, not
  // charted channels or published procedures. Paths are [longitude, latitude] points.
  sea: {
    portName: 'Mina Zayed', port: [54.3800, 24.5270], view: [54.3600, 24.5900], berths: 8, everyMin: 22, wakeSec: 900, namePrefix: 'MV Example',
    lanes: [   // drawn from the port out to sea
      { name: 'North-west approach lane', path: [[54.3720, 24.5350], [54.3550, 24.5600], [54.3200, 24.6000], [54.2600, 24.6500], [54.1800, 24.7000]] },
      { name: 'Northern coastal lane', path: [[54.3720, 24.5350], [54.3620, 24.5750], [54.4200, 24.6250], [54.5200, 24.6650], [54.6300, 24.7000]] }
    ],
    types: [
      { kind: 'Container ship', knots: 14, colour: [57, 135, 229] }, { kind: 'Tanker', knots: 12, colour: [217, 89, 38] },
      { kind: 'Cruise ship', knots: 16, colour: [255, 255, 255] }, { kind: 'Ferry', knots: 20, colour: [25, 158, 112] }, { kind: 'Cargo dhow', knots: 9, colour: [201, 133, 0] }
    ]
  },
  air: {
    airport: [54.6511, 24.4330], movementsPerHour: 16, inViewSec: 420, topAltM: 2600, trailSec: 150, delayedShare: 0.2, flightPrefix: 'FLT',
    cities: ['Riyadh', 'Doha', 'Cairo', 'Mumbai', 'London', 'Istanbul', 'Delhi', 'Muscat', 'Kuwait City', 'Singapore', 'Frankfurt', 'Karachi'],
    routes: [   // arrivals end at the airport; departures start there
      { name: 'Approach from the north-west', arrival: true, path: [[54.3600, 24.6500], [54.5200, 24.5320], [54.6511, 24.4330]] },
      { name: 'Approach from the south-east', arrival: true, path: [[54.9400, 24.2150], [54.7900, 24.3280], [54.6511, 24.4330]] },
      { name: 'Departure to the north-west', arrival: false, path: [[54.6511, 24.4330], [54.5300, 24.5250], [54.4000, 24.6600]] },
      { name: 'Departure to the south-east', arrival: false, path: [[54.6511, 24.4330], [54.7800, 24.3350], [54.9300, 24.1900]] }
    ]
  },

  /* ---- Operations modules (synthetic examples) ------------------------------------------------- */
  incidents: { responseTargetMin: 12 },              // target time from report to a unit on scene
  signalControl: { adaptiveJunctions: 25, progressionKmh: 60, prioritySavingSec: 12 },
  // Planned roadworks and events. Days count from the date on the map (0 = that day). roadIndex picks a
  // major road from the alphabetical list. These are examples, not real permits or events.
  planned: {
    peoplePerCar: 2.5, carShare: 0.6,
    items: [
      { type: 'roadworks', roadIndex: 3, fromDay: 0, toDay: 4, start: '22:00', end: '05:00', lanes: 1 },
      { type: 'roadworks', roadIndex: 9, fromDay: 0, toDay: 1, start: '09:30', end: '15:00', lanes: 1 },
      { type: 'roadworks', roadIndex: 15, fromDay: 2, toDay: 9, start: '21:00', end: '05:00', lanes: 2 },
      { type: 'roadworks', roadIndex: 21, fromDay: 6, toDay: 13, start: '10:00', end: '14:00', lanes: 1 },
      { type: 'event', title: 'Exhibition at ADNEC (example)', at: [54.4370, 24.4180], fromDay: 0, toDay: 2, start: '10:00', end: '19:00', attendance: 18000 },
      { type: 'event', title: 'Evening concert, Yas Island (example)', at: [54.6031, 24.4672], fromDay: 1, toDay: 1, start: '18:00', end: '23:30', attendance: 25000 },
      { type: 'event', title: 'Corniche fun run (example)', at: [54.3400, 24.4750], fromDay: 5, toDay: 5, start: '06:00', end: '10:00', attendance: 6000 },
      { type: 'event', title: 'Football match (example)', at: [54.4530, 24.4160], fromDay: 3, toDay: 3, start: '19:00', end: '22:30', attendance: 30000 }
    ]
  },
  // Evacuation planning assumptions. Assembly points are example open areas, not designated sites.
  emergency: {
    occupancy: { school: 900, university: 4000, hospital: 600, embassy: 80, government: 400, defence: 500, airport: 12000, police: 120, fire: 40 },
    peoplePerCar: 2.5, peoplePerBus: 40, routeLanes: 2, laneCapacityPerHour: 1500, mobilisationMin: 10,
    // Natural disaster exercises. The areas are examples chosen for demonstration, not surveyed hazard zones.
    peoplePerKm2: 3500,
    disasters: [
      { id: 'flood', name: 'Flash flood after heavy rain', roadEffect: 'underpasses and low roads closed',
        areas: [{ name: 'Downtown underpasses', at: [54.3640, 24.4860], radiusM: 1500 }, { name: 'Mussafah industrial area', at: [54.5000, 24.3550], radiusM: 2200 }, { name: 'Khalifa City low roads', at: [54.5770, 24.4200], radiusM: 1800 }],
        actions: ['Close flooded underpasses and sign diversions', 'Send pumps and recovery vehicles to the closed sections', 'Warn drivers on message signs and public channels', 'Give signals more green on the diversion routes', 'Check hospitals and schools inside the area for access'] },
      { id: 'surge', name: 'Coastal storm surge', roadEffect: 'seafront roads closed',
        areas: [{ name: 'Corniche seafront', at: [54.3400, 24.4780], radiusM: 2200 }, { name: 'Mina Zayed port area', at: [54.3780, 24.5220], radiusM: 1800 }, { name: 'Saadiyat shore', at: [54.4330, 24.5450], radiusM: 2400 }],
        actions: ['Close the seafront roads and car parks', 'Move people inland to the assembly points', 'Stop ferry and port access traffic', 'Hold response units outside the surge area', 'Reopen in stages after inspection'] },
      { id: 'sand', name: 'Severe sandstorm', roadEffect: 'reduced speed limit, exposed roads',
        areas: [{ name: 'Airport and Khalifa City corridor', at: [54.6200, 24.4300], radiusM: 6000 }, { name: 'Mussafah and Mohamed Bin Zayed City', at: [54.5200, 24.3500], radiusM: 5000 }],
        actions: ['Lower the limit on exposed motorways', 'Show low-visibility warnings on message signs', 'Keep lorries in the right lane or hold them at weigh stations', 'Place patrols at the usual pile-up locations', 'Tell schools and employers to stagger departures'] },
      { id: 'quake', name: 'Earthquake', roadEffect: 'bridges and tunnels closed until inspected',
        areas: [{ name: 'City centre and islands', at: [54.3800, 24.4850], radiusM: 7000 }],
        actions: ['Close bridges, flyovers and tunnels until inspected', 'Set signals to flashing where power is lost', 'Keep main corridors clear for emergency vehicles', 'Open the assembly points and route people to them', 'Survey critical sites in priority order: hospitals first'] },
      { id: 'heat', name: 'Extreme heat', roadEffect: 'no closures, more breakdowns',
        areas: [{ name: 'Whole city', at: [54.4600, 24.4500], radiusM: 16000 }],
        actions: ['Add recovery patrols for breakdowns on motorways', 'Limit roadworks to night hours', 'Open cooled waiting areas at bus stations', 'Check on outdoor workers at work sites', 'Watch for tyre and engine fires on message-sign cameras'] }
    ],
    assemblyPoints: [
      { name: 'Corniche open area (example)', at: [54.3400, 24.4750] },
      { name: 'ADNEC car parks (example)', at: [54.4370, 24.4180] },
      { name: 'Zayed Sports City car parks (example)', at: [54.4530, 24.4160] },
      { name: 'Al Reem central park (example)', at: [54.4050, 24.4980] },
      { name: 'Khalifa City park (example)', at: [54.5770, 24.4200] },
      { name: 'Yas Island car parks (example)', at: [54.6031, 24.4672] },
      { name: 'Mussafah open ground (example)', at: [54.5000, 24.3550] }
    ]
  },
  parking: {
    violationsPerDay: 900,
    sites: [
      { name: 'Downtown multi-storey', at: [54.3590, 24.4885], spaces: 1200, kind: 'business' },
      { name: 'Corniche car park', at: [54.3410, 24.4765], spaces: 800, kind: 'leisure' },
      { name: 'Al Maryah Island car park', at: [54.3905, 24.5030], spaces: 2400, kind: 'business' },
      { name: 'Al Reem Island car park', at: [54.4060, 24.4990], spaces: 1500, kind: 'residential' },
      { name: 'Emirates Palace visitors', at: [54.3180, 24.4625], spaces: 600, kind: 'leisure' },
      { name: 'Grand Mosque visitors', at: [54.4760, 24.4138], spaces: 1800, kind: 'leisure' },
      { name: 'ADNEC car park', at: [54.4380, 24.4190], spaces: 3000, kind: 'business' },
      { name: 'Yas Island car park', at: [54.6040, 24.4680], spaces: 4000, kind: 'leisure' },
      { name: 'Airport long stay', at: [54.6500, 24.4340], spaces: 3500, kind: 'mixed' },
      { name: 'Hamdan Street on-street zone', at: [54.3640, 24.4900], spaces: 420, kind: 'business', street: true },
      { name: 'Khalidiyah on-street zone', at: [54.3480, 24.4700], spaces: 380, kind: 'residential', street: true },
      { name: 'Mussafah on-street zone', at: [54.5010, 24.3560], spaces: 650, kind: 'business', street: true }
    ]
  },
  // Vehicle search uses generated plate reads at the synthetic cameras. Plates here are demo values.
  vehicleSearch: {
    watchList: [
      { plate: 'DEMO-48213', reason: 'Reported stolen (example)' },
      { plate: 'DEMO-10777', reason: 'Unpaid fines (example)' },
      { plate: 'DEMO-66502', reason: 'Vehicle of interest (example)' },
      { plate: 'DEMO-30914', reason: 'No valid registration (example)' }
    ]
  },
  freight: {
    weightLimitT: 2.5, banHours: [[6.5, 9], [15, 18]], nonComplianceShare: 0.06,
    zone: { at: [54.3700, 24.4800], radiusM: 5500 },
    hazmatVehicles: 5, hazmatFrom: [54.5000, 24.3550], hazmatTo: [54.3780, 24.5220],
    weighStations: [
      { name: 'Mussafah weigh station (example)', at: [54.5050, 24.3600], perHour: 180 },
      { name: 'Mina Zayed port gate (example)', at: [54.3790, 24.5210], perHour: 140 },
      { name: 'Airport road weigh station (example)', at: [54.6200, 24.4300], perHour: 110 }
    ]
  },
  pedestrians: { schoolLimitKmh: 30, schoolWindows: [[6.75, 8, 'Arrival time'], [13, 15, 'Dismissal time']], crossings: 16, peakPerHour: 420 },
  weather: { demo: 'auto' },                         // 'auto', 'clear', 'fog', 'sand' or 'rain'
  assets: { openWorkOrders: 14, slaDays: { P1: 1, P2: 3, P3: 7 } },
  reports: {
    schedules: [
      { name: 'Daily operations summary', every: 'day', at: '06:00', audience: 'control room' },
      { name: 'Weekly traffic and safety report', every: 'week', weekday: 0, at: '07:00', audience: 'department heads' },
      { name: 'Monthly city KPI scorecard', every: 'month', day: 1, at: '08:00', audience: 'leadership' }
    ]
  },

  /* ---- Platform monitoring (synthetic example of a deployed platform) -------------------------- */
  platform: {
    pipelineMs: 900, queueBase: 1200, retentionDays: 30,
    storage: { totalTb: 480, usedTb: 301, perDayTb: 1.9 },
    feeds: [
      { name: 'Traffic detectors', source: 'roadside units', perSec: 520, lagMs: 350, followsTraffic: true },
      { name: 'Video analytics events', source: 'CCTV analytics servers', perSec: 180, lagMs: 800, followsTraffic: true },
      { name: 'Plate reads', source: 'enforcement cameras', perSec: 240, lagMs: 500, followsTraffic: true },
      { name: 'Signal controller status', source: 'traffic signal system', perSec: 80, lagMs: 300 },
      { name: 'Bus positions', source: 'vehicle location system', perSec: 35, lagMs: 1200 },
      { name: 'Taxi positions', source: 'dispatch system', perSec: 130, lagMs: 1500 },
      { name: 'Environmental sensors', source: 'air and noise stations', perSec: 6, lagMs: 2500 },
      { name: 'Weather service', source: 'external service', perSec: 0.4, lagMs: 4000, faultRate: 0.06 },
      { name: 'Incident reports', source: 'control room system', perSec: 0.6, lagMs: 700 },
      { name: 'Vessel positions', source: 'ship tracking receivers', perSec: 12, lagMs: 3000 },
      { name: 'Aircraft positions', source: 'flight tracking receivers', perSec: 45, lagMs: 1500 }
    ],
    nodes: [
      { name: 'ingest-01', role: 'Message broker', cpu: 46, mem: 58, disk: 41, followsLoad: true },
      { name: 'ingest-02', role: 'Message broker', cpu: 43, mem: 55, disk: 39, followsLoad: true },
      { name: 'stream-01', role: 'Stream processing', cpu: 61, mem: 67, disk: 33, followsLoad: true },
      { name: 'gpu-01', role: 'Video analytics', cpu: 52, mem: 71, disk: 48, gpu: 68, followsLoad: true },
      { name: 'gpu-02', role: 'Video analytics', cpu: 49, mem: 69, disk: 47, gpu: 64, followsLoad: true },
      { name: 'db-01', role: 'Database, primary', cpu: 38, mem: 74, disk: 63 },
      { name: 'store-01', role: 'Object storage', cpu: 22, mem: 40, disk: 63 },
      { name: 'app-01', role: 'Application and API', cpu: 34, mem: 52, disk: 28 }
    ],
    services: [
      { name: 'Map and traffic API', ms: 85 }, { name: 'Simulation service', ms: 420 }, { name: 'Alert engine', ms: 60 },
      { name: 'Video gateway', ms: 140 }, { name: 'Sign-in service', ms: 45 }, { name: 'Report service', ms: 310 }
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
    // Example targets for the City scorecard. They are illustrations, not official targets; set your own.
    targets: {
      peakSpeedKmh: 45, extraTravelPct: 25, dailyDelayVehH: 120000, criticalRoads: 20, junctionsEFPct: 20, busOnTimePct: 85,
      accidentsPerDay: 60, seriousAccidentsPerDay: 2, accidentsWorstHour: 6, criticalAlertsOpen: 0,
      finesPerDay: 12000, finesWorstHour: 1000, topViolationSharePct: 50, topSitesSharePct: 25,
      sitesMonitored: 500, sitesOnAlertPct: 2, camerasOnlinePct: 97,
      co2TonnesPerDay: 7000, aqi: 100, noiseDb: 70,
      flightsOnTimePct: 80, flightDelayMin: 15, berthUsePct: 85,
      futureSpeedKmh: 40, futureCriticalRoads: 40, cycleKm: 300, delayCostAedMillion: 1200
    },
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
      admin: { label: 'Administrator', can: ['whatif', 'export', 'audit', 'settings', 'video', 'search'] },
      operator: { label: 'Operator', can: ['whatif', 'export', 'video', 'search'] },
      viewer: { label: 'Viewer', can: ['video'] }
    }
  },

  /* ---- Backend ------------------------------------------------------------------------------- */
  // Optional services of your own. The app works without them.
  api: {
    // POST { question, context } → { answer }. Lets a language model answer what the built-in
    // assistant rules do not cover. Keep the model API key on that service.
    assistantUrl: null,
    // Vision-language model for the camera window. POST { question, image (JPEG data URL of the current
    // frame, or null), camera, context } → { answer }. null = sample answers written from synthetic data.
    // Keep the model API key on that service. Sending frames to a service sends video images to it.
    vlmUrl: null,
    // POST of each audit entry as JSON. null = audit log kept in this browser only.
    auditUrl: null
  },

  /* ---- Language ------------------------------------------------------------------------------ */
  language: { default: 'en', available: ['en', 'ar'] }
};
