var fs = require('fs'),
	http = require('http'),
	jsdom = require('jsdom'),
	domtohtml = require('jsdom/jsdom/browser/domtohtml');

// ============================================================================
// Monkey-patch jsdom to support runat="client/server" attributes
// ============================================================================

var stringifyElement = domtohtml.stringifyElement,
	generateHtml = domtohtml.generateHtmlRecursive,
	resourceLoader = jsdom.defaultLevel.resourceLoader,
	load = resourceLoader.load,
	enqueue = resourceLoader.enqueue;

//Exclude elements with a runat-attribute that doesn't contain "client"
domtohtml.generateHtmlRecursive = function(element, rawText) {
	if (element.nodeType == 1) {
		var runAt = element.getAttribute('runat');
		if (runAt && !/client/i.test(runAt)) {
			return '';
		}
	}
	return generateHtml.call(domtohtml, element, rawText);
};

//Don't output runat-attributes
domtohtml.stringifyElement = function(element) {
	if (element.getAttribute('runat')) {
		var attrs = element._attributes._nodes,
			filteredAttrs = {},
			n, el;

		for (n in attrs) {
			if (n != 'runat') {
				filteredAttrs[n] = attrs[n];
			}
		}
		el = {_attributes: {_nodes: filteredAttrs}};
		el.__proto__ = element;
		el._attributes.__proto__ = element._attributes;

		element = el;
	}
	return stringifyElement.call(domtohtml, element);
};

//Only load scripts marked with runat="server"
resourceLoader.load = function(element, href, callback) {
	var runAt = element.getAttribute('runat');
	if (/server/i.test(runAt)) {
		load.call(resourceLoader, element, href, callback);
	}
};

//Only evaluate script-blocks marked with runat="server"
resourceLoader.enqueue = function(element, callback, filename) {
	var runAt = element.getAttribute('runat');
	if (element.nodeName != 'script' || /server/i.test(runAt)) {
		return enqueue.call(resourceLoader, element, callback, filename);
	}
	return function() {};
};

// ============================================================================
// Monkey-patch ServerResponse to support async view rendering
// ============================================================================

var proto = http.ServerResponse.prototype,
	render = proto.render,
	send = proto.send,
	DEFER_SEND = {};

// Overwrite ServerResponse.render() and and pass a callback-function option.
proto.render = function(view, options, fn) {
	var res = this;
	options.callback = function(err, data) {
		if (data) {
			res.send(data, options.headers, options.status);
		}
	};
	render.call(this, view, options);
};

// Overwrite ServerResponse.send() and do nothing if body is DEFER_SEND.
proto.send = function(body, headers, status) {
	if (body !== DEFER_SEND) {
		send.call(this, body, headers, status);
	}
};

// ============================================================================
// Express view engine implementation
// ============================================================================

exports.render = function(str, options, fn) {
	options = options || {};

	if(options.isLayout || options.layout === false) {
		//Second pass or no layout at all
		var document = jsdom.jsdom(str, null, {
			url: options.filename,
			documentRoot: process.connectEnv.staticRoot || options.documentRoot,
			deferClose: true
		}),
		window = document.parentWindow;
		//doc._disableMutationEvents = true;
		if (options.fragment) {
			// Second pass
			var frag = document.createDocumentFragment();
			frag.sourceLocation = frag.sourceLocation || {};
			frag.sourceLocation.file = options.fragment.filename;
			frag.innerHTML = options.fragment.html;
			document.body.appendChild(frag);
		}

		window.addEventListener('load', function() {
			var html = options.render ? options.render(window) : document.outerHTML;
			options.callback(null, html);
		});
		window.locals = options.locals;
		document.close();
	}
	// First pass, str contains the view-source
	options.fragment = {
		html: str,
		filename: options.filename
	};
	return DEFER_SEND;
};
