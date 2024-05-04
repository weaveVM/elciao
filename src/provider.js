import _ from "lodash";
import Web3 from "web3";
import { Trie } from "@ethereumjs/trie";
import rlp from "rlp";
import { Common, Chain, Hardfork } from "@ethereumjs/common";
import {
  Address,
  Account,
  toType,
  bufferToHex,
  toBuffer,
  TypeOutput,
  setLengthLeft,
  KECCAK256_NULL_S,
} from "@ethereumjs/util";
import { VM } from "@ethereumjs/vm";
import { BlockHeader, Block } from "@ethereumjs/block";
import { Blockchain } from "@ethereumjs/blockchain";
import { TransactionFactory } from "@ethereumjs/tx";
import { InternalError, InvalidParamsError } from "./errors.js";
import log from "./logger.js";
import {
  ZERO_ADDR,
  MAX_BLOCK_HISTORY,
  MAX_BLOCK_FUTURE,
  DEFAULT_BLOCK_PARAMETER,
} from "./constants.js";
import {
  headerDataFromWeb3Response,
  blockDataFromWeb3Response,
  toJSONRPCBlock,
} from "./utils.js";
import { RPC } from "./rpc.js";

const bigIntToHex = (n) => "0x" + BigInt(n).toString(16);
const emptyAccountSerialize = new Account().serialize();

