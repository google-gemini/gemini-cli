# ==============================================================================
# Caretaker Triage Evaluation Runner Container (Cloud Run Job)
#
# Placed at repository root to allow `gcloud run jobs deploy --source .` to:
# 1. Automatically detect this Dockerfile without separate build steps.
# 2. Access both /cloudrun/triage-worker and /evals inside the root build context.
# ==============================================================================

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

# 1. Pre-bake target gemini-cli repo clone into container image
RUN git clone https://github.com/google-gemini/gemini-cli.git /app/evals/triage/target_repo

# 2. Copy living local application code from root build context
COPY cloudrun/triage-worker /app/cloudrun/triage-worker
COPY evals /app/evals

RUN pip install --no-cache-dir -r /app/cloudrun/triage-worker/requirements.txt \
    && pip install --no-cache-dir -r /app/evals/triage/requirements.txt

WORKDIR /app/evals/triage
ENV PYTHONPATH=/app

CMD ["python3", "cloud_runner.py"]
