(function () {
  'use strict';

  var api = window.ServiceHubApi;
  var activeView = 'overview';
  var pendingDelete = null;
  var isDeleting = false;

  var viewTitles = {
    overview: 'Dashboard overview',
    customers: 'Customer management',
    providers: 'Provider management',
    bookings: 'All bookings management'
  };

  var allowedTransitions = {
    Pending: ['Accepted', 'Rejected', 'Rescheduled', 'Cancelled'],
    Accepted: ['Completed', 'Rescheduled', 'Cancelled'],
    Rescheduled: ['Accepted', 'Completed', 'Cancelled'],
    Rejected: [],
    Completed: [],
    Cancelled: []
  };

  var statusColors = {
    Pending: '#e09f1f',
    Accepted: '#1b9e5e',
    Completed: '#1769e0',
    Rescheduled: '#5b6ce2',
    Rejected: '#d44545',
    Cancelled: '#8a96a8'
  };

  var loadingEl = document.getElementById('admin-loading');
  var feedbackEl = document.getElementById('admin-feedback');
  var sidebar = document.getElementById('admin-sidebar');
  var backdrop = document.getElementById('sidebar-backdrop');
  var toggleBtn = document.getElementById('sidebar-toggle');
  var closeBtn = document.getElementById('sidebar-close');
  var modal = document.getElementById('confirm-modal');
  var modalTitle = document.getElementById('confirm-modal-title');
  var modalBody = document.getElementById('confirm-modal-body');
  var modalCancel = document.getElementById('confirm-modal-cancel');
  var modalOk = document.getElementById('confirm-modal-ok');

  function showFeedback(text, isError) {
    feedbackEl.textContent = text;
    feedbackEl.className = 'admin-feedback' + (isError ? ' error' : '');
    feedbackEl.hidden = false;
  }

  function clearFeedback() {
    feedbackEl.hidden = true;
    feedbackEl.textContent = '';
  }

  function formatDate(iso) {
    if (!iso) return 'Not set';
    var d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatCharges(val) {
    return '₹' + Number(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setSidebarOpen(open) {
    sidebar.classList.toggle('open', open);
    backdrop.hidden = !open;
    toggleBtn.setAttribute('aria-expanded', String(open));
  }

  function switchView(view) {
    if (!viewTitles[view]) view = 'overview';
    activeView = view;
    document.getElementById('view-title').textContent = viewTitles[view];

    document.querySelectorAll('.admin-view').forEach(function (section) {
      section.hidden = section.id !== 'view-' + view;
    });
    document.querySelectorAll('.sidebar-link').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
    setSidebarOpen(false);
    clearFeedback();
  }

  function renderStats(stats) {
    document.getElementById('stat-total-customers').textContent = stats.totalCustomers || 0;
    document.getElementById('stat-total-providers').textContent = stats.totalProviders || 0;
    document.getElementById('stat-total-bookings').textContent = stats.totalBookings || 0;
    document.getElementById('stat-pending-bookings').textContent = stats.pendingBookings || 0;
    document.getElementById('stat-accepted-bookings').textContent = stats.acceptedBookings || 0;
    document.getElementById('stat-completed-bookings').textContent = stats.completedBookings || 0;

    document.getElementById('nav-count-customers').textContent = stats.totalCustomers || 0;
    document.getElementById('nav-count-providers').textContent = stats.totalProviders || 0;
    document.getElementById('nav-count-bookings').textContent = stats.totalBookings || 0;
    document.getElementById('chart-total-label').textContent = (stats.totalBookings || 0) + ' total';

    renderDonutChart(stats);
    renderCategoryBars(stats.categoryBreakdown || []);
  }

  function renderDonutChart(stats) {
    var slices = [
      { label: 'Pending', count: stats.pendingBookings || 0 },
      { label: 'Accepted', count: stats.acceptedBookings || 0 },
      { label: 'Completed', count: stats.completedBookings || 0 },
      { label: 'Rescheduled', count: stats.rescheduledBookings || 0 },
      { label: 'Rejected', count: stats.rejectedBookings || 0 },
      { label: 'Cancelled', count: stats.cancelledBookings || 0 }
    ];
    var total = stats.totalBookings || 0;
    var wrap = document.getElementById('status-donut-wrap');
    var legend = document.getElementById('status-legend');
    wrap.textContent = '';
    legend.textContent = '';

    var radius = 56;
    var circumference = 2 * Math.PI * radius;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 144 144');
    svg.setAttribute('width', '144');
    svg.setAttribute('height', '144');

    var track = document.createElementNS(svgNS, 'circle');
    track.setAttribute('cx', '72');
    track.setAttribute('cy', '72');
    track.setAttribute('r', String(radius));
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', '#edf2f9');
    track.setAttribute('stroke-width', '16');
    svg.appendChild(track);

    if (total > 0) {
      var offset = 0;
      slices.forEach(function (slice) {
        if (!slice.count) return;
        var length = (slice.count / total) * circumference;
        var arc = document.createElementNS(svgNS, 'circle');
        arc.setAttribute('cx', '72');
        arc.setAttribute('cy', '72');
        arc.setAttribute('r', String(radius));
        arc.setAttribute('fill', 'none');
        arc.setAttribute('stroke', statusColors[slice.label] || '#1769e0');
        arc.setAttribute('stroke-width', '16');
        arc.setAttribute('stroke-dasharray', length + ' ' + circumference);
        arc.setAttribute('stroke-dashoffset', String(-offset));
        arc.setAttribute('transform', 'rotate(-90 72 72)');
        svg.appendChild(arc);
        offset += length;
      });
    }

    var center = el('div', 'donut-center');
    center.append(el('strong', '', total), el('span', '', 'Bookings'));
    wrap.append(svg, center);

    slices.forEach(function (slice) {
      var li = document.createElement('li');
      var left = el('span', 'legend-label');
      var dot = el('span', 'legend-dot');
      dot.style.background = statusColors[slice.label] || '#1769e0';
      left.append(dot, document.createTextNode(slice.label));
      var pct = total > 0 ? Math.round((slice.count / total) * 100) + '%' : '0%';
      li.append(left, el('strong', '', slice.count + ' (' + pct + ')'));
      legend.appendChild(li);
    });
  }

  function renderCategoryBars(breakdown) {
    var container = document.getElementById('category-bars');
    container.textContent = '';
    var maxTotal = 1;
    breakdown.forEach(function (item) {
      var sum = (item.providers || 0) + (item.bookings || 0);
      if (sum > maxTotal) maxTotal = sum;
    });

    breakdown.forEach(function (item) {
      var row = el('div', 'bar-row');
      var head = el('div', 'bar-row-head');
      head.append(
        el('strong', '', item.category),
        el('span', '', (item.providers || 0) + ' providers · ' + (item.bookings || 0) + ' bookings')
      );
      var track = el('div', 'bar-track');
      var provBar = el('div', 'bar-fill-providers');
      provBar.style.width = (((item.providers || 0) / maxTotal) * 100) + '%';
      var bookBar = el('div', 'bar-fill-bookings');
      bookBar.style.width = (((item.bookings || 0) / maxTotal) * 100) + '%';
      track.append(provBar, bookBar);
      row.append(head, track);
      container.appendChild(row);
    });
  }

  function renderRecentBookings(bookings) {
    var tbody = document.getElementById('recent-bookings-body');
    var empty = document.getElementById('recent-bookings-empty');
    tbody.textContent = '';
    var recent = (bookings || []).slice(0, 5);
    empty.hidden = recent.length > 0;

    recent.forEach(function (b) {
      var tr = document.createElement('tr');
      var idCell = el('td', '', '#' + api.getId(b));
      var custCell = el('td', '', b.customerName || (b.customer && b.customer.fullName) || 'Customer');
      var provCell = el('td', '', (b.provider && b.provider.fullName) || 'Provider #' + b.providerId);
      var svcCell = el('td', '', b.serviceCategory);
      var schedCell = el('td', '', (b.bookingDate || '') + ' ' + (b.bookingTime || ''));
      var statusTd = document.createElement('td');
      statusTd.appendChild(el('span', 'status-pill status-' + String(b.status || '').toLowerCase(), b.status));
      tr.append(idCell, custCell, provCell, svcCell, schedCell, statusTd);
      tbody.appendChild(tr);
    });
  }

  function openDeleteModal(type, entity) {
    var entityId = api.getId(entity);
    pendingDelete = { type: type, id: entityId, name: entity.fullName, email: entity.email };
    modalTitle.textContent = type === 'customer' ? 'Delete customer account?' : 'Delete provider account?';
    modalBody.textContent = 'Permanently delete ' + entity.fullName + ' (' + entity.email + ')? Any associated bookings will also be deleted. This action cannot be undone.';
    modalOk.disabled = false;
    modalOk.textContent = 'Delete account';
    modal.hidden = false;
    modalCancel.focus();
  }

  function closeDeleteModal() {
    if (isDeleting) return;
    pendingDelete = null;
    modal.hidden = true;
  }

  function renderCustomers(customers) {
    var tbody = document.getElementById('customers-table-body');
    var empty = document.getElementById('customers-empty');
    tbody.textContent = '';
    document.getElementById('customers-count').textContent = customers.length + (customers.length === 1 ? ' customer' : ' customers');
    empty.hidden = customers.length > 0;

    customers.forEach(function (c) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', '', '#' + api.getId(c)));
      tr.appendChild(el('td', 'cell-primary', c.fullName));
      tr.appendChild(el('td', '', c.email));
      tr.appendChild(el('td', '', c.phone));
      tr.appendChild(el('td', '', formatDate(c.createdAt)));
      var actionTd = document.createElement('td');
      var delBtn = el('button', 'table-action-delete', 'Delete');
      delBtn.type = 'button';
      delBtn.onclick = function () { openDeleteModal('customer', c); };
      actionTd.appendChild(delBtn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
  }

  function renderProviders(providers) {
    var tbody = document.getElementById('providers-table-body');
    var empty = document.getElementById('providers-empty');
    tbody.textContent = '';
    document.getElementById('providers-count').textContent = providers.length + (providers.length === 1 ? ' provider' : ' providers');
    empty.hidden = providers.length > 0;

    providers.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', '', '#' + api.getId(p)));
      var nameTd = document.createElement('td');
      nameTd.append(el('span', 'cell-primary', p.fullName), el('span', 'cell-sub', p.email));
      tr.appendChild(nameTd);
      tr.appendChild(el('td', '', p.serviceCategory));
      tr.appendChild(el('td', '', p.location));
      var exp = Number(p.experience || 0);
      tr.appendChild(el('td', '', exp + (exp === 1 ? ' yr' : ' yrs')));
      tr.appendChild(el('td', '', formatCharges(p.charges)));
      tr.appendChild(el('td', '', p.availability));
      var actionTd = document.createElement('td');
      var delBtn = el('button', 'table-action-delete', 'Delete');
      delBtn.type = 'button';
      delBtn.onclick = function () { openDeleteModal('provider', p); };
      actionTd.appendChild(delBtn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
  }

  function renderBookings(bookings) {
    var tbody = document.getElementById('bookings-table-body');
    var empty = document.getElementById('bookings-empty');
    tbody.textContent = '';
    document.getElementById('bookings-count').textContent = bookings.length + (bookings.length === 1 ? ' booking' : ' bookings');
    empty.hidden = bookings.length > 0;

    bookings.forEach(function (b) {
      var bookingId = api.getId(b);
      var tr = document.createElement('tr');
      tr.appendChild(el('td', '', '#' + bookingId));

      var custTd = document.createElement('td');
      custTd.append(
        el('span', 'cell-primary', b.customerName || (b.customer && b.customer.fullName) || 'Customer'),
        el('span', 'cell-sub', b.customerPhone || (b.customer && b.customer.phone) || '')
      );
      tr.appendChild(custTd);

      var provTd = document.createElement('td');
      provTd.append(
        el('span', 'cell-primary', (b.provider && b.provider.fullName) || 'Provider #' + b.providerId),
        el('span', 'cell-sub', (b.provider && b.provider.location) || '')
      );
      tr.appendChild(provTd);

      tr.appendChild(el('td', '', b.serviceCategory));
      tr.appendChild(el('td', '', (b.bookingDate || '') + ' ' + (b.bookingTime || '')));
      var arrival = b.confirmedProviderArrivalDate
        ? b.confirmedProviderArrivalDate + ' ' + (b.confirmedProviderArrivalTime || '')
        : 'Not set';
      tr.appendChild(el('td', '', arrival));

      var statusTd = document.createElement('td');
      statusTd.appendChild(el('span', 'status-pill status-' + String(b.status || '').toLowerCase(), b.status));
      tr.appendChild(statusTd);

      var manageTd = document.createElement('td');
      var nextOptions = allowedTransitions[b.status] || [];
      if (nextOptions.length === 0) {
        manageTd.appendChild(el('span', 'status-locked', 'Final state'));
      } else {
        var wrap = el('div', 'status-manage-wrap');
        var select = document.createElement('select');
        select.setAttribute('aria-label', 'Update status for booking ' + bookingId);
        nextOptions.forEach(function (opt) {
          var o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          select.appendChild(o);
        });
        var saveBtn = el('button', '', 'Update');
        saveBtn.type = 'button';
        saveBtn.onclick = async function () {
          saveBtn.disabled = true;
          select.disabled = true;
          try {
            await api.request('/admin/bookings/' + encodeURIComponent(bookingId) + '/status', {
              method: 'PATCH',
              body: { status: select.value }
            });
            showFeedback('Booking #' + bookingId + ' updated to ' + select.value + '.', false);
            await refreshAll();
          } catch (error) {
            if (api.handleAuthError(error, 'admin-login.html', 'admin-dashboard.html')) return;
            saveBtn.disabled = false;
            select.disabled = false;
            showFeedback(error.message, true);
          }
        };
        wrap.append(select, saveBtn);
        manageTd.appendChild(wrap);
      }
      tr.appendChild(manageTd);
      tbody.appendChild(tr);
    });
  }

  async function loadStats() {
    var result = await api.request('/admin/stats');
    renderStats(result.data);
  }

  async function loadCustomers() {
    var q = document.getElementById('customer-search').value.trim();
    var path = '/admin/customers' + (q ? '?q=' + encodeURIComponent(q) : '');
    var result = await api.request(path);
    renderCustomers(result.data || []);
  }

  async function loadProviders() {
    var params = new URLSearchParams();
    var q = document.getElementById('provider-search').value.trim();
    var category = document.getElementById('provider-category-filter').value;
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    var query = params.toString();
    var result = await api.request('/admin/providers' + (query ? '?' + query : ''));
    renderProviders(result.data || []);
  }

  async function loadBookings() {
    var params = new URLSearchParams();
    var q = document.getElementById('booking-search').value.trim();
    var status = document.getElementById('booking-status-filter').value;
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    var query = params.toString();
    var result = await api.request('/admin/bookings' + (query ? '?' + query : ''));
    var list = result.data || [];
    renderBookings(list);
    if (!q && !status) {
      renderRecentBookings(list);
    }
  }

  async function refreshAll() {
    loadingEl.hidden = false;
    try {
      await Promise.all([loadStats(), loadCustomers(), loadProviders(), loadBookings()]);
    } catch (error) {
      if (api.handleAuthError(error, 'admin-login.html', 'admin-dashboard.html')) return;
      showFeedback(error.message, true);
    } finally {
      loadingEl.hidden = true;
    }
  }

  // Event bindings
  document.querySelectorAll('.sidebar-link').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchView(btn.getAttribute('data-view'));
    });
  });

  document.querySelectorAll('[data-jump-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchView(btn.getAttribute('data-jump-view'));
    });
  });

  toggleBtn.addEventListener('click', function () { setSidebarOpen(true); });
  closeBtn.addEventListener('click', function () { setSidebarOpen(false); });
  backdrop.addEventListener('click', function () { setSidebarOpen(false); });

  document.getElementById('admin-refresh').addEventListener('click', function () {
    clearFeedback();
    refreshAll();
  });

  document.getElementById('admin-logout').addEventListener('click', function () {
    api.clearAuth();
    window.location.href = 'admin-login.html';
  });

  document.getElementById('customer-filter-form').addEventListener('submit', function (e) {
    e.preventDefault();
    loadCustomers().catch(function (err) { showFeedback(err.message, true); });
  });
  document.getElementById('customer-filter-clear').addEventListener('click', function () {
    document.getElementById('customer-search').value = '';
    loadCustomers().catch(function (err) { showFeedback(err.message, true); });
  });

  document.getElementById('provider-filter-form').addEventListener('submit', function (e) {
    e.preventDefault();
    loadProviders().catch(function (err) { showFeedback(err.message, true); });
  });
  document.getElementById('provider-category-filter').addEventListener('change', function () {
    loadProviders().catch(function (err) { showFeedback(err.message, true); });
  });
  document.getElementById('provider-filter-clear').addEventListener('click', function () {
    document.getElementById('provider-search').value = '';
    document.getElementById('provider-category-filter').value = '';
    loadProviders().catch(function (err) { showFeedback(err.message, true); });
  });

  document.getElementById('booking-filter-form').addEventListener('submit', function (e) {
    e.preventDefault();
    loadBookings().catch(function (err) { showFeedback(err.message, true); });
  });
  document.getElementById('booking-status-filter').addEventListener('change', function () {
    loadBookings().catch(function (err) { showFeedback(err.message, true); });
  });
  document.getElementById('booking-filter-clear').addEventListener('click', function () {
    document.getElementById('booking-search').value = '';
    document.getElementById('booking-status-filter').value = '';
    loadBookings().catch(function (err) { showFeedback(err.message, true); });
  });

  modalCancel.addEventListener('click', closeDeleteModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeDeleteModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeDeleteModal(); });

  modalOk.addEventListener('click', async function () {
    if (!pendingDelete || isDeleting) return;
    isDeleting = true;
    modalOk.disabled = true;
    modalOk.textContent = 'Deleting…';
    var endpoint = pendingDelete.type === 'customer'
      ? '/admin/customers/' + encodeURIComponent(pendingDelete.id)
      : '/admin/providers/' + encodeURIComponent(pendingDelete.id);
    var deletedName = pendingDelete.name;
    var deletedType = pendingDelete.type;

    try {
      await api.request(endpoint, { method: 'DELETE' });
      isDeleting = false;
      closeDeleteModal();
      showFeedback((deletedType === 'customer' ? 'Customer ' : 'Provider ') + '"' + deletedName + '" deleted successfully.', false);
      await refreshAll();
    } catch (error) {
      isDeleting = false;
      if (api.handleAuthError(error, 'admin-login.html', 'admin-dashboard.html')) return;
      modalOk.disabled = false;
      modalOk.textContent = 'Delete account';
      showFeedback(error.message, true);
    }
  });

  api.requireRole('admin', 'admin-login.html', 'admin-dashboard.html').then(function (admin) {
    if (!admin) return;
    document.getElementById('admin-name').textContent = admin.fullName || 'Administrator';
    document.getElementById('admin-email').textContent = admin.email || '';
    document.getElementById('admin-avatar').textContent = (admin.fullName || 'A').trim().charAt(0).toUpperCase();
    switchView(activeView);
    refreshAll();
  });
})();
