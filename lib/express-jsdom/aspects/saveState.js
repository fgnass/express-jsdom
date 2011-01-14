var sessionMiddleware;

exports = module.exports = function(session) {
  sessionMiddleware = session;
  return exports;
};

exports.depends = require('./incrementalUpdates');

exports.onInit = function($, window, req, options) {
  var session = req.session;
  if (session && options.session !== false) {
    if (!session.windows) {
      session.windows = {};
    }

    var windowId = Date.now().toString();
    session.windows[windowId] = window;
    $('html').attr('data-window-id', windowId);
    $('form').append($('<input type="hidden" name="_windowId">').val(windowId));
  }
};

function restoreWindow(req, res, next) {
  if (req.body && req.body._windowId) {
    var session = req.session,
        windowId = req.body._windowId,
        window = session.windows[windowId];

    if (!window) {
      next();
    }
    var ctx = window.context,
        doc = window.document;

    ctx.req = req;
    ctx.res = res;

    var ev = doc.createEvent('HTMLEvents');
    ev.initEvent('load', false, false);
    window.dispatchEvent(ev);
  }
  else {
    next();
  }
}

exports.middleware = function(req, res, next) {
  if (!req.session && sessionMiddleware) {
    sessionMiddleware(req, res, function(err) {
      if (err) {
        next(err);
      }
      else {
        restoreWindow(req, res, next);
      }
    });
  }
  else {
    restoreWindow(req, res, next);
  }
};
