export interface AgentTool<Input, Output> {
  name: string;
  description: string;
  execute(input: Input): Promise<Output>;
}
