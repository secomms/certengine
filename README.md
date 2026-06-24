# Cert Engine — Documentation

## Overview

**Cert Engine** is a microservice for **blockchain-based certification of production data**. It takes batches of data, anchors a cryptographic fingerprint (a Merkle root) of them onto an Ethereum-compatible blockchain through a single transaction, and later lets anyone prove that a given piece of data was certified — without revealing the data itself and without trusting the issuer's word.

It is designed to be **integrated into an existing application**, not used directly by end users. A company runs its own backend however it likes (with or without Docker, in any language) and calls Cert Engine over HTTP as an internal certification module: the backend submits data to be certified, starts the on-chain certification, downloads the proofs, and uses them for later verification. Cert Engine handles everything blockchain-related — Merkle tree construction, gas estimation, nonce management, transaction signing and broadcasting, proof generation and verification — so the host application does not have to.

Because each on-chain certification **spends real gas** from a configured wallet, Cert Engine is meant to live on an **internal network**, reachable only by the backend that integrates it, and is protected by a shared **API key**.

This guide is structured as follows:

* **APIs** — reference of all endpoints for certification, verification, statistics and monitoring, including which ones require authentication.
* **API responses** — the standardized success and error JSON envelopes.
* **Configuration** — `.env` setup for every supported topology (Docker vs Local, Vault vs no-Vault), which secrets go where, and how to create the API key.
* **Running Cert Engine** — commands for development, debug and production.
* **Connecting to Cert Engine** — network topologies and how a backend authenticates and calls the service.
* **Testing** — the test suites, the scenarios they cover, and how to run them.

## Features

- **On-chain data certification** — anchors a Merkle root of batched data onto an
  Ethereum-compatible blockchain in a single transaction.
- **Privacy-preserving** — only a cryptographic fingerprint is published on-chain;
  the data itself never leaves your infrastructure.
- **Independent verification** — verify any certified document against its proof and
  the on-chain transaction, checking both data integrity and issuer authenticity.
- **Full certification lifecycle** — request, abort, certify, download proofs,
  acknowledge deletion, and check ticket status via a simple HTTP API.
- **Gas-price estimation** — current gas price in GWEI with estimated cost in EUR
  and confirmation time.
- **API-key authentication** — all certification and statistics endpoints are
  protected by a shared `X-API-Key`.
- **Usage statistics** — per-owner and aggregate stats on certifications and expenses.
- **Monitoring** — Prometheus metrics and a health-check endpoint.
- **Flexible configuration** — secrets from a local `.env` or from Infisical Vault;
  runs locally or via Docker Compose with MongoDB and Redis.

## Associated publication

This repository contains the Cert Engine software module accompanying the paper `An Open and Cost-Effective Architecture for Blockchain-based Production Data Certification`.

## APIs

