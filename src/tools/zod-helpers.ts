import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export function toMcpInputSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // zod v4 typings vs zod-to-json-schema's zod v3 generic — runtime is compatible.
  return zodToJsonSchema(schema as never, { target: "openApi3" }) as Record<
    string,
    unknown
  >;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown) => Promise<unknown>;
}
