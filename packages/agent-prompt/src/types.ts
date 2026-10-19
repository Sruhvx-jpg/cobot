export interface ToolDefinition {
  name: string;
  description: string;
}

export interface CustomSection {
  tag: string;
  content: string;
}

export interface PromptExtension {
  cwd: string;
  identity?: string;
  extraTools?: Array<ToolDefinition | string>;
  extraRules?: string[];
  extraDogmas?: string[];
  customSections?: CustomSection[];
}
