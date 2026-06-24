# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] — 2026-06-24

Initial release.

### Added
- Blockchain-based certification of production data: batched data is anchored on-chain through a single Merkle-root transaction.
- Certification lifecycle API: request, abort, certify, download proofs, acknowledge deletion, and check ticket status.
- Independent verification endpoint (data integrity + issuer authenticity).
- Gas-price estimation with EUR cost and confirmation-time estimates.
- API-key authentication (`X-API-Key`) for all certification and statistics endpoints.
- Usage and expense statistics endpoints.
- Prometheus metrics and a health-check endpoint.
- Configurable secret management: local `.env` or Infisical Vault.
- Docker Compose deployment with MongoDB and Redis.