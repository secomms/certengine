# certengine - Documentation

## Overview
This documentation provides a comprehensive guide to **Cert Engine**, a microservice designed for blockchain-based data certification. The guide is structured as follows:

* **APIs**: A detailed reference of all available endpoints for certification, verification, and usage monitoring.
* **Response Formats**: Standardized success and error JSON structures used by the service.
* **Configuration**: Detailed instructions for `.env` setup, including infrastructure options (Docker vs. Local) and secret management (Standard vs. Infisical Vault).
* **Execution Guide**: Step-by-step instructions for environment prerequisites, local deployment, Docker containerization, and automated testing.


## Associated publication
This repository contains the Cert Engine software module accompanying the paper `An Open and Cost-Effective Architecture for Blockchain-based Production Data Certification`.

## APIs

| Method | Path           | Parameters                | Data returned        | Description                                         |
|--------|----------------|---------------------------|----------------------|-----------------------------------------------------|
| GET    | `/api/ping`    | `query:{message:"PING}" ` | `{"PONG"}`           | Checks if certEngine is reachable                   |
| GET    | `/api/metrics` | `-`                       | `Prometheus metrics` | Returns app metrics to be collected from Prometheus |


| Method | Path                   | Parameters                                                                                                                     | Data returned                                                                                                                                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
|--------|------------------------|--------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| POST   | `/api/requestCert`     | `body:{owner:OWNER, user:USER_REQUESTING, data:[{id:dataID, toBeCertified:[{field1: value1}, ...]}, ...], hashAlgorithm:ALGO}` | `{ticket: TICKET}`                                                                                                                                      | Takes new data (list of JSON) to be certified. If defined, the `hashAlgorithm` is used to hash submitted data. Returns the ticket of the waiting queue. Such information must be stored by the requester in order to request and download certification. If `hashAlgorithm` is not given, `SHA256` will be used. **Important**: multiple data inside the same certification procedure (multiple certification requests) must use the same **hash algorithm**.                 |
| DELETE | `/api/abortCert`       | `query:{owner: OWNER, id: dataID, ticket:TICKET}`                                                                              | -                                                                                                                                                       | Revert the certification request for a given document. It works if the certification procedure has not started                                                                                                                                                                                                                                                                                                                                                                |
| GET    | `/api/getGasPrice`     | `-`                                                                                                                            | `{baseFee:BFee, maxPriorityFeePerGas: MPFPG, maxFeePerGas:MFPG, minPriceEUR:p1, maxPriceEUR:p2, estimatedTime:T}`                                       | Obtain the current gas price in **GWEI**. Multiple information are given.                                                                                                                                                                                                                                                                                                                                                                                                     |
| POST   | `/api/certify`         | `body:{owner: OWNER, user:USER_REQUESTING, gasPrice:{baseFee: X, maxPriorityFeePerGas:X, maxFeePerGas: X}, ticket:TICKET}`     | `{blockchainName: NAME, blockchainURL: URL, transactionHash: HASH, transactionTimestamp: TS, userID:USER, priceEUR:p}`                                  | Data owner starts the certification procedure, the list of documents identified by `ticket` and eventually the `gasPrice` expressed in **GWEI**. If the connection is still open after the transaction procedure completed, information are returned and data inside local database is not deleted.                                                                                                                                                                           |
| GET    | `/api/downloadCert`    | `query:{owner: OWNER, ticket: TICKET}`                                                                                         | `{proofs: [{id:data1ID, proof:P}, ...], hashAlgorithm:ALGO, blockchainName: NAME, blockchainURL: URL, transactionHash: HASH, transactionTimestamp: TS}` | Obtain the certification proof for all the data corresponding to the submitted `ticket`. `proofs` are returned for each data by following the certification request order and are marked with the data identifier submitted when requesting certification. **Important**: after the response is completed, all the information belonging to the `ticket` MUST be deleted! To do so, you must call the `api/ackDownload` to confirm you downloaded all the certification data. |
| DELETE | `/api/ackDownload`     | `query:{owner: OWNER, ticket: TICKET}`                                                                                         | -                                                                                                                                                       | Confirm that the certification proof has been downloaded. It triggers the definitive deletion of all data related to the ticket.                                                                                                                                                                                                                                                                                                                                              |
| POST   | `/api/verify`          | `body:{proof: PROOF, transactionHash: TXHASH, data: DATA, blockchainURL: URL, hashAlgorithm: ALGO}`                            | `{valid: BOOL, integrity: {passed: BOOL, reason: STRING}, authenticity: {passed: BOOL, reason: STRING}}`                                                | Verify a certified record by recomputing its Merkle root and checking it against the on-chain root (integrity), and by checking the anchoring sender against the authorized issuer (authenticity). `valid` is the conjunction of both checks.                                                                                                                                                                                                                                 |
| GET    | `/api/history`         | `query:{page: n1, elemsPerPage: n2}`                                                                                           | `{docs: [{blockchainURL: url, blockchainName: name, transactionHash: h, transactionTimestamp: ts, priceEUR: eur}, ...], total: n}`                      | Returns the transactions history paginated of all the **owners**.                                                                                                                                                                                                                                                                                                                                                                                                             |
| GET    | `/api/getTicketStatus` | `query:{owner: OWNER, ticket: TICKET}`                                                                                         | `{status: STATUS}`                                                                                                                                      | Obtain the status for a given ticket. Possible status are `"Open" \| "To be downloaded" \| "Transacting" `                                                                                                                                                                                                                                                                                                                                                                    |


