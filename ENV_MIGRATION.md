# Environment Variable Migration Guide

## New Variables (Recommended)
- `LLM_API_KEY` - For cloud LLM providers
- `LOCAL_LLM_BASE_URL` - For local LLM endpoints
- `LOCAL_LLM_MODEL` - Model name for local LLM
- `LOCAL_LLM_API_KEY` - Optional API key for local LLM
- `LLM_SANDBOX` - Sandbox mode (docker/podman/false)

## Legacy Variables (Still Supported)
- `GEMINI_API_KEY` - Maps to LLM_API_KEY
- `GEMINI_SANDBOX` - Maps to LLM_SANDBOX

All old GEMINI_* variables will continue to work for backward compatibility.
