import * as fastify from "fastify";

declare module 'fastify' {
    export interface FastifyReply {
        sse: Function;
    }
}
declare const _default: fastify.Plugin<HttpServer, HttpRequest, HttpResponse, T>;
export default _default;
