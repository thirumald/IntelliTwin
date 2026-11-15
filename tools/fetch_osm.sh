#!/usr/bin/env bash
# Download the Geofabrik GCC extract and cut it down to major roads in the study area.
# Requires: curl, osmium-tool. Output: build/roads.osm (XML, read by netconvert).
set -euo pipefail

BUILD="${1:-build}"
URL="https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf"
# ITW_REGION selects a region from tools/regions.py; without it the default study area (Abu Dhabi city) is used.
REGION="${ITW_REGION:-}"
if [ -n "$REGION" ]; then
  BBOX="$(python3 -c 'import sys; sys.path.insert(0, "tools"); import regions; print(",".join(map(str, regions.REGIONS[sys.argv[1]]["bbox"])))' "$REGION")"
else
  BBOX="$(python3 -c 'import sys; sys.path.insert(0, "tools"); import config; print(",".join(map(str, config.BBOX)))')"
fi
CLASSES="$(python3 -c 'import sys; sys.path.insert(0, "tools"); import config; print(",".join(config.HIGHWAY_CLASSES))')"

mkdir -p "$BUILD"
if [ ! -s "$BUILD/gcc-states.osm.pbf" ]; then
  curl -fL --retry 6 --retry-all-errors --retry-delay 30 --connect-timeout 30 -o "$BUILD/gcc-states.osm.pbf" "$URL"
fi

osmium fileinfo -g header.option.osmosis_replication_timestamp "$BUILD/gcc-states.osm.pbf" > "$BUILD/osm_timestamp.txt" || echo "unknown" > "$BUILD/osm_timestamp.txt"
osmium extract --bbox "$BBOX" --strategy complete_ways "$BUILD/gcc-states.osm.pbf" -o "$BUILD/area.osm.pbf" --overwrite
osmium tags-filter "$BUILD/area.osm.pbf" "w/highway=$CLASSES" -o "$BUILD/roads.osm.pbf" --overwrite
osmium cat "$BUILD/roads.osm.pbf" -o "$BUILD/roads.osm" --overwrite
# Railways, cycle tracks, critical sites (schools, hospitals, embassies, defence, government …), fuel and EV charging stations.
osmium tags-filter "$BUILD/area.osm.pbf" \
  w/railway=rail,light_rail,subway,tram,monorail w/highway=cycleway \
  nwr/amenity=school,kindergarten,university,college,hospital,embassy,police,fire_station,townhall,courthouse \
  nwr/office=diplomatic,government nwr/diplomatic nwr/landuse=military nwr/military nwr/aeroway=aerodrome \
  nwr/amenity=fuel,charging_station \
  -o "$BUILD/extra.osm.pbf" --overwrite
osmium cat "$BUILD/extra.osm.pbf" -o "$BUILD/extra.osm" --overwrite
ls -lh "$BUILD"/roads.osm "$BUILD"/extra.osm
echo "OSM data timestamp: $(cat "$BUILD/osm_timestamp.txt")"
