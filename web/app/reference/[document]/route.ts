import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const documents = {
  validation: "validation.md",
  parameters: "parameters.md",
  assumptions: "assumptions.md",
  learning: "learning-sandbox.md",
} as const;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ document: string }> },
) {
  const { document } = await params;
  if (!Object.hasOwn(documents, document))
    return new Response("Unknown study document", { status: 404 });
  const name = documents[document as keyof typeof documents];
  return new Response(await readFile(resolve(process.cwd(), "../docs", name), "utf8"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
