"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const stream_1 = require("stream");
const fs_1 = __importDefault(require("fs"));
const index_1 = __importDefault(require("./index"));
const fastify = (0, fastify_1.default)({
    logger: true
});
fastify
    .register(index_1.default)
    .after((err) => {
    if (err) {
        throw err;
    }
});
fastify.get("/sse", (request, reply) => {
    reply.sse("toto");
    setTimeout(() => {
        reply.sse({ data: "titi au ski", event: "test" });
        reply.sse();
    }, 500);
});
fastify.get("/sse2", (request, reply) => {
    const read = new stream_1.PassThrough({ objectMode: true });
    let index = 0;
    reply.sse(read);
    const id = setInterval(() => {
        read.write({ event: "test", index });
        index += 1;
        if (!(index % 10)) {
            read.end();
            clearInterval(id);
        }
    }, 1000);
});
fastify.route({
    handler: (request, reply) => {
        reply.sse(fs_1.default.createReadStream("./package.json"));
    },
    method: "GET",
    url: "/sse3"
});
fastify.get("/", (request, reply) => {
    reply.send({ hello: "world" });
});
fastify.listen({ port: 3000 }, (err) => {
    if (err) {
        throw err;
    }
    console.log(`server listening on 3000`);
});
