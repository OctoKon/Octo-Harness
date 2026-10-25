# Contributing

Keep changes focused and include the validation you ran. Start with the [research index](research/docs/README.md) and [master plan](MASTER-PLAN.md).

Install documentation tools with `npm ci --ignore-scripts`. Before a pull request, run:

```sh
npm run format:check
npm run lint:markdown
npm run check:docs
npm run test:docs
```

Use `npm run format` to apply Markdown/JSON/YAML formatting. Add direct public primary sources and an access date for research claims. Distinguish documentation, proposal and measurement; never copy private project material, secrets, or internal incident details into public contributions.

Pull requests to `main` use squash merging and require the configured reviews and checks. Commits use `feat|fix|refactor|docs|test|chore|perf|ci: description`. New runtime code must bring its language-specific formatter, type/lint checks, behavior tests, and CodeQL configuration before adoption. Research coverage does not establish license permission to copy upstream code.
