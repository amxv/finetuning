import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeBatchFile(outputPath: string, contents: string, force: boolean): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contents, { flag: force ? "w" : "wx" });
}

export function printDatasetSummary(summary: {
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  messageCount: number;
  toolCallCount: number;
  toolResultCount: number;
  rowsWithTools: number;
  averageMessagesPerRow: number;
  languageCounts: Record<string, number>;
}): void {
  console.log(`Rows: ${summary.rowCount}`);
  console.log(`Valid rows: ${summary.validRowCount}`);
  console.log(`Invalid rows: ${summary.invalidRowCount}`);
  console.log(`Messages: ${summary.messageCount}`);
  console.log(`Tool calls: ${summary.toolCallCount}`);
  console.log(`Tool results: ${summary.toolResultCount}`);
  console.log(`Rows with tools: ${summary.rowsWithTools}`);
  console.log(`Average messages per row: ${summary.averageMessagesPerRow.toFixed(2)}`);
  const languageEntries = Object.entries(summary.languageCounts);
  if (languageEntries.length > 0) {
    console.log(`Languages: ${languageEntries.map(([locale, count]) => `${locale}=${count}`).join(", ")}`);
  }
}
