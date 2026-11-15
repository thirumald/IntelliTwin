# Assistant

The **Ask IntelliTwin** button opens a chat window. The assistant is implemented in `js/assistant.js`.

## What it is

A built-in, rule-based agent. It matches a question to a known intent, reads the answer from the simulation data already loaded in the page, and can operate the twin. It runs entirely in the browser. **It is not a large language model**, and it only knows what is in the page.

## What it can do

| Ask | It does |
| --- | --- |
| "How is traffic now?", "Average speed at 08:30" | Reports network speed, vehicles moving, extra travel time and delay; jumps to the time if one is given |
| "Which roads are slowest?" | Lists the slowest named roads and opens the Congestion tab |
| "Show accidents", "How many fines?" | Reports the illustrative figures and opens the tab |
| "Go to Yas Island", "Show Al Khaleej Al Arabi Street" | Flies to a major site, or to a named road with its current speed |
| "Switch to demand +20%", "Compare the demand cases" | Changes the scenario, or compares all three at the current time |
| "Orbit", "3D", "2D", "Pause", "Play", "Live" | Operates the view |
| "Is this real data?" | Explains what is simulated, illustrative and real |

Every answer about accidents and fines states that they are illustrative.

## Adding a language model (optional)

A static site cannot hold an API key safely, so no model is called by default. To connect one:

1. Run your own small service that accepts `POST` with JSON `{ "question": "...", "context": { ... } }` and returns `{ "answer": "..." }`. Keep the model API key on that service.
2. Before `js/assistant.js` loads, set `window.INTELLITWIN_AI_ENDPOINT = "https://your-service.example/ask";` (for example in a small script tag in `index.html`).
3. Allow the site's origin in the service's CORS settings.

Questions the built-in rules do not cover are then sent to the service. `context` contains the current time, scenario, KPIs, slowest roads and the illustrative accident and fine totals, with a note that the traffic is simulated. The built-in intents (navigation, scenario, time, view controls) are always handled locally.
