"""Core behaviour: city packs, fines rules, engine lifecycle, storyline, API."""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from intellitwin.city import list_cities, load_city
from intellitwin.engine import Engine
from intellitwin.fines import FineRules


@pytest.fixture(scope="module")
def eng():
    return Engine("abu_dhabi", start="07:20", history_days=3)


def test_city_packs_load_and_are_connected():
    ids = [c["id"] for c in list_cities()]
    assert {"abu_dhabi", "dubai", "riyadh"} <= set(ids)
    for cid in ids:
        c = load_city(cid)
        assert c.n > 500 and len(c.junctions) >= 10 and len(c.devices) > 40
        assert sum(1 for s in c.segs if s["next"]) / c.n > 0.7  # network is mostly connected


def test_speeding_bands_and_thresholds(eng):
    r = FineRules(eng.city)
    assert r.assess("speeding", 110, 100) is None  # below the first band
    f = r.assess("speeding", 130, 100)
    assert f and f["amount"] == 600 and f["over"] == 30
    assert r.assess("speeding", 170, 100)["amount"] == 2000
    rl = r.assess("red_light")
    assert rl["amount"] == 1000 and rl["black_points"] == 12


def test_riyadh_has_no_black_points():
    r = FineRules(load_city("riyadh"))
    assert r.assess("red_light")["black_points"] == 0


def test_warmup_builds_history(eng):
    assert len(eng.violations) > 1000 and len(eng.series) > 3 * 280
    assert any(i["status"] != "cleared" for i in eng.incidents.values())  # live incidents at start
    assert all(0.04 <= r <= 1.0 for r in eng.ratio)


def test_peak_is_slower_than_night(eng):
    import numpy as np
    from datetime import datetime

    night = np.average(eng.model.typical(datetime(2026, 11, 12, 3, 0)), weights=eng.city.length)
    peak = np.average(eng.model.typical(datetime(2026, 11, 12, 8, 0)), weights=eng.city.length)
    assert night > 0.95 and peak < night - 0.15


def test_review_actions_and_fine_lifecycle(eng):
    v = next(v for v in eng.violations.values() if v["status"] == "in_review")
    out = eng.violation_action(v["id"], "approve")
    assert out["status"] == "issued" and out["fine_ref"].startswith("F-") and out["due"] > eng.now
    assert eng.violation_action(v["id"], "pay")["status"] == "paid"
    with pytest.raises(ValueError):
        eng.violation_action(v["id"], "approve")  # cannot approve a paid fine


def test_storyline_links_violation_to_incident():
    e = Engine("abu_dhabi", start="07:20", history_days=3)
    e.start_storyline()
    e._run_until(e.now + timedelta(minutes=45), 60)
    inc = e.incidents[e.story["incident"]]
    v = e.violations[e.story["violation"]]
    assert inc["links"]["violation_ids"] == [v["id"]] and v["incident"] == inc["id"]
    assert v["type"] == "red_light" and v["status"] == "in_review"  # held for the operator
    assert inc["t"]["detected"] > v["ts"]  # the violation preceded the crash
    assert inc["impact_vh"] > 0 and "on_scene" in inc["t"]
    from intellitwin import analytics as an

    chain = an.chain(e, inc["id"])
    kinds = [s["kind"] for s in chain["steps"]]
    assert kinds.index("violation") < kinds.index("incident") and "congestion" in kinds


def test_forecast_shape_and_incident_awareness(eng):
    from intellitwin import analytics as an

    f = an.forecast(eng)
    assert len(f["points"]) == 13 and f["status"] == "preview"
    assert all(p["lo"] <= p["ratio"] <= p["hi"] for p in f["points"])


def test_api_endpoints(monkeypatch, tmp_path):
    monkeypatch.setenv("INTELLITWIN_AUTH", "off")
    monkeypatch.setenv("INTELLITWIN_DATA", str(tmp_path))
    from intellitwin import app as appmod

    with TestClient(appmod.app) as c:
        assert c.get("/api/meta").json()["city"]["id"] == "abu_dhabi"
        s = c.get("/api/state").json()
        assert len(s["ratios"]) == c.get("/api/meta").json()["n_segments"]
        for p in ("congestion", "forecast", "dashboards/executive", "dashboards/police", "dashboards/enforcement", "incidents", "violations?limit=5"):
            assert c.get("/api/" + p).status_code == 200, p
        vid = c.get("/api/violations?limit=1").json()["items"][0]["id"]
        assert c.get(f"/api/violations/{vid}/evidence/1.png").headers["content-type"] == "image/png"
        assert c.get("/api/violations/nope").status_code == 404
        assert c.post("/api/demo/storyline").json()["state"] == "running"
