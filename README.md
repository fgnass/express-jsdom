Server-side DOM for Express
===========================

The express-dom module provides a view-engine for express, that allows you to use client-side script libraries on the server.

	<html>
	<head>
		<script src="/js/jquery.js" runat="client+server"></script>
	</head>
	<body>
		<div id="content">
		</div>
		<script runat="server">
			var ul = $('#content').append('<ul>');
			$(function() {
				locals.features.forEach(function(feature) {
					$('<li>').text(feature).appendTo(ul);
				})
			});
		</script>
	</body>
	</html>
	
You can control where a script should be executed using the **runat** attribute. A script can either run at the server, the client or at both sides. There's a demo in the example directory, that uses this feature to execute exactly the same form-validation code in the browser that also runs on the server-side:

![Screenshot](http://posterous.com/getfile/files.posterous.com/temp-2010-11-15/qvyqByGqhHGspzrBsDwaxpdaHxxjiAkvvBnsxwhGbIglwGGkGHnkHsFEzyso/jayno_small.png)

## Locals

Locals passed to the view are exposed as `window.locals` and can be accessed **once the DOM is ready**. Hence you should place your view logic within an event listener bound to the document's `load` or `DOMContentLoaded` event.

## Document Root

To run the same external script on both client *and* server, you need to set the documentRoot to the same directory as the staticProvider:

	app.use(express.staticProvider(__dirname + '/public'))
	   .set('view options', {documentRoot: __dirname + '/public'});


## Requirements

The module currently requires a [forked version of jsdom](https://github.com/fgnass/jsdom/), as it depends on the following features:

* __Script execution upon insertion__ Scripts must not be executed before the script node is inserted into the document because we must ensure that the runat-attribute has been set (if present).
* __Resource loader queue__ Scripts must be executed in document-order.
* __Local resource path resolution__ For scripts that should be executed on both sides, the public path must be resolved to a local file. This is accomplished by the `documentRoot` option that can be specified when a document is created.
* __Exported domtohtml interface__ The domtohtml functions must be exposed so that we can inject the runat-attribute checks.
* __document.close()__ We need a way to signal the document that we've finished setting up the initial DOM structure. Since view-rendering in express is a two-phase process (first the content, then the layout), the window's load event must be deferred until the content fragment has been appended to the enclosing document.
* __Element source location__ This feature is not strictly required, but is the key to precise error reporting. Errors in script-blocks will show up in the stack-trace as `/views/someview.html:23:1<script>1:8`, where 23:1 is the line/column number of the script tag and 1:8 the location within the script. Location reporting must be supported by the underlying parser, eg. my [node-htmlparser fork](https://github.com/fgnass/node-htmlparser).

## Roadmap

* Make it work with jsdom upstream
* Don't parse source-files on every request
* Implement performant document cloning
* Consider bundling the node-htmlparser fork with source-location reporting
* Consider using an attribute other than ASP's *runat*, perhaps just "at" or "target"


