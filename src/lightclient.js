import { getClient } from "@lodestar/api";
import { createChainForkConfig } from "@lodestar/config";
import { networksChainConfig } from "@lodestar/config/networks";
import { Lightclient, LightclientEvent } from "@lodestar/light-client";
import { LightClientRestTransport } from "@lodestar/light-client/transport";
import {
  getFinalizedSyncCheckpoint,
  getGenesisData,
  getLcLoggerConsole,
} from "@lodestar/light-client/utils";
import { toHexString } from "@chainsafe/ssz";
import { bufferToHex } from "@ethereumjs/util";
import { toBuffer, keccak256 } from "ethereumjs-util";
import { indexBlockOnAo } from "./ao/utils/connect.js";
import { spawnProcess } from "./ao/utils/setup.js";
import log from "./logger.js";
import { BEACON_RPC_URL } from "./constants.js";

const config = createChainForkConfig(networksChainConfig.mainnet);
const logger = getLcLoggerConsole({ logDebug: Boolean(process.env.DEBUG) });
const api = getClient(
  { urls: [BEACON_RPC_URL] },
  { config },
);

export async function main() {
  const lightclient = await Lightclient.initializeFromCheckpointRoot({
    config,
    logger,
    transport: new LightClientRestTransport(api),
    genesisData: await getGenesisData(api),
    checkpointRoot: await getFinalizedSyncCheckpoint(api),
    opts: {
      allowForcedUpdates: true,
      updateHeadersOnForcedUpdate: true,
    },
  });

  await checkNodeSetup();
  await lightclient.start();

  lightclient.emitter.on(
    LightclientEvent.lightClientOptimisticHeader,
    async (finalityUpdate) => {
      log.info(`Received a new block: ${finalityUpdate.execution.blockNumber}`);

      const blockRes = await lightclient["transport"]["api"].beacon.getBlockV2(
        Number(finalityUpdate.beacon.slot),
      );
      const res = await handleBlockV2(
        finalityUpdate,
        blockRes.response.data.message.body.executionPayload,
      );
    },
  );
}

async function handleBlockV2(finalityUpdate, res) {
  const beacon = finalityUpdate.beacon;

  const symbols = Object.getOwnPropertySymbols(beacon);
  const sszCachedPermanentRoot = symbols[0];
  const value = beacon[sszCachedPermanentRoot];

  beacon.slot = String(beacon.slot);
  beacon.proposerIndex = String(beacon.proposerIndex);
  beacon.parentRoot = bufferToHex(beacon.parentRoot);
  beacon.stateRoot = bufferToHex(beacon.stateRoot);
  beacon.bodyRoot = bufferToHex(beacon.bodyRoot);
  beacon["ssz_cached_permanent_root"] = bufferToHex(value);
  delete beacon[sszCachedPermanentRoot];
  const execution = res;
  execution.blockNumber = String(execution.blockNumber);
  execution.gasLimit = String(execution.gasLimit);
  execution.gasUsed = String(execution.gasUsed);
  execution.timestamp = String(execution.timestamp);
  execution.baseFeePerGas = String(execution.baseFeePerGas);
  execution.blobGasUsed = String(execution.blobGasUsed);
  execution.excessBlobGas = String(execution.excessBlobGas);

  execution.parentHash = bufferToHex(execution.parentHash);
  execution.feeRecipient = bufferToHex(execution.feeRecipient);
  execution.stateRoot = bufferToHex(execution.stateRoot);
  execution.receiptsRoot = bufferToHex(execution.receiptsRoot);
  execution.logsBloom = bufferToHex(execution.logsBloom);
  execution.prevRandao = bufferToHex(execution.prevRandao);
  execution.blockHash = bufferToHex(execution.blockHash);
  execution.transactionsRoot = bufferToHex(execution.transactionsRoot);
  execution.withdrawalsRoot = bufferToHex(execution.withdrawalsRoot);
  execution.extraData = bufferToHex(execution.extraData);

  for (const v of execution.withdrawals) {
    v.amount = String(v.amount);
    v.address = bufferToHex(v.address);
  }

  execution.transactions = res.transactions.map((v) =>
    toHexString(keccak256(toBuffer(bufferToHex(v)))),
  );

  finalityUpdate.execution = execution;

  return await indexBlockOnAo(finalityUpdate);
}

async function checkNodeSetup() {
  try {
    const ready =
      process.env.SETUP_RPC_URL &&
      process.env.JWK &&
      process.env.SETUP_ADMIN &&
      process.env.PROCESS_ID;

    if (ready) {
      return;
    }

    const readyToDeploy =
      process.env.SETUP_RPC_URL &&
      process.env.JWK &&
      process.env.SETUP_ADMIN &&
      !process.env.PROCESS_ID;

    if (readyToDeploy) {
      await spawnProcess();
    }

    const envSetUp =
      process.env.SETUP_NAME &&
      process.env.SETUP_RPC_URL &&
      process.env.SETUP_CHAIN_ID &&
      process.env.JWK &&
      process.env.SETUP_NETWORK;

    while (!envSetUp) {
      log.error(
        `\nPlease setup the .env file with the necessary data. Idling light-client for 60s !\n`,
      );
      await sleep(60000);
    }

    return;
  } catch (error) {
    console.log(error);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
