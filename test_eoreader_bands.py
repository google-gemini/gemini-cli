import os
import tempfile
import logging
from pystac_client import Client
from eoreader.reader import Reader
from eoreader.bands import RED, GREEN, BLUE
from shapely import wkt

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Example WKT (replace with yours)
bounding_box = "POLYGON((-89.55 43.15, -89.24 43.15, -89.24 42.99, -89.55 42.99, -89.55 43.15))"

# 1. Convert WKT to geometry
aoi_geometry = wkt.loads(bounding_box)
aoi_bounds = aoi_geometry.bounds

# 2. Search Copernicus STAC for Sentinel-2 L2A items
COPERNICUS_STAC_URL = "https://stac.dataspace.copernicus.eu/v1"
client = Client.open(COPERNICUS_STAC_URL)
from datetime import datetime
end_date = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
search = client.search(collections=["sentinel-2-l2a"], bbox=aoi_bounds, datetime=f"2024-05-01/{end_date}")

items = list(search.item_collection())

if not items:
    raise RuntimeError("No Sentinel-2 items found for the test AOI.")

best_item = items[0]
logging.info(f"Testing EOReader with product: {best_item.id}")

# 3. Open product
temp_dir = tempfile.mkdtemp()
reader = Reader()
prod = reader.open(best_item, archive_path=temp_dir)

# 4. Try to load RGB bands
bands_to_load = [RED, GREEN, BLUE]
resolved_bands = [b.value for b in bands_to_load]
logging.info(f"Resolved EOReader bands: {resolved_bands}")

try:
    stack = prod.stack(bands_to_load, pixel_size=10, window=aoi_geometry)
    logging.info(f"Stack shape: {stack.shape}")
except Exception as e:
    logging.error(f"EOReader stack failed: {e}", exc_info=True)
