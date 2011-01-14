$.fn.relay = function(eventType, callback) {
  this.bind(eventType, callback);
  this.client('jquery.relay.relayEvent', eventType);
  return this;
};