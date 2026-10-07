# Search client reliability

- Requests are debounced, started only while the palette is open, and cancelled on query changes or closure.
- Rendered results must match the current query and retry attempt. Responses from aborted requests cannot update state.
- Transport rejects non-success HTTP status, malformed payloads and protocol-relative result links. Error output is a fixed Arabic message, not a raw server response.
- Loading and failure states are distinct from an empty successful search. Retry uses a new attempt identifier.
- Three focused transport tests passed, covering request encoding/no-store/cancellation, failed or malformed responses, and cancellation rejection. Targeted ESLint and production build passed.
- Tests exercise the transport, not an interactive browser or React lifecycle; production browser race/retry behavior remains unverified.
