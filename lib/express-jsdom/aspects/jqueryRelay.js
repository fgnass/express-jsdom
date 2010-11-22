/**
 * Detects if jQuery is loaded and injects some plugins that allow the 
 * developer to redirect certain jQuery methods to the client.
 */
function addBuiltIns($, document) {

  // ========================================================================
  // Serialization of client-scripts, i.e. code executed in the browser once
  // the client-side DOM is ready.
  // ========================================================================

  var clientScripts = [];

  $.clientReady = function(script) {
    if ($.isFunction(script)) {
      script = script.toString().replace(/^.*?\{([\s\S]*)\}/m, '$1');
    }
    clientScripts.push(script);
  };

  // Overwrite the jQuery function that extracts script tags from a given
  // fragment and passes them to evalScript. Otherwise our clientScripts
  // would get executed on the server, too. 
  $.clean = (function(orig) {
    return function(elems, context, fragment, scripts) {
      return orig(elems, context, fragment);
    };
  })($.clean);

  // When the server-side DOM is ready, we append a script-block containing
  // the previously gathered clientScripts.
  $(function() {
    if (clientScripts.length > 0) {
      $('<script>').append('//').append('<!--\n$(function() {\n' + 
        clientScripts.join('\n') + '});\n//-->').appendTo('body');
    }
  });

  // ========================================================================
  // Synthetic element ID generation
  // ========================================================================

  var counter = {
  };

  $.fn.identify = function(prefix) {
    var n = prefix || 'el';
    return $.map(this, function(el) {
      if (el.nodeType == 9) {
        return 'document';
      }
      var id = el.id;
      if (!counter[n]) {
        counter[n] = 1;
      }
      if (!id) {
        do {
          id = n + counter[n]++;
        } while(document.getElementById(id));
        el.id = id;
      }
      return '#' + id; 
    }).join(',');
  };

  // ========================================================================
  // Plugin method routing
  // ========================================================================

  function delegate(method, target) {
    var impl = function() {
      var args = $.makeArray(arguments);
      args.unshift(method);
      return target.apply(this, args);
    };
    impl._original = $.fn[method];
    impl._delegate = true;
    $.fn[method] = impl;
  }

  /**
   * Redirects all specified plugin methods to the client.
   */
  $.client = function(/* methods... */) {
    Array.prototype.forEach.call(arguments, function(method) {
      delegate(method, $.fn.client);
    });
  };

  /**
   * Routes all specified plugin methods to both client and server.
   */
  $.clientAndServer = function(/* methods... */) {
    Array.prototype.forEach.call(arguments, function(method) {
      delegate(method, $.fn.clientAndServer);
    });
  };

  function stringify(obj) {
    var fn = [];
    return JSON.stringify(obj, function(key, value) {
      if ($.isFunction(value)) {
        fn.push(value);
        return 'function<' + fn.length + '>';
      }
      return value;
    }).replace(/"function<(\d+)>"/g, function(m, i) {
      return fn[i-1].toString();
    });
  }

  function execOnClient(chain, method, args) {
    var selector = chain.identify();
    if (selector !== '' && selector != 'document') {
      selector = "'" + selector + "'";
    }
    $.clientReady('\t$(' + selector + ').' + method +'(' + $.map(args, stringify).join(',') + ');');
  }

  $.fn.client = function() {
    var args = $.makeArray(arguments),
      method = args.shift();

    execOnClient(this, method, args);
    return this;
  };

  $.fn.clientAndServer = function() {
    var args = $.makeArray(arguments),
      method = args.shift(),
      impl = $.fn[method];

    if (impl._delegate && !impl._original) {
      throw 'Plugin method `' + method + '` has not been loaded on the server';
    }
    execOnClient(this, method, args);
    return (impl._original || impl).apply(this, args);
  };
}

exports.scriptLoaded = function(window) {
  if (window.jQuery && !window.jQuery.clientAndServer) {
    addBuiltIns(window.jQuery, window.document);
  }
};