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

export const LspFindReferencesSchema = z.object({
  file_path: z.string().describe("The absolute path to the file."),
  line: z.number().describe("The 0-based line number."),
  character: z.number().describe("The 0-based character offset.")
});

/**
 * A tool to find all references of a symbol using the Language Server Protocol.
 */
export class LspFindReferencesTool {
  static readonly Name = "lsp_find_references";

  constructor(private readonly config: Config) {}

  get schema() {
    return {
      name: LspFindReferencesTool.Name,
      description: "Find all references of a symbol at a specific position using LSP. Useful for impact analysis.",
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

  async execute(params: z.infer<typeof LspFindReferencesSchema>): Promise<ToolResult> {
    const { file_path, line, character } = params;
    
    try {
      const references = await this.config.getLspService().findReferences(file_path, line, character);
      
      if (!references || references.length === 0) {
        return {
          llmContent: "No references found.",
          returnDisplay: "No references found."
        };
      }

      const formatted = references.map((ref: any) => {
        const p = uriToPath(ref.uri);
        return `${p}:${ref.range.start.line + 1}:${ref.range.start.character + 1}`;
      }).join("\n");

      return {
        llmContent: `Found ${references.length} references:\n${formatted}`,
        returnDisplay: `Found ${references.length} references.`
      };
    } catch (e) {
      return {
        llmContent: `Error finding references: ${e instanceof Error ? e.message : String(e)}`,
        returnDisplay: "Error finding references.",
        errorType: ToolErrorType.GENERIC_ERROR
      };
    }
  }
}
