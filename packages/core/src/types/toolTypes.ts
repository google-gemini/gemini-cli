export interface Tool<Args extends object, Output = string> {
  name: string;
  description: string;
  execute: (args: Args) => Promise<Output>;
}
