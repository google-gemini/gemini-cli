
import pandas as pd

# --- Modeling Constants ---
AVG_BIOMASS_PER_HA_MN = 150.0  # Average Above-Ground Biomass in tonnes/ha for Minnesota
ROOT_TO_SHOOT_RATIO = 0.26       # Ratio of below-ground to above-ground biomass
CARBON_FRACTION_OF_BIOMASS = 0.47 # Carbon content as a fraction of biomass
CO2_CONVERSION = 44.0 / 12.0     # Molar mass ratio of CO2 to C

def estimate_carbon_impact(analysis_metrics: dict) -> dict:
    """
    Estimates the ecological impact (biomass and CO2e) from forest loss area.
    """
    loss_ha = analysis_metrics.get("loss_area_ha", 0)

    # Calculate biomass loss
    agb_loss = loss_ha * AVG_BIOMASS_PER_HA_MN
    bgb_loss = agb_loss * ROOT_TO_SHOOT_RATIO
    biomass_loss_tonnes = agb_loss + bgb_loss

    # Calculate carbon and CO2 equivalent loss
    carbon_loss_tonnes = biomass_loss_tonnes * CARBON_FRACTION_OF_BIOMASS
    co2e_emissions_tonnes = carbon_loss_tonnes * CO2_CONVERSION

    return {
        "agb_loss_tonnes": agb_loss,
        "bgb_loss_tonnes": bgb_loss,
        "total_biomass_loss_tonnes": biomass_loss_tonnes,
        "carbon_loss_tonnes": carbon_loss_tonnes,
        "co2e_emissions_tonnes": co2e_emissions_tonnes,
    }

def analyze_trends(historical_data: pd.DataFrame, current_metrics: dict) -> dict:
    """
    Analyzes current loss metrics against historical baseline data.
    """
    # Get the baseline from the mock historical data
    baseline_biomass = historical_data['baseline_biomass_tonnes'].iloc[0]
    current_biomass_loss = current_metrics.get("total_biomass_loss_tonnes", 0)

    # Calculate deviation
    if baseline_biomass > 0:
        deviation_pct = (current_biomass_loss / baseline_biomass) * 100
    else:
        deviation_pct = 0 # Avoid division by zero

    # Determine trend status
    if deviation_pct > 10:
        status = "SIGNIFICANT_LOSS_DETECTED: Loss is >10% of the historical baseline."
    elif deviation_pct > 0:
        status = "LOSS_DETECTED: Loss is within expected historical variation."
    else:
        status = "NO_SIGNIFICANT_LOSS: No canopy loss detected."

    return {
        "trend_status": status,
        "impact_relative_to_baseline_pct": deviation_pct,
    }
