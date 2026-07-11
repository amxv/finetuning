import assert from "node:assert/strict";
import { test } from "node:test";
import { providerDistillation } from "../dist/cli/distill-provider.js";
import { RestRunPodLifecycleBackend, ensureIndependentVolume } from "../dist/execution/runpod/lifecycle.js";
const config = {
  runId: "r",
  salt: "s",
  generator: { provider: "openai", model: "g" },
  judge: { provider: "anthropic", model: "j" },
};
test("provider CLI gates and injected adapters", async () => {
  const prices = {
    generationInputPerMillion: 1,
    generationOutputPerMillion: 2,
    judgingInputPerMillion: 1,
    judgingOutputPerMillion: 2,
  };
  assert.throws(
    () =>
      providerDistillation(
        config,
        {
          network: false,
          generationCredentialEnv: "G",
          judgingCredentialEnv: "J",
          generationBudget: 1,
          judgingBudget: 1,
          ...prices,
        },
        { G: "x", J: "y" },
      ),
    /NETWORK_OPT_IN/,
  );
  assert.throws(
    () =>
      providerDistillation(
        config,
        {
          network: true,
          generationCredentialEnv: "G",
          judgingCredentialEnv: "J",
          generationBudget: 1,
          judgingBudget: 1,
          ...prices,
        },
        {},
      ),
    /CREDENTIAL_MISSING/,
  );
  let calls = 0;
  const p = providerDistillation(
    config,
    {
      network: true,
      generationCredentialEnv: "G",
      judgingCredentialEnv: "J",
      generationBudget: 1,
      judgingBudget: 1,
      ...prices,
    },
    { G: "x", J: "y" },
    () => ({
      async invoke() {
        calls++;
        return { kind: "text", content: "ok" };
      },
    }),
  );
  await p.generator.generate({ requestId: "1", sampleId: "s", provider: "openai", model: "g", messages: [] });
  await p.generator.generate({ requestId: "1", sampleId: "s", provider: "openai", model: "g", messages: [] });
  assert.equal(calls, 1);
  assert.throws(
    () =>
      providerDistillation(
        config,
        {
          network: true,
          generationCredentialEnv: "G",
          judgingCredentialEnv: "J",
          generationBudget: 1,
          judgingBudget: 1,
          ...prices,
          generationInputPerMillion: 0,
        },
        { G: "x", J: "y" },
      ),
    /PRICE_REQUIRED/,
  );
});
test("REST lifecycle exact mutations and opt-in", async () => {
  const calls = [];
  const transport = {
    async request(path, init = {}) {
      calls.push([path, init]);
      if (path === "/pods" && init.method === "POST")
        return {
          id: "p",
          name: "n",
          image: "sha",
          networkVolume: { id: "v", name: "volume", size: 50, dataCenterId: "US-TX-3" },
          desiredStatus: "RUNNING",
          env: { AMXV_OWNERSHIP_MARKER: "own", AMXV_SPEC_HASH: "spec" },
        };
      return [];
    },
  };
  const input = { name: "n", imageDigest: "sha", ownershipMarker: "own", specHash: "spec", volumeId: "v" };
  await assert.rejects(
    new RestRunPodLifecycleBackend(transport, false).createPod(input),
    /unavailable pending qualification/,
  );
  await assert.rejects(
    new RestRunPodLifecycleBackend(transport, true).createPod(input),
    /unavailable pending qualification/,
  );
  assert.equal(calls.length, 0, "all opt-in flags still produce zero mutation transport calls");
});
test("REST lifecycle parses only pinned Pod.networkVolume and metadata-free volume shapes", async () => {
  const backend = new RestRunPodLifecycleBackend({
    async request(path) {
      if (path === "/pods")
        return [
          {
            id: "pod-1",
            name: "pinned-pod",
            image: "registry.example/image@sha256:abc",
            desiredStatus: "RUNNING",
            networkVolume: { id: "volume-1", name: "durable", size: 50, dataCenterId: "US-TX-3" },
            env: { AMXV_OWNERSHIP_MARKER: "owner", AMXV_SPEC_HASH: "spec" },
          },
        ];
      return [{ id: "volume-1", name: "durable", size: 50, dataCenterId: "US-TX-3" }];
    },
  });
  assert.equal((await backend.listPods())[0].volumeId, "volume-1");
  assert.deepEqual((await backend.listVolumes())[0], {
    id: "volume-1",
    name: "durable",
    sizeGiB: 50,
    dataCenterId: "US-TX-3",
    ownershipMarker: "",
  });
  const invented = new RestRunPodLifecycleBackend({
    async request() {
      return [{ id: "pod-1", name: "old", image: "sha", desiredStatus: "RUNNING", networkVolumeId: "volume-1" }];
    },
  });
  await assert.rejects(invented.listPods(), /unknown Pod response fields/);
});
test("independent volume ensure adopts only exact owned shape", async () => {
  const volumes = [];
  let creates = 0;
  const backend = {
    async listVolumes() {
      return volumes;
    },
    async createVolume(v) {
      creates++;
      const made = { ...v, id: "v1" };
      volumes.push(made);
      return made;
    },
  };
  const wanted = { name: "owned", sizeGiB: 40, dataCenterId: "US", ownershipMarker: "mark" };
  assert.equal((await ensureIndependentVolume(backend, wanted)).id, "v1");
  assert.equal((await ensureIndependentVolume(backend, wanted)).id, "v1");
  assert.equal(creates, 1);
  volumes[0].sizeGiB = 41;
  await assert.rejects(ensureIndependentVolume(backend, wanted), /shape mismatch/);
  volumes[0].sizeGiB = 40;
  volumes[0].ownershipMarker = "foreign";
  await assert.rejects(ensureIndependentVolume(backend, wanted), /foreign/);
});
