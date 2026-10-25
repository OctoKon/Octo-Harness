# Local chat frontend

This package adds conversations to Build while retaining the existing demo-run workflow under Runs. Pi integration, inference, transcription and repository edits are not connected.

## Build contract

- Dependency: the existing buildless frontend, native browser APIs and local browser storage. No runtime package or hosted service is added.
- Files: `chat.js`, `chat.css`, the existing app shell, entry HTML and frontend checks.
- Fixture: synthetic messages and a non-private text attachment.
- Command: `npm run test:frontend` plus the repository documentation checks.
- Expected failures: empty sends are rejected; oversized files are rejected; unavailable clipboard, microphone and persistent file storage have recoverable messages.
- Done: send, copy, edit, model-label selection, conversation history, draft restoration, file persistence/download and chat export operate locally without claiming AI execution.

## Available controls

Build opens the chat composer. Send accepts text, files or both; Ctrl/Cmd+Enter sends and Enter adds a new line. Each message has Edit message and Copy message at its lower-right. Editing changes the local message only. New chat and recent conversations appear in the sidebar, with the complete list under Chats. Save chat downloads a JSON transcript with attachment metadata; attachments download separately.

The plus menu offers Add files and Add images. Up to five attachments per message are accepted, each at most 10 MB. File bytes remain in IndexedDB, with metadata in the existing local-storage state. Unsupported or blocked IndexedDB falls back to the current visit with a warning. Raster images preview inline; audio plays locally. HTML and SVG files are never rendered as active documents. The frontend does not change original files or repository files.

Model selection stores a label. Configure the generation model or optional additional local model IDs in Models. Choosing a label does not download or run a model.

The microphone records a local voice note after browser permission, stops after 60 seconds, and releases microphone tracks on stop, errors or navigation. Sending is blocked while recording or attaching files. Speech recognition is intentionally absent because a browser recognition service can transmit audio externally. A future local backend will supply transcription and AI replies.

## Storage and limits

Conversations are limited to 100 chats and 200 messages per chat. Limits reject additional sends rather than silently removing messages. Existing version-two demo state migrates without clearing runs, memory bookmarks or preferences. Saved message data is validated and escaped on reload. Browser storage can be cleared by the browser or OS; export material you want to keep. This is browser storage, not a repository or account sync service.

## Qualification

The frontend check executes the real event handlers for empty/text/file-only sends, edits, escaping, model labels, reload normalization and pending attachment guards. Failure checks cover clipboard denial, microphone denial, file limits and unavailable persistent storage. Browser checks verify copy contents, edit rendering, file attachment and download after reload, draft restoration, model switching, JSON export, chat history and responsive containment.

Physical microphone recording has not been tested; no ambient audio was captured during verification. Pi inference, actual model loading, transcription, tool execution and real file edits remain unqualified and unconnected.

Native API references: [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [microphone access](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [clipboard writing](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText), and [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).
