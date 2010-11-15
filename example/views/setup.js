// Plugin to define a server-side validation rule (see index.js for an example). The plugin takes two arguments,
// the first is a function containing the actual validation logic, 
// the second is the error string that is displayed if the validation fails.
$.fn.remote = function(method, message) {

	// Add class 'remote' to trigger the classRule defined in index.js
	this.addClass('remote'); 

	// Store the given arguments as data attribute
	this.data('validator.server', {method: method, message: message});
	return this;
};

// On the server the classRule 'remote' has a different meaning than on the client. Instead of using
// the 'remote' method which performs an AJAX call, it is mapped to the 'server' method defined below.
// See http://docs.jquery.com/Plugins/Validation/Validator/addClassRules
$.validator.addClassRules('remote', {
	server: true
});

// The 'server' validation-method executes the validation code that was associated with the element
// by our jQuery.remote() plugin.
// See http://docs.jquery.com/Plugins/Validation/Validator/addMethod
$.validator.addMethod('server',
	function(value, element, params) {
		return	$(element).data('validator.server').method(value, element, params);
	}, 
	function(param, element) {
		return	$(element).data('validator.server').message;
	}
);