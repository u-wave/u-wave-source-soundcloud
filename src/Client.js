import { URL, URLSearchParams } from 'url';
import fetch from 'node-fetch';

/**
 * A small SoundCloud API client.
 */
export default class SoundCloudClient {
  constructor(params) {
    this.params = params;
    this.baseUrl = 'https://api.soundcloud.com';
  }

  async get(resource, options) {
    const url = new URL(resource, this.baseUrl);
    url.search = new URLSearchParams({ ...this.params, ...options });
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error.message);
    }
    return data;
  }

  search(options) {
    return this.get('/search', options);
  }

  resolveTrack(options) {
    return this.get('/resolve', options);
  }

  getTracks(options) {
    return this.get('/tracks', options);
  }
}
