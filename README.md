The express-jsdom module provides an alternative approach to building web applications with [express](http://expressjs.com/).

Instead of using templates to create markup, it uses the same object model as the browser to build documents. Once the document has been assembled on the server, it is serialized and sent to the client as HTML.

Example
=======

    var express = require('express'),
        app = express.createServer(),
        dom = require('express-jsdom')(app);

    dom.get('/hello', function(document) {
        document.title = 'Hello World';
    });

JQuery Support
==============

With express-jsdom you may also use your [jQuery](http://jquery.com/) skills on the server:

    dom.use('jquery');
    
    dom.get('/hello', function($) {
        $('body').append('<h1>Hello world</h1>');
    });

Seamless Event Handling
=======================

The best thing about having a server-side representation of the client's DOM is that it allows you to handle browser events on the server. The browser then opens a websocket connection which is used to keep the server and client side DOM in sync.

The server can subscribe to any client-side event. When such an event is dispatched on the client, it is forwarded to the server where it gets re-dispatched. All modifications made to the server-side DOM are captured and replayed on the client.

    dom.get('/', 'relay', function($) {
    
      $('<h1>Hello</h1>')
        .appendTo('body')
        .relay('click', function() {
          $(this).after("<h2>world</h2>");
        });

      $('h2').liveRelay('click', function() {
        $(this).remove();
      });
      
    });

DOM Aspects
===========

Before we go into detail with server-side event handling, let's take a look at some basic concepts. A big advantage of having a server-side DOM is that it allows you to horizontally separate crosscutting concerns. In express-jsdom this is done using _aspects_, which are similar to connect's middleware stack, as they provide common functionality that can be either globally applied or on a per-route basis.

    dom.use(foo); // Global Aspect
  
    // Route Aspects
    dom.get('/', bar, baz, function(document) {
      //...
    });

Aspects may be defined in several ways. The simplest form of an aspect is a function with an arbitrary argument list. The arguments are populated _by name_, hence `function(window)`, `function(document)`, `function(req, window, $)`, `function($)` are all valid signatures.

Commonly used groups of aspects can be passed as an array:

    var a = [aspect1, aspect2],
      b = [aspect3, aspect4],
      all = [a, b];

    dom.get('/', a, aspect3, function(){});
    dom.get('/', a, b, function(){});
    dom.get('/', all, function(){});
    
Note that also the last function argument, which usually contains the route-specific logic, is nothing else but an _inline aspect_.

Another way to define an aspect is to create an object with an _apply_ method. This is useful for more complex aspects with dependencies, or aspects that provide assets.

Aspect Dependencies
===================

Each aspect may define dependencies to other aspects. Here's an example that depends on the built-in _jquery_ aspect to set a target on all absolute links so that they are opened in a new window: 

    module.exports = {
      depends: 'jquery',
      apply: function($) {
        $('a[href^=http]').attr('target', '_blank');
      }
    };

Multiple dependencies can be specified using an array:

    module.exports = {
      depends: ['jquery', require('./bar'), 'foo'],
      apply: function($) {
        // ...
      }
    };

In an aspect is specified using a string, express-jsdom uses the directory of the file that declares the dependency to resolve the given string to an absolute path which is then loaded with `require()`.

Asset Management
================

An aspect may also define assets like client-side JavaScripts or stylesheets.

    dom.use({css: 'assets/default.css'});
    
This will include `default.css` in all pages. The built-in asset manager does not only inject a link tag into the document's head, it also handles the serving of the referenced file. You can also use [stylus](http://learnboost.github.com/stylus/), [less](http://lesscss.org/) or [sass](http://sass-lang.com/) to preprocess the stylesheet. To do so, just give your file the appropriate extension:

    dom.use({css: 'assets/default.styl'});

An aspect to load jQuery UI could look like this:

    module.exports = {
      depends: 'jquery',
      js: 'assets/jquery-ui-1.8.11.js',
      css: 'assets/jquery-ui-18.11.custom.css'
    };

We could also use the [Google-hosted CDN version](http://code.google.com/apis/libraries/devguide.html#jqueryUI) with a fallback to our local copy:

    module.exports = {
      depends: 'jquery',
      js: {
        file: 'assets/jquery-ui-1.8.11.js',
        cdn: '//ajax.googleapis.com/ajax/libs/jqueryui/1.8.11/jquery-ui.min.js',
        test: 'jQuery.ui'
      },
      css: 'assets/jquery-ui-18.11.custom.css'
    };

Parsing HTML Documents
======================

In the previous examples the complete documents were built programmatically. Instead of building the whole DOM from scratch, you may also parse an existing HTML file.

    dom.get('/', dom.parse('/home.html'), function() {})
    
This will load `<baseDir>/views/home.html`. If the file you want to load equals the route-mapping, you can also write:

    dom.get('/home', dom.parse, function() {})
    
__Note:__ If the path doesn't contain a dot, _dom.parse_ will append `.html` as file extension.

JQuery Event Relay
==================

Let's take a closer look at the _seamless events_ example from above: 

    dom.get('/', 'relay', function($) {

      $('<h1>Hello</h1>')
        .appendTo('body')
        .relay('click', function() {
          $(this).after("<h2>world</h2>");
        });

      $('h2').liveRelay('click', function() {
        $(this).remove();
      });
  
    });

The built-in _relay_ aspect provides the jQuery `.relay()` plugin, which calls `.bind()` on the client to register an event handler that forwards the event to the server via a websocket.
    
In out example, every time the `<h1>` element is clicked, a new `<h2>` is inserted on the server. The resulting server-side DOM mutation event is captured and translated into a jQuery DOM mutation function: `$('h1').after('<h2>world</h2>')`. This operation is sent back to the client via the websocket connection where it gets executed.

There's a second plugin method called `.liveRelay()` which does a similar thing, but instead of calling [`.bind()`](http://api.jquery.com/bind/) it uese jQuery's [`.live()`](http://api.jquery.com/live/) method to register the event handler. This way clicks to all newly inserted `<h2>` element are also automatically forwarded to the server. 

Asynchronous Responses
======================

You may use `res.defer()` to defer the response until all callbacks have been invoked. Here's an example that calls two async functions to build the document:

    dom.get('/', function(document, res) {
      fs.realpath(__filename, res.defer(function(err, resolvedPath) {
        document.title = resolvedPath;
      }));
      fs.readdir(__dirname, res.defer(function(err, files) {
        document.body.innerHTML = files.join('<br>');
      }));
    });

Calling `res.defer(fn)` returns a proxy function that delegates all calls to _fn_. All proxies have to be invoked in order to send the response to the client. Calling the same proxy twice will throw an error.
