(function () {
  'use strict';

  var api = window.ServiceHubApi;
  var serviceParams = new URLSearchParams(window.location.search);
  var categories = ['Electrician', 'Plumber', 'Carpenter', 'AC Repair', 'Cleaning', 'Painting'];
  var providers = [];
  var latestRequestId = 0;
  var debounceTimer = null;

  var serviceSearch = document.getElementById('service-search');
  var categoryFilter = document.getElementById('category-filter');
  var locationFilter = document.getElementById('location-filter');
  var list = document.getElementById('provider-list');
  var emptyState = document.getElementById('no-providers');
  var countLabel = document.getElementById('results-count');
  var resultsTitle = document.getElementById('results-title');
  var notice = document.getElementById('listing-message');
  var providersLoading = document.getElementById('providers-loading');

  function normalized(value) {
    return String(value || '').trim().toLowerCase();
  }

  function formatCharges(value) {
    return '₹' + (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addFact(parent, label, value) {
    var fact = element('div');
    fact.appendChild(element('span', '', label));
    fact.appendChild(element('strong', '', value));
    parent.appendChild(fact);
  }

  function createCard(provider) {
    var providerId = api.getId(provider);
    var card = element('article', 'provider-card');
    card.dataset.providerId = providerId;
    var top = element('div', 'provider-card-top');
    var avatar = element('span', 'provider-avatar', (provider.fullName || 'Q').trim().charAt(0).toUpperCase());
    var nameBlock = element('div', 'provider-name');
    nameBlock.appendChild(element('h3', '', provider.fullName));
    nameBlock.appendChild(element('span', 'category-tag', provider.serviceCategory));
    top.appendChild(avatar);
    top.appendChild(nameBlock);
    card.appendChild(top);
    card.appendChild(element('p', 'provider-description', provider.description || provider.about || ''));

    var facts = element('div', 'provider-facts');
    addFact(facts, 'Location', provider.location);
    var exp = Number(provider.experience || 0);
    addFact(facts, 'Experience', exp + (exp === 1 ? ' year' : ' years'));
    addFact(facts, 'Service charges', formatCharges(provider.charges));
    card.appendChild(facts);

    var actions = element('div', 'provider-actions');
    var detailsButton = element('button', '', 'View details');
    detailsButton.type = 'button';
    detailsButton.addEventListener('click', function () {
      window.location.href = 'provider-details.html?id=' + encodeURIComponent(providerId);
    });
    var bookButton = element('button', 'book-button', 'Book now');
    bookButton.type = 'button';
    bookButton.addEventListener('click', function () { bookProvider(providerId); });
    actions.appendChild(detailsButton);
    actions.appendChild(bookButton);
    card.appendChild(actions);
    return card;
  }

  function renderProviders() {
    list.textContent = '';
    providers.forEach(function (provider) { list.appendChild(createCard(provider)); });
    emptyState.hidden = providers.length > 0;
    countLabel.textContent = providers.length + (providers.length === 1 ? ' provider' : ' providers');
    resultsTitle.textContent = categoryFilter.value ? categoryFilter.value + ' providers' : 'Available providers';
  }

  function showNotice(text, type) {
    notice.className = 'listing-message' + (type ? ' ' + type : '');
    notice.textContent = text;
    notice.hidden = false;
  }

  function hideNotice() {
    notice.hidden = true;
    notice.textContent = '';
  }

  function bookProvider(providerId) {
    window.location.href = 'service-booking.html?providerId=' + encodeURIComponent(providerId);
  }

  function buildProvidersQuery() {
    var params = new URLSearchParams();
    var category = categoryFilter.value.trim();
    var location = locationFilter.value.trim();
    var q = serviceSearch.value.trim();
    if (category) params.set('category', category);
    if (location) params.set('location', location);
    if (q) params.set('q', q);
    var query = params.toString();
    return '/providers' + (query ? '?' + query : '');
  }

  function fetchProviders() {
    var requestId = ++latestRequestId;
    providersLoading.hidden = false;
    emptyState.hidden = true;
    hideNotice();

    api.request(buildProvidersQuery(), { auth: false })
      .then(function (result) {
        if (requestId !== latestRequestId) return;
        providers = (result.data || []).map(function (provider) {
          provider.id = api.getId(provider);
          provider.about = provider.description || provider.about || '';
          return provider;
        });
        providersLoading.hidden = true;
        renderProviders();
      })
      .catch(function (error) {
        if (requestId !== latestRequestId) return;
        providers = [];
        providersLoading.hidden = true;
        showNotice(error.message, 'error');
        renderProviders();
      });
  }

  function scheduleFetch() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(fetchProviders, 250);
  }

  var requestedCategory = serviceParams.get('category') || '';
  var matchingCategory = categories.find(function (category) { return normalized(category) === normalized(requestedCategory); });
  if (matchingCategory) categoryFilter.value = matchingCategory;
  serviceSearch.value = serviceParams.get('q') || '';
  locationFilter.value = serviceParams.get('location') || '';

  var currentCustomer = api.getRole() === 'customer' ? api.getUser() : null;
  if (currentCustomer) {
    document.getElementById('customer-greeting').textContent = 'Hi, ' + currentCustomer.fullName;
    document.getElementById('customer-login-link').hidden = true;
    document.getElementById('customer-register-link').hidden = true;
    var logoutButton = document.getElementById('customer-logout');
    logoutButton.hidden = false;
    logoutButton.addEventListener('click', function () {
      api.clearAuth();
      window.location.reload();
    });
  }

  document.getElementById('provider-filters').addEventListener('submit', function (event) {
    event.preventDefault();
    window.clearTimeout(debounceTimer);
    fetchProviders();
  });
  serviceSearch.addEventListener('input', scheduleFetch);
  categoryFilter.addEventListener('change', fetchProviders);
  locationFilter.addEventListener('input', scheduleFetch);
  document.getElementById('clear-filters').addEventListener('click', function () {
    serviceSearch.value = '';
    categoryFilter.value = '';
    locationFilter.value = '';
    window.clearTimeout(debounceTimer);
    fetchProviders();
  });

  fetchProviders();
})();
