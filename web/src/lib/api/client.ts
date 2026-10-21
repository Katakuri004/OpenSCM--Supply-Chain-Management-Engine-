import createClient from "openapi-fetch";
import type { paths } from "./schema";

export function createSupplyChainClient(baseUrl = "http://127.0.0.1:8000") {
  return createClient<paths>({ baseUrl });
}
