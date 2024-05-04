import axios from "axios";
import * as _ from "lodash";
import { REQUEST_BATCH_SIZE } from "./constants.js";
import log from "./logger.js";

export class RPC {
  constructor(provider) {
    this.provider = provider;
  }

  async request(request) {
    if (
      this.provider.unsupportedMethods &&
      this.provider.unsupportedMethods.includes(request.method)
    ) {
      throw new Error("method not supported by the provider");
    }
    return await this._retryRequest(request);
  }

  async requestBatch(requests) {
    if (
      this.provider.unsupportedMethods &&
      requests.some((r) => this.provider.unsupportedMethods.includes(r.method))
    ) {
      throw new Error("method not supported by the provider");
    }

    if (this.provider.supportBatchRequests) {
      const requestChunks = _.chunk(
        requests,
        this.provider.batchSize || REQUEST_BATCH_SIZE,
      );
      const res = [];
      for (const chunk of requestChunks) {
        const batchRes = await this._retryBatch(chunk);
        res.push(...batchRes);
      }
      return res;
    } else {
      const res = [];
      for (const request of requests) {
        const r = await this._retryRequest(request);
        res.push(r);
      }
      return res;
    }
  }

  async _retryRequest(request, retry = 5) {
    const rpcRequest = {
      ...request,
      jsonrpc: "2.0",
      id: this.generateId(),
    };

    for (let i = retry; i > 0; i--) {
      const res = await this._request([rpcRequest]);
      if (res[0].success) return res[0];
      else if (i == 1) {
        log.error(
          `RPC request failed after maximum retries: ${JSON.stringify(
            rpcRequest,
            null,
            2,
          )} ${JSON.stringify(res[0], null, 2)}`,
        );
      }
    }
    throw new Error("RPC request failed");
  }

  generateId() {
    return Math.floor(Math.random() * 2 ** 64).toFixed();
  }

  async _retryBatch(requests, retry = 5) {
    let requestsRaw = requests.map((r) => ({
      ...r,
      jsonrpc: "2.0",
      id: this.generateId(),
    }));

    const results = {};
    let requestsLeft = requestsRaw;
    for (let t = 0; t < retry; t++) {
      const res = await this._request(requestsLeft);
      let nextRequests = [];
      res.forEach((r, i) => {
        if (r.success) {
          results[requestsLeft[i].id] = r;
        } else {
          nextRequests.push(requestsLeft[i]);
        }
      });
      if (nextRequests.length === 0) break;
      requestsLeft = nextRequests;
    }

    const failedRequests = requestsRaw.filter((r) => !(r.id in results));
    if (failedRequests.length > 0) {
      log.error(
        `RPC batch request failed after maximum retries: ${JSON.stringify(
          requestsRaw,
          null,
          2,
        )}`,
      );
      throw new Error("RPC request failed");
    }

    return requestsRaw.map((r) => results[r.id]);
  }

  async _request(requests) {
    try {
      const response = await axios.post(
        this.provider.URL,
        requests.length === 1 ? requests[0] : requests,
      );
      const results = requests.length === 1 ? [response.data] : response.data;
      return results.map((r) => ({
        success: !r.error,
        result: r.error || r.result,
      }));
    } catch (e) {
      return requests.map(() => ({
        success: false,
        result: { message: `request failed: ${e}` },
      }));
    }
  }
}
