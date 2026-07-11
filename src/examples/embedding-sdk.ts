import { EmbeddingDatasetBuilder, EmbeddingRecordValidator, EmbeddingSplitPlanner } from "../embeddings/index.js";
export async function runEmbeddingSdkExample() {
  const builder = new EmbeddingDatasetBuilder();
  const validation = await new EmbeddingRecordValidator().validate(
    (async function* () {
      yield* builder.records();
    })(),
  );
  const splitPlan = new EmbeddingSplitPlanner().plan(builder.records(), { salt: "documented-example" });
  return { validation, splitPlan };
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
  console.log(JSON.stringify(await runEmbeddingSdkExample()));
