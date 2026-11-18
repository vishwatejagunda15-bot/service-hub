(function () {
  'use strict';
  var api = window.ServiceHubApi;
  var loading = document.getElementById('dashboard-loading');
  var message = document.getElementById('dashboard-message');
  function setText(id, value) {
    document.getElementById(id).textContent = (value === undefined || value === null || value === '') ? 'Not provided' : value;
  }
  function showError(text) { message.textContent = text; message.className = 'form-message error'; message.hidden = false; }
  function formatDate(value) { return value ? new Date(value + 'T00:00:00').toLocaleDateString() : 'Not set'; }
  function formatCharges(value) { return '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
  function buildRequestCard(booking) {
    var card = document.createElement('article');
    card.className = 'request-card';

    var header = document.createElement('div');
    header.className = 'request-card-header';
    var customerWrap = document.createElement('div');
    var name = document.createElement('strong');
    name.className = 'request-customer';
    name.textContent = booking.customerName || (booking.customer && booking.customer.fullName) || 'Customer';
    var bookingId = document.createElement('span');
    bookingId.className = 'request-id';
    bookingId.textContent = 'Booking #' + api.getId(booking);
    customerWrap.append(name, bookingId);

    var status = document.createElement('span');
    status.className = 'request-status status-' + String(booking.status || 'pending').toLowerCase();
    status.textContent = booking.status;
    header.append(customerWrap, status);

    var details = document.createElement('div');
    details.className = 'request-details';
    [
      ['Service', booking.serviceCategory],
      ['Date', formatDate(booking.bookingDate)],
      ['Time', booking.bookingTime || 'Not set'],
      ['Address', booking.address || 'Not provided']
    ].forEach(function (pair) {
      var item = document.createElement('div');
      var label = document.createElement('span');
      label.textContent = pair[0];
      var val = document.createElement('strong');
      val.textContent = pair[1];
      item.append(label, val);
      details.appendChild(item);
    });

    card.append(header, details);
    return card;
  }
  async function load() {
    loading.hidden = false;
    try {
      var results = await Promise.all([api.request('/providers/me'), api.request('/bookings/provider')]);
      var provider = results[0].data;
      var bookings = results[1].data;
      setText('provider-name', provider.fullName);
      setText('profile-name', provider.fullName);
      setText('profile-category', provider.serviceCategory);
      setText('profile-email', provider.email);
      setText('profile-phone', provider.phone);
      setText('profile-location', provider.location);
      var exp = Number(provider.experience || 0);
      setText('profile-experience', exp + (exp === 1 ? ' year' : ' years'));
      setText('profile-charges', formatCharges(provider.charges));
      setText('profile-availability', provider.availability);
      var count = { Pending: 0, Accepted: 0, Completed: 0 };
      bookings.forEach(function (booking) { if (count[booking.status] !== undefined) count[booking.status]++; });
      setText('total-bookings', bookings.length);
      setText('pending-bookings', count.Pending);
      setText('accepted-bookings', count.Accepted);
      setText('completed-bookings', count.Completed);
      var list = document.getElementById('booking-request-list');
      list.textContent = '';
      bookings.slice(0, 4).forEach(function (booking) {
        list.appendChild(buildRequestCard(booking));
      });
      setText('recent-count', bookings.length + (bookings.length === 1 ? ' request' : ' requests'));
      document.getElementById('no-booking-requests').hidden = bookings.length > 0;
    } catch (error) {
      if (api.handleAuthError(error, 'provider-login.html', 'provider-dashboard.html')) return;
      showError(error.message);
    }
    finally { loading.hidden = true; }
  }
  document.getElementById('provider-logout').onclick = function () { api.clearAuth(); window.location.href = 'provider-login.html'; };
  api.requireRole('provider', 'provider-login.html', 'provider-dashboard.html').then(function (provider) { if (provider) load(); });
})();
