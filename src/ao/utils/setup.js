import { LUA_CODE } from "../process/elciao.js";
import { APP_VERSION, AO_MODULE, AO_SCHEDULER } from "../../constants.js";
import {
  dryrun,
  createDataItemSigner,
  message,
  connect,
} from "@permaweb/aoconnect";
import dotenv from "dotenv";
import log from "../../logger.js";

dotenv.config();
const ao = connect();


const wallet = JSON.parse(process.env.JWK);

const CommonTags = [
  { name: "App-Name", value: "elciao-node-instance" },
  { name: "App-Version", value: APP_VERSION },
];

export async function spawnProcess() {
  const id = await ao.spawn({
    module: AO_MODULE,
    scheduler: AO_SCHEDULER,
    tags: [...CommonTags, { name: "Name", value: process.env.SETUP_NAME }],
    signer: createDataItemSigner(wallet),
  });
  await sleep(7000);
  await runLuaCode(id);
}

export async function runLuaCode(id) {
  const message = await ao.message({
    process: id,
    data: LUA_CODE,
    signer: createDataItemSigner(wallet),
    tags: [...CommonTags, { name: "Action", value: "Eval" }],
  });

  const result = await ao.result({ process: id, message: message });
  process.env.PROCESS_ID = id;
  log.info(`Deploying elciao node instance (AO process) - ID: ${id}`);
  await sleep(5000);

  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
