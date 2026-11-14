# IntelliTwin: Stakeholder Demo Build Plan

**Goal:** an end-to-end, working Presight-branded traffic management and violation demo, plus a presentation, for stakeholder review and customer showcases.
**Status:** defaults confirmed (Abu Dhabi first, other cities plug-and-play, English + Arabic, simulated data, VISIONX stack and theme). Build 0.1 delivered: see README and docs/01-demo-runbook.md.

## 1. Scope

Demo product = MVP + Phase 1 + forecast preview, all on simulated data.

| # | Module | In demo |
|---|---|---|
| 1 | Live Operations Map (speed/congestion layer, incidents, cameras) | yes |
| 2 | Congestion Management (hotspots, LOS, corridors, peak heatmap) | yes |
| 3 | Incident & Accident Management (lifecycle, response KPIs, black spots) | yes |
| 4 | Violations & Fines (detect > plate > evidence > review > fine > payment > appeal) | yes |
| 5 | Dashboards: Executive, Traffic Police, Enforcement/Revenue | yes |
| 6 | White-label (logo, colours, language, fine schedule, currency) | yes |
| 7 | Forecast panel (next 30 to 60 min congestion, labelled Preview) | yes |
| 8 | Linked chain: congestion > incident > violation > fine in one drill-down | yes (hero) |
| 9 | What-if simulator, signals, public transport, citizen portal | no (roadmap slide) |

## 2. Defaults (assumed, change if wrong)

- City: **Abu Dhabi** (currency AED). Generic fine schedule, no claim of being the official one.
- Languages: **English + Arabic (RTL)**, toggle in header.
- Data: **100% simulated**, deterministic seed so the demo is repeatable. Clearly labelled "simulated data".
- Stack: reuse VISIONX choices: FastAPI, Postgres, React/Vite, MapLibre, Docker Compose. NATS only if needed.
- Real footage and VISIONX bridge: later phase; the demo uses generated evidence images.

## 3. Architecture

```
Simulator (road graph, vehicles, scripted storyline)
   -> event stream (speeds, incidents, violations)
   -> Ingest/API (FastAPI) -> Postgres
   -> Analytics: congestion/LOS, incident KPIs, fine rules, forecast
   -> Web console (React, Presight theme, i18n, white-label config)
```

Key design points:
- **Simulator** builds the road network from OSM extract (committed as a small static file so the demo works offline), runs time-compressed traffic with daily patterns, and has a **storyline mode** that triggers a scripted sequence on cue.
- **Forecast**: simple, explainable model (seasonal baseline + recent-trend correction per segment), shown with an uncertainty band and a "Preview" badge. No accuracy claims.
- **Fines rules engine**: config-driven schedule (violation type, threshold, amount, black points). Evidence record is hash-chained like VISIONX audit.
- **White-label**: single `brand.json` (name, logo, palette, locale, currency, fine schedule).

## 4. Demo storyline (10 min)

1. Executive dashboard: city health, KPIs, revenue.
2. Live map at morning peak: congestion building on a corridor.
3. Forecast panel predicts it worsening in 30 min.
4. A crash occurs; alert; incident created, verified, responders dispatched; clearance time tracked.
5. Drill-down shows the red-light violation that caused it: evidence frames, plate, rule applied.
6. Reviewer approves; fine issued; citizen payment status; appeal flow.
7. Enforcement dashboard: violations by type, hotspots, repeat offenders, revenue.
8. Switch white-label brand and Arabic live.
9. Close on roadmap: what-if twin, signals, integrations.

## 5. Presentation (deck)

~15 slides: problem; product vision; USPs; live-demo handoff; architecture; modules; evidence/audit and licence-safe stack; white-label; roadmap (twin, VISIONX integration, signals, citizen portal); deployment options; pilot proposal and next steps. Built after the demo storyline is stable, so screenshots are real.

## 6. Build phases

| Phase | Output |
|---|---|
| A. Foundation | Repo scaffold, Presight theme/logo, i18n, white-label config, DB schema, API skeleton, CI |
| B. Simulator | Road graph, traffic flow, incident/violation generators, storyline mode, seed data |
| C. Core screens | Live map, congestion, incidents, violations/fines, 3 dashboards |
| D. Forecast + linked chain | Forecast panel, drill-down linking incident > violation > fine |
| E. Polish | Arabic/RTL, brand switch, evidence imagery, performance, demo reset button |
| F. Deck + runbook | Presentation, demo script, deployment guide, known limitations |

## 7. Risks

- Simulated data can look fake. Mitigation: realistic daily curves, real road geometry, storyline polish.
- Scope creep into phase 2 features. Mitigation: roadmap slide only.
- Logo/brand assets and fine schedule need stakeholder approval.
- Evidence imagery: generated or licensed footage only; no unlicensed clips.

## 8. Needed from you

1. Confirm defaults in section 2 (city, Arabic, simulated-only).
2. Presight logo files and brand guidelines (VISIONX theme can be reused if equivalent).
3. Review date for the draft, so I can size phases A to D against it.
