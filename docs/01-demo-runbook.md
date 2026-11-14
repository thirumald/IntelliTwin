# Demo runbook (10 minutes)

**Before:** `./run.sh`, open http://localhost:8090 full-screen. Sim speed 10× (default). Press **Reset** to return to 07:20.
Internet is needed only for the basemap; everything else works offline (roads still draw without tiles).

| # | Screen | Say / do |
| --- | --- | --- |
| 1 | **Overview** | "One view of city health: network health, speed, delay, incidents, violations, revenue." Point at *Forecast · Preview*: speed expected to fall by about 08:00. |
| 2 | **Live map** | Morning peak, congestion colours from free flow to gridlock. Switch **+30 min**: the forecast layer. Show cameras toggle. |
| 3 | Press **Start storyline** | Alerts tab fills: surge near the Corniche junction, then a red-light violation, then a collision. Map marker pulses. |
| 4 | **Incident drawer** (click the marker) | Lifecycle: detected, verified, dispatched, on scene, cleared. Responders and ETAs. **Linked chain**: congestion, red-light violation (evidence thumbnail), collision, response. "Likely cause: red-light running." |
| 5 | **Open violation** | Three evidence frames, plate crop, ANPR/AI confidence, fine 1,000 AED, 12 black points, 30-day impound. Click **Approve & issue fine**. Status becomes Issued with a fine reference. |
| 6 | **Violations & fines** | Review queue, filters, search by plate. "High-confidence speeding and parking are auto-approved; everything sensitive goes to a human." Mark paid / open appeal. |
| 7 | **Congestion** | Hotspots with duration, corridors with +30 min forecast and trend, level of service, hour × weekday heatmap. |
| 8 | **Operations** (traffic police) | Response time by severity, black spots, incidents by hour. |
| 9 | **Enforcement** | Detection-to-fine funnel, revenue issued vs collected, repeat offenders, top locations, fine schedule. |
| 10 | **City & brand** | Switch to Dubai or Riyadh (plug-and-play, about 2 s). Switch brand to Capital Roads. Toggle **ع** for Arabic/RTL. Close on the roadmap. |

**If something looks odd:** Reset (top bar). The simulation is deterministic per start time and city.

## Talking points (USPs)
1. One platform from detection to fine to payment, with a linked evidence chain.
2. Evidence-grade, auditable enforcement: humans review sensitive cases; AI can speed up but not silently decide.
3. Digital twin direction: forecast now, what-if simulation next.
4. White-label and plug-and-play city packs.
5. Camera-agnostic; VISIONX can feed events. Commercial-safe stack.

## Not in this build (say so if asked)
Real camera/ANPR ingestion (VISIONX bridge), what-if simulator, signal optimisation, citizen portal, Postgres persistence, authentication.
