# Kudos board

Post a kudos (`from`, `to`, `message`) and see the list, newest first. A single page served from S3 calls an
API Gateway HTTP API backed by one Node.js Lambda and a DynamoDB table, all defined in one CDK app and deployed
to [MiniStack](https://pypi.org/project/ministack/) on your laptop.

| Folder     | What it holds                                                          |
| ---------- | ---------------------------------------------------------------------- |
| `api/`     | The Lambda handler: `GET /kudos` and `POST /kudos`                     |
| `web/`     | The page (plain HTML and TypeScript, built by Vite)                    |
| `infra/`   | The CDK app: table, function, HTTP API and web bucket                  |
| `scripts/` | `deploy:local` and `smoke`                                             |

## Requirements

Node 22, pnpm (the version pinned in `package.json`, via `corepack enable`) and Docker for MiniStack.

## Develop

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

## Deploy locally

```sh
docker run -d --name ministack -p 4566:4566 ministackorg/ministack:1.5.33
pnpm deploy:local
```

`pnpm deploy:local` targets `AWS_ENDPOINT_URL` (default `http://localhost:4566`) with dummy credentials,
bootstraps and deploys the CDK app, uploads the page and its `config.json` (`{"apiUrl": "…"}`) to the web
bucket, and prints two lines on stdout, the web URL first:

```
Web URL: http://localhost:4566/<bucket>/index.html
API URL: http://localhost:4566/_aws/execute-api/<apiId>/$default
```

MiniStack does not serve a bucket's index document, so the web URL names `index.html`. `config.json` is served
both beside it and at `<web url>/config.json`. When MiniStack is unreachable, the deploy exits 1 naming `AWS_ENDPOINT_URL`.

## Smoke test

```sh
pnpm smoke <web url>
```

It reads the API URL from the `config.json` beside the page and prints one line per check, exiting non-zero
when any fails:

- `page-loads`: the web URL returns 200 HTML
- `list-kudos`: `GET /kudos` returns a JSON array
- `post-kudos`: a posted kudos is then returned by `GET /kudos`

## API

- `GET /kudos` returns `200` and the kudos as a JSON array, newest first.
- `POST /kudos` with `{"from", "to", "message"}` returns `201` and the stored item
  (`id`, `from`, `to`, `message`, `createdAt`). A missing or empty field returns `400` with
  `{"error": "<field> is required …"}`; a message longer than 280 characters (Unicode code points,
  after trimming) returns `400` with `{"error": "message must be at most 280 characters"}`; a body
  that is not a JSON object returns `400`.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: install, lint, typecheck and tests,
then MiniStack as a service container, `pnpm deploy:local` and `pnpm smoke` on the web URL it printed.
