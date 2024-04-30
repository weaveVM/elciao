// TODO: currently its just a demo script, make it a test
import log from './logger.js';
import * as dotenv from 'dotenv';
dotenv.config();

import Web3 from 'web3';
import { Chain } from '@ethereumjs/common';
import { VerifyingProvider } from './provider.js';
import { startServer } from './express-server.js';

const RPC_URL = process.env.RPC_URL || 'https://eth.llamarpc.com';
const RPC_URL_WS = process.env.RPC_URL_WS;
// Metamask doesn't allow same RPC URL for different networks
const PORT = process.env.PORT ? process.env.PORT : 3000;
const CHAIN = process.env.CHAIN_ID === '5' ? Chain.Goerli : Chain.Mainnet;
const POLLING_DELAY = 13 * 1000; //13s

async function main() {
  const web3 = new Web3(RPC_URL);
  const block = await web3.eth.getBlock('latest');
  const provider = new VerifyingProvider(
    RPC_URL,
    BigInt(block.number),
    block.hash,
    CHAIN,
  );
  if (RPC_URL_WS) {
    const web3Sub = new Web3(RPC_URL_WS);
    web3Sub.eth
      .subscribe('newBlockHeaders')
      .on('connected', () => {
        log.info('Subscribed to new blockHeaders');
      })
      .on('data', blockHeader => {
        log.info(
          `Received a new blockheader: ${blockHeader.number} ${blockHeader.hash}`,
        );
        provider.update(blockHeader.hash, BigInt(blockHeader.number));
      })
      .on('error', console.error);
  } else {
    setInterval(async () => {
      const block = await web3.eth.getBlock('latest');
      log.debug(`Received a new blockheader: ${block.number} ${block.hash}`);
      provider.update(block.hash, BigInt(block.number));
    }, POLLING_DELAY);
  }
  await startServer(provider, PORT);
}

main();