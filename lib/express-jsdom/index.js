var fs = require('fs'),
  http = require('http'),
  Path = require('path'),
  jsdom = require('jsdom'),
  core = jsdom.defaultLevel,
  domtohtml = require('jsdom/jsdom/browser/domtohtml'),
  overwrite = require('./utils').overwrite;

// ============================================================================
// View-aspects
// ============================================================================

var aspects = [];

function addAspect(aspect) {
  if (typeof aspect == 'string') {
    aspect = require(aspect);
  }
  if (aspects.indexOf(aspect) == -1) {
    exports.use(aspect.applyAfter);
    aspects.push(aspect);
    exports.use(aspect.applyBefore);
  }
}

exports.use = function(a) {
  if (a) {
    if (typeof a != 'array') { a = [a]; }
    a.forEach(addAspect);
  }
  return exports;
};

function applyAspects() {
  var args = Array.prototype.slice.call(arguments),
      phase = args.shift();

  aspects.forEach(function(aspect) {
    if (aspect[phase]) {
      aspect[phase].apply(this, args);
    }
  });
}

// ============================================================================
// Monkey-patch jsdom to support runat="client/server" attributes
// ============================================================================

//Exclude elements with a runat-attribute that doesn't contain "client"
overwrite(domtohtml, 'generateHtmlRecursive', function(_super, element, rawText) {
  if (element.nodeType == 1) {
    var runAt = element.getAttribute('runat');
    if (runAt && !/client/i.test(runAt)) {
      return '';
    }
  }
  return _super(element, rawText);
});

//Don't output runat-attributes
overwrite(domtohtml, 'stringifyElement', function(_super, element) {
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
  return _super(element);
});

//Only load scripts marked with runat="server"
overwrite(core.resourceLoader, 'load', function(_super, element, href, callback) {
  var runAt = element.getAttribute('runat');
  if (/server/i.test(runAt)) {
    _super(element, href, callback);
  }
});

//Only evaluate script-blocks marked with runat="server"
overwrite(core.resourceLoader, 'enqueue', function(_super, element, callback, filename) {
  var runAt = element.getAttribute('runat');
  if (element.nodeName != 'script' || /server/i.test(runAt)) {
    return _super(element, callback, filename);
  }
  return function() {};
});

// ============================================================================
// Monkey-patch ServerResponse to support async view rendering
// ============================================================================

var DEFER_SEND = {};

// Overwrite ServerResponse.render() and and pass a callback-function option.
overwrite(http.ServerResponse, 'render', function(_super, view, options, fn) {
  var res = this;
  options.callback = function(err, data) {
    if (data) {
      res.send(data, options.headers, options.status);
    }
  };
  _super(view, options);
});

// Overwrite ServerResponse.send() and do nothing if body is DEFER_SEND.
overwrite(http.ServerResponse, 'send', function(_super, body, headers, status) {
  if (body !== DEFER_SEND) {
    _super(body, headers, status);
  }
});

// Overwrite javascript processor to provide a hook for aspects
overwrite(core.languageProcessors, 'javascript', function(_super, element, code, filename) {
  _super(element, code, filename);
  if (element.src) {
    var window = element.ownerDocument.parentWindow;
    applyAspects('scriptLoaded', window, filename, element);
  }
});

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
    if (options.fragment) {
      // Second pass
      var frag = document.createDocumentFragment();
      frag.sourceLocation = frag.sourceLocation || {};
      frag.sourceLocation.file = options.fragment.filename;
      frag.innerHTML = options.fragment.html;
      document.body.appendChild(frag);
    }

    window.locals = options.locals;
    window.require = require;

    // DOM is created from HTML, scripts have not been executed 
    applyAspects('onInit', window, options);

    document.addEventListener('DOMContentLoaded', function() {
      // Scripts have been executed but onload handlers have not been called yet
      applyAspects('onReady', window, options);
    }, true);

    window.addEventListener('load', function() {
      applyAspects('beforeRender', window, options);
      var html = options.render ? options.render(window) : document.outerHTML;
      options.callback(null, html);
    });

    document.close();
  }
  // First pass, str contains the view-source
  options.fragment = {
    html: str,
    filename: options.filename
  };
  return DEFER_SEND;
};

// ============================================================================
// Expose bundled aspects
// ============================================================================

exports.aspects = {};

fs.readdirSync(__dirname + '/aspects').forEach(function(filename) {
  if (/\.js$/.test(filename)) {
    var name = Path.basename(filename, '.js');
    Object.defineProperty(exports.aspects, name, { get: function() {
      return require('./aspects/' + name);
    }});
  }
});

exports.__proto__ = exports.aspects;

