$.fn.relay = function(eventType, callback) {
  this.bind(eventType, callback);
  this.identify();
  this.client('relayEvent', eventType);
  return this;
};