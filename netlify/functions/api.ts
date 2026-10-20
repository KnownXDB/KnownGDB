import { handleRequest } from "../../apps/api/src/handler.ts";
export default (request: Request) => handleRequest(request);
export const config = { path: "/api/v1/*" };
