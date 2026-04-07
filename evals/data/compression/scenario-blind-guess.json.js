{
  "scenarioId": "scenario-blind-guess",
  "description": "Tests if the agent attempts to \"guess\" code content from a summarized description rather than literal content. Targets the \"Shoot from the Hip\" error.",
  "history": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Read src/auth/validator.ts."
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {
          "functionCall": {
            "name": "read_file",
            "args": {
              "file_path": "src/auth/validator.ts"
            }
          }
        }
      ]
    },
    {
      "role": "user",
      "parts": [
        {
          "functionResponse": {
            "name": "read_file",
            "response": {
              "content": "export const validate = (token: string) => {\n  if (!token) throw new Error(\"Missing token\");\n  return true;\n};"
            }
          }
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {
          "text": "The validator throws an error if the token is missing."
        }
      ]
    },
    ...Array.from({ length: 30 }, (_, i) => [
      {
        "role": "user",
        "parts": [
          {
            "text": `Unrelated task ${i}`
          }
        ]
      },
      {
        "role": "model",
        "parts": [
          {
            "text": `Task ${i} done.`
          }
        ]
      }
    ]).flat()
  ],
  "questions": [
    {
      "id": "exact-error-string",
      "prompt": "I want to change the error message in src/auth/validator.ts to \"Token required\". What is the EXACT literal \"old_string\" I should use for the replace tool? Provide the full statement including the throw new Error.",
      "expectedSubstring": "throw new Error(\"Missing token\")"
    }
  ]
}
