"""Build data/geo/wards.geojson: Voronoi polygons (scipy) of the 30 locality centroids, clipped to the
bbox [17.30, 78.29]–[17.56, 78.60]. Properties {id, name, zone}. "Approximate demo boundaries"."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))

from app.refdata import wards_geojson  # noqa: E402


def main():
    gj = wards_geojson()
    for f in gj["features"]:
        f["properties"] = {k: f["properties"][k] for k in ("id", "name", "zone")}
    gj["note"] = "Approximate demo boundaries (Voronoi cells of locality centroids)"
    out = ROOT / "data" / "geo" / "wards.geojson"
    out.write_text(json.dumps(gj))
    kinds = {f["geometry"]["type"] for f in gj["features"]}
    print(f"wrote {len(gj['features'])} wards ({', '.join(kinds)}) -> {out}")


if __name__ == "__main__":
    main()
