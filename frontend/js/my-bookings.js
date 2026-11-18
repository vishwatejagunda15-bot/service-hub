(function () {
  'use strict';
  var api = window.ServiceHubApi;
  var loginPrompt = document.getElementById('bookings-login-prompt');
  var loader = document.getElementById('bookings-loading');
  var feedback = document.getElementById('bookings-feedback');
  var summary = document.getElementById('bookings-summary');
  var list = document.getElementById('bookings-list');
  var empty = document.getElementById('bookings-empty');

  function showFeedback(text, kind) {
    feedback.textContent = text;
    feedback.className = 'listing-message ' + (kind || '');
    feedback.hidden = false;
  }
  function formatDate(value) {
    if (!value) return 'Not set';
    return new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function formatTime(value) {
    if (!value) return 'Not set';
    var parts = value.split(':');
    var date = new Date();
    date.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function addDetail(parent, label, value, extraClass) {
    var item = document.createElement('div');
    item.className = 'booking-detail' + (extraClass ? ' ' + extraClass : '');
    var title = document.createElement('span');
    title.textContent = label;
    var content = document.createElement('strong');
    content.textContent = value || 'Not provided';
    item.append(title, content);
    parent.appendChild(item);
  }
  function canCancel(booking) {
    return ['Pending', 'Accepted'].includes(booking.status) && new Date(booking.bookingDate + 'T' + booking.bookingTime + ':00') > new Date();
  }
  function renderBooking(booking) {
    var bookingId = api.getId(booking);
    var card = document.createElement('article');
    card.className = 'booking-card';
    var heading = document.createElement('div');
    heading.className = 'booking-card-header';
    var identity = document.createElement('div');
    var id = document.createElement('strong');
    id.className = 'booking-id';
    id.textContent = 'Booking #' + bookingId;
    identity.appendChild(id);
    var badge = document.createElement('span');
    badge.className = 'booking-status status-' + String(booking.status).toLowerCase();
    badge.textContent = booking.status;
    heading.append(identity, badge);
    card.appendChild(heading);

    var body = document.createElement('div');
    body.className = 'booking-card-body';
    addDetail(body, 'Provider', booking.provider && booking.provider.fullName);
    addDetail(body, 'Service category', booking.serviceCategory);
    addDetail(body, 'Booking date', formatDate(booking.bookingDate));
    addDetail(body, 'Preferred time', formatTime(booking.bookingTime));
    addDetail(body, 'Address', booking.address);
    var arrival = booking.confirmedProviderArrivalDate
      ? formatDate(booking.confirmedProviderArrivalDate) + ' at ' + formatTime(booking.confirmedProviderArrivalTime)
      : 'Not confirmed yet';
    addDetail(body, 'Confirmed provider arrival', arrival, 'arrival-detail');
    card.appendChild(body);

    if (canCancel(booking)) {
      var footer = document.createElement('div');
      footer.className = 'booking-card-footer';
      var note = document.createElement('p');
      note.textContent = 'You can cancel this future booking while it is pending or accepted.';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'cancel-booking';
      cancel.textContent = 'Cancel booking';
      var cancelling = false;
      cancel.onclick = async function () {
        if (cancelling) return;
        if (!window.confirm('Cancel booking #' + bookingId + '? This cannot be undone.')) return;
        cancelling = true;
        cancel.disabled = true;
        cancel.textContent = 'Cancelling…';
        try {
          await api.request('/bookings/' + encodeURIComponent(bookingId) + '/cancel', { method: 'PATCH', body: {} });
          showFeedback('Booking cancelled successfully.', 'success');
          await load();
        } catch (error) {
          if (api.handleAuthError(error, 'login.html', 'my-bookings.html')) return;
          cancelling = false;
          cancel.disabled = false;
          cancel.textContent = 'Cancel booking';
          showFeedback(error.message, 'error');
        }
      };
      footer.append(note, cancel);
      card.appendChild(footer);
    }
    return card;
  }
  async function load() {
    loader.hidden = false;
    empty.hidden = true;
    try {
      var result = await api.request('/bookings/my');
      var bookings = result.data || [];
      list.textContent = '';
      bookings.forEach(function (booking) { list.appendChild(renderBooking(booking)); });
      document.getElementById('bookings-count').textContent = bookings.length + (bookings.length === 1 ? ' booking' : ' bookings');
      summary.hidden = false;
      empty.hidden = bookings.length > 0;
    } catch (error) {
      if (api.handleAuthError(error, 'login.html', 'my-bookings.html')) return;
      summary.hidden = true;
      showFeedback(error.message, 'error');
    } finally { loader.hidden = true; }
  }

  var logout = document.getElementById('customer-logout');
  logout.onclick = function () { api.clearAuth(); window.location.href = 'index.html'; };
  api.requireRole('customer', 'login.html', 'my-bookings.html').then(function (user) {
    if (!user) return;
    logout.hidden = false;
    loginPrompt.hidden = true;
    document.getElementById('customer-greeting').textContent = 'Hi, ' + user.fullName;
    load();
  });
})();
