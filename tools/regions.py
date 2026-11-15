"""IntelliTwin regions: the main city area of each emirate, plus Al Ain.

Abu Dhabi city is the default region and is built by build-data.yml into data/. The regions below are built
by build-regions.yml into data/<id>/. `trips` is the ASSUMED number of vehicle trips on the major-road
network between 06:30 and 10:00 on a working day; it is scaled from the Abu Dhabi figure by rough city
size and is not a count. `centre` is used by the synthetic traffic pattern (busier towards the centre).
"""

REGIONS = {
    "dubai":        {"name": "Dubai",          "bbox": (54.95, 24.92, 55.55, 25.36), "centre": (55.27, 25.20), "trips": 760_000},
    "sharjah":      {"name": "Sharjah",        "bbox": (55.34, 25.24, 55.72, 25.44), "centre": (55.40, 25.34), "trips": 330_000},
    "ajman":        {"name": "Ajman",          "bbox": (55.40, 25.36, 55.62, 25.46), "centre": (55.45, 25.40), "trips": 120_000},
    "ummalquwain":  {"name": "Umm Al Quwain",  "bbox": (55.50, 25.46, 55.82, 25.64), "centre": (55.57, 25.56), "trips": 22_000},
    "rasalkhaimah": {"name": "Ras Al Khaimah", "bbox": (55.70, 25.60, 56.10, 25.86), "centre": (55.96, 25.79), "trips": 85_000},
    "fujairah":     {"name": "Fujairah",       "bbox": (56.24, 25.04, 56.40, 25.24), "centre": (56.33, 25.13), "trips": 50_000},
    "alain":        {"name": "Al Ain",         "bbox": (55.56, 24.08, 55.90, 24.34), "centre": (55.75, 24.21), "trips": 170_000},
}
