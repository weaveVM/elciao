import { getClient } from "@lodestar/api";
import { createChainForkConfig } from "@lodestar/config";
import { networksChainConfig } from "@lodestar/config/networks";
import { Lightclient, LightclientEvent } from "@lodestar/light-client";
import { LightClientRestTransport } from "@lodestar/light-client/transport";
import { getFinalizedSyncCheckpoint, getGenesisData, getLcLoggerConsole } from "@lodestar/light-client/utils";

import {
  bufferToHex,
} from '@ethereumjs/util'

import { indexBlockOnAo } from "./ao/utils/connect.js";

const config = createChainForkConfig(networksChainConfig.mainnet);
const logger = getLcLoggerConsole({ logDebug: Boolean(process.env.DEBUG) });
const api = getClient({ urls: ["https://lodestar-mainnet.chainsafe.io"] }, { config });

export async function main() {
  console.log("lightclient initiated")
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

  await lightclient.start();


  lightclient.emitter.on(LightclientEvent.lightClientOptimisticHeader, async (finalityUpdate) => {
    console.log("LC Emitter:");
const symbols = Object.getOwnPropertySymbols(finalityUpdate.beacon);

// Find the specific symbol based on a characteristic, here assuming it's the only one or the first
const sszCachedPermanentRoot = symbols[0]; // This would be adjusted based on actual position if multiple symbols

// Now access the value
const value = finalityUpdate.beacon[sszCachedPermanentRoot];

    // console.log(value);
    // console.log(bufferToHex(value))
    // console.log(finalityUpdate);

await handleLightClientRes(finalityUpdate)
  });

}

// function handleLightClientRes(res) {
//   const beaconRes = {};
//   const beacon = res.beacon;

//   beacon.parentRoot = bufferToHex(beacon.parentRoot)

//   console.log(res);
//   console.log(beacon)
// }


async function handleLightClientRes(res) {

  const beacon = res.beacon;

const symbols = Object.getOwnPropertySymbols(beacon);

// Find the specific symbol based on a characteristic, here assuming it's the only one or the first
const sszCachedPermanentRoot = symbols[0]; // This would be adjusted based on actual position if multiple symbols

// Now access the value
const value = beacon[sszCachedPermanentRoot];
  beacon.slot = String(beacon.slot)
  beacon.proposerIndex = String(beacon.proposerIndex)
  // Converting Uint8Array properties to hex
  beacon.parentRoot = bufferToHex(beacon.parentRoot);
  beacon.stateRoot = bufferToHex(beacon.stateRoot);
  beacon.bodyRoot = bufferToHex(beacon.bodyRoot);
  beacon['ssz_cached_permanent_root'] = bufferToHex(value);
  delete beacon[sszCachedPermanentRoot];

  // Execution section
  const execution = res.execution;
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

  // Execution Branch section
  res.executionBranch = res.executionBranch.map((v) => bufferToHex(v));

  console.log(res);

  return await indexBlockOnAo(res);
  // console.log(beacon);
}

main();
