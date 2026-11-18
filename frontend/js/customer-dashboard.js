(function () {
  'use strict';

  var api = window.ServiceHubApi;
  var state = {
    customer: null,
    bookings: [],
    providers: [],
    providersLoaded: false,
    activeView: 'overview',
    selectedCategory: '',
    pendingCancelId: null,
    activeDetailsBooking: null
  };

  var viewMeta = {
    overview: { eyebrow: 'CUSTOMER DASHBOARD', title: 'Dashboard overview' },
    bookings: { eyebrow: 'BOOKING MANAGEMENT', title: 'My bookings' },
    services: { eyebrow: 'SERVICE MARKETPLACE', title: 'Find services' },
    profile: { eyebrow: 'ACCOUNT SETTINGS', title: 'Edit profile' }
  };

  var sidebar = document.getElementById('customer-sidebar');
  var backdrop = document.getElementById('sidebar-backdrop');
  var sidebarToggle = document.getElementById('sidebar-toggle');
  var loadingEl = document.getElementById('dashboard-loading');
  var feedbackEl = document.getElementById('dashboard-feedback');
  var profileMessageEl = document.getElementById('profile-form-message');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = (value === undefined || value === null || value === '') ? 'Not provided' : String(value);
  }

  function showFeedback(text, kind) {
    feedbackEl.textContent = text;
    feedbackEl.className = 'cd-feedback ' + (kind || '');
    feedbackEl.hidden = false;
  }

  function hideFeedback() {
    feedbackEl.textContent = '';
    feedbackEl.hidden = true;
    feedbackEl.className = 'cd-feedback';
  }

  function showProfileMessage(text, kind) {
    profileMessageEl.textContent = text;
    profileMessageEl.className = 'cd-feedback ' + (kind || '');
    profileMessageEl.hidden = false;
  }

  function hideProfileMessage() {
    profileMessageEl.textContent = '';
    profileMessageEl.hidden = true;
    profileMessageEl.className = 'cd-feedback';
  }

  function formatDate(value) {
    if (!value) return 'Not set';
    var parsed = value.length === 10 ? new Date(value + 'T00:00:00') : new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatTime(value) {
    if (!value) return 'Not set';
    var parts = String(value).split(':');
    if (parts.length < 2) return String(value);
    var dt = new Date();
    dt.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function formatCurrency(value) {
    if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value))) {
      return 'On inspection';
    }
    return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function getBookingTimestamp(booking) {
    if (!booking || !booking.bookingDate) return 0;
    var timeStr = booking.bookingTime || '00:00';
    var dt = new Date(booking.bookingDate + 'T' + timeStr + ':00');
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  function isUpcomingBooking(booking) {
    if (!booking) return false;
    var activeStatuses = ['Pending', 'Accepted', 'Rescheduled'];
    if (activeStatuses.indexOf(booking.status) === -1) return false;
    return getBookingTimestamp(booking) > Date.now();
  }

  function canCancelBooking(booking) {
    if (!booking) return false;
    return ['Pending', 'Accepted'].indexOf(booking.status) !== -1 && getBookingTimestamp(booking) > Date.now();
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.hidden = true;
    sidebarToggle.setAttribute('aria-expanded', 'false');
  }

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.hidden = false;
    sidebarToggle.setAttribute('aria-expanded', 'true');
  }

  function switchView(viewName) {
    if (!viewMeta[viewName]) viewName = 'overview';
    state.activeView = viewName;

    document.querySelectorAll('.cd-view').forEach(function (section) {
      section.hidden = section.id !== 'view-' + viewName;
    });
    document.querySelectorAll('.cd-nav-link[data-view]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    setText('view-eyebrow', viewMeta[viewName].eyebrow);
    setText('view-title', viewMeta[viewName].title);
    closeSidebar();

    if (viewName === 'services' && !state.providersLoaded) {
      loadProviders();
    }
  }

  function renderCustomerIdentity() {
    var c = state.customer;
    if (!c) return;
    var fullName = c.fullName || 'Customer';
    var initial = fullName.trim().charAt(0).toUpperCase() || 'C';
    var joined = c.createdAt ? formatDate(c.createdAt) : 'Active member';
    var cid = '#' + api.getId(c);

    setText('customer-welcome-name', fullName);
    setText('sidebar-avatar', initial);
    setText('sidebar-customer-name', fullName);
    setText('sidebar-customer-email', c.email || '');

    setText('overview-profile-avatar', initial);
    setText('overview-profile-name', fullName);
    setText('overview-profile-email', c.email);
    setText('overview-profile-phone', c.phone);
    setText('overview-profile-joined', joined);
    setText('overview-profile-id', cid);

    setText('profile-avatar', initial);
    setText('profile-display-name', fullName);
    setText('profile-display-email', c.email);
    setText('profile-display-joined', joined);
    setText('profile-display-id', cid);
    setText('profile-display-bookings', state.bookings.length);

    document.getElementById('profile-fullName').value = c.fullName || '';
    document.getElementById('profile-email').value = c.email || '';
    document.getElementById('profile-phone').value = c.phone || '';
  }

  function buildBookingCard(booking) {
    var bookingId = api.getId(booking);
    var providerName = (booking.provider && booking.provider.fullName) || 'Assigned Provider';
    var amountText = booking.provider && booking.provider.charges !== undefined
      ? formatCurrency(booking.provider.charges)
      : 'On inspection';

    var card = el('article', 'cd-booking-card');
    card.dataset.bookingId = bookingId;

    var top = el('div', 'cd-booking-top');
    var titleGroup = el('div', 'cd-booking-title-group');
    titleGroup.appendChild(el('strong', 'cd-booking-provider', providerName));
    var sub = el('div', 'cd-booking-sub');
    sub.appendChild(el('span', 'cd-category-chip', booking.serviceCategory || 'Service'));
    sub.appendChild(el('span', '', 'Booking #' + bookingId));
    titleGroup.appendChild(sub);

    var badge = el('span', 'cd-status-badge status-' + String(booking.status || 'pending').toLowerCase(), booking.status || 'Pending');
    top.append(titleGroup, badge);
    card.appendChild(top);

    var grid = el('div', 'cd-booking-grid');
    [
      ['Booking Date', formatDate(booking.bookingDate)],
      ['Preferred Time', formatTime(booking.bookingTime)],
      ['Estimated Charge', amountText],
      ['Provider Location', (booking.provider && booking.provider.location) || 'Local service']
    ].forEach(function (pair) {
      var fact = el('div', 'cd-booking-fact');
      fact.append(el('span', '', pair[0]), el('strong', '', pair[1]));
      grid.appendChild(fact);
    });
    card.appendChild(grid);

    if (booking.confirmedProviderArrivalDate) {
      var arrival = el('div', 'cd-booking-arrival');
      arrival.textContent = 'Confirmed provider arrival: ' +
        formatDate(booking.confirmedProviderArrivalDate) + ' at ' +
        formatTime(booking.confirmedProviderArrivalTime);
      card.appendChild(arrival);
    }

    var footer = el('div', 'cd-booking-footer');
    footer.appendChild(el('span', 'cd-booking-address', 'Address: ' + (booking.address || 'Not provided')));

    var actions = el('div', 'cd-booking-actions');
    var detailsBtn = el('button', 'cd-btn-secondary cd-btn-sm', 'View details');
    detailsBtn.type = 'button';
    detailsBtn.addEventListener('click', function () { openDetailsModal(booking); });
    actions.appendChild(detailsBtn);

    if (canCancelBooking(booking)) {
      var cancelBtn = el('button', 'cd-btn-danger cd-btn-sm', 'Cancel booking');
      cancelBtn.type = 'button';
      cancelBtn.addEventListener('click', function () { openCancelModal(booking); });
      actions.appendChild(cancelBtn);
    }

    footer.appendChild(actions);
    card.appendChild(footer);
    return card;
  }

  function renderOverviewAndStats() {
    var bookings = state.bookings;
    var counts = { Pending: 0, Accepted: 0, Completed: 0 };
    bookings.forEach(function (b) {
      if (counts[b.status] !== undefined) counts[b.status]++;
    });

    setText('stat-total-bookings', bookings.length);
    setText('stat-pending-bookings', counts.Pending);
    setText('stat-accepted-bookings', counts.Accepted);
    setText('stat-completed-bookings', counts.Completed);
    setText('nav-count-bookings', bookings.length);
    setText('profile-display-bookings', bookings.length);

    // Upcoming bookings sorted soonest first
    var upcoming = bookings
      .filter(isUpcomingBooking)
      .sort(function (a, b) { return getBookingTimestamp(a) - getBookingTimestamp(b); });

    var upcomingList = document.getElementById('upcoming-bookings-list');
    upcomingList.textContent = '';
    upcoming.slice(0, 4).forEach(function (b) { upcomingList.appendChild(buildBookingCard(b)); });
    setText('upcoming-count', upcoming.length + ' upcoming');
    document.getElementById('upcoming-bookings-empty').hidden = upcoming.length > 0;

    // Recent bookings (already ordered createdAt desc from API)
    var recentList = document.getElementById('recent-bookings-list');
    recentList.textContent = '';
    bookings.slice(0, 5).forEach(function (b) { recentList.appendChild(buildBookingCard(b)); });
    setText('recent-count', bookings.length + (bookings.length === 1 ? ' total' : ' total'));
    document.getElementById('recent-bookings-empty').hidden = bookings.length > 0;
  }

  function renderAllBookings() {
    var query = (document.getElementById('booking-search').value || '').trim().toLowerCase();
    var statusFilter = document.getElementById('booking-status-filter').value;

    var filtered = state.bookings.filter(function (b) {
      if (statusFilter && b.status !== statusFilter) return false;
      if (!query) return true;
      var haystack = [
        api.getId(b),
        b.serviceCategory,
        b.address,
        b.description,
        b.status,
        b.provider && b.provider.fullName,
        b.provider && b.provider.location
      ].join(' ').toLowerCase();
      return haystack.indexOf(query) !== -1;
    });

    var container = document.getElementById('all-bookings-list');
    container.textContent = '';
    filtered.forEach(function (b) { container.appendChild(buildBookingCard(b)); });

    setText('bookings-filtered-count', filtered.length + (filtered.length === 1 ? ' booking' : ' bookings'));
    var emptyEl = document.getElementById('all-bookings-empty');
    emptyEl.hidden = filtered.length > 0;
    if (filtered.length === 0) {
      var hasFilter = Boolean(query || statusFilter);
      setText('all-bookings-empty-title', hasFilter ? 'No matching bookings' : 'No bookings yet');
      setText(
        'all-bookings-empty-copy',
        hasFilter
          ? 'Try adjusting your search or status filter.'
          : 'When you book a local service provider, your bookings will appear here.'
      );
    }
  }

  function openDetailsModal(booking) {
    state.activeDetailsBooking = booking;
    var bookingId = api.getId(booking);
    var modal = document.getElementById('booking-details-modal');

    setText('details-modal-title', 'Booking #' + bookingId);
    var statusEl = document.getElementById('details-modal-status');
    statusEl.textContent = booking.status;
    statusEl.className = 'cd-status-badge status-' + String(booking.status || 'pending').toLowerCase();
    setText('details-modal-created', booking.createdAt ? 'Booked on ' + formatDate(booking.createdAt) : '');

    var body = document.getElementById('details-modal-body');
    body.textContent = '';
    var provider = booking.provider || {};
    var arrivalText = booking.confirmedProviderArrivalDate
      ? formatDate(booking.confirmedProviderArrivalDate) + ' at ' + formatTime(booking.confirmedProviderArrivalTime)
      : 'Awaiting provider confirmation';

    [
      ['Service Provider', provider.fullName || 'Not available'],
      ['Service Category', booking.serviceCategory || 'Not set'],
      ['Provider Phone', provider.phone || 'Not provided'],
      ['Provider Email', provider.email || 'Not provided'],
      ['Service Charge', provider.charges !== undefined ? formatCurrency(provider.charges) : 'On inspection'],
      ['Booking Schedule', formatDate(booking.bookingDate) + ' at ' + formatTime(booking.bookingTime)],
      ['Confirmed Arrival', arrivalText],
      ['Service Address', booking.address || 'Not provided']
    ].forEach(function (pair) {
      var item = el('div', 'cd-details-item');
      item.append(el('span', '', pair[0]), el('strong', '', pair[1]));
      body.appendChild(item);
    });

    setText('details-modal-description', booking.description || 'No additional description provided.');

    var providerId = api.getId(provider) || booking.providerId;
    var providerLink = document.getElementById('details-modal-provider-link');
    providerLink.href = providerId ? 'provider-details.html?id=' + encodeURIComponent(providerId) : 'services.html';

    var cancelBtn = document.getElementById('details-modal-cancel-booking');
    cancelBtn.hidden = !canCancelBooking(booking);

    modal.hidden = false;
  }

  function closeDetailsModal() {
    document.getElementById('booking-details-modal').hidden = true;
    state.activeDetailsBooking = null;
  }

  function openCancelModal(booking) {
    state.pendingCancelId = api.getId(booking);
    var providerName = (booking.provider && booking.provider.fullName) || 'this provider';
    setText(
      'cancel-modal-body',
      'Cancel Booking #' + state.pendingCancelId + ' (' + booking.serviceCategory + ' with ' + providerName + ' on ' + formatDate(booking.bookingDate) + ')? This action cannot be undone.'
    );
    document.getElementById('cancel-modal').hidden = false;
  }

  function closeCancelModal() {
    document.getElementById('cancel-modal').hidden = true;
    state.pendingCancelId = null;
  }

  async function confirmCancelBooking() {
    if (!state.pendingCancelId) return;
    var bookingId = state.pendingCancelId;
    var confirmBtn = document.getElementById('cancel-modal-confirm');
    var originalText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Cancelling…';
    hideFeedback();

    try {
      await api.request('/bookings/' + encodeURIComponent(bookingId) + '/cancel', {
        method: 'PATCH',
        body: {}
      });
      closeCancelModal();
      closeDetailsModal();
      showFeedback('Booking #' + bookingId + ' has been cancelled.', 'success');
      await loadDashboardData();
    } catch (error) {
      closeCancelModal();
      if (api.handleAuthError(error, 'login.html', 'customer-dashboard.html')) return;
      showFeedback(error.message || 'Could not cancel this booking.', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalText;
    }
  }

  function buildProviderCard(provider) {
    var providerId = api.getId(provider);
    var card = el('article', 'cd-provider-card');

    var head = el('div', 'cd-provider-head');
    head.appendChild(el('span', 'cd-provider-avatar', (provider.fullName || 'P').trim().charAt(0).toUpperCase()));
    var meta = el('div');
    meta.appendChild(el('h4', '', provider.fullName || 'Service Provider'));
    meta.appendChild(el('span', 'cd-category-chip', provider.serviceCategory || 'Service'));
    head.appendChild(meta);
    card.appendChild(head);

    card.appendChild(el('p', 'cd-provider-desc', provider.description || provider.about || 'Trusted local home service specialist.'));

    var facts = el('div', 'cd-provider-facts');
    var exp = Number(provider.experience || 0);
    [
      ['Location', provider.location || 'Local'],
      ['Experience', exp + (exp === 1 ? ' yr' : ' yrs')],
      ['Charges', formatCurrency(provider.charges)]
    ].forEach(function (pair) {
      var box = el('div');
      box.append(el('span', '', pair[0]), el('strong', '', pair[1]));
      facts.appendChild(box);
    });
    card.appendChild(facts);

    var actions = el('div', 'cd-provider-actions');
    var viewLink = el('a', 'cd-btn-secondary cd-btn-sm', 'View details');
    viewLink.href = 'provider-details.html?id=' + encodeURIComponent(providerId);
    var bookLink = el('a', 'cd-btn-primary cd-btn-sm', 'Book now');
    bookLink.href = 'service-booking.html?providerId=' + encodeURIComponent(providerId);
    actions.append(viewLink, bookLink);
    card.appendChild(actions);

    return card;
  }

  async function loadProviders() {
    var providersLoading = document.getElementById('dashboard-providers-loading');
    var providersList = document.getElementById('dashboard-providers-list');
    var providersEmpty = document.getElementById('dashboard-providers-empty');

    providersLoading.hidden = false;
    providersEmpty.hidden = true;

    var params = new URLSearchParams();
    if (state.selectedCategory) params.set('category', state.selectedCategory);
    var q = (document.getElementById('service-search-input').value || '').trim();
    var loc = (document.getElementById('service-location-input').value || '').trim();
    if (q) params.set('q', q);
    if (loc) params.set('location', loc);

    try {
      var result = await api.request('/providers' + (params.toString() ? '?' + params.toString() : ''), { auth: false });
      state.providers = result.data || [];
      state.providersLoaded = true;
      providersList.textContent = '';
      state.providers.forEach(function (p) { providersList.appendChild(buildProviderCard(p)); });
      setText('services-count', state.providers.length + (state.providers.length === 1 ? ' provider' : ' providers'));
      providersEmpty.hidden = state.providers.length > 0;
    } catch (error) {
      providersList.textContent = '';
      providersEmpty.hidden = false;
      showFeedback(error.message || 'Could not load service providers.', 'error');
    } finally {
      providersLoading.hidden = true;
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    hideProfileMessage();

    var form = document.getElementById('customer-profile-form');
    var fullNameInput = form.elements.fullName;
    var phoneInput = form.elements.phone;

    fullNameInput.classList.remove('invalid');
    phoneInput.classList.remove('invalid');

    if (!form.checkValidity()) {
      form.reportValidity();
      var firstInvalid = form.querySelector(':invalid');
      if (firstInvalid) firstInvalid.classList.add('invalid');
      showProfileMessage('Please enter a valid full name (2–80 characters) and phone number.', 'error');
      return;
    }

    var saveBtn = document.getElementById('profile-save-btn');
    var originalLabel = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving changes…';

    try {
      var result = await api.request('/customers/me', {
        method: 'PATCH',
        body: {
          fullName: fullNameInput.value.trim(),
          phone: phoneInput.value.trim()
        }
      });
      state.customer = result.data;
      api.setUser(result.data);
      renderCustomerIdentity();
      showProfileMessage('Your profile has been updated successfully.', 'success');
    } catch (error) {
      if (api.handleAuthError(error, 'login.html', 'customer-dashboard.html')) return;
      showProfileMessage(error.message || 'Could not update your profile.', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalLabel;
    }
  }

  async function loadDashboardData() {
    loadingEl.hidden = false;
    try {
      var results = await Promise.all([
        api.request('/customers/me'),
        api.request('/bookings/my')
      ]);
      state.customer = results[0].data;
      api.setUser(state.customer);
      state.bookings = results[1].data || [];

      renderCustomerIdentity();
      renderOverviewAndStats();
      renderAllBookings();
      switchView(state.activeView);
    } catch (error) {
      if (api.handleAuthError(error, 'login.html', 'customer-dashboard.html')) return;
      showFeedback(error.message || 'Failed to load your dashboard data.', 'error');
    } finally {
      loadingEl.hidden = true;
    }
  }

  function wireEvents() {
    sidebarToggle.addEventListener('click', openSidebar);
    document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
    backdrop.addEventListener('click', closeSidebar);

    document.querySelectorAll('.cd-nav-link[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        hideFeedback();
        switchView(btn.getAttribute('data-view'));
      });
    });

    document.querySelectorAll('[data-jump-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        hideFeedback();
        switchView(btn.getAttribute('data-jump-view'));
      });
    });

    document.getElementById('dashboard-refresh').addEventListener('click', function () {
      hideFeedback();
      loadDashboardData();
      if (state.activeView === 'services') loadProviders();
    });

    document.getElementById('customer-logout').addEventListener('click', function () {
      api.clearAuth();
      window.location.href = 'login.html';
    });

    document.getElementById('booking-filter-form').addEventListener('submit', function (event) {
      event.preventDefault();
      renderAllBookings();
    });
    document.getElementById('booking-search').addEventListener('input', renderAllBookings);
    document.getElementById('booking-status-filter').addEventListener('change', renderAllBookings);
    document.getElementById('booking-filter-clear').addEventListener('click', function () {
      document.getElementById('booking-search').value = '';
      document.getElementById('booking-status-filter').value = '';
      renderAllBookings();
    });

    document.querySelectorAll('#service-category-pills .cd-cat-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        document.querySelectorAll('#service-category-pills .cd-cat-pill').forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        state.selectedCategory = pill.getAttribute('data-category') || '';
        loadProviders();
      });
    });

    document.getElementById('dashboard-service-filter').addEventListener('submit', function (event) {
      event.preventDefault();
      loadProviders();
    });

    function resetServiceFilters() {
      state.selectedCategory = '';
      document.getElementById('service-search-input').value = '';
      document.getElementById('service-location-input').value = '';
      document.querySelectorAll('#service-category-pills .cd-cat-pill').forEach(function (p) {
        p.classList.toggle('active', (p.getAttribute('data-category') || '') === '');
      });
      loadProviders();
    }

    document.getElementById('service-filter-reset').addEventListener('click', resetServiceFilters);
    document.getElementById('service-empty-reset').addEventListener('click', resetServiceFilters);

    document.getElementById('customer-profile-form').addEventListener('submit', handleProfileSubmit);

    document.getElementById('details-modal-close').addEventListener('click', closeDetailsModal);
    document.getElementById('details-modal-done').addEventListener('click', closeDetailsModal);
    document.getElementById('details-modal-cancel-booking').addEventListener('click', function () {
      if (state.activeDetailsBooking) openCancelModal(state.activeDetailsBooking);
    });
    document.getElementById('booking-details-modal').addEventListener('click', function (event) {
      if (event.target === event.currentTarget) closeDetailsModal();
    });

    document.getElementById('cancel-modal-keep').addEventListener('click', closeCancelModal);
    document.getElementById('cancel-modal-confirm').addEventListener('click', confirmCancelBooking);
    document.getElementById('cancel-modal').addEventListener('click', function (event) {
      if (event.target === event.currentTarget) closeCancelModal();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeCancelModal();
        closeDetailsModal();
        closeSidebar();
      }
    });
  }

  wireEvents();

  // Protect page strictly for authenticated customers
  api.requireRole('customer', 'login.html', 'customer-dashboard.html').then(function (customer) {
    if (!customer) return;
    state.customer = customer;
    var hashView = (window.location.hash || '').replace(/^#/, '');
    if (viewMeta[hashView]) state.activeView = hashView;
    loadDashboardData();
  });
})();
