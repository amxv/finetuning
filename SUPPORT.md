# Alpha stability and support policy

Version `0.0.x` is an alpha: canonical version negotiation, legacy commands/imports, and documented offline examples are compatibility-tested, while unresolved large-model recipes remain gated and unsupported for unattended production use.

- Node.js 20.19, 22, and 24 are tested. Python 3.9+ is supported for the dependency-free contract runner.
- Security fixes and data-loss defects take priority. Reports should contain no credentials, provider envelopes, personal data, or model weights.
- Provider networking, model downloads, CUDA, paid calls, uploads, and remote code are never implicit.
- Deprecations are documented in the changelog and migration guide and retain compatibility for at least one subsequent alpha minor unless a security issue requires earlier removal.
- Apache-2.0 covers this repository's code; users remain responsible for dataset rights, teacher terms, model licenses, privacy, trademarks, and regulated uses.