### Statistics

| Method | Path                         | Parameters                               | Data returned                                                                                                                                                                                                                                                                                                                                                                                                                                | Description                                                                   |
|--------|------------------------------|------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| GET    | `/api/getTransactions`       | `query:{page:CURR_PG, elemsPerPage:EPP}` | `{docs: [doc1,..., docN],  count:C}`                                                                                                                                                                                                                                                                                                                                                                                                         | Get all transactions paginated and sorted by timestamp                        |
| GET    | `/api/getCertificationStats` | `query:{owner:OWNER}`                    | `[{"_id": { "year": 2026, "month": 3 },"totalCertifications": 42,"totalSpentEUR": 1.92}]`                                                                                                                                                                                                                                                                                                                                                    | Get statistics on certifications executions. Restriction on owner is optional |
| GET    | `/api/getExpenses`           | `query:{owner:OWNER}`                    | `[{"_id": {"year": 2026,"month": 3},"totalTransactions": 120,"totalSpentEUR": 4.51}, ...]`                                                                                                                                                                                                                                                                                                                                                   | Get statistics on blockchain expenses                                         |
| GET    | `/api/getUsageStats`         | `-`                                      | `{"totalStats": [{"totalTransactions": 1240,"totalSpentEUR": 54.32,"avgTransactionCost": 0.043}],"transactionsByType": [{"_id": "CERTIFICATION","total": 700,"spent": 22.21 }],"monthlyStats": [{"_id": { "year": 2026, "month": 3 },"transactions": 120,"spent": 4.32 }],"blockchainUsage": [{"_id": "Ethereum-Sepolia","transactions": 1240,"spent": 54.32 }],"mostActiveOwners": [{"_id": "Owner1","transactions": 400,"spent": 18.9 }]}` | Get usage statistics                                                          |


### APIs responses
The APIs responses provided by each API follow the formatting defined in the handlers
`responseHandlers/handlerSuccessRequest.js` and `responseHandlers/handlerErrorRequest.js`. If the request is correctly
formulated and processed, we get a response formatted as follows:

```json
{
  "success": true,
  "data": {
    "message": "Operation completed successfully",
    "result": "DATA RETURNED"
  }
}
```


In the event of an error, the server will respond with the following JSON
```json
{
   "success": false,
   "error": "Error Message"
}
```
The HTTP status codes provided in response are:
- 200 (request handled correctly)
- 400 (poorly formulated request)
- 404 (resource not found)
- 500 (internal error)


## .env Configuration

The `.env` file must be created at the following path: `certengine/src/.env`.
A sample of `.env` is already present considering a deployment based on Docker and without the use of Infisical Vault.


### ⚠️ Infrastructure Note: Docker vs Local
When configuring your database and cache connections, the hostnames depend on your environment:

* **Docker Deployment**: Use the service names defined in your `docker-compose.yml`.
    ```env
    MONGO_DATABASE_CONNECTION_STRING="mongodb://mongo_certengine:27017/certengine"
    REDIS_HOST="redis_certengine"
    ```
* **Local Deployment** (e.g., `npm start`): Use `localhost` or `127.0.0.1`.
    ```env
    MONGO_DATABASE_CONNECTION_STRING="mongodb://127.0.0.1:27017/certengine"
    REDIS_HOST="127.0.0.1"
    ```

---

### Option 1: Standard Configuration (No External Vault)
Use this setup if you want to manage all secrets directly within the `.env` file.

```env
# Vault Toggle
USE_VAULT="false"

# Server & Node Configuration
CERT_ENGINE_PORT="5001"
MAIN_SERVER_URL="http://localhost"
PROJECT_NAME="certengine"
NODE_ENV="dev" # Options: dev, prod
LOG_LEVEL="info"

# Database & Redis (See Infrastructure Note above)
MONGO_DATABASE_CONNECTION_STRING=""
REDIS_HOST=""
REDIS_PORT="6379"
REDIS_PASSWORD=""

# Blockchain Certification Configs
GAS="23000"
BLOCKCHAIN_URL=""  # Your RPC URL
BLOCKCHAIN_NAME="Ethereum-Sepolia" # or "Ethereum Mainnet" 
CHAIN_ID="11155111"    # IDs: Mainnet: 1, Sepolia: 11155111

# External Services API Keys
ETHERSCAN_KEY="" # API for Ethereum Mainnet
OWLRACLE_KEY=""  # API for Sepolia
CRYPTOCOMPARE_KEY=""

# Blockchain Accounts
SENDER_ADDR=""
SENDER_PRIVKEY=""
RECEIVER_ADDR=""
```

### Option 2: Infisical Vault Configuration
Use this setup if you prefer to fetch sensitive credentials (API Keys, Private Keys, Passwords) from **Infisical** instead of storing them locally.

