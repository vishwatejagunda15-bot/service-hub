(function () {
  'use strict';

  var page = document.body.getAttribute('data-auth-page');
  var messageBox = document.getElementById('form-message');

  function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = 'form-message ' + type;
    messageBox.hidden = false;
  }

  function clearMessage() {
    messageBox.textContent = '';
    messageBox.hidden = true;
    messageBox.className = 'form-message';
  }

  function showFieldError(form, message) {
    showMessage(message, 'error');
    form.reportValidity();
    var invalidField = form.querySelector(':invalid');
    if (invalidField) invalidField.classList.add('invalid');
  }

  function customerLandingPage() {
    var returnPath = sessionStorage.getItem('quickfixPostLogin');
    sessionStorage.removeItem('quickfixPostLogin');
    if (
      returnPath === 'customer-dashboard.html' ||
      returnPath === 'my-bookings.html' ||
      /^service-booking\.html\?providerId=[A-Za-z0-9%._:-]+$/.test(returnPath || '')
    ) {
      return returnPath;
    }
    return 'customer-dashboard.html';
  }

  if (window.ServiceHubApi.isAuthenticated() && window.ServiceHubApi.getRole() === 'customer') {
    window.ServiceHubApi.request('/customers/me')
      .then(function (res) {
        if (res && res.data) window.ServiceHubApi.setUser(res.data);
        window.location.replace(customerLandingPage());
      })
      .catch(function () {
        window.ServiceHubApi.clearAuth();
      });
  }

  function connectInputs(form) {
    Array.prototype.forEach.call(form.querySelectorAll('input'), function (input) {
      input.addEventListener('input', function () {
        input.classList.remove('invalid');
        input.setCustomValidity('');
        clearMessage();
      });
    });
  }

  if (page === 'register') {
    var registerForm = document.getElementById('register-form');
    var passwordField = registerForm.elements.password;
    var confirmField = registerForm.elements.confirmPassword;
    var isRegisterSubmitting = false;
    connectInputs(registerForm);

    registerForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (isRegisterSubmitting) return;
      clearMessage();
      if (!registerForm.checkValidity()) {
        showFieldError(registerForm, 'Please check the highlighted fields and enter valid details.');
        return;
      }
      if (passwordField.value !== confirmField.value) {
        confirmField.setCustomValidity('Passwords do not match.');
        confirmField.classList.add('invalid');
        showMessage('The passwords do not match. Please try again.', 'error');
        return;
      }
      if (new TextEncoder().encode(passwordField.value).length > 72) {
        showMessage('Password must be no more than 72 UTF-8 bytes.', 'error');
        return;
      }

      var submitButton = registerForm.querySelector('[type="submit"]');
      var submitLabel = submitButton.textContent;
      isRegisterSubmitting = true;
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.textContent = 'Creating account…';
      try {
        var result = await window.ServiceHubApi.request('/customers/register', {
          method: 'POST',
          body: {
            fullName: registerForm.elements.fullName.value.trim(),
            email: registerForm.elements.email.value.trim().toLowerCase(),
            phone: registerForm.elements.phone.value.trim(),
            password: passwordField.value,
            confirmPassword: confirmField.value
          },
          auth: false
        });
        window.ServiceHubApi.setAuth('customer', result);
        showMessage('Account created. Opening your customer dashboard…', 'success');
        window.setTimeout(function () { window.location.href = customerLandingPage(); }, 450);
      } catch (error) {
        isRegisterSubmitting = false;
        showMessage(error.message, 'error');
      } finally {
        if (!isRegisterSubmitting) {
          submitButton.disabled = false;
          submitButton.removeAttribute('aria-busy');
          submitButton.textContent = submitLabel;
        }
      }
    });
  }

  if (page === 'login') {
    var loginForm = document.getElementById('login-form');
    var isLoginSubmitting = false;
    connectInputs(loginForm);

    loginForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (isLoginSubmitting) return;
      clearMessage();
      if (!loginForm.checkValidity()) {
        showFieldError(loginForm, 'Enter a valid email address and your password.');
        return;
      }

      var submitButton = loginForm.querySelector('[type="submit"]');
      var submitLabel = submitButton.textContent;
      isLoginSubmitting = true;
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.textContent = 'Signing in…';
      try {
        var result = await window.ServiceHubApi.request('/customers/login', {
          method: 'POST',
          body: {
            email: loginForm.elements.email.value.trim().toLowerCase(),
            password: loginForm.elements.password.value
          },
          auth: false
        });
        window.ServiceHubApi.setAuth('customer', result);
        showMessage('Login successful. Opening your customer dashboard…', 'success');
        window.setTimeout(function () { window.location.href = customerLandingPage(); }, 400);
      } catch (error) {
        isLoginSubmitting = false;
        showMessage(error.message, 'error');
      } finally {
        if (!isLoginSubmitting) {
          submitButton.disabled = false;
          submitButton.removeAttribute('aria-busy');
          submitButton.textContent = submitLabel;
        }
      }
    });
  }
})();
