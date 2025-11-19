# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .
# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt 

# Copy the rest of the application code into the container
COPY . . 

# Make port 8080 available
EXPOSE 8080

# --- FIX 1: Add Environment Variables ---
ENV GCP_PROJECT="fit-boulevard-475901-k6"
ENV GCP_REGION="us-central1"

# --- FIX 2: Use $PORT in the CMD ---
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