All endpoints are mounted under `/api`. Authenticated endpoints require the shared secret in the `X-API-Key` HTTP header (see [Connecting to Cert Engine](#connecting-to-cert-engine)). Requests without a valid key receive `401 Unauthorized`.

### Monitoring endpoints (no authentication)

These two endpoints are intentionally left open so that health checks and Prometheus scraping work without credentials.

| Method | Path           | Parameters                | Data returned        | Auth | Description                                         |
|--------|----------------|---------------------------|----------------------|------|-----------------------------------------------------|
| GET    | `/api/ping`    | `query:{message:"PING"}`  | `"PONG"`             | No   | Checks if Cert Engine is reachable.                 |
| GET    | `/api/metrics` | —                         | `Prometheus metrics` | No   | Application metrics, to be scraped by Prometheus.   |

### Certification endpoints (API key required)

| Method | Path                   | Parameters                                                                                                                       | Data returned                                                                                                                                       | Auth | Description                                                                                                                                                                                                                                                                                            |
|--------|------------------------|---------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| POST   | `/api/requestCert`     | `body:{owner:OWNER, user:USER_REQUESTING, data:[{id:dataID, toBeCertified:[{field1: value1}, ...]}, ...], hashAlgorithm:ALGO}`   | `{ticket: TICKET}`                                                                                                                                  | Yes  | Submits new data (a list of JSON documents) to be certified. If provided, `hashAlgorithm` is used to hash the submitted data; if omitted, `sha256` is used. Returns the `ticket` of the waiting queue, which the caller must store to later certify and download. **All data within the same certification procedure must use the same hash algorithm.** Allowed algorithms: `sha256`, `sha384`, `sha512`, `sha224`, `sha3-256`, `sha3-512`. |
| DELETE | `/api/abortCert`       | `query:{owner:OWNER, id:dataID, ticket:TICKET}`                                                                                  | —                                                                                                                                                  | Yes  | Reverts the certification request for a given document. Works only if the certification procedure has not started yet (the queue is still open).                                                                                                                                                        |
| GET    | `/api/getGasPrice`     | —                                                                                                                               | `{baseFee, maxPriorityFeePerGas, maxFeePerGas, minPriceEUR, maxPriceEUR, estimatedTime}`                                                            | Yes  | Returns the current suggested gas price, expressed in **GWEI**, together with an estimated cost in EUR and an estimated confirmation time. The wallet used is the default one configured in the environment.                                                                                             |
| POST   | `/api/certify`         | `body:{owner:OWNER, user:USER_REQUESTING, ticket:TICKET, gasPrice:{baseFee:X, maxPriorityFeePerGas:X, maxFeePerGas:X}}`          | `{blockchainName, blockchainURL, transactionHash, transactionTimestamp, priceEUR, wallet, userID}`                                                  | Yes  | Starts the certification procedure for the documents identified by `ticket`, using the supplied `gasPrice` expressed in **GWEI**. The transaction is signed and broadcast with the default wallet configured in the environment. On success, returns the on-chain transaction details.                  |
| GET    | `/api/downloadCert`    | `query:{owner:OWNER, ticket:TICKET}`                                                                                            | `{proofs:[{id:dataID, proof:P}, ...], hashAlgorithm:ALGO, blockchainName, blockchainURL, transactionHash, transactionTimestamp}`                    | Yes  | Returns the certification proof for every document under the given `ticket`, each tagged with its data identifier. **After downloading, the caller must call `/api/ackDownload` to confirm receipt and trigger deletion of the ticket's data.**                                                          |
| DELETE | `/api/ackDownload`     | `query:{owner:OWNER, ticket:TICKET}`                                                                                            | —                                                                                                                                                  | Yes  | Confirms that the certification proof has been downloaded. Triggers the definitive deletion of all data related to the ticket.                                                                                                                                                                          |
| POST   | `/api/verify`          | `body:{proof:PROOF, transactionHash:TXHASH, data:DATA, blockchainURL:URL, hashAlgorithm:ALGO}`                                   | `{valid:BOOL, integrity:{passed:BOOL, reason:STR}, authenticity:{passed:BOOL, reason:STR}}`                                                         | Yes  | Verifies a single document against its proof and the on-chain data. `integrity` checks that the data matches the certified Merkle root; `authenticity` checks that the certifying wallet is the authorized issuer. `valid` is `true` only if both pass.                                                   |
| GET    | `/api/getTicketStatus` | `query:{owner:OWNER, ticket:TICKET}`                                                                                            | `{status: STATUS}`                                                                                                                                  | Yes  | Returns the status of a ticket. Possible values: `"Open"`, `"Transacting"`, `"To be downloaded"`.                                                                                                                                                                                                       |

> **Note on parameters.** `ticket` must be a valid Mongo ObjectId. `transactionHash` must be a `0x`-prefixed 32-byte hex string. `gasPrice` and its three sub-fields are **required** on `/api/certify` and must be non-negative numbers.

### The `toBeCertified` field

Each document submitted to `/api/requestCert` has an `id` and a `toBeCertified` field. `toBeCertified` is an **array of single-field JSON objects**, one object per field of the document:

```json
{
  "id": "BATCH-001",
  "toBeCertified": [
    { "ITEMID": "SUP/5811" },
    { "QTA": "400" },
    { "BATCH": "fake01" }
  ]
}
```

The array is hashed as a whole to form one leaf of the Merkle tree, so its **exact form is part of the proof**. When verifying later via `/api/verify`, the `data` field must be byte-for-byte the same `toBeCertified` array that was certified — same fields, **same order**, same values. Two practical consequences:

- **Order matters.** `[{"A":1},{"B":2}]` and `[{"B":2},{"A":1}]` produce different leaves and will not verify against each other. Always submit and re-submit fields in the same order.
- **Values are compared as serialized.** To avoid ambiguity between, say, the number `400` and the string `"400"` (which serialize differently and produce different hashes), keep each value's representation stable between certification and verification. When in doubt, submit values as strings.
### Statistics endpoints (API key required)

| Method | Path                         | Parameters                                | Data returned                                                                                                                                                                | Auth | Description                                                                    |
|--------|------------------------------|-------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------|-------------------------------------------------------------------------------|
| GET    | `/api/getTransactions`       | `query:{page:n1, elemsPerPage:n2, owner:OWNER}` | `{docs:[doc1,...,docN], count:C}`                                                                                                                                       | Yes  | All transactions, paginated and sorted by timestamp. `owner` is optional.     |
| GET    | `/api/getCertificationStats` | `query:{owner:OWNER}`                     | `[{"_id":{"year":2026,"month":3}, "totalCertifications":42, "totalSpentEUR":1.92}, ...]`                                                                                     | Yes  | Statistics on certification executions. `owner` is optional.                  |
| GET    | `/api/getExpenses`           | `query:{owner:OWNER}`                     | `[{"_id":{"year":2026,"month":3}, "totalTransactions":120, "totalSpentEUR":4.51}, ...]`                                                                                      | Yes  | Statistics on blockchain expenses. `owner` is optional.                       |
| GET    | `/api/getUsageStats`         | —                                         | `{totalStats:[...], transactionsByType:[...], monthlyStats:[...], blockchainUsage:[...], mostActiveOwners:[...]}`                                                            | Yes  | Aggregated usage statistics across all owners.                                |

## API responses

Every endpoint returns a standardized envelope, produced by the success and error handlers in `responseHandlers/`. On success:

```json
{
  "success": true,
  "data": {
    "message": "Operation completed successfully",
    "result": "DATA RETURNED"
  }
}
```

On error:

```json
{
  "success": false,
  "error": "Error Message"
}
```

The HTTP status codes returned are:

- `200` — request handled correctly
- `400` — malformed request (failed validation)
- `401` — missing or invalid API key
- `404` — resource not found
- `409` — conflicting state (e.g. certifying a ticket already in progress, or downloading a ticket not yet certified)
- `500` — internal error

## Configuration

Cert Engine is configured entirely through environment variables. The application reads a single `.env` file located at `src/.env`. Two example templates are provided — `.env.example` (the application environment) and `docker/.env.example` (the Compose environment) — copy them to `src/.env` and `docker/.env` and fill in the values.

There are **two orthogonal choices** to make, which together define your setup.

### Choice 1 — Infrastructure: Docker vs Local

This determines the **hostnames** used to reach MongoDB and Redis.

* **Docker** (recommended): Mongo and Redis run as containers, reachable by their service names.
  ```env
  MONGO_DATABASE_CONNECTION_STRING="mongodb://<MONGO_ROOT_USER>:<MONGO_ROOT_PASSWORD>@mongo_certengine:27017/certengine?authSource=admin"
  REDIS_HOST="redis_certengine"
  ```
  The Mongo containers are started with authentication enabled, so the connection string **must** include the credentials from `docker/.env` and `?authSource=admin`.

* **Local** (e.g. `npm start` with Mongo/Redis installed on the machine):
  ```env
  MONGO_DATABASE_CONNECTION_STRING="mongodb://127.0.0.1:27017/certengine"
  REDIS_HOST="127.0.0.1"
  ```

### Choice 2 — Secret management: Vault vs no-Vault

This determines **where the secret values come from**, controlled by `USE_VAULT`.

* **`USE_VAULT="false"`** — all secrets are read directly from `src/.env`. Simplest setup; fill in every value in the file.

* **`USE_VAULT="true"`** — sensitive values are pulled at runtime from **Infisical**. In this mode, the secret fields in `src/.env` are left empty and the values are stored in the Vault instead. Only the Vault credentials and the non-secret configuration stay in the file:
  ```env
  USE_VAULT="true"
  VAULT_CLIENT_ID="..."
  VAULT_CLIENT_SECRET="..."
  VAULT_PROJECT_ID="..."
  ```
  The Infisical **environment slug** queried is taken from `NODE_ENV` (`dev` or `prod`), so the secrets must be stored under the matching environment in your Infisical project.

  The following keys **must exist in the Vault** when `USE_VAULT="true"`:

  | Vault key                          | What it is                                              |
    |------------------------------------|---------------------------------------------------------|
  | `SERVICE_API_KEY`                  | Shared secret for the `X-API-Key` header                |
  | `MONGO_DATABASE_CONNECTION_STRING` | MongoDB connection string (with credentials)            |
  | `REDIS_PASSWORD`                   | Redis password                                          |
  | `SENDER_ADDR`                      | Certifying wallet address                               |
  | `SENDER_PRIVKEY`                   | Certifying wallet private key (funded with ETH)         |
  | `RECEIVER_ADDR`                    | Receiver address of the certification transactions      |
  | `ETHERSCAN_KEY`                    | Etherscan API key (used on Ethereum Mainnet)            |
  | `OWLRACLE_KEY`                     | Owlracle API key (used on Sepolia)                      |

The two choices are independent: you can run on Docker with or without the Vault, and locally with or without the Vault. The infrastructure choice affects only the Mongo/Redis hostnames; the Vault choice affects only where secret values are sourced.

### Creating the API key

Cert Engine authenticates the **calling backend** (not end users) with a single shared secret. Generate a strong random value:

```bash
openssl rand -hex 32
```

Set the **same value** in two places:

1. Cert Engine — as `SERVICE_API_KEY` in `src/.env` (or in the Vault when `USE_VAULT="true"`).
2. The calling backend — wherever it stores secrets, so it can send the key on every request.

The service **refuses to start** if `SERVICE_API_KEY` is empty, to prevent running an unprotected instance by accident. Never commit a real key; keep the field empty in any template you publish. To rotate the key, update both sides; with a single key, expect a brief window of `401`s until the backend is updated.

### Prerequisites

1. Copy `.env.example` to `src/.env` and `docker/.env.example` to `docker/.env`, then fill them in for your chosen setup.
2. Obtain API keys for the gas-price oracles (the free tier of each is sufficient):
    - **Etherscan** — https://etherscan.io/apis (used on Ethereum Mainnet)
    - **Owlracle** — https://owlracle.info/sepolia (used on Sepolia)
    - **Infisical** *(optional, only if `USE_VAULT="true"`)* — https://infisical.com/
3. Provide two Ethereum accounts (sender and receiver) with their addresses, and the **private key of the sender**. We suggest **MetaMask**. The sender account must be funded with enough ETH to cover gas fees — on a testnet, use a faucet.
4. The EUR conversion of gas costs uses Binance's public price API and requires no key.

> The sender and receiver may be the same account: certification transactions carry no value (`value: 0`) and only write the Merkle root on-chain, so a single funded wallet is sufficient.
## Running Cert Engine

### Local execution

For development and debugging on the host machine. Requires Node.js (v18+) and local instances of MongoDB and Redis.

```bash
npm install
npm start          # production-style start
npm run dev        # auto-reload on file changes (nodemon)
```

### Docker execution (recommended)

This brings up Cert Engine together with MongoDB and Redis. The Compose project uses an **external** network, which must be created once:

```bash
docker network create certengine_network
```

Then, from the `docker/` directory (so the relative paths to `../src/.env` resolve):

```bash
cd docker
docker compose up --build -d
```

For a development container with the source mounted and live reload (`npm run dev`), and with Mongo/Redis exposed on the host's loopback for inspection, use the debug override:

```bash
docker compose -f docker-compose.yaml -f docker-compose.debug.yaml up --build
```

#### Production notes

* Set `NODE_ENV="prod"` so the application emits **structured JSON logs** on stdout (pretty, colorized logs are used only in `dev`).
* Log **rotation** is handled by Docker, not by the application: the Compose file configures the `json-file` driver with `max-size: 10m` and `max-file: 5`. Adjust to your retention needs, or point the container at your own logging driver / log collector.
* Keep `LOG_LEVEL` at `info` or `warn` in production. Use `debug`/`trace` only for troubleshooting.

## Connecting to Cert Engine

Cert Engine is an **internal service**. The first line of defense is the network: it should only be reachable by the backend that integrates it. The second line is the API key.

### Network topology

The Compose file does **not** expose Cert Engine to the public by default. Choose the binding that matches where your backend runs (configured via `CERTENGINE_BIND` in `docker/.env`):

* **Backend inside the same Docker network** — the safest option. Comment out the `ports` block in the Compose file and keep only `expose`; the backend reaches Cert Engine at `http://certengine:5001`, unreachable from outside the Docker network.
* **Backend on the same host but outside Docker** — the default. The port is published on `127.0.0.1:5001` only, reachable from the host's loopback but not from external networks.
* **Backend on another host in a private network** — set `CERTENGINE_BIND="<internal-ip>:5001"` to bind on the internal interface.

> **Never** bind on `0.0.0.0` if Cert Engine is reachable from untrusted networks — it signs transactions with a funded private key. MongoDB and Redis are never exposed; they remain reachable only by Cert Engine inside the Docker network.

This `docker-compose.yaml` is an **example**. If you deploy with Kubernetes, a reverse proxy, or your own Compose file, apply the same principle: keep Cert Engine off untrusted networks and rely on the API key as the application-level barrier.

### Making a request

Every call to an authenticated endpoint must carry the `X-API-Key` header. For example, requesting a certification:

```bash
curl -X POST http://127.0.0.1:5001/api/requestCert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <YOUR_SERVICE_API_KEY>" \
  -d '{
        "owner": "AcmeCorp",
        "user": "line-operator@acme.example",
        "data": [
          { "id": "BATCH-001", "toBeCertified": [{ "ITEMID": "SUP/5811" }, { "QTA": "400" }] }
        ],
        "hashAlgorithm": "sha256"
      }'
```

A typical end-to-end flow from the backend is: `requestCert` (obtain a `ticket`) → `getGasPrice` → `certify` (with that ticket and gas price) → `downloadCert` (obtain proofs) → `ackDownload` (confirm and trigger cleanup). Later, anyone can call `verify` with a document, its proof, and the on-chain transaction details to confirm certification.

## Testing

The test suites live under `test/unit_testing/`. They are **integration tests**: they run the app in-process and exercise it against real MongoDB, Redis and (for the gas suite) the configured blockchain. They require Mongo and Redis to be running, and they read `SERVICE_API_KEY` from the same environment the service uses, so the key the tests send and the key the service validates are always identical.

### Scenarios covered

* **Certification procedure** (`cert-procedure_test.mjs`) — the full happy path: request certification for individual and batched data, abort an element, fetch the gas price, certify, download proofs, acknowledge deletion, verify correct data (valid) and mismatched data (invalid), and enforce a single hash algorithm per owner.
* **Authentication** (`auth_test.mjs`) — protected endpoints reject requests with no key or a wrong key (`401`); `/ping` and `/metrics` work without a key; authentication runs **before** validation; a correct key reaches the controller.
* **Input validation** (`validation_test.mjs`) — malformed requests across every endpoint return `400`: missing/typed-wrong fields, non-array `data`, unknown extra fields, unsupported hash algorithms, invalid ticket ids, invalid gas prices, malformed transaction hashes and URLs, bad ping messages.
* **Flow errors** (`flow_errors_test.mjs`) — non-existent tickets return `404` (or `409` for `certify`, with no gas spent); out-of-order operations are rejected (download before certify → `409`, ack before download → `409`); aborting a non-existent ticket never `500`s; an uncertified ticket reports status `Open`.
* **Malicious input** (`malicious_test.mjs`) — NoSQL-injection attempts (operator objects in place of `owner`/`ticket`/`id`) cannot read another owner's data and never reach the database malformed; payload-abuse attempts (very large arrays, deeply nested objects, oversized fields) get a clean response without crashing or hanging.
* **Gas-spending anomalies** (`gas_operations_test.mjs`) — real-transaction edge cases: a double `certify` on the same ticket is rejected without a second transaction; concurrent `certify` calls result in exactly one winner; concurrent appends are never lost; a zero-gas `certify` never succeeds and leaves the ticket reusable.

### Running the tests

```bash
npm test
```

By default this runs every suite **except** the gas-spending one, which is skipped because it broadcasts real transactions and spends testnet ETH. To include it:

```bash
RUN_GAS_TESTS=true npm test
```

To see the full request/response of each step (useful when a test fails), enable verbose logging:

```bash
PRINT_LOG=true npm test
```

The test runner sets `LOG_LEVEL=silent` so server error stacks are not visible but can be modified in package.json with `LOG_LEVEL=error`.