# Local Ollama manager

## Behaviour

`packages/app/src/services/ollama/**` contains a bounded loopback client,
connection diagnostics, installed/running model operations, a paginated catalog
cache, installed/catalog reconciliation, hardware evidence and fit evaluation,
a persistent pull queue, and local streaming chat/session utilities.

The catalog source is the public Ollama library over HTTPS; model execution uses
Ollama's local loopback API. No cloud model service is introduced. The modules
are not wired through IPC/preload and have no renderer surface at `6e7760b`.

## Configuration

The loopback base URL defaults to the documented local service. Callers provide
bounded timeouts, response limits, catalog refresh/cache policy, pull
parallelism, fit assumptions, and validated chat parameters.

## Failure modes

- Missing, stopped, unhealthy, incompatible, offline, or malformed local APIs
  produce distinct diagnostic states.
- Catalog refresh can be unavailable or stale; cached state must remain labeled
  with its age and completeness rather than guessed current.
- Missing RAM, VRAM, driver, disk, blob, parameter, quantization, or context
  evidence must produce a conservative or unknown fit verdict.
- No harness-launch, configuration snapshot, restore, or failed-launch rollback
  module exists in this baseline service directory.

## Security considerations

Loopback requests belong in the privileged process and must validate bounded
responses. Chat prompts, attachments, model payloads, environment values,
secrets, and private paths must stay local and out of logs, captures, exports,
and public records. Model pulls are downloads, never purchases.

## Verification

No focused committed suite, exhaustive live-catalog proof, real Ollama
interaction, packaged UI path, or capture is recorded at `6e7760b`. Source
presence does not prove catalog completeness, hardware fit, pull recovery,
streaming chat, or offline recovery.

## Suggested articles

- [Regex-powered search](../regex-search.md)
- [Notifications](../notifications.md)
- [Platform service index](./README.md)
