#!/bin/bash

# Example setup script for custom model providers with Gemini CLI

echo "Setting up custom model providers for Gemini CLI..."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    touch .env
fi

echo ""
echo "Choose your setup:"
echo "1. OpenAI API"
echo "2. Anthropic Claude API"
echo "3. Local Ollama"
echo "4. Local LLM (custom endpoint)"
echo "5. All of the above (for testing)"

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo "Setting up OpenAI API..."
        read -p "Enter your OpenAI API key: " openai_key
        echo "OPENAI_API_KEY=$openai_key" >> .env
        echo "Setup complete! Use with: gemini --auth-type openai-compatible 'Hello world'"
        ;;
    2)
        echo "Setting up Anthropic Claude API..."
        read -p "Enter your Anthropic API key: " anthropic_key
        echo "ANTHROPIC_API_KEY=$anthropic_key" >> .env
        echo "Setup complete! Use with: gemini --auth-type anthropic 'Hello world'"
        ;;
    3)
        echo "Setting up Local Ollama..."
        echo "CUSTOM_BASE_URL=http://localhost:11434/v1" >> .env
        echo "LOCAL_LLM_API_KEY=dummy-key" >> .env
        echo "CUSTOM_TIMEOUT=60000" >> .env
        echo ""
        echo "Make sure Ollama is running:"
        echo "  ollama serve"
        echo ""
        echo "Then pull a model:"
        echo "  ollama pull llama2"
        echo ""
        echo "Use with: gemini --auth-type local-llm --model llama2 'Hello world'"
        ;;
    4)
        echo "Setting up Azure OpenAI..."
        read -p "Enter your Azure API key: " azure_key
        read -p "Enter your Azure endpoint (https://<region>.openai.azure.com): " azure_url
        read -p "Enter the Azure API version (default: 2025-01-01-preview): " azure_api_version
        azure_api_version=${azure_api_version:-2025-01-01-preview}

        echo "AZURE_API_KEY=$azure_key" >> .env
        echo "AZURE_ENDPOINT_URL=$azure_url" >> .env
        echo "AZURE_API_VERSION=$azure_api_version" >> .env

        echo "Setup complete! Use with: gemini --auth-type azure --model gpt-4o 'Hello, Azure!'"
        ;;
    5)
        echo "Setting up custom local LLM endpoint..."
        read -p "Enter your local LLM base URL (e.g., http://localhost:8080/v1): " base_url
        read -p "Enter API key (or 'dummy-key' if not needed): " api_key
        read -p "Enter timeout in milliseconds (default 30000): " timeout
        timeout=${timeout:-30000}
        
        echo "CUSTOM_BASE_URL=$base_url" >> .env
        echo "LOCAL_LLM_API_KEY=$api_key" >> .env
        echo "CUSTOM_TIMEOUT=$timeout" >> .env
        echo "Setup complete! Use with: gemini --auth-type local-llm 'Hello world'"
        ;;
    5)
        echo "Setting up all providers for testing..."
        read -p "Enter OpenAI API key (or press enter to skip): " openai_key
        read -p "Enter Anthropic API key (or press enter to skip): " anthropic_key
        
        if [ ! -z "$openai_key" ]; then
            echo "OPENAI_API_KEY=$openai_key" >> .env
        fi
        
        if [ ! -z "$anthropic_key" ]; then
            echo "ANTHROPIC_API_KEY=$anthropic_key" >> .env
        fi
        
        # Local LLM setup
        echo "CUSTOM_BASE_URL=http://localhost:11434/v1" >> .env
        echo "LOCAL_LLM_API_KEY=dummy-key" >> .env
        echo "CUSTOM_TIMEOUT=60000" >> .env
        
        echo ""
        echo "All providers configured! Usage examples:"
        echo "  OpenAI: gemini --auth-type openai-compatible 'Hello world'"
        echo "  Anthropic: gemini --auth-type anthropic 'Hello world'"
        echo "  Local LLM: gemini --auth-type local-llm --model llama2 'Hello world'"
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "Environment variables have been added to .env file:"
cat .env | grep -E "(OPENAI_API_KEY|ANTHROPIC_API_KEY|LOCAL_LLM_API_KEY|CUSTOM_BASE_URL|CUSTOM_TIMEOUT)"

echo ""
echo "You can also set these in your shell profile for permanent use:"
echo "  export OPENAI_API_KEY=\"your-key\""
echo "  export ANTHROPIC_API_KEY=\"your-key\""
echo "  export CUSTOM_BASE_URL=\"http://localhost:11434/v1\""
echo ""
echo "For more information, see docs/custom-providers.md"
