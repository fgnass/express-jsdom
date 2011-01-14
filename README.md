Server-Side DOM, express style
==============================

The express-jsdom module brings the power of DOM manipulation and CSS selectors to the server.

    var express = require('express'),
        dom = require('express-jddom'),
        app = express.createServer();

    app.serve('/hello', function(document) {
        document.title = 'Hello World';
    });


View-Aspects
============

Similar to connect's middleware stack, view-aspects provide common functionality, that can be either globally applied or on a per-route basis. To get an idea of the possible applications, lets take a look at the bundled aspects:

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

Fills form elements with the corresponding HTTP parameter values. If the name of a submit-button is encountered, a server-side click-event is triggered, which (if not canceled) results in the invocation of the submit handler.

## Incremental Updates

Client-side event is relayed to the server where the event listener is invoked. Resulting DOM mutations are captured and sent back to the client as list of jQuery operations to be applied.

Fallback for noscript clients:
...

## Redirect After Post

When handling a POST request,  this aspect sends a redirect instead of returning the document directly. The aspect appends a unique token as parameter to retrieve the temporarily stored DOM. Therefore this technique even works without cookies.

## Server-Side State Saving

It's also possible to store the complete DOM in the session. This can be useful if the state is too complex and can't be easily recreated upon each request.

Asset-Management
================

Besides logic, view-aspects may also provide assets, like CSS files or client-side JavaScript libraries.

Assets can be preprocessed (less, sass) and minified.
The asset-manager does not only serve the files, it also handles the injection of the link/script elements.   


![Screenshot](https://github.com/downloads/fgnass/fgnass.github.com/server-side-jquery.png)
