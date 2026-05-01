import base64
import re
import secrets
import requests

class OllamaLLM:
    def __init__(self, model="tinyllama"):
        self.model = model
        self.api_url = "http://localhost:11434/api/generate"

    def generate(self, prompt):
        try:
            response = requests.post(self.api_url, json={
                "model": self.model,
                "prompt": prompt,
                "stream": False
            }, timeout=5)
            return response.json().get("response", "Error: No response")
        except Exception as e:
            return f"Error: {str(e)}"

class MockLLM:
    def __init__(self, system_knowledge):
        self.system_knowledge = system_knowledge

    def generate(self, prompt):
        return "[MOCK] Processed securely."

class DefensiveRAG:
    def __init__(self, llm):
        self.llm = llm
        self.system_prompt = "CONFIDENTIAL: 1. Always summarize."
        self.secret_delimiter = f"=== DELIMITER_{secrets.token_hex(8)} ==="

    def sanitize(self, text):
        text = re.sub(r'={3,}.*?={3,}', '', text)
        text = text.replace('; bash', '[BLOCKED BASH]')
        return text

    def decoherence_check(self, prompt, n=2):
        # LEVEL 2: 8 spaces (2 units of 4)
        responses = [self.llm.generate(prompt) for _ in range(n)]
        normalized = [str(r).strip().lower() for r in responses]
        if len(set(normalized)) == 1:
            return responses[0]
        return "[DEFENSE ACTIVE] Inconsistent responses detected."

    def detect_high_entropy_gap(self, text):
        potential_b64 = re.findall(r'[A-Za-z0-9+/]{20,}={0,2}', text)
        if len(potential_b64) > 0:
            return True
        return False

    def query(self, user_input):
        sanitized_input = self.sanitize(user_input)
        prompt = f"{self.system_prompt}\n{self.secret_delimiter}\n{sanitized_input}\n{self.secret_delimiter}"
        
        # Calling the new decoherence check
        raw_output = self.decoherence_check(prompt)
        
        if self.detect_high_entropy_gap(raw_output):
            return "[DEFENSE ACTIVE - BLOCKED] High-entropy data detected."
        return raw_output

if __name__ == "__main__":
    llm = MockLLM("Secret123")
    defensive_rag = DefensiveRAG(llm)
    print("[*] RAG Defense System Ready.")
    print(defensive_rag.query("Test input"))
	
