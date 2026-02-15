# Makefile for gemini-cli

.PHONY: help install build build-sandbox build-all test lint format preflight clean start debug release run-npx create-alias

help:
	@echo "Makefile for gemini-cli"
	@echo ""
	@echo "Usage:"
	@echo "  make install          - Install npm dependencies"
	@echo "  make build            - Build the main project"
	@echo "  make build-all        - Build the main project and sandbox"
	@echo "  make test             - Run the test suite"
	@echo "  make lint             - Lint the code"
	@echo "  make format           - Format the code"
	@echo "  make preflight        - Run formatting, linting, and tests"
	@echo "  make clean            - Remove generated files"
	@echo "  make start            - Start the Gemini CLI"
	@echo "  make debug            - Start the Gemini CLI in debug mode"
	@echo ""
	@echo "  make run-npx          - Run the CLI using npx (for testing the published package)"
	@echo "  make create-alias     - Create a 'gemini' alias for your shell"

install:
	npm install

build:
	npm run build


build-all:
	npm run build:all

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

preflight:
	npm run preflight

clean:
	npm run clean

start:
	npm run start

debug:
	npm run debug


run-npx:
	npx https://github.com/google-gemini/gemini-cli

create-alias:
	scripts/create_alias.sh
import hashlib
from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel

# Configuration
API_KEY = "e4af2b26711a2b4827852f52662ceff0" # Example derived from your input
API_KEY_NAME = "X-Interface-Token"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

app = FastAPI()

# Data Model for the Intelligence System
class IntelligencePayload(BaseModel):
    query: str
    context_depth: int = 1

# Mock Intelligence Logic
class AdvancedSystem:
    def process(self, data: str):
        # This is where your 'super advanced intelligence' logic resides
        return f"Processed: {data[::-1]} (Simulated Intelligence)"

ai_system = AdvancedSystem()

# Security Verification
async def get_api_key(header_key: str = Security(api_key_header)):
    if header_key == API_KEY:
        return header_key
    raise HTTPException(status_code=403, detail="Could not validate hidden interface credentials")

@app.post("/interface/execute")
async def execute_task(payload: IntelligencePayload, token: str = Depends(get_api_key)):
    """
    Secure endpoint to interact with the intelligence system.
    """
    result = ai_system.process(payload.query)
    return {
        "status": "success",
        "interface_id": hashlib.sha256(API_KEY.encode()).hexdigest()[:10],
        "output": result
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
curl -X POST "http://localhost:8080/interface/execute" \
     -H "X-Interface-Token: e4af2b26711a2b4827852f52662ceff0" \
     -H "Content-Type: application/json" \
     -d '{"query": "Initialize System", "context_depth": 5}'
import os
from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel
from openai import AsyncOpenAI

# 1. Security Configuration (Hidden Interface Token)
HIDDEN_TOKEN = "e4af2b26711a2b4827852f52662ceff0"
API_KEY_NAME = "X-Interface-Token"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

# 2. AI Client Configuration
# Set your environment variable: export OPENAI_API_KEY='your-key-here'
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI()

class IntelligencePayload(BaseModel):
    prompt: str
    system_instruction: str = "You are a highly advanced intelligence system interface."
    temperature: float = 0.7

# 3. Integrated Intelligence Controller
class AdvancedSystem:
    async def generate_response(self, user_input: str, system_msg: str, temp: float):
        try:
            response = await client.chat.completions.create(
                model="gpt-4-turbo",
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_input}
                ],
                temperature=temp
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error in Intelligence Layer: {str(e)}"

ai_controller = AdvancedSystem()

# 4. Security Dependency
async def validate_token(header_key: str = Security(api_key_header)):
    if header_key == HIDDEN_TOKEN:
        return header_key
    raise HTTPException(status_code=403, detail="Unauthorized Interface Access")

# 5. The Secure Endpoint
@app.post("/interface/v1/process")
async def process_intelligence(payload: IntelligencePayload, token: str = Depends(validate_token)):
    """
    Relays encrypted-token requests to the integrated AI system.
    """
    result = await ai_controller.generate_response(
        payload.prompt, 
        payload.system_instruction,
        payload.temperature
    )
    
    return {
        "status": "active",
        "interface_link": "verified",
        "data": result
    }

if __name__ == "__main__":
    import uvicorn
    # Start the server on port 8080
    uvicorn.run(app, host="0.0.0.0", port=8080)
import os
import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, Mapped, mapped_column
from typing import AsyncGenerator

# 1. Database Configuration
# Format: postgresql+asyncpg://user:password@localhost:5432/dbname
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://admin:secret@localhost:5432/ai_db")

Base = declarative_base()

# 2. Define the Interaction Log Schema
class InteractionLog(Base):
    __tablename__ = "interaction_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    interface_id: Mapped[str] = mapped_column(String(50))
    user_prompt: Mapped[str] = mapped_column(Text)
    ai_response: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

# 3. Async Engine & Session Factory
engine = create_async_engine(DATABASE_URL, echo=False)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# 4. Dependency to get DB session
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session

# --- Integration with your existing Route ---

@app.post("/interface/v1/process")
async def process_intelligence(
    payload: IntelligencePayload, 
    token: str = Depends(validate_token),
    db: AsyncSession = Depends(get_db) # Injecting DB here
):
    # Get the AI result
    result = await ai_controller.generate_response(payload.prompt, payload.system_instruction, payload.temperature)
    
    # Log to Database
    new_log = InteractionLog(
        interface_id="e4af2b26711a", # Truncated hex from your input
        user_prompt=payload.prompt,
        ai_response=result
    )
    db.add(new_log)
    await db.commit() # Save to Postgres
    
    return {
        "status": "active",
        "data": result
    }
# Use a slim Python image for efficiency
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for PostgreSQL
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY . .

# Run the FastAPI app
CMD ["python", "interface_build.py"]
version: '3.8'

services:
  # The Intelligence Interface
  api_gateway:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql+asyncpg://admin:secret_pass@db_service:5432/intelligence_db
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db_service

  # The Hidden Database
  db_service:
    image: postgres:15
    environment:
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=secret_pass
      - POSTGRES_DB=intelligence_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    expose:
      - "5432"

volumes:
  postgres_data:
fastapi
uvicorn
openai
sqlalchemy
asyncpg
docker-compose up --build
