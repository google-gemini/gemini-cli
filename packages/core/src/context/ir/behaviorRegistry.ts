import type { Content, Part } from '@google/genai';
import type { ConcreteNode } from './types.js';

export interface IrSerializationWriter {
  appendContent(content: Content): void;
  appendModelPart(part: Part): void;
  appendUserPart(part: Part): void;
  flushModelParts(): void;
}

export interface IrNodeBehavior<T extends ConcreteNode = ConcreteNode> {
  readonly type: T['type'];
  
  /** Serializes the node into the Gemini Content structure. */
  serialize(node: T, writer: IrSerializationWriter): void;
  
  /**
   * Generates a structural representation of the node for the purpose
   * of estimating its token cost.
   */
  getEstimatableParts(node: T): Part[];
}

export class IrNodeBehaviorRegistry {
  private readonly behaviors = new Map<string, IrNodeBehavior<any>>();

  register<T extends ConcreteNode>(behavior: IrNodeBehavior<T>) {
    this.behaviors.set(behavior.type, behavior);
  }

  get(type: string): IrNodeBehavior<any> {
    const behavior = this.behaviors.get(type);
    if (!behavior) {
      throw new Error(`Unregistered IrNode type: ${type}`);
    }
    return behavior;
  }
}
