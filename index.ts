/*
 * Based on https://github.com/mtharrison/susie
 */
import fastifyPlugin, { PluginOptions } from "fastify-plugin";
import Stream, { PassThrough } from "stream";
import safeStringify from "fast-safe-stringify";
import { FastifyInstance, FastifyPluginAsync } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    sse: Function
  }
  interface FastifyReply {
    sse: Function
  }
}
export interface FastifySSE {
  sse: string
}

const Readable = Stream.Readable;
const Transform = Stream.Transform;

const endl = "\r\n";
const sseParams = Symbol("sse");

/**
 * Convert an object
 *
 * @param {Object} event The event to convert to string
 *
 * @return {string} The string to send to the browser
 */
const stringifyEvent = (event: any) => {
  let ret = "";

  for (const key of ["id", "event", "data"]) {
    if (event.hasOwnProperty(key)) {
      let value = event[key];
      if (value instanceof Buffer) {
        value = value.toString();
      }
      if ("object" === typeof value) {
        value = safeStringify(value);
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
const writeEvent = (event: any, stream: PassThrough) => {
  if (event.data) {
    stream.write(stringifyEvent(event));
  } else {
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
const initOptions = (self: any, options: any, idGenerator: Function) => {
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
  id: number;
  idGenerator: any;
  event: any;
  eventGenerator: any;
  constructor(options: fastifyPlugin.PluginOptions, objectMode: boolean) {
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
  _transform(chunk: any, encoding: any, callback: () => void) {
    const event = {} as any;

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
  _flush(callback: () => void) {
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


const sse: FastifyPluginAsync<FastifySSE> = async (fastify: FastifyInstance, opts: object) => {
  fastify.decorateReply("sse",
    /**
     * Function called when new data should be send
     *
     * @param {string|Readable|Object} chunk The data to send. Could be a Readable Stream, a string or an Object
     * @param {Object} options Options read for the first time, and specifying idGenerator and event
     * @param {function|null} [options.idGenerator] Generate the event id
     * @param {string|function} [options.event] Generate the event name
     */
    function (chunk: string | ReadableStream | Object, options: PluginOptions) {
      let streamTransform;
      const that = this as any;
      const send = (stream: ReadableStream) => {
        that.type("text/event-stream")
          .header("content-encoding", "identity")
          .send(stream);
      };
      const sse = that[sseParams] = that[sseParams] || { id: 0 };

      if (chunk instanceof Readable) {
        // handle a stream arg

        sse.mode = "stream";

        if ((chunk as any)._readableState.objectMode) {
          // Input stream is in object mode, so pipe the input to the passthrough then to the transform

          const through = new EventTransform(options, true);
          streamTransform = new PassThrough();
          through.pipe(streamTransform);
          chunk.pipe(through);
        } else {
          // Input is not in object mode, so pipe the input to the transform

          streamTransform = new EventTransform(options, false);
          chunk.pipe(streamTransform);
        }

        send(streamTransform as unknown as ReadableStream);
        return;
      }

      // handle a first object arg

      if (!sse.stream) {
        options = options || {};
        const idGenerator = () => sse.id += 1;

        streamTransform = new PassThrough();
        sse.stream = streamTransform;
        sse.mode = "object";

        initOptions(sse, options, idGenerator);

        send(streamTransform as unknown as ReadableStream);
      } else {
        // already have an object stream flowing, just write next event
        streamTransform = sse.stream;
      }

      const event = {} as any;
      if (sse.idGenerator) {
        event.id = sse.idGenerator(chunk);
      }

      if (sse.event) {
        event.event = sse.eventGenerator ? sse.event(chunk) : sse.event;
      }
      event.data = chunk;

      writeEvent(event, streamTransform);
    });
};
export default fastifyPlugin(sse);