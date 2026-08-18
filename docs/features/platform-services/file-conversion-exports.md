# File conversion and export

## Behaviour

`packages/app/src/services/converter/**` provides byte-based type detection, a
categorized adapter registry, bounded single-file conversion, atomic output,
destination-capacity preflight, and a paged persistent queue with pause, resume,
cancellation, recovery, and per-item outcomes. The registry includes bundled
structured-data, archive, text, and binary-encoding adapters and visible
disabled entries for unavailable formats.

`packages/app/src/services/exports/**` provides serializers for JSON, JSONL,
YAML, TOML, XML, CSV/TSV, Markdown, HTML, and SQL, plus ZIP/7z option models and
secret-exclusion helpers.

At `6e7760b`, these APIs have no IPC/preload registration or renderer surface.

## Configuration

Every converter adapter declares source signatures, target format, bundled
state, loss disclosure, resource limits, and optional output validation. Queue
callers provide paged discovery, bounded concurrency, durable state location,
and an approved destination. Export callers choose only formats that can
faithfully represent their record shape.

## Failure modes

- Unknown, malformed, encrypted, oversized, unsupported, or unbundled input is
  rejected without modifying the source.
- An existing destination requires explicit overwrite confirmation.
- A full destination, cancelled operation, validator failure, or adapter limit
  prevents publication of a partial final file.
- Several canonical categories, especially PDF, image, audio, and video, are
  represented as unavailable rather than falsely enabled.

## Security considerations

Detection trusts bounded bytes, not extensions. Converters require bounded
input/output, recursion, time, memory, and temporary-storage behavior. Paths
inside archives must not escape the destination. Ordinary exports must omit
secrets and state that omission; a deliberate secrets export would require a
separate explicit destructive confirmation path.

## Verification

No focused committed suite, packaged adapter proof, IPC interaction, UI flow,
or capture is recorded at `6e7760b`. Source review shows the registry and queue
contracts, but it does not prove every enabled adapter in a packaged app,
constant-memory behavior under a long queue, or converter output round trips.

## Suggested articles

- [Destructive-action confirmation](../super-confirm.md)
- [Regex-powered search](../regex-search.md)
- [Platform service index](./README.md)
