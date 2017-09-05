# fastify-sse

[![Build Status](https://travis-ci.org/lolo32/fastify-sse.svg?branch=master)](https://travis-ci.org/lolo32/fastify-sse)

Easily send Server-Send-Events with Fastify.

_This is based on [github.com/mtharrison/susie](https://github.com/mtharrison/susie)_

## Install

``
npm install --save fastify-sse
``

## Usage

Add it to you project with `register` and you are done!

You can now configure a new route, and call the new `reply.sse()` to send Events to browser.

When you have finished sending event, you could send an empty message, or if using stream and end of stream, an
`end` event will be fired just before closing the connection.  You could work with it browser side to prevent
automatic reconnection.

```javascript
// Register the plugin
fastify.register(require("fastify-sse"), (err) => {
    if (err) {
      throw err;
    }
});

// Define a new route in hapijs notation
fastify.route({
  method: "GET",
  url: "/sse-hapi",
  handler: (request, reply) => {
    let index;
    const options = {};

    // Send the first data
    reply.sse("sample data", options);
    
    // Send a new data every seconds for 10 seconds then close
    const interval = setInterval(() => {
      reply.sse({event: "test", data: index});
      if (!(index % 10)) {
        reply.sse();
        clearInterval(interval);
      }
    }, 1000);
  }
});

// Define a new route in express notation
fastify.get("/sse-express",(request, reply) => {
    let index;
    const options = {};

    // Send the first data
    reply.sse("sample data", options);
    
    // Send a new data every seconds for 10 seconds then close
    const interval = setInterval(() => {
      reply.sse({event: "test", data: index});
      if (!(index % 10)) {
        reply.sse();
        clearInterval(interval);
      }
    }, 1000);
  });
```

The `options` are used only for the first call, subsequent ignore it.

You could specify:

* `strings` that well be sent directly
* `buffers` that will be converted beck to strings, utf8 encoded
* `objects` that will be stringified with the use of `"fast-safe-stringify"`
* `streams` that are readables, and could deals with objectMode or not

## Options

* `idGenerator`: generate the event id, defaulting to a number incrementing, from 1
* `event`: can be a string for the event name, or a function to compute the event name

### idGenerator

It must be a function that will be called with the event in parameter, and must return a string that will be the
`id` of the SSE, or it could be `null` if no id is needed.

```javascript
reply.sse("message", {
  idGenerator(event) {
    // Retrieve the event name using the key myIdentifiant or use the timestamp if not exists …
    return event.myIdentifiant || (new Date()).getTime();
  }
});
```
### event

It could be:
* a function, called with the event in parameter and return a string that will be used, or a string if the event
name doest not change. The event will be retrieved by the browser using `.on("eventName", […])`.
* nothing if you do not want a name, and events could be retrieved in the browser with the generic
`.on("message", […])`.

```javascript
reply.sse("message", {
  event(event) {
    // Retrieve the event name using the key myEventName …
    const name = event.myEventName;
    // … delete it from the object …
    delete event.myEventName;
    // then return the name
    return name;
  }
});
```
