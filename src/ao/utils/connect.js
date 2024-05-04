import { dryrun, createDataItemSigner, message } from "@permaweb/aoconnect";
import log from "../../logger.js";

import dotenv from "dotenv";

dotenv.config();

const wallet = JSON.parse(process.env.JWK);

export async function indexBlockOnAo(obj) {
  try {
    const isCreated = await isSetup();

    if (isCreated) {
      const mid = await indexNewBlock(obj);
      log.info(
        `Indexing a new block ${obj.execution.blockNumber} | AO mid: ${mid}`,
      );
      return mid;
    }

    const mid = await createNode(obj);
    log.info(`Initiating the AO process | AO mid: ${mid}`);
    return mid;
  } catch (error) {
    console.log(error);
    return null;
  }
}
async function createNode(obj) {
  try {
    const messageId = await message({
      process: process.env.PROCESS_ID,
      signer: createDataItemSigner(wallet),
      data: btoa(JSON.stringify(obj)),
      tags: [
        { name: "Action", value: "SetUpNode" },
        {
          name: "Slot",
          value: obj.beacon.slot,
        },
        { name: "BlockNumber", value: obj.execution.blockNumber },
        { name: "Admin", value: process.env.SETUP_ADMIN },
        { name: "Network", value: process.env.SETUP_NETWORK },
        { name: "ChainId", value: process.env.SETUP_CHAIN_ID },
        { name: "RpcEndpoint", value: process.env.SETUP_RPC_URL },
        { name: "Name", value: process.env.SETUP_NAME },
      ],
    });
    return messageId;
  } catch (error) {
    console.log(error);
    return false;
  }
}

async function indexNewBlock(obj) {
  try {
    const messageId = await message({
      process: process.env.PROCESS_ID,
      signer: createDataItemSigner(wallet),
      data: btoa(JSON.stringify(obj)),
      tags: [
        { name: "Action", value: "IndexBlock" },
        {
          name: "Slot",
          value: obj.beacon.slot,
        },
        { name: "BlockNumber", value: obj.execution.blockNumber },
      ],
    });

    return messageId;
  } catch (error) {
    console.log(error);
    return false;
  }
}

async function getProcessInfo() {
  try {
    const tx = await dryrun({
      process: process.env.PROCESS_ID,
      tags: [{ name: "Action", value: "Info" }],
    });

    return tx.Messages[0].Tags;
  } catch (error) {
    console.log(error);
    return [];
  }
}

async function isSetup() {
  try {
    const tx = await dryrun({
      process: process.env.PROCESS_ID,
      tags: [{ name: "Action", value: "Info" }],
    });

    const res = tx.Messages[0].Tags.find((tag) => tag.name === "NodeCreated");
    return res.value;
  } catch (error) {
    console.log(error);
    return false;
  }
}
