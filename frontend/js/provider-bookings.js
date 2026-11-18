(function () {
  'use strict';

  var api = window.ServiceHubApi;
  var list = document.getElementById('requests-list');
  var message = document.getElementById('requests-message');
  var loading = document.getElementById('requests-loading');

  function say(text, isError) {
    message.textContent = text;
    message.className = 'requests-message' + (isError ? ' error' : '');
    message.hidden = false;
  }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function detail(parent, label, value) {
    var item = element('div');
    item.append(element('span', '', label), element('strong', '', value || 'Not provided'));
    parent.appendChild(item);
  }
  function localDate() {
    var today = new Date();
    return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  }
  function isFutureDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return false;
    var dt = new Date(dateStr + 'T' + timeStr + ':00');
    return !Number.isNaN(dt.getTime()) && dt > new Date();
  }
  function formatDate(value) {
    return value ? new Date(value + 'T00:00:00').toLocaleDateString() : 'Not set';
  }

  async function load() {
    loading.hidden = false;
    document.getElementById('requests-empty').hidden = true;
    var result;
    try {
      result = await api.request('/bookings/provider');
    } catch (error) {
      loading.hidden = true;
      if (api.handleAuthError(error, 'provider-login.html', 'provider-bookings.html')) return;
      throw error;
    }
    var bookings = result.data || [];
    list.textContent = '';

    bookings.forEach(function (booking) {
      var bookingId = api.getId(booking);
      var card = element('article', 'provider-request-card');
      var header = element('div', 'provider-request-header');
      var customer = booking.customerName || (booking.customer && booking.customer.fullName) || 'Customer';
      header.append(element('strong', '', customer));
      header.append(element('span', 'provider-request-status status-' + String(booking.status).toLowerCase(), booking.status));
      card.appendChild(header);

      var details = element('div', 'provider-request-details');
      detail(details, 'Booking ID', '#' + bookingId);
      detail(details, 'Customer phone', booking.customerPhone || (booking.customer && booking.customer.phone));
      detail(details, 'Service', booking.serviceCategory);
      detail(details, 'Preferred date', formatDate(booking.bookingDate));
      detail(details, 'Preferred time', booking.bookingTime);
      detail(details, 'Address', booking.address);
      card.appendChild(details);
      card.appendChild(element('p', 'request-description', booking.description));

      if (booking.status === 'Pending') addPendingActions(card, bookingId);
      if (booking.status === 'Accepted') addCompletionAction(card, bookingId);
      if (booking.status === 'Accepted' && booking.confirmedProviderArrivalDate) {
        card.appendChild(element('p', 'confirmed-arrival', 'Confirmed arrival: ' + formatDate(booking.confirmedProviderArrivalDate) + ' at ' + booking.confirmedProviderArrivalTime));
      }
      list.appendChild(card);
    });

    document.getElementById('requests-count').textContent = bookings.length + (bookings.length === 1 ? ' request' : ' requests');
    document.getElementById('requests-empty').hidden = bookings.length > 0;
    loading.hidden = true;
  }

  function addPendingActions(card, bookingId) {
    var actions = element('div', 'request-actions');
    var accept = element('button', 'accept-request', 'Accept booking');
    var reject = element('button', 'reject-request', 'Reject booking');
    var rejecting = false;
    accept.type = reject.type = 'button';
    accept.onclick = function () { addArrivalForm(card, bookingId); };
    reject.onclick = async function () {
      if (rejecting) return;
      if (!window.confirm('Reject this booking request?')) return;
      rejecting = true;
      reject.disabled = true;
      accept.disabled = true;
      try {
        await api.request('/bookings/' + encodeURIComponent(bookingId) + '/reject', { method: 'PATCH', body: {} });
        say('Booking rejected.');
        await load();
      } catch (error) {
        if (api.handleAuthError(error, 'provider-login.html', 'provider-bookings.html')) return;
        rejecting = false;
        reject.disabled = false;
        accept.disabled = false;
        say(error.message, true);
      }
    };
    actions.append(accept, reject);
    card.appendChild(actions);
  }

  function addArrivalForm(card, bookingId) {
    if (card.querySelector('.accept-form')) return;
    var form = element('form', 'accept-form');
    var dateWrap = element('div');
    var timeWrap = element('div');
    var date = element('input');
    var time = element('input');
    var submit = element('button', '', 'Confirm acceptance');
    var cancel = element('button', 'cancel-accept', 'Cancel');
    var accepting = false;
    date.type = 'date'; date.required = true;
    date.min = localDate();
    time.type = 'time'; time.required = true;
    submit.type = 'submit';
    cancel.type = 'button';
    cancel.onclick = function () { form.remove(); };
    dateWrap.append(element('label', '', 'Confirmed arrival date'), date);
    timeWrap.append(element('label', '', 'Confirmed arrival time'), time);
    form.append(dateWrap, timeWrap, submit, cancel);
    form.onsubmit = async function (event) {
      event.preventDefault();
      if (accepting) return;
      if (!form.reportValidity()) return;
      if (!isFutureDateTime(date.value, time.value)) {
        say('Confirmed arrival date and time must be in the future.', true);
        return;
      }
      accepting = true;
      submit.disabled = true;
      cancel.disabled = true;
      try {
        await api.request('/bookings/' + encodeURIComponent(bookingId) + '/accept', {
          method: 'PATCH',
          body: { confirmedArrivalDate: date.value, confirmedArrivalTime: time.value }
        });
        say('Booking accepted with a confirmed arrival time.');
        await load();
      } catch (error) {
        if (api.handleAuthError(error, 'provider-login.html', 'provider-bookings.html')) return;
        accepting = false;
        submit.disabled = false;
        cancel.disabled = false;
        say(error.message, true);
      }
    };
    card.appendChild(form);
  }

  function addCompletionAction(card, bookingId) {
    var actions = element('div', 'request-actions');
    var button = element('button', 'accept-request', 'Mark completed');
    var completing = false;
    button.type = 'button';
    button.onclick = async function () {
      if (completing) return;
      if (!window.confirm('Mark this booking as completed?')) return;
      completing = true;
      button.disabled = true;
      try {
        await api.request('/bookings/' + encodeURIComponent(bookingId) + '/complete', { method: 'PATCH', body: {} });
        say('Booking marked completed.');
        await load();
      } catch (error) {
        if (api.handleAuthError(error, 'provider-login.html', 'provider-bookings.html')) return;
        completing = false;
        button.disabled = false;
        say(error.message, true);
      }
    };
    actions.appendChild(button);
    card.appendChild(actions);
  }

  document.getElementById('provider-logout').onclick = function () {
    api.clearAuth();
    window.location.href = 'provider-login.html';
  };

  api.requireRole('provider', 'provider-login.html', 'provider-bookings.html').then(function (provider) {
    if (provider) load().catch(function (error) { say(error.message, true); });
  });
})();