```env
# Vault Toggle
USE_VAULT="true"

# Server & Node Configuration
CERT_ENGINE_PORT="5001"
MAIN_SERVER_URL="http://localhost"
PROJECT_NAME="certengine"
NODE_ENV="dev"
LOG_LEVEL="info"

# Database & Redis Infrastructure (See Infrastructure Note above)
MONGO_DATABASE_CONNECTION_STRING=""
REDIS_HOST=""
REDIS_PORT="6379"

# Blockchain General Configs
GAS="23000"
BLOCKCHAIN_URL=""   # Your RPC URL
BLOCKCHAIN_NAME="Ethereum-Sepolia" # or "Ethereum Mainnet"
CHAIN_ID="11155111"  # IDs: Mainnet: 1, Sepolia: 11155111, Hoodie: 560048


# Infisical Vault Credentials
# These are required to authenticate and pull secrets at runtime
VAULT_CLIENT_ID=""
VAULT_CLIENT_SECRET=""
VAULT_PROJECT_ID=""
```

## Execution Guide

### Prerequisites
1. Start from the following `.env` template (configured for execution on Docker without Infisical Vault). It must be created in path `certengine/src/.env`
```
USE_VAULT=false

# Server config
CERT_ENGINE_PORT='5001'
MAIN_SERVER_URL='http://localhost'

# Node config
NODE_ENV='dev' # 'prod'
LOG_LEVEL='info'

# Nome dei database
PROJECT_NAME='certengine'

# Mongodb config
#MONGO_DATABASE_CONNECTION_STRING = 'mongodb://127.0.0.1:27017/certengine'
MONGO_DATABASE_CONNECTION_STRING='mongodb://mongo_certengine:27017/certengine'

# Redis config
#REDIS_HOST="127.0.0.1"
REDIS_HOST="redis_certengine"
REDIS_PORT="6379"
REDIS_PASSWORD="password"

GAS="23000"

# ETHEREUM
BLOCKCHAIN_URL='https://ethereum-sepolia-rpc.publicnode.com'
BLOCKCHAIN_NAME='Ethereum-Sepolia'
CHAIN_ID=11155111

# External Services API Keys
ETHERSCAN_KEY="" # API for Ethereum Mainnet
OWLRACLE_KEY=""  # API for Sepolia
CRYPTOCOMPARE_KEY=""

# Blockchain Accounts
SENDER_ADDR=""
SENDER_PRIVKEY=""
RECEIVER_ADDR=""
```
2. Obtain an API key for the following services (the free version of every service is sufficient):
   - Etherscan https://etherscan.io/apis
   - Owlracle https://owlracle.info/sepolia
   - Cryptocompare (Guide: https://www.cryptocompare.com/coins/guides/how-to-use-our-api/)
   - Infisical (**OPTIONAL**) https://infisical.com/
3. Obtain 2 Ethereum account: one for the sender, one for the receiver. **Private keys must be accessible**. We suggest the use of **MetaMask**. The sender account must be funded with sufficient ETH to cover gas fees for transactions (use a faucet).
4. Populate the .env file accordingly to your configuration (Docker/Local and Infisical/hardcoded secrets)

### Local Execution
Use this method for development and debugging. Ensure you have Node.js (v18+) and a local instance of MongoDB and Redis running.

**Install dependencies:**
```bash
npm install
```

**Run certengine**
```bash
npm start
```

### Docker Execution (Recommended)
This is the preferred method for production-like environments as it handles all dependencies (MongoDB, Redis) automatically via containers.

**Build and start all services:**
```bash
docker-compose up --build -d
```
## Integration Test Coverage
Run the following command
```bash
npm test
```

This integration test suite validates the complete certification lifecycle exposed by the API, ensuring that the service behaves correctly across both normal and failure scenarios.

### Covered behaviors

- **Account initialization**
  - Verifies that the blockchain sender account is properly configured and exposes the required credentials.

- **Certification request workflow**
  - Verifies that the API accepts certification requests for both single documents and document batches.
  - Confirms that each accepted request returns a valid certification ticket.

- **Request cancellation**
  - Verifies that a pending certification request can be cancelled before it is processed.

- **Blockchain fee retrieval**
  - Verifies that the API returns the gas fee parameters required to submit the certification transaction.

- **Certification processing**
  - Verifies that pending certification requests can be successfully processed and committed on-chain.

- **Proof retrieval**
  - Verifies that completed certifications can be downloaded together with their associated proof set and blockchain metadata.

- **Download finalization**
  - Verifies that proof download acknowledgement is correctly handled by the API.

- **Post-download cleanup**
  - Verifies that once a certification has been downloaded and acknowledged, it is no longer available for further retrieval.

- **Positive verification path**
  - Verifies that original certified data is successfully validated against the corresponding proof and blockchain transaction.

- **Negative verification path**
  - Verifies that tampered or mismatched data is correctly rejected during verification.

- **Hashing consistency enforcement**
  - Verifies that all certification requests within the same workflow use a consistent hashing algorithm.
  - Confirms that requests using a different hashing algorithm are rejected.

