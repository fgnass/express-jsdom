Server-Side DOM, express.js-style
=================================

The express-jsdom module brings the power of DOM manipulation and CSS selectors to the server.

    var express = require('express'),
        dom = require('express-jddom'),
        app = express.createServer();

    app.serve('/hello', function(document) {
        document.title = 'Hello World';
    });

View-Aspects
============

Similar to connect's middleware stack, view-aspects provide common functionality, that can be either globally applied or on a per-route basis. The bundled aspects for example allow you to populate forms with HTTP parameters, handle client-side events (like clicks) on the server, automatically send redirects after post, or use jQuery.

    dom.use(dom.jquery);

    app.serve('/hello', function($) {
        $('body').append('<h1>Hello world</h1>');
        $.clientReady(function() {
          $.animate('h1', {fontSize: 42});
        });
    });

Aspects are regular CommonJS modules that may register event handlers by exporting functions. 

* __onInit__ The DOM has been created from the HTML but the scripts haven't run yet.
* __onLoad__ Called in the capturing phase of the DOMContentLoaded event.
* __beforeRender__ Called immediately before the document is serialized.

The function arguments are resolved by name, i.e. for each parameter the context-property with the same name is passed. 
Possible argument names include `window`, `document`, `req`, `res` or `options`. If an aspect depends on jQuery, it can also use `$` or `jQuery` as argument names. Dependencies can be defined by exporting a `depends` object, which may either be another aspect, an array, or the name of a built-in aspect as string.

    exports.depends = require('./someAspect');

Asset-Management
================

Besides logic, view-aspects may also provide assets, like CSS files or client-side JavaScript libraries.

Assets can be preprocessed (less, sass) and minified.
The asset-manager does not only serve the files, it also handles the injection of the link/script elements.   



The `app.serve()` method is actually a shortcut. We could also write:

    app.all('/hello', dom.serve('/hello.html', function(document) {
        document.title = 'Hello World';
    });

The `/hello.html` parameter is the location of a HTML file (relative to your application's view directory). The file is parsed, in order to create the initial DOM.

//TODO: Support blank documents



Bundled Aspects
===============

## JQuery

Allows you to run jQuery code on both, client and server.

    dom.use(dom.jquery);

    app.serve('/hello', function($) {
        $('body').append('<h1>Hello world</h1>');
        $.clientReady(function() {
          $.animate('h1', {fontSize: 42});
        });
    });

The same thing could also be written as:

    app.serve('/hello', function($) {
        $('<h1>Hello world</h1>').appendTo('body').client('animate', {fontSize: 42});
    });

You can also permanently redirect plugin methods to the client, which can be useful if you want to run code on the server, that was originally written for browsers.

    app.serve('/hello', function($) {
        $.client('animate');
        $('h1').animate({fontSize: 42});
    });

## Form Population

Fills form elements with the corresponding HTTP parameter values. If the name of a submit-button is encountered, a server-side click-event is triggered, which (unless canceled) results in the invocation of the submit handler.

## Incremental Updates

Client-side event is relayed to the server where the event listener is invoked. Resulting DOM mutations are captured and sent back to the client as list of jQuery operations to be applied.

Fallback for noscript clients:
...

## Redirect After Post

When handling a POST request, this aspect sends a redirect instead of returning the document directly. The aspect appends a unique token as parameter to retrieve the temporarily stored DOM. Therefore this technique even works without cookies.

## Server-Side State Saving

It's also possible to store the complete DOM in the session. This can be useful if the state is too complex and can't be easily recreated upon each request.


Performance
===========

Jsdom is often said to be slow. In fact the JavaScript execution itself is surprisingly fast. Most processing time is spent with memory allocation and garbage collection.

A pure express-jsdom app without any 3rd party libraries (like jQuery) can handle ~260 requests/sec on a MacBook Pro. The number of requests drops down to ~50 when you throw in JQuery. It gets even worse with each jQuery plugin that is loaded.

The reason again is garbage collection. Libraries like Sizzle and jQuery have been designed for a single global document which is referenced everywhere throughout the code. Hence the only possibility to use these libraries is to execute the complete code in a new context for each request. Therefore the V8 engine has to create and dispose huge amounts of code blocks and closures.

To solve this problem, express-jsdom ships with custom versions of Sizzle and jQuery. They have been refactored to use object instances and prototypes to separate state and logic, which greatly improves the garbage collection characteristics.

Furthermore all the browser-feature detection code was removed from jQuery, so that the same test don't have to be performed over and over again.
