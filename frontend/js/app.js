(function () {
  'use strict';

  angular.module('serviceHubApp', [])
    .controller('HomeController', function ($scope) {
      var vm = this;

      vm.searchText = '';
      vm.message = '';

      function syncAuthNav() {
        var api = window.ServiceHubApi;
        var isAuth = api && api.isAuthenticated && api.isAuthenticated();
        var role = isAuth ? api.getRole() : '';
        var user = isAuth ? (api.getUser() || {}) : null;

        if (role === 'customer') {
          vm.authRole = 'customer';
          vm.currentUser = (user && user.fullName) || 'Customer';
          vm.dashboardUrl = 'customer-dashboard.html';
          vm.dashboardLabel = 'Customer Dashboard';
        } else if (role === 'provider') {
          vm.authRole = 'provider';
          vm.currentUser = (user && user.fullName) || 'Provider';
          vm.dashboardUrl = 'provider-dashboard.html';
          vm.dashboardLabel = 'Provider Dashboard';
        } else if (role === 'admin') {
          vm.authRole = 'admin';
          vm.currentUser = (user && user.fullName) || 'Admin';
          vm.dashboardUrl = 'admin-dashboard.html';
          vm.dashboardLabel = 'Admin Dashboard';
        } else {
          vm.authRole = '';
          vm.currentUser = '';
          vm.dashboardUrl = '';
          vm.dashboardLabel = '';
        }
      }

      syncAuthNav();
      vm.services = [
        { name: 'Electrician', icon: '⚡', color: 'icon-yellow' },
        { name: 'Plumber', icon: '⌁', color: 'icon-blue' },
        { name: 'Carpenter', icon: '⌁', color: 'icon-orange' },
        { name: 'AC Repair', icon: '❄', color: 'icon-sky' },
        { name: 'Cleaning', icon: '✦', color: 'icon-green' },
        { name: 'Painting', icon: '◒', color: 'icon-pink' }
      ];

      vm.searchServices = function () {
        var query = encodeURIComponent(vm.searchText || '');
        window.location.href = 'services.html' + (query ? '?q=' + query : '');
      };

      vm.chooseService = function (serviceName) {
        window.location.href = 'services.html?category=' + encodeURIComponent(serviceName);
      };

      vm.showMessage = function (message) {
        vm.message = message;
        document.getElementById('services').scrollIntoView({ behavior: 'smooth' });
      };

      vm.logout = function () {
        window.ServiceHubApi.clearAuth();
        syncAuthNav();
        vm.message = 'You have been logged out.';
      };

      // jQuery controls the small-screen menu while AngularJS handles page data.
      $(function () {
        var $toggle = $('.menu-toggle');
        var $nav = $('.main-nav');
        var $actions = $('.account-actions');

        $toggle.on('click', function () {
          var isOpen = $toggle.toggleClass('open').hasClass('open');
          $nav.toggleClass('nav-open', isOpen);
          $actions.toggleClass('actions-open', isOpen);
          $toggle.attr('aria-expanded', isOpen);
        });

        $('.main-nav a').on('click', function () {
          $toggle.removeClass('open').attr('aria-expanded', 'false');
          $nav.removeClass('nav-open');
          $actions.removeClass('actions-open');
        });
      });
    });
})();
