"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*
 * Based on https://github.com/mtharrison/susie
 */
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const stream_1 = __importStar(require("stream"));
const fast_safe_stringify_1 = __importDefault(require("fast-safe-stringify"));
const Readable = stream_1.default.Readable;
const Transform = stream_1.default.Transform;
const endl = "\r\n";
const sseParams = Symbol("sse");
/**
 * Convert an object
 *
 * @param {Object} event The event to convert to string
 *
 * @return {string} The string to send to the browser
 */
const stringifyEvent = (event) => {
    let ret = "";
    for (const key of ["id", "event", "data"]) {
        if (event.hasOwnProperty(key)) {
            let value = event[key];
            if (value instanceof Buffer) {
                value = value.toString();
            }
            if ("object" === typeof value) {
                value = (0, fast_safe_stringify_1.default)(value);
            }
            ret += key + ": " + value + endl;
        }
    }
    return ret + endl;
};
/**
 * Write a string to the Stream
 *
 * @param {string|null} event The event that need to be converted to string
 * @param {string|Buffer|Object|null} event.data If it contains data, the stream needs to continue
 * @param {PassThrough} stream The stream to write data to
 * @param {function} stream.write Writable stream function to write data to it
 * @param {function} stream.end To close the stream (and so the connection)
 */
const writeEvent = (event, stream) => {
    if (event.data) {
        stream.write(stringifyEvent(event));
    }
    else {
        stream.write(stringifyEvent({ data: "", event: "end" }));
        stream.end();
    }
};
/**
 * This will configure the self parameter with the options
 *
 * @param {Object} self Object that need to be configured
 * @param {Object} options Options to specify
 * @param {function} idGenerator Callback function that will generate the event id
 */
const initOptions = (self, options, idGenerator) => {
    if (null !== options.idGenerator) {
        self.idGenerator = options.idGenerator || idGenerator;
    }
    if ("function" !== typeof self.idGenerator && null !== options.idGenerator) {
        throw new Error("Option idGenerator must be a function or null");
    }
    if ("function" === typeof options.event) {
        self.eventGenerator = true;
    }
    if ("function" === typeof options.event || "string" === typeof options.event) {
        self.event = options.event;
        return;
    }
    self.event = null;
};
/**
 * Class in charge of converting a stream (in object mode or not) to an object with keys event, id and data
 *
 * @param {Object} options Options of the transform. Only idGenerator and event are recognised
 * @param {function} [options.idGenerator] Function that will generate the event id, or null if none needed
 * @param {function|string} [options.event] Event name (string) or function that generate event name
 * @param {boolean} [options.objectMode = false] Is this stream work accept object in input?
 * @constructor
 */
class EventTransform extends Transform {
    constructor(options, objectMode) {
        super({ objectMode });
        options = options || {};
        this.id = 0;
        const idGenerator = () => this.id += 1;
        initOptions(this, options, idGenerator);
    }
    /**
     * Do no call this, it's internal Stream transform function
     *
     * @param {Object} chunk The data that arrived
     * @param {string} encoding Data encoding. Not used here (SSE always in utf8)
     * @param {function} callback Function needed to be called after conversion is done
     * @private
     */
    _transform(chunk, encoding, callback) {
        const event = {};
        if (this.idGenerator) {
            event.id = this.idGenerator(chunk);
        }
        if (this.event) {
            event.event = this.eventGenerator ? this.event(chunk) : this.event;
        }
        event.data = chunk;
        this.push(stringifyEvent(event));
        callback();
    }
    /**
     * Do no call this, it's internal Stream transform function
     *
     * @param {function} callback Needed to be called at end of working
     * @private
     */
    _flush(callback) {
        this.push(stringifyEvent({ data: "", event: "end" }));
        callback();
    }
}
/**
 * Decorators
 *
 * @param {fastify} instance
 * @param {function} instance.decorate
 * @param {function} instance.decorateReply
 * @param {Object} instance.sse
 * @param {Object} opts
 * @param {function} next
 */
const sse = (fastify, options) => __awaiter(void 0, void 0, void 0, function* () {
    fastify.decorateReply("sse", 
    /**
     * Function called when new data should be send
     *
     * @param {string|Readable|Object} chunk The data to send. Could be a Readable Stream, a string or an Object
     * @param {Object} options Options read for the first time, and specifying idGenerator and event
     * @param {function|null} [options.idGenerator] Generate the event id
     * @param {string|function} [options.event] Generate the event name
     */
    function (chunk, options = {}) {
        let streamTransform;
        const that = this;
        const send = (stream) => {
            that.type("text/event-stream")
                .header("content-encoding", "identity")
                .send(stream);
        };
        const sse = that[sseParams] = that[sseParams] || { id: 0 };
        if (chunk instanceof Readable) {
            // handle a stream arg
            sse.mode = "stream";
            if (chunk._readableState.objectMode) {
                // Input stream is in object mode, so pipe the input to the passthrough then to the transform
                const through = new EventTransform(options, true);
                streamTransform = new stream_1.PassThrough();
                through.pipe(streamTransform);
                chunk.pipe(through);
            }
            else {
                // Input is not in object mode, so pipe the input to the transform
                streamTransform = new EventTransform(options, false);
                chunk.pipe(streamTransform);
            }
            send(streamTransform);
            return;
        }
        // handle a first object arg
        if (!sse.stream) {
            options = options || {};
            const idGenerator = () => sse.id += 1;
            streamTransform = new stream_1.PassThrough();
            sse.stream = streamTransform;
            sse.mode = "object";
            initOptions(sse, options, idGenerator);
            send(streamTransform);
        }
        else {
            // already have an object stream flowing, just write next event
            streamTransform = sse.stream;
        }
        const event = {};
        if (sse.idGenerator) {
            event.id = sse.idGenerator(chunk);
        }
        if (sse.event) {
            event.event = sse.eventGenerator ? sse.event(chunk) : sse.event;
        }
        event.data = chunk;
        writeEvent(event, streamTransform);
    });
});
exports.default = (0, fastify_plugin_1.default)(sse);
