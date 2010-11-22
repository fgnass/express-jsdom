/**
 * View aspect that enables incremental UI updates. It captures all mutation events
 * dispatched after a click event has bee triggered and sends them to the client as
 * a list of jQuery operations. 
 */
var getSelector = require('../utils').getSelector;

function captureMutationEvents(window) {
  var changes = window.changes = [],
    insertedNodes = [];

  function willBeInserted(el) {
    return insertedNodes.some(function(node) {
      return el.compareDocumentPosition(node) === node.DOCUMENT_POSITION_CONTAINS;
    });
  }

  window.document.addEventListener('DOMNodeInserted', function(ev) {
    var el = ev.target;
    if (!willBeInserted(el)) {
      insertedNodes.push(el);
      if (el.previousSibling) {
        changes.push({fn: 'after', sel: getSelector(el.previousSibling), args: [el]});
      }
      else {
        changes.push({fn: 'prepend', sel: getSelector(el.parentNode), args: [el]});
      }
    }
  });
  window.document.addEventListener('DOMNodeRemoved', function(ev) {
    changes.push({fn: 'remove', sel: getSelector(ev.target)});
  });
  window.document.addEventListener('DOMAttrModified', function(ev) {
    if (!willBeInserted(ev.target)) {
      changes.push({fn: 'attr', sel: getSelector(ev.target), args: [ev.attrName, ev.newValue]});
    }
  });
}

function serializeMutationEvents(window) {
  return JSON.stringify(window.changes, function(key, value) {
    if (value && value.nodeType) {
      return value.outerHTML;
    }
    return value;
  });
}

exports.applyBefore = require('./eventPropagation');

exports.beforeRender = function(window, options) {
  var req = options.scope;
  if (req.body && req.body._event) {
    captureMutationEvents(window);
    options.render = serializeMutationEvents;
  }
};