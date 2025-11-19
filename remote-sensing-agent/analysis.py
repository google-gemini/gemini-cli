
import rioxarray
import xarray as xr
from shapely import wkt
import numpy as np

def load_and_align(gcs_path_t1: str, gcs_path_t2: str, aoi_wkt: str) -> tuple[xr.DataArray, xr.DataArray]:
    """
    Loads and aligns two rasters from GCS based on a WKT AOI.
    """
    aoi_geom = wkt.loads(aoi_wkt)

    # Open T1, clip to AOI to create the reference grid
    da_t1 = rioxarray.open_rasterio(gcs_path_t1, chunks=True)
    da_t1_clipped = da_t1.rio.clip([aoi_geom], all_touched=True)

    # Open T2 and reproject to match the clipped T1
    da_t2 = rioxarray.open_rasterio(gcs_path_t2, chunks=True)
    da_t2_aligned = da_t2.rio.reproject_match(da_t1_clipped)

    return da_t1_clipped, da_t2_aligned

def calculate_ndvi(data: xr.DataArray) -> xr.DataArray:
    """
    Calculates NDVI assuming bands 'B04' (Red) and 'B08' (NIR).
    """
    nir = data.sel(band='B08')
    red = data.sel(band='B04')
    
    # Handle potential division by zero
    ndvi = xr.where((nir + red) == 0, 0, (nir - red) / (nir + red))
    return ndvi

def analyze_change(da_t1: xr.DataArray, da_t2: xr.DataArray, loss_threshold: float = -0.2) -> tuple[xr.DataArray, xr.DataArray]:
    """
    Analyzes change between two data arrays by calculating NDVI delta.
    """
    ndvi_t1 = calculate_ndvi(da_t1)
    ndvi_t2 = calculate_ndvi(da_t2)

    delta = ndvi_t2 - ndvi_t1

    # Create loss mask where delta is below the threshold
    loss_mask = xr.where(delta < loss_threshold, 1, 0).astype(np.uint8)
    loss_mask.rio.write_nodata(255, inplace=True)

    return delta, loss_mask

def calculate_statistics(loss_mask: xr.DataArray) -> dict:
    """
    Calculates statistics from the loss mask.
    """
    # Pixel area in square meters
    pixel_area_m2 = abs(loss_mask.rio.resolution()[0] * loss_mask.rio.resolution()[1])

    # Count loss pixels
    loss_pixels = int(loss_mask.where(loss_mask == 1).count())

    loss_area_m2 = loss_pixels * pixel_area_m2
    loss_area_ha = loss_area_m2 / 10000

    return {
        "loss_area_m2": loss_area_m2,
        "loss_area_ha": loss_area_ha,
    }
