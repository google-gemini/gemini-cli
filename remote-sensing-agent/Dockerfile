# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies required by GDAL and other libraries
RUN apt-get update && apt-get install -y gdal-bin libgdal-dev libgeos-dev && rm -rf /var/lib/apt/lists/*

# Set environment variables for GDAL
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

# Copy the requirements file into the container
COPY requirements.txt .
# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY . .

# --- FIX: Add Environment Variables ---
ENV GCP_PROJECT="fit-boulevard-475901-k6"
ENV ANALYSIS_BUCKET="ecoasset-analysis-results"

# Set the entrypoint for the Cloud Run Job
ENTRYPOINT ["python", "main.py"]
