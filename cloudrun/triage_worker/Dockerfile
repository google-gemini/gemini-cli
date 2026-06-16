FROM python:3.13-slim
RUN apt-get update && apt-get install -y \
    git \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g @google/gemini-cli
RUN git clone https://github.com/google-gemini/gemini-cli.git /opt/gemini-cli
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "main.py"]