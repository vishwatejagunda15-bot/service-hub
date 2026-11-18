(function () {
  'use strict';
  var id = (new URLSearchParams(window.location.search).get('id') || '').trim();
  var profile = document.getElementById('provider-profile');
  var missing = document.getElementById('provider-not-found');
  var loading = document.getElementById('provider-loading');
  function text(field, value) {
    document.getElementById(field).textContent = (value === undefined || value === null || value === '') ? 'Not provided' : value;
  }
  function showMissing(msg) {
    loading.hidden = true;
    missing.hidden = false;
    var span = missing.querySelector('span');
    if (span && msg) span.textContent = msg;
  }
  function render(provider) {
    if (!provider || Array.isArray(provider)) {
      showMissing('We could not find this provider.');
      return;
    }
    profile.hidden = false;
    document.getElementById('back-to-list').href = 'services.html?category=' + encodeURIComponent(provider.serviceCategory);
    text('profile-avatar', (provider.fullName || 'Q').charAt(0).toUpperCase());
    text('profile-category', provider.serviceCategory);
    text('profile-name', provider.fullName);
    text('profile-location', provider.location);
    text('profile-availability', provider.availability);
    text('profile-about', provider.description || provider.about);
    text('fact-category', provider.serviceCategory);
    var exp = Number(provider.experience || 0);
    text('fact-experience', exp + (exp === 1 ? ' year' : ' years'));
    text('fact-location', provider.location);
    text('fact-availability', provider.availability);
    text('profile-charges', '₹' + Number(provider.charges || 0).toLocaleString('en-IN'));
    var phone = document.getElementById('profile-phone');
    phone.textContent = provider.phone || 'Not provided';
    phone.href = provider.phone ? 'tel:' + provider.phone.replace(/[^+\d]/g, '') : '#';
    var email = document.getElementById('profile-email');
    email.textContent = provider.email || 'Not provided';
    email.href = provider.email ? 'mailto:' + provider.email : '#';
    document.getElementById('book-provider').onclick = function () {
      window.location.href = 'service-booking.html?providerId=' + encodeURIComponent(window.ServiceHubApi.getId(provider));
    };
  }
  if (!id) {
    showMissing('No provider was selected. Please browse available providers.');
    return;
  }
  window.ServiceHubApi.request('/providers/' + encodeURIComponent(id), { auth: false })
    .then(function (result) { loading.hidden = true; render(result.data); })
    .catch(function (error) {
      showMissing(error && (error.status === 404 || error.status === 400)
        ? 'We couldn’t find this provider.'
        : 'Provider details could not be loaded. Please check your connection and try again.');
    });
})();
