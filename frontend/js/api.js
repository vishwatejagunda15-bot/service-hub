(function (window, document) {
  'use strict';

  function resolveApiRoot() {
    if (window.SERVICEHUB_API_URL) {
      return String(window.SERVICEHUB_API_URL).replace(/\/$/, '');
    }
    var meta = document && document.querySelector && document.querySelector('meta[name="servicehub-api-url"]');
    if (meta && meta.content) {
      return String(meta.content).trim().replace(/\/$/, '');
    }

    var loc = window.location || {};
    if (!loc.origin || loc.origin === 'null' || loc.protocol === 'file:') {
      return 'http://localhost:3000/api';
    }

    var isLocalHost = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
    var separateDevPorts = ['5500', '5501', '5173', '4173', '8000', '8080', '3001'];
    if (isLocalHost && separateDevPorts.indexOf(String(loc.port || '')) !== -1) {
      return loc.protocol + '//' + loc.hostname + ':3000/api';
    }

    return loc.origin.replace(/\/$/, '') + '/api';
  }

  var apiRoot = resolveApiRoot();
  var tokenKey = 'quickfixAccessToken';
  var roleKey = 'quickfixAuthRole';
  var userKey = 'quickfixAuthUser';

  function getId(entity) {
    if (!entity || typeof entity !== 'object') return '';
    if (entity.id !== undefined && entity.id !== null && entity.id !== '') return String(entity.id);
    if (entity._id !== undefined && entity._id !== null && entity._id !== '') return String(entity._id);
    return '';
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(userKey) || 'null');
    } catch (error) {
      return null;
    }
  }

  function setUser(user) {
    if (user && typeof user === 'object') {
      sessionStorage.setItem(userKey, JSON.stringify(user));
    }
  }

  function setAuth(role, authResponse) {
    clearAuth();
    sessionStorage.setItem(tokenKey, authResponse.token);
    sessionStorage.setItem(roleKey, role);
    sessionStorage.setItem(userKey, JSON.stringify(authResponse.data));
  }

  function clearAuth() {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(roleKey);
    sessionStorage.removeItem(userKey);
    sessionStorage.removeItem('quickfixCurrentUser');
    sessionStorage.removeItem('quickfixCustomerEmail');
    sessionStorage.removeItem('quickfixProviderSession');
  }

  function buildError(status, result, isAuthRequest) {
    var message = (result && result.message) || (status === 0
      ? 'Could not reach the ServiceHub API. Make sure the backend is running at ' + apiRoot + '.'
      : status === 503
        ? 'ServiceHub database is currently unavailable. Please try again shortly.'
        : 'The request could not be completed.');
    var apiError = new Error(message);
    apiError.status = status;
    if (isAuthRequest && status === 401) {
      clearAuth();
      apiError.expired = true;
      apiError.message = 'Your session has expired. Please log in again.';
    }
    return apiError;
  }

  async function request(path, options) {
    var settings = options || {};
    var headers = Object.assign({}, settings.headers || {});
    var isAuthRequest = settings.auth !== false;
    var requestOptions = {
      method: settings.method || 'GET',
      headers: headers
    };

    if (settings.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(settings.body);
    }

    if (isAuthRequest) {
      var token = sessionStorage.getItem(tokenKey);
      if (token) headers.Authorization = 'Bearer ' + token;
    }

    if (window.jQuery && window.jQuery.ajax) {
      return new Promise(function (resolve, reject) {
        window.jQuery.ajax({
          url: apiRoot + path,
          method: requestOptions.method,
          headers: headers,
          data: requestOptions.body,
          contentType: settings.body === undefined ? undefined : 'application/json',
          dataType: 'json'
        }).done(resolve).fail(function (xhr) {
          var result = xhr.responseJSON || {};
          reject(buildError(xhr.status, result, isAuthRequest));
        });
      });
    }

    var response;
    try { response = await fetch(apiRoot + path, requestOptions); }
    catch (error) { throw buildError(0, {}, isAuthRequest); }
    var result;
    try { result = await response.json(); }
    catch (error) { result = { success: false, message: 'The server returned an invalid response.' }; }
    if (!response.ok) {
      throw buildError(response.status, result, isAuthRequest);
    }
    return result;
  }

  function returnToLogin(loginPage, returnPath) {
    if (returnPath) sessionStorage.setItem('quickfixPostLogin', returnPath);
    window.location.replace(loginPage);
  }

  function handleAuthError(error, loginPage, returnPath) {
    if (error && (error.expired || error.status === 401)) {
      returnToLogin(loginPage, returnPath || (window.location.pathname.split('/').pop() + window.location.search));
      return true;
    }
    return false;
  }

  async function requireRole(role, loginPage, returnPath) {
    if (sessionStorage.getItem(roleKey) !== role || !sessionStorage.getItem(tokenKey)) {
      returnToLogin(loginPage, returnPath || (window.location.pathname.split('/').pop() + window.location.search));
      return null;
    }

    try {
      var route = role === 'admin'
        ? '/admin/me'
        : role === 'provider'
          ? '/providers/me'
          : '/customers/me';
      var result = await request(route);
      setUser(result.data);
      return result.data;
    } catch (error) {
      clearAuth();
      returnToLogin(loginPage, returnPath || (window.location.pathname.split('/').pop() + window.location.search));
      return null;
    }
  }

  function getRole() {
    return sessionStorage.getItem(roleKey) || '';
  }

  function isAuthenticated() {
    return Boolean(sessionStorage.getItem(tokenKey) && sessionStorage.getItem(roleKey));
  }

  window.ServiceHubApi = {
    request: request,
    setAuth: setAuth,
    setUser: setUser,
    clearAuth: clearAuth,
    requireRole: requireRole,
    handleAuthError: handleAuthError,
    getRole: getRole,
    getUser: getUser,
    isAuthenticated: isAuthenticated,
    getId: getId,
    apiRoot: apiRoot
  };
})(window, document);
