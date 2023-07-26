declare module 'fastify' {
    interface FastifyRequest {
        sse: Function;
    }
    interface FastifyReply {
        sse: Function;
    }
}
export interface FastifySSE {
    sse: string;
}
declare const _default: fastify.Plugin<HttpServer, HttpRequest, HttpResponse, T>;
export default _default;
