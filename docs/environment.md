# Environmental sensors

The **Environment** tab, the sensor markers on the map and the Environment section of the analytics view come from `js/environment.js`.

## What is real and what is not

- **Sensors:** unless you list real ones in `config.js` (`environment.sensors`), the app places 18 example sensors beside the longest named roads, at least 2.5 km apart. They are not real monitoring stations.
- **Readings:** always synthetic for now. They are generated, not measured, and every screen that shows them says so.

## How a reading is generated

For each sensor, the traffic on road links within 400 m is summarised into an intensity from the number of vehicles and how slowly they move. Each pollutant is a background level plus a traffic term, with a small repeatable variation per sensor and 5-minute period:

| Measure | Formula (load = traffic intensity, 0 to about 1.6) | Unit |
| --- | --- | --- |
| PM2.5 | 16 + 34 × load | µg/m³ |
| PM10 | 48 + 70 × load | µg/m³ |
| NO₂ | 14 + 85 × load | µg/m³ |
| CO | 0.3 + 1.6 × load | mg/m³ |
| O₃ | 30 + 70 × daylight − 0.25 × NO₂ (minimum 8) | µg/m³ |
| Temperature | 26 + 6 × daily sine, peak mid-afternoon | °C |
| Noise | CoRTN basic noise level at 10 m from flow, speed and heavy-vehicle share, as LAeq ≈ L10 − 3 | dB(A) |

The coefficients are chosen to give plausible roadside values; they are not fitted to Abu Dhabi measurements.

**Air-quality index.** The highest of three sub-indices (PM2.5, PM10, NO₂), each interpolated between US EPA-style breakpoints, banded as Good (0–50), Moderate (51–100), Unhealthy for sensitive groups (101–150) and Unhealthy (over 150). The official UAE index may differ.

**Alerts.** A sensor raises an alert when its index passes 150 or its noise passes 80 dB(A) (`alertAqiAbove`, `alertNoiseAboveDb`).

## In the analytics view

Sensors by air-quality band (donut), pollutants through the day, noise by sensor, road length by noise band, CO₂ by hour, and CO₂ by vehicle type (donut, using assumed emission factors per type).

## Connecting real sensors

List the stations in `environment.sensors` to fix their positions. To use measured values, replace `readingAt()` in `js/environment.js` with a lookup against your feed; the tab, map layer, alerts and analytics all read from that one function.
