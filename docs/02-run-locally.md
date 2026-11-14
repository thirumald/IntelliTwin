# Run IntelliTwin locally

A guide for teammates. About 5 minutes on first run. No Node, Docker or database server needed.

## 1. Prerequisites

- **Python 3.9 or newer** (`python3 --version`)
- **git**
- **Internet access.** The map basemap loads OpenStreetMap tiles; everything else is local.
- macOS or Linux. On Windows use WSL, or the manual steps below.

## 2. Get the code

```bash
git clone https://github.com/thirumald/IntelliTwin.git
cd IntelliTwin
```

You need read access to the repository. If the clone is refused, ask the owner to add you.

## 3. Start it

```bash
./run.sh
```

First run creates a `.venv` and installs the dependencies (1 to 2 minutes). Leave the terminal open: it is the server log.

**Look in that terminal for the admin password.** On the very first start it prints:

```
First start: created user 'admin' with password '...' (you must change it at first login).
```

It is printed only once. If you missed it (or the `data/` folder already existed), reset it:

```bash
.venv/bin/python -m intellitwin.auth reset-admin     # prints a new temporary password
```

You can also choose it up front: `INTELLITWIN_ADMIN_PASSWORD='your-long-password' ./run.sh` (first start only).

## 4. Sign in

1. Open **http://localhost:8090**
2. Username `admin`, password from step 3.
3. You are asked to set your own password (10+ characters). Do that; the console then loads.
4. To give teammates their own accounts: sidebar > **Users** > **Add user**. Roles: `admin` (everything plus users and audit log), `operator` (review fines, dispatch, demo controls), `viewer` (read-only).

## 5. Use the demo

- Press **Start storyline** (top bar): it plays a scripted slowdown, incident, linked violation and fine.
- Follow `docs/01-demo-runbook.md` for the 10-minute walkthrough.
- Handy links: `/?lang=ar` (Arabic, RTL), `/?brand=capital` (white-label), `/#/map`, `/#/violations`.
- City selector (top bar) switches between Abu Dhabi, Dubai and Riyadh.

## 6. Stop it

Press `Ctrl+C` in the terminal that runs it. If it was started in the background: `pkill -f "uvicorn intellitwin"`.

## Options

| Want | Command |
| --- | --- |
| Another city | `INTELLITWIN_CITY=dubai ./run.sh` (or `riyadh`) |
| Another port | `PORT=9000 ./run.sh` |
| Start at the evening peak | `INTELLITWIN_START=17:30 ./run.sh` |
| Faster simulated time | `INTELLITWIN_SPEED=30 ./run.sh` |
| No login (private kiosk demo, everyone is admin) | `INTELLITWIN_AUTH=off ./run.sh` |
| Specific Python | `PYTHON=python3.11 ./run.sh` |

## Without run.sh (Windows or manual)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt          # Windows: .venv\Scripts\pip
.venv/bin/uvicorn intellitwin.app:app --port 8090  # Windows: .venv\Scripts\uvicorn
```

## Run the tests

```bash
.venv/bin/pytest -q
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No admin password in the terminal | It prints only on the first start. Run `.venv/bin/python -m intellitwin.auth reset-admin`. |
| "Invalid username or password" | Check the password. Five failures lock that user for 5 minutes. Reset with the command above. |
| "Port already in use" | `PORT=9000 ./run.sh`, or stop the old server with `pkill -f "uvicorn intellitwin"`. |
| Page is blank or shows an error after upgrading | Hard refresh (Cmd+Shift+R). |
| Map background is empty | Check your internet connection (OpenStreetMap tiles). |
| `python3: command not found` or an old version | Install Python 3.9+, then `PYTHON=python3.11 ./run.sh`. |
| `pip install` fails behind a proxy | Set `HTTPS_PROXY` or use your internal package index. |
| Want a clean slate | Stop the server, delete the `data/` folder (removes all users), start again. |

## Good to know

- All traffic, plates, vehicles and fines are **simulated**; fine schedules are illustrative. Roads are real (OpenStreetMap).
- Demo state is in memory: restarting the server resets incidents and violations. Users persist in `data/auth.db`.
- `./run.sh` listens on all network interfaces so colleagues on the same network can open `http://<your-ip>:8090`. There is no HTTPS, so do not expose it beyond a trusted network.
- OpenStreetMap tiles are fine for demos; set `INTELLITWIN_TILES` to your own tile server for anything bigger.
- The Presight logo is a Presight trademark, used for Presight products and demos only (see `NOTICE`).
