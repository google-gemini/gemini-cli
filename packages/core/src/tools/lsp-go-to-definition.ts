/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";
import { Config } from "../config/config.js";
import { ToolResult } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import { uriToPath } from "../utils/uri.js";

export const LspGoToDefinitionSchema = z.object({
  file_path: z.string().describe("The absolute path to the file."),
  line: z.number().describe("The 0-based line number."),
  character: z.number().describe("The 0-based character offset.")
});

/**
 * A tool to find the definition of a symbol using the Language Server Protocol.
 */
export class LspGoToDefinitionTool {
  static readonly Name = "lsp_go_to_definition";

  constructor(private readonly config: Config) {}

  get schema() {
    return {
      name: LspGoToDefinitionTool.Name,
      description: "Find the definition of a symbol at a specific position using LSP.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "The absolute path to the file." },
          line: { type: "number", description: "The 0-based line number." },
          character: { type: "number", description: "The 0-based character offset." }
        },
        required: ["file_path", "line", "character"]
      }
    };
  }

  async execute(params: z.infer<typeof LspGoToDefinitionSchema>): Promise<ToolResult> {
    const { file_path, line, character } = params;
    
    try {
      const definition = await this.config.getLspService().goToDefinition(file_path, line, character);
      
      if (!definition) {
        return {
          llmContent: "Definition not found.",
          returnDisplay: "Definition not found."
        };
      }

      // Definition can be a single Location or an array of Locations
      const locations = Array.isArray(definition) ? definition : [definition];
      
      const formatted = locations.map((loc: any) => {
        const p = uriToPath(loc.uri);
        return `${p}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
      }).join("\n");

      return {
        llmContent: `Definition found at:\n${formatted}`,
        returnDisplay: `Definition found at ${uriToPath(locations[0].uri)}`
      };
    } catch (e) {
      return {
        llmContent: `Error finding definition: ${e instanceof Error ? e.message : String(e)}`,
        returnDisplay: "Error finding definition.",
        errorType: ToolErrorType.GENERIC_ERROR
      };
    }
  }
}
