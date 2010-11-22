# Bundled View Aspects

## jqueryRelay

Detects if jQuery is loaded and injects some plugins that allow the developer to redirect certain jQuery methods to the client.

Imagine you want to use a jQuery plugin on the server-side, that was originally written for in-browser use. While things like element-creation should happen on the server, certain things, like animations, should still be performed on the client-side.

### jQuery.clientReady(code)

Executes the given code in the browser once the client-side DOM is ready.

    $.clientReady("alert('Hello!')");

Under the hood, this will append a script block to the body-element:

    <script>
      $(function() {
        alert('Hello!');
      });
    </script>
    
Note: The jqueryRelay aspect monkey-patches jQuery, as it would otherwise extract all dynamically created script tags and pass them to _evalScript()_. That's not what we want, as our client-scripts would then get executed on the server, too.

### .client(method, args...)

Executes the specified method on the client.

    $('<input>').appendTo('body').client('datepicker');
    
This is in fact a shortcut for:

    var sel = $('input.date').identify();
    $.clientReady("$(" + sel + ").datepicker()");
    
### jQuery.client(methods...)

Sets up a permanent redirection of the given plugin-methods.

    $.client('datepicker');
    $('<input>').appendTo('body').datepicker();
    
    // Equivalent to:
    $('<input>').appendTo('body').client('datepicker');

This is useful, as it allows you to run *exactly the same code* on client and server, without any modifications.

### .clientAndServer(method, args...)

Executes the specified method on both client _and_ server.
    
### jQuery.clientAndServer(methods...)

Sets up a permanent delegation of the given plugin-methods so that they are always executed on client and server.

## eventPropagation

Sets the name of all buttons to _event.*selector*, where *selector* is a jQuery expression that uniquely identifies the button within the DOM. When a parameter matching this pattern is found in a request, the button is retrieved using the selector and click() is invoked.

## incrementalUpdates

View aspect that enables incremental UI updates. It captures all mutation events dispatched after a click event has bee triggered and sends them to the client as a list of jQuery operations.