# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies required by Shapely
RUN apt-get update && apt-get install -y libgeos-dev && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY . .

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Define environment variable
ENV NAME GeoReasoningAgent
ENV GCP_PROJECT="fit-boulevard-475901-k6"
ENV GCP_REGION="us-central1"

# Run uvicorn when the container launches
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
