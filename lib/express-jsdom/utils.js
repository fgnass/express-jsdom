exports.getSelector = function getSelector(el) {
  var paths = [];
  for (; el && el.nodeType == 1; el = el.parentNode) {
    if (el.id) {
      paths.unshift('#' + el.id);
      break;
    }
    var index = 0;
    for (var sibling = el.previousSibling; sibling; sibling = sibling.previousSibling) {
      if (sibling.nodeType == 9) {
        continue;
      }
      if (sibling.nodeName == el.nodeName) {
        ++index;
      }
    }
    var tagName = el.nodeName.toLowerCase();
    paths.unshift(tagName + ':eq(' + index + ')');
  }
  return paths.join('>');
};

exports.overwrite = function(obj, method, impl) {
  var isClass = typeof obj == 'function',
    target = isClass ? obj.prototype : obj,
    superImpl = target[method];

  target[method] = function() {
    var args = Array.prototype.slice.call(arguments),
      thisObject = isClass ? this : obj;

    args.unshift(function() {
      return superImpl.apply(thisObject, arguments);
    });
    return impl.apply(thisObject, args);
  }
};
