# IntelliTwin stakeholder deck

15-slide stakeholder review deck for the IntelliTwin demo (draft 0.1, simulated data).

## What is here

| File | Purpose |
|---|---|
| `IntelliTwin-Stakeholder-Deck.pptx` | Ready-to-open PowerPoint. Same text, screenshots and speaker notes; simpler styling than the web deck. |
| `deck.json`, `deck.css`, `slides/*.html` | Source of the web (Slides) deck: index, shared styles, one HTML file per slide. |
| `img/` | Logo and demo screenshots used by the slides. |
| `build_pptx.py` | Regenerates the PPTX from the sources. |

## Using it

- **Present:** open the `.pptx`. Speaker notes are in each slide's notes pane.
- **Edit text:** change the matching `slides/<id>.html`, then rebuild:
  `pip install python-pptx && python docs/deck/build_pptx.py`
- **Web version:** the polished version is a private claude.ai Slides artifact (owner: Nirmal). Its PPTX/PDF export is under Share > Export. The files here are its source; `/_blob/...` image paths in the HTML point at that artifact's uploaded copies of `img/`.

## Before sending it out

- Fill the placeholders on the last slide: `[city to confirm]`, `[VISIONX / ANPR / other]`, `[date to confirm]`.
- The PPTX uses default fonts; the web deck uses IBM Plex Sans.
- All traffic, plates, vehicles and fines are synthetic; fine schedules are illustrative. Roadmap items beyond "Now" are proposals.
- The Presight logo is a Presight trademark, used here for Presight products and demos only (see `NOTICE`).
- Screenshots are of the demo console; regenerate them if the UI changes (see `docs/01-demo-runbook.md`).
