# Get a TomTom API key and check it

Free tier, about 10 minutes. The key stays on the server (in `.env`), never in the browser or the repository.

## 1. Create the account and the key

1. Open **https://my.tomtom.com** and **register** (email and password; confirm the email they send).
2. Sign in and open **API & SDK Keys**: **https://my.tomtom.com/keys**.
3. TomTom has already created a key called **My first API key**. Open it and **copy** the key.
   (Source: [TomTom, "How to get a TomTom API key"](https://docs.tomtom.com/platform/documentation/my-tomtom/how-to-get-a-tomtom-api-key).)
4. Optional: in the same page, look for the key's product list and request limits (labels change over time). Our server
   already caps its own calls (`TOMTOM_DAILY_CAP`, default 2000 data calls and 20000 tiles per day).

Keep the key private: do not paste it into chat, issues, screenshots or any file in the repository.

## 2. Put it where the app reads it

Local machine:

```bash
cp .env.example .env
# edit .env and set TOMTOM_KEY=...   (the file is git-ignored)
```

AWS box: edit `/opt/intellitwin/.env` (see `docs/deploy-aws-one-box.md`).

## 3. Check it against Abu Dhabi (do this before any demo)

```bash
read -s TOMTOM_KEY && export TOMTOM_KEY      # paste the key, press Enter (nothing is echoed)
.venv/bin/python tools/check_tomtom.py
```

It calls the services the app uses and prints one line each, never the key:

```
PASS flow @ Sheikh Zayed Bin Sultan St - 41 km/h now, 70 free flow, confidence 0.93, class FRC0
PASS incidents in the Abu Dhabi box - 7 active; by iconCategory {1: 2, 6: 3, 9: 2}
PASS flow tile (z11) - HTTP 200, 9120 bytes
PASS/FAIL routing with traffic ...      (optional)
PASS/FAIL search (fuel stations) ...    (optional)
```

(The numbers above are an illustration of the format, not real output.)

- The first five lines (flow, incidents, tile) decide the live demo. If any fails with **403**, that product is not
  enabled for the key; with **429**, the quota is used up.
- Routing and search are extras (response-route times, fuel and EV stations). If they fail, the rest still works.

## 4. Check it through the app

1. Sign in, open **Admin** (user menu, top right) and look at **Live traffic (TomTom)**: it should say *On* and show request counts.
2. TomTom **map tiles are off** by default (`TOMTOM_TILES=off`): the twin's own simulated traffic and cars stay the road colours.
   Only data points are used: live incidents, flow speeds at the sites, routing and fuel/EV station search.
3. Live incidents appear in the Incidents section and as markers. In **Admin**, requests today should move.
4. No key set means no TomTom calls at all; the app runs fully on the simulation, which is also what an on-prem install does.
