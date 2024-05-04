import log from "./logger.js";
import * as dotenv from "dotenv";
dotenv.config();

import Web3 from "web3";
import { Chain } from "@ethereumjs/common";
import { VerifyingProvider } from "./provider.js";
import { startServer } from "./express-server.js";
import { PROXIED_RPC_URL } from "./constants.js";

const PORT = process.env.PORT ? process.env.PORT : 3000;

const POLLING_DELAY = 13 * 1000; // 13s

async function main() {
  const web3 = new Web3(PROXIED_RPC_URL);
  const block = await web3.eth.getBlock("latest");
  const provider = new VerifyingProvider(
    PROXIED_RPC_URL,
    BigInt(block.number),
    block.hash,
    Chain.Mainnet,
  );

  setInterval(async () => {
    const block = await web3.eth.getBlock("latest");
    log.debug(`Received a new blockheader: ${block.number} ${block.hash}`);
    provider.update(block.hash, BigInt(block.number));
  }, POLLING_DELAY);
  await startServer(provider, PORT);
}


main();
