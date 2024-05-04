<p align="center">
  <a href="https://wvm.dev">
    <img src="https://raw.githubusercontent.com/weaveVM/.github/main/profile/bg.png">
  </a>
</p>

## Synopsis

elciao is an EVM light client indexer for [ao](https://ao.arweave.dev). It works by feeding a constant stream of EVM data (Ethereum, for this proof of concept) to an ao process, storing all future EVM block metadata and proofs on Arweave in perpituity and making that available natively to other ao processes by default.

## Build & Setup

Clone the repository and set up the environment:

```bash
git clone https://github.com/weavevm/elciao.git
cd elciao
docker compose up --build
```

After building the repository locally, update the environment variables according to `.env.example`. Once updated, run the following command to deploy the application:

```bash
docker compose up --build
```
After deployment, grab the deployed AO process ID.

For hosting on the cloud (e.g., Heroku), import the `.env` variables, including the `PROCESS_ID`, to your cloud service provider.

## Tech stack
- [AO](https://ao.arweave.dev) : indexing / infra
- [Lodestar](https://github.com/ChainSafe/lodestar) : light client
- [Patronum](https://github.com/commonprefix) : RPC Proxy

## What elciao enables

Pushing EVM data to Arweave creates a permanent record of EVM history and exposes that history to dApps built on ao. Permanence of Ethereum history is an unsolved problem, and current bypasses rely on unincentivized archival nodes for storage.

[EIP-4444](https://eips.ethereum.org/EIPS/eip-4444) proposes a system like what we have built, using a storage-focused chain like Arweave as a guarantee that Ethereum data can always be recalled by client apps that need it, like block explorers and API interfaces for RPCs.

Storage guarantees aside, by exposing EVM data to ao elciao makes it so ao processes can verify transactions and smart contract states from EVM chains in a lightweight way, and ensure that data related to state changes, transaction outcomes and other proofs are always available.

Right now, EVM tooling on ao is in its very early stages of development, but once ao processes can call EVM libraries like ethers.js, ao processes can read from an elciao node to:
 
- Use a trustless data and assets bridge with Ethereum and other EVMs
- Trustlessly read data from Ethereum, with availability on ao which can facilitate building highly secure and decentralized wallets and infra

Check our live elciao testing node on [ao.link](https://ao.link/entity/zrAYK49KEAXKcB4r3XsfD3ap_ydfqRxElvGU7zEvKqU)

## License
This project is licensed under the [MIT License](./LICENSE)


