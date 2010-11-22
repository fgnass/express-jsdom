/**
 * Sets the name of all buttons to _event.<selector>, where <selector> is a jQuery expression
 * that uniquely identifies the button within the DOM. When a parameter matching this pattern
 * is found in a request, the button is retrieved using the selector and click() is invoked.
 */
var getSelector = require('../utils').getSelector;

exports.beforeRender = function(window, options) {
  var $ = window.$,
      req = options.scope;

  if (req.body && req.body._event) {
    $.each(req.body._event, function(sel) {
      $(sel).click();
    });
  }
  if (!req.xhr) {
    window.$('input.button, input.submit').each(function() {
      this.name = '_event.' + getSelector(this);
    });
  }
};