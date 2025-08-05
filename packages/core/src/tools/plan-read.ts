import { Type } from '@google/genai';
import { BaseTool, ToolResult, Icon } from './tools.js';
import { Planner as _Planner, PlanEntry, PlanPriority } from '../core/planner.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';


type ReadPlanParams = Record<string, never>;


export class ReadPlanTool extends BaseTool<ReadPlanParams, ToolResult> {
  static readonly Name = 'read_plan';
  private readonly config: Config;

  constructor(config: Config) {
    super(
      ReadPlanTool.Name,
      'ReadPlan',
      'Returns the current session plan as JSON array.',
      Icon.LightBulb,
      { type: Type.OBJECT, properties: {} },
      false,
      false,
    );
    this.config = config;
  }

  getDescription(_: ReadPlanParams): string {
    return 'Show the current session plan';
  }

  validateToolParams(_params: ReadPlanParams): string | null {
    return null;
  }

  async shouldConfirmExecute(_params: ReadPlanParams): Promise<false> {
    return false;
  }

  toolLocations(_params: ReadPlanParams) {
    return [];
  }

  async execute(_: ReadPlanParams): Promise<ToolResult> {
    const planner = this.config.getPlanner();
    await planner.initialize();
    const plan = await planner.list();
    
    // Format the plan items for display
    const formattedPlan = plan.map(item => {
      const priority = item.priority ? ` (${item.priority})` : '';
      const status = item.status !== 'pending' ? ` [${item.status}]` : '';
      return `- ${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}${priority}${status}`;
    }).join('\n');
    
    const summary = `Plan (${plan.length} items):\n${formattedPlan}`;
    
    return {
      llmContent: JSON.stringify(plan, null, 2), // Keep full JSON for LLM
      returnDisplay: summary, // Show formatted summary to user
    };
  }
}