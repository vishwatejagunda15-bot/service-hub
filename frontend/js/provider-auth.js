(function () {
  'use strict';
  var api = window.ServiceHubApi;
  var page = document.body.getAttribute('data-provider-page');
  var message = document.getElementById('provider-message');

  if (api.isAuthenticated() && api.getRole() === 'provider') {
    api.request('/providers/me')
      .then(function (res) {
        if (res && res.data) api.setUser(res.data);
        window.location.replace('provider-dashboard.html');
      })
      .catch(function () { api.clearAuth(); });
  }

  function say(text, type) {
    message.textContent = text;
    message.className = 'form-message ' + type;
    message.hidden = false;
  }

  function wire(form, endpoint, buildPayload, done) {
    var isSubmitting = false;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (isSubmitting) return;
      message.hidden = true;
      if (!form.checkValidity()) {
        form.reportValidity();
        say('Please check the required fields and try again.', 'error');
        return;
      }

      var body;
      try {
        body = buildPayload(form);
      } catch (validationError) {
        say(validationError.message, 'error');
        return;
      }

      var button = form.querySelector('[type="submit"]');
      var label = button.textContent;
      isSubmitting = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = page === 'register' ? 'Creating provider account…' : 'Signing in…';
      try {
        var result = await api.request(endpoint, { method: 'POST', body: body, auth: false });
        done(result);
      } catch (error) {
        isSubmitting = false;
        say(error.message, 'error');
      } finally {
        if (!isSubmitting) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = label;
        }
      }
    });

    form.querySelectorAll('input,select').forEach(function (field) {
      field.addEventListener('input', function () {
        field.setCustomValidity('');
        field.classList.remove('invalid');
      });
    });
  }

  if (page === 'register') {
    var form = document.getElementById('provider-register-form');
    wire(form, '/providers/register', function (f) {
      if (f.elements.password.value !== f.elements.confirmPassword.value) {
        f.elements.confirmPassword.setCustomValidity('Passwords do not match.');
        f.elements.confirmPassword.reportValidity();
        throw new Error('Passwords do not match.');
      }
      if (new TextEncoder().encode(f.elements.password.value).length > 72) {
        throw new Error('Password must be no more than 72 UTF-8 bytes.');
      }
      if (f.elements.location.value.trim().length < 2) {
        throw new Error('Enter a location between 2 and 100 characters.');
      }
      return {
        fullName: f.elements.fullName.value.trim(),
        email: f.elements.email.value.trim().toLowerCase(),
        phone: f.elements.phone.value.trim(),
        password: f.elements.password.value,
        confirmPassword: f.elements.confirmPassword.value,
        serviceCategory: f.elements.serviceCategory.value,
        location: f.elements.location.value.trim(),
        experience: Number(f.elements.experience.value),
        charges: Number(f.elements.charges.value),
        availability: f.elements.availability.value
      };
    }, function (result) {
      api.setAuth('provider', result);
      say('Provider account created. Opening your dashboard…', 'success');
      setTimeout(function () { location.href = 'provider-dashboard.html'; }, 350);
    });
  }

  if (page === 'login') {
    var login = document.getElementById('provider-login-form');
    wire(login, '/providers/login', function (f) {
      return {
        email: f.elements.email.value.trim().toLowerCase(),
        password: f.elements.password.value
      };
    }, function (result) {
      api.setAuth('provider', result);
      say('Login successful. Opening your dashboard…', 'success');
      setTimeout(function () { location.href = 'provider-dashboard.html'; }, 350);
    });
  }
})();
