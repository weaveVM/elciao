import { dryrun, createDataItemSigner, message } from "@permaweb/aoconnect";
import dotenv from "dotenv"

dotenv.config()

const wallet = JSON.parse(process.env.JWK);


export async function indexBlockOnAo(obj) {
  try {
    const isCreated = await isSetup();

    if (isCreated) {
      const mid = await indexNewBlock(obj);
      console.log(`index mid: ${mid}`);
      return mid;
    }

    const mid = await createNode(obj);
    console.log(`creation mid: ${mid}`);
    return mid;
  } catch(error) {
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

    console.log(messageId);
    return messageId;
  } catch (error) {
    console.log(error);
    return  false;
  }
}

async function indexNewBlock(obj) {
  try {
    console.log(obj.beacon.slot, obj.execution.blockNumber)
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

    console.log(messageId);
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

    console.log(tx.Messages[0].Tags)
    return tx.Messages[0].Tags

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

    const res = tx.Messages[0].Tags.find((tag) => tag.name === "NodeCreated")
    console.log(`is setup:${ res.value}`)
    return res.value;
  } catch (error) {
    console.log(error);
    return false;
  }
}


// mintFor()