export function VerifyingProvider(
  providerURL,
  blockNumber,
  blockHash,
  chain = Chain.Mainnet,
) {
  this.rpc = new RPC({ URL: providerURL });
  this.common = new Common({
    chain,
    hardfork: chain === Chain.Mainnet ? Hardfork.Shanghai : undefined,
  });
  this.latestBlockNumber = BigInt(blockNumber);
  this.blockHashes = { [bigIntToHex(blockNumber)]: blockHash };
  this.blockPromises = {};
  this.blockHeaders = {};

  this.update = function (blockHash, blockNumber) {
    const blockNumberHex = bigIntToHex(blockNumber);
    if (
      blockNumberHex in this.blockHashes &&
      this.blockHashes[blockNumberHex] !== blockHash
    ) {
      log.warn(
        "Overriding an existing verified blockhash. Possibly the chain had a reorg",
      );
    }
    const latestBlockNumber = this.latestBlockNumber;
    this.latestBlockNumber = blockNumber;
    this.blockHashes[blockNumberHex] = blockHash;
    if (blockNumber > latestBlockNumber) {
      for (let b = latestBlockNumber + BigInt(1); b <= blockNumber; b++) {
        const bHex = bigIntToHex(b);
        if (bHex in this.blockPromises) {
          this.blockPromises[bHex].resolve();
        }
      }
    }
  };

  this.getBalance = async function (
    addressHex,
    blockOpt = DEFAULT_BLOCK_PARAMETER,
  ) {
    const header = await this.getBlockHeader(blockOpt);
    const address = Address.fromString(addressHex);
    const { result: proof, success } = await this.rpc.request({
      method: "eth_getProof",
      params: [addressHex, [], bigIntToHex(header.number)],
    });
    if (!success) {
      throw new InternalError(`RPC request failed`);
    }
    const isAccountCorrect = await this.verifyProof(
      address,
      [],
      header.stateRoot,
      proof,
    );
    if (!isAccountCorrect) {
      throw new InternalError("Invalid account proof provided by the RPC");
    }
    return bigIntToHex(proof.balance);
  };

  this.blockNumber = function () {
    return bigIntToHex(this.latestBlockNumber);
  };

  this.chainId = function () {
    return bigIntToHex(this.common.chainId());
  };

  this.getCode = async function (
    addressHex,
    blockOpt = DEFAULT_BLOCK_PARAMETER,
  ) {
    const header = await this.getBlockHeader(blockOpt);
    const res = await this.rpc.requestBatch([
      {
        method: "eth_getProof",
        params: [addressHex, [], bigIntToHex(header.number)],
      },
      {
        method: "eth_getCode",
        params: [addressHex, bigIntToHex(header.number)],
      },
    ]);
    if (res.some((r) => !r.success)) {
      throw new InternalError(`RPC request failed`);
    }
    const [accountProof, code] = res;
    const address = Address.fromString(addressHex);
    const isAccountCorrect = await this.verifyProof(
      address,
      [],
      header.stateRoot,
      accountProof,
    );
    if (!isAccountCorrect) {
      throw new InternalError(`invalid account proof provided by the RPC`);
    }
    const isCodeCorrect = await this.verifyCodeHash(
      code,
      accountProof.codeHash,
    );
    if (!isCodeCorrect) {
      throw new InternalError(
        `code provided by the RPC doesn't match the account's codeHash`,
      );
    }
    return code;
  };

  this.getTransactionCount = async function (
    addressHex,
    blockOpt = DEFAULT_BLOCK_PARAMETER,
  ) {
    const header = await this.getBlockHeader(blockOpt);
    const address = Address.fromString(addressHex);
    const { result: proof, success } = await this.rpc.request({
      method: "eth_getProof",
      params: [addressHex, [], bigIntToHex(header.number)],
    });
    if (!success) {
      throw new InternalError(`RPC request failed`);
    }
    const isAccountCorrect = await this.verifyProof(
      address,
      [],
      header.stateRoot,
      proof,
    );
    if (!isAccountCorrect) {
      throw new InternalError(`invalid account proof provided by the RPC`);
    }
    return bigIntToHex(proof.nonce.toString());
  };

  this.call = async function (transaction, blockOpt = DEFAULT_BLOCK_PARAMETER) {
    try {
      this.validateTx(transaction);
    } catch (e) {
      throw new InvalidParamsError(e.message);
    }
    const header = await this.getBlockHeader(blockOpt);
    const vm = await this.getVM(transaction, header);
    const {
      from,
      to,
      gas: gasLimit,
      gasPrice,
      maxPriorityFeePerGas,
      value,
      data,
    } = transaction;
    const runCallOpts = {
      caller: from ? Address.fromString(from) : undefined,
      to: to ? Address.fromString(to) : undefined,
      gasLimit: toType(gasLimit, TypeOutput.BigInt),
      gasPrice: toType(gasPrice || maxPriorityFeePerGas, TypeOutput.BigInt),
      value: toType(value, TypeOutput.BigInt),
      data: data ? toBuffer(data) : undefined,
      block: { header },
    };
    try {
      const { execResult } = await vm.evm.runCall(runCallOpts);
      return bufferToHex(execResult.returnValue);
    } catch (error) {
      throw new InternalError(error.message.toString());
    }
  };

  this.estimateGas = async function (
    transaction,
    blockOpt = DEFAULT_BLOCK_PARAMETER,
  ) {
    try {
      this.validateTx(transaction);
    } catch (e) {
      throw new InvalidParamsError(e.message);
    }
    const header = await this.getBlockHeader(blockOpt);
    if (transaction.gas == undefined) {
      transaction.gas = bigIntToHex(header.gasLimit);
    }
    const txType = BigInt(
      transaction.maxFeePerGas || transaction.maxPriorityFeePerGas
        ? 2
        : transaction.accessList
          ? 1
          : 0,
    );
    if (txType === BigInt(2)) {
      transaction.maxFeePerGas =
        transaction.maxFeePerGas || bigIntToHex(header.baseFeePerGas);
    } else {
      if (
        transaction.gasPrice === undefined ||
        BigInt(transaction.gasPrice) === BigInt(0)
      ) {
        transaction.gasPrice = bigIntToHex(header.baseFeePerGas);
      }
    }
    const txData = {
      ...transaction,
      type: bigIntToHex(txType),
      gasLimit: transaction.gas,
    };
    const tx = TransactionFactory.fromTxData(txData, {
      common: this.common,
      freeze: false,
    });
    const vm = await this.getVM(transaction, header);
    const from = transaction.from
      ? Address.fromString(transaction.from)
      : Address.zero();
    tx.getSenderAddress = () => from;
    try {
      const { totalGasSpent } = await vm.runTx({
        tx,
        skipNonce: true,
        skipBalance: true,
        skipBlockGasLimitValidation: true,
        block: { header },
      });
      return bigIntToHex(totalGasSpent);
    } catch (error) {
      throw new InternalError(error.message.toString());
    }
  };

  this.getBlockByHash = async function (blockHash, includeTransactions) {
    const header = await this.getBlockHeaderByHash(blockHash);
    const block = await this.getBlock(header);
    return toJSONRPCBlock(block, BigInt(0), [], includeTransactions);
  };

  this.getBlockByNumber = async function (blockOpt, includeTransactions) {
    const header = await this.getBlockHeader(blockOpt);
    const block = await this.getBlock(header);
    return toJSONRPCBlock(block, BigInt(0), [], includeTransactions);
  };

  this.sendRawTransaction = async function (signedTx) {
    const { success } = await this.rpc.request({
      method: "eth_sendRawTransaction",
      params: [signedTx],
    });
    if (!success) {
      throw new InternalError(`RPC request failed`);
    }
    const tx = TransactionFactory.fromSerializedData(toBuffer(signedTx), {
      common: this.common,
    });
    return bufferToHex(tx.hash());
  };

  this.getTransactionReceipt = async function (txHash) {
    const { result: receipt, success } = await this.rpc.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    });
    if (!(success && receipt)) {
      return null;
    }
    const header = await this.getBlockHeader(receipt.blockNumber);
    const block = await this.getBlock(header);
    const index = block.transactions.findIndex(
      (tx) => bufferToHex(tx.hash()) === txHash.toLowerCase(),
    );
    if (index === -1) {
      throw new InternalError("the receipt provided by the RPC is invalid");
    }
    const tx = block.transactions[index];
    return {
      transactionHash: txHash,
      transactionIndex: bigIntToHex(index),
      blockHash: bufferToHex(block.hash()),
      blockNumber: bigIntToHex(block.header.number),
      from: tx.getSenderAddress().toString(),
      to: tx.to?.toString() ?? null,
      cumulativeGasUsed: "0x0",
      effectiveGasPrice: "0x0",
      gasUsed: "0x0",
      contractAddress: null,
      logs: [],
      logsBloom: "0x0",
      status: BigInt(receipt.status) ? "0x1" : "0x0", // unverified
    };
  };

  this.validateTx = function (tx) {
    if (tx.gasPrice !== undefined && tx.maxFeePerGas !== undefined) {
      throw new Error("Cannot send both gasPrice and maxFeePerGas params");
    }
    if (tx.gasPrice !== undefined && tx.maxPriorityFeePerGas !== undefined) {
      throw new Error("Cannot send both gasPrice and maxPriorityFeePerGas");
    }
    if (
      tx.maxFeePerGas !== undefined &&
      tx.maxPriorityFeePerGas !== undefined &&
      BigInt(tx.maxPriorityFeePerGas) > BigInt(tx.maxFeePerGas)
    ) {
      throw new Error(
        `maxPriorityFeePerGas (${tx.maxPriorityFeePerGas.toString()}) is bigger than maxFeePerGas (${tx.maxFeePerGas.toString()})`,
      );
    }
  };

  this.getBlock = async function (header) {
    const { result: blockInfo, success } = await this.rpc.request({
      method: "eth_getBlockByNumber",
      params: [bigIntToHex(header.number), true],
    });
    if (!success) {
      throw new InternalError(`RPC request failed`);
    }
    const blockData = blockDataFromWeb3Response(blockInfo);
    const block = Block.fromBlockData(blockData, { common: this.common });
    if (!block.header.hash().equals(header.hash())) {
      throw new InternalError(
        `BN(${header.number}): blockhash does not match the blockData provided by the RPC`,
      );
    }
    if (!(await block.validateTransactionsTrie())) {
      throw new InternalError(
        `transactionTree doesn't match the transactions provided by the RPC`,
      );
    }
    return block;
  };

  this.getBlockHeader = async function (blockOpt) {
    const blockNumber = this.getBlockNumberByBlockOpt(blockOpt);
    await this.waitForBlockNumber(blockNumber);
    const blockHash = await this.getBlockHash(blockNumber);
    return this.getBlockHeaderByHash(blockHash);
  };

  this.waitForBlockNumber = async function (blockNumber) {
    if (blockNumber <= this.latestBlockNumber) return;
    log.debug(`waiting for blockNumber ${blockNumber}`);
    const blockNumberHex = bigIntToHex(blockNumber);
    if (!(blockNumberHex in this.blockPromises)) {
      let resolve;
      const promise = new Promise((resolve) => {});
      this.blockPromises[blockNumberHex] = { promise, resolve };
    }
    return this.blockPromises[blockNumberHex].promise;
  };

  this.getBlockNumberByBlockOpt = function (blockOpt) {
    if (
      typeof blockOpt === "string" &&
      ["pending", "earliest", "finalized", "safe"].includes(blockOpt)
    ) {
      throw new InvalidParamsError('"pending" is not yet supported');
    } else if (blockOpt === "latest") {
      return this.latestBlockNumber;
    } else {
      const blockNumber = BigInt(blockOpt);
      if (blockNumber > this.latestBlockNumber + MAX_BLOCK_FUTURE) {
        throw new InvalidParamsError("specified block is too far in future");
      } else if (blockNumber + MAX_BLOCK_HISTORY < this.latestBlockNumber) {
        throw new InvalidParamsError(
          `specified block cannot be older than ${MAX_BLOCK_HISTORY}`,
        );
      }
      return blockNumber;
    }
  };

  this.getVMCopy = async function () {
    if (this.vm === null) {
      const blockchain = await Blockchain.create({ common: this.common });
      blockchain.getBlock = async (blockId) => {
        const _hash = toBuffer(await this.getBlockHash(BigInt(blockId)));
        return { hash: () => _hash };
      };
      this.vm = await VM.create({ common: this.common, blockchain });
    }
    return await this.vm.copy();
  };

  this.getVM = async function (tx, header) {
    const _tx = {
      to: tx.to,
      from: tx.from ? tx.from : ZERO_ADDR,
      data: tx.data,
      value: tx.value,
      gasPrice: "0x0",
      gas: tx.gas ? tx.gas : bigIntToHex(header.gasLimit),
    };
    const { result, success } = await this.rpc.request({
      method: "eth_createAccessList",
      params: [_tx, bigIntToHex(header.number)],
    });
    if (!success) {
      throw new InternalError("RPC request failed");
    }
    const accessList = result.accessList;
    accessList.push({ address: _tx.from, storageKeys: [] });
    if (_tx.to && !accessList.some((a) => a.address.toLowerCase() === _tx.to)) {
      accessList.push({ address: _tx.to, storageKeys: [] });
    }
    const vm = await this.getVMCopy();
    await vm.stateManager.checkpoint();
    const requests = accessList.flatMap((access) => [
      {
        method: "eth_getProof",
        params: [
          access.address,
          access.storageKeys,
          bigIntToHex(header.number),
        ],
      },
      {
        method: "eth_getCode",
        params: [access.address, bigIntToHex(header.number)],
      },
    ]);
    const rawResponse = await this.rpc.requestBatch(requests);
    if (rawResponse.some((r) => !r.success)) {
      throw new InternalError("RPC request failed");
    }
    const responses = _.chunk(
      rawResponse.map((r) => r.result),
      2,
    );
    responses.forEach(([accountProof, code], i) => {
      const { address: addressHex, storageKeys } = accessList[i];
      const {
        nonce,
        balance,
        codeHash,
        storageProof: storageAccesses,
      } = accountProof;
      const address = Address.fromString(addressHex);
      const isAccountCorrect = this.verifyProof(
        address,
        storageKeys,
        header.stateRoot,
        accountProof,
      );
      if (!isAccountCorrect) {
        throw new InternalError("invalid account proof provided by the RPC");
      }
      const isCodeCorrect = this.verifyCodeHash(code, codeHash);
      if (!isCodeCorrect) {
        throw new InternalError(
          "code provided by the RPC doesn't match the account's codeHash",
        );
      }
      const account = Account.fromAccountData({
        nonce: BigInt(nonce),
        balance: BigInt(balance),
        codeHash,
      });
      vm.stateManager.putAccount(address, account);
      storageAccesses.forEach(async (access) => {
        vm.stateManager.putContractStorage(
          address,
          setLengthLeft(toBuffer(access.key), 32),
          setLengthLeft(toBuffer(access.value), 32),
        );
      });
      if (code !== "0x") {
        vm.stateManager.putContractCode(address, toBuffer(code));
      }
    });
    vm.stateManager.commit();
    return vm;
  };

  this.getBlockHash = async function (blockNumber) {
    if (blockNumber > this.latestBlockNumber) {
      throw new Error("cannot return blockhash for a blocknumber in future");
    }
    let lastVerifiedBlockNumber = this.latestBlockNumber;
    while (lastVerifiedBlockNumber > blockNumber) {
      const hash = this.blockHashes[bigIntToHex(lastVerifiedBlockNumber)];
      const header = await this.getBlockHeaderByHash(hash);
      lastVerifiedBlockNumber--;
      const parentBlockHash = bufferToHex(header.parentHash);
      const parentBlockNumberHex = bigIntToHex(lastVerifiedBlockNumber);
      if (
        parentBlockNumberHex in this.blockHashes &&
        this.blockHashes[parentBlockNumberHex] !== parentBlockHash
      ) {
        log.warn(
          "Overriding an existing verified blockhash. Possibly the chain had a reorg",
        );
      }
      this.blockHashes[parentBlockNumberHex] = parentBlockHash;
    }
    return this.blockHashes[bigIntToHex(blockNumber)];
  };

  this.getBlockHeaderByHash = async function (blockHash) {
    if (!this.blockHeaders[blockHash]) {
      const { result: blockInfo, success } = await this.rpc.request({
        method: "eth_getBlockByHash",
        params: [blockHash, true],
      });
      if (!success) {
        throw new InternalError("RPC request failed");
      }
      const headerData = headerDataFromWeb3Response(blockInfo);
      const header = new BlockHeader(headerData, { common: this.common });
      if (!header.hash().equals(toBuffer(blockHash))) {
        throw new InternalError(
          "blockhash doesn't match the blockInfo provided by the RPC",
        );
      }
      this.blockHeaders[blockHash] = header;
    }
    return this.blockHeaders[blockHash];
  };

  this.verifyCodeHash = function (code, codeHash) {
    return (
      (code === "0x" && codeHash === "0x" + KECCAK256_NULL_S) ||
      Web3.utils.keccak256(code) === codeHash
    );
  };

  this.verifyProof = async function (address, storageKeys, stateRoot, proof) {
    const trie = new Trie();
    const key = Web3.utils.keccak256(address.toString());
    const expectedAccountRLP = await trie.verifyProof(
      stateRoot,
      toBuffer(key),
      proof.accountProof.map((a) => toBuffer(a)),
    );
    const account = Account.fromAccountData({
      nonce: BigInt(proof.nonce),
      balance: BigInt(proof.balance),
      storageRoot: proof.storageHash,
      codeHash: proof.codeHash,
    });
    const isAccountValid = account
      .serialize()
      .equals(expectedAccountRLP ? expectedAccountRLP : emptyAccountSerialize);
    if (!isAccountValid) return false;
    for (let i = 0; i < storageKeys.length; i++) {
      const sp = proof.storageProof[i];
      const key = Web3.utils.keccak256(
        bufferToHex(setLengthLeft(toBuffer(storageKeys[i]), 32)),
      );
      const expectedStorageRLP = await trie.verifyProof(
        toBuffer(proof.storageHash),
        toBuffer(key),
        sp.proof.map((a) => toBuffer(a)),
      );
      const isStorageValid =
        (!expectedStorageRLP && sp.value === "0x0") ||
        (!!expectedStorageRLP &&
          expectedStorageRLP.equals(rlp.encode(sp.value)));
      if (!isStorageValid) return false;
    }
    return true;
  };
}
