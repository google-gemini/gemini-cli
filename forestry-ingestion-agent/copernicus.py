
import os
import requests
import pystac_client
import planetary_computer
from shapely.geometry import shape

COPERNICUS_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

def get_copernicus_token() -> str:
    """Gets an access token for the Copernicus Data Space Ecosystem."""
    response = requests.post(
        COPERNICUS_TOKEN_URL,
        data={
            "client_id": "cdse-public",
            "username": os.environ.get("COPERNICUS_USERNAME"),
            "password": os.environ.get("COPERNICUS_PASSWORD"),
            "grant_type": "password",
        },
    )
    response.raise_for_status()
    return response.json()["access_token"]

def search_stac(aoi_wkt: str, start_date: str, end_date: str) -> dict | None:
    """Searches the Planetary Computer STAC for the best Sentinel-2 image."""
    aoi = shape.from_wkt(aoi_wkt)
    catalog = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )

    search = catalog.search(
        collections=["sentinel-2-l2a"],
        intersects=aoi,
        datetime=f"{start_date}/{end_date}",
        query={"eo:cloud_cover": {"lt": 10}}, # Less than 10% cloud cover
    )

    items = search.item_collection()
    if not items:
        return None
    
    # Simple logic: return the first (often most recent) item
    return items[0]

def download_bands(stac_item, aoi_wkt: str, temp_dir: str):
    """Downloads required bands (TCI, B08) into a temporary directory."""
    # This is a simplified mock. A real implementation would use odc-stac or similar
    # to load data directly into an xarray object without saving intermediate files.
    # For this refactor, we simulate downloading.
    
    aoi = shape.from_wkt(aoi_wkt)
    
    # Mock downloading the TCI and NIR bands
    # In a real scenario, you'd use the hrefs from the stac_item assets
    # and a library like `requests` or `aiohttp` to download them.
    print(f"Simulating download of TCI and B08 for item {stac_item.id} to {temp_dir}")
    
    # Create dummy files to represent downloaded bands
    # This part is for demonstration purposes to allow the workflow to proceed
    tci_path = os.path.join(temp_dir, "TCI.tif")
    b08_path = os.path.join(temp_dir, "B08.tif")
    
    # A real implementation would require creating actual raster data here.
    # For now, we just create empty files.
    with open(tci_path, 'w') as f:
        pass
    with open(b08_path, 'w') as f:
        pass
        
    return {"TCI": tci_path, "B08": b08_path}
