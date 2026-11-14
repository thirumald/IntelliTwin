"""Synthetic evidence imagery for violations (generated, so the demo carries no unlicensed footage).

Each violation renders a 3-frame sequence plus a plate crop, with the burnt-in data strip an enforcement
camera would add. In production the same endpoints would serve frames cut from the recorder (VISIONX).
"""
from __future__ import annotations

import io
import random
import zlib
from datetime import datetime

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 960, 540
VP = (W // 2, 175)  # vanishing point
BODY = {"White": (232, 232, 228), "Silver": (178, 182, 188), "Black": (34, 36, 40), "Grey": (110, 114, 120), "Blue": (40, 80, 160), "Red": (180, 40, 40), "Beige": (200, 184, 150)}
_fonts: dict[int, ImageFont.ImageFont] = {}


def font(size: int):
    if size not in _fonts:
        _fonts[size] = ImageFont.load_default(size=size)
    return _fonts[size]


def _lerp(a, b, t):
    return a + (b - a) * t


def _road(d: ImageDraw.ImageDraw, rnd: random.Random, night: bool):
    sky_top, sky_bot = ((12, 18, 34), (40, 52, 80)) if night else ((120, 170, 215), (200, 220, 235))
    for y in range(VP[1] + 20):
        t = y / (VP[1] + 20)
        d.line([(0, y), (W, y)], fill=tuple(int(_lerp(a, b, t)) for a, b in zip(sky_top, sky_bot)))
    d.rectangle([0, VP[1] + 20, W, H], fill=(60, 64, 60) if not night else (26, 30, 28))
    # skyline blocks
    x = 0
    while x < W:
        bw, bh = rnd.randint(40, 90), rnd.randint(25, 90)
        col = (46, 56, 76) if night else (150, 165, 185)
        d.rectangle([x, VP[1] + 20 - bh, x + bw, VP[1] + 20], fill=col)
        x += bw + rnd.randint(0, 12)
    road = (58, 60, 64) if not night else (34, 36, 40)
    d.polygon([(VP[0] - 28, VP[1] + 20), (VP[0] + 28, VP[1] + 20), (W - 20, H), (20, H)], fill=road)
    # edge lines and dashed lane lines
    d.line([(VP[0] - 28, VP[1] + 20), (20, H)], fill=(220, 220, 215), width=3)
    d.line([(VP[0] + 28, VP[1] + 20), (W - 20, H)], fill=(220, 220, 215), width=3)
    for k in (1, 2):
        fx = k / 3
        top = (_lerp(VP[0] - 28, VP[0] + 28, fx), VP[1] + 20)
        bot = (_lerp(20, W - 20, fx), H)
        for i in range(8):
            t0, t1 = (i / 8) ** 1.6, ((i + 0.45) / 8) ** 1.6
            p0 = (_lerp(top[0], bot[0], t0), _lerp(top[1], bot[1], t0))
            p1 = (_lerp(top[0], bot[0], t1), _lerp(top[1], bot[1], t1))
            d.line([p0, p1], fill=(230, 230, 225), width=max(1, int(1 + 5 * t1)))


def _lane_x(y: float, lane: float) -> float:
    t = (y - (VP[1] + 20)) / (H - (VP[1] + 20))
    left, right = _lerp(VP[0] - 28, 20, t), _lerp(VP[0] + 28, W - 20, t)
    return _lerp(left, right, lane)


def _car(d: ImageDraw.ImageDraw, y: float, lane: float, colour: str, vtype: str, plate: str, braking: bool):
    t = max((y - (VP[1] + 20)) / (H - (VP[1] + 20)), 0.02)
    cx = _lane_x(y, lane)
    w = 360 * t + 18
    h = w * (0.62 if vtype in ("SUV", "Van", "Truck", "Pickup") else 0.52)
    body = BODY.get(colour, (200, 200, 200))
    dark = tuple(int(c * 0.55) for c in body)
    # shadow
    d.ellipse([cx - w * 0.6, y - h * 0.08, cx + w * 0.6, y + h * 0.1], fill=(14, 14, 16))
    # lower body and cabin
    d.rounded_rectangle([cx - w / 2, y - h * 0.62, cx + w / 2, y - h * 0.05], radius=max(3, w * 0.06), fill=body)
    d.polygon([(cx - w * 0.38, y - h * 0.62), (cx - w * 0.30, y - h), (cx + w * 0.30, y - h), (cx + w * 0.38, y - h * 0.62)], fill=body)
    d.polygon([(cx - w * 0.30, y - h * 0.66), (cx - w * 0.25, y - h * 0.94), (cx + w * 0.25, y - h * 0.94), (cx + w * 0.30, y - h * 0.66)], fill=(26, 34, 46))
    for sx in (-1, 1):
        d.rounded_rectangle([cx + sx * w * 0.5 - w * 0.07, y - h * 0.55, cx + sx * w * 0.5 + w * 0.07, y - h * 0.38], radius=2, fill=(220, 30, 30) if braking else (150, 25, 25))
        d.ellipse([cx + sx * w * 0.42 - w * 0.08, y - h * 0.12, cx + sx * w * 0.42 + w * 0.08, y + h * 0.04], fill=(14, 14, 14))
    # plate
    pw, ph = w * 0.30, w * 0.075
    d.rectangle([cx - pw / 2, y - h * 0.34, cx + pw / 2, y - h * 0.34 + ph], fill=(244, 240, 220), outline=dark)
    if pw > 30:
        d.text((cx, y - h * 0.34 + ph / 2), plate, fill=(20, 20, 20), font=font(max(8, int(ph * 0.8))), anchor="mm")
    return (cx - w / 2, y - h, cx + w / 2, y + h * 0.05), (cx - pw / 2, y - h * 0.34, cx + pw / 2, y - h * 0.34 + ph)


def _signal(d, state: str, x: int, y: int):
    d.rectangle([x - 3, y, x + 3, y + 90], fill=(30, 30, 30))
    d.rounded_rectangle([x - 20, y - 66, x + 20, y + 6], radius=6, fill=(18, 18, 20), outline=(90, 90, 95))
    for i, (col, name) in enumerate([((235, 50, 50), "red"), ((240, 190, 30), "amber"), ((60, 200, 90), "green")]):
        on = name == state
        d.ellipse([x - 12, y - 60 + i * 22, x + 12, y - 36 + i * 22], fill=col if on else tuple(int(c * 0.22) for c in col))


def render_frame(v: dict, frame: int, dev_name: str) -> bytes:
    """Frame 0..2 of the evidence sequence for violation `v`."""
    rnd = random.Random(zlib.crc32(v["id"].encode()))
    ts: datetime = v["ts"]
    night = ts.hour < 6 or ts.hour >= 18
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    _road(d, rnd, night)
    kind = v["type"]
    lane = rnd.choice([0.17, 0.5, 0.83])
    progress = [0.72, 0.54, 0.40][frame] if kind in ("red_light", "wrong_way") else [0.34, 0.56, 0.80][frame]
    y = (VP[1] + 20) + progress * (H - (VP[1] + 20))
    stop_y = (VP[1] + 20) + 0.60 * (H - (VP[1] + 20))
    if kind == "red_light":
        x0, x1 = _lane_x(stop_y, 0.0), _lane_x(stop_y, 1.0)
        d.line([(x0 + 6, stop_y), (x1 - 6, stop_y)], fill=(240, 240, 235), width=8)
        _signal(d, "red", W - 120, 120)
    if kind == "parking":
        y, lane = (VP[1] + 20) + 0.68 * (H - (VP[1] + 20)), 0.96
        d.rectangle([_lane_x(y, 0.92) - 8, y - 150, _lane_x(y, 0.92) + 2, y - 40], fill=(180, 30, 30))
        d.text((_lane_x(y, 0.92) - 4, y - 95), "P", fill=(255, 255, 255), font=font(24), anchor="mm")
    if kind == "wrong_way":
        for i in range(3):
            xx = int(_lane_x(y, 0.5)) - 60 + i * 60
            d.polygon([(xx, 470), (xx + 40, 470), (xx + 20, 440)], fill=(240, 200, 40))
    car_box, plate_box = _car(d, y, lane, v["vehicle"]["colour"], v["vehicle"]["type"], v["vehicle"]["plate"], braking=frame > 0 and kind != "speeding")
    # detection boxes
    d.rectangle(car_box, outline=(0, 163, 255), width=2)
    d.rectangle([car_box[0], car_box[1] - 22, car_box[0] + 150, car_box[1]], fill=(0, 163, 255))
    d.text((car_box[0] + 6, car_box[1] - 11), f"{v['vehicle']['type'].upper()}  {v['ai_conf']:.2f}", fill=(3, 18, 31), font=font(13), anchor="lm")
    d.rectangle(plate_box, outline=(250, 200, 40), width=2)
    # HUD
    d.rectangle([0, 0, W, 34], fill=(8, 16, 30))
    d.text((12, 17), f"{dev_name}", fill=(232, 238, 246), font=font(15), anchor="lm")
    d.text((W - 12, 17), ts.strftime("%Y-%m-%d  %H:%M:%S") + f".{(frame * 400) % 1000:03d}", fill=(0, 163, 255), font=font(15), anchor="rm")
    d.rectangle([0, H - 54, W, H], fill=(8, 16, 30))
    if kind == "speeding":
        info = f"SPEED {v['measured']:.0f} km/h   LIMIT {v['limit']:.0f}   OVER +{v['measured'] - v['limit']:.0f}"
    elif kind == "red_light":
        info = f"SIGNAL RED  +{1.1 + frame * 0.9:.1f}s   STOP LINE {'BEFORE' if frame == 0 else 'AT' if frame == 1 else 'CROSSED'}"
    elif kind == "wrong_way":
        info = "DIRECTION  AGAINST FLOW   LANE 2"
    elif kind == "parking":
        info = "NO PARKING ZONE   DWELL 06:12"
    elif kind == "phone_use":
        info = "AI CABIN  HANDHELD DEVICE DETECTED"
    elif kind == "seatbelt":
        info = "AI CABIN  DRIVER BELT NOT DETECTED"
    else:
        info = "LANE MARKING CROSSED  SOLID LINE"
    d.text((12, H - 36), info, fill=(232, 238, 246), font=font(16), anchor="lm")
    d.text((12, H - 15), f"PLATE {v['vehicle']['plate']}   ANPR {v['anpr_conf']:.2f}   REF {v['id']}", fill=(154, 170, 189), font=font(12), anchor="lm")
    d.text((W - 12, H - 15), f"FRAME {frame + 1}/3   INTELLITWIN by Presight", fill=(154, 170, 189), font=font(12), anchor="rm")
    if night:
        img = img.filter(ImageFilter.GaussianBlur(0.4))
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=False)
    return buf.getvalue()


def render_plate(v: dict) -> bytes:
    img = Image.new("RGB", (420, 130), (244, 240, 220))
    d = ImageDraw.Draw(img)
    d.rectangle([2, 2, 417, 127], outline=(30, 30, 30), width=4)
    d.text((210, 40), v["vehicle"].get("emirate", ""), fill=(60, 60, 60), font=font(22), anchor="mm")
    d.text((210, 88), v["vehicle"]["plate"], fill=(15, 15, 15), font=font(54), anchor="mm")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()
