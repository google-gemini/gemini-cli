FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/google-gemini/gemini-cli.git /opt/gemini-cli
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
CMD ["python", "main.py"]