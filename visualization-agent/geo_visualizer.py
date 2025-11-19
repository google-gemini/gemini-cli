
import streamlit as st
import rasterio
from rasterio.features import shapes
import geopandas as gpd
import pydeck as pdk

@st.cache_data
def load_and_vectorize_mask(gcs_path: str) -> gpd.GeoDataFrame | None:
    """
    Opens a raster from GCS, vectorizes it, and returns a GeoDataFrame.
    """
    try:
        with rasterio.open(gcs_path) as src:
            # Read the first band and create a mask for loss pixels (value=1)
            image = src.read(1)
            mask = image == 1

            # Extract shapes (polygons) from the masked area
            results = (
                {'properties': {'raster_val': v}, 'geometry': s}
                for i, (s, v) in enumerate(
                    shapes(image, mask=mask, transform=src.transform)
                )
            )

            # Create a GeoDataFrame
            gdf = gpd.GeoDataFrame.from_features(list(results))
            gdf.set_crs(src.crs, inplace=True)

            if gdf.empty:
                st.info("No loss areas found in the raster.")
                return None

            # Simplify geometry and reproject for web mapping
            gdf['geometry'] = gdf['geometry'].simplify(tolerance=0.0001) # Adjust tolerance as needed
            gdf_web = gdf.to_crs(epsg=4326)
            
            return gdf_web

    except Exception as e:
        st.error(f"Failed to load and vectorize raster from {gcs_path}: {e}")
        return None

def create_loss_map(gdf: gpd.GeoDataFrame) -> pdk.Deck:
    """
    Creates a PyDeck map to visualize the loss polygons.
    """
    # Calculate the center of the geometries for the initial view
    center = gdf.unary_union.centroid
    initial_view_state = pdk.ViewState(
        latitude=center.y,
        longitude=center.x,
        zoom=10, # Adjust zoom level as needed
        pitch=50,
    )

    # Create a GeoJsonLayer for the loss polygons
    loss_layer = pdk.Layer(
        'GeoJsonLayer',
        data=gdf,
        opacity=0.8,
        stroked=False,
        filled=True,
        get_fill_color='[255, 0, 0]', # Red fill for loss
        get_line_color='[255, 0, 0]',
    )

    # Create the PyDeck Deck object
    deck = pdk.Deck(
        layers=[loss_layer],
        initial_view_state=initial_view_state,
        map_style='satellite' # Use satellite imagery as the basemap
    )

    return deck
