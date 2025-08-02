import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

console.log("=== Environment Variables ===");
console.log("DATABRICKS_URL:", process.env.DATABRICKS_URL);
console.log("DBX_PAT exists:", Boolean(process.env.DBX_PAT));
console.log("GEMINI_API_KEY exists:", Boolean(process.env.GEMINI_API_KEY));
console.log("GOOGLE_GENAI_USE_GCA:", process.env.GOOGLE_GENAI_USE_GCA);
console.log("GOOGLE_GENAI_USE_VERTEXAI:", process.env.GOOGLE_GENAI_USE_VERTEXAI);

// Check if there's a config file
try {
  const configPath = join(process.env.HOME, '.gemini', 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  console.log("\n=== User Config ===");
  console.log("Auth method:", config.authMethod);
  console.log("Model:", config.model);
} catch (e) {
  console.log("\nNo user config file found");
}
