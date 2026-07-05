import type { PreparedRequestValidationIssue, ServerVariable } from "./index";

export interface VariableResolutionOptions {
  variables?: ServerVariable[];
  validationIssues?: PreparedRequestValidationIssue[];
  field?: string;
}

export function resolveVariables(value: string, options: VariableResolutionOptions = {}): string {
  if (!value.includes("{{")) return value;
  const variables = new Map((options.variables ?? []).map((variable) => [variable.key, variable.value]));
  return value.replace(/{{\s*([^{}\s][^{}]*?)\s*}}/g, (token, rawName: string) => {
    const name = rawName.trim();
    if (variables.has(name)) return variables.get(name) ?? "";
    options.validationIssues?.push({
      field: options.field ?? name,
      message: `${name} is not set for this server.`
    });
    return token;
  });
}

export function variablesToRecord(variables: ServerVariable[] = []): Record<string, string> {
  return Object.fromEntries(variables.map((variable) => [variable.key, variable.value]));
}
