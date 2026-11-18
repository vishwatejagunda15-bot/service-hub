(function () {
  'use strict';

  var api = window.ServiceHubApi;
  var form = document.getElementById('provider-profile-form');
  var message = document.getElementById('profile-message');
  var about = form.elements.about;
  var count = document.getElementById('description-count');
  var loader = document.getElementById('profile-loading');
  var editor = document.getElementById('profile-editor-card');
  var profile = null;
  var isSubmitting = false;

  function say(text, isError) {
    message.textContent = text;
    message.className = 'profile-message' + (isError ? ' error' : '');
    message.hidden = false;
  }

  function fill(p) {
    profile = p;
    ['fullName', 'phone', 'serviceCategory', 'location', 'experience', 'charges', 'availability'].forEach(function (key) {
      form.elements[key].value = (p[key] === undefined || p[key] === null) ? '' : p[key];
    });
    about.value = p.description || p.about || '';
    count.textContent = about.value.length;
  }

  function logout() {
    api.clearAuth();
    window.location.href = 'provider-login.html';
  }

  document.getElementById('provider-logout').onclick = logout;
  about.oninput = function () { count.textContent = about.value.length; };
  document.getElementById('cancel-profile-changes').onclick = function () {
    if (profile) fill(profile);
    message.hidden = true;
  };

  form.onsubmit = async function (event) {
    event.preventDefault();
    if (isSubmitting) return;
    message.hidden = true;
    if (!form.reportValidity()) return;

    var button = form.querySelector('[type="submit"]');
    var label = button.textContent;
    isSubmitting = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Saving changes…';

    var payload = {
      fullName: form.elements.fullName.value.trim(),
      phone: form.elements.phone.value.trim(),
      serviceCategory: form.elements.serviceCategory.value,
      location: form.elements.location.value.trim(),
      experience: Number(form.elements.experience.value),
      charges: Number(form.elements.charges.value),
      availability: form.elements.availability.value,
      description: about.value.trim()
    };

    try {
      var result = await api.request('/providers/me', { method: 'PATCH', body: payload });
      api.setUser(result.data);
      fill(result.data);
      say('Your profile has been updated.', false);
    } catch (error) {
      if (api.handleAuthError(error, 'provider-login.html', 'provider-profile.html')) return;
      say(error.message, true);
    } finally {
      isSubmitting = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = label;
    }
  };

  api.requireRole('provider', 'provider-login.html', 'provider-profile.html').then(function (p) {
    if (p) {
      fill(p);
      loader.hidden = true;
      editor.hidden = false;
    }
  });
})();
