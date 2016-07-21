/**
 * XHR based logger
*/

import {logger} from '../utils/logger';

class XhrLoader {

  constructor(config) {
    if (config && config.xhrSetup) {
      this.xhrSetup = config.xhrSetup;
    }
  }

  destroy() {
    this.abort();
    this.loader = null;
  }

  abort() {
    var loader = this.loader;
    if (loader && loader.readyState !== 4) {
      this.stats.aborted = true;
      loader.abort();
    }

    window.clearTimeout(this.requestTimeout);
    this.requestTimeout = null;
    window.clearTimeout(this.retryTimeout);
    this.retryTimeout = null;
  }

  load(context, config, callbacks) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
    this.stats = {trequest: performance.now(), retry: 0};
    this.retryDelay = config.retryDelay;
    this.loadInternal();
  }

  loadInternal() {
    var xhr, context = this.context;

    if (typeof XDomainRequest !== 'undefined') {
       xhr = this.loader = new XDomainRequest();
    } else {
       xhr = this.loader = new XMLHttpRequest();
    }

    xhr.onloadend = this.loadend.bind(this);
    xhr.onprogress = this.loadprogress.bind(this);

    xhr.open('GET', context.url, true);

    if (context.rangeEnd) {
      xhr.setRequestHeader('Range','bytes=' + context.rangeStart + '-' + (context.rangeEnd-1));
    }
    xhr.responseType = context.responseType;
    let stats = this.stats;
    stats.tfirst = 0;
    stats.loaded = 0;
    if (this.xhrSetup) {
      this.xhrSetup(xhr, context.url);
    }
    // setup timeout before we perform request
    this.requestTimeout = window.setTimeout(this.loadtimeout.bind(this), this.config.timeout);
    xhr.send();
  }

  loadend(event) {
    var xhr = event.currentTarget,
        status = xhr.status,
        stats = this.stats,
        context = this.context,
        config = this.config;

    // don't proceed if xhr has been aborted
    if (stats.aborted) {
      return;
    }

    // in any case clear the current xhrs timeout
    window.clearTimeout(this.requestTimeout);

    // http status between 200 to 299 are all successful
    if (status >= 200 && status < 300)  {
      stats.tload = Math.max(stats.tfirst,performance.now());
      let response = { url : xhr.responseURL, data : context.responseType === 'arraybuffer' ? xhr.response : xhr.responseText };
      this.callbacks.onSuccess(response, stats, context);
    // everything else is a failure
    } else {
      // retry first
      if (stats.retry < config.maxRetry) {
        logger.warn(`${status} while loading ${context.url}, retrying in ${this.retryDelay}...`);
        // aborts and resets internal state
        this.destroy();
        // schedule retry
        this.retryTimeout = window.setTimeout(this.loadInternal.bind(this), this.retryDelay);
        // set exponential backoff
        this.retryDelay = Math.min(2 * this.retryDelay, 64000);
        stats.retry++;
      // permanent failure
      } else {
        logger.error(`${status} while loading ${context.url}` );
        this.callbacks.onError({ code : status, text : xhr.statusText}, context);
      }
    }
  }

  loadtimeout() {
    logger.warn(`timeout while loading ${this.context.url}` );
    this.callbacks.onTimeout(this.stats, this.context);
  }

  loadprogress(event) {
    var stats = this.stats;
    if (stats.tfirst === 0) {
      stats.tfirst = Math.max(performance.now(), stats.trequest);
    }
    stats.loaded = event.loaded;
    if (event.lengthComputable) {
      stats.total = event.total;
    }
    let onProgress = this.callbacks.onProgress;
    if (onProgress) {
      onProgress(stats, this.context);
    }
  }
}

export default XhrLoader;
