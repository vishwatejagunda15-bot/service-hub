(function () {
  'use strict';
  var api = window.ServiceHubApi;
  var providerId = (new URLSearchParams(window.location.search).get('providerId') || '').trim();
  var form = document.getElementById('service-booking-form');
  var panel = document.getElementById('booking-form-panel');
  var loading = document.getElementById('booking-loading');
  var providerError = document.getElementById('booking-provider-error');
  var message = document.getElementById('booking-message');
  var confirmation = document.getElementById('booking-confirmation');
  var provider;
  var isSubmitting = false;

  function localDate() {
    var today = new Date();
    return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  }
  function isFutureDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return false;
    var dt = new Date(dateStr + 'T' + timeStr + ':00');
    return !Number.isNaN(dt.getTime()) && dt > new Date();
  }
  function showError(text) {
    message.textContent = text;
    message.className = 'booking-alert error';
    message.hidden = false;
  }
  function showSuccess(text) {
    message.textContent = text;
    message.className = 'booking-alert success';
    message.hidden = false;
  }
  function showConfirmation(booking) {
    document.getElementById('confirmation-name').textContent = booking.customerName;
    document.getElementById('confirmation-id').textContent = api.getId(booking);
    document.getElementById('confirmation-service').textContent = booking.serviceCategory;
    document.getElementById('confirmation-provider').textContent = provider.fullName;
    document.getElementById('confirmation-time').textContent = booking.bookingDate + ' at ' + booking.bookingTime;
    panel.hidden = true;
    confirmation.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function initialize() {
    var returnPath = 'service-booking.html?providerId=' + encodeURIComponent(providerId);
    var customer = await api.requireRole('customer', 'login.html', returnPath);
    if (!customer) return;
    if (!providerId) { loading.hidden = true; providerError.hidden = false; return; }
    try {
      var result = await api.request('/providers/' + encodeURIComponent(providerId), { auth: false });
      provider = result.data;
    } catch (error) {
      loading.hidden = true;
      providerError.hidden = false;
      return;
    }

    var canonicalProviderId = api.getId(provider) || providerId;
    loading.hidden = true;
    panel.hidden = false;
    document.getElementById('back-to-provider').href = 'provider-details.html?id=' + encodeURIComponent(canonicalProviderId);
    document.getElementById('selected-avatar').textContent = (provider.fullName || 'Q').charAt(0).toUpperCase();
    document.getElementById('selected-provider').textContent = provider.fullName;
    document.getElementById('selected-service').textContent = provider.serviceCategory;
    document.getElementById('selected-service-input').value = provider.serviceCategory;
    document.getElementById('selected-provider-input').value = provider.fullName;
    document.getElementById('view-provider').href = 'provider-details.html?id=' + encodeURIComponent(canonicalProviderId);
    document.getElementById('customer-name').value = customer.fullName || '';
    document.getElementById('customer-phone').value = customer.phone || '';
    form.elements.bookingDate.min = localDate();

    form.onsubmit = async function (event) {
      event.preventDefault();
      if (isSubmitting) return;
      message.hidden = true;
      if (!form.reportValidity()) return;
      if (form.elements.bookingDate.value < localDate()) {
        showError('Choose today or a future booking date.');
        return;
      }
      if (!isFutureDateTime(form.elements.bookingDate.value, form.elements.bookingTime.value)) {
        showError('Preferred booking date and time must be in the future.');
        return;
      }

      var button = form.querySelector('[type="submit"]');
      var originalText = button.textContent;
      isSubmitting = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Submitting booking…';
      try {
        var saved = await api.request('/bookings', {
          method: 'POST',
          body: {
            providerId: canonicalProviderId,
            customerName: form.elements.customerName.value.trim(),
            customerPhone: form.elements.customerPhone.value.trim(),
            address: form.elements.address.value.trim(),
            bookingDate: form.elements.bookingDate.value,
            bookingTime: form.elements.bookingTime.value,
            description: form.elements.description.value.trim()
          }
        });
        showSuccess('Your booking request was saved.');
        showConfirmation(saved.data);
      } catch (error) {
        if (api.handleAuthError(error, 'login.html', returnPath)) return;
        showError(error.message);
      } finally {
        isSubmitting = false;
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = originalText;
      }
    };
  }
  initialize().catch(function (error) {
    loading.hidden = true;
    showError(error.message);
  });
})();
