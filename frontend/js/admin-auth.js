(function () {
  'use strict';

  var api = window.ServiceHubApi;
  var form = document.getElementById('admin-login-form');
  var message = document.getElementById('admin-login-message');
  var isSubmitting = false;

  function showMessage(text, type) {
    message.textContent = text;
    message.className = 'form-message ' + type;
    message.hidden = false;
  }

  function clearMessage() {
    message.textContent = '';
    message.className = 'form-message';
    message.hidden = true;
  }

  if (api.getRole() === 'admin' && api.getUser()) {
    api.request('/admin/me')
      .then(function () { window.location.replace('admin-dashboard.html'); })
      .catch(function () { api.clearAuth(); });
  }

  form.querySelectorAll('input').forEach(function (input) {
    input.addEventListener('input', function () {
      input.classList.remove('invalid');
      input.setCustomValidity('');
      clearMessage();
    });
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (isSubmitting) return;
    clearMessage();

    if (!form.checkValidity()) {
      form.reportValidity();
      showMessage('Enter a valid administrator email and password.', 'error');
      return;
    }

    var button = form.querySelector('[type="submit"]');
    var originalLabel = button.textContent;
    isSubmitting = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Verifying credentials…';

    try {
      var result = await api.request('/admin/login', {
        method: 'POST',
        body: {
          email: form.elements.email.value.trim().toLowerCase(),
          password: form.elements.password.value
        },
        auth: false
      });

      api.setAuth('admin', result);
      showMessage('Authentication successful. Opening Admin Dashboard…', 'success');
      window.setTimeout(function () {
        window.location.href = 'admin-dashboard.html';
      }, 350);
    } catch (error) {
      isSubmitting = false;
      showMessage(error.message, 'error');
    } finally {
      if (!isSubmitting) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = originalLabel;
      }
    }
  });
})();
