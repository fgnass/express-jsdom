var jquerify = require('./support/jquery-light');

exports.assets = {
  js: __dirname + '/support/jquery-1.4.4.js',
  cdn: '//ajax.googleapis.com/ajax/libs/jquery/1.4.4/jquery.min.js',
  test: 'jQuery'
};

exports.beforeRender = function($, document) {
  $(document).trigger('render');
};

exports.onInit = function(window, document) {
  var $ = jquerify(window);

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

  $(document).bind('beforeClick', function() {
    clientScripts = [];
  });

  // Overwrite the jQuery function that extracts script tags from a given
  // fragment and passes them to evalScript. Otherwise our clientScripts
  // would get executed on the server, too. 
  $.clean = (function(orig) {
    return function(elems, context, fragment, scripts) {
      return orig(elems, context, fragment);
    };
  }($.clean));

  // When everything is loaded, we append a script-block containing
  // the previously gathered clientScripts.
  $(document).bind('render', function() {
    if (clientScripts.length > 0) {
      $('<script>').append('//').append('<!--\n$(function() {\n' + 
        clientScripts.join('\n') + '});\n//-->').appendTo('body');
      clientScripts = [];
    }
  });

  // ========================================================================
  // Synthetic element ID generation
  // ========================================================================

  var counter = {
  };

  $.fn.identify = function(prefix) {
    var n = prefix || 'el';
    this.each(function() {
      if (this.nodeType === 9) {
        return 'document';
      }
      var id = this.id;
      if (!counter[n]) {
        counter[n] = 1;
      }
      if (!id) {
        do {
          id = n + counter[n]++;
        } while(document.getElementById(id));
        this.id = id;
      }
    });
    return this;
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
    chain.identify();
    var selector = chain.map(function() { return '#' + this.id; }).get().join(',');
    if (selector !== '' && selector !== 'document') {
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

  // ========================================================================
  // Form submission
  // ========================================================================

  $.fn.handleSubmit = function(callback) {
    this.each(function() {
      var el = this;
      this.submit = function() {
        callback.apply(el);
      };
    });
    return this;
  };
};