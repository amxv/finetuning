# Endpoint settings - Runpod Documentation

**URL:** https://docs.runpod.io/serverless/endpoints/endpoint-configurations

> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.runpod.io/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.runpod.io/serverless/endpoints/endpoint-configurations#content-area)

[Docs](https://docs.runpod.io/overview) [Examples](https://docs.runpod.io/tutorials/introduction/overview) [Community](https://docs.runpod.io/community-solutions/overview) [CLI](https://docs.runpod.io/flash/cli/overview) [API](https://docs.runpod.io/api-reference/overview) [Models](https://docs.runpod.io/public-endpoints/models/flux-dev) [Release notes](https://docs.runpod.io/release-notes)

This guide details the configuration options available for Runpod Serverless endpoints.

Some settings can only be updated after deploying your endpoint. See [Edit an endpoint](https://docs.runpod.io/serverless/endpoints/overview#edit-an-endpoint).

## [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#quick-reference)  Quick reference

| Setting | Default | Description |
| --- | --- | --- |
| **Active workers** | 0 | Always-on workers (eliminates cold starts) |
| **Max workers** | 3 | Maximum concurrent workers |
| **GPUs per worker** | 1 | GPU count per worker instance |
| **Idle timeout** | 5s | Time before idle worker shuts down |
| **Execution timeout** | 600s (10 min) | Max job duration |
| **Job TTL** | 24h | Total job lifespan in system |
| **FlashBoot** | Enabled | Faster cold starts via state retention |

## [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#general-configuration)  General configuration

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#endpoint-name)  Endpoint name

Display name for identifying your endpoint in the console. Does not affect the endpoint ID used for API requests.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#endpoint-type)  Endpoint type

**Queue-based endpoints** use a built-in queueing system with guaranteed execution and automatic retries. Ideal for async tasks, batch processing, and long-running jobs. Implemented using [handler functions](https://docs.runpod.io/serverless/workers/handler-functions).**Load balancing endpoints** route traffic directly to workers, bypassing the queue. Designed for low-latency applications like real-time inference or custom REST APIs. See [Load balancing endpoints](https://docs.runpod.io/serverless/load-balancing/overview).

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#gpu-configuration)  GPU configuration

Determines the hardware tier for your workers. Select multiple GPU categories to create a prioritized fallback list. If your first choice is unavailable, Runpod automatically uses the next option. Selecting multiple types improves availability during high demand.

| **GPU type(s)** | **Memory** | **Cost per second** | **Description** |
| --- | --- | --- | --- |
| A4000, A4500, RTX 4000 | 16 GB | $0.00016 | The most cost-effective for small models. |
| L4, A5000, 3090 | 24 GB | $0.00019 | Great for small-to-medium sized inference workloads. |
| 4090 PRO | 24 GB | $0.00031 | Extreme throughput for small-to-medium models. |
| A6000, A40 | 48 GB | $0.00034 | A cost-effective option for running big models. |
| L40, L40S, 6000 Ada PRO | 48 GB | $0.00053 | Extreme inference throughput on LLMs like Llama 3 7B. |
| A100 | 80 GB | $0.00076 | High throughput GPU, yet still very cost-effective. |
| H100 PRO | 80 GB | $0.00116 | Extreme throughput for big models. |
| 6000s PRO | 96 GB | $0.00111 | High throughput for large model inference workloads. |
| H200 PRO | 141 GB | $0.00155 | Extreme throughput for huge models. |
| B200 | 180 GB | $0.00240 | Maximum throughput for huge models. |

#### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#gpu-priority-and-worker-distribution)  GPU priority and worker distribution

Specify up to three GPU types in priority order when configuring an endpoint. Runpod uses this ranking to distribute workers across available GPUs, improving availability during high demand.For endpoints with five or more workers, Runpod distributes workers across your selected GPU priorities. Most workers run on your primary GPU type, with fewer assigned to secondary and tertiary selections. This reduces throttling when your primary GPU is constrained.For endpoints with fewer than five workers, all workers use the highest-priority GPU type available.

## [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#worker-scaling)  Worker scaling

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#active-workers)  Active workers

Minimum number of workers that remain warm and ready at all times. Setting this to 1+ eliminates cold starts. Active workers incur charges continuously, including when idle.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#max-workers)  Max workers

Maximum concurrent instances your endpoint can scale to. Acts as a cost safety limit and concurrency cap. Set ~20% higher than expected max concurrency to handle traffic spikes smoothly.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#gpus-per-worker)  GPUs per worker

Number of GPUs assigned to each worker instance. Default is 1. Generally prioritize fewer high-end GPUs over multiple lower-tier GPUs.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#auto-scaling-type)  Auto-scaling type

**Queue delay**: Adds workers when requests wait longer than the threshold (default: 4 seconds). Best when slight delays are acceptable for higher utilization.**Request count**: More aggressive scaling based on pending + active work. Formula: `Math.ceil((requestsInQueue + requestsInProgress) / scalerValue)`. Use scaler value of 1 for max responsiveness. Recommended for LLM workloads or frequent short requests.

## [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#lifecycle-and-timeouts)  Lifecycle and timeouts

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#idle-timeout)  Idle timeout

How long a worker stays active after completing a request before shutting down. You’re billed during idle time, but the worker remains warm for immediate processing. Default: 5 seconds.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#idle-endpoint-scale-down)  Idle endpoint scale-down

Runpod automatically scales down endpoints that go a long time without any requests, so unused endpoints don’t keep consuming your account balance.

- After 3 days with no requests, the endpoint’s max workers is reduced to 2 and Runpod sends you an email notification.
- After 7 days with no requests, max workers is set to 0.

This scale-down is automatic and system-driven, and the timer is based on request activity, so any incoming request resets it.Once an endpoint has been scaled down this way, it stays at its reduced max workers until you raise the value yourself. To use the endpoint again, increase its max workers in the Runpod console. To prevent an endpoint from scaling down in the first place, make sure it continues to receive requests.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#execution-timeout)  Execution timeout

Maximum duration for a single job. When exceeded, the job fails and the worker stops. Keep enabled to prevent runaway jobs. Default: 600s (10 min). Range: 5s to 7 days.Configure in **Advanced** settings, or override per-request via `executionTimeout` in the [job policy](https://docs.runpod.io/serverless/endpoints/send-requests#execution-policies).

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#job-ttl-time-to-live)  Job TTL (time-to-live)

Total lifespan of a job in the system. When TTL expires, job data is deleted regardless of state (queued, running, or completed). Default: 24 hours. Range: 10s to 7 days.The timer starts at submission, not execution. If a job queues for 45 minutes with a 1-hour TTL, only 15 minutes remain for execution.

TTL is a hard limit. If it expires while a job is running, the job is immediately removed and status checks return 404. Set TTL to cover both expected queue time and execution time.

Override per-request via `ttl` in the [job policy](https://docs.runpod.io/serverless/endpoints/send-requests#execution-policies).

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#result-retention)  Result retention

| Request type | Retention | Notes |
| --- | --- | --- |
| Async (`/run`) | 30 min | Retrieve via `/status/{job_id}` |
| Sync (`/runsync`) | 1 min | Returned in response; also available via `/status/{job_id}` |

Results are permanently deleted after retention expires.

## [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#performance-features)  Performance features

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#flashboot)  FlashBoot

Reduces cold starts by retaining worker state after spin-down, allowing faster “revival” than fresh boots. Most effective on endpoints with consistent traffic where workers frequently cycle between active and idle.
Both new GPU and CPU endpoints will have FlashBoot enabled by default, and you can edit existing endpoints to enable or disable FlashBoot.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#model)  Model

Select from [cached models](https://docs.runpod.io/serverless/endpoints/model-caching) to schedule workers on machines with model files pre-loaded. Significantly reduces model loading time during initialization.

## [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#advanced-settings)  Advanced settings

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#data-centers)  Data centers

Restrict your endpoint to specific regions. For maximum availability, allow all data centers:restricting decreases the available GPU pool.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#network-volumes)  Network volumes

[Network volumes](https://docs.runpod.io/storage/network-volumes) provide persistent storage across worker restarts. Tradeoffs: adds network latency and restricts your endpoint to the volume’s data center. Use only when you need shared persistence or datasets exceeding container limits.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#cuda-version-selection)  CUDA version selection

Ensures workers run on machines with compatible drivers. Select your required version plus all newer versions, since CUDA is backward compatible and a wider range increases available hardware.

### [​](https://docs.runpod.io/serverless/endpoints/endpoint-configurations\#expose-http/tcp-ports)  Expose HTTP/TCP ports

Exposes the worker’s public IP and port for direct external communication. Required for persistent connections like WebSockets.

Was this page helpful?

YesNo

[Suggest edits](https://github.com/runpod/docs/edit/main/serverless/endpoints/endpoint-configurations.mdx) [Raise issue](https://github.com/runpod/docs/issues/new?title=Issue%20on%20docs&body=Path:%20/serverless/endpoints/endpoint-configurations)

[Previous](https://docs.runpod.io/serverless/endpoints/operation-reference) [Cached modelsAccelerate worker cold starts and reduce costs by using cached models.\\
\\
Next](https://docs.runpod.io/serverless/endpoints/model-caching)

Ctrl+I

Ask AI Ctrl I

Runpod Assistant

Hi! How can I help you with Runpod today?
