# 🛡️ Midnight Shield

> Privacy-preserving credential & state verification powered by Midnight & Compact.

[![Network: Preview/Preprod](https://img.shields.io/badge/Network-Preview%2FPreprod-blue)](https://docs.midnight.network)
[![Built with Compact](https://img.shields.io/badge/Language-Compact-purple)](https://docs.midnight.network)

---

## Product Idea

**Midnight Shield** is a privacy-first verification protocol built on the Midnight network using Compact smart contracts. It enables users to generate zero-knowledge proofs of local, off-chain witness data—such as identity attributes, access credentials, or threshold balances—without ever exposing raw sensitive information to the public ledger. By decoupling private witness execution from on-chain public state updates, Midnight Shield delivers seamless compliance and verification while protecting user privacy by default.

---

## Public State vs. Private Witness

In Compact smart contracts on Midnight, data handling is explicitly separated into **Public State** and **Private Witness**:

- **Public State:** Data that is permanently recorded on-chain and visible to all network participants. This includes ledger variables, contract balances, public keys, and current state roots. It represents the shared ground truth verified by consensus nodes.
- **Private Witness:** Data that remains strictly off-chain on the user's local machine or client runtime. It comprises secret inputs, private keys, raw identity attributes, or pre-images required to generate zero-knowledge proofs. The contract logic operates on private witnesses locally to produce zk-proofs without ever revealing the raw underlying values to the public ledger.

---

## Local Setup & Installation

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** / **yarn** / **pnpm**
- **Compact Compiler Toolchain** installed and configured in your system path (`compact compile --version`)

### 1. Installation

Clone the repository and install project dependencies:

```bash
git clone https://github.com/swd-dev00/midnight-shield.git
cd midnight-shield
npm install
```
