
import logging
from geopy.geocoders import Nominatim
from shapely.geometry import shape
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_geometry(location_name: str) -> str:
    """
    Converts a location name into a WKT string using Nominatim.

    Args:
        location_name: The name of the location (e.g., "Cass County, Minnesota").

    Returns:
        The WKT string of the simplified geometry.

    Raises:
        ValueError: If geocoding fails or no geometry is found.
    """
    try:
        geolocator = Nominatim(user_agent="mn_dmrv_hackathon_geo_agent/1.0")
        location = geolocator.geocode(
            location_name,
            exactly_one=True,
            geometry="geojson"
        )

        if not location or 'geojson' not in location.raw:
            raise ValueError(f"Could not find geometry for '{location_name}'.")

        geom = shape(location.raw['geojson'])
        simplified_geom = geom.simplify(tolerance=0.005)

        return simplified_geom.wkt

    except Exception as e:
        logger.error(f"Geocoding failed for '{location_name}': {e}")
        raise ValueError(f"Failed to geocode '{location_name}'.") from e

if __name__ == '__main__':
    # Example usage
    try:
        wkt = get_geometry("Cass County, Minnesota")
        print(f"WKT for Cass County, Minnesota: {wkt}")
        wkt_fail = get_geometry("Fake Place That Does Not Exist")
    except ValueError as e:
        print(e)
