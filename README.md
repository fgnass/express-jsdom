Server-Side DOM, express.js-style
=================================

The express-jsdom module brings the power of DOM manipulation and CSS selectors to the server.

    var express = require('express'),
        dom = require('express-jddom'),
        app = express.createServer();

    app.serve('/hello', function(document) {
        document.title = 'Hello World';
    });

JQuery Support
==============

With express-jsdom you may also use your [jQuery](http://jquery.com/) skills on the server:

    dom.use(dom.jquery);

    app.serve('/hello', function($) {
        $('body').append('<h1>Hello world</h1>');
    });

You can also execute the _same code_ on both client and server. This is especially useful for tasks like form validation. Here's an example that uses the official [jQuery validation plugin](http://docs.jquery.com/Plugins/Validation):

    /**
     * Serve /form.html and validate it upon submit.
     */
    app.serve('/form', validation, function($) {
      $('form').validate();
    });

View Aspects
============

The example above works by passing an _aspect_ as second parameter. Aspects are similar to connect's middleware stack, as they provide common functionality that can be either globally applied or on a per-route basis.

Here's the code of the validation aspect:

    var validation = {
      depends: 'jquery',
      assets: {
         css: __dirname + '/assets/form.css',
         js: __dirname + '/assets/jquery.validate.js', // Location of the plugin
         server: true // Load the plugin on the server, too
      },
      onInit = function($) {
        // Intercept calls to the validate() method and execute it on client and server
        $.clientAndServer('validate');
      }
    };

The express-jsdom module comes with a number of built-in aspects, which for example allow you to populate forms with HTTP parameters, handle client-side events (like clicks) on the server, implement server-side state saving or automatically send redirects after post request.

Stylus & UglifyJS
=================

As shown in the previous example, express-jsdom also manages assets like client-side JavaScript libraries or CSS files.
Assets can be preprocessed (stylus, less, sass) and minified (uglify, cssmin). The asset manager does not only serve the files, it also handles the injection of the link/script elements into the DOM.   

API
===

The `app.serve()` call in the first example is actually a shortcut. We could also write:

    app.all('/hello', dom.serve('/hello.html', function(document) {
        document.title = 'Hello World';
    });

The `/hello.html` parameter is the location of a HTML file (relative to the application's base directory). The file is parsed, in order to create the initial DOM. Instead of parsing an existing HTML file, you may also create a document from scratch:

    app.all('/hello', dom.serve(function(document) {
        document.body.innerHTML = '<h1>Hello World</h1>';
    });
    
You can also use jQuery's DOM builder functions:
    
    app.all('/hello', dom.jQuery, dom.serve(function($) {
        $('body').append($('<h1>').text('Hello world'));
    });

You may have noticed, that the second example takes `$` as argument, whereas the first one takes `document`. In fact you may declare arbitrary arguments, including `window`, `req`, `res` or `options`, as well as all properties of the window object. Hence `jQuery` and `$` are valid argument names, as jQuery defines `window.$` and `window.jQuery`.

Performance
===========

Jsdom is often said to be slow. In fact the JavaScript execution itself is surprisingly fast. Most processing time is spent with memory allocation and garbage collection.

A pure express-jsdom app without any 3rd party libraries (like jQuery) can handle ~260 requests/sec on a MacBook Pro. The number of requests drops down to ~50 when you throw in JQuery. It gets even worse with each jQuery plugin that is loaded.

The reason again is garbage collection. Libraries like Sizzle and jQuery have been designed for a single global document which is referenced everywhere throughout the code. Hence the only possibility to use these libraries is to execute the complete code in a new context for each request. Therefore the V8 engine has to create and dispose huge amounts of code blocks and closures.

To solve this problem, express-jsdom ships with custom versions of Sizzle and jQuery. They have been refactored to use object instances and prototypes to separate state and logic, which greatly improves the garbage collection characteristics.

Furthermore all the browser-feature detection code was removed from jQuery, so that the same test don't have to be performed over and over again.
