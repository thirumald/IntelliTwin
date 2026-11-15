# Vision-language model (VLM) sample

Opening a camera now shows a **Scene analysis** block under the video: a description of the scene, key findings, preset and free questions, and the structured output.

## Sample mode (default)

With `api.vlmUrl` left as `null`, **no model analyses the video**. The description and answers are written from the twin's synthetic data for that camera: vehicles and speed on its road, the synthetic events raised at it (stopped vehicle, wrong-way vehicle, debris, pedestrian), heavy-vehicle share, time of day and the generated weather. The block is labelled "Sample output" and each answer says it comes from synthetic data.

The sample footage in the window is real video from another place, so the text will not match what is seen in the clip. It shows the function and the output format, not recognition accuracy.

The sample answers cover: the scene, stopped vehicles, traffic level, pedestrians, heavy vehicles, hazards and visibility. Other questions get a plain "cannot answer" reply.

## Connecting a real model

Set `api.vlmUrl` in `config.js` to your own service. For each question the app sends:

```json
{ "question": "Is any vehicle stopped?", "image": "data:image/jpeg;base64,…", "camera": { "id": "CAM-014", "name": "…" }, "context": { "vehicles": 23, "flow": "steady", "…": "…" } }
```

and shows the `answer` field of the JSON reply. `image` is the current video frame (up to 640 px wide), or `null` when the browser cannot read the frame (embedded players and streams from another origin without permission).

- Keep the model API key on that service, never in `config.js`.
- Sending frames to a service sends camera images to it. Check the data-protection and hosting requirements of the client before pointing this at an external model.
- If the service fails, the app falls back to the sample answer and says so.
