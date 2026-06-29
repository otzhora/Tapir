# Engineering Principles

## No Code Smells

If code smells, it needs to go. Prefer simple, direct, well-factored code that leaves the project better than it found it. The best PR is often the PR that removes more code than it adds.

Quality is not a later cleanup phase. Do not knowingly add bad abstractions, hidden coupling, sprawling files, dead paths, vague names, or clever code when a clearer design is available.

## Full-Stack Type Safety

Full-stack type safety is mandatory. Shared contracts should describe the boundary between renderer, main process, storage, OpenAPI, and future hosted services.

Avoid `any` and untyped request/response IPC. When data crosses a process or package boundary, define the contract in shared TypeScript and make both sides compile against it.
