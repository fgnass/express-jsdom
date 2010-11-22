// Tell the validator plugin to perform a remote-validation on all fields having the class 'remote'.
// The specified function returns the URL that should be used to perform the AJAX validation requests.
$.validator.addClassRules('remote', {
  remote: function(element) {
    return '?validate=' + element.name;
  }
});
